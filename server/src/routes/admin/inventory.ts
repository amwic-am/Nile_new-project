import { Router } from 'express';
import { z } from 'zod';
import { hasPerm, requirePerm } from '../../lib/auth.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { asyncRoute, withUserDb } from '../../lib/request.js';
import { pageParams, parse } from '../../lib/validation.js';
import { adjustStock } from '../../services/inventory.js';
import {
  dateRange,
  numberOrNull,
  paginationMeta,
  recordAudit,
  toNumber,
} from './shared.js';

const router = Router();

const uuidSchema = z.string().uuid('Choose a valid record');
const listQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  state: z.enum(['all', 'low', 'out', 'reserved']).optional().default('all'),
  categoryId: uuidSchema.optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

router.get(
  '/inventory',
  requirePerm('inventory.read'),
  asyncRoute(async (req, res) => {
    const { page, pageSize, offset } = pageParams(req.query, { page: 1, pageSize: 25 });
    const filters = parse(listQuerySchema, req.query);
    const search = filters.q ? `%${filters.q}%` : null;
    const showCost = hasPerm(req, 'inventory.cost');

    const data = await withUserDb(req, async (db) => {
      const where = `p.status <> 'archived'
        and ($1::text = 'all'
          or ($1::text = 'low' and i.quantity - i.reserved <= i.low_stock_threshold)
          or ($1::text = 'out' and i.quantity - i.reserved <= 0)
          or ($1::text = 'reserved' and i.reserved > 0))
        and ($2::uuid is null or p.category_id = $2)
        and ($3::text is null or p.name ilike $3 or v.sku ilike $3 or p.sku ilike $3)`;
      const params = [filters.state, filters.categoryId ?? null, search];
      const count = await db.query<{ total: number }>(
        `select count(*)::int as total
           from inventory i
           join product_variants v on v.id = i.variant_id
           join products p on p.id = v.product_id
          where ${where}`,
        params,
      );
      const rows = await db.query<{
        variant_id: string;
        product_id: string;
        product_name: string;
        slug: string;
        product_sku: string;
        sku: string;
        option_values: Record<string, string>;
        price: number;
        quantity: number;
        reserved: number;
        threshold: number;
        updated_at: Date;
        cost_price: number | null;
      }>(
        `select v.id as variant_id, p.id as product_id, p.name as product_name, p.slug,
                p.sku as product_sku, v.sku, v.option_values, v.price,
                i.quantity, i.reserved, i.low_stock_threshold as threshold, i.updated_at,
                ${showCost ? 'pc.cost_price' : 'null::bigint'} as cost_price
           from inventory i
           join product_variants v on v.id = i.variant_id
           join products p on p.id = v.product_id
           ${showCost ? 'left join product_costs pc on pc.product_id = p.id' : ''}
          where ${where}
          order by (i.quantity - i.reserved) asc, p.name asc
          limit $4 offset $5`,
        [...params, pageSize, offset],
      );
      return { total: toNumber(count.rows[0]?.total), rows: rows.rows };
    });

    res.json({
      variants: data.rows.map((entry) => ({
        variantId: entry.variant_id,
        productId: entry.product_id,
        productName: entry.product_name,
        slug: entry.slug,
        productSku: entry.product_sku,
        sku: entry.sku,
        optionValues: entry.option_values,
        price: toNumber(entry.price),
        quantity: toNumber(entry.quantity),
        reserved: toNumber(entry.reserved),
        available: toNumber(entry.quantity) - toNumber(entry.reserved),
        lowStockThreshold: toNumber(entry.threshold),
        costPrice: entry.cost_price === null ? null : toNumber(entry.cost_price),
        updatedAt: new Date(entry.updated_at).toISOString(),
      })),
      pagination: paginationMeta(page, pageSize, data.total),
    });
  }),
);

const movementQuerySchema = z.object({
  variantId: uuidSchema.optional(),
  reason: z
    .enum(['all', 'restock', 'sale', 'reservation', 'release', 'adjustment', 'return', 'damage', 'import'])
    .optional()
    .default('all'),
  q: z.string().trim().max(100).optional(),
});

