-- Product attributes used for storefront filtering (colour, size, material...).
-- Values are denormalised from variants/manual entry so listing filters stay
-- index-friendly and do not need JSON traversal at query time.

create table product_attributes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  name text not null,
  value text not null,
  position integer not null default 0,
  unique (product_id, name, value)
);
create index product_attributes_product_idx on product_attributes (product_id);
create index product_attributes_filter_idx on product_attributes (lower(name), lower(value));

alter table reviews add column reviewer_name text not null default '';
alter table reviews add column verified_purchase boolean not null default false;

grant select, insert, update, delete on product_attributes to nilemart_app;

alter table product_attributes enable row level security;

create policy product_attributes_read on product_attributes for select using (
  exists (select 1 from products p where p.id = product_id)
);
create policy product_attributes_insert on product_attributes for insert with check (app.has_perm('products.write'));
create policy product_attributes_update on product_attributes for update using (app.has_perm('products.write')) with check (app.has_perm('products.write'));
create policy product_attributes_delete on product_attributes for delete using (app.has_perm('products.write'));
