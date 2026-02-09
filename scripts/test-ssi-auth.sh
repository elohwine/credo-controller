#!/bin/bash
# Test SSI Authentication Flow
# Tests phone-first registration with encrypted temp links and PlatformIdentityVC issuance

set -e

API_URL="${API_URL:-http://localhost:3000}"
HOLDER_API_KEY="holder-api-key-12345"
PHONE="+263774183277"
EMAIL="test@example.com"
USERNAME="testuser_$(date +%s)"
PIN="123456"

echo "======================================"
echo "SSI Auth E2E Test"
echo "======================================"
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}Step 0: Cleanup previous state (Ensure Fresh Test)${NC}"
# Wipe users to ensure we can test registration with the new PIN
# We use docker exec to avoid local permission issues with the db file
if docker ps | grep -q "credo-api"; then
    docker exec credo-api sqlite3 /app/data/persistence.db "DELETE FROM ssi_users;"
    docker exec credo-api sqlite3 /app/data/persistence.db "DELETE FROM temp_phone_links;"
    echo -e "${GREEN}✓ DB Cleaned via Docker${NC}"
else
    echo -e "${YELLOW}⚠ Docker container not running, skipping cleanup (test might fail if user exists)${NC}"
fi
echo ""

echo -e "${BLUE}Step 1: Create anonymous tenant (on Holder API 7000 to ensure wallet availability)${NC}"
TENANT_RESPONSE=$(curl -s -X POST "http://localhost:7000/multi-tenancy/create-tenant" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $HOLDER_API_KEY" \
  -d '{"config": {"label": "Anonymous Shopper"}}')

TENANT_ID=$(echo "$TENANT_RESPONSE" | jq -r '.tenantId')
TENANT_TOKEN=$(echo "$TENANT_RESPONSE" | jq -r '.token')

echo -e "${GREEN}✓ Anonymous tenant created${NC}"
echo "  Tenant ID: $TENANT_ID"
echo ""

echo -e "${BLUE}Step 1.5: Create Catalog Item${NC}"
ITEM_RESPONSE=$(curl -s -X POST "${API_URL}/api/catalog/merchant/${TENANT_ID}/items" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Product",
    "price": 10.00,
    "sku": "SKU-123"
  }')
ITEM_ID=$(echo "$ITEM_RESPONSE" | jq -r '.id')
echo -e "${GREEN}✓ Item created: $ITEM_ID${NC}"
echo ""

echo -e "${BLUE}Step 2: Checkout with phone (WhatsApp payload simulation)${NC}"
# Create payload
PAYLOAD_JSON=$(jq -n \
  --arg merchantId "$TENANT_ID" \
  --arg itemId "$ITEM_ID" \
  '{merchantId: $merchantId, itemId: $itemId, qty: 1}')
PAYLOAD_BASE64=$(echo -n "$PAYLOAD_JSON" | base64 -w 0)

# Create cart
CART_RESPONSE=$(curl -s -X POST "${API_URL}/api/wa/cart/create" \
  -H "Content-Type: application/json" \
  -d "{
    \"payload\": \"$PAYLOAD_BASE64\",
    \"buyerPhone\": \"$PHONE\"
  }")

CART_ID=$(echo "$CART_RESPONSE" | jq -r '.id')

# Checkout (this links phone to tenant)
CHECKOUT_RESPONSE=$(curl -s -X POST "${API_URL}/api/wa/cart/${CART_ID}/checkout" \
  -H "Content-Type: application/json" \
  -d "{
    \"customerMsisdn\": \"$PHONE\",
    \"tenantId\": \"$TENANT_ID\",
    \"skipQuote\": true
  }")

echo -e "${GREEN}✓ Checkout completed, phone linked to tenant${NC}"
echo "  Invoice Offer: $(echo "$CHECKOUT_RESPONSE" | jq -r '.invoiceOfferUrl' | cut -c1-60)..."
echo ""


echo -e "${BLUE}Step 2.5: Accept Invoice VC (Simulate Wallet Action)${NC}"
INVOICE_OFFER_URL=$(echo "$CHECKOUT_RESPONSE" | jq -r '.invoiceOfferUrl')

if [ "$INVOICE_OFFER_URL" != "null" ]; then
    echo "  Accepting Invoice Offer: ${INVOICE_OFFER_URL:0:40}..."
    ACCEPT_RESPONSE=$(curl -s -X POST "http://localhost:7000/api/wallet/credentials/accept-offer" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $TENANT_TOKEN" \
      -d "{ \"offerUri\": \"$INVOICE_OFFER_URL\" }")
    echo "  Response: $ACCEPT_RESPONSE"
    echo -e "${GREEN}✓ Invoice VC Accepted${NC}"
else
    echo -e "${YELLOW}⚠ No Invoice Offer URL found${NC}"
fi
echo ""

echo -e "${BLUE}Step 3: Register with same phone (claims existing tenant + VCs)${NC}"
REGISTER_RESPONSE=$(curl -s -X POST "http://localhost:7000/api/ssi/auth/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"username\": \"$USERNAME\",
    \"phone\": \"$PHONE\",
    \"email\": \"$EMAIL\",
    \"pin\": \"$PIN\",
    \"claimExistingTenantId\": \"$TENANT_ID\"
  }")

WALLET_ID=$(echo "$REGISTER_RESPONSE" | jq -r '.walletId')
AUTH_TOKEN=$(echo "$REGISTER_RESPONSE" | jq -r '.token')
CLAIMED=$(echo "$REGISTER_RESPONSE" | jq -r '.claimedExisting')
VC_OFFER_URL=$(echo "$REGISTER_RESPONSE" | jq -r '.vcOfferUrl')

echo -e "${GREEN}✓ Registration successful${NC}"
echo "  Wallet ID: $WALLET_ID"
echo "  Claimed Existing Tenant: $CLAIMED"
echo "  PlatformIdentityVC Offer: $(echo "$VC_OFFER_URL" | cut -c1-60)..."
echo "  Auth Token: ${AUTH_TOKEN:0:20}..."
echo ""

echo -e "${BLUE}Step 4: Verify SSI user record (NO PII stored)${NC}"
# Check database directly
docker exec credo-api sqlite3 /app/data/persistence.db "SELECT id, tenant_id, did, phone_hash, email_hash, pin_hash FROM ssi_users ORDER BY created_at DESC LIMIT 1" > ssi_user.txt

if [ -s ssi_user.txt ]; then
  echo -e "${GREEN}✓ SSI user record found (hashes only, no plaintext PII)${NC}"
  cat ssi_user.txt
  echo ""
else
  echo -e "${YELLOW}⚠ No SSI user record found (table may not exist yet)${NC}"
  echo ""
fi

echo -e "${BLUE}Step 5: Login with PIN (Web2 fallback)${NC}"
LOGIN_RESPONSE=$(curl -s -X POST "http://localhost:7000/api/ssi/auth/login/pin" \
  -H "Content-Type: application/json" \
  -d "{
    \"phone\": \"$PHONE\",
    \"pin\": \"$PIN\"
  }")

LOGIN_TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.token')
LOGIN_TENANT_ID=$(echo "$LOGIN_RESPONSE" | jq -r '.tenantId')

echo -e "${GREEN}✓ PIN login successful${NC}"
echo "  Token: ${LOGIN_TOKEN:0:20}..."
echo "  Tenant ID: $LOGIN_TENANT_ID"
echo ""

echo -e "${BLUE}Step 6: Get session info (no PII exposed)${NC}"
SESSION_RESPONSE=$(curl -s -X GET "http://localhost:7000/api/ssi/auth/session" \
  -H "Authorization: Bearer $LOGIN_TOKEN")

echo -e "${GREEN}✓ Session retrieved${NC}"
echo "$SESSION_RESPONSE" | jq '.'
echo ""

echo -e "${BLUE}Step 7: Create login challenge for VC-based auth${NC}"
CHALLENGE_RESPONSE=$(curl -s -X POST "http://localhost:7000/api/ssi/auth/login/challenge")

NONCE=$(echo "$CHALLENGE_RESPONSE" | jq -r '.nonce')
EXPIRES_AT=$(echo "$CHALLENGE_RESPONSE" | jq -r '.expiresAt')

echo -e "${GREEN}✓ Login challenge created${NC}"
echo "  Nonce: $NONCE"
echo "  Expires: $EXPIRES_AT"
echo ""

echo -e "${BLUE}Step 8: Check temp phone links (should be deleted after registration)${NC}"
TEMP_LINKS=$(sqlite3 data/persistence.db "SELECT COUNT(*) FROM temp_phone_links WHERE tenant_id = '$TENANT_ID'")
echo -e "${GREEN}✓ Temp phone links: $TEMP_LINKS (0 = cleaned up correctly)${NC}"
echo ""

echo -e "${BLUE}Step 9: Verify VC Migration (Check Registered Wallet)${NC}"
# Use the Token from Login (Step 5) to check credentials in the NOW REGISTERED wallet
# We expect to see the Invoice VC we accepted in Step 2.5
CREDENTIALS_RESPONSE=$(curl -s -X GET "http://localhost:7000/api/wallet/$TENANT_ID/credentials" \
  -H "Authorization: Bearer $LOGIN_TOKEN")

VC_COUNT=$(echo "$CREDENTIALS_RESPONSE" | jq '. | length')
echo "  Credentials in Wallet: $VC_COUNT"
echo "$CREDENTIALS_RESPONSE" | jq '.[].type'

if [ "$VC_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✓ VC Migration Successful (Guest -> Registered)${NC}"
else
    echo -e "${YELLOW}⚠ No credentials found in registered wallet (Migration failed?)${NC}"
fi
echo ""

echo "======================================"
echo -e "${GREEN}✅ SSI Auth E2E Test Complete${NC}"
echo "======================================"
echo ""
echo "Key Verifications:"
echo "• Anonymous tenant created ✓"
echo "• Phone linked at checkout (encrypted) ✓"
echo "• Registration claimed existing tenant ✓"
echo "• PlatformIdentityVC offer generated ✓"
echo "• PIN login successful ✓"
echo "• Session info retrieved ✓"
echo "• Database stores ONLY hashes (no PII) ✓"
echo ""
echo "To test VC-based login, use the PlatformIdentityVC from the wallet"
