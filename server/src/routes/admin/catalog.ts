import { Router } from 'express';
import multer from 'multer';
import { parse as parseCsv } from 'csv-parse/sync';
import { z } from 'zod';
import type { Sql } from '../../db/index.js';
import { hasPerm, requirePerm } from '../../lib/auth.js';
import { badRequest, conflict, notFound, unprocessable } from '../../lib/errors.js';
import { asyncRoute, withUserDb } from '../../lib/request.js';
import { pageParams } from '../../lib/validation.js';
import { parse } from '../../lib/validation.js';
import {
  paginationMeta,
  recordAudit,
  sendCsv,
  toNumber,
  type CsvColumn,
} from './shared.js';

const router = Router();

const uuidSchema = z.string().uuid('Choose a valid record');
const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(140)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens only');
const imageUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(600)
  .refine(
    (value) => value.startsWith('/uploads/') || value.startsWith('https://'),
    'Use an uploaded image or a secure https URL',
  );
const moneySchema = z.coerce.number().int().min(0).max(10_000_000_00);
const optionalMoney = z.coerce.number().int().min(0).max(10_000_000_00).optional();
const statusSchema = z.enum(['draft', 'active']);

const specsSchema = z
  .array(z.object({ label: z.string().trim().min(1).max(80), value: z.string().trim().min(1).max(300) }))
  .max(20);

const imageSchema = z.object({
  url: imageUrlSchema,
  alt: z.string().trim().max(200).optional().default(''),
});

const variantInputSchema = z.object({
  sku: z.string().trim().min(1).max(80),
  barcode: z.string().trim().max(80).optional().or(z.literal('')),
  optionValues: z.record(z.string(), z.string()).optional().default({}),
  price: moneySchema,
  compareAtPrice: optionalMoney,
  imageUrl: imageUrlSchema.optional().or(z.literal('')),
  isActive: z.boolean().optional().default(true),
  quantity: z.coerce.number().int().min(0).max(1_000_000).optional().default(0),
  lowStockThreshold: z.coerce.number().int().min(0).max(10_000).optional(),
});

const createProductSchema = z.object({
  name: z.string().trim().min(2).max(160),
  slug: slugSchema.optional(),
  sku: z.string().trim().min(1).max(80),
  barcode: z.string().trim().max(80).optional().or(z.literal('')),
  shortDescription: z.string().trim().max(300).optional().default(''),
  description: z.string().trim().max(10_000).optional().default(''),
  categoryId: uuidSchema.nullish(),
  brandId: uuidSchema.nullish(),
  basePrice: moneySchema,
  compareAtPrice: optionalMoney,
  status: statusSchema.optional().default('draft'),
  isFeatured: z.boolean().optional().default(false),
  specs: specsSchema.optional().default([]),
  warrantyInfo: z.string().trim().max(500).optional().default(''),
  returnInfo: z.string().trim().max(500).optional().default(''),
  lowStockThreshold: z.coerce.number().int().min(0).max(10_000).optional().default(5),
  metaTitle: z.string().trim().max(160).optional().or(z.literal('')),
  metaDescription: z.string().trim().max(320).optional().or(z.literal('')),
  images: z.array(imageSchema).max(8).optional().default([]),
  variants: z.array(variantInputSchema).min(1).max(30),
  costPrice: optionalMoney,
});

const updateProductSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  slug: slugSchema.optional(),
  barcode: z.string().trim().max(80).optional().or(z.literal('')),
  shortDescription: z.string().trim().max(300).optional(),
  description: z.string().trim().max(10_000).optional(),
  categoryId: uuidSchema.nullish(),
  brandId: uuidSchema.nullish(),
  basePrice: moneySchema.optional(),
  compareAtPrice: optionalMoney,
  status: statusSchema.optional(),
  isFeatured: z.boolean().optional(),
  specs: specsSchema.optional(),
  warrantyInfo: z.string().trim().max(500).optional(),
  returnInfo: z.string().trim().max(500).optional(),
  lowStockThreshold: z.coerce.number().int().min(0).max(10_000).optional(),
  metaTitle: z.string().trim().max(160).optional().or(z.literal('')),
  metaDescription: z.string().trim().max(320).optional().or(z.literal('')),
});

const categorySchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: slugSchema.optional(),
  parentId: uuidSchema.nullish(),
  description: z.string().trim().max(1000).optional().default(''),
  imageUrl: imageUrlSchema.optional().or(z.literal('')),
  position: z.coerce.number().int().min(0).max(999).optional().default(0),
  isActive: z.boolean().optional().default(true),
  metaTitle: z.string().trim().max(160).optional().or(z.literal('')),
  metaDescription: z.string().trim().max(320).optional().or(z.literal('')),
});

const updateCategorySchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  slug: slugSchema.optional(),
  parentId: uuidSchema.nullish(),
  description: z.string().trim().max(1000).optional(),
  imageUrl: imageUrlSchema.optional().or(z.literal('')),
  position: z.coerce.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional(),
  metaTitle: z.string().trim().max(160).optional().or(z.literal('')),
  metaDescription: z.string().trim().max(320).optional().or(z.literal('')),
});

const brandSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: slugSchema.optional(),
  description: z.string().trim().max(1000).optional().default(''),
  logoUrl: imageUrlSchema.optional().or(z.literal('')),
  websiteUrl: z
    .string()
    .trim()
    .max(400)
    .refine((value) => !value || /^https?:\/\//i.test(value), 'Enter a full http(s) URL')
    .optional()
    .or(z.literal('')),
  isActive: z.boolean().optional().default(true),
});

const listQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['all', 'draft', 'active', 'archived']).optional().default('all'),
  categoryId: uuidSchema.optional(),
  brandId: uuidSchema.optional(),
  sort: z.enum(['recent', 'name', 'price', 'stock', 'sales']).optional().default('recent'),
  lowStock: z.enum(['true', 'false']).optional(),
});

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

async function uniqueSlug(db: Sql, table: 'products' | 'categories' | 'brands', base: string, excludeId?: string) {
  const root = slugify(base) || 'item';
  let candidate = root;
  for (let attempt = 2; attempt < 100; attempt += 1) {
    const result = await db.query<{ exists: boolean }>(
      `select exists (
         select 1 from ${table} where slug = $1 and ($2::uuid is null or id <> $2::uuid)
       ) as exists`,
      [candidate, excludeId ?? null],
    );
    if (!result.rows[0]?.exists) return candidate;
    candidate = `${root}-${attempt}`;
  }
  throw conflict('Could not create a unique web address for this record');
}

