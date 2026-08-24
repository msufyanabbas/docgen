import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';
import type { Browser } from 'puppeteer';

/**
 * Renders Handlebars -> HTML -> A4 PDF through a single long-lived Chromium.
 *
 * Launching Chromium costs ~300ms, so the browser is kept warm and only the page
 * is per-request. Templates are compiled once and cached (recompiled on every call
 * in development so you can edit a .hbs without restarting).
 */
@Injectable()
export class PdfRenderer implements OnModuleDestroy {
  private readonly logger = new Logger(PdfRenderer.name);
  private browser: Browser | null = null;
  private launching: Promise<Browser> | null = null;
  private readonly cache = new Map<string, HandlebarsTemplateDelegate>();
  private readonly isDev = process.env.NODE_ENV !== 'production';

  constructor(private readonly config: ConfigService) {
    registerHelpers();
  }

  private templateDir() {
    // Works from both src (ts-node) and dist (compiled).
    return path.join(__dirname, '..', 'templates');
  }

  private compile(name: string): HandlebarsTemplateDelegate {
    if (!this.isDev && this.cache.has(name)) return this.cache.get(name)!;
    const file = path.join(this.templateDir(), `${name}.hbs`);
    if (!fs.existsSync(file)) throw new Error(`Template not found: ${file}`);
    const tpl = Handlebars.compile(fs.readFileSync(file, 'utf8'), { noEscape: false });
    this.cache.set(name, tpl);
    return tpl;
  }

  private async getBrowser(): Promise<Browser> {
    if (this.browser?.connected) return this.browser;
    if (this.launching) return this.launching;

    this.launching = (async () => {
      // require, not import(): the Nest build is CommonJS and TS would rewrite a
      // dynamic import into a require anyway — this keeps the typing honest.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const puppeteer = require('puppeteer');
      const browser: Browser = await puppeteer.launch({
        headless: true,
        executablePath: this.config.get<string>('puppeteerExecutablePath') || undefined,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--font-render-hinting=none',
        ],
      });
      this.browser = browser;
      this.launching = null;
      this.logger.log('Chromium ready');
      return browser;
    })();

    return this.launching;
  }

  async render(templateName: string, data: Record<string, any>): Promise<Buffer> {
    const html = this.compile(templateName)(data);
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      // Puppeteer 24 restricts setContent to 'load' | 'domcontentloaded'.
      // Every asset (logos, fonts) is inlined, so 'load' is already the final state.
      await page.setContent(html, { waitUntil: 'load' });
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
      });
      return Buffer.from(pdf);
    } finally {
      await page.close();
    }
  }

  async onModuleDestroy() {
    await this.browser?.close().catch(() => undefined);
  }
}

/* -------------------------------------------------------------- helpers */

let registered = false;

export function registerHelpers() {
  if (registered) return;
  registered = true;

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /** 13-Aug-26 — the format Tawal uses in the Work Order table. */
  Handlebars.registerHelper('shortDate', (v: any) => {
    if (!v) return '';
    const d = new Date(v);
    if (isNaN(d.getTime())) return '';
    return `${d.getUTCDate()}-${MONTHS[d.getUTCMonth()]}-${String(d.getUTCFullYear()).slice(2)}`;
  });

  /** 16/08/2026 — the format the PAC signature block uses. */
  Handlebars.registerHelper('slashDate', (v: any) => {
    if (!v) return '';
    const d = new Date(v);
    if (isNaN(d.getTime())) return '';
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
  });

  /** 11,216.00 — and a bare dash for zero, matching the Discount row. */
  Handlebars.registerHelper('money', (v: any, opts: any) => {
    const n = Number(v ?? 0);
    if (!n && opts?.hash?.dashOnZero !== false) return '-';
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  });

  Handlebars.registerHelper('qty', (v: any) => Number(v ?? 0).toFixed(2));

  /** Emits `count - items.length` empty <tr> so the grid keeps its fixed height. */
  Handlebars.registerHelper('padRows', function (this: any, items: any[], count: number, opts: any) {
    const start = (items?.length ?? 0) + 1;
    let out = '';
    for (let i = start; i <= count; i++) out += opts.fn({ index: i });
    return out;
  });

  Handlebars.registerHelper('add', (a: number, b: number) => Number(a) + Number(b));
  Handlebars.registerHelper('or', (a: any, b: any) => a || b || '');
}
