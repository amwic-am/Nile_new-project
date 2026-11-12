-- ---------------------------------------------------------------------------
-- Reference data: roles, permissions, store settings and policy pages.
-- This data is required in every environment (not demo content).
-- ---------------------------------------------------------------------------

insert into roles (key, name, description, is_staff) values
  ('super_admin', 'Super Admin', 'Full access to the platform, staff, settings and integrations.', true),
  ('store_manager', 'Store Manager', 'Manages the catalogue, promotions, orders and customers.', true),
  ('inventory_manager', 'Inventory Manager', 'Manages products, stock, suppliers and inventory reports.', true),
  ('fulfillment', 'Order Fulfillment', 'Views assigned orders and updates shipment statuses.', true),
  ('finance', 'Finance', 'Views payments, invoices, refunds and financial reports.', true),
  ('support', 'Customer Support', 'Handles customer requests and permitted order information.', true),
  ('customer', 'Customer', 'Shops, reviews products and manages their own account.', false);

insert into permissions (key, description) values
  ('dashboard.view', 'View the admin dashboard'),
  ('products.read', 'View products including drafts'),
  ('products.write', 'Create and edit products, variants and media'),
  ('products.delete', 'Delete products'),
  ('categories.write', 'Manage categories'),
  ('brands.write', 'Manage brands'),
  ('inventory.read', 'View stock levels and movements'),
  ('inventory.write', 'Adjust stock levels and record movements'),
  ('inventory.cost', 'View product cost prices and margins'),
  ('suppliers.read', 'View suppliers'),
  ('suppliers.write', 'Manage suppliers'),
  ('orders.read', 'View all orders and customer order details'),
  ('orders.update', 'Update order and fulfillment statuses'),
  ('orders.refund', 'Process cancellations, returns and refunds'),
  ('payments.read', 'View payment records'),
  ('payments.manage', 'Configure payment methods and process payment actions'),
  ('customers.read', 'View customer profiles'),
  ('customers.write', 'Manage customer account status and notes'),
  ('promotions.read', 'View coupons, banners and subscribers'),
  ('promotions.write', 'Manage coupons, banners and subscribers'),
  ('reviews.moderate', 'Approve or reject product reviews'),
  ('reports.view', 'View sales and catalogue reports'),
  ('reports.finance', 'View financial reports and payment breakdowns'),
  ('staff.read', 'View staff accounts and roles'),
  ('staff.write', 'Manage staff accounts and role assignments'),
  ('settings.read', 'View store settings'),
  ('settings.write', 'Update store settings and integrations'),
  ('content.write', 'Manage storefront content pages'),
  ('support.read', 'View support tickets'),
  ('support.write', 'Respond to and resolve support tickets'),
  ('audit.read', 'View the administrative audit log'),
  ('uploads.write', 'Upload images and files'),
  ('newsletter.read', 'View newsletter subscribers');

insert into role_permissions (role_key, permission_key)
select 'super_admin', key from permissions;

insert into role_permissions (role_key, permission_key) values
  ('store_manager', 'dashboard.view'),
  ('store_manager', 'products.read'),
  ('store_manager', 'products.write'),
  ('store_manager', 'products.delete'),
  ('store_manager', 'categories.write'),
  ('store_manager', 'brands.write'),
  ('store_manager', 'inventory.read'),
  ('store_manager', 'suppliers.read'),
  ('store_manager', 'orders.read'),
  ('store_manager', 'orders.update'),
  ('store_manager', 'payments.read'),
  ('store_manager', 'customers.read'),
  ('store_manager', 'customers.write'),
  ('store_manager', 'promotions.read'),
  ('store_manager', 'promotions.write'),
  ('store_manager', 'reviews.moderate'),
  ('store_manager', 'reports.view'),
  ('store_manager', 'content.write'),
  ('store_manager', 'support.read'),
  ('store_manager', 'support.write'),
  ('store_manager', 'uploads.write'),
  ('store_manager', 'newsletter.read'),

  ('inventory_manager', 'dashboard.view'),
  ('inventory_manager', 'products.read'),
  ('inventory_manager', 'products.write'),
  ('inventory_manager', 'inventory.read'),
  ('inventory_manager', 'inventory.write'),
  ('inventory_manager', 'inventory.cost'),
  ('inventory_manager', 'suppliers.read'),
  ('inventory_manager', 'suppliers.write'),
  ('inventory_manager', 'reports.view'),
  ('inventory_manager', 'uploads.write'),

  ('fulfillment', 'dashboard.view'),
  ('fulfillment', 'orders.read'),
  ('fulfillment', 'orders.update'),
  ('fulfillment', 'customers.read'),
  ('fulfillment', 'products.read'),
  ('fulfillment', 'inventory.read'),

  ('finance', 'dashboard.view'),
  ('finance', 'orders.read'),
  ('finance', 'orders.refund'),
  ('finance', 'payments.read'),
  ('finance', 'payments.manage'),
  ('finance', 'reports.view'),
  ('finance', 'reports.finance'),
  ('finance', 'customers.read'),
  ('finance', 'products.read'),

  ('support', 'dashboard.view'),
  ('support', 'orders.read'),
  ('support', 'customers.read'),
  ('support', 'products.read'),
  ('support', 'support.read'),
  ('support', 'support.write'),
  ('support', 'reviews.moderate');

