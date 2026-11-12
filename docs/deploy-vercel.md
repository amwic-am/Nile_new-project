# Deploying Nile Mart on Vercel

This guide deploys the storefront to **Vercel**, the Express API to **Railway**
(or any long-lived Node host), and data to **Supabase** or **Neon**. It is the
recommended topology for this codebase because the API relies on a few things
serverless functions do not provide: a long-lived process for the
stock-reservation sweep, request bodies up to 5 MB, and a server-side spot for
the Supabase service-role key.

Supabase Auth is **required in production** (`NODE_ENV=production` refuses
`AUTH_PROVIDER=local`), so a Supabase project is needed even when the database
itself lives on Neon. Supabase Storage is optional: with it, product images need
no persistent volume.

```text
Browser
  │  https://shop.example.com
  ▼
Vercel (frontend/dist, SPA rewrites)
  │  /api/*, /uploads/*, /robots.txt, /sitemap.xml  →  proxy
  ▼
Railway (server/dist, Express, reservation sweep)
  │                    │ GoTrue REST + Storage (service role)
  │                    ▼
  │                 Supabase (Auth, optional Storage)
  ▼
Supabase Postgres or Neon PostgreSQL (RLS enforced)
```

The proxy keeps the API same-origin from the browser's point of view, so the
session cookie stays first-party and no CORS layer is needed. Only the API host
holds database, Supabase and payment secrets; the Vercel project holds none.

`vercel.json` ships with `API-HOST.example.com` as a placeholder — replace it
with the real API domain in step 3.

---

## 1. Database (Supabase or Neon)

### Supabase (recommended)

Follow [supabase.md](supabase.md) steps 1–4: copy the connection string, run
migrations as the `postgres` role, grant `nilemart_app ... with set true`,
configure auth URLs and templates, and create the `product-images` bucket.

```bash
npm ci
npm run build -w server
DATABASE_URL='postgresql://.../postgres?sslmode=require' \
  NODE_ENV=production node server/dist/db/migrate.js
```

Then create the first administrator (section 1.4 below). Demo seeding is refused
in production.

### Neon

1. Create a Neon project and copy the **direct** or session-pooler connection
   string:
   `postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require
   Do not use the transaction pooler on port `6543` with this `pg` setup.
2. Install, build the server, and apply migrations from the repository root:

   ```bash
   npm ci
   npm run build -w server
   DATABASE_URL='postgresql://.../neondb?sslmode=require' \
     NODE_ENV=production node server/dist/db/migrate.js
   ```

   Migration `002_rls.sql` creates the restricted `nilemart_app` role and all
   policies. Your Neon owner must be allowed to `CREATE ROLE` (the default Neon
   role has `CREATEROLE`) and to assume it.

3. Verify RLS before creating data:

   ```sql
   select pg_has_role(current_user, 'nilemart_app', 'member');

   begin;
   set local role nilemart_app;
   select set_config('app.user_id', '', true),
          set_config('app.perms', '', true),
          set_config('app.guest_token', '', true);
   select count(*) from orders;    -- must be 0
   select count(*) from profiles;  -- must be 0
   rollback;
   ```

   If `set local role` fails, grant membership once from the Neon SQL editor.
   The `SET TRUE` clause is required: a grant created with `SET FALSE` reports
   `pg_has_role(...) = true` yet still fails at runtime.

   ```sql
   grant nilemart_app to <your_neon_login> with set true;
   ```

   Migration `008` attaches the Supabase profile trigger only when the `auth`
   schema exists, so it is a no-op on Neon; create profiles through the API as
   usual.

4. Create the first administrator. Demo seeding is refused in production:

   ```bash
   DATABASE_URL='postgresql://.../neondb?sslmode=require' \
     NODE_ENV=production \
     SUPABASE_URL='https://<project-ref>.supabase.co' \
     SUPABASE_ANON_KEY='<anon key>' \
     SUPABASE_SERVICE_ROLE_KEY='<service-role key>' \
     ADMIN_EMAIL='ops@example.com' \
     ADMIN_PASSWORD='a-long-unique-password' \
     ADMIN_NAME='Operations lead' \
     node server/dist/db/create-admin.js
   ```

   Do not run `db:seed` or `db:reset` against production.

---

## 2. API (Railway)

Create a Railway project from the same repository.

**Build**

```bash
npm ci --include=dev && npm run build -w server
```

**Start**

```bash
node server/dist/db/migrate.js && node server/dist/index.js
```

Migrations are idempotent, so running them on boot is safe. Keep a single API
replica: concurrent boots can race on the migrations table, and the in-process
reservation sweep is designed for one instance.

**Health check:** `/health`

**Volume:** not required when Supabase Storage is configured. Otherwise mount a
volume at `/data` and set `UPLOADS_DIR=/data/uploads` so admin product images
survive redeploys. The development seed images in `server/uploads/seed` are not
used in production.

**Variables**

```dotenv
NODE_ENV=production
DATABASE_URL=postgresql://.../neondb?sslmode=require
DATABASE_SSL=require

# Required in production: server-side Supabase Auth (and Storage if used)
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service-role key>
SUPABASE_STORAGE_BUCKET=product-images
# AUTH_PROVIDER defaults to supabase when the URL and anon key are set

# Used for links, redirects and the Origin check
APP_URL=https://shop.example.com
# Public API origin used for payment callbacks and webhooks
API_URL=https://api.example.com
# Fallback only when Supabase Storage is not configured
UPLOADS_DIR=/data/uploads

