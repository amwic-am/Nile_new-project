-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- The API connects as a restricted role (`nilemart_app`) for every end-user
-- request. Each request runs inside a transaction that sets:
--   app.user_id     -> the authenticated profile id (empty for guests)
--   app.perms       -> comma separated permissions granted by staff roles
--   app.guest_token -> the guest cart token (empty when absent)
--
-- Trusted server flows (authentication, checkout, payment webhooks, stock
-- engine) use the database owner connection and perform explicit ownership
-- and permission checks in code. Keeping those flows out of the restricted
-- role prevents customers from writing stock or financial records.
-- ---------------------------------------------------------------------------

create schema if not exists app;

create or replace function app.current_user_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

create or replace function app.guest_token() returns text
language sql stable as $$
  select nullif(current_setting('app.guest_token', true), '')
$$;

create or replace function app.has_perm(perm text) returns boolean
language sql stable as $$
  select coalesce(
    perm = any(string_to_array(nullif(current_setting('app.perms', true), ''), ',')),
    false
  )
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'nilemart_app') then
    create role nilemart_app nologin;
  end if;
end
$$;

grant usage on schema public to nilemart_app;
grant usage on schema app to nilemart_app;
grant execute on all functions in schema app to nilemart_app;

grant usage on sequence order_number_seq to nilemart_app;

grant select on categories, brands, products, product_images, product_options,
  product_option_values, product_variants, inventory, reviews, banners,
  content_pages, store_settings, roles, permissions, role_permissions
  to nilemart_app;
grant insert, update, delete on categories, brands, products, product_images,
  product_options, product_option_values, product_variants
  to nilemart_app;
grant select, insert, update, delete on inventory to nilemart_app;
grant select, insert, update, delete on product_costs to nilemart_app;
grant select, insert on inventory_movements to nilemart_app;
grant select, insert, update, delete on suppliers, supplier_products to nilemart_app;

grant select on profiles to nilemart_app;
grant update (full_name, phone, avatar_url, marketing_opt_in, notification_prefs, updated_at)
  on profiles to nilemart_app;

grant select, insert, delete on user_roles to nilemart_app;

grant select, insert, update, delete on addresses to nilemart_app;
grant select, insert, update, delete on carts, cart_items to nilemart_app;
grant select, insert, update, delete on wishlists, wishlist_items to nilemart_app;

grant select, update on orders to nilemart_app;
grant select on order_items, order_status_history, payments, shipments to nilemart_app;
grant select, insert, update on returns to nilemart_app;
grant select, insert, update on refunds to nilemart_app;

grant select, insert, update, delete on coupons to nilemart_app;
grant select, insert, update, delete on coupon_products, coupon_categories to nilemart_app;
grant select on coupon_redemptions to nilemart_app;

grant select, insert, update, delete on reviews to nilemart_app;
grant select, insert on notifications to nilemart_app;
grant update (is_read) on notifications to nilemart_app;

grant select, insert, update on support_tickets to nilemart_app;
grant select, insert on support_ticket_messages to nilemart_app;

grant select on audit_logs to nilemart_app;
grant select, insert, update, delete on banners to nilemart_app;
grant select on newsletter_subscribers to nilemart_app;
grant update on content_pages to nilemart_app;
grant update on store_settings to nilemart_app;
grant insert, update, delete on roles, permissions, role_permissions to nilemart_app;

-- Enable RLS ---------------------------------------------------------------

