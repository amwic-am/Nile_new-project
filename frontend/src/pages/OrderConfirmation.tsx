import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  CreditCard,
  MapPin,
  Package,
  Printer,
  Truck,
} from 'lucide-react';
import { Badge, Button, ButtonLink, EmptyState, Skeleton } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime, formatSantim } from '@/lib/format';
import { useOrder } from '@/lib/queries';
import { useSeo } from '@/lib/seo';
import { useToasts } from '@/stores/toasts';
import type { OrderDetail } from '@/lib/types';

export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  awaiting_payment: 'Awaiting payment',
  paid: 'Paid',
  confirmed: 'Confirmed',
  processing: 'Processing',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

export function orderStatusTone(status: string): 'neutral' | 'gold' | 'green' | 'red' | 'brand' {
  if (status === 'delivered' || status === 'paid') return 'green';
  if (status === 'cancelled' || status === 'refunded') return 'red';
  if (status === 'shipped' || status === 'processing' || status === 'confirmed') return 'brand';
  return 'gold';
}

function humanStatus(status: string) {
  return ORDER_STATUS_LABELS[status] ?? status.replace(/_/g, ' ');
}

const FLOW = ['confirmed', 'processing', 'shipped', 'delivered'];

function flowIndex(order: OrderDetail) {
  const status = order.status === 'paid' ? 'confirmed' : order.status;
  const index = FLOW.indexOf(status);
  return index === -1 ? 0 : index;
}

