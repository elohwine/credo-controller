# Portal UI Integration Guide

## Overview

The walt.id Web Portal has been integrated with Credo Controller to provide a visual interface for managing tenant-isolated verifiable credential models.

## Setup

### Prerequisites

- Credo backend running on `http://localhost:3000`
- API key: `test-api-key-12345` (dev default)
- Node.js 18+ and Yarn

### Configuration

**Environment Variables** (`.env.local` in portal directory):

```bash
NEXT_PUBLIC_VC_REPO=http://localhost:3000
NEXT_PUBLIC_CREDO_API_KEY=test-api-key-12345
```

### Running the Portal

```bash
cd credo-ui/waltid-identity/waltid-applications/waltid-web-portal
yarn install
yarn dev
```

Portal will start on: **http://localhost:3003**

## Authentication Flow

The portal implements a **three-step authentication flow**:

```
API Key → Root Token (RestRootAgentWithTenants)
         ↓
Root Token → Create/Get Tenant → Tenant Token (RestTenantAgent)
         ↓
Tenant Token → Access Protected Endpoints (schemas, credential-definitions)
```

### Implementation (_app.tsx)

```typescript
// 1. Get root token
const rootTokenRes = await axios.post(`${credoBackend}/agent/token`, {}, {
  headers: { Authorization: apiKey }
})
const rootToken = rootTokenRes.data.token

// 2. Create or retrieve tenant (cached in localStorage)
let tenantId = localStorage.getItem('credoTenantId')
if (!tenantId) {
  const createRes = await axios.post(`${credoBackend}/multi-tenancy/create-tenant`, {
    config: { label: 'Portal Tenant' }
  }, { headers: { Authorization: `Bearer ${rootToken}` } })
  tenantId = createRes.data.tenantId
  localStorage.setItem('credoTenantId', tenantId)
}

// 3. Get tenant token
const tokenRes = await axios.post(`${credoBackend}/multi-tenancy/get-token/${tenantId}`, {}, {
  headers: { Authorization: `Bearer ${rootToken}` }
})
const tenantToken = tokenRes.data.token

// 4. Use tenant token for API calls
const credDefsRes = await axios.get(`${credoBackend}/oidc/credential-definitions`, {
  headers: { Authorization: `Bearer ${tenantToken}` }
})
```

## Credential Models Page

**URL:** `http://localhost:3003/credential-models`

### Features

- **Grouped Display** by credential type (Payment, ID, Badge, Health, EHR)
- **Color-Coded Cards** matching portal theme (primary blue, green, yellow, red, orange)
- **Detailed Metadata**: Schema ID, Issuer DID, credential types, claims template
- **Expandable Claims Preview**: JSON view of credential structure
- **Real-Time Count**: Badge showing total models loaded
- **Refresh Button**: Re-fetch definitions from backend

### Component Structure

```
pages/credential-models.tsx
  ├── Authentication logic (get tenant token)
  ├── Fetch credential definitions
  └── Render CredentialDefinitionList component

components/credentials/CredentialDefinitionList.tsx
  ├── Group definitions by credentialType
  ├── Map types to theme colors & icons
  ├── Render group headers with counts
  └── Render cards with metadata & expandable claims
```

### Theme Colors

Aligned with portal's `tailwind.config.ts`:

| Category | Type | Color | Usage |
|----------|------|-------|-------|
| Payment & Transaction | `PaymentReceipt` | Green 500/700 | `border-green-500 bg-green-50` |
| Identity Documents | `GenericIDCredential` | Primary 400/700 (blue) | `border-primary-400 bg-primary-50` |
| Educational Badges | `OpenBadge` | Yellow 500/700 | `border-yellow-500 bg-yellow-50` |
| mDoc Health Records | `MdocHealthSummary` | Red 400/700 | `border-red-400 bg-red-50` |
| EHR Clinical Data | `EHRSummary` | Orange 500/700 | `border-orange-500 bg-orange-50` |

## Data Flow

```
Backend SQLite (persistence.db)
    ↓
GET /oidc/credential-definitions (tenant-scoped)
    ↓
Portal _app.tsx Context
    ↓
credential-models.tsx Page
    ↓
CredentialDefinitionList Component
    ↓
Grouped Cards with Theme Colors
```

## Usage

### 1. Start Backend & Seed Models

```bash
# Terminal 1: Start backend
cd /home/eloh_/PROJECTS/credo-controller
yarn tsnd --respawn samples/simpleStart.ts

# Terminal 2: Seed credential models
yarn seed:models --apiKey test-api-key-12345
```

### 2. Start Portal

```bash
# Terminal 3: Start portal
cd credo-ui/waltid-identity/waltid-applications/waltid-web-portal
yarn dev
```

### 3. Access Credential Models

1. Navigate to: `http://localhost:3003/credential-models`
2. Portal authenticates automatically via `_app.tsx`
3. Tenant created/cached in localStorage (`credoTenantId`)
4. Credential definitions fetched and displayed grouped by type

## Troubleshooting

### Issue: 401 Unauthorized on `/oidc/credential-definitions`

**Cause:** Using root token instead of tenant token  
**Fix:** Ensure tenant token is used for protected endpoints

