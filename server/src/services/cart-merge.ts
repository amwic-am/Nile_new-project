import type { Database } from '../db/index.js';
import { logger } from '../lib/logger.js';

/**
 * Merges the guest cart referenced by the guest cookie into the customer's
 * active cart after login or registration. Stock is validated when the cart is
 * read or at checkout; this operation only combines quantities.
 */
export async function mergeGuestCart(
  db: Database,
  profileId: string,
  guestTokenValue: string | null | undefined,
): Promise<boolean> {
  if (!guestTokenValue) return false;

  try {
    return await db.transaction(async (tx) => {
      const guestResult = await tx.query<{ id: string; coupon_code: string | null }>(
        `select id, coupon_code from carts
          where guest_token = $1 and status = 'active'
          for update`,
        [guestTokenValue],
      );
      const guestCart = guestResult.rows[0];
      if (!guestCart) return false;

      const userResult = await tx.query<{ id: string; coupon_code: string | null }>(
        `select id, coupon_code from carts
          where profile_id = $1 and status = 'active'
          for update`,
        [profileId],
      );
      const userCart = userResult.rows[0];

      if (!userCart) {
        await tx.query(
          `update carts
              set profile_id = $2, guest_token = null, updated_at = now()
            where id = $1`,
          [guestCart.id, profileId],
        );
        return true;
      }

      const items = await tx.query<{
        variant_id: string;
        quantity: number;
        price_when_added: number;
      }>(
        `select variant_id, quantity, price_when_added from cart_items where cart_id = $1`,
        [guestCart.id],
      );

      for (const item of items.rows) {
        await tx.query(
          `insert into cart_items (cart_id, variant_id, quantity, price_when_added)
           values ($1, $2, $3, $4)
           on conflict (cart_id, variant_id) do update
             set quantity = least(99, cart_items.quantity + excluded.quantity),
                 updated_at = now()`,
          [userCart.id, item.variant_id, item.quantity, item.price_when_added],
        );
      }

      await tx.query(
        `update carts
            set coupon_code = coalesce(coupon_code, $2), updated_at = now()
          where id = $1`,
        [userCart.id, guestCart.coupon_code],
      );
      await tx.query(`delete from cart_items where cart_id = $1`, [guestCart.id]);
      await tx.query(
        `update carts set status = 'merged', profile_id = $2, guest_token = null, updated_at = now()
          where id = $1`,
        [guestCart.id, profileId],
      );
      return true;
    });
  } catch (error) {
    logger.warn('Guest cart merge failed', { error: String(error) });
    return false;
  }
}
