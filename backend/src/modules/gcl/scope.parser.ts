import * as ExcelJS from 'exceljs';

/**
 * Parses a Tawal scope-of-work export (e.g. ZMS008.xlsx) — the sheet that lists
 * the approved items per site. This is the *input* to GCL creation, the mirror
 * image of gcl.parser.ts which reads a signed GCL back in.
 *
 * Expected columns (order-independent, matched by header alias):
 *   Budget | SubProject Name | Contractor | PO# | Site ID | Site Code |
 *   site Name | Work type | Item Code | Description of Item | Unit | updated Qty
 *
 * Rows are grouped by site, because one site = one GCL.
 */

export interface QuantityColumn {
  key: string;
  label: string;
  x: number;
}

export interface ScopeLine {
  itemCode: string;
  description: string;
  unit: string | null;
  /** Every numeric column on the row, keyed by QuantityColumn.key. */
  quantities: Record<string, number>;
  /** The column the sheet calls "updated Qty", kept for convenience. */
  qty: number;
  workType: string | null;
  /** Derived from Work type: "... Hardware" -> Tangible, "... Services" -> Service. */
  itemType: 'Tangible' | 'Service' | null;
}

export interface ScopeSite {
  budget: string | null;
  subProjectName: string | null;
  contractor: string | null;
  poNumber: string | null;
  tawalSiteId: string | null;
  siteCode: string | null;
  siteName: string | null;
  lines: ScopeLine[];
}

export interface ParsedScope {
  sites: ScopeSite[];
  /** Numeric columns the user can price against. */
  quantityColumns: QuantityColumn[];
  warnings: string[];
}

type Field =
  | 'budget'
  | 'subProjectName'
  | 'contractor'
  | 'poNumber'
  | 'tawalSiteId'
  | 'siteCode'
  | 'siteName'
  | 'workType'
  | 'itemCode'
  | 'description'
  | 'unit'
  | 'qty';

const COLUMN_ALIASES: Record<Field, string[]> = {
  budget: ['budget', 'budget name'],
  subProjectName: ['subproject name', 'sub project name', 'subproject', 'sub-project name'],
  contractor: ['contractor', 'contractor name', 'vendor'],
  poNumber: ['po#', 'po #', 'po', 'po number', 'p.o no.', 'po no'],
  tawalSiteId: ['site id', 'siteid', 'tawal site id'],
  siteCode: ['site code', 'sitecode', 'site no', 'site no.'],
  siteName: ['site name', 'sitename'],
  workType: ['work type', 'worktype', 'type of work', 'category'],
  itemCode: ['item code', 'itemcode', 'item', 'code'],
  description: ['description of item', 'description', 'item description', 'desc'],
  unit: ['unit', 'uom', 'unit of measure'],
  qty: ['updated qty', 'qty', 'quantity', 'design qty', 'updated quantity'],
};

const norm = (v: unknown) =>
  String(v ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value as any;
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((r: any) => r.text).join('');
    if ('text' in v) return String(v.text);
    if ('result' in v) return String(v.result ?? '');
  }
  return String(v);
}

