import { motion } from 'framer-motion';
import { Check, FileSignature, FileSpreadsheet, FileText, ScrollText, Table2 } from 'lucide-react';
import { cn } from '../lib/cn';

const STAGES = [
  { key: 'GCL_PDF', label: 'GCL', icon: FileSignature },
  { key: 'BOQ_XLSX', label: 'As-Built BOQ', icon: Table2 },
  { key: 'BOQ_PDF', label: 'BOQ PDF', icon: FileText },
  { key: 'WO_XLSX', label: 'Work Order', icon: FileSpreadsheet },
  { key: 'PAC_PDF', label: 'PAC', icon: ScrollText },
];

/**
 * The five documents a package produces, lit up as they are generated.
 * Gives people a sense of where a job stands without reading a table.
 */
export default function Pipeline({ done = [] }: { done?: string[] }) {
  return (
    <div data-tour="pipeline" className="surface overflow-hidden">
      <div className="flex items-stretch overflow-x-auto no-scrollbar">
        {STAGES.map((s, i) => {
          const complete = done.includes(s.key);
          const Icon = s.icon;
          return (
            <div key={s.key} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3.5">
              <motion.span
                initial={false}
                animate={{ scale: complete ? 1 : 0.94 }}
                transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                className={cn(
                  'grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-colors',
                  complete
                    ? 'bg-brand-gradient bg-[length:200%_auto] text-white shadow-soft animate-gradient-pan'
                    : 'bg-line/40 text-fg-subtle',
                )}
              >
                {complete ? <Check size={16} /> : <Icon size={16} />}
              </motion.span>

              <div className="min-w-0">
                <div className={cn('truncate text-xs font-semibold', complete ? 'text-fg' : 'text-fg-subtle')}>
                  {s.label}
                </div>
                <div className="text-[10px] text-fg-subtle">{complete ? 'Ready' : 'Pending'}</div>
              </div>

              {i < STAGES.length - 1 && (
                <span className="ml-auto hidden h-8 w-px bg-line/50 sm:block" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
