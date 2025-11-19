# Credo Controller API Quick Reference for UI Integration

## Base URL
```
http://localhost:3000
```

## Authentication
All requests (except public metadata) require:
```
Authorization: Bearer <tenant-token>
X-Tenant-ID: <tenant-id>  # Optional but recommended
```

---

## 🏢 Multi-Tenancy APIs

### Create Tenant
```bash
POST /multi-tenancy/create-tenant
Auth: Admin API Key
Body: {
  "config": {"label": "Merchant Name"},
  "baseUrl": "https://merchant.example.com"
}
Response: {
  "id": "tenant-uuid",
  "token": "jwt-token",
  "issuerDid": "did:key:z6Mk...",
  "verifierDid": "did:key:z6Mk..."
}
```

### Get Tenant Info
```bash
GET /multi-tenancy/{tenantId}
Auth: Admin or Tenant Token
```

---

## 💳 Wallet APIs (New)

### Get Wallet Metadata
```bash
GET /api/wallet/metadata
Auth: Tenant Token
Response: {
  "tenantId": "uuid",
  "holderDid": "did:key:z6Mk...",
  "credentials": [],
  "issuerMetadata": {...},
  "verifierMetadata": {...}
}
```

### Store Credential
```bash
POST /api/wallet/credentials
Auth: Tenant Token
Body: {
  "credential": "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9...",
  "format": "jwt_vc"
}
Response: {"id": "cred-uuid", "stored": true}
```

### List Credentials
```bash
GET /api/wallet/credentials
Auth: Tenant Token
Response: [
  {
    "id": "cred-uuid",
    "type": ["VerifiableCredential", "PaymentReceipt"],
    "issuer": "did:key:z6Mk...",
    "issuanceDate": "2025-11-12T13:00:00Z",
    "credentialSubject": {...}
  }
]
```

### Get Credential
```bash
GET /api/wallet/credentials/{id}
Auth: Tenant Token
```

### Delete Credential
```bash
POST /api/wallet/credentials/{id}/delete
Auth: Tenant Token
Response: {"deleted": true}
```

---

## 🎫 Issuer APIs

### Create Credential Offer
```bash
POST /oidc/issuer/credential-offers
Auth: Tenant Token
Body: {
  "credentials": [{
    "type": ["VerifiableCredential", "PaymentReceipt"],
    "schemaId": "schema-uuid",
    "format": "jwt_vc",
    "claimsTemplate": {
      "credentialSubject": {
        "transactionId": "ECO123456",
        "amount": "100.00",
        "currency": "ZWL"
      }
    },
    "issuerDid": "did:key:z6Mk..."
  }],
  "issuerDid": "did:key:z6Mk..."
}
Response: {
  "offerId": "uuid",
  "preAuthorizedCode": "uuid",
  "offerUri": "openid-credential-offer://...",
  "credentialOffer": {...}
}
```

### Get Credential Offer (Public)
```bash
GET /oidc/credential-offers/{preAuthorizedCode}
Auth: None (public)
Response: {
  "credential_issuer": "https://...",
  "credentials": [...],
  "grants": {...}
}
```

### Token Exchange (Issue Credential)
```bash
POST /oidc/token
Auth: None (uses pre-authorized code)
Content-Type: application/x-www-form-urlencoded
Body:
  grant_type=urn:ietf:params:oauth:grant-type:pre-authorized_code
  &pre_authorized_code=<code>
  &subject_did=<holder-did>

Response: {
  "credentialId": "uuid",
  "verifiableCredential": "eyJ... (JWT)"
}
```

### List Issued Credentials
```bash
GET /oidc/issuer/credentials
Auth: Tenant Token
Response: [
  {
    "id": "uuid",
    "type": ["VerifiableCredential", "PaymentReceipt"],
    "issuedAt": "2025-11-12T13:00:00Z",
    "holder": "did:key:z6Mk...",
    "revoked": false
  }
]
```

### Get Issued Credential
```bash
GET /oidc/issuer/credentials/{id}
Auth: Tenant Token
```

### Revoke Credential
```bash
POST /oidc/issuer/credentials/{id}/revoke
Auth: Tenant Token
Response: {"revoked": true}
```

---

## ✅ Verifier APIs

### Create Presentation Request
```bash
POST /oidc/verifier/presentation-requests
Auth: Tenant Token
Body: {
  "credentialTypes": ["VerifiableCredential", "PaymentReceipt"],
  "purpose": "Verify payment for order #12345"
}
Response: {
  "requestId": "uuid",
  "nonce": "random-nonce",
  "audience": "did:key:z6Mk...",
  "presentationDefinition": {...}
}
```

