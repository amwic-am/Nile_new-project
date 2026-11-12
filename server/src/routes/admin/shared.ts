import type { Request, Response } from 'express';
import { stringify } from 'csv-stringify/sync';
import { getDatabase } from '../../db/index.js';
import type { Sql } from '../../db/index.js';
import { badRequest } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { pageParams } from '../../lib/validation.js';

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}

/**
 * Administrative changes are always audited. The audit insert runs on the
 * trusted owner connection because audit_logs is append-only for the API
 * role; a logging failure is reported but never masks a completed action.
 */
export async function recordAudit(req: Request, entry: AuditEntry): Promise<void> {
  try {
    const db = await getDatabase();
    await db.query(
      `insert into audit_logs
         (actor_id, actor_email, action, entity_type, entity_id, before, after, ip, user_agent)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        req.auth?.id ?? null,
        req.auth?.email ?? null,
        entry.action,
        entry.entityType,
        entry.entityId ?? null,
        entry.before === undefined ? null : JSON.stringify(entry.before),
        entry.after === undefined ? null : JSON.stringify(entry.after),
        req.ip ?? '',
        req.get('user-agent')?.slice(0, 500) ?? '',
      ],
    );
  } catch (error) {
    logger.error('Failed to write audit log', {
      action: entry.action,
      entityType: entry.entityType,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function paging(req: Request, defaultSize = 25) {
  return pageParams(req.query, { page: 1, pageSize: defaultSize });
}

export function paginationMeta(page: number, pageSize: number, total: number) {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseBoundary(value: unknown, endOfDay: boolean): Date | null {
  if (typeof value !== 'string' || !value) return null;
  if (ISO_DATE.test(value)) {
    return new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}+03:00`);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Normalises an admin date range. Defaults to the last 30 days (inclusive of
 * today) and caps the window at 366 days to keep aggregate queries bounded.
 */
export function dateRange(
  req: Request,
  defaultDays = 30,
): { from: string; to: string; fromDate: Date; toDate: Date } {
  const now = new Date();
  const fallbackFrom = new Date(now.getTime() - (defaultDays - 1) * 86_400_000);
  fallbackFrom.setUTCHours(0, 0, 0, 0);

  const fromDate = parseBoundary(req.query.from, false) ?? fallbackFrom;
  const toDate = parseBoundary(req.query.to, true) ?? now;

  if (fromDate.getTime() > toDate.getTime()) {
    throw badRequest('The start date must be before the end date.');
  }
  if (toDate.getTime() - fromDate.getTime() > 366 * 86_400_000) {
    throw badRequest('Choose a date range of 366 days or less.');
  }
  return {
    from: fromDate.toISOString(),
    to: toDate.toISOString(),
    fromDate,
    toDate,
  };
}

export type CsvColumn<T> = { key: keyof T & string; header: string };

export function sendCsv<T extends object>(
  res: Response,
  filename: string,
  columns: CsvColumn<NoInfer<T>>[],
  rows: T[],
): void {
  const csv = stringify(rows, {
    header: true,
    columns: columns.map((column) => ({ key: column.key, header: column.header })),
  });
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}-${stamp}.csv"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(`\uFEFF${csv}`);
}

export function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toNumber(value: unknown): number {
  return Number(value ?? 0);
}

/** Returns the count/sum pair for a paginated admin query. */
export async function countRows(db: Sql, sql: string, params: unknown[]): Promise<number> {
  const result = await db.query<{ total: number }>(sql, params);
  return Number(result.rows[0]?.total ?? 0);
}
