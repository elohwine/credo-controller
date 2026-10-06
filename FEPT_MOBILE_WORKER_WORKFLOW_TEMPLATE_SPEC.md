# Field Execution & Proof Workflow Template (FEPT)
**For Credo / Justice / Trust-as-a-Service Platform**

Version: 1.0  
Audience: Product, Backend, Frontend, Copilot, DevOps, Partnerships  
Purpose: Add a plug-and-play MyMobileWorkers-style field workflow template to the platform so organizations can create, execute, evidence, approve, payout, and reconcile real-world tasks without downloading a separate product.

---

## 1. Why this template exists

This template turns a mobile workforce / field execution process into a verifiable workflow.

It is inspired by mobile workforce patterns where work is assigned, completed on a mobile device, and supported by GPS, photos, signatures, timestamps, job evidence, and invoices. The platform should take that same idea and make it cryptographically verifiable, tenant-configurable, and reusable across industries.

This means a tenant can use the same platform to manage:

- delivery and handover workflows
- requisitions and approvals
- inspection and compliance workflows
- service completion and customer acknowledgement
- job sheets and field evidence capture
- invoicing and payment release
- auto-reconciliation and audit trails

The key principle is:

> One platform core. Many workflow templates. No separate product.

---

## 2. Product goal

Build a modular workflow template family that supports:

- mobile execution
- step-by-step approvals
- evidence capture
- customer/receiver acknowledgement
- payment trigger or payout release
- receipt issuance
- auto-reconciliation
- post-event auditability

The platform should support both:

1. **internal workflows**  
   Example: a company requisition request, signatory approvals, release authorization, and goods acknowledgement.

2. **external workflows**  
   Example: a merchant delivery workflow, school fee payment, or service completion workflow.

---

## 3. Core design principles

### 3.1 Template-driven
Do not hardcode one workflow into the application.

Instead, every tenant chooses a workflow template such as:

- field_service_completion
- procurement_request
- delivery_handover
- school_fee_payment
- e_commerce_fulfillment
- cash_counter_payment
- membership_renewal

### 3.2 Evidence-first
Every step can optionally produce evidence:

- signature
- photo
- GPS coordinates
- timestamp
- QR scan
- payment webhook
- signed approval presentation
- receipt VC
- delivery acknowledgement VC
- reconciliation record

### 3.3 Policy-controlled
Each template defines what is:

- mandatory
- optional
- hidden
- auto-generated
- manually approved
- wallet-required
- wallet-optional
- wallet-not-applicable

### 3.4 Standards-aligned
The workflow layer should remain compatible with:

- Verifiable Credentials for signed proof objects
- OpenID4VCI for issuing credentials to holder wallets
- StatusList / bitstring status for consuming or revoking receipts
- Payment link / hosted invoice patterns for public-facing payment collection
- BPMN-like process logic internally for workflow definitions

### 3.5 Mobile-first
The field workflow must work on phones first:

- fast load
- one-column UI
- QR scan support
- offline-capable evidence capture
- low-friction approvals
- no need for a separate app

### 3.6 Brandable
Each tenant can brand:

- logo
- color
- sender identity
- support contact
- receipt footer
- payment page style
- dashboard header

Keep the branding lightweight. Do not build custom storefronts or deep page builders.

---

## 4. Template name

Recommended name for this module:

**Field Execution & Proof Workflow Template (FEPT)**

Alternative names:
- Mobile Execution Workflow Template
- Verifiable Field Task Template
- Proof-of-Completion Workflow Template
- Work Order Evidence Workflow Template

Use FEPT in code and docs.

---

## 5. What this template does

The template converts a real-world action into a verifiable workflow:

1. Request created
2. Approval(s) gathered
3. Work assigned
4. Work executed
5. Evidence captured
6. Acknowledgement received
7. Payment or payout triggered
8. Receipt / completion VC issued
9. Reconciliation completed
10. Audit trail stored

This works for:
- deliveries
- office requisitions
- inspections
- maintenance jobs
- meals / catering
- school fee processes
- service completion
- supply requests
- mobile workforce jobs

---

## 6. Workflow templates supported by FEPT

### 6.1 Delivery / handover template
Use when a product or item is physically handed over.

Typical steps:
- request
- approval
- release authorization
- dispatch
- delivery
- receiver acknowledgement
- receipt issuance
- reconciliation

### 6.2 Procurement / requisition template
Use when a department requests materials or funds.