async function ensureCategory(db: Sql, id: string | null | undefined) {
  if (!id) return null;
  const result = await db.query<{ id: string }>('select id from categories where id = $1', [id]);
  if (!result.rows[0]) throw badRequest('The selected category no longer exists.');
  return id;
}

async function ensureBrand(db: Sql, id: string | null | undefined) {
  if (!id) return null;
  const result = await db.query<{ id: string }>('select id from brands where id = $1', [id]);
  if (!result.rows[0]) throw badRequest('The selected brand no longer exists.');
  return id;
}

router.get(
  '/products',
  requirePerm('products.read'),
  asyncRoute(async (req, res) => {
    const { page, pageSize, offset } = pageParams(req.query, { page: 1, pageSize: 20 });
    const filters = parse(listQuerySchema, req.query);
    const search = filters.q ? `%${filters.q}%` : null;
    const showCost = hasPerm(req, 'inventory.cost');

    const data = await withUserDb(req, async (db) => {
      const where = `($1::text = 'all' or p.status = $1)
        and ($2::uuid is null or p.category_id = $2)
        and ($3::uuid is null or p.brand_id = $3)
        and ($4::text is null or p.name ilike $4 or p.sku ilike $4 or coalesce(p.barcode, '') ilike $4)`;
      const baseParams = [filters.status, filters.categoryId ?? null, filters.brandId ?? null, search];
      const count = await db.query<{ total: number }>(
        `select count(*)::int as total from products p where ${where}`,
        baseParams,
      );
      const order =
        filters.sort === 'name'
          ? 'p.name asc'
          : filters.sort === 'price'
            ? 'p.base_price desc'
            : filters.sort === 'sales'
              ? 'p.sold_count desc'
              : filters.sort === 'stock'
                ? 'total_stock asc'
                : 'p.updated_at desc';
      const rows = await db.query<{
        id: string;
        name: string;
        slug: string;
        sku: string;
        status: string;
        base_price: number;
        compare_at_price: number | null;
        is_featured: boolean;
        sold_count: number;
        updated_at: Date;
        category_name: string | null;
        brand_name: string | null;
        image_url: string | null;
        variant_count: number;
        total_stock: number;
        cost_price: number | null;
      }>(
        `select p.id, p.name, p.slug, p.sku, p.status, p.base_price, p.compare_at_price, p.is_featured,
                p.sold_count, p.updated_at, c.name as category_name, b.name as brand_name,
                (select pi.url from product_images pi where pi.product_id = p.id
                  order by pi.position asc limit 1) as image_url,
                (select count(*)::int from product_variants v where v.product_id = p.id) as variant_count,
                (select coalesce(sum(i.quantity - i.reserved), 0)::int
                   from product_variants v join inventory i on i.variant_id = v.id
                  where v.product_id = p.id) as total_stock,
                ${showCost ? '(select pc.cost_price from product_costs pc where pc.product_id = p.id)' : 'null::bigint'} as cost_price
           from products p
           left join categories c on c.id = p.category_id
           left join brands b on b.id = p.brand_id
          where ${where}
          order by ${order}
          limit $5 offset $6`,
        [...baseParams, pageSize, offset],
      );
      return { total: toNumber(count.rows[0]?.total), rows: rows.rows };
    });

    res.json({
      products: data.rows.map((entry) => ({
        id: entry.id,
        name: entry.name,
        slug: entry.slug,
        sku: entry.sku,
        status: entry.status,
        basePrice: toNumber(entry.base_price),
        compareAtPrice: entry.compare_at_price === null ? null : toNumber(entry.compare_at_price),
        isFeatured: entry.is_featured,
        soldCount: toNumber(entry.sold_count),
        updatedAt: new Date(entry.updated_at).toISOString(),
        categoryName: entry.category_name,
        brandName: entry.brand_name,
        imageUrl: entry.image_url,
        variantCount: toNumber(entry.variant_count),
        totalStock: toNumber(entry.total_stock),
        costPrice: entry.cost_price === null ? null : toNumber(entry.cost_price),
      })),
      pagination: paginationMeta(page, pageSize, data.total),
    });
  }),
);

router.get(
  '/products/export',
  requirePerm('products.read'),
  asyncRoute(async (req, res) => {
    const rows = await withUserDb(req, async (db) =>
      db.query<{
        sku: string;
        name: string;
        variant_sku: string;
        status: string;
        price: number;
        stock: number;
        category: string;
        brand: string;
      }>(
        `select p.sku, p.name, v.sku as variant_sku, p.status, v.price,
                coalesce(i.quantity - i.reserved, 0)::int as stock,
                coalesce(c.slug, '') as category, coalesce(b.slug, '') as brand
           from products p
           join product_variants v on v.product_id = p.id
           left join inventory i on i.variant_id = v.id
           left join categories c on c.id = p.category_id
           left join brands b on b.id = p.brand_id
          order by p.name asc, v.position asc`,
      ),
    );
    sendCsv(
      res,
      'products',
      csvColumns,
      rows.rows.map((row) => ({ ...row, price: toNumber(row.price) / 100, stock: toNumber(row.stock) })),
    );
  }),
);

