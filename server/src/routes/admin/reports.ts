import { Router } from 'express';
import type { Request } from 'express';
import { z } from 'zod';
import type { Sql } from '../../db/index.js';
import { hasPerm, requirePerm } from '../../lib/auth.js';
import { forbidden } from '../../lib/errors.js';
import { asyncRoute, withUserDb } from '../../lib/request.js';
import { parse } from '../../lib/validation.js';
import {
  dateRange,
  paginationMeta,
  paging,
  sendCsv,
  toNumber,
  type CsvColumn,
} from './shared.js';

const router = Router();

const PAID = "('paid','partially_refunded')";
const LIVE = "('cancelled','refunded')";

function requireSalesAccess(req: Request) {
  if (!hasPerm(req, 'orders.read') && !hasPerm(req, 'payments.read')) {
    throw forbidden('You do not have access to sales data.');
  }
}

const topQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

interface SalesDay {
  date: string;
  orders: number;
  revenue: number;
  units: number;
  discounts: number;
  shipping: number;
}

async function loadSalesDays(db: Sql, from: string, to: string) {
  const result = await db.query<SalesDay & { revenue: string; discounts: string; shipping: string }>(
    `with per_order as (
       select (o.placed_at at time zone 'Africa/Addis_Ababa')::date as day,
              case when o.payment_status in ${PAID} then o.total else 0 end as revenue,
              case when o.payment_status in ${PAID} then o.discount else 0 end as discounts,
              case when o.payment_status in ${PAID} then o.shipping_fee else 0 end as shipping,
              (select coalesce(sum(oi.quantity), 0)::int
                 from order_items oi where oi.order_id = o.id) as units
         from orders o
        where o.placed_at >= $1 and o.placed_at <= $2
          and o.status not in ${LIVE}
     )
     select to_char(day, 'YYYY-MM-DD') as date,
            count(*)::int as orders,
            coalesce(sum(revenue), 0)::bigint as revenue,
            coalesce(sum(units), 0)::int as units,
            coalesce(sum(discounts), 0)::bigint as discounts,
            coalesce(sum(shipping), 0)::bigint as shipping
       from per_order
      group by day
      order by day`,
    [from, to],
  );
  return result.rows.map((row) => ({
    date: row.date,
    orders: toNumber(row.orders),
    revenue: toNumber(row.revenue),
    units: toNumber(row.units),
    discounts: toNumber(row.discounts),
    shipping: toNumber(row.shipping),
  }));
}

