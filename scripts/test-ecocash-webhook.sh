#!/bin/bash
# MVP Sprint 2 - EcoCash Webhook Test Script
# Tests the payment→ReceiptVC issuance flow

BASE_URL="${BASE_URL:-http://localhost:3000}"
API_KEY="${ECOCASH_WEBHOOK_SECRET:-test-webhook-secret}"

echo "🧪 MVP Sprint 2 - EcoCash Webhook Tests"
echo "========================================="
echo "Base URL: $BASE_URL"
echo ""

# Test 1: Successful Payment → ReceiptVC Issuance
echo "📋 Test 1: Successful Payment Webhook"
echo "--------------------------------------"
RESPONSE=$(curl -s -X POST "$BASE_URL/webhooks/ecocash" \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: $API_KEY" \
  -d '{
    "paymentRequestId": "PAY-TEST-001",
    "status": "SUCCESS",
    "transactionId": "ECOCASH-TEST-'$(date +%s)'",
    "amount": 25.50,
    "currency": "USD",
    "sourceReference": "SRC-TEST-'$(date +%s)'",
    "metadata": {"cartId": "test-cart-001"}
  }')

echo "$RESPONSE" | jq .
echo ""

# Check for receipt generation
if echo "$RESPONSE" | jq -e '.receiptGenerated == true' > /dev/null 2>&1; then
  echo "✅ ReceiptVC generated successfully"
else
  echo "⚠️  ReceiptVC was NOT generated (check if server is running)"
fi
echo ""

# Test 2: Idempotency Check (duplicate webhook)
echo "📋 Test 2: Idempotency Check (Duplicate Webhook)"
echo "-------------------------------------------------"
DUPLICATE_REF="SRC-DUPE-$(date +%s)"

# First call
echo "First webhook call..."
FIRST=$(curl -s -X POST "$BASE_URL/webhooks/ecocash" \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: $API_KEY" \
  -d '{
    "status": "SUCCESS",
    "transactionId": "TX-DUPE-001",
    "amount": 10.00,
    "sourceReference": "'$DUPLICATE_REF'"
  }')

# Second call with same sourceReference
echo "Duplicate webhook call..."
SECOND=$(curl -s -X POST "$BASE_URL/webhooks/ecocash" \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: $API_KEY" \
  -d '{
    "status": "SUCCESS",
    "transactionId": "TX-DUPE-001",
    "sourceReference": "'$DUPLICATE_REF'"
  }')

echo "First response: $(echo $FIRST | jq -c .)"
echo "Second response: $(echo $SECOND | jq -c .)"

if echo "$SECOND" | jq -e '.reason == "Payment already processed"' > /dev/null 2>&1; then
  echo "✅ Idempotency check passed"
else
  echo "⚠️  Idempotency check: second call was not rejected as duplicate"
fi
echo ""

# Test 3: Failed Payment (no ReceiptVC)
echo "📋 Test 3: Failed Payment Webhook"
echo "----------------------------------"
FAILED=$(curl -s -X POST "$BASE_URL/webhooks/ecocash" \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: $API_KEY" \
  -d '{
    "status": "FAILED",
    "transactionId": "TX-FAIL-001",
    "sourceReference": "SRC-FAIL-'$(date +%s)'"
  }')

echo "$FAILED" | jq .

if echo "$FAILED" | jq -e '.receiptGenerated == false' > /dev/null 2>&1; then
  echo "✅ Failed payment correctly did NOT generate ReceiptVC"
else
  echo "⚠️  Failed payment should not generate ReceiptVC"
fi
echo ""

# Test 4: Unauthorized Request
echo "📋 Test 4: Unauthorized Request (Wrong API Key)"
echo "------------------------------------------------"
UNAUTH=$(curl -s -X POST "$BASE_URL/webhooks/ecocash" \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: wrong-key" \
  -d '{"status": "SUCCESS", "transactionId": "TX-UNAUTH"}')

echo "$UNAUTH" | jq .

if echo "$UNAUTH" | jq -e '.error == "Unauthorized"' > /dev/null 2>&1; then
  echo "✅ Unauthorized request correctly rejected"
else
  echo "⚠️  Unauthorized request should be rejected"
fi
echo ""

echo "========================================="
echo "🏁 Sprint 2 EcoCash Tests Complete"
