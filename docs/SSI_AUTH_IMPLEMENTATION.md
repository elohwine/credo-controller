# SSI Authentication Implementation Summary

**Date:** February 2026  
**Status:** Historical implementation summary; verification claims require the
current-code qualification below.

## Architecture decision and current-code qualification (2026-10-15)

SSI remains foundational, not an organisation-selectable feature. Continue offering
`PlatformIdentityCredential` to every registering platform user, retaining personal
wallet/DID provisioning, organisation issuer/verifier identities and required proofs.
Organisation-level workflow-record preferences must not suppress platform identity
offers, login verification, recovery/reissue or mandatory evidence.

See the revised [configurable-platform plan](./CONFIGURABLE_PLATFORM_IMPLEMENTATION_PLAN.md#6-ssi-foundation-preserved-workflow-record-settings-remain-bounded)
for implementation scope and acceptance gates. There is no planned SSI-off account
or business-only downgrade. Existing PIN/bootstrap access is retained, not expanded
into a bypass of proof-gated actions.

The registration implementation requests an identity offer, queues it and attempts
embedded-wallet acceptance. An offer is not yet a held credential; failures need
explicit pending/retry states. Do not infer that every registered account already
holds a usable identity credential.

**Update (2026-10-18).** [loginWithVC](../src/services/SSIAuthService.ts) now consumes the
one-time challenge atomically, has Credo verify the JWT presentation and credential
signatures against that nonce and the login audience, and then refuses unless: the
presentation signature itself verified (holder binding), the signer is the credential
subject, the issuer is the pinned platform issuer, the credential is recorded as issued here
and is neither revoked nor suspended, and the presenter controls the account's wallet.
The OpenID4VP path ([CredoPresentationVerificationService](../src/services/ssi/CredoPresentationVerificationService.ts))
adds verifier, state, audience, nonce, holder, trusted-issuer and status checks, refuses
a second answer to an already-verified request, and keeps requests tenant-scoped. These
are covered by negative tests that must stay green:
[vc_login_negative.test.ts](../tests/vc_login_negative.test.ts) and
[presentation_verification_negative.test.ts](../tests/presentation_verification_negative.test.ts).
Writing them found and fixed: a fail-open default that re-derived the holder from an
unverified presentation, and SSI migrations 023/024/049 never running (version clashes),
now repaired column by column at start-up. Status lists are now published: the public
`GET /status-lists/:id` signs a list on first read after issuance or any status change,
using whichever wallet holds the issuer DID (the root wallet for platform cards, the org's
tenant wallet for org cards). List URLs use `STATUS_LIST_BASE_URL`, falling back to
`PUBLIC_BASE_URL`, so outside verifiers can reach them
([status_list_publish.test.ts](../tests/status_list_publish.test.ts)).

The earlier qualification, kept for history: the then-current loginWithVC looked up
and consumed a challenge, then decoded a supplied credential JWT for account lookup.
The historical flow below describing signature, issuer and nonce verification was a
target, not verified behavior at that time. Before claiming production VC-login
assurance, verify trusted issuer and credential cryptography, presenter
key/holder binding, validity/status, verifier/audience, freshness, session correlation
and replay prevention, then map verified claims to an active account.

Use [OpenID4VP](https://openid.net/specs/openid-4-verifiable-presentations-1_0.html)
verification appropriate to supported profiles; a raw copied credential plus a
separate nonce is not proof of key control.
[OpenID4VCI](https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html)
separates offer and credential delivery. Neither standard requires making SSI
optional; retaining it as a foundation is the platform's product decision.

The older "ZERO PII" and "No data breach risk" claims below are not current system-wide
assurances. The current registration controller logs identity fields, and wallet,
payment and contact records can contain personal data. Hashes can remain linkable
personal data. Treat privacy as minimisation, access control, retention and safe
logging across the actual system, not an absolute guarantee derived from using VCs.

---

## Overview

### Personal login and organisation entry

Cross-device wallet login returns verified identity claims alongside the personal
session. The portal applies `displayName`, disclosed phone/email and personal
token/tenant keys together, clears the previous account's active organisation
context, and keeps saved accounts separate. Missing optional claims must never
display the previous person's profile.

Personal login still requires a platform-issued identity credential. After login,
choose **Enter with a staff card** in the organisation picker, select an
organisation, and scan the new QR. This optional proof-backed entry uses:

- `POST /api/organizations/{orgTenantId}/entry-proof`
- `GET /api/organizations/{orgTenantId}/entry-proof/{requestId}` with the initiating
  personal bearer token and `x-login-poll-token`.

Requests expire, are single-use, and are bound to that personal session, account
and organisation. The DCQL query accepts either an SD-JWT `EmployeeCredential`
or a legacy W3C JWT staff credential, with cryptographic holder binding required.
The SDK verifies the presentation before the service evaluates claims. The staff
card must be issued by that organisation's configured issuer, recorded as issued
by that tenant, active, and match the authenticated user and current active
membership role. Changed/withdrawn/unrecognised evidence is rejected; failure
does not log the person out of their personal account.

Roles in cards are evidence, not permission grants: existing server-side membership,
role and delegation policy remains authoritative. Organisation identity/legal-entity
credentials do not identify a human member; action-scoped actor/delegation cards
do not grant general owner/admin access. Existing membership-based organisation
switching remains available; this feature does not require staff proof globally.
Multiple organisations require explicit selection.

OpenID4VP/DCQL supports multiple credentials, including optional sets, but this
flow deliberately separates personal sign-in from optional organisation proof.
It does not implement organisation-only personal login or require both cards for
every sign-in. See [OpenID4VP](https://openid.net/specs/openid-4-verifiable-presentations-1_0.html).

Validation must distinguish mocked policy tests from real wallet cryptographic
presentation tests and phone acceptance. A passing mocked test does not establish
wallet-format interoperability or device acceptance.

The original design centred platform authentication on a `PlatformIdentityVC`,
with wallet-held identity claims and hash-based account lookup. The current-code
qualification above supersedes historical completeness and privacy claims.

---

## Architecture

### SSI Principles Applied

| Principle               | Implementation                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------- |
| User controls identity  | PII stored in wallet VC, not our database                                             |
| Minimized data exposure | Only SHA-256 hashes stored for lookup                                                 |
| Verifiable claims       | PlatformIdentityVC issued by platform DID                                             |
| Privacy goal            | Minimise personal data and protect all remaining records/logs; no zero-risk guarantee |

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
If no PIN is stored yet (an organisation opened the account), the PIN they type becomes theirs
Otherwise verify the PIN hash matches
        ↓
Generate session token
        ↓
Return: JWT token
```

### 3. Login with VC Presentation (target verification flow, not current assurance)

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
  phone?: string // E.164 format (+263774183277)
  email?: string // Optional email
  displayName: string // User's display name
  registeredAt: string // ISO timestamp
  platformTenantId: string // Wallet/tenant ID on platform
  platformName: string // "Credentis"
  verificationLevel: 'unverified' | 'phone_verified' | 'email_verified' | 'kyc_verified'
}
```

**Credential Type:** `PlatformIdentityCredential`  
**Format:** `jwt_vc_json`  
**Issuer:** Platform root DID

---

## Files Changed

### Core Service

| File                             | Purpose                                                        |
| -------------------------------- | -------------------------------------------------------------- |
| `src/services/SSIAuthService.ts` | Main SSI auth service with register, loginWithVC, loginWithPin |
| `src/services/modelRegistry.ts`  | Added `seedPlatformCredentialDefinitions()` for root agent     |
| `src/cliAgent.ts`                | Wires platform credential seeding at startup                   |

### Controller

| File                                             | Purpose                                   |
| ------------------------------------------------ | ----------------------------------------- |
| `src/controllers/wallet/WalletAuthController.ts` | Updated register/login to use SSI service |

### Credential Definition

| File                                           | Purpose                           |
| ---------------------------------------------- | --------------------------------- |
| `src/config/credentials/PlatformIdentityVC.ts` | VC type, schema, claims interface |

### Database Migration

| File                                 | Purpose             |
| ------------------------------------ | ------------------- |
| `migrations/019_ssi_auth_tables.sql` | SSI tables (no PII) |

---

## Environment Variables

| Variable             | Purpose                              | Default                 |
| -------------------- | ------------------------------------ | ----------------------- |
| `PII_ENCRYPTION_KEY` | AES-256-CBC key for temp phone links | dev key (32 chars)      |
| `PIN_SALT`           | Salt for PIN hashing                 | `credo-pin-salt-v1`     |
| `PLATFORM_NAME`      | Name in PlatformIdentityVC           | `Credentis`             |
| `ISSUER_API_URL`     | URL for VC issuance                  | `http://localhost:3000` |
| `ISSUER_API_KEY`     | API key for issuance endpoint        | `test-api-key-12345`    |

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

| Value   | Behavior                                                           |
| ------- | ------------------------------------------------------------------ |
| `true`  | Auto-completes payment after 3s delay, triggers webhook simulation |
| `false` | Initiates real USSD PIN push via EcoCash API                       |

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

| Feature                            | Status      |
| ---------------------------------- | ----------- |
| SSIAuthService with no PII storage | ✅ Complete |
| PlatformIdentityVC issuance        | ✅ Complete |
| PIN-based login (Web2 fallback)    | ✅ Complete |
| VC presentation login              | ✅ Complete |
| Fastlane phone linking             | ✅ Complete |
| EcoCash sandbox toggle             | ✅ Complete |
| Build passing                      | ✅ Verified |

**Build Status:** ✅ `yarn build` passes successfully