router.get(
  '/reports/sales',
  requirePerm('reports.view'),
  asyncRoute(async (req, res) => {
    requireSalesAccess(req);
    const range = dateRange(req, 30);
    const days = await withUserDb(req, (db) => loadSalesDays(db, range.from, range.to));

    const totals = await withUserDb(req, async (db) => {
      const orders = await db.query<{
        orders: number;
        revenue: number;
        units: number;
        discounts: number;
        shipping: number;
        refunds: number;
      }>(
        `select count(*)::int as orders,
                coalesce(sum(o.total) filter (where o.payment_status in ${PAID}), 0)::bigint as revenue,
                coalesce((select sum(oi.quantity)::int from order_items oi
                           join orders o2 on o2.id = oi.order_id
                          where o2.placed_at >= $1 and o2.placed_at <= $2
                            and o2.status not in ${LIVE}), 0) as units,
                coalesce(sum(o.discount) filter (where o.payment_status in ${PAID}), 0)::bigint as discounts,
                coalesce(sum(o.shipping_fee) filter (where o.payment_status in ${PAID}), 0)::bigint as shipping,
                coalesce((select sum(r.amount)::bigint from refunds r
                           where r.status = 'succeeded'
                             and r.created_at >= $1 and r.created_at <= $2), 0) as refunds
           from orders o
          where o.placed_at >= $1 and o.placed_at <= $2
            and o.status not in ${LIVE}`,
        [range.from, range.to],
      );
      const paymentMix = await db.query<{ method: string; orders: number; revenue: number }>(
        `select o.payment_method as method, count(*)::int as orders,
                coalesce(sum(o.total) filter (where o.payment_status in ${PAID}), 0)::bigint as revenue
           from orders o
          where o.placed_at >= $1 and o.placed_at <= $2
            and o.status not in ${LIVE}
          group by o.payment_method
          order by orders desc`,
        [range.from, range.to],
      );
      const categories = await db.query<{ name: string; units: number; revenue: number }>(
        `select coalesce(c.name, 'Uncategorised') as name,
                sum(oi.quantity)::int as units,
                sum(oi.line_total)::bigint as revenue
           from order_items oi
           join orders o on o.id = oi.order_id
           left join products p on p.id = oi.product_id
           left join categories c on c.id = p.category_id
          where o.placed_at >= $1 and o.placed_at <= $2
            and o.status not in ${LIVE}
          group by 1
          order by revenue desc
          limit 12`,
        [range.from, range.to],
      );
      return { orders, paymentMix, categories };
    });

    const row = totals.orders.rows[0];
    const revenue = toNumber(row?.revenue);
    const refunds = toNumber(row?.refunds);
    const summary = {
      orders: toNumber(row?.orders),
      revenue,
      units: toNumber(row?.units),
      discounts: toNumber(row?.discounts),
      shipping: toNumber(row?.shipping),
      refunds,
      netRevenue: revenue - refunds,
      averageOrderValue: toNumber(row?.orders) > 0 ? Math.round(revenue / toNumber(row?.orders)) : 0,
    };

    if (req.query.format === 'csv') {
      const columns: CsvColumn<SalesDay>[] = [
        { key: 'date', header: 'Date' },
        { key: 'orders', header: 'Orders' },
        { key: 'units', header: 'Units' },
        { key: 'revenue', header: 'Revenue (ETB)' },
        { key: 'discounts', header: 'Discounts (ETB)' },
        { key: 'shipping', header: 'Shipping (ETB)' },
      ];
      sendCsv(
        res,
        'sales-report',
        columns,
        days.map((day) => ({
          ...day,
          revenue: day.revenue / 100,
          discounts: day.discounts / 100,
          shipping: day.shipping / 100,
        })) as unknown as SalesDay[],
      );
      return;
    }

    res.json({
      range: { from: range.from, to: range.to },
      summary,
      series: days,
      paymentMix: totals.paymentMix.rows.map((entry) => ({
        method: entry.method,
        orders: toNumber(entry.orders),
        revenue: toNumber(entry.revenue),
      })),
      categories: totals.categories.rows.map((entry) => ({
        name: entry.name,
        units: toNumber(entry.units),
        revenue: toNumber(entry.revenue),
      })),
    });
  }),
);

router.get(
  '/reports/products',
  requirePerm('reports.view'),
  asyncRoute(async (req, res) => {
    requireSalesAccess(req);
    const range = dateRange(req, 30);
    const { limit } = parse(topQuerySchema, req.query);

    const rows = await withUserDb(req, async (db) =>
      db.query<{
        product_id: string;
        name: string;
        slug: string;
        sku: string;
        units: number;
        revenue: number;
        orders: number;
        last_sold: Date | null;
      }>(
        `select oi.product_id,
                min(oi.product_name) as name,
                min(oi.product_slug) as slug,
                min(oi.sku) as sku,
                sum(oi.quantity)::int as units,
                sum(oi.line_total)::bigint as revenue,
                count(distinct oi.order_id)::int as orders,
                max(o.placed_at) as last_sold
           from order_items oi
           join orders o on o.id = oi.order_id
          where o.placed_at >= $1 and o.placed_at <= $2
            and o.status not in ${LIVE}
            and oi.product_id is not null
          group by oi.product_id
          order by revenue desc
          limit $3`,
        [range.from, range.to, limit],
      ),
    );

    const mapped = rows.rows.map((entry) => ({
      productId: entry.product_id,
      name: entry.name,
      slug: entry.slug,
      sku: entry.sku,
      units: toNumber(entry.units),
      revenue: toNumber(entry.revenue),
      orders: toNumber(entry.orders),
      lastSoldAt: entry.last_sold ? new Date(entry.last_sold).toISOString() : null,
    }));

    if (req.query.format === 'csv') {
      const columns: CsvColumn<(typeof mapped)[number]>[] = [
        { key: 'sku', header: 'SKU' },
        { key: 'name', header: 'Product' },
        { key: 'units', header: 'Units sold' },
        { key: 'orders', header: 'Orders' },
        { key: 'revenue', header: 'Revenue (ETB)' },
        { key: 'lastSoldAt', header: 'Last sold' },
      ];
      sendCsv(
        res,
        'product-report',
        columns,
        mapped.map((entry) => ({
          ...entry,
          revenue: entry.revenue / 100,
          name: entry.name ?? '',
          lastSoldAt: entry.lastSoldAt ?? '',
        })),
      );
      return;
    }

    res.json({ range: { from: range.from, to: range.to }, products: mapped });
  }),
);

