import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DocumentType, PackageOrigin, PackageStatus } from '@prisma/client';
import archiver from 'archiver';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { PdfRenderer } from './generators/pdf.renderer';
import { BoqExcelGenerator } from './generators/boq-excel.generator';
import { WoExcelGenerator } from './generators/wo-excel.generator';
import { fileDataUri, logos, stamp } from './generators/assets';
import { PackageWithLines } from './documents.types';

/** Appends ".SN: xxx" unless the description already mentions the serial. */
function withSerial(description: string, serial?: string | null): string {
  const text = (description ?? '').trim();
  const sn = (serial ?? '').trim();
  if (!sn) return text;
  if (new RegExp(`S\\s*\\.?\\s*N\\s*[:.\\-]?\\s*${sn}`, 'i').test(text)) return text;
  return text ? `${text} .SN: ${sn}` : `SN: ${sn}`;
}

const WO_TABLE_ROWS = 14; // Tawal's Work Order grid is a fixed 14-row form
const PAC_TABLE_ROWS = 14;

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly pdf: PdfRenderer,
    private readonly boqExcel: BoqExcelGenerator,
    private readonly woExcel: WoExcelGenerator,
  ) {}

  private async load(packageId: string): Promise<PackageWithLines> {
    const pkg = await this.prisma.package.findUnique({
      where: { id: packageId },
      include: { lines: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!pkg) throw new NotFoundException('Package not found');
    if (!pkg.lines.length) throw new BadRequestException('This package has no BOQ lines.');
    return pkg;
  }

  /* --------------------------------------------------------- view models */

  /** The GCL is the source form: design + as-built quantities, no money on it. */
  private gclView(pkg: PackageWithLines) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const d = pkg.gclDate ? new Date(pkg.gclDate) : null;

    return {
      ...logos(),
      stamp: stamp(),
      signature: fileDataUri(pkg.signaturePath),
      tawalSiteId: pkg.tawalSiteId ?? '',
      woNumber: pkg.woNumber,
      siteNo: pkg.siteNo,
      projectName: pkg.projectName,
      region: pkg.region ?? '',
      district: pkg.district ?? '',
      poNumber: pkg.poNumber ?? '',
      // Tawal prints "16 Agu 2026" on the form; keep the same day-month-year shape.
      gclDateLabel: d ? `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}` : '',
      contractorPmName: pkg.contractorPmName ?? '',
      mspRepName: pkg.mspRepName ?? '',
      mspSignDate: pkg.mspSignDate,
      notes: pkg.notes ?? '',
      rows: pkg.lines.map((l) => ({
        no: l.no,
        itemCode: l.itemCode,
        // Tawal's GCL prints the serial at the end of the description
        // ("… 19'' Rack SN:Y6640250028"), so append it unless the description
        // already carries one — parsed GCLs bring it along in the text.
        description: withSerial(l.description, l.serialNumber),
        unit: l.unit ?? '',
        designQty: Number(l.designQty),
        asBuiltQty: Number(l.asBuiltQty),
        itemType: l.itemType ?? '',
      })),
    };
  }

  private boqView(pkg: PackageWithLines) {
    return {
      ...logos(),
      woNumber: pkg.woNumber,
      siteNo: pkg.siteNo,
      region: pkg.region ?? '',
      district: pkg.district ?? '',
      poNumber: pkg.poNumber ?? '',
      projectName: pkg.projectName,
      contractorName: pkg.contractorName,
      contractorPmName: pkg.contractorPmName ?? '',
      mspRepName: pkg.mspRepName ?? '',
      notes: pkg.notes ?? '',
      rows: pkg.lines.map((l) => ({
        woNumber: pkg.woNumber,
        itemCode: l.itemCode,
        quantity: Number(l.quantity),
        tagNumber: l.tagNumber || 'N/A',
        serviceDate: l.serviceDate ?? pkg.serviceDate ?? pkg.endDate,
      })),
    };
  }

  /**
   * The Work Order form lists one row per SITE, not per BOQ item — the amount
   * column carries the whole site's gross. Multi-site POs simply add rows.
   */
  private woView(pkg: PackageWithLines) {
    return {
      ...logos(),
      contractorName: pkg.contractorName,
      projectName: pkg.projectName,
      poNumber: pkg.poNumber ?? '',
      poValue: pkg.poValue != null ? Number(pkg.poValue) : null,
      grossAmount: Number(pkg.grossAmount),
      discount: Number(pkg.discount),
      foc: Number(pkg.foc),
      netAmount: Number(pkg.netAmount),
      tawalPmName: pkg.tawalPmName ?? '',
      tableRows: WO_TABLE_ROWS,
      rows: [
        {
          sn: 1,
          siteId: pkg.siteNo,
          woNumber: pkg.woNumber,
          handoverDate: pkg.handoverDate,
          startDate: pkg.startDate,
          endDate: pkg.endDate,
          amount: Number(pkg.grossAmount),
        },
      ],
    };
  }

  private pacView(pkg: PackageWithLines) {
    return {
      ...logos(),
      projectName: pkg.projectName,
      contractorName: pkg.contractorName,
      poNumber: pkg.poNumber ?? '',
      contractorPmName: (pkg.contractorPmName ?? '').toUpperCase(),
      contractorPmId: pkg.contractorPmId ?? '',
      tawalPmName: pkg.tawalPmName ?? '',
      tawalPmId: pkg.tawalPmId ?? '',
      pacDate: pkg.endDate ?? pkg.gclDate,
      tableRows: PAC_TABLE_ROWS,
      rows: [
        {
          siteId: pkg.siteNo,
          region: pkg.region ?? '',
          district: pkg.district ?? '',
          woNumber: pkg.woNumber,
        },
      ],
    };
  }

  /* ----------------------------------------------------------- generation */

  private fileName(pkg: PackageWithLines, type: DocumentType) {
    const base = pkg.siteNo || pkg.woNumber;
    const map: Record<DocumentType, string> = {
      GCL_PDF: `${base}_GCL.pdf`,
      BOQ_XLSX: `${base}_As-Built_BOQ.xlsx`,
      BOQ_PDF: `${base}_As-Built_BOQ.pdf`,
      WO_XLSX: `${base}_WO.xlsx`,
      WO_PDF: `${base}_WO.pdf`,
      PAC_PDF: `${base}_PAC.pdf`,
      BUNDLE_ZIP: `${base}_Package.zip`,
    };
    return map[type];
  }

  private async buildOne(pkg: PackageWithLines, type: DocumentType): Promise<Buffer> {
    switch (type) {
      case DocumentType.GCL_PDF:
        return this.pdf.render('gcl', this.gclView(pkg));
      case DocumentType.BOQ_XLSX:
        return this.boqExcel.build(pkg);
      case DocumentType.BOQ_PDF:
        return this.pdf.render('boq', this.boqView(pkg));
      case DocumentType.WO_XLSX:
        return this.woExcel.build(pkg);
      case DocumentType.WO_PDF:
        return this.pdf.render('wo', this.woView(pkg));
      case DocumentType.PAC_PDF:
        return this.pdf.render('pac', this.pacView(pkg));
      default:
        throw new BadRequestException(`${type} cannot be generated directly.`);
    }
  }

  private async persist(pkg: PackageWithLines, type: DocumentType, data: Buffer) {
    const fileName = this.fileName(pkg, type);
    const { filePath, sizeBytes } = await this.storage.saveDocument(pkg.id, fileName, data);

    // One current file per type per package.
    await this.prisma.generatedDocument.deleteMany({ where: { packageId: pkg.id, type } });
    return this.prisma.generatedDocument.create({
      data: { packageId: pkg.id, type, fileName, path: filePath, sizeBytes },
    });
  }

  async generate(packageId: string, types?: DocumentType[]) {
    const pkg = await this.load(packageId);

    const unpriced = pkg.lines.filter((l) => !l.priceFound).map((l) => l.itemCode);
    const wanted = types?.length
      ? types
      : [
          // A package built from a scope sheet has no GCL yet, so make one first.
          ...(pkg.origin === PackageOrigin.SCOPE_SHEET ? [DocumentType.GCL_PDF] : []),
          DocumentType.BOQ_XLSX,
          DocumentType.BOQ_PDF,
          DocumentType.WO_XLSX,
          DocumentType.WO_PDF,
          DocumentType.PAC_PDF,
        ];

    const documents = [];
    for (const type of wanted) {
      const buffer = await this.buildOne(pkg, type);
      documents.push(await this.persist(pkg, type, buffer));
      this.logger.log(`${pkg.woNumber}: generated ${type}`);
    }

    await this.prisma.package.update({
      where: { id: pkg.id },
      data: { status: PackageStatus.GENERATED },
    });

    return {
      packageId: pkg.id,
      documents,
      warnings: unpriced.length
        ? [`Priced at 0.00 (missing from UPL): ${unpriced.join(', ')}`]
        : [],
    };
  }

  /** Regenerates on demand and streams the bytes without touching disk state. */
  async buildInline(packageId: string, type: DocumentType) {
    const pkg = await this.load(packageId);
    return { fileName: this.fileName(pkg, type), buffer: await this.buildOne(pkg, type) };
  }

  async listDocuments(packageId: string) {
    return this.prisma.generatedDocument.findMany({
      where: { packageId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getFile(documentId: string) {
    const doc = await this.prisma.generatedDocument.findUnique({ where: { id: documentId } });
    if (!doc) throw new NotFoundException('Document not found');
    if (!(await this.storage.exists(doc.path))) {
      throw new NotFoundException('File is missing from storage — regenerate the package.');
    }
    return doc;
  }

  /** Zips every current document for the package. */
  async bundle(packageId: string): Promise<{ fileName: string; buffer: Buffer }> {
    const pkg = await this.load(packageId);
    let docs = await this.listDocuments(packageId);

    if (!docs.length) {
      await this.generate(packageId);
      docs = await this.listDocuments(packageId);
    }

    const archive = archiver('zip', { zlib: { level: 9 } });
    const chunks: Buffer[] = [];
    archive.on('data', (c) => chunks.push(c));

    const done = new Promise<void>((resolve, reject) => {
      archive.on('end', () => resolve());
      archive.on('error', reject);
    });

    for (const doc of docs) {
      if (doc.type === DocumentType.BUNDLE_ZIP) continue;
      if (await this.storage.exists(doc.path)) {
        archive.append(await this.storage.read(doc.path), { name: doc.fileName });
      }
    }

    if (pkg.sourceFilePath && (await this.storage.exists(pkg.sourceFilePath))) {
      archive.append(await this.storage.read(pkg.sourceFilePath), {
        name: `source/${pkg.sourceFileName ?? 'GCL.pdf'}`,
      });
    }

    await archive.finalize();
    await done;

    return { fileName: this.fileName(pkg, DocumentType.BUNDLE_ZIP), buffer: Buffer.concat(chunks) };
  }
}
