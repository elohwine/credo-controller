# WhatsApp Commerce Setup Guide

This guide explains how to configure and test the WhatsApp commerce flow for Credentis.

## Transactional notification delivery (October 2026)

The implemented delivery rail is the existing `integration_outbox` +
`NotificationService`, not a campaign engine. Migration **124** adds leases,
retry scheduling, recipient preferences, sender bindings and delivery evidence.
The API server drains on startup and every 15 seconds. Stage cards and their
outbox event normally commit together; a local enqueue failure preserves the
actor card and the periodic sweeper recovers its persisted intent marker.
An external notification never approves,
completes or replaces a wallet task. Existing `wallet.vc.offered` events fan out
to consented task/offer WhatsApp intent as well as a deduplicated Android outbox
intent. Android provider outcomes retain the existing push adapter's limitations;
the WhatsApp delivery state machine does not claim Android delivery evidence.

**Live acceptance is not established by unit tests or this guide.** No live
messages were sent during implementation. Each sender needs real Meta access,
an approved utility template, a recorded recipient opt-in, and explicit operator
test approval. Do not use the historical commerce diagram or mocked provider
tests as evidence that the complete commerce journey works.

### Credentis platform setup (Cloud API, Graph v26.0)

For Meta App Settings -> Basic -> Privacy Policy URL, use
`https://credentis.fly.dev/privacy-policy`. This public HTML page needs no login;
`/privacy` serves the same policy. Privacy and account-deletion requests go to
`elowine@outlook.com`. Review the published policy when data handling changes.

Graph calls use `v26.0` by default; override with `WHATSAPP_GRAPH_VERSION`
(must look like `vNN.N`, invalid values fall back to the default).

1. **System User token** — Meta Business Settings → Users → System users → create
   an admin system user, assign the WhatsApp app and the WABA (full control), and
   generate a permanent token with `whatsapp_business_messaging` and
   `whatsapp_business_management`.
2. **Secrets** (never in `fly.toml`/git):
   `fly secrets set WABA_TOKEN=... WHATSAPP_APP_SECRET=<app secret> WHATSAPP_VERIFY_TOKEN=<random> -a credentis`.
   Non-secret values (`WABA_PHONE_NUMBER_ID`, `WABA_BUSINESS_ACCOUNT_ID`,
   `WALLET_PUBLIC_URL`, `WHATSAPP_DELIVERY_ENABLED`, `WHATSAPP_TEST_RECIPIENTS`)
   live in `fly.toml` `[env]`.
3. **Template** — `WABA_TOKEN=... WABA_BUSINESS_ACCOUNT_ID=... node scripts/whatsapp-template.js`
   submits the UTILITY template `credentis_inbox_update` (en_US, `{{1}}` notice,
   `{{2}}` inbox URL). Re-run with `--check` until it reports `APPROVED`. If Meta
   recategorises it as MARKETING it will be refused at dispatch; edit and resubmit.
4. **Webhook** — App dashboard → WhatsApp → Configuration: callback
   `https://credentis.fly.dev/wa/webhook`, verify token = `WHATSAPP_VERIFY_TOKEN`,
   subscribe the `messages` field.
5. **Turn on** — portal *WhatsApp alerts* (`/organization/whatsapp`) or mobile
   *Settings → Organization → WhatsApp alerts*. "Turn on" saves platform mode for
   all five events and calls validate, which checks phone membership, template
   approval **and subscribes the WABA to the app** (`POST /{waba}/subscribed_apps`)
   so status callbacks and STOP replies arrive.
   `GET /organizations/{tenantId}/notifications/whatsapp/readiness` (admin) reports
   which pieces are missing without exposing secrets.
6. **Opt in + test** — each person enables their own alerts with their registered
   phone, then an admin presses *Send me a test message* and watches deliveries.

**Inbox links:** `{{2}}` is `${WALLET_PUBLIC_URL}/inbox?item|request=...`. The API
serves `/inbox` as a small landing page with an *Open in Credentis* button
(`credentis://inbox?...`, Android `intent://`), and
`/.well-known/assetlinks.json` (from `ANDROID_APP_PACKAGE` +
`ANDROID_APP_CERT_SHA256`) so the Android app can claim `https://credentis.fly.dev/inbox`
as a verified App Link once installed.

