import { cva, type VariantProps } from 'class-variance-authority';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

const badge = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide',
  {
    variants: {
      tone: {
        neutral: 'bg-line/60 text-fg-muted',
        brand: 'bg-brand-gradient text-white',
        cyan: 'bg-cyan-brand/15 text-cyan-brand',
        orchid: 'bg-orchid-brand/15 text-orchid-brand',
        success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300',
        warn: 'bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300',
        danger: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export function Badge({
  tone,
  className,
  children,
}: VariantProps<typeof badge> & { className?: string; children: ReactNode }) {
  return <span className={cn(badge({ tone }), className)}>{children}</span>;
}

const STATUS_TONE = {
  DRAFT: 'neutral',
  READY: 'cyan',
  GENERATED: 'success',
} as const;

export const StatusBadge = ({ status }: { status: string }) => (
  <Badge tone={(STATUS_TONE as any)[status] ?? 'neutral'}>{status}</Badge>
);
