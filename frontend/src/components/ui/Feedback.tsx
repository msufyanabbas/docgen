import { motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-fg-muted">
      <Loader2 size={15} className="animate-spin" />
      {label ?? 'Working…'}
    </span>
  );
}

const KINDS = {
  info: { cls: 'border-cyan-brand/30 bg-cyan-brand/[.08] text-fg', Icon: Info },
  warn: {
    cls: 'border-amber-300/60 bg-amber-50 text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200',
    Icon: AlertTriangle,
  },
  error: {
    cls: 'border-rose-300/60 bg-rose-50 text-rose-900 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-200',
    Icon: XCircle,
  },
  success: {
    cls: 'border-emerald-300/60 bg-emerald-50 text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200',
    Icon: CheckCircle2,
  },
} as const;

export function Alert({
  kind = 'info',
  title,
  children,
}: {
  kind?: keyof typeof KINDS;
  title?: string;
  children: ReactNode;
}) {
  const { cls, Icon } = KINDS[kind];
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('flex gap-3 rounded-xl border px-4 py-3 text-sm shadow-sm', cls)}
    >
      <Icon size={17} className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        {title && <div className="font-semibold">{title}</div>}
        <div className={title ? 'mt-0.5' : ''}>{children}</div>
      </div>
    </motion.div>
  );
}

export function Empty({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="surface grid place-items-center px-6 py-16 text-center">
      {icon && (
        <span className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-line/40 text-fg-subtle">
          {icon}
        </span>
      )}
      <div className="max-w-sm text-sm text-fg-muted">{children}</div>
    </div>
  );
}

export const Skeleton = ({ className }: { className?: string }) => (
  <div className={cn('shimmer rounded-lg', className)} />
);
