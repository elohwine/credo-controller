# Credential Models System

## Overview

The Credo Controller implements a **plug-and-play credential model system** that allows tenant-isolated, persistent storage of JSON schemas and credential definitions. This system is designed to support multiple verifiable credential formats including JWT, AnonCreds, W3C VC Data Model, mDoc (ISO 18013-5), and OpenBadges 3.0.

## Architecture

### Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Credential Model Stack                    │
├─────────────────────────────────────────────────────────────┤
│  1. Portal UI (grouped display with theme colors)           │
│  2. OIDC Issuer/Verifier Controllers (API endpoints)        │
│  3. schemaStore + credentialDefinitionStore (SQLite)         │
│  4. DatabaseManager (persistence layer)                     │
│  5. Askar Wallet (tenant keys + signatures)                 │
└─────────────────────────────────────────────────────────────┘
```

### Persistence Layer

**Database:** SQLite via `better-sqlite3`  
**Location:** `./data/persistence.db` (configurable via `PERSISTENCE_DB_PATH`)  
**Initialization:** `DatabaseManager.initialize()` called in `samples/simpleStart.ts`

#### Schema: `json_schemas` Table

```sql
CREATE TABLE json_schemas (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  schema_id TEXT NOT NULL,       -- UUID for schema reference
  schema_data TEXT NOT NULL,      -- JSON stringified schema
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(tenant_id, schema_id)
);
CREATE INDEX idx_schemas_tenant_schema ON json_schemas(tenant_id, schema_id);
```

#### Schema: `credential_definitions` Table

```sql
CREATE TABLE credential_definitions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  credential_definition_id TEXT NOT NULL,
  schema_id TEXT NOT NULL,                 -- FK to json_schemas.schema_id
  definition_data TEXT NOT NULL,           -- JSON with name, version, credentialType, claimsTemplate, format
  issuer_did TEXT NOT NULL,
  tag TEXT,                                -- name@version for queries
  created_at TEXT NOT NULL,
  UNIQUE(tenant_id, credential_definition_id),
  FOREIGN KEY(schema_id) REFERENCES json_schemas(schema_id)
);
CREATE INDEX idx_creddef_tenant_definition ON credential_definitions(tenant_id, credential_definition_id);
```

## Tenant Isolation

All schemas and credential definitions are **tenant-scoped**:

- Each tenant has isolated Askar wallet profile
- Each tenant has isolated DIDs (issuer + verifier)
- Each tenant's schemas/definitions stored with `tenant_id` column
- Queries automatically filter by tenant context from JWT token

**Security:** Cross-tenant access prevented at database query level.

## Supported Credential Models

### 1. Payment & Transaction (PaymentReceipt)

**Use Case:** E-commerce receipts, invoices, payment confirmations  
**Claims:** amount, currency, transactionId, merchantName, paymentMethod, timestamp, description

```json
{
  "credentialType": ["VerifiableCredential", "PaymentReceipt"],
  "format": "jwt_vc",
  "claimsTemplate": {
    "credentialSubject": {
      "amount": "number",
      "currency": "string",
      "transactionId": "string",
      "merchantName": "string",
      "paymentMethod": "string",
      "timestamp": "ISO8601 datetime",
      "description": "string"
    }
  }
}
```

### 2. Identity Documents (GenericIDCredential)

**Use Case:** Government IDs, employee badges, membership cards  
**Claims:** fullName, dateOfBirth, documentNumber, issueDate, expiryDate, nationality, photoUrl

```json
{
  "credentialType": ["VerifiableCredential", "GenericIDCredential"],
  "format": "jwt_vc",
  "claimsTemplate": {
    "credentialSubject": {
      "fullName": "string",
      "dateOfBirth": "YYYY-MM-DD",
      "documentNumber": "string",
      "issueDate": "YYYY-MM-DD",
      "expiryDate": "YYYY-MM-DD",
      "nationality": "string",
      "photoUrl": "string (optional)"
    }
  }
}
```

### 3. Educational Badges (OpenBadge 3.0)

**Use Case:** Course completion, skill certifications, micro-credentials  
**Claims:** badgeName, description, issuerName, achievementType, achievementDate, criteriaUrl, imageUrl

```json
{
  "credentialType": ["VerifiableCredential", "OpenBadge"],
  "format": "jwt_vc",
  "claimsTemplate": {
    "credentialSubject": {
      "badgeName": "string",
      "description": "string",
      "issuerName": "string",
      "achievementType": "string",
      "achievementDate": "YYYY-MM-DD",
      "criteriaUrl": "string",
      "imageUrl": "string"
    }
  }
}
```

### 4. mDoc Health Records (ISO 18013-5)

**Use Case:** Mobile driver's licenses, health cards, vaccination records  
**Claims:** patientId, bloodType, allergies, medications, lastVisit, height, weight

```json
{
  "credentialType": ["VerifiableCredential", "MdocHealthSummary"],
  "format": "jwt_vc",
  "claimsTemplate": {
    "credentialSubject": {
      "patientId": "string",
      "bloodType": "string",
      "allergies": "array of strings",
      "medications": "array of strings",
      "lastVisit": "YYYY-MM-DD",
      "height": "number (cm)",
      "weight": "number (kg)"
    }
  }
}
```

### 5. EHR Clinical Data (HL7 FHIR)

**Use Case:** Hospital records, lab results, clinical observations  
**Claims:** patientId, facilityName, visitDate, diagnosis, treatmentPlan, labResults

```json
{
  "credentialType": ["VerifiableCredential", "EHRSummary"],
  "format": "jwt_vc",
  "claimsTemplate": {
    "credentialSubject": {
      "patientId": "string",
      "facilityName": "string",
      "visitDate": "YYYY-MM-DD",
      "diagnosis": "array of strings",
      "treatmentPlan": "string",
      "labResults": "object"
    }
  }
}
```

## Usage

### Automatic Seeding (Default Models)

When a tenant is created, **PaymentReceipt** and **GenericIDCredential** are automatically seeded:

```typescript
// src/services/TenantProvisioningService.ts
await registerDefaultModelsForTenant({ issuerDid: result.issuerDid, tenantId: tenantRecord.id })
```

### Manual Seeding (All 5 Models)

```bash
# Seed all models for a tenant
yarn seed:models --apiKey test-api-key-12345

