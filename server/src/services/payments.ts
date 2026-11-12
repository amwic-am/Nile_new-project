import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Database } from '../db/index.js';
import { chapaConfigured, config } from '../config.js';
import { AppError, conflict, notFound, unprocessable } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { randomToken } from '../lib/tokens.js';
import { commitOrderStock } from './inventory.js';

export type PaymentMethodId = 'cod' | 'chapa' | 'telebirr' | 'mpesa' | 'card' | 'paypal' | 'eps';

export interface PaymentOption {
  id: PaymentMethodId;
  label: string;
  description: string;
  available: boolean;
  configured: boolean;
  implemented: boolean;
  requiresSetup: boolean;
  note: string | null;
}

export function getPaymentOptions(): PaymentOption[] {
  const telebirrConfigured = Boolean(config.telebirr.appId && config.telebirr.appKey);
  const mpesaConfigured = Boolean(
    config.mpesa.consumerKey && config.mpesa.consumerSecret && config.mpesa.shortcode,
  );
  const paypalConfigured = Boolean(config.paypal.clientId && config.paypal.clientSecret);

  return [
    {
      id: 'cod',
      label: 'Cash on delivery',
      description: 'Pay the courier in cash when your order arrives.',
      available: true,
      configured: true,
      implemented: true,
      requiresSetup: false,
      note: null,
    },
    {
      id: 'chapa',
      label: 'Chapa',
      description: 'Pay securely with cards, Telebirr or M-PESA through Chapa.',
      available: chapaConfigured,
      configured: chapaConfigured,
      implemented: true,
      requiresSetup: !chapaConfigured,
      note: chapaConfigured ? null : 'Add CHAPA_SECRET_KEY and CHAPA_WEBHOOK_SECRET to enable online payment.',
    },
    {
      id: 'telebirr',
      label: 'Telebirr',
      description: 'Ethio Telecom mobile money, subject to merchant approval.',
      available: false,
      configured: telebirrConfigured,
      implemented: false,
      requiresSetup: true,
      note: 'Requires an approved Telebirr merchant account and server integration.',
    },
    {
      id: 'mpesa',
      label: 'M-PESA',
      description: 'Safaricom M-PESA mobile money.',
      available: false,
      configured: mpesaConfigured,
      implemented: false,
      requiresSetup: true,
      note: 'Requires M-PESA merchant credentials and approval.',
    },
    {
      id: 'card',
      label: 'International card',
      description: 'Visa and Mastercard through an approved payment gateway.',
      available: false,
      configured: false,
      implemented: false,
      requiresSetup: true,
      note: 'Requires an approved card gateway. Chapa can process cards once enabled on your account.',
    },
    {
      id: 'paypal',
      label: 'PayPal',
      description: 'PayPal checkout where supported for Ethiopian merchants.',
      available: false,
      configured: paypalConfigured,
      implemented: false,
      requiresSetup: true,
      note: 'PayPal availability depends on merchant eligibility in Ethiopia.',
    },
    {
      id: 'eps',
      label: 'Ethiopian Payment System',
      description: 'EPS instant payments, subject to provider availability.',
      available: false,
      configured: false,
      implemented: false,
      requiresSetup: true,
      note: 'Requires EPS merchant onboarding through a participating bank.',
    },
  ];
}

type ChapaInitInput = {
  txRef: string;
  amountSantim: number;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  orderNumber: string;
  returnUrl: string;
  callbackUrl: string;
};

type ChapaInitResponse = {
  status?: string;
  message?: string;
  data?: { checkout_url?: string };
};

export interface ProviderVerification {
  status: 'successful' | 'failed' | 'pending';
  amount: number;
  currency: string;
  raw: unknown;
}

function assertChapaConfigured() {
  if (!chapaConfigured) {
    throw new AppError(
      503,
      'payment_not_configured',
      'Online payment is not configured for this store yet. Please choose cash on delivery or contact support.',
    );
  }
}

