#!/bin/bash

# Walt.id UI Integration Setup Script
# This script clones and configures walt.id UI components to work with Credo backend

set -e

CREDO_ROOT=$(pwd)
UI_DIR="$CREDO_ROOT/credo-ui"

echo "🎨 Setting up walt.id UI components for Credo Controller..."
echo ""

# Check if we're in the project root
if [ ! -f "package.json" ]; then
  echo "❌ Error: Please run this script from the credo-controller root directory"
  exit 1
fi

# Create UI directory
echo "📁 Creating UI directory..."
mkdir -p "$UI_DIR"

# Clone walt.id identity repository
echo "📦 Cloning walt.id identity repository..."
if [ -d "$UI_DIR/waltid-identity" ]; then
  echo "⚠️  waltid-identity already exists, skipping clone..."
else
  git clone https://github.com/walt-id/waltid-identity.git "$UI_DIR/waltid-identity"
fi

cd "$UI_DIR/waltid-identity"

# Check for package manager
echo "🔍 Detecting package manager..."
if command -v pnpm &> /dev/null; then
  PKG_MGR="pnpm"
elif command -v yarn &> /dev/null; then
  PKG_MGR="yarn"
else
  PKG_MGR="npm"
fi

echo "✅ Using $PKG_MGR"

# Install dependencies
echo "📦 Installing dependencies (this may take a few minutes)..."
$PKG_MGR install

# Create environment files
echo "⚙️  Creating environment configuration files..."

# Web Wallet environment
WALLET_DIR="$UI_DIR/waltid-identity/waltid-applications/waltid-web-wallet"
if [ -d "$WALLET_DIR" ]; then
  cat > "$WALLET_DIR/.env.local" << 'EOF'
# Credo Backend Configuration for Walt.id Web Wallet
NEXT_PUBLIC_WALLET_BACKEND_URL=http://localhost:3000/api/wallet
NEXT_PUBLIC_ISSUER_URL=http://localhost:3000/oidc
NEXT_PUBLIC_VERIFIER_URL=http://localhost:3000/oidc/verifier
NEXT_PUBLIC_APP_BASE_URL=http://localhost:4001
NEXT_PUBLIC_TENANT_ID=default

# Optional: Multi-tenant support
# NEXT_PUBLIC_TENANT_MODE=subdomain
EOF
  echo "✅ Created $WALLET_DIR/.env.local"
fi

# Web Portal environment
PORTAL_DIR="$UI_DIR/waltid-identity/waltid-applications/waltid-web-portal"
if [ -d "$PORTAL_DIR" ]; then
  cat > "$PORTAL_DIR/.env.local" << 'EOF'
# Credo Backend Configuration for Walt.id Web Portal
PORT=5000
NEXT_PUBLIC_PORTAL_BASE_URL=http://localhost:5000
NEXT_PUBLIC_ISSUER_API_BASE=http://localhost:3000/oidc/issuer
NEXT_PUBLIC_VERIFIER_API_BASE=http://localhost:3000/oidc/verifier
NEXT_PUBLIC_TENANT_ID=default
NEXT_PUBLIC_BACKEND_URL=http://localhost:3000
NEXT_PUBLIC_WALLET=http://localhost:4001

# Multi-tenancy
# NEXT_PUBLIC_TENANT_MODE=subdomain
EOF
  echo "✅ Created $PORTAL_DIR/.env.local"
fi

# Create helper scripts
echo "📝 Creating helper scripts..."

cat > "$UI_DIR/start-wallet.sh" << 'EOF'
#!/bin/bash
cd "$(dirname "$0")/waltid-identity/waltid-applications/waltid-web-wallet"
pnpm dev
EOF
chmod +x "$UI_DIR/start-wallet.sh"

cat > "$UI_DIR/start-portal.sh" << 'EOF'
#!/bin/bash
cd "$(dirname "$0")/waltid-identity/waltid-applications/waltid-web-portal"
PORT=5000 pnpm dev
EOF
chmod +x "$UI_DIR/start-portal.sh"

cat > "$UI_DIR/build-all.sh" << 'EOF'
#!/bin/bash
cd "$(dirname "$0")/waltid-identity"
pnpm build
EOF
chmod +x "$UI_DIR/build-all.sh"

# Create integration helper module
echo "🔧 Creating integration helper module..."
mkdir -p "$CREDO_ROOT/src/utils/ui-integration"

cat > "$CREDO_ROOT/src/utils/ui-integration/tenantHelper.ts" << 'EOF'
/**
 * Helper utilities for multi-tenant UI integration
 */

export function withTenant(tenantId: string, path: string): string {
  // Remove leading slash if present
  const cleanPath = path.startsWith('/') ? path.slice(1) : path
  return `/api/${tenantId}/${cleanPath}`
}

export function extractTenantFromRequest(req: any): string {
  // Priority: header > subdomain > query param > default
  
  // 1. Check X-Tenant-ID header
  const headerTenant = req.headers['x-tenant-id']
  if (headerTenant) return headerTenant
  
  // 2. Check subdomain (e.g., tenant1.example.com)
  const host = req.headers.host || ''
  const subdomain = host.split('.')[0]
  if (subdomain && subdomain !== 'www' && subdomain !== 'localhost') {
    return subdomain
  }
  
  // 3. Check query parameter
  const queryTenant = req.query?.tenantId
  if (queryTenant) return queryTenant
  
  // 4. Default tenant
  return process.env.DEFAULT_TENANT_ID || 'default'
}

export interface TenantContext {
  tenantId: string
  baseUrl: string
  issuerDid?: string
  verifierDid?: string
}

export function buildTenantContext(req: any, tenantId?: string): TenantContext {
  const tenant = tenantId || extractTenantFromRequest(req)
  const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http'
  const host = req.headers.host
  
  return {
    tenantId: tenant,
    baseUrl: `${protocol}://${host}`,
  }
}
EOF

# Create API adapter documentation
cat > "$UI_DIR/API_MAPPING.md" << 'EOF'
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
    'http://localhost:4000',  // dev wallet
    'http://localhost:4001',  // demo wallet
    'http://localhost:5000',  // portal
    process.env.WALLET_UI_URL,
    process.env.PORTAL_UI_URL
  ],
  credentials: true
}))
```
EOF

echo ""
echo "✅ Setup complete!"
echo ""
echo "📋 Next steps:"
echo "   1. Start Credo backend:"
echo "      cd $CREDO_ROOT && yarn dev"
echo ""
echo "   2. Start Web Wallet (in new terminal):"
echo "      cd $UI_DIR && ./start-wallet.sh"
echo "      → http://localhost:4001"
echo ""
echo "   3. Start Web Portal (in new terminal):"
echo "      cd $UI_DIR && ./start-portal.sh"
echo "      → http://localhost:5000"
echo ""
echo "📚 Documentation:"
echo "   - API Mapping: $UI_DIR/API_MAPPING.md"
echo "   - Wallet env: $WALLET_DIR/.env.local"
echo "   - Portal env: $PORTAL_DIR/.env.local"
echo ""
echo "🔧 To customize tenant configuration, edit the .env.local files"
echo ""
