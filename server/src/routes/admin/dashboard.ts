import { Router } from 'express';
import { asyncRoute, withUserDb } from '../../lib/request.js';
import { hasPerm, requirePerm } from '../../lib/auth.js';
import { dateRange, toNumber } from './shared.js';

const router = Router();

const PAID = "('paid','partially_refunded')";
const LIVE = "('cancelled','refunded')";

router.get(
  '/dashboard',
  requirePerm('dashboard.view'),
  asyncRoute(async (req, res) => {
    const range = dateRange(req, 30);
    const previousFrom = new Date(
      range.fromDate.getTime() - (range.toDate.getTime() - range.fromDate.getTime()),
    ).toISOString();
    const canSeeOrders = hasPerm(req, 'orders.read') || hasPerm(req, 'payments.read');
    const canSeeInventory = hasPerm(req, 'inventory.read');
    const canSeeCustomers = hasPerm(req, 'customers.read');
    const canSeePromotions = hasPerm(req, 'promotions.read');

    const data = await withUserDb(req, async (db) => {
      const result: Record<string, unknown> = { range: { from: range.from, to: range.to } };
      const permissions = {
        orders: canSeeOrders,
        inventory: canSeeInventory,
        customers: canSeeCustomers,
        promotions: canSeePromotions,
      };
      result.permissions = permissions;

      if (canSeeOrders) {
        const totals = await db.query<{
          orders: number;
          revenue: number;
          units: number;
          awaiting: number;
          fulfilment: number;
        }>(
          `select count(*)::int as orders,
                  coalesce(sum(o.total) filter (where o.payment_status in ${PAID}), 0)::bigint as revenue,
                  coalesce((select sum(oi.quantity)::int
                              from order_items oi join orders o2 on o2.id = oi.order_id
                             where o2.placed_at >= $1 and o2.placed_at <= $2
                               and o2.status not in ${LIVE}), 0) as units,
                  count(*) filter (where o.status in ('pending','awaiting_payment'))::int as awaiting,
                  count(*) filter (where o.status in ('paid','confirmed','processing','packed'))::int as fulfilment
             from orders o
            where o.placed_at >= $1 and o.placed_at <= $2
              and o.status not in ${LIVE}`,
          [range.from, range.to],
        );

        const prior = await db.query<{ orders: number; revenue: number }>(
          `select count(*)::int as orders,
                  coalesce(sum(o.total) filter (where o.payment_status in ${PAID}), 0)::bigint as revenue
             from orders o
            where o.placed_at >= $1 and o.placed_at < $2
              and o.status not in ${LIVE}`,
          [previousFrom, range.from],
        );

        const series = await db.query<{
          date: string;
          orders: number;
          revenue: number;
          units: number;
        }>(
          `with days as (
             select generate_series(
                      ($1::timestamptz at time zone 'Africa/Addis_Ababa')::date,
                      ($2::timestamptz at time zone 'Africa/Addis_Ababa')::date,
                      interval '1 day')::date as day
           )
           select to_char(d.day, 'YYYY-MM-DD') as date,
                  coalesce(s.orders, 0)::int as orders,
                  coalesce(s.revenue, 0)::bigint as revenue,
                  coalesce(s.units, 0)::int as units
             from days d
             left join (
               select per_order.day,
                      count(*)::int as orders,
                      coalesce(sum(per_order.revenue), 0)::bigint as revenue,
                      coalesce(sum(per_order.units), 0)::int as units
                 from (
                   select (o.placed_at at time zone 'Africa/Addis_Ababa')::date as day,
                          case when o.payment_status in ${PAID} then o.total else 0 end as revenue,
                          (select coalesce(sum(oi.quantity), 0)::int
                             from order_items oi where oi.order_id = o.id) as units
                     from orders o
                    where o.placed_at >= $1 and o.placed_at <= $2
                      and o.status not in ${LIVE}
                 ) per_order
                group by per_order.day
             ) s on s.day = d.day
            order by d.day`,
          [range.from, range.to],
        );

        const statuses = await db.query<{ status: string; count: number }>(
          `select status, count(*)::int as count
             from orders
            where placed_at >= $1 and placed_at <= $2
            group by status
            order by count desc`,
          [range.from, range.to],
        );

        const payments = await db.query<{ provider: string; amount: number; count: number }>(
          `select p.provider, coalesce(sum(p.amount), 0)::bigint as amount, count(*)::int as count
             from payments p
            where p.status = 'successful' and p.created_at >= $1 and p.created_at <= $2
            group by p.provider
            order by amount desc`,
          [range.from, range.to],
        );

        const topProducts = await db.query<{
          product_id: string;
          name: string;
          slug: string;
          image_url: string | null;
          units: number;
          revenue: number;
        }>(
          `select oi.product_id, min(oi.product_name) as name, min(oi.product_slug) as slug,
                  min(oi.image_url) as image_url,
                  sum(oi.quantity)::int as units,
                  sum(oi.line_total)::bigint as revenue
             from order_items oi
             join orders o on o.id = oi.order_id
            where o.placed_at >= $1 and o.placed_at <= $2
              and o.status not in ${LIVE}
              and oi.product_id is not null
            group by oi.product_id
            order by revenue desc
            limit 6`,
          [range.from, range.to],
        );

        const recentOrders = await db.query<{
          id: string;
          order_number: string;
          customer_name: string;
          status: string;
          payment_status: string;
          total: number;
          placed_at: Date;
          item_count: number;
        }>(
          `select o.id, o.order_number, o.customer_name, o.status, o.payment_status, o.total, o.placed_at,
                  (select count(*)::int from order_items oi where oi.order_id = o.id) as item_count
             from orders o
            order by o.placed_at desc
            limit 8`,
        );

        const refunds = await db.query<{ pending: number; total: number }>(
          `select count(*) filter (where status in ('pending','processing'))::int as pending,
                  count(*)::int as total
             from refunds`,
        );

        const current = totals.rows[0]!;
        const priorRow = prior.rows[0]!;
        const orders = toNumber(current.orders);
        const revenue = toNumber(current.revenue);

        result.sales = {
          revenue,
          orders,
          units: toNumber(current.units),
          averageOrderValue: orders > 0 ? Math.round(revenue / orders) : 0,
          awaitingPayment: toNumber(current.awaiting),
          pendingFulfilment: toNumber(current.fulfilment),
          previousRevenue: toNumber(priorRow.revenue),
          previousOrders: toNumber(priorRow.orders),
          series: series.rows.map((row) => ({
            date: row.date,
            orders: toNumber(row.orders),
            revenue: toNumber(row.revenue),
            units: toNumber(row.units),
          })),
          statuses: statuses.rows.map((row) => ({ status: row.status, count: toNumber(row.count) })),
          payments: payments.rows.map((row) => ({
            provider: row.provider,
            amount: toNumber(row.amount),
            count: toNumber(row.count),
          })),
          topProducts: topProducts.rows.map((row) => ({
            productId: row.product_id,
            name: row.name,
            slug: row.slug,
            imageUrl: row.image_url,
            units: toNumber(row.units),
            revenue: toNumber(row.revenue),
          })),
          recentOrders: recentOrders.rows.map((row) => ({
            id: row.id,
            orderNumber: row.order_number,
            customerName: row.customer_name,
            status: row.status,
            paymentStatus: row.payment_status,
            total: toNumber(row.total),
            itemCount: toNumber(row.item_count),
            placedAt: new Date(row.placed_at).toISOString(),
          })),
          refundsPending: toNumber(refunds.rows[0]?.pending),
        };
      }

      if (canSeeInventory) {
        const stock = await db.query<{
          total_variants: number;
          low: number;
          out: number;
          reserved: number;
        }>(
          `select count(*)::int as total_variants,
                  count(*) filter (where quantity - reserved <= low_stock_threshold)::int as low,
                  count(*) filter (where quantity - reserved <= 0)::int as out,
                  coalesce(sum(reserved), 0)::int as reserved
             from inventory`,
        );
        const lowStock = await db.query<{
          variant_id: string;
          product_name: string;
          product_slug: string;
          sku: string;
          variant_label: string;
          available: number;
          threshold: number;
        }>(
          `select i.variant_id, p.name as product_name, p.slug as product_slug, v.sku,
                  v.option_values::text as variant_label,
                  (i.quantity - i.reserved)::int as available, i.low_stock_threshold as threshold
             from inventory i
             join product_variants v on v.id = i.variant_id
             join products p on p.id = v.product_id
            where i.quantity - i.reserved <= i.low_stock_threshold
              and p.status <> 'archived'
            order by (i.quantity - i.reserved) asc, p.name asc
            limit 8`,
        );
        result.inventory = {
          variants: toNumber(stock.rows[0]?.total_variants),
          lowStock: toNumber(stock.rows[0]?.low),
          outOfStock: toNumber(stock.rows[0]?.out),
          reserved: toNumber(stock.rows[0]?.reserved),
          lowStockItems: lowStock.rows.map((row) => ({
            variantId: row.variant_id,
            productName: row.product_name,
            productSlug: row.product_slug,
            sku: row.sku,
            variantLabel: row.variant_label,
            available: toNumber(row.available),
            threshold: toNumber(row.threshold),
          })),
        };
      }

      if (canSeeCustomers) {
        const customers = await db.query<{ total: number; created: number; buyers: number }>(
          `select count(*)::int as total,
                  count(*) filter (where created_at >= $1 and created_at <= $2)::int as created,
                  (select count(distinct o.profile_id)::int from orders o
                    where o.placed_at >= $1 and o.placed_at <= $2
                      and o.profile_id is not null and o.status not in ${LIVE}) as buyers
             from profiles`,
          [range.from, range.to],
        );
        const priorCustomers = await db.query<{ created: number }>(
          `select count(*)::int as created
             from profiles where created_at >= $1 and created_at < $2`,
          [previousFrom, range.from],
        );
        result.customers = {
          total: toNumber(customers.rows[0]?.total),
          newInRange: toNumber(customers.rows[0]?.created),
          previousNew: toNumber(priorCustomers.rows[0]?.created),
          buyers: toNumber(customers.rows[0]?.buyers),
        };
      }

      if (canSeePromotions) {
        const promo = await db.query<{
          pending_reviews: number;
          active_coupons: number;
          subscribers: number;
          active_banners: number;
        }>(
          `select (select count(*)::int from reviews where status = 'pending') as pending_reviews,
                  (select count(*)::int from coupons
                    where is_active
                      and (starts_at is null or starts_at <= now())
                      and (ends_at is null or ends_at >= now())) as active_coupons,
                  (select count(*)::int from newsletter_subscribers where status = 'subscribed') as subscribers,
                  (select count(*)::int from banners where is_active) as active_banners`,
        );
        const row = promo.rows[0];
        result.promotions = {
          pendingReviews: toNumber(row?.pending_reviews),
          activeCoupons: toNumber(row?.active_coupons),
          subscribers: toNumber(row?.subscribers),
          activeBanners: toNumber(row?.active_banners),
        };
      }

      return result;
    });

    res.json(data);
  }),
);

export default router;