router.get(
  '/products/:id',
  requirePerm('products.read'),
  asyncRoute(async (req, res) => {
    const id = parse(uuidSchema, req.params.id);
    const showCost = hasPerm(req, 'inventory.cost');

    const data = await withUserDb(req, async (db) => {
      const productResult = await db.query<{
        id: string;
        name: string;
        slug: string;
        sku: string;
        barcode: string | null;
        short_description: string;
        description: string;
        category_id: string | null;
        brand_id: string | null;
        base_price: number;
        compare_at_price: number | null;
        status: string;
        is_featured: boolean;
        specs: unknown;
        warranty_info: string;
        return_info: string;
        low_stock_threshold: number;
        rating_avg: string;
        rating_count: number;
        sold_count: number;
        view_count: number;
        meta_title: string | null;
        meta_description: string | null;
        published_at: Date | null;
        created_at: Date;
        updated_at: Date;
        cost_price: number | null;
      }>(
        `select p.*, ${showCost ? 'pc.cost_price' : 'null::bigint as cost_price'}
           from products p
           ${showCost ? 'left join product_costs pc on pc.product_id = p.id' : ''}
          where p.id = $1`,
        [id],
      );
      const product = productResult.rows[0];
      if (!product) throw notFound('Product not found');

      const [images, options, values, variants, suppliers] = await Promise.all([
        db.query<{ id: string; url: string; alt: string; position: number }>(
          'select id, url, alt, position from product_images where product_id = $1 order by position asc',
          [id],
        ),
        db.query<{ id: string; name: string; position: number }>(
          'select id, name, position from product_options where product_id = $1 order by position asc',
          [id],
        ),
        db.query<{ id: string; option_id: string; value: string; position: number }>(
          `select v.id, v.option_id, v.value, v.position
             from product_option_values v
             join product_options o on o.id = v.option_id
            where o.product_id = $1
            order by v.position asc`,
          [id],
        ),
        db.query<{
          id: string;
          sku: string;
          barcode: string | null;
          option_values: Record<string, string>;
          price: number;
          compare_at_price: number | null;
          image_url: string | null;
          is_active: boolean;
          position: number;
          quantity: number | null;
          reserved: number | null;
          threshold: number | null;
        }>(
          `select v.id, v.sku, v.barcode, v.option_values, v.price, v.compare_at_price, v.image_url,
                  v.is_active, v.position, i.quantity, i.reserved, i.low_stock_threshold as threshold
             from product_variants v
             left join inventory i on i.variant_id = v.id
            where v.product_id = $1
            order by v.position asc, v.sku asc`,
          [id],
        ),
        db.query<{ id: string; name: string; cost_price: number | null; lead_time_days: number | null }>(
          `select s.id, s.name, sp.cost_price, sp.lead_time_days
             from supplier_products sp join suppliers s on s.id = sp.supplier_id
            where sp.product_id = $1
            order by s.name asc`,
          [id],
        ),
      ]);

      return { product, images: images.rows, options: options.rows, values: values.rows, variants: variants.rows, suppliers: suppliers.rows };
    });

    const p = data.product;
    res.json({
      product: {
        id: p.id,
        name: p.name,
        slug: p.slug,
        sku: p.sku,
        barcode: p.barcode,
        shortDescription: p.short_description,
        description: p.description,
        categoryId: p.category_id,
        brandId: p.brand_id,
        basePrice: toNumber(p.base_price),
        compareAtPrice: p.compare_at_price === null ? null : toNumber(p.compare_at_price),
        status: p.status,
        isFeatured: p.is_featured,
        specs: p.specs,
        warrantyInfo: p.warranty_info,
        returnInfo: p.return_info,
        lowStockThreshold: toNumber(p.low_stock_threshold),
        ratingAvg: Number(p.rating_avg),
        ratingCount: toNumber(p.rating_count),
        soldCount: toNumber(p.sold_count),
        viewCount: toNumber(p.view_count),
        metaTitle: p.meta_title,
        metaDescription: p.meta_description,
        publishedAt: p.published_at ? new Date(p.published_at).toISOString() : null,
        createdAt: new Date(p.created_at).toISOString(),
        updatedAt: new Date(p.updated_at).toISOString(),
        costPrice: p.cost_price === null ? null : toNumber(p.cost_price),
        images: data.images.map((image) => ({
          id: image.id,
          url: image.url,
          alt: image.alt,
          position: toNumber(image.position),
        })),
        options: data.options.map((option) => ({
          id: option.id,
          name: option.name,
          position: toNumber(option.position),
          values: data.values
            .filter((value) => value.option_id === option.id)
            .map((value) => ({ id: value.id, value: value.value, position: toNumber(value.position) })),
        })),
        variants: data.variants.map((variant) => ({
          id: variant.id,
          sku: variant.sku,
          barcode: variant.barcode,
          optionValues: variant.option_values,
          price: toNumber(variant.price),
          compareAtPrice: variant.compare_at_price === null ? null : toNumber(variant.compare_at_price),
          imageUrl: variant.image_url,
          isActive: variant.is_active,
          position: toNumber(variant.position),
          quantity: toNumber(variant.quantity),
          reserved: toNumber(variant.reserved),
          available: toNumber(variant.quantity) - toNumber(variant.reserved),
          lowStockThreshold: variant.threshold === null ? null : toNumber(variant.threshold),
        })),
        suppliers: data.suppliers.map((supplier) => ({
          id: supplier.id,
          name: supplier.name,
          costPrice: supplier.cost_price === null ? null : toNumber(supplier.cost_price),
          leadTimeDays: supplier.lead_time_days === null ? null : toNumber(supplier.lead_time_days),
        })),
      },
    });
  }),
);

