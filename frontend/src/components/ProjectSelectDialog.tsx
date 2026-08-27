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

          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            role="dialog"
            aria-modal="true"
            className="fixed inset-x-0 bottom-0 z-[70] max-h-[88vh] overflow-y-auto rounded-t-3xl border-t border-white/20 bg-card p-5 shadow-lift
                       sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[min(560px,calc(100vw-32px))]
                       sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line sm:hidden" />

            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-fg">
                  {stage === 'create' ? 'Create a GCL' : 'Upload a signed GCL'}
                </h2>
                <p className="mt-0.5 text-xs text-fg-muted">
                  Choose the project this GCL belongs to.
                </p>
              </div>
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-fg-subtle transition hover:bg-line/50 hover:text-fg"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-4">
              <ExternalProjectPicker
                stage={stage}
                value={selected?.siteId ?? null}
                onChange={(_siteId, project) => setSelected(project)}
              />
            </div>

            <div className="mt-5 flex items-center justify-end gap-2 border-t border-line/60 pt-4">
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button
                variant="gradient"
                disabled={!selected}
                onClick={() => selected && onConfirm(selected)}
              >
                Continue <ArrowRight size={15} />
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
