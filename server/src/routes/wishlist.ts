import { Router } from 'express';
import { z } from 'zod';
import type { Sql } from '../db/index.js';
import { requireAuth } from '../lib/auth.js';
import { notFound } from '../lib/errors.js';
import { asyncRoute, withUserDb } from '../lib/request.js';
import { parse } from '../lib/validation.js';
import { getProductCardsByIds } from '../services/catalog.js';

const router = Router();

const itemSchema = z.object({ slug: z.string().trim().min(1).max(160) });

async function wishlistProductIds(db: Sql, profileId: string) {
  const result = await db.query<{ product_id: string }>(
    `select wi.product_id
       from wishlists w
       join wishlist_items wi on wi.wishlist_id = w.id
      where w.profile_id = $1
      order by wi.created_at desc`,
    [profileId],
  );
  return result.rows.map((row) => row.product_id);
}

async function ensureWishlist(db: Sql, profileId: string) {
  const existing = await db.query<{ id: string }>(
    'select id from wishlists where profile_id = $1 limit 1',
    [profileId],
  );
  if (existing.rows[0]) return existing.rows[0].id;
  const created = await db.query<{ id: string }>(
    'insert into wishlists (profile_id) values ($1) returning id',
    [profileId],
  );
  return created.rows[0]!.id;
}

function shape(products: Awaited<ReturnType<typeof getProductCardsByIds>>) {
  return products.filter((product): product is NonNullable<typeof product> => Boolean(product));
}

router.get(
  '/wishlist',
  requireAuth,
  asyncRoute(async (req, res) => {
    const user = req.auth!;
    const products = await withUserDb(req, async (db) => {
      const ids = await wishlistProductIds(db, user.id);
      return ids.length ? getProductCardsByIds(db, ids) : [];
    });
    res.json({ products: shape(products), count: products.length });
  }),
);

router.post(
  '/wishlist',
  requireAuth,
  asyncRoute(async (req, res) => {
    const body = parse(itemSchema, req.body);
    const user = req.auth!;
    const added = await withUserDb(req, async (db) => {
      const product = await db.query<{ id: string }>(
        `select id from products where slug = $1 and status = 'active' limit 1`,
        [body.slug],
      );
      const productId = product.rows[0]?.id;
      if (!productId) throw notFound('Product not found');
      const wishlistId = await ensureWishlist(db, user.id);
      await db.query(
        `insert into wishlist_items (wishlist_id, product_id) values ($1, $2)
         on conflict (wishlist_id, product_id) do nothing`,
        [wishlistId, productId],
      );
      return productId;
    });
    res.status(201).json({ ok: true, productId: added, wishlisted: true });
  }),
);

router.delete(
  '/wishlist/:slug',
  requireAuth,
  asyncRoute(async (req, res) => {
    const slug = String(req.params.slug);
    const user = req.auth!;
    await withUserDb(req, async (db) => {
      await db.query(
        `delete from wishlist_items wi
          using wishlists w, products p
          where wi.wishlist_id = w.id
            and w.profile_id = $1
            and p.slug = $2
            and wi.product_id = p.id`,
        [user.id, slug],
      );
    });
    res.json({ ok: true, wishlisted: false });
  }),
);

export default router;
