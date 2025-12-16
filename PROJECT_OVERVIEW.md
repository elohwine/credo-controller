# IdenEx Credentis Platform - Project Overview

> **Verifiable Commerce Platform** for Zimbabwe and Africa  
> *Making trust a feature for e-commerce*

---

## Vision

Transform Quote → Invoice → EcoCash → Receipt flows into a **Verifiable Commerce Platform** with:
- Wallet-deliverable credentials
- Merchant trust scoring
- EcoCash-anchored payment proofs
- Gen-UI conversational interfaces

---

## Platform Identity

| Name | Purpose |
|------|---------|
| **IdenEx** | Company name (Identity Exchange) |
| **Credentis** | Platform name |

---

## Phase 0 — Foundations ✅ (Partially Complete)

**Objective:** Stable, auditable POC

### Deliverables
- [x] Hardened `webhooks/ecocash` handler (signature validation, idempotency)
- [x] Persisted payment_requests, vc_store, agent_profiles tables
- [x] Tenant KMS mapping for per-tenant signing keys
- [x] OpenAPI endpoints (`/quotes`, `/invoices`, `/payments/initiate`, `/credentials/issue-receipt`)

### Acceptance Criteria
- [x] Webhook → ReceiptVC issued in sandbox
- [x] `GET /vc/{id}/verify` returns valid signature

---

## Phase 1 — Core Verifiable e-Commerce (MVP SHOWCASE) 🎯

**Objective:** Ship **Cart → CartSnapshotVC → InvoiceVC → Pay → ReceiptVC → Wallet + Verifier**

### Deliverables
- [ ] **CartSnapshotVC** schema + `POST /cart/{cartId}/issue-cartvc`
- [ ] Auto-Invoice from CartSnapshot: `POST /invoices/from-cart`
- [ ] `POST /payments/initiate` with `agentDid` + `sourceReference`
- [ ] Webhook → ReceiptVC linking cart & invoice
- [ ] Wallet Inbox UI + Verifier Modal
- [ ] 90-120s demo recording

### VC Schemas Required
```
CartSnapshotVC, InvoiceVC, PaymentReceiptVC, TransactionVC
```

### Acceptance Criteria
- [ ] CartSnapshotVC validated independently
- [ ] Invoice contains `cartRef`
- [ ] ReceiptVC includes `transactionRef.ecocashRef` + `invoiceRef`
- [ ] Wallet shows receipt, verifier returns `valid:true`

### KPIs
- Checkout conversion rate (CartSnapshotVC vs baseline)
- VC issuance latency

---

## Phase 2 — Merchant Trust & Evidence Layer

**Objective:** Add merchant attestations, Trust Score, visible trust signals

### Deliverables
- [ ] **MerchantVC** (KYC/EcoCash/Omari/Innbucks attestation)
- [ ] Trust Score engine + `POST /trust/compute`
- [ ] Trust Card UI (badge + evidence list linking to VCs)
- [ ] ZimLedger migration adapter (CSV/PDF → TransactionVCs)

### Acceptance Criteria
- [ ] MerchantVC verifiable and linked to tenant DID
- [ ] Trust Score shows drivers mapped to VCs
- [ ] A/B test: conversion improvement with Trust Card

### KPIs
- % merchants with MerchantVC
- Cart abandonment delta for "verified" merchants

---

## Phase 3 — Agent Delegation (ACK) + Gen-UI Tools

**Objective:** Support delegated agents (humans, LLMs) with ControllerCredential

### Deliverables
- [ ] **ControllerCredential** schema + `POST /tenants/{t}/agents`
- [ ] `agentAuth` middleware enforcing permissions
- [ ] Gen-UI tool endpoints: `initiatePayment`, `verifyReceipt`, `computeTrustScore`
- [ ] Tool registration JSON for Vercel AI SDK / Gemini

### Acceptance Criteria
- [ ] Agent calls `payments/initiate` only with valid ControllerCredential
- [ ] Tool calls logged for audit

### KPIs
- Agent action success rate
- Audit log coverage

---

## Phase 4 — Gen-UI Interactive Analytics

**Objective:** Conversational, actionable interfaces with VC evidence

