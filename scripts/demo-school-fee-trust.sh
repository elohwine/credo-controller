#!/usr/bin/env bash
# School-fee trust demo: the school issues a receipt, the parent keeps a copy,
# a bursary asks to see it, and a recalled receipt no longer checks out.
# Needs the API on :3000. Safe to run again: the same three people sign back in,
# and each run is a new student reference.
#
#   STUDENT=STU-DEMO-2 scripts/demo-school-fee-trust.sh
set -euo pipefail

API="${API_URL:-http://localhost:3000}"
PORTAL="${PORTAL_URL:-http://localhost:5000}"
PHONE="${PHONE_URL:-http://localhost:3005}"
SCHOOL_PHONE="${SCHOOL_PHONE:-0779300001}"
PARENT_PHONE="${PARENT_PHONE:-0779300002}"
BURSARY_PHONE="${BURSARY_PHONE:-0779300003}"
PIN="${PIN:-1234}"
STUDENT="${STUDENT:-STU-$(date +%H%M%S)}"
SCHOOL_NAME="${SCHOOL_NAME:-Springfield High (demo)}"
BURSARY_NAME="${BURSARY_NAME:-Hope Bursary Trust (demo)}"

json() {
  local body code
  body=$(curl -sS -H 'Content-Type: application/json' -w '\n%{http_code}' "$@") || {
    echo "Request failed" >&2
    exit 1
  }
  code=$(echo "$body" | tail -n 1)
  body=$(echo "$body" | sed '$d')
  if [ "$code" -lt 200 ] || [ "$code" -ge 300 ]; then
    echo "HTTP $code" >&2
    echo "$body" >&2
    exit 1
  fi
  printf '%s' "$body"
}

sign_in() { # name phone -> token walletId
  local out
  out=$(json -X POST "$API/api/ssi/auth/register" -d "{\"username\":\"$1\",\"phone\":\"$2\",\"pin\":\"$PIN\"}" 2>/dev/null) ||
    out=$(json -X POST "$API/api/ssi/auth/login/pin" -d "{\"phone\":\"$2\",\"pin\":\"$PIN\"}")
  echo "$out" | jq -r '"\(.token) \(.walletId // .tenantId)"'
}

org_of() { # token name category -> orgTenantId
  local token="$1" name="$2" category="$3" found
  found=$(json "$API/api/organizations" -H "Authorization: Bearer $token" |
    jq -r --arg n "$name" '(if type == "array" then . else .organizations end)[] | select(.name == $n) | .orgTenantId' | head -1)
  if [ -z "$found" ]; then
    found=$(json -X POST "$API/api/organizations" -H "Authorization: Bearer $token" \
      -d "{\"name\":\"$name\",\"category\":\"$category\"}" | jq -r .orgTenantId)
  fi
  echo "$found"
}

echo "Signing in the school, the parent and the bursary"
read -r SCHOOL_TOKEN _ <<<"$(sign_in 'Tendai Moyo' "$SCHOOL_PHONE")"
read -r PARENT_TOKEN PARENT_WALLET <<<"$(sign_in 'Rudo Moyo' "$PARENT_PHONE")"
read -r BURSARY_TOKEN _ <<<"$(sign_in 'Chipo Ncube' "$BURSARY_PHONE")"

SCHOOL=$(org_of "$SCHOOL_TOKEN" "$SCHOOL_NAME" education)
BURSARY=$(org_of "$BURSARY_TOKEN" "$BURSARY_NAME" finance)
SCHOOL_ORG=$(json -X POST "$API/api/organizations/$SCHOOL/switch" -H "Authorization: Bearer $SCHOOL_TOKEN" | jq -r .token)
BURSARY_ORG=$(json -X POST "$API/api/organizations/$BURSARY/switch" -H "Authorization: Bearer $BURSARY_TOKEN" | jq -r .token)

