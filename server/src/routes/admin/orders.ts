import { Router } from 'express';
import { z } from 'zod';
import type { Sql } from '../../db/index.js';
import { getDatabase } from '../../db/index.js';
import { hasPerm, requirePerm } from '../../lib/auth.js';
import { badRequest, conflict, forbidden, notFound, unprocessable } from '../../lib/errors.js';
import { asyncRoute, withUserDb } from '../../lib/request.js';
import { pageParams, parse } from '../../lib/validation.js';
import { adjustStock, commitOrderStock, hasSaleMovement, releaseOrderStock } from '../../services/inventory.js';
import { buildInvoiceHtml, invoiceNumber } from '../../services/invoice.js';
import { getOrderDetail } from '../../services/orders.js';
import { getSetting } from '../../services/settings.js';
import {
  dateRange,
  paginationMeta,
  recordAudit,
  sendCsv,
  toNumber,
  type CsvColumn,
} from './shared.js';

const router = Router();

const uuidSchema = z.string().uuid('Choose a valid order');
const listQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  status: z
    .enum([
      'all',
      'pending',
      'awaiting_payment',
      'paid',
      'confirmed',
      'processing',
      'packed',
      'shipped',
      'out_for_delivery',
      'delivered',
      'cancelled',
      'returned',
      'refunded',
    ])
    .optional()
    .default('all'),
  paymentStatus: z
    .enum(['all', 'unpaid', 'awaiting_payment', 'paid', 'failed', 'partially_refunded', 'refunded'])
    .optional()
    .default('all'),
  paymentMethod: z.enum(['all', 'cod', 'chapa']).optional().default('all'),
});

async function addHistory(tx: Sql, orderId: string, status: string, note: string, actorId: string | null) {
  await tx.query(
    `insert into order_status_history (order_id, status, note, changed_by)
     values ($1,$2,$3,$4)`,
    [orderId, status, note, actorId],
  );
}

async function notifyCustomer(
  tx: Sql,
  profileId: string | null,
  orderId: string,
  orderNumber: string,
  status: string,
) {
  if (!profileId) return;
  const bodies: Record<string, { title: string; body: string }> = {
    confirmed: { title: `Order ${orderNumber} confirmed`, body: 'We are preparing your order.' },
    processing: { title: `Order ${orderNumber} is being prepared`, body: 'Our team is packing your items.' },
    packed: { title: `Order ${orderNumber} is packed`, body: 'It will be handed to the courier shortly.' },
    shipped: { title: `Order ${orderNumber} has shipped`, body: 'Track your order from your account.' },
    out_for_delivery: {
      title: `Order ${orderNumber} is on the way`,
      body: 'The courier is heading to your delivery address.',
    },
    delivered: {
      title: `Order ${orderNumber} delivered`,
      body: 'We hope you enjoy your purchase. Share a review when you have a moment.',
    },
    cancelled: {
      title: `Order ${orderNumber} cancelled`,
      body: 'The order was cancelled. Reserved items have been released.',
    },
  };
  const message = bodies[status];
  if (!message) return;
  await tx.query(
    `insert into notifications (profile_id, type, title, body, link)
     values ($1,'order_update',$2,$3,$4)`,
    [profileId, message.title, message.body, `/account/orders/${orderId}`],
  );
}

async function releaseCoupon(tx: Sql, orderId: string) {
  const redemption = await tx.query<{ coupon_id: string }>(
    'select coupon_id from coupon_redemptions where order_id = $1',
    [orderId],
  );
  if (!redemption.rows[0]) return;
  await tx.query('delete from coupon_redemptions where order_id = $1', [orderId]);
  await tx.query(
    'update coupons set used_count = greatest(used_count - 1, 0) where id = $1',
    [redemption.rows[0].coupon_id],
  );
}

async function restockOrder(tx: Sql, orderId: string, actorId: string | null) {
  const lines = await tx.query<{ variant_id: string; quantity: number; label: string }>(
    `select oi.variant_id, sum(oi.quantity)::int as quantity, min(oi.product_name) as label
       from order_items oi
      where oi.order_id = $1 and oi.variant_id is not null
      group by oi.variant_id`,
    [orderId],
  );
  for (const line of lines.rows) {
    await adjustStock(tx, {
      variantId: line.variant_id,
      delta: Number(line.quantity),
      reason: 'return',
      note: `Restocked ${line.quantity} × ${line.label} after order cancellation`,
      createdBy: actorId,
      referenceType: 'order',
      referenceId: orderId,
    });
  }
}

async function reverseStock(tx: Sql, orderId: string, actorId: string | null) {
  if (await hasSaleMovement(tx, orderId)) {
    await restockOrder(tx, orderId, actorId);
    return;
  }
  await releaseOrderStock(tx, orderId, actorId);
}