Typical steps:
- request
- signatory approvals
- release authorization
- execution
- acknowledgement
- reconciliation

### 6.3 Service completion template
Use when a worker or contractor completes a job.

Typical steps:
- job assignment
- start check-in
- field evidence
- completion
- customer confirmation
- invoicing
- reconciliation

### 6.4 Education fee template
Use when an institution wants fee collection only.

Typical steps:
- invoice
- payment link
- payment capture
- receipt VC
- reconciliation

### 6.5 Cash counter template
Use when payments are received in cash.

Typical steps:
- invoice
- cash capture
- receipt VC
- batch reconciliation

---

## 7. Key user roles

Define these roles in the template engine:

- **Requester**: creates the request or requisition
- **Approver**: signs or approves the request
- **Dispatcher**: assigns the work or release
- **Field Worker / Driver / Contractor**: executes the task
- **Receiver / Customer / Store Clerk**: acknowledges completion or handover
- **Finance Officer**: handles payment, payout, or reconciliation
- **Auditor**: reviews the trail later
- **Tenant Admin**: configures the workflow
- **System**: emits credentials, status changes, and audit events

---

## 8. Core workflow stages

The workflow engine should support these universal stages:

- `DRAFT`
- `REQUEST_CREATED`
- `APPROVAL_PENDING`
- `APPROVED`
- `RELEASE_AUTHORIZED`
- `ASSIGNED`
- `IN_PROGRESS`
- `EVIDENCE_CAPTURED`
- `ACKNOWLEDGED`
- `PAYMENT_TRIGGERED`
- `RECEIPT_ISSUED`
- `RECONCILED`
- `COMPLETED`
- `DISPUTED`
- `CANCELLED`
- `REVOKED`

Not every template needs every stage.

---

## 9. Template configuration model

Each workflow template should include the following controls.

### 9.1 Template identity
- template name
- tenant ID
- sector
- workflow type
- version
- enabled / disabled
- branding profile

### 9.2 Step definitions
Each step defines:
- step key
- step type
- order
- required / optional
- who can complete it
- what proof is required
- what output is emitted
- what credential is issued
- whether the step can be skipped

### 9.3 Evidence requirements
Define the evidence a workflow requires:
- signature
- photo
- GPS
- QR scan
- PIN
- biometric / passcode if needed
- document attachment
- payment webhook
- bank statement line
- manual approval

### 9.4 Approval policy
Define:
- number of approvals required
- order of approvers
- whether approvals are parallel or sequential
- whether a particular role is mandatory
- whether a VC presentation is required from an approver

### 9.5 Payment policy
Define:
- available payment methods
- whether payment is optional or required
- whether payment creates a payment link
- whether payment is escrowed
- whether funds are released only after acknowledgement
- whether auto-reconciliation is enabled

### 9.6 Credential policy
Define which VC types are issued:
- RequestVC
- QuoteVC
- ApprovalVC
- ReleaseAuthorizationVC
- DeliveryVC
- ReceiptVC
- AcknowledgementVC
- RefundVC
- ReconciliationVC

### 9.7 Wallet policy
Define:
- wallet required
- wallet offered
- wallet not applicable
- save later
- claim later
- retain forever
- retain until graduation / contract completion / policy expiry

### 9.8 Reconciliation policy
Define:
- exact match keys
- amount tolerance
- settlement source
- bank statement source
- provider source
- manual override rules
- exception status handling

---

## 10. Data model

### 10.1 WorkflowTemplate
Fields:
- id
- tenantId
- sector
- workflowType
- name
- description
- version
- enabled
- stepsJson
- paymentModesJson
- credentialPolicyJson
- walletPolicyJson
- reconciliationPolicyJson
- brandingPolicyJson
- createdAt
- updatedAt

### 10.2 WorkflowRun
Represents one live instance of a workflow.

Fields:
- id
- templateId
- tenantId
- reference
- createdBy
- currentStatus
- currentStepKey
- amount
- currency
- payerId
- payeeId
- provider
- providerReference
- settlementReference
- vcIdsJson
- evidenceIdsJson
- reconciliationStatus
- createdAt
- updatedAt

### 10.3 WorkflowStepInstance
Fields:
- id
- workflowRunId
- stepKey
- stepType
- status
- startedAt
- completedAt
- completedBy
- inputJson
- outputJson
- errorJson

### 10.4 EvidenceItem
Fields:
- id
- workflowRunId
- evidenceType
- hash
- uri
- metadataJson
- capturedBy
- capturedAt

