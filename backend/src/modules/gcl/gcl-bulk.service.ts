import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Acceptance, DocumentType, Prisma } from '@prisma/client';
import archiver from 'archiver';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { UplService } from '../upl/upl.service';
import { PackagesService } from '../packages/packages.service';
import { DocumentsService } from '../documents/documents.service';
import { ExternalProjectsService } from '../external-projects/external-projects.service';
import { parseGcl } from './gcl.parser';
import { detectAcceptance, type AcceptanceResult } from './acceptance.detector';
import { extractSignature } from './signature.extractor';

/**
 * Multipart fields arrive as strings and the bulk path builds its DTO by hand,
 * so nothing runs class-transformer's @Type(() => Date) for it. Prisma then
 * rejects "2026-08-31" as a DateTime. Coerce here rather than pushing strings
 * into the package service, which reasonably expects a Date.
 */
function toDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value;

  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export interface BulkFilePreview {
  /** The project whose PAT sign-off carries this GCL. */
  siteId: string;
  projectTitle: string;
  fileName: string;
  ok: boolean;
  error?: string;

  /** The site number printed on the GCL itself. */
  siteNo?: string;
  woNumber?: string;
  lineCount?: number;
  total?: number;

  acceptance?: Acceptance | null;
  acceptanceConfidence?: AcceptanceResult['confidence'];
  acceptanceNote?: string;

  unpricedItems?: string[];
}

/**
 * Many signed GCLs in one upload.
 *
 * Each file stays its own package — separate site, separate quantities,
 * separate acceptance. What the batch adds is the combined paperwork: one BOQ
 * and one Work Order covering every site, then certificates split by what the
 * MSP ticked —
 *
 *   Accepted           nothing outstanding    → FAC
 *   Accepted with Oil  oil still to resolve   → PAC
 *   Rejected           no certificate at all
 *
 * A site accepted with oil and one accepted without are at different stages, so
 * they cannot share a certificate.
 */
@Injectable()
export class GclBulkService {
  private readonly logger = new Logger(GclBulkService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly upl: UplService,
    private readonly packages: PackagesService,
    private readonly documents: DocumentsService,
    private readonly externalProjects: ExternalProjectsService,
  ) {}

  /**
   * Reads the signed GCL attached to each selected project.
   *
   * Nothing is uploaded: the document already lives on the tracker against the
   * PAT sign-off, so the platform fetches it. That also means the project a GCL
   * belongs to is never in doubt — it came from that project.
   */
  async preview(siteIds: string[], uplVersion = 'v1') {
    if (!siteIds?.length) throw new BadRequestException('No projects were selected.');

    const scope = await this.projectScope(siteIds);
    const results: BulkFilePreview[] = [];

    for (const project of scope) {
      try {
        const { fileName, buffer } = await this.externalProjects.fetchGclFile(project.siteId);
        const parsed = await parseGcl(buffer);
        const prices = await this.upl.priceMap(
          parsed.lines.map((l) => l.itemCode),
          uplVersion,
        );

        const acceptance = await detectAcceptance(buffer, parsed.textPositions ?? []);

        const fieldKey = parsed.quantityColumns[1]?.key ?? parsed.quantityColumns[0]?.key ?? null;
        const total = parsed.lines.reduce((sum, l) => {
          const price = prices.get(l.itemCode.toUpperCase());
          const qty = fieldKey ? (l.quantities[fieldKey] ?? 0) : l.asBuiltQty;
          return sum + (price ? Number(price.price) * qty : 0);
        }, 0);

        results.push({
          siteId: project.siteId,
          projectTitle: project.title,
          fileName,
          ok: true,
          siteNo: parsed.siteNo ?? undefined,
          woNumber: parsed.woNumber ?? undefined,
          lineCount: parsed.lines.length,
          total,
          acceptance: acceptance.value,
          acceptanceConfidence: acceptance.confidence,
          acceptanceNote: acceptance.reason,
          unpricedItems: [
            ...new Set(
              parsed.lines
                .filter((l) => !prices.get(l.itemCode.toUpperCase()))
                .map((l) => l.itemCode),
            ),
          ],
        });
      } catch (e: any) {
        // One unreachable document must not cost the rest of the batch.
        this.logger.warn(`${project.siteId}: ${e.message}`);
        results.push({
          siteId: project.siteId,
          projectTitle: project.title,
          fileName: project.gclFileName ?? '',
          ok: false,
          error: e.message,
        });
      }
    }

    const ok = results.filter((r) => r.ok);
    return {
      files: results,
      readable: ok.length,
      failed: results.length - ok.length,
      needsReview: ok.filter((r) => r.acceptanceConfidence !== 'high').length,
      totalValue: ok.reduce((a, r) => a + (r.total ?? 0), 0),
    };
  }

