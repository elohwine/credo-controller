#!/usr/bin/env bash
# Potato batch demo: a farm issues a batch record, the buyer keeps it, anyone checks it,
# the farm recalls it, and a made-up batch number is not found.
# Needs the API on :3000 and the portal on :5000. Safe to run again: it signs the same two
# people back in and issues a new batch number each time.
#
#   BATCH=NYG-2026-0150 scripts/demo-potato-batch.sh
set -euo pipefail

API="${API_URL:-http://localhost:3000}"
PORTAL="${PORTAL_URL:-http://localhost:5000}"
FARM_PHONE="${FARM_PHONE:-0779200001}"
BUYER_PHONE="${BUYER_PHONE:-0779200002}"
PIN="${PIN:-1234}"
BATCH="${BATCH:-NYG-$(date +%Y)-$(date +%H%M%S)}"
FARM_NAME="${FARM_NAME:-Nyanga Potato Growers (demo)}"

json() { curl -sf -H 'Content-Type: application/json' "$@"; }

sign_in() { # name phone -> token and wallet tenant
  local out
  out=$(json -X POST "$API/api/ssi/auth/register" -d "{\"username\":\"$1\",\"phone\":\"$2\",\"pin\":\"$PIN\"}" 2>/dev/null) ||
    out=$(json -X POST "$API/api/ssi/auth/login/pin" -d "{\"phone\":\"$2\",\"pin\":\"$PIN\"}")
  echo "$out" | jq -r '"\(.token) \(.walletId // .tenantId)"'
}

read -r FARM_TOKEN _ <<<"$(sign_in 'Tendai Mutasa' "$FARM_PHONE")"
read -r BUYER_TOKEN BUYER_WALLET <<<"$(sign_in 'Rudo Chikore' "$BUYER_PHONE")"

ORG=$(json "$API/api/organizations" -H "Authorization: Bearer $FARM_TOKEN" |
  jq -r --arg n "$FARM_NAME" '(if type == "array" then . else .organizations end)[] | select(.name == $n) | .orgTenantId' | head -1)
if [ -z "$ORG" ]; then
  ORG=$(json -X POST "$API/api/organizations" -H "Authorization: Bearer $FARM_TOKEN" \
    -d "{\"name\":\"$FARM_NAME\",\"category\":\"supplier\"}" | jq -r .orgTenantId)
fi
ORG_TOKEN=$(json -X POST "$API/api/organizations/$ORG/switch" -H "Authorization: Bearer $FARM_TOKEN" | jq -r .token)
AUTH=(-H "Authorization: Bearer $ORG_TOKEN")

# One-time setup: sell produce, define the batch record, put the buyer on the team.
REV=$(json "$API/api/organizations/$ORG/setup/profile" "${AUTH[@]}" | jq -r '.access.revision')
[ "$REV" = "0" ] && json -X PUT "$API/api/organizations/$ORG/setup/profile" "${AUTH[@]}" \
  -d '{"expectedRevision":0,"modules":["commerce"],"operatingModel":"internal"}' >/dev/null
json -X POST "$API/api/organizations/connected-systems/record-types" "${AUTH[@]}" -d '{
  "label":"Potato batch","description":"One harvested batch of potatoes, from the field to the buyer",
  "fields":[
   {"key":"batchNumber","label":"Batch number","type":"text"},
   {"key":"variety","label":"Variety","type":"text"},
   {"key":"seedSource","label":"Seed source","type":"text"},
   {"key":"seedLot","label":"Certified seed lot","type":"text"},
   {"key":"farmName","label":"Farm","type":"text"},
   {"key":"district","label":"District","type":"text"},
   {"key":"plantedOn","label":"Planted on","type":"date"},
   {"key":"harvestedOn","label":"Harvested on","type":"date"},
   {"key":"quantityKg","label":"Quantity (kg)","type":"number"},
   {"key":"grade","label":"Grade","type":"text"},
   {"key":"inspectedBy","label":"Inspected by","type":"text","required":false}]}' >/dev/null 2>&1 || true
json -X POST "$API/api/organizations/$ORG/members/invite" "${AUTH[@]}" \
  -d "{\"phone\":\"$BUYER_PHONE\",\"role\":\"member\",\"name\":\"Rudo Chikore (buyer)\"}" >/dev/null 2>&1 || true

echo "1. The farm issues batch $BATCH to the buyer"
OFFER=$(json -X POST "$API/api/organizations/credential-operations/direct-offers" "${AUTH[@]}" -d "{
  \"credentialType\":\"PotatoBatchRecord\",\"walletTenantId\":\"$BUYER_WALLET\",
  \"title\":\"Potato batch $BATCH\",\"body\":\"Batch record from the farm. Keep it with the delivery.\",
  \"claims\":{\"batchNumber\":\"$BATCH\",\"variety\":\"Mondial\",\"seedSource\":\"Seed Co (certified)\",
   \"seedLot\":\"SC-MON-25-0871\",\"farmName\":\"Nyanga Potato Growers\",\"district\":\"Nyanga\",
   \"plantedOn\":\"2026-07-14\",\"harvestedOn\":\"2026-11-10\",\"quantityKg\":4800,\"grade\":\"Grade A, washed\"}}")
ROW=$(echo "$OFFER" | jq -r .rowId)
REF=$(echo "$OFFER" | jq -r .offerId)

echo "2. The buyer keeps it in her wallet"
URI=$(json "$API/api/wallet/credentials/pending-offers" -H "Authorization: Bearer $BUYER_TOKEN" |
  jq -r --arg r "$ROW" '(if type == "array" then . else (.offers // .items) end)[] | select(.id == $r) | (.offerUri // .offer_uri)')
json -X POST "$API/api/wallet/credentials/accept-offer" -H "Authorization: Bearer $BUYER_TOKEN" \
  -d "$(jq -n --arg u "$URI" '{offerUri: $u}')" >/dev/null

check() { json "$API/api/verify/$1" | jq -r '"   \(.status)\(if .reason then " (\(.reason))" else "" end)"'; }
echo "3. Anyone checks it:      $PORTAL/verify?id=$REF"; check "$REF"
echo "4. A made-up batch:       $PORTAL/verify?id=$BATCH-FAKE"; check "$BATCH-FAKE"

if [ "${RECALL:-yes}" = "yes" ]; then
  echo "5. The farm recalls it"
  json -X POST "$API/api/organizations/credential-operations/credentials/$REF/status" "${AUTH[@]}" \
    -d '{"action":"revoke","reason":"Batch recalled: bags found re-labelled at a reseller"}' >/dev/null
  echo "   Checked again:         $PORTAL/verify?id=$REF"; check "$REF"
  echo "   By the buyer's inbox:  $PORTAL/verify?id=$ROW"; check "$ROW"
fi
