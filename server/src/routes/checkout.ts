import { Router } from 'express';
import { z } from 'zod';
import { getDatabase } from '../db/index.js';
import { AppError, notFound, unprocessable } from '../lib/errors.js';
import { requireAuth } from '../lib/auth.js';
import { orderPlacedEmail } from '../lib/emails.js';
import { logger } from '../lib/logger.js';
import { sendEmail } from '../lib/mailer.js';
import { asyncRoute } from '../lib/request.js';
import { randomToken } from '../lib/tokens.js';
import { parse } from '../lib/validation.js';
import { checkoutLimiter } from '../middleware/security.js';
import { buildCartView, findActiveCart } from '../services/cart.js';
import { getOrderDetail, placeOrder, type PlaceOrderInput } from '../services/orders.js';
import { getPaymentOptions, startChapaPayment } from '../services/payments.js';
import { getDeliveryMethods, getFreeShippingThreshold, getSetting } from '../services/settings.js';

const router = Router();

const addressSchema = z.object({
  fullName: z.string().trim().max(100).optional().default(''),
  phone: z.string().trim().max(30).optional().default(''),
  line1: z.string().trim().max(200).optional().default(''),
  line2: z.string().trim().max(200).optional().nullable(),
  city: z.string().trim().max(80).optional().default(''),
  region: z.string().trim().max(80).optional().default(''),
  postalCode: z.string().trim().max(20).optional().nullable(),
  country: z.string().trim().length(2).optional().default('ET'),
});

const checkoutSchema = z
  .object({
    contact: z.object({
      fullName: z.string().trim().min(2, 'Enter the recipient name').max(100),
      email: z.string().trim().min(5).max(254).email('Enter a valid email address'),
      phone: z
        .string()
        .trim()
        .min(7, 'Enter a phone number')
        .max(30)
        .regex(/^[+0-9 ()-]+$/, 'Enter a valid phone number'),
    }),
    shippingAddress: addressSchema,
    deliveryMethod: z.string().trim().min(2).max(40),
    paymentMethod: z.enum(['cod', 'chapa']),
    couponCode: z.string().trim().max(40).optional().nullable(),
    customerNote: z.string().trim().max(500).optional().nullable(),
    saveAddress: z.boolean().optional().default(false),
    acceptTerms: z.boolean().refine((value) => value === true, 'Accept the terms to place your order'),
  })
  .superRefine((value, ctx) => {
    if (value.deliveryMethod === 'pickup') return;
    const address = value.shippingAddress;
    if (address.fullName.trim().length < 2) {
      ctx.addIssue({ code: 'custom', path: ['shippingAddress', 'fullName'], message: 'Enter the recipient name' });
    }
    if (address.phone.trim().length < 7) {
      ctx.addIssue({ code: 'custom', path: ['shippingAddress', 'phone'], message: 'Enter a delivery phone number' });
    }
    if (address.line1.trim().length < 3) {
      ctx.addIssue({ code: 'custom', path: ['shippingAddress', 'line1'], message: 'Enter the street address' });
    }
    if (address.city.trim().length < 2) {
      ctx.addIssue({ code: 'custom', path: ['shippingAddress', 'city'], message: 'Enter the city' });
    }
  });

router.get(
  '/checkout',
  requireAuth,
  asyncRoute(async (req, res) => {
    const user = req.auth!;
    const db = await getDatabase();
    const cart = await findActiveCart(db, { profileId: user.id, guestToken: null });
    const [view, addresses, methods, threshold, store] = await Promise.all([
      buildCartView(db, cart, user.email),
      db.query<{
        id: string;
        label: string;
        full_name: string;
        phone: string;
        line1: string;
        line2: string | null;
        city: string;
        region: string;
        postal_code: string | null;
        country: string;
        is_default: boolean;
      }>(
        `select id, label, full_name, phone, line1, line2, city, region, postal_code, country, is_default
           from addresses where profile_id = $1
          order by is_default desc, created_at desc`,
        [user.id],
      ),
      getDeliveryMethods(db),
      getFreeShippingThreshold(db),
      getSetting(db, 'store', {
        name: 'Nile Mart',
        address: 'Bole Road, Addis Ababa, Ethiopia',
        phone: '+251 911 000 000',
      }),
    ]);

    res.json({
      cart: view,
      addresses: addresses.rows.map((address) => ({
        id: address.id,
        label: address.label,
        fullName: address.full_name,
        phone: address.phone,
        line1: address.line1,
        line2: address.line2,
        city: address.city,
        region: address.region,
        postalCode: address.postal_code,
        country: address.country,
        isDefault: address.is_default,
      })),
      deliveryMethods: methods
        .filter((method) => method.enabled)
        .map((method) => ({
          ...method,
          effectiveFee: method.id === 'pickup' || view.total >= threshold ? 0 : method.fee,
        })),
      freeShippingThreshold: threshold,
      paymentOptions: getPaymentOptions(),
      contact: { fullName: user.fullName, email: user.email, phone: user.phone ?? '' },
      store,
      emailVerified: user.emailVerified,
    });
  }),
);

