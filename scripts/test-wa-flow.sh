#!/bin/bash
# Test WhatsApp Commerce Flow Locally (no WhatsApp needed)

BASE_URL="${BASE_URL:-http://localhost:3000}"
MERCHANT_ID="${MERCHANT_ID:-default}"

echo "🧪 Testing WhatsApp Commerce Flow"
echo "================================="
echo ""

# Step 1: Create a test catalog item (if not exists)
echo "1️⃣ Creating test catalog item..."
ITEM=$(curl -s -X POST "$BASE_URL/catalog/items" \
  -H "Content-Type: application/json" \
  -d '{
    "merchantId": "'"$MERCHANT_ID"'",
    "title": "Test Product",
    "description": "A test product for flow testing",
    "price": 25.00,
    "currency": "USD",
    "sku": "TEST-001",
    "category": "test"
  }')
ITEM_ID=$(echo $ITEM | jq -r '.id // "test-item-1"')
echo "   Item ID: $ITEM_ID"
echo ""

# Step 2: Generate wa.me link (shows what customer would click)
echo "2️⃣ Generating wa.me link..."
LINK=$(curl -s "$BASE_URL/api/wa/link/$MERCHANT_ID/$ITEM_ID")
echo "   Link: $(echo $LINK | jq -r '.link')"
PAYLOAD=$(echo $LINK | jq -r '.payload')
echo "   Payload: $PAYLOAD"
echo ""

# Step 3: Create cart from payload (simulates customer clicking link)
echo "3️⃣ Creating cart from payload..."
CART=$(curl -s -X POST "$BASE_URL/api/wa/cart/create" \
  -H "Content-Type: application/json" \
  -d '{
    "payload": "'"$PAYLOAD"'",
    "buyerPhone": "263771234567"
  }')
CART_ID=$(echo $CART | jq -r '.id')
echo "   Cart ID: $CART_ID"
echo "   Total: $(echo $CART | jq -r '.currency') $(echo $CART | jq -r '.total')"
echo ""

# Step 4: (Optional) Issue QuoteVC for wallet users
echo "4️⃣ Issuing QuoteVC (optional for wallet users)..."
QUOTE=$(curl -s -X POST "$BASE_URL/api/wa/cart/$CART_ID/issue-quote" \
  -H "Content-Type: application/json" \
  -d '{"sendToWhatsApp": false}')
echo "   Quote URL: $(echo $QUOTE | jq -r '.quoteOfferUrl // "N/A"')"
echo ""

# Step 5: Checkout (initiates EcoCash payment)
echo "5️⃣ Initiating checkout (EcoCash payment)..."
CHECKOUT=$(curl -s -X POST "$BASE_URL/api/wa/cart/$CART_ID/checkout" \
  -H "Content-Type: application/json" \
  -d '{
    "customerMsisdn": "263771234567",
    "sendToWhatsApp": false
  }')
echo "   Status: $(echo $CHECKOUT | jq -r '.status')"
echo "   EcoCash Ref: $(echo $CHECKOUT | jq -r '.ecocashRef')"
echo "   Invoice URL: $(echo $CHECKOUT | jq -r '.invoiceOfferUrl // "N/A"')"
echo "   Payment Instructions: $(echo $CHECKOUT | jq -r '.paymentInstructions')"
echo ""

# Step 6: Simulate EcoCash webhook (payment success)
SOURCE_REF=$(echo $CHECKOUT | jq -r '.message' | grep -oE 'INV-[A-Z0-9]+')
echo "6️⃣ Simulating EcoCash payment success webhook..."
echo "   Source Reference: $SOURCE_REF"
WEBHOOK=$(curl -s -X POST "$BASE_URL/webhooks/ecocash" \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: test-webhook-secret" \
  -d '{
    "status": "SUCCESS",
    "transactionId": "ECO-'"$(date +%s)"'",
    "amount": 25.00,
    "currency": "USD",
    "sourceReference": "'"$SOURCE_REF"'"
  }')
echo "   Receipt Generated: $(echo $WEBHOOK | jq -r '.receiptGenerated')"
echo "   Receipt URL: $(echo $WEBHOOK | jq -r '.receiptOfferUrl // "N/A"')"
echo ""

# Step 7: Verify receipt (delivery personnel flow)
echo "7️⃣ Verifying receipt for delivery..."
VERIFY=$(curl -s "$BASE_URL/api/receipts/verify/$SOURCE_REF")
echo "   Verified: $(echo $VERIFY | jq -r '.verified')"
echo "   Amount: $(echo $VERIFY | jq -r '.receipt.currency // "USD"') $(echo $VERIFY | jq -r '.receipt.amount // "N/A"')"
echo ""

echo "✅ Flow complete!"
echo ""
echo "📱 Open verification page: $BASE_URL/verify/receipt/$SOURCE_REF"
echo "🛒 View cart: $BASE_URL/api/wa/cart/$CART_ID"

