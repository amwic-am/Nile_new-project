import type { Database, Sql } from '../db/index.js';
import { config } from '../config.js';
import type { AuthUser } from '../lib/auth.js';
import { forbidden, notFound, unprocessable } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { getDeliveryMethods, getFreeShippingThreshold } from './settings.js';
import {
  assertPurchasableLines,
  evaluateCoupon,
  loadCartLines,
  summarizeCart,
} from './pricing.js';
import { commitOrderStock, releaseOrderStock, reserveStock } from './inventory.js';

export type PaymentMethod = 'cod' | 'chapa';

export interface PlaceOrderInput {
  contact: { fullName: string; email: string; phone: string };
  shippingAddress: {
    fullName: string;
    phone: string;
    line1: string;
    line2?: string | null;
    city: string;
    region?: string;
    postalCode?: string | null;
    country?: string;
  };
  deliveryMethod: string;
  paymentMethod: PaymentMethod;
  couponCode?: string | null;
  customerNote?: string | null;
  saveAddress?: boolean;
}

export interface PlacedOrder {
  orderId: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  paymentMethod: PaymentMethod;
  subtotal: number;
  discount: number;
  shippingFee: number;
  total: number;
  currency: 'ETB';
  deliveryMethod: string;
  deliveryLabel: string;
  placedAt: string;
  reservationExpiresAt: string;
  replayed: boolean;
}

const CANCELLABLE_BY_CUSTOMER = ['pending', 'awaiting_payment', 'paid', 'confirmed', 'processing'];

async function insertNotification(
  tx: Sql,
  profileId: string | null,
  input: { type: string; title: string; body: string; link?: string },
) {
  if (!profileId) return;
  await tx.query(
    `insert into notifications (profile_id, type, title, body, link)
     values ($1, $2, $3, $4, $5)`,
    [profileId, input.type, input.title, input.body, input.link ?? null],
  );
}

async function releaseCouponRedemption(tx: Sql, orderId: string) {
  const result = await tx.query<{ coupon_id: string }>(
    'select coupon_id from coupon_redemptions where order_id = $1',
    [orderId],
  );
  const redemption = result.rows[0];
  if (!redemption) return;
  await tx.query('delete from coupon_redemptions where order_id = $1', [orderId]);
  await tx.query(
    'update coupons set used_count = greatest(used_count - 1, 0) where id = $1',
    [redemption.coupon_id],
  );
}