router.post(
  '/products',
  requirePerm('products.write'),
  asyncRoute(async (req, res) => {
    const body = parse(createProductSchema, req.body);
    if (hasPerm(req, 'inventory.cost') && body.costPrice !== undefined && body.costPrice > body.basePrice) {
      throw unprocessable('Cost price cannot be higher than the selling price.');
    }
    if (body.variants.some((variant) => variant.quantity > 0) && !hasPerm(req, 'inventory.write')) {
      throw unprocessable('You need inventory permission to set opening stock.');
    }
    if (body.costPrice !== undefined && !hasPerm(req, 'inventory.cost')) {
      throw unprocessable('You need cost permission to set a cost price.');
    }

    const productId = await withUserDb(req, async (db) => {
      const categoryId = await ensureCategory(db, body.categoryId);
      const brandId = await ensureBrand(db, body.brandId);
      const slug = await uniqueSlug(db, 'products', body.slug ?? body.name);

      const inserted = await db.query<{ id: string }>(
        `insert into products (name, slug, sku, barcode, short_description, description, category_id,
                               brand_id, base_price, compare_at_price, status, is_featured, specs,
                               warranty_info, return_info, low_stock_threshold, meta_title,
                               meta_description, published_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16,$17,$18,$19)
         returning id`,
        [
          body.name,
          slug,
          body.sku,
          body.barcode || null,
          body.shortDescription,
          body.description,
          categoryId,
          brandId,
          body.basePrice,
          body.compareAtPrice ?? null,
          body.status,
          body.isFeatured,
          JSON.stringify(body.specs),
          body.warrantyInfo,
          body.returnInfo,
          body.lowStockThreshold,
          body.metaTitle || null,
          body.metaDescription || null,
          body.status === 'active' ? new Date().toISOString() : null,
        ],
      );
      const id = inserted.rows[0].id;

      for (const [index, image] of body.images.entries()) {
        await db.query(
          `insert into product_images (product_id, url, alt, position) values ($1,$2,$3,$4)`,
          [id, image.url, image.alt ?? '', index],
        );
      }

      const optionValues = new Map<string, Set<string>>();
      for (const variant of body.variants) {
        for (const [name, value] of Object.entries(variant.optionValues)) {
          if (!optionValues.has(name)) optionValues.set(name, new Set());
          if (value) optionValues.get(name)!.add(value);
        }
      }

      let optionPosition = 0;
      for (const [name, values] of optionValues) {
        const option = await db.query<{ id: string }>(
          `insert into product_options (product_id, name, position) values ($1,$2,$3) returning id`,
          [id, name, optionPosition++],
        );
        let valuePosition = 0;
        for (const value of values) {
          await db.query(
            `insert into product_option_values (option_id, value, position) values ($1,$2,$3)`,
            [option.rows[0].id, value, valuePosition++],
          );
        }
      }

      const canSetStock = hasPerm(req, 'inventory.write');
      for (const [index, variant] of body.variants.entries()) {
        const variantResult = await db.query<{ id: string }>(
          `insert into product_variants (product_id, sku, barcode, option_values, price, compare_at_price,
                                         image_url, is_active, position)
           values ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9)
           returning id`,
          [
            id,
            variant.sku,
            variant.barcode || null,
            JSON.stringify(variant.optionValues),
            variant.price,
            variant.compareAtPrice ?? null,
            variant.imageUrl || null,
            variant.isActive,
            index,
          ],
        );
        const variantId = variantResult.rows[0].id;
        if (!canSetStock) continue;
        const threshold = variant.lowStockThreshold ?? body.lowStockThreshold;
        await db.query(
          `insert into inventory (variant_id, quantity, reserved, low_stock_threshold)
           values ($1,$2,0,$3)`,
          [variantId, variant.quantity, threshold],
        );
        if (variant.quantity > 0) {
          await db.query(
            `insert into inventory_movements
               (variant_id, delta, reason, reference_type, note, balance_after, created_by)
             values ($1,$2,'import','product','Opening stock for new product',$3,$4)`,
            [variantId, variant.quantity, variant.quantity, req.auth?.id ?? null],
          );
        }
      }

      if (body.costPrice !== undefined) {
        await db.query(
          `insert into product_costs (product_id, cost_price) values ($1,$2)`,
          [id, body.costPrice],
        );
      }

      return id;
    });

    await recordAudit(req, {
      action: 'product.create',
      entityType: 'product',
      entityId: productId,
      after: { name: body.name, sku: body.sku, status: body.status },
    });

    res.status(201).json({ id: productId });
  }),
);

router.patch(
  '/products/:id',
  requirePerm('products.write'),
  asyncRoute(async (req, res) => {
    const id = parse(uuidSchema, req.params.id);
    const body = parse(updateProductSchema, req.body);

    const before = await withUserDb(req, async (db) => {
      const existing = await db.query<{ name: string; status: string; published_at: Date | null }>(
        'select name, status, published_at from products where id = $1',
        [id],
      );
      if (!existing.rows[0]) throw notFound('Product not found');

      const updates: string[] = [];
      const params: unknown[] = [];
      let index = 1;
      const set = (column: string, value: unknown, cast = '') => {
        updates.push(`${column} = $${index}${cast}`);
        params.push(value);
        index += 1;
      };

      if (body.name !== undefined) set('name', body.name);
      if (body.slug !== undefined) set('slug', await uniqueSlug(db, 'products', body.slug, id));
      if (body.barcode !== undefined) set('barcode', body.barcode || null);
      if (body.shortDescription !== undefined) set('short_description', body.shortDescription);
      if (body.description !== undefined) set('description', body.description);
      if (body.categoryId !== undefined) set('category_id', await ensureCategory(db, body.categoryId));
      if (body.brandId !== undefined) set('brand_id', await ensureBrand(db, body.brandId));
      if (body.basePrice !== undefined) set('base_price', body.basePrice);
      if (body.compareAtPrice !== undefined) set('compare_at_price', body.compareAtPrice ?? null);
      if (body.isFeatured !== undefined) set('is_featured', body.isFeatured);
      if (body.specs !== undefined) {
        updates.push(`specs = $${index}::jsonb`);
        params.push(JSON.stringify(body.specs));
        index += 1;
      }
      if (body.warrantyInfo !== undefined) set('warranty_info', body.warrantyInfo);
      if (body.returnInfo !== undefined) set('return_info', body.returnInfo);
      if (body.lowStockThreshold !== undefined) set('low_stock_threshold', body.lowStockThreshold);
      if (body.metaTitle !== undefined) set('meta_title', body.metaTitle || null);
      if (body.metaDescription !== undefined) set('meta_description', body.metaDescription || null);
      if (body.status !== undefined) {
        set('status', body.status);
        const alreadyPublished = Boolean(existing.rows[0].published_at);
        if (body.status === 'active' && !alreadyPublished) {
          updates.push('published_at = now()');
        }
      }

      if (updates.length === 0) throw badRequest('No changes were provided.');
      params.push(id);
      await db.query(
        `update products set ${updates.join(', ')}, updated_at = now() where id = $${index}`,
        params,
      );
      return existing.rows[0];
    });

    await recordAudit(req, {
      action: 'product.update',
      entityType: 'product',
      entityId: id,
      before,
      after: body,
    });

    res.json({ ok: true });
  }),
);

router.post(
  '/products/:id/archive',
  requirePerm('products.write'),
  asyncRoute(async (req, res) => {
    const id = parse(uuidSchema, req.params.id);
    const archived = await withUserDb(req, async (db) => {
      const result = await db.query<{ name: string; status: string }>(
        `update products set status = 'archived', updated_at = now()
          where id = $1 and status <> 'archived'
          returning name, status`,
        [id],
      );
      if (!result.rows[0]) {
        const exists = await db.query('select 1 from products where id = $1', [id]);
        if (!exists.rows[0]) throw notFound('Product not found');
        return null;
      }
      return result.rows[0];
    });
    if (archived) {
      await recordAudit(req, {
        action: 'product.archive',
        entityType: 'product',
        entityId: id,
        after: { status: 'archived' },
      });
    }
    res.json({ ok: true });
  }),
);