Evidence types:
- signature
- photo
- GPS
- QR
- paymentWebhook
- approvalPresentation
- receiptPDF
- receiptVC
- bankStatementLine
- acknowledgementPhoto
- acknowledgementSignature

### 10.5 VCRecord
Fields:
- id
- workflowRunId
- vcType
- issuerDID
- holderDID
- statusListEnabled
- statusListId
- statusListIndex
- issuedAt
- revokedAt
- consumedAt
- payloadHash
- credentialStatusUri

### 10.6 ReconciliationRecord
Fields:
- id
- workflowRunId
- providerName
- providerReference
- settlementBatchId
- matchedAmount
- matchedCurrency
- matchStatus
- mismatchReason
- reconciledAt

---

## 11. Workflow engine behavior

The engine should operate as a state machine.

### 11.1 State transition rules
- A step can only start if dependencies are complete
- A required step cannot be skipped unless an admin policy allows it
- A step can emit one or more events
- A step may emit one or more VCs
- A step may trigger payment or payout
- A step may wait for external webhooks
- A step may require human confirmation

### 11.2 Event bus
Every transition should emit an event such as:
- `workflow.request.created`
- `workflow.approval.completed`
- `workflow.release.authorized`
- `workflow.execution.started`
- `workflow.evidence.captured`
- `workflow.ack.received`
- `workflow.payment.triggered`
- `workflow.receipt.issued`
- `workflow.reconciled`
- `workflow.disputed`

### 11.3 Idempotency
All state-changing operations must be idempotent.

If a worker taps “complete” twice, the system should not create duplicate receipts or duplicate payouts.

### 11.4 Replay safety
Webhook and acknowledgement events must be protected against replay.

---

## 12. Mobile-first UX behavior

The FEPT UI must assume:
- workers are on mobile
- connections can be weak
- evidence capture must be fast
- users may switch between browser, WhatsApp, and web app
- field staff need a very short workflow

### 12.1 Mobile worker screens
The worker should only see:
- assigned tasks
- task details
- evidence capture buttons
- acknowledgement button
- submit / complete button
- status indicator

### 12.2 Approver screens
Approvers should only see:
- request summary
- supporting evidence
- approve / reject / hold
- note / reason field
- VC presentation status if required

### 12.3 Customer / receiver screens
Receivers should only see:
- item summary
- quantity
- receipt of delivery or handover
- sign / confirm / acknowledge
- optional photo or signature
- final receipt status

### 12.4 Finance screens
Finance should only see:
- request
- approvals
- payment or payout status
- receipt status
- acknowledgement status
- reconciliation status
- exceptions
- exports

### 12.5 Admin screens
Tenant admin should be able to:
- create templates
- clone templates
- enable / disable payment methods
- choose VCs issued
- set required approvers
- set proof rules
- brand the workflow
- preview the workflow
- test it before live use

---

## 13. Plug-and-play architecture

The FEPT module must be plug-and-play.

That means:
- it should not require a separate application
- it should live inside the same platform shell
- it should reuse the same auth, wallets, VCs, payments, dashboard, and reconciliation engine
- it should be turn-on/turn-off per tenant
- it should be cloneable into tenant-specific templates

### 13.1 Shared core services
Use the same core services as the rest of the platform:
- identity service
- VC issuer service
- wallet service
- payment adapter service
- reconciliation service
- audit service
- branding service

### 13.2 FEPT adds
- mobile worker task execution
- field evidence capture
- approvals
- acknowledgement
- release authorization
- work completion receipts
- proof-of-execution records

---

## 14. Workflow examples

### 14.1 Delivery workflow
1. Quote created
2. Invoice issued
3. Payment link generated
4. Payment captured
5. Delivery assigned
6. Driver checks in
7. Photo / GPS / signature captured
8. Receiver acknowledges
9. ReceiptVC issued
10. StatusList updated if consumed
11. Reconciliation completed

### 14.2 Requisition workflow
1. Request created
2. Signatory approval requested
3. Approvals collected
4. Release authorization generated
5. Funds paid or materials dispatched
6. Goods acknowledged
7. ReceiptVC issued
8. Reconciliation completed

### 14.3 School fee workflow
1. Invoice issued
2. Payment link generated
3. Payment captured
4. ReceiptVC issued
5. Receipt stored in wallet if opted in or required
6. Reconciliation completed