export async function placeOrder(
  db: Database,
  user: AuthUser,
  input: PlaceOrderInput,
  idempotencyKey: string,
): Promise<PlacedOrder> {
  if (config.requireVerifiedEmail && !user.emailVerified) {
    throw forbidden('Verify your email address before placing an order.');
  }

  return db.transaction(async (tx) => {
    if (idempotencyKey) {
      const existing = await tx.query<{
        id: string;
        order_number: string;
        status: string;
        payment_status: string;
        payment_method: PaymentMethod;
        subtotal: number;
        discount: number;
        shipping_fee: number;
        total: number;
        delivery_method: string;
        delivery_label: string;
        placed_at: Date;
        reservation_expires_at: Date | null;
      }>(
        `select id, order_number, status, payment_status, payment_method, subtotal, discount,
                shipping_fee, total, delivery_method, delivery_label, placed_at, reservation_expires_at
           from orders where idempotency_key = $1 and profile_id = $2 limit 1`,
        [idempotencyKey, user.id],
      );
      const order = existing.rows[0];
      if (order) {
        return {
          orderId: order.id,
          orderNumber: order.order_number,
          status: order.status,
          paymentStatus: order.payment_status,
          paymentMethod: order.payment_method,
          subtotal: Number(order.subtotal),
          discount: Number(order.discount),
          shippingFee: Number(order.shipping_fee),
          total: Number(order.total),
          currency: 'ETB',
          deliveryMethod: order.delivery_method,
          deliveryLabel: order.delivery_label,
          placedAt: new Date(order.placed_at).toISOString(),
          reservationExpiresAt: order.reservation_expires_at
            ? new Date(order.reservation_expires_at).toISOString()
            : '',
          replayed: true,
        };
      }
    }

    const methods = await getDeliveryMethods(tx);
    const method = methods.find((entry) => entry.id === input.deliveryMethod && entry.enabled);
    if (!method) throw unprocessable('Choose an available delivery method.');
    if (input.paymentMethod !== 'cod' && input.paymentMethod !== 'chapa') {
      throw unprocessable('That payment method is not available for this store.');
    }

    const cartResult = await tx.query<{ id: string; coupon_code: string | null }>(
      `select id, coupon_code from carts
        where profile_id = $1 and status = 'active'
        for update`,
      [user.id],
    );
    const cart = cartResult.rows[0];
    if (!cart) throw unprocessable('Your cart is empty.');

    const lines = await loadCartLines(tx, cart.id);
    assertPurchasableLines(lines);

    const requestedCoupon = input.couponCode?.trim() || cart.coupon_code;
    const evaluation = await evaluateCoupon(tx, {
      code: requestedCoupon,
      lines,
      profileId: user.id,
      email: input.contact.email,
    });
    if (requestedCoupon && !evaluation.coupon) {
      throw unprocessable(evaluation.error ?? 'That discount code cannot be used with this order.');
    }

    const priced = summarizeCart(lines, evaluation);
    const threshold = await getFreeShippingThreshold(tx);
    const shippingFee = method.id === 'pickup' || priced.total >= threshold ? 0 : method.fee;
    const total = priced.total + shippingFee;
    if (total <= 0) throw unprocessable('This order total is not payable. Please review your cart.');

    const now = new Date();
    const reservationMinutes =
      input.paymentMethod === 'chapa' ? config.reservationMinutes : 60 * 24 * 7;
    const reservationExpiresAt = new Date(now.getTime() + reservationMinutes * 60_000);
    const status = input.paymentMethod === 'cod' ? 'confirmed' : 'awaiting_payment';
    const paymentStatus = input.paymentMethod === 'cod' ? 'unpaid' : 'awaiting_payment';

    const shippingAddress = {
      ...input.shippingAddress,
      fullName: input.contact.fullName || input.shippingAddress.fullName,
      phone: input.contact.phone || input.shippingAddress.phone,
      line1:
        method.id === 'pickup'
          ? input.shippingAddress.line1 || 'Bole Road, Addis Ababa (store pickup)'
          : input.shippingAddress.line1,
      country: input.shippingAddress.country || 'ET',
    };

    const seq = (await tx.query<{ n: number | string }>("select nextval('order_number_seq') as n")).rows[0].n;
    const orderNumber = `NM-${String(seq).padStart(6, '0')}`;

    const orderResult = await tx.query<{ id: string }>(
      `insert into orders (order_number, profile_id, email, phone, customer_name, shipping_address,
                           delivery_method, delivery_label, shipping_fee, subtotal, discount, total,
                           coupon_id, coupon_code, status, payment_status, payment_method, customer_note,
                           idempotency_key, reservation_expires_at, placed_at, confirmed_at)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
               $19, $20, $21, $22)
       returning id`,
      [
        orderNumber,
        user.id,
        input.contact.email.toLowerCase(),
        input.contact.phone,
        input.contact.fullName,
        JSON.stringify(shippingAddress),
        method.id,
        method.label,
        shippingFee,
        priced.subtotal,
        priced.discount,
        total,
        evaluation.coupon?.id ?? null,
        evaluation.coupon?.code ?? null,
        status,
        paymentStatus,
        input.paymentMethod,
        input.customerNote?.trim() || null,
        idempotencyKey,
        reservationExpiresAt,
        now,
        input.paymentMethod === 'cod' ? now : null,
      ],
    );
    const orderId = orderResult.rows[0].id;

    for (const line of lines) {
      await tx.query(
        `insert into order_items (order_id, product_id, variant_id, product_name, product_slug, variant_label,
                                  sku, image_url, unit_price, compare_at_price, quantity, line_total)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          orderId,
          line.productId,
          line.variantId,
          line.name,
          line.slug,
          line.variantLabel,
          line.sku,
          line.imageUrl,
          line.unitPrice,
          line.compareAtPrice,
          line.quantity,
          line.lineTotal,
        ],
      );
    }

    await tx.query(
      `insert into order_status_history (order_id, status, note, changed_by, created_at)
       values ($1, 'pending', 'Order placed by the customer.', $2, $3)`,
      [orderId, user.id, now],
    );
    if (input.paymentMethod === 'cod') {
      await tx.query(
        `insert into order_status_history (order_id, status, note, changed_by, created_at)
         values ($1, 'confirmed', 'Order confirmed. Payment due on delivery.', $2, $3)`,
        [orderId, user.id, now],
      );
    } else {
      await tx.query(
        `insert into order_status_history (order_id, status, note, changed_by, created_at)
         values ($1, 'awaiting_payment', 'Awaiting confirmation from the payment provider.', $2, $3)`,
        [orderId, user.id, now],
      );
    }

    await reserveStock(
      tx,
      orderId,
      lines.map((line) => ({
        variantId: line.variantId,
        quantity: line.quantity,
        label: line.name,
      })),
      user.id,
    );

    if (evaluation.coupon && priced.discount > 0) {
      await tx.query(
        `insert into coupon_redemptions (coupon_id, order_id, profile_id, email, discount_amount)
         values ($1, $2, $3, $4, $5)`,
        [evaluation.coupon.id, orderId, user.id, input.contact.email.toLowerCase(), priced.discount],
      );
      await tx.query('update coupons set used_count = used_count + 1 where id = $1', [
        evaluation.coupon.id,
      ]);
    }

    await tx.query(
      `update carts set status = 'converted', coupon_code = null, updated_at = now() where id = $1`,
      [cart.id],
    );

    if (input.saveAddress && method.id !== 'pickup') {
      const duplicate = await tx.query<{ id: string }>(
        `select id from addresses
          where profile_id = $1 and lower(line1) = lower($2) and phone = $3 limit 1`,
        [user.id, shippingAddress.line1, shippingAddress.phone],
      );
      if (!duplicate.rows[0]) {
        const existingDefault = await tx.query<{ exists: boolean }>(
          'select exists (select 1 from addresses where profile_id = $1 and is_default) as exists',
          [user.id],
        );
        await tx.query(
          `insert into addresses (profile_id, label, full_name, phone, line1, line2, city, region,
                                  postal_code, country, is_default)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            user.id,
            'Home',
            shippingAddress.fullName,
            shippingAddress.phone,
            shippingAddress.line1,
            shippingAddress.line2 ?? null,
            shippingAddress.city,
            shippingAddress.region ?? '',
            shippingAddress.postalCode ?? null,
            shippingAddress.country,
            !existingDefault.rows[0]?.exists,
          ],
        );
      }
    }

    await tx.query('update profiles set phone = coalesce(phone, $2) where id = $1', [
      user.id,
      input.contact.phone,
    ]);

    await insertNotification(tx, user.id, {
      type: 'order_placed',
      title: `Order ${orderNumber} received`,
      body:
        input.paymentMethod === 'cod'
          ? 'Your order is confirmed. Pay in cash when it arrives.'
          : 'Complete payment to confirm your order.',
      link: `/account/orders/${orderId}`,
    });

    return {
      orderId,
      orderNumber,
      status,
      paymentStatus,
      paymentMethod: input.paymentMethod,
      subtotal: priced.subtotal,
      discount: priced.discount,
      shippingFee,
      total,
      currency: 'ETB',
      deliveryMethod: method.id,
      deliveryLabel: method.label,
      placedAt: now.toISOString(),
      reservationExpiresAt: reservationExpiresAt.toISOString(),
      replayed: false,
    };
  });
}

