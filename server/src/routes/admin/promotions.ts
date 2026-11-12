import { Router } from 'express';
import { z } from 'zod';
import type { Sql } from '../../db/index.js';
import { requirePerm } from '../../lib/auth.js';
import { conflict, notFound, unprocessable } from '../../lib/errors.js';
import { asyncRoute, withUserDb } from '../../lib/request.js';
import { pageParams, parse } from '../../lib/validation.js';
import { paginationMeta, recordAudit, sendCsv, toNumber, type CsvColumn } from './shared.js';

const router = Router();

const uuidSchema = z.string().uuid('Choose a valid record');
const text = (max: number) => z.string().trim().max(max);

const couponCodeSchema = z
  .string()
  .trim()
  .min(3)
  .max(40)
  .regex(/^[A-Za-z0-9_-]+$/, 'Use letters, numbers, hyphens or underscores only')
  .transform((value) => value.toUpperCase());

const couponSchema = z
  .object({
    code: couponCodeSchema,
    description: text(300).optional().default(''),
    discountType: z.enum(['percentage', 'fixed']),
    discountValue: z.coerce.number().positive().max(10_000_000),
    minOrder: z.coerce.number().min(0).max(10_000_000).optional().default(0),
    maxDiscount: z.coerce.number().positive().max(10_000_000).optional().nullable(),
    startsAt: z.string().datetime({ offset: true }).optional().nullable(),
    endsAt: z.string().datetime({ offset: true }).optional().nullable(),
    usageLimit: z.coerce.number().int().positive().max(1_000_000).optional().nullable(),
    perUserLimit: z.coerce.number().int().positive().max(100).optional().default(1),
    isActive: z.boolean().optional().default(true),
    appliesTo: z.enum(['all', 'products', 'categories']).optional().default('all'),
    productIds: z.array(uuidSchema).max(200).optional().default([]),
    categoryIds: z.array(uuidSchema).max(100).optional().default([]),
  })
  .superRefine((value, context) => {
    if (value.discountType === 'percentage' && value.discountValue > 100) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['discountValue'],
        message: 'A percentage discount cannot exceed 100%.',
      });
    }
    if (value.startsAt && value.endsAt && new Date(value.startsAt) >= new Date(value.endsAt)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endsAt'],
        message: 'The end date must be after the start date.',
      });
    }
    if (value.appliesTo === 'products' && !value.productIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['productIds'],
        message: 'Choose at least one product.',
      });
    }
    if (value.appliesTo === 'categories' && !value.categoryIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['categoryIds'],
        message: 'Choose at least one category.',
      });
    }
  });

const couponUpdateSchema = z
  .object({
    code: couponCodeSchema.optional(),
    description: text(300).optional(),
    discountType: z.enum(['percentage', 'fixed']).optional(),
    discountValue: z.coerce.number().positive().max(10_000_000).optional(),
    minOrder: z.coerce.number().min(0).max(10_000_000).optional(),
    maxDiscount: z.coerce.number().positive().max(10_000_000).optional().nullable(),
    startsAt: z.string().datetime({ offset: true }).optional().nullable(),
    endsAt: z.string().datetime({ offset: true }).optional().nullable(),
    usageLimit: z.coerce.number().int().positive().max(1_000_000).optional().nullable(),
    perUserLimit: z.coerce.number().int().positive().max(100).optional(),
    isActive: z.boolean().optional(),
    appliesTo: z.enum(['all', 'products', 'categories']).optional(),
    productIds: z.array(uuidSchema).max(200).optional(),
    categoryIds: z.array(uuidSchema).max(100).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Nothing to update');

const newsletterQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(['all', 'subscribed', 'unsubscribed']).optional().default('all'),
});

const bannerSchema = z.object({
  title: text(120).min(2),
  subtitle: text(240).optional().default(''),
  eyebrow: text(60).optional().default(''),
  imageUrl: text(600).optional().nullable(),
  linkUrl: text(400)
    .refine(
      (value) => value === '' || value.startsWith('/') || value.startsWith('https://'),
      'Use a store path or a secure https URL',
    )
    .optional()
    .nullable(),
  linkLabel: text(60).optional().default('Shop now'),
  placement: z.enum(['hero', 'promo', 'category']).optional().default('hero'),
  theme: z.enum(['navy', 'light', 'gold']).optional().default('navy'),
  position: z.coerce.number().int().min(0).max(999).optional().default(0),
  isActive: z.boolean().optional().default(true),
  startsAt: z.string().datetime({ offset: true }).optional().nullable(),
  endsAt: z.string().datetime({ offset: true }).optional().nullable(),
});

