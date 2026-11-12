import { Link } from 'react-router-dom';
import { CheckCircle2, ShieldCheck, Truck } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="container-page py-6 sm:py-10">
      <div className="grid overflow-hidden rounded-[26px] border border-line bg-white shadow-soft lg:grid-cols-[1fr_1.05fr]">
        <div className="relative hidden min-h-[640px] overflow-hidden bg-brand-950 p-10 lg:flex lg:flex-col">
          <img
            src="/uploads/seed/hero.png"
            alt=""
            className="absolute inset-0 size-full object-cover opacity-45"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-brand-950 via-brand-950/70 to-brand-950/20" />
          <div className="relative z-10">
            <Logo tone="light" />
          </div>
          <div className="relative z-10 mt-auto max-w-sm">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.24em] text-gold-400">
              Ethiopia's premium marketplace
            </p>
            <h2 className="mt-3 font-display text-[32px] font-extrabold leading-[1.1] text-white">
              One account. A whole store of quality.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-white/60">
              Track orders, save addresses, keep a wishlist and check out faster every time.
            </p>
            <ul className="mt-6 space-y-3 text-[13px] text-white/75">
              <li className="flex items-center gap-2.5">
                <CheckCircle2 className="size-4 text-gold-400" /> Genuine products from authorised suppliers
              </li>
              <li className="flex items-center gap-2.5">
                <Truck className="size-4 text-gold-400" /> Delivery across Ethiopia with tracking
              </li>
              <li className="flex items-center gap-2.5">
                <ShieldCheck className="size-4 text-gold-400" /> Server-verified, protected payments
              </li>
            </ul>
          </div>
          <p className="relative z-10 mt-10 text-[10.5px] text-white/35">
            © {new Date().getFullYear()} Nile Mart Trading PLC · Addis Ababa
          </p>
        </div>

        <div className="flex flex-col justify-center px-6 py-9 sm:px-10 lg:px-14 lg:py-14">
          <div className="mx-auto w-full max-w-md">
            <div className="mb-6 lg:hidden">
              <Logo />
            </div>
            <p className="eyebrow mb-2">Nile Mart account</p>
            <h1 className="text-[26px] font-extrabold leading-tight sm:text-[30px]">{title}</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-warm">{subtitle}</p>
            <div className="mt-7">{children}</div>
            {footer && <div className="mt-6 text-center text-[12.5px] text-slate-warm">{footer}</div>}
          </div>
        </div>
      </div>
      <p className="mt-4 text-center text-[11px] text-slate-warm">
        By continuing you agree to our{' '}
        <Link to="/terms" className="underline underline-offset-2 hover:text-brand-900">
          terms
        </Link>{' '}
        and{' '}
        <Link to="/privacy" className="underline underline-offset-2 hover:text-brand-900">
          privacy policy
        </Link>
        .
      </p>
    </div>
  );
}