export interface OrderDetail {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  deliveryMethod: string;
  deliveryLabel: string;
  customerName: string;
  email: string;
  phone: string;
  shippingAddress: Record<string, unknown>;
  subtotal: number;
  discount: number;
  shippingFee: number;
  total: number;
  currency: string;
  couponCode: string | null;
  customerNote: string | null;
  adminNote: string | null;
  placedAt: string;
  reservationExpiresAt: string | null;
  confirmedAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  items: {
    id: string;
    productId: string | null;
    name: string;
    slug: string;
    variantLabel: string;
    sku: string;
    imageUrl: string | null;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
  }[];
  history: { status: string; note: string | null; createdAt: string }[];
  shipment: {
    carrier: string;
    trackingNumber: string | null;
    trackingUrl: string | null;
    status: string;
    shippedAt: string | null;
    deliveredAt: string | null;
  } | null;
  payment: { provider: string; reference: string | null; status: string; amount: number } | null;
}

type OrderRow = {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
  payment_method: string;
  delivery_method: string;
  delivery_label: string;
  customer_name: string;
  email: string;
  phone: string;
  shipping_address: Record<string, unknown>;
  subtotal: number;
  discount: number;
  shipping_fee: number;
  total: number;
  currency: string;
  coupon_code: string | null;
  customer_note: string | null;
  admin_note: string | null;
  placed_at: Date;
  reservation_expires_at: Date | null;
  confirmed_at: Date | null;
  shipped_at: Date | null;
  delivered_at: Date | null;
  cancelled_at: Date | null;
};

function iso(value: Date | string | null): string | null {
  return value ? new Date(value).toISOString() : null;
}