-- Store settings ------------------------------------------------------------

insert into store_settings (key, value, is_public) values
  ('store', '{
    "name": "Nile Mart",
    "legalName": "Nile Mart Trading PLC",
    "tagline": "Shop quality. Live better.",
    "email": "support@nilemart.et",
    "phone": "+251 954 889 050",
    "address": "Bole Road, Addis Ababa, Ethiopia",
    "city": "Addis Ababa",
    "country": "Ethiopia",
    "currency": "ETB",
    "timezone": "Africa/Addis_Ababa"
  }'::jsonb, true),
  ('announcement', '{
    "enabled": true,
    "message": "Free delivery on orders over ETB 3,000 across Addis Ababa",
    "link": "/products"
  }'::jsonb, true),
  ('delivery_methods', '[
    {"id": "standard", "label": "Standard delivery", "description": "2-4 business days", "fee": 15000, "enabled": true},
    {"id": "express", "label": "Express delivery", "description": "Next business day in Addis Ababa", "fee": 30000, "enabled": true},
    {"id": "pickup", "label": "Collect in store", "description": "Ready in 2 hours at Bole Road", "fee": 0, "enabled": true}
  ]'::jsonb, true),
  ('free_shipping_threshold', '300000'::jsonb, true),
  ('social_links', '[
    {"label": "Facebook", "url": "https://www.facebook.com/nilemart"},
    {"label": "Twitter", "url": "https://twitter.com/nilemart"},
    {"label": "Instagram", "url": "https://www.instagram.com/nilemart/"},
    {"label": "Telegram", "url": "https://telegram.org/nilemart/"}
  ]'::jsonb, true),
  ('returns', '{
    "windowDays": 7,
    "summary": "Unused items in their original packaging can be returned within 7 days of delivery."
  }'::jsonb, true),
  ('seo', '{
    "title": "Nile Mart - Ethiopia''s premium online marketplace",
    "description": "Shop electronics, fashion, home, beauty and more at Nile Mart. Genuine products, secure payment and delivery across Ethiopia.",
    "keywords": "Nile Mart, online shopping Ethiopia, electronics Addis Ababa, Ethiopian marketplace"
  }'::jsonb, true),
  ('support_hours', '{
    "weekdays": "Monday - Saturday, 8:30 - 18:30",
    "timezone": "Africa/Addis_Ababa"
  }'::jsonb, true),
  ('payments', '{
    "cod": true,
    "chapa": true,
    "telebirr": false,
    "mpesa": false,
    "paypal": false,
    "card": false,
    "eps": false
  }'::jsonb, false),
  ('invoice', '{
    "companyName": "Nile Mart Trading PLC",
    "address": "Bole Road, Addis Ababa, Ethiopia",
    "tin": "0000000000",
    "footerNote": "Thank you for shopping with Nile Mart."
  }'::jsonb, false),
  ('reservations', '{
    "minutes": 120,
    "low_stock_threshold": 5
  }'::jsonb, false);

-- Policy pages --------------------------------------------------------------