# Output:
# ✓ Root token obtained
# ✓ Tenant created/retrieved: abc123
# ✓ Schemas registered: PaymentReceipt, GenericIDCredential, OpenBadge, MdocHealthSummary, EHRSummary
# ✓ Credential definitions registered: 5 models
```

### API Endpoints

#### Register Schema

```bash
POST /oidc/schemas
Authorization: Bearer <tenant-token>
Content-Type: application/json

{
  "name": "PaymentReceipt",
  "version": "1.0.0",
  "jsonSchema": {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "properties": {
      "amount": { "type": "number" },
      "currency": { "type": "string" }
    },
    "required": ["amount", "currency"]
  }
}
```

#### Register Credential Definition

```bash
POST /oidc/credential-definitions
Authorization: Bearer <tenant-token>
Content-Type: application/json

{
  "name": "PaymentReceiptDef",
  "version": "1.0.0",
  "schemaId": "uuid-from-schema-registration",
  "issuerDid": "did:key:z6Mk...",
  "credentialType": ["VerifiableCredential", "PaymentReceipt"],
  "format": "jwt_vc",
  "claimsTemplate": {
    "credentialSubject": {
      "amount": 0,
      "currency": "USD",
      "transactionId": "",
      "merchantName": "",
      "paymentMethod": "",
      "timestamp": "",
      "description": ""
    }
  }
}
```

#### List Credential Definitions

```bash
GET /oidc/credential-definitions
Authorization: Bearer <tenant-token>

