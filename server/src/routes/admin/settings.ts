import { Router } from 'express';
import { z } from 'zod';
import type { Sql } from '../../db/index.js';
import { requirePerm } from '../../lib/auth.js';
import { notFound, unprocessable } from '../../lib/errors.js';
import { asyncRoute, withUserDb } from '../../lib/request.js';
import { parse } from '../../lib/validation.js';
import { recordAudit } from './shared.js';

const router = Router();

const text = (max: number) => z.string().trim().max(max);
const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(140)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens only');

const storeSchema = z.object({
  name: text(120).min(2),
  legalName: text(160).min(2),
  tagline: text(200),
  email: z.string().trim().email().max(254),
  phone: text(30),
  address: text(240),
  city: text(80),
  country: text(80),
  currency: z.literal('ETB'),
  timezone: z.string().trim().max(60),
});

const announcementSchema = z.object({
  enabled: z.boolean(),
  message: text(200),
  link: text(300).optional(),
});

const deliveryMethodSchema = z.object({
  id: slugSchema,
  label: text(80).min(2),
  description: text(200),
  fee: z.coerce.number().int().min(0).max(1_000_000_00),
  enabled: z.boolean(),
});

const socialLinkSchema = z.object({
  label: text(60).min(2),
  url: z.string().trim().url().max(400),
});

const returnsSchema = z.object({
  windowDays: z.coerce.number().int().min(0).max(90),
  summary: text(600),
});

const seoSchema = z.object({
  title: text(160),
  description: text(320),
  keywords: text(320),
});

const supportHoursSchema = z.object({
  weekdays: text(120),
  timezone: z.string().trim().max(60),
});

const paymentsSchema = z
  .object({ cod: z.boolean(), chapa: z.boolean() })
  .refine((value) => value.cod || value.chapa, 'Enable at least one payment method.');

const invoiceSchema = z.object({
  companyName: text(160).min(2),
  address: text(240),
  tin: text(40),
  footerNote: text(300),
});

const reservationsSchema = z.object({
  minutes: z.coerce.number().int().min(5).max(10_080),
  low_stock_threshold: z.coerce.number().int().min(0).max(10_000),
});

