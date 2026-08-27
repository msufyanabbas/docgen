import { FolderKanban, FolderPlus, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Empty, Spinner } from '../components/ui/Feedback';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardHead } from '../components/ui/Card';
import { Checkbox, Field, Input, Select } from '../components/ui/Field';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Project, ProjectCategory } from '../lib/types';

/** Projects only. Their categories are managed on their own screen. */
export default function ProjectsPage() {
  const { isAdmin } = useAuth();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [categories, setCategories] = useState<ProjectCategory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft] = useState({ name: '', projectCategoryId: '', description: '' });

  const load = useCallback(() => {
    api
      .get<Project[]>('/projects?includeInactive=true')
      .then(setProjects)
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
    api.get<ProjectCategory[]>('/categories/projects').then(setCategories).catch(() => setCategories([]));
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

  const chosen = categories.find((c) => c.id === draft.projectCategoryId);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight gradient-text animate-gradient-pan">Projects</h1>
          <p className="mt-1 text-sm text-fg-muted">
            A project belongs to a category, and that category decides which MOPs it can produce.
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

      {categories.length === 0 && (
        <Alert kind="warn" title="No project categories yet">
          Add at least one under{' '}
          <Link to="/categories/projects" className="font-medium underline">Project categories</Link>{' '}
          before creating a project.
        </Alert>
      )}

      {showNew && isAdmin && categories.length > 0 && (
        <Card>
          <CardHead title="New project" icon={<Plus size={15} />} />
          <div className="grid gap-4 px-4 py-5 sm:px-5 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Project name">
              <Input
                placeholder="Jeddah Smart Tower — Phase 2"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </Field>
            <Field label="Category">
              <Select
                value={draft.projectCategoryId}
                onChange={(e) => setDraft({ ...draft, projectCategoryId: e.target.value })}
              >
                <option value="">Select…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Description">
              <Input
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </Field>
          </div>

          {chosen && (
            <div className="flex flex-wrap items-center gap-2 border-t border-line/60 px-5 py-3 text-xs text-fg-subtle">
              <span>Will be able to produce:</span>
              {(chosen.templates ?? []).length === 0 ? (
                <span className="text-amber-500">
                  nothing yet — pair MOP categories with {chosen.name} first
                </span>
              ) : (
                (chosen.templates ?? []).map((t) => (
                  <Badge key={t.id} tone="cyan">{t.mopCategory?.name}</Badge>
                ))
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-line/60 px-5 py-4">
            <Button variant="ghost" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button
              variant="gradient"
              disabled={!draft.name || !draft.projectCategoryId}
              loading={busy === 'create'}
              onClick={() =>
                act(async () => {
                  await api.send('/projects', 'POST', draft);
                  setDraft({ name: '', projectCategoryId: '', description: '' });
                  setShowNew(false);
                }, 'create')
              }
            >
              Create project
            </Button>
          </div>
        </Card>
      )}

      {projects.length === 0 && (
        <Empty icon={<FolderKanban size={22} />}>
          No projects yet. {isAdmin ? 'Create one to start producing MOPs.' : 'An admin can add one.'}
        </Empty>
      )}

      {projects.length > 0 && (
        <Card className="-mx-px overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr>
                <th className="th">Project</th>
                <th className="th">Category</th>
                <th className="th">Available MOPs</th>
                <th className="th w-28 text-right">Documents</th>
                <th className="th w-28">Visible</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} className="row-hover">
                  <td className="td">
                    <Link to={`/mop?project=${p.id}`} className="font-medium text-fg hover:text-cyan-brand">
                      {p.name}
                    </Link>
                    {p.description && (
                      <div className="text-[11px] text-fg-subtle">{p.description}</div>
                    )}
                  </td>
                  <td className="td">
                    <span className="flex items-center gap-2 text-xs">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: p.projectCategory?.colour ?? '#44489D' }}
                      />
                      {p.projectCategory?.name}
                    </span>
                  </td>
                  <td className="td">
                    <div className="flex flex-wrap gap-1">
                      {(p.projectCategory?.templates ?? []).map((t) => (
                        <Badge key={t.id} tone="neutral">{t.mopCategory?.name}</Badge>
                      ))}
                      {(p.projectCategory?.templates ?? []).length === 0 && (
                        <span className="text-[11px] text-amber-500">none paired</span>
                      )}
                    </div>
                  </td>
                  <td className="td text-right tabular-nums">{p._count?.documents ?? 0}</td>
                  <td className="td">
                    {isAdmin ? (
                      <Checkbox
                        checked={p.isActive}
                        onChange={(v) => act(() => api.send(`/projects/${p.id}`, 'PATCH', { isActive: v }), p.id)}
                        label={<span className="text-xs">{p.isActive ? 'Yes' : 'No'}</span>}
                      />
                    ) : (
                      <span className="text-xs">{p.isActive ? 'Yes' : 'No'}</span>
                    )}
                  </td>
                  <td className="td">
                    <div className="flex justify-end gap-1.5">
                      <Link to={`/mop/new?project=${p.id}`}>
                        <Button variant="ghost" size="sm"><Plus size={13} /> MOP</Button>
                      </Link>
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-rose-500"
                          onClick={() => act(() => api.send(`/projects/${p.id}`, 'DELETE'), p.id)}
                        >
                          <Trash2 size={13} />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
