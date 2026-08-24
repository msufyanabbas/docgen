import { AnimatePresence, motion } from 'framer-motion';
import { Monitor, Moon, Sun } from 'lucide-react';
import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react';
import { cn } from '../lib/cn';

type Mode = 'light' | 'dark' | 'system';
const KEY = 'docgen.theme.v1';

interface ThemeApi { mode: Mode; resolved: 'light' | 'dark'; setMode: (m: Mode) => void }
const Ctx = createContext<ThemeApi>({ mode: 'system', resolved: 'light', setMode: () => {} });
export const useTheme = () => useContext(Ctx);

const systemPrefersDark = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>(
    () => (localStorage.getItem(KEY) as Mode | null) ?? 'system',
  );
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  // Follow the OS while the user is on "system".
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const resolved: 'light' | 'dark' = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', resolved === 'dark');
    root.style.colorScheme = resolved;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', resolved === 'dark' ? '#0B0820' : '#F6F5FB');
  }, [resolved]);

  const setMode = useCallback((m: Mode) => {
    setModeState(m);
    localStorage.setItem(KEY, m);
  }, []);

  const value = useMemo(() => ({ mode, resolved, setMode }), [mode, resolved, setMode]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

const OPTIONS: { key: Mode; icon: typeof Sun; label: string }[] = [
  { key: 'light', icon: Sun, label: 'Light' },
  { key: 'dark', icon: Moon, label: 'Dark' },
  { key: 'system', icon: Monitor, label: 'System' },
];

/** Segmented control — the selected pill slides between options. */
export function ThemeToggle() {
  const { mode, setMode } = useTheme();
  return (
    <div className="flex items-center gap-0.5 rounded-xl border border-line bg-card/60 p-0.5 backdrop-blur">
      {OPTIONS.map(({ key, icon: Icon, label }) => (
        <button
          key={key}
          onClick={() => setMode(key)}
          title={label}
          aria-label={`${label} theme`}
          aria-pressed={mode === key}
          className={cn(
            'relative grid h-7 w-7 place-items-center rounded-lg transition-colors',
            mode === key ? 'text-white' : 'text-fg-subtle hover:text-fg',
          )}
        >
          {mode === key && (
            <motion.span
              layoutId="theme-pill"
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className="absolute inset-0 -z-10 rounded-lg bg-brand-gradient"
            />
          )}
          <Icon size={14} />
        </button>
      ))}
    </div>
  );
}

/** Slow-drifting colour field so no screen is ever flat white (or flat black). */
export function Aurora() {
  const { resolved } = useTheme();
  return (
    <div className="aurora" aria-hidden>
      <AnimatePresence>
        <motion.span
          key={`a-${resolved}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="animate-float"
          style={{
            top: '-22%', left: '-14%', width: '34vw', height: '34vw',
            background: 'rgb(var(--aurora-1))',
          }}
        />
      </AnimatePresence>
      <span
        className="animate-drift"
        style={{
          top: '-10%', right: '-16%', width: '32vw', height: '32vw',
          background: 'rgb(var(--aurora-2))', animationDelay: '-6s',
        }}
      />
      <span
        className="animate-float"
        style={{
          bottom: '-26%', right: '10%', width: '36vw', height: '36vw',
          background: 'rgb(var(--aurora-3))', animationDelay: '-12s',
        }}
      />
    </div>
  );
}
