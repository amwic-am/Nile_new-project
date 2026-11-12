# Deploying Nile Mart

This document covers a single-host production deployment: one Node.js process
serving the API, uploaded images and the built storefront, PostgreSQL for data,
Supabase for authentication (and optionally storage), and an HTTPS reverse proxy
in front. Separating the API and storefront onto different hostnames is **not**
supported without extra work, because sessions use `SameSite=Lax` cookies and the
API has no CORS layer.

## At a glance

```
Internet ──HTTPS──> nginx / Caddy ──HTTP──> Node (Express + SPA) ──> PostgreSQL
                                              │  GoTrue REST (supabase auth)
                                              │  Supabase Storage (optional)
                                              └─ server/uploads (fallback disk)
```

- Node.js 20+ (tested on 24), npm 10+.
- PostgreSQL 14 or newer (13+ already provides `gen_random_uuid()`), on Supabase,
  Neon or self-hosted.
- A Supabase project: `SUPABASE_URL` and `SUPABASE_ANON_KEY` are required in
  production; `SUPABASE_SERVICE_ROLE_KEY` is needed for Storage, creating admin
  users and demo seeding. See [supabase.md](supabase.md).
- A writable, persistent `server/uploads` directory only when Supabase Storage is
  not configured.
- Public DNS + a TLS certificate for the storefront/API origin.

## 1. Build the release

On CI or the server:

```bash
npm ci
npm run build          # type-checks client, builds frontend/dist, compiles server/dist
```

The build output is:

- `frontend/dist/` — storefront SPA and static assets (served by Express)
- `server/dist/` — compiled API and CLI scripts

Ship both directories with `package.json`, `package-lock.json` and the runtime
`node_modules`. If `frontend/dist/index.html` is missing, the server still starts
API-only and logs a warning, but the storefront will not render.

## 2. Provision PostgreSQL and the RLS role

Nile Mart enforces permissions twice: in API guards and in PostgreSQL Row Level
Security. Customer-facing queries run as a restricted **NOLOGIN** role named
`nilemart_app`, inside a transaction that sets `app.user_id`, `app.perms` and
`app.guest_token`. Trusted flows (auth, checkout, webhooks, stock sweeps) use the
owner connection.

Use a dedicated database and a login role with enough privilege to run
migrations:

```sql
create database nilemart;
-- The login in DATABASE_URL must be able to create roles, or the role must be
-- created in advance by a superuser (see below).
```

Set `DATABASE_URL` for the owner/login role, then apply migrations:

```bash
DATABASE_URL='postgres://...?...' NODE_ENV=production \
  node server/dist/db/migrate.js
```

Migration `002_rls.sql` creates `nilemart_app nologin` if it does not exist and
grants table/sequence access plus all RLS policies. The API then executes
`SET LOCAL ROLE nilemart_app` per customer request, so the login role in
`DATABASE_URL` must be allowed to assume it. Check:

```sql
select pg_has_role(current_user, 'nilemart_app', 'member');
```

If it returns `false`, grant membership from a superuser connection:

```sql
grant nilemart_app to <your_api_login>;
```

Managed platforms:

- **Supabase** — run migrations with the project's `postgres` role. The `auth`
  schema exists, so migration `008` links `profiles.id` to `auth.users(id)` and
  installs the profile trigger. Still grant membership with `SET TRUE` for the
  login in `DATABASE_URL`:

  ```sql
  grant nilemart_app to postgres with set true;
  ```

  Full steps for keys, auth URLs, email templates and Storage are in
  [supabase.md](supabase.md).
- **Neon / RDS / other owners** — if your owner cannot `CREATE ROLE`, ask the
  provider's privileged console to pre-create `nilemart_app nologin`, then grant
  it to the application login and run the migrations.
- Never point the application at a superuser if you can avoid it; the owner
  connection bypasses RLS by design, so keep it for trusted server flows only.

### First administrator

Demo seeding is refused when `NODE_ENV=production`. Create the first super
administrator explicitly:

```bash
NODE_ENV=production DATABASE_URL='postgres://...' \
SUPABASE_URL='https://<project-ref>.supabase.co' \
SUPABASE_ANON_KEY='<anon key>' \
SUPABASE_SERVICE_ROLE_KEY='<service-role key>' \
ADMIN_EMAIL='ops@example.com' \
ADMIN_PASSWORD='a-long-unique-password' \
ADMIN_NAME='Operations lead' \
  node server/dist/db/create-admin.js
```

The script applies pending migrations, creates or updates the Supabase Auth user,
writes the profile with the same UUID, marks the email verified and grants
`super_admin`. Re-running it resets that account's password and unlocks it.
Change the password again from the account page after the first login, and create
the remaining staff accounts in **Admin → Staff & roles** with the least
privilege they need.

Do **not** run `db:seed` or `db:reset` in production. `db:seed` exits with a
warning in production, and `db:reset` refuses to run; `SEED_DEMO_DATA` defaults
to `false` when `NODE_ENV=production`.

### Verify RLS is actually protecting data

Run this against the production database:

```sql
begin;
set local role nilemart_app;
select set_config('app.user_id', '', true),
       set_config('app.perms', '', true),
       set_config('app.guest_token', '', true);
select count(*) from orders;      -- must be 0 for an anonymous session
select count(*) from profiles;    -- must be 0
rollback;
```

## 3. Production environment

Create `/etc/nilemart.env`, owned by root with mode `600`, containing:

```dotenv
NODE_ENV=production
PORT=4000

APP_URL=https://shop.example.com
API_URL=https://shop.example.com

DATABASE_URL=postgres://nilemart_app_login:...@db-host:5432/nilemart?sslmode=require
DATABASE_SSL=require

# Required in production: server-side Supabase Auth (+ Storage if used)
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service-role key>
SUPABASE_STORAGE_BUCKET=product-images
# AUTH_PROVIDER defaults to supabase when the URL and anon key are set
# AUTH_PROVIDER=local

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
SEED_ADMIN_PASSWORD=
```

Notes:

- `APP_URL` and `API_URL` must be the **same HTTPS origin** for the cookie
  model. `APP_URL` builds canonical/OG URLs, verification/recovery redirects and
  the sitemap; `API_URL` is sent to Chapa as the callback base.
- `NODE_ENV=production` switches session cookies to `Secure`, enables the
  Helmet Content Security Policy and JSON logs, and refuses local passwords.
  `SUPABASE_URL` and `SUPABASE_ANON_KEY` are mandatory.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only. It is used for Storage uploads,
  admin user creation and demo seeding; never expose it to the frontend.
- `REQUIRE_VERIFIED_EMAIL=true` prevents unreachable orders and typos; make sure
  SMTP works first.
- Leave `SEED_ADMIN_PASSWORD` empty; it is used only by the development seed.
- Store database, Supabase and payment secrets only in this file, never in the
  client. Only `APP_URL`/`API_URL` are public values.

## 4. Run the server

Example systemd unit (`/etc/systemd/system/nilemart.service`):

```ini
[Unit]
Description=Nile Mart
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=nilemart
Group=nilemart
WorkingDirectory=/srv/nilemart
EnvironmentFile=/etc/nilemart.env
ExecStart=/usr/bin/node server/dist/index.js
Restart=always
RestartSec=5
# The server handles SIGTERM and drains connections for up to 10 seconds.
TimeoutStopSec=20
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/srv/nilemart/server/uploads
ProtectHome=true

[Install]
WantedBy=multi-user.target
```

```bash
sudo useradd --system --home /srv/nilemart --shell /usr/sbin/nologin nilemart
sudo mkdir -p /srv/nilemart/server/uploads
sudo chown -R nilemart:nilemart /srv/nilemart
sudo systemctl daemon-reload
sudo systemctl enable --now nilemart
```

