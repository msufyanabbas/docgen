import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';

const FONT = 'Calibri';
const HEAD_FILL = 'FFD9D9D9';

const thin: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  bottom: { style: 'thin' },
  right: { style: 'thin' },
};

export interface CertRow {
  siteNo: string;
  region: string;
  district: string;
  woNumber: string;
}

export interface CertView {
  projectName: string;
  subProjectName?: string;
  contractorName: string;
  poNumber: string;
  contractorPmName: string;
  contractorPmId: string;
  /** Date the contractor signed the GCL, as dd/mm/yyyy. */
  signedDate: string;
  rows: CertRow[];
  signature?: Buffer | null;
}

/** The English and Arabic body text, which differs between the two stages. */
const BLURB = {
  PAC: {
    title: 'Preliminary Acceptance Certificate',
    titleAr: 'شهادة استلام ابتدائيه',
    en:
      'Save the defects, malfunctions and bugs stated herein above / PAT, TAWAL subject to clause 7 ' +
      'of the Agreement concluded between the undersigned confirms the preliminary acceptance of the ' +
      'site(s) listed below, and that the works have been handed over to the project management at TAWAL.',
    ar:
      'بالاشارة الى العيوب والأعطال والأخطاء المذكورة أعلاه او في PAT الاستلام المبدئي ، واستنادا للبند 7 ' +
      'من الاتفاقية المبرمة بين الموقعين ادناه ، تؤكد شركة توال الاستلام الابتدائي للمواقع المذكورة ادناه ' +
      'و أنه قد تم تسليم الأعمال الى إدارة المشروع في شركة توال.',
  },
  FAC: {
    title: 'Final Acceptance Certificate',
    titleAr: 'شهادة استلام نهائية',
    en:
      "According to the Agreement concluded between the undersigned and upon the supplier's delivery " +
      'of all works with the repair of all defects, malfunctions and errors contained in the Preliminary ' +
      'Acceptance Certificate (PAC) for the site(s), TAWAL confirms that the site(s) has been received ' +
      'without any outstanding items list (OIL). Accordingly, these works were handed over to the project ' +
      'management at TAWAL and became under its responsibility. It is understood that this certificate ' +
      'does not exempt the supplier from completing the work according to the technical and contractual ' +
      'specifications in force at TAWAL.',
    ar:
      'حسب الاتفاقية المبرمه بين الموقعين ادناه و بناء على تسليم المقاول جميع الأعمال مع اصلاح العيوب و ' +
      'الأعطال و الأخطاء الوارده في شهادة الاستلام الابتدائي ؛ تؤكد شركة توال أنه تم استلام الموقع / المواقع ' +
      'من دون أي مخرجات معلقه ؛ و عليه جرى تسليم هذه الأعمال الى إدارة المشروع في شركة توال و أصبح تحت ' +
      'مسئوليتها . ومن المفهوم إن هذه الشهادة لا تعفى المقاول من إتمام العمل بحسب المواصفات الفنية ' +
      'والتعاقدية المعمول بها في شركة توال.',
  },
};

/**
 * PAC and FAC as workbooks.
 *
 * The two certificates share a layout — header block, one row per site, then
 * the two signature columns — and differ only in title and body text, so they
 * share a builder. Geometry follows the supplied references
 * (241-00-102R11_PAC.xlsx and FAC.xlsx).
 */