const bannerUpdateSchema = bannerSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'Nothing to update',
);

const imageUrlSchema = z
  .string()
  .trim()
  .max(600)
  .refine(
    (value) => value === '' || value.startsWith('/uploads/') || value.startsWith('https://'),
    'Use an uploaded image or a secure https URL',
  );

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === '23505',
  );
}

function couponStatusSql(alias = 'c') {
  return `case
    when not ${alias}.is_active then 'inactive'
    when ${alias}.starts_at is not null and ${alias}.starts_at > now() then 'scheduled'
    when ${alias}.ends_at is not null and ${alias}.ends_at < now() then 'expired'
    when ${alias}.usage_limit is not null and ${alias}.used_count >= ${alias}.usage_limit then 'exhausted'
    else 'active'
  end`;
}

function couponToApi(row: {
  id: string;
  code: string;
  description: string;
  discount_type: string;
  discount_value: number;
  min_order: number;
  max_discount: number | null;
  starts_at: Date | null;
  ends_at: Date | null;
  usage_limit: number | null;
  per_user_limit: number;
  used_count: number;
  is_active: boolean;
  applies_to: string;
  created_at: Date;
  updated_at: Date;
}) {
  return {
    id: row.id,
    code: row.code,
    description: row.description,
    discountType: row.discount_type,
    discountValue: toNumber(row.discount_value) / 100,
    minOrder: toNumber(row.min_order),
    maxDiscount: row.max_discount === null ? null : toNumber(row.max_discount),
    startsAt: row.starts_at ? new Date(row.starts_at).toISOString() : null,
    endsAt: row.ends_at ? new Date(row.ends_at).toISOString() : null,
    usageLimit: row.usage_limit === null ? null : toNumber(row.usage_limit),
    perUserLimit: toNumber(row.per_user_limit),
    usedCount: toNumber(row.used_count),
    isActive: row.is_active,
    appliesTo: row.applies_to,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

async function replaceCouponScope(
  db: Sql,
  couponId: string,
  appliesTo: string,
  productIds: string[],
  categoryIds: string[],
) {
  await db.query('delete from coupon_products where coupon_id = $1', [couponId]);
  await db.query('delete from coupon_categories where coupon_id = $1', [couponId]);

  if (appliesTo === 'products') {
    const unique = [...new Set(productIds)];
    const found = await db.query<{ total: number }>(
      'select count(*)::int as total from products where id = any($1::uuid[])',
      [unique],
    );
    if (Number(found.rows[0]?.total ?? 0) !== unique.length) {
      throw unprocessable('One or more selected products no longer exist.');
    }
    for (const productId of unique) {
      await db.query('insert into coupon_products (coupon_id, product_id) values ($1, $2)', [
        couponId,
        productId,
      ]);
    }
  }

  if (appliesTo === 'categories') {
    const unique = [...new Set(categoryIds)];
    const found = await db.query<{ total: number }>(
      'select count(*)::int as total from categories where id = any($1::uuid[])',
      [unique],
    );
    if (Number(found.rows[0]?.total ?? 0) !== unique.length) {
      throw unprocessable('One or more selected categories no longer exist.');
    }
    for (const categoryId of unique) {
      await db.query('insert into coupon_categories (coupon_id, category_id) values ($1, $2)', [
        couponId,
        categoryId,
      ]);
    }
  }
}

router.get(
  '/coupons/export',
  requirePerm('promotions.read'),
  asyncRoute(async (req, res) => {
    const rows = await withUserDb(req, async (db) =>
      db.query<{
        code: string;
        description: string;
        discount_type: string;
        discount_value: number;
        min_order: number;
        used_count: number;
        usage_limit: number | null;
        is_active: boolean;
        starts_at: Date | null;
        ends_at: Date | null;
        status: string;
      }>(
        `select c.code, c.description, c.discount_type, c.discount_value, c.min_order,
                c.used_count, c.usage_limit, c.is_active, c.starts_at, c.ends_at,
                ${couponStatusSql()} as status
           from coupons c order by c.created_at desc limit 5000`,
      ),
    );
    const columns: CsvColumn<{
      code: string;
      description: string;
      type: string;
      value: number;
      min_order: number;
      used: string;
      status: string;
      starts: string;
      ends: string;
    }>[] = [
      { key: 'code', header: 'Code' },
      { key: 'description', header: 'Description' },
      { key: 'type', header: 'Type' },
      { key: 'value', header: 'Value' },
      { key: 'min_order', header: 'Minimum order (ETB)' },
      { key: 'used', header: 'Used / limit' },
      { key: 'status', header: 'Status' },
      { key: 'starts', header: 'Starts' },
      { key: 'ends', header: 'Ends' },
    ];
    sendCsv(
      res,
      'coupons',
      columns,
      rows.rows.map((row) => ({
        code: row.code,
        description: row.description,
        type: row.discount_type,
        value: toNumber(row.discount_value) / 100,
        min_order: toNumber(row.min_order) / 100,
        used: `${row.used_count}${row.usage_limit === null ? '' : ` / ${row.usage_limit}`}`,
        status: row.status,
        starts: row.starts_at ? new Date(row.starts_at).toISOString() : '',
        ends: row.ends_at ? new Date(row.ends_at).toISOString() : '',
      })),
    );
  }),
);

router.get(
  '/coupons',
  requirePerm('promotions.read'),
  asyncRoute(async (req, res) => {
    const { page, pageSize, offset } = pageParams(req.query, { page: 1, pageSize: 25 });
    const filters = parse(
      z.object({
        q: z.string().trim().max(80).optional(),
        status: z
          .enum(['all', 'active', 'scheduled', 'expired', 'exhausted', 'inactive'])
          .optional()
          .default('all'),
      }),
      req.query,
    );
    const search = filters.q ? `%${filters.q}%` : null;

    const data = await withUserDb(req, async (db) => {
      const where = `($1::text is null or c.code ilike $1 or c.description ilike $1)
        and ($2::text = 'all' or ${couponStatusSql()} = $2)`;
      const count = await db.query<{ total: number }>(
        `select count(*)::int as total from coupons c where ${where}`,
        [search, filters.status],
      );
      const rows = await db.query<{
        id: string;
        code: string;
        description: string;
        discount_type: string;
        discount_value: number;
        min_order: number;
        max_discount: number | null;
        starts_at: Date | null;
        ends_at: Date | null;
        usage_limit: number | null;
        per_user_limit: number;
        used_count: number;
        is_active: boolean;
        applies_to: string;
        created_at: Date;
        updated_at: Date;
        status: string;
        redemptions: number;
        discount_given: number;
      }>(
        `select c.*, ${couponStatusSql()} as status,
                (select count(*)::int from coupon_redemptions cr where cr.coupon_id = c.id) as redemptions,
                (select coalesce(sum(cr.discount_amount), 0)::bigint
                   from coupon_redemptions cr where cr.coupon_id = c.id) as discount_given
           from coupons c where ${where}
          order by c.created_at desc
          limit $3 offset $4`,
        [search, filters.status, pageSize, offset],
      );
      return { total: toNumber(count.rows[0]?.total), rows: rows.rows };
    });

    res.json({
      coupons: data.rows.map((row) => ({
        ...couponToApi(row),
        status: row.status,
        redemptions: toNumber(row.redemptions),
        discountGiven: toNumber(row.discount_given),
      })),
      pagination: paginationMeta(page, pageSize, data.total),
    });
  }),
);

router.get(
  '/coupons/:id',
  requirePerm('promotions.read'),
  asyncRoute(async (req, res) => {
    const id = parse(uuidSchema, req.params.id);
    const data = await withUserDb(req, async (db) => {
      const coupon = await db.query<Parameters<typeof couponToApi>[0] & { status: string }>(
        `select c.*, ${couponStatusSql()} as status from coupons c where c.id = $1 limit 1`,
        [id],
      );
      const row = coupon.rows[0];
      if (!row) throw notFound('Discount code not found');
      const products = await db.query<{ id: string; name: string }>(
        `select p.id, p.name from coupon_products cp
           join products p on p.id = cp.product_id
          where cp.coupon_id = $1 order by p.name`,
        [id],
      );
      const categories = await db.query<{ id: string; name: string }>(
        `select c.id, c.name from coupon_categories cc
           join categories c on c.id = cc.category_id
          where cc.coupon_id = $1 order by c.name`,
        [id],
      );
      return { row, products: products.rows, categories: categories.rows };
    });

    res.json({
      coupon: {
        ...couponToApi(data.row),
        status: data.row.status,
        productIds: data.products.map((entry) => entry.id),
        categoryIds: data.categories.map((entry) => entry.id),
        products: data.products,
        categories: data.categories,
      },
    });
  }),
);

router.post(
  '/coupons',
  requirePerm('promotions.write'),
  asyncRoute(async (req, res) => {
    const input = parse(couponSchema, req.body);
    let couponId = '';
    try {
      couponId = await withUserDb(req, async (db) => {
        const inserted = await db.query<{ id: string }>(
          `insert into coupons (code, description, discount_type, discount_value, min_order,
                                max_discount, starts_at, ends_at, usage_limit, per_user_limit,
                                is_active, applies_to, created_by)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           returning id`,
          [
            input.code,
            input.description,
            input.discountType,
            Math.round(input.discountValue * 100),
            Math.round(input.minOrder * 100),
            input.maxDiscount ? Math.round(input.maxDiscount * 100) : null,
            input.startsAt ?? null,
            input.endsAt ?? null,
            input.usageLimit ?? null,
            input.perUserLimit,
            input.isActive,
            input.appliesTo,
            req.auth?.id ?? null,
          ],
        );
        const id = inserted.rows[0].id;
        await replaceCouponScope(db, id, input.appliesTo, input.productIds, input.categoryIds);
        return id;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict('A discount code with that name already exists.');
      throw error;
    }

    await recordAudit(req, {
      action: 'promotion.coupon_created',
      entityType: 'coupon',
      entityId: couponId,
      after: {
        code: input.code,
        discountType: input.discountType,
        discountValue: input.discountValue,
        appliesTo: input.appliesTo,
      },
    });
    res.status(201).json({ coupon: { id: couponId, code: input.code } });
  }),
);

router.patch(
  '/coupons/:id',
  requirePerm('promotions.write'),
  asyncRoute(async (req, res) => {
    const id = parse(uuidSchema, req.params.id);
    const input = parse(couponUpdateSchema, req.body);

    const before = await withUserDb(req, async (db) => {
      const existing = await db.query<Parameters<typeof couponToApi>[0]>(
        'select * from coupons where id = $1 limit 1',
        [id],
      );
      const row = existing.rows[0];
      if (!row) throw notFound('Discount code not found');

      const discountType = input.discountType ?? row.discount_type;
      const discountValue =
        input.discountValue !== undefined
          ? input.discountValue
          : toNumber(row.discount_value) / 100;
      if (discountType === 'percentage' && discountValue > 100) {
        throw unprocessable('A percentage discount cannot exceed 100%.');
      }
      const startsAt = input.startsAt !== undefined ? input.startsAt : row.starts_at;
      const endsAt = input.endsAt !== undefined ? input.endsAt : row.ends_at;
      if (startsAt && endsAt && new Date(startsAt) >= new Date(endsAt)) {
        throw unprocessable('The end date must be after the start date.');
      }
      const appliesTo = input.appliesTo ?? row.applies_to;
      if (appliesTo === 'products' && input.productIds && !input.productIds.length) {
        throw unprocessable('Choose at least one product.');
      }
      if (appliesTo === 'categories' && input.categoryIds && !input.categoryIds.length) {
        throw unprocessable('Choose at least one category.');
      }

      try {
        await db.query(
          `update coupons set
             code = coalesce($2, code),
             description = coalesce($3, description),
             discount_type = coalesce($4, discount_type),
             discount_value = coalesce($5, discount_value),
             min_order = coalesce($6, min_order),
             max_discount = case when $7::boolean then $8 else max_discount end,
             starts_at = case when $9::boolean then $10::timestamptz else starts_at end,
             ends_at = case when $11::boolean then $12::timestamptz else ends_at end,
             usage_limit = case when $13::boolean then $14 else usage_limit end,
             per_user_limit = coalesce($15, per_user_limit),
             is_active = coalesce($16, is_active),
             applies_to = coalesce($17, applies_to),
             updated_at = now()
           where id = $1`,
          [
            id,
            input.code ?? null,
            input.description ?? null,
            input.discountType ?? null,
            input.discountValue !== undefined ? Math.round(input.discountValue * 100) : null,
            input.minOrder !== undefined ? Math.round(input.minOrder * 100) : null,
            input.maxDiscount !== undefined,
            input.maxDiscount ? Math.round(input.maxDiscount * 100) : null,
            input.startsAt !== undefined,
            input.startsAt ?? null,
            input.endsAt !== undefined,
            input.endsAt ?? null,
            input.usageLimit !== undefined,
            input.usageLimit ?? null,
            input.perUserLimit ?? null,
            input.isActive ?? null,
            input.appliesTo ?? null,
          ],
        );
      } catch (error) {
        if (isUniqueViolation(error)) throw conflict('A discount code with that name already exists.');
        throw error;
      }

      if (input.appliesTo !== undefined || input.productIds !== undefined || input.categoryIds !== undefined) {
        const products =
          input.productIds ??
          (await db.query<{ id: string }>('select product_id as id from coupon_products where coupon_id = $1', [
            id,
          ])).rows.map((entry) => entry.id);
        const categories =
          input.categoryIds ??
          (await db.query<{ id: string }>('select category_id as id from coupon_categories where coupon_id = $1', [
            id,
          ])).rows.map((entry) => entry.id);
        if (appliesTo === 'products' && !products.length) {
          throw unprocessable('Choose at least one product.');
        }
        if (appliesTo === 'categories' && !categories.length) {
          throw unprocessable('Choose at least one category.');
        }
        await replaceCouponScope(db, id, appliesTo, products, categories);
      }

      return couponToApi(row);
    });

    await recordAudit(req, {
      action: 'promotion.coupon_updated',
      entityType: 'coupon',
      entityId: id,
      before,
      after: input,
    });
    res.json({ updated: true, couponId: id });
  }),
);

router.delete(
  '/coupons/:id',
  requirePerm('promotions.write'),
  asyncRoute(async (req, res) => {
    const id = parse(uuidSchema, req.params.id);
    await withUserDb(req, async (db) => {
      const existing = await db.query<{ code: string; redemptions: number }>(
        `select c.code,
                (select count(*)::int from coupon_redemptions cr where cr.coupon_id = c.id) as redemptions
           from coupons c where c.id = $1 limit 1`,
        [id],
      );
      const row = existing.rows[0];
      if (!row) throw notFound('Discount code not found');
      if (Number(row.redemptions) > 0) {
        throw unprocessable('This code has redemptions. Deactivate it instead of deleting it.');
      }
      await db.query('delete from coupon_products where coupon_id = $1', [id]);
      await db.query('delete from coupon_categories where coupon_id = $1', [id]);
      await db.query('delete from coupons where id = $1', [id]);
    });
    await recordAudit(req, {
      action: 'promotion.coupon_deleted',
      entityType: 'coupon',
      entityId: id,
    });
    res.json({ deleted: true });
  }),
);

router.get(
  '/banners',
  requirePerm('promotions.read'),
  asyncRoute(async (req, res) => {
    const banners = await withUserDb(req, async (db) =>
      db.query<{
        id: string;
        title: string;
        subtitle: string;
        eyebrow: string;
        image_url: string | null;
        link_url: string | null;
        link_label: string;
        placement: string;
        theme: string;
        position: number;
        is_active: boolean;
        starts_at: Date | null;
        ends_at: Date | null;
        updated_at: Date;
      }>(
        `select id, title, subtitle, eyebrow, image_url, link_url, link_label, placement, theme,
                position, is_active, starts_at, ends_at, updated_at
           from banners order by placement, position, created_at desc`,
      ),
    );
    res.json({
      banners: banners.rows.map((banner) => ({
        id: banner.id,
        title: banner.title,
        subtitle: banner.subtitle,
        eyebrow: banner.eyebrow,
        imageUrl: banner.image_url,
        linkUrl: banner.link_url,
        linkLabel: banner.link_label,
        placement: banner.placement,
        theme: banner.theme,
        position: toNumber(banner.position),
        isActive: banner.is_active,
        startsAt: banner.starts_at ? new Date(banner.starts_at).toISOString() : null,
        endsAt: banner.ends_at ? new Date(banner.ends_at).toISOString() : null,
        updatedAt: new Date(banner.updated_at).toISOString(),
      })),
    });
  }),
);

router.post(
  '/banners',
  requirePerm('promotions.write'),
  asyncRoute(async (req, res) => {
    const input = parse(bannerSchema, req.body);
    const imageUrl =
      input.imageUrl === undefined || input.imageUrl === null || input.imageUrl === ''
        ? null
        : parse(imageUrlSchema, input.imageUrl);
    const id = await withUserDb(req, async (db) => {
      const inserted = await db.query<{ id: string }>(
        `insert into banners (title, subtitle, eyebrow, image_url, link_url, link_label, placement,
                              theme, position, is_active, starts_at, ends_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         returning id`,
        [
          input.title,
          input.subtitle,
          input.eyebrow,
          imageUrl,
          input.linkUrl || null,
          input.linkLabel,
          input.placement,
          input.theme,
          input.position,
          input.isActive,
          input.startsAt ?? null,
          input.endsAt ?? null,
        ],
      );
      return inserted.rows[0].id;
    });
    await recordAudit(req, {
      action: 'promotion.banner_created',
      entityType: 'banner',
      entityId: id,
      after: { title: input.title, placement: input.placement },
    });
    res.status(201).json({ banner: { id } });
  }),
);

router.patch(
  '/banners/:id',
  requirePerm('promotions.write'),
  asyncRoute(async (req, res) => {
    const id = parse(uuidSchema, req.params.id);
    const input = parse(bannerUpdateSchema, req.body);
    if (input.imageUrl !== undefined && input.imageUrl !== null && input.imageUrl !== '') {
      input.imageUrl = parse(imageUrlSchema, input.imageUrl);
    }

    await withUserDb(req, async (db) => {
      const existing = await db.query('select id from banners where id = $1 limit 1', [id]);
      if (!existing.rows[0]) throw notFound('Banner not found');
      await db.query(
        `update banners set
           title = coalesce($2, title),
           subtitle = coalesce($3, subtitle),
           eyebrow = coalesce($4, eyebrow),
           image_url = case when $5::boolean then $6 else image_url end,
           link_url = case when $7::boolean then $8 else link_url end,
           link_label = coalesce($9, link_label),
           placement = coalesce($10, placement),
           theme = coalesce($11, theme),
           position = coalesce($12, position),
           is_active = coalesce($13, is_active),
           starts_at = case when $14::boolean then $15::timestamptz else starts_at end,
           ends_at = case when $16::boolean then $17::timestamptz else ends_at end,
           updated_at = now()
         where id = $1`,
        [
          id,
          input.title ?? null,
          input.subtitle ?? null,
          input.eyebrow ?? null,
          input.imageUrl !== undefined,
          input.imageUrl || null,
          input.linkUrl !== undefined,
          input.linkUrl || null,
          input.linkLabel ?? null,
          input.placement ?? null,
          input.theme ?? null,
          input.position ?? null,
          input.isActive ?? null,
          input.startsAt !== undefined,
          input.startsAt ?? null,
          input.endsAt !== undefined,
          input.endsAt ?? null,
        ],
      );
    });

    await recordAudit(req, {
      action: 'promotion.banner_updated',
      entityType: 'banner',
      entityId: id,
      after: input,
    });
    res.json({ updated: true });
  }),
);

router.delete(
  '/banners/:id',
  requirePerm('promotions.write'),
  asyncRoute(async (req, res) => {
    const id = parse(uuidSchema, req.params.id);
    const removed = await withUserDb(req, async (db) => {
      const existing = await db.query<{ title: string }>('select title from banners where id = $1 limit 1', [id]);
      if (!existing.rows[0]) throw notFound('Banner not found');
      await db.query('delete from banners where id = $1', [id]);
      return existing.rows[0];
    });
    await recordAudit(req, {
      action: 'promotion.banner_deleted',
      entityType: 'banner',
      entityId: id,
      before: removed,
    });
    res.json({ deleted: true });
  }),
);

router.get(
  '/newsletter/subscribers/export',
  requirePerm('promotions.read'),
  asyncRoute(async (req, res) => {
    const filters = parse(newsletterQuerySchema, req.query);
    const search = filters.q ? `%${filters.q}%` : null;
    const rows = await withUserDb(req, async (db) =>
      db.query<{
        email: string;
        status: string;
        source: string;
        created_at: Date;
        confirmed_at: Date | null;
      }>(
        `select email, status, source, created_at, confirmed_at
           from newsletter_subscribers
          where ($1::text = 'all' or status = $1)
            and ($2::text is null or email ilike $2)
          order by created_at desc limit 5000`,
        [filters.status, search],
      ),
    );
    const columns: CsvColumn<{
      email: string;
      status: string;
      source: string;
      subscribed_at: string;
      confirmed_at: string;
    }>[] = [
      { key: 'email', header: 'Email' },
      { key: 'status', header: 'Status' },
      { key: 'source', header: 'Source' },
      { key: 'subscribed_at', header: 'Subscribed at' },
      { key: 'confirmed_at', header: 'Confirmed at' },
    ];
    sendCsv(
      res,
      'newsletter-subscribers',
      columns,
      rows.rows.map((row) => ({
        email: row.email,
        status: row.status,
        source: row.source,
        subscribed_at: new Date(row.created_at).toISOString(),
        confirmed_at: row.confirmed_at ? new Date(row.confirmed_at).toISOString() : '',
      })),
    );
  }),
);

router.get(
  '/newsletter/subscribers',
  requirePerm('promotions.read'),
  asyncRoute(async (req, res) => {
    const { page, pageSize, offset } = pageParams(req.query, { page: 1, pageSize: 25 });
    const filters = parse(newsletterQuerySchema, req.query);
    const search = filters.q ? `%${filters.q}%` : null;

    const data = await withUserDb(req, async (db) => {
      const count = await db.query<{ total: number }>(
        `select count(*)::int as total from newsletter_subscribers
          where ($1::text = 'all' or status = $1)
            and ($2::text is null or email ilike $2)`,
        [filters.status, search],
      );
      const rows = await db.query<{
        id: string;
        email: string;
        status: string;
        source: string;
        created_at: Date;
        confirmed_at: Date | null;
      }>(
        `select id, email, status, source, created_at, confirmed_at
           from newsletter_subscribers
          where ($1::text = 'all' or status = $1)
            and ($2::text is null or email ilike $2)
          order by created_at desc
          limit $3 offset $4`,
        [filters.status, search, pageSize, offset],
      );
      const counts = await db.query<{ status: string; total: number }>(
        'select status, count(*)::int as total from newsletter_subscribers group by status',
      );
      return { total: toNumber(count.rows[0]?.total), rows: rows.rows, counts: counts.rows };
    });

    res.json({
      subscribers: data.rows.map((row) => ({
        id: row.id,
        email: row.email,
        status: row.status,
        source: row.source,
        createdAt: new Date(row.created_at).toISOString(),
        confirmedAt: row.confirmed_at ? new Date(row.confirmed_at).toISOString() : null,
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
  '/newsletter/subscribers/:id',
  requirePerm('promotions.write'),
  asyncRoute(async (req, res) => {
    const id = parse(uuidSchema, req.params.id);
    const input = parse(z.object({ status: z.enum(['subscribed', 'unsubscribed']) }), req.body);
    const before = await withUserDb(req, async (db) => {
      const existing = await db.query<{ email: string; status: string }>(
        'select email, status from newsletter_subscribers where id = $1 limit 1',
        [id],
      );
      if (!existing.rows[0]) throw notFound('Subscriber not found');
      await db.query('update newsletter_subscribers set status = $2 where id = $1', [id, input.status]);
      return existing.rows[0];
    });
    await recordAudit(req, {
      action: 'promotion.subscriber_updated',
      entityType: 'newsletter_subscriber',
      entityId: id,
      before: { email: before.email, status: before.status },
      after: { email: before.email, status: input.status },
    });
    res.json({ updated: true });
  }),
);

export default router;
