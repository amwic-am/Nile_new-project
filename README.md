# Nile Mart

Production-oriented e-commerce platform for Ethiopia: a React storefront, an
operations dashboard, and an Express API backed by PostgreSQL with row-level
security. Prices are in ETB (stored as integer santim), dates render in
`Africa/Addis_Ababa`, and the interface is fully responsive.

This is not a UI mockup. Catalogue, cart, checkout, orders, payments, inventory,
customers, promotions, reports and staff permissions all read and write the
database through the API. Demo content is inserted **only** by the development
seed script.

## Payments: what actually works

| Method | State |
| --- | --- |
| Cash on delivery | Implemented and enabled |
| Chapa | Adapter implemented; disabled until sandbox credentials are configured and tested |
| Telebirr, M-PESA, cards, PayPal, EPS | Configured-only placeholders, shown as unavailable |

An order is marked paid only after the server verifies the transaction with the
provider, the amount and currency match, and (for webhooks) the signature is
valid. Returning to the success page never marks an order paid. No card number,
CVV or mobile-money PIN is ever received or stored. See
[docs/payments.md](docs/payments.md) for the full rules and the Chapa sandbox
acceptance checklist.

## Stack

- **Frontend** — React 18, TypeScript, Vite (Rolldown), Tailwind CSS 4,
  shadcn/ui (Radix + CVA), React Router 7, TanStack Query, Zustand,
  React Hook Form + Zod, Recharts, Lucide icons, self-hosted Inter + Manrope.
- **Backend** — Node.js 20+, Express 5, Zod, PGlite (development/tests) or
  PostgreSQL via `pg`; Supabase Auth through GoTrue and Supabase Storage for
  uploads.
- **Data / Auth / Storage** — Supabase (Postgres, Auth, Storage) with row-level
  security, or the same Postgres schema with local auth for development.
  ~35 tables, UUID keys, foreign keys, check constraints, indexes, integer
  santim money, transactional stock and payment flows.
- **Email** — SMTP via Nodemailer; without SMTP, messages land in `email_outbox`.

Supabase is optional locally: with no `SUPABASE_*` variables the API uses
embedded PGlite, local scrypt passwords and disk uploads. Set
`SUPABASE_URL` + `SUPABASE_ANON_KEY` (and `SUPABASE_SERVICE_ROLE_KEY` for
storage/seeding) to switch to Supabase Auth. See
[docs/supabase.md](docs/supabase.md).

## Quick start (development)

Requirements: Node.js 20 or newer (tested on Node 24), npm 10+.

```bash
npm ci
cp .env.example .env          # development defaults work as-is
npm run dev                   # API on :4000, storefront on :5173
```

Open <http://localhost:5173>. On first start the embedded database
(`server/data`) is migrated and seeded with demo content.

To develop against Supabase instead, fill `DATABASE_URL`, `SUPABASE_URL`,
`SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` in `.env` and follow
[docs/supabase.md](docs/supabase.md) (auth URL settings, email templates,
storage bucket, `nilemart_app` grant). Local auth still works without any
Supabase configuration.

### Development accounts

All demo staff accounts use the password `NileMart#2026` (override with
`SEED_ADMIN_PASSWORD` before the **first** seed):

| Email | Role |
| --- | --- |
| `admin@nilemart.et` | Super administrator |
| `manager@nilemart.et` | Store manager |
| `inventory@nilemart.et` | Inventory manager |
| `fulfillment@nilemart.et` | Order fulfillment |
| `finance@nilemart.et` | Finance |
| `support@nilemart.et` | Customer support |

Demo customer: `customer@nilemart.et` / `Customer#2026`.

These credentials belong to the development seed. Do not enable them in
production (see [docs/deployment.md](docs/deployment.md)).

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run API and Vite dev server together |
| `npm run build` | Type-check and build the frontend, then compile the server |
| `npm start` | Run the compiled server (serves the API, uploads and the built SPA) |
| `npm run typecheck` | Type-check both workspaces |
| `npm test` | Integration tests against an isolated temporary PostgreSQL |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:seed` | Insert demo catalogue, orders and accounts (development only) |
| `npm run db:reset` | Drop and rebuild the local database with demo data |
| `npm run db:create-admin` | Create or reset the first super administrator (any environment) |

Refresh the demo database at any time with `npm run db:reset` (requires the API
to be stopped, because embedded PGlite allows one process per data directory).

## Repository layout

```
frontend/               React storefront + admin SPA
  src/pages/            Storefront, account, checkout, admin pages
  src/components/       Layout, UI primitives and admin shell
  src/lib/              API client, formatting, SEO, admin query hooks
  src/stores/           Zustand auth and cart stores
  public/               Static assets, favicon, OG image
