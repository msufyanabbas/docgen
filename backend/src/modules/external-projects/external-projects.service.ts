import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
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

/**
 * create → the project has an approved WO issuance, a WO request still at
 *          "Requested", and a scope file attached. That combination is what
 *          says "the scope is agreed and here it is" — so the GCL can be built
 *          straight from the attachment.
 * upload  → PAT approved; a signed GCL is coming back in.
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

  woRequestStatus: string | null;
  woIssuanceStatus: string | null;
  /** Path to the scope workbook on the tracker, relative to its origin. */
  scopeFileUrl: string | null;
  scopeFileName: string | null;
  /** True when this project can have a GCL built from its attachment. */
  readyForGcl: boolean;
}

export interface ExternalProjectsResult {
  available: boolean;
  items: ExternalProject[];
  total: number;
  /** Left out because the tracker has no site ID for them. */
  skippedWithoutSiteId?: number;
  /** Present when the upstream call failed — shown as a hint, not an error. */
  message?: string;
  fetchedAt: string;
}

/**
 * A project is ready for a GCL when the WO has been issued and approved, the WO
 * request is still sitting at "Requested", and a scope file is attached — all
 * three, because without the attachment there is nothing to build from.
 */
/**
 * A site ID identifies the job on every document Tawal receives, so a project
 * without one cannot produce a usable GCL. Such projects are filtered out of
 * the list rather than surfaced and then rejected — being offered a choice that
 * fails on the next screen is worse than not being offered it.
 */
function hasSiteId(row: any): boolean {
  return Boolean(String(row?.siteId ?? '').trim());
}

function readyForGcl(mapping: any): boolean {
  const issuance = String(mapping?.woIssuance?.status ?? '').toLowerCase();
  const request = String(mapping?.woRequest?.status ?? '').toLowerCase();
  const file = String(mapping?.woRequest?.fileUrl ?? '').trim();
  return issuance === 'approved' && request === 'requested' && file.length > 0;
}

const eq = (v: unknown, expected: string) =>
  String(v ?? '').trim().toLowerCase() === expected;

/**
 * Ready for a GCL when the Work Order has been issued, the WO request is still
 * in "Requested", and a scope sheet is attached to that request — the file is
 * what the GCL is built from, so without it there is nothing to generate.
 */
function isGclReady(row: any): boolean {
  const wo = row?.mapping ?? {};
  return (
    eq(wo?.woIssuance?.status, 'approved') &&
    eq(wo?.woRequest?.status, 'requested') &&
    Boolean(String(wo?.woRequest?.fileUrl ?? '').trim())
  );
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

      woRequestStatus: text(mapping?.woRequest?.status),
      woIssuanceStatus: text(mapping?.woIssuance?.status),
      scopeFileUrl: text(mapping?.woRequest?.fileUrl),
      scopeFileName: text(mapping?.woRequest?.fileName),
      readyForGcl: readyForGcl(mapping),
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
    const withSiteId = rows.filter(hasSiteId);
    const skipped = rows.length - withSiteId.length;
    if (skipped) {
      this.logger.warn(`${skipped} tracker project(s) have no site ID and were left out.`);
    }

    let items = withSiteId.map((r) => this.map(r));

    if (stage === 'create') {
      items = items.filter((p) => p.readyForGcl);
    } else if (stage === 'upload') {
      items = items.filter((p) => p.patStatus?.toLowerCase() === 'approved');
    }

    items.sort((a, b) => a.siteId.localeCompare(b.siteId));

    return {
      available: true,
      items,
      total: Number(payload?.meta?.total ?? rows.length),
      /** Projects the tracker returned but which have no site ID. */
      skippedWithoutSiteId: skipped,
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

  /** Origin of the tracker, so a relative fileUrl can be resolved. */
  private get origin(): string {
    try {
      return new URL(this.url).origin;
    } catch {
      return '';
    }
  }

  /**
   * Pulls the scope workbook attached to the project's WO request.
   *
   * The tracker returns a path like "/uploads/UPL___reference-….xlsx", which is
   * resolved against the tracker's own host — the point is that nobody has to
   * re-upload a file that already exists upstream.
   */
  async fetchScopeFile(siteId: string): Promise<{ fileName: string; buffer: Buffer }> {
    const project = await this.findBySiteId(siteId);
    if (!project) {
      throw new NotFoundException(`Project "${siteId}" was not found in the tracker.`);
    }
    if (!project.scopeFileUrl) {
      throw new BadRequestException(
        `Project "${siteId}" has no scope file attached to its WO request.`,
      );
    }

    const href = /^https?:\/\//i.test(project.scopeFileUrl)
      ? project.scopeFileUrl
      : `${this.origin}${project.scopeFileUrl.startsWith('/') ? '' : '/'}${project.scopeFileUrl}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const res = await fetch(href, { signal: controller.signal });
      if (!res.ok) {
        throw new BadRequestException(
          `The tracker returned ${res.status} for the scope file of "${siteId}".`,
        );
      }

      const buffer = Buffer.from(await res.arrayBuffer());
      if (!buffer.length) {
        throw new BadRequestException(`The scope file for "${siteId}" is empty.`);
      }

      const fileName =
        project.scopeFileName ||
        decodeURIComponent(href.split('/').pop() || 'scope-sheet.xlsx');

      this.logger.log(
        `Fetched scope file for ${siteId}: ${fileName} (${(buffer.length / 1024).toFixed(0)} KB)`,
      );
      return { fileName, buffer };
    } catch (e: any) {
      if (e instanceof BadRequestException || e instanceof NotFoundException) throw e;
      const reason = e?.name === 'AbortError' ? 'the download timed out' : e.message;
      throw new BadRequestException(
        `Could not download the scope file for "${siteId}" — ${reason}.`,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