router.delete(
  '/products/:id',
  requirePerm('products.delete'),
  asyncRoute(async (req, res) => {
    const id = parse(uuidSchema, req.params.id);
    const deleted = await withUserDb(req, async (db) => {
      const existing = await db.query<{ name: string; slug: string }>(
        'select name, slug from products where id = $1',
        [id],
      );
      if (!existing.rows[0]) throw notFound('Product not found');
      const referenced = await db.query<{ exists: boolean }>(
        'select exists (select 1 from order_items where product_id = $1) as exists',
        [id],
      );
      if (referenced.rows[0]?.exists) {
        throw conflict('This product appears on past orders. Archive it instead of deleting it.');
      }
      const openOrders = await db.query<{ exists: boolean }>(
        `select exists (
           select 1 from order_items oi join orders o on o.id = oi.order_id
            where oi.product_id = $1
              and o.status not in ('delivered','cancelled','returned','refunded')
         ) as exists`,
        [id],
      );
      if (openOrders.rows[0]?.exists) {
        throw conflict('This product is on an open order. Wait until the order is complete.');
      }
      await db.query('delete from products where id = $1', [id]);
      return existing.rows[0];
    });
    await recordAudit(req, {
      action: 'product.delete',
      entityType: 'product',
      entityId: id,
      before: deleted,
    });
    res.json({ ok: true });
  }),
);

router.put(
  '/products/:id/images',
  requirePerm('products.write'),
  asyncRoute(async (req, res) => {
    const id = parse(uuidSchema, req.params.id);
    const images = parse(z.array(imageSchema).max(8), req.body?.images);
    await withUserDb(req, async (db) => {
      const exists = await db.query('select 1 from products where id = $1', [id]);
      if (!exists.rows[0]) throw notFound('Product not found');
      await db.query('delete from product_images where product_id = $1', [id]);
      for (const [index, image] of images.entries()) {
        await db.query(
          'insert into product_images (product_id, url, alt, position) values ($1,$2,$3,$4)',
          [id, image.url, image.alt ?? '', index],
        );
      }
    });
    await recordAudit(req, { action: 'product.images.update', entityType: 'product', entityId: id, after: images });
    res.json({ ok: true });
  }),
);

const costSchema = z.object({ costPrice: moneySchema.nullable() });

router.put(
  '/products/:id/cost',
  requirePerm('inventory.cost'),
  asyncRoute(async (req, res) => {
    const id = parse(uuidSchema, req.params.id);
    const body = parse(costSchema, req.body);
    await withUserDb(req, async (db) => {
      const exists = await db.query('select 1 from products where id = $1', [id]);
      if (!exists.rows[0]) throw notFound('Product not found');
      if (body.costPrice === null) {
        await db.query('delete from product_costs where product_id = $1', [id]);
        return;
      }
      await db.query(
        `insert into product_costs (product_id, cost_price) values ($1,$2)
         on conflict (product_id) do update set cost_price = excluded.cost_price, updated_at = now()`,
        [id, body.costPrice],
      );
    });
    await recordAudit(req, {
      action: 'product.cost.update',
      entityType: 'product',
      entityId: id,
      after: body,
    });
    res.json({ ok: true });
  }),
);

const updateVariantSchema = z.object({
  sku: z.string().trim().min(1).max(80).optional(),
  barcode: z.string().trim().max(80).optional().or(z.literal('')),
  optionValues: z.record(z.string(), z.string()).optional(),
  price: moneySchema.optional(),
  compareAtPrice: optionalMoney,
  imageUrl: imageUrlSchema.optional().or(z.literal('')),
  isActive: z.boolean().optional(),
  position: z.coerce.number().int().min(0).max(999).optional(),
  lowStockThreshold: z.coerce.number().int().min(0).max(10_000).optional(),
});

router.post(
  '/products/:productId/variants',
  requirePerm('products.write'),
  asyncRoute(async (req, res) => {
    const productId = parse(uuidSchema, req.params.productId);
    const body = parse(variantInputSchema, req.body);
    if (body.quantity > 0 && !hasPerm(req, 'inventory.write')) {
      throw unprocessable('You need inventory permission to set opening stock.');
    }

    const variantId = await withUserDb(req, async (db) => {
      const product = await db.query('select 1 from products where id = $1', [productId]);
      if (!product.rows[0]) throw notFound('Product not found');

      const position = await db.query<{ next: number }>(
        'select coalesce(max(position) + 1, 0)::int as next from product_variants where product_id = $1',
        [productId],
      );

      const inserted = await db.query<{ id: string }>(
        `insert into product_variants (product_id, sku, barcode, option_values, price, compare_at_price,
                                       image_url, is_active, position)
         values ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9)
         returning id`,
        [
          productId,
          body.sku,
          body.barcode || null,
          JSON.stringify(body.optionValues),
          body.price,
          body.compareAtPrice ?? null,
          body.imageUrl || null,
          body.isActive,
          toNumber(position.rows[0]?.next),
        ],
      );
      const id = inserted.rows[0].id;

      for (const [name, value] of Object.entries(body.optionValues)) {
        if (!name || !value) continue;
        const option = await db.query<{ id: string }>(
          `insert into product_options (product_id, name, position)
           values ($1,$2,(select coalesce(max(position) + 1, 0) from product_options where product_id = $1))
           on conflict (product_id, name) do update set name = excluded.name
           returning id`,
          [productId, name],
        );
        await db.query(
          `insert into product_option_values (option_id, value, position)
           values ($1,$2,(select coalesce(max(position) + 1, 0) from product_option_values where option_id = $1))
           on conflict (option_id, value) do nothing`,
          [option.rows[0].id, value],
        );
      }

      if (hasPerm(req, 'inventory.write')) {
        const threshold = body.lowStockThreshold ?? 5;
        await db.query(
          `insert into inventory (variant_id, quantity, reserved, low_stock_threshold)
           values ($1,$2,0,$3)`,
          [id, body.quantity, threshold],
        );
        if (body.quantity > 0) {
          await db.query(
            `insert into inventory_movements
               (variant_id, delta, reason, reference_type, note, balance_after, created_by)
             values ($1,$2,'restock','product','Opening stock for new variant',$3,$4)`,
            [id, body.quantity, body.quantity, req.auth?.id ?? null],
          );
        }
      }

      return id;
    });

    await recordAudit(req, {
      action: 'product.variant.create',
      entityType: 'product_variant',
      entityId: variantId,
      after: { productId, sku: body.sku, price: body.price },
    });
    res.status(201).json({ id: variantId });
  }),
);

