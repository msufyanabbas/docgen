import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { PackageWithLines } from '../documents.types';

/**
 * As-Built BOQ workbook.
 *
 * Styling is copied from the reference file 241-00-102R11_As-Built_BOQ.xlsx:
 *   sheet "BOQ" · Aptos Narrow · header 8pt bold white on #0E2841 (Office dk2)
 *   · thin borders everywhere · autofilter over the whole range
 *   · column widths A 50 / B 16 / C 14.5 / D 13 / E 18 / F 8.83
 *   · Quantity "0.00" · Service Date "[$-409]d\-mmm\-yy;@" · Item Code stored as text
 */
const FONT = 'Aptos Narrow';
const HEADER_FILL = 'FF0E2841';
const HEADER_FONT = 'FFFFFFFF';
const BODY_FONT = 'FF0D0D0D';

/** The reference screenshot shows item codes in a rust/orange accent.
 *  Set to 'FF0D0D0D' if you prefer them plain black like the raw file. */
const ITEM_CODE_FONT = 'FFC55A11';

const DATE_FMT = '[$-409]d\\-mmm\\-yy;@';

const thin: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  bottom: { style: 'thin' },
  right: { style: 'thin' },
};

@Injectable()
export class BoqExcelGenerator {
  /** A single package is a batch of one. */
  build(pkg: PackageWithLines): Promise<Buffer> {
    return this.buildMany([pkg]);
  }

  async buildMany(packages: PackageWithLines[]): Promise<Buffer> {
    if (!packages.length) throw new Error('A BOQ needs at least one package.');
    const pkg = packages[0]; // header fields describe the engagement

    /*
     * Lines from every site, renumbered end to end. The site number rides on
     * each row so a line can still be traced back — without it a combined BOQ
     * is a list of quantities nobody can reconcile.
     */
    // The first column is already the Work Order number, so carrying each
    // line's own WO is all a combined BOQ needs to stay traceable per site.
    const allLines = packages.flatMap((p) =>
      p.lines.map((l) => ({ ...l, __woNumber: p.woNumber, __siteNo: p.siteNo })),
    );
    const wb = new ExcelJS.Workbook();
    wb.creator = pkg.contractorName;
    wb.created = new Date();

    const ws = wb.addWorksheet('BOQ', {
      views: [{ state: 'frozen', ySplit: 1 }],
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
    });

    ws.columns = [
      { key: 'wo', width: 50 },
      { key: 'itemCode', width: 16 },
      { key: 'quantity', width: 14.5 },
      { key: 'tag', width: 13 },
      { key: 'serviceDate', width: 18 },
    ];
    ws.getColumn(6).width = 8.83203125;

    /* --- header --- */
    const header = ws.getRow(1);
    ['WO #', 'Item Code', 'Quantity', 'TAG #', 'Service Date'].forEach((label, i) => {
      const cell = header.getCell(i + 1);
      cell.value = label;
      cell.font = { name: FONT, size: 8, bold: true, color: { argb: HEADER_FONT } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = thin;
    });
    header.getCell(5).numFmt = DATE_FMT;

    /* --- body --- */
    allLines.forEach((line: any, i: number) => {
      const row = ws.getRow(i + 2);

      const wo = row.getCell(1);
      wo.value = line.__woNumber ?? pkg.woNumber;
      wo.font = { name: FONT, size: 11 };
      wo.alignment = { horizontal: 'center', vertical: 'middle' };
      wo.border = thin;

      const code = row.getCell(2);
      code.value = line.itemCode;
      code.numFmt = '@';
      code.font = { name: FONT, size: 8, color: { argb: ITEM_CODE_FONT } };
      code.alignment = { horizontal: 'center', vertical: 'middle' };
      code.border = thin;

      const qty = row.getCell(3);
      qty.value = Number(line.quantity);
      qty.numFmt = '0.00';
      qty.font = { name: FONT, size: 8 };
      qty.alignment = { horizontal: 'center', vertical: 'middle' };
      qty.border = thin;

      const tag = row.getCell(4);
      tag.value = line.tagNumber || 'N/A';
      tag.font = { name: FONT, size: 10, color: { argb: BODY_FONT } };
      tag.alignment = { horizontal: 'center', vertical: 'middle' };
      tag.border = thin;

      const date = row.getCell(5);
      date.value = line.serviceDate ?? pkg.serviceDate ?? pkg.endDate ?? null;
      date.numFmt = DATE_FMT;
      date.font = { name: FONT, size: 10, color: { argb: BODY_FONT } };
      date.alignment = { horizontal: 'center', vertical: 'middle' };
      date.border = thin;
    });

    // The reference workbook keeps a few blank bordered rows under the data.
    const blankRows = 12;
    for (let r = allLines.length + 2; r < allLines.length + 2 + blankRows; r++) {
      const row = ws.getRow(r);
      for (let c = 1; c <= 5; c++) {
        row.getCell(c).border = thin;
        row.getCell(c).alignment = { horizontal: 'center', vertical: 'middle' };
      }
    }

    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: allLines.length + 1 + blankRows, column: 5 } };

    return Buffer.from(await wb.xlsx.writeBuffer());
  }
}
