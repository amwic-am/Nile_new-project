export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message = 'Invalid request', details?: unknown) =>
  new AppError(400, 'bad_request', message, details);
export const unauthorized = (message = 'Please sign in to continue') =>
  new AppError(401, 'unauthorized', message);
export const forbidden = (message = 'You do not have permission to perform this action') =>
  new AppError(403, 'forbidden', message);
export const notFound = (message = 'Not found') => new AppError(404, 'not_found', message);
export const conflict = (message = 'Conflict', details?: unknown) =>
  new AppError(409, 'conflict', message, details);
export const unprocessable = (message = 'Unable to process this request', details?: unknown) =>
  new AppError(422, 'unprocessable', message, details);
export const tooMany = (message = 'Too many requests. Please try again shortly.') =>
  new AppError(429, 'rate_limited', message);
export const notImplemented = (message = 'This integration is not configured yet') =>
  new AppError(501, 'not_configured', message);

export function isPgError(error: unknown): error is { code: string; detail?: string; constraint?: string } {
  return Boolean(error && typeof error === 'object' && 'code' in error);
}
