import { cva, type VariantProps } from 'class-variance-authority';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/cn';

const button = cva(
  'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl ' +
    'font-medium transition-colors outline-none focus-visible:ring-4 focus-visible:ring-cyan-brand/25 ' +
    'disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-brand-800 text-white shadow-soft hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-400',
        gradient:
          'bg-brand-gradient bg-[length:200%_100%] bg-left text-white shadow-lift ' +
          'transition-[background-position] duration-500 hover:bg-right',
        outline: 'border border-line bg-card/70 text-fg-muted hover:border-fg-subtle/50 hover:bg-card',
        ghost: 'text-fg-muted hover:bg-line/40',
        subtle: 'bg-line/40 text-fg-muted hover:bg-line/60',
        danger: 'bg-rose-600 text-white shadow-soft hover:bg-rose-700',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-[15px]',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends Omit<HTMLMotionProps<'button'>, 'children'>,
    VariantProps<typeof button> {
  loading?: boolean;
  children?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, children, disabled, ...props }, ref) => (
    <motion.button
      ref={ref}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className={cn(button({ variant, size }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 size={15} className="animate-spin" />}
      {children}
    </motion.button>
  ),
);
Button.displayName = 'Button';
