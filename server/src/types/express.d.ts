import type { Request } from 'express';
import type { AuthUser } from '../lib/auth.js';

declare global {
  namespace Express {
    interface Request {
      auth?: AuthUser;
      sessionId?: string;
      guestToken?: string | null;
    }
  }
}

export {};
