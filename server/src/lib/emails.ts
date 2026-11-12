import { emailLayout, escapeHtml } from './mailer.js';
import { formatEtb } from './money.js';

function greeting(name: string) {
  const safe = escapeHtml(name || 'there');
  return `<p style="margin:0 0 14px">Hi ${safe},</p>`;
}

export function verificationEmail(name: string, url: string) {
  return {
    subject: 'Verify your Nile Mart email address',
    html: emailLayout({
      preheader: 'Confirm your email to finish setting up your Nile Mart account.',
      heading: 'Confirm your email address',
      body: `${greeting(name)}
        <p style="margin:0 0 14px">Thanks for joining Nile Mart. Confirm your email address so we can keep your account secure and send order updates.</p>
        <p style="margin:0 0 14px">This link expires in 24 hours. If you did not create an account, you can safely ignore this email.</p>`,
      cta: { label: 'Verify email', url },
    }),
    text: `Hi ${name},\n\nVerify your Nile Mart email address:\n${url}\n\nThis link expires in 24 hours.`,
  };
}

export function passwordResetEmail(name: string, url: string) {
  return {
    subject: 'Reset your Nile Mart password',
    html: emailLayout({
      preheader: 'Use this secure link to choose a new password.',
      heading: 'Reset your password',
      body: `${greeting(name)}
        <p style="margin:0 0 14px">We received a request to reset your Nile Mart password. Choose a new password using the button below.</p>
        <p style="margin:0 0 14px">This link expires in 60 minutes and can only be used once. If you did not request a reset, your password is unchanged and no action is needed.</p>`,
      cta: { label: 'Choose a new password', url },
    }),
    text: `Hi ${name},\n\nReset your Nile Mart password:\n${url}\n\nThis link expires in 60 minutes.`,
  };
}

export function passwordChangedEmail(name: string) {
  return {
    subject: 'Your Nile Mart password was changed',
    html: emailLayout({
      heading: 'Password updated',
      body: `${greeting(name)}
        <p style="margin:0 0 14px">Your Nile Mart password was changed and all other sessions were signed out.</p>
        <p style="margin:0 0 14px">If this was not you, reset your password immediately and contact support@nilemart.et.</p>`,
    }),
    text: `Hi ${name},\n\nYour Nile Mart password was changed. If this was not you, contact support@nilemart.et immediately.`,
  };
}

export function welcomeEmail(name: string) {
  return {
    subject: 'Welcome to Nile Mart',
    html: emailLayout({
      heading: 'Welcome to Nile Mart',
      body: `${greeting(name)}
        <p style="margin:0 0 14px">Your email is verified and your account is ready. Discover genuine products, secure payment and delivery across Ethiopia.</p>
        <p style="margin:0 0 14px">Need help? Our team is available Monday to Saturday, 8:30 - 18:30.</p>`,
      cta: { label: 'Start shopping', url: 'https://nilemart.et/products' },
    }),
    text: `Hi ${name},\n\nWelcome to Nile Mart. Start shopping at https://nilemart.et/products`,
  };
}

function itemRows(items: { name: string; variantLabel: string; quantity: number; lineTotal: number }[]) {
  return items
    .map(
      (item) => `<tr>
        <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-size:14px">
          <strong>${escapeHtml(item.name)}</strong>${
            item.variantLabel
              ? `<br><span style="color:#64748b;font-size:12px">${escapeHtml(item.variantLabel)}</span>`
              : ''
          }
        </td>
        <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-size:14px;text-align:center">${
          item.quantity
        }</td>
        <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-size:14px;text-align:right">${formatEtb(
          item.lineTotal,
        )}</td>
      </tr>`,
    )
    .join('');
}

export function orderPlacedEmail(order: {
  to: string;
  name: string;
  orderNumber: string;
  items: { name: string; variantLabel: string; quantity: number; lineTotal: number }[];
  subtotal: number;
  discount: number;
  shippingFee: number;
  total: number;
  deliveryLabel: string;
  paymentMethod: string;
  orderUrl: string;
}) {
  const cod = order.paymentMethod === 'cod';
  return {
    to: order.to,
    subject: `Order ${order.orderNumber} received - Nile Mart`,
    html: emailLayout({
      preheader: `We received order ${order.orderNumber}.`,
      heading: 'Thank you for your order',
      body: `${greeting(order.name)}
        <p style="margin:0 0 14px">We received order <strong>${escapeHtml(order.orderNumber)}</strong>. ${
          cod
            ? 'You will pay in cash when your order is delivered.'
            : 'Complete payment to confirm and dispatch your order.'
        }</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0">
          <thead><tr>
            <th align="left" style="font-size:12px;color:#64748b;padding-bottom:6px">Item</th>
            <th align="center" style="font-size:12px;color:#64748b;padding-bottom:6px">Qty</th>
            <th align="right" style="font-size:12px;color:#64748b;padding-bottom:6px">Total</th>
          </tr></thead>
          <tbody>${itemRows(order.items)}</tbody>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">
          <tr><td style="padding:3px 0;color:#64748b">Subtotal</td><td align="right">${formatEtb(order.subtotal)}</td></tr>
          ${
            order.discount > 0
              ? `<tr><td style="padding:3px 0;color:#64748b">Discount</td><td align="right">-${formatEtb(
                  order.discount,
                )}</td></tr>`
              : ''
          }
          <tr><td style="padding:3px 0;color:#64748b">${escapeHtml(order.deliveryLabel)}</td><td align="right">${
            order.shippingFee === 0 ? 'Free' : formatEtb(order.shippingFee)
          }</td></tr>
          <tr><td style="padding:10px 0 0;font-weight:700;border-top:1px solid #e2e8f0">Total</td>
              <td align="right" style="padding:10px 0 0;font-weight:700;border-top:1px solid #e2e8f0">${formatEtb(
                order.total,
              )}</td></tr>
        </table>`,
      cta: { label: 'View order', url: order.orderUrl },
    }),
    text: `Hi ${order.name},\n\nThank you for your order ${order.orderNumber}.\nTotal: ${formatEtb(
      order.total,
    )}\n\nView your order: ${order.orderUrl}`,
  };
}

export function paymentReceivedEmail(order: {
  to: string;
  name: string;
  orderNumber: string;
  total: number;
  orderUrl: string;
}) {
  return {
    to: order.to,
    subject: `Payment confirmed for ${order.orderNumber}`,
    html: emailLayout({
      preheader: `We verified your payment of ${formatEtb(order.total)}.`,
      heading: 'Payment confirmed',
      body: `${greeting(order.name)}
        <p style="margin:0 0 14px">We verified your payment of <strong>${formatEtb(
          order.total,
        )}</strong> for order <strong>${escapeHtml(order.orderNumber)}</strong>.</p>
        <p style="margin:0 0 14px">Your order is now being prepared. We will email you again when it ships.</p>`,
      cta: { label: 'View order', url: order.orderUrl },
    }),
    text: `Hi ${order.name},\n\nPayment confirmed for ${order.orderNumber}: ${formatEtb(
      order.total,
    )}.\n\nView your order: ${order.orderUrl}`,
  };
}
