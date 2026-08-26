import { motion } from 'framer-motion';
import { KeyRound, LogIn, Mail } from 'lucide-react';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Alert } from '../components/ui/Feedback';
import { Button } from '../components/ui/Button';
import { Field, Input } from '../components/ui/Field';
import { Aurora } from '../components/Theme';
import CoBrand from '../components/CoBrand';

export default function LoginPage() {
  const { login } = useAuth();
  const nav = useNavigate();
  const location = useLocation() as { state?: { from?: string } };

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await login(email, password);
      // A freshly created account still holds the password the admin chose.
      nav(user.mustChangePassword ? '/account?first=1' : (location.state?.from ?? '/'), {
        replace: true,
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-5 py-10">
      <Aurora />

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-[420px]"
      >
        <div className="mb-7 flex justify-center">
          <CoBrand />
        </div>

        <form onSubmit={submit} className="surface px-7 py-8">
          <h1 className="text-xl font-bold tracking-tight text-fg">Sign in</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Tawal document automation — GCL, BOQ, Work Order, PAC and MOP.
          </p>

          <div className="mt-6 space-y-4">
            <Field label="Email">
              <div className="relative">
                <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
                <Input
                  type="email"
                  autoComplete="username"
                  className="pl-9"
                  placeholder="you@smart-life.sa"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
            </Field>

            <Field label="Password">
              <div className="relative">
                <KeyRound size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
                <Input
                  type="password"
                  autoComplete="current-password"
                  className="pl-9"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </Field>
          </div>

          {error && (
            <div className="mt-4">
              <Alert kind="error">{error}</Alert>
            </div>
          )}

          <Button type="submit" variant="gradient" size="lg" className="mt-6 w-full" loading={busy}>
            <LogIn size={16} /> Sign in
          </Button>

          <p className="mt-5 text-center text-[11px] leading-relaxed text-fg-subtle">
            Accounts are created by an administrator. If you need access, ask them to add you.
          </p>
        </form>
      </motion.div>
    </div>
  );
}
