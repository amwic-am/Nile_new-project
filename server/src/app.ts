import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { attachAuth } from './lib/auth.js';
import { logger } from './lib/logger.js';
import {
  errorHandler,
  notFoundHandler,
  originGuard,
  requestLogger,
} from './middleware/security.js';
import accountRoutes from './routes/account.js';
import adminRoutes from './routes/admin/index.js';
import authRoutes from './routes/auth.js';
import cartRoutes from './routes/cart.js';
import checkoutRoutes from './routes/checkout.js';
import orderRoutes from './routes/orders.js';
import seoRoutes from './routes/seo.js';
import storefrontRoutes from './routes/storefront.js';
import webhookRoutes from './routes/webhooks.js';
import wishlistRoutes from './routes/wishlist.js';

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', config.isProd ? 1 : false);

app.use(
  helmet({
    contentSecurityPolicy: config.isProd
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'https:'],
            fontSrc: ["'self'", 'data:'],
            connectSrc: ["'self'"],
            frameAncestors: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
          },
        }
      : false,
    crossOriginResourcePolicy: { policy: 'same-site' },
  }),
);
app.use(express.json({ limit: '512kb' }));
app.use(express.urlencoded({ extended: false, limit: '128kb' }));
app.use(cookieParser());

// Payment webhooks need the raw body for signature verification, so they are
// mounted before the JSON parser.
app.use('/api/webhooks', express.raw({ type: '*/*', limit: '256kb' }), webhookRoutes);

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'nile-mart-api', time: new Date().toISOString() });
});

app.use(seoRoutes);

app.use('/uploads', express.static(config.uploadsDir, { maxAge: '30d', immutable: true, index: false }));

app.use('/api', requestLogger, attachAuth, originGuard);

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', accountRoutes);
app.use('/api', cartRoutes);
app.use('/api', checkoutRoutes);
app.use('/api', orderRoutes);
app.use('/api', wishlistRoutes);
app.use('/api', storefrontRoutes);

app.use('/api', notFoundHandler);

const spaIndexPath = path.join(config.clientDist, 'index.html');
// Absolute URLs are required for Open Graph tags, so the placeholder in
// index.html is resolved with APP_URL when the SPA shell is served.
const spaHtml = fs.existsSync(spaIndexPath)
  ? fs.readFileSync(spaIndexPath, 'utf8').replaceAll('%APP_URL%', config.appUrl)
  : null;

if (spaHtml) {
  app.use(express.static(config.clientDist, { index: false, maxAge: '1h' }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/uploads')) return next();
    res.set('Cache-Control', 'no-cache').type('html').send(spaHtml);
  });
}

app.use(errorHandler);

if (!spaHtml) {
  logger.warn('Client build not found. Run the Vite dev server for the storefront.', {
    expected: config.clientDist,
  });
}

export default app;
