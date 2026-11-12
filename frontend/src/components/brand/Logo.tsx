import { Link } from 'react-router-dom';
import { cx } from '@/lib/format';

export function Logo({ tone = 'dark', compact = false }: { tone?: 'dark' | 'light'; compact?: boolean }) {
  const primary = tone === 'light' ? '#ffffff' : '#002560';
  const mark = tone === 'light' ? '/brand/nile-logo-light.png' : '/brand/nile-logo.png';
  return (
    <Link to="/" className="group inline-flex items-center gap-2.5" aria-label="Nile Mart home">
      <img
        src={mark}
        alt=""
        width={56}
        height={44}
        className="h-12 w-[61px] shrink-0 object-contain transition group-hover:opacity-90"
      />
      {!compact && (
        <span className="leading-none">
          <span
            className="block font-display text-[19px] font-extrabold tracking-tight"
            style={{ color: primary }}
          >
            Nile Mart
          </span>
          <span
            className={cx(
              'mt-1 block text-[9px] font-semibold uppercase tracking-[0.28em]',
              tone === 'light' ? 'text-white/60' : 'text-slate-warm',
            )}
          >
            Shop quality. Live better.
          </span>
        </span>
      )}
    </Link>
  );
}
