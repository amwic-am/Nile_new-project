import type { Sql } from '../db/index.js';
import { unprocessable } from '../lib/errors.js';

export interface CartLine {
  cartItemId: string;
  productId: string;
  variantId: string;
  name: string;
  slug: string;
  sku: string;
  brandName: string | null;
  imageUrl: string | null;
  variantLabel: string;
  options: Record<string, string>;
  unitPrice: number;
  compareAtPrice: number | null;
  priceWhenAdded: number;
  priceChanged: boolean;
  quantity: number;
  lineTotal: number;
  stockQuantity: number;
  reserved: number;
  available: number;
  maxQuantity: number;
  stockIssue: boolean;
  unavailable: boolean;
  categoryId: string | null;
}

export interface CouponEvaluation {
  coupon: {
    id: string;
    code: string;
    description: string;
    type: 'percentage' | 'fixed';
    value: number;
    minOrder: number;
    maxDiscount: number | null;
  } | null;
  discount: number;
  eligibleSubtotal: number;
  error: string | null;
}

export interface PricedCart {
  items: CartLine[];
  itemCount: number;
  subtotal: number;
  discount: number;
  total: number;
  coupon: CouponEvaluation['coupon'];
  couponError: string | null;
  hasIssues: boolean;
}

type CartRow = {
  cart_item_id: string;
  product_id: string;
  variant_id: string;
  name: string;
  slug: string;
  sku: string;
  brand_name: string | null;
  image_url: string | null;
  option_values: Record<string, string> | null;
  unit_price: number;
  compare_at_price: number | null;
  price_when_added: number;
  quantity: number;
  stock_quantity: number;
  reserved: number;
  product_status: string;
  variant_active: boolean;
  category_id: string | null;
};

export function formatVariantLabel(options: Record<string, string> | null): string {
  if (!options) return '';
  return Object.values(options).filter(Boolean).join(' · ');
}

export async function loadCartLines(db: Sql, cartId: string): Promise<CartLine[]> {
  const result = await db.query<CartRow>(
    `select ci.id as cart_item_id, p.id as product_id, v.id as variant_id, p.name, p.slug, v.sku,
            b.name as brand_name,
            (select url from product_images pi where pi.product_id = p.id order by pi.position asc limit 1) as image_url,
            v.option_values, v.price as unit_price, v.compare_at_price, ci.price_when_added, ci.quantity,
            coalesce(inv.quantity, 0) as stock_quantity, coalesce(inv.reserved, 0) as reserved,
            p.status as product_status, v.is_active as variant_active, p.category_id
       from cart_items ci
       join product_variants v on v.id = ci.variant_id
       join products p on p.id = v.product_id
       left join brands b on b.id = p.brand_id
       left join inventory inv on inv.variant_id = v.id
      where ci.cart_id = $1
      order by ci.created_at asc`,
    [cartId],
  );

  return result.rows.map((row) => {
    const options = row.option_values ?? {};
    const available = Math.max(0, Number(row.stock_quantity) - Number(row.reserved));
    const unavailable = row.product_status !== 'active' || !row.variant_active || available <= 0;
    const unitPrice = Number(row.unit_price);
    return {
      cartItemId: row.cart_item_id,
      productId: row.product_id,
      variantId: row.variant_id,
      name: row.name,
      slug: row.slug,
      sku: row.sku,
      brandName: row.brand_name,
      imageUrl: row.image_url,
      variantLabel: formatVariantLabel(options),
      options,
      unitPrice,
      compareAtPrice: row.compare_at_price === null ? null : Number(row.compare_at_price),
      priceWhenAdded: Number(row.price_when_added),
      priceChanged: Number(row.price_when_added) !== unitPrice,
      quantity: Number(row.quantity),
      lineTotal: unitPrice * Number(row.quantity),
      stockQuantity: Number(row.stock_quantity),
      reserved: Number(row.reserved),
      available,
      maxQuantity: available,
      stockIssue: !unavailable && Number(row.quantity) > available,
      unavailable,
      categoryId: row.category_id,
    };
  });
}

async function couponEligibleProducts(
  db: Sql,
  couponId: string,
  appliesTo: string,
  lines: CartLine[],
): Promise<Set<string> | null> {
  if (appliesTo === 'all') return null;
  if (appliesTo === 'products') {
    const result = await db.query<{ product_id: string }>(
      'select product_id from coupon_products where coupon_id = $1',
      [couponId],
    );
    return new Set(result.rows.map((row) => row.product_id));
  }
  const categoryRows = await db.query<{ category_id: string }>(
    'select category_id from coupon_categories where coupon_id = $1',
    [couponId],
  );
  if (!categoryRows.rows.length) return new Set();
  const categoryIds = categoryRows.rows.map((row) => row.category_id);
  const productIds = lines.map((line) => line.productId);
  if (!productIds.length) return new Set();
  const eligible = await db.query<{ product_id: string }>(
    `with recursive descendants as (
       select id from categories where id = any($1::uuid[])
       union all
       select c.id from categories c join descendants d on c.parent_id = d.id
     )
     select p.id as product_id
       from products p
      where p.id = any($2::uuid[]) and p.category_id in (select id from descendants)`,
    [categoryIds, productIds],
  );
  return new Set(eligible.rows.map((row) => row.product_id));
}

