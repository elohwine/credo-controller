# MVP Sprint Tasklist

> Living document tracking 12-week sprint progress  
> **Updated:** 2026-01-30

---

## ✅ Sprint 4 — Completed

### Sprint 4 Tasks
- [x] Verify VC signing with tenant DID (cliAgent.ts uses didsApi.getCreatedDids)
- [x] Test credential_offer_uri generation (confirmed working)
- [x] Implement shortlink generator for verifier QR (ShortlinkService + Webhook integration)
- [x] Add SSE/polling for frontend VC notification (useCartPolling hook created)

---

## ✅ Sprint 3 — Completed

### Sprint 3 Tasks
- [x] Portal consent UI for QuoteVC acceptance
- [x] Portal consent UI for InvoiceVC acceptance
- [x] Checkout endpoint creates pending payment (WhatsAppPayloadController)
- [x] Wallet displays ReceiptVC properly (templates.ts has PaymentReceipt)

---

## ✅ Sprint 2 — Completed

- [x] Test EcoCash webhook endpoint with simulated payload
- [x] Verify ReceiptVC issuance on payment success
- [x] Test idempotency (duplicate webhook calls)
- [x] Create curl test script (`scripts/test-ecocash-webhook.sh`)
- [x] EcoCash API key verified (HTTP 200)
- [x] **DONE:** Live EcoCash test - USSD prompt received on 774183277

---

## ✅ Sprint 1 — Completed

- [x] Kickoff meeting, finalize MVP scope
- [x] Verify ReceiptVC JSON-LD schema
- [x] Review OpenAPI skeleton
- [x] Create MVP_GAP_ANALYSIS.md
- [x] Provision EcoCash sandbox credentials
- [ ] Confirm staging domains

---

## 📋 Sprint Overview

| Sprint | Focus | Status |
|--------|-------|--------|
| 1 | Kickoff & Foundations | ✅ Complete |
| 2 | EcoCash Integration Review | ✅ Complete |
| 3 | Portal Checkout UI Polish | 🏗 In Progress |
| 4 | ReceiptVC Issuance Enhancement | ⏳ Pending |
| 5 | Embedded Wallet Storage | ⏳ Pending |
| 6 | Driver Verification Page | ⏳ Pending |
| 7 | QA & Hardening | ⏳ Pending |
| 8 | Pilot Onboarding | ⏳ Pending |
| 9 | Pilot Soft Launch | ⏳ Pending |
| 10 | Iterate on Feedback | ⏳ Pending |
| 11 | Analytics & Compliance | ⏳ Pending |
| 12 | Go/No-Go Decision | ⏳ Pending |

---

## ✅ Completed Tasks

_None yet — Sprint 1 in progress_

---

## 📊 KPI Tracking

| Metric | Target | Current |
|--------|--------|---------|
| ReceiptVC issuance rate | ≥90% | - |
| Save-to-wallet rate | ≥40% | - |
| Driver verification success | ≥90% | - |
| Pilot transactions | 50+ | 0 |

---

## 📝 Notes

- See [MVP_IMPLEMENTATION_GUIDE.md](./docs/MVP_IMPLEMENTATION_GUIDE.md) for sprint details
- Update this file weekly during sprint reviews
