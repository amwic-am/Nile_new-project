import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  Bell,
  ChevronDown,
  Heart,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  Package,
  Search,
  ShoppingBag,
  User,
  X,
} from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { SearchBox } from '@/components/layout/SearchBox';
import { ButtonLink } from '@/components/ui';
import { useAccountSummary, useCart, useCategories, useSite } from '@/lib/queries';
import { cx, initials } from '@/lib/format';
import { useAuth } from '@/stores/auth';
import { useWishlist } from '@/stores/wishlist';

export function AnnouncementBar() {
  const { data: site } = useSite();
  const announcement = site?.announcement;
  if (!announcement?.enabled) return null;
  return (
    <div className="relative overflow-hidden bg-brand-950 text-white">
      <div className="container-page flex items-center justify-center gap-3 py-2 text-center">
        <span className="hidden size-1.5 shrink-0 rounded-full bg-gold-400 sm:block" />
        <p className="text-[12px] font-medium tracking-wide text-white/85 sm:text-[12.5px]">
          {announcement.message}
        </p>
        <Link
          to={announcement.link}
          className="hidden text-[12px] font-semibold text-gold-300 underline decoration-gold-500/50 underline-offset-4 transition hover:text-gold-200 sm:inline"
        >
          Shop now
        </Link>
      </div>
    </div>
  );
}

