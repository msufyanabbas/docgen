import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight, Download, FileSignature, FileText, Layers3, Rows3, Sheet, Sparkles,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Alert, Empty, Spinner } from '../components/ui/Feedback';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardHead } from '../components/ui/Card';
import { Field, Input, Select, Textarea } from '../components/ui/Field';
import FileDrop from '../components/FileDrop';
import { api, shortDate } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { MopBatch, MopDocument, Paged, Project, SiteImpact } from '../lib/types';

type Mode = 'single' | 'bulk';

export default function MopPage() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const { user } = useAuth();

  const [projects, setProjects] = useState<Project[] | null>(null);
  const [mode, setMode] = useState<Mode>('single');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [recent, setRecent] = useState<MopDocument[]>([]);
  const [batch, setBatch] = useState<MopBatch | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const [form, setForm] = useState({
    mobId: '',
    siteId: '',
    tcnSummary: '',
    requesterName: '',
    pmName: user?.name ?? '',
    siteImpact: 'NO' as SiteImpact,
    siteImpactNote: '',
  });
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const project = useMemo(
    () => projects?.find((p) => p.slug === slug) ?? projects?.[0] ?? null,
    [projects, slug],
  );
  const mob = useMemo(
    () => project?.mobs.find((m) => m.id === form.mobId) ?? null,
    [project, form.mobId],
  );

  useEffect(() => {
    api.get<Project[]>('/projects').then(setProjects).catch((e) => setError(e.message));
  }, []);

  // Selecting a project (or landing on one) picks its first MOB and its default summary.
  useEffect(() => {
    if (!project) return;
    const preferred = params.get('mob');
    const next = project.mobs.find((m) => m.id === preferred) ?? project.mobs[0];
    if (next) {
      setForm((f) => ({
        ...f,
        mobId: next.id,
        tcnSummary: f.tcnSummary || next.defaultTcnSummary || next.name,
      }));
    }
    loadRecent(project.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  function loadRecent(projectId: string) {
    api
      .get<Paged<MopDocument>>(`/mop?projectId=${projectId}&limit=8`)
      .then((r) => setRecent(r.items))
      .catch(() => setRecent([]));
  }

  function chooseMob(id: string) {
    const next = project?.mobs.find((m) => m.id === id);
    setForm((f) => ({
      ...f,
      mobId: id,
      tcnSummary: next?.defaultTcnSummary || next?.name || f.tcnSummary,
    }));
  }

  async function createOne() {
    setBusy('single');
    setError(null);
    setNotice(null);
    try {
      const doc = await api.send<MopDocument>('/mop', 'POST', form);
      setNotice(`MOP created for ${doc.siteId}.`);
      setForm((f) => ({ ...f, siteId: '' }));
      if (project) loadRecent(project.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function runBulk() {
    if (!file) return;
    setBusy('bulk');
    setError(null);
    setNotice(null);
    try {
      const result = await api.upload<MopBatch>('/mop/bulk', file, {
        mobId: form.mobId,
        requesterName: form.requesterName,
        pmName: form.pmName,
      });
      setBatch(result);
      setNotice(`${result.succeeded} of ${result.total} generated.`);
      if (project) loadRecent(project.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!projects) return <Spinner label="Loading projects…" />;
  if (!project) {
    return <Empty icon={<Layers3 size={22} />}>No projects yet. An admin can add one under Projects.</Empty>;
  }

  const canSubmit =
    form.mobId && form.siteId.trim() && form.requesterName.trim() && form.pmName.trim();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight gradient-text animate-gradient-pan">
            {project.name} · MOP
          </h1>
          <p className="mt-1 text-sm text-fg-muted">
            Method of Procedure — fills Tawal's own template, so the output is identical to a
            hand-prepared MOP.
          </p>
        </div>

        <div className="flex gap-1 rounded-xl border border-line bg-card/60 p-1">
          {([['single', 'One site', FileSignature], ['bulk', 'Bulk from Excel', Rows3]] as const).map(
            ([key, label, Icon]) => (
              <button
                key={key}
                onClick={() => setMode(key)}
                className={`relative flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  mode === key ? 'text-white' : 'text-fg-subtle hover:text-fg'
                }`}
              >
                {mode === key && (
                  <motion.span
                    layoutId="mop-mode"
                    transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    className="absolute inset-0 -z-10 rounded-lg bg-brand-gradient"
                  />
                )}
                <Icon size={13} /> {label}
              </button>
            ),
          )}
        </div>
      </div>

      {error && <Alert kind="error" title="Something went wrong">{error}</Alert>}
      {notice && <Alert kind="success">{notice}</Alert>}

      <Card>
        <CardHead
          title="MOB category"
          hint="Which activity this MOP covers — it selects the document template"
          icon={<Layers3 size={15} />}
        />
        <div className="flex flex-wrap gap-2 px-5 py-4">
          {project.mobs.filter((m) => m.isActive).map((m) => (
            <button
              key={m.id}
              onClick={() => chooseMob(m.id)}
              className={`rounded-xl border px-4 py-2.5 text-left transition-all ${
                form.mobId === m.id
                  ? 'border-cyan-brand bg-cyan-brand/10 ring-1 ring-cyan-brand'
                  : 'border-line bg-card/60 hover:border-fg-subtle/40'
              }`}
            >
              <div className="text-sm font-semibold text-fg">{m.name}</div>
              <div className="mt-0.5 text-[11px] text-fg-subtle">{m.defaultTcnSummary ?? m.templateKey}</div>
            </button>
          ))}
          {project.mobs.length === 0 && (
            <p className="text-sm text-fg-subtle">
              This project has no MOB categories yet. An admin can add them under Projects.
            </p>
          )}
        </div>
      </Card>

      <AnimatePresence mode="wait">
        {mode === 'single' ? (
          <motion.div key="single" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Card>
              <CardHead
                title="Document Control"
                hint="These five values are written into the MOP's control table"
                icon={<FileText size={15} />}
              />
              <div className="grid gap-4 px-5 py-5 md:grid-cols-2">
                <Field label="TCN Summary" hint="Defaults to the MOB's standard wording">
                  <Input value={form.tcnSummary} onChange={(e) => set('tcnSummary', e.target.value)} />
                </Field>
                <Field label="Site ID">
                  <Input
                    placeholder="ZMS009"
                    value={form.siteId}
                    onChange={(e) => set('siteId', e.target.value.toUpperCase())}
                  />
                </Field>
                <Field label="Name of Requester">
                  <Input value={form.requesterName} onChange={(e) => set('requesterName', e.target.value)} />
                </Field>
                <Field label="Name of PM">
                  <Input value={form.pmName} onChange={(e) => set('pmName', e.target.value)} />
                </Field>
                <Field label="Site Impact">
                  <Select value={form.siteImpact} onChange={(e) => set('siteImpact', e.target.value)}>
                    <option value="NO">NO — no impact</option>
                    <option value="YES">YES — impact expected</option>
                  </Select>
                </Field>
                <Field label="Impact note" hint="Printed verbatim; blank uses the standard wording">
                  <Input
                    placeholder="NO – No Impact"
                    value={form.siteImpactNote}
                    onChange={(e) => set('siteImpactNote', e.target.value)}
                  />
                </Field>
              </div>

              <div className="flex items-center justify-between border-t border-line/60 px-5 py-4">
                <span className="text-xs text-fg-subtle">
                  {mob ? `Template: ${mob.templateKey}` : 'Select a MOB category'}
                </span>
                <Button variant="gradient" onClick={createOne} disabled={!canSubmit} loading={busy === 'single'}>
                  <Sparkles size={15} /> Generate MOP <ArrowRight size={15} />
                </Button>
              </div>
            </Card>
          </motion.div>
        ) : (
          <motion.div key="bulk" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Card>
              <CardHead
                title="Bulk generation"
                hint="One row per site — a failing row is reported and skipped, not fatal"
                icon={<Sheet size={15} />}
              />
              <div className="space-y-5 px-5 py-5">
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-card/50 px-4 py-3">
                  <Sheet size={16} className="text-fg-subtle" />
                  <span className="flex-1 text-xs text-fg-muted">
                    Start from the template — it has the right headers and a sample row.
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!form.mobId}
                    onClick={() => api.download(`/mop/bulk/template/${form.mobId}`, 'MOP_Bulk_Template.xlsx')}
                  >
                    <Download size={13} /> Download template
                  </Button>
                </div>

                <FileDrop
                  accept=".xlsx,.xls"
                  file={file}
                  onFile={setFile}
                  hint="Needs at least a Site ID column; other columns fall back to the defaults below"
                />

                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Default Name of Requester" hint="Used where the column is blank">
                    <Input value={form.requesterName} onChange={(e) => set('requesterName', e.target.value)} />
                  </Field>
                  <Field label="Default Name of PM" hint="Used where the column is blank">
                    <Input value={form.pmName} onChange={(e) => set('pmName', e.target.value)} />
                  </Field>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-line/60 px-5 py-4">
                <span className="text-xs text-fg-subtle">{mob ? `Template: ${mob.templateKey}` : ''}</span>
                <Button
                  variant="gradient"
                  onClick={runBulk}
                  disabled={!file || !form.mobId}
                  loading={busy === 'bulk'}
                >
                  <Rows3 size={15} /> Generate all
                </Button>
              </div>
            </Card>

            {batch && (
              <Card className="mt-6">
                <CardHead
                  title="Batch result"
                  hint={batch.fileName}
                  actions={
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => api.download(`/mop/bulk/${batch.id}/zip`, 'MOP_Batch.zip')}
                    >
                      <Download size={13} /> Download all (.zip)
                    </Button>
                  }
                />
                <div className="flex flex-wrap gap-3 px-5 py-4">
                  <Badge tone="success">{batch.succeeded} generated</Badge>
                  {batch.failed > 0 && <Badge tone="danger">{batch.failed} failed</Badge>}
                  <Badge tone="neutral">{batch.total} rows</Badge>
                </div>

                {batch.errors?.length ? (
                  <div className="border-t border-line/60 px-5 py-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                      Rows that failed
                    </p>
                    <ul className="space-y-1 text-sm text-fg-muted">
                      {batch.errors.map((e, i) => (
                        <li key={i}>
                          <span className="font-mono text-xs text-rose-500">row {e.row}</span>{' '}
                          <span className="font-medium">{e.siteId}</span> — {e.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </Card>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* recent documents */}
      <Card>
        <CardHead title="Recent MOPs" hint={`${project.name} — latest first`} icon={<FileText size={15} />} />
        {recent.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-fg-subtle">Nothing generated yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Site ID</th>
                  <th className="th">MOB</th>
                  <th className="th">TCN Summary</th>
                  <th className="th">PM</th>
                  <th className="th">Impact</th>
                  <th className="th">Created</th>
                  <th className="th text-right">Files</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((d) => (
                  <tr key={d.id} className="row-hover">
                    <td className="td font-mono text-xs font-semibold text-fg">{d.siteId}</td>
                    <td className="td text-xs">{d.mob?.name}</td>
                    <td className="td max-w-xs truncate text-fg-muted" title={d.tcnSummary}>
                      {d.tcnSummary}
                    </td>
                    <td className="td text-xs">{d.pmName}</td>
                    <td className="td">
                      <Badge tone={d.siteImpact === 'YES' ? 'warn' : 'neutral'}>{d.siteImpact}</Badge>
                    </td>
                    <td className="td text-xs text-fg-subtle">{shortDate(d.createdAt)}</td>
                    <td className="td">
                      <div className="flex justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => api.download(`/mop/${d.id}/download/docx`, d.docxFileName ?? 'mop.docx')}
                        >
                          DOCX
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!d.pdfFileName}
                          onClick={() => api.openInline(`/mop/${d.id}/download/pdf?inline=true`)}
                        >
                          PDF
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
