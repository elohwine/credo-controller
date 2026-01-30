#!/bin/bash
set -e

# Configuration
# Note: Using localhost because script runs on host, but backend uses service names internally
WALLET_URL="http://localhost:4000"
ISSUER_URL="http://localhost:3000"
USERNAME="testuser02"
PASSWORD="testpass123"

echo "Attempting to login as $USERNAME..."
LOGIN_RES=$(curl -s -X POST "$WALLET_URL/api/wallet/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USERNAME\", \"password\":\"$PASSWORD\"}")

if echo "$LOGIN_RES" | grep -q "Invalid credentials" || echo "$LOGIN_RES" | grep -q "User not found"; then
  echo "User not found. Registering $USERNAME..."
  REG_RES=$(curl -s -X POST "$WALLET_URL/api/wallet/auth/register" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$USERNAME\", \"password\":\"$PASSWORD\", \"email\":\"test@example.com\"}")
  echo "Registration Success!"
  
  echo "Logging in again..."
  LOGIN_RES=$(curl -s -X POST "$WALLET_URL/api/wallet/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$USERNAME\", \"password\":\"$PASSWORD\"}")
fi

TOKEN=$(echo $LOGIN_RES | grep -oP '"token":"\K[^"]+')
WALLET_ID=$(echo $LOGIN_RES | grep -oP '"walletId":"\K[^"]+')

if [ -z "$TOKEN" ]; then
  echo "Login failed: $LOGIN_RES"
  exit 1
fi

echo "Token: ${TOKEN:0:20}..."
echo "Wallet ID: $WALLET_ID"

echo "Checking for pending offers..."
OFFERS_RES=$(curl -s -X GET "$WALLET_URL/api/wallet/credentials/pending-offers" \
  -H "Authorization: Bearer $TOKEN")

OFFER_URI=$(echo "$OFFERS_RES" | grep -oP '"offerUri":"\K[^"]+')

if [ -z "$OFFER_URI" ]; then
  echo "No pending offer found. Waiting a bit for auto-generation..."
  sleep 2
  OFFERS_RES=$(curl -s -X GET "$WALLET_URL/api/wallet/credentials/pending-offers" \
    -H "Authorization: Bearer $TOKEN")
  OFFER_URI=$(echo "$OFFERS_RES" | grep -oP '"offerUri":"\K[^"]+')
fi

if [ -z "$OFFER_URI" ]; then
  echo "Still no offer found. User might already have the GenericID credential. Content: $OFFERS_RES"
  exit 1
fi

echo "Found Offer URI: $OFFER_URI"

# STEP 1: RESOLVE (simulates UI loading issuance page)
echo "Step 1: Resolving offer (UI request)..."
RESOLVE_RES=$(curl -s -X POST "$WALLET_URL/api/wallet/wallet/$WALLET_ID/exchange/resolveCredentialOffer" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"credential_offer_uri\":\"$OFFER_URI\"}")

if echo "$RESOLVE_RES" | grep -q "error"; then
  echo "Resolution failed: $RESOLVE_RES"
  exit 1
fi
echo "Resolution success!"

# STEP 2: ACCEPT (simulates User clicking Accept)
echo "Step 2: Accepting offer (UI request)..."
ACCEPT_RES=$(curl -s -X POST "$WALLET_URL/api/wallet/wallet/$WALLET_ID/exchange/useOfferRequest" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"request\":\"$OFFER_URI\"}")

echo "Acceptance Response: $ACCEPT_RES"

if echo "$ACCEPT_RES" | grep -q "Invalid state for credential offer" || echo "$ACCEPT_RES" | grep -q "invalid_request"; then
  echo "REPRODUCED: Invalid state for credential offer detected on second resolve!"
else
  echo "SUCCESS: Acceptance worked (or failed with unexpected error)."
fi