### Select and validate a sender

An organization owner/admin uses their **organization-scoped JWT**:

- `GET/PUT /organizations/{tenantId}/notifications/whatsapp`
- `POST /organizations/{tenantId}/notifications/whatsapp/validate`
- `POST /organizations/{tenantId}/notifications/whatsapp/test` with
  `{"eventType":"task","requestId":"unique-consented-test-1"}` queues only the
  authenticated administrator's own recorded opted-in phone. It does not create
  consent or bypass the operator's test-recipient allowlist. Reuse the request ID
  to avoid a duplicate test. Watch `deliveries` for actual acceptance/status.
- `GET /organizations/{tenantId}/notifications/deliveries` — safe status projection
- `GET /organizations/{tenantId}/notifications/dispatch` — attempts/outbox failures

Example selection:

```json
{
  "mode": "platform",
  "enabled": true,
  "templates": {
    "task": { "name": "credentis_inbox_update", "language": "en_US" },
    "vc_offer": { "name": "credentis_inbox_update", "language": "en_US" }
  }
}
```

`mode` is explicitly `platform` or `tenant`; there is **no fallback**. Tenant
mode additionally requires `phoneNumberId` and `wabaId`. Settings reuse
`ProviderRepository` (`whatsapp-business`, config `whatsapp:{tenantId}`).
Disabling that config/provider revokes subsequent dispatch. Sender validation
checks Meta's WABA phone membership, approved templates and unique phone binding.

Credentials use the established deployment environment-secret mechanism; the
existing generic provider config is not a secure token vault. **Never put access
tokens/app secrets in `provider_configs`, request bodies, logs or committed `.env`
files.** This implementation does not introduce a Vault/HSM integration.

Platform secrets/configuration:

```bash
WABA_PHONE_NUMBER_ID=...
WABA_BUSINESS_ACCOUNT_ID=...
WABA_TOKEN=...
WHATSAPP_APP_SECRET=...
WHATSAPP_VERIFY_TOKEN=...
WALLET_PUBLIC_URL=https://your-wallet.example
WHATSAPP_DELIVERY_ENABLED=true
WHATSAPP_TEST_RECIPIENTS=263771234567
# Leave unset for test-only delivery. Production requires separate operator approval:
# WHATSAPP_PRODUCTION_ENABLED=true
```

Tenant credentials are independently provisioned by the operator, under
`WHATSAPP_TENANT_<UPPERCASE_SHA256_OF_EXACT_TENANT_ID>_TOKEN` and the matching
`_APP_SECRET`. `tenantWhatsAppSecretPrefix(tenantId)` returns that prefix.
Tenant administrators cannot choose another tenant's secret reference.
Use the deployment's secret manager to inject these environment values.
Rotate/revoke at the provider and update the corresponding environment secret;
reload workers before restoring delivery. Revalidate after changing phone/WABA.

All business sends use **sender-specific APPROVED UTILITY templates**, including
inside the customer-service window (no free-form fallback). The template BODY
must accept two text parameters: a minimal inbox-update notice and the HTTPS
wallet `/inbox` URL. Do not add other required components/placeholders. Template
approval is checked against the selected WABA at dispatch, not trusted from an
administrator's JSON. Messages exclude credential offers, proof URLs, financial
details and authentication tokens. Inbox authentication and existing actor
checks still control action. Where a task's persisted source resolves to a
request in that organization, `/inbox?request={id}` uses the existing
request-specific inbox selection. Other source families safely open `/inbox`;
not every domain item has an existing item-specific link contract yet.

### Record consent and preferences

The **recipient's own authenticated JWT** can:

- `PUT /organizations/{tenantId}/notifications/preferences` with
  `{"phone":"+263771234567","eventType":"task","enabled":true}`.
- `GET` the same URL to read their preferences.

