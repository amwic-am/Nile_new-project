import { Badge } from '@/components/ui';

export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  awaiting_payment: 'Awaiting payment',
  paid: 'Paid',
  confirmed: 'Confirmed',
  processing: 'Processing',
  packed: 'Packed',
  shipped: 'Shipped',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  returned: 'Returned',
  refunded: 'Refunded',
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  unpaid: 'Payment due',
  awaiting_payment: 'Awaiting payment',
  paid: 'Paid',
  failed: 'Payment failed',
  partially_refunded: 'Partially refunded',
  refunded: 'Refunded',
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cod: 'Cash on delivery',
  chapa: 'Chapa',
  telebirr: 'Telebirr',
  mpesa: 'M-PESA',
  card: 'Card',
  paypal: 'PayPal',
  eps: 'EPS',
};

export function orderStatusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status] ?? status.replace(/_/g, ' ');
}

export function paymentStatusLabel(status: string): string {
  return PAYMENT_STATUS_LABELS[status] ?? status.replace(/_/g, ' ');
}

export type StatusTone = 'neutral' | 'gold' | 'green' | 'red' | 'brand';

export function orderStatusTone(status: string): StatusTone {
  if (status === 'delivered' || status === 'paid') return 'green';
  if (status === 'cancelled' || status === 'returned' || status === 'refunded') return 'red';
  if (['confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery'].includes(status)) return 'brand';
  return 'gold';
}

export function paymentStatusTone(status: string): StatusTone {
  if (status === 'paid') return 'green';
  if (status === 'failed' || status === 'refunded') return 'red';
  if (status === 'partially_refunded') return 'gold';
  return 'neutral';
}

export function OrderStatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  return (
    <Badge tone={orderStatusTone(status)} className={className}>
      {orderStatusLabel(status)}
    </Badge>
  );
}

export function PaymentStatusBadge({ status }: { status: string }) {
  return <Badge tone={paymentStatusTone(status)}>{paymentStatusLabel(status)}</Badge>;
}