### Verify Presentation
```bash
POST /oidc/verifier/verify
Auth: Tenant Token
Body: {
  "requestId": "uuid",
  "verifiablePresentation": "eyJ... (VP JWT)"
}
Response: {
  "verified": true,
  "presentation": {
    "jti": "uuid",
    "sub": "did:key:z6Mk...",
    "iss": "did:key:z6Mk...",
    "aud": "did:key:z6Mk...",
    "nonce": "random-nonce"
  },
  "checks": {
    "signature": true,
    "nonce": true,
    "audience": true,
    "revocation": true,
    "schema": true
  }
}
```

---

## 📜 Metadata APIs (Public)

### Issuer Metadata (OIDC4VCI)
```bash
GET /{tenantId}/.well-known/openid-credential-issuer
Auth: None (public)
Response: {
  "credential_issuer": "https://...",
  "credential_endpoint": "https://.../oidc/token",
  "credentials_supported": [...]
}
```

### Verifier Metadata (OIDC4VP)
```bash
GET /{tenantId}/.well-known/openid-verifier
Auth: None (public)
Response: {
  "verifier": "https://...",
  "presentation_definition_endpoint": "https://.../oidc/verifier/presentation-requests"
}
```

### Issuer DID
```bash
GET /{tenantId}/issuer/did
Auth: None (public)
Response: {
  "did": "did:key:z6Mk...",
  "method": "key",
  "keyType": "Ed25519"
}
```

---

## 📋 Schema APIs

### Register Schema
```bash
POST /schemas
Auth: Tenant Token
Body: {
  "name": "PaymentReceipt",
  "version": "1.0.0",
  "jsonSchema": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "properties": {
      "credentialSubject": {
        "type": "object",
        "properties": {
          "transactionId": {"type": "string"},
          "amount": {"type": "string"},
          "currency": {"type": "string"}
        },
        "required": ["transactionId", "amount"]
      }
    }
  }
}
Response: {
  "schemaId": "uuid",
  "name": "PaymentReceipt",
  "version": "1.0.0"
}
```

### Get Schema
```bash
GET /schemas/{schemaId}
Auth: Tenant Token
```

### List Schemas
```bash
GET /schemas
Auth: Tenant Token
```

---

## 🔑 DID APIs

### Create DID
```bash
POST /dids/create-key
Auth: Tenant Token
Body: {
  "keyType": "Ed25519"  # Optional
}
Response: {
  "did": "did:key:z6Mk...",
  "verificationMethod": [{...}]
}
```

### Resolve DID
```bash
GET /dids/resolve/{did}
Auth: Tenant Token
```

---

## 🔄 Common Flows

### Flow 1: Credential Issuance
```
1. POST /oidc/issuer/credential-offers (issuer portal)
   → Get offerUri

2. User scans QR / opens offerUri in wallet

3. GET /oidc/credential-offers/{code} (wallet fetches offer)

4. POST /oidc/token (wallet redeems code)
   → Get JWT VC

5. POST /api/wallet/credentials (wallet stores VC)
```

### Flow 2: Verification
```
1. POST /oidc/verifier/presentation-requests (verifier portal)
   → Get requestId, nonce

2. Wallet creates VP JWT with nonce

3. POST /oidc/verifier/verify (verifier checks VP)
   → verified: true/false
```

### Flow 3: Tenant Setup
```
1. POST /multi-tenancy/create-tenant (admin)
   → Get tenant token, issuer/verifier DIDs

2. POST /schemas (tenant registers schema)

3. Ready to issue/verify credentials
```

---

## 🌐 CORS Headers

Backend automatically sets:
```
Access-Control-Allow-Origin: http://localhost:3000, http://localhost:4000, http://localhost:4001, http://localhost:5000
Access-Control-Allow-Credentials: true
Access-Control-Allow-Headers: Authorization, Content-Type, X-Tenant-ID
```

---

## 🧪 Test Commands

### Create Test Tenant
```bash
curl -X POST http://localhost:3000/multi-tenancy/create-tenant \
  -H "Authorization: Bearer test-api-key" \
  -H "Content-Type: application/json" \
  -d '{"config":{"label":"Test Merchant"}}'
```

### Test Wallet Metadata
```bash
curl http://localhost:3000/api/wallet/metadata \
  -H "Authorization: Bearer <tenant-token>"
```

### Test Credential Offer
```bash
curl -X POST http://localhost:3000/oidc/issuer/credential-offers \
  -H "Authorization: Bearer <tenant-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "credentials": [{
      "type": ["VerifiableCredential", "PaymentReceipt"],
      "format": "jwt_vc",
      "claimsTemplate": {
        "credentialSubject": {
          "amount": "100.00",
          "currency": "ZWL"
        }
      }
    }]
  }'
```

---

## 📊 Response Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request (invalid input)
- `401` - Unauthorized (missing/invalid token)
- `404` - Not Found
- `500` - Internal Server Error

---

**See also:**
- [UI Integration Guide](./docs/UI_INTEGRATION.md) - Full setup instructions
- [API Mapping](./credo-ui/API_MAPPING.md) - Detailed endpoint mapping
- [OpenAPI Docs](http://localhost:3000/docs) - Interactive API explorer
