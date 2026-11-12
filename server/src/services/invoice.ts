import type { OrderDetail } from './orders.js';

export const STATUS_LABELS: Record<string, string> = {
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

export const PAYMENT_LABELS: Record<string, string> = {
  unpaid: 'Payment due',
  awaiting_payment: 'Awaiting payment',
  paid: 'Paid in full',
  failed: 'Payment failed',
  partially_refunded: 'Partially refunded',
  refunded: 'Refunded',
};

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function invoiceMoney(santim: number, currency: string): string {
  const amount = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(santim ?? 0) / 100);
  return `${escapeHtml(currency)} ${amount}`;
}

function invoiceDate(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Africa/Addis_Ababa',
  }).format(new Date(value));
}

export interface InvoiceStore {
  name: string;
  legalName?: string;
  email?: string;
  phone?: string;
  address?: string;
}

export function invoiceNumber(order: Pick<OrderDetail, 'orderNumber'>): string {
  return `INV-${order.orderNumber}`;
}

export function buildInvoiceHtml(order: OrderDetail, store: InvoiceStore): string {
  const address = order.shippingAddress as Record<string, unknown>;
  const addressLines = [
    address.fullName ?? order.customerName,
    [address.line1, address.line2].filter(Boolean).join(', '),
    [address.city, address.region].filter(Boolean).join(', '),
    address.country === 'ET' ? 'Ethiopia' : address.country,
    address.phone ?? order.phone,
  ]
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('');

  const rows = order.items
    .map(
      (item) => `<tr>
          <td>
            <strong>${escapeHtml(item.name)}</strong>
            <span>${escapeHtml(item.variantLabel || 'Standard')} · SKU ${escapeHtml(item.sku)}</span>
          </td>
          <td class="num">${escapeHtml(item.quantity)}</td>
          <td class="num">${invoiceMoney(item.unitPrice, order.currency)}</td>
          <td class="num">${invoiceMoney(item.lineTotal, order.currency)}</td>
        </tr>`,
    )
    .join('');

  const paymentReference = order.payment?.reference
    ? `<p><span>Payment reference</span><strong>${escapeHtml(order.payment.reference)}</strong></p>`
    : '';

  const number = invoiceNumber(order);
  const paymentLabel = PAYMENT_LABELS[order.paymentStatus] ?? order.paymentStatus;
  const orderLabel = STATUS_LABELS[order.status] ?? order.status.replace(/_/g, ' ');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${escapeHtml(number)} · ${escapeHtml(store.name)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px 16px; background: #f3f1ec; color: #111a2c;
         font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
         font-size: 13px; line-height: 1.5; }
  .sheet { max-width: 820px; margin: 0 auto; background: #fff; border: 1px solid #e3ded4;
           border-radius: 16px; overflow: hidden; box-shadow: 0 18px 40px rgba(17,26,44,.08); }
  header { display: flex; flex-wrap: wrap; gap: 20px; justify-content: space-between;
           background: #002560; color: #fff; padding: 28px 32px; }
  .brand { font-size: 24px; font-weight: 800; letter-spacing: -.02em; }
  .brand span { color: #d3a63b; }
  .brand p { margin: 6px 0 0; font-size: 11px; font-weight: 500; color: rgba(255,255,255,.65);
             max-width: 260px; line-height: 1.6; }
  .doc { text-align: right; }
  .doc h1 { margin: 0; font-size: 22px; letter-spacing: .12em; text-transform: uppercase; color: #fff; }
  .doc p { margin: 3px 0 0; font-size: 11.5px; color: rgba(255,255,255,.75); }
  .doc .number { font-size: 14px; font-weight: 700; color: #debc60; }
  main { padding: 28px 32px 32px; }
  .parties { display: flex; flex-wrap: wrap; gap: 24px; justify-content: space-between;
             padding-bottom: 20px; border-bottom: 1px solid #e3ded4; }
  .parties h2 { margin: 0 0 6px; font-size: 10px; letter-spacing: .16em; text-transform: uppercase; color: #5a6478; }
  .parties p { margin: 0; color: #111a2c; }
  .parties .muted p { color: #5a6478; }
  .parties .muted p:first-child { color: #002560; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; margin-top: 20px; }
  th { text-align: left; font-size: 10px; letter-spacing: .12em; text-transform: uppercase;
       color: #5a6478; padding: 0 8px 8px; border-bottom: 1px solid #e3ded4; }
  td { padding: 11px 8px; border-bottom: 1px solid #f0ece5; vertical-align: top; }
  td strong { display: block; color: #002560; font-size: 12.5px; }
  td span { display: block; color: #5a6478; font-size: 11px; margin-top: 2px; }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .totals { margin-left: auto; width: min(320px, 100%); margin-top: 18px; }
  .totals div { display: flex; justify-content: space-between; padding: 4px 0; color: #5a6478; }
  .totals div.total { border-top: 1px solid #e3ded4; margin-top: 6px; padding-top: 10px;
                      font-size: 16px; font-weight: 800; color: #002560; }
  .notes { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 24px; }
  .note { flex: 1 1 220px; border: 1px solid #e3ded4; border-radius: 10px; padding: 12px 14px; }
  .note h3 { margin: 0 0 6px; font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: #5a6478; }
  .note p { margin: 2px 0; color: #111a2c; }
  .note p span { color: #5a6478; display: inline-block; min-width: 118px; }
  footer { padding: 18px 32px 26px; border-top: 1px solid #e3ded4; color: #5a6478; font-size: 11px; }
  footer p { margin: 3px 0; }
  .print { max-width: 820px; margin: 0 auto 14px; display: flex; justify-content: space-between;
           gap: 12px; align-items: center; color: #5a6478; font-size: 11.5px; }
  .print-hint { color: #8a8272; }
  @media print {
    body { background: #fff; padding: 0; font-size: 11.5px; }
    .sheet { border: 0; border-radius: 0; box-shadow: none; max-width: none; }
    .print { display: none; }
    header { background: #002560 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <div class="print">
    <span>Use your browser's print option (Ctrl/Cmd + P) to save this invoice as a PDF.</span>
    <span class="print-hint">Keep this invoice for your records.</span>
  </div>
  <article class="sheet">
    <header>
      <div class="brand">
        ${escapeHtml(store.name)}<span>.</span>
        <p>${escapeHtml(store.legalName ?? store.name)}<br>${escapeHtml(store.address ?? '')}<br>${escapeHtml(store.email ?? '')} · ${escapeHtml(store.phone ?? '')}</p>
      </div>
      <div class="doc">
        <h1>Invoice</h1>
        <p class="number">${escapeHtml(number)}</p>
        <p>Order ${escapeHtml(order.orderNumber)}</p>
        <p>Issued ${escapeHtml(invoiceDate(order.placedAt))}</p>
        <p>Status ${escapeHtml(orderLabel)}</p>
      </div>
    </header>
    <main>
      <div class="parties">
        <div>
          <h2>Billed to</h2>
          <p><strong>${escapeHtml(order.customerName)}</strong></p>
          <p>${escapeHtml(order.email)}</p>
          <p>${escapeHtml(order.phone)}</p>
        </div>
        <div class="muted">
          <h2>Deliver to · ${escapeHtml(order.deliveryLabel)}</h2>
          ${addressLines}
        </div>
        <div>
          <h2>Payment</h2>
          <p>${escapeHtml(order.paymentMethod === 'cod' ? 'Cash on delivery' : order.paymentMethod === 'chapa' ? 'Chapa' : order.paymentMethod)}</p>
          <p><strong>${escapeHtml(paymentLabel)}</strong></p>
          ${paymentReference}
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th class="num">Qty</th>
            <th class="num">Unit price</th>
            <th class="num">Amount</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <div class="totals">
        <div><span>Subtotal</span><span>${invoiceMoney(order.subtotal, order.currency)}</span></div>
        ${order.discount > 0 ? `<div><span>Discount${order.couponCode ? ` (${escapeHtml(order.couponCode)})` : ''}</span><span>−${invoiceMoney(order.discount, order.currency)}</span></div>` : ''}
        <div><span>Delivery</span><span>${order.shippingFee === 0 ? 'Free' : invoiceMoney(order.shippingFee, order.currency)}</span></div>
        <div class="total"><span>Total</span><span>${invoiceMoney(order.total, order.currency)}</span></div>
      </div>

      <div class="notes">
        <div class="note">
          <h3>Order</h3>
          <p><span>Order number</span>${escapeHtml(order.orderNumber)}</p>
          <p><span>Placed</span>${escapeHtml(invoiceDate(order.placedAt))}</p>
          <p><span>Delivery method</span>${escapeHtml(order.deliveryLabel)}</p>
        </div>
        <div class="note">
          <h3>Support</h3>
          <p>${escapeHtml(store.email ?? '')}</p>
          <p>${escapeHtml(store.phone ?? '')}</p>
          <p>${escapeHtml(store.address ?? '')}</p>
        </div>
      </div>
    </main>
    <footer>
      <p>Thank you for shopping with ${escapeHtml(store.name)}.</p>
      <p>This invoice was generated electronically and is valid without a signature. Keep it for your records.</p>
      <p>Returns and exchanges are subject to the store returns policy.</p>
    </footer>
  </article>
</body>
</html>`;
}
