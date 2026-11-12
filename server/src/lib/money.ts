const etbFormatter = new Intl.NumberFormat('en-ET', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Formats an integer amount in santim (1 ETB = 100 santim) for display. */
export function formatEtb(santim: number): string {
  return `ETB ${etbFormatter.format(Number(santim) / 100)}`;
}

export function formatEtbPlain(santim: number): string {
  return etbFormatter.format(Number(santim) / 100);
}
