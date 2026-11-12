-- ---------------------------------------------------------------------------
-- Administrative write access for staff flows that run under the restricted
-- application role. Every policy still requires a staff permission, so the
-- grants alone never widen customer access.
-- ---------------------------------------------------------------------------

grant update (status) on profiles to nilemart_app;

grant insert on order_status_history to nilemart_app;
grant insert, update on shipments to nilemart_app;

grant update (status) on newsletter_subscribers to nilemart_app;
grant insert, delete on content_pages to nilemart_app;

-- profiles already has a customers.write update policy; the grant above only
-- widens the writable column set to include status.

create policy order_status_history_insert on order_status_history for insert with check (
  exists (select 1 from orders o where o.id = order_id)
  and (app.has_perm('orders.update') or app.has_perm('orders.refund'))
);

create policy shipments_insert on shipments for insert with check (
  exists (select 1 from orders o where o.id = order_id)
  and (app.has_perm('orders.update') or app.has_perm('orders.refund'))
);
create policy shipments_update on shipments for update using (
  app.has_perm('orders.update') or app.has_perm('orders.refund')
) with check (
  app.has_perm('orders.update') or app.has_perm('orders.refund')
);

create policy newsletter_update on newsletter_subscribers for update using (
  app.has_perm('promotions.write')
) with check (
  app.has_perm('promotions.write')
);

create policy content_pages_insert on content_pages for insert with check (
  app.has_perm('content.write')
);
create policy content_pages_delete on content_pages for delete using (
  app.has_perm('content.write')
);