SESSION_COOKIE_NAME=nm_session
SESSION_TTL_DAYS=30

SMTP_HOST=smtp.provider.example
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=...
SMTP_PASS=...
MAIL_FROM=Nile Mart <no-reply@example.com>
ORDER_NOTIFICATION_EMAIL=orders@example.com

PAYMENTS_COD_ENABLED=true
CHAPA_SECRET_KEY=
CHAPA_WEBHOOK_SECRET=
CHAPA_BASE_URL=https://api.chapa.co/v1

RESERVATION_MINUTES=120
REQUIRE_VERIFIED_EMAIL=true
SEED_DEMO_DATA=false
```

Do not set `PORT`; Railway injects it. Attach a custom domain such as
`api.example.com` and use its HTTPS URL below.

---

## 3. Storefront (Vercel)

1. Import the repository in Vercel. Keep the **Root Directory** at the
   repository root; `vercel.json` sets the install, build and output commands.
2. Set the production environment variable:

   ```dotenv
   APP_URL=https://shop.example.com
   ```

   The build bakes absolute Open Graph URLs into `index.html`. If `APP_URL` is
   absent, Vercel's `VERCEL_PROJECT_PRODUCTION_URL` is used as a fallback.
3. Replace both occurrences of `API-HOST.example.com` in
   [vercel.json](../vercel.json) with your Railway domain (for example
   `nile-mart-api.up.railway.app`). The rewrites proxy:

   | Path | Destination |
   | --- | --- |
   | `/api/*` | API `/api/*` |
   | `/uploads/*` | API `/uploads/*` |
   | `/robots.txt` | API `/robots.txt` |
   | `/sitemap.xml` | API `/sitemap.xml` |
   | everything else | SPA `index.html` |

4. Deploy, then attach `shop.example.com` in **Settings → Domains**.

`vercel.json` also sets immutable caching for hashed assets and a CSP that
matches the API's production policy. Keep `connect-src 'self'` — the proxy is
what makes that possible.

---

## 4. Payments

Cash on delivery and Chapa are the only implemented gateways. In the Chapa
dashboard set the webhook/callback URL to:

```text
https://api.example.com/api/webhooks/chapa
```

and configure `CHAPA_WEBHOOK_SECRET` on Railway. Do not enable Telebirr,
M-PESA, EPS, card or PayPal until an adapter has been implemented and tested
against the provider's sandbox. Returning to the success page never marks an
order paid; only a verified webhook does.

---

## 5. Go-live checks

```bash
curl -s https://api.example.com/health
curl -sI https://shop.example.com/api/products | head -1     # 200 through the proxy
curl -s https://shop.example.com/robots.txt | tail -3        # Sitemap points at the storefront
```

Then in a browser:

- Load the storefront and confirm the logo, favicons and OG tags (View Source)
  use the Vercel HTTPS origin.
- Register, open the verification link, sign in, add to cart, and place a COD
  order end to end. With Supabase Auth the link must land on `/verify-email` and
  succeed; see [supabase.md](supabase.md) for the required templates.
- Request a password reset and complete it from the email link.
- Open `/admin` with the first administrator and upload a product image; confirm
  it loads from `.../storage/v1/object/public/product-images/...` (Supabase
  Storage) or through `/uploads/...` (volume fallback) after an API redeploy.
- Re-run the RLS queries from step 1 after the first order exists.

---

## Troubleshooting the first deploy

**A push creates two failed deployments named `client` and `server`.** Those are
two old Vercel projects created one per workspace before the repository was
restructured. This app needs a single project at the repository root; the
`server` project can never succeed as a static/Vite deployment because the
Express API belongs on Railway. Delete or ignore both projects, keep one project
with **Root Directory = repository root**, and deploy the API separately.

**A standalone workspace project fails on `vite.config.ts`.** The error looks
like `Cannot find name 'process'` or `Cannot find name 'node:url'`. It happens
when the project root is `frontend/`, so the workspace-hoisted `@types/node` is
not installed. Two fixes:

- preferred: point the project's Root Directory at the repository root so
  `vercel.json` and the workspace lockfile are used; or
- keep the standalone project and rely on the `@types/node` dev dependency that
  `frontend/package.json` now declares.

A standalone `frontend` project still has no API proxy or SPA fallback, because
the root `vercel.json` does not apply to it. That is why the repository-root
project is the supported setup.

**The build passes but the site calls `/api/...` and gets 404.** Replace
`API-HOST.example.com` in `vercel.json` with the deployed API domain and
redeploy.

To read a failed build log locally:

```bash
npx vercel login
npx vercel link --repo
npx vercel inspect dpl_XXXXXXXX --logs
```

## Limits and alternatives

- **Upload size:** Vercel proxies cap request bodies around 4.5 MB. Product
  images should stay below that (the API's own limit is 5 MB). Larger files must
  be uploaded directly to the API host.
- **Reservation sweep:** runs inside the long-lived API process every five
  minutes. It does not run on Vercel Functions.
- **All-in-one Vercel:** possible with Vercel Services, but this Express app
  would need a Cron endpoint for the sweep and function packaging. That is a code
  change, not a config change; the split above avoids it.
- **Single-host alternative:** the Express server can serve both the SPA and the
  API from one machine; see [deployment.md](deployment.md).
