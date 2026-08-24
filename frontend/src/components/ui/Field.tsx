import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function Field({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="mt-1.5 text-[11px] leading-relaxed text-fg-subtle">{hint}</p>}
    </div>
  );
}

export const Input = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input {...props} className={cn('field', props.className)} />
);

export const Select = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...props} className={cn('field cursor-pointer', props.className)} />
);

export const Textarea = (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea {...props} className={cn('field resize-y', props.className)} />
);

export function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm text-fg-muted">
      <span
        onClick={(e) => {
          e.preventDefault();
          onChange(!checked);
        }}
        className={cn(
          'grid h-[18px] w-[18px] place-items-center rounded-md border transition-all',
          checked ? 'border-transparent bg-brand-gradient' : 'border-line bg-card hover:border-fg-subtle/50',
        )}
      >
        {checked && (
          <svg viewBox="0 0 14 14" className="h-3 w-3 text-white" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M2 7.5 5.5 11 12 3.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only" />
      {label}
    </label>
  );
}
