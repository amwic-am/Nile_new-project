import * as React from 'react';
import { cn } from '@/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        'flex h-11 w-full rounded-xl border border-input bg-white px-3.5 text-sm text-ink shadow-xs transition placeholder:text-slate-warm/60 focus-visible:border-brand-400 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-900/10 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-red-400 aria-invalid:focus-visible:border-red-500 aria-invalid:focus-visible:ring-red-500/10',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export { Input };
