import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { AppError, forbidden, isPgError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

const allowedOrigins = new Set([config.appUrl, config.apiUrl]);

export function originGuard(req: Request, _res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.path.startsWith('/payments/webhook')) return next();
  const origin = req.get('origin');
  if (origin && !allowedOrigins.has(origin)) {
    return next(forbidden('Request origin is not allowed'));
  }
  next();
}

function limiter(windowMs: number, limit: number, message: string) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: () => config.env === 'test',
    handler: (_req, res) => {
      res.status(429).json({ error: { code: 'rate_limited', message } });
    },
  });
}

export const loginLimiter = limiter(15 * 60 * 1000, 12, 'Too many sign-in attempts. Please wait 15 minutes.');
export const registerLimiter = limiter(60 * 60 * 1000, 10, 'Too many accounts created from this address. Try again later.');
export const emailLimiter = limiter(60 * 60 * 1000, 8, 'Too many email requests. Try again later.');
export const checkoutLimiter = limiter(60 * 60 * 1000, 30, 'Too many checkout attempts. Try again later.');
export const webhookLimiter = limiter(60 * 1000, 120, 'Too many webhook requests.');
export const uploadLimiter = limiter(60 * 60 * 1000, 80, 'Upload limit reached. Try again later.');
export const publicWriteLimiter = limiter(60 * 60 * 1000, 20, 'Too many requests. Try again later.');

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const started = Date.now();
  res.on('finish', () => {
    if (req.path === '/health') return;
    const meta = {
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status: res.statusCode,
      ms: Date.now() - started,
    };
    if (res.statusCode >= 500) logger.error('Request failed', meta);
    else if (res.statusCode >= 400) logger.warn('Request rejected', meta);
    else logger.debug('Request completed', meta);
  });
  next();
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: { code: 'not_found', message: 'The requested resource was not found' } });
}

export function errorHandler(error: unknown, req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) return next(error);

  let status = 500;
  let code = 'internal_error';
  let message = 'Something went wrong. Please try again.';
  let details: unknown;

  if (error instanceof AppError) {
    status = error.status;
    code = error.code;
    message = error.message;
    details = error.details;
  } else if (error instanceof SyntaxError && 'body' in error) {
    status = 400;
    code = 'invalid_json';
    message = 'The request body is not valid JSON';
  } else if (isPgError(error)) {
    if (error.code === '23505') {
      status = 409;
      code = 'conflict';
      message = 'That value is already in use';
    } else if (error.code === '23503') {
      status = 409;
      code = 'conflict';
      message = 'This record is still referenced by other data';
    } else if (error.code === '23514' || error.code === '22007' || error.code === '22P02') {
      status = 400;
      code = 'invalid_input';
      message = 'One or more values are invalid';
    }
  } else if (error && typeof error === 'object' && 'name' in error) {
    const name = (error as { name?: string }).name;
    if (name === 'MulterError') {
      status = 400;
      code = 'upload_failed';
      message = 'The file upload could not be processed';
    }
  }

  if (status >= 500) {
    logger.error('Unhandled server error', {
      path: req.originalUrl,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }

  const body: Record<string, unknown> = { error: { code, message } };
  if (details) (body.error as Record<string, unknown>).details = details;
  res.status(status).json(body);
}