  /** The projects a batch may draw on: those chosen, or every eligible one. */
  private async projectScope(siteIds: string[]) {
    const { available, items, message } = await this.externalProjects.list('upload');
    if (!available) {
      throw new BadRequestException(
        message ?? 'The projects service could not be reached, so nothing can be matched.',
      );
    }
    if (!siteIds.length) return items;

    const wanted = new Set(siteIds.map((s) => s.trim().toUpperCase()));
    return items.filter((p) => wanted.has(p.siteId.toUpperCase()));
  }

  /**
   * Commits the batch: one package per project, then the combined documents.
   *
   * `acceptanceByProject` is what the reviewer confirmed and it overrides the
   * detector — the tick is a mark on a scanned form, and it decides whether the
   * site ends up on the FAC or the PAC.
   */
  async commit(
    dto: {
      siteIds: string[];
      acceptanceByProject: Record<string, Acceptance>;
      quantityFieldKey?: string;
      uplVersion?: string;
      /** As posted: date strings, not Dates. */
      serviceDate?: string;
      startDate?: string;
      notes?: string;
      /** Printed on the PAC beside the contractor PM's name. */
      contractorPmId?: string;
      /**
       * What to do when a package for the same Work Order already exists.
       * 'skip' is the default: selecting fifty projects and having the whole
       * batch fail because two of them were already processed is not useful.
       */
      onDuplicate?: 'skip' | 'overwrite';
    },
    userId: string,
  ) {
    if (!dto.siteIds?.length) throw new BadRequestException('No projects were selected.');

    const scope = await this.projectScope(dto.siteIds);
    if (!scope.length) throw new BadRequestException('None of the selected projects are eligible.');

    const reference = `GCL-BATCH-${new Date().toISOString().slice(0, 10)}-${Date.now()
      .toString(36)
      .slice(-4)
      .toUpperCase()}`;

    const batch = await this.prisma.gclBatch.create({
      data: { reference, fileCount: scope.length, createdById: userId },
    });

    const created: string[] = [];
    const errors: { fileName: string; message: string }[] = [];
    const skipped: { siteId: string; reason: string }[] = [];
    const overwrite = dto.onDuplicate === 'overwrite';

    for (const project of scope) {
      try {
        const acceptance = dto.acceptanceByProject?.[project.siteId];
        if (!acceptance) throw new Error('No acceptance was confirmed for this project.');

        const { fileName, buffer } = await this.externalProjects.fetchGclFile(project.siteId);
        const parsed = await parseGcl(buffer);
        const stored = await this.storage.saveUpload(buffer, fileName);

        /*
         * The contractor already signed the GCL, so the same signature belongs
         * on the PAC and FAC that follow from it — asking someone to re-sign
         * what they have signed is busywork.
         */
        const signature = await extractSignature(buffer, parsed.textPositions ?? []);
        const signatureFile = signature
          ? await this.storage.saveUpload(signature, `${project.siteId}-signature.png`)
          : null;

        const pkg = await this.packages.createFromGcl(
          parsed,
          {
            externalSiteId: project.siteId,
            quantityFieldKey: dto.quantityFieldKey,
            uplVersion: dto.uplVersion || 'v1',
            serviceDate: toDate(dto.serviceDate),
            startDate: toDate(dto.startDate),
            notes: dto.notes || undefined,
            contractorPmId: dto.contractorPmId || undefined,
            overwrite,
          } as any,
          { fileName, filePath: stored.filePath },
        );

        await this.prisma.package.update({
          where: { id: pkg.id },
          data: {
            acceptance,
            gclBatchId: batch.id,
            ...(signatureFile
              ? {
                  signatureFileName: `${project.siteId}-signature.png`,
                  signaturePath: signatureFile.filePath,
                }
              : {}),
          },
        });

        created.push(pkg.id);
      } catch (e: any) {
        // An already-processed Work Order is a skip, not a failure — the rest of
        // the batch is unaffected and the person is told which were left out.
        if (/already exists/i.test(e.message)) {
          this.logger.log(`${project.siteId}: already processed, skipped`);
          skipped.push({
            siteId: project.siteId,
            reason: 'A package for this Work Order already exists.',
          });
        } else {
          this.logger.warn(`${project.siteId}: ${e.message}`);
          errors.push({ fileName: project.siteId, message: e.message });
        }
      }
    }

    if (!created.length && skipped.length && !errors.length) {
      await this.prisma.gclBatch.delete({ where: { id: batch.id } });
      throw new BadRequestException(
        `Every selected project has already been processed. ` +
          `Tick "Replace existing packages" to rebuild them.`,
      );
    }

    if (!created.length) {
      await this.prisma.gclBatch.delete({ where: { id: batch.id } });
      throw new BadRequestException(
        `None of the ${scope.length} project(s) could be committed. First error: ${
          errors[0]?.message ?? 'unknown'
        }`,
      );
    }

    const totals = await this.prisma.package.aggregate({
      where: { gclBatchId: batch.id },
      _sum: { netAmount: true },
    });

    await this.prisma.gclBatch.update({
      where: { id: batch.id },
      data: {
        siteCount: created.length,
        netAmount: totals._sum.netAmount ?? new Prisma.Decimal(0),
        errors: errors.length ? (errors as any) : undefined,
      },
    });

    const documents = await this.generateCombined(batch.id);

    return {
      batchId: batch.id,
      reference,
      committed: created.length,
      failed: errors.length,
      skipped,
      errors,
      ...documents,
    };
  }

