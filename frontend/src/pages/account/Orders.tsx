import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Package, Search } from 'lucide-react';
import { OrderRow } from '@/components/account/OrderRow';
import { Button, ButtonLink, EmptyState, Input, Pagination, Skeleton } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useOrders, type OrderStatusFilter } from '@/lib/queries';
import { useSeo } from '@/lib/seo';

const TABS: { id: OrderStatusFilter; label: string }[] = [
  { id: 'all', label: 'All orders' },
  { id: 'active', label: 'In progress' },
  { id: 'completed', label: 'Delivered' },
  { id: 'cancelled', label: 'Cancelled' },
];

function parseStatus(value: string | null): OrderStatusFilter {
  return TABS.some((tab) => tab.id === value) ? (value as OrderStatusFilter) : 'all';
}

export default function AccountOrdersPage() {
  const [params, setParams] = useSearchParams();
  const status = parseStatus(params.get('status'));
  const q = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('page') || '1') || 1);
  const [search, setSearch] = useState(q);
  const { data, isLoading, isError, error, refetch } = useOrders(page, { status, q });

  useSeo({
    title: 'Your orders',
    description: 'Track Nile Mart orders, payments and deliveries.',
    canonicalPath: '/account/orders',
    noIndex: true,
  });

  useEffect(() => {
    setSearch(q);
  }, [q]);

  const update = (next: Record<string, string | null>) => {
    const draft = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value) draft.set(key, value);
      else draft.delete(key);
    }
    if (!('page' in next)) draft.delete('page');
    setParams(draft, { replace: true });
  };

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    update({ q: search.trim() || null });
  };

  return (
    <div className="space-y-4">
      <div className="surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-brand-900">Your orders</h2>
            <p className="mt-0.5 text-[12px] text-slate-warm">
              Follow every purchase from confirmation to delivery.
            </p>
          </div>
          <form onSubmit={submitSearch} className="flex w-full gap-2 sm:w-auto">
            <div className="relative flex-1 sm:w-56">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-warm" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Order number"
                aria-label="Search by order number"
                className="pl-9"
              />
            </div>
            <Button type="submit" variant="outline">
              Search
            </Button>
          </form>
        </div>

        <div className="mt-4 flex gap-1 overflow-x-auto rounded-xl bg-cream p-1 no-scrollbar">
          {TABS.map((tab) => (
            <Link
              key={tab.id}
              to={tab.id === 'all' ? '/account/orders' : `/account/orders?status=${tab.id}`}
              className={`shrink-0 rounded-lg px-3.5 py-2 text-[12px] font-semibold transition ${
                status === tab.id
                  ? 'bg-white text-brand-900 shadow-sm'
                  : 'text-slate-warm hover:text-brand-900'
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((item) => (
            <Skeleton key={item} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : isError ? (
        <div className="surface">
          <EmptyState
            icon={<Package className="size-6" />}
            title="We could not load your orders"
            description={errorMessage(error)}
            action={<Button onClick={() => void refetch()}>Try again</Button>}
          />
        </div>
      ) : !data || data.orders.length === 0 ? (
        <div className="surface">
          <EmptyState
            icon={<Package className="size-6" />}
            title={q ? `No orders matched “${q}”` : status === 'all' ? 'No orders yet' : 'Nothing in this view'}
            description={
              q
                ? 'Check the order number and try again, or clear the search.'
                : status === 'all'
                  ? 'Your Nile Mart purchases will appear here as soon as you check out.'
                  : 'Try another filter to see more of your order history.'
            }
            action={
              q ? (
                <Button variant="outline" onClick={() => update({ q: null })}>
                  Clear search
                </Button>
              ) : (
                <ButtonLink to="/products">Start shopping</ButtonLink>
              )
            }
          />
        </div>
      ) : (
        <>
          <div className="surface overflow-hidden">
            {data.orders.map((order) => (
              <OrderRow key={order.id} order={order} />
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[11.5px] text-slate-warm">
              Showing {data.orders.length} of {data.pagination.total} orders
            </p>
            <Pagination
              page={data.pagination.page}
              totalPages={data.pagination.totalPages}
              onChange={(nextPage) =>
                update({ page: nextPage > 1 ? String(nextPage) : null })
              }
            />
          </div>
        </>
      )}
    </div>
  );
}
