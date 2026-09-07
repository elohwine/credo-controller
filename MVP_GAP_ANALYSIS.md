# MVP Gap Analysis — Fastlane Commerce Trust

> **Analysis Date:** 2026-01-30  
> **Branch:** `mvp-fastlane`

---

## 🔄 Core MVP Flow: Cart → Quote → Invoice → Receipt

**Fastlane Principle:** Each VC is opt-in, seamless, and abstracts wallet/blockchain entirely.

```
Cart Items
    ↓ (user consents to save)
QuoteVC → "Save this quote for reference?" [opt-in]
    ↓ (user accepts quote, proceeds to pay)
InvoiceVC → Auto-generated, "Save invoice to wallet?" [opt-in]
    ↓ (EcoCash payment confirmed)
ReceiptVC → Auto-issued, "Keep as proof of purchase?" [opt-in]
    ↓ (at delivery)
Driver Verification → QR scan → "Confirm delivery" → Escrow released
```

---

## ✅ Features ALREADY Implemented

### 1. Quote → Invoice → Receipt Workflow Template

| Component                             | File                                                            | Status        |
| ------------------------------------- | --------------------------------------------------------------- | ------------- |
| `QuoteInvoiceReceiptTemplate`         | `src/services/workflow/templates.ts:160-259`                    | ✅ Complete   |
| `issueQuoteVC` endpoint               | `src/controllers/whatsapp/WhatsAppPayloadController.ts:498-570` | ✅ Exists     |
| QuoteVC, InvoiceVC, ReceiptVC schemas | `src/services/modelRegistry.ts`                                 | ✅ Registered |

### 2. ReceiptVC Issuance

| Component        | File                                                   | Status      |
| ---------------- | ------------------------------------------------------ | ----------- |
| ReceiptVC Schema | `src/services/modelRegistry.ts:103-119`                | ✅ Complete |
| EcoCash Webhook  | `src/controllers/webhooks/EcoCashWebhookController.ts` | ✅ Complete |
| VC Issuance      | `src/services/CredentialIssuanceService.ts`            | ✅ Complete |

### 3. Payment Infrastructure

| Component         | File                                                    | Status      |
| ----------------- | ------------------------------------------------------- | ----------- |
| EcoCash Adapter   | `src/ai/payments/adapters/EcoCashAckPayAdapter.ts`      | ✅ Complete |
| WhatsApp Commerce | `src/controllers/whatsapp/WhatsAppPayloadController.ts` | ✅ Complete |

### 4. Escrow Workflow Template

| Component                | File                                         | Status             |
| ------------------------ | -------------------------------------------- | ------------------ |
| `DeliveryEscrowTemplate` | `src/services/workflow/templates.ts:261-341` | ✅ Template exists |

### 5. Wallet & Portal UIs

| Component           | Location           | Status    |
| ------------------- | ------------------ | --------- |
| Wallet UI (Nuxt)    | `credo-ui/wallet/` | ✅ Exists |
| Portal UI (Next.js) | `credo-ui/portal/` | ✅ Exists |

---

## 🏗 Gaps Requiring Enhancement

### 1. Opt-in Consent Flow in Portal UI

**Current State:** Backend issues VCs but Portal lacks consent prompts at each stage.

**Required (Fastlane UX):**

- [ ] QuoteVC: "Save this quote for reference?" checkbox on cart review
- [ ] InvoiceVC: Auto-issue on payment initiation with "Save invoice?" opt-in
- [ ] ReceiptVC: Auto-issue on payment success with "Keep as proof?" prompt

**User never sees "wallet" or "VC" — just "save for proof".**

**Implementation Estimate:** Sprint 3 (Portal UI)

---

### 2. Driver Verification Mobile Page

**Current State:** Verifier controllers exist but no mobile-optimized shortlink page.

**Required:**

- [ ] `GET /verify/:shortToken` → Mobile web UI
- [ ] Shows: ✅ Verified badge, order summary, "Confirm Delivery" button
- [ ] One-tap: Confirms delivery → triggers escrow release signal

**Implementation Estimate:** Sprint 6

---

### 3. Escrow Release Hook (Signal Only)

**Current State:** Template exists but `escrow.release` action is stubbed.

**Required:**

- [ ] `POST /escrow/:orderId/release` (stub, no actual funds)
- [ ] Wire to delivery confirmation from driver verification

**Fastlane Principle:** Control the release signal, not the money.

**Implementation Estimate:** Sprint 6

---

### 4. Seamless Embedded Wallet (Abstracts Tech)

**Current State:** Wallet UI exists but may surface too much SSI/VC terminology.

**Required (per Embedded Wallet Philosophy):**

- [ ] Hide "credentials", "DIDs", "VCs" from user
- [ ] Show only: "My Receipts", "My Quotes", "My Invoices"
- [ ] Contextual display (only show receipts during disputes)
- [ ] Zero-friction acceptance (one-tap, default yes)

**Implementation Estimate:** Sprint 5

---

## 📊 Summary Table

| Flow Stage          | Backend            | Portal UI         | Wallet UI      |
| ------------------- | ------------------ | ----------------- | -------------- |
| QuoteVC (opt-in)    | ✅ `issueQuoteVC`  | 🏗 Consent prompt | ✅ Store       |
| InvoiceVC (opt-in)  | ✅ Template        | 🏗 Consent prompt | ✅ Store       |
| ReceiptVC (auto)    | ✅ EcoCash webhook | 🏗 Consent prompt | ✅ Store       |
| Driver Verification | ✅ Verifier exists | -                 | 🏗 Mobile page |
| Escrow Release      | ⚠️ Stubbed         | -                 | -              |

---

## 📋 Sprint 1 Verification Checklist

- [x] ReceiptVC schema in `modelRegistry.ts`
- [x] QuoteInvoiceReceiptTemplate in `templates.ts`
- [x] issueQuoteVC endpoint exists
- [x] EcoCash webhook issues ReceiptVC
- [x] Wallet and Portal UIs exist
- [x] Escrow workflow template exists
