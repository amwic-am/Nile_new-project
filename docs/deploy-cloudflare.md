# Deploying the storefront on Cloudflare

This path serves the built SPA from a **Cloudflare Worker** and proxies the API
to **Railway**, with PostgreSQL on **Supabase** or **Neon**. It exists because
the repository is an npm workspace: `npx wrangler deploy` run at the root fails
with "application detection logic has been run in the root of a workspace"
unless a root `wrangler.jsonc` is present. This config supplies it.

Supabase Auth is required in production, and Supabase Storage is the simplest way
to keep product images without a Railway volume.

```text
Browser
  │  https://shop.example.com
  ▼
Cloudflare Worker
  │  assets from frontend/dist (SPA fallback)
  │  /api/*, /uploads/*, /robots.txt, /sitemap.xml  →  proxy
  ▼
Railway (server/dist, Express)
  │                    │ GoTrue REST + Storage
  │                    ▼
  │                 Supabase (Auth, optional Storage)
  ▼
Supabase Postgres or Neon PostgreSQL (RLS enforced)
```

Files involved:

| File | Purpose |
| --- | --- |
| `wrangler.jsonc` | Worker name, entry point, asset directory, proxy routes |
| `cloudflare/worker.js` | Proxies API paths to `env.API_URL`; forwards cookies and client IP |
| `frontend/public/_headers` | CSP and immutable asset caching, copied into `frontend/dist` |

## 1. Database and API

Follow steps 1 and 2 of [deploy-vercel.md](deploy-vercel.md) to create the
database, apply migrations, grant `nilemart_app` `SET TRUE`, and run the Express
API on Railway. Either use Supabase for Postgres, Auth and Storage
([supabase.md](supabase.md)) or Neon for Postgres while still setting the
`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` variables on
Railway. Note the Railway HTTPS origin, for example
`https://nile-mart-api.up.railway.app`.

## 2. Worker settings

In the Cloudflare dashboard for the Worker connected to this repository:

- **Build command:** `npm run build`
- **Deploy command:** `npx wrangler deploy`
- **Variables:** add `API_URL=https://nile-mart-api.up.railway.app` as a plain
  text variable. The Worker returns `503` with a clear message if it is missing.

`wrangler.jsonc` sets `name: "nile-mart"`. If your Worker has a different name,
change `name` to match, otherwise the deploy targets a new Worker (or fails with
a permissions error).

## 3. Storefront URL

Set the build-time variable `APP_URL` to the public Worker or custom-domain
origin, for example `https://shop.example.com`. Vite bakes it into the Open
Graph tags. If it is absent, the `%APP_URL%` placeholder stays in `index.html`
and social previews point nowhere.

Attach the custom domain under **Workers → Settings → Domains & Routes**. Keep
`APP_URL` and the custom domain identical so the API's origin check accepts
form submissions.

## 4. Deploy order

1. Deploy the API and verify `curl https://api.example.com/health`.
2. Set `API_URL` and `APP_URL`, then deploy the Worker.
3. Verify:

   ```bash
   curl -sI https://shop.example.com/api/products | head -1   # 200 through the proxy
   curl -sI https://shop.example.com/uploads/seed/backpack-35l.png | head -1
   curl -s  https://shop.example.com/robots.txt | tail -3
   ```

4. In the Chapa dashboard, keep the webhook at the Railway API origin
   (`https://api.example.com/api/webhooks/chapa`), not the Worker origin.

## Local check

With `npm run dev` running the API on `:4000`:

```bash
npx wrangler dev --var API_URL:http://localhost:4000
```

The Worker serves on `:8787`; product pages, `/api/*`, `/uploads/*` and a login
(cookie set through the proxy) should all work. `npx wrangler deploy --dry-run`
validates the config without uploading.

## Notes and limits

- Cookies stay first-party: the browser only sees the Worker origin, and the
  proxy forwards `Set-Cookie` unchanged.
- Client IPs are taken from `cf-connecting-ip`; incoming `x-forwarded-*` headers
  from the browser are discarded so rate limits and audit logs cannot be spoofed.
- The Worker proxies request bodies up to Cloudflare's plan limit; the API's own
  upload cap is 5 MB.
- With Supabase Storage configured, product images are served from the Supabase
  public URL, not `/uploads`, so image traffic bypasses the Worker. The
  `/uploads/*` proxy remains for the disk fallback (for example seed images).
- Cloudflare Pages is a different product: it has no `wrangler deploy` step and
  would need Pages Functions for the API proxy. The Worker setup above is the
  supported path for this repository.
