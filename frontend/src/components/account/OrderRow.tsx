import { Link } from 'react-router-dom';
import { ChevronRight, Package } from 'lucide-react';
import {
  ORDER_STATUS_LABELS,
  OrderStatusBadge,
  PAYMENT_STATUS_LABELS,
  PaymentStatusBadge,
} from '@/components/account/OrderStatusBadge';
import { formatDate, formatSantim } from '@/lib/format';
import type { OrderSummary } from '@/lib/types';

export function OrderRow({ order }: { order: OrderSummary }) {
  const showPayment =
    order.paymentStatus !== 'paid' &&
    PAYMENT_STATUS_LABELS[order.paymentStatus] !== ORDER_STATUS_LABELS[order.status];

  return (
    <Link
      to={`/account/orders/${order.id}`}
      className="flex items-center gap-3.5 border-b border-line/70 p-4 transition last:border-0 hover:bg-cream/50 focus-visible:bg-cream/50"
    >
      <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-sand">
        {order.imageUrl ? (
          <img src={order.imageUrl} alt="" className="size-full object-cover" loading="lazy" />
        ) : (
          <Package className="size-5 text-slate-warm" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-[13px] font-bold text-brand-900">{order.orderNumber}</p>
          <span className="text-[11px] text-slate-warm">
            {order.itemCount} {order.itemCount === 1 ? 'item' : 'items'}
          </span>
        </div>
        <p className="mt-0.5 text-[11.5px] text-slate-warm">
          {formatDate(order.placedAt)} · <span className="font-semibold text-brand-900">{formatSantim(order.total)}</span>
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 sm:hidden">
          <OrderStatusBadge status={order.status} />
          {showPayment && <PaymentStatusBadge status={order.paymentStatus} />}
        </div>
      </div>
      <div className="hidden shrink-0 flex-col items-end gap-1.5 sm:flex">
        <OrderStatusBadge status={order.status} />
        {showPayment && <PaymentStatusBadge status={order.paymentStatus} />}
      </div>
      <ChevronRight className="size-4 shrink-0 text-slate-warm" />
    </Link>
  );
}
