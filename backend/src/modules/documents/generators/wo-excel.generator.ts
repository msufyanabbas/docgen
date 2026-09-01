import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import { PackageWithLines } from '../documents.types';

/**
 * Work Order workbook — the spreadsheet twin of wo.hbs, so finance can edit
 * the same document they receive as a PDF. Layout, fonts and totals match
 * 241-00-102R11_WO.pdf.
 */
const FONT = 'Tahoma';
const TABLE_ROWS = 14;
const HEADER_FILL = 'FFF2F2F2';
const TOTALS_KEY_FILL = 'FFE7E6E6';
const CLASSIFICATION = 'This Content is Restricted - External';
const CLASSIFICATION_COLOR = 'FFF59042';
const DATE_FMT = '[$-409]d\\-mmm\\-yy;@';
const MONEY_FMT = '#,##0.00;(#,##0.00);"-"';

const thin: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  bottom: { style: 'thin' },
  right: { style: 'thin' },
};

@Injectable()
export class WoExcelGenerator {
  /**
   * A single package is a batch of one, so both paths share this. The grid
   * takes one row per site — the form is the same whether it covers one site or
   * a hundred, which is what Tawal expects from a combined Work Order.
   */
  build(pkg: PackageWithLines): Promise<Buffer> {
    return this.buildMany([pkg]);
  }

  async buildMany(packages: PackageWithLines[]): Promise<Buffer> {
    if (!packages.length) throw new Error('A Work Order needs at least one package.');
    const pkg = packages[0]; // header fields describe the engagement, not the site
    const wb = new ExcelJS.Workbook();
    wb.creator = pkg.contractorName;
    wb.created = new Date();

    const ws = wb.addWorksheet('Work Order', {
      pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1 },
    });

    // Column widths chosen so the printed proportions match the PDF grid.
    ws.columns = [
      { width: 5 },   // A  S/N
      { width: 18 },  // B  Site ID
      { width: 47 },  // C  Work Order Number
      { width: 15 },  // D  Handover Date
      { width: 17 },  // E  Start Date
      { width: 17 },  // F  End Date
      { width: 16 },  // G  Amount
    ];

    /* --- classification banner --- */
    ws.mergeCells('A1:G1');
    const banner = ws.getCell('A1');
    banner.value = CLASSIFICATION;
    banner.font = { name: 'Aptos', size: 8, color: { argb: CLASSIFICATION_COLOR } };
    banner.alignment = { horizontal: 'center' };

    /* --- header block + logo --- */
    const headerRows: [string, string | number | null][] = [
      ['Contractor Name:', pkg.contractorName],
      ['PO VALUE:', pkg.poValue != null ? Number(pkg.poValue) : null],
      ['PO#:', pkg.poNumber ?? ''],
      ['Project Name:', pkg.projectName],
    ];

    headerRows.forEach(([label, value], i) => {
      const r = 3 + i;
      const k = ws.getCell(`A${r}`);
      k.value = label;
      k.font = { name: FONT, size: 8, bold: true };
      k.alignment = { horizontal: 'right' };

      ws.mergeCells(`B${r}:C${r}`);
      const v = ws.getCell(`B${r}`);
      v.value = value as any;
      v.font = { name: FONT, size: 8 };
      v.alignment = { horizontal: 'left' };
      if (label === 'PO VALUE:') v.numFmt = MONEY_FMT;
      ['A', 'B', 'C'].forEach((col) => {
        ws.getCell(`${col}${r}`).border = { bottom: { style: 'hair', color: { argb: 'FFD9D9D9' } } };
      });
    });

    this.addLogo(wb, ws);

