import { motion } from 'framer-motion';
import { Calculator, Check } from 'lucide-react';
import { cn } from '../lib/cn';
import { money } from '../lib/api';

export interface QuantityFieldOption {
  key: string;
  label: string;
  total?: number;
  quantity?: number;
}

/**
 * Which column the money is calculated from.
 *
 * The columns come from whatever was actually parsed, with their printed
 * headings — so a document that labels things differently still works, and the
 * person choosing can see what each option costs before committing.
 */
export default function QuantityFieldPicker({
  columns,
  value,
  onChange,
  currency = 'SAR',
  hint,
}: {
  columns: QuantityFieldOption[];
  value: string | null;
  onChange: (key: string) => void;
  currency?: string;
  hint?: string;
}) {
  if (!columns.length) return null;

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <Calculator size={14} className="text-fg-subtle" />
        <span className="text-[11px] font-semibold uppercase tracking-[.08em] text-fg-subtle">
          Calculate from
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {columns.map((c) => {
          const active = value === c.key;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => onChange(c.key)}
              className={cn(
                'relative overflow-hidden rounded-xl border px-4 py-3 text-left transition-all',
                active
                  ? 'border-cyan-brand bg-cyan-brand/10 ring-1 ring-cyan-brand'
                  : 'border-line bg-card/60 hover:border-fg-subtle/40 hover:bg-card',
              )}
            >
              {active && (
                <motion.span
                  layoutId="qty-field-check"
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  className="absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full bg-brand-gradient text-white"
                >
                  <Check size={12} />
                </motion.span>
              )}

              <div className="pr-7 text-sm font-semibold text-fg">{c.label}</div>

              {c.total !== undefined && (
                <div className="mt-1 text-xs text-fg-muted">{money(c.total, currency)}</div>
              )}
              {c.quantity !== undefined && (
                <div className="text-[11px] text-fg-subtle">
                  {c.quantity.toFixed(2)} units total
                </div>
              )}
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-fg-subtle">
        {hint ??
          'These are the numeric columns found in the document, labelled as they are printed on it. Whichever you pick drives the BOQ, Work Order and PAC totals — and it can be changed later.'}
      </p>
    </div>
  );
}
