import { AnimatePresence, motion } from 'framer-motion';
import {
  CircleHelp,
  FileSignature,
  FileStack,
  FolderKanban,
  FolderTree,
  LayoutDashboard,
  Layers3,
  ListOrdered,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Sparkles,
  UserCog,
  X,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { cn } from '../lib/cn';
import { useTour } from './Tour';
import { Button } from './ui/Button';
import CoBrand from './CoBrand';
import ErrorBoundary from './ErrorBoundary';
import { Aurora, ThemeToggle, useTheme } from './Theme';

import type { Resource } from '../lib/permissions';

interface NavItem {
  to: string;
  label: string;
  icon: typeof FileStack;
  hint: string;
  /** Hidden unless the user can view this resource. */
  resource: Resource;
  end?: boolean;
}

/**
 * Grouped by what the person is trying to do, not by which module the code
 * lives in: produce something, look something up, or configure the platform.
 */
/**
 * Grouped by the thing being worked on, not by which module the code lives in.
 *
 * "Documents" is everything you produce and have produced. "Projects &
 * Categories" is the structure those documents hang off — which is why Projects
 * sits beside its two category screens rather than under a generic Configure
 * heading. "Administration" is the admin-only surface.
 */
const GROUPS: { label: string; tour: string; items: NavItem[] }[] = [
  {
    label: 'Overview',
    tour: 'nav-overview',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, hint: 'Activity at a glance', resource: 'dashboard' },
    ],
  },
  {
    label: 'Documents',
    tour: 'nav-documents',
    items: [
      // GCL is the list of packages too — BOQ/WO/PAC belong to a GCL, so
      // splitting them into a separate menu only hid the relationship.
      { to: '/gcl', label: 'GCL documents', icon: FileSignature, hint: 'BOQ, Work Order, PAC', resource: 'gcl' },
      { to: '/mop', label: 'MOP documents', icon: ScrollText, hint: 'Method of Procedure', end: true, resource: 'mop' },
    ],
  },
  {
    label: 'Projects & Categories',
    tour: 'nav-projects',
    items: [
      { to: '/projects', label: 'Projects', icon: FolderKanban, hint: 'Add, edit, retire', resource: 'projects' },
      { to: '/categories/projects', label: 'Project categories', icon: FolderTree, hint: 'RMS, CCTV, SIM Swap…', resource: 'projectCategories' },
      { to: '/categories/mops', label: 'MOP categories', icon: Layers3, hint: 'Survey, Installation, PAT', resource: 'mopCategories' },
    ],
  },
  {
    label: 'Administration',
    tour: 'nav-admin',
    items: [
      { to: '/upl', label: 'Price list', icon: ListOrdered, hint: 'UPL versions', resource: 'priceList' },
      { to: '/users', label: 'Users', icon: UserCog, hint: 'Admins and PMs', resource: 'users' },
    ],
  },
];

