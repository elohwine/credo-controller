# MVP Gap Analysis — Fastlane Commerce Trust

> **Analysis Date:** 2026-01-30  
> **Branch:** `mvp-fastlane`

---

## ✅ Features ALREADY Implemented

### 1. ReceiptVC Schema & Issuance
| Component | File | Status |
|-----------|------|--------|
| ReceiptVC Schema | `src/services/modelRegistry.ts:103-119` | ✅ Complete |
| EcoCash Webhook | `src/controllers/webhooks/EcoCashWebhookController.ts` | ✅ Complete |
| VC Issuance Service | `src/services/CredentialIssuanceService.ts` | ✅ Complete |

**Schema Fields:**
- `receiptId`, `invoiceRef`, `paymentRef`, `timestamp`

### 2. Payment Infrastructure
| Component | File | Status |
|-----------|------|--------|
| EcoCash Adapter | `src/ai/payments/adapters/EcoCashAckPayAdapter.ts` | ✅ Complete |
| Payment Controller | `src/controllers/payments/PaymentController.ts` | ✅ Complete |
| WhatsApp Commerce | `src/controllers/whatsapp/WhatsAppPayloadController.ts` | ✅ Complete |

### 3. Wallet & Portal UIs
| Component | Location | Status |
|-----------|----------|--------|
| Wallet UI (Nuxt) | `credo-ui/wallet/` | ✅ Complete |
| Portal UI (Next.js) | `credo-ui/portal/` | ✅ Complete |

### 4. Verifier Infrastructure
| Component | File | Status |
|-----------|------|--------|
| OIDC Verifier | `src/controllers/oidc/OidcVerifierController.ts` | ✅ Exists |
| VC Verifier | `src/controllers/regulator/VCVerifierController.ts` | ✅ Exists |
| Verifier Portal | `src/controllers/trust/VerifierPortalController.ts` | ✅ Exists |

### 5. Escrow Workflow (Template Only)
| Component | File | Status |
|-----------|------|--------|
| Escrow Template | `src/services/workflow/templates.ts:261-337` | ⚠️ Template exists |

---

## 🏗 Gaps Requiring Enhancement

### 1. Driver Verification Mobile Page
**Current State:** Verifier controllers exist but no mobile-optimized `/verify/{token}` page for drivers.

**Required:**
- [ ] Create `GET /verify/:shortToken` endpoint
- [ ] Mobile web UI showing: Verified badge, order summary, "Confirm Delivery" button
- [ ] Shortlink generator with TTL

**Implementation Estimate:** Sprint 6 (1 week)

---

### 2. Portal Consent Flow
**Current State:** Portal checkout exists but no "Save verified receipt to wallet?" prompt.

**Required:**
- [ ] Add consent checkbox in Portal checkout
- [ ] Issue VC offer on consent
- [ ] SSE/polling for wallet acceptance notification

**Implementation Estimate:** Sprint 3 (1 week)

---

### 3. Escrow Release Hook
**Current State:** `DeliveryEscrowTemplate` exists but `escrow.release` action is not implemented.

**Required:**
- [ ] Implement `POST /escrow/:orderId/release` endpoint (stub)
- [ ] Wire to delivery confirmation flow
- [ ] No actual funds handling (signal only)

**Implementation Estimate:** Sprint 6 (2-3 days)

---

### 4. ReceiptVC Schema Enhancement
**Current State:** Basic schema exists. Missing MVP-specific fields.

**Required:**
- [ ] Add `merchantName`, `amount`, `currency`, `paymentMethod` fields
- [ ] Align with `RECEIPTVC_SCHEMA.md` documentation

**Implementation Estimate:** Sprint 4 (1 day)

---

## 📊 Summary Table

| Feature | Status | Sprint |
|---------|--------|--------|
| ReceiptVC Issuance | ✅ Complete | - |
| EcoCash Payment | ✅ Complete | - |
| Wallet UI | ✅ Complete | - |
| Portal UI | ✅ Complete | - |
| WhatsApp Commerce | ✅ Complete | - |
| **Portal Consent Flow** | 🏗 Gap | Sprint 3 |
| **Driver Verification Page** | 🏗 Gap | Sprint 6 |
| **Escrow Release Hook** | 🏗 Gap | Sprint 6 |
| **ReceiptVC Schema Update** | ⚠️ Minor | Sprint 4 |

---

## 📋 Sprint 1 Verification Checklist

- [x] ReceiptVC schema exists in `modelRegistry.ts`
- [x] EcoCash webhook handler exists
- [x] Verifier controllers exist
- [x] Wallet and Portal UIs exist
- [x] Escrow workflow template exists
