import fs from 'node:fs';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';

export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number;
}

export interface Sql {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
  exec(sql: string): Promise<void>;
}

export interface RequestContext {
  userId?: string | null;
  perms?: string[];
  guestToken?: string | null;
}

interface Driver extends Sql {
  transaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.tail.then(fn, fn);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async wait(): Promise<void> {
    await this.tail;
  }
}

class PgliteDriver implements Driver {
  private queue = new SerialQueue();

  constructor(private readonly db: import('@electric-sql/pglite').PGlite) {}

  query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<QueryResult<T>> {
    return this.queue.run(async () => {
      const result = await this.db.query<T>(text, params as never[]);
      return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
    });
  }

  exec(sql: string): Promise<void> {
    return this.queue.run(async () => {
      await this.db.exec(sql);
    });
  }

  transaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T> {
    return this.queue.run(async () =>
      this.db.transaction(async (tx) => {
        const sql: Sql = {
          query: async <R = Record<string, unknown>>(text: string, params: unknown[] = []) => {
            const result = await tx.query<R>(text, params as never[]);
            return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
          },
          exec: async (text: string) => {
            await tx.exec(text);
          },
        };
        return fn(sql);
      }),
    );
  }

  async close() {
    await this.db.close();
  }
}

class PgDriver implements Driver {
  constructor(private readonly pool: import('pg').Pool) {}

  async query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<QueryResult<T>> {
    const result = await this.pool.query(text, params);
    return { rows: result.rows as T[], rowCount: result.rowCount ?? result.rows.length };
  }

  async exec(sql: string): Promise<void> {
    await this.pool.query(sql);
  }

  async transaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    const queue = new SerialQueue();
    try {
      await client.query('BEGIN');
      const sql: Sql = {
        query: <R = Record<string, unknown>>(text: string, params: unknown[] = []) =>
          queue.run(async () => {
            const result = await client.query(text, params);
            return { rows: result.rows as R[], rowCount: result.rowCount ?? result.rows.length };
          }),
        exec: (text: string) =>
          queue.run(async () => {
            await client.query(text);
          }),
      };
      const result = await fn(sql);
      await queue.wait();
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await queue.wait();
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        logger.error('Failed to roll back transaction', { error: String(rollbackError) });
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async close() {
    await this.pool.end();
  }
}

export class Database implements Sql {
  constructor(private readonly driver: Driver) {}

  query<T = Record<string, unknown>>(text: string, params?: unknown[]) {
    return this.driver.query<T>(text, params);
  }

  exec(sql: string) {
    return this.driver.exec(sql);
  }

  /** Trusted server transaction running as the database owner (bypasses RLS). */
  transaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T> {
    return this.driver.transaction(fn);
  }

  /**
   * End-user transaction. Runs as the restricted `nilemart_app` role with RLS
   * enforced, using session-local variables for identity and permissions.
   */
  requestContext<T>(context: RequestContext, fn: (tx: Sql) => Promise<T>): Promise<T> {
    return this.driver.transaction(async (tx) => {
      await tx.exec('set local role nilemart_app');
      await tx.query(
        `select set_config('app.user_id', $1, true),
                set_config('app.perms', $2, true),
                set_config('app.guest_token', $3, true)`,
        [context.userId ?? '', (context.perms ?? []).join(','), context.guestToken ?? ''],
      );
      return fn(tx);
    });
  }

  async close() {
    await this.driver.close();
  }
}

let databasePromise: Promise<Database> | null = null;

async function createDatabase(databaseUrl = config.databaseUrl): Promise<Database> {
  if (databaseUrl) {
    const { Pool } = await import('pg');
    const ssl =
      config.databaseSsl === 'disable'
        ? false
        : {
            rejectUnauthorized: config.databaseSslRejectUnauthorized,
            ...(config.databaseSslCa ? { ca: fs.readFileSync(config.databaseSslCa, 'utf8') } : {}),
          };
    const pool = new Pool({
      connectionString: databaseUrl,
      ssl,
      max: 10,
    });
    logger.info('Connected to PostgreSQL');
    return new Database(new PgDriver(pool));
  }

  fs.mkdirSync(config.pgliteDataDir, { recursive: true });
  const { PGlite } = await import('@electric-sql/pglite');
  const pglite = await PGlite.create(config.pgliteDataDir);
  logger.info('Using embedded PostgreSQL (PGlite)', { dataDir: config.pgliteDataDir });
  return new Database(new PgliteDriver(pglite));
}

export async function getDatabase(): Promise<Database> {
  // Cache the promise so concurrent first requests cannot open separate
  // connections (PGlite only supports one process per data directory).
  if (!databasePromise) {
    databasePromise = createDatabase().catch((error) => {
      databasePromise = null;
      throw error;
    });
  }
  return databasePromise;
}

export async function getMigrationDatabase(): Promise<Database> {
  return config.directDatabaseUrl
    ? createDatabase(config.directDatabaseUrl)
    : getDatabase();
}

export async function closeDatabase() {
  if (!databasePromise) return;
  const pending = databasePromise;
  databasePromise = null;
  try {
    const db = await pending;
    await db.close();
  } catch {
    // A failed connection has nothing to close.
  }
}

export function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === '23505',
  );
}
