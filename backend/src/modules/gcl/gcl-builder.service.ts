import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PackageOrigin, PackageStatus, Prisma, QuantitySource } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { UplService } from '../upl/upl.service';
import { parseScopeWorkbook, ScopeSite } from './scope.parser';
import { CreateGclDto, ScopeSiteInputDto } from './gcl.dto';

const D = (n: number | string) => new Prisma.Decimal(n as any);
const round2 = (d: Prisma.Decimal) => d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

@Injectable()
export class GclBuilderService {
  private readonly logger = new Logger(GclBuilderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly upl: UplService,
    private readonly config: ConfigService,
  ) {}

  /* --------------------------------------------------------------- preview */

  /** Dry run over a scope workbook: what sites, what items, what they'd cost. */
  async previewScope(buffer: Buffer, uplVersion = 'v1') {
    let parsed;
    try {
      parsed = await parseScopeWorkbook(buffer);
    } catch (e: any) {
      throw new BadRequestException(`Scope sheet could not be read: ${e.message}`);
    }

    const allCodes = parsed.sites.flatMap((s) => s.lines.map((l) => l.itemCode));
    const prices = await this.upl.priceMap(allCodes, uplVersion);

    const sites = parsed.sites.map((site) => {
      const lines = site.lines.map((l, i) => {
        const upl = prices.get(l.itemCode);
        const unitPrice = upl ? Number(upl.price) : 0;
        return {
          no: i + 1,
          ...l,
          unitPrice,
          priceFound: !!upl,
          lineTotal: unitPrice * l.qty,
        };
      });
      return {
        ...site,
        lines,
        total: lines.reduce((a, l) => a + l.lineTotal, 0),
        unpricedItems: lines.filter((l) => !l.priceFound).map((l) => l.itemCode),
      };
    });

    return { sites, warnings: parsed.warnings };
  }

  /* ---------------------------------------------------------------- create */

  /**
   * Creates one package per site, marked SCOPE_SHEET, from which a GCL PDF can be
   * generated and then the BOQ / WO / PAC exactly as with an uploaded GCL.
   *
   * Design QTY comes from the sheet's "updated Qty". As-Built starts equal to it —
   * the crew adjusts it on the review screen once the work is actually done, which
   * is what makes the As-Built BOQ differ from the design scope.
   */
  async createFromScope(
    buffer: Buffer,
    dto: CreateGclDto,
    signature?: { fileName: string; filePath: string },
  ) {
    const parsed = await parseScopeWorkbook(buffer).catch((e) => {
      throw new BadRequestException(`Scope sheet could not be read: ${e.message}`);
    });

    const selected = dto.siteCodes?.length
      ? parsed.sites.filter((s) => dto.siteCodes!.includes(s.siteCode ?? s.tawalSiteId ?? ''))
      : parsed.sites;

    if (!selected.length) {
      throw new BadRequestException('None of the requested site codes are present in the sheet.');
    }

    const overrides = new Map(
      (dto.sites ?? []).map((s) => [s.siteCode, s] as [string, ScopeSiteInputDto]),
    );

    const created = [];
    for (const site of selected) {
      created.push(await this.createOne(site, dto, overrides, signature));
    }

    return { packages: created, warnings: parsed.warnings };
  }