export async function getOrderDetail(
  db: Sql,
  identifier: string,
  options: { profileId?: string | null } = {},
): Promise<OrderDetail> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
  const orderResult = await db.query<OrderRow>(
    `select id, order_number, status, payment_status, payment_method, delivery_method, delivery_label,
            customer_name, email, phone, shipping_address, subtotal, discount, shipping_fee, total,
            currency, coupon_code, customer_note, admin_note, placed_at, reservation_expires_at,
            confirmed_at, shipped_at, delivered_at, cancelled_at
       from orders
      where ${isUuid ? 'id' : 'upper(order_number)'} = ${isUuid ? '$1::uuid' : 'upper($1)'}
        ${options.profileId ? 'and profile_id = $2' : ''}
      limit 1`,
    options.profileId ? [identifier, options.profileId] : [identifier],
  );
  const order = orderResult.rows[0];
  if (!order) throw notFound('Order not found');

  const [items, history, shipment, payment] = await Promise.all([
    db.query<{
      id: string;
      product_id: string | null;
      product_name: string;
      product_slug: string;
      variant_label: string;
      sku: string;
      image_url: string | null;
      unit_price: number;
      quantity: number;
      line_total: number;
    }>(
      `select id, product_id, product_name, product_slug, variant_label, sku, image_url, unit_price,
              quantity, line_total
         from order_items where order_id = $1 order by created_at asc`,
      [order.id],
    ),
    db.query<{ status: string; note: string | null; created_at: Date }>(
      `select status, note, created_at from order_status_history
        where order_id = $1 order by created_at asc`,
      [order.id],
    ),
    db.query<{
      carrier: string;
      tracking_number: string | null;
      tracking_url: string | null;
      status: string;
      shipped_at: Date | null;
      delivered_at: Date | null;
    }>(
      `select carrier, tracking_number, tracking_url, status, shipped_at, delivered_at
         from shipments where order_id = $1 order by created_at desc limit 1`,
      [order.id],
    ),
    db.query<{ provider: string; provider_ref: string | null; status: string; amount: number }>(
      `select provider, provider_ref, status, amount from payments
        where order_id = $1 order by created_at desc limit 1`,
      [order.id],
    ),
  ]);

  return {
    id: order.id,
    orderNumber: order.order_number,
    status: order.status,
    paymentStatus: order.payment_status,
    paymentMethod: order.payment_method,
    deliveryMethod: order.delivery_method,
    deliveryLabel: order.delivery_label,
    customerName: order.customer_name,
    email: order.email,
    phone: order.phone,
    shippingAddress: order.shipping_address,
    subtotal: Number(order.subtotal),
    discount: Number(order.discount),
    shippingFee: Number(order.shipping_fee),
    total: Number(order.total),
    currency: order.currency,
    couponCode: order.coupon_code,
    customerNote: order.customer_note,
    adminNote: order.admin_note,
    placedAt: iso(order.placed_at)!,
    reservationExpiresAt: iso(order.reservation_expires_at),
    confirmedAt: iso(order.confirmed_at),
    shippedAt: iso(order.shipped_at),
    deliveredAt: iso(order.delivered_at),
    cancelledAt: iso(order.cancelled_at),
    items: items.rows.map((item) => ({
      id: item.id,
      productId: item.product_id,
      name: item.product_name,
      slug: item.product_slug,
      variantLabel: item.variant_label,
      sku: item.sku,
      imageUrl: item.image_url,
      unitPrice: Number(item.unit_price),
      quantity: Number(item.quantity),
      lineTotal: Number(item.line_total),
    })),
    history: history.rows.map((entry) => ({
      status: entry.status,
      note: entry.note,
      createdAt: iso(entry.created_at)!,
    })),
    shipment: shipment.rows[0]
      ? {
          carrier: shipment.rows[0].carrier,
          trackingNumber: shipment.rows[0].tracking_number,
          trackingUrl: shipment.rows[0].tracking_url,
          status: shipment.rows[0].status,
          shippedAt: iso(shipment.rows[0].shipped_at),
          deliveredAt: iso(shipment.rows[0].delivered_at),
        }
      : null,
    payment: payment.rows[0]
      ? {
          provider: payment.rows[0].provider,
          reference: payment.rows[0].provider_ref,
          status: payment.rows[0].status,
          amount: Number(payment.rows[0].amount),
        }
      : null,
  };
}

