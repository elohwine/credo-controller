# SGK Supply Chain to SSI/OID4VC Implementation Plan

## 1. Purpose

This plan maps SGK/LG field and procurement operations onto the existing credo-controller platform with a strict priority order:

1. Reuse what already exists (VC definitions, templates, workflow/request/discovery APIs)
2. Extend existing models with supply-chain claims where needed
3. Add net-new VC types only when reuse and extension cannot satisfy SGK requirements

This avoids duplicate credential models and keeps issuance, verification, and wallet UX consistent.

Strategic framing for SGK:
- Do not position this as a generic CMMS replacement.
- Position this as a verifiable maintenance trust layer where each critical maintenance/procurement event becomes independently provable and machine-reconcilable across organizations.

## 2. Architecture Principles (Mandatory)

1. Reuse first: Prefer `InvoiceVC`, `ReceiptVC`, `PaymentReceiptCredential`, requisition VCs, existing workflow templates, and discovery/request infrastructure.
2. Profile over fork: Add SGK claim profiles to existing VC types before creating new VC names.
3. Chain every record: Every issued VC must include deterministic linkage keys (run, job, requisition, payment refs).
4. Keep scan modes separate: Generic scanner remains utility; FEPT evidence progression remains workflow-bound.
5. Keep OID4VC discovery accurate: Published metadata must mirror real, issueable credential definitions.

## 3. Current Code Reality (Updated)

## 3.1 Already Working and Reusable

1. Multi-tenant SSI foundation with Askar and tenant agents.
2. Tenant provisioning that creates issuer/verifier DIDs, stores metadata, and persists tenant records.
3. Public OIDC metadata endpoints for platform and tenant discovery:
  - `/.well-known/openid-credential-issuer`
  - `/tenants/{tenantId}/.well-known/openid-credential-issuer`
  - `/tenants/{tenantId}/.well-known/openid-verifier`
4. Reusable seeded VC definitions in model registry:
  - `InvoiceVC`, `ReceiptVC`, `PaymentReceiptCredential`, `PaymentReceipt`
  - `RequisitionVC`, `ApprovalVC`, `ReleaseAuthorizationVC`, `ExecutionAckVC`
  - `CartSnapshotVC`, `CatalogItemVC`
5. Reusable workflow templates and action engine:
  - `tpl-quote-invoice-receipt`
  - `tpl-delivery-escrow`
  - FEPT canonical checkpoint normalization in workflow template persistence
6. Inter-org trust primitives already present:
  - Workflow requests (holder/org initiation + approval)
  - Discovery/service catalog and organization registry

## 3.2 Real Gaps (Gap-Only)

1. Some VC names used in templates and flows are not seeded as credential definitions yet (for example `QuoteVC`, `PaymentReceiptVC`, `EscrowVC`, `DeliveryConfirmationVC`).
2. Supply-chain-specific claim profiles are not formalized (job card, material receipt specialization, completion acknowledgement profile).
3. Revocation/status list strategy is still not production-grade.
4. FEPT scanner separation exists, but hard guardrails should prevent accidental use of generic capture in run-bound stages.
5. Cross-org trust policy packs (role+claim requirements by action type) need formalization.

## 4. SGK Reuse Matrix (No Duplication)

