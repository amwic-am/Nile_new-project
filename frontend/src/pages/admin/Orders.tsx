import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Download, ShoppingBag } from 'lucide-react';
import {
  AdminLoading,
  AdminPageHeader,
  AdminTabs,
  DataTable,
  DateRangeFields,
  ErrorNotice,
  SearchField,
  SelectField,
  StatusBadge,
  TableEmpty,
  Td,
  Th,
} from '@/components/admin/ui';
import { Button, EmptyState, Pagination } from '@/components/ui';
import { adminCsvUrl, rangeDays, useAdminOrders } from '@/lib/admin';
import { errorMessage } from '@/lib/api';
import { formatDateTime, formatSantim } from '@/lib/format';

const STATUS_TABS = [
  'all',
  'pending',
  'awaiting_payment',
  'paid',
  'confirmed',
  'processing',
  'packed',
  'shipped',
  'out_for_delivery',
  'delivered',
  'cancelled',
  'returned',
  'refunded',
] as const;

function labelStatus(value: string) {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export default function AdminOrdersPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'all';
  const q = params.get('q') ?? '';
  const paymentStatus = params.get('paymentStatus') ?? 'all';
  const paymentMethod = params.get('paymentMethod') ?? 'all';
  const page = Math.max(1, Number(params.get('page') || '1') || 1);
  const [search, setSearch] = useState(q);
  const [range, setRange] = useState(() => ({
    from: params.get('from') ?? rangeDays(90).from,
    to: params.get('to') ?? rangeDays(90).to,
  }));

  useEffect(() => setSearch(q), [q]);

  const update = (next: Record<string, string | null>) => {
    const merged = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === '') merged.delete(key);
      else merged.set(key, value);
    }
    if (!('page' in next)) merged.delete('page');
    setParams(merged, { replace: true });
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (search.trim() === q) return;
      update({ q: search.trim() || null });
    }, 350);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const query = useMemo(
    () => ({
      q: q || undefined,
      status,
      paymentStatus,
      paymentMethod,
      from: range.from,
      to: range.to,
      page,
      pageSize: 25,
    }),
    [q, status, paymentStatus, paymentMethod, range, page],
  );

  const { data, isLoading, isError, error, refetch } = useAdminOrders(query);

  return (
    <div>
      <AdminPageHeader
        title="Orders"
        description="Track every order from placement through delivery, with payment and fulfilment detail in one place."
        eyebrow="Commerce"
        actions={
          <a
            href={adminCsvUrl('orders/export', { q, status, paymentStatus, paymentMethod, ...range })}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-3.5 text-[13px] font-semibold text-brand-900 transition hover:border-brand-900/30"
          >
            <Download className="size-4 text-gold-700" /> Export CSV
          </a>
        }
      />

      <div className="mb-5 space-y-3">
        <AdminTabs
          tabs={STATUS_TABS.map((item) => ({
            key: item,
            label: item === 'all' ? 'All' : labelStatus(item),
            count: item === 'all' ? data?.pagination.total : data?.counts[item] ?? undefined,
          }))}
          value={status}
          onChange={(next) => update({ status: next === 'all' ? null : next })}
        />
        <div className="flex flex-wrap items-center gap-2">
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Order number, customer or email"
            className="w-full sm:w-72"
          />
          <SelectField
            label="Payment status"
            value={paymentStatus}
            onChange={(next) => update({ paymentStatus: next === 'all' ? null : next })}
            options={[
              { value: 'all', label: 'Any payment status' },
              { value: 'unpaid', label: 'Unpaid' },
              { value: 'awaiting_payment', label: 'Awaiting payment' },
              { value: 'paid', label: 'Paid' },
              { value: 'failed', label: 'Failed' },
              { value: 'partially_refunded', label: 'Partially refunded' },
              { value: 'refunded', label: 'Refunded' },
            ]}
          />
          <SelectField
            label="Payment method"
            value={paymentMethod}
            onChange={(next) => update({ paymentMethod: next === 'all' ? null : next })}
            options={[
              { value: 'all', label: 'Any method' },
              { value: 'cod', label: 'Cash on delivery' },
              { value: 'chapa', label: 'Chapa' },
            ]}
          />
          <DateRangeFields
            value={range}
            onChange={(next) => {
              setRange(next);
              update({ from: next.from, to: next.to });
            }}
          />
        </div>
      </div>

      {isError ? (
        <div className="space-y-3">
          <ErrorNotice message={errorMessage(error)} />
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      ) : isLoading || !data ? (
        <AdminLoading label="Loading orders…" />
      ) : !data.orders.length ? (
        <div className="surface">
          <EmptyState
            icon={<ShoppingBag className="size-6" />}
            title="No orders in this view"
            description="Adjust the filters or date range to find the orders you are looking for."
          />
        </div>
      ) : (
        <div className="space-y-4">
          <DataTable>
            <thead>
              <tr>
                <Th>Order</Th>
                <Th>Customer</Th>
                <Th>Placed</Th>
                <Th>Payment</Th>
                <Th>Fulfilment</Th>
                <Th align="right">Total</Th>
              </tr>
            </thead>
            <tbody>
              {data.orders.map((order) => (
                <tr key={order.id} className="transition hover:bg-cream/50">
                  <Td>
                    <Link
                      to={`/admin/orders/${order.id}`}
                      className="font-display text-[13px] font-bold text-brand-900 hover:underline"
                    >
                      {order.orderNumber}
                    </Link>
                    <p className="text-[11.5px] text-slate-warm">
                      {order.itemCount} {order.itemCount === 1 ? 'item' : 'items'}
                    </p>
                  </Td>
                  <Td>
                    <p className="font-semibold text-brand-900">{order.customerName}</p>
                    <p className="text-[11.5px] text-slate-warm">{order.email}</p>
                  </Td>
                  <Td className="whitespace-nowrap text-[12.5px] text-slate-warm">
                    {formatDateTime(order.placedAt)}
                  </Td>
                  <Td>
                    <div className="flex flex-col items-start gap-1">
                      <StatusBadge status={order.paymentStatus} />
                      <span className="text-[11px] uppercase tracking-wide text-slate-warm">
                        {order.paymentMethod}
                      </span>
                    </div>
                  </Td>
                  <Td>
                    <div className="flex flex-col items-start gap-1">
                      <StatusBadge status={order.status} />
                      {order.shipmentStatus && (
                        <span className="text-[11px] text-slate-warm">
                          Shipment: {labelStatus(order.shipmentStatus)}
                        </span>
                      )}
                    </div>
                  </Td>
                  <Td align="right" className="whitespace-nowrap font-semibold text-brand-900">
                    {formatSantim(order.total)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          <Pagination
            page={data.pagination.page}
            totalPages={data.pagination.totalPages}
            onChange={(next) => update({ page: String(next) })}
          />
        </div>
      )}
    </div>
  );
}
