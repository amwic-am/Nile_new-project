import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { getDatabase } from '../db/index.js';
import { requireAuth } from '../lib/auth.js';
import { notFound } from '../lib/errors.js';
import { asyncRoute, sendOk, systemDb, withUserDb } from '../lib/request.js';
import { parse } from '../lib/validation.js';
import { publicWriteLimiter } from '../middleware/security.js';
import {
  createOrUpdateReview,
  getBrands,
  getCategoryTree,
  getHomeData,
  getProductCardsByIds,
  getProductDetail,
  getProductReviews,
  getSuggested,
  listProducts,
  type ListFilters,
  type SortKey,
} from '../services/catalog.js';
import { getPublicSettings } from '../services/settings.js';

const router = Router();

const sortValues = ['relevance', 'popular', 'newest', 'price_asc', 'price_desc', 'rating', 'discount'] as const;

const listQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  category: z.string().trim().max(120).optional(),
  brand: z.string().max(600).optional(),
  minPrice: z.coerce.number().int().min(0).max(1_000_000_000).optional(),
  maxPrice: z.coerce.number().int().min(0).max(1_000_000_000).optional(),
  rating: z.coerce.number().min(0).max(5).optional(),
  inStock: z.enum(['true', 'false']).optional(),
  colors: z.string().max(600).optional(),
  sizes: z.string().max(600).optional(),
  deals: z.enum(['true', 'false']).optional(),
  featured: z.enum(['true', 'false']).optional(),
  sort: z.enum(sortValues).optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
  pageSize: z.coerce.number().int().min(1).max(48).optional(),
});

function splitList(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
  return items.length ? items : undefined;
}

router.get('/home', asyncRoute(async (req, res) => {
  const result = await withUserDb(req, async (db) => ({
    ...(await getHomeData(db, req.auth?.id ?? null)),
    settings: await getPublicSettings(db),
  }));
  sendOk(res, result);
}));

router.get('/site', asyncRoute(async (req, res) => {
  const settings = await withUserDb(req, (db) => getPublicSettings(db));
  sendOk(res, {
    ...settings,
    integrations: {
      chapa: Boolean(config.chapa.secretKey),
      cod: config.payments.codEnabled,
    },
  });
}));

router.get('/categories', asyncRoute(async (req, res) => {
  const categories = await withUserDb(req, (db) => getCategoryTree(db));
  sendOk(res, { categories });
}));

router.get('/brands', asyncRoute(async (req, res) => {
  const brands = await withUserDb(req, (db) => getBrands(db));
  sendOk(res, { brands });
}));

router.get('/products/suggest', asyncRoute(async (req, res) => {
  const query = parse(z.object({ q: z.string().trim().max(120).default('') }), req.query);
  if (query.q.length < 2) {
    sendOk(res, { products: [], categories: [], brands: [] });
    return;
  }
  const suggestions = await withUserDb(req, (db) => getSuggested(db, query.q));
  sendOk(res, suggestions);
}));

router.get('/products/by-ids', asyncRoute(async (req, res) => {
  const query = parse(z.object({ ids: z.string().max(1200).default('') }), req.query);
  const ids = query.ids.split(',').map((id) => id.trim()).filter(Boolean);
  const products = await withUserDb(req, (db) => getProductCardsByIds(db, ids));
  sendOk(res, { products });
}));

router.get('/products', asyncRoute(async (req, res) => {
  const query = parse(listQuerySchema, req.query);
  const filters: ListFilters = {
    q: query.q || undefined,
    categorySlug: query.category && query.category !== 'all' ? query.category : undefined,
    brands: splitList(query.brand),
    minPrice: query.minPrice,
    maxPrice: query.maxPrice,
    rating: query.rating,
    inStock: query.inStock === 'true',
    colors: splitList(query.colors),
    sizes: splitList(query.sizes),
    deals: query.deals === 'true',
    featured: query.featured === 'true',
  };

  const result = await withUserDb(req, (db) =>
    listProducts(db, filters, {
      sort: (query.sort ?? (filters.q ? 'relevance' : 'popular')) as SortKey,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 24,
    }),
  );
  sendOk(res, result);
}));

router.get('/products/:slug', asyncRoute(async (req, res) => {
  const slug = String(req.params.slug);
  const product = await withUserDb(req, (db) => getProductDetail(db, slug));

  if (!req.auth?.isStaff) {
    void systemDb((db) =>
      db.query(`update products set view_count = view_count + 1 where id = $1`, [product.id]),
    ).catch(() => undefined);
  }

  sendOk(res, { product });
}));

router.get('/products/:slug/reviews', asyncRoute(async (req, res) => {
  const slug = String(req.params.slug);
  const query = parse(
    z.object({
      page: z.coerce.number().int().min(1).max(1000).optional(),
      rating: z.coerce.number().int().min(1).max(5).optional(),
    }),
    req.query,
  );
  const result = await withUserDb(req, (db) =>
    getProductReviews(db, slug, { page: query.page ?? 1, rating: query.rating }),
  );
  sendOk(res, result);
}));

router.post('/products/:slug/reviews', requireAuth, asyncRoute(async (req, res) => {
  const slug = String(req.params.slug);
  const body = parse(
    z.object({
      rating: z.coerce.number().int().min(1).max(5),
      title: z.string().trim().max(110).default(''),
      body: z.string().trim().min(10, 'Share at least 10 characters').max(2000),
    }),
    req.body,
  );
  const result = await withUserDb(req, (db) =>
    createOrUpdateReview(db, slug, req.auth!.id, req.auth!.fullName, body),
  );
  sendOk(
    res,
    {
      ...result,
      message: 'Thanks for your review. It will appear once approved by our team.',
    },
    201,
  );
}));

router.get('/content/:slug', asyncRoute(async (req, res) => {
  const slug = String(req.params.slug);
  const page = await withUserDb(req, async (db) => {
    const result = await db.query<{
      slug: string;
      title: string;
      body_md: string;
      meta_title: string | null;
      meta_description: string | null;
      updated_at: Date;
    }>(
      `select slug, title, body_md, meta_title, meta_description, updated_at
         from content_pages where slug = $1 and is_published = true limit 1`,
      [slug],
    );
    return result.rows[0];
  });
  if (!page) throw notFound('Page not found');
  sendOk(res, {
    page: {
      slug: page.slug,
      title: page.title,
      body: page.body_md,
      metaTitle: page.meta_title,
      metaDescription: page.meta_description,
      updatedAt: new Date(page.updated_at).toISOString(),
    },
  });
}));

router.post('/newsletter', publicWriteLimiter, asyncRoute(async (req, res) => {
  const body = parse(
    z.object({ email: z.string().trim().min(5).max(254).email(), source: z.string().max(40).optional() }),
    req.body,
  );
  const email = body.email.toLowerCase();
  await systemDb((db) =>
    db.query(
      `insert into newsletter_subscribers (email, source)
       values ($1, $2)
       on conflict (lower(email)) do update
         set status = 'subscribed', source = excluded.source`,
      [email, body.source ?? 'footer'],
    ),
  );
  sendOk(res, { message: 'You are on the list. Watch your inbox for offers and new arrivals.' }, 201);
}));

export default router;