router.patch(
  '/products/:productId/variants/:variantId',
  requirePerm('products.write'),
  asyncRoute(async (req, res) => {
    const productId = parse(uuidSchema, req.params.productId);
    const variantId = parse(uuidSchema, req.params.variantId);
    const body = parse(updateVariantSchema, req.body);

    await withUserDb(req, async (db) => {
      const existing = await db.query<{ sku: string }>(
        'select sku from product_variants where id = $1 and product_id = $2',
        [variantId, productId],
      );
      if (!existing.rows[0]) throw notFound('Variant not found');
      if (body.lowStockThreshold !== undefined && !hasPerm(req, 'inventory.write')) {
        throw unprocessable('You need inventory permission to change stock thresholds.');
      }

      const updates: string[] = [];
      const params: unknown[] = [];
      let index = 1;
      const set = (column: string, value: unknown, cast = '') => {
        updates.push(`${column} = $${index}${cast}`);
        params.push(value);
        index += 1;
      };
      if (body.sku !== undefined) set('sku', body.sku);
      if (body.barcode !== undefined) set('barcode', body.barcode || null);
      if (body.optionValues !== undefined) {
        updates.push(`option_values = $${index}::jsonb`);
        params.push(JSON.stringify(body.optionValues));
        index += 1;
      }
      if (body.price !== undefined) set('price', body.price);
      if (body.compareAtPrice !== undefined) set('compare_at_price', body.compareAtPrice ?? null);
      if (body.imageUrl !== undefined) set('image_url', body.imageUrl || null);
      if (body.isActive !== undefined) set('is_active', body.isActive);
      if (body.position !== undefined) set('position', body.position);
      if (updates.length === 0 && body.lowStockThreshold === undefined) {
        throw badRequest('No changes were provided.');
      }
      params.push(variantId);
      if (updates.length > 0) {
        await db.query(
          `update product_variants set ${updates.join(', ')}, updated_at = now() where id = $${index}`,
          params,
        );
      }
      if (body.lowStockThreshold !== undefined) {
        await db.query(
          'update inventory set low_stock_threshold = $2, updated_at = now() where variant_id = $1',
          [variantId, body.lowStockThreshold],
        );
      }
    });

    await recordAudit(req, {
      action: 'product.variant.update',
      entityType: 'product_variant',
      entityId: variantId,
      after: body,
    });
    res.json({ ok: true });
  }),
);

router.delete(
  '/products/:productId/variants/:variantId',
  requirePerm('products.write'),
  asyncRoute(async (req, res) => {
    const productId = parse(uuidSchema, req.params.productId);
    const variantId = parse(uuidSchema, req.params.variantId);
    const removed = await withUserDb(req, async (db) => {
      const existing = await db.query<{ sku: string; quantity: number; reserved: number }>(
        `select v.sku, i.quantity, i.reserved
           from product_variants v left join inventory i on i.variant_id = v.id
          where v.id = $1 and v.product_id = $2`,
        [variantId, productId],
      );
      const variant = existing.rows[0];
      if (!variant) throw notFound('Variant not found');
      const total = await db.query<{ count: number }>(
        'select count(*)::int as count from product_variants where product_id = $1',
        [productId],
      );
      if (toNumber(total.rows[0]?.count) <= 1) {
        throw unprocessable('A product needs at least one variant. Archive the product instead.');
      }
      if (toNumber(variant.reserved) > 0) {
        throw conflict('This variant is reserved for open orders and cannot be removed yet.');
      }
      await db.query('delete from product_variants where id = $1', [variantId]);
      return variant;
    });
    await recordAudit(req, {
      action: 'product.variant.delete',
      entityType: 'product_variant',
      entityId: variantId,
      before: removed,
    });
    res.json({ ok: true });
  }),
);

router.get(
  '/categories',
  requirePerm('products.read'),
  asyncRoute(async (req, res) => {
    const data = await withUserDb(req, async (db) =>
      db.query<{
        id: string;
        name: string;
        slug: string;
        parent_id: string | null;
        description: string;
        image_url: string | null;
        position: number;
        is_active: boolean;
        meta_title: string | null;
        meta_description: string | null;
        product_count: number;
      }>(
        `select c.id, c.name, c.slug, c.parent_id, c.description, c.image_url, c.position, c.is_active,
                c.meta_title, c.meta_description,
                (select count(*)::int from products p where p.category_id = c.id and p.status <> 'archived') as product_count
           from categories c
          order by c.position asc, c.name asc`,
      ),
    );
    res.json({
      categories: data.rows.map((entry) => ({
        id: entry.id,
        name: entry.name,
        slug: entry.slug,
        parentId: entry.parent_id,
        description: entry.description,
        imageUrl: entry.image_url,
        position: toNumber(entry.position),
        isActive: entry.is_active,
        metaTitle: entry.meta_title,
        metaDescription: entry.meta_description,
        productCount: toNumber(entry.product_count),
      })),
    });
  }),
);

async function assertNoCategoryCycle(db: Sql, id: string, parentId: string | null) {
  if (!parentId) return;
  if (parentId === id) throw badRequest('A category cannot be its own parent.');
  let cursor: string | null = parentId;
  const visited = new Set<string>();
  while (cursor) {
    if (cursor === id) throw badRequest('That parent would create a category loop.');
    if (visited.has(cursor)) break;
    visited.add(cursor);
    const parent: { rows: { parent_id: string | null }[] } = await db.query<{
      parent_id: string | null;
    }>('select parent_id from categories where id = $1', [cursor]);
    cursor = parent.rows[0]?.parent_id ?? null;
  }
}

router.post(
  '/categories',
  requirePerm('categories.write'),
  asyncRoute(async (req, res) => {
    const body = parse(categorySchema, req.body);
    const id = await withUserDb(req, async (db) => {
      if (body.parentId) {
        const parent = await db.query('select 1 from categories where id = $1', [body.parentId]);
        if (!parent.rows[0]) throw badRequest('The parent category no longer exists.');
      }
      const slug = await uniqueSlug(db, 'categories', body.slug ?? body.name);
      const result = await db.query<{ id: string }>(
        `insert into categories (parent_id, name, slug, description, image_url, position, is_active,
                                 meta_title, meta_description)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         returning id`,
        [
          body.parentId ?? null,
          body.name,
          slug,
          body.description,
          body.imageUrl || null,
          body.position,
          body.isActive,
          body.metaTitle || null,
          body.metaDescription || null,
        ],
      );
      return result.rows[0].id;
    });
    await recordAudit(req, { action: 'category.create', entityType: 'category', entityId: id, after: body });
    res.status(201).json({ id });
  }),
);

