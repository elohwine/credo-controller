#!/bin/bash
# E2E Test: Cart → Invoice VC → Payment → Receipt VC
# Auto-push is DISABLED - all acceptance is manual

set -e

ISSUER="http://localhost:3000"
HOLDER="http://localhost:7000"
HOLDER_KEY="holder-api-key-12345"
WEBHOOK_KEY="test-webhook-secret"

echo "╔═════════════════════════════════════════════════════════╗"
echo "║  E2E TEST: Cart → Invoice → Payment → Receipt (Manual)  ║"
echo "╚═════════════════════════════════════════════════════════╝"
echo ""

# 1. Create Cart
echo "━━━ STEP 1: Create Cart ━━━"
CART=$(curl -s -X POST "$ISSUER/api/wa/cart/create" \
  -H "Content-Type: application/json" \
  -d '{"payload":"eyJtZXJjaGFudElkIjoicG9ydGFsLW1lcmNoYW50LWRlbW8iLCJpdGVtSWQiOiJJVE0tMzI5N2MzNzYtZjgzMS00NjMxLTg4MmItYmFiYjVhMGYyZDE2In0="}')
CART_ID=$(echo $CART | jq -r '.id')
echo "✅ Cart ID: $CART_ID"

# 2. Checkout
echo ""
echo "━━━ STEP 2: Checkout (Generate Invoice VC Offer) ━━━"
CHECKOUT=$(curl -s -X POST "$ISSUER/api/wa/cart/$CART_ID/checkout" \
  -H "Content-Type: application/json" \
  -d '{"customerMsisdn":"263771234567","skipQuote":true}')
INVOICE_OFFER=$(echo $CHECKOUT | jq -r '.invoiceOfferUrl')
ECOCASH_REF=$(echo $CHECKOUT | jq -r '.ecocashRef')
echo "✅ EcoCash Ref: $ECOCASH_REF"
echo "   Invoice Offer: ${INVOICE_OFFER:0:80}..."

# 3. MANUAL Accept Invoice VC
echo ""
echo "━━━ STEP 3: MANUAL Accept Invoice VC ━━━"
INVOICE_RESULT=$(curl -s -X POST "$HOLDER/api/wallet/holder-wallet/exchange/useOfferRequest" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $HOLDER_KEY" \
  -d "{\"credential_offer_uri\":\"$INVOICE_OFFER\"}")
INVOICE_ID=$(echo $INVOICE_RESULT | jq -r '.id // "error"')
if [ "$INVOICE_ID" != "error" ] && [ "$INVOICE_ID" != "null" ]; then
  echo "✅ Invoice VC Accepted: $INVOICE_ID"
else
  echo "❌ Invoice VC Failed: $(echo $INVOICE_RESULT | jq -r '.message')"
  exit 1
fi

# 4. Simulate EcoCash Payment Webhook
echo ""
echo "━━━ STEP 4: Simulate EcoCash Payment SUCCESS ━━━"
WEBHOOK_RESULT=$(curl -s -X POST "$ISSUER/webhooks/ecocash" \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: $WEBHOOK_KEY" \
  -d "{
    \"paymentRequestId\":\"$ECOCASH_REF\",
    \"status\":\"SUCCESS\",
    \"transactionId\":\"TXN-$(date +%s)\",
    \"amount\":5,
    \"currency\":\"USD\",
    \"sourceReference\":\"$ECOCASH_REF\",
    \"customerMsisdn\":\"263771234567\",
    \"timestamp\":\"$(date -Iseconds)\"
  }")
RECEIPT_GENERATED=$(echo $WEBHOOK_RESULT | jq -r '.receiptGenerated')
RECEIPT_OFFER=$(echo $WEBHOOK_RESULT | jq -r '.receiptOfferUrl // empty')
TXN_ID=$(echo $WEBHOOK_RESULT | jq -r '.transactionId')
echo "✅ Payment Webhook Acknowledged"
echo "   Transaction: $TXN_ID"
echo "   Receipt Generated: $RECEIPT_GENERATED"

# 5. MANUAL Accept Receipt VC (if available)
if [ -n "$RECEIPT_OFFER" ] && [ "$RECEIPT_OFFER" != "null" ]; then
  echo ""
  echo "━━━ STEP 5: MANUAL Accept Receipt VC ━━━"
  echo "   Receipt Offer: ${RECEIPT_OFFER:0:80}..."
  RECEIPT_RESULT=$(curl -s -X POST "$HOLDER/api/wallet/holder-wallet/exchange/useOfferRequest" \
    -H "Content-Type: application/json" \
    -H "x-api-key: $HOLDER_KEY" \
    -d "{\"credential_offer_uri\":\"$RECEIPT_OFFER\"}")
  RECEIPT_ID=$(echo $RECEIPT_RESULT | jq -r '.id // "error"')
  if [ "$RECEIPT_ID" != "error" ] && [ "$RECEIPT_ID" != "null" ]; then
    echo "✅ Receipt VC Accepted: $RECEIPT_ID"
  else
    echo "⚠️ Receipt VC Failed: $(echo $RECEIPT_RESULT | jq -r '.message')"
  fi
else
  echo ""
  echo "━━━ STEP 5: Skip (No Receipt Offer URL returned) ━━━"
fi

# 6. Verify Wallet Contents
echo ""
echo "━━━ STEP 6: Verify Credentials in Wallet ━━━"
CREDS=$(curl -s "$HOLDER/api/wallet/holder-wallet/credentials" -H "x-api-key: $HOLDER_KEY")
COUNT=$(echo $CREDS | jq 'length')
echo "   Total Credentials: $COUNT"
echo ""
echo "   Credentials:"
echo $CREDS | jq -r '.[] | "   • \(.type) (ID: \(.id[0:16])...)"'

echo ""
echo "╔═════════════════════════════════════════════════════════╗"
echo "║              ✅ E2E TEST COMPLETED                      ║"
echo "╚═════════════════════════════════════════════════════════╝"