export async function evaluateCoupon(
  db: Sql,
  options: {
    code: string | null | undefined;
    lines: CartLine[];
    profileId?: string | null;
    email?: string | null;
  },
): Promise<CouponEvaluation> {
  const empty: CouponEvaluation = { coupon: null, discount: 0, eligibleSubtotal: 0, error: null };
  const code = options.code?.trim();
  if (!code) return empty;

  const result = await db.query<{
    id: string;
    code: string;
    description: string;
    discount_type: 'percentage' | 'fixed';
    discount_value: number;
    min_order: number;
    max_discount: number | null;
    usage_limit: number | null;
    per_user_limit: number;
    used_count: number;
    is_active: boolean;
    applies_to: string;
    starts_at: Date | null;
    ends_at: Date | null;
  }>(
    `select id, code, description, discount_type, discount_value, min_order, max_discount,
            usage_limit, per_user_limit, used_count, is_active, applies_to, starts_at, ends_at
       from coupons where lower(code) = lower($1) limit 1`,
    [code],
  );
  const row = result.rows[0];
  if (!row) return { ...empty, error: 'That discount code is not valid.' };

  const now = Date.now();
  if (!row.is_active) return { ...empty, error: 'That discount code is no longer active.' };
  if (row.starts_at && new Date(row.starts_at).getTime() > now) {
    return { ...empty, error: 'That discount code is not active yet.' };
  }
  if (row.ends_at && new Date(row.ends_at).getTime() < now) {
    return { ...empty, error: 'That discount code has expired.' };
  }
  if (row.usage_limit !== null && Number(row.used_count) >= Number(row.usage_limit)) {
    return { ...empty, error: 'That discount code has reached its usage limit.' };
  }

  if (options.profileId || options.email) {
    const usage = await db.query<{ count: number }>(
      `select count(*)::int as count from coupon_redemptions
        where coupon_id = $1
          and (($2::uuid is not null and profile_id = $2::uuid)
               or ($3::text <> '' and lower(email) = lower($3::text)))`,
      [row.id, options.profileId ?? null, options.email ?? ''],
    );
    if (Number(usage.rows[0]?.count ?? 0) >= Number(row.per_user_limit)) {
      return { ...empty, error: 'You have already used that discount code.' };
    }
  }

  const purchasable = options.lines.filter((line) => !line.unavailable && line.quantity > 0);
  const eligibleProducts = await couponEligibleProducts(db, row.id, row.applies_to, purchasable);
  const eligibleLines = eligibleProducts
    ? purchasable.filter((line) => eligibleProducts.has(line.productId))
    : purchasable;
  const subtotal = purchasable.reduce((sum, line) => sum + line.lineTotal, 0);
  const eligibleSubtotal = eligibleLines.reduce((sum, line) => sum + line.lineTotal, 0);

  if (!eligibleLines.length) {
    return {
      ...empty,
      coupon: null,
      eligibleSubtotal,
      error: 'That discount code does not apply to the items in your cart.',
    };
  }
  if (subtotal < Number(row.min_order) || eligibleSubtotal <= 0) {
    const shortfall = Number(row.min_order) - subtotal;
    return {
      ...empty,
      eligibleSubtotal,
      error: `Add ETB ${(shortfall / 100).toLocaleString('en-ET')} more to use this code.`,
    };
  }

  const rawDiscount =
    row.discount_type === 'percentage'
      ? Math.round((eligibleSubtotal * Number(row.discount_value)) / 10_000)
      : Math.min(Number(row.discount_value), eligibleSubtotal);
  const discount = row.max_discount
    ? Math.min(rawDiscount, Number(row.max_discount))
    : rawDiscount;

  return {
    coupon: {
      id: row.id,
      code: row.code,
      description: row.description,
      type: row.discount_type,
      value: Number(row.discount_value),
      minOrder: Number(row.min_order),
      maxDiscount: row.max_discount === null ? null : Number(row.max_discount),
    },
    discount: Math.min(discount, subtotal),
    eligibleSubtotal,
    error: null,
  };
}

export function summarizeCart(lines: CartLine[], evaluation: CouponEvaluation): PricedCart {
  const purchasable = lines.filter((line) => !line.unavailable);
  const subtotal = purchasable.reduce((sum, line) => sum + line.lineTotal, 0);
  const discount = evaluation.coupon ? Math.min(evaluation.discount, subtotal) : 0;
  return {
    items: lines,
    itemCount: purchasable.reduce((sum, line) => sum + line.quantity, 0),
    subtotal,
    discount,
    total: Math.max(0, subtotal - discount),
    coupon: evaluation.coupon,
    couponError: evaluation.error,
    hasIssues: lines.some((line) => line.unavailable || line.stockIssue),
  };
}

export function assertPurchasableLines(lines: CartLine[]): void {
  if (!lines.length) throw unprocessable('Your cart is empty');
  const unavailable = lines.filter((line) => line.unavailable);
  if (unavailable.length) {
    throw unprocessable(
      `${unavailable.map((line) => line.name).join(', ')} ${unavailable.length === 1 ? 'is' : 'are'} no longer available.`,
    );
  }
  const short = lines.filter((line) => line.stockIssue);
  if (short.length) {
    throw unprocessable(
      short
        .map(
          (line) =>
            `Only ${line.available} left of ${line.name}${line.variantLabel ? ` (${line.variantLabel})` : ''}.`,
        )
        .join(' '),
    );
  }
}