### 14.4 Cash workflow
1. Invoice created
2. Cash capture logged
3. ReceiptVC issued
4. Cash counter close-out completed
5. Batch reconciliation completed

---

## 15. Wallet policy modes

### 15.1 `wallet_required`
The user must save the VC to a holder wallet before the process can continue.

Use when:
- the VC is the main evidence
- the VC must be reused later
- the user needs the proof in future
- the organization wants a persistent holder record

Example:
- student fee receipts kept until graduation
- long-lived attendance or membership proof
- high-value handover receipts

### 15.2 `wallet_offered`
The system offers the wallet, but the user may opt out.

Use when:
- adoption should be frictionless
- you still want the proof if the user accepts
- the workflow should work even without wallet signup

Example:
- e-commerce receipts
- service completion receipts
- general invoice payments

### 15.3 `wallet_not_applicable`
No wallet prompt is shown.

Use when:
- the record is short-lived
- the user does not need retained evidence
- the workflow is a simple cash counter flow or minimal proof event

Example:
- simple office cash payment
- one-off walk-in collection

---

## 16. Credential issuance rules

The system should issue credentials only when the template says so.

### 16.1 Possible VC outputs
- RequestVC
- QuoteVC
- InvoiceVC
- ApprovalVC
- ReleaseAuthorizationVC
- DeliveryVC
- AcknowledgementVC
- ReceiptVC
- RefundVC
- ReconciliationVC

### 16.2 When to issue
Examples:
- QuoteVC on quote creation
- InvoiceVC on invoice issuance
- ApprovalVC on successful signatory approval
- ReceiptVC on confirmed payment
- DeliveryVC on verified handover
- AcknowledgementVC on receiver confirmation
- RefundVC on refund completion
- ReconciliationVC after settlement matching

### 16.3 StatusList behavior
For one-time or consumable proof objects, use StatusList / bitstring state.

Typical receipt states:
- active
- consumed
- revoked
- refunded

---

## 17. Payment integration behavior

The FEPT template must support multiple payment methods.

### Supported methods
- payment link
- wallet payment
- mobile money
- bank transfer
- cash
- POS/card
- manual override
- deferred settlement
- escrow release

### Payment link behavior
The platform should be able to generate a secure payment link from:
- quote
- invoice
- requisition
- delivery order
- service request

The link should:
- be unique
- be branded
- carry the reference
- expire safely
- support payment method selection
- allow receipt issuance after success

### Receipt and reconciliation
After payment success:
- issue ReceiptVC
- store evidence
- notify dashboard
- begin reconciliation
- if required, update status list to consumed later

---

## 18. Acknowledgement flow

Acknowledgement is the proof that the task was actually received, completed, or accepted.

Examples:
- driver delivered the items
- store clerk received the items
- student office confirmed tuition
- procurement officer confirmed stock
- site supervisor accepted the work

### Acknowledgement methods
The template should support:
- signature
- PIN
- QR scan
- photo of signed receipt
- geo-tagged confirmation
- wallet presentation
- approver presentation
- receiver one-tap confirmation

### Acknowledgement VC
When acknowledgement is important, issue an AckVC or DeliveryVC.

The ack record should include:
- workflow reference
- role of the receiver
- time
- evidence hash
- status

---

## 19. Reconciliation behavior

The template should include reconciliation as a first-class step, not an afterthought.

### Reconciliation modes
- real-time webhook match
- batch settlement match
- manual cash close
- bank statement import
- hybrid
- exception-only review

### Reconciliation keys
Default match keys:
- reference
- provider reference
- amount
- currency
- payer identifier
- student ID
- invoice number
- delivery evidence hash
- settlement batch ID

### Reconciliation statuses
- matched
- partially matched
- pending
- missing payment
- missing acknowledgement
- amount mismatch
- disputed
- refunded
- reversed
- closed

---

## 20. Dashboard behavior

The platform dashboard should be able to show workflow-specific summaries.

### Common widgets
- count of requests
- count approved
- count in progress
- count completed
- count awaiting acknowledgement
- count pending reconciliation
- count exceptions
- count receipts issued
- count consumed / revoked receipts

### Workflow-specific widgets
For delivery:
- routes
- jobs in transit
- proof captured
- pending signatures

For procurement:
- approvals pending
- release authorizations pending
- goods outstanding
- variance items

For education:
- invoices sent
- payments received
- receipts issued
- unmatched fees
- batch close status

---

## 21. UI rules for abstraction

The UI should never expose SSI jargon to the average tenant user.

