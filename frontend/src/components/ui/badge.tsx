import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide',
  {
    variants: {
      variant: {
        default: 'bg-sand text-slate-warm',
        gold: 'bg-gold-100 text-gold-800',
        success: 'bg-emerald-50 text-emerald-700',
        destructive: 'bg-red-50 text-red-700',
        brand: 'bg-brand-900 text-white',
        outline: 'border border-line bg-white/80 text-slate-warm',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
