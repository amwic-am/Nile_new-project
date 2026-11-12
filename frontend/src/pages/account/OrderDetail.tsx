import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  MapPin,
  Package,
  Truck,
  XCircle,
} from 'lucide-react';
import {
  OrderStatusBadge,
  PaymentStatusBadge,
  orderStatusLabel,
  orderStatusTone,
  paymentStatusLabel,
  PAYMENT_METHOD_LABELS,
} from '@/components/account/OrderStatusBadge';
import { Button, ButtonLink, EmptyState, Modal, Skeleton, Textarea } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { cx, formatDateTime, formatSantim } from '@/lib/format';
import { useOrder } from '@/lib/queries';
import { useSeo } from '@/lib/seo';
import { useToasts } from '@/stores/toasts';

const FLOW = ['Confirmed', 'Processing', 'Shipped', 'Delivered'];
const FLOW_INDEX: Record<string, number> = {
  pending: 0,
  awaiting_payment: 0,
  paid: 0,
  confirmed: 0,
  processing: 1,
  packed: 1,
  shipped: 2,
  out_for_delivery: 2,
  delivered: 3,
};

const CANCELLABLE = ['pending', 'awaiting_payment', 'paid', 'confirmed', 'processing'];

export default function AccountOrderDetailPage() {
  const { orderId = '' } = useParams();
  const { data, isLoading, isError, error, refetch } = useOrder(orderId);
  const queryClient = useQueryClient();
  const push = useToasts((state) => state.push);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');

  const order = data?.order;

  useSeo({
    title: order ? `Order ${order.orderNumber}` : 'Order details',
    description: 'Order details, delivery progress and invoice.',
    canonicalPath: `/account/orders/${orderId}`,
    noIndex: true,
  });

  const cancelOrder = useMutation({
    mutationFn: () =>
      api.post<{ order: { orderId: string; status: string } }>(`/orders/${orderId}/cancel`, {
        reason: reason.trim() || undefined,
      }),
    onSuccess: () => {
      setCancelOpen(false);
      setReason('');
      push('Your order has been cancelled.', 'info');
      queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['account', 'summary'] });
    },
    onError: (caught) => push(errorMessage(caught), 'error'),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    );
  }

  if (isError || !order) {
    return (
      <div className="surface">
        <EmptyState
          icon={<AlertCircle className="size-6" />}
          title="We could not load this order"
          description={errorMessage(error)}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => void refetch()}>Try again</Button>
              <ButtonLink to="/account/orders" variant="outline">
                Back to orders
              </ButtonLink>
            </div>
          }
        />
      </div>
    );
  }

  const awaitingPayment = order.paymentStatus === 'awaiting_payment' || order.status === 'awaiting_payment';
  const paid = order.paymentStatus === 'paid';
  const closed = ['cancelled', 'returned', 'refunded'].includes(order.status);
  const canCancel = CANCELLABLE.includes(order.status) && !closed;
  const address = order.shippingAddress;
  const flowIndex = FLOW_INDEX[order.status] ?? 0;
  const paymentMethod = PAYMENT_METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod;

  const startPayment = async () => {
    setPaying(true);
    setPayError('');
    try {
      const result = await api.post<{ payment: { redirectUrl: string } }>(`/orders/${order.id}/payment`, {
        provider: 'chapa',
      });
      if (!result.payment?.redirectUrl) throw new Error('The payment provider did not return a checkout page.');
      window.location.assign(result.payment.redirectUrl);
    } catch (caught) {
      const message = errorMessage(caught);
      setPayError(message);
      push(message, 'error');
      setPaying(false);
    }
  };

  const openInvoice = () => {
    window.open(`/api/account/orders/${order.id}/invoice`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/account/orders"
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-slate-warm transition hover:text-brand-900"
        >
          <ArrowLeft className="size-3.5" /> All orders
        </Link>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" iconLeft={<Download className="size-3.5" />} onClick={openInvoice}>
            Invoice
          </Button>
          {canCancel && (
            <Button
              variant="ghost"
              size="sm"
              className="text-red-600 hover:bg-red-50"
              iconLeft={<XCircle className="size-3.5" />}
              onClick={() => setCancelOpen(true)}
            >
              Cancel order
            </Button>
          )}
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-soft">
        <div className="bg-brand-950 px-5 py-6 text-white sm:px-7">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-gold-400">
                Order {order.orderNumber}
              </p>
              <h2 className="mt-1 font-display text-[24px] font-extrabold leading-tight sm:text-[28px]">
                {closed ? orderStatusLabel(order.status) : awaitingPayment ? 'Waiting for payment' : 'In progress'}
              </h2>
              <p className="mt-1.5 text-[12px] text-white/65">
                Placed {formatDateTime(order.placedAt)} · {order.deliveryLabel}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <OrderStatusBadge status={order.status} />
              <PaymentStatusBadge status={order.paymentStatus} />
              <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-white">
                {formatSantim(order.total)}
              </span>
            </div>
          </div>
        </div>

        {!closed && !awaitingPayment && (
          <div className="border-b border-line px-5 py-4 sm:px-7">
            <ol className="flex items-center gap-1 overflow-x-auto no-scrollbar" aria-label="Order progress">
              {FLOW.map((label, index) => {
                const complete = index <= flowIndex;
                return (
                  <li key={label} className="flex shrink-0 items-center gap-1">
                    <span
                      className={cx(
                        'flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-semibold',
                        complete ? 'bg-brand-50 text-brand-900' : 'text-slate-warm/70',
                      )}
                    >
                      <span
                        className={cx(
                          'grid size-4 place-items-center rounded-full text-[9px]',
                          complete ? 'bg-brand-900 text-white' : 'bg-sand text-slate-warm',
                        )}
                      >
                        {index < flowIndex ? <CheckCircle2 className="size-3" /> : index + 1}
                      </span>
                      {label}
                    </span>
                    {index < FLOW.length - 1 && <span className="h-px w-4 bg-line sm:w-7" aria-hidden />}
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        {closed && (
          <div className="border-b border-line bg-red-50/70 px-5 py-3.5 sm:px-7">
            <p className="flex items-start gap-2 text-[12px] font-medium text-red-700">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              {order.status === 'cancelled'
                ? order.paymentStatus === 'paid'
                  ? 'This order was cancelled after payment. Any refund due is recorded against the original payment method.'
                  : 'This order was cancelled. Reserved stock has been released and no payment is due.'
                : `This order is marked ${orderStatusLabel(order.status).toLowerCase()}. Contact customer care if you need help.`}
            </p>
          </div>
        )}

        {awaitingPayment && (
          <div className="border-b border-gold-200 bg-gold-50 px-5 py-4 sm:px-7">
            <p className="flex items-start gap-2 text-[12px] font-medium text-gold-900">
              <Clock className="mt-0.5 size-4 shrink-0" />
              {order.reservationExpiresAt
                ? `Your items are reserved until ${formatDateTime(order.reservationExpiresAt)}. Complete payment before then.`
                : 'Your items are reserved while the payment is being completed.'}
            </p>
            {order.paymentMethod === 'chapa' && (
              <Button
                className="mt-3"
                size="sm"
                loading={paying}
                onClick={() => void startPayment()}
                iconLeft={<CreditCard className="size-3.5" />}
              >
                Pay {formatSantim(order.total)}
              </Button>
            )}
            {payError && <p className="mt-2 text-[11.5px] font-medium text-red-700">{payError}</p>}
          </div>
        )}

        {order.paymentStatus === 'failed' && !closed && !awaitingPayment && (
          <div className="border-b border-line bg-red-50 px-5 py-3.5 sm:px-7">
            <p className="flex items-start gap-2 text-[12px] font-medium text-red-700">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              The last payment attempt failed. {order.paymentMethod === 'chapa' ? 'You can try again below.' : 'Contact support for help.'}
            </p>
            {order.paymentMethod === 'chapa' && (
              <Button className="mt-2.5" size="sm" loading={paying} onClick={() => void startPayment()}>
                Retry payment
              </Button>
            )}
          </div>
        )}

        <div className="grid gap-7 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0">
            <h3 className="font-display text-base font-bold text-brand-900">Items</h3>
            <div className="mt-3 overflow-hidden rounded-xl border border-line">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-start gap-3 border-b border-line/70 p-3 last:border-0">
                  <div className="size-16 shrink-0 overflow-hidden rounded-lg bg-sand">
                    {item.imageUrl && (
                      <img src={item.imageUrl} alt="" className="size-full object-cover" loading="lazy" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/product/${item.slug}`}
                      className="line-clamp-2 text-[12.5px] font-semibold leading-snug text-brand-900 hover:text-brand-600"
                    >
                      {item.name}
                    </Link>
                    <p className="mt-0.5 text-[11px] text-slate-warm">
                      {item.variantLabel || 'Standard'} · SKU {item.sku}
                    </p>
                    <p className="text-[11px] text-slate-warm">
                      {item.quantity} × {formatSantim(item.unitPrice)}
                    </p>
                  </div>
                  <p className="shrink-0 text-[12.5px] font-bold text-brand-900">{formatSantim(item.lineTotal)}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-line p-4">
                <p className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-warm">
                  <MapPin className="size-3.5 text-brand-900" /> Delivery address
                </p>
                <div className="mt-2 space-y-0.5 text-[12px] leading-relaxed text-slate-warm">
                  <p className="font-semibold text-brand-900">
                    {String(address.fullName ?? order.customerName)}
                  </p>
                  <p>{[address.line1, address.line2].filter(Boolean).join(', ') || order.deliveryLabel}</p>
                  <p>{[address.city, address.region].filter(Boolean).join(', ')}</p>
                  <p>{String(address.phone ?? order.phone)}</p>
                  <p>{order.email}</p>
                </div>
              </div>
              <div className="rounded-xl border border-line p-4">
                <p className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-warm">
                  <Truck className="size-3.5 text-brand-900" /> Delivery & payment
                </p>
                <div className="mt-2 space-y-1 text-[12px] leading-relaxed text-slate-warm">
                  <p className="font-semibold text-brand-900">{order.deliveryLabel}</p>
                  <p>Payment: {paymentMethod}</p>
                  <p>
                    Status:{' '}
                    <span className={cx('font-semibold', orderStatusTone(order.paymentStatus) === 'green' ? 'text-emerald-700' : 'text-brand-900')}>
                      {paymentStatusLabel(order.paymentStatus)}
                    </span>
                  </p>
                  {order.payment?.reference && (
                    <p className="break-all">
                      Reference: <span className="font-medium text-brand-900">{order.payment.reference}</span>
                    </p>
                  )}
                  {order.shipment?.trackingNumber && (
                    <p>
                      Tracking:{' '}
                      {order.shipment.trackingUrl ? (
                        <a
                          href={order.shipment.trackingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-brand-900 underline underline-offset-2"
                        >
                          {order.shipment.trackingNumber}
                        </a>
                      ) : (
                        <span className="font-semibold text-brand-900">{order.shipment.trackingNumber}</span>
                      )}
                    </p>
                  )}
                  {order.shipment?.carrier && <p>Courier: {order.shipment.carrier}</p>}
                </div>
              </div>
            </div>

            {order.customerNote && (
              <div className="mt-5 rounded-xl border border-line bg-cream/50 p-4">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-warm">
                  Your note
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-brand-900">{order.customerNote}</p>
              </div>
            )}

            {order.history.length > 0 && (
              <div className="mt-6">
                <h3 className="font-display text-base font-bold text-brand-900">Order activity</h3>
                <ol className="mt-3 space-y-3 border-l border-line pl-4">
                  {[...order.history].reverse().map((entry, index) => (
                    <li key={`${entry.status}-${entry.createdAt}-${index}`} className="relative">
                      <span
                        className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-gold-500"
                        aria-hidden
                      />
                      <p className="text-[12.5px] font-semibold text-brand-900">{orderStatusLabel(entry.status)}</p>
                      <p className="text-[11px] text-slate-warm">{formatDateTime(entry.createdAt)}</p>
                      {entry.note && <p className="mt-0.5 text-[11.5px] leading-relaxed text-slate-warm">{entry.note}</p>}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>

          <aside className="space-y-4">
            <div className="rounded-xl border border-line bg-cream/50 p-5">
              <h3 className="font-display text-base font-bold text-brand-900">Payment summary</h3>
              <div className="mt-3 space-y-2 text-[12.5px]">
                <div className="flex justify-between">
                  <span className="text-slate-warm">Subtotal</span>
                  <span className="font-semibold text-brand-900">{formatSantim(order.subtotal)}</span>
                </div>
                {order.discount > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>Discount {order.couponCode ? `(${order.couponCode})` : ''}</span>
                    <span className="font-semibold">−{formatSantim(order.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-warm">Delivery</span>
                  <span className="font-semibold text-brand-900">
                    {order.shippingFee === 0 ? 'Free' : formatSantim(order.shippingFee)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between border-t border-line pt-2.5">
                  <span className="font-semibold text-brand-900">Total</span>
                  <span className="font-display text-xl font-extrabold text-brand-900">
                    {formatSantim(order.total)}
                  </span>
                </div>
                <p className="text-right text-[10.5px] text-slate-warm">
                  {paid
                    ? 'Paid in full'
                    : awaitingPayment
                      ? 'Payment outstanding'
                      : order.paymentMethod === 'cod'
                        ? 'Pay the courier on delivery'
                        : paymentStatusLabel(order.paymentStatus)}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Button
                fullWidth
                variant="outline"
                iconLeft={<Download className="size-4" />}
                onClick={openInvoice}
              >
                View invoice
              </Button>
              <ButtonLink
                to="/account/orders"
                fullWidth
                variant="ghost"
                iconLeft={<Package className="size-4" />}
              >
                Back to orders
              </ButtonLink>
            </div>

            <p className="text-center text-[10.5px] leading-relaxed text-slate-warm">
              Need help with this order?{' '}
              <Link to="/contact" className="font-semibold text-brand-900 underline underline-offset-2">
                Contact customer care
              </Link>
            </p>
          </aside>
        </div>
      </section>

      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancel this order?" size="sm">
        <p className="text-[12.5px] leading-relaxed text-slate-warm">
          Reserved stock will be released and any pending payment cancelled.
          {paid && order.paymentMethod !== 'cod'
            ? ' Because this order is already paid, a refund will be requested for the original payment method.'
            : ''}
        </p>
        <label className="label mt-4" htmlFor="cancel-reason">
          Reason (optional)
        </label>
        <Textarea
          id="cancel-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={500}
          placeholder="Let us know why you are cancelling."
        />
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setCancelOpen(false)}>
            Keep order
          </Button>
          <Button variant="danger" loading={cancelOrder.isPending} onClick={() => cancelOrder.mutate()}>
            Cancel order
          </Button>
        </div>
      </Modal>
    </div>
  );
}
