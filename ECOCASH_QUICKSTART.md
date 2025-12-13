# EcoCash Webhook Quick Start

## 1. Start Ngrok Tunnel
```bash
./scripts/setup-webhook-tunnel.sh
```

## 2. Copy the HTTPS URL
Example: `https://abc123.ngrok.io`

## 3. Set Environment Variable
```bash
export NGROK_URL=https://abc123.ngrok.io
```

## 4. Restart Server
```bash
yarn dev
```

## 5. Configure EcoCash Dashboard
- Webhook URL: `https://abc123.ngrok.io/webhooks/ecocash`
- Webhook Secret: `test-webhook-secret`

## 6. Test the Flow
```bash
npx ts-node tests/test_ecocash_e2e.ts
```

## Monitor Webhook Traffic
Open: http://localhost:4040

---

**Full Documentation**: `docs/ECOCASH_WEBHOOK_SETUP.md`
