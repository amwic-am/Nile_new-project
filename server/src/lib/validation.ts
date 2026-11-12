import type { ZodType } from 'zod';
import { badRequest } from './errors.js';

export function parse<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      field: issue.path.join('.') || '_root',
      message: issue.message,
    }));
    throw badRequest('Please check the highlighted fields', details);
  }
  return result.data;
}

export function pageParams(query: Record<string, unknown>, defaults = { page: 1, pageSize: 20 }) {
  const page = Math.max(1, Number(query.page) || defaults.page);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || defaults.pageSize));
  return { page, pageSize, offset: (page - 1) * pageSize };
}