router.get(
  '/reports/customers',
  requirePerm('reports.view'),
  asyncRoute(async (req, res) => {
    if (!hasPerm(req, 'customers.read')) throw forbidden('You do not have access to customer data.');
    const range = dateRange(req, 90);

    const data = await withUserDb(req, async (db) => {
      const summary = await db.query<{ new_customers: number; buyers: number; repeat_buyers: number }>(
        `select count(*) filter (where p.created_at >= $1 and p.created_at <= $2)::int as new_customers,
                count(distinct o.profile_id)::int as buyers,
                count(distinct o.profile_id) filter (where buyer_orders.cnt > 1)::int as repeat_buyers
           from profiles p
           left join orders o on o.profile_id = p.id
             and o.placed_at >= $1 and o.placed_at <= $2
             and o.status not in ${LIVE}
           left join (
             select profile_id, count(*)::int as cnt
               from orders
              where placed_at >= $1 and placed_at <= $2 and status not in ${LIVE}
              group by profile_id
           ) buyer_orders on buyer_orders.profile_id = p.id`,
        [range.from, range.to],
      );
      const top = await db.query<{
        id: string;
        name: string;
        email: string;
        orders: number;
        spend: number;
        last_order: Date | null;
      }>(
        `select o.profile_id as id,
                max(o.customer_name) as name,
                max(o.email) as email,
                count(*)::int as orders,
                coalesce(sum(o.total) filter (where o.payment_status in ${PAID}), 0)::bigint as spend,
                max(o.placed_at) as last_order
           from orders o
          where o.placed_at >= $1 and o.placed_at <= $2
            and o.status not in ${LIVE}
            and o.profile_id is not null
          group by o.profile_id
          order by spend desc
          limit 15`,
        [range.from, range.to],
      );
      const prior = await db.query<{ created: number }>(
        `select count(*)::int as created from profiles
          where created_at >= $1 and created_at < $2`,
        [new Date(new Date(range.from).getTime() - (new Date(range.to).getTime() - new Date(range.from).getTime())).toISOString(), range.from],
      );
      return { summary, top, prior };
    });

    const summary = data.summary.rows[0];
    const mapped = data.top.rows.map((entry) => ({
      id: entry.id,
      name: entry.name,
      email: entry.email,
      orders: toNumber(entry.orders),
      spend: toNumber(entry.spend),
      lastOrderAt: entry.last_order ? new Date(entry.last_order).toISOString() : null,
    }));

    if (req.query.format === 'csv') {
      const columns: CsvColumn<(typeof mapped)[number]>[] = [
        { key: 'name', header: 'Customer' },
        { key: 'email', header: 'Email' },
        { key: 'orders', header: 'Orders' },
        { key: 'spend', header: 'Spend (ETB)' },
        { key: 'lastOrderAt', header: 'Last order' },
      ];
      sendCsv(
        res,
        'customer-report',
        columns,
        mapped.map((entry) => ({ ...entry, spend: entry.spend / 100, lastOrderAt: entry.lastOrderAt ?? '' })),
      );
      return;
    }

    res.json({
      range: { from: range.from, to: range.to },
      summary: {
        newCustomers: toNumber(summary?.new_customers),
        previousNewCustomers: toNumber(data.prior.rows[0]?.created),
        buyers: toNumber(summary?.buyers),
        repeatBuyers: toNumber(summary?.repeat_buyers),
      },
      topCustomers: mapped,
    });
  }),
);

