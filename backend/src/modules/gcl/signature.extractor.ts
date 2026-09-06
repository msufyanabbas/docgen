import { Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { PNG } from 'pngjs';
import { promisify } from 'util';

const run = promisify(execFile);
const logger = new Logger('SignatureExtractor');

/**
 * Crops to the ink, ignoring table rules.
 *
 * A cell border is a line spanning nearly the whole width or height, so any row
 * or column that is almost entirely inked is treated as a border rather than
 * signature and excluded from the bounds.
 */
function trimToInk(img: PNG): PNG {
  const alphaAt = (x: number, y: number) => img.data[((img.width * y + x) << 2) + 3];

  const rowInk: number[] = [];
  const colInk: number[] = [];
  for (let y = 0; y < img.height; y++) {
    let n = 0;
    for (let x = 0; x < img.width; x++) if (alphaAt(x, y) > 40) n++;
    rowInk[y] = n;
  }
  for (let x = 0; x < img.width; x++) {
    let n = 0;
    for (let y = 0; y < img.height; y++) if (alphaAt(x, y) > 40) n++;
    colInk[x] = n;
  }

  const rowIsBorder = (y: number) => rowInk[y] > img.width * 0.6;
  const colIsBorder = (x: number) => colInk[x] > img.height * 0.6;

  /*
   * Erase the rules rather than only trimming past them. A cell border can sit
   * inside the crop as well as at its edge, and trimming inward stops at the
   * first ink it meets — which leaves the line in the output.
   */
  const clear = (i: number) => {
    img.data[i + 3] = 0;
  };
  for (let y = 0; y < img.height; y++) {
    if (!rowIsBorder(y)) continue;
    for (let x = 0; x < img.width; x++) clear((img.width * y + x) << 2);
    rowInk[y] = 0;
  }
  for (let x = 0; x < img.width; x++) {
    if (!colIsBorder(x)) continue;
    for (let y = 0; y < img.height; y++) clear((img.width * y + x) << 2);
    colInk[x] = 0;
  }

  // Recount: erasing a rule changes what the remaining rows and columns hold.
  for (let y = 0; y < img.height; y++) {
    let n = 0;
    for (let x = 0; x < img.width; x++) if (alphaAt(x, y) > 40) n++;
    rowInk[y] = n;
  }
  for (let x = 0; x < img.width; x++) {
    let n = 0;
    for (let y = 0; y < img.height; y++) if (alphaAt(x, y) > 40) n++;
    colInk[x] = n;
  }

  let top = 0;
  let bottom = img.height - 1;
  let left = 0;
  let right = img.width - 1;

  while (top < bottom && rowInk[top] === 0) top++;
  while (bottom > top && rowInk[bottom] === 0) bottom--;
  while (left < right && colInk[left] === 0) left++;
  while (right > left && colInk[right] === 0) right--;

  // A little breathing room, so the ink isn't flush against the edge.
  const pad = 4;
  top = Math.max(0, top - pad);
  left = Math.max(0, left - pad);
  bottom = Math.min(img.height - 1, bottom + pad);
  right = Math.min(img.width - 1, right + pad);

  const w = right - left + 1;
  const h = bottom - top + 1;
  if (w < 8 || h < 8) return img;

  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = (img.width * (y + top) + (x + left)) << 2;
      const di = (w * y + x) << 2;
      out.data[di] = img.data[si];
      out.data[di + 1] = img.data[si + 1];
      out.data[di + 2] = img.data[si + 2];
      out.data[di + 3] = img.data[si + 3];
    }
  }
  return out;
}

/**
 * Lifts the contractor's signature off a signed GCL.
 *
 * The signature is drawn ink, not text or an embedded image we can pull by
 * reference, so the cell is located from the text layer ("Signature" in the
 * Implementation Contractor block) and that region of the rasterised page is
 * cropped.
 *
 * The background is knocked out so the result drops onto the PAC and FAC the
 * way a signature should — ink on the form, not a white patch over it.
 */
export async function extractSignature(
  pdf: Buffer,
  textPositions: { text: string; x: number; y: number }[],
): Promise<Buffer | null> {
  // The label sits to the left of the signature cell.
  const label = textPositions.find((t) => /^signature/i.test(t.text.trim()));
  if (!label) {
    logger.warn('No "Signature" label found — the GCL layout may differ.');
    return null;
  }

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gcl-sig-'));
  try {
    const src = path.join(dir, 'in.pdf');
    await fs.writeFile(src, pdf);

    const DPI = 200; // enough that the ink stays crisp when scaled down
    await run(
      'pdftoppm',
      ['-r', String(DPI), '-f', '1', '-l', '1', '-png', src, path.join(dir, 'p')],
      { timeout: 30_000 },
    );

    const file = (await fs.readdir(dir)).find((f) => f.startsWith('p') && f.endsWith('.png'));
    if (!file) throw new Error('the page did not rasterise');

    const page = PNG.sync.read(await fs.readFile(path.join(dir, file)));
    const scale = DPI / 72;

    /*
     * The cell runs from just right of the label to before the stamp column.
     * The window is deliberately generous — the exact ink is found by trimming
     * afterwards, which survives a signature sitting high, low or off-centre.
     */
    const x0 = Math.round((label.x + 48) * scale);
    const x1 = Math.round((label.x + 170) * scale);
    const y0 = Math.round((label.y - 18) * scale);
    const y1 = Math.round((label.y + 18) * scale);

    const w = Math.min(x1, page.width) - Math.max(0, x0);
    const h = Math.min(y1, page.height) - Math.max(0, y0);
    if (w <= 0 || h <= 0) throw new Error('the signature cell fell outside the page');

    const out = new PNG({ width: w, height: h });
    let ink = 0;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const si = (page.width * (y + Math.max(0, y0)) + (x + Math.max(0, x0))) << 2;
        const di = (w * y + x) << 2;

        const r = page.data[si];
        const g = page.data[si + 1];
        const b = page.data[si + 2];
        const lum = (r * 299 + g * 587 + b * 114) / 1000;

        out.data[di] = r;
        out.data[di + 1] = g;
        out.data[di + 2] = b;
        // Paper becomes transparent, ink stays. The ramp keeps the stroke edges
        // soft rather than jagged.
        out.data[di + 3] = lum > 210 ? 0 : lum > 150 ? Math.round((210 - lum) * 4) : 255;
        if (out.data[di + 3] > 40) ink++;
      }
    }

    // A blank cell means the GCL simply wasn't signed there; that is not an error.
    if (ink < 60) {
      logger.log('The signature cell looks empty — nothing extracted.');
      return null;
    }

    const trimmed = trimToInk(out);
    logger.log(
      `Signature extracted (${trimmed.width}x${trimmed.height} from ${w}x${h}, ${ink} ink pixels)`,
    );
    return PNG.sync.write(trimmed);
  } catch (e: any) {
    logger.warn(`Signature could not be extracted: ${e.message}`);
    return null;
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
