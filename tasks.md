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
- [x] **UI**: `pages/hr/operations.tsx` (Leave Requests & Expense Claims)

## Phase 5: Financial Statements
- [x] **Reports**: Generate Income Statement & Balance Sheet from VCs
- [x] **Auditor View**: Drill-down from statements to signed receipts (verify-reporting.ts validates end-to-end flow)
- [x] **UI**: `pages/finance/reports.tsx` (Income Statement & Credential Issuance)

## Phase 6: Trust & Compliance Integration (Start)
- [x] **Revocation**: Status List 2021 implementation.
- [x] **Merchant Portal**: Verifier Dashboard & Policy Config.
- [x] **Audit Logs**: `AuditService` & Security Hardening.

## Phase 7: Inventory Management & E2E Cryptographic Verification (NEW)
> **Goal**: Real-time inventory tracking with hash-chained events, eliminating stocktakes.
> Integrated with Phase 1 (Catalog/Commerce) and Phase 5 (Reporting).

### 7A - Core Inventory (✅ COMPLETE)
- [x] **Database Schema**: `013_create_inventory.sql`
  - `inventory_locations`: Warehouses, shops, transit
  - `inventory_lots`: Batch/lot tracking with serial support
  - `inventory_events`: Append-only ledger with SHA-256 hash chain
  - `inventory_allocations`: Reservations linked to carts/invoices
  - `inventory_projections`: Real-time stock levels
- [x] **InventoryService**: Hash-chained event management
  - `receiveGoods()`: GRN with optional GoodsReceivedVC
  - `reserveStock()`: FIFO allocation for carts
  - `fulfillSale()`: Consume reserved stock, issue SaleFulfillmentVC
  - `verifyEventChain()`: Cryptographic audit
- [x] **InventoryController**: REST API endpoints
  - `POST /inventory/locations`: Create location
  - `POST /inventory/receive`: GRN with VC
  - `POST /inventory/reserve`: Reserve for cart
  - `GET /inventory/levels`: Real-time stock
  - `GET /inventory/scan/{barcode}`: Barcode lookup
  - `GET /inventory/verify-chain`: Hash chain verification
  - `GET /inventory/trace/receipt/{receiptId}`: Full provenance
- [x] **E2E Verification**: `verify-inventory.ts` confirms full flow
  - GRN → Reserve → Fulfill with valid hash chain
  - Receipt provenance traceable to original lot

### 7B - Inventory VCs (✅ COMPLETE)
- [x] **Schemas**: GoodsReceivedVC, SaleFulfillmentVC, StockTransferVC
- [x] **Credential Definitions**: Added to seed-vc-models.ts
- [x] **Integration**: Auto-issue VCs on receive/fulfill (via InventoryService)

### 7C - Sales Binding (✅ COMPLETE)
- [x] **Cart → Reserve**: Auto-reserve inventory when cart created (WhatsAppPayloadController)
- [x] **Invoice → Hold**: (Skipped explicit extension, relies on initial reservation)
- [x] **Receipt → Fulfill**: Consume stock on payment, link to ReceiptVC (FinanceController)
- [x] **ReceiptVC Extension**: Include `inventoryAllocations` with lot/serial refs

### 7D - Analytics & Reporting (✅ COMPLETE)
- [x] **Dashboard**: Stock levels, stockouts, aging (`pages/inventory/dashboard.tsx`)
- [x] **Valuation**: Total inventory value by location (FIFO cost)
- [x] **Aging Report**: 0-30, 31-60, 61-90, 90+ days buckets
- [x] **Profit Insights**: Gross margin per SKU using lot costs (in getValuation)
- [ ] **Shrinkage Tracking**: Adjustments vs sales ratio (future)

## Phase 8: UI Integration & Polish (Wallet & Portal)
> **Goal**: Ensure walt.id UI components (Wallet, Portal) are fully wired to Credo backend APIs.

### 8A - Backend Route Gaps (✅ COMPLETE)
- [x] **Mount OIDC Routers**: `src/server.ts` lines 231-272 mount OIDC routers:
  - `app.use('/oidc/issuer', modules.openId4VcIssuer.config.router)` - All issuer endpoints
  - `app.use('/oidc/verifier', modules.openId4VcVerifier.config.router)` - All verifier endpoints
- [x] **Wallet API Compatibility**: All routes exist in `src/routes/routes.ts`:
  - `GET /api/wallet/accounts/wallets` - List wallets (line 5779)
  - `GET /api/wallet/credentials` - List credentials (`WalletCredentialsController`)
  - `POST /api/wallet/credentials/accept-offer` - Accept VC offer
  - `GET /api/wallet/credentials/pending-offers` - List pending offers
  - `POST /api/wallet/wallet/{walletId}/exchange/resolveCredentialOffer` - Resolve offers

