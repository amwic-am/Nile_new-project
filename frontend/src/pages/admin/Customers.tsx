import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Download, Users } from 'lucide-react';
import {
  AdminLoading,
  AdminPageHeader,
  DataTable,
  ErrorNotice,
  SearchField,
  SelectField,
  StatusBadge,
  Td,
  Th,
} from '@/components/admin/ui';
import { Badge, Button, EmptyState, Pagination } from '@/components/ui';
import { adminCsvUrl, useAdminCustomers } from '@/lib/admin';
import { errorMessage } from '@/lib/api';
import { formatDate, formatSantim } from '@/lib/format';

export default function AdminCustomersPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const status = params.get('status') ?? 'all';
  const segment = params.get('segment') ?? 'all';
  const page = Math.max(1, Number(params.get('page') || '1') || 1);
  const [search, setSearch] = useState(q);

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
    () => ({ q: q || undefined, status, segment, page, pageSize: 25 }),
    [q, status, segment, page],
  );
  const { data, isLoading, isError, error, refetch } = useAdminCustomers(query);

  return (
    <div>
      <AdminPageHeader
        title="Customers"
        description="Customer profiles, purchase history and account standing. Staff accounts are managed under Staff & roles."
        eyebrow="Customers"
        actions={
          <a
            href={adminCsvUrl('customers/export', { q, status, segment })}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-3.5 text-[13px] font-semibold text-brand-900 transition hover:border-brand-900/30"
          >
            <Download className="size-4 text-gold-700" /> Export CSV
          </a>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <SearchField value={search} onChange={setSearch} placeholder="Name or email" className="w-full sm:w-72" />
        <SelectField
          label="Status"
          value={status}
          onChange={(next) => update({ status: next === 'all' ? null : next })}
          options={[
            { value: 'all', label: 'All statuses' },
            { value: 'active', label: 'Active' },
            { value: 'suspended', label: 'Suspended' },
            { value: 'deleted', label: 'Deleted' },
          ]}
        />
        <SelectField
          label="Segment"
          value={segment}
          onChange={(next) => update({ segment: next === 'all' ? null : next })}
          options={[
            { value: 'all', label: 'All customers' },
            { value: 'buyers', label: 'Has ordered' },
            { value: 'repeat', label: 'Repeat buyers' },
            { value: 'new', label: 'New (90 days)' },
          ]}
        />
      </div>

      {isError ? (
        <div className="space-y-3">
          <ErrorNotice message={errorMessage(error)} />
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      ) : isLoading || !data ? (
        <AdminLoading label="Loading customers…" />
      ) : !data.customers.length ? (
        <div className="surface">
          <EmptyState
            icon={<Users className="size-6" />}
            title="No customers in this view"
            description="Try a different search term, status or segment."
          />
        </div>
      ) : (
        <div className="space-y-4">
          <DataTable className="min-w-[900px]">
            <thead>
              <tr>
                <Th>Customer</Th>
                <Th>Status</Th>
                <Th align="right">Orders</Th>
                <Th align="right">Paid total</Th>
                <Th>Last order</Th>
                <Th>Joined</Th>
                <Th>Last login</Th>
              </tr>
            </thead>
            <tbody>
              {data.customers.map((customer) => (
                <tr key={customer.id} className="transition hover:bg-cream/50">
                  <Td>
                    <Link
                      to={`/admin/customers/${customer.id}`}
                      className="font-semibold text-brand-900 hover:underline"
                    >
                      {customer.fullName}
                    </Link>
                    <p className="text-[11.5px] text-slate-warm">
                      {customer.email}
                      {customer.phone ? ` · ${customer.phone}` : ''}
                    </p>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge status={customer.status} />
                      {customer.isStaff && <Badge tone="gold">Staff</Badge>}
                    </div>
                  </Td>
                  <Td align="right" className="text-brand-900">
                    {customer.orderCount}
                  </Td>
                  <Td align="right" className="whitespace-nowrap font-semibold text-brand-900">
                    {formatSantim(customer.paidTotal)}
                  </Td>
                  <Td className="whitespace-nowrap text-[12px] text-slate-warm">
                    {customer.lastOrderAt ? formatDate(customer.lastOrderAt) : '—'}
                  </Td>
                  <Td className="whitespace-nowrap text-[12px] text-slate-warm">{formatDate(customer.createdAt)}</Td>
                  <Td className="whitespace-nowrap text-[12px] text-slate-warm">
                    {customer.lastLoginAt ? formatDate(customer.lastLoginAt) : 'Never'}
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
