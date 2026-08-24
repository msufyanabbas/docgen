import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, Sparkles, X } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from './ui/Button';

/**
 * A guided tour that spotlights real elements rather than showing screenshots.
 *
 * Targets are matched with `data-tour="id"` attributes on the live DOM, so the
 * tour cannot drift out of sync with the UI — if an element is renamed the step
 * is skipped instead of pointing at nothing.
 */

export interface TourStep {
  id: string;
  title: string;
  body: ReactNode;
  /** `data-tour` value to spotlight. Omit for a centred, page-level step. */
  target?: string;
  /** Navigate here before showing the step. */
  route?: string;
  placement?: 'top' | 'bottom' | 'left' | 'right';
}

const STORAGE_KEY = 'docgen.tour.completed.v1';

const STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Smart Life DocGen',
    body: (
      <>
        This turns Tawal paperwork into a two-minute job. Let me show you around —
        it takes about 40 seconds.
      </>
    ),
  },
  {
    id: 'nav',
    title: 'Two ways in, one pipeline',
    body: (
      <>
        <b>Create GCL</b> starts from an approved scope sheet. <b>Upload GCL</b> starts
        from a GCL that has already been signed. Both end up in the same place.
      </>
    ),
    target: 'nav',
    placement: 'right',
    route: '/create-gcl',
  },
  {
    id: 'pipeline',
    title: 'The pipeline, always visible',
    body: <>Every package moves through these five documents. The lit segments are done.</>,
    target: 'pipeline',
    placement: 'bottom',
  },
  {
    id: 'drop',
    title: 'Start by dropping a file',
    body: (
      <>
        Drag the scope sheet in, or click to browse. Nothing is saved yet — you get a
        full preview of what was read before anything is committed.
      </>
    ),
    target: 'dropzone',
    placement: 'bottom',
  },
  {
    id: 'library',
    title: 'Everything you make lives here',
    body: (
      <>
        Packages keeps every job with its documents. <b>Price List</b> holds the UPL that
        drives the pricing — import a new version whenever Tawal issues one.
      </>
    ),
    target: 'nav-library',
    placement: 'right',
  },
  {
    id: 'help',
    title: 'And that is it',
    body: <>Need this again? The help button reopens the tour at any time.</>,
    target: 'help',
    placement: 'bottom',
  },
];

interface TourApi {
  start: () => void;
  running: boolean;
}
const TourContext = createContext<TourApi>({ start: () => {}, running: false });
export const useTour = () => useContext(TourContext);

type Rect = { top: number; left: number; width: number; height: number };

export function TourProvider({ children }: { children: ReactNode }) {
  const [index, setIndex] = useState<number | null>(null);
  const nav = useNavigate();
  const location = useLocation();

  // Auto-start once, on first ever visit.
  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY)) return;
    const t = setTimeout(() => setIndex(0), 900);
    return () => clearTimeout(t);
  }, []);

  const step = index === null ? null : STEPS[index];

  const finish = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    setIndex(null);
  }, []);

  const go = useCallback(
    (next: number) => {
      if (next < 0 || next >= STEPS.length) return finish();
      const target = STEPS[next];
      if (target.route && location.pathname !== target.route) nav(target.route);
      setIndex(next);
    },
    [finish, location.pathname, nav],
  );

  const api = useMemo<TourApi>(
    () => ({ start: () => go(0), running: index !== null }),
    [go, index],
  );

  return (
    <TourContext.Provider value={api}>
      {children}
      <AnimatePresence>
        {step && (
          <TourOverlay
            key={step.id}
            step={step}
            index={index!}
            total={STEPS.length}
            onNext={() => go(index! + 1)}
            onBack={() => go(index! - 1)}
            onClose={finish}
          />
        )}
      </AnimatePresence>
    </TourContext.Provider>
  );
}

/** Below this width the popover becomes a bottom sheet — a floating card can't
 *  fit beside a spotlight on a phone without spilling off-screen. */
const MOBILE_BREAKPOINT = 640;