server/
  migrations/           Numbered SQL: schema, RLS, reference data
  src/routes/           Storefront, auth, cart, checkout, orders, account,
                        wishlist, webhooks, SEO, admin/*
  src/services/         Business logic and transactions
  src/db/               Connection, migrations, seed, first-admin bootstrap
  tests/                Vitest integration suite
  uploads/              Admin-uploaded images (persist this directory)
cloudflare/
  worker.js             Worker proxy for /api and /uploads
wrangler.jsonc          Worker config: static assets + proxy routes
docs/
  payments.md           Payment rules, Chapa setup, acceptance checklist
  supabase.md           Supabase project, auth templates, storage, RLS role
  deployment.md         Production deployment, RLS roles, backups, checklists
  deploy-vercel.md      Vercel storefront + Railway API + Neon/Supabase
  deploy-cloudflare.md  Cloudflare Worker storefront + Railway API
```

## How the important parts work

### Authentication and authorisation

- Two providers behind `AUTH_PROVIDER`: `supabase` (default when Supabase env
  vars are present; required in production) creates and verifies credentials in
  Supabase Auth via the GoTrue REST API from the server, so no Supabase
  access/refresh token ever reaches browser JavaScript. `local` keeps scrypt
  passwords in `auth_credentials` and is for development and tests only.
- Either way the browser gets one opaque session token, stored hashed in the
  `sessions` table and sent as an `HttpOnly`, `SameSite=Lax` cookie (`Secure` in
  production). Login errors are generic and attempts are rate limited.
  Supabase profiles are mirrored into `profiles` with `profiles.id` equal to
  `auth.users.id`; RLS and permissions are unchanged.
- Staff access requires both an API guard (`requireStaff`, `requirePerm`) and
  matching PostgreSQL RLS policies. Hiding a button in the UI is never treated
  as security; every admin endpoint re-checks the permission server-side.
- Customer requests run inside a restricted transaction as the `nilemart_app`
  role with `app.user_id`, `app.perms` and `app.guest_token` set. Trusted server
  flows (auth, checkout, webhooks, stock sweeps) use the owner connection and
  their own explicit checks.

### Catalogue, cart and checkout

- Category/subcategory browsing, search with suggestions, filters, sorting and
  pagination. Product detail pages show a gallery, variants, live stock and
  reviews.
- Cart works for guests (signed cookie token) and signed-in customers; guest
  carts merge into the account on login. Coupons are validated server-side.
- Guided checkout (contact, address, delivery, payment, review) followed by an
  order confirmation page. All totals, delivery fees, discounts and stock checks
  are recalculated on the server; the browser never supplies a trusted total.
- Placing an order reserves stock (`reserved += qty`) inside a transaction.
  Payment or delivery converts the reservation into a sale exactly once.
  Cancellation, expiry and refunds release stock. Replays are protected by an
  idempotency key and unique movement records.
- Orders move through confirmation, processing, packing, shipping, delivery and
  cancellation, with status history, notifications, invoices and refunds.

### Admin operations

Real metrics and charts (not static numbers) for revenue, orders, pipeline,
top products, low stock, customers and promotions. Catalogue and variant
editing, image uploads, stock adjustments with movement history, order
fulfilment, customer management, coupons and banners, review moderation,
newsletter, reports, staff role assignment, settings and an audit log.

Roles: `super_admin`, `store_manager`, `inventory_manager`, `fulfillment`,
`finance`, `support`, `customer`. Permissions are granted to roles in the
database and enforced in both the API and RLS.

### Money, dates and stock

Money is an integer amount of santim end to end and formatted as ETB only at
the edges. Admin report ranges use inclusive Addis Ababa days. Stock is
`quantity - reserved` everywhere; low-stock thresholds are per variant.

### SEO and performance

- `/robots.txt` and a live `/sitemap.xml` generated from active products,
  categories and published pages.
- Per-page titles, descriptions and canonical URLs; Open Graph and Twitter tags,
  including a branded 1200×630 image. The SPA shell is served with absolute
  `APP_URL` values.
- Admin, account, checkout and auth routes are code-split; the storefront shell
  loads first. Vendor code is split into cacheable chunks and uploaded images
  are cached immutably.

## Tests

```bash
npm test
```

The integration suite starts an isolated temporary PGlite database, applies all
migrations, seeds it, and exercises health/SEO endpoints, storefront reads, the
origin guard, session cookie flags, authentication failures, RBAC/RLS
boundaries for several staff roles, and a full cash-on-delivery checkout
(stock reservation, totals, idempotent replay). Unit tests cover the Supabase
Auth error mapping and upload image-signature validation. Neither suite touches
`server/data` or a `DATABASE_URL` database. Tests run single-file in a single
process because PGlite is single-process.

## Configuration

Copy `.env.example` to `.env`; a root `.env.local` is also loaded and takes
precedence for local-only settings. The most important variables:

| Variable | Notes |
| --- | --- |
| `APP_URL` | Public storefront origin; used for links, SEO, OG tags and origin checks |
| `API_URL` | Public API origin; used for payment callbacks/webhooks |
| `DATABASE_URL` | App PostgreSQL URL (Supabase transaction pooler); empty uses embedded PGlite |
| `DIRECT_URL` | Optional session-mode PostgreSQL URL used by `npm run db:migrate` |
| `DATABASE_SSL` | `require` (default when a URL is set), `disable`, `no-verify` |
| `DATABASE_SSL_CA` | Optional local path to the Supabase root certificate for verified TLS |
| `AUTH_PROVIDER` | `supabase` or `local`; defaults to `supabase` when Supabase env vars are set, `local` otherwise. Production refuses `local` |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Server-side Supabase Auth; the anon key never reaches the browser |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only: Storage uploads, admin user creation, demo seeding |
| `SUPABASE_STORAGE_BUCKET` | Public storage bucket for product images (default `product-images`) |
| `UPLOADS_DIR` | Local upload directory when Storage is not configured; persistent volume in production |
| `SESSION_COOKIE_NAME`, `SESSION_TTL_DAYS` | Session cookie name and lifetime |
| `SMTP_*`, `MAIL_FROM` | Transactional email; without SMTP, mail is stored in `email_outbox` |
| `PAYMENTS_COD_ENABLED` | Cash on delivery (default on) |
| `CHAPA_SECRET_KEY`, `CHAPA_WEBHOOK_SECRET` | Chapa sandbox/live credentials |
| `RESERVATION_MINUTES` | How long an unpaid online order keeps stock reserved |
| `REQUIRE_VERIFIED_EMAIL` | Require a verified email before checkout |
| `SEED_DEMO_DATA`, `SEED_ADMIN_PASSWORD` | Development seed only; refused in production |

Never commit `.env` or real credentials. Only `APP_URL`/`API_URL` are public.

## Production

See [docs/deployment.md](docs/deployment.md) for PostgreSQL setup, the
`nilemart_app` RLS role, first-admin provisioning, reverse proxy/HTTPS, uploads
persistence, backups, webhook URLs and the go-live checklist. For Supabase
project, auth and storage setup, see [docs/supabase.md](docs/supabase.md). For a
Vercel storefront with the API on Railway and PostgreSQL on Neon or Supabase,
see [docs/deploy-vercel.md](docs/deploy-vercel.md). For Cloudflare Workers
(which runs `npx wrangler deploy` from the repository root), see
[docs/deploy-cloudflare.md](docs/deploy-cloudflare.md). Short version:

```bash
npm ci
npm run build
NODE_ENV=production DATABASE_URL=... APP_URL=https://shop.example.com \
  API_URL=https://shop.example.com SUPABASE_URL=... SUPABASE_ANON_KEY=... \
  SUPABASE_SERVICE_ROLE_KEY=... npm run db:migrate
NODE_ENV=production DATABASE_URL=... SUPABASE_URL=... SUPABASE_ANON_KEY=... \
  SUPABASE_SERVICE_ROLE_KEY=... ADMIN_EMAIL=... ADMIN_PASSWORD=... \
  npm run db:create-admin
NODE_ENV=production ... npm start
```
