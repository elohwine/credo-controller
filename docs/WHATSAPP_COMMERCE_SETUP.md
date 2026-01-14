# WhatsApp Commerce Setup Guide

This guide explains how to configure and test the WhatsApp commerce flow for Credentis.

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
2. Set callback URL to: `{NGROK_URL}/webhooks/whatsapp`
3. Set verify token (any string you choose)
4. Subscribe to: `messages`, `messaging_postbacks`

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
- WhatsApp webhook URL: `{NGROK_URL}/webhooks/whatsapp`
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

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/catalog/items` | Create catalog item |
| GET | `/api/catalog/items/:id/link` | Get wa.me link |
| POST | `/api/wa/cart/create` | Create cart from payload |
| GET | `/api/wa/cart/:id` | Get cart details |
| POST | `/api/wa/cart/:id/items` | Add items to cart |
| POST | `/api/wa/cart/:id/present-options` | Send in-chat options |
| POST | `/api/wa/cart/:id/issue-quote` | Issue QuoteVC (optional) |
| POST | `/api/wa/cart/:id/checkout` | Initiate payment |
| POST | `/api/wa/cart/:id/send-receipt` | Send ReceiptVC |
| POST | `/webhooks/ecocash` | EcoCash payment webhook |
| GET | `/api/receipts/verify/:txId` | Verify receipt |
| POST | `/api/receipts/confirm-delivery` | Confirm delivery |