const settingsUpdateSchema = z
  .object({
    store: storeSchema.optional(),
    announcement: announcementSchema.optional(),
    deliveryMethods: z.array(deliveryMethodSchema).min(1).max(5).optional(),
    freeShippingThreshold: z.coerce.number().int().min(0).max(10_000_000_00).optional(),
    socialLinks: z.array(socialLinkSchema).max(8).optional(),
    returns: returnsSchema.optional(),
    seo: seoSchema.optional(),
    supportHours: supportHoursSchema.optional(),
    payments: paymentsSchema.optional(),
    invoice: invoiceSchema.optional(),
    reservations: reservationsSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Nothing to update');

const PAGE_KEYS: Record<string, { key: string; isPublic: boolean }> = {
  store: { key: 'store', isPublic: true },
  announcement: { key: 'announcement', isPublic: true },
  deliveryMethods: { key: 'delivery_methods', isPublic: true },
  freeShippingThreshold: { key: 'free_shipping_threshold', isPublic: true },
  socialLinks: { key: 'social_links', isPublic: true },
  returns: { key: 'returns', isPublic: true },
  seo: { key: 'seo', isPublic: true },
  supportHours: { key: 'support_hours', isPublic: true },
  payments: { key: 'payments', isPublic: false },
  invoice: { key: 'invoice', isPublic: false },
  reservations: { key: 'reservations', isPublic: false },
};

async function saveSetting(db: Sql, key: string, value: unknown, isPublic: boolean, actorId: string | null) {
  const result = await db.query(
    `update store_settings
        set value = $2::jsonb, is_public = $3, updated_by = $4, updated_at = now()
      where key = $1`,
    [key, JSON.stringify(value), isPublic, actorId],
  );
  if (!result.rowCount) throw unprocessable(`The ${key} setting cannot be changed.`);
}

router.get(
  '/settings',
  requirePerm('settings.read'),
  asyncRoute(async (req, res) => {
    const data = await withUserDb(req, async (db) => {
      const rows = await db.query<{
        key: string;
        value: unknown;
        is_public: boolean;
        updated_at: Date;
        updated_by_email: string | null;
      }>(
        `select s.key, s.value, s.is_public, s.updated_at, p.email as updated_by_email
           from store_settings s
           left join profiles p on p.id = s.updated_by
          order by s.key`,
      );
      return rows.rows;
    });

    const map = new Map(data.map((row) => [row.key, row.value]));
    const payments = (map.get('payments') as Record<string, boolean> | undefined) ?? {};
    res.json({
      settings: {
        store: map.get('store'),
        announcement: map.get('announcement'),
        deliveryMethods: map.get('delivery_methods'),
        freeShippingThreshold: map.get('free_shipping_threshold'),
        socialLinks: map.get('social_links'),
        returns: map.get('returns'),
        seo: map.get('seo'),
        supportHours: map.get('support_hours'),
        payments: { cod: Boolean(payments.cod), chapa: Boolean(payments.chapa) },
        invoice: map.get('invoice'),
        reservations: map.get('reservations'),
      },
      providers: [
        { key: 'cod', label: 'Cash on delivery', implemented: true, enabled: Boolean(payments.cod) },
        { key: 'chapa', label: 'Chapa', implemented: true, enabled: Boolean(payments.chapa) },
        { key: 'telebirr', label: 'Telebirr', implemented: false, enabled: Boolean(payments.telebirr) },
        { key: 'mpesa', label: 'M-PESA', implemented: false, enabled: Boolean(payments.mpesa) },
        { key: 'eps', label: 'Ethiopian Payment System', implemented: false, enabled: Boolean(payments.eps) },
        { key: 'card', label: 'Visa / Mastercard', implemented: false, enabled: Boolean(payments.card) },
        { key: 'paypal', label: 'PayPal', implemented: false, enabled: Boolean(payments.paypal) },
      ],
      meta: data.map((row) => ({
        key: row.key,
        isPublic: row.is_public,
        updatedAt: new Date(row.updated_at).toISOString(),
        updatedBy: row.updated_by_email,
      })),
    });
  }),
);

router.patch(
  '/settings',
  requirePerm('settings.write'),
  asyncRoute(async (req, res) => {
    const input = parse(settingsUpdateSchema, req.body);
    const changed: string[] = [];

    await withUserDb(req, async (db) => {
      for (const [field, value] of Object.entries(input)) {
        if (field === 'payments') continue;
        const mapping = PAGE_KEYS[field];
        if (!mapping) continue;
        await saveSetting(db, mapping.key, value, mapping.isPublic, req.auth?.id ?? null);
        changed.push(field);
      }

      if (input.payments) {
        const existing = await db.query<{ value: Record<string, boolean> }>(
          "select value from store_settings where key = 'payments'",
        );
        const current = existing.rows[0]?.value ?? {};
        const merged = {
          cod: Boolean(input.payments.cod),
          chapa: Boolean(input.payments.chapa),
          telebirr: false,
          mpesa: false,
          paypal: false,
          card: false,
          eps: false,
        };
        if (JSON.stringify(current) !== JSON.stringify(merged)) {
          await saveSetting(db, 'payments', merged, false, req.auth?.id ?? null);
        }
        changed.push('payments');
      }
    });

    await recordAudit(req, {
      action: 'settings.updated',
      entityType: 'settings',
      after: { fields: changed },
    });

    res.json({ updated: true, fields: changed });
  }),
);

const pageCreateSchema = z.object({
  slug: slugSchema,
  title: text(160).min(2),
  bodyMd: text(40_000),
  metaTitle: text(160).optional().or(z.literal('')),
  metaDescription: text(320).optional().or(z.literal('')),
  isPublished: z.boolean().optional().default(true),
});

const pageUpdateSchema = z
  .object({
    slug: slugSchema.optional(),
    title: text(160).min(2).optional(),
    bodyMd: text(40_000).optional(),
    metaTitle: text(160).optional().or(z.literal('')),
    metaDescription: text(320).optional().or(z.literal('')),
    isPublished: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Nothing to update');

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === '23505',
  );
}

router.get(
  '/content',
  requirePerm('content.write'),
  asyncRoute(async (req, res) => {
    const pages = await withUserDb(req, async (db) =>
      db.query<{
        id: string;
        slug: string;
        title: string;
        body_md: string;
        meta_title: string | null;
        meta_description: string | null;
        is_published: boolean;
        created_at: Date;
        updated_at: Date;
      }>(
        `select id, slug, title, body_md, meta_title, meta_description, is_published,
                created_at, updated_at
           from content_pages order by title`,
      ),
    );
    res.json({
      pages: pages.rows.map((page) => ({
        id: page.id,
        slug: page.slug,
        title: page.title,
        bodyMd: page.body_md,
        metaTitle: page.meta_title,
        metaDescription: page.meta_description,
        isPublished: page.is_published,
        createdAt: new Date(page.created_at).toISOString(),
        updatedAt: new Date(page.updated_at).toISOString(),
      })),
    });
  }),
);

router.post(
  '/content',
  requirePerm('content.write'),
  asyncRoute(async (req, res) => {
    const input = parse(pageCreateSchema, req.body);
    let page: { id: string } | undefined;
    try {
      page = await withUserDb(req, async (db) => {
        const imported = await db.query<{ id: string }>(
          `insert into content_pages (slug, title, body_md, meta_title, meta_description, is_published)
           values ($1, $2, $3, $4, $5, $6)
           returning id`,
          [
            input.slug,
            input.title,
            input.bodyMd,
            input.metaTitle || null,
            input.metaDescription || null,
            input.isPublished,
          ],
        );
        return imported.rows[0];
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw unprocessable('A page with that slug already exists.');
      throw error;
    }

    await recordAudit(req, {
      action: 'content.created',
      entityType: 'content_page',
      entityId: page?.id,
      after: { slug: input.slug, title: input.title, isPublished: input.isPublished },
    });
    res.status(201).json({ page: { id: page?.id, slug: input.slug, title: input.title } });
  }),
);

router.patch(
  '/content/:id',
  requirePerm('content.write'),
  asyncRoute(async (req, res) => {
    const id = parse(z.string().uuid('Choose a valid page'), req.params.id);
    const input = parse(pageUpdateSchema, req.body);

    const before = await withUserDb(req, async (db) => {
      const existing = await db.query<{ slug: string; title: string; is_published: boolean }>(
        'select slug, title, is_published from content_pages where id = $1 limit 1',
        [id],
      );
      if (!existing.rows[0]) throw notFound('Page not found');
      try {
        await db.query(
          `update content_pages set
             slug = coalesce($2, slug),
             title = coalesce($3, title),
             body_md = coalesce($4, body_md),
             meta_title = coalesce($5, meta_title),
             meta_description = coalesce($6, meta_description),
             is_published = coalesce($7, is_published),
             updated_at = now()
           where id = $1`,
          [
            id,
            input.slug ?? null,
            input.title ?? null,
            input.bodyMd ?? null,
            input.metaTitle === undefined ? null : input.metaTitle || null,
            input.metaDescription === undefined ? null : input.metaDescription || null,
            input.isPublished ?? null,
          ],
        );
      } catch (error) {
        if (isUniqueViolation(error)) throw unprocessable('A page with that slug already exists.');
        throw error;
      }
      return existing.rows[0];
    });

    await recordAudit(req, {
      action: 'content.updated',
      entityType: 'content_page',
      entityId: id,
      before: { slug: before.slug, title: before.title, isPublished: before.is_published },
      after: input,
    });
    res.json({ updated: true, pageId: id });
  }),
);

router.delete(
  '/content/:id',
  requirePerm('content.write'),
  asyncRoute(async (req, res) => {
    const id = parse(z.string().uuid('Choose a valid page'), req.params.id);
    const removed = await withUserDb(req, async (db) => {
      const existing = await db.query<{ slug: string; title: string }>(
        'select slug, title from content_pages where id = $1 limit 1',
        [id],
      );
      if (!existing.rows[0]) throw notFound('Page not found');
      await db.query('delete from content_pages where id = $1', [id]);
      return existing.rows[0];
    });

    await recordAudit(req, {
      action: 'content.deleted',
      entityType: 'content_page',
      entityId: id,
      before: removed,
    });
    res.json({ deleted: true });
  }),
);

export default router;
