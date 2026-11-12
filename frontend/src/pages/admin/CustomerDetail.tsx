import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Mail, MapPin, Phone, ShieldCheck, UserRound } from 'lucide-react';
import {
  AdminLoading,
  AdminPageHeader,
  ErrorNotice,
  Panel,
  StatCard,
  StatusBadge,
  DataTable,
  Td,
  Th,
  TableEmpty,
} from '@/components/admin/ui';
import { Badge, Button, Field, Input, Select } from '@/components/ui';
import { useAdminCustomer, useAdminInvalidate } from '@/lib/admin';
import { api, errorMessage } from '@/lib/api';
import { formatDate, formatDateTime, formatSantim } from '@/lib/format';
import { toast } from '@/stores/toasts';
import { useAuth } from '@/stores/auth';

export default function AdminCustomerDetailPage() {
  const { customerId = '' } = useParams();
  const { data, isLoading, isError, error, refetch } = useAdminCustomer(customerId);
  const permissions = useAuth((state) => state.user?.permissions ?? []);
  const canWrite = permissions.includes('customers.write');
  const canOrders = permissions.includes('orders.read');
  const invalidate = useAdminInvalidate();

  const [form, setForm] = useState({ fullName: '', phone: '', status: 'active', marketingOptIn: false });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!data?.customer || hydrated) return;
    setForm({
      fullName: data.customer.fullName,
      phone: data.customer.phone ?? '',
      status: data.customer.status === 'deleted' ? 'active' : data.customer.status,
      marketingOptIn: false,
    });
    setHydrated(true);
  }, [data, hydrated]);

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/admin/customers/${customerId}`, {
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        status: form.status,
        marketingOptIn: form.marketingOptIn,
      }),
    onSuccess: () => {
      toast('Customer updated');
      void invalidate();
      void refetch();
    },
    onError: (mutationError) => toast(errorMessage(mutationError), 'error'),
  });

  if (isError) {
    return (
      <div className="space-y-3">
        <AdminPageHeader title="Customer" back={{ to: '/admin/customers', label: 'Back to customers' }} />
        <ErrorNotice message={errorMessage(error)} />
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  if (isLoading || !data || !hydrated) {
    return <AdminLoading label="Loading customer…" />;
  }

  const customer = data.customer;

  return (
    <div>
      <AdminPageHeader
        title={customer.fullName}
        eyebrow="Customer profile"
        back={{ to: '/admin/customers', label: 'Back to customers' }}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={customer.status} />
            {customer.isStaff && <Badge tone="gold">Staff account</Badge>}
            <span className="text-xs text-slate-warm">Joined {formatDate(customer.createdAt)}</span>
          </span>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Orders placed" value={customer.stats.orders} hint={`${customer.orderCount} active records`} />
        <StatCard label="Paid lifetime" value={formatSantim(customer.paidTotal)} hint="Paid and partially refunded" />
        <StatCard
          label="Average order"
          value={formatSantim(customer.stats.averageOrder)}
          hint={customer.stats.cancelled ? `${customer.stats.cancelled} cancelled` : 'No cancellations'}
        />
        <StatCard
          label="Refunded"
          value={formatSantim(customer.stats.refundedTotal)}
          hint={customer.stats.firstOrderAt ? `First order ${formatDate(customer.stats.firstOrderAt)}` : 'No orders yet'}
          tone="neutral"
        />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <Panel title="Recent orders" bodyClassName="p-0">
            {!canOrders ? (
              <p className="px-5 py-6 text-sm text-slate-warm">
                You do not have permission to view order detail.
              </p>
            ) : customer.recentOrders.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-warm">This customer has not placed an order yet.</p>
            ) : (
              <DataTable className="min-w-[600px]">
                <thead>
                  <tr>
                    <Th>Order</Th>
                    <Th>Placed</Th>
                    <Th>Status</Th>
                    <Th align="right">Items</Th>
                    <Th align="right">Total</Th>
                  </tr>
                </thead>
                <tbody>
                  {customer.recentOrders.map((order) => (
                    <tr key={order.id} className="transition hover:bg-cream/50">
                      <Td>
                        <Link
                          to={`/admin/orders/${order.id}`}
                          className="font-semibold text-brand-900 hover:underline"
                        >
                          {order.orderNumber}
                        </Link>
                      </Td>
                      <Td className="whitespace-nowrap text-[12px] text-slate-warm">
                        {formatDateTime(order.placedAt)}
                      </Td>
                      <Td>
                        <div className="flex flex-wrap gap-1.5">
                          <StatusBadge status={order.status} />
                          <StatusBadge status={order.paymentStatus} />
                        </div>
                      </Td>
                      <Td align="right" className="text-slate-warm">
                        {order.itemCount}
                      </Td>
                      <Td align="right" className="whitespace-nowrap font-semibold text-brand-900">
                        {formatSantim(order.total)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            )}
          </Panel>

          <Panel title="Saved addresses" bodyClassName="p-0">
            {customer.addresses.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-warm">No delivery addresses saved.</p>
            ) : (
              <div className="grid gap-4 p-5 sm:grid-cols-2">
                {customer.addresses.map((address) => (
                  <div key={address.id} className="rounded-xl border border-line/70 bg-cream/40 p-4 text-[12.5px]">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <p className="font-semibold text-brand-900">{address.label}</p>
                      {address.isDefault && <Badge tone="gold">Default</Badge>}
                    </div>
                    <p className="text-brand-900">{address.fullName}</p>
                    <p className="text-slate-warm">{address.phone}</p>
                    <p className="mt-1 text-slate-warm">
                      {address.line1}
                      {address.line2 ? `, ${address.line2}` : ''}
                    </p>
                    <p className="text-slate-warm">
                      {address.city}, {address.region}
                      {address.postalCode ? ` ${address.postalCode}` : ''}
                    </p>
                    <p className="text-slate-warm">{address.country}</p>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel title="Contact">
            <div className="space-y-2 text-[13px]">
              <p className="flex items-center gap-2 text-brand-900">
                <UserRound className="size-4 text-gold-700" /> {customer.fullName}
              </p>
              <p className="flex items-center gap-2 text-slate-warm">
                <Mail className="size-4" /> {customer.email}
              </p>
              <p className="flex items-center gap-2 text-slate-warm">
                <Phone className="size-4" /> {customer.phone || 'No phone'}
              </p>
              <p className="flex items-center gap-2 text-slate-warm">
                <ShieldCheck className="size-4" /> Last login{' '}
                {customer.lastLoginAt ? formatDateTime(customer.lastLoginAt) : 'never'}
              </p>
              <div className="flex flex-wrap gap-1.5 pt-2">
                {customer.roles.map((role) => (
                  <Badge key={role} tone="outline">
                    {role.replace(/_/g, ' ')}
                  </Badge>
                ))}
              </div>
            </div>
          </Panel>

          <Panel title="Account details">
            <div className="space-y-4">
              <Field label="Full name">
                {({ id }) => (
                  <Input
                    id={id}
                    value={form.fullName}
                    onChange={(event) => setForm({ ...form, fullName: event.target.value })}
                    disabled={!canWrite}
                    maxLength={160}
                  />
                )}
              </Field>
              <Field label="Phone">
                {({ id }) => (
                  <Input
                    id={id}
                    value={form.phone}
                    onChange={(event) => setForm({ ...form, phone: event.target.value })}
                    disabled={!canWrite}
                    maxLength={30}
                  />
                )}
              </Field>
              <Field label="Status" hint="Suspension revokes active sessions. Open orders must be resolved first.">
                {({ id }) => (
                  <Select
                    id={id}
                    value={form.status}
                    onChange={(event) => setForm({ ...form, status: event.target.value })}
                    disabled={!canWrite}
                  >
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                  </Select>
                )}
              </Field>
              <label className="flex items-start gap-2 text-[12.5px] text-slate-warm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-brand-900"
                  checked={form.marketingOptIn}
                  onChange={(event) => setForm({ ...form, marketingOptIn: event.target.checked })}
                  disabled={!canWrite}
                />
                Customer has opted in to marketing messages.
              </label>
              {canWrite && (
                <Button
                  fullWidth
                  loading={save.isPending}
                  disabled={!form.fullName.trim()}
                  onClick={() => save.mutate()}
                >
                  Save changes
                </Button>
              )}
            </div>
          </Panel>

          {customer.isStaff && (
            <p className="rounded-xl border border-gold-200 bg-gold-50 px-4 py-3 text-[12px] text-gold-800">
              This is a staff account. Role changes belong in Staff &amp; roles and require staff permission.
            </p>
          )}
          <p className="flex items-start gap-2 text-[11.5px] text-slate-warm">
            <MapPin className="mt-0.5 size-3.5" /> Addresses are managed by the customer from their account centre.
          </p>
        </div>
      </div>
    </div>
  );
}
