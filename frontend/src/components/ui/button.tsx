import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-500 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-brand-900 text-white shadow-sm hover:bg-brand-800 active:bg-brand-950 disabled:bg-brand-900/50',
        secondary: 'bg-sand text-brand-900 hover:bg-line active:bg-line/80',
        outline: 'border border-brand-900/15 bg-white text-brand-900 hover:border-brand-900/40 hover:bg-brand-50/60',
        ghost: 'text-brand-900 hover:bg-brand-900/5',
        gold: 'bg-gold-500 text-brand-950 hover:bg-gold-400 active:bg-gold-600',
        destructive: 'bg-red-600 text-white hover:bg-red-700',
        link: 'text-brand-900 underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-11 rounded-xl px-5 text-sm',
        sm: 'h-9 rounded-lg px-3.5 text-[13px]',
        lg: 'h-13 rounded-xl px-7 text-[15px]',
        icon: 'size-10 rounded-xl',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />;
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
