# UI Wiring Summary

## ✅ Completed Changes

### 1. **Portal Configuration** (`waltid-web-portal`)

- **next.config.js**: Updated default URLs to point to Credo backend

  - `NEXT_PUBLIC_ISSUER`: `http://localhost:3000/oidc/issuer`
  - `NEXT_PUBLIC_VERIFIER`: `http://localhost:3000/oidc/verifier`
  - `NEXT_PUBLIC_VC_REPO`: `http://localhost:3000`

- **utils/getOfferUrl.tsx**:

  - Changed OpenID metadata endpoint to Credo format: `/tenants/{tenantId}/.well-known/openid-credential-issuer`
  - Transformed credential offer payload to match Credo API format
  - Added tenant authentication headers

- **pages/verify/index.tsx**:

  - Updated issuer metadata fetch to use Credo tenant endpoint
  - Changed presentation request to call `/oidc/verifier/presentation-requests`

- **pages/\_app.tsx**:

  - Replaced walt.id credential repository with Credo `/schemas/credential-definitions`
  - Added tenant authentication headers

- **.env.local**: Added all required environment variables with Credo defaults

### 2. **Wallet Configuration** (`waltid-web-wallet`)

- **nuxt.config.ts** (demo-wallet):

  - Updated devProxy to route `/wallet-api/` calls to Credo backend
  - Configured path rewriting for API compatibility

- **.env.local**:
  - Added Nuxt-specific environment variables
  - Configured wallet backend URL: `http://localhost:3000/api/wallet`

### 3. **Cleanup Actions**

Removed unnecessary files and directories:

- ❌ `waltid-libraries/` - Backend libraries not needed
- ❌ `docker compose/` - Walt.id deployment configs
- ❌ `.github/` - CI/CD workflows
- ❌ `gradle/`, `gradlew`, `build.gradle.kts` - Kotlin build files
- ❌ `waltid-android/` - Mobile app
- ❌ `waltid-cli/` - CLI tools
- ❌ `waltid-crypto-ios-testApp/` - iOS test apps
- ❌ `waltid-openid4vc-ios-testApp/` - iOS test apps
- ❌ `waltid-web-web3login/` - Web3 login component

## 📋 API Endpoint Mappings

### Issuer Flow

| Walt.id UI Call                                       | Credo Backend Endpoint                                         |
| ----------------------------------------------------- | -------------------------------------------------------------- |
| `POST /openid4vc/jwt/issue`                           | `POST /oidc/issuer/credential-offers`                          |
| `GET /{version}/.well-known/openid-credential-issuer` | `GET /tenants/{tenantId}/.well-known/openid-credential-issuer` |

### Verifier Flow

| Walt.id UI Call          | Credo Backend Endpoint                      |
| ------------------------ | ------------------------------------------- |
| `POST /openid4vc/verify` | `POST /oidc/verifier/presentation-requests` |

### Wallet Flow

| Walt.id UI Call                                         | Credo Backend Endpoint        |
| ------------------------------------------------------- | ----------------------------- |
| `GET /wallet-api/wallet/{id}/dids`                      | `GET /api/wallet/metadata`    |
| `POST /wallet-api/wallet/{id}/exchange/useOfferRequest` | `POST /oidc/token`            |
| `GET /wallet-api/wallet/{id}/credentials`               | `GET /api/wallet/credentials` |

## 🔑 Required Environment Variables

### Portal (.env.local)

```bash
NEXT_PUBLIC_TENANT_ID=default
NEXT_PUBLIC_TENANT_TOKEN=<from-tenant-creation>
NEXT_PUBLIC_ISSUER_API_BASE=http://localhost:3000/oidc/issuer
NEXT_PUBLIC_VERIFIER_API_BASE=http://localhost:3000/oidc/verifier
NEXT_PUBLIC_BACKEND_URL=http://localhost:3000
```

### Wallet (.env.local)

```bash
NUXT_PUBLIC_TENANT_ID=default
NUXT_PUBLIC_TENANT_TOKEN=<from-tenant-creation>
NUXT_PUBLIC_WALLET_BACKEND_URL=http://localhost:3000/api/wallet
NUXT_PUBLIC_ISSUER_URL=http://localhost:3000/oidc
```

## ⚠️ Known Limitations

1. **Authentication**: Tenant tokens need to be manually set in environment variables
2. **Wallet API Compatibility**: Some walt.id wallet API endpoints may not have direct Credo equivalents
3. **Credential Formats**: Only JWT VC format fully supported, SD-JWT may need additional work
4. **Schemas**: Credential schema loading expects Credo's credential definition format

## 🚀 Next Steps

1. **Start Credo Backend**: `yarn dev` (port 3000)
2. **Create Tenant**: Use `/multi-tenancy/create-tenant` endpoint
3. **Update .env files**: Add tenant token from step 2
4. **Start Portal**: `./credo-ui/start-portal.sh` (port 5000)
5. **Start Wallet**: `./credo-ui/start-wallet.sh` (port 4001)
6. **Test Flow**: Create credential offer in portal → accept in wallet → verify

## 📁 Cleaned File Structure

```
credo-ui/
├── waltid-identity/
│   ├── waltid-applications/
│   │   ├── waltid-web-portal/     # Issuer/Verifier UI (Next.js)
│   │   └── waltid-web-wallet/     # Holder Wallet UI (Nuxt.js)
│   ├── BREAKING_CHANGES.md
│   ├── CHANGELOG.md
│   ├── CONTRIBUTING.md
│   ├── LICENSE
│   └── README.md
├── API_MAPPING.md
├── WIRING_SUMMARY.md              # This file
├── start-portal.sh
├── start-wallet.sh
└── build-all.sh
```
