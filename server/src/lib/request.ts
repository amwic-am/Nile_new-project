import type { NextFunction, Request, Response } from 'express';
import type { Sql } from '../db/index.js';
import { getDatabase } from '../db/index.js';

export async function withUserDb<T>(req: Request, fn: (db: Sql) => Promise<T>): Promise<T> {
  const db = await getDatabase();
  return db.requestContext(
    {
      userId: req.auth?.id ?? null,
      perms: req.auth?.perms ?? [],
      guestToken: req.guestToken ?? null,
    },
    fn,
  );
}

export async function systemDb<T>(fn: (db: Awaited<ReturnType<typeof getDatabase>>) => Promise<T>) {
  const db = await getDatabase();
  return fn(db);
}

export function sendOk(res: Response, data: unknown, status = 200) {
  res.status(status).json(data);
}

export function asyncRoute(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };
}