Supported events: `task`, `vc_offer`, `payment_link`, `proof_request`, `remittance`.
The **invite, staff card or record** switch (`vc_offer`) covers team/employee
cards, contact wallet-link invitations and every credential type delivered to
the wallet inbox, including direct issues, workflow records and receipts.
The **workflow step** switch (`task`) covers stage actors/delegates, requisition
steps, workflow request approvals and AP/AR action assignments.

Migration **130** atomically records a `wallet.inbox.whatsapp` outbox intent for
every newly inserted inbox card with an issuer, even if its producer does not
publish `wallet.vc.offered`. Both paths deduplicate against the same inbox item;
renewed staff cards and different credential types remain distinct. Existing
direct contact/payment/proof sends retain their shared deduplication keys.
This migration does not backfill old inbox cards or change Android delivery.
Team invite WhatsApp alerts come from the staff inbox card, not a second
unscoped free-text send. Contact wallet-link invitations use the same
consented `vc_offer` delivery rail; their claim tokens are never sent on WhatsApp.

Each preference applies only to WhatsApp for that organization and event.
A person can also record **"any organisation"** switches under their own wallet
tenant (mobile *Settings → WhatsApp alerts*). These apply to organizations sending
from the shared platform number when the person has no switch for that
organization, so an invite from an organization they have not joined yet still
reaches them. An organization switch (on or off) always wins, tenant-owned
numbers never use the personal switch, and a platform STOP turns them off too.
The phone must hash to the signed-in person's registered account phone.
There is no automatic subscription from membership, checkout, an inbound greeting,
or sender selection. Disable a preference to opt out; signed `STOP`,
`UNSUBSCRIBE`, or `CANCEL` messages disable all that sender's matching preferences.
A platform STOP applies to organizations selecting that shared platform sender.
An opt-out is rechecked immediately before the send POST. Re-opt-in requires the
authenticated preferences API; no inbound message silently grants consent.
External contacts without a verified platform phone cannot be opted in by admins.

### Signed callbacks and failure handling

The actual callback is **`/wa/webhook`** (GET challenge and POST events). Configure
Meta's `messages` subscription; status events arrive there too.
POST requires `X-Hub-Signature-256` over the **unaltered raw request bytes**.
Configure reverse proxies not to rewrite the JSON or strip this header.
Each phone/WABA binding resolves its own app secret. All entries, statuses and
messages are processed; callbacks are deduplicated and stale statuses cannot
overwrite delivered/read evidence. Unknown senders/signatures are rejected.

`queued` is not `accepted`; only a provider message ID proves acceptance.
`sent`, `delivered`, `read` require signed provider evidence. Reminder timestamps
are updated only after an accepted result (a later scheduler pass can observe
the persisted WhatsApp acceptance). Remittance responses return real channel
outcomes rather than equating a contact address with successful notification.
Email/SMS remain the existing immediate channels; durable retries here apply to
WhatsApp and registered outbox handlers, not an invented delivery guarantee for
all transports.

Retryable known rejections (e.g. HTTP 429) use five bounded attempts and exponential
backoff. Permanent invalid sender/template/auth failures remain visible.
Timeout/5xx after the POST, or a crashed `sending` intent, becomes **uncertain**:
do not blindly resend. A signed status with `biz_opaque_callback_data` reconciles
the original intent/provider message ID. Without that callback, an operator must
reconcile against Meta before deliberately creating a new notification event.
Expired legacy non-idempotent handler leases are also uncertain, not replayed.
There is no exactly-once external delivery promise. Unknown topics fail explicitly.
Recipient/task state remains authoritative throughout.

Preferences/delivery rows contain recipient phone numbers: restrict DB access,
back them up with the persistence database, and apply your retention policy.
Never expose payloads or raw Axios errors from administrative status views.
Broadcast marketing/campaigns and approval-by-WhatsApp are deliberately absent.

Focused verification:

```bash
yarn test --runInBand src/services/__tests__/TransactionalNotifications.spec.ts \
  src/services/__tests__/BusinessTransactionService.spec.ts
yarn check-types
yarn tsoa && node scripts/patch-swagger.js
```

## Overview

The WhatsApp commerce flow:

```
Catalog → Cart → (Optional QuoteVC) → EcoCash Payment → ReceiptVC → Delivery Verification
```

