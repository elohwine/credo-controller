# MVP Implementation Guide — 12-Week Sprint Plan

> Fastlane-aligned sprint breakdown for Zimbabwe e-commerce trust pilot.  
> **Outcome:** Working pilot: Catalog → Cart → EcoCash → ReceiptVC → Wallet → Driver Verification

---

## Team Roles (Minimal)

- **Product Lead / Founder**: Decisions, pilot outreach, demos
- **Backend Engineer (1)**: Credo integration, EcoCash adapter, VC issuance
- **Frontend Engineer (1)**: Portal UI, wallet, verifier page
- **BizDev / Ops (1)**: Merchant and driver pilot onboarding

---

## Sprint Breakdown

### Sprint 1 — Kickoff & Foundations
**Goal:** Plan, infra, schemas

- [ ] Kickoff meeting, finalize MVP scope
- [ ] Verify ReceiptVC JSON-LD schema in `modelRegistry.ts`
- [ ] Review OpenAPI skeleton (`/docs` endpoint)
- [ ] Provision EcoCash sandbox credentials
- [ ] Confirm staging domains (portal, wallet, verifier)

**Deliverables:** Schemas validated, CI pipeline confirmed

---

### Sprint 2 — EcoCash Integration Review
**Goal:** Validate payment flow & webhooks

- [ ] Test `EcoCashWebhookController` with sandbox
- [ ] Verify idempotency via `sourceReference`
- [ ] Test payment → ReceiptVC issuance flow
- [ ] Build Postman collection for E2E test

**Deliverables:** Payment flow tested end-to-end in sandbox

---

### Sprint 3 — Portal Checkout UI Polish
**Goal:** Cart & checkout UX improvements in **Portal UI**

- [ ] Review existing catalog page in portal
- [ ] Add consent checkbox in Portal checkout: "Save verified receipt to wallet?"
- [ ] Implement success screen with ReceiptVC offer link
- [ ] Test manual cart → payment → receipt flow

**Deliverables:** Portal checkout flow with consent UI

---

### Sprint 4 — ReceiptVC Issuance Enhancement
**Goal:** Ensure VC issuance robust

- [ ] Verify VC signing with tenant DID
- [ ] Test `credential_offer_uri` generation
- [ ] Implement shortlink generator for verifier QR
- [ ] Add SSE/polling for frontend VC notification

**Deliverables:** Working ReceiptVC issuance with offer URIs

---

### Sprint 5 — Embedded Wallet Storage
**Goal:** Wallet accepts and stores ReceiptVC (embedding focus)

- [ ] Review wallet credential acceptance flow
- [ ] Ensure embedded wallet stores VC from Portal offer
- [ ] Display credentials in wallet list (no checkout logic)
- [ ] Add WhatsApp share button for verification shortlink

**Deliverables:** Wallet stores and displays ReceiptVC after consent given in Portal

---

### Sprint 6 — Driver Verification Page
**Goal:** Mobile web verifier for delivery

- [ ] Create `/verify/{token}` endpoint
- [ ] Build minimal mobile web UI (verified badge, receipt summary)
- [ ] Implement "Mark Delivered" button
- [ ] Stub `POST /escrow/{orderId}/release`
- [ ] Secure shortlinks with TTL

**Deliverables:** Driver can scan QR and see verified status

---

### Sprint 7 — QA & Hardening
**Goal:** E2E tests, error handling, offline fallback

- [ ] Create E2E test script (order → pay → VC → verify)
- [ ] Implement retry logic for webhooks
- [ ] Add idempotency checks
- [ ] Document failure modes in runbook
- [ ] Test offline QR fallback (signed compact token)

**Deliverables:** E2E pass rate ≥95%

---

### Sprint 8 — Pilot Onboarding
**Goal:** Recruit 5 merchants, 1 delivery partner

- [ ] Create pilot playbook document
- [ ] Prepare WhatsApp message templates
- [ ] Reach out to pilot merchants
- [ ] Seed merchant SKUs in portal
- [ ] Training session for drivers

**Deliverables:** 5 merchants + 1 delivery partner confirmed

---

### Sprint 9 — Pilot Soft Launch
**Goal:** Run pilot, collect data

- [ ] Deploy to staging with TLS
- [ ] Start pilot transactions
- [ ] Collect telemetry (receipt rate, verification attempts)
- [ ] Weekly check-ins with merchants

**Deliverables:** 50+ pilot transactions

---

### Sprint 10 — Iterate on Feedback
**Goal:** Fix issues, improve UX

- [ ] Address top 3 pilot friction points
- [ ] Optimize WhatsApp templates
- [ ] Improve error handling
- [ ] Update onboarding prompts

**Deliverables:** Improved UX, reduced issues by 50%

---

### Sprint 11 — Analytics & Compliance
**Goal:** Dashboard and regulator prep

- [ ] Build simple analytics dashboard
- [ ] Compile pilot metrics report
- [ ] Draft regulator one-pager
- [ ] Harden revocation/credentialStatus

**Deliverables:** Dashboard live, pilot report ready

---

### Sprint 12 — Go/No-Go Decision
**Goal:** Review and plan Phase 2

- [ ] Pilot review meeting
- [ ] Evaluate KPI targets
- [ ] Decide go/no-go for scaling
- [ ] Create Phase 2 backlog (trust engine, lenders)
- [ ] Demo video for investors

**Deliverables:** Decision documented, Phase 2 plan

---

## Definition of Done — MVP

- [ ] Users browse catalog, checkout via EcoCash
- [ ] Payment success issues signed ReceiptVC
- [ ] Receipt appears in embedded wallet (if consented)
- [ ] QR/shortlink enables driver verification
- [ ] Verification triggers release action
- [ ] Pilot playbook + WhatsApp templates ready
- [ ] Pilot merchants successfully transacting

---

## Security Checklist (Before Live Pilot)

- [ ] TLS for all endpoints
- [ ] API keys in secrets manager
- [ ] Consent capture logic for audit
- [ ] Revocation policy + `credentialStatus` support
- [ ] Rate limits & idempotency keys
