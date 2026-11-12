-- ---------------------------------------------------------------------------
-- Nile Mart core schema (PostgreSQL 15+ / PGlite compatible)
-- Monetary values are stored as BIGINT in santim (1 ETB = 100 santim).
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Roles, permissions, profiles, authentication
-- ---------------------------------------------------------------------------

create table roles (
  key text primary key,
  name text not null,
  description text not null default '',
  is_staff boolean not null default true,
  created_at timestamptz not null default now()
);

create table permissions (
  key text primary key,
  description text not null default ''
);

create table role_permissions (
  role_key text not null references roles(key) on delete cascade,
  permission_key text not null references permissions(key) on delete cascade,
  primary key (role_key, permission_key)
);

create table profiles (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text not null default '',
  phone text,
  status text not null default 'active' check (status in ('active', 'suspended', 'deleted')),
  avatar_url text,
  marketing_opt_in boolean not null default false,
  notification_prefs jsonb not null default '{"order_updates": true, "promotions": false, "newsletter": false}'::jsonb,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index profiles_email_lower_uidx on profiles (lower(email));

-- Authentication secrets are isolated from the application role so that a
-- compromised storefront role can never read password hashes or tokens.
create table auth_credentials (
  profile_id uuid primary key references profiles(id) on delete cascade,
  password_hash text not null,
  email_verified_at timestamptz,
  verification_sent_at timestamptz,
  password_changed_at timestamptz,
  failed_attempts integer not null default 0,
  locked_until timestamptz
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  token_hash text not null unique,
  user_agent text,
  ip text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create index sessions_profile_idx on sessions (profile_id);
create index sessions_expires_idx on sessions (expires_at);

create table auth_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  type text not null check (type in ('verify_email', 'reset_password', 'change_email')),
  token_hash text not null unique,
  payload jsonb,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index auth_tokens_profile_type_idx on auth_tokens (profile_id, type);

create table user_roles (
  profile_id uuid not null references profiles(id) on delete cascade,
  role_key text not null references roles(key) on delete restrict,
  assigned_at timestamptz not null default now(),
  primary key (profile_id, role_key)
);

-- ---------------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------------

create table categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references categories(id) on delete restrict,
  name text not null,
  slug text not null unique,
  description text not null default '',
  image_url text,
  position integer not null default 0,
  is_active boolean not null default true,
  meta_title text,
  meta_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_not_self_parent check (parent_id is null or parent_id <> id)
);
create index categories_parent_idx on categories (parent_id);
create index categories_active_idx on categories (is_active, position);

create table brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text not null default '',
  logo_url text,
  website_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  sku text not null unique,
  barcode text,
  short_description text not null default '',
  description text not null default '',
  category_id uuid references categories(id) on delete restrict,
  brand_id uuid references brands(id) on delete set null,
  base_price bigint not null check (base_price >= 0),
  compare_at_price bigint check (compare_at_price is null or compare_at_price >= 0),
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  is_featured boolean not null default false,
  specs jsonb not null default '[]'::jsonb,
  warranty_info text not null default '',
  return_info text not null default '',
  low_stock_threshold integer not null default 5 check (low_stock_threshold >= 0),
  rating_avg numeric(3, 2) not null default 0 check (rating_avg >= 0 and rating_avg <= 5),
  rating_count integer not null default 0 check (rating_count >= 0),
  sold_count integer not null default 0 check (sold_count >= 0),
  view_count integer not null default 0 check (view_count >= 0),
  meta_title text,
  meta_description text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector generated always as (
    to_tsvector(
      'simple',
      coalesce(name, '') || ' ' || coalesce(sku, '') || ' ' ||
      coalesce(barcode, '') || ' ' || coalesce(short_description, '') || ' ' ||
      coalesce(description, '')
    )
  ) stored
);
create index products_category_idx on products (category_id);
create index products_brand_idx on products (brand_id);
create index products_status_idx on products (status, published_at desc);
create index products_price_idx on products (base_price);
create index products_featured_idx on products (is_featured) where status = 'active';
create index products_rating_idx on products (rating_avg desc, rating_count desc);
create index products_sold_idx on products (sold_count desc);
create index products_search_idx on products using gin (search);

-- Cost prices are commercially sensitive and isolated from the public catalogue.
create table product_costs (
  product_id uuid primary key references products(id) on delete cascade,
  cost_price bigint not null check (cost_price >= 0),
  updated_at timestamptz not null default now()
);

