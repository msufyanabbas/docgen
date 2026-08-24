import * as fs from 'fs';
import * as path from 'path';

/** Logos are inlined as data URIs so Chromium never needs network or file access. */
const cache = new Map<string, string | null>();

function resolve(name: string): string | null {
  const candidates = [
    path.join(__dirname, '..', '..', '..', '..', 'assets', name),
    path.join(__dirname, '..', '..', '..', 'assets', name),
    path.join(process.cwd(), 'assets', name),
    path.join(process.cwd(), 'dist', 'assets', name),
  ];
  return candidates.find((c) => fs.existsSync(c)) ?? null;
}

export function dataUri(name: string): string | null {
  if (cache.has(name)) return cache.get(name)!;
  const file = resolve(name);
  const value = file
    ? `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`
    : null;
  cache.set(name, value);
  return value;
}

export const logos = () => ({
  logoTawal: dataUri('tawal-logo.png'),
  logoSmartLife: dataUri('smartlife-logo.png'),
});

/** The company stamp is the same on every GCL, so it lives with the logos.
 *  Signatures are per-package and come from storage instead. */
export const stamp = () => dataUri('company-stamp.png');

/** Inlines a user-uploaded signature from an absolute path. */
export function fileDataUri(absPath: string | null | undefined): string | null {
  if (!absPath || !fs.existsSync(absPath)) return null;
  const ext = path.extname(absPath).toLowerCase();
  const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
  return `data:${mime};base64,${fs.readFileSync(absPath).toString('base64')}`;
}