export default function Shell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const { start } = useTour();
  const { resolved } = useTheme();
  const { user, can, logout } = useAuth();
  const location = useLocation();
  const nav = useNavigate();

  // Navigating on a phone should close the drawer, not leave it over the page.
  useEffect(() => setDrawer(false), [location.pathname]);

  // Stop the page scrolling behind the open drawer.
  useEffect(() => {
    document.body.style.overflow = drawer ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [drawer]);



  // A group disappears entirely when none of its items are permitted.
  const visibleGroups = GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => can(i.resource)),
  })).filter((g) => g.items.length > 0);

  /** Same list in the desktop rail and the mobile drawer — one source of truth. */
  const navList = (expanded: boolean) => (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5 no-scrollbar">
      {visibleGroups.map((group) => (
        <div key={group.label} data-tour={group.tour}>
          <AnimatePresence initial={false}>
        {expanded && (
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
        {group.items.map(({ to, label, icon: Icon, hint, end }) => (
          <NavLink key={to} to={to} end={end} title={!expanded ? label : undefined}>
            {({ isActive }) => (
              <span
            className={cn(
              'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors',
              isActive ? 'text-white' : 'text-fg-muted hover:bg-line/40 hover:text-fg',
            )}
              >
            {isActive && (
              <motion.span
                layoutId={expanded ? 'nav-active' : 'nav-active-mini'}
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                className="absolute inset-0 -z-10 rounded-xl bg-brand-gradient shadow-soft"
              />
            )}
            <Icon size={17} className="shrink-0" />
            <AnimatePresence initial={false}>
              {expanded && (
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
  );

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

        {navList(open)}

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

      {/* ---------- mobile drawer ---------- */}
      <AnimatePresence>
        {drawer && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawer(false)}
              className="fixed inset-0 z-40 bg-brand-950/50 backdrop-blur-sm lg:hidden"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 34 }}
              className="chrome fixed inset-y-0 left-0 z-50 flex w-[min(300px,85vw)] flex-col border-r border-line/60 lg:hidden"
            >
              <div className="flex h-[60px] items-center justify-between gap-2 px-4">
                <CoBrand compact />
                <button
                  onClick={() => setDrawer(false)}
                  className="rounded-lg p-2 text-fg-subtle transition hover:bg-line/50 hover:text-fg"
                  aria-label="Close menu"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="hairline" />

              {navList(true)}

              <div className="border-t border-line/60 p-3">
                <div className="mb-2 flex justify-center"><ThemeToggle /></div>
                <button
                  onClick={() => nav('/account')}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-line/50"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-gradient text-xs font-bold text-white">
                    {(user?.name ?? '?').slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-fg">{user?.name}</span>
                    <span className="block text-[11px] text-fg-subtle">{user?.role}</span>
                  </span>
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ---------- main column ---------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="chrome sticky top-0 z-20 border-b border-line/60">
          <div className="flex h-[60px] items-center gap-2 px-4 sm:gap-4 lg:h-[68px] lg:px-8">
            <button
              onClick={() => setDrawer(true)}
              className="-ml-1 rounded-lg p-2 text-fg-muted transition hover:bg-line/50 hover:text-fg lg:hidden"
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>

            <div className="min-w-0 flex-1">
              <h1 className="truncate text-sm font-semibold text-fg sm:text-[15px]">
                {titleFor(location.pathname)}
              </h1>
              <p className="hidden truncate text-[11px] text-fg-subtle sm:block">
                {subtitleFor(location.pathname)}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <div className="hidden sm:block">
                <ThemeToggle />
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={start}
                data-tour="help"
                className="hidden sm:inline-flex"
              >
                <CircleHelp size={14} /> <span className="hidden md:inline">Take the tour</span>
              </Button>

              <button
                onClick={() => nav('/account')}
                title="Your account"
                className="hidden items-center gap-2 rounded-xl border border-line bg-card/60 py-1 pl-1 pr-3 transition hover:border-cyan-brand/40 lg:flex"
              >
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-gradient text-[11px] font-bold text-white">
                  {(user?.name ?? '?').slice(0, 1).toUpperCase()}
                </span>
                <span className="text-left leading-tight">
                  <span className="block max-w-[120px] truncate text-xs font-medium text-fg">{user?.name}</span>
                  <span className="block text-[10px] text-fg-subtle">{user?.role}</span>
                </span>
              </button>

              <Button variant="ghost" size="icon" onClick={logout} title="Sign out">
                <LogOut size={15} />
              </Button>
            </div>
          </div>

        </header>

        <main className="flex-1 px-4 py-5 sm:px-5 sm:py-7 lg:px-8 lg:py-9">
          {/* Keyed so the fade replays per route, but with no exit animation to
              wait on — see .page-enter in index.css. */}
          <div key={location.pathname} className="page-enter mx-auto max-w-7xl">
            <ErrorBoundary resetKey={location.pathname}>{children}</ErrorBoundary>
          </div>
        </main>

        <footer className="px-4 pb-6 sm:px-5 lg:px-8">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 text-[11px] text-fg-subtle">
            <Sparkles size={12} />
            <span>Smart Life Advanced IT · Tawal document automation</span>
            <CoBrand
              compact
              className="ml-auto hidden opacity-60 grayscale transition hover:opacity-100 hover:grayscale-0 sm:flex"
            />
          </div>
        </footer>
      </div>
    </div>
  );
}

const TITLES: Record<string, [string, string]> = {
  '/dashboard': ['Dashboard', 'Activity across MOPs, packages and projects'],
  '/gcl': ['GCL documents', 'Handing Over GCLs and the documents built from them'],
  '/gcl/create': ['Create a GCL', "From the scope sheet on the project's WO request"],
  '/gcl/upload': ['Signed GCL', "Read from the project's PAT sign-off"],
  '/gcl/bulk': ['Bulk GCL', 'Many projects, one combined set of documents'],
  '/mop': ['MOP documents', 'Method of Procedure, grouped by project'],
  '/mop/new': ['New MOP', 'One site, or many from a spreadsheet'],
  '/packages': ['Packages', 'Every job and the documents generated for it'],
  '/upl': ['Unit Price List', 'The commercial reference behind every BOQ and Work Order'],
  '/projects': ['Projects', 'Add, edit and retire projects'],
  '/categories/projects': ['Project categories', 'The kinds of project you run'],
  '/categories/mops': ['MOP categories', 'Stages of work and the formats they produce'],
  '/users': ['Users', 'Admins and project managers'],
  '/account': ['Your account', 'Profile and password'],
};

const titleFor = (path: string) =>
  TITLES[path]?.[0] ?? (path.startsWith('/packages/') ? 'Package' : 'Smart Life DocGen');

const subtitleFor = (path: string) =>
  TITLES[path]?.[1] ?? (path.startsWith('/packages/') ? 'Review, price and generate' : '');
