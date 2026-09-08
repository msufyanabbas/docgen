import { AnimatePresence, motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { Button } from './Button';

interface Props {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * A yes/no gate for an action that cannot be undone.
 *
 * The panel animates on mount and unmount only — there is no keyed swap that
 * could leave it stuck invisible, which is the failure the page transitions hit
 * earlier (see .page-enter in index.css).
 */
export default function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  onConfirm,
  onCancel,
}: Props) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />

          <motion.div
            className="surface relative w-full max-w-md p-5 shadow-xl"
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            <h2 className="text-base font-semibold text-fg">{title}</h2>
            {children && <div className="mt-2 text-sm text-fg-muted">{children}</div>}

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={onCancel}>
                {cancelLabel}
              </Button>
              <Button
                variant={tone === 'danger' ? 'danger' : 'gradient'}
                onClick={onConfirm}
              >
                {confirmLabel}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
