import { KeyRound, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Alert } from '../components/ui/Feedback';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardHead } from '../components/ui/Card';
import { Field, Input } from '../components/ui/Field';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

export default function AccountPage() {
  const { user, refresh } = useAuth();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const first = params.get('first') === '1';

  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const mismatch = confirm.length > 0 && newPassword !== confirm;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.send('/auth/change-password', 'POST', { currentPassword, newPassword });
      await refresh();
      setDone(true);
      setCurrent('');
      setNext('');
      setConfirm('');
      if (first) setTimeout(() => nav('/', { replace: true }), 900);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight gradient-text animate-gradient-pan">Your account</h1>
        <p className="mt-1 text-sm text-fg-muted">{user?.email}</p>
      </div>

      {first && (
        <Alert kind="warn" title="Set your own password">
          This account still uses the password an administrator chose. Please replace it before
          continuing.
        </Alert>
      )}

      <Card>
        <CardHead
          title="Profile"
          icon={<ShieldCheck size={15} />}
          actions={<Badge tone={user?.role === 'ADMIN' ? 'brand' : 'cyan'}>{user?.role}</Badge>}
        />
        <dl className="grid grid-cols-2 gap-4 px-5 py-5 text-sm">
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Name</dt>
            <dd className="mt-0.5 font-medium text-fg">{user?.name}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Email</dt>
            <dd className="mt-0.5 font-medium text-fg">{user?.email}</dd>
          </div>
        </dl>
      </Card>

      <Card>
        <CardHead title="Change password" icon={<KeyRound size={15} />} />
        <div className="space-y-4 px-5 py-5">
          <Field label="Current password">
            <Input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </Field>
          <Field label="New password" hint="At least 8 characters">
            <Input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNext(e.target.value)}
            />
          </Field>
          <Field label="Confirm new password">
            <Input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>

          {mismatch && <Alert kind="warn">The two new passwords don't match.</Alert>}
          {error && <Alert kind="error">{error}</Alert>}
          {done && <Alert kind="success">Password updated.</Alert>}
        </div>
        <div className="flex justify-end border-t border-line/60 px-5 py-4">
          <Button
            variant="gradient"
            onClick={submit}
            loading={busy}
            disabled={!currentPassword || newPassword.length < 8 || mismatch}
          >
            Update password
          </Button>
        </div>
      </Card>
    </div>
  );
}
