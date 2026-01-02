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