alter table categories enable row level security;
alter table brands enable row level security;
alter table products enable row level security;
alter table product_costs enable row level security;
alter table product_images enable row level security;
alter table product_options enable row level security;
alter table product_option_values enable row level security;
alter table product_variants enable row level security;
alter table inventory enable row level security;
alter table inventory_movements enable row level security;
alter table suppliers enable row level security;
alter table supplier_products enable row level security;
alter table profiles enable row level security;
alter table user_roles enable row level security;
alter table addresses enable row level security;
alter table carts enable row level security;
alter table cart_items enable row level security;
alter table wishlists enable row level security;
alter table wishlist_items enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table order_status_history enable row level security;
alter table payments enable row level security;
alter table shipments enable row level security;
alter table returns enable row level security;
alter table refunds enable row level security;
alter table coupons enable row level security;
alter table coupon_products enable row level security;
alter table coupon_categories enable row level security;
alter table coupon_redemptions enable row level security;
alter table reviews enable row level security;
alter table notifications enable row level security;
alter table support_tickets enable row level security;
alter table support_ticket_messages enable row level security;
alter table audit_logs enable row level security;
alter table banners enable row level security;
alter table newsletter_subscribers enable row level security;
alter table content_pages enable row level security;
alter table store_settings enable row level security;

-- Catalogue ----------------------------------------------------------------

create policy categories_read on categories for select using (
  is_active
  or app.has_perm('products.read')
  or app.has_perm('categories.write')
  or app.has_perm('inventory.read')
);
create policy categories_write on categories for insert with check (app.has_perm('categories.write'));
create policy categories_update on categories for update using (app.has_perm('categories.write')) with check (app.has_perm('categories.write'));
create policy categories_delete on categories for delete using (app.has_perm('categories.write'));

create policy brands_read on brands for select using (
  is_active or app.has_perm('products.read') or app.has_perm('brands.write')
);
create policy brands_write on brands for insert with check (app.has_perm('brands.write'));
create policy brands_update on brands for update using (app.has_perm('brands.write')) with check (app.has_perm('brands.write'));
create policy brands_delete on brands for delete using (app.has_perm('brands.write'));

create policy products_read on products for select using (
  status = 'active'
  or app.has_perm('products.read')
  or app.has_perm('products.write')
  or app.has_perm('inventory.read')
  or app.has_perm('orders.read')
);
create policy products_write on products for insert with check (app.has_perm('products.write'));
create policy products_update on products for update using (app.has_perm('products.write')) with check (app.has_perm('products.write'));
create policy products_delete on products for delete using (app.has_perm('products.delete'));

create policy product_costs_read on product_costs for select using (
  app.has_perm('inventory.cost')
);
create policy product_costs_write on product_costs for insert with check (app.has_perm('inventory.cost'));
create policy product_costs_update on product_costs for update using (app.has_perm('inventory.cost')) with check (app.has_perm('inventory.cost'));
create policy product_costs_delete on product_costs for delete using (app.has_perm('inventory.cost'));

create policy product_images_read on product_images for select using (
  exists (select 1 from products p where p.id = product_id)
);
create policy product_images_write on product_images for insert with check (app.has_perm('products.write'));
create policy product_images_update on product_images for update using (app.has_perm('products.write')) with check (app.has_perm('products.write'));
create policy product_images_delete on product_images for delete using (app.has_perm('products.write'));

create policy product_options_read on product_options for select using (
  exists (select 1 from products p where p.id = product_id)
);
create policy product_options_write on product_options for insert with check (app.has_perm('products.write'));
create policy product_options_update on product_options for update using (app.has_perm('products.write')) with check (app.has_perm('products.write'));
create policy product_options_delete on product_options for delete using (app.has_perm('products.write'));

create policy product_option_values_read on product_option_values for select using (
  exists (
    select 1 from product_options po
    join products p on p.id = po.product_id
    where po.id = option_id
  )
);
create policy product_option_values_write on product_option_values for insert with check (app.has_perm('products.write'));
create policy product_option_values_update on product_option_values for update using (app.has_perm('products.write')) with check (app.has_perm('products.write'));
create policy product_option_values_delete on product_option_values for delete using (app.has_perm('products.write'));

create policy product_variants_read on product_variants for select using (
  exists (select 1 from products p where p.id = product_id)
);
create policy product_variants_write on product_variants for insert with check (app.has_perm('products.write'));
create policy product_variants_update on product_variants for update using (app.has_perm('products.write')) with check (app.has_perm('products.write'));
create policy product_variants_delete on product_variants for delete using (app.has_perm('products.write'));

