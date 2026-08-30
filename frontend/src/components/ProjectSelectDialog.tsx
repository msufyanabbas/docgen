import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import ExternalProjectPicker from './ExternalProjectPicker';
import { Button } from './ui/Button';
import type { ExternalProject } from '../lib/types';

/**
 * A GCL always belongs to a project, so the choice is made before the form
 * opens rather than being one field among many that can be left blank.
 */
export default function ProjectSelectDialog({
  open,
  stage,
  onClose,
  onConfirm,
}: {
  open: boolean;
  stage: 'create' | 'upload';
  onClose: () => void;
  onConfirm: (project: ExternalProject) => void;
}) {
  const [selected, setSelected] = useState<ExternalProject | null>(null);

  useEffect(() => {
    if (open) setSelected(null);
  }, [open, stage]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[60] bg-brand-950/55 backdrop-blur-sm"
          />

          {/* Wrapper does the centring; the panel does the animating. Framer sets
              `transform` on the animated element, which would otherwise cancel
              Tailwind's -translate-x-1/2 / -translate-y-1/2 and leave the dialog
              hanging off the bottom-right. */}
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              role="dialog"
              aria-modal="true"
              className="pointer-events-auto flex max-h-[85vh] w-full max-w-[620px] flex-col
                         overflow-hidden rounded-2xl border border-white/20 bg-card shadow-lift"
            >
            {/* header — fixed */}
            <div className="flex items-start justify-between gap-3 border-b border-line/60 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-fg">
                  {stage === 'create' ? 'Create a GCL' : 'Upload a signed GCL'}
                </h2>
                <p className="mt-0.5 text-xs text-fg-muted">
                  {stage === 'create'
                    ? 'Pick a project — its scope sheet is read straight from the tracker.'
                    : 'Choose the project this signed GCL belongs to.'}
                </p>
              </div>
              <button
                onClick={onClose}
                className="shrink-0 rounded-lg p-1.5 text-fg-subtle transition hover:bg-line/50 hover:text-fg"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            {/* body — the only part that scrolls */}
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <ExternalProjectPicker
                stage={stage}
                value={selected?.siteId ?? null}
                onChange={(_siteId, project) => setSelected(project)}
                fill
              />
            </div>

            {/* footer — always visible, whatever the list length */}
            <div className="flex items-center justify-between gap-2 border-t border-line/60 px-5 py-4">
              <span className="truncate text-xs text-fg-subtle">
                {selected ? `Selected ${selected.siteId}` : 'Select a project to continue'}
              </span>
              <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button
                variant="gradient"
                disabled={!selected}
                onClick={() => selected && onConfirm(selected)}
              >
                Continue <ArrowRight size={15} />
                </Button>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