On boot the server applies pending migrations automatically and starts the
unpaid-order reservation sweep (every 5 minutes). It also runs a sweep at
startup. The sweep is safe with multiple API instances because each stale order
is re-checked under `FOR UPDATE`; still, run at least one instance continuously.

`GET /health` returns process liveness (it does not query the database). Point
your process monitor at it, and separately monitor database connectivity.

## 5. Reverse proxy and TLS

Terminate TLS at nginx or Caddy and forward everything to the Node process on
`127.0.0.1:4000`. Express already serves `/api`, `/uploads`, `/robots.txt`,
`/sitemap.xml`, static assets and the SPA shell from the same port.

nginx example:

```nginx
server {
    listen 443 ssl;
    http2 on;
    server_name shop.example.com;

    ssl_certificate     /etc/letsencrypt/live/shop.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/shop.example.com/privkey.pem;
    add_header Strict-Transport-Security "max-age=31536000" always;

    client_max_body_size 6m;   # admin image uploads are capped at 5 MB

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}

server {
    listen 80;
    server_name shop.example.com;
    return 301 https://$host$request_uri;
}
```

- In production the app sets `trust proxy` to exactly one hop, which is correct
  for this layout. **Firewall port 4000** so clients cannot bypass nginx and
  spoof `X-Forwarded-For` to evade rate limiting.
- Add HSTS only after TLS is working on every hostname you serve.
- Do not enable directory listings for `/uploads`; Express serves the directory
  without indexes and with immutable caching.

## 6. Uploads

Admin image uploads (PNG, JPEG, WebP, AVIF, GIF; max 5 MB, content signature
checked) go to a public **Supabase Storage** bucket through the API server when
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set. Files get UUID names,
immutable cache headers and a public URL such as
`https://<project-ref>.supabase.co/storage/v1/object/public/product-images/<uuid>.jpg`.
Create the bucket as described in [supabase.md](supabase.md).

- Without Supabase Storage the API falls back to `UPLOADS_DIR`
  (`server/uploads`). Keep that directory on persistent disk and include it in
  backups; a container filesystem without a volume loses product images.
- With Storage configured, the disk fallback is unused for new uploads and no
  volume is required. Multiple API instances can run without a shared volume.
- The service-role key stays on the server; browsers only receive public image
  URLs.
- Seed product images live in `server/uploads/seed` and are only needed when the
  development seed is used.

## 7. Payments and webhooks

Cash on delivery works out of the box. Chapa requires sandbox verification before
going live; follow [payments.md](payments.md) end to end.

- Webhook URL: `https://shop.example.com/api/webhooks/chapa` (must be public
  HTTPS and reachable by the provider).
- Set `CHAPA_SECRET_KEY` and `CHAPA_WEBHOOK_SECRET` from the Chapa dashboard.
  Without the webhook secret, the endpoint returns `503` and records nothing as
  paid.
- Signatures are verified over the raw body; invalid signatures return `401` and
  are stored with `signature_valid = false`.
- Webhook event ids are deduplicated in `payment_webhook_events`.
- The order is marked paid only after the provider transaction is verified and
  its amount/currency match. Never mark an order paid manually without provider
  settlement evidence.
- Telebirr, M-PESA, cards, PayPal and EPS remain unavailable until an adapter is
  implemented and tested; adding credentials alone does not enable them.

## 8. Email

Two transports are involved:

- **App mail** — receipts, welcome, password-changed notices and admin
  notifications use `SMTP_*` through Nodemailer. Without SMTP, messages are
  written to `email_outbox` and logged only — acceptable for staging, not for
  production.
- **Auth mail** — verification and password-recovery messages are sent by
  Supabase. Configure SMTP under **Authentication → SMTP Settings** in the
  Supabase dashboard and replace the default templates with the `token_hash`
  links in [supabase.md](supabase.md). The built-in sender is rate limited.

Use a provider that supports SPF/DKIM for your sending domain, and monitor
`ORDER_NOTIFICATION_EMAIL`.

## 9. Backups and recovery