create policy inventory_read on inventory for select using (true);
create policy inventory_insert on inventory for insert with check (app.has_perm('inventory.write'));
create policy inventory_update on inventory for update using (app.has_perm('inventory.write')) with check (app.has_perm('inventory.write'));
create policy inventory_delete on inventory for delete using (app.has_perm('inventory.write'));

create policy inventory_movements_read on inventory_movements for select using (
  app.has_perm('inventory.read') or app.has_perm('inventory.write')
);
create policy inventory_movements_insert on inventory_movements for insert with check (
  app.has_perm('inventory.write')
);

create policy suppliers_read on suppliers for select using (
  app.has_perm('suppliers.read') or app.has_perm('suppliers.write') or app.has_perm('inventory.read')
);
create policy suppliers_insert on suppliers for insert with check (app.has_perm('suppliers.write'));
create policy suppliers_update on suppliers for update using (app.has_perm('suppliers.write')) with check (app.has_perm('suppliers.write'));
create policy suppliers_delete on suppliers for delete using (app.has_perm('suppliers.write'));

create policy supplier_products_read on supplier_products for select using (
  app.has_perm('suppliers.read') or app.has_perm('suppliers.write') or app.has_perm('inventory.read')
);
create policy supplier_products_insert on supplier_products for insert with check (app.has_perm('suppliers.write'));
create policy supplier_products_update on supplier_products for update using (app.has_perm('suppliers.write')) with check (app.has_perm('suppliers.write'));
create policy supplier_products_delete on supplier_products for delete using (app.has_perm('suppliers.write'));

-- People -------------------------------------------------------------------

create policy profiles_read on profiles for select using (
  id = app.current_user_id()
  or app.has_perm('customers.read')
  or app.has_perm('orders.read')
  or app.has_perm('support.read')
  or app.has_perm('staff.read')
);
create policy profiles_update on profiles for update using (
  id = app.current_user_id() or app.has_perm('customers.write')
) with check (
  id = app.current_user_id() or app.has_perm('customers.write')
);

create policy user_roles_read on user_roles for select using (
  profile_id = app.current_user_id() or app.has_perm('staff.read')
);
create policy user_roles_insert on user_roles for insert with check (app.has_perm('staff.write'));
create policy user_roles_delete on user_roles for delete using (app.has_perm('staff.write'));

create policy addresses_read on addresses for select using (
  profile_id = app.current_user_id()
  or app.has_perm('customers.read')
  or app.has_perm('orders.read')
);
create policy addresses_insert on addresses for insert with check (profile_id = app.current_user_id());
create policy addresses_update on addresses for update using (profile_id = app.current_user_id()) with check (profile_id = app.current_user_id());
create policy addresses_delete on addresses for delete using (profile_id = app.current_user_id());

-- Carts and wishlists ------------------------------------------------------

create policy carts_access on carts for select using (
  profile_id = app.current_user_id()
  or (guest_token is not null and guest_token = app.guest_token())
);
create policy carts_insert on carts for insert with check (
  profile_id = app.current_user_id()
  or (guest_token is not null and guest_token = app.guest_token())
);
create policy carts_update on carts for update using (
  profile_id = app.current_user_id()
  or (guest_token is not null and guest_token = app.guest_token())
) with check (
  profile_id = app.current_user_id()
  or (guest_token is not null and guest_token = app.guest_token())
);
create policy carts_delete on carts for delete using (
  profile_id = app.current_user_id()
  or (guest_token is not null and guest_token = app.guest_token())
);

create policy cart_items_access on cart_items for select using (
  exists (select 1 from carts c where c.id = cart_id)
);
create policy cart_items_insert on cart_items for insert with check (
  exists (select 1 from carts c where c.id = cart_id)
);
create policy cart_items_update on cart_items for update using (
  exists (select 1 from carts c where c.id = cart_id)
) with check (
  exists (select 1 from carts c where c.id = cart_id)
);
create policy cart_items_delete on cart_items for delete using (
  exists (select 1 from carts c where c.id = cart_id)
);

