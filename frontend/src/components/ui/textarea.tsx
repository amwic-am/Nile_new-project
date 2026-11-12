import * as React from 'react';
import { cn } from '@/lib/utils';

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-24 w-full rounded-xl border border-input bg-white px-3.5 py-3 text-sm text-ink shadow-xs transition placeholder:text-slate-warm/60 focus-visible:border-brand-400 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-900/10 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-red-400 aria-invalid:focus-visible:border-red-500 aria-invalid:focus-visible:ring-red-500/10',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';

export { Textarea };