router.get(
  '/inventory/movements',
  requirePerm('inventory.read'),
  asyncRoute(async (req, res) => {
    const { page, pageSize, offset } = pageParams(req.query, { page: 1, pageSize: 30 });
    const filters = parse(movementQuerySchema, req.query);
    const range = dateRange(req, 30);
    const search = filters.q ? `%${filters.q}%` : null;

    const data = await withUserDb(req, async (db) => {
      const where = `m.created_at >= $1 and m.created_at <= $2
        and ($3::uuid is null or m.variant_id = $3)
        and ($4::text = 'all' or m.reason = $4)
        and ($5::text is null or v.sku ilike $5 or p.name ilike $5 or coalesce(m.note, '') ilike $5)`;
      const params = [range.from, range.to, filters.variantId ?? null, filters.reason, search];
      const count = await db.query<{ total: number }>(
        `select count(*)::int as total
           from inventory_movements m
           join product_variants v on v.id = m.variant_id
           join products p on p.id = v.product_id
          where ${where}`,
        params,
      );
      const rows = await db.query<{
        id: string;
        variant_id: string;
        sku: string;
        product_name: string;
        delta: number;
        reason: string;
        reference_type: string | null;
        reference_id: string | null;
        note: string | null;
        balance_after: number;
        created_at: Date;
        actor: string | null;
      }>(
        `select m.id, m.variant_id, v.sku, p.name as product_name, m.delta, m.reason,
                m.reference_type, m.reference_id, m.note, m.balance_after, m.created_at,
                pr.full_name as actor
           from inventory_movements m
           join product_variants v on v.id = m.variant_id
           join products p on p.id = v.product_id
           left join profiles pr on pr.id = m.created_by
          where ${where}
          order by m.created_at desc
          limit $6 offset $7`,
        [...params, pageSize, offset],
      );
      return { total: toNumber(count.rows[0]?.total), rows: rows.rows };
    });

    res.json({
      movements: data.rows.map((entry) => ({
        id: entry.id,
        variantId: entry.variant_id,
        sku: entry.sku,
        productName: entry.product_name,
        delta: toNumber(entry.delta),
        reason: entry.reason,
        referenceType: entry.reference_type,
        referenceId: entry.reference_id,
        note: entry.note,
        balanceAfter: toNumber(entry.balance_after),
        createdAt: new Date(entry.created_at).toISOString(),
        actor: entry.actor,
      })),
      pagination: paginationMeta(page, pageSize, data.total),
    });
  }),
);

const adjustSchema = z.object({
  variantId: uuidSchema,
  delta: z.coerce.number().int().min(-1_000_000).max(1_000_000).refine((value) => value !== 0, 'Enter a non-zero change'),
  reason: z.enum(['restock', 'adjustment', 'return', 'damage']),
  note: z.string().trim().max(300).optional(),
});

router.post(
  '/inventory/adjust',
  requirePerm('inventory.write'),
  asyncRoute(async (req, res) => {
    const body = parse(adjustSchema, req.body);
    const result = await withUserDb(req, async (db) => {
      const variant = await db.query<{ sku: string; product_name: string }>(
        `select v.sku, p.name as product_name from product_variants v
           join products p on p.id = v.product_id where v.id = $1`,
        [body.variantId],
      );
      if (!variant.rows[0]) throw notFound('Variant not found');
      await db.query(
        'insert into inventory (variant_id, quantity, reserved) values ($1, 0, 0) on conflict (variant_id) do nothing',
        [body.variantId],
      );
      const quantity = await adjustStock(db, {
        variantId: body.variantId,
        delta: body.delta,
        reason: body.reason,
        note: body.note,
        createdBy: req.auth?.id ?? null,
        referenceType: 'admin',
      });
      return { quantity, variant: variant.rows[0] };
    });

    await recordAudit(req, {
      action: 'inventory.adjust',
      entityType: 'inventory',
      entityId: body.variantId,
      after: {
        sku: result.variant.sku,
        product: result.variant.product_name,
        delta: body.delta,
        reason: body.reason,
        quantity: result.quantity,
        note: body.note ?? null,
      },
    });

    res.json({ quantity: result.quantity });
  }),
);

const thresholdSchema = z.object({ lowStockThreshold: z.coerce.number().int().min(0).max(10_000) });