function cellNumber(cell: ExcelJS.Cell): number {
  const v = cell.value as any;
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object' && 'result' in v && typeof v.result === 'number') return v.result;
  const n = Number(cellText(cell).replace(/[^\d.\-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** "Smart Tower Hardware" -> Tangible, "Smart Access Services" -> Service. */
export function itemTypeFromWorkType(workType: string | null): 'Tangible' | 'Service' | null {
  if (!workType) return null;
  const t = workType.toLowerCase();
  if (t.includes('service')) return 'Service';
  if (t.includes('hardware') || t.includes('material') || t.includes('supply')) return 'Tangible';
  return null;
}

export async function parseScopeWorkbook(source: string | Buffer): Promise<ParsedScope> {
  const wb = new ExcelJS.Workbook();
  if (Buffer.isBuffer(source)) await wb.xlsx.load(source as any);
  else await wb.xlsx.readFile(source);

  const ws = wb.worksheets[0];
  if (!ws) throw new Error('The workbook contains no worksheets.');

  // --- locate the header row (tolerates title/blank rows above it) ---
  let headerRow = 0;
  let map: Partial<Record<Field, number>> = {};

  for (let r = 1; r <= Math.min(20, ws.rowCount); r++) {
    const candidate: Partial<Record<Field, number>> = {};
    ws.getRow(r).eachCell({ includeEmpty: false }, (cell, col) => {
      const text = norm(cellText(cell));
      for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
        if (aliases.includes(text) && candidate[field as Field] === undefined) {
          candidate[field as Field] = col;
        }
      }
    });
    if (candidate.itemCode !== undefined && candidate.qty !== undefined) {
      headerRow = r;
      map = candidate;
      break;
    }
  }

  if (!headerRow) {
    throw new Error(
      'Could not find a header row. The scope sheet needs at least an "Item Code" column and a quantity column ("updated Qty").',
    );
  }

  /*
   * Any other numeric column is offered as a pricing basis too — sheets vary,
   * and "updated Qty" is not always the one that should be billed.
   */
  const mappedCols = new Set(Object.values(map));
  const quantityColumns: QuantityColumn[] = [];
  const headerCells = ws.getRow(headerRow);

  headerCells.eachCell({ includeEmpty: false }, (cell, col) => {
    const label = cellText(cell).trim();
    if (!label) return;
    const isKnownQty = map.qty === col;
    if (!isKnownQty && mappedCols.has(col)) return;

    // Treat a column as numeric if the first few data rows parse as numbers.
    let numeric = 0;
    let seen = 0;
    for (let r = headerRow + 1; r <= Math.min(headerRow + 12, ws.rowCount); r++) {
      const raw = cellText(ws.getRow(r).getCell(col)).trim();
      if (!raw) continue;
      seen++;
      if (/^-?[\d,.]+$/.test(raw)) numeric++;
    }
    if (isKnownQty || (seen > 0 && numeric / seen >= 0.8)) {
      quantityColumns.push({ key: `col${col}`, label, x: col });
    }
  });

  if (!quantityColumns.length && map.qty) {
    quantityColumns.push({ key: `col${map.qty}`, label: 'Quantity', x: map.qty });
  }

  const headerWords = new Set(
    Object.values(COLUMN_ALIASES).flat().map((a) => a.replace(/\s+/g, '')),
  );
  const looksLikeHeader = (t: string) => headerWords.has(norm(t).replace(/\s+/g, ''));

  const get = (row: ExcelJS.Row, field: Field) =>
    map[field] ? cellText(row.getCell(map[field]!)).trim() : '';

  // --- group rows by site ---
  const sites = new Map<string, ScopeSite>();
  const warnings: string[] = [];

  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const rawCode = get(row, 'itemCode');
    if (!rawCode || looksLikeHeader(rawCode)) continue;

    const siteCode = get(row, 'siteCode');
    const tawalSiteId = get(row, 'tawalSiteId');
    const key = siteCode || tawalSiteId || '__unknown__';

    if (!sites.has(key)) {
      sites.set(key, {
        budget: get(row, 'budget') || null,
        subProjectName: get(row, 'subProjectName') || null,
        contractor: get(row, 'contractor') || null,
        poNumber: get(row, 'poNumber') || null,
        tawalSiteId: tawalSiteId || null,
        siteCode: siteCode || null,
        siteName: get(row, 'siteName').trim() || null,
        lines: [],
      });
    }

    const site = sites.get(key)!;
    const workType = get(row, 'workType') || null;

    const quantities: Record<string, number> = {};
    for (const c of quantityColumns) quantities[c.key] = cellNumber(row.getCell(c.x));

    const qty = map.qty ? cellNumber(row.getCell(map.qty)) : Object.values(quantities)[0] ?? 0;
    if (!qty) warnings.push(`${key} / ${rawCode}: quantity is 0 on row ${r}.`);

    site.lines.push({
      itemCode: rawCode.toUpperCase(),
      description: get(row, 'description'),
      unit: get(row, 'unit') || null,
      quantities,
      qty,
      workType,
      itemType: itemTypeFromWorkType(workType),
    });
  }

  if (!sites.size) throw new Error('No scope items were found below the header row.');

  if (sites.has('__unknown__')) {
    warnings.push('Some rows carry no Site Code or Site ID and were grouped together.');
  }

  return { sites: [...sites.values()], quantityColumns, warnings };
}
