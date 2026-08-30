import { motion } from 'framer-motion';
import {
  Activity, ArrowUpRight, FileSignature, FileStack, FolderKanban,
  Layers, ListOrdered, TrendingUp, Users2,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Skeleton } from '../components/ui/Feedback';
import { Badge } from '../components/ui/Badge';
import { Card, CardHead } from '../components/ui/Card';
import { api, money, shortDate } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { DashboardData } from '../lib/types';

export default function DashboardPage() {
  const { user, isAdmin } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<DashboardData>('/dashboard').then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <Alert kind="error">{error}</Alert>;

  return (
    <div className="space-y-6" data-tour="dashboard">
      <div>
        <h1 className="text-2xl font-bold tracking-tight gradient-text animate-gradient-pan">
          {greeting()}, {user?.name?.split(' ')[0]}
        </h1>
        <p className="mt-1 text-sm text-fg-muted">
          Where everything stands across MOPs, packages and projects.
        </p>
      </div>

      {/* --- headline numbers --- */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat
          label="MOP documents"
          value={data?.cards.mopTotal}
          sub={data ? `${data.cards.mopThisMonth} this month` : undefined}
          icon={<FileSignature size={16} />}
          to="/mop"
          delay={0}
        />
        <Stat
          label="GCL packages"
          value={data?.cards.packageTotal}
          sub={data ? money(data.cards.packageValue) : undefined}
          icon={<FileStack size={16} />}
          to="/packages"
          delay={0.05}
        />
        <Stat
          label="Project categories"
          value={data?.cards.projectTotal}
          sub={data ? `${data.byCategory.length} MOP categories in use` : undefined}
          icon={<FolderKanban size={16} />}
          to="/projects"
          delay={0.1}
        />
        <Stat
          label={isAdmin ? 'Active users' : 'Price list items'}
          value={isAdmin ? data?.cards.userTotal : data?.cards.uplItems}
          sub={isAdmin ? `${data?.cards.uplItems ?? 0} price list items` : 'UPL v1'}
          icon={isAdmin ? <Users2 size={16} /> : <ListOrdered size={16} />}
          to={isAdmin ? '/users' : '/upl'}
          delay={0.15}
        />
      </div>

      {/* --- activity over time --- */}
      <Card delay={0.1}>
        <CardHead
          title="Activity"
          hint="Documents produced over the last six months"
          icon={<TrendingUp size={15} />}
          actions={
            <div className="flex items-center gap-4 text-[11px]">
              <Legend colour="var(--legend-mop)" label="MOPs" />
              <Legend colour="var(--legend-pkg)" label="Packages" />
            </div>
          }
        />
        <div className="px-5 py-6">
          {!data ? <Skeleton className="h-40 w-full" /> : <MonthlyChart data={data.monthly} />}
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2 lg:gap-6">
        {/* --- per project --- */}
        <Card delay={0.15}>
          <CardHead title="MOPs by project" icon={<Layers size={15} />} />
          <div className="space-y-3 px-5 py-5">
            {!data && <Skeleton className="h-32 w-full" />}
            {data && data.byProject.length === 0 && (
              <p className="py-6 text-center text-sm text-fg-subtle">
                No MOPs yet. <Link to="/mop/new" className="font-medium text-cyan-brand">Create one</Link>.
              </p>
            )}
            {data?.byProject.map((p, i) => {
              const max = Math.max(...data.byProject.map((x) => x.count), 1);
              return (
                <div key={p.id}>
                  <div className="mb-1 flex items-baseline justify-between gap-3">
                    <Link
                      to={`/mop?project=${p.id}`}
                      className="truncate text-sm font-medium text-fg hover:text-cyan-brand"
                    >
                      {p.name}
                    </Link>
                    <span className="shrink-0 text-xs text-fg-subtle">
                      {p.category} · <span className="font-semibold text-fg">{p.count}</span>
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-line/60">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(p.count / max) * 100}%` }}
                      transition={{ duration: 0.7, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
                      className="h-full rounded-full"
                      style={{ background: p.colour }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* --- per MOP category + impact --- */}
        <Card delay={0.2}>
          <CardHead title="By MOP category" icon={<Activity size={15} />} />
          <div className="px-5 py-5">
            {!data && <Skeleton className="h-32 w-full" />}
            {data && data.byCategory.length === 0 && (
              <p className="py-6 text-center text-sm text-fg-subtle">Nothing generated yet.</p>
            )}
            {data && data.byCategory.length > 0 && (
              <>
                <Donut
                  slices={data.byCategory.map((c, i) => ({
                    label: c.name,
                    value: c.count,
                    colour: SLICE_COLOURS[i % SLICE_COLOURS.length],
                  }))}
                />

                <div className="mt-5 border-t border-line/60 pt-4">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
                    Site impact
                  </p>
                  <div className="flex gap-2">
                    {data.byImpact.map((i) => (
                      <Badge key={i.impact} tone={i.impact === 'YES' ? 'warn' : 'success'}>
                        {i.impact} · {i.count}
                      </Badge>
                    ))}
                    {data.byImpact.length === 0 && (
                      <span className="text-xs text-fg-subtle">—</span>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </Card>
      </div>

      {/* --- recent --- */}
      <div className="grid gap-5 lg:grid-cols-2 lg:gap-6">
        <Card delay={0.25}>
          <CardHead
            title="Recent MOPs"
            icon={<FileSignature size={15} />}
            actions={
              <Link to="/mop" className="text-xs font-medium text-cyan-brand hover:underline">
                View all
              </Link>
            }
          />
          <div className="divide-y divide-line/50">
            {!data && <div className="p-5"><Skeleton className="h-24 w-full" /></div>}
            {data?.recentMops.length === 0 && (
              <p className="px-5 py-8 text-center text-sm text-fg-subtle">Nothing yet.</p>
            )}
            {data?.recentMops.map((m) => (
              <div key={m.id} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-fg">
                    <span className="font-mono text-xs">{m.siteId}</span> · {m.tcnSummary}
                  </div>
                  <div className="text-[11px] text-fg-subtle">
                    {m.externalProjectTitle || m.externalSiteId} · {m.mopCategory?.name} ·{' '}
                    {m.createdBy?.name ?? '—'}
                  </div>
                </div>
                <span className="shrink-0 text-[11px] text-fg-subtle">{shortDate(m.createdAt)}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card delay={0.3}>
          <CardHead
            title="Recent packages"
            icon={<FileStack size={15} />}
            actions={
              <Link to="/packages" className="text-xs font-medium text-cyan-brand hover:underline">
                View all
              </Link>
            }
          />
          <div className="divide-y divide-line/50">
            {!data && <div className="p-5"><Skeleton className="h-24 w-full" /></div>}
            {data?.recentPackages.length === 0 && (
              <p className="px-5 py-8 text-center text-sm text-fg-subtle">Nothing yet.</p>
            )}
            {data?.recentPackages.map((p) => (
              <Link
                key={p.id}
                to={`/packages/${p.id}`}
                className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-cyan-brand/5"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-sm font-medium text-fg">{p.siteNo}</div>
                  <div className="truncate text-[11px] text-fg-subtle">{p.woNumber}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm font-semibold text-fg">{money(p.netAmount, p.currency)}</div>
                  <div className="text-[11px] text-fg-subtle">{shortDate(p.createdAt)}</div>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- pieces */

const SLICE_COLOURS = ['#01C2F3', '#C36BA9', '#44489D', '#F59042', '#1D174C'];

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function Stat({
  label, value, sub, icon, to, delay,
}: {
  label: string;
  value?: number;
  sub?: string;
  icon: ReactNode;
  to: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      <Link to={to} className="surface group block px-5 py-4 transition-all hover:-translate-y-0.5 hover:shadow-lift">
        <div className="flex items-start justify-between">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-gradient bg-[length:200%_auto] text-white shadow-soft animate-gradient-pan">
            {icon}
          </span>
          <ArrowUpRight
            size={15}
            className="text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100"
          />
        </div>
        <div className="mt-3 text-xl font-bold tabular-nums text-fg sm:text-2xl">
          {value === undefined ? <Skeleton className="h-7 w-16" /> : value.toLocaleString()}
        </div>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">{label}</div>
        {sub && <div className="mt-1 truncate text-[11px] text-fg-muted">{sub}</div>}
      </Link>
    </motion.div>
  );
}

const Legend = ({ colour, label }: { colour: string; label: string }) => (
  <span className="flex items-center gap-1.5 text-fg-subtle">
    <span className="h-2 w-2 rounded-full" style={{ background: colour }} />
    {label}
  </span>
);

/** Grouped bars, drawn as plain SVG — no chart library for two series. */
function MonthlyChart({ data }: { data: DashboardData['monthly'] }) {
  const max = Math.max(...data.flatMap((d) => [d.mops, d.packages]), 1);
  const H = 110;

  return (
    <div
      className="flex items-end gap-3"
      style={{ ['--legend-mop' as string]: '#01C2F3', ['--legend-pkg' as string]: '#C36BA9' }}
    >
      {data.map((m, i) => (
        <div key={m.key} className="flex flex-1 flex-col items-center gap-2">
          <div className="flex h-[110px] w-full items-end justify-center gap-1 sm:h-[150px]">
            {(['mops', 'packages'] as const).map((field, fi) => (
              <motion.div
                key={field}
                initial={{ height: 0 }}
                animate={{ height: Math.max((m[field] / max) * H, m[field] ? 4 : 2) }}
                transition={{ duration: 0.6, delay: i * 0.06 + fi * 0.03, ease: [0.22, 1, 0.36, 1] }}
                title={`${m.label}: ${m[field]} ${field}`}
                className="w-full max-w-[22px] rounded-t-md"
                style={{
                  background: fi === 0 ? '#01C2F3' : '#C36BA9',
                  opacity: m[field] ? 1 : 0.25,
                }}
              />
            ))}
          </div>
          <span className="text-[11px] text-fg-subtle">{m.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Donut via stroke-dasharray — cheaper than pulling in a charting dependency. */
function Donut({ slices }: { slices: { label: string; value: number; colour: string }[] }) {
  const total = slices.reduce((a, s) => a + s.value, 0) || 1;
  const R = 52;
  const C = 2 * Math.PI * R;
  let offset = 0;

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:gap-6">
      <svg viewBox="0 0 140 140" className="mx-auto h-[120px] w-[120px] shrink-0 -rotate-90 sm:mx-0 sm:h-[140px] sm:w-[140px]">
        <circle cx="70" cy="70" r={R} fill="none" strokeWidth="16" className="stroke-line/60" />
        {slices.map((s) => {
          const len = (s.value / total) * C;
          const el = (
            <motion.circle
              key={s.label}
              cx="70" cy="70" r={R}
              fill="none"
              stroke={s.colour}
              strokeWidth="16"
              strokeLinecap="butt"
              initial={{ strokeDasharray: `0 ${C}` }}
              animate={{ strokeDasharray: `${len} ${C - len}` }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              style={{ strokeDashoffset: -offset }}
            />
          );
          offset += len;
          return el;
        })}
      </svg>

      <div className="min-w-0 flex-1 space-y-2">
        {slices.map((s) => (
          <div key={s.label} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.colour }} />
            <span className="min-w-0 flex-1 truncate text-fg-muted">{s.label}</span>
            <span className="font-semibold tabular-nums text-fg">{s.value}</span>
            <span className="w-10 text-right text-[11px] text-fg-subtle">
              {Math.round((s.value / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
