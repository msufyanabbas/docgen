import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface TagsEntry {
  id: string;
  siteName: string;
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
  /** Entries keyed by the site identifier the service reports. */
  private cache: { at: number; bySite: Map<string, Map<string, string[]>> } | null = null;

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
   * Loads the service's entries, keyed by site name.
   *
   * A site appears under several records — ZRU104, ZMK551R11 and ZRY904 each
   * have more than one, often with tags recorded against different item codes.
   * So entries sharing a name are merged rather than the last one winning,
   * which would drop tags depending on response order.
   *
   * The record id is indexed too, as a fallback for a caller that only has it.
   */
  private async load(): Promise<Map<string, Map<string, string[]>>> {
    if (this.cache && Date.now() - this.cache.at < this.TTL_MS) return this.cache.bySite;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);

    try {
      const res = await fetch(this.url, { signal: controller.signal });
      if (!res.ok) throw new Error(`the tag service returned ${res.status}`);

      const payload = (await res.json()) as TagsEntry[];
      const bySite = new Map<string, Map<string, string[]>>();

      const merge = (key: string, code: string, tags: string[]) => {
        if (!key) return;
        const forSite = bySite.get(key) ?? new Map<string, string[]>();
        const bucket = forSite.get(code) ?? [];
        for (const tag of tags) if (!bucket.includes(tag)) bucket.push(tag);
        if (bucket.length) forSite.set(code, bucket);
        bySite.set(key, forSite);
      };

      for (const entry of Array.isArray(payload) ? payload : []) {
        const name = String(entry?.siteName ?? '').trim().toLowerCase();
        const id = String(entry?.id ?? '').trim().toLowerCase();

        // Register the site even with no tags, so "known but untagged" stays
        // distinguishable from "never heard of".
        if (name && !bySite.has(name)) bySite.set(name, new Map());
        if (id && !bySite.has(id)) bySite.set(id, new Map());

        for (const [rawCode, rawTags] of Object.entries(entry?.tagsByItemCode ?? {})) {
          const cleaned: string[] = [];
          for (const raw of rawTags ?? []) {
            const tag = String(raw ?? '').trim();
            // "0", "00", "No tag" and the odd "N9 tag" are what the other
            // system stores for an untagged unit. Printing them on a BOQ is
            // worse than a gap.
            if (!tag || /^0+$/.test(tag) || /^n[o9]\s*tag$/i.test(tag)) continue;
            if (!cleaned.includes(tag)) cleaned.push(tag);
          }
          if (!cleaned.length) continue;

          const code = SiteTagsService.normaliseCode(rawCode);
          merge(name, code, cleaned);
          merge(id, code, cleaned);
        }
      }

      this.cache = { at: Date.now(), bySite };
      this.logger.log(`Loaded tags for ${bySite.size} site key(s)`);
      return bySite;
    } catch (e: any) {
      const reason = e?.name === 'AbortError' ? 'the request timed out' : e.message;
      // Tags enrich the BOQ; they are not a prerequisite. A package still
      // builds with the column blank rather than failing the batch.
      this.logger.warn(`Tags unavailable — ${reason}`);
      return this.cache?.bySite ?? new Map();
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Forces the next call to re-fetch. */
  invalidate() {
    this.cache = null;
  }

  /**
   * Tags for one site, keyed by normalised item code.
   *
   * Matching is on the site name the tag service reports. Several candidates
   * are passed because the tracker's site ID, the site number printed on the
   * GCL and the project title are not always the same string.
   */
  async forSite(...candidates: (string | null | undefined)[]): Promise<Map<string, string[]>> {
    const bySite = await this.load();

    for (const candidate of candidates) {
      const key = String(candidate ?? '').trim().toLowerCase();
      if (key && bySite.has(key)) return bySite.get(key)!;
    }

    const tried = [...new Set(candidates.filter(Boolean).map(String))].join(', ') || '(none)';
    /*
     * Say what the service actually holds, not just what we asked for. The
     * identifier the tag service keys on has to be read off its own data —
     * a bare "no match" leaves nothing to act on.
     */
    const sample = [...bySite.keys()].slice(0, 5).join(', ');
    this.logger.warn(
      `No tag entry for: ${tried}. ` +
        `The service returned ${bySite.size} site(s), keyed like: ${sample || '(none)'}`,
    );
    return new Map();
  }

  /**
   * Every tag recorded against an item code for that site, comma separated.
   * Null when there are none, so the caller falls back to its own placeholder.
   */
  static tagFor(index: Map<string, string[]>, itemCode: string): string | null {
    const found = index.get(SiteTagsService.normaliseCode(itemCode));
    return found?.length ? found.join(', ') : null;
  }
}