## Required Environment Variables

Add these to your `.env` file:

```bash
# ============================================
# WHATSAPP BUSINESS API (Meta Cloud API)
# ============================================
# Get these from https://developers.facebook.com
WABA_PHONE_NUMBER_ID=your-phone-number-id
WABA_TOKEN=your-access-token
WABA_NUMBER=+263771234567  # Your WhatsApp Business number

# ============================================
# ECOCASH PAYMENT GATEWAY
# ============================================
ECOCASH_API_KEY=your-api-key
ECOCASH_MERCHANT_NUMBER=your-merchant-number
ECOCASH_WEBHOOK_SECRET=your-webhook-secret
ECOCASH_SANDBOX=true  # Set to false for production

# ============================================
# WEBHOOK URLs (for external callbacks)
# ============================================
# Use ngrok for local development: ngrok http 3000
NGROK_URL=https://your-subdomain.ngrok.io

# ============================================
# API BASE URL
# ============================================
API_BASE_URL=http://localhost:3000
```

## Getting WhatsApp Business API Credentials

### Step 1: Create Meta Developer Account

1. Go to https://developers.facebook.com
2. Create a developer account if you don't have one
3. Create a new "Business" type app

### Step 2: Add WhatsApp Product

1. In your app dashboard, click "Add Product"
2. Select "WhatsApp" and click "Set Up"
3. Follow the guided setup

### Step 3: Get Your Credentials

1. **Phone Number ID**: Found in WhatsApp > API Setup
2. **Access Token**: Generate a permanent token or use the temporary one for testing
3. **Business Number**: The phone number registered with your WhatsApp Business Account

### Step 4: Configure Webhooks

1. In WhatsApp > Configuration
2. Set callback URL to: `{NGROK_URL}/wa/webhook`
3. Set verify token to the server's `WHATSAPP_VERIFY_TOKEN` secret (no default)
4. Subscribe to `messages` and validate the selected sender as described above

## Getting EcoCash API Credentials

### For Testing (Sandbox)

Contact EcoCash developer relations or use:

- Sandbox portal: https://sandbox.ecocash.co.zw (if available)
- Test credentials are often provided upon registration

### For Production

1. Register as an EcoCash merchant
2. Complete KYC/business verification
3. Receive production API credentials

## Local Testing WITHOUT WhatsApp

You can test the entire flow locally without WhatsApp using direct API calls:

### Option 1: Use the Test Script

```bash
chmod +x scripts/test-wa-flow.sh
./scripts/test-wa-flow.sh
```

### Option 2: Manual cURL Testing

```bash
# 1. Create a catalog item
curl -X POST http://localhost:3000/api/catalog/items \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Product",
    "price": 10.00,
    "currency": "USD",
    "description": "Test item"
  }'
# Returns: { "id": "item-123", "waLink": "https://wa.me/c/..." }

# 2. Create a cart from WhatsApp payload (simulated)
curl -X POST http://localhost:3000/api/wa/cart/create \
  -H "Content-Type: application/json" \
  -d '{
    "customerPhone": "+263771234567",
    "customerName": "Test Customer",
    "items": [
      { "catalogItemId": "item-123", "quantity": 2 }
    ]
  }'
# Returns: { "cartId": "cart-456", ... }

# 3. (OPTIONAL) Issue a QuoteVC for wallet users
curl -X POST http://localhost:3000/api/wa/cart/cart-456/issue-quote \
  -H "Content-Type: application/json"

# 4. Checkout (initiates EcoCash payment)
curl -X POST http://localhost:3000/api/wa/cart/cart-456/checkout \
  -H "Content-Type: application/json" \
  -d '{ "paymentMethod": "ecocash" }'
# Returns: { "invoiceId": "inv-789", "paymentRef": "EC123...", "status": "PENDING" }

# 5. Simulate EcoCash webhook (payment success)
curl -X POST http://localhost:3000/webhooks/ecocash \
  -H "Content-Type: application/json" \
  -H "X-EcoCash-Signature: test-signature" \
  -d '{
    "transactionId": "EC123456",
    "status": "SUCCESS",
    "amount": 20.00,
    "currency": "USD",
    "sourceReference": "inv-789",
    "timestamp": "2024-01-15T10:30:00Z"
  }'

# 6. Verify receipt (as delivery personnel would)
curl http://localhost:3000/api/receipts/verify/EC123456
```