| SGK Artifact | Reuse Existing First | Extension Needed | Net-New Needed? |
|---|---|---|---|
| Quote | `QuoteVC` workflow usage already exists in templates/controllers | Seed `QuoteVC` definition in model registry | No |
| Purchase Order / Authorization | `RequisitionVC` + `ApprovalVC` + `ReleaseAuthorizationVC` | Add procurement-specific claims profile | No |
| Job Card | `RequisitionVC` as base work authorization | Add job execution profile (`jobId`, SLA, location, assignment) | Only if profile becomes too divergent |
| Before/After Field Evidence | FEPT canonical run checkpoints + evidence hash flow | Optional VC envelope profile if external verification required | Not initially |
| Material Purchase Receipt | `ReceiptVC` base + payment linkage | Add SGK material receipt profile claims (`shopNumber`, `lineItems`, VAT, job linkage) | No at MVP |
| Invoice | `InvoiceVC` already seeded | Add linked references (`linkedReceiptIds`, `linkedEvidenceIds`, `requisitionId`) | No |
| Payment Receipt | `PaymentReceiptCredential` and `PaymentReceipt` already seeded | Add alias support to issue/verify as `PaymentReceiptVC` if required by template naming | No |
| Delivery/Completion Confirmation | `ExecutionAckVC` as current acknowledgement base | Add completion/delivery profile claims | Only if interoperability requires dedicated type |
| Escrow Event | `tpl-delivery-escrow` workflow logic exists | Seed `EscrowVC` definition only if escrow VC issuance is turned on | Conditional |

## 5. SGK Flow Mapping (Reuse-First)

1. Intake and approval:
  - Use workflow requests for quote/job/requisition initiation between orgs.
  - Use discovery to select trusted supplier/shop partners by service and VC capability.
2. Procurement authorization:
  - Issue `RequisitionVC` then `ApprovalVC`/`ReleaseAuthorizationVC`.
3. Field execution:
  - Use FEPT run checkpoints for before/after evidence and guarded progression.
4. Commercial documents:
  - Issue `InvoiceVC` linked to requisition and evidence references.
5. Settlement and closeout:
  - Issue payment receipt using existing payment receipt definitions and aliasing.
  - Use `ExecutionAckVC` completion profile for closeout acknowledgement.

Target verifiable chain:

`RequisitionVC -> ApprovalVC/ReleaseAuthorizationVC -> (FEPT evidence checkpoints + optional evidence VC profile) -> ReceiptVC(material profile) -> InvoiceVC -> PaymentReceiptCredential(alias PaymentReceiptVC) -> ExecutionAckVC(completion profile)`

## 5.1 Extended SGK Lifecycle Blueprint (From sgk-web3, Reuse-Aligned)

This is the recommended operational lifecycle for SGK on current architecture, separated into procurement and execution tracks that converge at reconciliation.

1. Client purchase order intake
2. Purchase authorization (`RequisitionVC` + `ApprovalVC`)
3. Job card/assignment (`RequisitionVC` job profile + assignment fields)
4. Risk assessment checkpoint (execution profile extension)
5. Technician acceptance and dispatch checkpoint
6. Arrival proof checkpoint (GPS/QR evidence in FEPT run output)
7. Before evidence checkpoint (photo/hash)
8. Material request + approval (`ReleaseAuthorizationVC`)
9. Supplier procurement event (reuse request/discovery + receipt profile on `ReceiptVC`)
10. Supplier delivery/receipt acknowledgement (`ExecutionAckVC` profile or `DeliveryConfirmationVC` if required)
11. Continue work
12. After evidence checkpoint (photo/hash)
13. Inspection/customer signoff (`ExecutionAckVC` completion profile)
14. Invoice issuance (`InvoiceVC` linkage profile)
15. Payment receipt issuance (`PaymentReceiptCredential` alias-compatible with `PaymentReceiptVC` naming)
16. Automatic reconciliation (PO/Approval -> Invoice -> Receipt -> Payment -> Completion evidence graph)
17. Warranty/close-job event (extension profile; net-new VC only if external interoperability requires it)

Result:
- Minimal paperwork path
- Evidence-first execution
- Cross-org cryptographic auditability

## 6. Two Scan Modes Contract (Must Stay Strict)

## 6.1 Mode A: Generic Scan Utility

Allowed:
- Accept credential offers
- Verify generic presentations
- Standalone non-FEPT evidence capture
- Delivery/link verification utilities

Not allowed:
- Any FEPT run state transition
- Any replacement of run-bound before/after checkpoint actions

## 6.2 Mode B: In-Flow FEPT Scan