Use plain language:
- “save receipt”
- “proof of payment”
- “acknowledge delivery”
- “approve request”
- “release funds”
- “show proof”
- “reconcile payments”

Avoid:
- DID
- VC
- VP
- StatusList
- issuer metadata
- holder binding
- credential lifecycle

Those belong in advanced settings.

---

## 22. Safe defaults by sector

### Education
- wallet_offered
- invoice required
- receipt VC required
- payment methods: gateway, bank, cash
- reconciliation: invoice-payment-settlement
- delivery verification: off

### E-commerce / delivery
- wallet_offered
- invoice required
- receipt VC required
- delivery verification required
- reconciliation: payment-delivery-settlement

### Procurement / requisition
- wallet_required for approvers if the organization wants strong evidence
- approval VC required
- release authorization VC required
- acknowledgement VC required
- reconciliation: request-approval-release-ack-settlement

### Cash
- wallet_not_applicable by default
- receipt VC optional
- batch reconciliation required

---

## 23. Security requirements

- all steps must be auditable
- all approval actions must be attributable
- all evidence must be hashable
- all state changes must be logged
- all webhook events must be signed
- all payout requests must be idempotent
- all wallet save flows must respect consent rules
- all sensitive evidence must be access-controlled

---

## 24. Product boundaries

Do NOT build:
- a separate workforce app
- a separate shop builder
- a separate ERP
- a separate wallet product
- a full CMS

Build:
- a workflow engine
- a template editor
- a branding layer
- a dashboard
- a payment-link generator
- a VC issuer
- a verifier
- a reconciliation engine

---

## 25. Acceptance criteria

The FEPT module is complete when:

1. A tenant can create a workflow template.
2. A tenant can choose mandatory and optional steps.
3. A tenant can enable payment methods.
4. A tenant can choose which VC types are issued.
5. A tenant can define required approvers.
6. A tenant can require or omit wallet use.
7. A tenant can require acknowledgements.
8. A tenant can reconcile automatically.
9. A tenant can view evidence and audit trails.
10. The same template can be reused for many records.
11. The template can be branded.
12. The template can be cloned or versioned safely.

---

## 26. Copilot implementation brief

### Goal
Build a reusable workflow template module for the Credo platform that supports mobile workforce style workflows with approvals, evidence capture, VC issuance, payment triggers, acknowledgement, and reconciliation.

### Must-haves
- template schema
- step schema
- state machine
- wallet policy
- credential policy
- payment methods
- reconciliation policy
- tenant branding
- audit events
- dashboard widgets
- mobile worker UI
- approver UI
- receiver/ack UI
- admin template editor

### Engineering style
- modular
- plugin-friendly
- multi-tenant
- API-first
- mobile-first
- strict event-driven state changes
- no hardcoded sector assumptions
- no separate product surface
- compatible with current payment/VC platform

---

## 27. Strategic scaling notes

The long-term goal is to make the workflow engine the default layer for trust in African business operations.

To do that:
- ship the simplest possible first template
- keep it mobile-first
- make it easy to clone for new sectors
- make evidence automatic
- make approvals verifiable
- make payments and receipts traceable
- make recon automatic
- make branding lightweight
- make onboarding fast

This creates network effects because every tenant adds:
- more workflow templates
- more proof events
- more integrations
- more evidence types
- more reusable trust logic

That is what turns the platform into infrastructure rather than an app.

---

## 28. Implementation roadmap

### Phase 1
- build template schema
- build workflow run tracking
- build approval flow
- build acknowledgement flow
- build receipt VC issuance
- build basic reconciliation

### Phase 2
- add evidence capture
- add GPS/photo/signature support
- add wallet policies
- add payment link generation
- add StatusList receipt consumption
- add dashboard widgets

### Phase 3
- add sector presets
- add workflow cloning
- add template versioning
- add custom branding
- add advanced policy controls
- add external org interoperability

### Phase 4
- let tenants define their own workflows from the dashboard
- allow tenants to enable or disable modules
- allow tenant-specific evidence rules
- allow reusable workflow libraries
- turn the platform into a workflow marketplace

---

## 29. Final product promise

The platform should let an organization say:

- “We need a request approval flow.”
- “We need a delivery verification flow.”
- “We need school fee receipts.”
- “We need cash counter reconciliation.”
- “We need payment release after acknowledgement.”

And the system should let them configure that in minutes, not weeks.

That is the point of the FEPT module.
