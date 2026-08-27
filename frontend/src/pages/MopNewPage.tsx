import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft, ArrowRight, Download, FileSignature, Rows3, Sheet, Sparkles,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Spinner } from '../components/ui/Feedback';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardHead } from '../components/ui/Card';
import { Field, Input, Select } from '../components/ui/Field';
import FileDrop from '../components/FileDrop';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type {
  CategoryTemplate, DirectoryUser, MopBatch, MopDocument, Project, SiteImpact,
} from '../lib/types';

type Mode = 'single' | 'bulk';

export default function MopNewPage() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { user } = useAuth();

  const [projects, setProjects] = useState<Project[] | null>(null);
  const [people, setPeople] = useState<DirectoryUser[]>([]);
  const [mode, setMode] = useState<Mode>('single');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [batch, setBatch] = useState<MopBatch | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const [form, setForm] = useState({
    projectId: params.get('project') ?? '',
    mopCategoryId: '',
    siteId: '',
    tcnSummary: '',
    requesterName: '',
    pmName: user?.name ?? '',
    siteImpact: 'NO' as SiteImpact,
    siteImpactNote: '',
  });
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    api.get<Project[]>('/projects').then(setProjects).catch((e) => setError(e.message));
    api.get<DirectoryUser[]>('/directory/users').then(setPeople).catch(() => setPeople([]));
  }, []);

  const project = useMemo(
    () => projects?.find((p) => p.id === form.projectId) ?? null,
    [projects, form.projectId],
  );

  /** Only the pairings defined for this project's category. */
  const available: CategoryTemplate[] = useMemo(
    () => project?.projectCategory?.templates ?? [],
    [project],
  );

  const link = available.find((t) => t.mopCategoryId === form.mopCategoryId) ?? null;

  // Changing project resets the category to the first one it actually offers.
  useEffect(() => {
    if (!project) return;
    const first = available[0];
    setForm((f) => ({
      ...f,
      mopCategoryId: available.some((t) => t.mopCategoryId === f.mopCategoryId)
        ? f.mopCategoryId
        : (first?.mopCategoryId ?? ''),
      tcnSummary: first?.defaultTcnSummary ?? f.tcnSummary,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  function chooseCategory(id: string) {
    const next = available.find((t) => t.mopCategoryId === id);
    setForm((f) => ({
      ...f,
      mopCategoryId: id,
      tcnSummary: next?.defaultTcnSummary ?? f.tcnSummary,
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
        projectId: form.projectId,
        mopCategoryId: form.mopCategoryId,
        requesterName: form.requesterName,
        pmName: form.pmName,
      });
      setBatch(result);
      setNotice(`${result.succeeded} of ${result.total} generated.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!projects) return <Spinner label="Loading…" />;

  if (projects.length === 0) {
    return (
      <Alert kind="info" title="No projects yet">
        A MOP belongs to a project. <Link to="/projects" className="font-medium underline">Create one first</Link>.
      </Alert>
    );
  }

  const ready = form.projectId && form.mopCategoryId;
  const canSubmit = ready && form.siteId.trim() && form.requesterName.trim() && form.pmName.trim();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/mop" className="mb-1 inline-flex items-center gap-1 text-xs text-fg-subtle hover:text-fg">
            <ArrowLeft size={13} /> All MOP documents
          </Link>
          <h1 className="text-2xl font-bold tracking-tight gradient-text animate-gradient-pan">
            New MOP
          </h1>
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
      {notice && (
        <Alert kind="success">
          {notice}{' '}
          <Link to="/mop" className="font-medium underline">View documents</Link>
        </Alert>
      )}

      {/* --- step 1: where it belongs --- */}
      <Card>
        <CardHead title="1 · Project and category" icon={<span className="text-xs font-bold">1</span>} />
        <div className="grid gap-4 px-4 py-5 sm:px-5 sm:grid-cols-2">
          <Field label="Project">
            <Select value={form.projectId} onChange={(e) => set('projectId', e.target.value)}>
              <option value="">Select a project…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.projectCategory?.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="MOP category"
            hint={
              project && available.length === 0
                ? `${project.projectCategory?.name} has no MOP categories configured yet.`
                : undefined
            }
          >
            <Select
              value={form.mopCategoryId}
              disabled={!project || available.length === 0}
              onChange={(e) => chooseCategory(e.target.value)}
            >
              <option value="">{project ? 'Select…' : 'Choose a project first'}</option>
              {available.map((t) => (
                <option key={t.mopCategoryId} value={t.mopCategoryId}>
                  {t.mopCategory?.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {link && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line/60 px-5 py-3 text-xs text-fg-subtle">
            <span>Produces</span>
            <Badge tone="cyan">{link.templateKey}</Badge>
            <span>from Tawal's template.</span>
          </div>
        )}
      </Card>

      {/* --- step 2 --- */}
      <AnimatePresence mode="wait">
        {mode === 'single' ? (
          <motion.div key="single" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Card>
              <CardHead
                title="2 · Document Control"
                hint="These five values are written into the MOP's control table"
                icon={<span className="text-xs font-bold">2</span>}
              />
              <div className="grid gap-4 px-4 py-5 sm:px-5 sm:grid-cols-2">
                <Field label="Site ID">
                  <Input
                    placeholder="ZMS009"
                    value={form.siteId}
                    onChange={(e) => set('siteId', e.target.value.toUpperCase())}
                  />
                </Field>
                <Field label="TCN Summary" hint="Defaults to the category's standard wording">
                  <Input value={form.tcnSummary} onChange={(e) => set('tcnSummary', e.target.value)} />
                </Field>

                <PersonField
                  label="Name of Requester"
                  people={people}
                  value={form.requesterName}
                  onChange={(v) => set('requesterName', v)}
                />
                <PersonField
                  label="Name of PM"
                  people={people}
                  value={form.pmName}
                  onChange={(v) => set('pmName', v)}
                />

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

              <div className="flex items-center justify-between gap-3 border-t border-line/60 px-5 py-4">
                <span className="text-xs text-fg-subtle">
                  You get a Word file and a PDF, both from Tawal's own template.
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
                title="2 · Bulk from Excel"
                hint="One row per site — a failing row is reported and skipped, not fatal"
                icon={<span className="text-xs font-bold">2</span>}
              />
              <div className="space-y-5 px-5 py-5">
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-card/50 px-4 py-3">
                  <Sheet size={16} className="text-fg-subtle" />
                  <span className="flex-1 text-xs text-fg-muted">
                    Start from the template — correct headers and a sample row.
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!ready}
                    onClick={() =>
                      api.download(
                        `/mop/bulk/template/${form.projectId}/${form.mopCategoryId}`,
                        'MOP_Bulk_Template.xlsx',
                      )
                    }
                  >
                    <Download size={13} /> Download template
                  </Button>
                </div>

                <FileDrop
                  accept=".xlsx,.xls"
                  file={file}
                  onFile={setFile}
                  hint="Needs at least a Site ID column; blanks fall back to the defaults below"
                />

                <div className="grid gap-4 md:grid-cols-2">
                  <PersonField
                    label="Default Name of Requester"
                    people={people}
                    value={form.requesterName}
                    onChange={(v) => set('requesterName', v)}
                  />
                  <PersonField
                    label="Default Name of PM"
                    people={people}
                    value={form.pmName}
                    onChange={(v) => set('pmName', v)}
                  />
                </div>
              </div>

              <div className="flex items-center justify-end border-t border-line/60 px-5 py-4">
                <Button variant="gradient" onClick={runBulk} disabled={!file || !ready} loading={busy === 'bulk'}>
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
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => api.download(`/mop/bulk/${batch.id}/zip`, 'MOP_Batch.zip')}
                      >
                        <Download size={13} /> Download all (.zip)
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => nav('/mop')}>
                        View documents
                      </Button>
                    </div>
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
    </div>
  );
}

/**
 * A name field backed by the user directory, with free text still allowed —
 * requesters are often people without a platform account.
 */
function PersonField({
  label, people, value, onChange,
}: {
  label: string;
  people: DirectoryUser[];
  value: string;
  onChange: (v: string) => void;
}) {
  const listId = `people-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <Field label={label} hint="Pick a user, or type any name">
      <Input list={listId} value={value} onChange={(e) => onChange(e.target.value)} />
      <datalist id={listId}>
        {people.map((p) => (
          <option key={p.id} value={p.name}>{p.email}</option>
        ))}
      </datalist>
    </Field>
  );
}
