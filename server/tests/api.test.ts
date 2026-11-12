import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import app from '../src/app.js';
import { closeDatabase, getDatabase } from '../src/db/index.js';

const CUSTOMER_EMAIL = 'customer@nilemart.et';
const CUSTOMER_PASSWORD = 'Customer#2026';
const STAFF_PASSWORD = 'NileMart#2026';
const ALLOWED_ORIGIN = 'http://localhost:5173';

type Json = Record<string, any>;

function login(email: string, password: string) {
  const agent = request.agent(app);
  return agent
    .post('/api/auth/login')
    .send({ email, password })
    .then((response) => {
      expect(response.status, `${email} login`).toBe(200);
      return agent;
    });
}

describe('Nile Mart integration', () => {
  let customer: ReturnType<typeof request.agent>;
  let manager: ReturnType<typeof request.agent>;
  let fulfillment: ReturnType<typeof request.agent>;
  let admin: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    [customer, manager, fulfillment, admin] = await Promise.all([
      login(CUSTOMER_EMAIL, CUSTOMER_PASSWORD),
      login('manager@nilemart.et', STAFF_PASSWORD),
      login('fulfillment@nilemart.et', STAFF_PASSWORD),
      login('admin@nilemart.et', STAFF_PASSWORD),
    ]);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  describe('service basics', () => {
    it('reports health and JSON 404s for unknown API routes', async () => {
      const health = await request(app).get('/health');
      expect(health.status).toBe(200);
      expect(health.body).toMatchObject({ ok: true, service: 'nile-mart-api' });

      const missing = await request(app).get('/api/does-not-exist');
      expect(missing.status).toBe(404);
      expect(missing.body.error.code).toBe('not_found');
    });

    it('serves robots.txt and an XML sitemap with catalogue URLs', async () => {
      const robots = await request(app).get('/robots.txt');
      expect(robots.status).toBe(200);
      expect(robots.headers['content-type']).toContain('text/plain');
      expect(robots.text).toContain('Disallow: /admin');
      expect(robots.text).toContain('Sitemap: http://localhost:5173/sitemap.xml');

      const sitemap = await request(app).get('/sitemap.xml');
      expect(sitemap.status).toBe(200);
      expect(sitemap.headers['content-type']).toContain('application/xml');
      expect(sitemap.text).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
      expect(sitemap.text).toContain('http://localhost:5173/products');
      expect(sitemap.text).toContain('/product/');
      expect(sitemap.text).toContain('/category/');
      expect(sitemap.text).not.toContain('/admin');
      expect(sitemap.text).toContain('<lastmod>');
    });
  });

  describe('storefront catalogue', () => {
    it('returns home sections and a paginated product list', async () => {
      const home = await request(app).get('/api/home');
      expect(home.status).toBe(200);
      expect(home.body.categories.length).toBeGreaterThan(0);
      expect(home.body.banners).toBeTruthy();
      expect(home.body.settings.store.name).toBe('Nile Mart');

      const list = await request(app).get('/api/products?pageSize=4');
      expect(list.status).toBe(200);
      expect(list.body.items.length).toBeGreaterThan(0);
      expect(list.body.items.length).toBeLessThanOrEqual(4);

      const slug = list.body.items[0].slug;
      const detail = await request(app).get(`/api/products/${slug}`);
      expect(detail.status).toBe(200);
      expect(detail.body.product.slug).toBe(slug);
      expect(detail.body.product.images.length).toBeGreaterThan(0);
    });

    it('rejects newsletter sign-ups from untrusted origins', async () => {
      const blocked = await request(app)
        .post('/api/newsletter')
        .set('Origin', 'https://evil.example')
        .send({ email: 'qa-blocked@nilemart.et' });
      expect(blocked.status).toBe(403);
      expect(blocked.body.error.message).toMatch(/origin/i);

      const allowed = await request(app)
        .post('/api/newsletter')
        .set('Origin', ALLOWED_ORIGIN)
        .send({ email: 'qa-allowed@nilemart.et' });
      expect(allowed.status).toBe(201);
    });
  });

  describe('authentication', () => {
    it('issues an HttpOnly, SameSite session cookie on login', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: CUSTOMER_EMAIL, password: CUSTOMER_PASSWORD });
      expect(response.status).toBe(200);
      expect(response.body.user.email).toBe(CUSTOMER_EMAIL);

      const cookies = response.headers['set-cookie'] as unknown as string[];
      const session = cookies.find((cookie) => cookie.startsWith('nm_session='));
      expect(session).toBeTruthy();
      expect(session).toMatch(/HttpOnly/i);
      expect(session).toMatch(/SameSite=Lax/i);
    });

    it('rejects invalid credentials without revealing which field failed', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: CUSTOMER_EMAIL, password: 'wrong-password' });
      expect(response.status).toBe(401);
      expect(response.body.error.message).toBe('Invalid email or password');
    });
  });

  describe('authorisation and row-level security', () => {
    it('blocks customers and anonymous visitors from admin APIs', async () => {
      const anonymous = await request(app).get('/api/admin/dashboard');
      expect(anonymous.status).toBe(401);

      const denied = await customer.get('/api/admin/dashboard');
      expect(denied.status).toBe(403);
      expect(denied.body.error.message).toBe('Staff access required');
    });

    it('allows fulfilment to read orders but not administer the catalogue', async () => {
      const dashboard = await fulfillment.get('/api/admin/dashboard');
      expect(dashboard.status).toBe(200);

      const orders = await fulfillment.get('/api/admin/orders?pageSize=5');
      expect(orders.status).toBe(200);

      const settings = await fulfillment.get('/api/admin/settings');
      expect(settings.status).toBe(403);

      const createProduct = await fulfillment.post('/api/admin/products').send({});
      expect(createProduct.status).toBe(403);
      expect(createProduct.body.error.message).toContain('products.write');

      const adjust = await fulfillment.post('/api/admin/inventory/adjust').send({});
      expect(adjust.status).toBe(403);
    });

    it('hides staff accounts from store managers and protects staff records', async () => {
      const db = await getDatabase();
      const staff = await db.query<{ id: string; email: string }>(
        `select p.id, p.email
           from profiles p
           join user_roles ur on ur.profile_id = p.id
           join roles r on r.key = ur.role_key
          where r.is_staff
          order by p.email`,
      );
      expect(staff.rows.length).toBeGreaterThan(0);
      const staffEmails = new Set(staff.rows.map((row) => row.email));

      const list = await manager.get('/api/admin/customers?pageSize=50');
      expect(list.status).toBe(200);
      const emails = (list.body.customers as Json[]).map((row) => row.email);
      expect(emails.some((email) => staffEmails.has(email))).toBe(false);
      expect(emails).toContain(CUSTOMER_EMAIL);

      const target = staff.rows[0];
      const patch = await manager
        .patch(`/api/admin/customers/${target.id}`)
        .send({ fullName: 'Changed By Manager' });
      expect(patch.status).toBe(403);
      expect(patch.body.error.message).toBe(
        'Staff accounts can only be changed by an administrator.',
      );

      const adminList = await admin.get('/api/admin/customers?pageSize=50');
      expect(adminList.status).toBe(200);
      const reassigned = await admin
        .patch(`/api/admin/customers/${target.id}`)
        .send({ status: 'active' });
      expect(reassigned.status).toBe(200);
    });
  });

  describe('checkout, totals and stock', () => {
    it('places a COD order with server-calculated totals and reserves stock once', async () => {
      const db = await getDatabase();
      const variant = (
        await db.query<{ id: string; quantity: number; reserved: number }>(
          `select v.id, i.quantity, i.reserved
             from product_variants v
             join inventory i on i.variant_id = v.id
             join products p on p.id = v.product_id
            where p.status = 'active' and v.is_active
              and i.quantity - i.reserved > 5
            order by v.id
            limit 1`,
        )
      ).rows[0];
      expect(variant).toBeTruthy();

      const cleared = await customer.delete('/api/cart');
      expect(cleared.status).toBe(200);

      const added = await customer
        .post('/api/cart/items')
        .send({ variantId: variant.id, quantity: 2 });
      expect(added.status).toBe(201);
      expect(added.body.cart.items.length).toBe(1);
      expect(added.body.cart.items[0].quantity).toBe(2);

      const checkout = await customer.get('/api/checkout');
      expect(checkout.status).toBe(200);
      const method =
        checkout.body.deliveryMethods.find((entry: Json) => entry.id === 'pickup') ??
        checkout.body.deliveryMethods[0];
      expect(method).toBeTruthy();

      const body: Json = {
        contact: {
          fullName: 'Test Buyer Abel',
          email: CUSTOMER_EMAIL,
          phone: '+251911000111',
        },
        shippingAddress:
          method.id === 'pickup'
            ? {}
            : {
                fullName: 'Test Buyer Abel',
                phone: '+251911000111',
                line1: 'Bole Road 1',
                city: 'Addis Ababa',
                region: 'Addis Ababa',
              },
        deliveryMethod: method.id,
        paymentMethod: 'cod',
        acceptTerms: true,
      };
      const idempotencyKey = `test-${Date.now()}-checkout`;

      const placed = await customer
        .post('/api/checkout')
        .set('Idempotency-Key', idempotencyKey)
        .send(body);
      expect(placed.status).toBe(201);
      expect(placed.body.order.paymentMethod).toBe('cod');
      expect(placed.body.order.subtotal).toBe(checkout.body.cart.subtotal);
      expect(placed.body.order.discount).toBe(checkout.body.cart.discount);
      expect(placed.body.order.total).toBe(checkout.body.cart.total + method.effectiveFee);

      const afterFirst = (
        await db.query<{ reserved: number }>(
          'select reserved from inventory where variant_id = $1',
          [variant.id],
        )
      ).rows[0];
      expect(afterFirst.reserved).toBe(variant.reserved + 2);

      const replay = await customer
        .post('/api/checkout')
        .set('Idempotency-Key', idempotencyKey)
        .send(body);
      expect(replay.status).toBe(200);
      expect(replay.body.order.orderId).toBe(placed.body.order.orderId);

      const afterReplay = (
        await db.query<{ reserved: number }>(
          'select reserved from inventory where variant_id = $1',
          [variant.id],
        )
      ).rows[0];
      expect(afterReplay.reserved).toBe(afterFirst.reserved);
    });
  });
});
