import {
  forwardRef,
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Loader2, Minus, Plus, Star, X } from 'lucide-react';
import { cx, formatSantim } from '@/lib/format';
import { useToasts } from '@/stores/toasts';
import { Button as ShadcnButton, buttonVariants } from './ui/button';
import { Input as ShadcnInput } from './ui/input';
import { Textarea as ShadcnTextarea } from './ui/textarea';
import { Label } from './ui/label';
import { Badge as ShadcnBadge } from './ui/badge';
import { Skeleton as ShadcnSkeleton } from './ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';

/* ------------------------------------------------------------------ Button */

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'gold' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

const buttonVariantMap = {
  primary: 'default',
  secondary: 'secondary',
  outline: 'outline',
  ghost: 'ghost',
  gold: 'gold',
  danger: 'destructive',
} as const satisfies Record<ButtonVariant, 'default' | 'secondary' | 'outline' | 'ghost' | 'gold' | 'destructive'>;

const buttonSizeMap = {
  sm: 'sm',
  md: 'default',
  lg: 'lg',
} as const satisfies Record<ButtonSize, 'sm' | 'default' | 'lg'>;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading,
    iconLeft,
    iconRight,
    fullWidth,
    className,
    children,
    disabled,
    ...rest
  },
  ref,
) {
  return (
    <ShadcnButton
      ref={ref}
      type="button"
      variant={buttonVariantMap[variant]}
      size={buttonSizeMap[size]}
      disabled={disabled || loading}
      className={cx(fullWidth && 'w-full', className)}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : iconLeft}
      {children}
      {iconRight}
    </ShadcnButton>
  );
});

export function ButtonLink({
  to,
  variant = 'primary',
  size = 'md',
  className,
  children,
  iconLeft,
  iconRight,
  fullWidth,
}: {
  to: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
}) {
  return (
    <Link
      to={to}
      className={buttonVariants({
        variant: buttonVariantMap[variant],
        size: buttonSizeMap[size],
        className: cx(fullWidth && 'w-full', className),
      })}
    >
      {iconLeft}
      {children}
      {iconRight}
    </Link>
  );
}

/* ------------------------------------------------------------------ Fields */

interface FieldShellProps {
  label?: string;
  error?: string;
  hint?: string;
  id?: string;
  children: (props: { id: string; describedBy: string | undefined }) => ReactNode;
}

export function Field({ label, error, hint, id: providedId, children }: FieldShellProps) {
  const generated = useId();
  const id = providedId ?? generated;
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div>
      {label && (
        <Label className="mb-1.5" htmlFor={id}>
          {label}
        </Label>
      )}
      {children({ id, describedBy })}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs font-medium text-red-600">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-slate-warm">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid, ...rest }, ref) {
    return (
      <ShadcnInput
        ref={ref}
        className={className}
        aria-invalid={invalid || undefined}
        {...rest}
      />
    );
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function Textarea({ className, invalid, ...rest }, ref) {
  return (
    <ShadcnTextarea
      ref={ref}
      className={className}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
});

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }
>(function Select({ className, invalid, children, ...rest }, ref) {
  return (
    <select
      ref={ref}
      className={cx('field cursor-pointer pr-8', invalid && 'field-error', className)}
      aria-invalid={invalid || undefined}
      {...rest}
    >
      {children}
    </select>
  );
});

/* ------------------------------------------------------------------- Badge */

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'gold' | 'green' | 'red' | 'brand' | 'outline';
  className?: string;
}) {
  const tones = {
    neutral: 'default',
    gold: 'gold',
    green: 'success',
    red: 'destructive',
    brand: 'brand',
    outline: 'outline',
  } as const satisfies Record<
    'neutral' | 'gold' | 'green' | 'red' | 'brand' | 'outline',
    'default' | 'gold' | 'success' | 'destructive' | 'brand' | 'outline'
  >;
  return (
    <ShadcnBadge variant={tones[tone]} className={className}>
      {children}
    </ShadcnBadge>
  );
}

/* ------------------------------------------------------------------- Stars */

