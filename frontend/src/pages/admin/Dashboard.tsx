import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Boxes,
  CircleDollarSign,
  MessageSquareText,
  Package,
  ShoppingBag,
  TicketPercent,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AdminLoading,
  AdminPageHeader,
  DateRangeFields,
  Panel,
  StatCard,
  StatusBadge,
  Td,
  Th,
  TableEmpty,
  humanize,
} from '@/components/admin/ui';
import { rangeDays, useAdminDashboard } from '@/lib/admin';
import { errorMessage } from '@/lib/api';
import { cx, formatCount, formatDate, formatSantim, relativeDate } from '@/lib/format';
import { useAuth } from '@/stores/auth';

export default function AdminDashboardPage() {
  const [range, setRange] = useState(() => rangeDays(30));
  const { data, isLoading, error } = useAdminDashboard(range);
  const permissions = useAuth((state) => state.user?.permissions ?? []);
  const may = (permission: string) => permissions.includes(permission);
  const actions = [
    { show: may('orders.update'), to: '/admin/orders', label: 'Process orders', icon: <ShoppingBag className="size-3.5" /> },
    { show: may('products.write'), to: '/admin/products/new', label: 'Add a product', icon: <Package className="size-3.5" /> },
    { show: may('inventory.write'), to: '/admin/inventory', label: 'Adjust stock', icon: <Boxes className="size-3.5" /> },
    { show: may('promotions.write'), to: '/admin/promotions', label: 'Create a coupon', icon: <TicketPercent className="size-3.5" /> },
    { show: may('staff.read'), to: '/admin/staff', label: 'Manage staff', icon: <Users className="size-3.5" /> },
  ].filter((action) => action.show);

  if (isLoading && !data) return <AdminLoading label="Loading the store overview…" />;
  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
        {errorMessage(error)}
      </div>
    );
  }
  if (!data) return null;

  const sales = data.sales;
  const revenueDelta =
    sales && sales.previousRevenue > 0
      ? ((sales.revenue - sales.previousRevenue) / sales.previousRevenue) * 100
      : null;
  const orderDelta =
    sales && sales.previousOrders > 0
      ? ((sales.orders - sales.previousOrders) / sales.previousOrders) * 100
      : null;
  const statusTotal = sales?.statuses.reduce((total, entry) => total + entry.count, 0) ?? 0;

  return (
    <>
      <AdminPageHeader
        eyebrow="Store overview"
        title="Dashboard"
        description={
          <>
            Live trading, fulfilment and catalogue signals for {formatDate(data.range.from)} –{' '}
            {formatDate(data.range.to)}.
          </>
        }
        actions={
          <>
            <DateRangeFields value={range} onChange={setRange} />
            <Link
              to="/admin/reports"
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-brand-900 px-4 text-[13px] font-semibold text-white transition hover:bg-brand-800"
            >
              Full reports <ArrowRight className="size-3.5" />
            </Link>
          </>
        }
      />

      {sales && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Paid revenue"
              value={formatSantim(sales.revenue)}
              icon={<CircleDollarSign className="size-4" />}
              tone="brand"
              hint={
                revenueDelta === null ? (
                  'No prior-period revenue to compare'
                ) : (
                  <span
                    className={cx(
                      'inline-flex items-center gap-1 font-semibold',
                      revenueDelta >= 0 ? 'text-emerald-600' : 'text-red-600',
                    )}
                  >
                    {revenueDelta >= 0 ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
                    {Math.abs(revenueDelta).toFixed(1)}% vs previous period
                  </span>
                )
              }
            />
            <StatCard
              label="Orders placed"
              value={formatCount(sales.orders)}
              icon={<ShoppingBag className="size-4" />}
              tone="gold"
              hint={
                orderDelta === null ? (
                  `${formatCount(sales.units)} units sold`
                ) : (
                  <span
                    className={cx(
                      'inline-flex items-center gap-1 font-semibold',
                      orderDelta >= 0 ? 'text-emerald-600' : 'text-red-600',
                    )}
                  >
                    {orderDelta >= 0 ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
                    {Math.abs(orderDelta).toFixed(1)}% · {formatCount(sales.units)} units
                  </span>
                )
              }
            />
            <StatCard
              label="Average order value"
              value={formatSantim(sales.averageOrderValue)}
              icon={<Wallet className="size-4" />}
              tone="green"
              hint={`${formatCount(sales.awaitingPayment)} awaiting payment`}
              to="/admin/orders?status=awaiting_payment"
            />
            <StatCard
              label="Needs fulfilment"
              value={formatCount(sales.pendingFulfilment)}
              icon={<Package className="size-4" />}
              tone="red"
              hint={`${formatCount(sales.refundsPending)} refund${sales.refundsPending === 1 ? '' : 's'} to review`}
              to="/admin/orders"
            />
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
            <Panel
              title="Revenue trend"
              description="Paid revenue per day, Africa/Addis_Ababa"
              action={<span className="text-[11px] font-semibold uppercase tracking-wide text-slate-warm">ETB</span>}
            >
              <div className="h-[290px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={sales.series} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="adminRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#002560" stopOpacity={0.22} />
                        <stop offset="100%" stopColor="#002560" stopOpacity={0.01} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#e3ded4" strokeDasharray="3 5" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      minTickGap={26}
                      tick={{ fontSize: 11, fill: '#5a6478' }}
                      tickFormatter={(value: string) => {
                        const date = new Date(`${value}T00:00:00Z`);
                        return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
                      }}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      width={52}
                      tick={{ fontSize: 11, fill: '#5a6478' }}
                      tickFormatter={(value: number) => formatCount(value / 100)}
                    />
                    <Tooltip
                      cursor={{ stroke: '#c9a227', strokeWidth: 1, strokeDasharray: '4 4' }}
                      contentStyle={{
                        borderRadius: 12,
                        border: '1px solid #e3ded4',
                        boxShadow: '0 12px 30px rgb(17 26 44 / 0.12)',
                        fontSize: 12,
                      }}
                      labelFormatter={(label) => formatDate(String(label))}
                      formatter={(value) => [formatSantim(Number(value)), 'Revenue']}
                    />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="#002560"
                      strokeWidth={2.2}
                      fill="url(#adminRevenue)"
                      activeDot={{ r: 4, fill: '#c9a227', stroke: '#002560' }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel title="Order pipeline" description="Where orders currently sit">
              {statusTotal === 0 ? (
                <p className="py-10 text-center text-sm text-slate-warm">No orders in this period yet.</p>
              ) : (
                <div className="space-y-3.5">
                  {sales.statuses
                    .slice()
                    .sort((a, b) => b.count - a.count)
                    .map((entry) => {
                      const share = Math.round((entry.count / statusTotal) * 100);
                      return (
                        <div key={entry.status}>
                          <div className="mb-1 flex items-center justify-between gap-3 text-[12px]">
                            <span className="font-semibold text-brand-900">{humanize(entry.status)}</span>
                            <span className="text-slate-warm">
                              {entry.count} · {share}%
                            </span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-sand">
                            <div
                              className={cx(
                                'h-full rounded-full',
                                entry.status === 'cancelled' || entry.status === 'refunded'
                                  ? 'bg-red-400'
                                  : entry.status === 'delivered'
                                    ? 'bg-emerald-500'
                                    : 'bg-brand-700',
                              )}
                              style={{ width: `${Math.max(share, 2)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
              <div className="mt-5 grid grid-cols-2 gap-2 border-t border-line/60 pt-4">
                {sales.payments.map((entry) => (
                  <div key={entry.provider} className="rounded-xl bg-cream px-3 py-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-warm">
                      {entry.provider === 'cod' ? 'Cash on delivery' : humanize(entry.provider)}
                    </p>
                    <p className="mt-1 font-display text-sm font-bold text-brand-900">{formatSantim(entry.amount)}</p>
                    <p className="text-[10.5px] text-slate-warm">{entry.count} payments</p>
                  </div>
                ))}
                {sales.payments.length === 0 && (
                  <p className="col-span-2 text-xs text-slate-warm">No successful payments in this period.</p>
                )}
              </div>
            </Panel>
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <Panel
              title="Recent orders"
              description="Newest orders across all channels"
              action={
                <Link
                  to="/admin/orders"
                  className="inline-flex items-center gap-1 text-[12px] font-bold text-brand-900 hover:underline"
                >
                  View all <ArrowRight className="size-3" />
                </Link>
              }
              bodyClassName="p-0"
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead>
                    <tr>
                      <Th>Order</Th>
                      <Th>Customer</Th>
                      <Th>Status</Th>
                      <Th align="right">Total</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.recentOrders.map((order) => (
                      <tr key={order.id} className="transition hover:bg-cream/60">
                        <Td>
                          <Link
                            to={`/admin/orders/${order.id}`}
                            className="font-semibold text-brand-900 hover:underline"
                          >
                            {order.orderNumber}
                          </Link>
                          <p className="text-[11px] text-slate-warm">{relativeDate(order.placedAt)}</p>
                        </Td>
                        <Td>
                          <p className="font-medium text-ink">{order.customerName}</p>
                          <p className="text-[11px] text-slate-warm">{order.itemCount} items</p>
                        </Td>
                        <Td>
                          <div className="flex flex-wrap gap-1.5">
                            <StatusBadge status={order.status} />
                          </div>
                        </Td>
                        <Td align="right" className="font-display font-bold text-brand-900">
                          {formatSantim(order.total)}
                        </Td>
                      </tr>
                    ))}
                    {sales.recentOrders.length === 0 && <TableEmpty colSpan={4}>No orders yet.</TableEmpty>}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel
              title="Top products"
              description="By revenue in this period"
              action={
                <Link to="/admin/reports/products" className="text-[12px] font-bold text-brand-900 hover:underline">
                  Report
                </Link>
              }
              bodyClassName="p-0"
            >
              {sales.topProducts.length === 0 ? (
                <p className="px-5 py-12 text-center text-sm text-slate-warm">No product sales yet.</p>
              ) : (
                <ul className="divide-y divide-line/60">
                  {sales.topProducts.map((product, index) => (
                    <li key={product.productId} className="flex items-center gap-3 px-5 py-3">
                      <span className="w-4 text-center font-display text-sm font-extrabold text-gold-700">
                        {index + 1}
                      </span>
                      <span className="size-10 shrink-0 overflow-hidden rounded-lg bg-sand">
                        {product.imageUrl ? (
                          <img src={product.imageUrl} alt="" className="size-full object-cover" />
                        ) : (
                          <span className="grid size-full place-items-center">
                            <Boxes className="size-4 text-slate-warm" />
                          </span>
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-semibold text-brand-900">{product.name}</p>
                        <p className="text-[11px] text-slate-warm">{product.units} units sold</p>
                      </div>
                      <span className="text-[12px] font-bold text-brand-900">{formatSantim(product.revenue)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </>
      )}

      {data.inventory && (
        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            <StatCard
              label="Low stock"
              value={formatCount(data.inventory.lowStock)}
              hint={`${data.inventory.outOfStock} out of stock`}
              icon={<AlertTriangle className="size-4" />}
              tone="gold"
              to="/admin/inventory?state=low"
            />
            <StatCard
              label="Units reserved"
              value={formatCount(data.inventory.reserved)}
              hint="Held for open orders"
              icon={<Boxes className="size-4" />}
              tone="brand"
              to="/admin/inventory"
            />
            <StatCard
              label="Active variants"
              value={formatCount(data.inventory.variants)}
              hint="Across live products"
              icon={<Package className="size-4" />}
              tone="neutral"
              to="/admin/products"
            />
          </div>
          <Panel
            title="Low stock watchlist"
            description="Restock before these run out"
            action={
              <Link to="/admin/inventory" className="text-[12px] font-bold text-brand-900 hover:underline">
                Manage stock
              </Link>
            }
            bodyClassName="p-0"
          >
            {data.inventory.lowStockItems.length === 0 ? (
              <p className="px-5 py-12 text-center text-sm text-slate-warm">Every variant is above its threshold.</p>
            ) : (
              <ul className="divide-y divide-line/60">
                {data.inventory.lowStockItems.map((item) => (
                  <li key={item.variantId} className="flex items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-semibold text-brand-900">{item.productName}</p>
                      <p className="truncate text-[11px] text-slate-warm">
                        {item.sku} · {item.variantLabel}
                      </p>
                    </div>
                    <div className="text-right">
                      <StatusBadge status={item.available <= 0 ? 'out' : 'low'} />
                      <p className="mt-1 text-[10.5px] text-slate-warm">
                        {item.available} left · alert at {item.threshold}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}

      <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {data.customers && (
          <>
            <StatCard
              label="Customers"
              value={formatCount(data.customers.total)}
              icon={<Users className="size-4" />}
              tone="neutral"
              hint={`${formatCount(data.customers.newInRange)} joined this period`}
              to="/admin/customers"
            />
            <StatCard
              label="Active buyers"
              value={formatCount(data.customers.buyers)}
              icon={<ShoppingBag className="size-4" />}
              tone="brand"
              hint="Customers who ordered in this period"
              to="/admin/customers"
            />
          </>
        )}
        {data.promotions && (
          <>
            <StatCard
              label="Reviews to moderate"
              value={formatCount(data.promotions.pendingReviews)}
              icon={<MessageSquareText className="size-4" />}
              tone="gold"
              hint={`${formatCount(data.promotions.activeCoupons)} active discount codes`}
              to="/admin/reviews"
            />
            <StatCard
              label="Newsletter"
              value={formatCount(data.promotions.subscribers)}
              icon={<TicketPercent className="size-4" />}
              tone="green"
              hint={`${formatCount(data.promotions.activeBanners)} active banners`}
              to="/admin/promotions"
            />
          </>
        )}
      </div>

      {!sales && !data.inventory && !data.customers && !data.promotions && (
        <Panel title="Your role is not scoped to dashboard data">
          <p className="text-sm text-slate-warm">
            Use the navigation to reach the areas your role can manage, or ask a super administrator to extend your
            permissions.
          </p>
        </Panel>
      )}

      {actions.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          {actions.map((action) => (
            <QuickLink key={action.to} to={action.to} label={action.label} icon={action.icon} />
          ))}
        </div>
      )}
    </>
  );
}

function QuickLink({ to, label, icon }: { to: string; label: string; icon: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3.5 py-2 text-[12px] font-semibold text-brand-900 transition hover:border-gold-400 hover:bg-gold-50"
    >
      {icon}
      {label}
      <ArrowUpRight className="size-3 text-slate-warm" />
    </Link>
  );
}
