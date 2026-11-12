import { Router } from 'express';
import { z } from 'zod';
import { getDatabase } from '../db/index.js';
import { requireAuth } from '../lib/auth.js';
import { paymentReceivedEmail } from '../lib/emails.js';
import { badRequest, notFound } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { asyncRoute, withUserDb } from '../lib/request.js';
import { sendEmail } from '../lib/mailer.js';
import { parse, pageParams } from '../lib/validation.js';
import { cancelOrder, getOrderDetail } from '../services/orders.js';
import {
  finalizeChapaPayment,
  markChapaPaymentFailed,
  startChapaPayment,
  verifyChapaTransaction,
} from '../services/payments.js';

const router = Router();

const identifierSchema = z
  .string()
  .trim()
  .min(4, 'Invalid order reference')
  .max(40, 'Invalid order reference');
const idSchema = z.string().uuid('Invalid order id');
const cancelSchema = z.object({ reason: z.string().trim().max(500).optional() });
const paymentSchema = z.object({ provider: z.enum(['chapa']) });
const referenceSchema = z.string().trim().min(4).max(120);
const listQuerySchema = z.object({
  status: z.enum(['all', 'active', 'completed', 'cancelled']).optional().default('all'),
  q: z.string().trim().max(40).optional(),
});

router.get(
  '/orders',
  requireAuth,
  asyncRoute(async (req, res) => {
    const user = req.auth!;
    const { page, pageSize, offset } = pageParams(req.query);
    const filters = parse(listQuerySchema, req.query);
    const search = filters.q ? `%${filters.q}%` : null;
    const data = await withUserDb(req, async (db) => {
      const count = await db.query<{ total: number }>(
        `select count(*)::int as total
           from orders o
          where o.profile_id = $1
            and ($2::text = 'all'
              or ($2::text = 'active' and o.status in ('pending', 'awaiting_payment', 'paid', 'confirmed',
                    'processing', 'packed', 'shipped', 'out_for_delivery'))
              or ($2::text = 'completed' and o.status = 'delivered')
              or ($2::text = 'cancelled' and o.status in ('cancelled', 'returned', 'refunded')))
            and ($3::text is null or o.order_number ilike $3)`,
        [user.id, filters.status, search],
      );
      const rows = await db.query<{
        id: string;
        order_number: string;
        status: string;
        payment_status: string;
        payment_method: string;
        total: number;
        placed_at: Date;
        item_count: number;
        image_url: string | null;
      }>(
        `select o.id, o.order_number, o.status, o.payment_status, o.payment_method, o.total, o.placed_at,
                (select count(*)::int from order_items oi where oi.order_id = o.id) as item_count,
                (select oi.image_url from order_items oi
                  where oi.order_id = o.id and oi.image_url is not null limit 1) as image_url
           from orders o
          where o.profile_id = $1
            and ($2::text = 'all'
              or ($2::text = 'active' and o.status in ('pending', 'awaiting_payment', 'paid', 'confirmed',
                    'processing', 'packed', 'shipped', 'out_for_delivery'))
              or ($2::text = 'completed' and o.status = 'delivered')
              or ($2::text = 'cancelled' and o.status in ('cancelled', 'returned', 'refunded')))
            and ($3::text is null or o.order_number ilike $3)
          order by o.placed_at desc
          limit $4 offset $5`,
        [user.id, filters.status, search, pageSize, offset],
      );
      return { total: Number(count.rows[0]?.total ?? 0), rows: rows.rows };
    });

    res.json({
      orders: data.rows.map((order) => ({
        id: order.id,
        orderNumber: order.order_number,
        status: order.status,
        paymentStatus: order.payment_status,
        paymentMethod: order.payment_method,
        total: Number(order.total),
        placedAt: new Date(order.placed_at).toISOString(),
        itemCount: Number(order.item_count),
        imageUrl: order.image_url,
      })),
      pagination: {
        page,
        pageSize,
        total: data.total,
        totalPages: Math.max(1, Math.ceil(data.total / pageSize)),
      },
    });
  }),
);

router.get(
  '/orders/:identifier',
  requireAuth,
  asyncRoute(async (req, res) => {
    const identifier = parse(identifierSchema, req.params.identifier);
    const user = req.auth!;
    const order = await withUserDb(req, (db) =>
      getOrderDetail(db, identifier, { profileId: user.id }),
    );
    res.json({ order });
  }),
);

router.post(
  '/orders/:id/cancel',
  requireAuth,
  asyncRoute(async (req, res) => {
    const orderId = parse(idSchema, req.params.id);
    const body = parse(cancelSchema, req.body);
    const user = req.auth!;
    const db = await getDatabase();
    const result = await cancelOrder(db, { orderId, profileId: user.id, reason: body.reason });
    res.json({ order: result });
  }),
);

router.post(
  '/orders/:id/payment',
  requireAuth,
  asyncRoute(async (req, res) => {
    const orderId = parse(idSchema, req.params.id);
    parse(paymentSchema, req.body);
    const user = req.auth!;
    const db = await getDatabase();
    const payment = await startChapaPayment(db, { orderId, profileId: user.id });
    res.status(201).json({ payment });
  }),
);

router.get(
  '/payments/chapa/verify/:reference',
  requireAuth,
  asyncRoute(async (req, res) => {
    const reference = parse(referenceSchema, req.params.reference);
    const user = req.auth!;
    const db = await getDatabase();
    const payment = await db.query<{
      id: string;
      order_id: string;
      status: string;
    }>(
      `select pay.id, pay.order_id, pay.status
         from payments pay join orders o on o.id = pay.order_id
        where pay.provider = 'chapa' and pay.provider_ref = $1 and o.profile_id = $2
        limit 1`,
      [reference, user.id],
    );
    const row = payment.rows[0];
    if (!row) throw notFound('Payment not found');
    if (row.status === 'successful') {
      res.json({ status: 'successful', orderId: row.order_id });
      return;
    }

    const verified = await verifyChapaTransaction(reference);
    if (verified.status === 'pending') {
      res.status(202).json({
        status: 'pending',
        message: 'The payment provider has not confirmed this payment yet.',
      });
      return;
    }
    if (verified.status === 'failed') {
      await markChapaPaymentFailed(db, { reference, reason: 'The payment provider reported a failed payment.' });
      res.json({
        status: 'failed',
        orderId: row.order_id,
        message: 'The payment was not completed. You can try again from your order page.',
      });
      return;
    }

    const finalized = await finalizeChapaPayment(db, {
      reference,
      verifiedAmount: verified.amount,
      verifiedCurrency: verified.currency,
      raw: verified.raw,
    });

    if (finalized.paymentStatus === 'paid') {
      const detail = await getOrderDetail(db, finalized.orderId).catch(() => null);
      if (detail) {
        await sendEmail(
          db,
          paymentReceivedEmail({
            to: detail.email,
            name: detail.customerName,
            orderNumber: detail.orderNumber,
            total: detail.total,
            orderUrl: `${req.protocol}://${req.get('host')}/account/orders/${detail.id}`,
          }),
        ).catch((error) => logger.warn('Payment email could not be queued', { error: String(error) }));
      }
    }

    res.json({
      status: finalized.paymentStatus === 'refund_required' ? 'refund_required' : 'successful',
      orderId: finalized.orderId,
      orderNumber: finalized.orderNumber,
      message:
        finalized.paymentStatus === 'refund_required'
          ? 'Your payment arrived after the order was cancelled. A refund has been requested.'
          : 'Payment verified. Thank you for shopping with Nile Mart.',
    });
  }),
);

export default router;
