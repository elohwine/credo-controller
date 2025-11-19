# Walt.id UI Integration with Credo Controller

This guide explains how to integrate walt.id's web wallet and portal UIs with the Credo Controller backend.

## 🎯 Architecture Overview

```
┌─────────────────────┐         ┌──────────────────────┐
│   Walt.id Wallet    │────────▶│  Credo Controller    │
│   (Port 4001)       │  HTTPS  │  Backend (Port 3000) │
│   React/Next.js     │◀────────│  Express + TSOA      │
└─────────────────────┘         └──────────────────────┘
                                          │
┌─────────────────────┐                   │
│   Walt.id Portal    │───────────────────┘
│   (Port 5000)       │  HTTPS
│   React/Next.js     │
└─────────────────────┘
```

**Key principle:** We use walt.id UIs as presentation layer only. All business logic, credential issuance, verification, and data storage happens in Credo Controller.

## 🚀 Quick Start

### 1. Setup UI Components

```bash
# From credo-controller root
chmod +x scripts/setup-ui.sh
./scripts/setup-ui.sh
```

This will:
- Clone walt.id identity repository into `credo-ui/`
- Install dependencies
- Create `.env.local` files with Credo backend URLs
- Generate helper scripts

### 2. Start Services

**Terminal 1 - Credo Backend:**
```bash
yarn dev
# Runs on http://localhost:3000
```

**Terminal 2 - Web Wallet (demo):**
```bash
cd credo-ui && ./start-wallet.sh
# Runs on http://localhost:4001
```

**Terminal 3 - Web Portal:**
```bash
cd credo-ui && ./start-portal.sh
# Runs on http://localhost:5000
```
If you need to launch the portal manually (e.g., for debugging), set the `PORT` env var so Next binds to 5000:
```bash
cd credo-ui/waltid-identity/waltid-applications/waltid-web-portal
PORT=5000 yarn dev
```

## 📋 API Mapping

### Issuer Flow

#### 1. Create Credential Offer

**UI Request:**
```javascript
POST /api/issuer/credential-offers
Content-Type: application/json
Authorization: Bearer <tenant-token>

{
  "credentials": [{
    "type": ["VerifiableCredential", "PaymentReceipt"],
    "schemaId": "schema-uuid",
    "format": "jwt_vc",
    "claimsTemplate": {
      "credentialSubject": {
        "transactionId": "ECO123456",
        "amount": "100.00",
        "currency": "ZWL",
        "merchant": "SuperMart"
      }
    }
  }]
}
```

**Credo Backend:** `POST /oidc/issuer/credential-offers`

**Response:**
```json
{
  "offerId": "uuid",
  "preAuthorizedCode": "uuid",
  "offerUri": "openid-credential-offer://?credential_offer=...",
  "credentialOffer": {
    "credential_issuer": "http://localhost:3000",
    "credentials": [...],
    "grants": {
      "urn:ietf:params:oauth:grant-type:pre-authorized_code": {
        "pre-authorized_code": "uuid"
      }
    }
  }
}
```

#### 2. Redeem Offer (Wallet)

**UI Request:**
```javascript
POST /api/issuer/token
Content-Type: application/x-www-form-urlencoded

grant_type=urn:ietf:params:oauth:grant-type:pre-authorized_code
&pre_authorized_code=<code>
&subject_did=<holder-did>
```

**Credo Backend:** `POST /oidc/token`

**Response:**
```json
{
  "credentialId": "uuid",
  "verifiableCredential": "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9..."
}
```

#### 3. Store in Wallet

**UI Request:**
```javascript
POST /api/wallet/credentials
Content-Type: application/json
Authorization: Bearer <tenant-token>

{
  "credential": "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9...",
  "format": "jwt_vc"
}
```

**Credo Backend:** `POST /api/wallet/credentials`

### Verifier Flow

#### 1. Create Presentation Request

**UI Request:**
```javascript
POST /api/verifier/presentation-requests
Content-Type: application/json
Authorization: Bearer <tenant-token>

{
  "credentialTypes": ["VerifiableCredential", "PaymentReceipt"],
  "purpose": "Verify payment for order #12345"
}
```

**Credo Backend:** `POST /oidc/verifier/presentation-requests`

**Response:**
```json
{
  "requestId": "uuid",
  "nonce": "random-nonce",
  "audience": "did:key:z6Mk...",
  "presentationDefinition": {...}
}
```

