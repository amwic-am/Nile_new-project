import { Router } from 'express';
import { config } from '../config.js';
import { getDatabase } from '../db/index.js';
import { asyncRoute } from '../lib/request.js';

const router = Router();

const STATIC_CONTENT_PATHS: Record<string, string> = {
  about: '/about',
  contact: '/contact',
  shipping: '/shipping',
  returns: '/returns',
  privacy: '/privacy',
  terms: '/terms',
};

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (character) => {
    switch (character) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case "'":
        return '&apos;';
      default:
        return '&quot;';
    }
  });
}

function urlEntry(path: string, lastmod?: string | Date | null): string {
  const location = `${config.appUrl}${path}`;
  const modified = lastmod ? new Date(lastmod) : null;
  const lastmodTag =
    modified && !Number.isNaN(modified.getTime())
      ? `\n    <lastmod>${modified.toISOString()}</lastmod>`
      : '';
  return `  <url>\n    <loc>${escapeXml(location)}</loc>${lastmodTag}\n  </url>`;
}

function contentPath(slug: string): string {
  return STATIC_CONTENT_PATHS[slug] ?? `/content/${slug}`;
}

router.get('/robots.txt', (_req, res) => {
  const lines = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /account',
    'Disallow: /cart',
    'Disallow: /checkout',
    'Disallow: /login',
    'Disallow: /register',
    'Disallow: /forgot-password',
    'Disallow: /reset-password',
    'Disallow: /verify-email',
    'Disallow: /search',
    'Disallow: /api',
    '',
    `Sitemap: ${config.appUrl}/sitemap.xml`,
    '',
  ];
  res
    .type('text/plain')
    .set('Cache-Control', 'public, max-age=86400')
    .send(lines.join('\n'));
});

router.get(
  '/sitemap.xml',
  asyncRoute(async (_req, res) => {
    const db = await getDatabase();
    const [products, categories, pages] = await Promise.all([
      db.query<{ slug: string; updated_at: Date }>(
        `select slug, updated_at from products where status = 'active' order by slug`,
      ),
      db.query<{ slug: string; updated_at: Date }>(
        `select slug, updated_at from categories where is_active = true order by slug`,
      ),
      db.query<{ slug: string; updated_at: Date }>(
        `select slug, updated_at from content_pages where is_published = true order by slug`,
      ),
    ]);

    const entries = [
      urlEntry('/'),
      urlEntry('/products'),
      ...pages.rows.map((page) => urlEntry(contentPath(page.slug), page.updated_at)),
      ...categories.rows.map((category) =>
        urlEntry(`/category/${encodeURIComponent(category.slug)}`, category.updated_at),
      ),
      ...products.rows.map((product) =>
        urlEntry(`/product/${encodeURIComponent(product.slug)}`, product.updated_at),
      ),
    ];

    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...entries,
      '</urlset>',
      '',
    ].join('\n');

    res
      .type('application/xml')
      .set('Cache-Control', 'public, max-age=1800')
      .send(xml);
  }),
);

export default router;