```typescript
// ❌ Wrong: Using root token
axios.get('/oidc/credential-definitions', {
  headers: { Authorization: `Bearer ${rootToken}` }
})

// ✅ Correct: Using tenant token
axios.get('/oidc/credential-definitions', {
  headers: { Authorization: `Bearer ${tenantToken}` }
})
```

### Issue: Empty array returned from backend

**Cause:** No credential definitions seeded  
**Fix:**

```bash
yarn seed:models --apiKey test-api-key-12345
```

### Issue: Portal not loading credential definitions

**Cause:** Backend not running or CORS blocked  
**Fix:**

1. Verify backend is running: `curl http://localhost:3000/docs`
2. Check CORS configuration in `src/server.ts` includes `http://localhost:3003`
3. Check browser console for errors

### Issue: Tenant created on every page refresh

**Cause:** localStorage not persisting  
**Fix:** Check browser privacy settings (ensure localStorage is enabled)

## Adding New Credential Types

### 1. Backend: Add Schema & Definition

```bash
# Edit scripts/seed-vc-models.ts
# Add new schema and credential definition

yarn seed:models --apiKey test-api-key-12345
```

### 2. Portal: Update Theme Mapping

**Edit:** `components/credentials/CredentialDefinitionList.tsx`

```typescript
const typeMetadata: Record<string, { label: string; colorClass: string; iconBg: string }> = {
  ...existingTypes,
  MyNewType: {
    label: '🔧 My New Category',
    colorClass: 'border-purple-500 bg-purple-50',
    iconBg: 'bg-purple-700',
  },
}
```

### 3. Refresh Portal

```bash
# Restart portal (if needed)
cd credo-ui/waltid-identity/waltid-applications/waltid-web-portal
yarn dev
```

Navigate to `http://localhost:3003/credential-models` — new category appears!

## API Endpoints Used

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/agent/token` | POST | API Key | Get root token |
| `/multi-tenancy/create-tenant` | POST | Root Token | Create tenant |
| `/multi-tenancy/get-token/:tenantId` | POST | Root Token | Get tenant token |
| `/oidc/credential-definitions` | GET | Tenant Token | List credential definitions |
| `/oidc/schemas` | GET | Tenant Token | List schemas |
| `/agent/health/database` | GET | None | Database stats |

## Context Providers

### EnvContext

Provides environment variables to all pages:

```typescript
const env = useContext(EnvContext)
const backendUrl = env.NEXT_PUBLIC_VC_REPO
```

### CredentialsContext

Provides available credentials for issuance flows:

```typescript
const [availableCredentials, setAvailableCredentials] = useContext(CredentialsContext)
```

**Note:** `CredentialsContext` is populated during authentication in `_app.tsx`.

## Component Props

### CredentialDefinitionList

```typescript
interface CredentialDefinitionListProps {
  definitions: CredentialDefinition[]
}

interface CredentialDefinition {
  credentialDefinitionId: string
  name: string
  version: string
  schemaId: string
  issuerDid: string
  credentialType: string[]
  format: string
  claimsTemplate: Record<string, any>
  createdAt: string
}
```

## Testing

### Manual Testing

```bash
# 1. Check backend health
curl http://localhost:3000/agent/health/database | jq

# Expected: { status: "healthy", stats: { schemas: 5, credentialDefinitions: 5, ... } }

# 2. Test authentication flow
# Open browser DevTools → Console
# Navigate to: http://localhost:3003/credential-models
# Check console logs:
#   [Credo Auth] Got root token role: RestRootAgentWithTenants
#   [Credo Auth] Created tenant: <tenantId>
#   [Credo Auth] Got tenant token for existing tenant <tenantId> role: RestTenantAgent

# 3. Verify display
# Should see grouped credential cards by type
# Expand claims template to verify JSON structure
```

### Integration Testing

```bash
# E2E test for portal credential models page
yarn test tests/e2e/portal-credential-models.spec.ts
```

## Performance

- **Tenant Token Caching**: localStorage prevents redundant tenant creation
- **Lazy Loading**: Credential definitions fetched on-demand (not on every route)
- **Database Indexing**: `idx_creddef_tenant_definition` speeds up tenant-scoped queries

## Security

- **API Key Authentication**: Root token requires API key header
- **JWT Scope Enforcement**: Tenant endpoints reject root tokens (enforced by `@Security('jwt', ['tenant'])`)
- **Tenant Isolation**: Database queries filter by `tenant_id` column
- **CORS Whitelist**: Only `localhost:3000-3003` origins allowed

## Future Enhancements

- [ ] **Credential Issuance UI**: Issue credentials directly from portal
- [ ] **Schema Editor**: Visual schema builder with form validation
- [ ] **Credential Preview**: Mock credential rendering before issuance
- [ ] **Batch Operations**: Bulk issue credentials from CSV upload
- [ ] **Analytics Dashboard**: Issuance/verification metrics per model
- [ ] **Template Marketplace**: Browse/import pre-built credential models

## References

- [walt.id Web Portal](https://github.com/walt-id/waltid-identity)
- [Credo Backend API Docs](http://localhost:3000/docs)
- [CREDENTIAL_MODELS.md](./CREDENTIAL_MODELS.md)

---

**Last Updated:** 2025-01-24  
**Maintained By:** Credo Controller Team
