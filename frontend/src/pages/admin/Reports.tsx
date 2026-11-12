import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Boxes,
  CircleDollarSign,
  Download,
  Package,
  ReceiptText,
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
  AdminTabs,
  DataTable,
  DateRangeFields,
  ErrorNotice,
  Panel,
  SelectField,
  StatCard,
  StatusBadge,
  TableEmpty,
  Td,
  Th,
  humanize,
} from '@/components/admin/ui';
import { Button, EmptyState, Spinner } from '@/components/ui';
import {
  adminCsvUrl,
  rangeDays,
  useAdminCustomerReport,
  useAdminInventoryReport,
  useAdminPaymentReport,
  useAdminProductReport,
  useAdminSalesReport,
} from '@/lib/admin';
import { errorMessage } from '@/lib/api';
import { formatCount, formatDate, formatSantim } from '@/lib/format';
import { useAuth } from '@/stores/auth';

type Tab = 'sales' | 'products' | 'customers' | 'payments' | 'inventory';

const exportLink =
  'inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-3.5 text-[13px] font-semibold text-brand-900 transition hover:border-brand-900/30';

export default function AdminReportsPage() {
  const user = useAuth((state) => state.user);
  const permissions = user?.permissions ?? [];
  const canReports = permissions.includes('reports.view');
  const canInventory = permissions.includes('inventory.read');
  const canCustomers = permissions.includes('customers.read');
  const canPayments =
    permissions.includes('payments.read') ||
    permissions.includes('payments.manage') ||
    permissions.includes('reports.finance');

  const tabs = useMemo(
    () =>
      [
        canReports ? { key: 'sales' as const, label: 'Sales' } : null,
        canReports ? { key: 'products' as const, label: 'Products' } : null,
        canReports && canCustomers ? { key: 'customers' as const, label: 'Customers' } : null,
        canReports && canPayments ? { key: 'payments' as const, label: 'Payments' } : null,
        canInventory ? { key: 'inventory' as const, label: 'Inventory' } : null,
      ].filter((entry): entry is { key: Tab; label: string } => Boolean(entry)),
    [canReports, canCustomers, canPayments, canInventory],
  );

  const [tab, setTab] = useState<Tab>('sales');
  const [range, setRange] = useState(() => rangeDays(30));
  const active = tabs.some((entry) => entry.key === tab) ? tab : tabs[0]?.key;

  return (
    <div>
      <AdminPageHeader
        eyebrow="Insights"
        title="Reports"
        description="Trading performance, catalogue and payment data drawn directly from live orders. Ranges use Addis Ababa calendar days."
        actions={<DateRangeFields value={range} onChange={setRange} />}
      />

      {tabs.length > 1 && <AdminTabs className="mb-5" tabs={tabs} value={active ?? 'sales'} onChange={setTab} />}

      {active === 'sales' && <SalesTab range={range} />}
      {active === 'products' && <ProductsTab range={range} />}
      {active === 'customers' && <CustomersTab range={range} />}
      {active === 'payments' && <PaymentsTab range={range} />}
      {active === 'inventory' && <InventoryTab />}
      {!active && (
        <div className="surface">
          <EmptyState
            icon={<ReceiptText className="size-6" />}
            title="No report access"
            description="Your role does not include reporting permissions."
          />
        </div>
      )}
    </div>
  );
}

function QueryError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="space-y-3">
      <ErrorNotice message={errorMessage(error)} />
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

function ExportButton({ path, range, extra }: { path: string; range: { from: string; to: string }; extra?: Record<string, string> }) {
  return (
    <a href={adminCsvUrl(path, { ...range, format: 'csv', ...extra })} className={exportLink}>
      <Download className="size-4 text-gold-700" /> Export CSV
    </a>
  );
}

/* ------------------------------------------------------------------- Sales */

