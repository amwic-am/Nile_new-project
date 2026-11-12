import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Mail, MapPin, Phone, Send } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { Button, Input } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useCategories, useSite } from '@/lib/queries';
import { useToasts } from '@/stores/toasts';

export function Footer() {
  const { data: site } = useSite();
  const { data: categoryData } = useCategories();
  const push = useToasts((state) => state.push);
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [error, setError] = useState('');

  const subscribe = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    setState('loading');
    try {
      const result = await api.post<{ message: string }>('/newsletter', { email: email.trim(), source: 'footer' });
      push(result.message);
      setState('done');
      setEmail('');
    } catch (caught) {
      setError(errorMessage(caught));
      setState('idle');
    }
  };

  const roots = categoryData?.categories ?? [];
  const year = new Date().getFullYear();
  const socialIcon = (label: string) => {
    const key = label.toLowerCase();
    if (key.includes('facebook')) return <FacebookGlyph />;
    if (key.includes('instagram')) return <InstagramGlyph />;
    if (key.includes('telegram')) return <Send className="size-4" />;
    return <ArrowRight className="size-4" />;
  };

  return (
    <footer className="mt-16 bg-brand-950 text-white/75">
      <div className="border-b border-white/10">
        <div className="container-page grid gap-8 py-10 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-gold-400">The Nile letter</p>
            <h2 className="mt-2 font-display text-2xl font-bold text-white sm:text-[28px]">
              New arrivals, considered offers, no noise.
            </h2>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-white/60">
              Join thousands of shoppers across Ethiopia. One thoughtful email a week, plus early access to seasonal edits.
            </p>
          </div>
          <div>
            {state === 'done' ? (
              <div className="flex items-center gap-3 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3.5 text-sm text-emerald-200">
                <CheckCircle2 className="size-5 shrink-0" />
                You're subscribed. Look out for our next edit.
              </div>
            ) : (
              <form onSubmit={subscribe} className="flex flex-col gap-2 sm:flex-row">
                <div className="flex-1">
                  <Input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                    aria-label="Email address"
                    invalid={Boolean(error)}
                    className="border-white/20 bg-white/10 text-white placeholder:text-white/40 focus:border-gold-400 focus:bg-white/15 focus:ring-gold-400/20"
                  />
                  {error && <p className="mt-1.5 text-xs text-red-300">{error}</p>}
                </div>
                <Button type="submit" variant="gold" loading={state === 'loading'} iconRight={<ArrowRight className="size-4" />}>
                  Subscribe
                </Button>
              </form>
            )}
            <p className="mt-2 text-[11px] text-white/40">
              By subscribing you agree to our{' '}
              <Link to="/privacy" className="underline underline-offset-2 hover:text-white/70">
                privacy policy
              </Link>
              . Unsubscribe anytime.
            </p>
          </div>
        </div>
      </div>

      <div className="container-page grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1fr]">
        <div>
          <Logo tone="light" />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/55">
            {site?.store.tagline ?? 'Shop quality. Live better.'} Genuine products, protected payments and delivery
            across Ethiopia.
          </p>
          <div className="mt-5 space-y-2.5 text-sm">
            <a href={`tel:${site?.store.phone ?? ''}`} className="flex items-start gap-2.5 hover:text-white">
              <Phone className="mt-0.5 size-4 text-gold-400" />
              {site?.store.phone ?? '+251 911 000 000'}
            </a>
            <a href={`mailto:${site?.store.email ?? ''}`} className="flex items-start gap-2.5 hover:text-white">
              <Mail className="mt-0.5 size-4 text-gold-400" />
              {site?.store.email ?? 'support@nilemart.et'}
            </a>
            <p className="flex items-start gap-2.5">
              <MapPin className="mt-0.5 size-4 text-gold-400" />
              {site?.store.address ?? 'Bole Road, Addis Ababa, Ethiopia'}
            </p>
          </div>
        </div>

        <FooterColumn title="Shop">
          {roots.slice(0, 6).map((category) => (
            <FooterLink key={category.id} to={`/category/${category.slug}`}>
              {category.name}
            </FooterLink>
          ))}
          <FooterLink to="/products">All products</FooterLink>
          <FooterLink to="/products?deals=1">Deals</FooterLink>
        </FooterColumn>

        <FooterColumn title="Customer care">
          <FooterLink to="/contact">Contact us</FooterLink>
          <FooterLink to="/shipping">Delivery & returns</FooterLink>
          <FooterLink to="/account/orders">Track your order</FooterLink>
          <FooterLink to="/returns">Returns & refunds</FooterLink>
          <FooterLink to="/account">Your account</FooterLink>
        </FooterColumn>

        <FooterColumn title="Company">
          <FooterLink to="/about">About Nile Mart</FooterLink>
          <FooterLink to="/privacy">Privacy policy</FooterLink>
          <FooterLink to="/terms">Terms of service</FooterLink>
          <FooterLink to="/shipping">Shipping policy</FooterLink>
          <FooterLink to="/returns">Returns & refunds</FooterLink>
        </FooterColumn>
      </div>

      <div className="border-t border-white/10">
        <div className="container-page flex flex-col items-center justify-between gap-4 py-5 text-[11.5px] text-white/40 sm:flex-row">
          <p>
            © {year} {site?.store.legalName ?? 'Nile Mart Trading PLC'}. All rights reserved. Prices in ETB.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="rounded-md border border-white/15 px-2 py-1">Cash on delivery</span>
            <span className="rounded-md border border-white/15 px-2 py-1">Chapa</span>
            <span className="rounded-md border border-white/15 px-2 py-1">Telebirr</span>
            <span className="rounded-md border border-white/15 px-2 py-1">Visa · Mastercard</span>
          </div>
          <div className="flex items-center gap-2">
            {(site?.socialLinks ?? []).map((link) => (
              <a
                key={link.label}
                href={link.url}
                target="_blank"
                rel="noreferrer noopener"
                className="grid size-8 place-items-center rounded-full border border-white/15 transition hover:border-gold-400 hover:text-gold-300"
                aria-label={link.label}
              >
                {socialIcon(link.label)}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {  return (
    <div>
      <h3 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/50">{title}</h3>
      <ul className="space-y-2.5 text-sm">{children}</ul>
    </div>
  );
}

function FooterLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <li>
      <Link to={to} className="text-white/60 transition hover:text-white">
        {children}
      </Link>
    </li>
  );
}

function FacebookGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
      <path d="M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.6-1.5H16.6V4.4c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.4-4 4.1v2.1H7.5v3h2.7V21h3.3Z" />
    </svg>
  );
}

function InstagramGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
