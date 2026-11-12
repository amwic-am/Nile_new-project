import { Suspense, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  BookOpenCheck,
  Boxes,
  ChevronRight,
  ClipboardList,
  ExternalLink,
  Gauge,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  Package,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Store,
  Tags,
  TicketPercent,
  Truck,
  Users,
  X,
} from 'lucide-react';
import { RequireStaff } from '@/components/auth/RequireAuth';
import { Toaster } from '@/components/ui';
import { AccessDenied, AdminLoading } from '@/components/admin/ui';
import { cx, initials } from '@/lib/format';
import { useAuth } from '@/stores/auth';

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super administrator',
  store_manager: 'Store manager',
  inventory_manager: 'Inventory manager',
  fulfillment: 'Order fulfillment',
  finance: 'Finance',
  support: 'Customer support',
  customer: 'Customer',
};

interface NavItem {
  to: string;
  label: string;
  icon: typeof Gauge;
  end?: boolean;
  permissions: string[];
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true, permissions: ['dashboard.view'] },
    ],
  },
  {
    label: 'Commerce',
    items: [
      { to: '/admin/orders', label: 'Orders', icon: ShoppingBag, permissions: ['orders.read'] },
      { to: '/admin/products', label: 'Products', icon: Package, permissions: ['products.read'] },
      { to: '/admin/categories', label: 'Categories & brands', icon: Tags, permissions: ['products.read'] },
      { to: '/admin/inventory', label: 'Inventory', icon: Boxes, permissions: ['inventory.read'] },
    ],
  },
  {
    label: 'Customers',
    items: [{ to: '/admin/customers', label: 'Customers', icon: Users, permissions: ['customers.read'] }],
  },
  {
    label: 'Marketing',
    items: [
      { to: '/admin/promotions', label: 'Promotions', icon: TicketPercent, permissions: ['promotions.read'] },
      { to: '/admin/reviews', label: 'Reviews', icon: MessageSquareText, permissions: ['reviews.moderate'] },
    ],
  },
  {
    label: 'Insights',
    items: [
      { to: '/admin/reports', label: 'Reports', icon: BarChart3, permissions: ['reports.view', 'inventory.read'] },
      { to: '/admin/audit', label: 'Audit log', icon: ClipboardList, permissions: ['audit.read'] },
    ],
  },
  {
    label: 'Administration',
    items: [
      { to: '/admin/staff', label: 'Staff & roles', icon: ShieldCheck, permissions: ['staff.read'] },
      { to: '/admin/settings', label: 'Settings', icon: Settings, permissions: ['settings.read', 'content.write'] },
    ],
  },
];