router.get(
  '/reports/payments',
  requirePerm('reports.view'),
  asyncRoute(async (req, res) => {
    const range = dateRange(req, 30);
    if (!hasPerm(req, 'payments.read') && !hasPerm(req, 'payments.manage') && !hasPerm(req, 'reports.finance')) {
      throw forbidden('You do not have access to payment reports.');
    }

    const data = await withUserDb(req, async (db) => {
      const providers = await db.query<{ provider: string; status: string; count: number; amount: number }>(
        `select provider, status, count(*)::int as count, coalesce(sum(amount), 0)::bigint as amount
           from payments
          where created_at >= $1 and created_at <= $2
          group by provider, status
          order by provider, status`,
        [range.from, range.to],
      );
      const refunds = await db.query<{ status: string; count: number; amount: number }>(
        `select status, count(*)::int as count, coalesce(sum(amount), 0)::bigint as amount
           from refunds
          where created_at >= $1 and created_at <= $2
          group by status`,
        [range.from, range.to],
      );
      const codOutstanding = await db.query<{ orders: number; amount: number }>(
        `select count(*)::int as orders, coalesce(sum(total), 0)::bigint as amount
           from orders
          where payment_method = 'cod' and payment_status <> 'paid'
            and status in ('confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery', 'delivered')`,
      );
      const failed = await db.query<{ orders: number }>(
        `select count(*)::int as orders from orders
          where payment_status = 'failed' and placed_at >= $1 and placed_at <= $2`,
        [range.from, range.to],
      );
      return { providers, refunds, codOutstanding, failed };
    });

    const providerRows = data.providers.rows.map((entry) => ({
      provider: entry.provider,
      status: entry.status,
      count: toNumber(entry.count),
      amount: toNumber(entry.amount),
    }));
    const refundRows = data.refunds.rows.map((entry) => ({
      status: entry.status,
      count: toNumber(entry.count),
      amount: toNumber(entry.amount),
    }));

    if (req.query.format === 'csv') {
      const columns: CsvColumn<(typeof providerRows)[number]>[] = [
        { key: 'provider', header: 'Provider' },
        { key: 'status', header: 'Status' },
        { key: 'count', header: 'Transactions' },
        { key: 'amount', header: 'Amount (ETB)' },
      ];
      sendCsv(
        res,
        'payment-report',
        columns,
        providerRows.map((entry) => ({ ...entry, amount: entry.amount / 100 })),
      );
      return;
    }

    res.json({
      range: { from: range.from, to: range.to },
      providers: providerRows,
      refunds: refundRows,
      codOutstanding: {
        orders: toNumber(data.codOutstanding.rows[0]?.orders),
        amount: toNumber(data.codOutstanding.rows[0]?.amount),
      },
      failedPayments: toNumber(data.failed.rows[0]?.orders),
    });
  }),
);

