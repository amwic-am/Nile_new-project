const etbFormatter = new Intl.NumberFormat('en-ET', {
  style: 'currency',
  currency: 'ETB',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const compactFormatter = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

/** Prices travel through the API as integer santim (1 ETB = 100 santim). */
export function formatSantim(santim: number | null | undefined): string {
  return etbFormatter.format(Number(santim ?? 0) / 100);
}

export function formatSantimPlain(santim: number | null | undefined): string {
  return (Number(santim ?? 0) / 100).toFixed(2);
}

export function formatCount(value: number): string {
  return compactFormatter.format(value);
}

export function discountPercent(price: number, compareAt: number | null | undefined): number | null {
  if (!compareAt || compareAt <= price) return null;
  return Math.round(((compareAt - price) / compareAt) * 100);
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Africa/Addis_Ababa',
  }).format(new Date(value));
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Addis_Ababa',
  }).format(new Date(value));
}

export function relativeDate(value: string | Date | null | undefined): string {
  if (!value) return '';
  const diff = Date.now() - new Date(value).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  return formatDate(value);
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function cx(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(' ');
}