# Response: Array of CredentialDefinitionRecord
```

## Portal UI

### Grouped Display

Navigate to: **http://localhost:3003/credential-models**

Credential definitions are grouped by type:

- 💳 **Payment & Transaction** (green theme)
- 🆔 **Identity Documents** (blue theme)
- 🏅 **Educational Badges** (yellow theme)
- 🏥 **mDoc Health Records** (red theme)
- ⚕️ **EHR Clinical Data** (orange theme)

Each card displays:

- Name + Version
- Schema ID + Issuer DID (truncated)
- Credential Types (badges)
- Claims Template (expandable JSON preview)
- Creation timestamp

## Extension Guide

### Adding a New Credential Model

1. **Define the schema** in `scripts/seed-vc-models.ts`:

```typescript
const MyNewSchema = {
  name: 'MyNewCredential',
  version: '1.0.0',
  jsonSchema: {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    properties: {
      myField: { type: 'string' },
      myNumber: { type: 'number' },
    },
    required: ['myField'],
  },
}
```

2. **Define the credential definition**:

```typescript
const MyNewDef = (schemaId: string, issuerDid: string) => ({
  name: 'MyNewCredentialDef',
  version: '1.0.0',
  schemaId,
  issuerDid,
  credentialType: ['VerifiableCredential', 'MyNewCredential'],
  format: 'jwt_vc',
  claimsTemplate: {
    credentialSubject: {
      myField: '',
      myNumber: 0,
    },
  },
})
```

3. **Add to seeding arrays**:

```typescript
const schemas = [...existingSchemas, MyNewSchema]
const defs = [...existingDefs, MyNewDef]
```

4. **Update Portal UI** `components/credentials/CredentialDefinitionList.tsx`:

```typescript
const typeMetadata: Record<string, { label: string; colorClass: string; iconBg: string }> = {
  ...existingTypes,
  MyNewCredential: {
    label: '🔧 My New Category',
    colorClass: 'border-purple-500 bg-purple-50',
    iconBg: 'bg-purple-700',
  },
}
```

5. **Run seeding**:

```bash
yarn seed:models --apiKey test-api-key-12345
```

## Testing

### Backend Persistence Test

```bash
# 1. Start backend and seed models
yarn tsnd --respawn samples/simpleStart.ts
yarn seed:models --apiKey test-api-key-12345

# 2. Verify data persisted
sqlite3 data/persistence.db "SELECT COUNT(*) FROM credential_definitions;"
# Expected: 5 (or 2 if only auto-seeded)

# 3. Restart backend
pkill -f "ts-node-dev.*simpleStart"
yarn tsnd --respawn samples/simpleStart.ts

# 4. Fetch definitions via API
curl -H "Authorization: Bearer $TENANT_TOKEN" http://localhost:3000/oidc/credential-definitions | jq
# Expected: Array of 5 definitions (data persisted)
```

### Integration Test

```bash
# Full flow: register schema → register definition → list
yarn test tests/e2e/credentialModels.spec.ts
```

## Troubleshooting

### Issue: Empty array returned from `/oidc/credential-definitions`

**Cause:** DatabaseManager not initialized or no models seeded  
**Fix:**

```bash
# Check if persistence.db exists
ls -lh data/persistence.db

# If missing, ensure DatabaseManager.initialize() called in startup:
grep -n "DatabaseManager.initialize" samples/simpleStart.ts

# Seed models
yarn seed:models --apiKey test-api-key-12345
```

### Issue: Portal shows "Cannot find module 'ajv'" error

**Cause:** Compile-time TypeScript error, runtime will work  
**Fix:** Ensure `ajv@8.17.1` in `package.json` dependencies (already present)

### Issue: Definitions not persisting after backend restart

**Cause:** DatabaseManager.initialize() not called before agent setup  
**Fix:** Verify startup order in `samples/simpleStart.ts`:

```typescript
DatabaseManager.initialize({ path: dbPath }) // MUST be first
const agent = await setupAgent(...)          // After DB init
```

## Future Enhancements

- [ ] **Status List Revocation**: Per-tenant status lists for credential revocation (W3C Status List 2021)
- [ ] **Vault-Backed Secrets**: Move tenant JWT secrets from genericRecords to HashiCorp Vault
- [ ] **OpenID Metadata**: Publish `/.well-known/openid-credential-issuer` per tenant
- [ ] **Batch Import**: CSV/JSON upload for bulk credential definition registration
- [ ] **Schema Versioning**: Automatic migration support for schema updates
- [ ] **Analytics Dashboard**: Issuance/verification metrics per credential type
- [ ] **Custom Branding**: Per-tenant theme colors and logos in portal UI

## References

- [W3C Verifiable Credentials Data Model](https://www.w3.org/TR/vc-data-model/)
- [OpenBadges 3.0 Specification](https://www.imsglobal.org/spec/ob/v3p0/)
- [ISO/IEC 18013-5 mDL](https://www.iso.org/standard/69084.html)
- [HL7 FHIR Resources](https://www.hl7.org/fhir/)
- [OpenID for Verifiable Credentials](https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html)

---

**Last Updated:** 2025-01-24  
**Maintainer:** Credo Controller Team