function can(user: ReturnType<typeof useAuth.getState>['user'], permissions: string[]) {
  if (!user) return false;
  return permissions.some((permission) => user.permissions.includes(permission));
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const user = useAuth((state) => state.user);
  const logout = useAuth((state) => state.logout);
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="flex h-full flex-col bg-brand-950 text-white">
      <div className="flex items-center gap-3 px-5 py-5">
        <img
          src="/brand/nile-logo-light.png"
          alt=""
          width={56}
          height={44}
          className="h-11 w-14 shrink-0 object-contain"
        />
        <div className="min-w-0">
          <p className="font-display text-sm font-extrabold tracking-[0.12em]">NILE MART</p>
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/45">Operations</p>
        </div>
      </div>

      <nav className="no-scrollbar flex-1 overflow-y-auto px-3 pb-4" aria-label="Admin sections">
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((item) => can(user, item.permissions));
          if (!items.length) return null;
          return (
            <div key={group.label} className="mb-4">
              <p className="mb-1.5 px-3 text-[9.5px] font-bold uppercase tracking-[0.2em] text-white/35">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      onClick={onNavigate}
                      className={({ isActive }: { isActive: boolean }) =>
                        cx(
                          'group flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[12.5px] font-semibold transition',
                          isActive
                            ? 'bg-white/[0.12] text-white shadow-[inset_2px_0_0_var(--color-gold-400)]'
                            : 'text-white/65 hover:bg-white/[0.06] hover:text-white',
                        )
                      }
                    >
                      {({ isActive }: { isActive: boolean }) => (
                        <>
                          <Icon
                            className={cx(
                              'size-4 shrink-0 transition',
                              isActive ? 'text-gold-300' : 'text-white/45 group-hover:text-white/75',
                            )}
                          />
                          <span className="truncate">{item.label}</span>
                          {isActive && <ChevronRight className="ml-auto size-3.5 text-white/40" />}
                        </>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-2.5 rounded-xl bg-white/[0.06] p-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gold-500/20 text-[11px] font-bold text-gold-200">
            {initials(user?.fullName ?? 'NM')}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-semibold text-white">{user?.fullName}</p>
            <p className="truncate text-[10.5px] text-white/45">
              {ROLE_LABELS[user?.roles[0] ?? ''] ?? user?.roles[0] ?? 'Staff'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleLogout()}
            title="Sign out"
            aria-label="Sign out"
            className="grid size-8 shrink-0 place-items-center rounded-lg text-white/50 transition hover:bg-white/10 hover:text-white"
          >
            <LogOut className="size-4" />
          </button>
        </div>
        <Link
          to="/"
          className="mt-2 flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[11px] font-semibold text-white/45 transition hover:text-white"
        >
          View storefront <ExternalLink className="size-3" />
        </Link>
      </div>
    </div>
  );
}

export function AdminRoot() {
  const load = useAuth((state) => state.load);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <RequireStaff>
      <div className="min-h-screen bg-cream">
        <Outlet />
        <Toaster />
      </div>
    </RequireStaff>
  );
}

export function AdminLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [menuOpen]);

  const current = NAV_GROUPS.flatMap((group) => group.items)
    .filter((item) => (item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)))
    .sort((a, b) => b.to.length - a.to.length)[0];

  return (
    <div className="min-h-screen bg-cream">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 lg:block">
        <SidebarContent />
      </aside>

      {menuOpen && (
        <div className="fixed inset-0 z-[80] lg:hidden">
          <div className="absolute inset-0 bg-brand-950/55 backdrop-blur-sm" onClick={() => setMenuOpen(false)} />
          <div className="animate-slide-in absolute inset-y-0 left-0 w-[280px] shadow-lift">
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              className="absolute right-3 top-4 z-10 grid size-9 place-items-center rounded-full bg-white/10 text-white"
              aria-label="Close menu"
            >
              <X className="size-4" />
            </button>
            <SidebarContent onNavigate={() => setMenuOpen(false)} />
          </div>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line/70 bg-cream/92 px-4 backdrop-blur sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="grid size-10 place-items-center rounded-xl border border-line bg-white text-brand-900 lg:hidden"
            aria-label="Open admin menu"
          >
            <Menu className="size-5" />
          </button>
          <div className="flex min-w-0 items-center gap-2">
            <Store className="hidden size-4 text-gold-700 sm:block" />
            <span className="truncate text-[13px] font-semibold text-brand-900">{current?.label ?? 'Admin'}</span>
            <span className="hidden text-[12px] text-slate-warm sm:inline">
              · Nile Mart operations, Addis Ababa
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wide text-emerald-700 ring-1 ring-inset ring-emerald-200 sm:inline-flex">
              <span className="size-1.5 rounded-full bg-emerald-500" /> Live data
            </span>
            <Link
              to="/"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-[12px] font-semibold text-brand-900 transition hover:border-brand-900/30"
            >
              <Truck className="size-3.5 text-gold-700 sm:hidden" />
              <span className="hidden sm:inline">View store</span>
              <ExternalLink className="hidden size-3 sm:block" />
            </Link>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Suspense
            fallback={
              <div className="grid min-h-[50vh] place-items-center">
                <AdminLoading label="Loading admin…" />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </main>
        <footer className="mx-auto flex w-full max-w-[1500px] flex-wrap items-center gap-2 px-4 pb-8 text-[11px] text-slate-warm sm:px-6 lg:px-8">
          <BookOpenCheck className="size-3.5 text-gold-700" />
          <span>Nile Mart admin</span>
          <span aria-hidden>·</span>
          <span>All sensitive actions are written to the audit log.</span>
        </footer>
      </div>
    </div>
  );
}

export function AdminPerm({ anyOf, children }: { anyOf: string[]; children: React.ReactNode }) {
  const user = useAuth((state) => state.user);
  if (!user) return null;
  if (!can(user, anyOf)) return <AccessDenied />;
  return <>{children}</>;
}