function SalesTab({ range }: { range: { from: string; to: string } }) {
  const { data, isLoading, isError, error, refetch } = useAdminSalesReport(range);

  if (isLoading && !data) return <AdminLoading label="Calculating sales…" />;
  if (isError) return <QueryError error={error} onRetry={() => void refetch()} />;
  if (!data) return null;

  const { summary } = data;
  const maxMix = Math.max(1, ...data.paymentMix.map((entry) => entry.orders));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-warm">
          {formatDate(data.range.from)} – {formatDate(data.range.to)}
        </p>
        <ExportButton path="reports/sales" range={range} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Paid revenue"
          value={formatSantim(summary.revenue)}
          icon={<CircleDollarSign className="size-4" />}
          tone="brand"
          hint={`${formatCount(summary.orders)} orders · ${formatCount(summary.units)} units`}
        />
        <StatCard
          label="Average order value"
          value={formatSantim(summary.averageOrderValue)}
          icon={<Wallet className="size-4" />}
          tone="gold"
        />
        <StatCard
          label="Refunds"
          value={formatSantim(summary.refunds)}
          icon={<TrendingUp className="size-4" />}
          tone="red"
          hint={`Net revenue ${formatSantim(summary.netRevenue)}`}
        />
        <StatCard
          label="Discounts & shipping"
          value={formatSantim(summary.discounts + summary.shipping)}
          icon={<ReceiptText className="size-4" />}
          tone="neutral"
          hint={`${formatSantim(summary.discounts)} discounts · ${formatSantim(summary.shipping)} shipping`}
        />
      </div>

      <Panel title="Revenue trend" description="Paid order value by day">
        <div className="h-[280px] w-full">
          {data.series.length === 0 ? (
            <div className="grid h-full place-items-center text-sm text-slate-warm">No orders in this range.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.series} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="reportRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#002560" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#002560" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e1d6" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: '#6b6a63' }}
                  tickFormatter={(value: string) => formatDate(value).replace(/ \d{4}$/, '')}
                  interval="preserveStartEnd"
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#6b6a63' }}
                  tickFormatter={(value: number) => formatCount(value / 100)}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                />
                <Tooltip
                  formatter={(value) => [formatSantim(Number(value)), 'Revenue']}
                  labelFormatter={(label) => formatDate(String(label))}
                  contentStyle={{
                    borderRadius: 12,
                    border: '1px solid #e7e1d6',
                    fontSize: 12,
                    boxShadow: '0 10px 30px rgba(0,37,96,0.08)',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#002560"
                  strokeWidth={2}
                  fill="url(#reportRevenue)"
                  name="Revenue"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Payment mix" description="Orders by payment method">
          {data.paymentMix.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-warm">No payments in this range.</p>
          ) : (
            <ul className="space-y-3">
              {data.paymentMix.map((entry) => (
                <li key={entry.method}>
                  <div className="flex items-center justify-between gap-2 text-[12.5px]">
                    <span className="font-semibold text-brand-900">{humanize(entry.method)}</span>
                    <span className="text-slate-warm">
                      {entry.orders} orders · {formatSantim(entry.revenue)}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sand">
                    <div
                      className="h-full rounded-full bg-brand-900"
                      style={{ width: `${Math.max(4, (entry.orders / maxMix) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Category performance" description="Revenue by category">
          {data.categories.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-warm">No category sales in this range.</p>
          ) : (
            <ul className="divide-y divide-line/60">
              {data.categories.map((category) => (
                <li key={category.name} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
                  <span className="min-w-0 truncate font-medium text-brand-900">{category.name}</span>
                  <span className="shrink-0 text-right text-slate-warm">
                    <span className="block font-semibold text-brand-900">{formatSantim(category.revenue)}</span>
                    {formatCount(category.units)} units
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Products */

function ProductsTab({ range }: { range: { from: string; to: string } }) {
  const [limit, setLimit] = useState('20');
  const query = useMemo(() => ({ ...range, limit }), [range, limit]);
  const { data, isLoading, isError, error, refetch } = useAdminProductReport(query);

  if (isLoading && !data) return <AdminLoading label="Ranking products…" />;
  if (isError) return <QueryError error={error} onRetry={() => void refetch()} />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SelectField
          label="Rows"
          value={limit}
          onChange={setLimit}
          options={[
            { value: '20', label: 'Top 20' },
            { value: '50', label: 'Top 50' },
            { value: '100', label: 'Top 100' },
          ]}
        />
        <p className="text-sm text-slate-warm">
          {formatDate(data.range.from)} – {formatDate(data.range.to)}
        </p>
        <div className="ml-auto">
          <ExportButton path="reports/products" range={range} extra={{ limit }} />
        </div>
      </div>

      <DataTable className="min-w-[820px]">
        <thead>
          <tr>
            <Th>Product</Th>
            <Th>SKU</Th>
            <Th align="right">Units</Th>
            <Th align="right">Orders</Th>
            <Th align="right">Revenue</Th>
            <Th>Last sold</Th>
          </tr>
        </thead>
        <tbody>
          {data.products.length === 0 ? (
            <TableEmpty colSpan={6}>No product sales in this range.</TableEmpty>
          ) : (
            data.products.map((product) => (
              <tr key={product.productId} className="transition hover:bg-cream/50">
                <Td>
                  <Link
                    to={`/product/${product.slug}`}
                    className="font-semibold text-brand-900 hover:underline"
                  >
                    {product.name}
                  </Link>
                </Td>
                <Td className="font-mono text-[12px] text-slate-warm">{product.sku}</Td>
                <Td align="right">{formatCount(product.units)}</Td>
                <Td align="right">{formatCount(product.orders)}</Td>
                <Td align="right" className="whitespace-nowrap font-semibold text-brand-900">
                  {formatSantim(product.revenue)}
                </Td>
                <Td className="whitespace-nowrap text-[12px] text-slate-warm">
                  {product.lastSoldAt ? formatDate(product.lastSoldAt) : '—'}
                </Td>
              </tr>
            ))
          )}
        </tbody>
      </DataTable>
    </div>
  );
}

/* --------------------------------------------------------------- Customers */

function CustomersTab({ range }: { range: { from: string; to: string } }) {
  const { data, isLoading, isError, error, refetch } = useAdminCustomerReport(range);

  if (isLoading && !data) return <AdminLoading label="Analysing customers…" />;
  if (isError) return <QueryError error={error} onRetry={() => void refetch()} />;
  if (!data) return null;

  const growth =
    data.summary.previousNewCustomers > 0
      ? ((data.summary.newCustomers - data.summary.previousNewCustomers) / data.summary.previousNewCustomers) * 100
      : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-warm">
          {formatDate(data.range.from)} – {formatDate(data.range.to)}
        </p>
        <ExportButton path="reports/customers" range={range} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="New customers"
          value={formatCount(data.summary.newCustomers)}
          icon={<Users className="size-4" />}
          tone="brand"
          hint={
            growth === null
              ? 'No prior-period signups to compare'
              : `${growth >= 0 ? '+' : ''}${growth.toFixed(1)}% vs prior period`
          }
        />
        <StatCard label="Buyers" value={formatCount(data.summary.buyers)} tone="green" />
        <StatCard
          label="Repeat buyers"
          value={formatCount(data.summary.repeatBuyers)}
          tone="gold"
          hint={
            data.summary.buyers > 0
              ? `${((data.summary.repeatBuyers / data.summary.buyers) * 100).toFixed(0)}% of buyers`
              : undefined
          }
        />
        <StatCard label="Top customer spend" value={formatSantim(data.topCustomers[0]?.spend ?? 0)} tone="neutral" />
      </div>

      <Panel title="Top customers" description="Highest paid spend in this range" bodyClassName="p-0">
        <DataTable>
          <thead>
            <tr>
              <Th>Customer</Th>
              <Th align="right">Orders</Th>
              <Th align="right">Spend</Th>
              <Th>Last order</Th>
            </tr>
          </thead>
          <tbody>
            {data.topCustomers.length === 0 ? (
              <TableEmpty colSpan={4}>No customer orders in this range.</TableEmpty>
            ) : (
              data.topCustomers.map((customer) => (
                <tr key={customer.id} className="transition hover:bg-cream/50">
                  <Td>
                    <Link
                      to={`/admin/customers/${customer.id}`}
                      className="font-semibold text-brand-900 hover:underline"
                    >
                      {customer.name}
                    </Link>
                    <p className="text-[11.5px] text-slate-warm">{customer.email}</p>
                  </Td>
                  <Td align="right">{customer.orders}</Td>
                  <Td align="right" className="whitespace-nowrap font-semibold text-brand-900">
                    {formatSantim(customer.spend)}
                  </Td>
                  <Td className="whitespace-nowrap text-[12px] text-slate-warm">
                    {customer.lastOrderAt ? formatDate(customer.lastOrderAt) : '—'}
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </DataTable>
      </Panel>
    </div>
  );
}

/* ---------------------------------------------------------------- Payments */

function PaymentsTab({ range }: { range: { from: string; to: string } }) {
  const { data, isLoading, isError, error, refetch } = useAdminPaymentReport(range);

  if (isLoading && !data) return <AdminLoading label="Reconciling payments…" />;
  if (isError) return <QueryError error={error} onRetry={() => void refetch()} />;
  if (!data) return null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-warm">
          {formatDate(data.range.from)} – {formatDate(data.range.to)}
        </p>
        <ExportButton path="reports/payments" range={range} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="COD outstanding"
          value={formatSantim(data.codOutstanding.amount)}
          icon={<Package className="size-4" />}
          tone="gold"
          hint={`${data.codOutstanding.orders} undelivered or unpaid orders`}
        />
        <StatCard
          label="Failed payments"
          value={formatCount(data.failedPayments)}
          icon={<AlertTriangle className="size-4" />}
          tone="red"
          hint="Orders marked failed in this range"
        />
        <StatCard
          label="Refunds in range"
          value={formatSantim(data.refunds.reduce((total, entry) => total + entry.amount, 0))}
          icon={<Wallet className="size-4" />}
          tone="neutral"
        />
        <StatCard
          label="Transactions"
          value={formatCount(data.providers.reduce((total, entry) => total + entry.count, 0))}
          icon={<ReceiptText className="size-4" />}
          tone="brand"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Payment providers" bodyClassName="p-0">
          <DataTable>
            <thead>
              <tr>
                <Th>Provider</Th>
                <Th>Status</Th>
                <Th align="right">Transactions</Th>
                <Th align="right">Amount</Th>
              </tr>
            </thead>
            <tbody>
              {data.providers.length === 0 ? (
                <TableEmpty colSpan={4}>No payment attempts in this range.</TableEmpty>
              ) : (
                data.providers.map((entry) => (
                  <tr key={`${entry.provider}-${entry.status}`}>
                    <Td className="font-semibold text-brand-900">{humanize(entry.provider)}</Td>
                    <Td>
                      <StatusBadge status={entry.status} />
                    </Td>
                    <Td align="right">{entry.count}</Td>
                    <Td align="right" className="whitespace-nowrap font-semibold text-brand-900">
                      {formatSantim(entry.amount)}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </DataTable>
        </Panel>

        <Panel title="Refunds" bodyClassName="p-0">
          <DataTable>
            <thead>
              <tr>
                <Th>Status</Th>
                <Th align="right">Count</Th>
                <Th align="right">Amount</Th>
              </tr>
            </thead>
            <tbody>
              {data.refunds.length === 0 ? (
                <TableEmpty colSpan={3}>No refunds in this range.</TableEmpty>
              ) : (
                data.refunds.map((entry) => (
                  <tr key={entry.status}>
                    <Td>
                      <StatusBadge status={entry.status} />
                    </Td>
                    <Td align="right">{entry.count}</Td>
                    <Td align="right" className="whitespace-nowrap font-semibold text-brand-900">
                      {formatSantim(entry.amount)}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </DataTable>
        </Panel>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- Inventory */

function InventoryTab() {
  const { data, isLoading, isError, error, refetch } = useAdminInventoryReport();

  if (isLoading && !data) return <AdminLoading label="Valuing inventory…" />;
  if (isError) return <QueryError error={error} onRetry={() => void refetch()} />;
  if (!data) return null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-warm">Current stock position across every active variant.</p>
        <div className="flex items-center gap-2 text-xs text-slate-warm">
          {isLoading && <Spinner className="size-4" />}
          Generated {formatDate(data.generatedAt)}
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Units on hand"
          value={formatCount(data.totals.units)}
          icon={<Boxes className="size-4" />}
          tone="brand"
          hint={`${formatCount(data.totals.variants)} variants`}
        />
        <StatCard
          label="Retail value"
          value={formatSantim(data.totals.retailValue)}
          icon={<Wallet className="size-4" />}
          tone="gold"
          hint={data.showCost ? `${formatSantim(data.totals.costValue)} at cost` : undefined}
        />
        <StatCard
          label="Low stock"
          value={formatCount(data.totals.lowStock)}
          icon={<AlertTriangle className="size-4" />}
          tone="gold"
          hint="At or below threshold"
        />
        <StatCard
          label="Out of stock"
          value={formatCount(data.totals.outOfStock)}
          icon={<Package className="size-4" />}
          tone="red"
          hint="No available units"
        />
      </div>

      <DataTable className="min-w-[960px]">
        <thead>
          <tr>
            <Th>Product</Th>
            <Th>SKU</Th>
            <Th align="right">On hand</Th>
            <Th align="right">Reserved</Th>
            <Th align="right">Available</Th>
            <Th align="right">Threshold</Th>
            <Th align="right">Retail</Th>
            {data.showCost && <Th align="right">Cost</Th>}
            {data.showCost && <Th align="right">Margin</Th>}
          </tr>
        </thead>
        <tbody>
          {data.variants.length === 0 ? (
            <TableEmpty colSpan={data.showCost ? 9 : 7}>No stock records yet.</TableEmpty>
          ) : (
            data.variants.map((variant) => {
              const margin =
                data.showCost && variant.costPrice !== null && variant.price > 0
                  ? Math.round(((variant.price - variant.costPrice) / variant.price) * 100)
                  : null;
              return (
                <tr key={variant.variantId} className="transition hover:bg-cream/50">
                  <Td>
                    <Link
                      to={`/admin/products/${variant.productId}`}
                      className="font-semibold text-brand-900 hover:underline"
                    >
                      {variant.productName}
                    </Link>
                  </Td>
                  <Td className="font-mono text-[12px] text-slate-warm">{variant.sku}</Td>
                  <Td align="right">{variant.quantity}</Td>
                  <Td align="right" className="text-slate-warm">
                    {variant.reserved}
                  </Td>
                  <Td
                    align="right"
                    className={
                      variant.available <= 0
                        ? 'font-semibold text-red-600'
                        : variant.available <= variant.threshold
                          ? 'font-semibold text-amber-700'
                          : 'font-semibold text-brand-900'
                    }
                  >
                    {variant.available}
                  </Td>
                  <Td align="right" className="text-slate-warm">
                    {variant.threshold}
                  </Td>
                  <Td align="right" className="whitespace-nowrap">
                    {formatSantim(variant.retailValue)}
                  </Td>
                  {data.showCost && (
                    <Td align="right" className="whitespace-nowrap text-slate-warm">
                      {variant.costValue === null ? '—' : formatSantim(variant.costValue)}
                    </Td>
                  )}
                  {data.showCost && (
                    <Td align="right" className="whitespace-nowrap">
                      {margin === null ? '—' : `${margin}%`}
                    </Td>
                  )}
                </tr>
              );
            })
          )}
        </tbody>
      </DataTable>
    </div>
  );
}
