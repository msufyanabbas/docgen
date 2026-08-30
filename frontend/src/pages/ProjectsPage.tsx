import { AlertTriangle, Building2, FileSignature, Paperclip, RefreshCw, ScrollText, Search } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Empty, Spinner } from '../components/ui/Feedback';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Field';
import { api } from '../lib/api';
import type { ProjectsResult } from '../lib/types';

const na = (v: string | null | undefined) => (v && v.trim() ? v : 'N/A');

/**
 * Projects come from the Tawal tracker and are read-only here. What the
 * platform adds is the join: which project category each falls into, and
 * therefore which MOP formats it can produce.
 */
export default function ProjectsPage() {
  const [data, setData] = useState<ProjectsResult | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      api
        .get<ProjectsResult>('/projects')
        .then(setData)
        .catch((e) => setError((e as Error).message)),
    [],
  );

  useEffect(() => {
    load();
  }, [load]);

  // The tracker is edited elsewhere, so keep the list current without asking.
  useEffect(() => {
    const tick = () => document.visibilityState === 'visible' && load();
    const id = setInterval(tick, 45_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [load]);

  if (!data && !error) return <Spinner label="Loading projects from the tracker…" />;

  const items = (data?.items ?? []).filter((p) =>
    !search.trim()
      ? true
      : [p.siteId, p.title, p.category, p.tawalId, p.teamLead]
          .filter(Boolean)
          .some((f) => String(f).toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight gradient-text animate-gradient-pan">Projects</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Live from the Tawal tracker. Their category decides which MOP formats they can produce.
          </p>
        </div>

        <Button
          variant="outline"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            await api.send('/external-projects/refresh', 'POST').catch(() => undefined);
            await load();
            setBusy(false);
          }}
        >
          <RefreshCw size={15} /> Refresh
        </Button>
      </div>

      {error && <Alert kind="error">{error}</Alert>}

      {data && !data.available && (
        <Alert kind="warn" title="The projects service could not be reached">
          {data.message ?? 'Nothing can be listed until it is back.'}
        </Alert>
      )}

      <div className="relative max-w-md">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
        <Input
          className="pl-9"
          placeholder="Site ID, title or category"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {items.length === 0 && data?.available && (
        <Empty icon={<Building2 size={22} />}>No projects match.</Empty>
      )}

      {items.length > 0 && (
        <Card className="-mx-px overflow-x-auto">
          <table className="w-full min-w-[860px]">
            <thead>
              <tr>
                <th className="th">Site ID</th>
                <th className="th">Project</th>
                <th className="th">Category</th>
                <th className="th">WO</th>
                <th className="th">GCL</th>
                <th className="th text-right">MOPs</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className="row-hover">
                  <td className="td font-mono text-xs font-semibold text-fg">{p.siteId}</td>
                  <td className="td">
                    <div className="font-medium text-fg">{na(p.title)}</div>
                    <div className="text-[11px] text-fg-subtle">
                      Tawal ID {na(p.tawalId)} · Lead {na(p.teamLead)}
                    </div>
                  </td>
                  <td className="td">
                    {p.projectCategory ? (
                      <span className="flex items-center gap-2 text-xs">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ background: p.projectCategory.colour ?? '#44489D' }}
                        />
                        <span className="truncate">{p.projectCategory.name}</span>
                        <Badge tone="neutral">
                          {p.projectCategory.templates?.length ?? 0} MOP
                        </Badge>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-xs text-amber-500">
                        <AlertTriangle size={12} /> {na(p.category)}
                      </span>
                    )}
                  </td>
                  <td className="td text-xs">
                    <div>{na(p.woNumber)}</div>
                    <div className="text-[11px] text-fg-subtle">
                      issue {na(p.woIssuanceStatus)} · req {na(p.woRequestStatus)}
                    </div>
                  </td>
                  <td className="td">
                    {p.readyForGcl ? (
                      <span className="flex items-center gap-1.5 text-[11px] text-cyan-brand">
                        <Paperclip size={11} />
                        <span className="max-w-[160px] truncate">{na(p.scopeFileName)}</span>
                      </span>
                    ) : (
                      <span className="text-[11px] text-fg-subtle">not ready</span>
                    )}
                  </td>
                  <td className="td text-right tabular-nums">{p.mopCount}</td>
                  <td className="td">
                    <div className="flex justify-end gap-1.5">
                      {p.readyForGcl && (
                        <Link to={`/gcl/create?project=${encodeURIComponent(p.siteId)}`}>
                          <Button variant="ghost" size="sm">
                            <FileSignature size={13} /> GCL
                          </Button>
                        </Link>
                      )}
                      <Link to={`/mop/new?project=${encodeURIComponent(p.siteId)}`}>
                        <Button variant="ghost" size="sm">
                          <ScrollText size={13} /> MOP
                        </Button>
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <p className="flex items-center gap-2 text-[11px] text-fg-subtle">
        <Building2 size={13} />
        Projects are owned by the Tawal tracker and can't be created or edited here. An amber
        category means no pairing exists for it yet — set one up under Project categories.
      </p>
    </div>
  );
}
