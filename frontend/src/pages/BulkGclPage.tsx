import {
  AlertTriangle, ArrowLeft, ArrowRight, Building2, CheckCircle2, Download,
  FileStack, Layers, Search, XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Empty, Spinner } from '../components/ui/Feedback';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardHead } from '../components/ui/Card';
import { Checkbox, Field, Input, Select, Textarea } from '../components/ui/Field';
import { api, money } from '../lib/api';
import {
  ACCEPTANCE_LABEL, ACCEPTANCE_OUTCOME,
  type Acceptance, type BulkCommitResult, type BulkPreviewResult,
  type ExternalProjectsResult,
} from '../lib/types';

/**
 * Many signed GCLs across many projects, in one pass.
 *
 * Each file is matched to a project by the site number printed on it — with a
 * hundred files spanning a dozen projects, choosing per file would be unusable
 * and choosing once would be wrong. Selecting projects here just narrows what a
 * file is allowed to match, so a stray GCL can't attach to the wrong job.
 */
export default function BulkGclPage() {
  const [projects, setProjects] = useState<ExternalProjectsResult | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState('');

  const [preview, setPreview] = useState<BulkPreviewResult | null>(null);
  const [acceptance, setAcceptance] = useState<Record<string, Acceptance>>({});
  const [result, setResult] = useState<BulkCommitResult | null>(null);
  const [busy, setBusy] = useState<'read' | 'commit' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ serviceDate: '', startDate: '', notes: '' });
  const [replaceExisting, setReplaceExisting] = useState(false);

  useEffect(() => {
    api
      .get<ExternalProjectsResult>('/external-projects?stage=upload')
      .then(setProjects)
      .catch((e) => setError((e as Error).message));
  }, []);

  const visible = useMemo(() => {
    const items = projects?.items ?? [];
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((p) =>
      [p.siteId, p.title, p.category].filter(Boolean).some((f) => String(f).toLowerCase().includes(q)),
    );
  }, [projects, search]);

  const allSelected = visible.length > 0 && visible.every((p) => selected.includes(p.siteId));

  /** Fetches and reads each selected project's attached GCL. */
  async function read() {
    setPreview(null);
    setResult(null);
    setError(null);
    setBusy('read');
    try {
      const r = await api.send<BulkPreviewResult>('/gcl/bulk/preview', 'POST', {
        siteIds: selected,
      });
      setPreview(r);
      setAcceptance(
        Object.fromEntries(
          r.files.filter((f) => f.ok && f.acceptance).map((f) => [f.siteId, f.acceptance!]),
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function commit() {
    setBusy('commit');
    setError(null);
    try {
      const r = await api.send<BulkCommitResult>('/gcl/bulk/commit', 'POST', {
        siteIds: selected,
        acceptanceByProject: acceptance,
        onDuplicate: replaceExisting ? 'overwrite' : 'skip',
        ...(form.serviceDate ? { serviceDate: form.serviceDate } : {}),
        ...(form.startDate ? { startDate: form.startDate } : {}),
        ...(form.notes ? { notes: form.notes } : {}),
      });
      setResult(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const readable = preview?.files.filter((f) => f.ok) ?? [];
  const unconfirmed = readable.filter((f) => !acceptance[f.siteId]);

  const split = useMemo(() => {
    const out = { ACCEPTED: 0, ACCEPTED_WITH_OIL: 0, REJECTED: 0 } as Record<Acceptance, number>;
    readable.forEach((f) => {
      const a = acceptance[f.siteId];
      if (a) out[a]++;
    });
    return out;
  }, [readable, acceptance]);

  return (
    <div className="space-y-6">
      <Link to="/gcl" className="inline-flex items-center gap-1 text-xs text-fg-subtle hover:text-fg">
        <ArrowLeft size={13} /> All GCLs
      </Link>

      {error && <Alert kind="error" title="Something went wrong">{error}</Alert>}

      {result ? (
        <Card>
          <CardHead
            title={`Batch ${result.reference}`}
            hint={`${result.committed} site(s) committed`}
            icon={<Layers size={15} />}
            actions={
              <Button
                variant="gradient"
                onClick={() => api.download(`/gcl/bulk/${result.batchId}/zip`, 'batch.zip')}
              >
                <Download size={15} /> Download all (.zip)
              </Button>
            }
          />

          <div className="flex flex-wrap gap-2 px-4 py-4 sm:px-5">
            <Badge tone="success">{result.accepted} → FAC</Badge>
            <Badge tone="warn">{result.acceptedWithOil} → PAC</Badge>
            {result.rejected > 0 && <Badge tone="danger">{result.rejected} rejected</Badge>}
            {result.failed > 0 && <Badge tone="danger">{result.failed} failed</Badge>}
            {(result.skipped?.length ?? 0) > 0 && (
              <Badge tone="neutral">{result.skipped!.length} already processed</Badge>
            )}
          </div>

          <div className="border-t border-line/60 px-4 py-4 sm:px-5">
            <p className="label">Combined documents</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {result.documents.map((d) => (
                <Button
                  key={d.id}
                  variant="outline"
                  size="sm"
                  onClick={() => api.download(`/documents/${d.id}/download`, d.fileName)}
                >
                  <Download size={13} /> {d.type.replace(/_(PDF|XLSX)$/, '')}{' '}
                  <span className="text-fg-subtle">{d.type.endsWith('XLSX') ? 'xlsx' : 'pdf'}</span>
                </Button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-fg-subtle">
              One As-Built BOQ and one Work Order across every site; FAC for the sites accepted
              without oil, PAC for those with.
            </p>
          </div>

          {(result.skipped?.length ?? 0) > 0 && (
            <div className="border-t border-line/60 px-4 py-4 sm:px-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                Skipped — already processed
              </p>
              <p className="text-sm text-fg-muted">
                {result.skipped!.map((sk) => sk.siteId).join(', ')}
              </p>
              <p className="mt-1 text-[11px] text-fg-subtle">
                Tick “Replace existing packages” to rebuild these.
              </p>
            </div>
          )}

          {result.errors.length > 0 && (
            <div className="border-t border-line/60 px-4 py-4 sm:px-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                Files that failed
              </p>
              <ul className="space-y-1 text-sm text-fg-muted">
                {result.errors.map((e, i) => (
                  <li key={i}>
                    <span className="font-medium">{e.fileName}</span> — {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      ) : (
        <>
          {/* ---------- 1 · projects ---------- */}
          <Card>
            <CardHead
              title="1 · Projects"
              hint="What the uploaded GCLs may match against — leave all ticked to allow any"
              icon={<Building2 size={15} />}
              actions={
                <Badge tone={selected.length ? 'cyan' : 'neutral'}>
                  {selected.length || 'none'} selected
                </Badge>
              }
            />

            {!projects && <div className="px-5 py-6"><Spinner label="Loading projects…" /></div>}

            {projects && !projects.available && (
              <div className="px-4 py-4 sm:px-5">
                <Alert kind="warn" title="The projects service could not be reached">
                  {projects.message ?? 'Nothing can be matched until it is back.'}
                </Alert>
              </div>
            )}

            {projects?.available && (
              <div className="px-4 py-4 sm:px-5">
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <div className="relative min-w-[220px] flex-1">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
                    <Input
                      className="pl-9"
                      placeholder="Site ID, title or category"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setSelected(allSelected ? [] : visible.map((p) => p.siteId))
                    }
                  >
                    {allSelected ? 'Clear all' : `Select all (${visible.length})`}
                  </Button>
                </div>

                {visible.length === 0 ? (
                  <p className="py-6 text-center text-sm text-fg-subtle">No projects match.</p>
                ) : (
                  <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
                    {visible.map((p) => (
                      <label
                        key={p.siteId}
                        className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition hover:bg-line/40"
                      >
                        <Checkbox
                          checked={selected.includes(p.siteId)}
                          onChange={(on) =>
                            setSelected((cur) =>
                              on ? [...cur, p.siteId] : cur.filter((s) => s !== p.siteId),
                            )
                          }
                          label={<span className="sr-only">{p.siteId}</span>}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-mono text-xs font-semibold text-fg">
                            {p.siteId}
                          </span>
                          <span className="block truncate text-[11px] text-fg-subtle">
                            {p.title} · {p.category ?? 'N/A'}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* ---------- 2 · read ---------- */}
          <Card>
            <CardHead
              title="2 · Read the signed GCLs"
              hint="Each project's GCL is fetched from its PAT sign-off — nothing to upload"
              icon={<FileStack size={15} />}
            />
            <div className="flex flex-wrap items-center gap-3 px-4 py-5 sm:px-5">
              <span className="min-w-0 flex-1 text-xs text-fg-subtle">
                {selected.length === 0
                  ? 'Select at least one project above.'
                  : `${selected.length} project(s) selected — their GCLs will be read and priced.`}
              </span>
              <Button
                variant="gradient"
                onClick={read}
                disabled={selected.length === 0}
                loading={busy === 'read'}
              >
                Continue <ArrowRight size={15} />
              </Button>
            </div>
          </Card>

          {busy === 'read' && (
            <Spinner label={`Fetching and reading ${selected.length} GCL(s)…`} />
          )}

          {/* ---------- 3 · review ---------- */}
          {preview && (
            <>
              <Card>
                <CardHead
                  title="3 · Confirm acceptance"
                  hint="What was ticked decides the certificate — FAC without oil, PAC with"
                  icon={<CheckCircle2 size={15} />}
                  actions={
                    <div className="flex flex-wrap gap-2">
                      <Badge tone="neutral">{preview.readable} read</Badge>
                      {preview.failed > 0 && <Badge tone="danger">{preview.failed} failed</Badge>}
                      {preview.needsReview > 0 && (
                        <Badge tone="warn">{preview.needsReview} to check</Badge>
                      )}
                    </div>
                  }
                />

                {preview.needsReview > 0 && (
                  <div className="px-4 pt-4 sm:px-5">
                    <Alert kind="warn" title="Some sign-off boxes were hard to read">
                      The tick is a mark on a scanned form, not text. Rows marked <b>check</b> need
                      your eyes before committing.
                    </Alert>
                  </div>
                )}

                <div className="-mx-px overflow-x-auto">
                  <table className="w-full min-w-[900px]">
                    <thead>
                      <tr>
                        <th className="th">Project</th>
                        <th className="th">GCL</th>
                        <th className="th">Site</th>
                        <th className="th text-right">Lines</th>
                        <th className="th text-right">Value</th>
                        <th className="th w-52">Acceptance</th>
                        <th className="th w-20">Produces</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.files.map((f) => {
                        const chosen = acceptance[f.siteId];
                        return (
                          <tr key={f.siteId} className="row-hover">
                            <td className="td">
                              <div className="font-mono text-xs font-semibold text-fg">
                                {f.siteId}
                              </div>
                              <div className="truncate text-[11px] text-fg-subtle">
                                {f.projectTitle}
                              </div>
                              {!f.ok && (
                                <div className="flex items-center gap-1 text-[11px] text-rose-500">
                                  <XCircle size={11} /> {f.error}
                                </div>
                              )}
                              {f.ok && f.acceptanceConfidence !== 'high' && (
                                <div className="flex items-center gap-1 text-[11px] text-amber-500">
                                  <AlertTriangle size={11} /> check — {f.acceptanceNote ?? 'unclear'}
                                </div>
                              )}
                            </td>
                            <td className="td max-w-[200px] truncate text-xs text-fg-muted" title={f.fileName}>
                              {f.fileName || '—'}
                            </td>
                            <td className="td font-mono text-xs">{f.siteNo ?? '—'}</td>
                            <td className="td text-right tabular-nums">{f.lineCount ?? '—'}</td>
                            <td className="td text-right font-semibold">
                              {f.ok ? money(f.total ?? 0) : '—'}
                            </td>
                            <td className="td">
                              {f.ok ? (
                                <Select
                                  value={chosen ?? ''}
                                  className="!py-1.5 text-xs"
                                  onChange={(e) =>
                                    setAcceptance((a) => ({
                                      ...a,
                                      [f.siteId]: e.target.value as Acceptance,
                                    }))
                                  }
                                >
                                  <option value="">Select…</option>
                                  {(Object.keys(ACCEPTANCE_LABEL) as Acceptance[]).map((k) => (
                                    <option key={k} value={k}>{ACCEPTANCE_LABEL[k]}</option>
                                  ))}
                                </Select>
                              ) : (
                                <span className="text-xs text-fg-subtle">—</span>
                              )}
                            </td>
                            <td className="td">
                              {chosen ? (
                                <Badge
                                  tone={
                                    chosen === 'ACCEPTED'
                                      ? 'success'
                                      : chosen === 'ACCEPTED_WITH_OIL'
                                        ? 'warn'
                                        : 'neutral'
                                  }
                                >
                                  {ACCEPTANCE_OUTCOME[chosen]}
                                </Badge>
                              ) : (
                                <span className="text-xs text-fg-subtle">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

              </Card>

              <Card>
                <CardHead title="4 · Applied to every site" />
                <div className="grid gap-4 px-4 py-5 sm:grid-cols-3 sm:px-5">
                  <Field label="Handover date">
                    <Input
                      type="date"
                      value={form.serviceDate}
                      onChange={(e) => setForm({ ...form, serviceDate: e.target.value })}
                    />
                  </Field>
                  <Field label="Start date">
                    <Input
                      type="date"
                      value={form.startDate}
                      onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                    />
                  </Field>
                  <Field label="Remarks">
                    <Textarea
                      className="h-16"
                      value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    />
                  </Field>
                </div>

                <div className="border-t border-line/60 px-4 py-4 sm:px-5">
                  <Checkbox
                    checked={replaceExisting}
                    onChange={setReplaceExisting}
                    label={
                      <span>
                        <span className="text-sm">Replace existing packages</span>
                        <span className="block text-[11px] text-fg-subtle">
                          A project already processed is skipped unless this is ticked.
                        </span>
                      </span>
                    }
                  />
                </div>
              </Card>

              {readable.length === 0 && (
                <Empty icon={<FileStack size={22} />}>
                  None of the selected projects' GCLs could be read.
                </Empty>
              )}

              <div className="sticky bottom-0 -mx-4 border-t border-line/60 bg-canvas/85 px-4 py-3 backdrop-blur-md sm:-mx-5 sm:px-5 lg:-mx-8 lg:px-8">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="min-w-0 flex-1 text-xs text-fg-subtle">
                    {unconfirmed.length > 0 ? (
                      <span className="text-amber-500">
                        {unconfirmed.length} project(s) still need an acceptance
                      </span>
                    ) : (
                      <>
                        {split.ACCEPTED} → FAC · {split.ACCEPTED_WITH_OIL} → PAC
                        {split.REJECTED > 0 && ` · ${split.REJECTED} rejected`} ·{' '}
                        {money(preview.totalValue)}
                      </>
                    )}
                  </span>
                  <Button
                    variant="gradient"
                    onClick={commit}
                    disabled={readable.length === 0 || unconfirmed.length > 0}
                    loading={busy === 'commit'}
                  >
                    <Layers size={15} /> Create {readable.length} package(s)
                  </Button>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
