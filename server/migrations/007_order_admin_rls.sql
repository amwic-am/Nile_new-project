-- ---------------------------------------------------------------------------
-- Staff order operations
--
-- Fulfilment, finance and support staff need a small set of writes that the
-- original storefront RLS did not cover: COD settlement payments, stock
-- commits on delivery, cancellation restocking, coupon release, customer
-- notifications and payment/refund ledger updates. Every policy is still
-- scoped to a staff permission.
-- ---------------------------------------------------------------------------

grant insert, update on payments to nilemart_app;
grant delete on coupon_redemptions to nilemart_app;

create policy payments_staff_insert on payments for insert with check (
  (app.has_perm('payments.manage') or app.has_perm('orders.refund'))
  and exists (select 1 from orders o where o.id = order_id)
);

create policy payments_staff_update on payments for update using (
  app.has_perm('payments.manage') or app.has_perm('orders.refund')
) with check (
  app.has_perm('payments.manage') or app.has_perm('orders.refund')
);

create policy inventory_order_ops on inventory for update using (
  app.has_perm('orders.update') or app.has_perm('orders.refund')
) with check (
  app.has_perm('orders.update') or app.has_perm('orders.refund')
);

create policy inventory_movements_order_ops on inventory_movements for insert with check (
  app.has_perm('orders.update') or app.has_perm('orders.refund')
);

create policy coupon_redemptions_order_ops on coupon_redemptions for delete using (
  app.has_perm('orders.update') or app.has_perm('orders.refund')
);

create policy coupons_order_ops on coupons for update using (
  app.has_perm('orders.update') or app.has_perm('orders.refund')
) with check (
  app.has_perm('orders.update') or app.has_perm('orders.refund')
);

create policy notifications_staff_insert on notifications for insert with check (
  app.has_perm('orders.update')
  or app.has_perm('orders.refund')
  or app.has_perm('support.write')
  or app.has_perm('customers.write')
);