#### 2. Submit Presentation (Wallet)

Wallet creates VP JWT with nonce and signs with holder DID.

#### 3. Verify Presentation

**UI Request:**
```javascript
POST /api/verifier/verify
Content-Type: application/json
Authorization: Bearer <tenant-token>

{
  "requestId": "uuid",
  "verifiablePresentation": "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9..."
}
```

**Credo Backend:** `POST /oidc/verifier/verify`

**Response:**
```json
{
  "verified": true,
  "presentation": {
    "jti": "uuid",
    "sub": "did:key:z6Mk...",
    "iss": "did:key:z6Mk...",
    "aud": "did:key:z6Mk...",
    "nonce": "random-nonce",
    "vp": {...}
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

## 🔧 UI Configuration

### Web Wallet (.env.local)

```bash
# Backend endpoints
NEXT_PUBLIC_WALLET_BACKEND_URL=http://localhost:3000/api/wallet
NEXT_PUBLIC_ISSUER_URL=http://localhost:3000/oidc
NEXT_PUBLIC_VERIFIER_URL=http://localhost:3000/oidc/verifier

# Wallet settings
NEXT_PUBLIC_APP_BASE_URL=http://localhost:4001
NEXT_PUBLIC_TENANT_ID=default

# Multi-tenant mode (optional)
# NEXT_PUBLIC_TENANT_MODE=subdomain
# NEXT_PUBLIC_TENANT_EXTRACTION=header
```

### Web Portal (.env.local)

```bash
# Backend endpoints
PORT=5000
NEXT_PUBLIC_PORTAL_BASE_URL=http://localhost:5000
NEXT_PUBLIC_ISSUER_API_BASE=http://localhost:3000/oidc/issuer
NEXT_PUBLIC_VERIFIER_API_BASE=http://localhost:3000/oidc/verifier
NEXT_PUBLIC_BACKEND_URL=http://localhost:3000

# Portal settings
NEXT_PUBLIC_TENANT_ID=default
NEXT_PUBLIC_WALLET=http://localhost:4001
```

## 🎨 Code Changes in UI

### 1. Update API Client Base URLs

**File:** `waltid-web-wallet/src/lib/api.ts`

```typescript
// Before
const ISSUER_API = 'https://issuer.portal.walt.id/api'

// After
const ISSUER_API = process.env.NEXT_PUBLIC_ISSUER_URL || 'http://localhost:3000/oidc'
```

### 2. Add Tenant Context Helper

**File:** `waltid-web-wallet/src/lib/tenant.ts`

```typescript
export function withTenant(path: string): string {
  const tenantId = process.env.NEXT_PUBLIC_TENANT_ID || 'default'
  const cleanPath = path.startsWith('/') ? path.slice(1) : path
  return `/api/${tenantId}/${cleanPath}`
}

export function getTenantId(): string {
  // Check subdomain mode
  if (process.env.NEXT_PUBLIC_TENANT_MODE === 'subdomain') {
    const subdomain = window.location.hostname.split('.')[0]
    if (subdomain && subdomain !== 'www' && subdomain !== 'localhost') {
      return subdomain
    }
  }
  return process.env.NEXT_PUBLIC_TENANT_ID || 'default'
}
```

### 3. Update Fetch Calls

**File:** `waltid-web-wallet/src/components/CredentialOffer.tsx`

```typescript
// Before
const response = await fetch(`${WALT_BACKEND}/credential-offers`, {...})

// After
const tenantId = getTenantId()
const response = await fetch(`${ISSUER_API}/issuer/credential-offers`, {
  headers: {
    'Authorization': `Bearer ${getToken()}`,
    'X-Tenant-ID': tenantId,
    'Content-Type': 'application/json'
  },
  ...
})
```

## 🔐 Authentication

### Token Management

1. **Admin creates tenant:**
```bash
curl -X POST http://localhost:3000/multi-tenancy/create-tenant \
  -H "Authorization: Bearer <admin-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "config": {"label": "EcoCash Merchant"},
    "baseUrl": "http://localhost:3000"
  }'
