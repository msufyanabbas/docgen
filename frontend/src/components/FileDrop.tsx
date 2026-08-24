import { motion } from 'framer-motion';
import { FileCheck2, UploadCloud } from 'lucide-react';
import { useRef, useState } from 'react';
import { cn } from '../lib/cn';

export default function FileDrop({
  accept,
  onFile,
  hint,
  file,
  compact = false,
  tour,
}: {
  accept: string;
  onFile: (f: File) => void;
  hint: string;
  file: File | null;
  compact?: boolean;
  tour?: string;
}) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  return (
    <motion.div
      data-tour={tour}
      whileHover={{ scale: 1.004 }}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      onClick={() => input.current?.click()}
      className={cn(
        'group relative cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed text-center transition-colors',
        compact ? 'px-5 py-7' : 'px-6 py-12',
        over
          ? 'border-cyan-brand bg-cyan-brand/[.06] shadow-glow'
          : file
            ? 'border-emerald-400/60 bg-emerald-400/10'
            : 'border-line bg-card/80 hover:border-cyan-brand/50 hover:bg-card',
      )}
    >
      {/* Sheen that sweeps across on hover. */}
      <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-cyan-brand/10 to-transparent transition-transform duration-700 group-hover:translate-x-full" />

      <input
        ref={input}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />

      <motion.span
        animate={over ? { y: -4 } : { y: 0 }}
        className={cn(
          'mx-auto mb-3 grid place-items-center rounded-2xl',
          compact ? 'h-10 w-10' : 'h-14 w-14',
          file ? 'bg-emerald-400/15 text-emerald-500' : 'bg-line/40 text-fg-subtle',
        )}
      >
        {file ? <FileCheck2 size={compact ? 18 : 24} /> : <UploadCloud size={compact ? 18 : 24} />}
      </motion.span>

      <p className="text-sm font-semibold text-fg">
        {file ? file.name : 'Drop a file here, or click to browse'}
      </p>
      <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-fg-subtle">{hint}</p>
    </motion.div>
  );
}