create policy wishlists_access on wishlists for select using (profile_id = app.current_user_id());
create policy wishlists_insert on wishlists for insert with check (profile_id = app.current_user_id());
create policy wishlists_update on wishlists for update using (profile_id = app.current_user_id()) with check (profile_id = app.current_user_id());
create policy wishlists_delete on wishlists for delete using (profile_id = app.current_user_id());

create policy wishlist_items_access on wishlist_items for select using (
  exists (select 1 from wishlists w where w.id = wishlist_id)
);
create policy wishlist_items_insert on wishlist_items for insert with check (
  exists (select 1 from wishlists w where w.id = wishlist_id)
);
create policy wishlist_items_delete on wishlist_items for delete using (
  exists (select 1 from wishlists w where w.id = wishlist_id)
);

-- Orders -------------------------------------------------------------------

create policy orders_read on orders for select using (
  profile_id = app.current_user_id()
  or app.has_perm('orders.read')
  or app.has_perm('orders.update')
  or app.has_perm('payments.read')
  or app.has_perm('payments.manage')
  or app.has_perm('support.read')
);
create policy orders_update on orders for update using (
  app.has_perm('orders.update') or app.has_perm('orders.refund')
) with check (
  app.has_perm('orders.update') or app.has_perm('orders.refund')
);

create policy order_items_read on order_items for select using (
  exists (select 1 from orders o where o.id = order_id)
);
create policy order_status_history_read on order_status_history for select using (
  exists (select 1 from orders o where o.id = order_id)
);
create policy payments_read on payments for select using (
  exists (select 1 from orders o where o.id = order_id)
);
create policy shipments_read on shipments for select using (
  exists (select 1 from orders o where o.id = order_id)
);

create policy returns_read on returns for select using (
  exists (select 1 from orders o where o.id = order_id)
);
create policy returns_insert on returns for insert with check (
  profile_id = app.current_user_id()
  and exists (select 1 from orders o where o.id = order_id)
);
create policy returns_update on returns for update using (
  app.has_perm('orders.update') or app.has_perm('orders.refund')
) with check (
  app.has_perm('orders.update') or app.has_perm('orders.refund')
);

create policy refunds_read on refunds for select using (
  app.has_perm('payments.read')
  or app.has_perm('payments.manage')
  or app.has_perm('orders.refund')
  or exists (select 1 from orders o where o.id = order_id)
);
create policy refunds_insert on refunds for insert with check (
  app.has_perm('orders.refund') or app.has_perm('payments.manage')
);
create policy refunds_update on refunds for update using (
  app.has_perm('orders.refund') or app.has_perm('payments.manage')
) with check (
  app.has_perm('orders.refund') or app.has_perm('payments.manage')
);

-- Promotions ---------------------------------------------------------------

create policy coupons_staff on coupons for select using (app.has_perm('promotions.read') or app.has_perm('promotions.write'));
create policy coupons_insert on coupons for insert with check (app.has_perm('promotions.write'));
create policy coupons_update on coupons for update using (app.has_perm('promotions.write')) with check (app.has_perm('promotions.write'));
create policy coupons_delete on coupons for delete using (app.has_perm('promotions.write'));

create policy coupon_products_staff on coupon_products for select using (app.has_perm('promotions.read') or app.has_perm('promotions.write'));
create policy coupon_products_insert on coupon_products for insert with check (app.has_perm('promotions.write'));
create policy coupon_products_delete on coupon_products for delete using (app.has_perm('promotions.write'));
create policy coupon_categories_staff on coupon_categories for select using (app.has_perm('promotions.read') or app.has_perm('promotions.write'));
create policy coupon_categories_insert on coupon_categories for insert with check (app.has_perm('promotions.write'));
create policy coupon_categories_delete on coupon_categories for delete using (app.has_perm('promotions.write'));

