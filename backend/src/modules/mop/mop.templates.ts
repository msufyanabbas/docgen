import * as fs from 'fs';
import * as path from 'path';
import AdmZip from 'adm-zip';

/**
 * MOP generation works by filling Tawal's own .docx files rather than rebuilding
 * them. Each template under templates/mop/ is the original document with the five
 * Document Control values replaced by {{PLACEHOLDERS}}; everything else — the
 * cover artwork, headers, footers, styles, fonts — is byte-for-byte Tawal's.
 *
 * That is the only way to guarantee the output is indistinguishable from a
 * hand-filled MOP. Re-creating the layout would drift on every Word update.
 */

export interface MopFields {
  tcnSummary: string;
  siteId: string;
  requesterName: string;
  pmName: string;
  siteImpact: string;
}

export interface TemplateInfo {
  key: string;
  label: string;
  file: string;
}

const LABELS: Record<string, string> = {
  INSTALLATION: 'RMS / Smart Tower Installation',
  CCTV_Installation: 'CCTV Installation',
  SIM_SWAP: 'SIM Swap',
  Site_Survey: 'Site Survey',
};

/** Resolves whether running from src (ts-node) or dist (compiled). */
export function templateDir(): string {
  const candidates = [
    path.join(__dirname, '..', '..', '..', 'templates', 'mop'),
    path.join(process.cwd(), 'templates', 'mop'),
    path.join(process.cwd(), 'dist', 'templates', 'mop'),
  ];
  const found = candidates.find((c) => fs.existsSync(c));
  if (!found) {
    throw new Error(
      `MOP templates not found. Looked in:\n  ${candidates.join('\n  ')}`,
    );
  }
  return found;
}

export function listTemplates(): TemplateInfo[] {
  const dir = templateDir();
  return fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.docx') && !f.startsWith('~$'))
    .map((f) => {
      const key = f.replace(/\.docx$/i, '');
      return { key, label: LABELS[key] ?? key.replace(/_/g, ' '), file: f };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** XML text nodes can't carry raw &, < or >. */
function escapeXml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const PLACEHOLDERS: Record<keyof MopFields, string> = {
  tcnSummary: '{{TCN_SUMMARY}}',
  siteId: '{{SITE_ID}}',
  requesterName: '{{REQUESTER_NAME}}',
  pmName: '{{PM_NAME}}',
  siteImpact: '{{SITE_IMPACT}}',
};

/**
 * Produces a filled .docx as a Buffer.
 *
 * Only word/document.xml is rewritten; every other entry is copied through
 * untouched, which keeps the ~1.8MB cover image and the media relationships
 * exactly as Tawal authored them.
 */
export function fillTemplate(templateKey: string, fields: MopFields): Buffer {
  const file = path.join(templateDir(), `${templateKey}.docx`);
  if (!fs.existsSync(file)) {
    throw new Error(`Template "${templateKey}" does not exist in ${templateDir()}`);
  }

  const zip = new AdmZip(file);
  const entry = zip.getEntry('word/document.xml');
  if (!entry) throw new Error(`${templateKey}.docx is not a valid Word document`);

  let xml = zip.readAsText(entry);

  for (const [key, placeholder] of Object.entries(PLACEHOLDERS)) {
    const value = escapeXml(fields[key as keyof MopFields] ?? '');
    xml = xml.split(placeholder).join(value);
  }

  const leftover = xml.match(/\{\{[A-Z_]+\}\}/g);
  if (leftover) {
    throw new Error(
      `Template "${templateKey}" has unfilled placeholders: ${[...new Set(leftover)].join(', ')}`,
    );
  }

  zip.updateFile(entry, Buffer.from(xml, 'utf8'));
  return zip.toBuffer();
}

/** File-safe stem, e.g. TAWAL_MOP_TCN_ZMS009_SIM-Swap */
export function mopFileStem(siteId: string, mobName: string): string {
  const clean = (v: string) => String(v).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return `TAWAL_MOP_TCN_${clean(siteId)}_${clean(mobName)}`.slice(0, 120);
}