router.patch(
  '/inventory/:variantId',
  requirePerm('inventory.write'),
  asyncRoute(async (req, res) => {
    const variantId = parse(uuidSchema, req.params.variantId);
    const body = parse(thresholdSchema, req.body);
    await withUserDb(req, async (db) => {
      const exists = await db.query('select 1 from product_variants where id = $1', [variantId]);
      if (!exists.rows[0]) throw notFound('Variant not found');
      await db.query(
        `insert into inventory (variant_id, low_stock_threshold) values ($1,$2)
         on conflict (variant_id) do update set low_stock_threshold = excluded.low_stock_threshold,
                                                updated_at = now()`,
        [variantId, body.lowStockThreshold],
      );
    });
    await recordAudit(req, {
      action: 'inventory.threshold.update',
      entityType: 'inventory',
      entityId: variantId,
      after: body,
    });
    res.json({ ok: true });
  }),
);

const supplierSchema = z.object({
  name: z.string().trim().min(2).max(160),
  contactName: z.string().trim().max(120).optional().default(''),
  email: z.string().trim().email().max(180).optional().or(z.literal('')),
  phone: z.string().trim().max(40).optional().default(''),
  address: z.string().trim().max(500).optional().default(''),
  notes: z.string().trim().max(1000).optional().default(''),
  isActive: z.boolean().optional().default(true),
});

const updateSupplierSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  contactName: z.string().trim().max(120).optional(),
  email: z.string().trim().email().max(180).optional().or(z.literal('')),
  phone: z.string().trim().max(40).optional(),
  address: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(1000).optional(),
  isActive: z.boolean().optional(),
});

router.get(
  '/suppliers',
  requirePerm('suppliers.read'),
  asyncRoute(async (req, res) => {
    const data = await withUserDb(req, async (db) =>
      db.query<{
        id: string;
        name: string;
        contact_name: string | null;
        email: string | null;
        phone: string | null;
        address: string | null;
        notes: string | null;
        is_active: boolean;
        product_count: number;
        updated_at: Date;
      }>(
        `select s.id, s.name, s.contact_name, s.email, s.phone, s.address, s.notes, s.is_active, s.updated_at,
                (select count(*)::int from supplier_products sp where sp.supplier_id = s.id) as product_count
           from suppliers s
          order by s.name asc`,
      ),
    );
    res.json({
      suppliers: data.rows.map((entry) => ({
        id: entry.id,
        name: entry.name,
        contactName: entry.contact_name,
        email: entry.email,
        phone: entry.phone,
        address: entry.address,
        notes: entry.notes,
        isActive: entry.is_active,
        productCount: toNumber(entry.product_count),
        updatedAt: new Date(entry.updated_at).toISOString(),
      })),
    });
  }),
);

router.get(
  '/suppliers/:id',
  requirePerm('suppliers.read'),
  asyncRoute(async (req, res) => {
    const id = parse(uuidSchema, req.params.id);
    const data = await withUserDb(req, async (db) => {
      const supplier = await db.query<{
        id: string;
        name: string;
        contact_name: string | null;
        email: string | null;
        phone: string | null;
        address: string | null;
        notes: string | null;
        is_active: boolean;
      }>('select id, name, contact_name, email, phone, address, notes, is_active from suppliers where id = $1', [id]);
      if (!supplier.rows[0]) throw notFound('Supplier not found');
      const products = await db.query<{
        product_id: string;
        name: string;
        sku: string;
        cost_price: number | null;
        lead_time_days: number | null;
        min_order_qty: number | null;
      }>(
        `select sp.product_id, p.name, p.sku, sp.cost_price, sp.lead_time_days, sp.min_order_qty
           from supplier_products sp join products p on p.id = sp.product_id
          where sp.supplier_id = $1
          order by p.name asc`,
        [id],
      );
      return { supplier: supplier.rows[0], products: products.rows };
    });
    res.json({
      supplier: {
        id: data.supplier.id,
        name: data.supplier.name,
        contactName: data.supplier.contact_name,
        email: data.supplier.email,
        phone: data.supplier.phone,
        address: data.supplier.address,
        notes: data.supplier.notes,
        isActive: data.supplier.is_active,
        products: data.products.map((entry) => ({
          productId: entry.product_id,
          name: entry.name,
          sku: entry.sku,
          costPrice: entry.cost_price === null ? null : toNumber(entry.cost_price),
          leadTimeDays: numberOrNull(entry.lead_time_days),
          minOrderQty: numberOrNull(entry.min_order_qty),
        })),
      },
    });
  }),
);