```

Response includes `token` - store securely in UI.

2. **UI includes token in all requests:**
```javascript
headers: {
  'Authorization': `Bearer ${tenantToken}`,
  'X-Tenant-ID': tenantId
}
```

## 🧪 Testing

### 1. Test Credential Issuance

```bash
# 1. Create tenant
curl -X POST http://localhost:3000/multi-tenancy/create-tenant \
  -H "Authorization: Bearer test-api-key" \
  -d '{"config":{"label":"Test Merchant"}}'

# Save the token from response

# 2. Register schema
curl -X POST http://localhost:3000/schemas \
  -H "Authorization: Bearer <tenant-token>" \
  -d '{
    "name": "PaymentReceipt",
    "version": "1.0.0",
    "jsonSchema": {...}
  }'

# 3. Create credential offer (UI does this)
curl -X POST http://localhost:3000/oidc/issuer/credential-offers \
  -H "Authorization: Bearer <tenant-token>" \
  -d '{
    "credentials": [{
      "type": ["VerifiableCredential", "PaymentReceipt"],
      "schemaId": "<schema-id>",
      "format": "jwt_vc",
      "claimsTemplate": {
        "credentialSubject": {
          "transactionId": "ECO123",
          "amount": "100.00"
        }
      }
    }]
  }'

# 4. Open wallet UI at http://localhost:4001
# 5. Scan QR code or paste offerUri
# 6. Accept credential
```

### 2. Test Verification

```bash
# 1. Create presentation request (verifier portal)
curl -X POST http://localhost:3000/oidc/verifier/presentation-requests \
  -H "Authorization: Bearer <tenant-token>" \
  -d '{
    "credentialTypes": ["PaymentReceipt"],
    "purpose": "Verify payment"
  }'

# 2. Open wallet, select credential, create VP
# 3. Submit to verifier
# 4. Check verification result
```

## 🌍 Multi-Tenant Deployment

### Subdomain Mode

```nginx
# nginx.conf
server {
  listen 80;
  server_name *.merchants.example.com;

  location / {
    proxy_pass http://wallet-ui:4001;
    proxy_set_header Host $host;
  }

  location /api {
    proxy_pass http://credo-backend:3000;
    proxy_set_header X-Tenant-Subdomain $subdomain;
  }
}
```

### Environment Variables per Tenant

```bash
# Tenant A
NEXT_PUBLIC_TENANT_ID=tenant-a-uuid
NEXT_PUBLIC_ISSUER_URL=https://api.example.com/oidc

# Tenant B
NEXT_PUBLIC_TENANT_ID=tenant-b-uuid
NEXT_PUBLIC_ISSUER_URL=https://api.example.com/oidc
```

## 📦 Production Build

```bash
# Build all UI components
cd credo-ui/waltid-identity
pnpm build

# Deploy to Vercel/Netlify
vercel --prod

# Or containerize
docker build -t credo-wallet-ui ./waltid-applications/waltid-web-wallet
docker build -t credo-portal-ui ./waltid-applications/waltid-web-portal
```

## 🔍 Troubleshooting

### Issue: CORS errors

**Solution:** Update `src/server.ts`:
```typescript
app.use(cors({
  origin: [
    'http://localhost:4000',
    'http://localhost:4001',
    'http://localhost:5000',
    process.env.WALLET_UI_URL,
    process.env.PORTAL_UI_URL
  ],
  credentials: true
}))
```

### Issue: Tenant not found

**Solution:** Ensure tenant token is valid:
```bash
# Decode JWT
echo "<token>" | cut -d. -f2 | base64 -d | jq
```

### Issue: Credential offer not accepted

**Solution:** Check offer format matches OIDC4VCI spec. Enable debug logs:
```bash
DEBUG=* yarn dev
```

## 📚 Additional Resources

- [Walt.id Documentation](https://docs.walt.id/)
- [OIDC4VCI Spec](https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html)
- [OIDC4VP Spec](https://openid.net/specs/openid-4-verifiable-presentations-1_0.html)
- [API Mapping Guide](./credo-ui/API_MAPPING.md)
- [Credo Documentation](https://credo.js.org/)

## 🎯 Next Steps

1. ✅ Complete basic UI wiring
2. 🔄 Test credential issuance flow
3. 🔄 Test verification flow
4. ⏳ Integrate EcoCash webhook
5. ⏳ Add Vercel AI SDK for Gen UI
6. ⏳ Deploy to production

---

**Need help?** Check [UI_Integration_plan.md](./UI_Integration_plan.md) for detailed implementation guide.