Required:
- `runId`-bound context
- Pause reason and stage-aware gating
- Idempotent resume semantics

Allowed:
- Run-bound before/after evidence capture
- Guarded resume and acknowledgement actions

Rule:
- If user is in workflow-run context, always route scanner actions to in-flow FEPT handling.

## 7. OID4VCI/OID4VP Profile and Metadata Contract

1. Keep tenant metadata endpoints as source of truth for wallet discovery.
2. Ensure `credential_configurations_supported` only lists issueable definitions.
3. Do not advertise template-only VC names until their definitions are seeded.
4. For SGK mobile speed, support pre-authorized issuance where appropriate.
5. For approvals/high-risk actions, use stronger holder binding and minimal claim requests.

## 7.1 DID Contacts and Capability Routing Contract

For each supplier/partner DID contact, maintain capability metadata that drives automatic routing:

1. Supported workflows (procurement, delivery, acknowledgement, payment)
2. Supported credential types and aliases
3. Accepted payment methods (EcoCash, bank, click-to-pay, and related rails)
4. Verification requirements and approval policies
5. Preferred gateway/transport endpoint policy

Operational behavior:
- SGK selects a partner DID, not a free-text supplier record.
- Workflow engine and request orchestration use partner capabilities to determine request type, required proofs, and next actions.
- No repeated onboarding logic per transaction.

## 7.2 Inter-Organization Trust Network Pattern

Each organization keeps its own data store and audit trail while exchanging verifiable proofs only:

1. SGK raises a material/procurement request.
2. Supplier processes request in its own workflow.
3. Supplier returns verifiable invoice/receipt/delivery proofs.
4. SGK verifies and reconciles without shared database coupling.

This creates a reusable trust fabric for suppliers, technicians, transporters, clients, finance, and banks.

## 8. Implementation Work Packages (Reordered by Reuse)

## WP1 (P1): Definition-Template Consistency Pass

Deliver:
1. Seed missing definitions for currently-used template VC names (`QuoteVC`, `PaymentReceiptVC`, and conditional `EscrowVC`/`DeliveryConfirmationVC` if enabled).
2. Keep compatibility aliases so existing flow names continue to work.
3. Update OIDC metadata to expose only issueable credential configurations.

Acceptance:
1. Every template `outputVCs` value that is enabled has a matching credential definition.
2. Wallet discovery lists credentials that can actually be issued.

## WP2 (P1): SGK Claim Profiles on Existing VCs

Deliver:
1. Extend `RequisitionVC` profile for Job Card semantics.
2. Extend `ReceiptVC` profile for Material Receipt semantics.
3. Extend `ExecutionAckVC` profile for Completion/Delivery acknowledgement semantics.
4. Extend `InvoiceVC` with deterministic linkage claims.

Acceptance:
1. SGK flow can run end-to-end with mostly existing VC types.
2. No duplicate VC definitions are introduced for equivalent semantics.

## WP3 (P1): FEPT Scan Guardrail Enforcement

Deliver:
1. Enforce run-context routing to in-flow FEPT capture and checkpoints.
2. Block generic standalone evidence route from mutating FEPT run progression.

Acceptance:
1. FEPT progression cannot occur via generic scan utility path.

## WP4 (P2): Trust and Revocation Hardening

Deliver:
1. Introduce tenant-level revocation/status list strategy.
2. Define cross-org verifier policy packs by action type (quote acceptance, payment release, completion ack).
3. Add auditable policy enforcement events.

Acceptance:
1. Revoked credentials fail verification consistently.
2. Trust policy violations are visible and actionable.

## WP5 (P1/P2): End-to-End SGK Test Journey

Deliver:
1. Integration test: request -> requisition/approval -> FEPT before/after -> material receipt profile -> invoice -> payment receipt -> completion ack.
2. Test coverage for discovery + workflow-request initiated cross-org flow.

Acceptance:
1. Full SGK chain passes with deterministic references and policy checks.

