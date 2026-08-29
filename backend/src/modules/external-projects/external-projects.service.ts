import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Projects come from the Tawal-side tracker, not from this database.
 *
 * Two rules decide which projects are offered where:
 *   Create GCL  →  closeout.patTcn.status  === 'Approved'
 *   Upload GCL  →  closeout.patStatus.status === 'Approved'
 *
 * The upstream service is outside our control, so a failure must never take a
 * screen down: the caller gets `available: false` and the UI shows N/A rather
 * than an error page.
 */

export type GclStage = 'create' | 'upload';

export interface ExternalProject {
  id: string;
  siteId: string;
  tawalId: string | null;
  title: string;
  description: string | null;
  category: string | null;
  status: string | null;
  priority: string | null;
  teamLead: string | null;
  region: string | null;
  city: string | null;
  startDate: string | null;
  endDate: string | null;
  patTcnStatus: string | null;
  patStatus: string | null;
  woNumber: string | null;
  tcnNumber: string | null;
}

export interface ExternalProjectsResult {
  available: boolean;
  items: ExternalProject[];
  total: number;
  /** Present when the upstream call failed — shown as a hint, not an error. */
  message?: string;
  fetchedAt: string;
}

/** Anything absent upstream is reported as N/A rather than an empty cell. */
const NA = 'N/A';
const text = (v: unknown): string | null => {
  const s = String(v ?? '').trim();
  return s.length ? s : null;
};

interface CacheEntry {
  at: number;
  payload: any;
}

@Injectable()
export class ExternalProjectsService {
  private readonly logger = new Logger(ExternalProjectsService.name);
  private cache: CacheEntry | null = null;

  /** Short TTL: the UI polls every 45s, so this mainly stops several components
   *  on one page from each hitting the third-party service. */
  private readonly ttlMs = 20_000;

  constructor(private readonly config: ConfigService) {}

  private get url(): string {
    return (
      this.config.get<string>('externalProjects.url') ||
      'http://147.79.114.76:5003/api/projects/public/projects'
    );
  }

  private async fetchRaw(): Promise<any> {
    if (this.cache && Date.now() - this.cache.at < this.ttlMs) {
      return this.cache.payload;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);

    try {
      const res = await fetch(this.url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`upstream returned ${res.status}`);

      const payload = await res.json();
      this.cache = { at: Date.now(), payload };
      return payload;
    } finally {
      clearTimeout(timeout);
    }
  }

  private map(row: any): ExternalProject {
    const closeout = row?.closeout ?? {};
    const mapping = row?.mapping ?? {};
    const installation = row?.installation ?? {};

    return {
      id: text(row?._id) ?? text(row?.siteId) ?? crypto.randomUUID(),
      siteId: text(row?.siteId) ?? NA,
      tawalId: text(row?.tawalId),
      title: text(row?.title) ?? text(row?.siteId) ?? NA,
      description: text(row?.description),
      category: text(row?.category),
      status: text(row?.status),
      priority: text(row?.priority),
      teamLead: text(row?.teamLead),
      region: text(row?.region),
      city: text(row?.city),
      startDate: text(row?.startDate),
      endDate: text(row?.endDate),
      patTcnStatus: text(closeout?.patTcn?.status),
      patStatus: text(closeout?.patStatus?.status),
      woNumber: text(mapping?.woIssuance?.woNumber),
      tcnNumber: text(installation?.tcnRequest?.tcnNumber),
    };
  }

  /** Projects eligible for the given stage. */
  async list(stage?: GclStage): Promise<ExternalProjectsResult> {
    const fetchedAt = new Date().toISOString();

    let payload: any;
    try {
      payload = await this.fetchRaw();
    } catch (e: any) {
      const message =
        e?.name === 'AbortError'
          ? 'The projects service did not respond in time.'
          : `Could not reach the projects service (${e.message}).`;
      this.logger.warn(`External projects unavailable: ${message}`);
      return { available: false, items: [], total: 0, message, fetchedAt };
    }

    const rows: any[] = Array.isArray(payload?.data) ? payload.data : [];
    let items = rows.map((r) => this.map(r));

    if (stage === 'create') {
      items = items.filter((p) => p.patTcnStatus?.toLowerCase() === 'approved');
    } else if (stage === 'upload') {
      items = items.filter((p) => p.patStatus?.toLowerCase() === 'approved');
    }

    items.sort((a, b) => a.siteId.localeCompare(b.siteId));

    return {
      available: true,
      items,
      total: Number(payload?.meta?.total ?? rows.length),
      fetchedAt,
    };
  }

  /** Used when a GCL is saved, to snapshot what the tracker said at the time. */
  async findBySiteId(siteId: string): Promise<ExternalProject | null> {
    const { items } = await this.list();
    return items.find((p) => p.siteId.toUpperCase() === siteId.toUpperCase()) ?? null;
  }

  /** Forces the next call to re-fetch — used by the refresh button. */
  invalidate() {
    this.cache = null;
  }
}
