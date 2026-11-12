# Supabase setup (Postgres, Auth and Storage)

Nile Mart can run entirely on Supabase: Postgres for data and RLS, GoTrue for
credentials and email verification, and Storage for product images. Supabase is
optional in development — with no `SUPABASE_*` variables the API uses embedded
PGlite, local scrypt passwords and disk uploads. Production requires Supabase
Auth (`AUTH_PROVIDER=local` is refused when `NODE_ENV=production`).

How the pieces fit:

```text
Browser ── HttpOnly nm_session cookie ──► Express API
                                            │  GoTrue REST (/auth/v1/*) with the anon key
                                            │  Admin API + Storage with the service-role key
                                            ▼
                                      Supabase Auth ──► auth.users
                                            │ trigger (migration 008)
                                            ▼
                                      public.profiles (same UUID)
Browser ── /api/* ──► Express ── pg (owner) or SET LOCAL ROLE nilemart_app ──► Supabase Postgres
```

The anon and service-role keys are used only by the API server. The browser
never receives a Supabase access token or refresh token; it only holds the same
opaque `nm_session` cookie used by the local provider. Profiles are keyed by
`auth.users.id`, so RLS policies and permissions are unchanged.

---

## 1. Project and keys

Create a project at <https://supabase.com/dashboard>. From **Project Settings →
API** copy:

| Value | Environment variable | Where it goes |
| --- | --- | --- |
| Project URL | `SUPABASE_URL` | API server |
| `anon` / publishable key | `SUPABASE_ANON_KEY` | API server only |
| `service_role` / secret key | `SUPABASE_SERVICE_ROLE_KEY` | API server only — never the browser |
| Transaction pooler URL (port `6543`) | `DATABASE_URL` | API server |
| Session pooler URL (port `5432`) | `DIRECT_URL` | SQL migrations |

From **Project Settings → Database** copy both pooler connection strings. Use
the shared transaction pooler (port `6543`, usually with `?pgbouncer=true`) for
`DATABASE_URL`, and the session pooler (port `5432`) for `DIRECT_URL`. Both use
the pooler hostname, which works on IPv4-only networks. The migration command
uses `DIRECT_URL` when present and falls back to `DATABASE_URL` otherwise.

`DATABASE_SSL=require` encrypts the connection but does not verify the server's
certificate. For verified TLS, download the database root certificate from
**Project Settings → Database → SSL Configuration**, set `DATABASE_SSL=verify`,
and set `DATABASE_SSL_CA` to either the local certificate path or its PEM
contents (use the PEM contents for hosts where you cannot mount a certificate
file). Do not use `DATABASE_SSL=no-verify` in production.

Never put `SUPABASE_SERVICE_ROLE_KEY` in `frontend/`, in `VITE_*` variables, or
in a static build. It bypasses RLS and Storage policies.

---

## 2. Database and RLS

Run migrations once with the project's `postgres` role (the connection string
above). Do this before starting the API in production:

```bash
npm ci
npm run build -w server
DATABASE_URL='postgresql://postgres:...@...:5432/postgres?sslmode=require' \
  NODE_ENV=production node server/dist/db/migrate.js
```

Migration `002_rls.sql` creates the `nilemart_app` NOLOGIN role, grants and all
policies. Migration `008_supabase_auth.sql` adds `profiles.email_verified_at`,
conditionally links `profiles.id` to `auth.users(id)`, and installs the
`on_auth_user_created` trigger that mirrors new auth users into `profiles` and
grants them the `customer` role.

The API assumes `nilemart_app` with `SET LOCAL ROLE` for customer-facing
queries, so the login in `DATABASE_URL` must be a member with `SET TRUE`:

```sql
grant nilemart_app to postgres with set true;
select pg_has_role(current_user, 'nilemart_app', 'member');  -- must be true
```

Run that in the **SQL Editor** if your migration login is not already a member.
A grant created with `SET FALSE` reports `true` for `pg_has_role` yet still fails
at runtime, so always include `with set true`.

Verify RLS before adding data:

```sql
begin;
set local role nilemart_app;
select set_config('app.user_id', '', true),
       set_config('app.perms', '', true),
       set_config('app.guest_token', '', true);
select count(*) from orders;    -- 0
select count(*) from profiles;  -- 0
rollback;
```

If `set local role` fails, the grant above is missing. Keep the owner connection
for trusted server flows only; all customer requests are downgraded to
`nilemart_app`.

---

## 3. Authentication settings

In **Authentication → URL Configuration**:

- **Site URL:** the storefront origin, e.g. `https://shop.example.com`.
- **Redirect URLs:** add every origin that may receive auth links:
  - `https://shop.example.com/verify-email`
  - `https://shop.example.com/reset-password`
  - `http://localhost:5173/verify-email` and
    `http://localhost:5173/reset-password` for local Supabase development.

The API passes `redirect_to` when it calls signup, resend and recover, so an
unlisted URL makes GoTrue fall back to the Site URL and the link breaks.

In **Authentication → Providers → Email**:

- Keep **Confirm email** on. The UI expects verification and the API marks
  `profiles.email_verified_at` from `email_confirmed_at`.
- With confirmation off, signup returns a session immediately; accounts are
  still usable but the verification screens are skipped.

### Email templates

GoTrue sends the verification and recovery emails. The default
`{{ .ConfirmationURL }}` links verify on the Supabase domain and return tokens in
the URL fragment, which this server-side flow cannot read. Replace both
templates so the link carries a token hash to the app:

**Confirm signup** template:

```html
<h2>Confirm your Nile Mart email</h2>
<p>Open this link to verify your address. It expires in 24 hours.</p>
<p>
  <a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email">
    Verify email
  </a>
</p>
```

**Reset password** template:

```html
<h2>Reset your Nile Mart password</h2>
<p>Open this link to choose a new password. It expires in one hour.</p>
<p>
  <a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery">
    Reset password
  </a>
</p>
```

`{{ .RedirectTo }}` is the `/verify-email` or `/reset-password` URL the API
requested. If you prefer a fixed origin, use
`{{ .SiteURL }}/verify-email?token_hash={{ .TokenHash }}&type=email` instead and
set the Site URL to the storefront. Do not include `type=signup`; GoTrue expects
`type=email` for the confirmation token in this flow.

### Auth email delivery

Auth mail (verification, recovery) is sent by Supabase, not by the app's
Nodemailer transport. Configure **Authentication → SMTP Settings** with your
provider for production; the built-in sender is rate limited and intended for
testing. The API's own `SMTP_*` variables send order receipts, welcome mail and
security notices. Without SMTP, those messages go to `email_outbox`.

Keep auth rate limits enabled. The API maps GoTrue rate-limit responses to a
`429` and shows a retry message.

---

## 4. Storage

Product image uploads go to a public bucket through the server (service-role
key), with magic-byte and MIME validation. Create the bucket in the **SQL
Editor**:

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
```

Use a different name only if you also set `SUPABASE_STORAGE_BUCKET`. Public read
is required because image URLs are stored on products and rendered directly.
No storage RLS policy is needed for server uploads: the service role bypasses
Storage policies. If you later allow direct browser uploads, add scoped policies
and signed URLs instead of exposing the service key.

Without `SUPABASE_SERVICE_ROLE_KEY` the API falls back to `UPLOADS_DIR`. That is
fine for local development; on a single host, mount a persistent volume. See
[deployment.md](deployment.md).

---

## 5. Environment

Local development against Supabase (`.env` at the repository root):

```dotenv
APP_URL=http://localhost:5173
API_URL=http://localhost:4000

DATABASE_URL=postgresql://postgres:<password>@<host>:5432/postgres?sslmode=require
DATABASE_SSL=require

SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service-role key>
SUPABASE_STORAGE_BUCKET=product-images
```

`AUTH_PROVIDER` defaults to `supabase` when `SUPABASE_URL` and
`SUPABASE_ANON_KEY` are both set, and to `local` otherwise. Set
`AUTH_PROVIDER=local` explicitly if you want local passwords even with a
Supabase database (development only; production refuses it).

Then:

```bash
npm ci
npm run db:migrate
npm run db:seed        # optional demo catalogue/accounts; needs the service-role key
npm run dev
```

Automatic seeding at startup is skipped whenever `DATABASE_URL` is set, so a
remote database is only seeded by an explicit `npm run db:seed`. It refuses to
run when `NODE_ENV=production`. In Supabase mode the seed creates real GoTrue
users for the demo staff and customers (with confirmed emails) and writes
matching profiles.

Create the first production administrator without the demo seed:

```bash
NODE_ENV=production \
DATABASE_URL='postgresql://postgres:...@...:5432/postgres?sslmode=require' \
SUPABASE_URL='https://<project-ref>.supabase.co' \
SUPABASE_ANON_KEY='<anon key>' \
SUPABASE_SERVICE_ROLE_KEY='<service-role key>' \
ADMIN_EMAIL='ops@example.com' \
ADMIN_PASSWORD='a-long-unique-password' \
ADMIN_NAME='Operations lead' \
  npm run db:create-admin
```

The script creates or updates the Supabase user, sets its profile (same UUID),
marks the email confirmed, and grants `super_admin`.

---

## 6. End-to-end checks

With the API running against Supabase:

1. Register a new email in the storefront. The response should say a
   verification link was sent and no Supabase token appears in the browser.
2. Open the link. It should land on `/verify-email?token_hash=...&type=email`,
   call `POST /api/auth/verify-email`, and show "Email verified". In Supabase,
   `auth.users.email_confirmed_at` and `profiles.email_verified_at` are set.
3. Sign in. `profiles.id` must equal `auth.users.id`; `/api/auth/me` returns the
   same user.
4. Request a password reset and complete it from the recovery link. Other
   sessions are revoked.
5. Upload a product image in **Admin → Products**. The API response contains a
   `.../storage/v1/object/public/product-images/<uuid>.<ext>` URL that loads
   without a signed URL.
6. Run the RLS queries from section 2. Anonymous sessions must see zero orders
   and profiles.

Automated tests always force `AUTH_PROVIDER=local` and blank Supabase variables,
so `npm test` never touches a real project.

---

## 7. Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| Login fails with `Email not confirmed` | The account exists but the link was not opened. Resend from `/verify-email`; the API ignores enumeration errors. |
| Verification link opens the Supabase site or `/#access_token=...` | The email template still uses `{{ .ConfirmationURL }}`. Replace it with the `token_hash` template above. |
| `redirect_to` rejected / link points at `localhost` | Add the exact `${APP_URL}/verify-email` and `${APP_URL}/reset-password` URLs to **Redirect URLs**. |
| `400 invalid api key` or `401` from GoTrue | Wrong `SUPABASE_URL`/`SUPABASE_ANON_KEY`, or the anon key was replaced by the service key (or vice versa). |
| `SUPABASE_SERVICE_ROLE_KEY is required` | Storage, demo seeding and admin bootstrap need it. Add it to the server environment only. |
| Storage upload returns `400 Bucket not found` | Run the bucket SQL and confirm `SUPABASE_STORAGE_BUCKET` matches. |
| Uploads still go to `/uploads/...` | The service-role key is missing, so the disk fallback is active. |
| RLS test returns rows as `nilemart_app` | The login is not a member with `SET TRUE`, or the query ran before `set local role`. |
| `permission denied for table ...` after a new migration | Re-run migrations as the owner so `002_rls.sql` and later grants apply, then confirm `nilemart_app` grants. |
| `password authentication failed` for `nilemart_app` | It is NOLOGIN by design. Connect as the owner and assume it with `SET LOCAL ROLE`. |
| Migration 008 fails with `relation "auth.users" does not exist` | The database has an empty `auth` schema (for example Neon Auth) but no Supabase tables. The migration guards on `to_regclass('auth.users')`, so upgrade to the current file or apply it on the Supabase database instead. |
| `prepared statement ... already exists` on the pooled connection | You are on the transaction pooler. Use the session pooler or direct connection for `DATABASE_URL`. |

See also [deployment.md](deployment.md) for RLS details, backups and the go-live
checklist, and [payments.md](payments.md) for the payment rules.