export function Stars({
  value,
  size = 14,
  className,
  label = true,
}: {
  value: number;
  size?: number;
  className?: string;
  label?: boolean;
}) {
  const rounded = Math.round(value * 2) / 2;
  return (
    <span className={cx('inline-flex items-center gap-0.5', className)} aria-label={label ? `Rated ${value} out of 5` : undefined}>
      {[1, 2, 3, 4, 5].map((star) => {
        const fill = rounded >= star ? 'full' : rounded >= star - 0.5 ? 'half' : 'none';
        return (
          <span key={star} className="relative inline-flex" style={{ width: size, height: size }}>
            <Star className="absolute inset-0 text-gold-500/30" style={{ width: size, height: size }} strokeWidth={1.5} />
            {fill !== 'none' && (
              <span
                className="absolute inset-0 overflow-hidden"
                style={{ width: fill === 'half' ? size / 2 : size }}
              >
                <Star
                  className="text-gold-500"
                  style={{ width: size, height: size }}
                  fill="currentColor"
                  strokeWidth={1.5}
                />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

/* ------------------------------------------------------------------- Price */

export function Price({
  santim,
  compareAt,
  size = 'md',
  className,
}: {
  santim: number;
  compareAt?: number | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}) {
  const sizes = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-xl',
    xl: 'text-3xl',
  };
  return (
    <span className={cx('inline-flex flex-wrap items-baseline gap-2', className)}>
      <span className={cx('font-display font-bold text-brand-900', sizes[size])}>{formatSantim(santim)}</span>
      {compareAt && compareAt > santim && (
        <span className="text-xs font-medium text-slate-warm line-through">{formatSantim(compareAt)}</span>
      )}
    </span>
  );
}

/* ---------------------------------------------------------------- Skeleton */

export function Skeleton({ className }: { className?: string }) {
  return <ShadcnSkeleton className={className} />;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('size-5 animate-spin text-brand-900', className)} aria-label="Loading" />;
}

/* ---------------------------------------------------------------- Quantity */

export function QuantityStepper({
  value,
  onChange,
  max = 99,
  min = 1,
  size = 'md',
  label = 'Quantity',
}: {
  value: number;
  onChange: (value: number) => void;
  max?: number;
  min?: number;
  size?: 'sm' | 'md';
  label?: string;
}) {
  const buttonSize = size === 'sm' ? 'size-8' : 'size-10';
  return (
    <div
      className="inline-flex items-center rounded-xl border border-line bg-white"
      role="group"
      aria-label={label}
    >
      <button
        type="button"
        className={cx(buttonSize, 'grid place-items-center text-brand-900 disabled:opacity-30')}
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label="Decrease quantity"
      >
        <Minus className="size-3.5" />
      </button>
      <span className={cx('min-w-8 text-center text-sm font-semibold', size === 'sm' && 'min-w-6 text-[13px]')}>
        {value}
      </span>
      <button
        type="button"
        className={cx(buttonSize, 'grid place-items-center text-brand-900 disabled:opacity-30')}
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label="Increase quantity"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------- Modal */

export function Modal({
  open,
  onClose,
  title,
  children,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' };

  return (
    <Dialog
      open={open}
      onOpenChange={(next: boolean) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className={widths[size]} aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------------------------------------------- EmptyState */

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('flex flex-col items-center justify-center px-6 py-16 text-center', className)}>
      {icon && <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-sand text-brand-900">{icon}</div>}
      <h3 className="text-lg font-bold">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-slate-warm">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/* -------------------------------------------------------------- Pagination */

export function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  const pages: (number | 'ellipsis')[] = [];
  for (let current = 1; current <= totalPages; current += 1) {
    if (current === 1 || current === totalPages || Math.abs(current - page) <= 1) {
      pages.push(current);
    } else if (pages[pages.length - 1] !== 'ellipsis') {
      pages.push('ellipsis');
    }
  }
  return (
    <nav className="flex items-center justify-center gap-1.5" aria-label="Pagination">
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        className="grid size-10 place-items-center rounded-xl border border-line bg-white text-brand-900 transition hover:border-brand-900/30 disabled:opacity-40"
        aria-label="Previous page"
      >
        <ChevronLeft className="size-4" />
      </button>
      {pages.map((item, index) =>
        item === 'ellipsis' ? (
          <span key={`e-${index}`} className="px-1 text-sm text-slate-warm">
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            onClick={() => onChange(item)}
            aria-current={item === page ? 'page' : undefined}
            className={cx(
              'size-10 rounded-xl border text-sm font-semibold transition',
              item === page
                ? 'border-brand-900 bg-brand-900 text-white'
                : 'border-line bg-white text-brand-900 hover:border-brand-900/30',
            )}
          >
            {item}
          </button>
        ),
      )}
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        className="grid size-10 place-items-center rounded-xl border border-line bg-white text-brand-900 transition hover:border-brand-900/30 disabled:opacity-40"
        aria-label="Next page"
      >
        <ChevronRight className="size-4" />
      </button>
    </nav>
  );
}

/* ---------------------------------------------------------------- Section */

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('mb-7 flex flex-wrap items-end justify-between gap-4', className)}>
      <div>
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h2 className="text-2xl font-bold sm:text-[28px]">{title}</h2>
        {description && <p className="mt-1.5 max-w-xl text-sm text-slate-warm">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/* ----------------------------------------------------------------- Toaster */

export function Toaster() {
  const { toasts, dismiss } = useToasts();
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[120] flex flex-col items-center gap-2 px-4 sm:bottom-6">
      {toasts.map((item) => (
        <div
          key={item.id}
          role="status"
          className={cx(
            'animate-toast pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl px-4 py-3 text-sm font-medium shadow-lift',
            item.tone === 'error'
              ? 'bg-red-600 text-white'
              : item.tone === 'info'
                ? 'bg-brand-900 text-white'
                : 'bg-emerald-700 text-white',
          )}
        >
          <span className="flex-1">{item.message}</span>
          <button type="button" onClick={() => dismiss(item.id)} aria-label="Dismiss" className="opacity-70 hover:opacity-100">
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