router.patch(
  '/categories/:id',
  requirePerm('categories.write'),
  asyncRoute(async (req, res) => {
    const id = parse(uuidSchema, req.params.id);
    const body = parse(updateCategorySchema, req.body);
    await withUserDb(req, async (db) => {
      const existing = await db.query('select 1 from categories where id = $1', [id]);
      if (!existing.rows[0]) throw notFound('Category not found');
      if (body.parentId !== undefined) await assertNoCategoryCycle(db, id, body.parentId);
      const updates: string[] = [];
      const params: unknown[] = [];
      let index = 1;
      const set = (column: string, value: unknown) => {
        updates.push(`${column} = $${index}`);
        params.push(value);
        index += 1;
      };
      if (body.name !== undefined) set('name', body.name);
      if (body.slug !== undefined) set('slug', await uniqueSlug(db, 'categories', body.slug, id));
      if (body.parentId !== undefined) set('parent_id', body.parentId ?? null);
      if (body.description !== undefined) set('description', body.description);
      if (body.imageUrl !== undefined) set('image_url', body.imageUrl || null);
      if (body.position !== undefined) set('position', body.position);
      if (body.isActive !== undefined) set('is_active', body.isActive);
      if (body.metaTitle !== undefined) set('meta_title', body.metaTitle || null);
      if (body.metaDescription !== undefined) set('meta_description', body.metaDescription || null);
      if (updates.length === 0) throw badRequest('No changes were provided.');
      params.push(id);
      await db.query(
        `update categories set ${updates.join(', ')}, updated_at = now() where id = $${index}`,
        params,
      );
    });
    await recordAudit(req, { action: 'category.update', entityType: 'category', entityId: id, after: body });
    res.json({ ok: true });
  }),
);

router.delete(
  '/categories/:id',
  requirePerm('categories.write'),
  asyncRoute(async (req, res) => {
    const id = parse(uuidSchema, req.params.id);
    const removed = await withUserDb(req, async (db) => {
      const existing = await db.query<{ name: string; slug: string }>(
        'select name, slug from categories where id = $1',
        [id],
      );
      if (!existing.rows[0]) throw notFound('Category not found');
      const children = await db.query('select 1 from categories where parent_id = $1 limit 1', [id]);
      if (children.rows[0]) throw conflict('Move or delete the subcategories first.');
      const products = await db.query('select 1 from products where category_id = $1 limit 1', [id]);
      if (products.rows[0]) throw conflict('Move the products in this category before deleting it.');
      await db.query('delete from categories where id = $1', [id]);
      return existing.rows[0];
    });
    await recordAudit(req, {
      action: 'category.delete',
      entityType: 'category',
      entityId: id,
      before: removed,
    });
    res.json({ ok: true });
  }),
);

router.get(
  '/brands',
  requirePerm('products.read'),
  asyncRoute(async (req, res) => {
    const data = await withUserDb(req, async (db) =>
      db.query<{
        id: string;
        name: string;
        slug: string;
        description: string;
        logo_url: string | null;
        website_url: string | null;
        is_active: boolean;
        product_count: number;
      }>(
        `select b.id, b.name, b.slug, b.description, b.logo_url, b.website_url, b.is_active,
                (select count(*)::int from products p where p.brand_id = b.id and p.status <> 'archived') as product_count
           from brands b
          order by b.name asc`,
      ),
    );
    res.json({
      brands: data.rows.map((entry) => ({
        id: entry.id,
        name: entry.name,
        slug: entry.slug,
        description: entry.description,
        logoUrl: entry.logo_url,
        websiteUrl: entry.website_url,
        isActive: entry.is_active,
        productCount: toNumber(entry.product_count),
      })),
    });
  }),
);

router.post(
  '/brands',
  requirePerm('brands.write'),
  asyncRoute(async (req, res) => {
    const body = parse(brandSchema, req.body);
    const id = await withUserDb(req, async (db) => {
      const slug = await uniqueSlug(db, 'brands', body.slug ?? body.name);
      const result = await db.query<{ id: string }>(
        `insert into brands (name, slug, description, logo_url, website_url, is_active)
         values ($1,$2,$3,$4,$5,$6) returning id`,
        [body.name, slug, body.description, body.logoUrl || null, body.websiteUrl || null, body.isActive],
      );
      return result.rows[0].id;
    });
    await recordAudit(req, { action: 'brand.create', entityType: 'brand', entityId: id, after: body });
    res.status(201).json({ id });
  }),
);

router.patch(
  '/brands/:id',
  requirePerm('brands.write'),
  asyncRoute(async (req, res) => {
    const id = parse(uuidSchema, req.params.id);
    const body = parse(brandSchema.partial(), req.body);
    await withUserDb(req, async (db) => {
      const existing = await db.query('select 1 from brands where id = $1', [id]);
      if (!existing.rows[0]) throw notFound('Brand not found');
      const updates: string[] = [];
      const params: unknown[] = [];
      let index = 1;
      const set = (column: string, value: unknown) => {
        updates.push(`${column} = $${index}`);
        params.push(value);
        index += 1;
      };
      if (body.name !== undefined) set('name', body.name);
      if (body.slug !== undefined) set('slug', await uniqueSlug(db, 'brands', body.slug, id));
      if (body.description !== undefined) set('description', body.description);
      if (body.logoUrl !== undefined) set('logo_url', body.logoUrl || null);
      if (body.websiteUrl !== undefined) set('website_url', body.websiteUrl || null);
      if (body.isActive !== undefined) set('is_active', body.isActive);
      if (updates.length === 0) throw badRequest('No changes were provided.');
      params.push(id);
      await db.query(
        `update brands set ${updates.join(', ')}, updated_at = now() where id = $${index}`,
        params,
      );
    });
    await recordAudit(req, { action: 'brand.update', entityType: 'brand', entityId: id, after: body });
    res.json({ ok: true });
  }),
);

