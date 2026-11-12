import { Router } from 'express';
import { z } from 'zod';
import { getDatabase } from '../../db/index.js';
import { requirePerm } from '../../lib/auth.js';
import { notFound } from '../../lib/errors.js';
import { asyncRoute, withUserDb } from '../../lib/request.js';
import { pageParams, parse } from '../../lib/validation.js';
import { paginationMeta, recordAudit, toNumber } from './shared.js';

const router = Router();

const uuidSchema = z.string().uuid('Choose a valid review');

const listQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['all', 'pending', 'approved', 'rejected']).optional().default('all'),
  productId: z.string().uuid().optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
});

const updateSchema = z
  .object({
    status: z.enum(['pending', 'approved', 'rejected']).optional(),
    adminReply: z.string().trim().max(2000).optional().nullable(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Nothing to update');

async function refreshProductRating(productId: string) {
  const db = await getDatabase();
  await db.query(
    `update products p set
       rating_avg = coalesce((
         select round(avg(r.rating)::numeric, 2) from reviews r
          where r.product_id = p.id and r.status = 'approved'
       ), 0),
       rating_count = (
         select count(*)::int from reviews r
          where r.product_id = p.id and r.status = 'approved'
       ),
       updated_at = now()
     where p.id = $1`,
    [productId],
  );
}

router.get(
  '/reviews',
  requirePerm('reviews.moderate'),
  asyncRoute(async (req, res) => {
    const { page, pageSize, offset } = pageParams(req.query, { page: 1, pageSize: 25 });
    const filters = parse(listQuerySchema, req.query);
    const search = filters.q ? `%${filters.q}%` : null;

    const data = await withUserDb(req, async (db) => {
      const where = `($1::text = 'all' or r.status = $1)
        and ($2::uuid is null or r.product_id = $2)
        and ($3::int is null or r.rating = $3)
        and ($4::text is null or r.title ilike $4 or r.body ilike $4 or p.name ilike $4
             or pr.email ilike $4 or pr.full_name ilike $4)`;
      const params = [filters.status, filters.productId ?? null, filters.rating ?? null, search];
      const count = await db.query<{ total: number }>(
        `select count(*)::int as total
           from reviews r
           join products p on p.id = r.product_id
           join profiles pr on pr.id = r.profile_id
          where ${where}`,
        params,
      );
      const rows = await db.query<{
        id: string;
        product_id: string;
        product_name: string;
        product_slug: string;
        profile_id: string;
        customer_name: string;
        email: string;
        order_number: string | null;
        rating: number;
        title: string;
        body: string;
        status: string;
        admin_reply: string | null;
        created_at: Date;
        updated_at: Date;
      }>(
        `select r.id, r.product_id, p.name as product_name, p.slug as product_slug,
                r.profile_id, pr.full_name as customer_name, pr.email,
                o.order_number, r.rating, r.title, r.body, r.status, r.admin_reply,
                r.created_at, r.updated_at
           from reviews r
           join products p on p.id = r.product_id
           join profiles pr on pr.id = r.profile_id
           left join orders o on o.id = r.order_id
          where ${where}
          order by r.created_at desc
          limit $5 offset $6`,
        [...params, pageSize, offset],
      );
      const counts = await db.query<{ status: string; total: number }>(
        'select status, count(*)::int as total from reviews group by status',
      );
      return {
        total: toNumber(count.rows[0]?.total),
        rows: rows.rows,
        counts: counts.rows,
      };
    });

    res.json({
      reviews: data.rows.map((row) => ({
        id: row.id,
        productId: row.product_id,
        productName: row.product_name,
        productSlug: row.product_slug,
        customer: { id: row.profile_id, name: row.customer_name, email: row.email },
        orderNumber: row.order_number,
        rating: toNumber(row.rating),
        title: row.title,
        body: row.body,
        status: row.status,
        adminReply: row.admin_reply,
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString(),
      })),
      counts: data.counts.reduce<Record<string, number>>((acc, entry) => {
        acc[entry.status] = toNumber(entry.total);
        return acc;
      }, {}),
      pagination: paginationMeta(page, pageSize, data.total),
    });
  }),
);

router.patch(
  '/reviews/:id',
  requirePerm('reviews.moderate'),
  asyncRoute(async (req, res) => {
    const id = parse(uuidSchema, req.params.id);
    const input = parse(updateSchema, req.body);

    const before = await withUserDb(req, async (db) => {
      const existing = await db.query<{
        id: string;
        product_id: string;
        status: string;
        admin_reply: string | null;
        title: string;
      }>('select id, product_id, status, admin_reply, title from reviews where id = $1 limit 1', [id]);
      const row = existing.rows[0];
      if (!row) throw notFound('Review not found');
      await db.query(
        `update reviews set
           status = coalesce($2, status),
           admin_reply = case when $3::boolean then nullif($4, '') else admin_reply end,
           updated_at = now()
         where id = $1`,
        [
          id,
          input.status ?? null,
          input.adminReply !== undefined,
          input.adminReply ?? null,
        ],
      );
      return row;
    });

    if (input.status !== undefined) await refreshProductRating(before.product_id);

    await recordAudit(req, {
      action: 'review.moderated',
      entityType: 'review',
      entityId: id,
      before: { status: before.status, adminReply: before.admin_reply },
      after: input,
    });
    res.json({ updated: true });
  }),
);

router.delete(
  '/reviews/:id',
  requirePerm('reviews.moderate'),
  asyncRoute(async (req, res) => {
    const id = parse(uuidSchema, req.params.id);
    const removed = await withUserDb(req, async (db) => {
      const existing = await db.query<{
        product_id: string;
        status: string;
        title: string;
      }>('select product_id, status, title from reviews where id = $1 limit 1', [id]);
      const row = existing.rows[0];
      if (!row) throw notFound('Review not found');
      await db.query('delete from reviews where id = $1', [id]);
      return row;
    });

    if (removed.status === 'approved') await refreshProductRating(removed.product_id);

    await recordAudit(req, {
      action: 'review.deleted',
      entityType: 'review',
      entityId: id,
      before: { title: removed.title, status: removed.status },
    });
    res.json({ deleted: true });
  }),
);

export default router;
