import { AnimatePresence, motion } from 'framer-motion';
import { Check, Eraser, ImageUp, PenLine, RotateCcw, Trash2 } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { cn } from '../lib/cn';
import { Button } from './ui/Button';

/**
 * Signature capture — draw with a finger/stylus/mouse, or upload a scan.
 *
 * The pad is always light "paper" regardless of app theme, and the ink is always
 * dark: the output is stamped onto a white PDF, so a theme-coloured signature
 * would be wrong. Strokes are kept as point arrays rather than baked pixels, which
 * is what makes undo and crisp re-rendering at export resolution possible.
 */

const INK = '#141033';
const EXPORT_SCALE = 3; // export well above display size so print stays sharp

type Point = { x: number; y: number };
type Stroke = Point[];

export interface SignatureInputProps {
  onChange: (file: File | null) => void;
  /** Existing signature to show as the starting state (e.g. from the server). */
  initialPreview?: string | null;
  label?: string;
}

export default function SignatureInput({ onChange, initialPreview, label }: SignatureInputProps) {
  const [mode, setMode] = useState<'draw' | 'upload'>('draw');
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [uploaded, setUploaded] = useState<{ file: File; url: string } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const drawing = useRef(false);
  const current = useRef<Stroke>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  /* ----------------------------------------------------------- rendering */

  const paint = useCallback((all: Stroke[], live: Stroke) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const stroke of [...all, live]) {
      if (stroke.length < 2) {
        if (stroke.length === 1) {
          ctx.beginPath();
          ctx.arc(stroke[0].x, stroke[0].y, 1.2, 0, Math.PI * 2);
          ctx.fillStyle = INK;
          ctx.fill();
        }
        continue;
      }
      // Quadratic through midpoints — smooths the jitter of raw pointer samples.
      ctx.beginPath();
      ctx.moveTo(stroke[0].x, stroke[0].y);
      for (let i = 1; i < stroke.length - 1; i++) {
        const mid = {
          x: (stroke[i].x + stroke[i + 1].x) / 2,
          y: (stroke[i].y + stroke[i + 1].y) / 2,
        };
        ctx.quadraticCurveTo(stroke[i].x, stroke[i].y, mid.x, mid.y);
      }
      ctx.lineTo(stroke[stroke.length - 1].x, stroke[stroke.length - 1].y);
      ctx.stroke();
    }
  }, []);

  // Keep the backing store matched to CSS size × DPR, or strokes look furry.
  useLayoutEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      if (!canvas || !wrap) return;
      const dpr = window.devicePixelRatio || 1;
      const { width, height } = wrap.getBoundingClientRect();
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      paint(strokes, []);
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [paint, strokes]);

  useEffect(() => {
    paint(strokes, []);
  }, [strokes, paint]);

  /* -------------------------------------------------------------- input */

  const pointFrom = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    current.current = [pointFrom(e)];
    paint(strokes, current.current);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    current.current.push(pointFrom(e));
    paint(strokes, current.current);
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (current.current.length) setStrokes((s) => [...s, current.current]);
    current.current = [];
  };

  /* -------------------------------------------------------------- export */

  /** Redraws at export scale, trims the empty margin, returns a transparent PNG. */
  const exportPng = useCallback(async (): Promise<File | null> => {
    const canvas = canvasRef.current;
    if (!canvas || !strokes.length) return null;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    const off = document.createElement('canvas');
    off.width = Math.round(w * EXPORT_SCALE);
    off.height = Math.round(h * EXPORT_SCALE);
    const ctx = off.getContext('2d')!;
    ctx.scale(EXPORT_SCALE, EXPORT_SCALE);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const stroke of strokes) {
      if (stroke.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(stroke[0].x, stroke[0].y);
      for (let i = 1; i < stroke.length - 1; i++) {
        const mid = {
          x: (stroke[i].x + stroke[i + 1].x) / 2,
          y: (stroke[i].y + stroke[i + 1].y) / 2,
        };
        ctx.quadraticCurveTo(stroke[i].x, stroke[i].y, mid.x, mid.y);
      }
      ctx.lineTo(stroke[stroke.length - 1].x, stroke[stroke.length - 1].y);
      ctx.stroke();
    }

    // Trim transparent margin so the signature scales predictably in the PDF cell.
    const { data } = ctx.getImageData(0, 0, off.width, off.height);
    let minX = off.width;
    let minY = off.height;
    let maxX = 0;
    let maxY = 0;
    for (let y = 0; y < off.height; y++) {
      for (let x = 0; x < off.width; x++) {
        if (data[(y * off.width + x) * 4 + 3] > 8) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX <= minX || maxY <= minY) return null;

    const pad = 8;
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(off.width - 1, maxX + pad);
    maxY = Math.min(off.height - 1, maxY + pad);

    const trimmed = document.createElement('canvas');
    trimmed.width = maxX - minX + 1;
    trimmed.height = maxY - minY + 1;
    trimmed
      .getContext('2d')!
      .drawImage(off, minX, minY, trimmed.width, trimmed.height, 0, 0, trimmed.width, trimmed.height);

    const blob = await new Promise<Blob | null>((res) => trimmed.toBlob(res, 'image/png'));
    return blob ? new File([blob], 'signature.png', { type: 'image/png' }) : null;
  }, [strokes]);

  // Publish whenever the drawing settles.
  useEffect(() => {
    if (mode !== 'draw') return;
    let cancelled = false;
    if (!strokes.length) {
      onChange(null);
      return;
    }
    exportPng().then((f) => {
      if (!cancelled) onChange(f);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes, mode, exportPng]);

  const pickFile = (f: File) => {
    if (uploaded) URL.revokeObjectURL(uploaded.url);
    const entry = { file: f, url: URL.createObjectURL(f) };
    setUploaded(entry);
    onChange(f);
  };

  /** Each mode keeps its own state, so switching republishes whatever that mode holds. */
  const switchMode = (m: 'draw' | 'upload') => {
    setMode(m);
    if (m === 'draw') {
      strokes.length ? exportPng().then(onChange) : onChange(null);
    } else {
      onChange(uploaded?.file ?? null);
    }
  };

  // Release the preview blob when the component goes away.
  useEffect(
    () => () => {
      if (uploaded) URL.revokeObjectURL(uploaded.url);
    },
    [uploaded],
  );

  const hasInk = strokes.length > 0;

  return (
    <div>
      {label && <label className="label">{label}</label>}

      <div className="surface overflow-hidden">
        {/* mode switch */}
        <div className="flex items-center gap-1 border-b border-line/60 p-2">
          {([
            ['draw', 'Draw', PenLine],
            ['upload', 'Upload image', ImageUp],
          ] as const).map(([key, text, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => switchMode(key)}
              className={cn(
                'relative flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                mode === key ? 'text-white' : 'text-fg-subtle hover:text-fg',
              )}
            >
              {mode === key && (
                <motion.span
                  layoutId="sig-mode"
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  className="absolute inset-0 -z-10 rounded-lg bg-brand-gradient"
                />
              )}
              <Icon size={13} /> {text}
            </button>
          ))}

          <div className="ml-auto flex items-center gap-1">
            <AnimatePresence>
              {mode === 'draw' && hasInk && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="flex items-center gap-1"
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    onClick={() => setStrokes((s) => s.slice(0, -1))}
                    title="Undo last stroke"
                  >
                    <RotateCcw size={13} /> Undo
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    onClick={() => setStrokes([])}
                    title="Clear"
                  >
                    <Eraser size={13} /> Clear
                  </Button>
                </motion.span>
              )}
            </AnimatePresence>

            {mode === 'upload' && uploaded && (
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => {
                  URL.revokeObjectURL(uploaded.url);
                  setUploaded(null);
                  onChange(null);
                }}
              >
                <Trash2 size={13} /> Remove
              </Button>
            )}
          </div>
        </div>

        {/* pad / preview */}
        <AnimatePresence mode="wait">
          {mode === 'draw' ? (
            <motion.div
              key="draw"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-3"
            >
              <div
                ref={wrapRef}
                className="relative h-44 w-full overflow-hidden rounded-xl border border-line bg-white"
              >
                <canvas
                  ref={canvasRef}
                  onPointerDown={start}
                  onPointerMove={move}
                  onPointerUp={end}
                  onPointerLeave={end}
                  onPointerCancel={end}
                  className="absolute inset-0 cursor-crosshair touch-none"
                />

                {/* signing rule + prompt, hidden once there is ink */}
                {!hasInk && (
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-end pb-6">
                    <span className="mb-2 text-xs text-slate-400">Sign here</span>
                    <span className="h-px w-3/5 bg-slate-300" />
                  </div>
                )}
              </div>

              <p className="mt-2 text-[11px] text-fg-subtle">
                Draw with a finger, stylus or mouse. Exported as a trimmed transparent PNG at 3× so
                it stays sharp in print.
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="upload"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-3"
            >
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) pickFile(f);
                  e.target.value = '';
                }}
              />

              <div
                onClick={() => fileInput.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) pickFile(f);
                }}
                className="grid h-44 cursor-pointer place-items-center rounded-xl border-2 border-dashed border-line bg-white transition hover:border-cyan-brand/60"
              >
                {uploaded ? (
                  <img src={uploaded.url} alt="signature" className="max-h-36 max-w-[80%] object-contain" />
                ) : initialPreview ? (
                  <img src={initialPreview} alt="signature" className="max-h-36 max-w-[80%] object-contain" />
                ) : (
                  <span className="flex flex-col items-center gap-2 text-slate-400">
                    <ImageUp size={22} />
                    <span className="text-xs">Drop a scan here, or click to browse</span>
                  </span>
                )}
              </div>

              <p className="mt-2 text-[11px] text-fg-subtle">
                PNG or JPEG. A transparent PNG sits best over the form.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* status */}
        <div className="flex items-center gap-2 border-t border-line/60 px-4 py-2.5 text-[11px]">
          {(mode === 'draw' && hasInk) || (mode === 'upload' && uploaded) ? (
            <span className="flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
              <Check size={13} /> Signature ready
            </span>
          ) : (
            <span className="text-fg-subtle">No signature yet — it can be added later too.</span>
          )}
        </div>
      </div>
    </div>
  );
}