### 8B - Portal Integration (✅ COMPLETE)
- [x] **Credential Models**: `pages/credential-models.tsx` renders available VC types
- [x] **Issuance Flow**: `IssueSection.tsx` calls `getOfferUrl()` → Backend `createCredentialOffer`
- [x] **Verification Flow**: `VerificationSection.tsx` wired to verification endpoints
- [x] **Inventory Dashboard**: `pages/inventory/dashboard.tsx` - Stock, valuation, aging tabs
- [x] **Finance Reports**: `pages/finance/reports.tsx` - Income statement with VC integration
- [x] **HR Operations**: `pages/hr/operations.tsx` - Leave/Expense management

### 8C - Wallet Integration (✅ COMPLETE)
- [x] **Dashboard**: `pages/wallet/[wallet]/index.vue` loads credentials via `/wallet-api/credentials` → `/api/wallet/credentials` proxy
- [x] **Pending Offers**: Auto-polls `/wallet-api/credentials/pending-offers` every 30 seconds
- [x] **Accept Flow**: `acceptOffer()` calls `/wallet-api/credentials/accept-offer`
- [x] **Credential Details**: `pages/wallet/[wallet]/credentials/[credentialId].vue` renders VC details
- [x] **GenericID Banner**: Prompts new users to claim GenericID VC
- [x] **Quick Actions**: Scan QR, Request VC, Finance Portal links

## Phase 9: Production Hardening (✅ COMPLETE)
> **Goal**: Security, scalability, and operational readiness.

### 9A - Security & Observability (✅ COMPLETE)
- [x] **Audit Middleware**: `src/middleware/auditMiddleware.ts`
  - Auto-captures sensitive API operations (credentials, finance, inventory, HR)
  - Logs: tenantId, actorDid, actionType, resourceId, IP, user-agent
  - Wired into Express pipeline in `server.ts`
- [x] **Input Validation**: `src/utils/validationSchemas.ts` (Zod)
  - 20+ schemas: Wallet, Credentials, Finance, Inventory, HR, Trust
  - `validateBody()` middleware factory for route protection
- [x] **Rate Limiting**: Already configured via `express-rate-limit`

### 9B - Scalability (✅ COMPLETE)
- [x] **Session Limits**: Env-configurable via `SESSION_ACQUIRE_TIMEOUT`, `SESSION_LIMIT`
- [x] **SQLite Optimization**: `src/persistence/DatabaseManager.ts`
  - WAL mode, 64MB cache, memory-mapped I/O, 5s busy timeout
  - `synchronous = NORMAL` for balanced durability/performance

### 9C - Metrics & Health (✅ COMPLETE)
- [x] **MetricsService**: `src/services/MetricsService.ts`
  - System metrics: uptime, memory, CPU
  - Database metrics: size, WAL, table row counts
  - Business metrics: credentials, wallets, inventory, tenants
- [x] **MetricsController**: `src/controllers/metrics/MetricsController.ts`
  - `GET /health` - Load balancer health check (200/503)
  - `GET /health/live` - Kubernetes liveness probe
  - `GET /health/ready` - Kubernetes readiness probe
  - `GET /metrics` - Prometheus-compatible text format
  - `GET /metrics/json` - JSON format for dashboards

### 9D - Deployment & Recovery (✅ COMPLETE)
- [x] **Backup Script**: `scripts/backup.sh`
  - SQLite backup with WAL checkpoint
  - Askar wallet backup
  - Config backup (secrets redacted)
  - Manifest generation, compression, retention cleanup
- [ ] **DNS/TLS Automation**: (Deferred - use reverse proxy like Caddy/Traefik)
- [ ] **DR Runbook**: (Deferred - documented in ops guide)

## Phase 10: Future Enhancements (NOT STARTED)
> **Goal**: Advanced features for enterprise deployment.

### 10A - External Secrets
- [ ] **Vault Integration**: Move JWT secrets from genericRecords to HashiCorp Vault
- [ ] **Per-tenant Keys**: Separate signing keys per tenant
- [ ] **Key Rotation**: Automated secret rotation API

### 10B - Advanced Revocation
- [ ] **Status List 2021**: Full implementation with tenant-scoped lists
- [ ] **Batch Revocation**: Bulk revoke credentials API
- [ ] **Revocation Notifications**: Webhook on credential revocation

### 10C - Multi-Region
- [ ] **Database Replication**: SQLite Litestream or PostgreSQL migration
- [ ] **CDN Integration**: Static asset distribution
- [ ] **Regional Routing**: Geo-based tenant routing

