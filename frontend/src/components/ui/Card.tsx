import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function Card({
  className,
  children,
  delay = 0,
  hover = false,
}: {
  className?: string;
  children: ReactNode;
  delay?: number;
  hover?: boolean;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
      className={cn('surface', hover && 'transition-all hover:-translate-y-0.5 hover:shadow-lift', className)}
    >
      {children}
    </motion.section>
  );
}

export function CardHead({
  title,
  hint,
  icon,
  actions,
}: {
  title: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="surface-head">
      <div className="flex items-center gap-3">
        {icon && (
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-gradient bg-[length:200%_auto] text-white shadow-soft animate-gradient-pan">
            {icon}
          </span>
        )}
        <div>
          <h2 className="text-sm font-semibold text-fg">{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-fg-subtle">{hint}</p>}
        </div>
      </div>
      {actions}
    </header>
  );
}