router.get(
  '/reports/inventory',
  requirePerm('inventory.read'),
  asyncRoute(async (req, res) => {
    const showCost = hasPerm(req, 'inventory.cost');
    const rows = await withUserDb(req, async (db) =>
      db.query<{
        variant_id: string;
        product_id: string;
        product_name: string;
        slug: string;
        sku: string;
        quantity: number;
        reserved: number;
        available: number;
        threshold: number;
        price: number;
        cost_price: number | null;
        updated_at: Date;
      }>(
        `select v.id as variant_id, p.id as product_id, p.name as product_name, p.slug, v.sku,
                v.price,
                i.quantity, i.reserved, (i.quantity - i.reserved)::int as available,
                i.low_stock_threshold as threshold,
                ${showCost ? 'pc.cost_price' : 'null::bigint as cost_price'},
                i.updated_at
           from inventory i
           join product_variants v on v.id = i.variant_id
           join products p on p.id = v.product_id
           ${showCost ? 'left join product_costs pc on pc.product_id = p.id' : ''}
          where p.status <> 'archived'
          order by available asc, p.name asc`,
      ),
    );

    const mapped = rows.rows.map((entry) => ({
      variantId: entry.variant_id,
      productId: entry.product_id,
      productName: entry.product_name,
      slug: entry.slug,
      sku: entry.sku,
      quantity: toNumber(entry.quantity),
      reserved: toNumber(entry.reserved),
      available: toNumber(entry.available),
      threshold: toNumber(entry.threshold),
      price: toNumber(entry.price),
      costPrice: entry.cost_price === null ? null : toNumber(entry.cost_price),
      retailValue: toNumber(entry.available) * toNumber(entry.price),
      costValue: entry.cost_price === null ? null : toNumber(entry.available) * toNumber(entry.cost_price),
      updatedAt: new Date(entry.updated_at).toISOString(),
    }));

    const totals = mapped.reduce(
      (acc, entry) => ({
        variants: acc.variants + 1,
        units: acc.units + entry.available,
        lowStock: acc.lowStock + (entry.available <= entry.threshold ? 1 : 0),
        outOfStock: acc.outOfStock + (entry.available <= 0 ? 1 : 0),
        retailValue: acc.retailValue + entry.retailValue,
        costValue: acc.costValue + (entry.costValue ?? 0),
      }),
      { variants: 0, units: 0, lowStock: 0, outOfStock: 0, retailValue: 0, costValue: 0 },
    );

    if (req.query.format === 'csv') {
      const columns: CsvColumn<(typeof mapped)[number]>[] = [
        { key: 'sku', header: 'SKU' },
        { key: 'productName', header: 'Product' },
        { key: 'quantity', header: 'On hand' },
        { key: 'reserved', header: 'Reserved' },
        { key: 'available', header: 'Available' },
        { key: 'threshold', header: 'Low stock threshold' },
        ...(showCost ? [{ key: 'costPrice' as const, header: 'Unit cost (ETB)' }] : []),
        ...(showCost ? [{ key: 'costValue' as const, header: 'Stock value (ETB)' }] : []),
      ];
      sendCsv(
        res,
        'inventory-report',
        columns,
        mapped.map((entry) => ({
          ...entry,
          costPrice: entry.costPrice === null ? '' : entry.costPrice / 100,
          costValue: entry.costValue === null ? '' : entry.costValue / 100,
        })) as unknown as (typeof mapped)[number][],
      );
      return;
    }

    res.json({ generatedAt: new Date().toISOString(), showCost, totals, variants: mapped });
  }),
);

const auditQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  entityType: z.string().trim().max(60).optional(),
  action: z.string().trim().max(80).optional(),
  actor: z.string().trim().max(120).optional(),
});

router.get(
  '/audit',
  requirePerm('audit.read'),
  asyncRoute(async (req, res) => {
    const { page, pageSize, offset } = paging(req, 30);
    const filters = parse(auditQuerySchema, req.query);
    const range = dateRange(req, 30);
    const search = filters.q ? `%${filters.q}%` : null;
    const actor = filters.actor ? `%${filters.actor}%` : null;

    const data = await withUserDb(req, async (db) => {
      const where = `created_at >= $1 and created_at <= $2
        and ($3::text is null or entity_type = $3)
        and ($4::text is null or action ilike $4)
        and ($5::text is null or actor_email ilike $5)
        and ($6::text is null or entity_id ilike $6 or action ilike $6 or actor_email ilike $6)`;
      const params = [
        range.from,
        range.to,
        filters.entityType ?? null,
        filters.action ? `%${filters.action}%` : null,
        actor,
        search,
      ];
      const count = await db.query<{ total: number }>(
        `select count(*)::int as total from audit_logs where ${where}`,
        params,
      );
      const rows = await db.query<{
        id: string;
        actor_email: string | null;
        action: string;
        entity_type: string;
        entity_id: string | null;
        before: unknown;
        after: unknown;
        ip: string | null;
        created_at: Date;
      }>(
        `select id, actor_email, action, entity_type, entity_id, before, after, ip, created_at
           from audit_logs
          where ${where}
          order by created_at desc
          limit $7 offset $8`,
        [...params, pageSize, offset],
      );
      return { total: toNumber(count.rows[0]?.total), rows: rows.rows };
    });

    res.json({
      entries: data.rows.map((entry) => ({
        id: entry.id,
        actorEmail: entry.actor_email,
        action: entry.action,
        entityType: entry.entity_type,
        entityId: entry.entity_id,
        before: entry.before,
        after: entry.after,
        ip: entry.ip,
        createdAt: new Date(entry.created_at).toISOString(),
      })),
      pagination: paginationMeta(page, pageSize, data.total),
    });
  }),
);

export default router;
