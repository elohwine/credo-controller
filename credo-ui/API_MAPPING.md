# Walt.id UI → Credo Backend API Mapping

## Overview
This document maps walt.id UI API calls to Credo Controller endpoints.

## Issuer APIs

### Create Credential Offer
**Walt.id UI Call:**
```
POST /api/issuer/credential-offers
```

**Credo Backend:**
```
POST /oidc/issuer/credential-offers
Authorization: Bearer <tenant-token>
Content-Type: application/json

{
  "credentials": [{
    "type": ["VerifiableCredential", "PaymentReceipt"],
    "schemaId": "schema-id",
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
```

**Response:**
```json
{
  "offerId": "uuid",
  "preAuthorizedCode": "uuid",
  "offerUri": "openid-credential-offer://...",
  "credentialOffer": {...}
}
```

### Issue Credential (Token Exchange)
**Walt.id UI Call:**
```
POST /api/issuer/token
```

**Credo Backend:**
```
POST /oidc/token
Content-Type: application/x-www-form-urlencoded

grant_type=urn:ietf:params:oauth:grant-type:pre-authorized_code
&pre_authorized_code=<code>
&subject_did=<holder-did>
```

**Response:**
```json
{
  "credentialId": "uuid",
  "verifiableCredential": "eyJ... (JWT)"
}
```

### List Issued Credentials
**Walt.id UI Call:**
```
GET /api/issuer/credentials
```

**Credo Backend:**
```
GET /oidc/issuer/credentials
Authorization: Bearer <tenant-token>
```

### Revoke Credential
**Walt.id UI Call:**
```
POST /api/issuer/credentials/{id}/revoke
```

**Credo Backend:**
```
POST /oidc/issuer/credentials/{id}/revoke
Authorization: Bearer <tenant-token>
```

## Verifier APIs

### Create Presentation Request
**Walt.id UI Call:**
```
POST /api/verifier/presentation-requests
```

**Credo Backend:**
```
POST /oidc/verifier/presentation-requests
Authorization: Bearer <tenant-token>
Content-Type: application/json

{
  "credentialTypes": ["VerifiableCredential", "PaymentReceipt"],
  "purpose": "Verify payment receipt"
}
```

**Response:**
```json
{
  "requestId": "uuid",
  "nonce": "random-nonce",
  "audience": "verifier-did",
  "presentationDefinition": {...}
}
```

### Verify Presentation
**Walt.id UI Call:**
```
POST /api/verifier/verify
```

**Credo Backend:**
```
POST /oidc/verifier/verify
Authorization: Bearer <tenant-token>
Content-Type: application/json

{
  "requestId": "uuid",
  "verifiablePresentation": "eyJ... (JWT)"
}
```

**Response:**
```json
{
  "verified": true,
  "presentation": {...},
  "checks": {
    "signature": true,
    "nonce": true,
    "audience": true,
    "revocation": true,
    "schema": true
  }
}
```

## Wallet APIs (Backend-to-Backend)

### Get Tenant Metadata
**Walt.id UI Call:**
```
GET /api/wallet/metadata
```

**Credo Backend:**
```
GET /multi-tenancy/{tenantId}/metadata
Authorization: Bearer <tenant-token>
```

### Get Issuer Metadata (OpenID)
**Walt.id UI Call:**
```
GET /.well-known/openid-credential-issuer
```

**Credo Backend:**
```
GET /{tenantId}/.well-known/openid-credential-issuer
```

### Get Verifier Metadata (OpenID)
**Walt.id UI Call:**
```
GET /.well-known/openid-verifier
```

**Credo Backend:**
```
GET /{tenantId}/.well-known/openid-verifier
```

## Multi-Tenancy

### Create Tenant
```
POST /multi-tenancy/create-tenant
Authorization: Bearer <admin-api-key>
Content-Type: application/json

{
  "config": {
    "label": "EcoCash Merchant Portal"
  },
  "baseUrl": "https://merchant.example.com"
}
```

**Response:**
```json
{
  "id": "tenant-uuid",
  "token": "jwt-token",
  "issuerDid": "did:key:z6Mk...",
  "verifierDid": "did:key:z6Mk...",
  "metadata": {
    "issuerMetadataUrl": "https://api.example.com/{tenantId}/.well-known/openid-credential-issuer",
    "verifierMetadataUrl": "https://api.example.com/{tenantId}/.well-known/openid-verifier"
  }
}
```

## Authentication Flow

1. **Admin creates tenant:**
   ```bash
   curl -X POST http://localhost:3000/multi-tenancy/create-tenant \
     -H "Authorization: Bearer <admin-key>" \
     -d '{"config":{"label":"My Org"}}'
   ```

2. **UI stores tenant token** in secure storage

3. **All subsequent API calls** include:
   ```
   Authorization: Bearer <tenant-token>
   X-Tenant-ID: <tenant-id>  # Optional, redundant with JWT
   ```

## URL Rewriting in UI

Update UI API client base URLs:

```typescript
// Before (walt.id)
const ISSUER_API = 'https://issuer.portal.walt.id/api'

// After (Credo)
const ISSUER_API = process.env.NEXT_PUBLIC_ISSUER_URL || 'http://localhost:3000/oidc'
```

## CORS Configuration

Ensure Credo backend allows UI origins:

```typescript
// src/server.ts
app.use(cors({
  origin: [
    'http://localhost:4001',  // wallet
    'http://localhost:5000',  // portal
    process.env.WALLET_UI_URL,
    process.env.PORTAL_UI_URL
  ],
  credentials: true
}))
```