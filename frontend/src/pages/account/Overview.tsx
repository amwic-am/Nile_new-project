import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  Bell,
  Heart,
  MapPin,
  Package,
  ShieldCheck,
  Star,
  UserRound,
} from 'lucide-react';
import { OrderRow } from '@/components/account/OrderRow';
import { Button, ButtonLink, EmptyState, Skeleton } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { formatSantim } from '@/lib/format';
import { useAccountSummary } from '@/lib/queries';
import { useSeo } from '@/lib/seo';
import { useAuth } from '@/stores/auth';

export default function AccountOverviewPage() {
  const user = useAuth((state) => state.user);
  const { data, isLoading, isError, error, refetch } = useAccountSummary(true);

  useSeo({
    title: 'My account',
    description: 'Your Nile Mart account overview, orders, addresses and notifications.',
    canonicalPath: '/account',
    noIndex: true,
  });

  if (isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-24 rounded-2xl" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <Skeleton key={item} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="surface">
        <EmptyState
          icon={<AlertCircle className="size-6" />}
          title="We could not load your account"
          description={errorMessage(error)}
          action={<Button onClick={() => void refetch()}>Try again</Button>}
        />
      </div>
    );
  }

  const { stats, recentOrders, defaultAddress } = data;
  const firstName = user?.fullName.split(' ')[0] || 'there';

  const cards = [
    {
      label: 'Total orders',
      value: stats.orders,
      hint: `${stats.activeOrders} in progress`,
      to: '/account/orders',
      icon: Package,
    },
    {
      label: 'Wishlist',
      value: stats.wishlistItems,
      hint: 'Saved products',
      to: '/account/wishlist',
      icon: Heart,
    },
    {
      label: 'Unread alerts',
      value: stats.unreadNotifications,
      hint: 'Order and account updates',
      to: '/account/notifications',
      icon: Bell,
    },
    {
      label: 'Reviews',
      value: stats.reviews,
      hint: 'Published product feedback',
      to: '/account/reviews',
      icon: Star,
    },
  ];

  return (
    <div className="space-y-5">
      {user && !user.emailVerified && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gold-200 bg-gold-50 px-4 py-3.5">
          <p className="flex items-start gap-2.5 text-[12.5px] font-medium text-gold-900">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            Verify your email address to secure your account and receive order receipts.
          </p>
          <Link
            to="/account/security"
            className="text-[12px] font-bold text-gold-900 underline decoration-gold-500 underline-offset-4"
          >
            Verify now
          </Link>
        </div>
      )}

      <section className="overflow-hidden rounded-2xl bg-brand-950 px-5 py-6 text-white shadow-soft sm:px-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-gold-400">
              Account overview
            </p>
            <h2 className="mt-1 font-display text-[24px] font-extrabold leading-tight sm:text-[28px]">
              Hello, {firstName}.
            </h2>
            <p className="mt-1.5 max-w-lg text-[12.5px] leading-relaxed text-white/65">
              Track deliveries, manage your addresses and keep your details up to date.
            </p>
          </div>
          <div className="rounded-xl bg-white/10 px-4 py-3 text-[11.5px] text-white/70">
            <p className="font-semibold uppercase tracking-[0.14em] text-white/45">Lifetime orders</p>
            <p className="mt-1 font-display text-lg font-bold text-white">{stats.orders}</p>
            <p>{stats.deliveredOrders} delivered</p>
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.label}
              to={card.to}
              className="group rounded-2xl border border-line bg-white p-4 shadow-soft transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-lift"
            >
              <div className="flex items-center justify-between">
                <span className="grid size-9 place-items-center rounded-xl bg-brand-50 text-brand-900">
                  <Icon className="size-4" />
                </span>
                <ArrowRight className="size-4 text-slate-warm transition group-hover:translate-x-0.5 group-hover:text-brand-900" />
              </div>
              <p className="mt-3 font-display text-[26px] font-extrabold leading-none text-brand-900">
                {card.value}
              </p>
              <p className="mt-1.5 text-[12px] font-semibold text-brand-900">{card.label}</p>
              <p className="text-[11px] text-slate-warm">{card.hint}</p>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="surface overflow-hidden">
          <div className="flex items-center justify-between border-b border-line/70 px-5 py-4">
            <div>
              <h2 className="font-display text-base font-bold text-brand-900">Recent orders</h2>
              <p className="text-[11.5px] text-slate-warm">Your latest purchases at a glance.</p>
            </div>
            <Link
              to="/account/orders"
              className="text-[11.5px] font-bold text-brand-900 underline decoration-gold-400 decoration-2 underline-offset-4"
            >
              View all
            </Link>
          </div>
          {recentOrders.length === 0 ? (
            <EmptyState
              icon={<Package className="size-6" />}
              title="No orders yet"
              description="When you place an order it will appear here with live delivery updates."
              action={<ButtonLink to="/products">Start shopping</ButtonLink>}
            />
          ) : (
            <div>
              {recentOrders.map((order) => (
                <OrderRow key={order.id} order={order} />
              ))}
            </div>
          )}
        </section>

        <div className="space-y-5">
          <section className="surface p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-bold text-brand-900">Default address</h2>
              <Link
                to="/account/addresses"
                className="text-[11px] font-bold text-brand-900 underline decoration-gold-400 underline-offset-4"
              >
                Manage
              </Link>
            </div>
            {defaultAddress ? (
              <div className="mt-3 flex items-start gap-3">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-sand text-brand-900">
                  <MapPin className="size-4" />
                </span>
                <div className="min-w-0 text-[12px] leading-relaxed text-slate-warm">
                  <p className="font-semibold text-brand-900">
                    {defaultAddress.label} · {defaultAddress.fullName}
                  </p>
                  <p>{[defaultAddress.line1, defaultAddress.line2].filter(Boolean).join(', ')}</p>
                  <p>{[defaultAddress.city, defaultAddress.region].filter(Boolean).join(', ')}</p>
                  <p>{defaultAddress.phone}</p>
                </div>
              </div>
            ) : (
              <div className="mt-3">
                <p className="text-[12px] leading-relaxed text-slate-warm">
                  Save a delivery address to check out faster next time.
                </p>
                <ButtonLink to="/account/addresses" size="sm" variant="outline" className="mt-3">
                  Add an address
                </ButtonLink>
              </div>
            )}
          </section>

          <section className="surface p-5">
            <h2 className="font-display text-base font-bold text-brand-900">Quick actions</h2>
            <div className="mt-3 space-y-1">
              <QuickLink to="/account/profile" icon={<UserRound className="size-4" />} label="Update profile" />
              <QuickLink to="/account/reviews" icon={<Star className="size-4" />} label="Review a purchase" />
              <QuickLink to="/account/security" icon={<ShieldCheck className="size-4" />} label="Security & sessions" />
            </div>
            <div className="mt-4 rounded-xl bg-cream/80 px-3.5 py-3 text-[11.5px] leading-relaxed text-slate-warm">
              Free delivery on orders above{' '}
              <span className="font-semibold text-brand-900">{formatSantim(300_000)}</span> within Addis Ababa.
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function QuickLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-[12.5px] font-medium text-slate-warm transition hover:bg-cream hover:text-brand-900"
    >
      <span className="text-brand-900/70">{icon}</span>
      {label}
      <ArrowRight className="ml-auto size-3.5" />
    </Link>
  );
}
