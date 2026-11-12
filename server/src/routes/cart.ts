import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { setGuestCartCookie } from '../lib/auth.js';
import { asyncRoute, withUserDb } from '../lib/request.js';
import { guestToken as newGuestToken } from '../lib/tokens.js';
import { parse } from '../lib/validation.js';
import {
  addCartItem,
  applyCartCoupon,
  clearCart,
  readCart,
  removeCartCoupon,
  removeCartItem,
  updateCartItem,
  type CartIdentity,
} from '../services/cart.js';
import { publicWriteLimiter } from '../middleware/security.js';

const router = Router();

const addSchema = z.object({
  variantId: z.string().uuid('Choose a valid product variant'),
  quantity: z.number().int().min(1).max(99).default(1),
});

const quantitySchema = z.object({
  quantity: z.number().int().min(0).max(99),
});

const couponSchema = z.object({
  code: z.string().trim().min(3).max(40),
});

const idSchema = z.string().uuid('Invalid cart item');

function identityFor(req: Request, res: Response, create: boolean): CartIdentity {
  if (req.auth) return { profileId: req.auth.id, guestToken: null };
  let token = req.guestToken ?? null;
  if (!token && create) {
    token = newGuestToken();
    setGuestCartCookie(res, token);
    req.guestToken = token;
  }
  return { profileId: null, guestToken: token };
}

router.get(
  '/cart',
  asyncRoute(async (req, res) => {
    const identity = identityFor(req, res, false);
    const cart = await withUserDb(req, (db) => readCart(db, identity, req.auth?.email));
    res.json({ cart });
  }),
);

router.post(
  '/cart/items',
  publicWriteLimiter,
  asyncRoute(async (req, res) => {
    const body = parse(addSchema, req.body);
    const identity = identityFor(req, res, true);
    const cart = await withUserDb(req, (db) => addCartItem(db, identity, body, req.auth?.email));
    res.status(201).json({ cart });
  }),
);

router.patch(
  '/cart/items/:id',
  asyncRoute(async (req, res) => {
    const id = parse(idSchema, req.params.id);
    const body = parse(quantitySchema, req.body);
    const identity = identityFor(req, res, false);
    const cart = await withUserDb(req, (db) =>
      updateCartItem(db, identity, id, body.quantity, req.auth?.email),
    );
    res.json({ cart });
  }),
);

router.delete(
  '/cart/items/:id',
  asyncRoute(async (req, res) => {
    const id = parse(idSchema, req.params.id);
    const identity = identityFor(req, res, false);
    const cart = await withUserDb(req, (db) => removeCartItem(db, identity, id, req.auth?.email));
    res.json({ cart });
  }),
);

router.delete(
  '/cart',
  asyncRoute(async (req, res) => {
    const identity = identityFor(req, res, false);
    const cart = await withUserDb(req, (db) => clearCart(db, identity, req.auth?.email));
    res.json({ cart });
  }),
);

router.post(
  '/cart/coupon',
  publicWriteLimiter,
  asyncRoute(async (req, res) => {
    const body = parse(couponSchema, req.body);
    const identity = identityFor(req, res, true);
    const cart = await withUserDb(req, (db) =>
      applyCartCoupon(db, identity, body.code, req.auth?.email),
    );
    res.json({ cart });
  }),
);

router.delete(
  '/cart/coupon',
  asyncRoute(async (req, res) => {
    const identity = identityFor(req, res, false);
    const cart = await withUserDb(req, (db) => removeCartCoupon(db, identity, req.auth?.email));
    res.json({ cart });
  }),
);

export default router;
