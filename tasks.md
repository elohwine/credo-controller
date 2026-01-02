# Task Checklist: Credo Trust Marketplace Implementation

## Completed Foundation
- [x] **Core Backend**: SQLite persistence, Agent initialization, multi-tenancy support.
- [x] **UI Integration**: Wallet and Portal wired to Credo backend.
- [x] **Base Flows**: VC Claims mapped correctly, "Unauthorized" errors fixed.
- [x] **Deep Link Fixes**:
    - [x] Wallet Backend: Parse `openid-initiate-issuance` and construct valid `openid-credential-offer` URI.
    - [x] Wallet Frontend: Use `openid-credential-offer` prefix when appropriate.
    - [x] Portal: Use correct query param structure.

## Phase 1: MVP - WhatsApp Commerce & VCs

### Backend - Core Catalog & Session
- [x] `api/catalog.js`: Implement `POST /catalog/merchant/{id}/items` and `GET /catalog/search`.
  - Created `CatalogController.ts` with create and search endpoints
  - Added database migration `005_create_catalog_items.sql`
  - Verified with test data: Fresh Tomatoes item created and searchable
- [x] `api/wa-payload-resolver.js`: Parse `wa.me` payload, creating `cart` with merchant/item IDs.
  - Created `WhatsAppPayloadController.ts` with cart creation, retrieval, and wa.me link generation
  - Added database migration `006_create_carts.sql`
  - Verified: Cart created with "Fresh Tomatoes" item from encoded payload

### Quotes & Invoices
> **Note**: These already exist via the workflow engine. No new CRUD APIs needed.
- [x] `api/quotes.js`: ✅ Exists via `finance-quote-v1` workflow (`credential.issue` action issues QuoteVC)
- [x] `api/quotes_accept.js`: ✅ Exists via `finance-invoice-v1` workflow (transitions quote to invoice)
- [x] `api/invoices.js`: ✅ Exists via workflow + `FinanceController.ts` endpoints

### Payment Orchestration
> **Note**: EcoCash integration already built into workflows.
- [x] `api/payments.js`: ✅ Exists via `external.ecocash_payment` action in workflows
- [x] `webhooks/ecocash.js`: ✅ Triggers `finance-receipt-v1` workflow for ReceiptVC issuance

### VC Issuance & Storage
> **Note**: Already implemented via `CredentialIssuanceService.ts` which handles all VC types.
- [x] `vcService.js`: ✅ Exists as `CredentialIssuanceService.ts`:
    - [x] `createOffer()` serves as unified minter for QuoteVC, InvoiceVC, ReceiptVC
    - [x] Uses Credo's OpenID4VCI issuer module for proper JWT-VC-JSON signing
    - [x] Returns `credential_offer_uri` + `credential_offer_deeplink` for wallet acceptance
- [ ] `api/credentials_issue_receipt.js`: Return short token URL + OIDC4VCI offer URI.
  - Partially exists in `FinanceController.issueReceipt()` - needs review for short URL feature

### WhatsApp Integration
- [x] `wa/webhook.js`: Main handler for message routing, session management, and template replies.
  - Created `WhatsAppWebhookController.ts` handling `hub.challenge` verification and message processing via `POST`
  - Validated with mock payloads for "Hi" and button clicks

## Phase 2: Trust Engine & Regulator

### Trust Engine
- [x] `trustEngine.js`: Compute score from drivers (KYC, payments, disputes).
  - Created `TrustEngine.ts` with weighted score computation
  - 6 drivers: KYC (30%), Payments (25%), Disputes (20%), Delivery (10%), Reviews (10%), Tenure (5%)
  - Added `trust_scores` and `trust_events` database tables
- [x] `api/trust.js`: `GET /trust/{merchantId}` exposing score and evidence links.
  - Created `TrustController.ts` with 4 endpoints
  - Trust Card endpoint returns badge (gold/silver/bronze/new) and top drivers with icons
  - Verified: merchant-001 scored 60 (bronze) with KYC attestation

### Regulator Portal
- [x] `api/escalation.js`: Generate signed evidence package (ZIP+Manifest), notify regulator.
  - Created `EscalationController.ts` with create/list/update endpoints
  - Auto-generates evidence package with trust score and event history
- [x] `api/vc_verify.js`: Hosted verifier page for public verification of Receipts.
  - Created `VCVerifierController.ts` for public VC status checks
  - Logs verification attempts for audit trail

## Phase 3: UI & Delivery
- [x] **Catalog UI**: React frontend for searching items and viewing Trust Cards.
  - Created `pages/catalog.tsx`: Merchant dashboard with item management + Trust Card
- [x] **Verifier Page**: Web view to validate ReceiptVC signatures.
  - Created `pages/verify/[vcId].tsx`: Public verification page rendering VC details
- [x] **Delivery App**: Endpoint `POST /verify/scan` for logistics partners.
  - Implemented in `VCVerifierController.ts` as `/api/verify/scan`

## Phase 3: Statutory & Payroll
- [x] **Payroll Module**:
  - [x] `PayrollController`: Run payroll, issue PayslipVCs
  - [x] `NSSAPlugin`: Calculate contributions
  - [x] `PAYEPlugin`: Calculate taxes
- [x] **Employee Registry**: Register employees with DIDs
- [x] **Payouts**: Salary Disbursement (EcoCash Bulk)
- [x] **Remittance**: Structural Taxes (NSSA/ZIMRA)

## Phase 4: HR & Ops Expansion
- [x] **Onboarding**: Employee KYC & Contract Signing (Backend API & VCs)
- [x] **Operations**: Leave & Expense Management

## Phase 5: Financial Statements
- [/] **Reports**: Generate Income Statement & Balance Sheet from VCs (BLOCKED: Verification FK Issue)
- [ ] **Auditor View**: Drill-down from statements to signed receipts

## Phase 6: Trust & Compliance Integration (Start)
- [x] **Revocation**: Status List 2021 implementation.
- [x] **Merchant Portal**: Verifier Dashboard & Policy Config.
- [x] **Audit Logs**: `AuditService` & Security Hardening.
