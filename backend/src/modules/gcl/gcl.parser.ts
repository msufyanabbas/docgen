/**
 * GCL (Handing Over GCL for Minor Scope) parser.
 *
 * The GCL is a vector PDF, so instead of OCR we pull every text run together with its
 * (x, y) position and rebuild the table geometrically. That survives the small layout
 * drifts you get between GCLs from different sites, which a pure regex over
 * `pdf-parse` text would not.
 *
 * Strategy
 *  1. Extract positioned tokens for page 1.
 *  2. Anchor rows on item codes (SMART-TWR-001 ...) — one anchor per BOQ line.
 *  3. Slice the page into horizontal bands between consecutive anchors.
 *  4. Inside a band, resolve columns by x-order relative to the Unit token:
 *     NO | Item Code | Description | Unit | Design QTY | As-Built QTY | Tangible/Service
 *  5. Read the header block (Site ID, WO, PO, Region, District, Date) by label proximity.
 */

// pdfjs-dist 3.x ships a CommonJS legacy build, which is what a NestJS (CJS) build needs.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');

export interface Token {
  text: string;
  x: number; // left edge, PDF points
  y: number; // distance from page top, PDF points
  w: number;
  h: number;
}

export interface QuantityColumn {
  /** Stable key used to reference this column later, e.g. "qty1". */
  key: string;
  /** Header text as printed on the document, e.g. "Design QTY". */
  label: string;
  /** Left edge, so columns stay in document order. */
  x: number;
}

export interface ParsedGclLine {
  no: number;
  itemCode: string;
  description: string;
  unit: string | null;
  /** Every numeric column found on this row, keyed by QuantityColumn.key. */
  quantities: Record<string, number>;
  /** First and second columns, kept for convenience and older packages. */
  designQty: number;
  asBuiltQty: number;
  itemType: string | null;
  serialNumber: string | null;
}

export interface ParsedGcl {
  woNumber: string | null;
  siteNo: string | null;
  tawalSiteId: string | null;
  region: string | null;
  district: string | null;
  projectName: string | null;
  poNumber: string | null;
  gclDate: Date | null;
  contractorPmName: string | null;
  mspRepName: string | null;
  notes: string | null;
  /** Quantity columns the user can choose between for pricing. */
  quantityColumns: QuantityColumn[];
  lines: ParsedGclLine[];
  warnings: string[];
  /** Page-1 text with positions, used to locate the MSP sign-off block. */
  textPositions: { text: string; x: number; y: number }[];
}

const ITEM_CODE_RE = /^[A-Z]{3,}-[A-Z]{2,}-\d{2,}$/; // SMART-TWR-001
const QTY_RE = /^\d+(?:[.,]\d{1,3})?$/;
const UNIT_WORDS = ['each', 'site', 'lot', 'ls', 'lump', 'set', 'meter', 'm'];
const TYPE_WORDS = ['tangible', 'service'];

/** Month aliases seen on real GCLs: "16 Agu 2026", "16-Aug-2026", "16/08/2026". */
const MONTHS: Record<string, number> = {
  jan: 0, january: 0, ene: 0,
  feb: 1, february: 1, fev: 1,
  mar: 2, march: 2,
  apr: 3, april: 3, abr: 3,
  may: 4, mai: 4, mei: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7, agu: 7, agt: 7, ago: 7, agustus: 7, // "Agu" appears on Tawal GCLs
  sep: 8, sept: 8, september: 8, set: 8,
  oct: 9, october: 9, okt: 9, out: 9,
  nov: 10, november: 10,
  dec: 11, december: 11, dez: 11, des: 11, dis: 11,
};

/* ------------------------------------------------------------------ tokens */