export default function OrderConfirmationPage() {
  const { orderId = '' } = useParams();
  const location = useLocation();
  const paymentError = (location.state as { paymentError?: string | null } | null)?.paymentError ?? null;
  const { data, isLoading, isError, error, refetch } = useOrder(orderId);
  const push = useToasts((state) => state.push);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState('');

  const order = data?.order;

  useSeo({
    title: order ? `Order ${order.orderNumber} confirmed` : 'Order confirmation',
    description: 'Your Nile Mart order confirmation and next steps.',
    canonicalPath: `/checkout/success/${orderId}`,
    noIndex: true,
  });

  if (isLoading) {
    return (
      <div className="container-page py-8">
        <Skeleton className="h-40 rounded-2xl" />
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
          <Skeleton className="h-96 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (isError || !order) {
    return (
      <div className="container-page py-14">
        <EmptyState
          icon={<AlertCircle className="size-6" />}
          title="We could not load this order"
          description={errorMessage(error)}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => void refetch()}>Try again</Button>
              <ButtonLink to="/products" variant="outline">
                Continue shopping
              </ButtonLink>
            </div>
          }
        />
      </div>
    );
  }

  const awaitingPayment = order.paymentStatus === 'awaiting_payment' || order.status === 'awaiting_payment';
  const paid = order.paymentStatus === 'paid';
  const cancelled = order.status === 'cancelled';
  const address = order.shippingAddress;

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

  return (
    <div className="container-page py-7 sm:py-10">
      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-soft">
        <div className="bg-brand-950 px-5 py-7 text-white sm:px-8 sm:py-9">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="flex items-start gap-4">
              <span
                className={
                  awaitingPayment
                    ? 'grid size-12 shrink-0 place-items-center rounded-2xl bg-gold-500/20 text-gold-300'
                    : 'grid size-12 shrink-0 place-items-center rounded-2xl bg-emerald-400/15 text-emerald-300'
                }
              >
                {awaitingPayment ? <CreditCard className="size-6" /> : <CheckCircle2 className="size-6" />}
              </span>
              <div>
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-gold-400">
                  {cancelled ? 'Order cancelled' : awaitingPayment ? 'Order received' : 'Thank you'}
                </p>
                <h1 className="mt-1 font-display text-[26px] font-extrabold leading-tight text-white sm:text-[32px]">
                  {cancelled
                    ? `Order ${order.orderNumber} was cancelled`
                    : awaitingPayment
                      ? 'Your order is waiting for payment'
                      : 'Your order is confirmed'}
                </h1>
                <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-white/65">
                  {cancelled
                    ? 'This order is no longer active. Reserved stock has been released.'
                    : awaitingPayment
                      ? `Complete payment to confirm order ${order.orderNumber}. Your items are reserved for a limited time.`
                      : `We have emailed a receipt to ${order.email}. Order ${order.orderNumber} was placed ${formatDateTime(order.placedAt)}.`}
                </p>
              </div>
            </div>
            <div className="rounded-xl bg-white/10 px-4 py-3 text-[11.5px] text-white/70">
              <p className="font-semibold uppercase tracking-[0.16em] text-white/45">Order number</p>
              <p className="mt-1 font-display text-lg font-bold text-white">{order.orderNumber}</p>
              <p className="mt-1">{formatDateTime(order.placedAt)}</p>
            </div>
          </div>
        </div>

        {(paymentError || payError) && (
          <div className="border-b border-line bg-red-50 px-5 py-3.5 sm:px-8">
            <p className="flex items-start gap-2 text-[12.5px] font-medium text-red-700">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              {payError || paymentError}
            </p>
          </div>
        )}

        {!cancelled && !awaitingPayment && (
          <div className="border-b border-line px-5 py-5 sm:px-8">
            <ol className="flex items-center gap-1 overflow-x-auto" aria-label="Order progress">
              {['Confirmed', 'Processing', 'Shipped', 'Delivered'].map((label, index) => {
                const current = flowIndex(order);
                const complete = index <= current;
                return (
                  <li key={label} className="flex shrink-0 items-center gap-1">
                    <span
                      className={
                        complete
                          ? 'flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1.5 text-[11px] font-semibold text-brand-900'
                          : 'flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-medium text-slate-warm/70'
                      }
                    >
                      <span
                        className={
                          complete
                            ? 'grid size-4 place-items-center rounded-full bg-brand-900 text-[9px] text-white'
                            : 'grid size-4 place-items-center rounded-full bg-sand text-[9px] text-slate-warm'
                        }
                      >
                        {index < current ? <CheckCircle2 className="size-3" /> : index + 1}
                      </span>
                      {label}
                    </span>
                    {index < 3 && <span className="h-px w-4 bg-line sm:w-8" aria-hidden />}
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        <div className="grid gap-8 p-5 sm:p-8 lg:grid-cols-[1fr_320px]">
          <div>
            <h2 className="font-display text-lg font-bold text-brand-900">Items in this order</h2>
            <div className="mt-3 overflow-hidden rounded-xl border border-line">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-center gap-3 border-b border-line/70 p-3 last:border-0">
                  <div className="size-14 shrink-0 overflow-hidden rounded-lg bg-sand">
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
                    <p className="text-[11px] text-slate-warm">
                      {item.variantLabel} · SKU {item.sku}
                    </p>
                    <p className="text-[11px] text-slate-warm">Qty {item.quantity}</p>
                  </div>
                  <p className="text-[12.5px] font-semibold text-brand-900">{formatSantim(item.lineTotal)}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-line p-4">
                <p className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-warm">
                  <MapPin className="size-3.5 text-brand-900" /> Delivery address
                </p>
                <div className="mt-2 space-y-0.5 text-[12px] leading-relaxed text-slate-warm">
                  <p className="font-semibold text-brand-900">{String(address.fullName ?? order.customerName)}</p>
                  <p>{[address.line1, address.line2].filter(Boolean).join(', ')}</p>
                  <p>
                    {[address.city, address.region].filter(Boolean).join(', ')}
                  </p>
                  <p>{String(address.phone ?? order.phone)}</p>
                </div>
              </div>
              <div className="rounded-xl border border-line p-4">
                <p className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-warm">
                  <Truck className="size-3.5 text-brand-900" /> Delivery & payment
                </p>
                <div className="mt-2 space-y-1 text-[12px] leading-relaxed text-slate-warm">
                  <p className="font-semibold text-brand-900">{order.deliveryLabel}</p>
                  <p>
                    Payment:{' '}
                    {order.paymentMethod === 'cod'
                      ? 'Cash on delivery'
                      : order.paymentMethod === 'chapa'
                        ? 'Chapa'
                        : order.paymentMethod}
                  </p>
                  <p>
                    Status:{' '}
                    <Badge tone={orderStatusTone(order.paymentStatus)} className="align-middle">
                      {humanStatus(order.paymentStatus)}
                    </Badge>
                  </p>
                  {order.shipment?.trackingNumber && (
                    <p>
                      Tracking: <span className="font-medium text-brand-900">{order.shipment.trackingNumber}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>

            {order.history.length > 0 && (
              <div className="mt-5">
                <h3 className="text-sm font-bold text-brand-900">Order activity</h3>
                <ol className="mt-2 space-y-2 border-l border-line pl-4">
                  {[...order.history].reverse().slice(0, 5).map((entry, index) => (
                    <li key={`${entry.status}-${entry.createdAt}-${index}`} className="relative text-[12px]">
                      <span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-gold-500" aria-hidden />
                      <p className="font-semibold text-brand-900">{humanStatus(entry.status)}</p>
                      <p className="text-[11px] text-slate-warm">{formatDateTime(entry.createdAt)}</p>
                      {entry.note && <p className="mt-0.5 text-slate-warm">{entry.note}</p>}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>

          <aside className="space-y-4">
            <div className="rounded-xl border border-line bg-cream/50 p-5">
              <h2 className="font-display text-base font-bold text-brand-900">Payment summary</h2>
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
                  {paid ? 'Paid in full' : awaitingPayment ? 'Payment outstanding' : 'Pay on delivery'}
                </p>
              </div>
            </div>

            {awaitingPayment && order.paymentMethod === 'chapa' && (
              <div className="rounded-xl border border-gold-200 bg-gold-50 p-4">
                <p className="flex items-center gap-2 text-[12.5px] font-semibold text-gold-900">
                  <CreditCard className="size-4" /> Complete your payment
                </p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-gold-900/80">
                  Your items are reserved. Pay securely on Chapa to confirm the order.
                </p>
                <Button
                  fullWidth
                  className="mt-3"
                  loading={paying}
                  onClick={() => void startPayment()}
                  iconRight={<ArrowRight className="size-4" />}
                >
                  Pay {formatSantim(order.total)}
                </Button>
              </div>
            )}

            <ButtonLink to="/products" fullWidth variant="outline" iconLeft={<Package className="size-4" />}>
              Continue shopping
            </ButtonLink>
            <Button
              fullWidth
              variant="ghost"
              onClick={() => window.print()}
              iconLeft={<Printer className="size-4" />}
            >
              Print receipt
            </Button>
            <p className="text-center text-[10.5px] text-slate-warm">
              Need help?{' '}
              <Link to="/contact" className="font-semibold text-brand-900 underline underline-offset-2">
                Contact customer care
              </Link>
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}
