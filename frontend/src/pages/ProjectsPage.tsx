import { FolderPlus, Layers3, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Empty, Spinner } from '../components/ui/Feedback';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardHead } from '../components/ui/Card';
import { Checkbox, Field, Input, Select } from '../components/ui/Field';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { MobTypeKey, Project, ProjectTypeDefinition } from '../lib/types';

/** Projects and their MOB categories are data, so new ones need no deploy. */
export default function ProjectsPage() {
  const { isAdmin } = useAuth();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [types, setTypes] = useState<ProjectTypeDefinition[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [mobFor, setMobFor] = useState<string | null>(null);

  const [draft, setDraft] = useState<{
    name: string;
    type: string;
    mobTypes: MobTypeKey[];
  }>({ name: '', type: '', mobTypes: [] });
  const [mobDraft, setMobDraft] = useState<{ mobType: string; defaultTcnSummary: string }>({
    mobType: '',
    defaultTcnSummary: '',
  });

  const chosenType = types.find((t) => t.key === draft.type) ?? null;

  const load = useCallback(() => {
    api
      .get<Project[]>('/projects?includeInactive=true')
      .then(setProjects)
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
    api.get<ProjectTypeDefinition[]>('/projects/types').then(setTypes).catch(() => setTypes([]));
  }, [load]);

  async function act(fn: () => Promise<unknown>, key: string) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!projects) return <Spinner label="Loading projects…" />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight gradient-text animate-gradient-pan">Projects</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Each project holds MOB categories, and each MOB maps to a Tawal MOP template.
          </p>
        </div>
        {isAdmin && (
          <Button variant="gradient" onClick={() => setShowNew((v) => !v)}>
            <FolderPlus size={15} /> New project
          </Button>
        )}
      </div>

      {error && <Alert kind="error">{error}</Alert>}
      {!isAdmin && <Alert kind="info">Only admins can add or change projects.</Alert>}

      {showNew && isAdmin && (
        <Card>
          <CardHead
            title="New project"
            hint="The type decides which MOB categories — and therefore which MOP formats — are available"
            icon={<Plus size={15} />}
          />

          <div className="space-y-5 px-5 py-5">
            <Field label="Project name">
              <Input
                placeholder="Jeddah Smart Tower — Phase 2"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </Field>

            <div>
              <label className="label">Project type</label>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {types.map((t) => {
                  const active = draft.type === t.key;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() =>
                        setDraft({ ...draft, type: t.key, mobTypes: t.mobTypes.map((m) => m.key) })
                      }
                      className={`rounded-xl border px-4 py-3 text-left transition-all ${
                        active
                          ? 'border-cyan-brand bg-cyan-brand/10 ring-1 ring-cyan-brand'
                          : 'border-line bg-card/60 hover:border-fg-subtle/40'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ background: t.colour }}
                        />
                        <span className="text-sm font-semibold text-fg">{t.label}</span>
                      </span>
                      <span className="mt-1 block text-[11px] leading-relaxed text-fg-subtle">
                        {t.description}
                      </span>
                      <span className="mt-2 flex flex-wrap gap-1">
                        {t.mobTypes.map((m) => (
                          <Badge key={m.key} tone="neutral">{m.name}</Badge>
                        ))}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {chosenType && (
              <div>
                <label className="label">MOB categories to create</label>
                <div className="flex flex-wrap gap-4 rounded-xl border border-line bg-card/50 px-4 py-3">
                  {chosenType.mobTypes.map((m) => (
                    <Checkbox
                      key={m.key}
                      checked={draft.mobTypes.includes(m.key)}
                      onChange={(v) =>
                        setDraft({
                          ...draft,
                          mobTypes: v
                            ? [...draft.mobTypes, m.key]
                            : draft.mobTypes.filter((k) => k !== m.key),
                        })
                      }
                      label={
                        <span>
                          <span className="text-sm">{m.name}</span>
                          <span className="ml-2 text-[11px] text-fg-subtle">{m.defaultTcnSummary}</span>
                        </span>
                      }
                    />
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-fg-subtle">
                  {chosenType.key === 'SIM_SWAP'
                    ? 'SIM Swap is survey-only — there is no installation or acceptance stage.'
                    : 'Each MOB maps to the MOP format Tawal expects for that stage.'}
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-line/60 px-5 py-4">
            <Button variant="ghost" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button
              variant="gradient"
              disabled={!draft.name || !draft.type || draft.mobTypes.length === 0}
              loading={busy === 'create'}
              onClick={() =>
                act(async () => {
                  await api.send('/projects', 'POST', draft);
                  setDraft({ name: '', type: '', mobTypes: [] });
                  setShowNew(false);
                }, 'create')
              }
            >
              Create project
            </Button>
          </div>
        </Card>
      )}

      {projects.length === 0 && <Empty icon={<Layers3 size={22} />}>No projects yet.</Empty>}

      <div className="space-y-4">
        {projects.map((p) => (
          <Card key={p.id}>
            <CardHead
              title={
                <span className="flex items-center gap-2">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: p.colour ?? '#44489D' }}
                  />
                  {p.name}
                  <Badge tone="cyan">{p.type.replace('_', ' ')}</Badge>
                  {!p.isActive && <Badge tone="neutral">hidden</Badge>}
                </span>
              }
              hint={p.description ?? p.slug}
              actions={
                isAdmin && (
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={p.isActive}
                      onChange={(v) => act(() => api.send(`/projects/${p.id}`, 'PATCH', { isActive: v }), p.id)}
                      label={<span className="text-xs">Visible</span>}
                    />
                    <Button variant="outline" size="sm" onClick={() => setMobFor(mobFor === p.id ? null : p.id)}>
                      <Plus size={13} /> MOB
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-rose-500"
                      onClick={() => act(() => api.send(`/projects/${p.id}`, 'DELETE'), p.id)}
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                )
              }
            />

            {mobFor === p.id && isAdmin && (
              <div className="grid gap-4 border-b border-line/60 bg-card/40 px-5 py-4 md:grid-cols-3">
                <Field label="MOB category" hint={`Allowed for a ${p.type.replace('_', ' ')} project`}>
                  <Select
                    value={mobDraft.mobType}
                    onChange={(e) => {
                      const def = types
                        .find((t) => t.key === p.type)
                        ?.mobTypes.find((m) => m.key === e.target.value);
                      setMobDraft({
                        mobType: e.target.value,
                        defaultTcnSummary: def?.defaultTcnSummary ?? '',
                      });
                    }}
                  >
                    <option value="">Select…</option>
                    {(types.find((t) => t.key === p.type)?.mobTypes ?? [])
                      .filter((m) => !p.mobs.some((existing) => existing.mobType === m.key))
                      .map((m) => (
                        <option key={m.key} value={m.key}>{m.name}</option>
                      ))}
                  </Select>
                </Field>

                <Field label="Default TCN Summary">
                  <Input
                    value={mobDraft.defaultTcnSummary}
                    onChange={(e) => setMobDraft({ ...mobDraft, defaultTcnSummary: e.target.value })}
                  />
                </Field>

                <div className="flex items-end">
                  <Button
                    variant="gradient"
                    className="w-full"
                    disabled={!mobDraft.mobType}
                    onClick={() =>
                      act(async () => {
                        await api.send(`/projects/${p.id}/mobs`, 'POST', mobDraft);
                        setMobDraft({ mobType: '', defaultTcnSummary: '' });
                        setMobFor(null);
                      }, p.id)
                    }
                  >
                    Add MOB
                  </Button>
                </div>
              </div>
            )}

            <div className="divide-y divide-line/50">
              {p.mobs.length === 0 && (
                <p className="px-5 py-6 text-sm text-fg-subtle">No MOB categories yet.</p>
              )}
              {p.mobs.map((m) => (
                <div key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-fg">{m.name}</div>
                    <div className="text-[11px] text-fg-subtle">
                      {m.defaultTcnSummary ?? '—'} · MOP format {m.templateKey}
                    </div>
                  </div>
                  {!m.isActive && <Badge tone="neutral">hidden</Badge>}
                  {isAdmin && (
                    <>
                      <Checkbox
                        checked={m.isActive}
                        onChange={(v) => act(() => api.send(`/projects/mobs/${m.id}`, 'PATCH', { isActive: v }), m.id)}
                        label={<span className="text-xs">Visible</span>}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-rose-500"
                        onClick={() => act(() => api.send(`/projects/mobs/${m.id}`, 'DELETE'), m.id)}
                      >
                        <Trash2 size={13} />
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