function useIsMobile() {
  const [mobile, setMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT,
  );
  useEffect(() => {
    const onResize = () => setMobile(window.innerWidth < MOBILE_BREAKPOINT);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return mobile;
}

function TourOverlay({
  step,
  index,
  total,
  onNext,
  onBack,
  onClose,
}: {
  step: TourStep;
  index: number;
  total: number;
  onNext: () => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const [rect, setRect] = useState<Rect | null>(null);
  const isMobile = useIsMobile();

  // Measure after paint (and on resize/scroll) so the spotlight tracks the element.
  // On mobile the sheet occupies the lower third, so scroll targets to the top area.
  useLayoutEffect(() => {
    if (!step.target) {
      setRect(null);
      return;
    }

    const measure = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      // Hidden (e.g. the desktop-only sidebar on a phone) -> centre the card instead
      // of spotlighting a zero-size box.
      if (!el || el.offsetParent === null) return setRect(null);
      el.scrollIntoView({ block: window.innerWidth < MOBILE_BREAKPOINT ? 'start' : 'center', behavior: 'smooth' });
      const r = el.getBoundingClientRect();
      setRect({ top: r.top - 8, left: r.left - 8, width: r.width + 16, height: r.height + 16 });
    };

    const t = setTimeout(measure, 260); // let route changes and scrolling settle
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [step.target, step.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' || e.key === 'Enter') onNext();
      if (e.key === 'ArrowLeft') onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onNext, onBack, onClose]);

  const last = index === total - 1;
  const card = isMobile ? undefined : cardPosition(rect, step.placement);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100]"
    >
      {/* Dimmer with a hole punched over the target, via an SVG mask. */}
      <svg className="absolute inset-0 h-full w-full" onClick={onClose}>
        <defs>
          <mask id="tour-mask">
            <rect width="100%" height="100%" fill="white" />
            {rect && (
              <motion.rect
                initial={false}
                animate={{ x: rect.left, y: rect.top, width: rect.width, height: rect.height }}
                transition={{ type: 'spring', stiffness: 320, damping: 34 }}
                rx={16}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(20,16,51,.62)" mask="url(#tour-mask)" />
      </svg>

      {rect && (
        <motion.div
          initial={false}
          animate={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
          transition={{ type: 'spring', stiffness: 320, damping: 34 }}
          className="pointer-events-none absolute rounded-2xl ring-2 ring-cyan-brand animate-pulse-ring"
        />
      )}

      <motion.div
        key={step.id}
        initial={isMobile ? { opacity: 0, y: 40 } : { opacity: 0, y: 12, scale: 0.98 }}
        animate={isMobile ? { opacity: 1, y: 0 } : { opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        style={card}
        className={
          isMobile
            ? 'fixed inset-x-0 bottom-0 max-h-[70vh] overflow-y-auto rounded-t-3xl border-t border-white/20 bg-card p-5 pb-[max(20px,env(safe-area-inset-bottom))] shadow-lift'
            : 'absolute w-[min(360px,calc(100vw-32px))] rounded-2xl border border-white/20 bg-card p-5 shadow-lift'
        }
      >
        {isMobile && <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />}
        <div className="flex items-start justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-gradient px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
            <Sparkles size={11} /> Step {index + 1} of {total}
          </span>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-fg-subtle transition hover:bg-line/50 hover:text-fg-muted"
            aria-label="Close tour"
          >
            <X size={15} />
          </button>
        </div>

        <h3 className="mt-3 text-base font-semibold text-fg">{step.title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{step.body}</p>

        <div className="mt-4 flex items-center gap-1.5">
          {Array.from({ length: total }).map((_, i) => (
            <span
              key={i}
              className={
                'h-1 rounded-full transition-all ' +
                (i === index ? 'w-6 bg-brand-gradient' : 'w-1.5 bg-brand-200')
              }
            />
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <button onClick={onClose} className="text-xs font-medium text-fg-subtle hover:text-fg-muted">
            Skip tour
          </button>
          <div className="flex gap-2">
            {index > 0 && (
              <Button variant="ghost" size="sm" onClick={onBack}>
                <ArrowLeft size={14} /> Back
              </Button>
            )}
            <Button variant="gradient" size="sm" onClick={onNext}>
              {last ? (<><Check size={14} /> Got it</>) : (<>Next <ArrowRight size={14} /></>)}
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/** Places the card beside the spotlight, clamped inside the viewport. */
function cardPosition(rect: Rect | null, placement: TourStep['placement'] = 'bottom') {
  const W = 360;
  const H = 250;
  const pad = 16;

  if (!rect) {
    return { top: '50%', left: '50%', transform: 'translate(-50%,-50%)' } as const;
  }

  let top = rect.top + rect.height + 14;
  let left = rect.left;

  if (placement === 'top') top = rect.top - H - 14;
  if (placement === 'right') {
    top = rect.top;
    left = rect.left + rect.width + 14;
  }
  if (placement === 'left') {
    top = rect.top;
    left = rect.left - W - 14;
  }

  top = Math.min(Math.max(pad, top), window.innerHeight - H - pad);
  left = Math.min(Math.max(pad, left), window.innerWidth - W - pad);
  return { top, left };
}