## WP6 (P2): DID Contact Capability Index for Supply Chain

Deliver:
1. Extend contact/org capability metadata to include supply-chain roles and policy primitives.
2. Add routing rules that choose request/verification patterns from partner capabilities.
3. Add safety fallback when capability metadata is incomplete.

Acceptance:
1. Selecting a partner DID preconfigures workflow request requirements and verification expectations.
2. Manual configuration per transaction is reduced to exceptions only.

## WP7 (P2): Reconciliation Engine Policy Packs

Deliver:
1. Implement configurable matching modes:
  - 2-way: Approval/PO -> Invoice
  - 3-way: Approval/PO -> Delivery/Receipt -> Invoice
  - 4-way: Approval/PO -> Delivery/Receipt -> Invoice -> Payment/Completion
2. Add duplicate billing and unauthorized charge checks from immutable identifiers.
3. Emit reconciliation decision evidence for audit workflows.

Acceptance:
1. Finance can run automatic matching by policy profile with exception queues only.
2. Duplicate/price mismatch/unauthorized billing anomalies are detectable and traceable.

## 9. Minimum Claim Profiles (Extension-First)

## 9.1 RequisitionVC Job Card Profile

- `credentialSubject.requisitionId`
- `credentialSubject.jobId`
- `credentialSubject.assignment`
- `credentialSubject.sla`
- `credentialSubject.location`
- `credentialSubject.approvedAmount`

## 9.2 ReceiptVC Material Receipt Profile

- `credentialSubject.receiptId`
- `credentialSubject.shopNumber`
- `credentialSubject.lineItems[]`
- `credentialSubject.vatAmount`
- `credentialSubject.totalAmount`
- `credentialSubject.currency`
- `credentialSubject.jobId`
- `credentialSubject.workflowRunId`

## 9.3 InvoiceVC SGK Linkage Profile

- `credentialSubject.invoiceId`
- `credentialSubject.requisitionId`
- `credentialSubject.linkedReceiptIds[]`
- `credentialSubject.linkedEvidenceIds[]`
- `credentialSubject.totalAmount`
- `credentialSubject.currency`

## 9.4 Payment Receipt Alias Profile

- Keep issuance compatible across `PaymentReceiptCredential`, `PaymentReceipt`, and `PaymentReceiptVC` naming.
- Normalize verification policy to one canonical claim set.

## 10. Operational Guardrails

1. Never hand-edit generated tsoa routes/swagger artifacts.
2. Keep workflow resume idempotency intact for FEPT and payment callbacks.
3. Enforce run guard checks for every FEPT progression action.
4. Keep secrets out of plaintext operational logs and move to managed secret storage.

## 11. Immediate Next Steps (Concrete)

1. Run a definition-template parity audit and seed missing reusable definitions without introducing duplicate semantics.
2. Implement SGK claim profiles by extending existing `RequisitionVC`, `ReceiptVC`, `InvoiceVC`, and `ExecutionAckVC`.
3. Add FEPT routing guard that hard-blocks generic scan paths from advancing run checkpoints.
4. Ship one end-to-end SGK test that proves the reuse-first chain and alias compatibility for payment receipts.
5. Add supplier DID capability mapping and routing rules for procurement and delivery workflows.
6. Add policy-based reconciliation tests for 2-way/3-way/4-way matching.

## 12. Product Positioning and Messaging (SGK)

Primary positioning:
- Verifiable Maintenance Operations Platform
- Trust Layer for Maintenance and Supplier Operations

Message:
- We do not replace your maintenance process.
- We make each maintenance/procurement event independently verifiable, automatically reconcilable, and securely shareable across suppliers, subcontractors, technicians, clients, and finance teams.

Why this matters commercially:
1. Immediate value: less manual reconciliation and stronger auditability.
2. Strategic value: reusable inter-organization trust network beyond one maintenance account.
3. Platform value: maintenance becomes one high-value template in a broader proof-of-reality architecture.
