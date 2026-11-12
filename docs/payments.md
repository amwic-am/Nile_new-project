# Payments

Nile Mart charges prices in ETB and stores money as integer santim (1 ETB = 100
santim). Every payment flow in this repository follows the same rules:

- Card numbers, CVVs and mobile-money PINs never reach the Nile Mart server or
  database. Only the selected provider, its reference, its status and its
  response are stored.
- An order becomes `paid` only after the server verifies the transaction with
  the provider, the verified amount matches the order total exactly, and the
  verified currency is ETB.
- Returning to the success page never marks an order paid. The success page and
  the payment callback page both ask the API to verify the reference.
- Every online order reserves stock when it is placed. Reserved stock is
  committed when payment is verified, and released when an order is cancelled
  or its reservation expires (`expireStaleReservations`, swept every 5 minutes).
- Webhooks are verified with an HMAC-SHA256 signature over the raw body; invalid
  signatures are stored and rejected. Processed event ids are recorded in
  `payment_webhook_events`, so retries are idempotent.

## Provider status

| Method | State | Notes |
| --- | --- | --- |
| Cash on delivery | Implemented and enabled | Order is `confirmed`, payment is `unpaid` until the courier collects cash. Stock is reserved, not deducted, until fulfilment. |
| Chapa | Implemented, **not activated in this environment** | Sandbox/live keys are not configured. Checkout shows “Not activated” and the API returns `503 payment_not_configured`. Do not claim this gateway is connected until a sandbox transaction has been completed end to end. |
| Telebirr | Configured-only | No adapter. Checkout keeps it disabled. |
| M-PESA | Configured-only | No adapter. Checkout keeps it disabled. |
| International card | Configured-only | No adapter. Cards can be routed through Chapa once the merchant account supports them. |
| PayPal | Configured-only | Depends on Ethiopian merchant eligibility. |
| EPS | Configured-only | Requires merchant onboarding through a participating bank. |

Adding credentials for a configured-only provider does not enable it. The
`available` flag in `getPaymentOptions()` stays `false` until an adapter is
implemented and tested.

## Configuring Chapa

1. Create a Chapa merchant account and complete the business verification (KYC)
   required for ETB settlement.
2. In the Chapa dashboard, open **Settings → API keys** and copy the secret key.
   Sandbox and live keys are different; start with sandbox.
3. In **Settings → Webhooks**, register a public HTTPS endpoint:
   `https://<your-api-domain>/api/webhooks/chapa` and copy the webhook secret.
4. Set the following variables in `.env` (never commit them, never expose them to
   the browser):

   ```dotenv
   APP_URL=https://shop.example.com
   API_URL=https://api.shop.example.com
   CHAPA_SECRET_KEY=CHASECK_TEST-...
   CHAPA_WEBHOOK_SECRET=...
   CHAPA_BASE_URL=https://api.chapa.co/v1
   ```

   `APP_URL` is used for the browser return URL
   (`/checkout/payment/callback?reference=...`). `API_URL` must be reachable by
   Chapa over HTTPS, because it is sent as the `callback_url`.
5. Restart the API. Checkout will now show Chapa as available. If the keys are
   wrong, the API reports `payment_provider_error` rather than pretending the
   payment succeeded.

### Local webhook testing

Chapa cannot reach `http://localhost`. Use an HTTPS tunnel (for example
`cloudflared tunnel --url http://localhost:4000`) and set `API_URL` to the
tunnel origin while testing. Signature verification is mandatory: a webhook
with a missing or mismatched signature receives `401` and is recorded with
`signature_valid = false`.

### Sandbox acceptance test

Run this before switching to live keys:

1. Add a product to the cart and check out with Chapa. You should be redirected
   to Chapa's hosted page with the correct ETB amount and the order should be
   `awaiting_payment`.
2. Complete the payment with a sandbox test card/mobile wallet.
3. Confirm the order becomes `paid`, the confirmation page shows the payment
   reference, stock reservations are committed, and a `payment_received`
   notification and email are created.
4. Open `/account/orders/<id>` directly without completing payment and confirm
   the order stays unpaid.
5. Replay a successful webhook call. The duplicate event id must be ignored and
   the order must not be paid twice.
6. Send a webhook with an invalid signature. It must be rejected with `401`.
7. Simulate a late payment for a cancelled order. The payment is recorded as
   successful and a `refunds` row with status `pending` is created; the order is
   never resurrected.
8. Refund the sandbox transaction from the Chapa dashboard and record the refund
   in the admin workflow.

Only after all of the above pass should `CHAPA_SECRET_KEY` hold a live key.

## Merchant onboarding checklist (Ethiopia)

- [ ] Business licence, TIN and trade registration available for the gateway KYC.
- [ ] Settlement bank account in the business name.
- [ ] Public HTTPS domain, valid TLS certificate and a stable webhook URL.
- [ ] Privacy policy, terms of service, shipping and returns pages live; these
      are required by most Ethiopian gateways and card networks.
- [ ] Refund and chargeback handling process documented, with a named owner.
- [ ] Order notification mailbox monitored (`ORDER_NOTIFICATION_EMAIL`).
- [ ] Transactional email configured (`SMTP_*`); without it, receipts are stored
      in `email_outbox` and only logged.
- [ ] Reconciliation process: match Chapa settlement reports with `payments` and
      `refunds` rows by provider reference.
- [ ] Telebirr / M-PESA merchant approvals started separately if those methods
      are promised to customers.
- [ ] `REQUIRE_VERIFIED_EMAIL=true` for production so guest email typos cannot
      create unreachable orders.

## Operational notes

- A failed online payment keeps the order in `awaiting_payment` with
  `payment_status = failed`; the customer can retry from the order page, which
  creates a fresh payment reference and cancels any pending one.
- Unpaid Chapa orders expire after `RESERVATION_MINUTES` and are cancelled by the
  reservation sweep, releasing stock.
- Cash-on-delivery orders reserve stock for seven days. Marking the order paid
  at delivery is an admin fulfilment action.
- Never mark an order paid manually without matching evidence from the provider
  settlement report.
