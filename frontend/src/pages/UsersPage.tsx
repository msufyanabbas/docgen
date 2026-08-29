import { KeyRound, Plus, Search, ShieldCheck, Trash2, UserCog, UserPlus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Empty, Spinner } from '../components/ui/Feedback';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardHead } from '../components/ui/Card';
import { Checkbox, Field, Input, Select } from '../components/ui/Field';
import { api, shortDate } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { AuthUser, Paged, UserRole } from '../lib/types';
import PermissionMatrix from '../components/PermissionMatrix';
import { ALL_PERMISSIONS, DEFAULT_PM_PERMISSIONS, type PermissionMap } from '../lib/permissions';

/** Admin-only. The route is gated too — this is the UI half of the same rule. */
export default function UsersPage() {
  const { user: me } = useAuth();
  const [data, setData] = useState<Paged<AuthUser> | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [resetFor, setResetFor] = useState<AuthUser | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [permsFor, setPermsFor] = useState<AuthUser | null>(null);
  const [draftPerms, setDraftPerms] = useState<PermissionMap>({});

  const [draft, setDraft] = useState<{
    name: string; email: string; password: string; role: UserRole; permissions: PermissionMap;
  }>({ name: '', email: '', password: '', role: 'PM', permissions: DEFAULT_PM_PERMISSIONS });

  const load = useCallback(() => {
    api
      .get<Paged<AuthUser>>(`/users?limit=100${search ? `&search=${encodeURIComponent(search)}` : ''}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [search]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function create() {
    setBusy('create');
    setError(null);
    try {
      await api.send('/users', 'POST', draft);
      setNotice(`${draft.name} can now sign in. They'll be asked to set their own password.`);
      setDraft({ name: '', email: '', password: '', role: 'PM', permissions: DEFAULT_PM_PERMISSIONS });
      setShowNew(false);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setError(null);
    try {
      await api.send(`/users/${id}`, 'PATCH', body);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function resetPassword() {
    if (!resetFor) return;
    setBusy('reset');
    setError(null);
    try {
      await api.send(`/users/${resetFor.id}/reset-password`, 'POST', { newPassword });
      setNotice(`Password reset for ${resetFor.name}. Share it privately — they must change it at next sign-in.`);
      setResetFor(null);
      setNewPassword('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function remove(u: AuthUser) {
    if (!confirm(`Delete ${u.name}? Documents they created are kept.`)) return;
    setError(null);
    try {
      await api.send(`/users/${u.id}`, 'DELETE');
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight gradient-text animate-gradient-pan">Users</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Admins manage the platform and its users; PMs use everything except this screen.
          </p>
        </div>
        <div className="flex gap-2">
          <div className="relative w-60">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
            <Input
              className="pl-9"
              placeholder="Name or email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button variant="gradient" onClick={() => setShowNew((v) => !v)}>
            <UserPlus size={15} /> Add user
          </Button>
        </div>
      </div>

      {error && <Alert kind="error">{error}</Alert>}
      {notice && <Alert kind="success">{notice}</Alert>}

      {showNew && (
        <Card>
          <CardHead title="New user" hint="They set their own password at first sign-in" icon={<Plus size={15} />} />
          <div className="grid gap-4 px-4 py-5 sm:px-5 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Full name">
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={draft.email}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              />
            </Field>
            <Field label="Temporary password" hint="At least 8 characters">
              <Input
                type="text"
                value={draft.password}
                onChange={(e) => setDraft({ ...draft, password: e.target.value })}
              />
            </Field>
            <Field label="Role">
              <Select
                value={draft.role}
                onChange={(e) => setDraft({ ...draft, role: e.target.value as UserRole })}
              >
                <option value="PM">Project Manager</option>
                <option value="ADMIN">Admin</option>
              </Select>
            </Field>
          </div>
          {draft.role === 'PM' && (
            <div className="border-t border-line/60 px-4 py-5 sm:px-5">
              <p className="label">Permissions</p>
              <PermissionMatrix
                value={draft.permissions}
                onChange={(permissions) => setDraft({ ...draft, permissions })}
              />
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-line/60 px-5 py-4">
            <Button variant="ghost" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button
              variant="gradient"
              onClick={create}
              loading={busy === 'create'}
              disabled={!draft.name || !draft.email || draft.password.length < 8}
            >
              Create account
            </Button>
          </div>
        </Card>
      )}

      {resetFor && (
        <Card>
          <CardHead title={`Reset password — ${resetFor.name}`} icon={<KeyRound size={15} />} />
          <div className="flex flex-wrap items-end gap-4 px-5 py-5">
            <Field label="New temporary password" className="min-w-[280px] flex-1">
              <Input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </Field>
            <Button variant="ghost" onClick={() => setResetFor(null)}>Cancel</Button>
            <Button variant="gradient" onClick={resetPassword} loading={busy === 'reset'} disabled={newPassword.length < 8}>
              Reset
            </Button>
          </div>
        </Card>
      )}

      {permsFor && (
        <Card>
          <CardHead
            title={`Permissions — ${permsFor.name}`}
            hint={permsFor.role === 'ADMIN'
              ? 'Admins hold everything; change the role to restrict access.'
              : 'Tick what this user may do. Any action implies being able to view.'}
            icon={<ShieldCheck size={15} />}
          />
          <div className="px-4 py-5 sm:px-5">
            <PermissionMatrix
              value={permsFor.role === 'ADMIN' ? ALL_PERMISSIONS : draftPerms}
              onChange={setDraftPerms}
              readOnly={permsFor.role === 'ADMIN'}
            />
          </div>
          <div className="flex justify-end gap-2 border-t border-line/60 px-5 py-4">
            <Button variant="ghost" onClick={() => setPermsFor(null)}>Cancel</Button>
            <Button
              variant="gradient"
              disabled={permsFor.role === 'ADMIN'}
              loading={busy === 'perms'}
              onClick={async () => {
                setBusy('perms');
                await patch(permsFor.id, { permissions: draftPerms });
                setPermsFor(null);
                setBusy(null);
              }}
            >
              Save permissions
            </Button>
          </div>
        </Card>
      )}

      {!data && !error && <Spinner label="Loading users…" />}
      {data && data.items.length === 0 && <Empty icon={<UserCog size={22} />}>No users match that search.</Empty>}

      {data && data.items.length > 0 && (
        <Card className="-mx-px overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr>
                <th className="th">Name</th>
                <th className="th">Email</th>
                <th className="th w-40">Role</th>
                <th className="th w-28">Active</th>
                <th className="th">Last sign-in</th>
                <th className="th">Added</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((u) => (
                <tr key={u.id} className="row-hover">
                  <td className="td font-medium text-fg">
                    {u.name}
                    {u.id === me?.id && <span className="ml-2 text-[11px] text-fg-subtle">(you)</span>}
                    {u.mustChangePassword && (
                      <Badge tone="warn" className="ml-2">must change password</Badge>
                    )}
                  </td>
                  <td className="td text-xs">{u.email}</td>
                  <td className="td">
                    <Select
                      value={u.role}
                      disabled={u.id === me?.id}
                      onChange={(e) => patch(u.id, { role: e.target.value })}
                      className="!py-1.5 text-xs"
                    >
                      <option value="PM">Project Manager</option>
                      <option value="ADMIN">Admin</option>
                    </Select>
                  </td>
                  <td className="td">
                    <Checkbox
                      checked={u.isActive ?? true}
                      onChange={(v) => patch(u.id, { isActive: v })}
                      label={<span className="text-xs">{u.isActive ? 'Active' : 'Disabled'}</span>}
                    />
                  </td>
                  <td className="td text-xs text-fg-subtle">
                    {u.lastLoginAt ? shortDate(u.lastLoginAt) : 'never'}
                  </td>
                  <td className="td text-xs text-fg-subtle">{shortDate(u.createdAt)}</td>
                  <td className="td">
                    <div className="flex justify-end gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setPermsFor(u);
                          setDraftPerms((u.permissions ?? {}) as PermissionMap);
                        }}
                      >
                        <ShieldCheck size={13} /> Permissions
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setResetFor(u)}>
                        <KeyRound size={13} /> Reset
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={u.id === me?.id}
                        onClick={() => remove(u)}
                        className="text-rose-500"
                      >
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <p className="flex items-center gap-2 text-[11px] text-fg-subtle">
        <ShieldCheck size={13} />
        You cannot change your own role, disable yourself, or remove the last active admin.
      </p>
    </div>
  );
}