async function chapaRequest(pathname: string, init?: RequestInit) {
  assertChapaConfigured();
  const response = await fetch(`${config.chapa.baseUrl}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.chapa.secretKey}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  return { response, data };
}

export async function initializeChapaPayment(input: ChapaInitInput): Promise<{
  checkoutUrl: string;
  raw: Record<string, unknown>;
}> {
  let result: Awaited<ReturnType<typeof chapaRequest>>;
  try {
    result = await chapaRequest('/transaction/initialize', {
      method: 'POST',
      body: JSON.stringify({
        amount: (input.amountSantim / 100).toFixed(2),
        currency: 'ETB',
        email: input.email,
        first_name: input.firstName || 'Nile',
        last_name: input.lastName || 'Mart customer',
        phone_number: input.phone,
        tx_ref: input.txRef,
        callback_url: input.callbackUrl,
        return_url: input.returnUrl,
        customization: {
          title: 'Nile Mart',
          description: `Payment for order ${input.orderNumber}`,
        },
      }),
    });
  } catch (error) {
    logger.error('Chapa initialization request failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new AppError(
      502,
      'payment_provider_unavailable',
      'The payment provider could not be reached. Please try again in a moment.',
    );
  }

  const body = result.data as ChapaInitResponse | null;
  const checkoutUrl = body?.data?.checkout_url;
  if (!result.response.ok || body?.status !== 'success' || !checkoutUrl) {
    logger.warn('Chapa rejected the payment initialization', {
      status: result.response.status,
      message: body?.message,
    });
    throw new AppError(
      502,
      'payment_provider_error',
      'The payment provider could not start this payment. Please try again or choose another method.',
    );
  }
  return { checkoutUrl, raw: body as Record<string, unknown> };
}

export async function verifyChapaTransaction(txRef: string): Promise<ProviderVerification> {
  let result: Awaited<ReturnType<typeof chapaRequest>>;
  try {
    result = await chapaRequest(`/transaction/verify/${encodeURIComponent(txRef)}`, { method: 'GET' });
  } catch (error) {
    logger.warn('Chapa verification request failed', {
      reference: txRef,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new AppError(
      502,
      'payment_provider_unavailable',
      'We could not verify the payment with the provider. Please try again shortly.',
    );
  }
  const body = result.data as {
    status?: string;
    message?: string;
    data?: { status?: string; amount?: string | number; currency?: string; tx_ref?: string };
  } | null;

  if (!result.response.ok || body?.status !== 'success' || !body.data) {
    return { status: 'pending', amount: 0, currency: 'ETB', raw: body };
  }
  const providerStatus = String(body.data.status ?? '').toLowerCase();
  const amount = Math.round(Number(body.data.amount ?? 0) * 100);
  const status: ProviderVerification['status'] =
    providerStatus === 'success'
      ? 'successful'
      : ['failed', 'cancelled', 'reversed'].includes(providerStatus)
        ? 'failed'
        : 'pending';
  return { status, amount, currency: String(body.data.currency ?? 'ETB'), raw: body };
}

export function verifyChapaWebhookSignature(rawBody: Buffer | string, signature: string | null): boolean {
  if (!config.chapa.webhookSecret || !signature) return false;
  const digest = createHmac('sha256', config.chapa.webhookSecret).update(rawBody).digest('hex');
  const expected = Buffer.from(digest, 'utf8');
  const actual = Buffer.from(signature.trim(), 'utf8');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export interface PaymentStartResult {
  provider: 'chapa';
  reference: string;
  redirectUrl: string;
  amount: number;
}

export async function startChapaPayment(
  db: Database,
  input: { orderId: string; profileId: string },
): Promise<PaymentStartResult> {
  assertChapaConfigured();

  const orderResult = await db.query<{
    id: string;
    order_number: string;
    profile_id: string | null;
    status: string;
    payment_status: string;
    payment_method: string;
    total: number;
    email: string;
    phone: string;
    customer_name: string;
  }>(
    `select id, order_number, profile_id, status, payment_status, payment_method, total, email, phone, customer_name
       from orders where id = $1`,
    [input.orderId],
  );
  const order = orderResult.rows[0];
  if (!order) throw notFound('Order not found');
  if (order.profile_id !== input.profileId) throw notFound('Order not found');
  if (order.payment_status === 'paid') {
    throw conflict('This order has already been paid.');
  }
  if (order.status !== 'awaiting_payment') {
    throw unprocessable('This order is not awaiting payment. Refresh the page to see its status.');
  }

  await db.query(
    `update payments set status = 'cancelled', updated_at = now()
      where order_id = $1 and provider = 'chapa' and status = 'pending'`,
    [order.id],
  );
  await db.query(
    `update orders set payment_status = 'awaiting_payment', updated_at = now()
      where id = $1 and status = 'awaiting_payment'`,
    [order.id],
  );

  const reference = `NM-${order.order_number}-${randomToken(6).replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)}`;
  const paymentRow = await db.query<{ id: string }>(
    `insert into payments (order_id, provider, provider_ref, amount, status, raw_response)
     values ($1, 'chapa', $2, $3, 'pending', '{}'::jsonb) returning id`,
    [order.id, reference, Number(order.total)],
  );

  const [firstName, ...rest] = order.customer_name.split(' ');
  try {
    const initialized = await initializeChapaPayment({
      txRef: reference,
      amountSantim: Number(order.total),
      email: order.email,
      firstName: firstName || 'Nile',
      lastName: rest.join(' ') || 'Customer',
      phone: order.phone,
      orderNumber: order.order_number,
      returnUrl: `${config.appUrl}/checkout/payment/callback?reference=${encodeURIComponent(reference)}`,
      callbackUrl: `${config.apiUrl}/api/webhooks/chapa`,
    });
    await db.query(
      `update payments set raw_response = $2::jsonb, updated_at = now() where id = $1`,
      [
        paymentRow.rows[0].id,
        JSON.stringify({
          source: 'chapa',
          checkout_url: initialized.checkoutUrl,
          initialized_at: new Date().toISOString(),
        }),
      ],
    );
    return {
      provider: 'chapa',
      reference,
      redirectUrl: initialized.checkoutUrl,
      amount: Number(order.total),
    };
  } catch (error) {
    await db.query(
      `update payments set status = 'failed', failure_reason = $2, updated_at = now() where id = $1`,
      [paymentRow.rows[0].id, error instanceof Error ? error.message.slice(0, 300) : 'Initialization failed'],
    );
    throw error;
  }
}

export interface FinalizedPayment {
  orderId: string;
  orderNumber: string;
  orderStatus: string;
  paymentStatus: 'paid' | 'refund_required' | 'already_paid';
  profileId: string | null;
  total: number;
}

/**
 * Marks an order paid only after the provider has been verified server-side.
 * Amounts and currency must match exactly. A payment that arrives after an
 * order was cancelled is flagged for a refund rather than resurrecting the order.
 */
export async function finalizeChapaPayment(
  db: Database,
  input: { reference: string; verifiedAmount: number; verifiedCurrency: string; raw: unknown },
): Promise<FinalizedPayment> {
  return db.transaction(async (tx) => {
    const paymentResult = await tx.query<{
      id: string;
      order_id: string;
      amount: number;
      status: string;
      order_status: string;
      order_number: string;
      payment_status: string;
      profile_id: string | null;
      total: number;
    }>(
      `select pay.id, pay.order_id, pay.amount, pay.status, o.status as order_status,
              o.order_number, o.payment_status, o.profile_id, o.total
         from payments pay
         join orders o on o.id = pay.order_id
        where pay.provider = 'chapa' and pay.provider_ref = $1
        for update of pay, o`,
      [input.reference],
    );
    const payment = paymentResult.rows[0];
    if (!payment) throw notFound('Payment reference not found');

    if (payment.status === 'successful' || payment.payment_status === 'paid') {
      return {
        orderId: payment.order_id,
        orderNumber: payment.order_number,
        orderStatus: payment.order_status,
        paymentStatus: 'already_paid',
        profileId: payment.profile_id,
        total: Number(payment.total),
      };
    }

    const currencyMismatch = String(input.verifiedCurrency ?? '').toUpperCase() !== 'ETB';
    if (
      currencyMismatch ||
      Number(input.verifiedAmount) !== Number(payment.amount) ||
      Number(payment.amount) !== Number(payment.total)
    ) {
      await tx.query(
        `update payments set status = 'failed', failure_reason = $2, raw_response = $3::jsonb,
                verified_at = now(), updated_at = now()
          where id = $1`,
        [
          payment.id,
          currencyMismatch
            ? 'Verified currency did not match ETB'
            : 'Verified amount did not match the order total',
          JSON.stringify({ verification: input.raw }),
        ],
      );
      throw conflict('The verified payment details do not match this order.');
    }

    if (payment.order_status === 'cancelled') {
      await tx.query(
        `update payments set status = 'successful', verified_at = now(), raw_response = $2::jsonb,
                updated_at = now()
          where id = $1`,
        [payment.id, JSON.stringify({ verification: input.raw })],
      );
      await tx.query(
        `insert into refunds (order_id, payment_id, amount, reason, status)
         values ($1, $2, $3, $4, 'pending')`,
        [payment.order_id, payment.id, Number(payment.amount), 'Payment received after order cancellation'],
      );
      await tx.query(
        `insert into order_status_history (order_id, status, note)
         values ($1, 'cancelled', 'Late payment received; refund requested automatically.')`,
        [payment.order_id],
      );
      return {
        orderId: payment.order_id,
        orderNumber: payment.order_number,
        orderStatus: payment.order_status,
        paymentStatus: 'refund_required',
        profileId: payment.profile_id,
        total: Number(payment.total),
      };
    }

    await tx.query(
      `update payments set status = 'successful', verified_at = now(), raw_response = $2::jsonb,
              failure_reason = null, updated_at = now()
        where id = $1`,
      [payment.id, JSON.stringify({ verification: input.raw })],
    );
    await tx.query(
      `update orders
          set payment_status = 'paid',
              status = case when status in ('pending', 'awaiting_payment') then 'paid' else status end,
              updated_at = now()
        where id = $1`,
      [payment.order_id],
    );
    await tx.query(
      `insert into order_status_history (order_id, status, note)
       values ($1, 'paid', 'Payment verified with Chapa.')`,
      [payment.order_id],
    );
    await commitOrderStock(tx, payment.order_id);

    if (payment.profile_id) {
      await tx.query(
        `insert into notifications (profile_id, type, title, body, link)
         values ($1, 'payment_received', $2, $3, $4)`,
        [
          payment.profile_id,
          `Payment received for ${payment.order_number}`,
          'Your payment has been verified. We are preparing your order.',
          `/account/orders/${payment.order_id}`,
        ],
      );
    }

    return {
      orderId: payment.order_id,
      orderNumber: payment.order_number,
      orderStatus: 'paid',
      paymentStatus: 'paid',
      profileId: payment.profile_id,
      total: Number(payment.total),
    };
  });
}

export async function recordWebhookEvent(
  db: Database,
  input: {
    provider: string;
    eventId: string;
    payload: unknown;
    signatureValid: boolean;
    error?: string | null;
  },
): Promise<{ id: string; duplicate: boolean; processed: boolean }> {
  const inserted = await db.query<{ id: string }>(
    `insert into payment_webhook_events (provider, event_id, payload, signature_valid, error)
     values ($1, $2, $3::jsonb, $4, $5)
     on conflict (provider, event_id) do nothing
     returning id`,
    [input.provider, input.eventId, JSON.stringify(input.payload), input.signatureValid, input.error ?? null],
  );
  if (inserted.rows[0]) return { id: inserted.rows[0].id, duplicate: false, processed: false };
  const existing = await db.query<{ id: string; processed_at: Date | null }>(
    'select id, processed_at from payment_webhook_events where provider = $1 and event_id = $2',
    [input.provider, input.eventId],
  );
  const event = existing.rows[0];
  return {
    id: event?.id ?? '',
    duplicate: true,
    processed: Boolean(event?.processed_at),
  };
}

export async function markWebhookProcessed(
  db: Database,
  input: { eventId: string; error?: string | null },
): Promise<void> {
  await db.query(
    `update payment_webhook_events
        set processed_at = now(), error = $2
      where provider = 'chapa' and event_id = $1`,
    [input.eventId, input.error ?? null],
  );
}

export async function markChapaPaymentFailed(
  db: Database,
  input: { reference: string; reason: string },
): Promise<void> {
  await db.transaction(async (tx) => {
    const result = await tx.query<{
      id: string;
      order_id: string;
      status: string;
      order_status: string;
    }>(
      `select pay.id, pay.order_id, pay.status, o.status as order_status
         from payments pay join orders o on o.id = pay.order_id
        where pay.provider = 'chapa' and pay.provider_ref = $1
        for update of pay`,
      [input.reference],
    );
    const payment = result.rows[0];
    if (!payment || payment.status === 'successful') return;
    await tx.query(
      `update payments set status = 'failed', failure_reason = $2, verified_at = now(), updated_at = now()
        where id = $1`,
      [payment.id, input.reason.slice(0, 300)],
    );
    if (payment.order_status === 'awaiting_payment') {
      await tx.query(
        `update orders set payment_status = 'failed', updated_at = now() where id = $1`,
        [payment.order_id],
      );
      await tx.query(
        `insert into order_status_history (order_id, status, note)
         values ($1, 'awaiting_payment', $2)`,
        [payment.order_id, `Payment attempt failed: ${input.reason.slice(0, 200)}`],
      );
    }
  });
}