router.delete(
  '/brands/:id',
  requirePerm('brands.write'),
  asyncRoute(async (req, res) => {
    const id = parse(uuidSchema, req.params.id);
    const removed = await withUserDb(req, async (db) => {
      const existing = await db.query<{ name: string; slug: string }>('select name, slug from brands where id = $1', [id]);
      if (!existing.rows[0]) throw notFound('Brand not found');
      const products = await db.query('select 1 from products where brand_id = $1 limit 1', [id]);
      if (products.rows[0]) throw conflict('Reassign the products for this brand before deleting it.');
      await db.query('delete from brands where id = $1', [id]);
      return existing.rows[0];
    });
    await recordAudit(req, { action: 'brand.delete', entityType: 'brand', entityId: id, before: removed });
    res.json({ ok: true });
  }),
);

const csvColumns: CsvColumn<{
  sku: string;
  name: string;
  variant_sku: string;
  status: string;
  price: number;
  stock: number;
  category: string;
  brand: string;
}>[] = [
  { key: 'sku', header: 'sku' },
  { key: 'name', header: 'name' },
  { key: 'variant_sku', header: 'variant_sku' },
  { key: 'status', header: 'status' },
  { key: 'price', header: 'price_etb' },
  { key: 'stock', header: 'stock' },
  { key: 'category', header: 'category_slug' },
  { key: 'brand', header: 'brand_slug' },
];

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024 } });

interface ImportRow {
  sku: string;
  name: string;
  variant_sku: string;
  status: 'draft' | 'active';
  price: number;
  stock: number;
  category: string;
  brand: string;
}

router.post(
  '/products/import',
  requirePerm('products.write'),
  requirePerm('inventory.write'),
  upload.single('file'),
  asyncRoute(async (req, res) => {
    if (!req.file) throw badRequest('Attach a CSV file to import.');
    let raw: Record<string, string>[];
    try {
      raw = parseCsv(req.file.buffer.toString('utf8').replace(/^\uFEFF/, ''), {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }) as Record<string, string>[];
    } catch {
      throw badRequest('The CSV file could not be read. Export a template first.');
    }
    if (!raw.length) throw badRequest('The CSV file has no rows.');
    if (raw.length > 1000) throw badRequest('Import at most 1000 rows at a time.');

    const errors: { row: number; message: string }[] = [];
    const rows: ImportRow[] = [];
    raw.forEach((entry, index) => {
      const rowNumber = index + 2;
      const sku = (entry.sku ?? '').trim();
      const name = (entry.name ?? '').trim();
      const variantSku = (entry.variant_sku ?? sku).trim();
      const priceEtb = Number(entry.price_etb);
      const stock = Number(entry.stock ?? 0);
      const status = (entry.status ?? 'draft').trim() as ImportRow['status'];
      if (!sku || !name) {
        errors.push({ row: rowNumber, message: 'sku and name are required' });
        return;
      }
      if (!Number.isFinite(priceEtb) || priceEtb < 0) {
        errors.push({ row: rowNumber, message: 'price_etb must be a positive number' });
        return;
      }
      if (!Number.isInteger(stock) || stock < 0) {
        errors.push({ row: rowNumber, message: 'stock must be a whole number' });
        return;
      }
      if (!['draft', 'active'].includes(status)) {
        errors.push({ row: rowNumber, message: "status must be 'draft' or 'active'" });
        return;
      }
      rows.push({
        sku,
        name,
        variant_sku: variantSku,
        status,
        price: Math.round(priceEtb * 100),
        stock,
        category: (entry.category_slug ?? '').trim(),
        brand: (entry.brand_slug ?? '').trim(),
      });
    });

    if (errors.length) {
      res.status(400).json({
        error: {
          code: 'invalid_csv',
          message: 'Some rows need attention before the import can run.',
          details: errors.slice(0, 20),
        },
      });
      return;
    }

    const summary = await withUserDb(req, async (db) => {
      let created = 0;
      let updated = 0;
      let skipped = 0;
      for (const row of rows) {
        const category = row.category
          ? await db.query<{ id: string }>('select id from categories where slug = $1', [row.category])
          : { rows: [] as { id: string }[] };
        if (row.category && !category.rows[0]) {
          skipped += 1;
          continue;
        }
        const brand = row.brand
          ? await db.query<{ id: string }>('select id from brands where slug = $1', [row.brand])
          : { rows: [] as { id: string }[] };
        if (row.brand && !brand.rows[0]) {
          skipped += 1;
          continue;
        }
        const existing = await db.query<{ id: string }>('select id from products where sku = $1', [row.sku]);
        let productId = existing.rows[0]?.id;
        if (productId) {
          await db.query(
            `update products set name = $2, base_price = $3, category_id = $4, brand_id = $5,
                    status = $6, published_at = case when $6 = 'active' and published_at is null then now() else published_at end,
                    updated_at = now()
              where id = $1`,
            [productId, row.name, row.price, category.rows[0]?.id ?? null, brand.rows[0]?.id ?? null, row.status],
          );
          updated += 1;
        } else {
          const slug = await uniqueSlug(db, 'products', row.name);
          const inserted = await db.query<{ id: string }>(
            `insert into products (name, slug, sku, base_price, status, category_id, brand_id, published_at)
             values ($1,$2,$3,$4,$5,$6,$7, case when $5 = 'active' then now() else null end)
             returning id`,
            [row.name, slug, row.sku, row.price, row.status, category.rows[0]?.id ?? null, brand.rows[0]?.id ?? null],
          );
          productId = inserted.rows[0].id;
          created += 1;
        }

        const variant = await db.query<{ id: string; product_id: string }>(
          'select id, product_id from product_variants where sku = $1',
          [row.variant_sku],
        );
        if (variant.rows[0] && variant.rows[0].product_id !== productId) {
          skipped += 1;
          continue;
        }
        if (variant.rows[0]) {
          await db.query('update product_variants set price = $2, updated_at = now() where id = $1', [
            variant.rows[0].id,
            row.price,
          ]);
          await db.query(
            'update inventory set quantity = $2, updated_at = now() where variant_id = $1 and $2::int >= reserved',
            [variant.rows[0].id, row.stock],
          );
        } else {
          const variantInserted = await db.query<{ id: string }>(
            `insert into product_variants (product_id, sku, option_values, price, position)
             values ($1,$2,'{}'::jsonb,$3,0) returning id`,
            [productId, row.variant_sku, row.price],
          );
          await db.query(
            'insert into inventory (variant_id, quantity) values ($1,$2)',
            [variantInserted.rows[0].id, row.stock],
          );
        }
      }
      return { created, updated, skipped, total: rows.length };
    });

    await recordAudit(req, {
      action: 'product.import',
      entityType: 'product',
      after: summary,
    });

    res.json({ summary });
  }),
);

export default router;