- **Database** — nightly `pg_dump -Fc` plus provider PITR if available:
  `pg_dump -Fc --no-owner -f nilemart-$(date +%F).dump "$DATABASE_URL"`.
  Keep copies off-host and test a restore periodically.
- **Uploads** — with Supabase Storage, images live in the bucket and are covered
  by your Supabase storage retention/backup process. With the disk fallback,
  snapshot or `rsync` the uploads volume alongside each database backup so image
  references stay valid.
- **Secrets** — back up `/etc/nilemart.env` in your secrets manager, not in git.
- **Restore** — restore the database first, then uploads, then start the app.
  Migrations are forward-only; there are no down migrations. To roll back a bad
  release, restore the database backup (or ship a corrective migration) and the
  matching uploads snapshot.
- PGlite (`server/data`) is a development engine and is single-process. Do not
  use it for production traffic, and only copy its directory while the API is
  stopped.

## 10. Security checklist

- [ ] HTTPS everywhere; HTTP redirects to HTTPS; HSTS enabled after verification.
- [ ] Port 4000 unreachable from the internet; only the proxy can connect.
- [ ] `NODE_ENV=production`, so local passwords are refused, session cookies are
      `Secure`/`HttpOnly` and the CSP is active.
- [ ] `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` set on
      the server; the service-role key appears in no frontend bundle or repo file.
- [ ] Supabase **Site URL** and allowed redirect URLs point at the production
      `/verify-email` and `/reset-password`; both email templates use
      `token_hash` links.
- [ ] Supabase Auth SMTP configured; verification and recovery emails arrive.
- [ ] Storage bucket is public for reads but has no anonymous write policy.
- [ ] `REQUIRE_VERIFIED_EMAIL=true` and working transactional email.
- [ ] `SEED_DEMO_DATA=false`; no demo accounts or catalogue in production.
- [ ] First admin created with a unique long password; demo seed password unused.
- [ ] Staff accounts limited to the roles they need; review `user_roles` and the
      audit log regularly.
- [ ] Database backups and uploads backups scheduled and restored at least once
      into a staging environment.
- [ ] Payment secrets exist only in the server environment; no gateway key in
      `frontend/` or browser bundles.
- [ ] Chapa sandbox acceptance test completed before using live keys.
- [ ] Rate limits unchanged unless you understand the traffic profile; keep
      `RATE_LIMIT_WINDOW_MS` aligned with the proxy.
- [ ] No raw card numbers, CVVs, PINs or provider credentials in logs, tickets or
      the database.
- [ ] `GET /health` monitored, JSON logs shipped, disk space alerts on uploads.

## 11. Go-live smoke test

Run these against production after the first deploy:

1. `GET /health` returns `{"ok":true,...}`; `/robots.txt` and `/sitemap.xml`
   return the production origin.
2. Home page, category and product pages load with images.
3. Register a test customer, verify the email, sign in, add to cart, apply a
   coupon, and place a COD order. Confirm the confirmation page, account order
   page, admin order list and stock reservation (quantity vs reserved).
4. Sign in as each staff role and confirm navigation and API access match that
   role; confirm a store manager cannot open staff management even by URL.
5. As admin, upload a product image and confirm it persists after a service
   restart (Supabase Storage URL, or the uploads volume).
6. If Chapa is live, complete the sandbox/live acceptance checklist in
   [payments.md](payments.md), including replay and invalid-signature tests.
7. Sign out, confirm the session cookie is cleared and protected pages redirect
   to login.

## 12. Scaling notes

- Sessions live in PostgreSQL, so the API is stateless across instances; no
  sticky sessions are required.
- The reservation sweep is safe to run on every instance.
- With Supabase Storage, uploaded images need no shared volume. The disk fallback
  requires a shared read-write volume for multiple instances.
- PostgreSQL connection pools are capped at 10 per API process; size your
  database connections with the number of instances in mind. Supabase and Neon
  pooler limits apply.
- The storefront and admin are code-split; serve static assets through the proxy
  or a CDN for best results. Keep cache headers intact.