    /* --- grid header --- */
    const HEAD = 8;
    const headers = [
      'S/N',
      'Site ID',
      'Work Order Number',
      'Handover Date',
      'Start Date',
      'End Date',
      'Amount',
    ];
    const headRow = ws.getRow(HEAD);
    headRow.height = 15;
    headers.forEach((h, i) => {
      const cell = headRow.getCell(i + 1);
      cell.value = h;
      cell.font = { name: FONT, size: 8, bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = thin;
    });

    /* --- grid body: one row per site, padded to 14 --- */
    // Grow the grid when a batch has more sites than the form's default rows.
    const gridRows = Math.max(TABLE_ROWS, packages.length);

    const first = HEAD + 1;
    for (let i = 0; i < gridRows; i++) {
      const row = ws.getRow(first + i);
      row.height = 13.5;
      for (let c = 1; c <= 7; c++) {
        const cell = row.getCell(c);
        cell.border = thin;
        cell.font = { name: FONT, size: 8 };
        cell.alignment = { horizontal: c === 7 ? 'right' : 'center', vertical: 'middle' };
      }
      row.getCell(1).value = i + 1;

      const site = packages[i];
      if (site) {
        row.getCell(2).value = site.siteNo;
        row.getCell(3).value = site.woNumber;
        row.getCell(3).font = { name: 'Calibri', size: 8 };
        row.getCell(4).value = site.handoverDate ?? null;
        row.getCell(5).value = site.startDate ?? null;
        row.getCell(6).value = site.endDate ?? null;
        [4, 5, 6].forEach((c) => (row.getCell(c).numFmt = DATE_FMT));
        row.getCell(7).value = Number(site.grossAmount);
        row.getCell(7).numFmt = MONEY_FMT;
        row.getCell(7).font = { name: 'Calibri', size: 8 };
      }
    }

    const last = first + gridRows - 1;

    /* --- totals: live formulas, so editing the grid updates the net --- */
    const totalRows = last + 3; // Gross
    const totals: [string, any][] = [
      ['Gross Amount:', { formula: `SUM(G${first}:G${last})` }],
      ['Discount:', packages.reduce((a, p) => a + Number(p.discount), 0)],
      ['FOC:', packages.reduce((a, p) => a + Number(p.foc), 0)],
      // Net = Gross - Discount - FOC, so editing the grid flows all the way down.
      ['Net:', { formula: `G${totalRows}-G${totalRows + 1}-G${totalRows + 2}` }],
    ];

    totals.forEach(([label, value], i) => {
      const r = totalRows + i;
      ws.mergeCells(`D${r}:F${r}`);
      const k = ws.getCell(`D${r}`);
      k.value = label;
      k.font = { name: FONT, size: 8, bold: true };
      k.alignment = { horizontal: 'right', vertical: 'middle' };
      k.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTALS_KEY_FILL } };
      ['D', 'E', 'F'].forEach((c) => (ws.getCell(`${c}${r}`).border = thin));

      const v = ws.getCell(`G${r}`);
      v.value = value;
      v.numFmt = MONEY_FMT;
      v.font = { name: FONT, size: 8, bold: true };
      v.alignment = { horizontal: 'right', vertical: 'middle' };
      v.border = thin;
    });

    /* --- Tawal PM signature block --- */
    const sigTitle = last + 8;
    ws.mergeCells(`D${sigTitle}:G${sigTitle}`);
    const st = ws.getCell(`D${sigTitle}`);
    st.value = 'Tawal Project Manger';
    st.font = { name: FONT, size: 8, bold: true };
    st.alignment = { horizontal: 'center', vertical: 'middle' };
    st.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    ['D', 'E', 'F', 'G'].forEach((c) => (ws.getCell(`${c}${sigTitle}`).border = thin));

    const nameRow = sigTitle + 1;
    ws.getCell(`D${nameRow}`).value = 'Name';
    ws.mergeCells(`E${nameRow}:G${nameRow}`);
    ws.getCell(`E${nameRow}`).value = pkg.tawalPmName ?? '';

    const signRow = nameRow + 1;
    ws.getRow(signRow).height = 40;
    ws.getCell(`D${signRow}`).value = 'signature';
    ws.mergeCells(`E${signRow}:G${signRow}`);

    [nameRow, signRow].forEach((r) => {
      ['D', 'E', 'F', 'G'].forEach((c) => {
        const cell = ws.getCell(`${c}${r}`);
        cell.border = thin;
        cell.font = { name: FONT, size: 8, bold: true };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });
    });

    const footer = signRow + 2;
    ws.mergeCells(`A${footer}:G${footer}`);
    const f = ws.getCell(`A${footer}`);
    f.value = CLASSIFICATION;
    f.font = { name: 'Aptos', size: 8, bold: true, color: { argb: CLASSIFICATION_COLOR } };
    f.alignment = { horizontal: 'center' };

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  private addLogo(wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet) {
    const candidates = [
      path.join(__dirname, '..', '..', '..', '..', 'assets', 'tawal-logo.png'),
      path.join(process.cwd(), 'assets', 'tawal-logo.png'),
      path.join(process.cwd(), 'dist', 'assets', 'tawal-logo.png'),
    ];
    const file = candidates.find((c) => fs.existsSync(c));
    if (!file) return;

    const imageId = wb.addImage({ buffer: fs.readFileSync(file) as any, extension: 'png' });
    ws.addImage(imageId, {
      tl: { col: 5.1, row: 1.2 } as any,
      ext: { width: 150, height: 42 },
    });
  }
}
