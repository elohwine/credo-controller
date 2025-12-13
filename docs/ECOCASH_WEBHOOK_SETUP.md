# EcoCash Webhook Setup Guide

## Prerequisites
1. **Ngrok Account**: Sign up at https://ngrok.com
2. **Ngrok Installed**: Already installed at `/snap/bin/ngrok`
3. **Credo Server Running**: `yarn dev` on port 3000

## Quick Setup

### 1. Get Your Ngrok Auth Token
```bash
# Visit: https://dashboard.ngrok.com/get-started/your-authtoken
# Copy your authtoken

# Configure ngrok
ngrok config add-authtoken YOUR_AUTH_TOKEN_HERE
```

### 2. Start Ngrok Tunnel
```bash
# Option A: Use the setup script (recommended)
./scripts/setup-webhook-tunnel.sh

# Option B: Start manually
ngrok http 3000
```

### 3. Copy the HTTPS URL
When ngrok starts, you'll see output like:
```
Forwarding  https://abc123.ngrok.io -> http://localhost:3000
```

**Copy the HTTPS URL** (e.g., `https://abc123.ngrok.io`)

### 4. Set Environment Variable
```bash
# Add to .env file
echo "NGROK_URL=https://abc123.ngrok.io" >> .env

# Or export in terminal
export NGROK_URL=https://abc123.ngrok.io
```

### 5. Restart Credo Server
```bash
# Stop current server (Ctrl+C)
# Restart
yarn dev
```

## Configure EcoCash Dashboard

### For Sandbox Testing
1. Log in to EcoCash Developer Portal
2. Navigate to **Webhooks** or **Callback URLs**
3. Add webhook URL: `https://YOUR-NGROK-URL/webhooks/ecocash`
4. Set webhook secret: `test-webhook-secret` (or update `ECOCASH_WEBHOOK_SECRET` in .env)

### Webhook URL Format
```
https://abc123.ngrok.io/webhooks/ecocash
```

## Testing the Webhook

### 1. Monitor Ngrok Traffic
Open ngrok web interface: http://localhost:4040

This shows all HTTP requests to your tunnel in real-time.

### 2. Run E2E Test
```bash
npx ts-node tests/test_ecocash_e2e.ts
```

### 3. Simulate Webhook Manually
```bash
curl -X POST https://YOUR-NGROK-URL/webhooks/ecocash \
  -H "X-API-KEY: test-webhook-secret" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "SUCCESS",
    "transactionId": "TXN-TEST-123",
    "amount": 585.75,
    "currency": "USD",
    "sourceReference": "INV-2025-001"
  }'
```

## Troubleshooting

### Ngrok URL Changes
Free ngrok URLs change on every restart. Solutions:
- **Paid Plan**: Get a static subdomain
- **Update .env**: Update `NGROK_URL` after each restart
- **Automation**: Use ngrok API to get current URL programmatically

### Webhook Not Receiving Calls
1. Check ngrok is running: http://localhost:4040
2. Verify webhook URL in EcoCash dashboard
3. Check `X-API-KEY` header matches `ECOCASH_WEBHOOK_SECRET`
4. Review ngrok traffic logs for incoming requests

### Server Not Accessible
1. Ensure Credo server is running on port 3000
2. Check firewall settings
3. Verify ngrok tunnel status: `ngrok http 3000 --log=stdout`

## Production Deployment

For production, replace ngrok with:
- **Cloud Deployment**: Deploy to AWS/GCP/Azure with public IP
- **Domain**: Use your own domain with SSL certificate
- **Load Balancer**: Use cloud provider's load balancer
- **Update Webhook URL**: Point to `https://your-domain.com/webhooks/ecocash`

## Environment Variables Summary

```bash
# .env file
NGROK_URL=https://abc123.ngrok.io
ECOCASH_API_KEY=405mvFAY3Tz6o3V48JX6NDeSWGneVLaB
ECOCASH_WEBHOOK_SECRET=test-webhook-secret
PUBLIC_BASE_URL=http://localhost:3000  # Fallback if NGROK_URL not set
```