REV=$(json "$API/api/organizations/$SCHOOL/setup/profile" -H "Authorization: Bearer $SCHOOL_ORG" | jq -r '.access.revision // 0')
if [ "$REV" = "0" ]; then
  json -X PUT "$API/api/organizations/$SCHOOL/setup/profile" -H "Authorization: Bearer $SCHOOL_ORG" \
    -d '{"expectedRevision":0,"modules":["school_fees"],"operatingModel":"internal"}' >/dev/null
fi
json -X POST "$API/api/organizations/$SCHOOL/setup/payments/simulated" -H "Authorization: Bearer $SCHOOL_ORG" >/dev/null

echo "1. The school sets the fee for $STUDENT"
RUN=$(json -X POST "$API/workflows/education_fee_payment/execute" -H "Authorization: Bearer $SCHOOL_ORG" -d "{
  \"studentId\":\"$STUDENT\",\"studentName\":\"Tatenda Moyo\",\"term\":\"Term 3\",
  \"feeType\":\"tuition\",\"amount\":650,\"currency\":\"USD\",\"schoolName\":\"$SCHOOL_NAME\",
  \"payerName\":\"Rudo Moyo\",\"payerPhone\":\"$PARENT_PHONE\"}")
RUN_ID=$(echo "$RUN" | jq -r .runId)
CODE=$(echo "$RUN" | jq -r '.output.clientBill.code // empty')
if [ -z "$CODE" ]; then
  echo "The fee did not send a pay link:" >&2
  echo "$RUN" | jq . >&2
  exit 1
fi
echo "   Pay link $PHONE/pay/$CODE"

echo "2. The parent pays (practice payment, no real money)"
json -X POST "$API/api/public/pay/$CODE/pay" -H "Authorization: Bearer $PARENT_TOKEN" \
  -d "{\"paymentMethod\":\"simulated\",\"customerMsisdn\":\"$PARENT_PHONE\"}" >/dev/null

echo "   Waiting for the receipt"
for _ in 1 2 3 4 5 6 7 8 9 10; do
  STATUS=$(json "$API/workflows/runs/$RUN_ID" -H "Authorization: Bearer $SCHOOL_ORG" | jq -r .status)
  [ "$STATUS" = "completed" ] && break
  sleep 1
done
DETAIL=$(json "$API/workflows/runs/$RUN_ID" -H "Authorization: Bearer $SCHOOL_ORG")
PAYER_OFFER=$(echo "$DETAIL" | jq -r '.output.issuedCredentials.SchoolFeeReceiptVCPayer.offerId // empty')
SCHOOL_OFFER=$(echo "$DETAIL" | jq -r '.output.issuedCredentials.SchoolFeeReceiptVC.offerId // empty')
if [ -z "$PAYER_OFFER" ]; then
  echo "The parent did not get a receipt copy. Run status: $(echo "$DETAIL" | jq -r .status)" >&2
  echo "$DETAIL" | jq '.output.issuedCredentials, .output.payment' >&2
  exit 1
fi

