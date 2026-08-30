import { AlertTriangle, Building2, Check, Paperclip, RefreshCw, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { cn } from '../lib/cn';
import { api } from '../lib/api';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { Input } from './ui/Field';
import { Skeleton } from './ui/Feedback';
import type { ExternalProject, ExternalProjectsResult } from '../lib/types';

/** Missing upstream values are shown as N/A rather than blank cells. */
const na = (v: string | null | undefined) => (v && v.trim() ? v : 'N/A');

/**
 * Projects come from the Tawal-side tracker, filtered by stage:
 *   create → PAT TCN approved
 *   upload → PAT approved
 *
 * If the service is unreachable the picker says so and lets you carry on
 * without a project, rather than blocking the whole screen.
 */
export default function ExternalProjectPicker({
  stage,
  value,
  onChange,
  fill = false,
}: {
  stage: 'create';
  value: string | null;
  onChange: (siteId: string | null, project: ExternalProject | null) => void;
  /** Inside a dialog the parent scrolls, so don't add a second scroll box. */
  fill?: boolean;
}) {
  const [data, setData] = useState<ExternalProjectsResult | null>(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [syncedAt, setSyncedAt] = useState<Date | null>(null);

  const load = useCallback(
    (silent = false) =>
      api
        .get<ExternalProjectsResult>(`/external-projects?stage=${stage}`)
        .then((r) => {
          setData(r);
          setSyncedAt(new Date());
        })
        .catch((e) => {
          // A failed poll shouldn't blank a list that is already on screen.
          if (!silent) {
            setData({ available: false, items: [], total: 0, message: e.message, fetchedAt: '' });
          }
        }),
    [stage],
  );

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  /**
   * Poll rather than making people press Refresh. The tracker is edited by
   * another team, so a project can become eligible while this screen is open.
   * Polling pauses while the tab is hidden so a backgrounded tab isn't hammering
   * a third-party service.
   */
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') load(true);
    };
    const id = setInterval(tick, 45_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [load]);

  const filtered = useMemo(() => {
    const items = data?.items ?? [];
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((p) =>
      [p.siteId, p.title, p.category, p.tawalId, p.teamLead]
        .filter(Boolean)
        .some((f) => String(f).toLowerCase().includes(q)),
    );
  }, [data, search]);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.08em] text-fg-subtle">
          <Building2 size={13} />
          Project
        </span>

        <div className="flex items-center gap-2">
          {data && !data.available && (
            <Badge tone="warn">
              <AlertTriangle size={11} /> Tracker unavailable
            </Badge>
          )}
          {syncedAt && (
            <span className="text-[11px] text-fg-subtle">
              synced {syncedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            loading={busy}
            title="Refresh now — the list also updates by itself every 45 seconds"
            onClick={async () => {
              setBusy(true);
              await api.send('/external-projects/refresh', 'POST').catch(() => undefined);
              await load();
              setBusy(false);
            }}
          >
            <RefreshCw size={13} />
          </Button>
        </div>
      </div>

      {/* unavailable — say so plainly, don't block */}
      {data && !data.available && (
        <div className="rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">
          <p className="font-medium">Project list is showing N/A</p>
          <p className="mt-0.5 text-xs leading-relaxed">
            {data.message ?? 'The projects service could not be reached.'} You can continue
            without selecting one, and attach it later.
          </p>
        </div>
      )}

      {!data && <Skeleton className="h-28 w-full" />}

      {data?.available && (
        <>
          <div className="relative mb-2">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
            <Input
              className="pl-9"
              placeholder="Search site ID, title or category"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {filtered.length === 0 ? (
            <p className="rounded-xl border border-line bg-card/50 px-4 py-6 text-center text-sm text-fg-subtle">
              {data.items.length === 0
                ? 'No projects are ready for a GCL — that needs an issued WO, an open WO request, and a scope sheet attached to it.'
                : 'No projects match that search.'}
            </p>
          ) : (
            <div className={fill ? 'space-y-2' : 'max-h-72 space-y-2 overflow-y-auto pr-1'}>
              {filtered.map((p) => {
                const active = value === p.siteId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onChange(active ? null : p.siteId, active ? null : p)}
                    className={cn(
                      'relative w-full rounded-xl border px-4 py-3 text-left transition-all',
                      active
                        ? 'border-cyan-brand bg-cyan-brand/10 ring-1 ring-cyan-brand'
                        : 'border-line bg-card/60 hover:border-fg-subtle/40 hover:bg-card',
                    )}
                  >
                    {active && (
                      <span className="absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full bg-brand-gradient text-white">
                        <Check size={12} />
                      </span>
                    )}

                    <div className="flex flex-wrap items-baseline gap-x-2 pr-7">
                      <span className="font-mono text-sm font-semibold text-fg">{p.siteId}</span>
                      <span className="truncate text-sm text-fg-muted">{na(p.title)}</span>
                    </div>

                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-fg-subtle">
                      <span>WO {na(p.woNumber)}</span>
                      <span>{na(p.category)}</span>
                      <span>Lead {na(p.teamLead)}</span>
                    </div>

                    {p.scopeFileName && (
                      <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-cyan-brand">
                        <Paperclip size={11} />
                        <span className="truncate">{p.scopeFileName}</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          <p className="mt-2 text-[11px] text-fg-subtle">
            WO issued, request still open, scope sheet attached.{' '}
            {filtered.length} of {data.items.length} shown.
          </p>
        </>
      )}
    </div>
  );
}
