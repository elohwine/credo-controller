# ReceiptVC Schema Documentation

> JSON-LD schema for Payment Receipt Verifiable Credential

---

## Schema Definition

**Credential Type:** `ReceiptVC` / `PaymentReceiptVC`  
**Format:** `jwt_vc_json`

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `receiptId` | string | ✅ | Unique receipt identifier |
| `orderId` | string | ✅ | Reference to cart/order |
| `transactionId` | string | ✅ | EcoCash transaction reference |
| `merchantDid` | string | ✅ | Issuer merchant DID |
| `merchantName` | string | ✅ | Human-readable merchant name |
| `amount` | number | ✅ | Payment amount |
| `currency` | string | ✅ | Currency code (USD, ZWL) |
| `paymentMethod` | string | ✅ | Payment method (EcoCash) |
| `timestamp` | string | ✅ | ISO 8601 timestamp |
| `items` | array | ❌ | Line items (optional) |
| `buyerPhone` | string | ❌ | Buyer phone (hashed) |

---

## JSON-LD Context

```json
{
  "@context": [
    "https://www.w3.org/2018/credentials/v1",
    {
      "ReceiptVC": "https://credentis.io/schemas/ReceiptVC",
      "receiptId": "https://credentis.io/schemas/receiptId",
      "orderId": "https://credentis.io/schemas/orderId",
      "transactionId": "https://credentis.io/schemas/transactionId",
      "merchantDid": "https://credentis.io/schemas/merchantDid",
      "merchantName": "https://credentis.io/schemas/merchantName",
      "amount": "https://credentis.io/schemas/amount",
      "currency": "https://credentis.io/schemas/currency",
      "paymentMethod": "https://credentis.io/schemas/paymentMethod",
      "timestamp": "https://credentis.io/schemas/timestamp"
    }
  ]
}
```

---

## Example Credential

```json
{
  "@context": [
    "https://www.w3.org/2018/credentials/v1"
  ],
  "type": ["VerifiableCredential", "ReceiptVC"],
  "issuer": "did:key:z6Mkf...",
  "issuanceDate": "2026-01-30T12:00:00Z",
  "credentialSubject": {
    "receiptId": "RCP-2026-001234",
    "orderId": "ORD-2026-005678",
    "transactionId": "ECOCASH-ABC12345",
    "merchantDid": "did:key:z6Mkf...",
    "merchantName": "Harare Groceries",
    "amount": 25.50,
    "currency": "USD",
    "paymentMethod": "EcoCash",
    "timestamp": "2026-01-30T12:00:00Z"
  }
}
```

---

## OIDC4VCI Flow

1. **Payment Success** → EcoCash webhook received
2. **Issue VC** → `CredentialIssuanceService.createCredentialOffer()`
3. **Generate Offer** → `credential_offer_uri` returned
4. **Wallet Accept** → User accepts offer in embedded wallet
5. **Credential Stored** → ReceiptVC in holder wallet

---

## Verifier Endpoint

```
GET /verify/{shortToken}
```

Returns verification result + receipt summary for driver verification.

---

## Implementation Files

| File | Purpose |
|------|---------|
| `src/services/modelRegistry.ts` | Schema registration |
| `src/controllers/finance/FinanceController.ts` | Receipt issuance endpoint |
| `src/controllers/webhooks/EcoCashWebhookController.ts` | Payment → VC trigger |
