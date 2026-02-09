# Fastlane Commerce: Security, Migration, and Audit Trail Implementation Plan

## 1. Session Management & Security (Logout)
- [ ] **Backend Logout**: Ensure `POST /api/ssi/auth/logout` (or equivalent) invalidates the JWT on the server side (e.g., blacklist/expiry).
- [ ] **Frontend Hygiene (Guidance)**: Ensure client clears `auth.token` cookie and LocalStorage.
- [ ] **Route Protection**: Verify `@Security('jwt')` middleware correctly rejects invalidated tokens.

## 2. Unification: Guest to Registered Migration
**Goal**: Seamless transition. A user starting as a guest (checkout -> phone) who later registers should inherit that guest tenant and its VCs. A registered user shopping should automatically use their existing tenant.

- [ ] **Registration Logic (`SSIAuthService.register`)**:
    - [ ] Check `ssi_users` for existing verified user.
    - [ ] Check `temp_phone_links` or similar mapping for "Guest" tenants associated with this MSISDN.
    - [ ] If Guest Tenant exists -> **Claim it** (Update `ssi_users` to point to this `tenantId`).
    - [ ] If no Guest Tenant -> Create new.
- [ ] **Login Logic**:
    - [ ] Ensure `loginWithPin` or `loginWithVC` resolves to the CORRECT tenant ID.
    - [ ] Fix specific issue with `263774183277` (likely a data mismatch between `ssi_users` and the actual underlying tenant record).

## 3. Cryptographic Audit Trail (VC Chaining)
**Goal**: Immutable history. `Quote` -> `Invoice` -> `Receipt`.

- [x] **Schema Updates**:
    - [x] **QuoteVC**: Add `cartHash` or `requestId`.
    - [x] **InvoiceVC**: Add `previousRecordHash` (hash of QuoteVC) AND `quoteId`.
    - [x] **PaymentReceiptVC**: Add `previousRecordHash` (hash of InvoiceVC) AND `invoiceId`.
- [x] **Issuance Logic**:
    - [x] When issuing Invoice (from Quote/Cart), calculate SHA-256 of the source document/VC.
    - [x] Embed this hash in the `credentialSubject` of the new VC.
- [x] **Verification**:
    - [x] Add utility to walk the chain backwards (Receipt -> Invoice -> Quote).

## 4. Immediate Todo
- [x] Investigate `SSIAuthService.ts` for `findTenantByPhone` logic.
- [ ] Fix 401/Login issues for `263774183277`.
- [x] Implement VCs chaining in`EcoCashWebhookController` and `AuditService`.