router.post(
  '/suppliers',
  requirePerm('suppliers.write'),
  asyncRoute(async (req, res) => {
    const body = parse(supplierSchema, req.body);
    const id = await withUserDb(req, async (db) => {
      const result = await db.query<{ id: string }>(
        `insert into suppliers (name, contact_name, email, phone, address, notes, is_active)
         values ($1,$2,$3,$4,$5,$6,$7) returning id`,
        [
          body.name,
          body.contactName || null,
          body.email || null,
          body.phone || null,
          body.address || null,
          body.notes || null,
          body.isActive,
        ],
      );
      return result.rows[0].id;
    });
    await recordAudit(req, { action: 'supplier.create', entityType: 'supplier', entityId: id, after: body });
    res.status(201).json({ id });
  }),
);

router.patch(
  '/suppliers/:id',
  requirePerm('suppliers.write'),
  asyncRoute(async (req, res) => {
    const id = parse(uuidSchema, req.params.id);
    const body = parse(updateSupplierSchema, req.body);
    await withUserDb(req, async (db) => {
      const existing = await db.query('select 1 from suppliers where id = $1', [id]);
      if (!existing.rows[0]) throw notFound('Supplier not found');
      const updates: string[] = [];
      const params: unknown[] = [];
      let index = 1;
      const set = (column: string, value: unknown) => {
        updates.push(`${column} = $${index}`);
        params.push(value);
        index += 1;
      };
      if (body.name !== undefined) set('name', body.name);
      if (body.contactName !== undefined) set('contact_name', body.contactName || null);
      if (body.email !== undefined) set('email', body.email || null);
      if (body.phone !== undefined) set('phone', body.phone || null);
      if (body.address !== undefined) set('address', body.address || null);
      if (body.notes !== undefined) set('notes', body.notes || null);
      if (body.isActive !== undefined) set('is_active', body.isActive);
      if (updates.length === 0) throw badRequest('No changes were provided.');
      params.push(id);
      await db.query(
        `update suppliers set ${updates.join(', ')}, updated_at = now() where id = $${index}`,
        params,
      );
    });
    await recordAudit(req, { action: 'supplier.update', entityType: 'supplier', entityId: id, after: body });
    res.json({ ok: true });
  }),
);

router.delete(
  '/suppliers/:id',
  requirePerm('suppliers.write'),
  asyncRoute(async (req, res) => {
    const id = parse(uuidSchema, req.params.id);
    const removed = await withUserDb(req, async (db) => {
      const existing = await db.query<{ name: string }>('select name from suppliers where id = $1', [id]);
      if (!existing.rows[0]) throw notFound('Supplier not found');
      await db.query('delete from suppliers where id = $1', [id]);
      return existing.rows[0];
    });
    await recordAudit(req, { action: 'supplier.delete', entityType: 'supplier', entityId: id, before: removed });
    res.json({ ok: true });
  }),
);

const supplierProductsSchema = z.object({
  products: z
    .array(
      z.object({
        productId: uuidSchema,
        costPrice: z.coerce.number().int().min(0).nullish(),
        leadTimeDays: z.coerce.number().int().min(0).max(3650).nullish(),
        minOrderQty: z.coerce.number().int().min(1).max(1_000_000).nullish(),
      }),
    )
    .max(500),
});

router.put(
  '/suppliers/:id/products',
  requirePerm('suppliers.write'),
  asyncRoute(async (req, res) => {
    const id = parse(uuidSchema, req.params.id);
    const body = parse(supplierProductsSchema, req.body);
    await withUserDb(req, async (db) => {
      const supplier = await db.query('select 1 from suppliers where id = $1', [id]);
      if (!supplier.rows[0]) throw notFound('Supplier not found');
      const productIds = body.products.map((entry) => entry.productId);
      if (productIds.length) {
        const found = await db.query<{ count: number }>(
          'select count(*)::int as count from products where id = any($1::uuid[])',
          [productIds],
        );
        if (toNumber(found.rows[0]?.count) !== new Set(productIds).size) {
          throw badRequest('One or more selected products no longer exist.');
        }
      }
      await db.query('delete from supplier_products where supplier_id = $1', [id]);
      for (const entry of body.products) {
        await db.query(
          `insert into supplier_products (supplier_id, product_id, cost_price, lead_time_days, min_order_qty)
           values ($1,$2,$3,$4,$5)`,
          [
            id,
            entry.productId,
            entry.costPrice ?? null,
            entry.leadTimeDays ?? null,
            entry.minOrderQty ?? null,
          ],
        );
      }
    });
    await recordAudit(req, {
      action: 'supplier.products.update',
      entityType: 'supplier',
      entityId: id,
      after: body,
    });
    res.json({ ok: true });
  }),
);

export default router;
