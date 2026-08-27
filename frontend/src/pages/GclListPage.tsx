import { ChevronDown, Building2, FileSignature, FileUp, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ProjectSelectDialog from '../components/ProjectSelectDialog';
import { Alert, Empty, Spinner } from '../components/ui/Feedback';
import { Badge, StatusBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Field';
import { api, money, shortDate } from '../lib/api';
import type { ExternalProject, Package, Paged } from '../lib/types';

const na = (v: string | null | undefined) => (v && v.trim() ? v : 'N/A');

/**
 * Every GCL package, grouped by the tracker project it was raised against —
 * the same shape as the MOP library, so the two read alike.
 *
 * Creating or uploading opens a dialog that asks for the project first, because
 * a GCL with no project cannot be reconciled later.
 */
export default function GclListPage() {
  const nav = useNavigate();
  const [packages, setPackages] = useState<Package[] | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [dialog, setDialog] = useState<'create' | 'upload' | null>(null);

  const load = useCallback(() => {
    const q = new URLSearchParams({ limit: '200' });
    if (search) q.set('search', search);
    api
      .get<Paged<Package>>(`/packages?${q}`)
      .then((r) => setPackages(r.items))
      .catch((e) => setError(e.message));
  }, [search]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const grouped = useMemo(() => {
    const map = new Map<string, { title: string; siteId: string; items: Package[] }>();
    for (const p of packages ?? []) {
      const key = p.externalSiteId ?? '__none__';
      if (!map.has(key)) {
        map.set(key, {
          siteId: p.externalSiteId ?? 'No project',
          title: p.externalProjectTitle ?? (p.externalSiteId ? '' : 'Raised before projects were required'),
          items: [],
        });
      }
      map.get(key)!.items.push(p);
    }
    return [...map.entries()].sort((a, b) => b[1].items.length - a[1].items.length);
  }, [packages]);

  function start(project: ExternalProject) {
    const stage = dialog;
    setDialog(null);
    nav(`/gcl/${stage}?project=${encodeURIComponent(project.siteId)}`);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight gradient-text animate-gradient-pan">GCL</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Handing Over GCLs and the documents built from them, grouped by project.
          </p>
        </div>

        <div className="flex flex-wrap gap-2" data-tour="gcl-actions">
          <Button variant="outline" onClick={() => setDialog('upload')}>
            <FileUp size={15} /> Upload GCL
          </Button>
          <Button variant="gradient" onClick={() => setDialog('create')}>
            <FileSignature size={15} /> Create GCL
          </Button>
        </div>
      </div>

      {error && <Alert kind="error">{error}</Alert>}

      <div className="relative max-w-md">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
        <Input
          className="pl-9"
          placeholder="Site, WO or PO number"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {!packages && <Spinner label="Loading GCLs…" />}

      {packages && packages.length === 0 && (
        <Empty icon={<FileSignature size={22} />}>
          No GCLs yet. Use <b>Create GCL</b> to build one from a scope sheet, or{' '}
          <b>Upload GCL</b> if you already have a signed one.
        </Empty>
      )}

      {grouped.map(([key, group]) => {
        const isCollapsed = collapsed[key];
        const total = group.items.reduce((a, p) => a + Number(p.netAmount ?? 0), 0);

        return (
          <Card key={key}>
            <button
              onClick={() => setCollapsed((c) => ({ ...c, [key]: !c[key] }))}
              className="flex w-full items-center gap-3 px-4 py-4 text-left sm:px-5"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-gradient text-white">
                <Building2 size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-fg">
                  {group.siteId}
                </span>
                <span className="block truncate text-[11px] text-fg-subtle">{na(group.title)}</span>
              </span>
              <span className="hidden text-right sm:block">
                <span className="block text-sm font-semibold text-fg">{money(total)}</span>
                <span className="block text-[11px] text-fg-subtle">across {group.items.length}</span>
              </span>
              <Badge tone="neutral">{group.items.length}</Badge>
              <ChevronDown
                size={16}
                className={`shrink-0 text-fg-subtle transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
              />
            </button>

            {!isCollapsed && (
              <div className="-mx-px overflow-x-auto border-t border-line/60">
                <table className="w-full min-w-[720px]">
                  <thead>
                    <tr>
                      <th className="th">Site</th>
                      <th className="th">WO Number</th>
                      <th className="th">PO #</th>
                      <th className="th">Priced on</th>
                      <th className="th text-right">Lines</th>
                      <th className="th text-right">Net</th>
                      <th className="th">Status</th>
                      <th className="th">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map((p) => (
                      <tr key={p.id} className="row-hover">
                        <td className="td">
                          <Link
                            to={`/packages/${p.id}`}
                            className="font-mono text-sm font-semibold text-fg hover:text-cyan-brand"
                          >
                            {p.siteNo}
                          </Link>
                        </td>
                        <td className="td max-w-xs truncate font-mono text-xs text-fg-subtle" title={p.woNumber}>
                          {p.woNumber}
                        </td>
                        <td className="td text-xs">{na(p.poNumber)}</td>
                        <td className="td text-xs">
                          {p.quantityFieldLabel ?? (p.quantitySource === 'AS_BUILT' ? 'As-Built' : 'Design')}
                        </td>
                        <td className="td text-right tabular-nums">
                          {p._count?.lines ?? p.lines?.length ?? 0}
                        </td>
                        <td className="td text-right font-semibold">{money(p.netAmount, p.currency)}</td>
                        <td className="td"><StatusBadge status={p.status} /></td>
                        <td className="td text-xs text-fg-subtle">{shortDate(p.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        );
      })}

      <ProjectSelectDialog
        open={dialog !== null}
        stage={dialog ?? 'create'}
        onClose={() => setDialog(null)}
        onConfirm={start}
      />
    </div>
  );
}