create policy coupon_redemptions_read on coupon_redemptions for select using (
  profile_id = app.current_user_id()
  or app.has_perm('promotions.read')
  or app.has_perm('promotions.write')
);

-- Reviews ------------------------------------------------------------------

create policy reviews_read on reviews for select using (
  status = 'approved'
  or profile_id = app.current_user_id()
  or app.has_perm('reviews.moderate')
);
create policy reviews_insert on reviews for insert with check (
  profile_id = app.current_user_id() and status = 'pending'
);
create policy reviews_update on reviews for update using (
  profile_id = app.current_user_id() or app.has_perm('reviews.moderate')
) with check (
  app.has_perm('reviews.moderate')
  or (profile_id = app.current_user_id() and status = 'pending')
);
create policy reviews_delete on reviews for delete using (
  profile_id = app.current_user_id() or app.has_perm('reviews.moderate')
);

-- Notifications and support ------------------------------------------------

create policy notifications_read on notifications for select using (profile_id = app.current_user_id());
create policy notifications_update on notifications for update using (profile_id = app.current_user_id()) with check (profile_id = app.current_user_id());

create policy support_tickets_read on support_tickets for select using (
  profile_id = app.current_user_id() or app.has_perm('support.read') or app.has_perm('support.write')
);
create policy support_tickets_insert on support_tickets for insert with check (
  profile_id = app.current_user_id() or profile_id is null
);
create policy support_tickets_update on support_tickets for update using (
  profile_id = app.current_user_id() or app.has_perm('support.write')
) with check (
  profile_id = app.current_user_id() or app.has_perm('support.write')
);

create policy support_ticket_messages_read on support_ticket_messages for select using (
  exists (select 1 from support_tickets t where t.id = ticket_id)
);
create policy support_ticket_messages_insert on support_ticket_messages for insert with check (
  exists (select 1 from support_tickets t where t.id = ticket_id)
);

-- Content and system -------------------------------------------------------

create policy banners_read on banners for select using (
  (
    is_active
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
  )
  or app.has_perm('promotions.write')
);
create policy banners_insert on banners for insert with check (app.has_perm('promotions.write'));
create policy banners_update on banners for update using (app.has_perm('promotions.write')) with check (app.has_perm('promotions.write'));
create policy banners_delete on banners for delete using (app.has_perm('promotions.write'));

create policy content_pages_read on content_pages for select using (is_published or app.has_perm('content.write'));
create policy content_pages_write on content_pages for update using (app.has_perm('content.write')) with check (app.has_perm('content.write'));

create policy store_settings_read on store_settings for select using (is_public or app.has_perm('settings.read'));
create policy store_settings_update on store_settings for update using (app.has_perm('settings.write')) with check (app.has_perm('settings.write'));

create policy newsletter_read on newsletter_subscribers for select using (
  app.has_perm('promotions.read') or app.has_perm('promotions.write')
);

create policy audit_logs_read on audit_logs for select using (app.has_perm('audit.read'));

create policy roles_read on roles for select using (true);
create policy roles_write on roles for insert with check (app.has_perm('staff.write'));
create policy roles_update on roles for update using (app.has_perm('staff.write')) with check (app.has_perm('staff.write'));
create policy roles_delete on roles for delete using (app.has_perm('staff.write'));

create policy permissions_read on permissions for select using (true);
create policy permissions_write on permissions for insert with check (app.has_perm('staff.write'));
create policy permissions_update on permissions for update using (app.has_perm('staff.write')) with check (app.has_perm('staff.write'));
create policy permissions_delete on permissions for delete using (app.has_perm('staff.write'));

create policy role_permissions_read on role_permissions for select using (true);
create policy role_permissions_insert on role_permissions for insert with check (app.has_perm('staff.write'));
create policy role_permissions_update on role_permissions for update using (app.has_perm('staff.write')) with check (app.has_perm('staff.write'));
create policy role_permissions_delete on role_permissions for delete using (app.has_perm('staff.write'));