export function Header() {
  const location = useLocation();
  const { data: site } = useSite();
  const { data: cartData } = useCart();
  const user = useAuth((state) => state.user);
  const status = useAuth((state) => state.status);
  const logout = useAuth((state) => state.logout);
  const wishlistCount = useWishlist((state) => state.slugs.length);
  const loadWishlist = useWishlist((state) => state.load);
  const resetWishlist = useWishlist((state) => state.reset);

  const [megaOpen, setMegaOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileSearch, setMobileSearch] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [mobileGroup, setMobileGroup] = useState<string | null>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const megaRef = useRef<HTMLDivElement>(null);

  const { data: categoryData } = useCategories();
  const { data: accountSummary } = useAccountSummary(status === 'authenticated');
  const unreadNotifications = accountSummary?.stats.unreadNotifications ?? 0;

  useEffect(() => {
    setMegaOpen(false);
    setMobileOpen(false);
    setMobileSearch(false);
    setAccountOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (status === 'authenticated') void loadWishlist();
    if (status === 'guest') resetWishlist();
  }, [status, loadWishlist, resetWishlist]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!accountRef.current?.contains(event.target as Node)) setAccountOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  useEffect(() => {
    if (!mobileOpen && !mobileSearch) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileOpen(false);
        setMobileSearch(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKey);
    };
  }, [mobileOpen, mobileSearch]);

  const roots = categoryData?.categories ?? [];
  const cartCount = cartData?.cart.itemCount ?? 0;

  return (
    <header className="sticky top-0 z-40">
      <AnnouncementBar />
      <div className="border-b border-line/70 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
        <div className="container-page flex h-[68px] items-center gap-3 sm:gap-5">
          <button
            type="button"
            className="grid size-10 place-items-center rounded-xl text-brand-900 transition hover:bg-cream lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </button>

          <Logo />

          <div className="mx-auto hidden max-w-xl flex-1 lg:block">
            <SearchBox />
          </div>

          <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
            <button
              type="button"
              onClick={() => setMobileSearch(true)}
              className="grid size-10 place-items-center rounded-xl text-brand-900 transition hover:bg-cream lg:hidden"
              aria-label="Search"
            >
              <Search className="size-5" />
            </button>

            <Link
              to="/account/wishlist"
              className="relative hidden size-10 place-items-center rounded-xl text-brand-900 transition hover:bg-cream sm:grid"
              aria-label={`Wishlist${wishlistCount ? `, ${wishlistCount} items` : ''}`}
            >
              <Heart className="size-5" />
              {wishlistCount > 0 && (
                <span className="absolute right-0.5 top-0.5 grid min-w-4 place-items-center rounded-full bg-gold-500 px-1 text-[10px] font-bold text-brand-950">
                  {wishlistCount}
                </span>
              )}
            </Link>

            <div ref={accountRef} className="relative hidden sm:block">
              {status === 'authenticated' && user ? (
                <>
                  <button
                    type="button"
                    onClick={() => setAccountOpen((open) => !open)}
                    className="flex h-10 items-center gap-2 rounded-xl px-2 text-brand-900 transition hover:bg-cream"
                    aria-expanded={accountOpen}
                    aria-haspopup="menu"
                  >
                    <span className="grid size-7 place-items-center rounded-full bg-brand-900 text-[11px] font-bold text-white">
                      {initials(user.fullName)}
                    </span>
                    <span className="hidden max-w-24 truncate text-[13px] font-semibold xl:block">
                      {user.fullName.split(' ')[0]}
                    </span>
                    <ChevronDown className={cx('hidden size-3.5 transition xl:block', accountOpen && 'rotate-180')} />
                  </button>
                  {accountOpen && (
                    <div
                      role="menu"
                      className="absolute right-0 top-[calc(100%+8px)] w-60 overflow-hidden rounded-2xl border border-line bg-white p-1.5 shadow-lift"
                    >
                      <div className="border-b border-line/70 px-3 py-2.5">
                        <p className="truncate text-sm font-semibold text-brand-900">{user.fullName}</p>
                        <p className="truncate text-xs text-slate-warm">{user.email}</p>
                      </div>
                      <AccountLink to="/account" icon={<User className="size-4" />} label="My account" />
                      <AccountLink to="/account/orders" icon={<Package className="size-4" />} label="Orders" />
                      <AccountLink to="/account/wishlist" icon={<Heart className="size-4" />} label="Wishlist" />
                      <AccountLink
                        to="/account/notifications"
                        icon={<Bell className="size-4" />}
                        label="Notifications"
                        badge={unreadNotifications}
                      />
                      {user.isStaff && (
                        <AccountLink
                          to="/admin"
                          icon={<LayoutDashboard className="size-4" />}
                          label="Admin dashboard"
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => void logout()}
                        className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 transition hover:bg-red-50"
                        role="menuitem"
                      >
                        <LogOut className="size-4" /> Sign out
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <Link
                  to="/login"
                  className="flex h-10 items-center gap-2 rounded-xl px-2.5 text-[13px] font-semibold text-brand-900 transition hover:bg-cream"
                >
                  <User className="size-4" /> Sign in
                </Link>
              )}
            </div>

            <Link
              to="/cart"
              className="relative ml-0.5 flex h-10 items-center gap-2 rounded-xl bg-brand-900 px-3 text-white transition hover:bg-brand-800 sm:px-3.5"
              aria-label={`Cart${cartCount ? `, ${cartCount} items` : ''}`}
            >
              <ShoppingBag className="size-[18px]" />
              <span className="hidden text-xs font-bold sm:block">{cartCount > 0 ? cartCount : 'Cart'}</span>
            </Link>
          </div>
        </div>

        <div className="hidden border-t border-line/60 lg:block">
          <div className="container-page flex h-11 items-center gap-1">
            <button
              type="button"
              onClick={() => setMegaOpen((open) => !open)}
              aria-expanded={megaOpen}
              className={cx(
                'flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-[13px] font-semibold transition',
                megaOpen ? 'bg-brand-50 text-brand-900' : 'text-brand-900 hover:bg-cream',
              )}
            >
              <Menu className="size-4" /> All categories
              <ChevronDown className={cx('size-3.5 transition', megaOpen && 'rotate-180')} />
            </button>
            <span className="mx-1 h-4 w-px bg-line" />
            {roots.slice(0, 7).map((category, index) => (
              <NavLink
                key={category.id}
                to={`/category/${category.slug}`}
                className={({ isActive }: { isActive: boolean }) =>
                  cx(
                    'whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition',
                    index >= 5 && 'hidden xl:inline-flex',
                    isActive ? 'bg-brand-50 text-brand-900' : 'text-slate-warm hover:bg-cream hover:text-brand-900',
                  )
                }
              >
                {category.name}
              </NavLink>
            ))}
            <NavLink
              to="/products?deals=1"
              className="ml-1 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[13px] font-bold text-gold-700 transition hover:bg-gold-50"
            >
              Deals
            </NavLink>
          </div>
        </div>

        {megaOpen && (
          <div
            ref={megaRef}
            className="absolute inset-x-0 top-full hidden border-b border-line bg-white shadow-lift lg:block"
            onMouseLeave={() => setMegaOpen(false)}
          >
            <div className="container-page grid gap-x-8 gap-y-6 py-7 sm:grid-cols-2 lg:grid-cols-4">
              {roots.map((category) => (
                <div key={category.id}>
                  <Link
                    to={`/category/${category.slug}`}
                    className="mb-2.5 inline-flex items-center gap-1 text-sm font-bold text-brand-900 transition hover:text-brand-600"
                  >
                    {category.name}
                  </Link>
                  <ul className="space-y-1.5">
                    {category.children.slice(0, 5).map((child) => (
                      <li key={child.id}>
                        <Link
                          to={`/category/${child.slug}`}
                          className="text-[13px] text-slate-warm transition hover:text-brand-900"
                        >
                          {child.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <div className="rounded-xl bg-brand-900 p-4 text-white sm:col-span-2 lg:col-span-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gold-300">Need a hand?</p>
                <p className="mt-2 font-display text-lg font-bold leading-snug">Talk to a Nile Mart advisor</p>
                <p className="mt-1.5 text-xs leading-relaxed text-white/70">
                  {site?.supportHours.weekdays ?? 'Monday - Saturday'}. We help you choose the right product.
                </p>
                <ButtonLink to="/contact" size="sm" variant="gold" className="mt-3">
                  Contact us
                </ButtonLink>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mobile navigation */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[80] lg:hidden">
          <div className="absolute inset-0 bg-brand-950/40 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="animate-slide-in absolute inset-y-0 left-0 flex w-[88%] max-w-sm flex-col bg-cream shadow-lift">
            <div className="flex items-center justify-between border-b border-line bg-white px-4 py-3">
              <Logo />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="grid size-9 place-items-center rounded-full text-slate-warm hover:bg-sand"
                aria-label="Close menu"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <SearchBox onNavigate={() => setMobileOpen(false)} />
              <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-white">
                {roots.map((category) => (
                  <div key={category.id} className="border-b border-line/70 last:border-0">
                    <button
                      type="button"
                      onClick={() => setMobileGroup((group) => (group === category.id ? null : category.id))}
                      className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-brand-900"
                      aria-expanded={mobileGroup === category.id}
                    >
                      {category.name}
                      <ChevronDown className={cx('size-4 text-slate-warm transition', mobileGroup === category.id && 'rotate-180')} />
                    </button>
                    {mobileGroup === category.id && (
                      <div className="bg-cream/60 px-4 pb-3">
                        <Link
                          to={`/category/${category.slug}`}
                          className="block py-1.5 text-[13px] font-semibold text-brand-700"
                        >
                          Shop all {category.name}
                        </Link>
                        {category.children.map((child) => (
                          <Link
                            key={child.id}
                            to={`/category/${child.slug}`}
                            className="block py-1.5 text-[13px] text-slate-warm"
                          >
                            {child.name}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-4 grid gap-2">
                <Link
                  to="/products?deals=1"
                  className="flex items-center justify-between rounded-xl bg-gold-500/15 px-4 py-3 text-sm font-bold text-gold-800"
                >
                  Today's deals <span aria-hidden>→</span>
                </Link>
                {status === 'authenticated' && (
                  <Link
                    to="/account"
                    className="flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-medium text-brand-900"
                  >
                    <User className="size-4" /> My account
                  </Link>
                )}
                {status === 'authenticated' && (
                  <Link
                    to="/account/notifications"
                    className="flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-medium text-brand-900"
                  >
                    <Bell className="size-4" /> Notifications
                    {unreadNotifications > 0 && (
                      <span className="ml-auto grid min-w-5 place-items-center rounded-full bg-gold-500 px-1.5 py-0.5 text-[10px] font-bold text-brand-950">
                        {unreadNotifications > 99 ? '99+' : unreadNotifications}
                      </span>
                    )}
                  </Link>
                )}
                <Link
                  to="/account/orders"
                  className="flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-medium text-brand-900"
                >
                  <Package className="size-4" /> Track an order
                </Link>
                <Link
                  to="/contact"
                  className="flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-medium text-brand-900"
                >
                  <MapPin className="size-4" /> Help & contact
                </Link>
              </div>

              {status !== 'authenticated' && (
                <div className="mt-5 grid grid-cols-2 gap-2">
                  <ButtonLink to="/login" variant="outline" fullWidth>
                    Sign in
                  </ButtonLink>
                  <ButtonLink to="/register" fullWidth>
                    Create account
                  </ButtonLink>
                </div>
              )}
            </div>
            <div className="border-t border-line bg-white px-4 py-3 text-xs text-slate-warm">
              {site?.store.phone} · {site?.store.email}
            </div>
          </div>
        </div>
      )}

      {mobileSearch && (
        <div className="fixed inset-0 z-[85] bg-cream p-4 lg:hidden">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-bold text-brand-900">Search Nile Mart</p>
            <button
              type="button"
              onClick={() => setMobileSearch(false)}
              className="grid size-9 place-items-center rounded-full bg-white text-slate-warm"
              aria-label="Close search"
            >
              <X className="size-5" />
            </button>
          </div>
          <SearchBox autoFocus onNavigate={() => setMobileSearch(false)} onClose={() => setMobileSearch(false)} />
          <div className="mt-6">
            <p className="eyebrow mb-2">Popular searches</p>
            <div className="flex flex-wrap gap-2">
              {['Headphones', 'Laptop', 'Coffee', 'Skincare', 'Sneakers'].map((term) => (
                <Link
                  key={term}
                  to={`/search?q=${encodeURIComponent(term)}`}
                  onClick={() => setMobileSearch(false)}
                  className="rounded-full border border-line bg-white px-3 py-1.5 text-xs font-medium text-brand-900"
                >
                  {term}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

function AccountLink({
  to,
  icon,
  label,
  badge,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}) {
  return (
    <Link
      to={to}
      role="menuitem"
      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-warm transition hover:bg-cream hover:text-brand-900"
    >
      {icon} {label}
      {badge != null && badge > 0 && (
        <span className="ml-auto grid min-w-5 place-items-center rounded-full bg-gold-500 px-1.5 py-0.5 text-[10px] font-bold text-brand-950">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </Link>
  );
}
