import type { Sql } from '../db/index.js';
import { badRequest, unprocessable } from '../lib/errors.js';
import { getDeliveryMethods, getFreeShippingThreshold } from './settings.js';
import {
  evaluateCoupon,
  loadCartLines,
  summarizeCart,
  type CartLine,
  type PricedCart,
} from './pricing.js';

export interface CartIdentity {
  profileId: string | null;
  guestToken: string | null;
}

export interface CartRecord {
  id: string;
  couponCode: string | null;
}

export async function findActiveCart(db: Sql, identity: CartIdentity): Promise<CartRecord | null> {
  const result = identity.profileId
    ? await db.query<{ id: string; coupon_code: string | null }>(
        `select id, coupon_code from carts
          where profile_id = $1 and status = 'active' limit 1`,
        [identity.profileId],
      )
    : await db.query<{ id: string; coupon_code: string | null }>(
        `select id, coupon_code from carts
          where guest_token = $1 and status = 'active' limit 1`,
        [identity.guestToken ?? ''],
      );
  const row = result.rows[0];
  return row ? { id: row.id, couponCode: row.coupon_code } : null;
}

export async function ensureActiveCart(db: Sql, identity: CartIdentity): Promise<CartRecord> {
  const existing = await findActiveCart(db, identity);
  if (existing) return existing;
  if (!identity.profileId && !identity.guestToken) {
    throw badRequest('A cart session is required');
  }
  const result = await db.query<{ id: string; coupon_code: string | null }>(
    `insert into carts (profile_id, guest_token)
     values ($1, $2)
     returning id, coupon_code`,
    [identity.profileId, identity.profileId ? null : identity.guestToken],
  );
  return { id: result.rows[0].id, couponCode: result.rows[0].coupon_code };
}

export interface CartView {
  id: string | null;
  couponCode: string | null;
  items: PricedCart['items'];
  itemCount: number;
  subtotal: number;
  discount: number;
  total: number;
  coupon: PricedCart['coupon'];
  couponError: string | null;
  hasIssues: boolean;
  currency: 'ETB';
  freeShippingThreshold: number;
  deliveryMethods: {
    id: string;
    label: string;
    description: string;
    fee: number;
    effectiveFee: number;
    enabled: boolean;
  }[];
}

export async function buildCartView(
  db: Sql,
  cart: CartRecord | null,
  email?: string | null,
): Promise<CartView> {
  const lines = cart ? await loadCartLines(db, cart.id) : [];
  const evaluation = await evaluateCoupon(db, {
    code: cart?.couponCode,
    lines,
    email,
  });
  const priced = summarizeCart(lines, evaluation);
  const [methods, threshold] = await Promise.all([getDeliveryMethods(db), getFreeShippingThreshold(db)]);

  return {
    id: cart?.id ?? null,
    couponCode: cart?.couponCode ?? null,
    items: priced.items,
    itemCount: priced.itemCount,
    subtotal: priced.subtotal,
    discount: priced.discount,
    total: priced.total,
    coupon: priced.coupon,
    couponError: priced.couponError,
    hasIssues: priced.hasIssues,
    currency: 'ETB',
    freeShippingThreshold: threshold,
    deliveryMethods: methods.map((method) => ({
      id: method.id,
      label: method.label,
      description: method.description,
      fee: method.fee,
      effectiveFee: method.id === 'pickup' || priced.total >= threshold ? 0 : method.fee,
      enabled: method.enabled,
    })),
  };
}

export async function readCart(
  db: Sql,
  identity: CartIdentity,
  email?: string | null,
): Promise<CartView> {
  const cart = await findActiveCart(db, identity);
  return buildCartView(db, cart, email);
}

type VariantAvailabilityRow = {
  id: string;
  is_active: boolean;
  product_id: string;
  product_status: string;
  product_name: string;
  available: number;
};

async function loadVariantAvailability(db: Sql, variantId: string): Promise<VariantAvailabilityRow> {
  const result = await db.query<VariantAvailabilityRow>(
    `select v.id, v.is_active, p.id as product_id, p.status as product_status, p.name as product_name,
            greatest(coalesce(inv.quantity, 0) - coalesce(inv.reserved, 0), 0)::int as available
       from product_variants v
       join products p on p.id = v.product_id
       left join inventory inv on inv.variant_id = v.id
      where v.id = $1`,
    [variantId],
  );
  const row = result.rows[0];
  if (!row) throw unprocessable('That product variant no longer exists.');
  if (row.product_status !== 'active' || !row.is_active) {
    throw unprocessable('That product is no longer available.');
  }
  return row;
}

