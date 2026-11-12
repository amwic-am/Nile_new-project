import { Router } from 'express';
import { config } from '../config.js';
import { getDatabase } from '../db/index.js';
import { paymentReceivedEmail } from '../lib/emails.js';
import { logger } from '../lib/logger.js';
import { sendEmail } from '../lib/mailer.js';
import { asyncRoute } from '../lib/request.js';
import { webhookLimiter } from '../middleware/security.js';
import { getOrderDetail } from '../services/orders.js';
import {
  finalizeChapaPayment,
  markChapaPaymentFailed,
  markWebhookProcessed,
  recordWebhookEvent,
  verifyChapaTransaction,
  verifyChapaWebhookSignature,
} from '../services/payments.js';

const router = Router();

function extractTxRef(payload: Record<string, unknown>): string {
  const nested = payload.data && typeof payload.data === 'object' ? (payload.data as Record<string, unknown>) : {};
  return String(payload.tx_ref ?? nested.tx_ref ?? payload.reference ?? '').trim();
}

router.post(
  '/chapa',
  webhookLimiter,
  asyncRoute(async (req, res) => {
    if (!config.chapa.webhookSecret) {
      res.status(503).json({
        error: {
          code: 'webhook_not_configured',
          message: 'The Chapa webhook secret is not configured. Webhooks are not processed.',
        },
      });
      return;
    }

    const raw = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {}));

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(raw.toString('utf8')) as Record<string, unknown>;
    } catch {
      res.status(400).json({ error: { code: 'invalid_json', message: 'Webhook body is not valid JSON' } });
      return;
    }

    const signature =
      req.get('chapa-signature') ?? req.get('x-chapa-signature') ?? req.get('x-webhook-signature') ?? null;
    const validSignature = verifyChapaWebhookSignature(raw, signature);
    const txRef = extractTxRef(payload);
    const providerStatus = String(payload.status ?? (payload.data as Record<string, unknown> | undefined)?.status ?? '');
    const eventId = String(
      payload.event_id ?? payload.id ?? `${txRef || 'unknown'}:${providerStatus || 'unknown'}`,
    );

    const db = await getDatabase();
    const recorded = await recordWebhookEvent(db, {
      provider: 'chapa',
      eventId,
      payload,
      signatureValid: validSignature,
      error: validSignature ? null : 'Invalid webhook signature',
    });

    if (!validSignature) {
      res.status(401).json({ error: { code: 'invalid_signature', message: 'Invalid webhook signature' } });
      return;
    }
    if (recorded.duplicate && recorded.processed) {
      res.json({ received: true, duplicate: true });
      return;
    }
    if (!txRef) {
      await markWebhookProcessed(db, { eventId, error: 'Missing transaction reference' });
      res.json({ received: true, ignored: true });
      return;
    }

    try {
      const verified = await verifyChapaTransaction(txRef);
      if (verified.status === 'successful') {
        const finalized = await finalizeChapaPayment(db, {
          reference: txRef,
          verifiedAmount: verified.amount,
          verifiedCurrency: verified.currency,
          raw: verified.raw,
        });
        if (finalized.paymentStatus === 'paid') {
          const detail = await getOrderDetail(db, finalized.orderId).catch(() => null);
          if (detail) {
            await sendEmail(
              db,
              paymentReceivedEmail({
                to: detail.email,
                name: detail.customerName,
                orderNumber: detail.orderNumber,
                total: detail.total,
                orderUrl: `${config.appUrl}/account/orders/${detail.id}`,
              }),
            ).catch((error) => logger.warn('Payment email could not be queued', { error: String(error) }));
          }
        }
        await markWebhookProcessed(db, { eventId });
      } else if (verified.status === 'failed') {
        await markChapaPaymentFailed(db, {
          reference: txRef,
          reason: 'The provider reported that the payment failed.',
        });
        await markWebhookProcessed(db, { eventId });
      } else {
        await markWebhookProcessed(db, { eventId, error: 'Provider still reports the payment as pending' });
      }
      res.json({ received: true });
    } catch (error) {
      logger.error('Chapa webhook processing failed', {
        eventId,
        error: error instanceof Error ? error.message : String(error),
      });
      await markWebhookProcessed(db, {
        eventId,
        error: error instanceof Error ? error.message.slice(0, 500) : 'Webhook processing failed',
      });
      res.status(500).json({
        error: { code: 'webhook_processing_failed', message: 'Webhook could not be processed' },
      });
    }
  }),
);

export default router;
