# IdenEx Credentis - Project Overview

> **Verifiable Trust Infrastructure** for Africa's Digital Economy  
> *Building the layer above accounting: Trust, Portability, and Verification.*

---

## 🚀 Strategic Vision: "The ZimLedger Killer" Strategy

**The Insight:**  
Zimbabwean SMEs already use digital tools (EcoCash, NSSA, ZimLedger) but remain trapped in silos. ZimLedger records *activity* but is **trust-blind**—it generates PDFs, not portable proof.

**Our Proposition:**  
We are not competing head-on by building another accounting app. We are building **Trust + Data Infrastructure**.
- **ZimLedger** records that you sold something.
- **Credentis** proves it to a bank, regulator, or partner without you needing to say a word.

**Core Instruction:**  
> "Implement the Finance industry module with full quote → invoice → payment → receipt VC workflows, payroll and statutory sub-modules (NSSA, PAYE as plugins), Ecocash as a payment provider adapter, organization-level directories, and auditable financial statements — all built on shared DID/VC primitives so that other industries (education, health, supply chain) can reuse the same core without duplication."

---

## 🏗 Modular Architecture

The platform is designed with a **Core Layer** of shared primitives and **Industry Modules** that plug into it.

### 1. Shared Primitives (The "Kernel")
*Used by ALL industries (Finance, Education, Health, Logistics)*
- **DID Management**: Identity for every entity (User, Org, Device).
- **VC Issuance & Verification**: The engine for creating and checking proofs.
- **Trust Ratings**: Configurable scoring engine (TrustEngine).
- **Audit Trails**: Cryptographic logs of all critical events.
- **Payment Provider Abstraction**: Adapters for EcoCash, InnBucks, Banks.
- **Lifecycle Engine**: State machines for generic workflows (Quote -> Order -> Receipt).
- **ACK-ID Agent Registry**: AI/automation agent provisioning with `ControllerCredential` (owner→agent DID linkage).
- **ACK-Pay Adapters**: Provider-agnostic payment interface with `PaymentReceiptCredential` issuance.

### 2. Finance Industry Module (The First Application)
*Feature parity with ZimLedger, plus Verifiable Superpowers.*
- **Workflows**: Quote → Invoice → Payment → Verifiable Receipt (VC).
- **Payroll**: Payslip VCs, NSSA/PAYE calculators (pluggable).
- **Organizations**: VC-backed directories (Clients, Suppliers, Employees).
- **Reporting**: Financial Statements traceable to signed transaction VCs.

### 3. HR & Ops Module (Benchmarks: Connecteam, Workday)
*Mobile-First Employee Lifecycle Management*
- **Onboarding**: Form-driven flow + KYC/ID Verification (Connecteam-style).
- **Contracts**: E-signatures & Offer Letters (Signed VCs).
- **Operations**: Leave management, Expense claims, Time & Attendance (GPS/WhatsApp).
- **Payouts**: Bank & EcoCash setup + Bulk Payout Connectors.
- **Distribution**: Multi-channel payslip delivery (WhatsApp/Email/Portal). -> `PayslipVC`

---

## 🗺 Roadmap & Progress

### Phase 1: MVP - WhatsApp Commerce & VCs (Current Focus) 🎯
**Goal**: Enable verifiable commerce flow via WhatsApp and Web Connect.
- [x] **Core Backend**: SQLite, TSOA, Credo Agent initialization.
- [x] **Unified Catalog API**: `Create Item`, `Search Items` (PostgreSQL/SQLite).
- [x] **WhatsApp Commerce**:
    - [x] Payload Resolver (`wa.me` links -> Cart).
    - [x] Cart Management.
    - [x] Webhook Handler (Verified `hub.challenge` & Message Processing).
- [x] **Finance Workflows** (via Workflow Engine):
    - [x] Create Quote (Issues `QuoteVC`).
    - [x] Convert to Invoice (Issues `InvoiceVC`).
    - [x] Issue Receipt (Issues `ReceiptVC`).
- [x] **Payment Orchestration**:
    - [x] EcoCash Adapter (Simulation/API).
    - [x] Payment-triggered Receipt issuance.
- [x] **VC Issuance Service**: Unified `createOffer` for all types.

### Phase 2: Trust Engine & Regulators (Completed) ✅
**Goal**: Make trust visible and portable.
- [x] **Trust Engine**:
    - [x] Weighted Score Calculation (KYC, Payments, Disputes, Reviews).
    - [x] `TrustCard` API (Badge, Score, Top Drivers).
    - [x] Event Recording API.
- [x] **Regulator Portal**:
    - [x] Escalation Management (Signed Evidence Packages).
    - [x] Public Verifier Page (`/verify/{vcId}`).