const TRANSITIONS: Record<string, string[]> = {
  pending: ['confirmed', 'cancelled'],
  awaiting_payment: ['cancelled'],
  paid: ['confirmed', 'processing', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['packed', 'cancelled'],
  packed: ['shipped', 'cancelled'],
  shipped: ['out_for_delivery', 'delivered'],
  out_for_delivery: ['delivered'],
  delivered: [],
  cancelled: [],
  returned: [],
  refunded: [],
};

router.get(
  '/orders/export',
  requirePerm('orders.read'),
  asyncRoute(async (req, res) => {
    const filters = parse(listQuerySchema, req.query);
    const range = dateRange(req, 90);
    const search = filters.q ? `%${filters.q}%` : null;
    const rows = await withUserDb(req, async (db) =>
      db.query<{
        order_number: string;
        placed_at: Date;
        customer_name: string;
        email: string;
        status: string;
        payment_status: string;
        payment_method: string;
        total: number;
        item_count: number;
      }>(
        `select o.order_number, o.placed_at, o.customer_name, o.email, o.status, o.payment_status,
                o.payment_method, o.total,
                (select count(*)::int from order_items oi where oi.order_id = o.id) as item_count
           from orders o
          where o.placed_at >= $1 and o.placed_at <= $2
            and ($3::text = 'all' or o.status = $3)
            and ($4::text = 'all' or o.payment_status = $4)
            and ($5::text = 'all' or o.payment_method = $5)
            and ($6::text is null or o.order_number ilike $6 or o.email ilike $6 or o.customer_name ilike $6)
          order by o.placed_at desc
          limit 5000`,
        [range.from, range.to, filters.status, filters.paymentStatus, filters.paymentMethod, search],
      ),
    );
    const columns: CsvColumn<{
      order_number: string;
      placed_at: string;
      customer_name: string;
      email: string;
      status: string;
      payment_status: string;
      payment_method: string;
      total: number;
      item_count: number;
    }>[] = [
      { key: 'order_number', header: 'Order' },
      { key: 'placed_at', header: 'Placed at' },
      { key: 'customer_name', header: 'Customer' },
      { key: 'email', header: 'Email' },
      { key: 'status', header: 'Status' },
      { key: 'payment_status', header: 'Payment status' },
      { key: 'payment_method', header: 'Payment method' },
      { key: 'total', header: 'Total (ETB)' },
      { key: 'item_count', header: 'Items' },
    ];
    sendCsv(
      res,
      'orders',
      columns,
      rows.rows.map((row) => ({
        ...row,
        placed_at: new Date(row.placed_at).toISOString(),
        total: toNumber(row.total) / 100,
        item_count: toNumber(row.item_count),
      })),
    );
  }),
);

router.get(
  '/orders',
  requirePerm('orders.read'),
  asyncRoute(async (req, res) => {
    const { page, pageSize, offset } = pageParams(req.query, { page: 1, pageSize: 25 });
    const filters = parse(listQuerySchema, req.query);
    const range = dateRange(req, 90);
    const search = filters.q ? `%${filters.q}%` : null;

    const data = await withUserDb(req, async (db) => {
      const base = `o.placed_at >= $1 and o.placed_at <= $2
        and ($3::text = 'all' or o.status = $3)
        and ($4::text = 'all' or o.payment_status = $4)
        and ($5::text = 'all' or o.payment_method = $5)
        and ($6::text is null or o.order_number ilike $6 or o.email ilike $6 or o.customer_name ilike $6)`;
      const baseParams = [
        range.from,
        range.to,
        filters.status,
        filters.paymentStatus,
        filters.paymentMethod,
        search,
      ];
      const count = await db.query<{ total: number }>(
        `select count(*)::int as total from orders o where ${base}`,
        baseParams,
      );
      const rows = await db.query<{
        id: string;
        order_number: string;
        customer_name: string;
        email: string;
        status: string;
        payment_status: string;
        payment_method: string;
        total: number;
        placed_at: Date;
        item_count: number;
        shipment_status: string | null;
      }>(
        `select o.id, o.order_number, o.customer_name, o.email, o.status, o.payment_status,
                o.payment_method, o.total, o.placed_at,
                (select count(*)::int from order_items oi where oi.order_id = o.id) as item_count,
                (select s.status from shipments s where s.order_id = o.id order by s.created_at desc limit 1) as shipment_status
           from orders o
          where ${base}
          order by o.placed_at desc
          limit $7 offset $8`,
        [...baseParams, pageSize, offset],
      );
      const tabBase = `o.placed_at >= $1 and o.placed_at <= $2
        and ($3::text = 'all' or o.payment_status = $3)
        and ($4::text = 'all' or o.payment_method = $4)
        and ($5::text is null or o.order_number ilike $5 or o.email ilike $5 or o.customer_name ilike $5)`;
      const tabs = await db.query<{ status: string; count: number }>(
        `select o.status, count(*)::int as count from orders o
          where ${tabBase}
          group by o.status`,
        [range.from, range.to, filters.paymentStatus, filters.paymentMethod, search],
      );
      return {
        total: toNumber(count.rows[0]?.total),
        rows: rows.rows,
        tabs: tabs.rows,
      };
    });

    res.json({
      orders: data.rows.map((entry) => ({
        id: entry.id,
        orderNumber: entry.order_number,
        customerName: entry.customer_name,
        email: entry.email,
        status: entry.status,
        paymentStatus: entry.payment_status,
        paymentMethod: entry.payment_method,
        total: toNumber(entry.total),
        placedAt: new Date(entry.placed_at).toISOString(),
        itemCount: toNumber(entry.item_count),
        shipmentStatus: entry.shipment_status,
      })),
      counts: data.tabs.reduce<Record<string, number>>((acc, entry) => {
        acc[entry.status] = toNumber(entry.count);
        return acc;
      }, {}),
      range: { from: range.from, to: range.to },
      pagination: paginationMeta(page, pageSize, data.total),
    });
  }),
);

router.get(
  '/orders/:identifier',
  requirePerm('orders.read'),
  asyncRoute(async (req, res) => {
    const identifier = parse(z.string().trim().min(4).max(60), req.params.identifier);
    const data = await withUserDb(req, async (db) => {
      const order = await getOrderDetail(db, identifier);
      const [payments, shipments, returns, refunds, customer] = await Promise.all([
        db.query<{
          id: string;
          provider: string;
          provider_ref: string | null;
          amount: number;
          status: string;
          failure_reason: string | null;
          verified_at: Date | null;
          created_at: Date;
        }>(
          `select id, provider, provider_ref, amount, status, failure_reason, verified_at, created_at
             from payments where order_id = $1 order by created_at desc`,
          [order.id],
        ),
        db.query<{
          id: string;
          carrier: string;
          tracking_number: string | null;
          tracking_url: string | null;
          status: string;
          shipped_at: Date | null;
          delivered_at: Date | null;
          notes: string | null;
          created_at: Date;
        }>(
          `select id, carrier, tracking_number, tracking_url, status, shipped_at, delivered_at, notes, created_at
             from shipments where order_id = $1 order by created_at desc`,
          [order.id],
        ),
        db.query<{
          id: string;
          order_item_id: string | null;
          reason: string;
          description: string;
          status: string;
          admin_note: string | null;
          created_at: Date;
          resolved_at: Date | null;
        }>(
          `select id, order_item_id, reason, description, status, admin_note, created_at, resolved_at
             from returns where order_id = $1 order by created_at desc`,
          [order.id],
        ),
        db.query<{
          id: string;
          amount: number;
          reason: string;
          status: string;
          provider_ref: string | null;
          created_at: Date;
          processed_at: Date | null;
        }>(
          `select id, amount, reason, status, provider_ref, created_at, processed_at
             from refunds where order_id = $1 order by created_at desc`,
          [order.id],
        ),
        db.query<{
          id: string;
          full_name: string;
          email: string;
          phone: string | null;
          status: string;
          created_at: Date;
          order_count: number;
          lifetime_value: number;
        }>(
          `select p.id, p.full_name, p.email, p.phone, p.status, p.created_at,
                  (select count(*)::int from orders o where o.profile_id = p.id) as order_count,
                  (select coalesce(sum(o.total), 0)::bigint from orders o
                    where o.profile_id = p.id and o.payment_status in ('paid','partially_refunded')) as lifetime_value
             from orders o join profiles p on p.id = o.profile_id
            where o.id = $1`,
          [order.id],
        ),
      ]);
      return { order, payments, shipments, returns, refunds, customer };
    });

    res.json({
      order: {
        ...data.order,
        payments: data.payments.rows.map((entry) => ({
          id: entry.id,
          provider: entry.provider,
          reference: entry.provider_ref,
          amount: toNumber(entry.amount),
          status: entry.status,
          failureReason: entry.failure_reason,
          verifiedAt: entry.verified_at ? new Date(entry.verified_at).toISOString() : null,
          createdAt: new Date(entry.created_at).toISOString(),
        })),
        shipments: data.shipments.rows.map((entry) => ({
          id: entry.id,
          carrier: entry.carrier,
          trackingNumber: entry.tracking_number,
          trackingUrl: entry.tracking_url,
          status: entry.status,
          shippedAt: entry.shipped_at ? new Date(entry.shipped_at).toISOString() : null,
          deliveredAt: entry.delivered_at ? new Date(entry.delivered_at).toISOString() : null,
          notes: entry.notes,
          createdAt: new Date(entry.created_at).toISOString(),
        })),
        returns: data.returns.rows.map((entry) => ({
          id: entry.id,
          orderItemId: entry.order_item_id,
          reason: entry.reason,
          description: entry.description,
          status: entry.status,
          adminNote: entry.admin_note,
          createdAt: new Date(entry.created_at).toISOString(),
          resolvedAt: entry.resolved_at ? new Date(entry.resolved_at).toISOString() : null,
        })),
        refunds: data.refunds.rows.map((entry) => ({
          id: entry.id,
          amount: toNumber(entry.amount),
          reason: entry.reason,
          status: entry.status,
          providerRef: entry.provider_ref,
          createdAt: new Date(entry.created_at).toISOString(),
          processedAt: entry.processed_at ? new Date(entry.processed_at).toISOString() : null,
        })),
        customer: data.customer.rows[0]
          ? {
              id: data.customer.rows[0].id,
              fullName: data.customer.rows[0].full_name,
              email: data.customer.rows[0].email,
              phone: data.customer.rows[0].phone,
              status: data.customer.rows[0].status,
              createdAt: new Date(data.customer.rows[0].created_at).toISOString(),
              orderCount: toNumber(data.customer.rows[0].order_count),
              lifetimeValue: toNumber(data.customer.rows[0].lifetime_value),
            }
          : null,
        allowedStatuses: TRANSITIONS[data.order.status] ?? [],
      },
    });
  }),
);

const statusSchema = z.object({
  status: z.enum([
    'confirmed',
    'processing',
    'packed',
    'shipped',
    'out_for_delivery',
    'delivered',
    'cancelled',
  ]),
  note: z.string().trim().max(500).optional(),
});

router.patch(
  '/orders/:id/status',
  requirePerm('orders.update'),
  asyncRoute(async (req, res) => {
    const id = parse(uuidSchema, req.params.id);
    const body = parse(statusSchema, req.body);

    const result = await withUserDb(req, async (db) => {
      const orderResult = await db.query<{
        id: string;
        order_number: string;
        profile_id: string | null;
        status: string;
        payment_status: string;
        payment_method: string;
        total: number;
        delivered_at: Date | null;
      }>(
        `select id, order_number, profile_id, status, payment_status, payment_method, total, delivered_at
           from orders where id = $1 for update`,
        [id],
      );
      const order = orderResult.rows[0];
      if (!order) throw notFound('Order not found');
      if (order.status === body.status) return { changed: false, status: order.status };
      const allowed = TRANSITIONS[order.status] ?? [];
      if (!allowed.includes(body.status)) {
        throw conflict(`An order that is ${order.status.replace(/_/g, ' ')} cannot move to ${body.status.replace(/_/g, ' ')}.`);
      }
      if (body.status === 'cancelled' && order.payment_status === 'paid' && order.payment_method !== 'cod') {
        if (!hasPerm(req, 'orders.refund')) {
          throw forbidden('A paid online order can only be cancelled by a user with refund permission.');
        }
      }

      const actorId = req.auth?.id ?? null;
      if (body.status === 'cancelled') {
        await reverseStock(db, order.id, actorId);
        await releaseCoupon(db, order.id);
        if (hasPerm(req, 'payments.manage') || hasPerm(req, 'orders.refund')) {
          await db.query(
            `update payments set status = 'cancelled', updated_at = now()
              where order_id = $1 and status = 'pending'`,
            [order.id],
          );
        }
        await db.query(
          `update orders
              set status = 'cancelled',
                  payment_status = case when payment_status = 'paid' then payment_status else 'failed' end,
                  cancelled_at = now(), updated_at = now()
            where id = $1`,
          [order.id],
        );
        if (order.payment_status === 'paid' && order.payment_method !== 'cod') {
          const payment = await db.query<{ id: string }>(
            `select id from payments where order_id = $1 and status = 'successful'
              order by created_at desc limit 1`,
            [order.id],
          );
          await db.query(
            `insert into refunds (order_id, payment_id, amount, reason, status, created_by)
             values ($1,$2,$3,$4,'pending',$5)`,
            [
              order.id,
              payment.rows[0]?.id ?? null,
              Number(order.total),
              'Order cancelled after online payment; refund requested.',
              actorId,
            ],
          );
        }
      } else {
        if (body.status === 'shipped') {
          await db.query('update orders set shipped_at = coalesce(shipped_at, now()) where id = $1', [order.id]);
        }
        if (body.status === 'delivered') {
          await commitOrderStock(db, order.id, actorId);
          await db.query(
            `update orders set delivered_at = coalesce(delivered_at, now()) where id = $1`,
            [order.id],
          );
          await db.query(
            `update shipments set status = 'delivered', delivered_at = coalesce(delivered_at, now()), updated_at = now()
              where order_id = $1 and status <> 'delivered'`,
            [order.id],
          );
        }
        await db.query(
          `update orders set status = $2, updated_at = now() where id = $1`,
          [order.id, body.status],
        );
      }

      await addHistory(
        db,
        order.id,
        body.status,
        body.note?.trim() ||
          (body.status === 'cancelled'
            ? 'Cancelled by the store team.'
            : `Status updated to ${body.status.replace(/_/g, ' ')}.`),
        actorId,
      );
      await notifyCustomer(db, order.profile_id, order.id, order.order_number, body.status);

      return { changed: true, status: body.status, orderNumber: order.order_number };
    });

    if (result.changed) {
      await recordAudit(req, {
        action: 'order.status.update',
        entityType: 'order',
        entityId: id,
        after: { status: body.status, note: body.note ?? null },
      });
    }

    res.json(result);
  }),
);

const noteSchema = z.object({ adminNote: z.string().trim().max(1000) });

router.patch(
  '/orders/:id/note',
  requirePerm('orders.update'),
  asyncRoute(async (req, res) => {
    const id = parse(uuidSchema, req.params.id);
    const body = parse(noteSchema, req.body);
    const before = await withUserDb(req, async (db) => {
      const existing = await db.query<{ admin_note: string | null }>(
        'select admin_note from orders where id = $1',
        [id],
      );
      if (!existing.rows[0]) throw notFound('Order not found');
      await db.query('update orders set admin_note = $2, updated_at = now() where id = $1', [
        id,
        body.adminNote || null,
      ]);
      return existing.rows[0].admin_note;
    });
    await recordAudit(req, {
      action: 'order.note.update',
      entityType: 'order',
      entityId: id,
      before: { adminNote: before },
      after: { adminNote: body.adminNote || null },
    });
    res.json({ ok: true });
  }),
);

router.post(
  '/orders/:id/settle-cod',
  requirePerm('payments.manage'),
  asyncRoute(async (req, res) => {
    const id = parse(uuidSchema, req.params.id);
    const result = await withUserDb(req, async (db) => {
      const orderResult = await db.query<{
        id: string;
        order_number: string;
        profile_id: string | null;
        status: string;
        payment_status: string;
        payment_method: string;
        total: number;
      }>(
        `select id, order_number, profile_id, status, payment_status, payment_method, total
           from orders where id = $1 for update`,
        [id],
      );
      const order = orderResult.rows[0];
      if (!order) throw notFound('Order not found');
      if (order.payment_method !== 'cod') throw unprocessable('Only cash-on-delivery orders can be settled here.');
      if (['cancelled', 'returned', 'refunded'].includes(order.status)) {
        throw conflict('This order is closed and cannot take a cash payment.');
      }
      if (order.payment_status === 'paid') return { alreadyPaid: true, orderNumber: order.order_number };

      const actorId = req.auth?.id ?? null;
      const reference = `COD-${order.order_number}`;
      await db.query(
        `insert into payments (order_id, provider, provider_ref, amount, currency, status, verified_at, raw_response)
         values ($1,'cod',$2,$3,'ETB','successful',now(),$4::jsonb)
         on conflict (provider, provider_ref) do update set status = 'successful', verified_at = now(),
           failure_reason = null, updated_at = now()`,
        [order.id, reference, Number(order.total), JSON.stringify({ source: 'staff settlement', actorId })],
      );
      await db.query(
        `update orders set payment_status = 'paid', updated_at = now() where id = $1`,
        [order.id],
      );
      await commitOrderStock(db, order.id, actorId);
      await addHistory(db, order.id, order.status, 'Cash on delivery collected and recorded by finance.', actorId);
      await notifyCustomer(db, order.profile_id, order.id, order.order_number, 'confirmed');
      return { alreadyPaid: false, orderNumber: order.order_number, reference };
    });

    if (!result.alreadyPaid) {
      await recordAudit(req, {
        action: 'order.cod.settle',
        entityType: 'order',
        entityId: id,
        after: { amount: result.orderNumber },
      });
    }
    res.json(result);
  }),
);

const shipmentSchema = z.object({
  carrier: z.string().trim().min(1).max(120),
  trackingNumber: z.string().trim().max(120).optional(),
  trackingUrl: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(500).optional(),
  status: z
    .enum(['pending', 'label_created', 'in_transit', 'out_for_delivery', 'delivered', 'failed', 'returned'])
    .optional()
    .default('label_created'),
});

router.post(
  '/orders/:id/shipments',
  requirePerm('orders.update'),
  asyncRoute(async (req, res) => {
    const id = parse(uuidSchema, req.params.id);
    const body = parse(shipmentSchema, req.body);
    const shipmentId = await withUserDb(req, async (db) => {
      const order = await db.query<{ order_number: string; status: string }>(
        'select order_number, status from orders where id = $1',
        [id],
      );
      if (!order.rows[0]) throw notFound('Order not found');
      if (['cancelled', 'returned', 'refunded'].includes(order.rows[0].status)) {
        throw conflict('This order is closed and cannot be shipped.');
      }
      const result = await db.query<{ id: string }>(
        `insert into shipments (order_id, carrier, tracking_number, tracking_url, status, shipped_at, notes)
         values ($1,$2,$3,$4,$5, case when $5 in ('in_transit','out_for_delivery','delivered') then now() else null end, $6)
         returning id`,
        [
          id,
          body.carrier,
          body.trackingNumber || null,
          body.trackingUrl || null,
          body.status,
          body.notes || null,
        ],
      );
      return result.rows[0].id;
    });
    await recordAudit(req, {
      action: 'order.shipment.create',
      entityType: 'order',
      entityId: id,
      after: { shipmentId, carrier: body.carrier, status: body.status },
    });
    res.status(201).json({ id: shipmentId });
  }),
);

const updateShipmentSchema = z.object({
  carrier: z.string().trim().min(1).max(120).optional(),
  trackingNumber: z.string().trim().max(120).optional().or(z.literal('')),
  trackingUrl: z.string().trim().max(500).optional().or(z.literal('')),
  notes: z.string().trim().max(500).optional().or(z.literal('')),
  status: z
    .enum(['pending', 'label_created', 'in_transit', 'out_for_delivery', 'delivered', 'failed', 'returned'])
    .optional(),
});

router.patch(
  '/orders/:id/shipments/:shipmentId',
  requirePerm('orders.update'),
  asyncRoute(async (req, res) => {
    const id = parse(uuidSchema, req.params.id);
    const shipmentId = parse(uuidSchema, req.params.shipmentId);
    const body = parse(updateShipmentSchema, req.body);
    await withUserDb(req, async (db) => {
      const existing = await db.query('select 1 from shipments where id = $1 and order_id = $2', [
        shipmentId,
        id,
      ]);
      if (!existing.rows[0]) throw notFound('Shipment not found');
      const updates: string[] = [];
      const params: unknown[] = [];
      let index = 1;
      const set = (column: string, value: unknown) => {
        updates.push(`${column} = $${index}`);
        params.push(value);
        index += 1;
      };
      if (body.carrier !== undefined) set('carrier', body.carrier);
      if (body.trackingNumber !== undefined) set('tracking_number', body.trackingNumber || null);
      if (body.trackingUrl !== undefined) set('tracking_url', body.trackingUrl || null);
      if (body.notes !== undefined) set('notes', body.notes || null);
      if (body.status !== undefined) {
        set('status', body.status);
        if (body.status === 'in_transit') updates.push('shipped_at = coalesce(shipped_at, now())');
        if (body.status === 'delivered') {
          updates.push('delivered_at = coalesce(delivered_at, now())');
          await db.query(
            `update orders set delivered_at = coalesce(delivered_at, now()), updated_at = now() where id = $1`,
            [id],
          );
        }
      }
      if (updates.length === 0) throw badRequest('No changes were provided.');
      params.push(shipmentId);
      await db.query(
        `update shipments set ${updates.join(', ')}, updated_at = now() where id = $${index}`,
        params,
      );
    });
    await recordAudit(req, {
      action: 'order.shipment.update',
      entityType: 'shipment',
      entityId: shipmentId,
      after: body,
    });
    res.json({ ok: true });
  }),
);

const refundSchema = z.object({
  amount: z.coerce.number().int().min(1),
  reason: z.string().trim().min(3).max(500),
  providerRef: z.string().trim().max(160).optional(),
});

router.post(
  '/orders/:id/refunds',
  requirePerm('orders.refund'),
  asyncRoute(async (req, res) => {
    const id = parse(uuidSchema, req.params.id);
    const body = parse(refundSchema, req.body);
    const refundId = await withUserDb(req, async (db) => {
      const order = await db.query<{ total: number; payment_status: string; order_number: string }>(
        'select total, payment_status, order_number from orders where id = $1',
        [id],
      );
      if (!order.rows[0]) throw notFound('Order not found');
      if (!['paid', 'partially_refunded'].includes(order.rows[0].payment_status)) {
        throw unprocessable('Only paid orders can be refunded.');
      }
      const existing = await db.query<{ amount: number }>(
        `select coalesce(sum(amount), 0)::bigint as amount from refunds
          where order_id = $1 and status in ('pending','processing','succeeded')`,
        [id],
      );
      const refundable = Number(order.rows[0].total) - toNumber(existing.rows[0]?.amount);
      if (body.amount > refundable) {
        throw unprocessable(`At most ${(refundable / 100).toFixed(2)} ETB can still be refunded.`);
      }
      const payment = await db.query<{ id: string }>(
        `select id from payments where order_id = $1 and status = 'successful'
          order by created_at desc limit 1`,
        [id],
      );
      const result = await db.query<{ id: string }>(
        `insert into refunds (order_id, payment_id, amount, reason, status, provider_ref, created_by)
         values ($1,$2,$3,$4,'pending',$5,$6) returning id`,
        [
          id,
          payment.rows[0]?.id ?? null,
          body.amount,
          body.reason,
          body.providerRef || null,
          req.auth?.id ?? null,
        ],
      );
      return result.rows[0].id;
    });
    await recordAudit(req, {
      action: 'order.refund.create',
      entityType: 'order',
      entityId: id,
      after: { refundId, amount: body.amount, reason: body.reason },
    });
    res.status(201).json({ id: refundId });
  }),
);

const refundStatusSchema = z.object({
  status: z.enum(['processing', 'succeeded', 'failed']),
  providerRef: z.string().trim().max(160).optional(),
  note: z.string().trim().max(500).optional(),
});

router.patch(
  '/refunds/:id',
  requirePerm('payments.manage'),
  asyncRoute(async (req, res) => {
    const refundId = parse(uuidSchema, req.params.id);
    const body = parse(refundStatusSchema, req.body);
    const result = await withUserDb(req, async (db) => {
      const refund = await db.query<{
        id: string;
        order_id: string;
        amount: number;
        status: string;
        order_total: number;
        payment_status: string;
        order_number: string;
        order_status: string;
      }>(
        `select r.id, r.order_id, r.amount, r.status, o.total as order_total,
                o.payment_status, o.order_number, o.status as order_status
           from refunds r join orders o on o.id = r.order_id
          where r.id = $1 for update`,
        [refundId],
      );
      const row = refund.rows[0];
      if (!row) throw notFound('Refund not found');
      if (row.status === 'succeeded') throw conflict('This refund has already been completed.');
      if (row.status === 'failed' && body.status !== 'processing') {
        throw conflict('A failed refund cannot be completed without starting a new request.');
      }

      await db.query(
        `update refunds set status = $2, provider_ref = coalesce($3, provider_ref),
                processed_at = case when $2 = 'succeeded' then now() else processed_at end
          where id = $1`,
        [refundId, body.status, body.providerRef || null],
      );

      if (body.status === 'succeeded') {
        const totalRefunded = await db.query<{ amount: number }>(
          `select coalesce(sum(amount), 0)::bigint as amount from refunds
            where order_id = $1 and status = 'succeeded'`,
          [row.order_id],
        );
        const refunded = toNumber(totalRefunded.rows[0]?.amount);
        const fullyRefunded = refunded >= Number(row.order_total);
        await db.query(
          `update orders
              set payment_status = $2,
                  status = case when $3 then 'refunded' else status end,
                  refunded_at = case when $3 then now() else refunded_at end,
                  updated_at = now()
            where id = $1`,
          [row.order_id, fullyRefunded ? 'refunded' : 'partially_refunded', fullyRefunded],
        );
        await db.query(
          `update payments set status = 'refunded', updated_at = now()
            where order_id = $1 and status = 'successful' and $2`,
          [row.order_id, fullyRefunded],
        );
        await addHistory(
          db,
          row.order_id,
          fullyRefunded ? 'refunded' : row.order_status,
          body.note?.trim() ||
            `Refund of ${(Number(row.amount) / 100).toFixed(2)} ETB completed${body.providerRef ? ` (ref ${body.providerRef})` : ''}.`,
          req.auth?.id ?? null,
        );
      }

      return { orderId: row.order_id, orderNumber: row.order_number, status: body.status };
    });
    await recordAudit(req, {
      action: 'refund.status.update',
      entityType: 'refund',
      entityId: refundId,
      after: body,
    });
    res.json(result);
  }),
);

const returnDecisionSchema = z.object({
  status: z.enum(['approved', 'rejected', 'received', 'refunded']),
  adminNote: z.string().trim().max(1000).optional(),
  restock: z.boolean().optional().default(false),
});

router.patch(
  '/orders/:id/returns/:returnId',
  requirePerm('orders.update'),
  asyncRoute(async (req, res) => {
    const id = parse(uuidSchema, req.params.id);
    const returnId = parse(uuidSchema, req.params.returnId);
    const body = parse(returnDecisionSchema, req.body);
    if (body.status === 'refunded' && !hasPerm(req, 'orders.refund')) {
      throw forbidden('Refund permission is required to close a return as refunded.');
    }

    await withUserDb(req, async (db) => {
      const existing = await db.query<{
        id: string;
        order_item_id: string | null;
        status: string;
      }>('select id, order_item_id, status from returns where id = $1 and order_id = $2', [
        returnId,
        id,
      ]);
      const entry = existing.rows[0];
      if (!entry) throw notFound('Return not found');
      if (['refunded', 'cancelled'].includes(entry.status)) throw conflict('This return is already closed.');

      await db.query(
        `update returns
            set status = $2, admin_note = coalesce($3, admin_note),
                resolved_at = case when $2 in ('rejected','refunded') then now() else resolved_at end,
                updated_at = now()
          where id = $1`,
        [returnId, body.status, body.adminNote || null],
      );

      if (body.status === 'received' && body.restock) {
        if (!hasPerm(req, 'inventory.write') && !hasPerm(req, 'orders.refund')) {
          throw forbidden('Inventory permission is required to restock returned items.');
        }
        const lines = entry.order_item_id
          ? await db.query<{ variant_id: string | null; quantity: number; label: string }>(
              `select variant_id, quantity, product_name as label from order_items where id = $1`,
              [entry.order_item_id],
            )
          : await db.query<{ variant_id: string | null; quantity: number; label: string }>(
              `select variant_id, quantity, product_name as label from order_items where order_id = $1`,
              [id],
            );
        for (const line of lines.rows) {
          if (!line.variant_id) continue;
          await adjustStock(db, {
            variantId: line.variant_id,
            delta: Number(line.quantity),
            reason: 'return',
            note: `Return received for order`,
            createdBy: req.auth?.id ?? null,
            referenceType: 'order',
            referenceId: id,
          });
        }
      }
    });

    await recordAudit(req, {
      action: 'order.return.update',
      entityType: 'return',
      entityId: returnId,
      after: body,
    });
    res.json({ ok: true });
  }),
);

router.get(
  '/returns',
  requirePerm('orders.read'),
  asyncRoute(async (req, res) => {
    const { page, pageSize, offset } = pageParams(req.query, { page: 1, pageSize: 25 });
    const status = parse(
      z.enum(['all', 'requested', 'approved', 'rejected', 'received', 'refunded', 'cancelled']).optional().default('all'),
      req.query.status,
    );
    const data = await withUserDb(req, async (db) => {
      const count = await db.query<{ total: number }>(
        `select count(*)::int as total from returns where ($1::text = 'all' or status = $1)`,
        [status],
      );
      const rows = await db.query<{
        id: string;
        order_id: string;
        order_number: string;
        customer_name: string;
        reason: string;
        status: string;
        created_at: Date;
      }>(
        `select r.id, r.order_id, o.order_number, o.customer_name, r.reason, r.status, r.created_at
           from returns r join orders o on o.id = r.order_id
          where ($1::text = 'all' or r.status = $1)
          order by r.created_at desc
          limit $2 offset $3`,
        [status, pageSize, offset],
      );
      return { total: toNumber(count.rows[0]?.total), rows: rows.rows };
    });
    res.json({
      returns: data.rows.map((entry) => ({
        id: entry.id,
        orderId: entry.order_id,
        orderNumber: entry.order_number,
        customerName: entry.customer_name,
        reason: entry.reason,
        status: entry.status,
        createdAt: new Date(entry.created_at).toISOString(),
      })),
      pagination: paginationMeta(page, pageSize, data.total),
    });
  }),
);

router.get(
  '/refunds',
  requirePerm('payments.read'),
  asyncRoute(async (req, res) => {
    const { page, pageSize, offset } = pageParams(req.query, { page: 1, pageSize: 25 });
    const status = parse(
      z.enum(['all', 'pending', 'processing', 'succeeded', 'failed']).optional().default('all'),
      req.query.status,
    );
    const data = await withUserDb(req, async (db) => {
      const count = await db.query<{ total: number }>(
        `select count(*)::int as total from refunds where ($1::text = 'all' or status = $1)`,
        [status],
      );
      const rows = await db.query<{
        id: string;
        order_id: string;
        order_number: string;
        customer_name: string;
        amount: number;
        reason: string;
        status: string;
        created_at: Date;
      }>(
        `select r.id, r.order_id, o.order_number, o.customer_name, r.amount, r.reason, r.status, r.created_at
           from refunds r join orders o on o.id = r.order_id
          where ($1::text = 'all' or r.status = $1)
          order by r.created_at desc
          limit $2 offset $3`,
        [status, pageSize, offset],
      );
      return {
        total: toNumber(count.rows[0]?.total),
        rows: rows.rows.map((entry) => ({
          id: entry.id,
          orderId: entry.order_id,
          orderNumber: entry.order_number,
          customerName: entry.customer_name,
          amount: toNumber(entry.amount),
          reason: entry.reason,
          status: entry.status,
          createdAt: new Date(entry.created_at).toISOString(),
        })),
      };
    });
    res.json({ refunds: data.rows, pagination: paginationMeta(page, pageSize, data.total) });
  }),
);

router.get(
  '/orders/:id/invoice',
  requirePerm('orders.read'),
  asyncRoute(async (req, res) => {
    const id = parse(uuidSchema, req.params.id);
    const order = await withUserDb(req, (db) => getOrderDetail(db, id));
    const store = await getSetting(await getDatabase(), 'store', {
      name: 'Nile Mart',
      legalName: 'Nile Mart',
      email: 'support@nilemart.et',
      phone: '+251 911 000 000',
      address: 'Bole Road, Addis Ababa, Ethiopia',
      city: 'Addis Ababa',
      country: 'Ethiopia',
    });
    const number = invoiceNumber(order);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Content-Disposition', `inline; filename="${number}.html"`);
    res.send(buildInvoiceHtml(order, store));
  }),
);

export default router;