  private async createOne(
    site: ScopeSite,
    dto: CreateGclDto,
    overrides: Map<string, ScopeSiteInputDto>,
    signature?: { fileName: string; filePath: string },
  ) {
    const defaults = this.config.get('defaults');
    const key = site.siteCode ?? site.tawalSiteId ?? '';
    const o = overrides.get(key);

    const siteNo = o?.siteNo ?? site.siteCode ?? site.tawalSiteId ?? 'UNKNOWN';
    const woNumber = o?.woNumber ?? this.buildWoNumber(siteNo, site.poNumber, dto.woSequence);

    const existing = await this.prisma.package.findUnique({ where: { woNumber } });
    if (existing) {
      if (!dto.overwrite) {
        throw new BadRequestException(
          `A package for ${woNumber} already exists. Re-submit with overwrite=true to replace it.`,
        );
      }
      await this.prisma.package.delete({ where: { id: existing.id } });
    }

    const uplVersion = dto.uplVersion ?? 'v1';
    const prices = await this.upl.priceMap(site.lines.map((l) => l.itemCode), uplVersion);
    const quantitySource = dto.quantitySource ?? QuantitySource.AS_BUILT;

    let gross = D(0);
    const lines = site.lines.map((l, i) => {
      const upl = prices.get(l.itemCode);
      const unitPrice = upl ? new Prisma.Decimal(upl.price) : D(0);
      const designQty = D(l.qty);
      const asBuiltQty = D(l.qty); // adjusted after the handover visit
      const quantity = quantitySource === QuantitySource.DESIGN ? designQty : asBuiltQty;
      const lineTotal = round2(unitPrice.mul(quantity));
      gross = gross.plus(lineTotal);

      return {
        no: i + 1,
        itemCode: l.itemCode,
        description: upl?.description?.trim() || l.description,
        unit: l.unit ?? upl?.uom ?? null,
        itemType: l.itemType,
        workType: l.workType,
        designQty,
        asBuiltQty,
        quantity,
        serialNumber: null,
        tagNumber: 'N/A',
        serviceDate: dto.gclDate ?? null,
        unitPrice,
        lineTotal,
        priceFound: !!upl,
        sortOrder: i,
      };
    });

    const discount = D(dto.discount ?? 0);
    const foc = D(dto.foc ?? 0);

    const pkg = await this.prisma.package.create({
      data: {
        origin: PackageOrigin.SCOPE_SHEET,
        status: PackageStatus.DRAFT,
        quantitySource,
        uplVersion,

        woNumber,
        siteNo,
        tawalSiteId: site.tawalSiteId,
        siteName: site.siteName,
        budget: site.budget,
        subProjectName: site.subProjectName,
        region: o?.region ?? dto.region ?? null,
        district: o?.district ?? dto.district ?? null,
        projectName: (site.budget || defaults.projectName).toUpperCase(),
        contractorName: dto.contractorName ?? site.contractor ?? defaults.contractorName,
        poNumber: site.poNumber,
        poValue: dto.poValue != null ? D(dto.poValue) : null,
        currency: defaults.currency,

        gclDate: dto.gclDate ?? new Date(),
        serviceDate: dto.gclDate ?? new Date(),
        handoverDate: dto.handoverDate ?? null,
        startDate: dto.startDate ?? null,
        endDate: dto.endDate ?? dto.gclDate ?? null,

        contractorPmName: dto.contractorPmName ?? null,
        contractorPmId: dto.contractorPmId ?? null,
        mspRepName: dto.mspRepName ?? null,
        mspSignDate: dto.mspSignDate ?? null,
        tawalPmName: dto.tawalPmName ?? null,
        tawalPmId: dto.tawalPmId ?? null,

        signatureFileName: signature?.fileName ?? null,
        signaturePath: signature?.filePath ?? null,

        grossAmount: round2(gross),
        discount: round2(discount),
        foc: round2(foc),
        netAmount: round2(gross.minus(discount).minus(foc)),

        notes: dto.notes ?? null,
        lines: { create: lines },
      },
      include: { lines: { orderBy: { sortOrder: 'asc' } } },
    });

    this.logger.log(`GCL package ${woNumber} created from scope sheet — ${lines.length} lines`);
    return pkg;
  }

  /**
   * Mirrors Tawal's own format:
   *   WO-SLife-IMP-241-00-102R11-10990-SmartTower-18731
   *   WO-<contractor>-IMP-<site>-<po tail>-SmartTower-<sequence>
   * A caller who already has the real WO number should pass it in instead.
   */
  private buildWoNumber(siteNo: string, poNumber: string | null, sequence?: string) {
    const poTail = poNumber ? poNumber.slice(-5) : '00000';
    const seq = sequence ?? String(Date.now()).slice(-5);
    return `WO-SLife-IMP-${siteNo}-${poTail}-SmartTower-${seq}`;
  }

  /* ------------------------------------------------------------- signature */

  /** Attaches or replaces the contractor signature on an existing package. */
  async setSignature(packageId: string, file: Express.Multer.File) {
    if (!/\.(png|jpe?g)$/i.test(file.originalname)) {
      throw new BadRequestException('The signature must be a PNG or JPEG image.');
    }

    const pkg = await this.prisma.package.findUnique({ where: { id: packageId } });
    if (!pkg) throw new BadRequestException('Package not found');

    const saved = await this.storage.saveUpload(file.buffer, `sig-${file.originalname}`);

    return this.prisma.package.update({
      where: { id: packageId },
      data: { signatureFileName: file.originalname, signaturePath: saved.filePath },
      select: { id: true, signatureFileName: true },
    });
  }
}