router.post(
  '/checkout',
  requireAuth,
  checkoutLimiter,
  asyncRoute(async (req, res) => {
    const user = req.auth!;
    const body = parse(checkoutSchema, req.body);
    const method = getPaymentOptions().find((option) => option.id === body.paymentMethod);
    if (!method || !method.implemented) {
      throw unprocessable('That payment method is not available for this store.');
    }
    if (!method.available) {
      if (body.paymentMethod === 'chapa') {
        throw new AppError(
          503,
          'payment_not_configured',
          method.note ?? 'Online payment is not configured yet.',
        );
      }
      throw unprocessable(method.note ?? 'That payment method is not available.');
    }

    const headerKey = req.get('idempotency-key');
    const idempotencyKey =
      headerKey && /^[A-Za-z0-9._:-]{8,120}$/.test(headerKey) ? headerKey : randomToken(18);

    const db = await getDatabase();
    const input: PlaceOrderInput = {
      contact: body.contact,
      shippingAddress: {
        fullName: body.shippingAddress.fullName || body.contact.fullName,
        phone: body.shippingAddress.phone || body.contact.phone,
        line1: body.shippingAddress.line1,
        line2: body.shippingAddress.line2,
        city: body.shippingAddress.city,
        region: body.shippingAddress.region,
        postalCode: body.shippingAddress.postalCode,
        country: body.shippingAddress.country || 'ET',
      },
      deliveryMethod: body.deliveryMethod,
      paymentMethod: body.paymentMethod,
      couponCode: body.couponCode,
      customerNote: body.customerNote,
      saveAddress: body.saveAddress,
    };

    const placed = await placeOrder(db, user, input, idempotencyKey);
    res.setHeader('Idempotency-Key', idempotencyKey);

    let payment: Awaited<ReturnType<typeof startChapaPayment>> | null = null;
    let paymentError: { code: string; message: string } | null = null;

    if (!placed.replayed) {
      const detail = await getOrderDetail(db, placed.orderId).catch((error) => {
        logger.warn('Could not load order for confirmation email', {
          orderId: placed.orderId,
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      });
      if (detail) {
        await sendEmail(
          db,
          orderPlacedEmail({
            to: detail.email,
            name: detail.customerName,
            orderNumber: detail.orderNumber,
            items: detail.items,
            subtotal: detail.subtotal,
            discount: detail.discount,
            shippingFee: detail.shippingFee,
            total: detail.total,
            deliveryLabel: detail.deliveryLabel,
            paymentMethod: detail.paymentMethod,
            orderUrl: `${req.protocol}://${req.get('host')}/account/orders/${detail.id}`,
          }),
        ).catch((error) => logger.warn('Order email could not be queued', { error: String(error) }));
      }
    }

    if (placed.paymentMethod === 'chapa' && !placed.replayed) {
      try {
        payment = await startChapaPayment(db, { orderId: placed.orderId, profileId: user.id });
      } catch (error) {
        paymentError =
          error instanceof AppError
            ? { code: error.code, message: error.message }
            : { code: 'payment_provider_error', message: 'Online payment could not be started. You can retry from your order page.' };
        logger.warn('Chapa payment could not be started during checkout', {
          orderId: placed.orderId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    res.status(placed.replayed ? 200 : 201).json({
      order: placed,
      payment,
      paymentError,
    });
  }),
);

export default router;
