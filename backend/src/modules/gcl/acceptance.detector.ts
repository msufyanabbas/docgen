import { Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { PNG } from 'pngjs';
import { promisify } from 'util';

const run = promisify(execFile);
const logger = new Logger('AcceptanceDetector');

// Typed against the Prisma enum, but written as literals: this module is loaded
// at startup and shouldn't depend on the generated client's runtime shape.
import type { Acceptance } from '@prisma/client';
export type { Acceptance };

export interface AcceptanceResult {
  value: Acceptance | null;
  /** 'high' when one row is clearly inked, 'low' when the reading is close. */
  confidence: 'high' | 'low' | 'none';
  /** Per-row ink share, for the reviewer to sanity-check the reading. */
  ink: Record<Acceptance, number>;
  reason?: string;
}

const LABELS: { key: Acceptance; match: RegExp }[] = [
  // Order matters: "Accepted with Oil" also contains "Accepted".
  { key: 'ACCEPTED_WITH_OIL' as Acceptance, match: /accepted\s*with\s*oil/i },
  { key: 'REJECTED' as Acceptance, match: /^reject/i },
  { key: 'ACCEPTED' as Acceptance, match: /^accepted\s*$/i },
];

/**
 * Which box is ticked in the MSP sign-off block.
 *
 * The tick is not in the PDF's text layer — all three checkboxes are the same
 * unchecked Wingdings glyph, and the mark is drawn on top. So the page is
 * rasterised and the ink measured in each row's checkbox cell: the ticked one
 * carries visibly more.
 *
 * This is a reading of a hand-marked form, so it is treated as a suggestion.
 * Acceptance decides whether Tawal receives a FAC or a PAC, and a silent
 * misread is worse than asking — the caller confirms every value.
 */
export async function detectAcceptance(
  pdf: Buffer,
  labelPositions: { text: string; x: number; y: number }[],
): Promise<AcceptanceResult> {
  const empty: Record<Acceptance, number> = {
    ACCEPTED: 0,
    ACCEPTED_WITH_OIL: 0,
    REJECTED: 0,
  } as Record<Acceptance, number>;

  // Where each label sits, taken from the text layer the parser already read.
  const rows: { key: Acceptance; y: number; x: number }[] = [];
  for (const { key, match } of LABELS) {
    if (rows.some((r) => r.key === key)) continue;
    const hit = labelPositions.find(
      (t) => match.test(t.text.trim()) && !rows.some((r) => Math.abs(r.y - t.y) < 4),
    );
    if (hit) rows.push({ key, y: hit.y, x: hit.x });
  }

  if (rows.length < 2) {
    return {
      value: null,
      confidence: 'none',
      ink: empty,
      reason: 'The Accepted / Accepted with Oil / Reject block was not found on page 1.',
    };
  }

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gcl-accept-'));
  try {
    const src = path.join(dir, 'in.pdf');
    await fs.writeFile(src, pdf);

    const DPI = 150;
    await run('pdftoppm', ['-r', String(DPI), '-f', '1', '-l', '1', '-png', src, path.join(dir, 'p')], {
      timeout: 30_000,
    });

    const file = (await fs.readdir(dir)).find((f) => f.startsWith('p') && f.endsWith('.png'));
    if (!file) throw new Error('the page did not rasterise');

    const png = PNG.sync.read(await fs.readFile(path.join(dir, file)));
    const scale = DPI / 72;

    // The checkbox column sits to the left of the label text.
    const labelX = Math.min(...rows.map((r) => r.x));
    const x0 = Math.round((labelX - 42) * scale);
    const x1 = Math.round((labelX - 4) * scale);

    const ink: Record<Acceptance, number> = { ...empty };

    for (const row of rows) {
      /*
       * The parser reports y as distance from the page top, so the band is
       * measured downwards. Treating it as a PDF bottom-up coordinate flips it
       * and reads the wrong row entirely — which is exactly the kind of silent
       * error that would put a FAC where a PAC belongs.
       */
      const top = Math.round((row.y - 9) * scale);
      const bottom = Math.round((row.y + 5) * scale);

      let dark = 0;
      let total = 0;
      for (let y = Math.max(0, top); y < Math.min(png.height, bottom); y++) {
        for (let x = Math.max(0, x0); x < Math.min(png.width, x1); x++) {
          const i = (png.width * y + x) << 2;
          // Rough luminance is enough; the mark is near-black on white.
          const lum = (png.data[i] * 299 + png.data[i + 1] * 587 + png.data[i + 2] * 114) / 1000;
          if (lum < 128) dark++;
          total++;
        }
      }
      ink[row.key] = total ? +(dark / total).toFixed(4) : 0;
    }

    const ranked = (Object.entries(ink) as [Acceptance, number][])
      .filter(([k]) => rows.some((r) => r.key === k))
      .sort((a, b) => b[1] - a[1]);

    const [top1, top2] = ranked;
    if (!top1 || top1[1] < 0.04) {
      return {
        value: null,
        confidence: 'none',
        ink,
        reason: 'No box appears to be ticked.',
      };
    }

    // An unticked cell still carries some ink from its border, so the winner
    // has to be clearly ahead rather than merely ahead.
    const clear = !top2 || top1[1] >= top2[1] * 1.6;
    return {
      value: top1[0],
      confidence: clear ? 'high' : 'low',
      ink,
      reason: clear ? undefined : 'Two boxes look similarly marked — please confirm.',
    };
  } catch (e: any) {
    logger.warn(`Acceptance could not be read: ${e.message}`);
    return {
      value: null,
      confidence: 'none',
      ink: empty,
      reason: `The sign-off box could not be read (${e.message}).`,
    };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