## Testing the Verification UI

1. Start the portal:

```bash
cd credo-ui/portal
npm run dev
```

2. Open in browser: http://localhost:3001/verify/receipt

3. Enter a transaction ID to verify, or scan a QR code

## Ngrok Setup for Webhooks

For WhatsApp and EcoCash to send webhooks to your local server:

```bash
# Install ngrok
npm install -g ngrok

# Start tunnel
ngrok http 3000

# Copy the https URL (e.g., https://abc123.ngrok.io)
# Add to .env as NGROK_URL
```

Then configure:

- WhatsApp webhook URL: `{NGROK_URL}/wa/webhook`
- EcoCash webhook URL: `{NGROK_URL}/webhooks/ecocash`

## Flow Diagram

```
┌─────────────┐    wa.me link    ┌──────────────┐
│   Catalog   │ ───────────────> │   Customer   │
│   Item      │                  │   WhatsApp   │
└─────────────┘                  └──────┬───────┘
                                        │
                                        v
┌─────────────┐                  ┌──────────────┐
│   Create    │ <─── add items ─ │   wa.me      │
│   Cart      │                  │   payload    │
└──────┬──────┘                  └──────────────┘
       │
       v
┌─────────────┐    (optional)    ┌──────────────┐
│  Present    │ ───────────────> │   QuoteVC    │
│  Options    │                  │   (wallet)   │
└──────┬──────┘                  └──────────────┘
       │
       v
┌─────────────┐    EcoCash       ┌──────────────┐
│  Checkout   │ ───────────────> │   Payment    │
│  + Invoice  │                  │   Gateway    │
└──────┬──────┘                  └──────┬───────┘
       │                                │
       │                                v
       │                         ┌──────────────┐
       │ <─── webhook ────────── │   Success    │
       │                         │   Callback   │
       v                         └──────────────┘
┌─────────────┐
│  Issue      │
│  ReceiptVC  │
└──────┬──────┘
       │
       v
┌─────────────┐    scan/lookup   ┌──────────────┐
│  Delivery   │ <─────────────── │   Delivery   │
│  Verify     │                  │   Personnel  │
└─────────────┘                  └──────────────┘
```

## Troubleshooting

### WhatsApp messages not sending

- Check `WABA_TOKEN` is valid (tokens expire)
- Verify `WABA_PHONE_NUMBER_ID` is correct
- Ensure recipient phone number is in E.164 format (+263...)
- Check WhatsApp template approval status

### EcoCash webhooks not received

- Verify ngrok is running and URL is correct
- Check webhook secret matches configuration
- Look at ngrok dashboard for incoming requests

### Payment stuck in PENDING

- EcoCash sandbox may require manual approval
- Check for webhook delivery failures
- Verify `sourceReference` matches across calls

## API Endpoints Summary

| Method | Endpoint                           | Description              |
| ------ | ---------------------------------- | ------------------------ |
| POST   | `/api/catalog/items`               | Create catalog item      |
| GET    | `/api/catalog/items/:id/link`      | Get wa.me link           |
| POST   | `/api/wa/cart/create`              | Create cart from payload |
| GET    | `/api/wa/cart/:id`                 | Get cart details         |
| POST   | `/api/wa/cart/:id/items`           | Add items to cart        |
| POST   | `/api/wa/cart/:id/present-options` | Send in-chat options     |
| POST   | `/api/wa/cart/:id/issue-quote`     | Issue QuoteVC (optional) |
| POST   | `/api/wa/cart/:id/checkout`        | Initiate payment         |
| POST   | `/api/wa/cart/:id/send-receipt`    | Send ReceiptVC           |
| POST   | `/webhooks/ecocash`                | EcoCash payment webhook  |
| GET    | `/api/receipts/verify/:txId`       | Verify receipt           |
| POST   | `/api/receipts/confirm-delivery`   | Confirm delivery         |