### Deliverables
- [ ] Tool wrappers: `initiatePayment`, `verifyReceipt`, `fetchTransactions`
- [ ] `gemini-chatbot` fork with streaming UI components
- [ ] Natural language queries: "Show last 30 days revenue for Merchant X"
- [ ] Receipt Card, Trust Card, Interactive Chart components

### Acceptance Criteria
- [ ] Gen-UI streams payment progress in chat
- [ ] User queries return interactive charts with VC links

### KPIs
- Time-to-insight vs static dashboard
- Tool calls per session

---

## Phase 5 — Advanced Trust & Financial Services

**Objective:** Escrow, refunds, lender integrations, ledger anchoring

### Deliverables
- [ ] Escrow/Provisional ReceiptVC flow
- [ ] RefundVC issuance + ReceiptVC revocation
- [ ] **PaymentHistoryVC** aggregator (periodic signed summaries)
- [ ] Lender onboarding demo
- [ ] Optional permissioned ledger anchoring

### Acceptance Criteria
- [ ] Refund triggers revocation, verifier shows revoked state
- [ ] Lender verifies PaymentHistoryVC for loan decisions

### KPIs
- Loans enabled via PaymentHistoryVC
- Disputes resolved via verifiable evidence

---

## Phase 6 — Scale & Geographic Expansion

**Objective:** Partner formalization, multi-region, Africa expansion

### Deliverables
- [ ] Partner MoUs (EcoCash, ZimLedger, banks)
- [ ] Multi-tenant scaling (KMS per tenant)
- [ ] Country playbooks (Kenya, Rwanda, Ghana)

### KPIs
- Tenants onboarded
- Partner MoUs signed
- Expansion pilots launched

---

## Cross-Phase Items (Always Running)

| Area | Details |
|------|---------|
| **Security** | KMS/HSM, webhook validation, rate limits, consent logs |
| **Observability** | Immutable issuance logs, tool call logging |
| **Developer Docs** | OpenAPI, VC schema registry, example VPs |
| **Pilot Measurement** | KPIs per phase, A/B baselines |

---

## Immediate Next Steps

1. ✅ Finalize Quote → Invoice → ReceiptVC flows using Credo OID4VC
2. [ ] Create JSON-LD schemas: CartSnapshotVC, InvoiceVC, ReceiptVC, MerchantVC
3. [ ] Implement `POST /cart/{cartId}/issue-cartvc` + `POST /invoices/from-cart`
4. [ ] Build Wallet Inbox & Verifier Modal
5. [ ] Add `computeTrustScore` stub
6. [ ] Register Gen-UI tools in gemini-chatbot fork

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Partner dependence (EcoCash co-sign) | Platform signs first + PSP evidence; pursue MoUs |
| Merchant adoption friction | Universal plugin for **any** financial platform (ZimLedger, QuickBooks, Xero, bank APIs, EcoCash merchant portal, Omari, etc.) - import via API or CSV/PDF |
| PII in VCs | **VCs should contain full PII** - that's the point! User controls wallet. Platform stores **encrypted VC data only**. No plaintext PII in backend DB |
| Agent abuse | Strict ControllerCredential, short TTL, audit logs |
| Regulatory uncertainty | Early regulator engagement, show audit benefits |

---

## Acceptance Checklist (Per Pilot)

- [ ] Merchant issues CartSnapshotVC → InvoiceVC → Payment → ReceiptVC e2e
- [ ] Buyer receives ReceiptVC in wallet, verifier returns `valid:true`
- [ ] Trust Card links to MerchantVC and PaymentHistoryVC
- [ ] Agent operates only within permissioned scope
- [ ] Refunds revoke ReceiptVC correctly
- [ ] Gen-UI tools orchestrate flows with streaming feedback

---

## Quick Links

| Resource | Path |
|----------|------|
| Backend Server | `yarn dev` or `node samples/startServer.js` |
| Portal (Issuer UI) | `credo-ui/portal/` |
| Wallet (Holder UI) | `credo-ui/wallet/` |
| EcoCash Integration | `src/controllers/webhooks/EcoCashWebhookController.ts` |
| Workflow Engine | `src/services/workflow/` |
| VC Schemas | `src/utils/credentialDefinitionStore.ts` |

---

*IdenEx Credentis — Verifiable Trust for African Commerce*
