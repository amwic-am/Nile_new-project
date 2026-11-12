import { Router } from 'express';
import { z } from 'zod';
import { getDatabase } from '../../db/index.js';
import { hasPerm, requirePerm } from '../../lib/auth.js';
import { forbidden, notFound, unprocessable } from '../../lib/errors.js';
import { asyncRoute, withUserDb } from '../../lib/request.js';
import { pageParams, parse } from '../../lib/validation.js';
import { paginationMeta, recordAudit, sendCsv, toNumber, type CsvColumn } from './shared.js';

const router = Router();

const uuidSchema = z.string().uuid('Choose a valid customer');

const listQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  status: z.enum(['all', 'active', 'suspended', 'deleted']).optional().default('all'),
  segment: z.enum(['all', 'buyers', 'repeat', 'new']).optional().default('all'),
});

const updateSchema = z
  .object({
    fullName: z.string().trim().min(2).max(160).optional(),
    phone: z.string().trim().min(7).max(30).optional().or(z.literal('')),
    status: z.enum(['active', 'suspended']).optional(),
    marketingOptIn: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Nothing to update');

type CustomerRow = {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  status: string;
  created_at: Date;
  last_login_at: Date | null;
  roles: unknown;
  order_count: number;
  paid_total: number;
  last_order_at: Date | null;
};

const customerSelect = `
  select p.id, p.email, p.full_name, p.phone, p.status, p.created_at, p.last_login_at,
         coalesce(
           (select json_agg(ur.role_key order by ur.role_key)
              from user_roles ur where ur.profile_id = p.id),
           '[]'::json
         ) as roles,
         (select count(*)::int from orders o
           where o.profile_id = p.id and o.status not in ('cancelled', 'refunded')) as order_count,
         (select coalesce(sum(o.total), 0)::bigint from orders o
           where o.profile_id = p.id and o.payment_status in ('paid', 'partially_refunded')) as paid_total,
         (select max(o.placed_at) from orders o where o.profile_id = p.id) as last_order_at
    from profiles p`;

function roleList(roles: unknown): string[] {
  return Array.isArray(roles) ? roles.map((role) => String(role)) : [];
}

function isStaff(roles: string[]): boolean {
  return roles.some((role) => role !== 'customer');
}

// user_roles is behind RLS, so staff membership must be resolved with the
// owner connection; otherwise roles without staff.read cannot see it.
async function staffProfileIds(): Promise<string[]> {
  const db = await getDatabase();
  const result = await db.query<{ profile_id: string }>(
    `select distinct ur.profile_id
       from user_roles ur
       join roles r on r.key = ur.role_key
      where r.is_staff`,
  );
  return result.rows.map((row) => row.profile_id);
}

async function isStaffProfile(id: string): Promise<boolean> {
  const db = await getDatabase();
  const result = await db.query(
    `select 1
       from user_roles ur
       join roles r on r.key = ur.role_key
      where ur.profile_id = $1 and r.is_staff
      limit 1`,
    [id],
  );
  return result.rows.length > 0;
}

router.get(
  '/customers/export',
  requirePerm('customers.read'),
  asyncRoute(async (req, res) => {
    const filters = parse(listQuerySchema, req.query);
    const search = filters.q ? `%${filters.q}%` : null;
    const staffIds = await staffProfileIds();
    const rows = await withUserDb(req, async (db) =>
      db.query<CustomerRow>(
        `${customerSelect}
          where ($1::text = 'all' or p.status = $1)
            and ($2::text is null or p.email ilike $2 or p.full_name ilike $2 or p.phone ilike $2)
            and not (p.id = any($3::uuid[]))
          order by p.created_at desc
          limit 5000`,
        [filters.status, search, staffIds],
      ),
    );
    const columns: CsvColumn<{
      email: string;
      full_name: string;
      phone: string;
      status: string;
      roles: string;
      orders: number;
      paid_etb: number;
      joined: string;
    }>[] = [
      { key: 'email', header: 'Email' },
      { key: 'full_name', header: 'Name' },
      { key: 'phone', header: 'Phone' },
      { key: 'status', header: 'Status' },
      { key: 'roles', header: 'Roles' },
      { key: 'orders', header: 'Orders' },
      { key: 'paid_etb', header: 'Paid total (ETB)' },
      { key: 'joined', header: 'Joined' },
    ];
    sendCsv(
      res,
      'customers',
      columns,
      rows.rows.map((row) => ({
        email: row.email,
        full_name: row.full_name,
        phone: row.phone ?? '',
        status: row.status,
        roles: roleList(row.roles).join(' '),
        orders: toNumber(row.order_count),
        paid_etb: toNumber(row.paid_total) / 100,
        joined: new Date(row.created_at).toISOString(),
      })),
    );
  }),
);

router.get(
  '/customers',
  requirePerm('customers.read'),
  asyncRoute(async (req, res) => {
    const { page, pageSize, offset } = pageParams(req.query, { page: 1, pageSize: 25 });
    const filters = parse(listQuerySchema, req.query);
    const search = filters.q ? `%${filters.q}%` : null;
    const staffIds = await staffProfileIds();

    const data = await withUserDb(req, async (db) => {
      const where = `
        ($1::text = 'all' or u.status = $1)
        and ($2::text is null or u.email ilike $2 or u.full_name ilike $2 or u.phone ilike $2)
        and ($3::text = 'all'
             or ($3 = 'buyers' and u.order_count > 0)
             or ($3 = 'repeat' and u.order_count > 1)
             or ($3 = 'new' and u.order_count = 0))
        and not (u.id = any($4::uuid[]))`;
      const params = [filters.status, search, filters.segment, staffIds];
      const count = await db.query<{ total: number }>(
        `select count(*)::int as total from (${customerSelect}) u where ${where}`,
        params,
      );
      const rows = await db.query<CustomerRow>(
        `select * from (${customerSelect}) u where ${where}
          order by u.created_at desc
          limit $5 offset $6`,
        [...params, pageSize, offset],
      );
      return { total: toNumber(count.rows[0]?.total), rows: rows.rows };
    });

    res.json({
      customers: data.rows.map((row) => ({
        id: row.id,
        email: row.email,
        fullName: row.full_name,
        phone: row.phone,
        status: row.status,
        roles: roleList(row.roles),
        isStaff: isStaff(roleList(row.roles)),
        orderCount: toNumber(row.order_count),
        paidTotal: toNumber(row.paid_total),
        lastOrderAt: row.last_order_at ? new Date(row.last_order_at).toISOString() : null,
        createdAt: new Date(row.created_at).toISOString(),
        lastLoginAt: row.last_login_at ? new Date(row.last_login_at).toISOString() : null,
      })),
      pagination: paginationMeta(page, pageSize, data.total),
    });
  }),
);

router.get(
  '/customers/:id',
  requirePerm('customers.read'),
  asyncRoute(async (req, res) => {
    const id = parse(uuidSchema, req.params.id);
    const data = await withUserDb(req, async (db) => {
      const profile = await db.query<CustomerRow>(
        `${customerSelect} where p.id = $1 limit 1`,
        [id],
      );
      const row = profile.rows[0];
      if (!row) throw notFound('Customer not found');

      const [orders, addresses, stats] = await Promise.all([
        hasPerm(req, 'orders.read')
          ? db.query<{
              id: string;
              order_number: string;
              status: string;
              payment_status: string;
              total: number;
              placed_at: Date;
              item_count: number;
            }>(
              `select o.id, o.order_number, o.status, o.payment_status, o.total, o.placed_at,
                      (select count(*)::int from order_items oi where oi.order_id = o.id) as item_count
                 from orders o where o.profile_id = $1
                order by o.placed_at desc limit 12`,
              [id],
            )
          : Promise.resolve({ rows: [] }),
        db.query<{
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
        }>(
          `select id, label, full_name, phone, line1, line2, city, region, postal_code,
                  country, is_default
             from addresses where profile_id = $1 order by is_default desc, created_at desc`,
          [id],
        ),
        db.query<{
          order_count: number;
          cancelled: number;
          refunded_total: number;
          average_order: number;
          first_order_at: Date | null;
        }>(
          `select count(*)::int as order_count,
                  count(*) filter (where status = 'cancelled')::int as cancelled,
                  coalesce(sum(total) filter (where payment_status = 'refunded'), 0)::bigint as refunded_total,
                  coalesce(avg(total) filter (where payment_status in ('paid', 'partially_refunded')), 0)::bigint as average_order,
                  min(placed_at) as first_order_at
             from orders where profile_id = $1`,
          [id],
        ),
      ]);

      return { row, orders: orders.rows, addresses: addresses.rows, stats: stats.rows[0] };
    });

    const targetIsStaff = await isStaffProfile(id);

    res.json({
      customer: {
        id: data.row.id,
        email: data.row.email,
        fullName: data.row.full_name,
        phone: data.row.phone,
        status: data.row.status,
        roles: roleList(data.row.roles),
        isStaff: targetIsStaff,
        orderCount: toNumber(data.row.order_count),
        paidTotal: toNumber(data.row.paid_total),
        lastOrderAt: data.row.last_order_at ? new Date(data.row.last_order_at).toISOString() : null,
        createdAt: new Date(data.row.created_at).toISOString(),
        lastLoginAt: data.row.last_login_at ? new Date(data.row.last_login_at).toISOString() : null,
        stats: {
          orders: toNumber(data.stats?.order_count),
          cancelled: toNumber(data.stats?.cancelled),
          refundedTotal: toNumber(data.stats?.refunded_total),
          averageOrder: toNumber(data.stats?.average_order),
          firstOrderAt: data.stats?.first_order_at
            ? new Date(data.stats.first_order_at).toISOString()
            : null,
        },
        addresses: data.addresses.map((address) => ({
          id: address.id,
          label: address.label,
          fullName: address.full_name,
          phone: address.phone,
          line1: address.line1,
          line2: address.line2,
          city: address.city,
          region: address.region,
          postalCode: address.postal_code,
          country: address.country,
          isDefault: address.is_default,
        })),
        recentOrders: data.orders.map((order) => ({
          id: order.id,
          orderNumber: order.order_number,
          status: order.status,
          paymentStatus: order.payment_status,
          total: toNumber(order.total),
          itemCount: toNumber(order.item_count),
          placedAt: new Date(order.placed_at).toISOString(),
        })),
      },
      permissions: { orders: hasPerm(req, 'orders.read') },
    });
  }),
);

router.patch(
  '/customers/:id',
  requirePerm('customers.write'),
  asyncRoute(async (req, res) => {
    const id = parse(uuidSchema, req.params.id);
    const input = parse(updateSchema, req.body);
    if (id === req.auth?.id && input.status === 'suspended') {
      throw forbidden('You cannot suspend your own account.');
    }

    const targetIsStaff = await isStaffProfile(id);
    if (targetIsStaff && !hasPerm(req, 'staff.write')) {
      throw forbidden('Staff accounts can only be changed by an administrator.');
    }

    const before = await withUserDb(req, async (db) => {
      const existing = await db.query<{
        id: string;
        email: string;
        full_name: string;
        phone: string | null;
        status: string;
        marketing_opt_in: boolean;
        roles: unknown;
      }>(
        `select p.id, p.email, p.full_name, p.phone, p.status, p.marketing_opt_in,
                coalesce((select json_agg(ur.role_key) from user_roles ur where ur.profile_id = p.id), '[]'::json) as roles
           from profiles p where p.id = $1 limit 1`,
        [id],
      );
      const row = existing.rows[0];
      if (!row) throw notFound('Customer not found');
      if (input.status === 'suspended' && row.status === 'active') {
        const openOrders = await db.query<{ total: number }>(
          `select count(*)::int as total from orders
            where profile_id = $1 and status not in ('delivered', 'cancelled', 'returned', 'refunded')`,
          [id],
        );
        if (toNumber(openOrders.rows[0]?.total) > 0) {
          throw unprocessable('Resolve this customer’s open orders before suspending the account.');
        }
      }

      await db.query(
        `update profiles set
           full_name = coalesce($2, full_name),
           phone = case when $3::boolean then nullif($4, '') else phone end,
           status = coalesce($5, status),
           marketing_opt_in = coalesce($6, marketing_opt_in),
           updated_at = now()
         where id = $1`,
        [
          id,
          input.fullName ?? null,
          input.phone !== undefined,
          input.phone ?? null,
          input.status ?? null,
          input.marketingOptIn ?? null,
        ],
      );
      const after = await db.query<{
        full_name: string;
        phone: string | null;
        status: string;
        marketing_opt_in: boolean;
      }>(
        'select full_name, phone, status, marketing_opt_in from profiles where id = $1',
        [id],
      );
      return {
        before: {
          fullName: row.full_name,
          phone: row.phone,
          status: row.status,
          marketingOptIn: row.marketing_opt_in,
        },
        after: {
          fullName: after.rows[0]?.full_name,
          phone: after.rows[0]?.phone,
          status: after.rows[0]?.status,
          marketingOptIn: after.rows[0]?.marketing_opt_in,
        },
        email: row.email,
      };
    });

    await recordAudit(req, {
      action: 'customer.updated',
      entityType: 'customer',
      entityId: id,
      before: before.before,
      after: before.after,
    });

    res.json({ updated: true, customer: { id, email: before.email, ...before.after } });
  }),
);

export default router;