  /**
   * One project, processed the same way — the signed GCL is fetched from the
   * tracker, read, and its acceptance detected. Shares the batch path so the
   * single and bulk flows can't drift apart.
   */
  async previewOne(siteId: string, uplVersion = 'v1') {
    const [file] = (await this.preview([siteId], uplVersion)).files;
    if (!file.ok) throw new BadRequestException(file.error ?? 'The GCL could not be read.');
    return file;
  }

  /** The combined set for a batch. */
  async generateCombined(batchId: string) {
    const batch = await this.prisma.gclBatch.findUnique({
      where: { id: batchId },
      include: { packages: { select: { id: true, siteNo: true, acceptance: true } } },
    });
    if (!batch) throw new NotFoundException('Batch not found');
    if (!batch.packages.length) throw new BadRequestException('This batch has no packages.');

    const all = batch.packages.map((p: any) => p.id);
    const withOil = batch.packages
      .filter((p: any) => p.acceptance === Acceptance.ACCEPTED_WITH_OIL)
      .map((p: any) => p.id);
    const clean = batch.packages
      .filter((p: any) => p.acceptance === Acceptance.ACCEPTED)
      .map((p: any) => p.id);
    const rejected = batch.packages.filter((p: any) => p.acceptance === Acceptance.REJECTED);

    const jobs: { type: DocumentType; ids: string[] }[] = [
      { type: DocumentType.BOQ_XLSX, ids: all },
      { type: DocumentType.BOQ_PDF, ids: all },
      { type: DocumentType.WO_XLSX, ids: all },
      { type: DocumentType.WO_PDF, ids: all },
    ];

    /*
     * Certificates follow the sign-off:
     *
     *   Accepted           the site cleared provisional acceptance and has
     *                      nothing outstanding, so it gets both the PAC and
     *                      the FAC — the FAC references the PAC, so issuing
     *                      one without the other leaves a dangling reference
     *   Accepted with Oil  provisional only; the FAC waits until the oil is
     *                      resolved
     *   Rejected           neither
     */
    const provisional = [...withOil, ...clean];
    if (provisional.length) {
      jobs.push({ type: DocumentType.PAC_PDF, ids: provisional });
      jobs.push({ type: DocumentType.PAC_XLSX, ids: provisional });
    }
    if (clean.length) {
      jobs.push({ type: DocumentType.FAC_PDF, ids: clean });
      jobs.push({ type: DocumentType.FAC_XLSX, ids: clean });
    }

    if (rejected.length) {
      this.logger.log(
        `${batch.reference}: ${rejected.length} rejected site(s) get no certificate — ` +
          rejected.map((p: any) => p.siteNo).join(', '),
      );
    }

    const produced = [];
    for (const job of jobs) {
      try {
        produced.push(await this.documents.generateCombined(batch.id, job.type, job.ids));
      } catch (e: any) {
        this.logger.warn(`${batch.reference}: ${job.type} failed — ${e.message}`);
      }
    }

    return {
      documents: produced,
      acceptedWithOil: withOil.length,
      accepted: clean.length,
      rejected: rejected.length,
      /** Everything that reached provisional acceptance. */
      onPac: provisional.length,
    };
  }

  async findOne(batchId: string) {
    const batch = await this.prisma.gclBatch.findUnique({
      where: { id: batchId },
      include: {
        packages: {
          select: {
            id: true, siteNo: true, woNumber: true, acceptance: true,
            netAmount: true, currency: true,
          },
          orderBy: { siteNo: 'asc' },
        },
        documents: { orderBy: { createdAt: 'asc' } },
        createdBy: { select: { id: true, name: true } },
      },
    });
    if (!batch) throw new NotFoundException('Batch not found');
    return batch;
  }

  list(limit = 25) {
    return this.prisma.gclBatch.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
      include: {
        createdBy: { select: { id: true, name: true } },
        _count: { select: { packages: true, documents: true } },
      },
    });
  }

  /** Everything the batch produced, in one archive. */
  async zip(batchId: string) {
    const batch = await this.findOne(batchId);
    if (!batch.documents.length) {
      throw new BadRequestException('This batch has no documents yet.');
    }

    const archive = archiver('zip', { zlib: { level: 9 } });
    const chunks: Buffer[] = [];
    archive.on('data', (c) => chunks.push(c));
    const done = new Promise<void>((resolve, reject) => {
      archive.on('end', () => resolve());
      archive.on('error', reject);
    });

    for (const doc of batch.documents as any[]) {
      if (await this.storage.exists(doc.path)) {
        archive.append(await this.storage.read(doc.path), { name: doc.fileName });
      }
    }

    await archive.finalize();
    await done;

    return { fileName: `${batch.reference}.zip`, buffer: Buffer.concat(chunks) };
  }
}