export async function addCartItem(
  db: Sql,
  identity: CartIdentity,
  input: { variantId: string; quantity: number },
  email?: string | null,
): Promise<CartView> {
  const cart = await ensureActiveCart(db, identity);
  const variant = await loadVariantAvailability(db, input.variantId);
  if (variant.available <= 0) throw unprocessable('This item is out of stock.');

  const existing = await db.query<{ quantity: number }>(
    'select quantity from cart_items where cart_id = $1 and variant_id = $2',
    [cart.id, input.variantId],
  );
  const desired = (existing.rows[0]?.quantity ?? 0) + input.quantity;
  if (desired > 99) throw unprocessable('You can order at most 99 units of this item.');
  if (desired > variant.available) {
    throw unprocessable(
      variant.available === 1
        ? `Only 1 unit of ${variant.product_name} is available.`
        : `Only ${variant.available} units of ${variant.product_name} are available.`,
    );
  }

  const price = await db.query<{ price: number }>(
    'select price from product_variants where id = $1',
    [input.variantId],
  );
  await db.query(
    `insert into cart_items (cart_id, variant_id, quantity, price_when_added)
     values ($1, $2, $3, $4)
     on conflict (cart_id, variant_id) do update
       set quantity = cart_items.quantity + excluded.quantity,
           price_when_added = excluded.price_when_added,
           updated_at = now()`,
    [cart.id, input.variantId, input.quantity, Number(price.rows[0]?.price ?? 0)],
  );
  await db.query('update carts set updated_at = now() where id = $1', [cart.id]);
  return buildCartView(db, cart, email);
}

export async function updateCartItem(
  db: Sql,
  identity: CartIdentity,
  cartItemId: string,
  quantity: number,
  email?: string | null,
): Promise<CartView> {
  const cart = await ensureActiveCart(db, identity);
  const item = await db.query<{ variant_id: string }>(
    'select variant_id from cart_items where id = $1 and cart_id = $2',
    [cartItemId, cart.id],
  );
  if (!item.rows[0]) throw unprocessable('That cart item no longer exists.');
  if (quantity <= 0) {
    await db.query('delete from cart_items where id = $1 and cart_id = $2', [cartItemId, cart.id]);
    await db.query('update carts set updated_at = now() where id = $1', [cart.id]);
    return buildCartView(db, cart, email);
  }
  if (quantity > 99) throw unprocessable('You can order at most 99 units of this item.');
  const variant = await loadVariantAvailability(db, item.rows[0].variant_id);
  if (quantity > variant.available) {
    throw unprocessable(
      variant.available === 0
        ? 'This item is out of stock.'
        : `Only ${variant.available} units are available.`,
    );
  }
  await db.query(
    'update cart_items set quantity = $3, updated_at = now() where id = $1 and cart_id = $2',
    [cartItemId, cart.id, quantity],
  );
  await db.query('update carts set updated_at = now() where id = $1', [cart.id]);
  return buildCartView(db, cart, email);
}

export async function removeCartItem(
  db: Sql,
  identity: CartIdentity,
  cartItemId: string,
  email?: string | null,
): Promise<CartView> {
  const cart = await findActiveCart(db, identity);
  if (!cart) return buildCartView(db, null, email);
  await db.query('delete from cart_items where id = $1 and cart_id = $2', [cartItemId, cart.id]);
  await db.query('update carts set updated_at = now() where id = $1', [cart.id]);
  return buildCartView(db, cart, email);
}

export async function clearCart(
  db: Sql,
  identity: CartIdentity,
  email?: string | null,
): Promise<CartView> {
  const cart = await findActiveCart(db, identity);
  if (!cart) return buildCartView(db, null, email);
  await db.query('delete from cart_items where cart_id = $1', [cart.id]);
  await db.query('update carts set coupon_code = null, updated_at = now() where id = $1', [cart.id]);
  return buildCartView(db, cart, email);
}

export async function applyCartCoupon(
  db: Sql,
  identity: CartIdentity,
  code: string,
  email?: string | null,
): Promise<CartView> {
  const cart = await ensureActiveCart(db, identity);
  const lines: CartLine[] = await loadCartLines(db, cart.id);
  if (!lines.length) throw unprocessable('Add items to your cart before applying a discount code.');
  const evaluation = await evaluateCoupon(db, {
    code,
    lines,
    profileId: identity.profileId,
    email,
  });
  if (!evaluation.coupon) {
    throw unprocessable(evaluation.error ?? 'That discount code cannot be used with this cart.');
  }
  await db.query('update carts set coupon_code = $2, updated_at = now() where id = $1', [
    cart.id,
    evaluation.coupon.code,
  ]);
  return buildCartView(db, { ...cart, couponCode: evaluation.coupon.code }, email);
}

export async function removeCartCoupon(
  db: Sql,
  identity: CartIdentity,
  email?: string | null,
): Promise<CartView> {
  const cart = await findActiveCart(db, identity);
  if (!cart) return buildCartView(db, null, email);
  await db.query('update carts set coupon_code = null, updated_at = now() where id = $1', [cart.id]);
  return buildCartView(db, { ...cart, couponCode: null }, email);
}