export async function extractTokens(buffer: Buffer): Promise<Token[][]> {
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    isEvalSupported: false,
  }).promise;

  const pages: Token[][] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent({ includeMarkedContent: false });

    const tokens: Token[] = [];
    for (const item of content.items as any[]) {
      const text = String(item.str ?? '').replace(/\u00a0/g, ' ').trim();
      if (!text) continue;
      const t = item.transform;
      tokens.push({
        text,
        x: t[4],
        y: viewport.height - t[5], // flip to top-down
        w: item.width ?? 0,
        h: item.height ?? Math.abs(t[3]) ?? 0,
      });
    }
    tokens.sort((a, b) => a.y - b.y || a.x - b.x);
    pages.push(tokens);
    page.cleanup();
  }

  await doc.destroy();
  return pages;
}

/* ----------------------------------------------------------------- helpers */

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function toNumber(raw: string): number {
  return Number(raw.replace(/,/g, '.').replace(/[^\d.]/g, '')) || 0;
}

/** Tokens whose vertical centre falls inside [top, bottom). */
function band(tokens: Token[], top: number, bottom: number): Token[] {
  return tokens
    .filter((t) => {
      const c = t.y - t.h / 2;
      return c >= top && c < bottom;
    })
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

/** First token to the right of `label` on roughly the same baseline. */
function valueRightOf(tokens: Token[], label: Token, maxDy = 8, maxDx = 320): Token | null {
  const candidates = tokens
    .filter(
      (t) =>
        t !== label &&
        Math.abs(t.y - label.y) <= maxDy &&
        t.x > label.x + label.w - 1 &&
        t.x < label.x + maxDx,
    )
    .sort((a, b) => a.x - b.x);
  return candidates[0] ?? null;
}

function findLabel(tokens: Token[], ...variants: string[]): Token | null {
  const wanted = variants.map(norm);
  return tokens.find((t) => wanted.includes(norm(t.text))) ?? null;
}

/** Joins every token on the same baseline, left to right. */
function lineTextAt(tokens: Token[], anchor: Token, tol = 4): string {
  return tokens
    .filter((t) => Math.abs(t.y - anchor.y) <= tol)
    .sort((a, b) => a.x - b.x)
    .map((t) => t.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseFlexibleDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const s = raw.trim();

  // 16/08/2026 or 16-08-2026 or 16.08.2026
  let m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if (m) {
    const year = Number(m[3].length === 2 ? `20${m[3]}` : m[3]);
    return new Date(Date.UTC(year, Number(m[2]) - 1, Number(m[1])));
  }

  // 16 Agu 2026 / 16-Aug-26 / 16 August 2026
  m = s.match(/^(\d{1,2})[\s\-\/]*([A-Za-z\u0600-\u06FF]{3,12})[\s\-\/]*(\d{2,4})$/);
  if (m) {
    const mo = MONTHS[m[2].toLowerCase()];
    if (mo !== undefined) {
      const year = Number(m[3].length === 2 ? `20${m[3]}` : m[3]);
      return new Date(Date.UTC(year, mo, Number(m[1])));
    }
  }

  const fallback = new Date(s);
  return isNaN(fallback.getTime()) ? null : fallback;
}


/** Groups tokens into visual lines (same baseline within `tol` points). */
export function buildVisualLines(tokens: Token[], tol = 4) {
  const out: { y: number; text: string; tokens: Token[] }[] = [];
  for (const t of [...tokens].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.y - t.y) <= tol) {
      last.tokens.push(t);
      last.y = (last.y + t.y) / 2;
    } else {
      out.push({ y: t.y, text: '', tokens: [t] });
    }
  }
  for (const l of out) {
    l.tokens.sort((a, b) => a.x - b.x);
    l.text = l.tokens.map((t) => t.text).join(' ').replace(/\s+/g, ' ').trim();
  }
  return out;
}

/** Finds the first visual line whose text contains `phrase` (case/space insensitive). */
function findPhraseLine(lines: ReturnType<typeof buildVisualLines>, ...phrases: string[]) {
  const needles = phrases.map(norm);
  return lines.find((l) => needles.some((n) => norm(l.text).includes(n))) ?? null;
}

/* -------------------------------------------------------------------- main */