insert into content_pages (slug, title, body_md, meta_title, meta_description) values
  ('about', 'About Nile Mart', '## Shopping made simpler in Ethiopia

Nile Mart is a premium online marketplace built for Ethiopian shoppers. We bring together trusted brands, everyday essentials and the latest technology in one carefully curated store.

Our team works directly with authorised distributors and local suppliers, which means genuine products, transparent pricing in Ethiopian Birr and dependable after-sales support.

### What we stand for

- **Authenticity** - every product is sourced from approved suppliers.
- **Fair pricing** - clear prices in ETB with no hidden charges.
- **Reliable delivery** - Addis Ababa and regional delivery with live order tracking.
- **Real support** - a local team you can reach by phone, email or Telegram.

We are headquartered on Bole Road, Addis Ababa, and deliver across Ethiopia.', 'About Nile Mart', 'Learn about Nile Mart, Ethiopia''s premium online marketplace.'),
  ('contact', 'Contact us', '## We are here to help

Our customer care team is available Monday to Saturday, 8:30 - 18:30 (East Africa Time).

- **Email:** support@nilemart.et
- **Phone:** +251 911 000 000
- **Address:** Bole Road, Addis Ababa, Ethiopia

For questions about an existing order, include your order number so we can help faster. You can also open a support request from your account.', 'Contact Nile Mart', 'Contact the Nile Mart customer care team.'),
  ('shipping', 'Shipping and delivery', '## Delivery options

We deliver across Ethiopia using trusted courier partners.

- **Standard delivery** - 2 to 4 business days.
- **Express delivery** - next business day within Addis Ababa.
- **Collect in store** - ready within 2 hours at our Bole Road store.

Delivery fees are calculated at checkout based on your address and chosen method. Orders above ETB 3,000 qualify for free standard delivery.

### Tracking your order

Every order receives a unique order number. Sign in and open **My orders** to follow each status change from confirmation to delivery.', 'Shipping and delivery', 'Nile Mart delivery options, fees and order tracking.'),
  ('returns', 'Returns and refunds', '## Hassle-free returns

We want you to shop with confidence. If an item is not right for you, you may request a return within 7 days of delivery.

### Conditions

- The item must be unused and in its original packaging.
- Accessories, manuals and free gifts must be included.
- Personal care items, underwear and digital downloads cannot be returned for hygiene reasons.
- Faulty or incorrect items are always covered, including delivery costs.

### How to start a return

Open **My orders**, select the order and choose **Request return**. Our team will confirm eligibility and arrange collection or drop-off. Approved refunds are processed to the original payment method, or as store credit for cash on delivery orders.', 'Returns and refunds', 'Nile Mart returns policy, eligibility and refund timelines.'),
  ('privacy', 'Privacy policy', '## Your privacy matters

Nile Mart collects only the information required to process orders, provide support and improve your shopping experience.

### Information we collect

- Account details such as your name, email address and phone number.
- Delivery addresses and order history.
- Payment references returned by our payment providers. We never store card numbers, CVVs or mobile money PINs.

### How we use your information

We use your information to fulfil orders, provide customer support, prevent fraud and, where you have opted in, send relevant offers. We do not sell personal data.

### Your choices

You can update your profile, manage notification preferences or request account deletion from your account. Some records are retained where required by Ethiopian tax and accounting law.

### Security

Passwords are stored using salted scrypt hashes. Access to customer data is restricted by role-based permissions and enforced at the database layer with row level security.', 'Privacy policy', 'How Nile Mart collects, uses and protects your personal data.'),
  ('terms', 'Terms of service', '## Terms of service

By using Nile Mart you agree to these terms.

### Orders and pricing

All prices are shown in Ethiopian Birr (ETB) and include applicable taxes unless stated otherwise. We reserve the right to cancel an order if a product is mispriced, unavailable or if fraud is suspected. In that case any payment received is refunded in full.

### Payments

Online payments are processed by licensed payment providers. Card and mobile money credentials are handled by the provider and never stored by Nile Mart. Cash on delivery is available on eligible orders.

### Delivery

Delivery estimates are indicative and may vary due to weather, transport or public holidays. Risk passes to you on delivery.

### Returns

Returns are governed by our returns policy. Items that are used, damaged by the customer or missing accessories may not qualify.

### Acceptable use

You may not misuse the platform, attempt unauthorised access, scrape data or place fraudulent orders. Accounts that violate these terms may be suspended.

### Contact

Questions about these terms can be sent to support@nilemart.et.', 'Terms of service', 'Nile Mart terms of service for orders, payments and returns.');
