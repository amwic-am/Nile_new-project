import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import {
  AlertTriangle,
  CircleDollarSign,
  Download,
  MapPin,
  RotateCcw,
  Truck,
  UserRound,
} from 'lucide-react';
import {
  AdminLoading,
  AdminPageHeader,
  ConfirmDialog,
  ErrorNotice,
  Panel,
  StatusBadge,
  humanize,
} from '@/components/admin/ui';
import { Button, Field, Input, Modal, Select, Textarea } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAdminOrder, useAdminInvalidate } from '@/lib/admin';
import { formatDate, formatDateTime, formatSantim } from '@/lib/format';
import { toast } from '@/stores/toasts';
import { useAuth } from '@/stores/auth';

function hasPermission(permissions: string[], key: string) {
  return permissions.includes(key);
}

export default function AdminOrderDetailPage() {
  const { orderId = '' } = useParams();
  const { data, isLoading, isError, error, refetch } = useAdminOrder(orderId);
  const permissions = useAuth((state) => state.user?.permissions ?? []);
  const invalidate = useAdminInvalidate();

  const [statusOpen, setStatusOpen] = useState(false);
  const [status, setStatus] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [shipOpen, setShipOpen] = useState(false);
  const [shipment, setShipment] = useState({
    carrier: '',
    trackingNumber: '',
    trackingUrl: '',
    notes: '',
    status: 'label_created',
  });
  const [refundOpen, setRefundOpen] = useState(false);
  const [refund, setRefund] = useState({ amount: '', reason: '', providerRef: '' });
  const [note, setNote] = useState<string | null>(null);
  const [returnDecision, setReturnDecision] = useState<{
    id: string;
    status: string;
    adminNote: string;
    restock: boolean;
  } | null>(null);
  const [settleOpen, setSettleOpen] = useState(false);

  const statusMutation = useMutation({
    mutationFn: () =>
      api.patch(`/admin/orders/${orderId}/status`, { status, note: statusNote || undefined }),
    onSuccess: () => {
      toast('Order status updated');
      setStatusOpen(false);
      setStatusNote('');
      void invalidate();
    },
    onError: (mutationError) => toast(errorMessage(mutationError), 'error'),
  });

  const noteMutation = useMutation({
    mutationFn: (adminNote: string) => api.patch(`/admin/orders/${orderId}/note`, { adminNote }),
    onSuccess: () => {
      toast('Internal note saved');
      void invalidate();
    },
    onError: (mutationError) => toast(errorMessage(mutationError), 'error'),
  });

  const shipmentMutation = useMutation({
    mutationFn: () => api.post(`/admin/orders/${orderId}/shipments`, shipment),
    onSuccess: () => {
      toast('Shipment recorded');
      setShipOpen(false);
      setShipment({ carrier: '', trackingNumber: '', trackingUrl: '', notes: '', status: 'label_created' });
      void invalidate();
    },
    onError: (mutationError) => toast(errorMessage(mutationError), 'error'),
  });

  const refundMutation = useMutation({
    mutationFn: () =>
      api.post(`/admin/orders/${orderId}/refunds`, {
        amount: Math.round(Number(refund.amount) * 100),
        reason: refund.reason,
        providerRef: refund.providerRef || undefined,
      }),
    onSuccess: () => {
      toast('Refund requested — process it in the payment provider before marking it complete.');
      setRefundOpen(false);
      setRefund({ amount: '', reason: '', providerRef: '' });
      void invalidate();
    },
    onError: (mutationError) => toast(errorMessage(mutationError), 'error'),
  });

  const returnMutation = useMutation({
    mutationFn: (input: NonNullable<typeof returnDecision>) =>
      api.patch(`/admin/orders/${orderId}/returns/${input.id}`, {
        status: input.status,
        adminNote: input.adminNote || undefined,
        restock: input.restock,
      }),
    onSuccess: () => {
      toast('Return updated');
      setReturnDecision(null);
      void invalidate();
    },
    onError: (mutationError) => toast(errorMessage(mutationError), 'error'),
  });

  const settleMutation = useMutation({
    mutationFn: () => api.post(`/admin/orders/${orderId}/settle-cod`),
    onSuccess: () => {
      toast('Cash payment recorded');
      setSettleOpen(false);
      void invalidate();
    },
    onError: (mutationError) => toast(errorMessage(mutationError), 'error'),
  });

  if (isError) {
    return (
      <div className="space-y-3">
        <AdminPageHeader title="Order" back={{ to: '/admin/orders', label: 'Back to orders' }} />
        <ErrorNotice message={errorMessage(error)} />
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  if (isLoading || !data) {
    return <AdminLoading label="Loading order…" />;
  }

  const order = data.order;
  const canUpdate = hasPermission(permissions, 'orders.update');
  const canRefund = hasPermission(permissions, 'orders.refund');
  const canManagePayments = hasPermission(permissions, 'payments.manage');
  const refundable = ['paid', 'partially_refunded'].includes(order.paymentStatus);
  const openReturns = order.returns.filter((entry) => !['refunded', 'rejected', 'cancelled'].includes(entry.status));

  return (
    <div>
      <AdminPageHeader
        title={order.orderNumber}
        eyebrow="Order detail"
        back={{ to: '/admin/orders', label: 'Back to orders' }}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={order.status} />
            <StatusBadge status={order.paymentStatus} />
            <span className="text-xs text-slate-warm">Placed {formatDateTime(order.placedAt)}</span>
          </span>
        }
        actions={
          <>
            <a
              href={`/api/admin/orders/${order.id}/invoice`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-[12.5px] font-semibold text-brand-900 transition hover:border-brand-900/30"
            >
              <Download className="size-3.5" /> Invoice
            </a>
            {canManagePayments && order.paymentMethod === 'cod' && order.paymentStatus !== 'paid' && (
              <Button size="sm" variant="gold" onClick={() => setSettleOpen(true)}>
                Record cash payment
              </Button>
            )}
            {canRefund && refundable && (
              <Button size="sm" variant="outline" onClick={() => setRefundOpen(true)}>
                Request refund
              </Button>
            )}
            {canUpdate && order.allowedStatuses.length > 0 && (
              <Button
                size="sm"
                onClick={() => {
                  setStatus(order.allowedStatuses[0]);
                  setStatusOpen(true);
                }}
              >
                Update status
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <Panel title="Items" bodyClassName="p-0">
            <div className="divide-y divide-line/60">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-center gap-3 px-5 py-3.5">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt="" className="size-12 rounded-lg object-cover" />
                  ) : (
                    <div className="grid size-12 place-items-center rounded-lg bg-sand text-[10px] text-slate-warm">
                      No image
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-brand-900">{item.name}</p>
                    <p className="text-[11.5px] text-slate-warm">
                      {item.variantLabel ? `${item.variantLabel} · ` : ''}
                      SKU {item.sku}
                    </p>
                  </div>
                  <div className="text-right text-[12.5px]">
                    <p className="text-slate-warm">
                      {item.quantity} × {formatSantim(item.unitPrice)}
                    </p>
                    <p className="font-semibold text-brand-900">{formatSantim(item.lineTotal)}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-2 border-t border-line/70 bg-cream/50 px-5 py-4 text-[13px]">
              <Row label="Subtotal" value={formatSantim(order.subtotal)} />
              {order.discount > 0 && (
                <Row
                  label={`Discount${order.couponCode ? ` (${order.couponCode})` : ''}`}
                  value={`− ${formatSantim(order.discount)}`}
                />
              )}
              <Row label={`Delivery · ${order.deliveryLabel}`} value={formatSantim(order.shippingFee)} />
              <div className="flex items-center justify-between border-t border-line/60 pt-2 font-display text-base font-bold text-brand-900">
                <span>Total</span>
                <span>{formatSantim(order.total)}</span>
              </div>
            </div>
          </Panel>

          <Panel title="Status history">
            <ol className="space-y-4">
              {order.history.map((entry, index) => (
                <li key={`${entry.status}-${entry.createdAt}-${index}`} className="flex gap-3">
                  <span className="mt-1 size-2 shrink-0 rounded-full bg-gold-500 ring-4 ring-gold-100" />
                  <div>
                    <p className="text-[13px] font-semibold text-brand-900">{humanize(entry.status)}</p>
                    {entry.note && <p className="text-[12px] text-slate-warm">{entry.note}</p>}
                    <p className="text-[11px] text-slate-warm/80">{formatDateTime(entry.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Panel>

          <Panel title="Internal notes" description="Visible to staff only; never shown to the customer.">
            <Textarea
              value={note ?? order.adminNote ?? ''}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Add context for the fulfilment and support teams"
              maxLength={1000}
              disabled={!canUpdate}
            />
            {canUpdate && (
              <div className="mt-3 flex justify-end">
                <Button
                  size="sm"
                  loading={noteMutation.isPending}
                  onClick={() => noteMutation.mutate((note ?? order.adminNote ?? '').trim())}
                >
                  Save note
                </Button>
              </div>
            )}
          </Panel>

          {order.returns.length > 0 && (
            <Panel title="Returns" bodyClassName="p-0">
              <div className="divide-y divide-line/60">
                {order.returns.map((entry) => (
                  <div key={entry.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-[13px] font-semibold text-brand-900">{entry.reason}</p>
                        <p className="text-[11.5px] text-slate-warm">Requested {formatDate(entry.createdAt)}</p>
                      </div>
                      <StatusBadge status={entry.status} />
                    </div>
                    <p className="mt-1.5 text-[12.5px] text-slate-warm">{entry.description}</p>
                    {entry.adminNote && (
                      <p className="mt-1.5 rounded-lg bg-cream px-3 py-2 text-[12px] text-brand-900">
                        Staff note: {entry.adminNote}
                      </p>
                    )}
                    {canUpdate && openReturns.some((item) => item.id === entry.id) && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-3"
                        onClick={() =>
                          setReturnDecision({ id: entry.id, status: 'approved', adminNote: '', restock: false })
                        }
                      >
                        Decide return
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </Panel>
          )}

          <Panel title="Refunds" bodyClassName="p-0">
            {order.refunds.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-warm">
                No refunds have been requested for this order. Refunds are only recorded after the provider confirms
                them.
              </p>
            ) : (
              <div className="divide-y divide-line/60">
                {order.refunds.map((entry) => (
                  <div key={entry.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                    <div>
                      <p className="text-[13px] font-semibold text-brand-900">{formatSantim(entry.amount)}</p>
                      <p className="text-[11.5px] text-slate-warm">
                        {entry.reason} · {formatDateTime(entry.createdAt)}
                      </p>
                    </div>
                    <StatusBadge status={entry.status} />
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel title="Customer">
            <div className="space-y-2 text-[13px]">
              <p className="flex items-center gap-2 font-semibold text-brand-900">
                <UserRound className="size-4 text-gold-700" /> {order.customerName}
              </p>
              <p className="text-slate-warm">{order.email}</p>
              <p className="text-slate-warm">{order.phone || 'No phone on file'}</p>
              {order.customer && (
                <div className="mt-3 rounded-xl bg-cream px-3 py-2.5 text-[12px] text-slate-warm">
                  <p>
                    {order.customer.orderCount} orders · {formatSantim(order.customer.lifetimeValue)} lifetime
                  </p>
                  <Link
                    to={`/admin/customers/${order.customer.id}`}
                    className="mt-1 inline-block font-semibold text-brand-900 hover:underline"
                  >
                    Open customer profile
                  </Link>
                </div>
              )}
              <div className="border-t border-line/60 pt-3">
                <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-warm">
                  <MapPin className="size-3.5" /> Delivery address
                </p>
                {Object.entries(order.shippingAddress)
                  .filter(([, value]) => Boolean(value))
                  .map(([key, value]) => (
                    <p key={key} className="text-[12.5px] text-slate-warm">
                      {value}
                    </p>
                  ))}
              </div>
              {order.customerNote && (
                <div className="border-t border-line/60 pt-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-warm">Customer note</p>
                  <p className="mt-1 text-[12.5px] text-brand-900">{order.customerNote}</p>
                </div>
              )}
            </div>
          </Panel>

          <Panel title="Payment">
            <div className="space-y-2 text-[13px]">
              <div className="flex items-center justify-between">
                <span className="text-slate-warm">Method</span>
                <span className="font-semibold uppercase text-brand-900">{order.paymentMethod}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-warm">Status</span>
                <StatusBadge status={order.paymentStatus} />
              </div>
              {order.payments.length === 0 ? (
                <p className="text-[12px] text-slate-warm">No payment attempts recorded.</p>
              ) : (
                order.payments.map((payment) => (
                  <div key={payment.id} className="rounded-xl border border-line/70 px-3 py-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold uppercase text-brand-900">{payment.provider}</span>
                      <StatusBadge status={payment.status} />
                    </div>
                    <p className="mt-1 text-[12px] text-slate-warm">
                      {formatSantim(payment.amount)}
                      {payment.reference ? ` · ${payment.reference}` : ''}
                    </p>
                    <p className="text-[11px] text-slate-warm/80">{formatDateTime(payment.createdAt)}</p>
                    {payment.failureReason && (
                      <p className="mt-1 text-[11.5px] text-red-600">{payment.failureReason}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          </Panel>

          <Panel
            title="Shipment"
            action={
              canUpdate && !['cancelled', 'returned', 'refunded'].includes(order.status) ? (
                <Button size="sm" variant="outline" onClick={() => setShipOpen(true)}>
                  {order.shipments.length ? 'Add shipment' : 'Create shipment'}
                </Button>
              ) : undefined
            }
          >
            {order.shipments.length === 0 ? (
              <p className="flex items-center gap-2 text-[12.5px] text-slate-warm">
                <Truck className="size-4" /> No shipment has been recorded.
              </p>
            ) : (
              <div className="space-y-3">
                {order.shipments.map((entry) => (
                  <div key={entry.id} className="rounded-xl border border-line/70 px-3 py-2.5 text-[12.5px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-brand-900">{entry.carrier}</span>
                      <StatusBadge status={entry.status} />
                    </div>
                    {entry.trackingNumber && (
                      <p className="mt-1 text-slate-warm">
                        Tracking{' '}
                        {entry.trackingUrl ? (
                          <a
                            href={entry.trackingUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="font-semibold text-brand-900 underline"
                          >
                            {entry.trackingNumber}
                          </a>
                        ) : (
                          entry.trackingNumber
                        )}
                      </p>
                    )}
                    {entry.notes && <p className="text-slate-warm">{entry.notes}</p>}
                    <p className="text-[11px] text-slate-warm/80">{formatDateTime(entry.createdAt)}</p>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>

      <Modal open={statusOpen} onClose={() => setStatusOpen(false)} title="Update order status" size="sm">
        <div className="space-y-4">
          <Field label="New status">
            {({ id }) => (
              <Select id={id} value={status} onChange={(event) => setStatus(event.target.value)}>
                {order.allowedStatuses.map((allowed) => (
                  <option key={allowed} value={allowed}>
                    {humanize(allowed)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Note for the history log" hint="Optional. The customer receives an order notification automatically.">
            {({ id }) => (
              <Textarea
                id={id}
                value={statusNote}
                onChange={(event) => setStatusNote(event.target.value)}
                maxLength={500}
              />
            )}
          </Field>
          {status === 'cancelled' && (
            <p className="flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              Cancelling releases reserved stock{order.paymentStatus === 'paid' ? ' and creates a refund request' : ''}.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setStatusOpen(false)}>
              Cancel
            </Button>
            <Button loading={statusMutation.isPending} onClick={() => statusMutation.mutate()}>
              Update status
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={shipOpen} onClose={() => setShipOpen(false)} title="Record shipment">
        <div className="space-y-4">
          <Field label="Carrier">
            {({ id }) => (
              <Input
                id={id}
                value={shipment.carrier}
                onChange={(event) => setShipment({ ...shipment, carrier: event.target.value })}
                placeholder="e.g. Nile Mart courier"
              />
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tracking number">
              {({ id }) => (
                <Input
                  id={id}
                  value={shipment.trackingNumber}
                  onChange={(event) => setShipment({ ...shipment, trackingNumber: event.target.value })}
                />
              )}
            </Field>
            <Field label="Status">
              {({ id }) => (
                <Select
                  id={id}
                  value={shipment.status}
                  onChange={(event) => setShipment({ ...shipment, status: event.target.value })}
                >
                  {['pending', 'label_created', 'in_transit', 'out_for_delivery', 'delivered'].map((option) => (
                    <option key={option} value={option}>
                      {humanize(option)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <Field label="Tracking URL" hint="Optional. Must be a full https:// address.">
            {({ id }) => (
              <Input
                id={id}
                value={shipment.trackingUrl}
                onChange={(event) => setShipment({ ...shipment, trackingUrl: event.target.value })}
                placeholder="https://"
              />
            )}
          </Field>
          <Field label="Notes">
            {({ id }) => (
              <Textarea
                id={id}
                value={shipment.notes}
                onChange={(event) => setShipment({ ...shipment, notes: event.target.value })}
                maxLength={500}
              />
            )}
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShipOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={shipmentMutation.isPending}
              disabled={!shipment.carrier.trim()}
              onClick={() => shipmentMutation.mutate()}
            >
              Save shipment
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={refundOpen} onClose={() => setRefundOpen(false)} title="Request refund">
        <div className="space-y-4">
          <p className="text-[12.5px] leading-relaxed text-slate-warm">
            Creating a refund records a pending request. Mark it complete only after the payment provider confirms the
            money has been returned.
          </p>
          <Field label="Amount (ETB)">
            {({ id }) => (
              <Input
                id={id}
                type="number"
                min="0.01"
                step="0.01"
                value={refund.amount}
                onChange={(event) => setRefund({ ...refund, amount: event.target.value })}
              />
            )}
          </Field>
          <Field label="Reason">
            {({ id }) => (
              <Textarea
                id={id}
                value={refund.reason}
                onChange={(event) => setRefund({ ...refund, reason: event.target.value })}
                maxLength={500}
                placeholder="Why is this refund being issued?"
              />
            )}
          </Field>
          <Field label="Provider reference" hint="Optional. Add the provider refund reference once known.">
            {({ id }) => (
              <Input
                id={id}
                value={refund.providerRef}
                onChange={(event) => setRefund({ ...refund, providerRef: event.target.value })}
                maxLength={160}
              />
            )}
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRefundOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={refundMutation.isPending}
              disabled={!refund.amount || !refund.reason.trim()}
              onClick={() => refundMutation.mutate()}
            >
              Create refund request
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(returnDecision)}
        onClose={() => setReturnDecision(null)}
        title="Return decision"
        size="sm"
      >
        {returnDecision && (
          <div className="space-y-4">
            <Field label="Decision">
              {({ id }) => (
                <Select
                  id={id}
                  value={returnDecision.status}
                  onChange={(event) => setReturnDecision({ ...returnDecision, status: event.target.value })}
                >
                  <option value="approved">Approve</option>
                  <option value="rejected">Reject</option>
                  <option value="received">Mark received</option>
                  <option value="refunded">Close as refunded</option>
                </Select>
              )}
            </Field>
            <Field label="Staff note">
              {({ id }) => (
                <Textarea
                  id={id}
                  value={returnDecision.adminNote}
                  onChange={(event) => setReturnDecision({ ...returnDecision, adminNote: event.target.value })}
                  maxLength={1000}
                />
              )}
            </Field>
            <label className="flex items-start gap-2 text-[12.5px] text-slate-warm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-brand-900"
                checked={returnDecision.restock}
                onChange={(event) => setReturnDecision({ ...returnDecision, restock: event.target.checked })}
              />
              Restock the returned items when marking the return received.
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setReturnDecision(null)}>
                Cancel
              </Button>
              <Button loading={returnMutation.isPending} onClick={() => returnMutation.mutate(returnDecision)}>
                Save decision
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={settleOpen}
        onClose={() => setSettleOpen(false)}
        onConfirm={() => settleMutation.mutate()}
        loading={settleMutation.isPending}
        title="Record cash payment"
        confirmLabel="Record payment"
        description={
          <span className="flex gap-2">
            <CircleDollarSign className="mt-0.5 size-5 shrink-0 text-emerald-600" />
            Confirm that {formatSantim(order.total)} was collected in cash for this order. This marks the order paid
            and commits reserved stock.
          </span>
        }
      />

      {openReturns.length > 0 && (
        <p className="mt-4 flex items-center gap-1.5 text-[11.5px] text-slate-warm">
          <RotateCcw className="size-3.5" /> {openReturns.length} return request
          {openReturns.length === 1 ? '' : 's'} awaiting a decision.
        </p>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-slate-warm">{label}</span>
      <span className="font-medium text-brand-900">{value}</span>
    </div>
  );
}