export async function cancelOrder(
  db: Database,
  input: { orderId: string; profileId: string; reason?: string | null },
): Promise<{ orderId: string; orderNumber: string; status: string }> {
  return db.transaction(async (tx) => {
    const result = await tx.query<{
      id: string;
      order_number: string;
      status: string;
      payment_status: string;
      payment_method: string;
      total: number;
      profile_id: string | null;
    }>(
      `select id, order_number, status, payment_status, payment_method, total, profile_id
         from orders where id = $1 for update`,
      [input.orderId],
    );
    const order = result.rows[0];
    if (!order) throw notFound('Order not found');
    if (order.profile_id !== input.profileId) throw forbidden('You cannot cancel this order');
    if (order.status === 'cancelled') {
      return { orderId: order.id, orderNumber: order.order_number, status: order.status };
    }
    if (!CANCELLABLE_BY_CUSTOMER.includes(order.status)) {
      throw unprocessable(
        'This order can no longer be cancelled online. Please contact customer support.',
      );
    }

    await releaseOrderStock(tx, order.id, input.profileId);
    await releaseCouponRedemption(tx, order.id);
    await tx.query(
      `update payments set status = 'cancelled', updated_at = now()
        where order_id = $1 and status = 'pending'`,
      [order.id],
    );

    await tx.query(
      `update orders
          set status = 'cancelled',
              payment_status = case when payment_status = 'paid' then payment_status else 'failed' end,
              cancelled_at = now(),
              updated_at = now()
        where id = $1`,
      [order.id],
    );
    await tx.query(
      `insert into order_status_history (order_id, status, note, changed_by)
       values ($1, 'cancelled', $2, $3)`,
      [
        order.id,
        input.reason?.trim() || 'Cancelled by the customer.',
        input.profileId,
      ],
    );

    if (order.payment_status === 'paid' && order.payment_method !== 'cod') {
      const payment = await tx.query<{ id: string }>(
        `select id from payments where order_id = $1 and status = 'successful'
          order by created_at desc limit 1`,
        [order.id],
      );
      await tx.query(
        `insert into refunds (order_id, payment_id, amount, reason, status, created_by)
         values ($1, $2, $3, $4, 'pending', $5)`,
        [
          order.id,
          payment.rows[0]?.id ?? null,
          Number(order.total),
          'Order cancelled after online payment; refund requested.',
          input.profileId,
        ],
      );
    }

    await insertNotification(tx, order.profile_id, {
      type: 'order_cancelled',
      title: `Order ${order.order_number} cancelled`,
      body:
        order.payment_status === 'paid' && order.payment_method !== 'cod'
          ? 'Your cancellation is confirmed. A refund will be processed to your original payment method.'
          : 'Your order has been cancelled and reserved stock released.',
      link: `/account/orders/${order.id}`,
    });

    return { orderId: order.id, orderNumber: order.order_number, status: 'cancelled' };
  });
}

export async function expireStaleReservations(db: Database): Promise<number> {
  const stale = await db.query<{ id: string }>(
    `select id from orders
      where status = 'awaiting_payment'
        and reservation_expires_at is not null
        and reservation_expires_at < now()
      order by reservation_expires_at asc
      limit 50`,
  );

  let closed = 0;
  for (const row of stale.rows) {
    try {
      const changed = await db.transaction(async (tx) => {
        const orderResult = await tx.query<{
          id: string;
          order_number: string;
          status: string;
          profile_id: string | null;
        }>(
          `select id, order_number, status, profile_id from orders where id = $1 for update`,
          [row.id],
        );
        const order = orderResult.rows[0];
        if (!order || order.status !== 'awaiting_payment') return false;

        await releaseOrderStock(tx, order.id, null);
        await releaseCouponRedemption(tx, order.id);
        await tx.query(
          `update payments set status = 'cancelled', updated_at = now()
            where order_id = $1 and status = 'pending'`,
          [order.id],
        );
        await tx.query(
          `update orders
              set status = 'cancelled', payment_status = 'failed', cancelled_at = now(), updated_at = now()
            where id = $1`,
          [order.id],
        );
        await tx.query(
          `insert into order_status_history (order_id, status, note)
           values ($1, 'cancelled', 'Payment was not completed before the reservation expired.')`,
          [order.id],
        );
        await insertNotification(tx, order.profile_id, {
          type: 'order_cancelled',
          title: `Order ${order.order_number} expired`,
          body: 'Payment was not completed in time, so reserved stock was released. You can place the order again.',
          link: `/account/orders/${order.id}`,
        });
        return true;
      });
      if (changed) closed += 1;
    } catch (error) {
      logger.warn('Failed to expire an unpaid order', {
        orderId: row.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (closed) logger.info('Expired unpaid orders and released stock', { count: closed });
  return closed;
}