@Injectable()
export class CertExcelGenerator {
  async build(kind: 'PAC' | 'FAC', view: CertView): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Smart Life DocGen';
    const ws = wb.addWorksheet(kind, {
      pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1 },
    });

    ws.columns = [
      { width: 27 }, // A  Site ID / labels
      { width: 18 }, // B  Region / values
      { width: 18 }, // C  District
      { width: 24 }, // D  WO Number
      { width: 10 }, // E
      { width: 24 }, // F  Tawal column
      { width: 10 }, // G
      { width: 34 }, // H  Arabic labels
    ];

    const text = BLURB[kind];
    let r = 1;

    // --- title, bilingual ---
    ws.mergeCells(`A${r}:D${r}`);
    ws.mergeCells(`E${r}:H${r}`);
    const titleEn = ws.getCell(`A${r}`);
    titleEn.value = text.title;
    const titleAr = ws.getCell(`E${r}`);
    titleAr.value = text.titleAr;
    for (const c of [titleEn, titleAr]) {
      c.font = { name: FONT, size: 12, bold: true };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD_FILL } };
      c.border = thin;
    }
    ws.getRow(r).height = 26;
    r++;

    // --- the undertaking ---
    ws.mergeCells(`A${r}:D${r}`);
    ws.mergeCells(`E${r}:H${r}`);
    const bodyEn = ws.getCell(`A${r}`);
    bodyEn.value = text.en;
    const bodyAr = ws.getCell(`E${r}`);
    bodyAr.value = text.ar;
    for (const c of [bodyEn, bodyAr]) {
      c.font = { name: FONT, size: 8 };
      c.alignment = { wrapText: true, vertical: 'top' };
      c.border = thin;
    }
    bodyAr.alignment = { wrapText: true, vertical: 'top', horizontal: 'right', readingOrder: 'rtl' };
    ws.getRow(r).height = 92;
    r++;

    // --- project header ---
    const meta: [string, string, string][] = [
      ['Project Name :', view.projectName, 'اسم المشروع :'],
      ['Sub-Project Name :', view.subProjectName ?? '', 'اسم المشروع الفرعي:'],
      ['Contractor Name :', view.contractorName, 'اسم المقاول :'],
      ['P.O No. :', view.poNumber, 'رقم أمر الشراء:'],
    ];
    for (const [label, value, ar] of meta) {
      ws.mergeCells(`B${r}:E${r}`);
      ws.mergeCells(`G${r}:H${r}`);
      const k = ws.getCell(`A${r}`);
      k.value = label;
      k.font = { name: FONT, size: 9, bold: true };
      const v = ws.getCell(`B${r}`);
      v.value = value;
      v.font = { name: FONT, size: 9, bold: true };
      v.alignment = { horizontal: 'center' };
      const a = ws.getCell(`G${r}`);
      a.value = ar;
      a.font = { name: FONT, size: 9, bold: true };
      a.alignment = { horizontal: 'right', readingOrder: 'rtl' };
      [k, v, ws.getCell(`F${r}`), a].forEach((c) => (c.border = thin));
      ws.getRow(r).height = 16;
      r++;
    }

    // --- one row per site ---
    const headers = ['Site ID', 'Region', 'District', 'WO Number'];
    headers.forEach((h, i) => {
      const c = ws.getCell(r, i + 1);
      c.value = h;
      c.font = { name: FONT, size: 9, bold: true };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD_FILL } };
      c.border = thin;
    });
    ws.mergeCells(`D${r}:H${r}`);
    ws.getRow(r).height = 17;
    r++;

    // Padded to a fixed grid so a 1-site and a 13-site certificate match.
    const GRID = Math.max(13, view.rows.length);
    for (let i = 0; i < GRID; i++) {
      const row = view.rows[i];
      ws.mergeCells(`D${r}:H${r}`);
      [1, 2, 3, 4].forEach((col) => {
        const c = ws.getCell(r, col);
        c.value = row
          ? [row.siteNo, row.region, row.district, row.woNumber][col - 1] || ''
          : '';
        c.font = { name: FONT, size: 9, bold: col === 4 };
        c.alignment = { horizontal: 'center', vertical: 'middle' };
        c.border = thin;
      });
      ws.getRow(r).height = 15;
      r++;
    }

    r++; // a blank line before the signatures

    // --- signature blocks ---
    ws.mergeCells(`A${r}:E${r}`);
    ws.mergeCells(`F${r}:H${r}`);
    const cph = ws.getCell(`A${r}`);
    cph.value = 'Contractor Project Manager';
    const tph = ws.getCell(`F${r}`);
    tph.value = 'TAWAL Project Manager';
    for (const c of [cph, tph]) {
      c.font = { name: FONT, size: 9, bold: true };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD_FILL } };
      c.border = thin;
    }
    ws.getRow(r).height = 17;
    r++;

    // Name, ID, Sign, Date — the same four rows on both sides.
    const signRows: [string, string][] = [
      [`Name : ${view.contractorPmName}`, 'Name :'],
      [`ID: ${view.contractorPmId}`, 'ID:'],
      ['Sign :', 'Sign :'],
      [`Date : ${view.signedDate}`, 'Date :'],
    ];

    const signRowIndex = r + 2; // the row the image is anchored into
    for (const [left, right] of signRows) {
      ws.mergeCells(`A${r}:E${r}`);
      ws.mergeCells(`F${r}:H${r}`);
      const l = ws.getCell(`A${r}`);
      l.value = left;
      const rt = ws.getCell(`F${r}`);
      rt.value = right;
      for (const c of [l, rt]) {
        c.font = { name: FONT, size: 9 };
        c.alignment = { vertical: 'middle' };
        c.border = thin;
      }
      ws.getRow(r).height = left.startsWith('Sign') ? 34 : 16;
      r++;
    }

    // The contractor already signed the GCL, so that signature is carried here.
    if (view.signature) {
      const imageId = wb.addImage({ buffer: view.signature as any, extension: 'png' });
      ws.addImage(imageId, {
        tl: { col: 0.45, row: signRowIndex - 0.85 } as any,
        ext: { width: 108, height: 30 },
      });
    }

    return Buffer.from(await wb.xlsx.writeBuffer());
  }
}
