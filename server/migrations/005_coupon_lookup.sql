-- Active coupon definitions are public-facing promotional data: the storefront
-- must be able to validate a code the shopper typed in. Only active coupons are
-- exposed, and staff-only policies still cover everything else.

create policy coupons_active_lookup on coupons for select using (is_active);

create policy coupon_products_active_lookup on coupon_products for select using (
  exists (select 1 from coupons c where c.id = coupon_id and c.is_active)
);

create policy coupon_categories_active_lookup on coupon_categories for select using (
  exists (select 1 from coupons c where c.id = coupon_id and c.is_active)
);
