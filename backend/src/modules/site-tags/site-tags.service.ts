import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface TagsEntry {
  id: string;
  tagsByItemCode: Record<string, string[]>;
}

/**
 * TAG numbers, which live in the site system rather than on the GCL.
 *
 * The GCL carries serial numbers but not asset tags, so the BOQ's TAG column
 * was always blank. This pulls them per site and matches them to lines by item
 * code.
 */
@Injectable()
export class SiteTagsService {
  private readonly logger = new Logger(SiteTagsService.name);
  private readonly url: string;
  /** Every tag in the service, pooled by item code. */
  private cache: { at: number; byItemCode: Map<string, string[]> } | null = null;

  /** Short, because tags are edited in the other system while work is ongoing. */
  private readonly TTL_MS = 60_000;

  constructor(private readonly config: ConfigService) {
    this.url = this.config.get<string>(
      'SITE_TAGS_URL',
      'https://tawal-site.smart-life.sa/api/sites/tags',
    );
  }

  /**
   * Item codes differ between the two systems: the GCL prints
   * `SMART-TWR-023`, the tag service returns `Smart-TWR-0023`. Case and the
   * zero-padding of the numeric suffix are both unreliable, so both sides are
   * reduced to a canonical form before matching.
   */
  static normaliseCode(code: string): string {
    const trimmed = String(code ?? '').trim();
    const m = trimmed.match(/^(.*?)-0*(\d+)$/);
    return m ? `${m[1].toUpperCase()}-${Number(m[2])}` : trimmed.toUpperCase();
  }

  /**
   * Pools every entry into one item-code index.
   *
   * The site id in the response keys the tag service's own records, which do
   * not correspond to the tracker's projects, so it is not used for matching.
   * Tags are collected across all sites and applied wherever the item code
   * appears.
   */
  private async load(): Promise<Map<string, string[]>> {
    if (this.cache && Date.now() - this.cache.at < this.TTL_MS) return this.cache.byItemCode;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);

    try {
      const res = await fetch(this.url, { signal: controller.signal });
      if (!res.ok) throw new Error(`the tag service returned ${res.status}`);

      const payload = (await res.json()) as TagsEntry[];
      const byItemCode = new Map<string, string[]>();

      for (const entry of Array.isArray(payload) ? payload : []) {
        for (const [code, tags] of Object.entries(entry?.tagsByItemCode ?? {})) {
          const key = SiteTagsService.normaliseCode(code);
          const bucket = byItemCode.get(key) ?? [];

          for (const raw of tags ?? []) {
            const tag = String(raw ?? '').trim();
            // "0", "00", "No tag" are what the other system stores for an
            // untagged unit. Printing them on a BOQ is worse than a gap.
            if (!tag || /^0+$/.test(tag) || /^no\s*tag$/i.test(tag)) continue;
            // The same asset can be listed under several sites.
            if (!bucket.includes(tag)) bucket.push(tag);
          }

          if (bucket.length) byItemCode.set(key, bucket);
        }
      }

      this.cache = { at: Date.now(), byItemCode };
      this.logger.log(
        `Loaded tags for ${byItemCode.size} item code(s), ` +
          `${[...byItemCode.values()].reduce((a, b) => a + b.length, 0)} tag(s) total`,
      );
      return byItemCode;
    } catch (e: any) {
      const reason = e?.name === 'AbortError' ? 'the request timed out' : e.message;
      // Tags enrich the BOQ; they are not a prerequisite. A package still
      // builds with the column blank rather than failing the batch.
      this.logger.warn(`Tags unavailable — ${reason}`);
      return this.cache?.byItemCode ?? new Map();
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Forces the next call to re-fetch. */
  invalidate() {
    this.cache = null;
  }

  /** The pooled index, for a caller that will look up several codes. */
  async index(): Promise<Map<string, string[]>> {
    return this.load();
  }

  /**
   * Every tag recorded against an item code, comma separated.
   *
   * Returns null when there are none, so the caller can fall back to whatever
   * it shows for an untagged line.
   */
  static tagFor(index: Map<string, string[]>, itemCode: string): string | null {
    const found = index.get(SiteTagsService.normaliseCode(itemCode));
    return found?.length ? found.join(', ') : null;
  }
}
