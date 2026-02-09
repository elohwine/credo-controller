# SSI Authentication Implementation Summary

**Date:** February 2026  
**Status:** Phase 1 Complete - Build Passing

---

## Overview

Implemented TRUE Self-Sovereign Identity (SSI) authentication for the Credentis platform. The core principle: **ZERO PII stored in the database**. All personal information (phone, email, name) lives exclusively in the user's wallet as a `PlatformIdentityVC`.

---

## Architecture

### SSI Principles Applied

| Principle | Implementation |
|-----------|----------------|
| User controls identity | PII stored in wallet VC, not our database |
| Minimized data exposure | Only SHA-256 hashes stored for lookup |
| Verifiable claims | PlatformIdentityVC issued by platform DID |
| No data breach risk | No PII to steal from database |

### Database Schema (No PII)

```sql
-- ssi_users: Only hashes, no plaintext PII
CREATE TABLE ssi_users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  did TEXT,
  phone_hash TEXT,        -- SHA-256 of normalized phone
  email_hash TEXT,        -- SHA-256 of email
  pin_hash TEXT,          -- SHA-256 of PIN + salt (optional)
  vc_hash TEXT,           -- Hash of issued PlatformIdentityVC
  created_at TEXT,
  updated_at TEXT,
  last_login_at TEXT
);

-- Temporary phone links (encrypted, auto-expires)
CREATE TABLE temp_phone_links (
  tenant_id TEXT PRIMARY KEY,
  encrypted_phone TEXT,   -- AES-256-CBC encrypted
  expires_at TEXT,
  created_at TEXT
);

-- Login challenges for VC presentation
CREATE TABLE ssi_login_challenges (
  nonce TEXT PRIMARY KEY,
  tenant_id TEXT,
  expires_at TEXT,
  created_at TEXT
);
```

---

## Authentication Flows

### 1. Registration Flow

```
User enters: phone, username, optional PIN
        ↓
Check phone/email hash doesn't exist
        ↓
Check for existing tenant to claim (Fastlane)
        ↓
Create or reuse Tenant (Askar wallet)
        ↓
Provision DID for tenant
        ↓
Issue PlatformIdentityVC (PII goes to wallet)
        ↓
Store SSI user record (hashes only)
        ↓
Return: tenantId, token, vcOfferUrl
```

### 2. Login with PIN (Web2-friendly)

```
User enters: phone/email + PIN
        ↓
Hash phone/email → Lookup user
        ↓
Verify PIN hash matches
        ↓
Generate session token
        ↓
Return: JWT token
```

### 3. Login with VC Presentation (TRUE SSI)

```
Wallet requests login challenge
        ↓
Platform returns nonce (5 min expiry)
        ↓
Wallet presents PlatformIdentityVC
        ↓
Platform verifies:
  - Signature valid
  - VC type is PlatformIdentityCredential
  - Issuer is platform DID
  - Nonce matches
        ↓
Extract tenantId from VC claims
        ↓
Generate session token
        ↓
Return: JWT token + claims
```

### 4. Fastlane Flow (Pre-registration VCs)

```
Anonymous user at checkout
        ↓
Enters phone for EcoCash payment
        ↓
Platform creates anonymous tenant
        ↓
Links phone temporarily (encrypted, 24h expiry)
        ↓
Issues CartVC, InvoiceVC, ReceiptVC to tenant
        ↓
User later registers with same phone
        ↓
Platform finds temp link → Claims existing tenant
        ↓
User now owns all previous VCs
```

---

## PlatformIdentityVC Schema

```typescript
interface PlatformIdentityClaims {
  phone?: string           // E.164 format (+263774183277)
  email?: string           // Optional email
  displayName: string      // User's display name
  registeredAt: string     // ISO timestamp
  platformTenantId: string // Wallet/tenant ID on platform
  platformName: string     // "Credentis"
  verificationLevel: 'unverified' | 'phone_verified' | 'email_verified' | 'kyc_verified'
}
```

**Credential Type:** `PlatformIdentityCredential`  
**Format:** `jwt_vc_json`  
**Issuer:** Platform root DID

---

## Files Changed

### Core Service
| File | Purpose |
|------|---------|
| `src/services/SSIAuthService.ts` | Main SSI auth service with register, loginWithVC, loginWithPin |
| `src/services/modelRegistry.ts` | Added `seedPlatformCredentialDefinitions()` for root agent |
| `src/cliAgent.ts` | Wires platform credential seeding at startup |

