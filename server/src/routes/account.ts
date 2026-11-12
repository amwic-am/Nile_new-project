import { Router } from 'express';
import { z } from 'zod';
import type { Sql } from '../db/index.js';
import { getDatabase } from '../db/index.js';
import { requireAuth, publicUser } from '../lib/auth.js';
import { notFound, unprocessable } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { asyncRoute, withUserDb } from '../lib/request.js';
import { pageParams, parse } from '../lib/validation.js';
import { getOrderDetail } from '../services/orders.js';
import { getSetting } from '../services/settings.js';

const router = Router();

const idSchema = z.string().uuid('Invalid identifier');

const phoneSchema = z
  .string()
  .trim()
  .min(7, 'Enter a valid phone number')
  .max(30, 'Enter a valid phone number')
  .regex(/^[+0-9 ()-]+$/, 'Enter a valid phone number');

const profileSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name').max(100),
  phone: z
    .string()
    .trim()
    .max(30)
    .regex(/^[+0-9 ()-]*$/, 'Enter a valid phone number')
    .optional()
    .nullable(),
  marketingOptIn: z.boolean().optional(),
  notificationPrefs: z
    .object({
      order_updates: z.boolean().optional(),
      promotions: z.boolean().optional(),
      newsletter: z.boolean().optional(),
    })
    .optional(),
});

const addressSchema = z.object({
  label: z.string().trim().min(1, 'Give this address a name').max(40),
  fullName: z.string().trim().min(2, 'Enter the recipient name').max(100),
  phone: phoneSchema,
  line1: z.string().trim().min(3, 'Enter the street address').max(200),
  line2: z.string().trim().max(200).optional().nullable(),
  city: z.string().trim().min(2, 'Enter the city').max(80),
  region: z.string().trim().max(80).optional().default(''),
  postalCode: z.string().trim().max(20).optional().nullable(),
  country: z.string().trim().length(2).default('ET'),
  isDefault: z.boolean().optional().default(false),
});

type AddressRow = {
  id: string;
  label: string;
  full_name: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  region: string;
  postal_code: string | null;
  country: string;
  is_default: boolean;
  created_at: Date;
};

function shapeAddress(row: AddressRow) {
  return {
    id: row.id,
    label: row.label,
    fullName: row.full_name,
    phone: row.phone,
    line1: row.line1,
    line2: row.line2,
    city: row.city,
    region: row.region,
    postalCode: row.postal_code,
    country: row.country,
    isDefault: row.is_default,
  };
}

const addressColumns = `id, label, full_name, phone, line1, line2, city, region, postal_code, country,
  is_default, created_at`;

async function listAddresses(db: Sql, profileId: string) {
  const result = await db.query<AddressRow>(
    `select ${addressColumns} from addresses where profile_id = $1
      order by is_default desc, created_at desc`,
    [profileId],
  );
  return result.rows.map(shapeAddress);
}

