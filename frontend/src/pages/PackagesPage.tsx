import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Alert, Empty, Spinner } from '../components/ui/Feedback';
import { StatusBadge, Badge } from '../components/ui/Badge';
import { Card, CardHead } from '../components/ui/Card';
import { Input } from '../components/ui/Field';
import { api, money, shortDate } from '../lib/api';
import type { Package, Paged } from '../lib/types';

export default function PackagesPage() {
  const [data, setData] = useState<Paged<Package> | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      api
        .get<Paged<Package>>(`/packages?limit=50${search ? `&search=${encodeURIComponent(search)}` : ''}`)
        .then(setData)
        .catch((e) => setError(e.message));
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight gradient-text animate-gradient-pan">Packages</h1>
        <div className="relative w-72">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
          <input
            className="field pl-9"
            placeholder="Site, WO or PO number"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {error && <Alert kind="error">{error}</Alert>}
      {!data && !error && <Spinner label="Loading…" />}

      {data && data.items.length === 0 && (
        <Empty>
          No packages yet. <Link to="/upload" className="font-semibold text-fg-muted underline">Upload a GCL</Link> to create one.
        </Empty>
      )}

      {data && data.items.length > 0 && (
        <div className="surface overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Site</th>
                <th className="th">WO Number</th>
                <th className="th">PO #</th>
                <th className="th">Qty basis</th>
                <th className="th text-right">Lines</th>
                <th className="th text-right">Net</th>
                <th className="th">Status</th>
                <th className="th">Created</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((p) => (
                <tr key={p.id} className="hover:bg-canvas">
                  <td className="td">
                    <Link to={`/packages/${p.id}`} className="font-mono text-sm font-semibold text-fg-muted hover:underline">
                      {p.siteNo}
                    </Link>
                  </td>
                  <td className="td max-w-xs truncate font-mono text-xs text-fg-muted" title={p.woNumber}>{p.woNumber}</td>
                  <td className="td">{p.poNumber ?? '—'}</td>
                  <td className="td text-xs">
                    {p.quantityFieldLabel ?? (p.quantitySource === 'AS_BUILT' ? 'As-Built' : 'Design')}
                  </td>
                  <td className="td text-right">{p._count?.lines ?? p.lines?.length ?? 0}</td>
                  <td className="td text-right font-semibold">{money(p.netAmount, p.currency)}</td>
                  <td className="td"><StatusBadge status={p.status} /></td>
                  <td className="td text-xs text-fg-subtle">{shortDate(p.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