export async function parseGcl(buffer: Buffer): Promise<ParsedGcl> {
  const pages = await extractTokens(buffer);
  const tokens = pages.flat();
  const warnings: string[] = [];

  if (!tokens.length) {
    throw new Error(
      'No text layer found in this PDF. The GCL appears to be a flat scan — re-export it from Excel, or run OCR before uploading.',
    );
  }

  /* ---------------- header block ---------------- */

  const pick = (...variants: string[]) => {
    const label = findLabel(tokens, ...variants);
    if (!label) return null;
    const v = valueRightOf(tokens, label);
    return v?.text ?? null;
  };

  const tawalSiteId = pick('Tawal Site ID', 'TawalSiteID', 'Site ID');
  const siteNo = pick('Site No.', 'Site No', 'SiteNo');
  const region = pick('Region');
  const district = pick('District');
  const projectName = pick('Project');

  // WO number can be wrapped over two lines ("...SmartTower-" + "18731").
  const woParts = tokens
    .filter((t) => /^WO-[A-Za-z0-9]/.test(t.text) || /^\d{4,6}$/.test(t.text))
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const woHead = woParts.find((t) => t.text.startsWith('WO-'));
  let woNumber: string | null = null;
  if (woHead) {
    woNumber = woHead.text;
    if (woNumber.endsWith('-')) {
      const tail = tokens
        .filter((t) => t !== woHead && t.y > woHead.y && t.y < woHead.y + 16 && /^\d+$/.test(t.text))
        .sort((a, b) => a.y - b.y)[0];
      if (tail) woNumber += tail.text;
    }
  } else {
    warnings.push('Work Order number not found in the GCL header.');
  }

  // PO: the label "PO" sits above "Date:"; the value is an all-digit token to its right.
  let poNumber: string | null = null;
  const poLabel = findLabel(tokens, 'PO', 'PO#', 'PO #');
  if (poLabel) {
    const near = tokens
      .filter(
        (t) =>
          Math.abs(t.y - poLabel.y) <= 8 && t.x > poLabel.x && /^\d{6,12}$/.test(t.text),
      )
      .sort((a, b) => a.x - b.x)[0];
    poNumber = near?.text ?? null;
  }

  const dateLabel = findLabel(tokens, 'Date:', 'Date');
  let gclDate: Date | null = null;
  if (dateLabel) {
    const rest = tokens
      .filter((t) => Math.abs(t.y - dateLabel.y) <= 8 && t.x > dateLabel.x)
      .sort((a, b) => a.x - b.x)
      .map((t) => t.text)
      .join(' ');
    gclDate = parseFlexibleDate(rest);
  }
  if (!gclDate) warnings.push('GCL date could not be read — set it manually.');

  /* ---------------- line items ---------------- */

  const anchors = tokens
    .filter((t) => ITEM_CODE_RE.test(t.text))
    .sort((a, b) => a.y - b.y);

  if (!anchors.length) {
    throw new Error(
      'No item codes (e.g. SMART-TWR-001) were found in the GCL table. Check that the correct file was uploaded.',
    );
  }

  // The table ends where the signature block starts.
  const visualLines = buildVisualLines(tokens);
  const footerLine = findPhraseLine(
    visualLines,
    'Implementation Contractor',
    'MSP Representative',
  );
  const tableBottom = footerLine ? footerLine.y - 4 : Number.MAX_SAFE_INTEGER;

  // Row 1 starts just under the table header ("Unit" / "Item Code" labels).
  const headerTok = tokens
    .filter((t) => ['unit', 'itemcode', 'description'].includes(norm(t.text)) && t.y < anchors[0].y)
    .sort((a, b) => b.y - a.y)[0];
  const tableTop = headerTok ? headerTok.y + 4 : anchors[0].y - 30;

  /*
   * Which columns hold quantities is read from the document rather than assumed.
   * The header cells between "Unit" and the Tangible/Service column are the
   * numeric ones; their printed labels become the choices the user picks from.
   */
  const unitHeader = tokens.find((t) => norm(t.text) === 'unit' && t.y < anchors[0].y);
  const typeHeader = tokens.find(
    (t) => ['tangible', 'tangibleor'].includes(norm(t.text)) && t.y < anchors[0].y,
  );
  const headerBandTop = tableTop - 46;

  const quantityColumns: QuantityColumn[] = [];
  if (unitHeader) {
    const rightLimit = typeHeader ? typeHeader.x - 2 : unitHeader.x + 120;
    // Header labels wrap ("Design"/"QTY"), so group the header tokens by x.
    const headerTokens = band(tokens, headerBandTop, tableTop)
      .filter((t) => t.x > unitHeader.x + unitHeader.w && t.x < rightLimit)
      .sort((a, b) => a.x - b.x);

    // Headers stack over several lines ("As" / "Bulit" / "QTY"), so group by x
    // and then read each group top-to-bottom to recover the printed wording.
    const groups: { x: number; parts: Token[] }[] = [];
    for (const t of headerTokens) {
      const g = groups.find((gr) => Math.abs(gr.x - t.x) < 18);
      if (g) {
        g.parts.push(t);
        g.x = Math.min(g.x, t.x);
      } else {
        groups.push({ x: t.x, parts: [t] });
      }
    }

    groups
      .sort((a, b) => a.x - b.x)
      .forEach((g, idx) => {
        const label = g.parts
          .sort((a, b) => a.y - b.y || a.x - b.x)
          .map((t) => t.text)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        quantityColumns.push({
          key: `qty${idx + 1}`,
          label: label || `Quantity ${idx + 1}`,
          x: g.x,
        });
      });
  }

  if (!quantityColumns.length) {
    // Fall back to the classic two-column layout so an unusual header still works.
    quantityColumns.push(
      { key: 'qty1', label: 'Design QTY', x: 0 },
      { key: 'qty2', label: 'As-Built QTY', x: 1 },
    );
    warnings.push('Quantity column headers could not be read — assuming Design then As-Built.');
  }

  const lines: ParsedGclLine[] = [];

  anchors.forEach((anchor, i) => {
    // Split rows at the midpoint between item-code anchors so that description
    // lines rendered above and below the code stay with their own row.
    const prev = anchors[i - 1];
    const next = anchors[i + 1];
    const top = prev ? (prev.y + anchor.y) / 2 : tableTop;
    const bottom = Math.min(next ? (anchor.y + next.y) / 2 : tableBottom, tableBottom);

    const cells = band(tokens, top, bottom);

    // Unit column: the pivot everything else is measured against.
    const unitTok = cells.find(
      (t) => UNIT_WORDS.includes(norm(t.text)) && t.x > anchor.x + anchor.w,
    );
    const unitX = unitTok ? unitTok.x : anchor.x + anchor.w + 220;

    // NO column: integer left of the item code.
    const noTok = cells.find((t) => t.x < anchor.x - 2 && /^\d{1,3}$/.test(t.text));

    // Quantities: numeric tokens right of the Unit column, left-to-right.
    const qtyToks = cells
      .filter((t) => t.x > unitX + 4 && QTY_RE.test(t.text))
      .sort((a, b) => a.x - b.x);

    // Assign each number to the nearest header column, so a blank cell doesn't
    // shift every later value one column to the left.
    const quantities: Record<string, number> = {};
    const positioned = quantityColumns.some((c) => c.x > 2);

    qtyToks.forEach((tok, idx) => {
      let key: string;
      if (positioned) {
        const nearest = quantityColumns.reduce((best, c) =>
          Math.abs(c.x - tok.x) < Math.abs(best.x - tok.x) ? c : best,
        );
        key = nearest.key;
      } else {
        key = quantityColumns[idx]?.key ?? `qty${idx + 1}`;
      }
      // Two numbers landing on one column means the layout drifted; keep the first.
      if (quantities[key] === undefined) quantities[key] = toNumber(tok.text);
    });

    for (const c of quantityColumns) {
      if (quantities[c.key] === undefined) quantities[c.key] = 0;
    }

    const designQty = quantities[quantityColumns[0]?.key ?? 'qty1'] ?? 0;
    const asBuiltQty = quantities[quantityColumns[1]?.key ?? 'qty2'] ?? designQty;

    if (!qtyToks.length) {
      warnings.push(`${anchor.text}: no quantity found, defaulted to 0.`);
    } else if (qtyToks.length === 1) {
      warnings.push(`${anchor.text}: only one quantity column found; As-Built copied from Design.`);
    }

    const typeTok = cells.find((t) => TYPE_WORDS.includes(norm(t.text)));

    const description = cells
      .filter((t) => t.x > anchor.x + anchor.w - 1 && t.x < unitX - 2)
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map((t) => t.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    const snMatch = description.match(/S\s*\.?\s*N\s*[:.\-]?\s*([A-Za-z0-9\-]{4,})/i);

    lines.push({
      no: noTok ? Number(noTok.text) : i + 1,
      itemCode: anchor.text.toUpperCase(),
      description,
      unit: unitTok ? unitTok.text : null,
      quantities,
      designQty,
      asBuiltQty,
      itemType: typeTok
        ? typeTok.text.charAt(0).toUpperCase() + typeTok.text.slice(1).toLowerCase()
        : null,
      serialNumber: snMatch ? snMatch[1] : null,
    });
  });

  /* ---------------- signatories + free-text notes ---------------- */

  let contractorPmName: string | null = null;
  let mspRepName: string | null = null;

  const nameLabel = tokens.find(
    (t) => norm(t.text) === 'name' && t.y > tableBottom && t.x < 120,
  );

  /*
   * Which column a name sits in decides who it belongs to — not the order it
   * appears in. The two names are rarely on the same baseline: a name typed
   * into a merged cell often sits lower than the "Name:" label beside it, and
   * reading positionally then hands the contractor's slot to the MSP's name.
   * So the column boundary comes from the block headers.
   */
  const contractorHeader = tokens.find((t) => /implementation\s*contractor/i.test(t.text));
  const mspHeader = tokens.find((t) => /msp\s*representative/i.test(t.text));

  if (nameLabel) {
    const boundary = mspHeader
      ? mspHeader.x - 4
      : contractorHeader
        ? contractorHeader.x + 200
        : 260;

    const candidates = tokens.filter(
      (t) =>
        // Generous band: the value may sit well below its label.
        t.y >= nameLabel.y - 4 &&
        t.y <= nameLabel.y + 22 &&
        t.x > nameLabel.x + nameLabel.w &&
        t.x < 360 && // left of the Accepted / Reject checkbox column
        /[A-Za-z]{2,}/.test(t.text) &&
        !/^(accepted|reject|date|signature|name)/i.test(t.text.trim()),
    );

    const nearest = (list: typeof candidates) =>
      list.sort((a, b) => Math.abs(a.y - nameLabel.y) - Math.abs(b.y - nameLabel.y))[0]?.text ?? null;

    contractorPmName = nearest(candidates.filter((t) => t.x < boundary));
    mspRepName = nearest(candidates.filter((t) => t.x >= boundary));
  }

  // Anything printed below the instructions block is a hand-written remark.
  const notesTop = Math.max(
    ...tokens
      .filter((t) => /Form shall be prepared|shall be used for Minor/i.test(t.text))
      .map((t) => t.y),
    0,
  );
  const noteTokens = tokens.filter(
    (t) => notesTop > 0 && t.y > notesTop + 10 && !/This Content is/i.test(t.text),
  );
  const grouped = new Map<number, string[]>();
  for (const t of noteTokens.sort((a, b) => a.y - b.y || a.x - b.x)) {
    const key = Math.round(t.y / 6);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(t.text);
  }
  const notes =
    [...grouped.values()]
      .map((w) => w.join(' ').trim())
      .filter((l) => l.length > 3 && !/^[\d\s#.]+$/.test(l))
      .join('\n') || null;

  return {
    woNumber,
    siteNo,
    tawalSiteId,
    region,
    district,
    projectName,
    poNumber,
    gclDate,
    contractorPmName,
    mspRepName,
    notes,
    quantityColumns,
    lines,
    warnings,
    textPositions: tokens.map((t) => ({ text: t.text, x: t.x, y: t.y })),
  };
}

export const __testing = { lineTextAt, band, toNumber };