- [x] **UI Integration**:
    - [x] Merchant Catalog Dashboard with Trust Card.
    - [x] Public Verification Page.

### Phase 3: Statutory & Payroll (In Progress) 🏗
**Goal**: Localize for Zimbabwe business compliance.
- [x] **Payroll Sub-module**:
    - [x] Employee Registry (Database Schema & API).
    - [x] Payroll Engine (Calculation Logic).
    - [ ] `PayslipVC` Schema Registration.
- [ ] **Statutory Plugins**:
    - [x] NSSA Calculator Logic (Implemented in Service).
    - [x] PAYE Calculator Logic (Implemented in Service).
    - [ ] ZIMRA Tax Clearance VC.

### Phase 4: HR & Ops Expansion (New)
**Goal**: "Workday Lite" - Operational workflows.
- [ ] **Onboarding Flow**: Employee KYC & Contract Signing.
- [ ] **Leave & Expenses**: Request/Approve workflows.
- [ ] **Bulk Payouts**: Connect Payroll Run to EcoCash Bulk Payer.

### Phase 5: Financial Statements & Reporting
**Goal**: "QuickBooks Killer" - Auditable-by-default reporting.
- [ ] **Statement Generator**: Income Statement, Balance Sheet from VCs.
- [ ] **SummaryVCs**: Signed financial statements for bank/lender consumption.
- [ ] **Audit View**: Drill-down from line item to signed ReceiptVC.

