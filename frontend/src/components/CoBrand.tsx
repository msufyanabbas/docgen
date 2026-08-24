import { AnimatePresence, motion } from 'framer-motion';
import { useTheme } from './Theme';
import { cn } from '../lib/cn';

/**
 * Smart Life × Tawal lockup.
 *
 * Both marks ship in two tints. The Smart Life wordmark is #1D174C — the same
 * navy as the dark canvas — and the mark's core is nearly as dark, so the dark
 * variant lifts the wordmark to near-white and the core toward violet while
 * leaving the magenta and cyan alone. Tawal's wordmark is near-black for the
 * same reason.
 */
export default function CoBrand({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const { resolved } = useTheme();
  const dark = resolved === 'dark';

  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={cn('flex items-center', compact ? 'gap-2' : 'gap-3', className)}
    >
      <span className={cn('relative block', compact ? 'h-6' : 'h-7')}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.img
            key={dark ? 'sl-dark' : 'sl-light'}
            src={dark ? '/brand/smartlife-logo-dark.png' : '/brand/smartlife-logo.png'}
            alt="Smart Life"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, position: 'absolute' }}
            transition={{ duration: 0.25 }}
            className={cn('left-0 top-0 w-auto object-contain', compact ? 'h-6' : 'h-7')}
          />
        </AnimatePresence>
      </span>

      <span
        className={cn(
          'select-none font-light leading-none text-fg-subtle',
          compact ? 'text-sm' : 'text-base',
        )}
        aria-hidden
      >
        ×
      </span>

      <span className={cn('relative block', compact ? 'h-3.5' : 'h-4')}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.img
            key={dark ? 'tw-dark' : 'tw-light'}
            src={dark ? '/brand/tawal-logo-dark.png' : '/brand/tawal-logo.png'}
            alt="Tawal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, position: 'absolute' }}
            transition={{ duration: 0.25 }}
            className={cn('left-0 top-0 w-auto object-contain', compact ? 'h-3.5' : 'h-4')}
          />
        </AnimatePresence>
      </span>
    </motion.div>
  );
}