echo "3. The parent keeps the receipt"
OFFERS=$(json "$API/api/wallet/credentials/pending-offers" -H "Authorization: Bearer $PARENT_TOKEN")
URI=$(echo "$OFFERS" | jq -r --arg id "$PAYER_OFFER" '
  (if type == "array" then . else (.offers // .items // []) end)
  | map(select((.metadata.offerId // .offerId // .claims.offerId // "") == $id or (.id == $id)))
  | .[0].offerUri // .[0].offer_uri // empty')
if [ -z "$URI" ]; then
  URI=$(echo "$OFFERS" | jq -r '
    (if type == "array" then . else (.offers // .items // []) end)
    | map(select(.credentialType == "SchoolFeeReceiptVC" or .credential_type == "SchoolFeeReceiptVC"))
    | .[0].offerUri // .[0].offer_uri // empty')
fi
if [ -z "$URI" ]; then
  echo "No school-fee receipt is waiting in the parent's phone." >&2
  echo "$OFFERS" | jq 'if type == "array" then map({id, credentialType, title}) else . end' >&2
  exit 1
fi
json -X POST "$API/api/wallet/credentials/accept-offer" -H "Authorization: Bearer $PARENT_TOKEN" \
  -d "$(jq -n --arg u "$URI" '{offerUri: $u}')" >/dev/null

echo "4. The bursary asks the parent to share it"
CONTACT=$(json "$API/api/contacts" -H "Authorization: Bearer $BURSARY_ORG" |
  jq -r --arg w "$PARENT_WALLET" '(if type == "array" then . else (.contacts // []) end)[] | select(.walletTenantId == $w) | .id' | head -1)
if [ -z "$CONTACT" ]; then
  CONTACT=$(json -X POST "$API/api/contacts" -H "Authorization: Bearer $BURSARY_ORG" -d "{
    \"name\":\"Rudo Moyo\",\"phone\":\"$PARENT_PHONE\",\"walletTenantId\":\"$PARENT_WALLET\",\"contactScope\":\"external\"}" |
    jq -r '.id // .contact.id')
fi
PROOF=$(json -X POST "$API/api/contacts/$CONTACT/request-proof" -H "Authorization: Bearer $BURSARY_ORG" -d '{
  "credentialTypes":["SchoolFeeReceiptVC"],
  "purpose":"School fee receipt for Tatenda Moyo, Term 3"}')
REQUEST_ID=$(echo "$PROOF" | jq -r .requestId)
REQUEST_URL=$(echo "$PROOF" | jq -r .requestUrl)
DEEP=$(echo "$PROOF" | jq -r .deepLink)

if [ "${STOP_BEFORE:-}" = "share" ]; then
  jq -n \
    --arg run "$RUN_ID" --arg code "$CODE" --arg student "$STUDENT" \
    --arg school "$SCHOOL" --arg bursary "$BURSARY" --arg parent "$PARENT_WALLET" \
    --arg request "$REQUEST_ID" --arg deep "$DEEP" --arg url "$REQUEST_URL" \
    --arg payerOffer "$PAYER_OFFER" --arg schoolOffer "$SCHOOL_OFFER" \
    '{runId:$run, payCode:$code, student:$student, schoolOrg:$school, bursaryOrg:$bursary,
      parentWallet:$parent, proofRequestId:$request, requestUrl:$url, deepLink:$deep,
      payerOfferId:$payerOffer, schoolOfferId:$schoolOffer}' > /tmp/school_trust_demo.json
  echo "Stopped before the parent shares. Open the request on the phone:"
  echo "   $DEEP"
  echo "Saved /tmp/school_trust_demo.json"
  exit 0
fi

echo "5. The parent shares the receipt"
MATCH=$(json -X POST "$API/api/wallet/$PARENT_WALLET/exchange/matchCredentialsForPresentationDefinition" \
  -H "Authorization: Bearer $PARENT_TOKEN" \
  -d "$(jq -n --arg u "$REQUEST_URL" '{presentationRequest: $u}')")
CRED=$(echo "$MATCH" | jq -r --arg s "$STUDENT" 'if type == "array" then (([.[] | select(.claims.studentId == $s)] | last | .id) // (last | .id) // empty) else empty end')
if [ -z "$CRED" ]; then
  echo "The phone did not find a receipt to share. Open this on the phone instead:" >&2
  echo "   $DEEP" >&2
  echo "$MATCH" | jq . >&2
  exit 1
fi
json -X POST "$API/api/wallet/$PARENT_WALLET/exchange/usePresentationRequest" \
  -H "Authorization: Bearer $PARENT_TOKEN" \
  -d "$(jq -n --arg u "$REQUEST_URL" --arg c "$CRED" '{presentationRequest: $u, selectedCredentials: [$c]}')" >/dev/null

echo "6. The bursary reads the answer"
SHARE=$(json "$API/api/contacts/proof-requests/$REQUEST_ID" -H "Authorization: Bearer $BURSARY_ORG")
echo "   $(echo "$SHARE" | jq -r .summary)"

if [ "${STOP_BEFORE:-}" = "recall" ]; then
  jq -n \
    --arg run "$RUN_ID" --arg code "$CODE" --arg student "$STUDENT" \
    --arg school "$SCHOOL" --arg bursary "$BURSARY" --arg parent "$PARENT_WALLET" \
    --arg request "$REQUEST_ID" --arg deep "$DEEP" \
    --arg payerOffer "$PAYER_OFFER" --arg schoolOffer "$SCHOOL_OFFER" \
    --arg summary "$(echo "$SHARE" | jq -r .summary)" \
    '{runId:$run, payCode:$code, student:$student, schoolOrg:$school, bursaryOrg:$bursary,
      parentWallet:$parent, proofRequestId:$request, deepLink:$deep,
      payerOfferId:$payerOffer, schoolOfferId:$schoolOffer, summary:$summary}' > /tmp/school_trust_demo.json
  echo "Stopped before the school recalls the receipt."
  echo "Saved /tmp/school_trust_demo.json"
  exit 0
fi

echo "7. The school recalls the receipt (the payment was reversed)"
json -X POST "$API/api/organizations/credential-operations/credentials/$PAYER_OFFER/status" \
  -H "Authorization: Bearer $SCHOOL_ORG" \
  -d '{"action":"revoke","reason":"Payment reversed"}' >/dev/null
AFTER=$(json "$API/api/contacts/proof-requests/$REQUEST_ID" -H "Authorization: Bearer $BURSARY_ORG")
echo "   $(echo "$AFTER" | jq -r .summary)"
echo "   Public check of the parent's receipt: $(json "$API/api/verify/$PAYER_OFFER" | jq -r .status)"
if [ -n "$SCHOOL_OFFER" ]; then
  # The school's own copy is an offer in the school wallet until someone there accepts it.
  # Recall and the public check apply once that copy has been issued.
  SCHOOL_RECALL=$(curl -sS -o /tmp/school_recall_body -w '%{http_code}' -X POST \
    "$API/api/organizations/credential-operations/credentials/$SCHOOL_OFFER/status" \
    -H "Authorization: Bearer $SCHOOL_ORG" -H 'Content-Type: application/json' \
    -d '{"action":"revoke","reason":"Payment reversed"}') || true
  if [ "$SCHOOL_RECALL" = "200" ] || [ "$SCHOOL_RECALL" = "204" ]; then
    echo "   Public check of the school's copy: $(curl -sS "$API/api/verify/$SCHOOL_OFFER" | jq -r '.status // .message')"
  else
    echo "   The school's own copy is still in the school wallet (not on the public check yet)."
  fi
fi

jq -n \
  --arg run "$RUN_ID" --arg code "$CODE" --arg student "$STUDENT" \
  --arg school "$SCHOOL" --arg bursary "$BURSARY" --arg parent "$PARENT_WALLET" \
  --arg request "$REQUEST_ID" --arg deep "$DEEP" \
  --arg payerOffer "$PAYER_OFFER" --arg schoolOffer "$SCHOOL_OFFER" \
  '{runId:$run, payCode:$code, student:$student, schoolOrg:$school, bursaryOrg:$bursary,
    parentWallet:$parent, proofRequestId:$request, deepLink:$deep,
    payerOfferId:$payerOffer, schoolOfferId:$schoolOffer}' > /tmp/school_trust_demo.json

echo
echo "Open the bursary on $PORTAL (Chipo Ncube, $BURSARY_PHONE, PIN $PIN) → Contacts."
echo "Open the parent on $PHONE (Rudo Moyo, $PARENT_PHONE, PIN $PIN)."
echo "Saved /tmp/school_trust_demo.json"