create table product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  url text not null,
  alt text not null default '',
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index product_images_product_idx on product_images (product_id, position);

create table product_options (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  name text not null,
  position integer not null default 0,
  unique (product_id, name)
);

create table product_option_values (
  id uuid primary key default gen_random_uuid(),
  option_id uuid not null references product_options(id) on delete cascade,
  value text not null,
  position integer not null default 0,
  unique (option_id, value)
);

create table product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  sku text not null unique,
  barcode text,
  option_values jsonb not null default '{}'::jsonb,
  price bigint not null check (price >= 0),
  compare_at_price bigint check (compare_at_price is null or compare_at_price >= 0),
  image_url text,
  is_active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index product_variants_product_idx on product_variants (product_id, position);

create table inventory (
  variant_id uuid primary key references product_variants(id) on delete cascade,
  quantity integer not null default 0 check (quantity >= 0),
  reserved integer not null default 0 check (reserved >= 0),
  low_stock_threshold integer not null default 5 check (low_stock_threshold >= 0),
  updated_at timestamptz not null default now(),
  constraint inventory_reserved_lte_quantity check (reserved <= quantity)
);

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  email text,
  phone text,
  address text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table supplier_products (
  supplier_id uuid not null references suppliers(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  cost_price bigint check (cost_price is null or cost_price >= 0),
  lead_time_days integer check (lead_time_days is null or lead_time_days >= 0),
  min_order_qty integer check (min_order_qty is null or min_order_qty >= 1),
  primary key (supplier_id, product_id)
);

create table inventory_movements (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references product_variants(id) on delete cascade,
  delta integer not null,
  reason text not null check (reason in ('restock', 'sale', 'reservation', 'release', 'adjustment', 'return', 'damage', 'import')),
  reference_type text,
  reference_id uuid,
  note text,
  balance_after integer not null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index inventory_movements_variant_idx on inventory_movements (variant_id, created_at desc);
create index inventory_movements_reference_idx on inventory_movements (reference_type, reference_id);

-- ---------------------------------------------------------------------------
-- Carts, wishlists, addresses
-- ---------------------------------------------------------------------------

create table carts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  guest_token text,
  status text not null default 'active' check (status in ('active', 'converted', 'merged', 'abandoned')),
  coupon_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint carts_owner_required check (profile_id is not null or guest_token is not null)
);
create unique index carts_profile_active_uidx on carts (profile_id) where status = 'active' and profile_id is not null;
create unique index carts_guest_active_uidx on carts (guest_token) where status = 'active' and guest_token is not null;

create table cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references carts(id) on delete cascade,
  variant_id uuid not null references product_variants(id) on delete cascade,
  quantity integer not null check (quantity > 0 and quantity <= 99),
  price_when_added bigint not null check (price_when_added >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cart_id, variant_id)
);
create index cart_items_cart_idx on cart_items (cart_id);