### Controller
| File | Purpose |
|------|---------|
| `src/controllers/wallet/WalletAuthController.ts` | Updated register/login to use SSI service |

### Credential Definition
| File | Purpose |
|------|---------|
| `src/config/credentials/PlatformIdentityVC.ts` | VC type, schema, claims interface |

### Database Migration
| File | Purpose |
|------|---------|
| `migrations/019_ssi_auth_tables.sql` | SSI tables (no PII) |

---

## Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `PII_ENCRYPTION_KEY` | AES-256-CBC key for temp phone links | dev key (32 chars) |
| `PIN_SALT` | Salt for PIN hashing | `credo-pin-salt-v1` |
| `PLATFORM_NAME` | Name in PlatformIdentityVC | `Credentis` |
| `ISSUER_API_URL` | URL for VC issuance | `http://localhost:3000` |
| `ISSUER_API_KEY` | API key for issuance endpoint | `test-api-key-12345` |

---

## Security Features

### Data Protection
- **Phone/Email:** SHA-256 hashed before storage
- **PIN:** SHA-256 with salt (configurable via `PIN_SALT`)
- **Temp Phone Links:** AES-256-CBC encrypted with random IV
- **Login Challenges:** One-time use, 5-minute expiry

### Session Management
- JWT tokens with 30-day expiry
- No PII in token payload (only tenantId, role)
- Secret stored in agent genericRecords

---

## API Endpoints

### Registration
```
POST /api/wallet/auth/register
Body: { username, phone?, email?, pin? }
Response: { walletId, claimedExistingTenant?, existingCredentialsCount? }
```

### Login (PIN-based)
```
POST /api/wallet/auth/login
Body: { phone?, email?, pin }
Response: { token }
```

### Login Challenge (VC-based)
```
GET /api/wallet/auth/login-challenge
Response: { nonce, expiresAt }

POST /api/wallet/auth/login-with-vc
Body: { vcJwt, nonce }
Response: { token, claims }
```

---

## EcoCash Integration

### Sandbox Mode
Toggle via `ECOCASH_SANDBOX` environment variable:

| Value | Behavior |
|-------|----------|
| `true` | Auto-completes payment after 3s delay, triggers webhook simulation |
| `false` | Initiates real USSD PIN push via EcoCash API |

### Payment Flow with SSI
```
Cart → POST /finance/initiate-payment
        ↓
If ECOCASH_SANDBOX=true:
  - Simulate 3s delay
  - Auto-trigger webhook
  - Issue ReceiptVC
Else:
  - Call EcoCash API
  - Wait for webhook callback
  - Issue ReceiptVC on success
```

---

## Next Steps

### Phase 2: Security Hardening
- [ ] Move JWT secrets to HashiCorp Vault
- [ ] Implement per-tenant secret rotation
- [ ] Add status list revocation for PlatformIdentityVC

### Phase 3: Enhanced Verification
- [ ] SMS OTP for phone_verified level
- [ ] Email verification flow
- [ ] KYC integration for kyc_verified level

### Phase 4: Audit & Compliance
- [ ] Audit logging middleware (tenantId + correlationId)
- [ ] GDPR-compliant data deletion
- [ ] Backup/restore procedures for wallets

---

## Testing

### Manual Test Flow
```bash
# 1. Start server
yarn dev

# 2. Register user
curl -X POST http://localhost:3000/api/wallet/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","phone":"+263774183277","pin":"1234"}'

# 3. Login with PIN
curl -X POST http://localhost:3000/api/wallet/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"+263774183277","pin":"1234"}'
```

### Fastlane Test
```bash
# 1. Checkout without registration
curl -X POST http://localhost:3000/finance/initiate-payment \
  -H "x-api-key: test-api-key-12345" \
  -d '{"phone":"+263774183277","amount":"10.00"}'
# Note the tenantId returned

# 2. Later, register with same phone
curl -X POST http://localhost:3000/api/wallet/auth/register \
  -d '{"username":"testuser","phone":"+263774183277","pin":"1234"}'
# Should show claimedExistingTenant: true
```

---

## Summary

| Feature | Status |
|---------|--------|
| SSIAuthService with no PII storage | ✅ Complete |
| PlatformIdentityVC issuance | ✅ Complete |
| PIN-based login (Web2 fallback) | ✅ Complete |
| VC presentation login | ✅ Complete |
| Fastlane phone linking | ✅ Complete |
| EcoCash sandbox toggle | ✅ Complete |
| Build passing | ✅ Verified |

**Build Status:** ✅ `yarn build` passes successfully
