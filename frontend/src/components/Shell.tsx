import { AnimatePresence, motion } from 'framer-motion';
import {
  CircleHelp,
  FileSignature,
  FileUp,
  Layers,
  PanelLeftClose,
  PanelLeftOpen,
  ListOrdered,
  Sparkles,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '../lib/cn';
import { useTour } from './Tour';
import { Button } from './ui/Button';
import CoBrand from './CoBrand';
import { Aurora, ThemeToggle, useTheme } from './Theme';

const GROUPS = [
  {
    label: 'Workflow',
    tour: 'nav',
    items: [
      { to: '/create-gcl', label: 'Create GCL', icon: FileSignature, hint: 'From a scope sheet' },
      { to: '/upload', label: 'Upload GCL', icon: FileUp, hint: 'From a signed PDF' },
    ],
  },
  {
    label: 'Library',
    tour: 'nav-library',
    items: [
      { to: '/packages', label: 'Packages', icon: Layers, hint: 'Jobs and documents' },
      { to: '/upl', label: 'Price List', icon: ListOrdered, hint: 'UPL versions' },
    ],
  },
];

export default function Shell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(true);
  const { start } = useTour();
  const { resolved } = useTheme();
  const location = useLocation();

  return (
    <div className="flex min-h-screen">
      <Aurora />
      {/* ---------- sidebar ---------- */}
      <motion.aside
        initial={false}
        animate={{ width: open ? 268 : 76 }}
        transition={{ type: 'spring', stiffness: 260, damping: 30 }}
        className="chrome sticky top-0 z-30 hidden h-screen shrink-0 flex-col border-r border-line/60 lg:flex"
      >
        <div className="flex h-[68px] items-center px-4">
          <AnimatePresence mode="wait" initial={false}>
            {open ? (
              <motion.div key="full" exit={{ opacity: 0 }}>
                <CoBrand />
              </motion.div>
            ) : (
              <motion.img
                key="icon"
                src={
                  resolved === 'dark'
                    ? '/brand/smartlife-icon-dark.png'
                    : '/brand/smartlife-icon.png'
                }
                alt="Smart Life"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="h-8 w-auto drop-shadow-sm"
              />
            )}
          </AnimatePresence>
        </div>

        <div className="hairline" />

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5 no-scrollbar">
          {GROUPS.map((group) => (
            <div key={group.label} data-tour={group.tour}>
              <AnimatePresence initial={false}>
                {open && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[.12em] text-fg-subtle"
                  >
                    {group.label}
                  </motion.p>
                )}
              </AnimatePresence>

              <div className="space-y-1">
                {group.items.map(({ to, label, icon: Icon, hint }) => (
                  <NavLink key={to} to={to} title={!open ? label : undefined}>
                    {({ isActive }) => (
                      <span
                        className={cn(
                          'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors',
                          isActive ? 'text-white' : 'text-fg-muted hover:bg-line/40 hover:text-fg',
                        )}
                      >
                        {isActive && (
                          <motion.span
                            layoutId="nav-active"
                            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                            className="absolute inset-0 -z-10 rounded-xl bg-brand-gradient shadow-soft"
                          />
                        )}
                        <Icon size={17} className="shrink-0" />
                        <AnimatePresence initial={false}>
                          {open && (
                            <motion.span
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              className="min-w-0 flex-1"
                            >
                              <span className="block truncate text-sm font-medium">{label}</span>
                              <span
                                className={cn(
                                  'block truncate text-[11px]',
                                  isActive ? 'text-white/70' : 'text-fg-subtle',
                                )}
                              >
                                {hint}
                              </span>
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </span>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="px-3 pb-4">
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-fg-subtle transition hover:bg-line/40 hover:text-fg-muted"
          >
            {open ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
            {open && <span className="text-sm">Collapse</span>}
          </button>
        </div>
      </motion.aside>

      {/* ---------- main column ---------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="chrome sticky top-0 z-20 border-b border-line/60">
          <div className="flex h-[68px] items-center gap-4 px-5 lg:px-8">
            <CoBrand compact className="lg:hidden" />

            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[15px] font-semibold text-fg">
                {titleFor(location.pathname)}
              </h1>
              <p className="truncate text-[11px] text-fg-subtle">{subtitleFor(location.pathname)}</p>
            </div>

            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Button variant="outline" size="sm" onClick={start} data-tour="help">
                <CircleHelp size={14} /> <span className="hidden sm:inline">Take the tour</span>
              </Button>
            </div>
          </div>

          {/* Mobile nav — the sidebar is desktop-only. */}
          <div className="flex gap-1 overflow-x-auto px-4 pb-2.5 no-scrollbar lg:hidden">
            {GROUPS.flatMap((g) => g.items).map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    'flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition',
                    isActive ? 'bg-brand-gradient text-white' : 'text-fg-muted hover:bg-line/50',
                  )
                }
              >
                <Icon size={14} /> {label}
              </NavLink>
            ))}
          </div>
        </header>

        <main className="flex-1 px-5 py-7 lg:px-8 lg:py-9">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="mx-auto max-w-7xl"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>

        <footer className="px-5 pb-6 lg:px-8">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 text-[11px] text-fg-subtle">
            <Sparkles size={12} />
            <span>Smart Life Advanced IT · Tawal document automation</span>
            <CoBrand compact className="ml-auto opacity-60 grayscale transition hover:opacity-100 hover:grayscale-0" />
          </div>
        </footer>
      </div>
    </div>
  );
}

const TITLES: Record<string, [string, string]> = {
  '/create-gcl': ['Create a GCL', 'Turn an approved scope of work into a signed-ready handover form'],
  '/upload': ['Upload a signed GCL', 'Read the table, price it, and build the downstream documents'],
  '/packages': ['Packages', 'Every job and the documents generated for it'],
  '/upl': ['Unit Price List', 'The commercial reference behind every BOQ and Work Order'],
};

const titleFor = (path: string) =>
  TITLES[path]?.[0] ?? (path.startsWith('/packages/') ? 'Package' : 'Smart Life DocGen');

const subtitleFor = (path: string) =>
  TITLES[path]?.[1] ?? (path.startsWith('/packages/') ? 'Review, price and generate' : '');