### Phase 6: ACK-ID Agent Registry & Delegation (New) 🤖
**Goal**: Enable delegated AI agents with verifiable ownership chains.
**Reference**: [Agent Commerce Kit (ACK)](https://www.agentcommercekit.com/)
- [ ] **Agent Provisioning**:
    - [ ] Create agent DIDs on provision (did:key or did:web).
    - [ ] Issue `ControllerCredential` linking owner → agent.
    - [ ] Agent DID documents include service endpoints.
- [ ] **Agent Registry** (`src/ai/agents/`):
    - [x] Database schema (`migrations/014_create_ai_agents.sql`).
    - [x] Repository (`src/persistence/AiAgentRepository.ts`).
    - [ ] Controller (`src/controllers/ai/AiAgentController.ts`).
    - [ ] Provisioning service with ACK SDK integration.
- [ ] **Delegation & Consent**:
    - [ ] `DelegationCredential` with scopes + limits.
    - [ ] Policy engine for scope enforcement.
    - [ ] Consent receipt VCs for user authorization.
- [ ] **Lifecycle Management**:
    - [ ] Status transitions (active/suspended/revoked).
    - [ ] Key rotation with credential re-issuance.
    - [ ] Agent audit trail.

### Phase 7: ACK-Pay Payment Protocol (New) 💳
**Goal**: Standardize payments with verifiable receipts per ACK-Pay spec.
**Reference**: [ACK-Pay Protocol](https://www.agentcommercekit.com/ack-pay)
- [ ] **Payment Request Flow**:
    - [ ] `PaymentRequest` schema (id, paymentOptions, expiresAt).
    - [ ] Signed JWT payment request tokens.
    - [ ] 402 Payment Required response pattern.
- [ ] **ACK-Pay Adapters** (`src/ai/payments/`):
    - [x] Base adapter interface (`AckPayAdapter.ts`).
    - [x] EcoCash adapter (`EcoCashAckPayAdapter.ts`).
    - [ ] MNEE stablecoin adapter.
    - [ ] Bank transfer adapter.
- [ ] **Receipt Issuance**:
    - [ ] `PaymentReceiptCredential` on payment confirmation.
    - [ ] Receipt includes paymentRequestToken + paymentOptionId.
    - [ ] Provider reference in metadata (ecocashRef/mneeTxHash).
- [ ] **Idempotency & Reconciliation**:
    - [x] Database schema for payment tracking.
    - [ ] Idempotency key enforcement.
    - [ ] State machine: initiated → pending → paid/failed → refunded.
- [ ] **Webhook Integration**:
    - [ ] Wire EcoCash webhook to ACK-Pay receipt issuance.
    - [ ] Deduplicate receipts via provider reference.

### Phase 8: Gen-UI & Agentic Workflows (New) 🎨
**Goal**: Workflow-driven UI generation for agent interactions.
- [ ] **Workflow-to-UI Schema**:
    - [ ] JSON schema for "actions requiring user input".
    - [ ] Form renderer in portal.
    - [ ] Approval workflows with step-up auth.
- [ ] **Agent Commerce Flows**:
    - [ ] Cart → PaymentRequest → Receipt via AI agent.
    - [ ] WhatsApp agent handoff with consent.
    - [ ] Escrow patterns for high-value transactions.
- [ ] **Human Oversight Integration**:
    - [ ] Manager approval thresholds.
    - [ ] Regulator escalation triggers.
    - [ ] Audit evidence capture.

### Phase 9: Production Hardening (Completed) ✅
**Goal**: Production-grade security and operations.
- [x] **Audit Logging**: Middleware + database persistence.
- [x] **Input Validation**: Zod schemas for all endpoints.
- [x] **Metrics & Health**: Prometheus endpoints, health checks.
- [x] **Database Tuning**: SQLite WAL mode, pragmas.
- [x] **Backup & Recovery**: Automated backup script.

### Phase 10: Advanced Security & Scale (Future) 🔮
**Goal**: Enterprise-grade custody and multi-region.
- [ ] **Secrets Management**:
    - [ ] Vault/HSM integration for signing keys.
    - [ ] Per-tenant secret rotation.
    - [ ] KMS adapter interface.
- [ ] **Advanced Revocation**:
    - [ ] Bitstring Status List publication per tenant.
    - [ ] `credentialStatus` in all issued VCs.
    - [ ] Verifier status list resolution.
- [ ] **Multi-Region**:
    - [ ] Database replication strategy.
    - [ ] Tenant data residency controls.
    - [ ] Disaster recovery plan.

---

## 🛠 Technical Stack

| Component | Technology | Role |
|-----------|------------|------|
| **Core Framework** | Node.js + TypeScript | Business Logic |
| **Identity/VCs** | Credo (Aries/OpenID4VC) | DIDs, Credentials, Trust |
| **API Layer** | TSOA + Express | Type-safe REST API |
| **Database** | SQLite (Better-SQLite3) | Persistence (Migratable to PG) |
| **Workflow Engine** | Custom JSON-Logic | Orchestration of VCs/Payments |
| **Frontend** | React (Next.js) + Tailwind | Portals & Wallet UI |
| **Integrations** | WhatsApp API, EcoCash | External Channels |
| **ACK Protocols** | @agentcommercekit/* | Agent Identity & Payments |

---

## 🤖 ACK Protocol Integration

**Agent Commerce Kit (ACK)** provides open standards for AI agent identity and payments.

### ACK-ID (Agent Identity)
- **Purpose**: Verifiable agent identities with ownership chains
- **Key Artifact**: `ControllerCredential` — proves owner DID → agent DID relationship
- **SDK**: `@agentcommercekit/ack-id`
- **Docs**: https://www.agentcommercekit.com/ack-id

### ACK-Pay (Agent Payments)
- **Purpose**: Agent-driven payment flows with verifiable receipts
- **Key Artifacts**:
  - `PaymentRequest` — structured request with payment options
  - `PaymentReceiptCredential` — VC proving payment satisfaction
- **SDK**: `@agentcommercekit/ack-pay`
- **Docs**: https://www.agentcommercekit.com/ack-pay

### Implementation Files
| File | Purpose |
|------|---------|
| `src/ai/types/ack-types.ts` | Type definitions for ACK-ID/ACK-Pay |
| `src/ai/payments/AckPayAdapter.ts` | Provider-agnostic payment interface |
| `src/ai/payments/adapters/EcoCashAckPayAdapter.ts` | EcoCash ACK-Pay implementation |
| `src/persistence/AiAgentRepository.ts` | Agent registry database operations |
| `migrations/014_create_ai_agents.sql` | Agent + payment tables schema |

### Design Principles (from ACK)
- **Open Standards**: W3C DIDs + VCs for vendor neutrality
- **Cryptographic Trust**: No central authority for identity/payment verification
- **Compliance-Ready**: KYC/KYB integration points
- **Human Oversight**: Strategic human approvals in automated flows

---

## 💎 The "IdenEx Difference"
| Feature | ZimLedger (Competitor) | IdenEx Credentis |
|---------|-----------------------|------------------|
| **Output** | PDF Invoice/Receipt | Verifiable Credential (VC) |
| **Trust** | Platform-dependent | Cryptographically Portable |
| **Verification** | Trust the PDF | Scan QR / Click Link to Verify |
| **Regulator** | Offline Reports | Real-time / Signed Bundles |
| **Ecosystem** | Walled Garden | Open Standards (DID/VC) |

---

## Quick Links
- **Backend**: `yarn dev` (Port 3000)
- **Portals**: `credo-ui/portal` (Port 5000)
- **Wallet**: `credo-ui/wallet` (Port 4000)
- **Docs**: `/docs` (Swagger UI)
- **ACK Alignment**: `ACK_PHASE_ALIGNMENT.md` (Implementation details)
- **Naming Guide**: `docs/AGENT_TERMINOLOGY_AND_NAMING.md` (AI vs Credo agent conventions)