create table wishlists (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table wishlist_items (
  wishlist_id uuid not null references wishlists(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (wishlist_id, product_id)
);

create table addresses (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  label text not null default 'Home',
  full_name text not null,
  phone text not null,
  line1 text not null,
  line2 text,
  city text not null,
  region text not null default '',
  postal_code text,
  country text not null default 'ET',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index addresses_profile_idx on addresses (profile_id);
create unique index addresses_one_default_uidx on addresses (profile_id) where is_default;

-- ---------------------------------------------------------------------------
-- Orders, payments, fulfilment
-- ---------------------------------------------------------------------------

create sequence order_number_seq start 100001;

create table orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  profile_id uuid references profiles(id) on delete set null,
  email text not null,
  phone text not null,
  customer_name text not null,
  shipping_address jsonb not null,
  delivery_method text not null,
  delivery_label text not null,
  shipping_fee bigint not null default 0 check (shipping_fee >= 0),
  subtotal bigint not null check (subtotal >= 0),
  discount bigint not null default 0 check (discount >= 0),
  total bigint not null check (total >= 0),
  currency text not null default 'ETB',
  coupon_id uuid,
  coupon_code text,
  status text not null default 'pending' check (status in (
    'pending', 'awaiting_payment', 'paid', 'confirmed', 'processing', 'packed',
    'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'returned', 'refunded'
  )),
  payment_status text not null default 'unpaid' check (payment_status in (
    'unpaid', 'awaiting_payment', 'paid', 'failed', 'partially_refunded', 'refunded'
  )),
  payment_method text not null,
  customer_note text,
  admin_note text,
  idempotency_key text,
  reservation_expires_at timestamptz,
  placed_at timestamptz not null default now(),
  confirmed_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index orders_idempotency_uidx on orders (idempotency_key) where idempotency_key is not null;
create index orders_profile_idx on orders (profile_id, placed_at desc);
create index orders_status_idx on orders (status, placed_at desc);
create index orders_payment_idx on orders (payment_status, placed_at desc);
create index orders_placed_idx on orders (placed_at desc);
create index orders_email_idx on orders (lower(email));

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  variant_id uuid references product_variants(id) on delete set null,
  product_name text not null,
  product_slug text not null default '',
  variant_label text not null default '',
  sku text not null default '',
  image_url text,
  unit_price bigint not null check (unit_price >= 0),
  compare_at_price bigint,
  quantity integer not null check (quantity > 0),
  line_total bigint not null check (line_total >= 0),
  created_at timestamptz not null default now()
);
create index order_items_order_idx on order_items (order_id);
create index order_items_product_idx on order_items (product_id);
create index order_items_variant_idx on order_items (variant_id);

create table order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  status text not null,
  note text,
  changed_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index order_status_history_order_idx on order_status_history (order_id, created_at);

create table payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  provider text not null,
  provider_ref text,
  amount bigint not null check (amount > 0),
  currency text not null default 'ETB',
  status text not null default 'pending' check (status in ('pending', 'successful', 'failed', 'refunded', 'cancelled')),
  failure_reason text,
  raw_response jsonb,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index payments_provider_ref_uidx on payments (provider, provider_ref) where provider_ref is not null;
create index payments_order_idx on payments (order_id);
create index payments_status_idx on payments (status, created_at desc);

create table payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  payload jsonb not null,
  signature_valid boolean not null default false,
  processed_at timestamptz,
  error text,
  received_at timestamptz not null default now(),
  unique (provider, event_id)
);

create table shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  carrier text not null default '',
  tracking_number text,
  tracking_url text,
  status text not null default 'pending' check (status in ('pending', 'label_created', 'in_transit', 'out_for_delivery', 'delivered', 'failed', 'returned')),
  shipped_at timestamptz,
  delivered_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index shipments_order_idx on shipments (order_id);

-- ---------------------------------------------------------------------------
-- Promotions
-- ---------------------------------------------------------------------------

create table coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  description text not null default '',
  discount_type text not null check (discount_type in ('percentage', 'fixed')),
  discount_value bigint not null check (discount_value > 0),
  min_order bigint not null default 0 check (min_order >= 0),
  max_discount bigint check (max_discount is null or max_discount > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  usage_limit integer check (usage_limit is null or usage_limit > 0),
  per_user_limit integer not null default 1 check (per_user_limit > 0),
  used_count integer not null default 0 check (used_count >= 0),
  is_active boolean not null default true,
  applies_to text not null default 'all' check (applies_to in ('all', 'products', 'categories')),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index coupons_code_lower_uidx on coupons (lower(code));

create table coupon_products (
  coupon_id uuid not null references coupons(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  primary key (coupon_id, product_id)
);

create table coupon_categories (
  coupon_id uuid not null references coupons(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  primary key (coupon_id, category_id)
);

create table coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references coupons(id) on delete restrict,
  order_id uuid not null unique references orders(id) on delete cascade,
  profile_id uuid references profiles(id) on delete set null,
  email text not null,
  discount_amount bigint not null check (discount_amount >= 0),
  created_at timestamptz not null default now()
);
create index coupon_redemptions_user_idx on coupon_redemptions (coupon_id, profile_id);

-- ---------------------------------------------------------------------------
-- Reviews, returns, refunds
-- ---------------------------------------------------------------------------

create table reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  order_id uuid references orders(id) on delete set null,
  rating integer not null check (rating between 1 and 5),
  title text not null default '',
  body text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_reply text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, profile_id)
);
create index reviews_product_idx on reviews (product_id, status, created_at desc);
create index reviews_status_idx on reviews (status, created_at desc);

create table returns (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  order_item_id uuid references order_items(id) on delete set null,
  profile_id uuid references profiles(id) on delete set null,
  reason text not null,
  description text not null default '',
  status text not null default 'requested' check (status in ('requested', 'approved', 'rejected', 'received', 'refunded', 'cancelled')),
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index returns_order_idx on returns (order_id);
create index returns_status_idx on returns (status, created_at desc);

create table refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  payment_id uuid references payments(id) on delete set null,
  amount bigint not null check (amount > 0),
  reason text not null default '',
  status text not null default 'pending' check (status in ('pending', 'processing', 'succeeded', 'failed')),
  provider_ref text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index refunds_order_idx on refunds (order_id);
create index refunds_status_idx on refunds (status, created_at desc);

-- ---------------------------------------------------------------------------
-- Content, marketing, support, system
-- ---------------------------------------------------------------------------

create table banners (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subtitle text not null default '',
  eyebrow text not null default '',
  image_url text,
  link_url text,
  link_label text not null default 'Shop now',
  placement text not null default 'hero' check (placement in ('hero', 'promo', 'category')),
  theme text not null default 'navy' check (theme in ('navy', 'light', 'gold')),
  position integer not null default 0,
  is_active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index banners_placement_idx on banners (placement, position);

create table newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  status text not null default 'subscribed' check (status in ('subscribed', 'unsubscribed')),
  source text not null default 'footer',
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);
create unique index newsletter_email_lower_uidx on newsletter_subscribers (lower(email));

create table notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null default '',
  link text,
  channel text not null default 'inapp' check (channel in ('inapp', 'email', 'sms')),
  is_read boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index notifications_profile_idx on notifications (profile_id, created_at desc);
create index notifications_unread_idx on notifications (profile_id) where not is_read;

create table support_tickets (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete set null,
  order_id uuid references orders(id) on delete set null,
  email text not null,
  subject text not null,
  message text not null,
  status text not null default 'open' check (status in ('open', 'pending', 'resolved', 'closed')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  assigned_to uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index support_tickets_status_idx on support_tickets (status, created_at desc);
create index support_tickets_profile_idx on support_tickets (profile_id);

create table support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references support_tickets(id) on delete cascade,
  sender_id uuid references profiles(id) on delete set null,
  sender_type text not null check (sender_type in ('customer', 'staff')),
  body text not null,
  created_at timestamptz not null default now()
);
create index support_ticket_messages_ticket_idx on support_ticket_messages (ticket_id, created_at);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(id) on delete set null,
  actor_email text,
  action text not null,
  entity_type text not null,
  entity_id text,
  before jsonb,
  after jsonb,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on audit_logs (created_at desc);
create index audit_logs_actor_idx on audit_logs (actor_id, created_at desc);
create index audit_logs_entity_idx on audit_logs (entity_type, entity_id);

create table store_settings (
  key text primary key,
  value jsonb not null,
  is_public boolean not null default true,
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table content_pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  body_md text not null default '',
  meta_title text,
  meta_description text,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table email_outbox (
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  subject text not null,
  html text not null,
  text text not null default '',
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index email_outbox_status_idx on email_outbox (status, created_at);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create or replace function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
  tables text[] := array[
    'profiles', 'categories', 'brands', 'products', 'product_costs', 'product_variants',
    'inventory', 'suppliers', 'carts', 'cart_items', 'addresses', 'orders', 'payments',
    'shipments', 'coupons', 'reviews', 'returns', 'banners', 'support_tickets',
    'content_pages', 'store_settings'
  ];
begin
  foreach t in array tables loop
    execute format('create trigger %I_set_updated_at before update on %I for each row execute function set_updated_at()', t, t);
  end loop;
end;
$$;

create or replace function refresh_product_rating() returns trigger language plpgsql as $$
declare
  pid uuid;
begin
  pid := coalesce(new.product_id, old.product_id);
  update products p
     set rating_avg = coalesce(stats.avg_rating, 0),
         rating_count = coalesce(stats.cnt, 0)
    from (
      select round(avg(rating)::numeric, 2) as avg_rating, count(*)::int as cnt
        from reviews
       where product_id = pid and status = 'approved'
    ) stats
   where p.id = pid;
  return null;
end;
$$;

create trigger reviews_refresh_rating
after insert or update or delete on reviews
for each row execute function refresh_product_rating();
