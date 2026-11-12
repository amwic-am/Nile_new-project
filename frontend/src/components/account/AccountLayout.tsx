import { NavLink, Outlet } from 'react-router-dom';
import {
  Bell,
  Heart,
  Home,
  LifeBuoy,
  MapPin,
  Package,
  ShieldCheck,
  Star,
  UserRound,
} from 'lucide-react';
import { useAccountSummary } from '@/lib/queries';
import { cx, formatDate, initials } from '@/lib/format';
import { useAuth } from '@/stores/auth';

const NAV = [
  { to: '/account', label: 'Overview', icon: Home, end: true },
  { to: '/account/profile', label: 'Profile', icon: UserRound, end: false },
  { to: '/account/orders', label: 'Orders', icon: Package, end: false },
  { to: '/account/addresses', label: 'Addresses', icon: MapPin, end: false },
  { to: '/account/wishlist', label: 'Wishlist', icon: Heart, end: false },
  { to: '/account/reviews', label: 'Reviews', icon: Star, end: false },
  { to: '/account/notifications', label: 'Notifications', icon: Bell, end: false },
  { to: '/account/security', label: 'Security', icon: ShieldCheck, end: false },
];

export function AccountLayout() {
  const user = useAuth((state) => state.user);
  const { data: summary } = useAccountSummary(Boolean(user));
  const unread = summary?.stats.unreadNotifications ?? 0;

  return (
    <div className="container-page py-7 sm:py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-brand-900 font-display text-lg font-bold text-white shadow-soft">
            {initials(user?.fullName ?? 'NM')}
          </span>
          <div>
            <p className="eyebrow mb-1">My account</p>
            <h1 className="font-display text-2xl font-extrabold leading-tight text-brand-900 sm:text-[28px]">
              {user?.fullName || 'Your account'}
            </h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-slate-warm">
              <span className="truncate">{user?.email}</span>
              {summary?.memberSince && (
                <>
                  <span aria-hidden>·</span>
                  <span>Member since {formatDate(summary.memberSince)}</span>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-white px-3.5 py-2 text-[11.5px] font-medium text-slate-warm shadow-soft">
          <ShieldCheck className={cx('size-4', user?.emailVerified ? 'text-emerald-600' : 'text-gold-600')} />
          {user?.emailVerified ? 'Email verified' : 'Email not verified'}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside>
          <nav
            aria-label="Account sections"
            className="grid grid-cols-2 gap-1 rounded-2xl border border-line bg-white p-2 shadow-soft sm:grid-cols-4 lg:grid-cols-1"
          >
            {NAV.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }: { isActive: boolean }) =>
                    cx(
                      'group flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition',
                      isActive
                        ? 'bg-brand-900 text-white shadow-sm'
                        : 'text-slate-warm hover:bg-cream hover:text-brand-900',
                    )
                  }
                >
                  {({ isActive }: { isActive: boolean }) => (
                    <>
                      <Icon className={cx('size-4 shrink-0', isActive ? 'text-gold-300' : 'text-brand-900/60')} />
                      <span className="truncate">{item.label}</span>
                      {item.label === 'Notifications' && unread > 0 && (
                        <span
                          className={cx(
                            'ml-auto grid min-w-5 place-items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                            isActive ? 'bg-gold-500 text-brand-950' : 'bg-gold-500/20 text-gold-800',
                          )}
                        >
                          {unread > 99 ? '99+' : unread}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              );
            })}
          </nav>

          <div className="mt-4 hidden rounded-2xl border border-line bg-white p-4 shadow-soft lg:block">
            <LifeBuoy className="size-5 text-gold-600" />
            <p className="mt-2 font-display text-sm font-bold text-brand-900">Need a hand?</p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-slate-warm">
              Our customer care team can help with orders, delivery or returns.
            </p>
            <NavLink
              to="/contact"
              className="mt-3 inline-flex text-[11.5px] font-bold text-brand-900 underline decoration-gold-400 decoration-2 underline-offset-4"
            >
              Contact support
            </NavLink>
          </div>
        </aside>

        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
