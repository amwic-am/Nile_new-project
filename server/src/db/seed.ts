/**
 * Seeds development demo content. Never runs in production: `npm run db:seed`
 * refuses to insert demo data when NODE_ENV=production.
 *
 * Run `npm run db:reset` to drop everything and rebuild a clean demo database.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, supabaseAdminConfigured } from '../config.js';
import { closeDatabase, getDatabase, type Database, type Sql } from './index.js';
import { runMigrations } from './migrate.js';
import { hashPassword } from '../lib/password.js';
import { logger } from '../lib/logger.js';
import { adminCreateUser, adminFindUserByEmail } from '../lib/supabase.js';
import {
  banners,
  brands,
  categories,
  coupons,
  customers,
  deliveryMethods,
  demoCustomerPassword,
  freeShippingThreshold,
  newsletterSubscribers,
  products,
  reviews,
  staff,
  suppliers,
  type SeedCoupon,
  type SeedProduct,
} from './seed-data.js';

type IdRow = { id: string };
type OrderPlan = {
  daysAgo: number;
  status: string;
  paymentMethod: 'chapa' | 'cod';
  paymentStatus: string;
  customer: number;
  coupon?: string;
  refund?: boolean;
  returnRequest?: boolean;
  carrier?: string;
};

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20261026);
const randInt = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const pick = <T>(items: T[]): T => items[Math.floor(rand() * items.length)];

const seedDir = path.join(config.uploadsDir, 'seed');
const imageUrl = (base: string) => `/uploads/seed/${base}.png`;
const imageExists = (base: string) => fs.existsSync(path.join(seedDir, `${base}.png`));

async function ensureDetailCrops() {
  const bases = new Set<string>();
  for (const product of products) for (const base of product.images) bases.add(base);
  let sharp: typeof import('sharp').default | null = null;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    logger.warn('sharp unavailable; skipping product detail crops');
  }
  if (!sharp) return;
  for (const base of bases) {
    const source = path.join(seedDir, `${base}.png`);
    const target = path.join(seedDir, `${base}-detail.png`);
    if (!fs.existsSync(source) || fs.existsSync(target)) continue;
    await sharp(source)
      .resize(1200, 900, { fit: 'cover', position: 'centre' })
      .png({ quality: 88 })
      .toFile(target);
    logger.info('Created product detail crop', { image: `${base}-detail.png` });
  }
}

const orderPlans: OrderPlan[] = [
  { daysAgo: 1, status: 'pending', paymentMethod: 'cod', paymentStatus: 'unpaid', customer: 0 },
  { daysAgo: 2, status: 'awaiting_payment', paymentMethod: 'chapa', paymentStatus: 'awaiting_payment', customer: 1 },
  { daysAgo: 4, status: 'paid', paymentMethod: 'chapa', paymentStatus: 'paid', customer: 2 },
  { daysAgo: 5, status: 'confirmed', paymentMethod: 'cod', paymentStatus: 'unpaid', customer: 0 },
  { daysAgo: 7, status: 'processing', paymentMethod: 'chapa', paymentStatus: 'paid', customer: 3 },
  { daysAgo: 9, status: 'packed', paymentMethod: 'cod', paymentStatus: 'unpaid', customer: 4 },
  {
    daysAgo: 11,
    status: 'shipped',
    paymentMethod: 'chapa',
    paymentStatus: 'paid',
    customer: 1,
    carrier: 'Nile Mart Express',
  },
  {
    daysAgo: 13,
    status: 'out_for_delivery',
    paymentMethod: 'cod',
    paymentStatus: 'unpaid',
    customer: 2,
    carrier: 'Nile Mart Express',
  },
  {
    daysAgo: 16,
    status: 'delivered',
    paymentMethod: 'chapa',
    paymentStatus: 'paid',
    customer: 0,
    carrier: 'Nile Mart Express',
  },
  {
    daysAgo: 19,
    status: 'delivered',
    paymentMethod: 'cod',
    paymentStatus: 'paid',
    customer: 3,
    carrier: 'Nile Mart Express',
  },
  {
    daysAgo: 23,
    status: 'delivered',
    paymentMethod: 'chapa',
    paymentStatus: 'paid',
    customer: 4,
    coupon: 'WELCOME10',
    carrier: 'Nile Mart Express',
  },
  {
    daysAgo: 27,
    status: 'delivered',
    paymentMethod: 'cod',
    paymentStatus: 'paid',
    customer: 5,
    carrier: 'Nile Mart Express',
  },
  {
    daysAgo: 31,
    status: 'delivered',
    paymentMethod: 'chapa',
    paymentStatus: 'paid',
    customer: 1,
    coupon: 'NILE500',
    carrier: 'Nile Mart Express',
  },
  {
    daysAgo: 38,
    status: 'delivered',
    paymentMethod: 'chapa',
    paymentStatus: 'paid',
    customer: 2,
    carrier: 'Nile Mart Express',
  },
  { daysAgo: 44, status: 'cancelled', paymentMethod: 'cod', paymentStatus: 'unpaid', customer: 4 },
  {
    daysAgo: 49,
    status: 'refunded',
    paymentMethod: 'chapa',
    paymentStatus: 'refunded',
    customer: 0,
    refund: true,
    carrier: 'Nile Mart Express',
  },
  {
    daysAgo: 55,
    status: 'delivered',
    paymentMethod: 'cod',
    paymentStatus: 'paid',
    customer: 0,
    coupon: 'TECH15',
    carrier: 'Nile Mart Express',
  },
  {
    daysAgo: 61,
    status: 'delivered',
    paymentMethod: 'chapa',
    paymentStatus: 'paid',
    customer: 3,
    carrier: 'Nile Mart Express',
  },
  {
    daysAgo: 68,
    status: 'delivered',
    paymentMethod: 'cod',
    paymentStatus: 'paid',
    customer: 2,
    carrier: 'Nile Mart Express',
  },
  {
    daysAgo: 74,
    status: 'returned',
    paymentMethod: 'chapa',
    paymentStatus: 'paid',
    customer: 5,
    returnRequest: true,
    carrier: 'Nile Mart Express',
  },
];

const statusNotes: Record<string, string> = {
  pending: 'Order received and awaiting confirmation.',
  awaiting_payment: 'Online payment session created.',
  paid: 'Payment confirmed by the payment provider.',
  confirmed: 'Order confirmed by the Nile Mart team.',
  processing: 'Items are being prepared for dispatch.',
  packed: 'Order packed and ready for courier collection.',
  shipped: 'Handed to the courier.',
  out_for_delivery: 'Courier is delivering your order today.',
  delivered: 'Order delivered to the customer.',
  cancelled: 'Order cancelled before dispatch.',
  returned: 'Returned items received at the warehouse.',
  refunded: 'Refund issued to the original payment method.',
};

function operationalChain(paymentMethod: 'chapa' | 'cod'): string[] {
  return paymentMethod === 'chapa'
    ? ['pending', 'awaiting_payment', 'paid']
    : ['pending', 'confirmed'];
}

function orderChain(plan: OrderPlan): string[] {
  const base = operationalChain(plan.paymentMethod);
  const operational = ['processing', 'packed', 'shipped', 'out_for_delivery', 'delivered'];
  if (plan.status === 'pending') return ['pending'];
  if (plan.status === 'awaiting_payment') return ['pending', 'awaiting_payment'];
  if (plan.status === 'paid') return base;
  if (plan.status === 'cancelled') return [...base, 'cancelled'];
  if (plan.status === 'refunded') return [...base, 'refunded'];
  if (plan.status === 'returned') return [...base, ...operational, 'returned'];
  if (plan.status === 'confirmed') return ['pending', 'confirmed'];
  const upto = operational.indexOf(plan.status);
  if (upto === -1) return ['pending'];
  return [...(plan.paymentMethod === 'chapa' ? base : ['pending', 'confirmed']), ...operational.slice(0, upto + 1)];
}

function variantLabel(options: Record<string, string>): string {
  return Object.values(options).join(' · ');
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 3600_000);
}

function couponDiscount(coupon: SeedCoupon, lines: { price: number; quantity: number; rootCategory: string }[]): number {
  const applicable = coupon.appliesTo === 'categories'
    ? lines.filter((line) => coupon.categories?.includes(line.rootCategory))
    : lines;
  const base = applicable.reduce((sum, line) => sum + line.price * line.quantity, 0);
  const subtotal = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
  if (subtotal < coupon.minOrder || base <= 0) return 0;
  const raw = coupon.type === 'percentage'
    ? Math.round((base * coupon.value) / 10_000)
    : Math.min(coupon.value, base);
  return coupon.maxDiscount ? Math.min(raw, coupon.maxDiscount) : raw;
}

async function seedSupabaseAccounts(): Promise<Map<string, string>> {
  const accounts = [
    ...staff.map((member) => ({
      email: member.email,
      name: member.name,
      password: config.seedAdminPassword,
    })),
    ...customers.map((customer) => ({
      email: customer.email,
      name: customer.name,
      password: demoCustomerPassword,
    })),
  ];

  const ids = new Map<string, string>();
  for (const account of accounts) {
    const existing = await adminFindUserByEmail(account.email);
    const user =
      existing ??
      (await adminCreateUser({
        email: account.email,
        password: account.password,
        emailConfirm: true,
        metadata: { full_name: account.name },
      }));
    if (!user?.id) throw new Error(`Supabase did not return an account for ${account.email}`);
    ids.set(account.email.toLowerCase(), user.id);
  }
  return ids;
}

async function seedAccounts(tx: Sql, supabaseIds?: Map<string, string>) {
  const customerPassword = await hashPassword(demoCustomerPassword);
  const staffPassword = await hashPassword(config.seedAdminPassword);
  const isSupabase = Boolean(supabaseIds);

  const upsertProfile = async (email: string, fullName: string, phone: string, marketingOptIn = false) => {
    const providedId = supabaseIds?.get(email.toLowerCase());
    if (providedId) {
      await tx.query(
        `insert into profiles (id, email, full_name, phone, status, marketing_opt_in)
         values ($1, $2, $3, $4, 'active', $5)
         on conflict (id) do update
           set email = excluded.email,
               full_name = excluded.full_name,
               phone = excluded.phone,
               status = 'active',
               marketing_opt_in = excluded.marketing_opt_in`,
        [providedId, email, fullName, phone, marketingOptIn],
      );
      return providedId;
    }
    const existing = await tx.query<{ id: string }>(
      'select id from profiles where lower(email) = lower($1)',
      [email],
    );
    if (existing.rows[0]) {
      await tx.query(
        "update profiles set full_name = $2, phone = $3, status = 'active' where id = $1",
        [existing.rows[0].id, fullName, phone],
      );
      return existing.rows[0].id;
    }
    const inserted = await tx.query<{ id: string }>(
      `insert into profiles (email, full_name, phone, status, marketing_opt_in)
       values ($1, $2, $3, 'active', $4) returning id`,
      [email, fullName, phone, marketingOptIn],
    );
    return inserted.rows[0].id;
  };

  const attachCredential = async (profileId: string, passwordHash: string) => {
    if (isSupabase) return;
    await tx.query(
      `insert into auth_credentials (profile_id, password_hash, email_verified_at)
       values ($1, $2, now())
       on conflict (profile_id) do update
         set password_hash = excluded.password_hash,
             email_verified_at = coalesce(auth_credentials.email_verified_at, excluded.email_verified_at),
             failed_attempts = 0,
             locked_until = null`,
      [profileId, passwordHash],
    );
  };

  const staffIds = new Map<string, string>();
  for (const member of staff) {
    const id = await upsertProfile(member.email, member.name, member.phone);
    await attachCredential(id, staffPassword);
    await tx.query(
      'insert into user_roles (profile_id, role_key) values ($1, $2) on conflict do nothing',
      [id, member.role],
    );
    staffIds.set(member.email, id);
  }

  const customerIds = new Map<string, string>();
  for (const customer of customers) {
    const id = await upsertProfile(customer.email, customer.name, customer.phone, Boolean(customer.marketingOptIn));
    await attachCredential(id, customerPassword);
    await tx.query(
      "insert into user_roles (profile_id, role_key) values ($1, 'customer') on conflict do nothing",
      [id],
    );
    const existingAddress = await tx.query<{ id: string }>(
      'select id from addresses where profile_id = $1 limit 1',
      [id],
    );
    if (!existingAddress.rows[0]) {
      await tx.query(
        `insert into addresses (profile_id, label, full_name, phone, line1, city, region, country, is_default)
         values ($1, 'Home', $2, $3, $4, $5, $6, 'ET', true)`,
        [id, customer.name, customer.phone, customer.line1, customer.city, customer.region],
      );
    }
    await tx.query('insert into wishlists (profile_id) values ($1) on conflict (profile_id) do nothing', [id]);
    customerIds.set(customer.email, id);
  }

  const demoId = customerIds.get('customer@nilemart.et')!;
  const secondary = await tx.query<{ id: string }>(
    'select id from addresses where profile_id = $1 and label = $2',
    [demoId, 'Office'],
  );
  if (!secondary.rows[0]) {
    await tx.query(
      `insert into addresses (profile_id, label, full_name, phone, line1, line2, city, region, country, is_default)
       values ($1, 'Office', 'Hana Tesfaye', '+251 911 234 567', 'Bole Road, Zemen Bank Building', '5th floor',
               'Addis Ababa', 'Bole', 'ET', false)`,
      [demoId],
    );
  }

  return { staffIds, customerIds, demoId };
}

async function seedCatalogue(tx: Sql) {
  const categoryIds = new Map<string, string>();
  const rootByLeaf = new Map<string, string>();

  for (const [index, root] of categories.entries()) {
    const image = root.image && imageExists(root.image) ? imageUrl(root.image) : null;
    const inserted = await tx.query<{ id: string }>(
      `insert into categories (name, slug, description, image_url, position)
       values ($1, $2, $3, $4, $5) returning id`,
      [root.name, root.slug, root.description, image, index],
    );
    categoryIds.set(root.slug, inserted.rows[0].id);
    rootByLeaf.set(root.slug, root.slug);
    for (const [childIndex, child] of (root.children ?? []).entries()) {
      const childRow = await tx.query<{ id: string }>(
        `insert into categories (parent_id, name, slug, description, position)
         values ($1, $2, $3, $4, $5) returning id`,
        [inserted.rows[0].id, child.name, child.slug, child.description, childIndex],
      );
      categoryIds.set(child.slug, childRow.rows[0].id);
      rootByLeaf.set(child.slug, root.slug);
    }
  }

  const brandIds = new Map<string, string>();
  for (const brand of brands) {
    const inserted = await tx.query<{ id: string }>(
      `insert into brands (name, slug, description, website_url)
       values ($1, $2, $3, $4) returning id`,
      [brand.name, brand.slug, brand.description, brand.website ?? null],
    );
    brandIds.set(brand.slug, inserted.rows[0].id);
  }

  const supplierIds = new Map<string, string>();
  for (const supplier of suppliers) {
    const inserted = await tx.query<{ id: string }>(
      `insert into suppliers (name, contact_name, email, phone, address, notes)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [supplier.name, supplier.contactName, supplier.email, supplier.phone, supplier.address, supplier.notes ?? null],
    );
    supplierIds.set(supplier.name, inserted.rows[0].id);
  }

  type SeededProduct = {
    product: SeedProduct;
    id: string;
    variants: { id: string; suffix: string; price: number; options: Record<string, string>; stock: number }[];
  };
  const seededProducts: SeededProduct[] = [];

  for (const [index, product] of products.entries()) {
    const categoryId = categoryIds.get(product.category);
    if (!categoryId) throw new Error(`Unknown seed category ${product.category}`);
    const brandId = brandIds.get(product.brand);
    if (!brandId) throw new Error(`Unknown seed brand ${product.brand}`);
    const availableImages = product.images.filter(imageExists);
    if (availableImages.length < product.images.length) {
      logger.warn('Seed image missing; product will have fewer images', {
        product: product.slug,
        missing: product.images.filter((image) => !imageExists(image)),
      });
    }
    const publishedAt = new Date(Date.now() - (index * 3 + 2) * 86_400_000);
    const metaTitle = `${product.name} | Nile Mart`;
    const inserted = await tx.query<{ id: string }>(
      `insert into products (name, slug, sku, short_description, description, category_id, brand_id,
                             base_price, compare_at_price, status, is_featured, specs, warranty_info,
                             return_info, low_stock_threshold, sold_count, view_count, meta_title,
                             meta_description, published_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', $10, $11::jsonb, $12, $13, $14, $15, $16, $17, $18, $19)
       returning id`,
      [
        product.name,
        product.slug,
        product.sku,
        product.shortDescription,
        product.description,
        categoryId,
        brandId,
        product.price,
        product.compareAtPrice ?? null,
        Boolean(product.featured),
        JSON.stringify(product.specs),
        product.warranty,
        product.returnInfo,
        product.lowStockThreshold ?? 5,
        product.soldCount,
        product.viewCount,
        metaTitle,
        product.shortDescription,
        publishedAt,
      ],
    );
    const productId = inserted.rows[0].id;

    await tx.query('insert into product_costs (product_id, cost_price) values ($1, $2)', [productId, product.cost]);

    const mainImage = availableImages[0] ? imageUrl(availableImages[0]) : null;
    let imagePosition = 0;
    for (const base of availableImages) {
      await tx.query(
        `insert into product_images (product_id, url, alt, position) values ($1, $2, $3, $4)`,
        [productId, imageUrl(base), `${product.name} — ${product.brand}`, imagePosition++],
      );
      if (fs.existsSync(path.join(seedDir, `${base}-detail.png`))) {
        await tx.query(
          `insert into product_images (product_id, url, alt, position) values ($1, $2, $3, $4)`,
          [productId, imageUrl(`${base}-detail`), `${product.name} detail`, imagePosition++],
        );
      }
    }

    for (const [optionIndex, option] of (product.options ?? []).entries()) {
      const optionRow = await tx.query<{ id: string }>(
        `insert into product_options (product_id, name, position) values ($1, $2, $3) returning id`,
        [productId, option.name, optionIndex],
      );
      for (const [valueIndex, value] of option.values.entries()) {
        await tx.query(
          `insert into product_option_values (option_id, value, position) values ($1, $2, $3)`,
          [optionRow.rows[0].id, value, valueIndex],
        );
      }
      const usedValues = new Set(
        product.variants
          .map((variant) => variant.options[option.name])
          .filter((value): value is string => Boolean(value)),
      );
      for (const value of usedValues) {
        await tx.query(
          `insert into product_attributes (product_id, name, value, position)
           values ($1, $2, $3, $4)
           on conflict (product_id, name, value) do nothing`,
          [productId, option.name, value, optionIndex],
        );
      }
    }

    const seededVariants: SeededProduct['variants'] = [];
    for (const [variantIndex, variant] of product.variants.entries()) {
      const price = variant.price ?? product.price;
      const compareAt = variant.compareAtPrice ?? product.compareAtPrice ?? null;
      const variantRow = await tx.query<{ id: string }>(
        `insert into product_variants (product_id, sku, option_values, price, compare_at_price, image_url, position)
         values ($1, $2, $3::jsonb, $4, $5, $6, $7) returning id`,
        [
          productId,
          `${product.sku}-${variant.suffix}`,
          JSON.stringify(variant.options),
          price,
          compareAt,
          mainImage,
          variantIndex,
        ],
      );
      const variantId = variantRow.rows[0].id;
      await tx.query(
        `insert into inventory (variant_id, quantity, low_stock_threshold) values ($1, $2, $3)`,
        [variantId, variant.stock, 3],
      );
      await tx.query(
        `insert into inventory_movements (variant_id, delta, reason, note, balance_after)
         values ($1, $2, 'restock', 'Opening stock', $2)`,
        [variantId, variant.stock],
      );
      seededVariants.push({
        id: variantId,
        suffix: variant.suffix,
        price,
        options: variant.options,
        stock: variant.stock,
      });
    }

    const supplierId = supplierIds.get(product.supplier);
    if (supplierId) {
      await tx.query(
        `insert into supplier_products (supplier_id, product_id, cost_price, lead_time_days, min_order_qty)
         values ($1, $2, $3, $4, $5)`,
        [supplierId, productId, product.cost, randInt(3, 14), randInt(5, 20)],
      );
    }

    seededProducts.push({ product, id: productId, variants: seededVariants });
  }

  for (const banner of banners) {
    await tx.query(
      `insert into banners (title, subtitle, eyebrow, image_url, link_url, link_label, placement, theme, position)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        banner.title,
        banner.subtitle,
        banner.eyebrow,
        imageUrl(banner.image),
        banner.link,
        banner.linkLabel,
        banner.placement,
        banner.theme,
        banner.position,
      ],
    );
  }

  const couponIds = new Map<string, string>();
  for (const coupon of coupons) {
    const inserted = await tx.query<{ id: string }>(
      `insert into coupons (code, description, discount_type, discount_value, min_order, max_discount,
                            usage_limit, per_user_limit, is_active, applies_to, starts_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, true, $9, now() - interval '30 days')
       returning id`,
      [
        coupon.code,
        coupon.description,
        coupon.type,
        coupon.value,
        coupon.minOrder,
        coupon.maxDiscount ?? null,
        coupon.usageLimit ?? null,
        coupon.perUserLimit,
        coupon.appliesTo,
      ],
    );
    couponIds.set(coupon.code, inserted.rows[0].id);
    for (const categorySlug of coupon.categories ?? []) {
      const categoryId = categoryIds.get(categorySlug);
      if (categoryId) {
        await tx.query(
          'insert into coupon_categories (coupon_id, category_id) values ($1, $2)',
          [inserted.rows[0].id, categoryId],
        );
      }
    }
  }

  return { seededProducts, rootByLeaf, couponIds };
}

export async function seedDatabase(db: Database): Promise<boolean> {
  if (config.isProd || !config.seedDemoData) {
    logger.warn('Demo seeding is disabled in this environment');
    return false;
  }

  const existing = await db.query<{ count: number }>('select count(*)::int as count from products');
  if (existing.rows[0].count > 0) {
    logger.warn('Products already exist; skipping demo seed. Run "npm run db:reset" for a clean demo.');
    return false;
  }

  const roles = await db.query<{ count: number }>('select count(*)::int as count from roles');
  if (roles.rows[0].count === 0) {
    throw new Error('Reference data is missing. Run migrations before seeding.');
  }

  await ensureDetailCrops();

  let supabaseIds: Map<string, string> | undefined;
  if (config.authProvider === 'supabase') {
    if (!supabaseAdminConfigured) {
      throw new Error(
        'Demo seeding against Supabase needs SUPABASE_SERVICE_ROLE_KEY so demo auth users can be created.',
      );
    }
    supabaseIds = await seedSupabaseAccounts();
  }

  await db.transaction(async (tx) => {
    const { staffIds, customerIds } = await seedAccounts(tx, supabaseIds);
    const { seededProducts, rootByLeaf, couponIds } = await seedCatalogue(tx);

    const customerRecords = customers.map((customer) => ({
      ...customer,
      id: customerIds.get(customer.email)!,
    }));
    const staffAdminId = staffIds.get('admin@nilemart.et')!;
    const supportStaffId = staffIds.get('support@nilemart.et')!;
    const fulfillmentStaffId = staffIds.get('fulfillment@nilemart.et')!;
    const now = Date.now();

    const deliveredLookup: { email: string; productId: string; orderId: string }[] = [];
    const unitsByProduct = new Map<string, number>();

    for (const [index, plan] of orderPlans.entries()) {
      const customer = customerRecords[plan.customer];
      const placedAt = new Date(now - plan.daysAgo * 86_400_000);
      const orderedProducts: typeof seededProducts = [];
      const wanted = randInt(1, 3);
      while (orderedProducts.length < wanted) {
        const candidate = pick(seededProducts);
        if (!orderedProducts.some((item) => item.id === candidate.id)) orderedProducts.push(candidate);
      }

      const lines = orderedProducts.map((item) => {
        const variant = pick(item.variants);
        const quantity = randInt(1, 2);
        return {
          item,
          variant,
          quantity,
          price: variant.price,
          rootCategory: rootByLeaf.get(item.product.category) ?? item.product.category,
        };
      });

      const subtotal = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
      const coupon = plan.coupon ? coupons.find((entry) => entry.code === plan.coupon) : undefined;
      const discount = coupon ? couponDiscount(coupon, lines) : 0;
      const deliveryKey = salesDeliveryKey(plan.status, subtotal);
      const shippingFee = deliveryMethods[deliveryKey].fee;
      const total = Math.max(0, subtotal - discount + shippingFee);
      const couponId = coupon ? couponIds.get(coupon.code) : undefined;

      const confirmedAt = new Date(placedAt.getTime() + 3600_000);
      const shippedAt = new Date(placedAt.getTime() + 2 * 86_400_000);
      const deliveredAt = new Date(placedAt.getTime() + 3 * 86_400_000);
      const cancelledAt = new Date(placedAt.getTime() + 8 * 3600_000);
      const refundedAt = new Date(placedAt.getTime() + 4 * 86_400_000);

      const seq = (
        await tx.query<{ n: number | string }>("select nextval('order_number_seq') as n")
      ).rows[0].n;
      const orderNumber = `NM-${String(seq).padStart(6, '0')}`;

      const shippingAddress = {
        fullName: customer.name,
        phone: customer.phone,
        line1: customer.line1,
        line2: null,
        city: customer.city,
        region: customer.region,
        country: 'ET',
      };

      const orderRow = await tx.query<{ id: string }>(
        `insert into orders (order_number, profile_id, email, phone, customer_name, shipping_address,
                             delivery_method, delivery_label, shipping_fee, subtotal, discount, total,
                             coupon_id, coupon_code, status, payment_status, payment_method, customer_note,
                             placed_at, confirmed_at, shipped_at, delivered_at, cancelled_at, refunded_at,
                             idempotency_key)
         values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
                 $19, $20, $21, $22, $23, $24, $25)
         returning id`,
        [
          orderNumber,
          customer.id,
          customer.email,
          customer.phone,
          customer.name,
          JSON.stringify(shippingAddress),
          deliveryKey,
          deliveryMethods[deliveryKey].label,
          shippingFee,
          subtotal,
          discount,
          total,
          couponId ?? null,
          coupon?.code ?? null,
          plan.status,
          plan.paymentStatus,
          plan.paymentMethod,
          index % 4 === 0 ? 'Please call before delivery.' : null,
          placedAt,
          ['confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'returned'].includes(plan.status)
            ? confirmedAt
            : null,
          ['shipped', 'out_for_delivery', 'delivered', 'returned'].includes(plan.status) ? shippedAt : null,
          ['delivered', 'returned'].includes(plan.status) ? deliveredAt : null,
          plan.status === 'cancelled' ? cancelledAt : null,
          plan.status === 'refunded' ? refundedAt : null,
          `seed-${orderNumber}`,
        ],
      );
      const orderId = orderRow.rows[0].id;

      for (const line of lines) {
        const label = variantLabel(line.variant.options);
        await tx.query(
          `insert into order_items (order_id, product_id, variant_id, product_name, product_slug, variant_label,
                                    sku, image_url, unit_price, compare_at_price, quantity, line_total)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            orderId,
            line.item.id,
            line.variant.id,
            line.item.product.name,
            line.item.product.slug,
            label,
            `${line.item.product.sku}-${line.variant.suffix}`,
            imageExists(line.item.product.images[0]) ? imageUrl(line.item.product.images[0]) : null,
            line.price,
            line.item.product.compareAtPrice ?? null,
            line.quantity,
            line.price * line.quantity,
          ],
        );
        unitsByProduct.set(line.item.id, (unitsByProduct.get(line.item.id) ?? 0) + line.quantity);
        if (plan.status === 'delivered' || plan.status === 'returned') {
          deliveredLookup.push({ email: customer.email, productId: line.item.id, orderId });
        }
      }

      for (const [stepIndex, status] of orderChain(plan).entries()) {
        const changedAt = new Date(placedAt.getTime() + stepIndex * 6 * 3600_000);
        await tx.query(
          `insert into order_status_history (order_id, status, note, changed_by, created_at)
           values ($1, $2, $3, $4, $5)`,
          [
            orderId,
            status,
            statusNotes[status] ?? null,
            ['processing', 'packed', 'shipped', 'out_for_delivery', 'delivered'].includes(status)
              ? fulfillmentStaffId
              : null,
            changedAt,
          ],
        );
      }

      const online = plan.paymentMethod === 'chapa';
      const paymentSuccessful = plan.paymentStatus === 'paid' || plan.paymentStatus === 'refunded';
      const paymentStatus = paymentSuccessful ? 'successful' : plan.status === 'awaiting_payment' ? 'pending' : 'pending';
      const paymentRow = await tx.query<{ id: string }>(
        `insert into payments (order_id, provider, provider_ref, amount, status, raw_response, verified_at, created_at)
         values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8) returning id`,
        [
          orderId,
          plan.paymentMethod,
          `SEED-${plan.paymentMethod.toUpperCase()}-${orderNumber}`,
          total,
          paymentStatus,
          JSON.stringify({
            source: 'development-seed',
            note: 'Seeded demo record. No real payment was processed.',
            provider: plan.paymentMethod,
          }),
          paymentSuccessful ? addHours(placedAt, 1) : null,
          placedAt,
        ],
      );

      if (plan.refund) {
        await tx.query(
          `insert into refunds (order_id, payment_id, amount, reason, status, provider_ref, created_by, processed_at)
           values ($1, $2, $3, $4, 'succeeded', $5, $6, $7)`,
          [
            orderId,
            paymentRow.rows[0].id,
            total,
            'Customer cancelled before dispatch.',
            `SEED-REFUND-${orderNumber}`,
            staffAdminId,
            refundedAt,
          ],
        );
        await tx.query(
          `update payments set status = 'refunded', updated_at = $2 where id = $1`,
          [paymentRow.rows[0].id, refundedAt],
        );
      }

      if (plan.returnRequest) {
        const orderItem = await tx.query<{ id: string }>(
          'select id from order_items where order_id = $1 limit 1',
          [orderId],
        );
        await tx.query(
          `insert into returns (order_id, order_item_id, profile_id, reason, description, status, admin_note,
                                created_at, resolved_at)
           values ($1, $2, $3, 'Not as expected', $4, 'received', $5, $6, $7)`,
          [
            orderId,
            orderItem.rows[0]?.id ?? null,
            customer.id,
            'Customer reported a colour difference and returned the item unused.',
            'Inspected by the warehouse team; item in sellable condition.',
            new Date(placedAt.getTime() + 4 * 86_400_000),
            new Date(placedAt.getTime() + 6 * 86_400_000),
          ],
        );
      }

      if (plan.carrier) {
        const shipmentStatus =
          plan.status === 'shipped'
            ? 'in_transit'
            : plan.status === 'out_for_delivery'
              ? 'out_for_delivery'
              : plan.status === 'returned'
                ? 'returned'
                : 'delivered';
        await tx.query(
          `insert into shipments (order_id, carrier, tracking_number, status, shipped_at, delivered_at, notes)
           values ($1, $2, $3, $4, $5, $6, $7)`,
          [
            orderId,
            plan.carrier,
            `NME${String(seq).padStart(7, '0')}`,
            shipmentStatus,
            shippedAt,
            ['delivered', 'returned'].includes(plan.status) ? deliveredAt : null,
            plan.status === 'returned' ? 'Returned to the warehouse after a failed size check.' : null,
          ],
        );
      }

      if (coupon && couponId && discount > 0) {
        await tx.query(
          `insert into coupon_redemptions (coupon_id, order_id, profile_id, email, discount_amount, created_at)
           values ($1, $2, $3, $4, $5, $6)`,
          [couponId, orderId, customer.id, customer.email, discount, placedAt],
        );
      }
    }

    for (const [productId, units] of unitsByProduct) {
      await tx.query('update products set sold_count = sold_count + $2 where id = $1', [productId, units]);
    }

    for (const [code, couponId] of couponIds) {
      const used = await tx.query<{ count: number }>(
        'select count(*)::int as count from coupon_redemptions where coupon_id = $1',
        [couponId],
      );
      await tx.query('update coupons set used_count = $2 where id = $1', [couponId, used.rows[0].count]);
      void code;
    }

    for (const review of reviews) {
      const customer = customerRecords.find((entry) => entry.email === review.customer);
      const product = seededProducts.find((entry) => entry.product.slug === review.product);
      if (!customer || !product) continue;
      const delivered = deliveredLookup.find(
        (entry) => entry.email === review.customer && entry.productId === product.id,
      );
      await tx.query(
        `insert into reviews (product_id, profile_id, order_id, rating, title, body, status, reviewer_name,
                              verified_purchase, created_at)
         values ($1, $2, $3, $4, $5, $6, 'approved', $7, $8, $9)`,
        [
          product.id,
          customer.id,
          delivered?.orderId ?? null,
          review.rating,
          review.title,
          review.body,
          customer.name,
          Boolean(review.verified && delivered),
          new Date(now - review.daysAgo * 86_400_000),
        ],
      );
    }

    const wishlistProducts = ['lumen-pulse-x6-pro', 'airtone-max-headphones', 'sahara-weekender-bag', 'bunna-pour-over-set'];
    for (const slug of wishlistProducts) {
      const product = seededProducts.find((entry) => entry.product.slug === slug);
      if (!product) continue;
      await tx.query(
        `insert into wishlist_items (wishlist_id, product_id)
         select id, $2 from wishlists where profile_id = $1 on conflict do nothing`,
        [customerRecords[0].id, product.id],
      );
    }

    for (const subscriber of newsletterSubscribers) {
      await tx.query(
        `insert into newsletter_subscribers (email, status, source, confirmed_at)
         values ($1, 'subscribed', $2, now()) on conflict do nothing`,
        [subscriber.email, subscriber.source],
      );
    }

    const demoOrders = await tx.query<{ id: string; order_number: string; status: string }>(
      `select id, order_number, status from orders where profile_id = $1 order by placed_at desc`,
      [customerRecords[0].id],
    );
    const latestDelivered = demoOrders.rows.find((order) => order.status === 'delivered');
    const latestShipped = demoOrders.rows.find((order) =>
      ['shipped', 'out_for_delivery'].includes(order.status),
    );

    await tx.query(
      `insert into notifications (profile_id, type, title, body, link, is_read, created_at)
       values ($1, 'welcome', 'Welcome to Nile Mart', 'Your account is ready. Explore new arrivals and save your favourites.', '/products', true, now() - interval '30 days')`,
      [customerRecords[0].id],
    );
    if (latestDelivered) {
      await tx.query(
        `insert into notifications (profile_id, type, title, body, link, is_read, created_at)
         values ($1, 'order_delivered', $2, $3, $4, false, now() - interval '12 days')`,
        [
          customerRecords[0].id,
          `Order ${latestDelivered.order_number} delivered`,
          'Your parcel has been delivered. We would love to hear what you think.',
          `/account/orders/${latestDelivered.id}`,
        ],
      );
    }
    if (latestShipped) {
      await tx.query(
        `insert into notifications (profile_id, type, title, body, link, created_at)
         values ($1, 'order_shipped', $2, $3, $4, now() - interval '2 days')`,
        [
          customerRecords[0].id,
          `Order ${latestShipped.order_number} is on its way`,
          'Your order has left our warehouse and is with the courier.',
          `/account/orders/${latestShipped.id}`,
        ],
      );
      await tx.query(
        `insert into notifications (profile_id, type, title, body, link)
         values ($1, 'low_stock', 'Low stock alert', 'Several variants are below their low-stock threshold.', '/admin/inventory?low=1')`,
        [staffAdminId],
      );
    }

    const ticket = await tx.query<{ id: string }>(
      `insert into support_tickets (profile_id, order_id, email, subject, message, status, priority, assigned_to)
       values ($1, $2, $3, $4, $5, 'pending', 'normal', $6) returning id`,
      [
        customerRecords[0].id,
        latestDelivered?.id ?? null,
        customerRecords[0].email,
        'Delivery address change',
        'I would like to confirm that my order can be delivered to my office address instead. Could you please check before dispatch?',
        supportStaffId,
      ],
    );
    await tx.query(
      `insert into support_ticket_messages (ticket_id, sender_id, sender_type, body, created_at)
       values ($1, $2, 'customer', $3, now() - interval '3 days')`,
      [
        ticket.rows[0].id,
        customerRecords[0].id,
        'I would like to confirm that my order can be delivered to my office address instead.',
      ],
    );
    await tx.query(
      `insert into support_ticket_messages (ticket_id, sender_id, sender_type, body)
       values ($1, $2, 'staff', $3)`,
      [
        ticket.rows[0].id,
        supportStaffId,
        'Thanks for reaching out, Hana. We have updated the delivery instructions and the courier will call before arrival.',
      ],
    );

    await tx.query(
      `insert into audit_logs (actor_id, actor_email, action, entity_type, entity_id, after, created_at)
       values
         ($1, 'admin@nilemart.et', 'seed.catalogue_import', 'product', 'seed', $2::jsonb, now() - interval '10 days'),
         ($1, 'admin@nilemart.et', 'seed.coupon_created', 'coupon', 'WELCOME10', $3::jsonb, now() - interval '9 days')`,
      [
        staffAdminId,
        JSON.stringify({ products: products.length, source: 'development seed' }),
        JSON.stringify({ code: 'WELCOME10', type: 'percentage' }),
      ],
    );
  });

  logger.info('Demo seed data inserted', {
    products: products.length,
    categories: categories.length,
    customers: customers.length,
    staff: staff.length,
    orders: orderPlans.length,
    freeShippingThreshold,
    adminLogin: 'admin@nilemart.et',
    customerLogin: 'customer@nilemart.et',
  });
  return true;
}

function salesDeliveryKey(status: string, subtotal: number): keyof typeof deliveryMethods {
  if (subtotal >= freeShippingThreshold) return 'standard';
  const methods = ['standard', 'standard', 'standard', 'express', 'pickup'] as const;
  const base = methods[Math.floor(rand() * methods.length)];
  if (status === 'pending' && rand() > 0.7) return 'express';
  return base;
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const db = await getDatabase();
  try {
    await runMigrations(db);
    await seedDatabase(db);
  } catch (error) {
    logger.error('Seeding failed', { error: error instanceof Error ? error.message : String(error) });
    process.exitCode = 1;
  } finally {
    await closeDatabase();
  }
}