router.get(
  '/account/summary',
  requireAuth,
  asyncRoute(async (req, res) => {
    const user = req.auth!;
    const summary = await withUserDb(req, async (db) => {
      const [orders, unread, wishlist, reviews, addresses, recent] = await Promise.all([
        db.query<{
          total: number;
          active: number;
          delivered: number;
          cancelled: number;
        }>(
          `select count(*)::int as total,
                  count(*) filter (where status in ('pending', 'awaiting_payment', 'paid', 'confirmed',
                    'processing', 'packed', 'shipped', 'out_for_delivery'))::int as active,
                  count(*) filter (where status = 'delivered')::int as delivered,
                  count(*) filter (where status in ('cancelled', 'returned', 'refunded'))::int as cancelled
             from orders where profile_id = $1`,
          [user.id],
        ),
        db.query<{ total: number }>(
          `select count(*)::int as total from notifications
            where profile_id = $1 and not is_read`,
          [user.id],
        ),
        db.query<{ total: number }>(
          `select count(*)::int as total
             from wishlist_items wi join wishlists w on w.id = wi.wishlist_id
            where w.profile_id = $1`,
          [user.id],
        ),
        db.query<{ total: number }>(
          `select count(*)::int as total from reviews where profile_id = $1`,
          [user.id],
        ),
        db.query<AddressRow>(
          `select ${addressColumns} from addresses where profile_id = $1
            order by is_default desc, created_at desc`,
          [user.id],
        ),
        db.query<{
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
             from orders o where o.profile_id = $1
            order by o.placed_at desc limit 3`,
          [user.id],
        ),
      ]);

      return {
        stats: {
          orders: Number(orders.rows[0]?.total ?? 0),
          activeOrders: Number(orders.rows[0]?.active ?? 0),
          deliveredOrders: Number(orders.rows[0]?.delivered ?? 0),
          cancelledOrders: Number(orders.rows[0]?.cancelled ?? 0),
          unreadNotifications: Number(unread.rows[0]?.total ?? 0),
          wishlistItems: Number(wishlist.rows[0]?.total ?? 0),
          reviews: Number(reviews.rows[0]?.total ?? 0),
          addresses: addresses.rows.length,
        },
        defaultAddress: addresses.rows[0] ? shapeAddress(addresses.rows[0]) : null,
        recentOrders: recent.rows.map((order) => ({
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
      };
    });

    res.json({ ...summary, memberSince: user.createdAt });
  }),
);

router.patch(
  '/account/profile',
  requireAuth,
  asyncRoute(async (req, res) => {
    const user = req.auth!;
    const body = parse(profileSchema, req.body);
    const prefs = { ...user.notificationPrefs, ...(body.notificationPrefs ?? {}) };

    const updated = await withUserDb(req, async (db) => {
      const result = await db.query<{
        full_name: string;
        phone: string | null;
        marketing_opt_in: boolean;
        notification_prefs: Record<string, boolean>;
      }>(
        `update profiles
            set full_name = $2, phone = $3, marketing_opt_in = $4,
                notification_prefs = $5::jsonb, updated_at = now()
          where id = $1
          returning full_name, phone, marketing_opt_in, notification_prefs`,
        [user.id, body.fullName, body.phone || null, body.marketingOptIn ?? user.marketingOptIn, JSON.stringify(prefs)],
      );
      return result.rows[0];
    });
    if (!updated) throw notFound('Account not found');

    if (body.marketingOptIn != null && body.marketingOptIn !== user.marketingOptIn) {
      try {
        const db = await getDatabase();
        if (body.marketingOptIn) {
          await db.query(
            `insert into newsletter_subscribers (email, status, source, confirmed_at)
             values ($1, 'subscribed', 'account', now())
             on conflict (lower(email)) do update
               set status = 'subscribed', confirmed_at = now()`,
            [user.email],
          );
        } else {
          await db.query(
            `update newsletter_subscribers set status = 'unsubscribed'
              where lower(email) = lower($1)`,
            [user.email],
          );
        }
      } catch (error) {
        logger.warn('Newsletter preference could not be synced', { error: String(error) });
      }
    }

    res.json({
      user: publicUser({
        ...user,
        fullName: updated.full_name,
        phone: updated.phone,
        marketingOptIn: updated.marketing_opt_in,
        notificationPrefs: updated.notification_prefs ?? {},
      }),
      message: 'Your profile has been updated.',
    });
  }),
);

router.get(
  '/account/addresses',
  requireAuth,
  asyncRoute(async (req, res) => {
    const addresses = await withUserDb(req, (db) => listAddresses(db, req.auth!.id));
    res.json({ addresses });
  }),
);

router.post(
  '/account/addresses',
  requireAuth,
  asyncRoute(async (req, res) => {
    const body = parse(addressSchema, req.body);
    const user = req.auth!;

    const address = await withUserDb(req, async (db) => {
      const count = await db.query<{ total: number }>(
        'select count(*)::int as total from addresses where profile_id = $1',
        [user.id],
      );
      const total = Number(count.rows[0]?.total ?? 0);
      if (total >= 10) throw unprocessable('You can save up to 10 addresses. Remove one to add another.');

      const makeDefault = body.isDefault || total === 0;
      if (makeDefault) {
        await db.query('update addresses set is_default = false where profile_id = $1 and is_default', [
          user.id,
        ]);
      }
      const result = await db.query<AddressRow>(
        `insert into addresses (profile_id, label, full_name, phone, line1, line2, city, region,
                                postal_code, country, is_default)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         returning ${addressColumns}`,
        [
          user.id,
          body.label,
          body.fullName,
          body.phone,
          body.line1,
          body.line2 || null,
          body.city,
          body.region,
          body.postalCode || null,
          body.country.toUpperCase(),
          makeDefault,
        ],
      );
      return result.rows[0]!;
    });

    res.status(201).json({ address: shapeAddress(address), message: 'Address saved.' });
  }),
);

router.patch(
  '/account/addresses/:id',
  requireAuth,
  asyncRoute(async (req, res) => {
    const id = parse(idSchema, req.params.id);
    const body = parse(addressSchema, req.body);
    const user = req.auth!;

    const address = await withUserDb(req, async (db) => {
      const existing = await db.query<{ id: string; is_default: boolean }>(
        'select id, is_default from addresses where id = $1 and profile_id = $2 for update',
        [id, user.id],
      );
      if (!existing.rows[0]) throw notFound('Address not found');

      if (body.isDefault && !existing.rows[0].is_default) {
        await db.query('update addresses set is_default = false where profile_id = $1 and is_default', [
          user.id,
        ]);
      }
      const result = await db.query<AddressRow>(
        `update addresses
            set label = $3, full_name = $4, phone = $5, line1 = $6, line2 = $7, city = $8,
                region = $9, postal_code = $10, country = $11, is_default = $12, updated_at = now()
          where id = $1 and profile_id = $2
          returning ${addressColumns}`,
        [
          id,
          user.id,
          body.label,
          body.fullName,
          body.phone,
          body.line1,
          body.line2 || null,
          body.city,
          body.region,
          body.postalCode || null,
          body.country.toUpperCase(),
          body.isDefault || existing.rows[0].is_default,
        ],
      );
      return result.rows[0]!;
    });

    res.json({ address: shapeAddress(address), message: 'Address updated.' });
  }),
);

router.delete(
  '/account/addresses/:id',
  requireAuth,
  asyncRoute(async (req, res) => {
    const id = parse(idSchema, req.params.id);
    const user = req.auth!;

    await withUserDb(req, async (db) => {
      const existing = await db.query<{ id: string; is_default: boolean }>(
        'select id, is_default from addresses where id = $1 and profile_id = $2 for update',
        [id, user.id],
      );
      const row = existing.rows[0];
      if (!row) throw notFound('Address not found');

      await db.query('delete from addresses where id = $1 and profile_id = $2', [id, user.id]);

      if (row.is_default) {
        await db.query(
          `update addresses set is_default = true
            where id = (select id from addresses where profile_id = $1
                         order by created_at desc limit 1)
              and not exists (select 1 from addresses where profile_id = $1 and is_default)`,
          [user.id],
        );
      }
    });

    res.json({ ok: true, message: 'Address removed.' });
  }),
);

router.get(
  '/account/notifications',
  requireAuth,
  asyncRoute(async (req, res) => {
    const user = req.auth!;
    const { page, pageSize, offset } = pageParams(req.query);
    const query = parse(
      z.object({ filter: z.enum(['all', 'unread']).optional().default('all') }),
      req.query,
    );
    const unreadOnly = query.filter === 'unread';

    const data = await withUserDb(req, async (db) => {
      const [total, unread, rows] = await Promise.all([
        db.query<{ total: number }>(
          `select count(*)::int as total from notifications
            where profile_id = $1 ${unreadOnly ? 'and not is_read' : ''}`,
          [user.id],
        ),
        db.query<{ total: number }>(
          'select count(*)::int as total from notifications where profile_id = $1 and not is_read',
          [user.id],
        ),
        db.query<{
          id: string;
          type: string;
          title: string;
          body: string;
          link: string | null;
          is_read: boolean;
          created_at: Date;
        }>(
          `select id, type, title, body, link, is_read, created_at
             from notifications
            where profile_id = $1 ${unreadOnly ? 'and not is_read' : ''}
            order by created_at desc
            limit $2 offset $3`,
          [user.id, pageSize, offset],
        ),
      ]);
      return {
        total: Number(total.rows[0]?.total ?? 0),
        unreadCount: Number(unread.rows[0]?.total ?? 0),
        rows: rows.rows,
      };
    });

    res.json({
      notifications: data.rows.map((row) => ({
        id: row.id,
        type: row.type,
        title: row.title,
        body: row.body,
        link: row.link,
        isRead: row.is_read,
        createdAt: new Date(row.created_at).toISOString(),
      })),
      unreadCount: data.unreadCount,
      pagination: {
        page,
        pageSize,
        total: data.total,
        totalPages: Math.max(1, Math.ceil(data.total / pageSize)),
      },
    });
  }),
);

router.post(
  '/account/notifications/read-all',
  requireAuth,
  asyncRoute(async (req, res) => {
    const user = req.auth!;
    const result = await withUserDb(req, (db) =>
      db.query(
        'update notifications set is_read = true where profile_id = $1 and not is_read',
        [user.id],
      ),
    );
    res.json({ ok: true, marked: result.rowCount, unreadCount: 0 });
  }),
);

router.post(
  '/account/notifications/:id/read',
  requireAuth,
  asyncRoute(async (req, res) => {
    const id = parse(idSchema, req.params.id);
    const user = req.auth!;
    const data = await withUserDb(req, async (db) => {
      const updated = await db.query(
        'update notifications set is_read = true where id = $1 and profile_id = $2',
        [id, user.id],
      );
      if (updated.rowCount === 0) throw notFound('Notification not found');
      const unread = await db.query<{ total: number }>(
        'select count(*)::int as total from notifications where profile_id = $1 and not is_read',
        [user.id],
      );
      return Number(unread.rows[0]?.total ?? 0);
    });
    res.json({ ok: true, unreadCount: data });
  }),
);

router.get(
  '/account/reviews',
  requireAuth,
  asyncRoute(async (req, res) => {
    const user = req.auth!;
    const { page, pageSize, offset } = pageParams(req.query, { page: 1, pageSize: 10 });

    const data = await withUserDb(req, async (db) => {
      const [counts, rows, pending] = await Promise.all([
        db.query<{ total: number; pending: number; approved: number }>(
          `select count(*)::int as total,
                  count(*) filter (where status = 'pending')::int as pending,
                  count(*) filter (where status = 'approved')::int as approved
             from reviews where profile_id = $1`,
          [user.id],
        ),
        db.query<{
          id: string;
          rating: number;
          title: string;
          body: string;
          status: string;
          admin_reply: string | null;
          created_at: Date;
          product_name: string;
          product_slug: string;
          image_url: string | null;
        }>(
          `select r.id, r.rating, r.title, r.body, r.status, r.admin_reply, r.created_at,
                  p.name as product_name, p.slug as product_slug,
                  (select pi.url from product_images pi where pi.product_id = p.id
                    order by pi.position asc limit 1) as image_url
             from reviews r join products p on p.id = r.product_id
            where r.profile_id = $1
            order by r.created_at desc
            limit $2 offset $3`,
          [user.id, pageSize, offset],
        ),
        db.query<{
          product_id: string;
          name: string;
          slug: string;
          image_url: string | null;
          order_number: string;
          delivered_at: Date | null;
        }>(
          `select distinct on (oi.product_id)
                  oi.product_id, oi.product_name as name, oi.product_slug as slug, oi.image_url,
                  o.order_number, o.delivered_at
             from order_items oi join orders o on o.id = oi.order_id
            where o.profile_id = $1 and o.status = 'delivered' and oi.product_id is not null
              and not exists (select 1 from reviews r where r.product_id = oi.product_id and r.profile_id = $1)
            order by oi.product_id, o.delivered_at desc nulls last
            limit 6`,
          [user.id],
        ),
      ]);
      return { counts: counts.rows[0], rows: rows.rows, pending: pending.rows };
    });

    res.json({
      reviews: data.rows.map((row) => ({
        id: row.id,
        rating: Number(row.rating),
        title: row.title,
        body: row.body,
        status: row.status,
        adminReply: row.admin_reply,
        createdAt: new Date(row.created_at).toISOString(),
        product: {
          name: row.product_name,
          slug: row.product_slug,
          imageUrl: row.image_url,
        },
      })),
      pending: data.pending.map((row) => ({
        productId: row.product_id,
        name: row.name,
        slug: row.slug,
        imageUrl: row.image_url,
        orderNumber: row.order_number,
        deliveredAt: row.delivered_at ? new Date(row.delivered_at).toISOString() : null,
      })),
      counts: {
        total: Number(data.counts?.total ?? 0),
        pending: Number(data.counts?.pending ?? 0),
        approved: Number(data.counts?.approved ?? 0),
      },
      pagination: {
        page,
        pageSize,
        total: Number(data.counts?.total ?? 0),
        totalPages: Math.max(1, Math.ceil(Number(data.counts?.total ?? 0) / pageSize)),
      },
    });
  }),
);

/* ----------------------------------------------------------------- invoices */

const STATUS_LABELS: Record<string, string> = {
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

const PAYMENT_LABELS: Record<string, string> = {
  unpaid: 'Payment due',
  awaiting_payment: 'Awaiting payment',
  paid: 'Paid in full',
  failed: 'Payment failed',
  partially_refunded: 'Partially refunded',
  refunded: 'Refunded',
};

function escapeHtml(value: unknown): string {
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

router.get(
  '/account/orders/:identifier/invoice',
  requireAuth,
  asyncRoute(async (req, res) => {
    const identifier = parse(z.string().trim().min(4).max(60), req.params.identifier);
    const user = req.auth!;
    const order = await withUserDb(req, (db) =>
      getOrderDetail(db, identifier, { profileId: user.id }),
    );
    const store = await getSetting(await getDatabase(), 'store', {
      name: 'Nile Mart',
      legalName: 'Nile Mart',
      email: 'support@nilemart.et',
      phone: '+251 911 000 000',
      address: 'Bole Road, Addis Ababa, Ethiopia',
      city: 'Addis Ababa',
      country: 'Ethiopia',
    });

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

    const invoiceNumber = `INV-${order.orderNumber}`;
    const paymentLabel = PAYMENT_LABELS[order.paymentStatus] ?? order.paymentStatus;
    const orderLabel = STATUS_LABELS[order.status] ?? order.status.replace(/_/g, ' ');

    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${escapeHtml(invoiceNumber)} · ${escapeHtml(store.name)}</title>
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
        <p class="number">${escapeHtml(invoiceNumber)}</p>
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

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Content-Disposition', `inline; filename="${invoiceNumber}.html"`);
    res.send(html);
  }),
);

export default router;
