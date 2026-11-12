import { useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarDays,
  ImagePlus,
  Loader2,
  Search,
  ShieldAlert,
  UploadCloud,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cx } from '@/lib/format';
import { toast } from '@/stores/toasts';
import { Button, EmptyState, Input, Modal, Spinner } from '@/components/ui';

/* --------------------------------------------------------------- Page chrome */

export function AdminPageHeader({
  title,
  description,
  eyebrow,
  actions,
  back,
}: {
  title: string;
  description?: ReactNode;
  eyebrow?: string;
  actions?: ReactNode;
  back?: { to: string; label: string };
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back ? (
          <Link
            to={back.to}
            className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-warm transition hover:text-brand-900"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            {back.label}
          </Link>
        ) : (
          eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>
        )}
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-brand-900 sm:text-[28px]">
          {title}
        </h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-warm">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------- Cards */

export function Panel({
  title,
  description,
  action,
  children,
  bodyClassName,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
  className?: string;
}) {
  return (
    <section className={cx('surface overflow-hidden', className)}>
      {(title || action) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line/70 px-5 py-4">
          <div>
            {title && <h2 className="font-display text-[15px] font-bold text-brand-900">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-slate-warm">{description}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={cx('p-5', bodyClassName)}>{children}</div>
    </section>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'brand',
  to,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: 'brand' | 'gold' | 'green' | 'red' | 'neutral';
  to?: string;
}) {
  const tones = {
    brand: 'bg-brand-50 text-brand-900',
    gold: 'bg-gold-100 text-gold-800',
    green: 'bg-emerald-50 text-emerald-700',
    red: 'bg-red-50 text-red-700',
    neutral: 'bg-sand text-slate-warm',
  };
  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-warm">{label}</p>
        {icon && <span className={cx('grid size-9 place-items-center rounded-xl', tones[tone])}>{icon}</span>}
      </div>
      <p className="mt-3 font-display text-[26px] font-extrabold leading-none tracking-tight text-brand-900">
        {value}
      </p>
      {hint && <div className="mt-2 text-xs text-slate-warm">{hint}</div>}
    </>
  );
  if (to) {
    return (
      <Link to={to} className="surface block p-5 transition hover:-translate-y-0.5 hover:shadow-lift">
        {inner}
      </Link>
    );
  }
  return <div className="surface p-5">{inner}</div>;
}

/* ------------------------------------------------------------------- Tables */

export function DataTable({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="surface overflow-hidden">
      <div className="overflow-x-auto">
        <table className={cx('w-full min-w-[640px] border-collapse text-left text-sm', className)}>
          {children}
        </table>
      </div>
    </div>
  );
}

export function Th({
  children,
  className,
  align = 'left',
}: {
  children?: ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
}) {
  return (
    <th
      scope="col"
      className={cx(
        'whitespace-nowrap border-b border-line/70 bg-cream/60 px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.13em] text-slate-warm',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
  align = 'left',
  colSpan,
}: {
  children?: ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={cx(
        'border-b border-line/60 px-4 py-3 align-middle text-ink/90',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
    >
      {children}
    </td>
  );
}

export function TableEmpty({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-14 text-center text-sm text-slate-warm">
        {children}
      </td>
    </tr>
  );
}

/* ------------------------------------------------------------------ Badges */

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 ring-amber-200',
  awaiting_payment: 'bg-amber-50 text-amber-700 ring-amber-200',
  paid: 'bg-sky-50 text-sky-700 ring-sky-200',
  confirmed: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  processing: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  packed: 'bg-violet-50 text-violet-700 ring-violet-200',
  shipped: 'bg-cyan-50 text-cyan-700 ring-cyan-200',
  out_for_delivery: 'bg-cyan-50 text-cyan-700 ring-cyan-200',
  delivered: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  succeeded: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  approved: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  received: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  active: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  subscribed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  cancelled: 'bg-red-50 text-red-700 ring-red-200',
  failed: 'bg-red-50 text-red-700 ring-red-200',
  rejected: 'bg-red-50 text-red-700 ring-red-200',
  suspended: 'bg-red-50 text-red-700 ring-red-200',
  inactive: 'bg-sand text-slate-warm ring-line',
  unsubscribed: 'bg-sand text-slate-warm ring-line',
  draft: 'bg-sand text-slate-warm ring-line',
  archived: 'bg-sand text-slate-warm ring-line',
  unpaid: 'bg-amber-50 text-amber-700 ring-amber-200',
  partially_refunded: 'bg-orange-50 text-orange-700 ring-orange-200',
  refunded: 'bg-violet-50 text-violet-700 ring-violet-200',
  returned: 'bg-orange-50 text-orange-700 ring-orange-200',
  requested: 'bg-amber-50 text-amber-700 ring-amber-200',
  label_created: 'bg-sky-50 text-sky-700 ring-sky-200',
  in_transit: 'bg-cyan-50 text-cyan-700 ring-cyan-200',
  scheduled: 'bg-sky-50 text-sky-700 ring-sky-200',
  expired: 'bg-sand text-slate-warm ring-line',
  exhausted: 'bg-orange-50 text-orange-700 ring-orange-200',
  low: 'bg-amber-50 text-amber-700 ring-amber-200',
  out: 'bg-red-50 text-red-700 ring-red-200',
  all: 'bg-sand text-slate-warm ring-line',
};

export function humanize(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wide ring-1 ring-inset',
        STATUS_STYLES[status] ?? 'bg-sand text-slate-warm ring-line',
        className,
      )}
    >
      {humanize(status)}
    </span>
  );
}

/* ------------------------------------------------------------------- Tabs */

export function AdminTabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: { key: T; label: string; count?: number }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cx('no-scrollbar flex gap-1.5 overflow-x-auto', className)} role="tablist">
      {tabs.map((tab) => {
        const active = tab.key === value;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.key)}
            className={cx(
              'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-[12px] font-semibold transition',
              active
                ? 'border-brand-900 bg-brand-900 text-white'
                : 'border-line bg-white text-slate-warm hover:border-brand-900/25 hover:text-brand-900',
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={cx(
                  'grid min-w-5 place-items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                  active ? 'bg-white/15 text-white' : 'bg-sand text-slate-warm',
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------------- Toolbar */

export function SearchField({
  value,
  onChange,
  placeholder = 'Search…',
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cx('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-warm" />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-10 pl-9"
        aria-label={placeholder}
      />
    </div>
  );
}

export function DateRangeFields({
  value,
  onChange,
  className,
}: {
  value: { from: string; to: string };
  onChange: (value: { from: string; to: string }) => void;
  className?: string;
}) {
  return (
    <div className={cx('flex flex-wrap items-center gap-2', className)}>
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-warm">
        <CalendarDays className="size-4" /> Range
      </span>
      <Input
        type="date"
        value={value.from}
        max={value.to}
        onChange={(event) => onChange({ ...value, from: event.target.value })}
        className="h-10 w-[150px]"
        aria-label="From date"
      />
      <span className="text-xs text-slate-warm">to</span>
      <Input
        type="date"
        value={value.to}
        min={value.from}
        onChange={(event) => onChange({ ...value, to: event.target.value })}
        className="h-10 w-[150px]"
        aria-label="To date"
      />
    </div>
  );
}

export function SelectField({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  label?: string;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label={label}
      className={cx('field h-10 w-auto min-w-[130px] cursor-pointer pr-8 text-[13px]', className)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/* -------------------------------------------------------------- Image upload */

export function ImageUploadField({
  value,
  onChange,
  label = 'Image',
  className,
}: {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const result = await api.post<{ url: string }>('/admin/uploads', form);
      onChange(result.url);
      toast('Image uploaded');
    } catch {
      toast('We could not upload that image.', 'error');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className={cx('space-y-2', className)}>
      <span className="label">{label}</span>
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="group grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl border border-dashed border-line bg-cream text-slate-warm transition hover:border-brand-400 hover:text-brand-900"
          aria-label="Upload image"
        >
          {uploading ? (
            <Loader2 className="size-5 animate-spin" />
          ) : value ? (
            <img src={value} alt="" className="size-full object-cover" />
          ) : (
            <ImagePlus className="size-6" />
          )}
        </button>
        <div className="min-w-0 flex-1 space-y-2">
          <Input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="/uploads/… or https://…"
            className="h-10 text-[13px]"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            loading={uploading}
            iconLeft={<UploadCloud className="size-3.5" />}
          >
            Upload
          </Button>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/avif,image/gif"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
          event.target.value = '';
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------- Confirm dialog */

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  destructive = false,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  loading?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <div className="text-sm leading-relaxed text-slate-warm">{description}</div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button variant={destructive ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ Loading */

export function AdminLoading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 text-sm text-slate-warm">
      <Spinner />
      {label}
    </div>
  );
}

export function AccessDenied() {
  return (
    <EmptyState
      icon={<ShieldAlert className="size-6" />}
      title="You do not have access to this area"
      description="Ask a super administrator to review your role permissions if you believe this is a mistake."
      action={
        <Link to="/admin" className="text-sm font-bold text-brand-900 underline decoration-gold-400 decoration-2 underline-offset-4">
          Back to dashboard
        </Link>
      }
    />
  );
}

export function ErrorNotice({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
      {message}
    </div>
  );
}
