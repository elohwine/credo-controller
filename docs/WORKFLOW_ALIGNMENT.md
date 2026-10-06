/\*\*

- Platform Remodel Workflow Alignment Document
-
- Clarifies the architectural boundaries and integration points for the
- platform-remodel branch, aligning with:
- - Existing WorkflowService (no second engine)
- - Platform Request Lifecycle Service
- - SSI Evidence Layer
- - Organizational Authorization Service
-
- This is NOT a generic workflow builder, credential demo, or procurement system alone.
- It is a **verifiable organizational workflow platform** where:
- - Platform owns business state, authorization, workflow orchestration
- - SSI provides cryptographic evidence and trust
- - Authorization = Member + Role + Authority + Delegation + Credential + Policy
-
- @file Platform Remodel Workflow Alignment
  \*/

// ============================================================================
// 1. ARCHITECTURAL PRINCIPLES
// ============================================================================

/\*\*

- Core Principle 1: SSI Boundary
-
- WALLET OWNS:
- - Private keys
- - Seed phrases
- - Credential payloads
- - Presentation capability
- - Holder cryptographic operations
-
- PLATFORM OWNS:
- - Workflow state
- - Business requests
- - Authorization decisions
- - Policy evaluation
- - Verification outcomes
- - Credential references (not payloads)
- - Trust decisions
- - Audit records
-
- Do NOT persist:
- - Raw VC payloads
- - Raw VP payloads
- - Private keys
- - Seed phrases
    \*/

/\*\*

- Core Principle 2: Credential ≠ Authorization
-
- A valid credential alone does NOT grant authorization.
-
- Authorization decision must be based on:
-
- ┌─────────────────────────────────────┐
- │ AUTHORIZATION DECISION │
- ├─────────────────────────────────────┤
- │ ✓ Authenticated subject │
- │ ✓ Active organization member │
- │ ✓ Role has permission │
- │ ✓ Authority within limit │
- │ ✓ Department/cost centre match │
- │ ✓ Delegation valid & constrained │
- │ ✓ Separation of duties honored │
- │ ✓ IF policy requires credential: │
- │ - Credential exists │
- │ - Credential status = valid │
- │ - Credential issuer trusted │
- │ - Credential not expired │
- │ ✓ Policy evaluation result │
- └─────────────────────────────────────┘
-
- Credential is ONE INPUT among many.
  \*/

/\*\*

- Core Principle 3: No Second Workflow Engine
-
- The platform has ONE workflow service: WorkflowService
-
- ├── WorkflowService (existing)
- │ ├── ActionRegistry
- │ │ ├── credential.issue
- │ │ ├── credential.verify
- │ │ ├── finance.calculate_invoice
- │ │ ├── external.ecocash_payment
- │ │ ├── external.call_provider
- │ │ ├── trust.update_score
- │ │ ├── consent.capture
- │ │ ├── request.wait_for_task
- │ │ └── request.complete_task
- │ ├── WorkflowRepository
- │ ├── WorkflowRunRepository
- │ └── WorkflowRun tracking/audit
-
- Request task integration maps onto WorkflowService:
- - request_tasks table stores task references
- - Workflow action: request.wait_for_task (pauses workflow)
- - Human completes task (updates task record)
- - Workflow action: request.complete_task (resumes)
    \*/

/\*\*

- Core Principle 4: Platform Request Lifecycle
-
- Generic request lifecycle (platform-scoped, business-independent):
-
- draft
- ↓
- submitted (requester transitions, authorization required: request.submit)
- ↓
- in_review (optional, depends on policy)
- ↓
- approved (non-requester transitions, authorization required: request.approve)
- ↓ (optional rejection: request.reject → rejected)
- ↓
- in_fulfilment (fulfiller transitions, authorization required: request.execute)
- ↓ (optional cancellation: request.cancel → cancelled)
- ↓
- completed (audit → closed)
-
- PlatformRequestService handles:
- - Lifecycle state machine
- - Visibility filtering (requester sees own, privileged see broader)
- - Authorization at every transition
- - Audit event recording
- - Context validation
    \*/

/\*\*

- Core Principle 5: Policy Decision Recording
-
- Every authorization decision must be recorded in policy_decisions table:
-
- ┌──────────────────────────────────────┐
- │ policy_decisions │
- ├──────────────────────────────────────┤
- │ id UUID │
- │ tenant_id tenant context │
- │ organization_id org context │
- │ actor_person_id who decided │
- │ action request.approve │
- │ resource_type request │
- │ resource_id request_id │
- │ authorized true/false │
- │ decision_reason policy result │
- │ constraint_context { amount, dept... }│
- │ credentials_checked [ cred_ref... ] │
- │ delegation_chain [ delegation_id...] │
- │ timestamp ISO8601 │
- └──────────────────────────────────────┘
-
- This enables:
- - Complete audit trail
- - Maker-checker validation
- - Dispute resolution
- - Compliance reporting (e.g., "show all approvals > USD 1000 in Feb 2026")
- - Attribution (who decided, when, why)
    \*/

// ============================================================================
// 2. DATA MODEL: ORGANIZATIONAL SCHEMA
// ============================================================================

/\*\*

- Organizations are multi-tenant, have roles, authority grants, departments.
-
- ┌────────────────────┐
- │ organizations │
- ├────────────────────┤
- │ id UUID │ ← primary key
- │ tenant_id string │ ← Credo tenant context
- │ name string │
- │ sector string │
- │ status string │ (active, archived)
- │ created_at date │
- └────────────────────┘
-         │
-         ├─→ ┌─────────────────────┐
-         │   │ org_memberships     │
-         │   ├─────────────────────┤
-         │   │ id            UUID  │
-         │   │ org_id        FK    │
-         │   │ user_id       opaque│
-         │   │ role_id       FK    │
-         │   │ status        string│
-         │   │ joined_at     date  │
-         │   └─────────────────────┘
-         │
-         ├─→ ┌─────────────────────┐
-         │   │ people              │
-         │   ├─────────────────────┤
-         │   │ id           UUID   │
-         │   │ org_id       FK     │
-         │   │ subject_ref  opaque │ ← pairwise identity
-         │   │ status       string │
-         │   │ metadata     JSON   │
-         │   └─────────────────────┘
-         │
-         ├─→ ┌─────────────────────┐
-         │   │ roles               │
-         │   ├─────────────────────┤
-         │   │ id           UUID   │
-         │   │ org_id       FK     │
-         │   │ name         string │
-         │   │ permissions  JSON[] │
-         │   └─────────────────────┘
-         │
-         ├─→ ┌──────────────────────────┐
-         │   │ authority_grants         │
-         │   ├──────────────────────────┤
-         │   │ id              UUID     │
-         │   │ person_id       FK       │
-         │   │ domain          string   │ (finance, procurement...)
-         │   │ max_amount      number   │
-         │   │ currency        string   │
-         │   │ delegatable     bool     │
-         │   │ delegated_from  FK       │ (optional, for delegation chain)
-         │   │ status          string   │ (active, suspended)
-         │   │ valid_until     date     │ (optional, temporal validity)
-         │   └──────────────────────────┘
-         │
-         ├─→ ┌─────────────────────┐
-         │   │ delegations         │
-         │   ├─────────────────────┤
-         │   │ id           UUID   │
-         │   │ grantor      FK     │ (authority_grant who grants)
-         │   │ delegatee    FK     │ (person receiving delegation)
-         │   │ scope        JSON   │ (constrained permissions)
-         │   │ valid_until  date   │
-         │   │ status       string │
-         │   └─────────────────────┘
-         │
-         ├─→ ┌──────────────────────┐
-         │   │ departments          │
-         │   ├──────────────────────┤
-         │   │ id           UUID    │
-         │   │ org_id       FK      │
-         │   │ name         string  │
-         │   │ code         string  │
-         │   │ manager_id   FK      │ (optional)
-         │   │ status       string  │
-         │   └──────────────────────┘
-         │
-         └─→ ┌──────────────────────┐
-             │ service_catalog      │
-             ├──────────────────────┤
-             │ id           UUID    │
-             │ org_id       FK      │
-             │ service_type string  │ (payment, notification, audit...)
-             │ name         string  │
-             │ is_active    bool    │
-             │ metadata     JSON    │ (provider, mode, endpoints...)
-             └──────────────────────┘
  \*/

// ============================================================================
// 3. REQUEST LIFECYCLE INTEGRATION
// ============================================================================

/\*\*

- Requests are the unit of work in the platform.
-
- ┌─────────────────────────────────────┐
- │ requests │
- ├─────────────────────────────────────┤
- │ id UUID │
- │ org_id FK │
- │ actor_person_id FK │
- │ request_type string │ (ecommerce_order, procurement_requisition...)
- │ title string │
- │ description text │
- │ amount number │
- │ currency string │
- │ priority enum │
- │ status string │
- │ target_module string │ (finance, hr, field_ops...)
- │ context JSON │ (biz-specific: items[], invoice data, etc)
- │ created_at timestamp │
- │ updated_at timestamp │
- └─────────────────────────────────────┘
-         │
-         ├─→ ┌────────────────────┐
-         │   │ request_items      │
-         │   ├────────────────────┤
-         │   │ id           UUID  │
-         │   │ request_id   FK    │
-         │   │ description  text  │
-         │   │ quantity     number│
-         │   │ unit_price   number│
-         │   │ item_type    string│
-         │   │ metadata     JSON  │
-         │   └────────────────────┘
-         │
-         ├─→ ┌──────────────────────┐
-         │   │ request_approvals    │
-         │   ├──────────────────────┤
-         │   │ id            UUID   │
-         │   │ request_id    FK     │
-         │   │ approver_id   FK     │
-         │   │ action        string │ (approve, reject)
-         │   │ reason        text   │
-         │   │ timestamp     date   │
-         │   │ policy_decision_id FK│
-         │   └──────────────────────┘
-         │
-         ├─→ ┌──────────────────────┐
-         │   │ request_tasks        │
-         │   ├──────────────────────┤
-         │   │ id            UUID   │
-         │   │ request_id    FK     │
-         │   │ workflow_run_id FK   │
-         │   │ title         string │
-         │   │ description   text   │
-         │   │ assigned_to   FK     │
-         │   │ status        string │ (pending, completed)
-         │   │ due_date      date   │
-         │   │ completed_at  date   │
-         │   └──────────────────────┘
-         │
-         ├─→ ┌──────────────────────┐
-         │   │ request_events       │
-         │   ├──────────────────────┤
-         │   │ id            UUID   │
-         │   │ request_id    FK     │
-         │   │ action        string │
-         │   │ actor_person_id FK   │
-         │   │ timestamp     date   │
-         │   │ details       JSON   │
-         │   └──────────────────────┘
-         │
-         └─→ ┌──────────────────────────┐
-             │ policy_decisions         │
-             ├──────────────────────────┤
-             │ id               UUID    │
-             │ request_id       FK      │
-             │ actor_person_id  FK      │
-             │ action           string  │
-             │ authorized       bool    │
-             │ decision_reason  text    │
-             │ credentials_checked JSON │
-             │ timestamp        date    │
-             └──────────────────────────┘
  \*/

// ============================================================================
// 4. WORKFLOW INTEGRATION POINTS
// ============================================================================

/\*\*

- WorkflowService orchestrates business outcomes.
- Workflows are templates that define sequences of actions.
-
- Action Types (extend as needed):
- ├─ credential.issue
- │ ├─ Input: {credentialType, claims, subject, issuerRef}
- │ └─ Output: {credentialId, offerUri}
- │
- ├─ credential.verify
- │ ├─ Input: {credentialId, presentationPayload, verifyOptions}
- │ └─ Output: {verified, credentialStatus, issuerTrusted}
- │
- ├─ finance.calculate_invoice
- │ ├─ Input: {requestId, items}
- │ └─ Output: {totalAmount, taxAmount, invoiceNumber}
- │
- ├─ external.ecocash_payment
- │ ├─ Input: {amount, currency, msisdn, metadata}
- │ └─ Output: {paymentRequestToken, statusCheckUrl}
- │
- ├─ trust.update_score
- │ ├─ Input: {subjectRef, scoreType, delta}
- │ └─ Output: {newScore}
- │
- ├─ consent.capture
- │ ├─ Input: {purpose, consentType, retention}
- │ └─ Output: {consentId}
- │
- ├─ request.wait_for_task
- │ ├─ Input: {taskTitle, assigneeDepartment, dueDate}
- │ └─ Output: {taskId} — workflow pauses
- │
- ├─ request.complete_task
- │ ├─ Input: {taskId}
- │ └─ Output: {} — workflow resumes
- │
- └─ workflow.trigger
- ├─ Input: {trigger, payload}
- └─ Output: {triggeredWorkflows}
-
- Example: ecommerce_delivery workflow
- ─────────────────────────────────────
- 1.  Issue ReceiptVC (credential.issue) when payment confirmed
- 2.  Calculate invoice (finance.calculate_invoice) for ledger
- 3.  Create delivery task (request.wait_for_task) → assign to driver team
- 4.  On driver completion (request.complete_task) → update request status
- 5.  Issue delivery proof (credential.issue) for record
- 6.  Update trust score (trust.update_score) based on outcome
      \*/

// ============================================================================
// 5. SSI CREDENTIAL LAYER INTEGRATION
// ============================================================================

/\*\*

- Credential Models (referenced, not stored as raw payloads)
-
- ┌─────────────────────────────────────┐
- │ CredentialReferenceRepository │
- ├─────────────────────────────────────┤
- │ id UUID │
- │ organization_id FK │
- │ subject_ref opaque │
- │ credential_type string │
- │ issuer_ref string │ (did: or short ref)
- │ format string │ (jwt_vc, jsonld, sd_jwt)
- │ external_ref string │ (credential_id in external system)
- │ status enum │ (issued, valid, revoked, suspended)
- │ issued_at timestamp │
- │ expires_at timestamp │
- │ last_verified_at timestamp │
- │ digest string │ (hash for integrity)
- │ metadata JSON │
- └─────────────────────────────────────┘
-
- Credential types (examples for Zimbabwe + broader):
- ├─ PaymentReceipt
- │ └─ credentialSubject: {paymentRequestToken, amount, currency, timestamp}
- │
- ├─ ReceiptVC
- │ └─ credentialSubject: {orderId, items, totalAmount, merchant, timestamp}
- │
- ├─ InvoiceVC
- │ └─ credentialSubject: {invoiceNumber, amount, vendor, issueDate, dueDate}
- │
- ├─ EmployeeCredential
- │ └─ credentialSubject: {employeeId, department, title, issueDate}
- │
- ├─ MerchantCredential
- │ └─ credentialSubject: {merchantId, businessName, trustScore}
- │
- ├─ VehicleInsuranceCredential
- │ └─ credentialSubject: {vehicleReg, insuranceExpiry, provider}
- │
- └─ DriverVerificationCredential
- └─ credentialSubject: {driverId, verificationStatus, timestamp}
-
- Credential Status (W3C Bitstring Status List v1.0):
- - Platform NEVER issues/modifies status list directly
- - Status list is issued by credential issuer (Credo agent)
- - Verifier checks status list periodically via HTTPS
- - Status bits: 0 = valid, 1+ = revoked/suspended (depends on statusSize)
    \*/

// ============================================================================
// 6. AUTHORIZATION SERVICE INTEGRATION
// ============================================================================

/\*\*

- AuthorizationService enforces policy decisions.
-
- Core method:
- ─────────────
- async canActOn(
- authenticatedTenant: string,
- subjectRef: string,
- action: string,
- resourceType: string,
- resourceId: string,
- constraints?: {
-     amount?: number,
-     currency?: string,
-     department?: string,
-     projectId?: string,
-     credentialRequired?: {
-       type: string,
-       credentialId?: string,
-       issuerTrusted: boolean,
-       statusMustBeValid: boolean,
-     }
- }
- ): Promise<{
- authorized: boolean,
- reason: string,
- policyDecision: PolicyDecision
- }>
-
- Checks performed:
- 1.  Subject is authenticated in tenant
- 2.  Subject is active org member
- 3.  Role has permission for action
- 4.  Authority limit not exceeded (if amount constraint)
- 5.  Delegation valid & within scope (if delegated)
- 6.  Separation of duties honored (if SoD policy)
- 7.  If credential required:
- - Credential exists
- - Credential status = valid
- - Credential issuer trusted
- - Credential not expired
- 8.  Policy evaluation passes (custom business rule)
-
- Result is recorded in policy_decisions table for audit.
  \*/

// ============================================================================
// 7. SSI TRUST KERNEL
// ============================================================================

/\*\*

- Trust anchors and issuer registration
-
- ┌──────────────────────────────┐
- │ trust_anchors │
- ├──────────────────────────────┤
- │ id UUID │
- │ organization_id FK │
- │ issuer_did string │
- │ root_cert PEM │ (or public key)
- │ trust_purpose string │ (credential_verification, presentation_verification)
- │ status string │ (active, revoked)
- │ added_at timestamp │
- └──────────────────────────────┘
-
- ┌──────────────────────────────┐
- │ verifier_registrations │
- ├──────────────────────────────┤
- │ id UUID │
- │ organization_id FK │
- │ verifier_ref string │ (identifier for verifier)
- │ verifier_did string │
- │ trusted_issuers JSON[] │ (DIDs or issuer refs)
- │ query_language string │ (dcql, pex_v2)
- │ expected_credentials JSON[] │
- │ purpose string │
- │ status string │
- │ created_at timestamp │
- └──────────────────────────────┘
-
- ┌───────────────────────────────────┐
- │ presentation_requests │
- ├───────────────────────────────────┤
- │ id UUID │
- │ organization_id FK │
- │ verifier_registration_id FK │
- │ purpose string │
- │ query_language string │ (dcql, pex_v2)
- │ dcql_query JSON │
- │ presentation_definition JSON │
- │ credo_verification_session_id str│
- │ verifier_client_id string │
- │ authorization_url string │
- │ expiresAt timestamp │
- │ status string │
- │ holder_presentation JSON │ (if DCQL result mapping)
- │ credentials_verified JSON[] │ (credential refs, not payloads)
- │ verification_result JSON │
- │ created_at timestamp │
- └───────────────────────────────────┘
-
- Key flow:
- 1.  Organization registers trusted issuers (trust_anchors)
- 2.  Verifier registers expected credential types + query language
- 3.  On verification need, create presentation_request with DCQL
- 4.  Call Credo OpenID4VP to get authorization URL
- 5.  Holder scans QR, consents, presents credentials
- 6.  Credo verifies and returns presentation
- 7.  Platform checks status list, issuer trust, then records verification_result
- 8.  Authorization service uses verification_result in policy decision
      \*/

// ============================================================================
// 8. EXAMPLE WORKFLOW: E-COMMERCE ORDER → RECEIPT → DELIVERY VERIFICATION
// ============================================================================

/\*\*

- Scenario:
- - Customer places order
- - Platform creates request
- - Workflow: issue receipt VC, initiate payment, wait for delivery, verify & close
-
- Workflow definition (workflow_templates):
- ──────────────────────────────────────────
- {
- id: 'wf-ecommerce-delivery',
- name: 'E-Commerce Order → Receipt → Delivery',
- category: 'ecommerce_delivery',
- triggers: ['order.placed', 'payment.confirmed'],
- actions: [
-     {
-       id: 'issue_receipt_vc',
-       type: 'credential.issue',
-       title: 'Issue Receipt VC',
-       onEvent: 'payment.confirmed',
-       input: {
-         credentialType: 'ReceiptVC',
-         claims: {
-           orderId: '${orderId}',
-           items: '${items}',
-           totalAmount: '${amount}',
-           merchant: '${merchantId}',
-           timestamp: '${timestamp}'
-         },
-         recipientDid: '${holderDid}'
-       },
-       onSuccess: 'wait_delivery',
-       onFailure: 'issue_failed'
-     },
-     {
-       id: 'wait_delivery',
-       type: 'request.wait_for_task',
-       title: 'Await Driver Delivery',
-       input: {
-         taskTitle: 'Deliver order to customer',
-         assigneeDepartment: 'Logistics',
-         dueDate: '+24h'
-       },
-       onSuccess: 'verify_delivery',
-       onFailure: 'delivery_failed'
-     },
-     {
-       id: 'verify_delivery',
-       type: 'credential.verify',
-       title: 'Verify Delivery Proof',
-       input: {
-         credentialRequired: {
-           type: 'DriverVerificationCredential',
-           issuerTrusted: true,
-           statusMustBeValid: true
-         },
-         dcqlQuery: {
-           credentials: [{
-             meta: {issuer: '${logisticsIssuerDid}'},
-             claims: ['$.credentialSubject.orderId', '$.credentialSubject.timestamp']
-           }]
-         }
-       },
-       onSuccess: 'close_request',
-       onFailure: 'verification_failed'
-     },
-     {
-       id: 'close_request',
-       type: 'workflow.trigger',
-       title: 'Order Closed',
-       input: {action: 'mark_fulfilled'}
-     }
- ]
- }
-
- Execution trace:
- ───────────────
- 1.  Customer creates order
- → POST /api/platform/requests {requestType: 'ecommerce_order', ...}
- → status = 'draft'
-
- 2.  Platform receives payment confirmation (webhook)
- → Trigger workflow with orderId
- → Status transitions to 'in_fulfilment'
-
- 3.  Workflow executes action: issue_receipt_vc
- → Calls CredentialIssuanceService
- → ReceiptVC signed by issuer agent
- → Credential reference stored (not payload)
- → Returns credential_id + offer_uri
-
- 4.  Workflow executes action: wait_delivery
- → Creates request_task
- → Assigns to driver/logistics team
- → Workflow PAUSES
-
- 5.  Driver completes delivery (mobile app)
- → Mark task complete
- → POST /api/platform/requests/{requestId}/complete-task
- → Workflow RESUMES
-
- 6.  Workflow executes action: verify_delivery
- → Creates presentation_request with DCQL
- → Queries for DriverVerificationCredential
- → Returns authorization URL
- → Driver scans QR in wallet
- → Wallet sends VP
- → Credo verifies
- → Status list checked
- → Issuer trust validated
- → Result recorded
-
- 7.  Workflow executes action: close_request
- → Updates request status to 'completed'
- → Audit trail closed
-
- Authorization checkpoints (at each transition):
- ──────────────────────────────────────────────
- Request.submit:
- ✓ Requester (subject_ref) is active member
- ✓ Role has 'request.submit' permission
- ✓ Action 'request.submit' allowed
-
- Request.approve (logistics manager):
- ✓ Approver is active member
- ✓ Role has 'request.approve' permission
- ✓ Approver ≠ requester (SoD)
- ✓ Amount within authority limit
- ✓ If EmployeeCredential required: credential valid + trusted + status OK
-
- Request.complete:
- ✓ Fulfiller is active member
- ✓ Role has 'request.execute' permission
- ✓ All tasks completed
- ✓ Delivery verification credential valid
  \*/

// ============================================================================
// 9. TESTING STRATEGY
// ============================================================================

/\*\*

- End-to-end tests should verify:
-
- 1.  Request Lifecycle
- ✓ draft → submitted → approved → fulfilled → completed
- ✓ Status transitions respect authorization
- ✓ Audit trail complete at each step
-
- 2.  Workflow Execution
- ✓ Actions execute in order
- ✓ Pause/resume for human tasks works
- ✓ Error handling + rollback
-
- 3.  Credential Issuance
- ✓ VC signed with tenant DID
- ✓ Credential reference stored (no raw payload)
- ✓ Offer URI generated for wallet
-
- 4.  Credential Verification
- ✓ Status list check passes for valid credential
- ✓ Status list check fails for revoked credential
- ✓ Issuer trust validated
-
- 5.  Authorization
- ✓ Credential alone does NOT grant access
- ✓ Role + authority + SoD honored
- ✓ Delegation chain valid & constrained
- ✓ Policy decision recorded with reason
-
- 6.  Failure Scenarios
- ✓ Revoked credential → verification fails
- ✓ Untrusted issuer → authorization fails
- ✓ Expired delegation → authorization fails
- ✓ Amount exceeds authority → authorization fails
- ✓ Maker = checker → SoD violation
  \*/

export {}


## 2026-10-04 — Evidence is progressive, and the portal matches the phone app

- Job photos are taken live, one phase per step. The paused step decides whether the worker takes a
  before photo, an after photo or a receipt photo; before and after photos come from the camera only
  (no gallery), and after photos stay locked until the worker confirms the work is finished. The device
  time is fixed at capture (`deviceCapturedAt`) and the server seals its own time (`capturedAt`).
  Detail: `docs/SGK_FEPT_GAP_MAP.md`, section "Evidence capture".
- The portal job drawer shows before and after photos as a pair with both times, the location and a
  sealed mark, and its Documents tab now lists the records the job actually issued. The placeholder
  purchase-order document is gone.
- A requisition shows one next step at a time (manager approval, finance approval, release, delivery),
  the same way on the portal and the phone app (`requisitionNextStep` in both). Disabled buttons for
  steps that are not current are no longer shown.
- Delivery confirmation issues its record through the same outbox path as the approval and release
  records (`workflow.vc.issue`), so the step no longer depends on a pre-registered credential
  definition and the requisition closes even if issuance is slow.
- Finance screens say Payments, Jobs and Supplier bills on both apps.

## 2026-10-05 — Purchase-request setup: one confirmation or two, and departments on the phone

- Manager approval and finance approval are separate steps, so each can be a different person. A purchase request can be set to **one person confirms** (one proof covers the approval) or **manager and finance each confirm** (two separate proofs). The choice is on Who does what, on the portal and the phone, with three ready-made setups: Owner handles money, Manager then finance, and Director confirms once.
- Director is a role you can give someone, on both apps. On the phone you can also add departments and change a person's role. The portal People page can change a role the same way.
- Until an organization chooses otherwise, requests still need both confirmations.

## 2026-10-05 — Platform identity stays in the inbox until it is accepted

- Opening the inbox no longer drops a platform identity card when the issuer details fail to load. The card stays until the person accepts it.
- If Accept cannot claim the platform identity card, the platform sends a fresh one and accepts that.
- Refreshing issuer details keeps the credential definition and the proof types the holder needs, and it no longer replaces the issuer's existing list.
- Changing someone's role sends a fresh employee card, so the card matches the role they have now.

## 2026-10-05 — Payment method is a choice: Click n Pay, EcoCash, or simulated pay

- Organisation payments, on the portal and the phone, offer the same three methods as the school-fees payment dialog, in the same order: Click n Pay, EcoCash, then Simulated pay. Picking one turns the others off, and it can be changed later.
- Simulated pay is its own method. It is no longer stored as an EcoCash connection.

## 2026-10-05 — Employee offers last, and phone setup shows every area

- Employee and role-card offers asked for a week, but the issuer code expired after 10 minutes, so Accept failed with "this offer has expired" before anyone opened it. The code now lasts as long as the offer (a day by default, a week for employee and role cards). If an offer is already dead, Accept sends a fresh employee credential or role card and takes that one.
- Phone organisation setup lists every area (organisation, team, roles, who does what, partners, payments) with Done or how many are left. "All covered" on who-does-what now says "Owner standing in" when the owner is only filling in because nobody was chosen. The portal uses the same words.

## 2026-10-05 — Wallet proof shows what will be shared before it is sent

- Sign-off and payment release on a job, and approval, release, and delivery confirmation on a request, open a review first. The person sees which details will be shared, agrees, then shares.
- On the portal the review is on this device. On the phone the first button is "Review and share in this app". A code or link still opens this app or any other wallet.
- Steps that do not ask for that proof no longer say "Confirmed from a wallet".
- Sharing uses the records in that person's wallet. The phone and the portal then finish the step from the verifier's accepted share, including when the wallet sends it straight across instead of returning a redirect.

## 2026-10-05 — Names, the review screen, and the receipt line

- A person saved as "Team member" before their identity card was accepted is named from that card the next time the team or Who does what is opened. Job history and the field-worker line use that name. A placeholder is no longer shown as if it were the person's name; the role is used until the name is known.
- The review before a share leaves out workflow type and assignment mode. The receipt step on a job uses the same person as payment release, so a finished receipt no longer says nobody was chosen.

## 2026-10-05 — Setup shows only what is still missing

- Organization setup on the website and the phone no longer opens with a percent bar, status badges, or a list of areas that are already done. A ready organization shows one line, the kinds of requests that are open (Jobs, Purchase requests, and so on), and links to Who does what and What happens next. Anything still missing is a short line with a link.
- Who does what lists the step and the person, with short step names such as Who does the job, Site check, Work review, Customer sign-off, and Payment release. Stage keys, requirement badges, and fallback essays are gone from that screen. The phone uses the same labels.

## 2026-10-05 — Onboarding asks three questions; money setup is shared by every kind of request

- Nobody picks or adds a workflow any more. After the welcome screen the owner answers one short question at a time: what the organization does (pick all that apply), who approves and releases money (one of three ready-made setups), and how payments are taken. Purchase requests, supplier bills and customer payments are prepared for everyone; jobs, school fees and counter payments follow from the first answer. Each kind of request opens on its own once what it needs is in place.
- The money answer is set once, on purchase requests. Releasing a job payout, paying a supplier bill, confirming a remittance and issuing a receipt use the same people unless someone else is picked for that step under Who does what. Coming back when a money step already has a person, including a job payout, offers "Keep what is set now" so the answers do not replace them.
- The phone asks the same questions. How the setup screen is laid out is in the next note.
- Design spec: `credentis-onboarding-flow.md` (dated section at the top).

## 2026-10-06 — Setup answers do not write a workflow list

- Saving what the organization does, who handles money, or how payments are taken stores those answers only. It does not add rows to the workflow catalog. A request is available because the organization said it does that work and the purchase-request money people are in place. The same money people cover every later money step.
- Readiness does not block on people who are not the money person. Who goes out and who checks the work is asked when a job is created, on the website and the phone. Who does what shows the money people once, and says the job people are asked on the job.
- The onboarding write-up no longer describes a "choose a workflow" screen.

## 2026-10-05 — Setup is one question per window

- On the website and the phone, setup is a checklist of four steps: Say what you do, Choose who handles money, Pick how you take payments, Invite your team. Start opens that one question on its own, with which question of 3 you are on. On the phone the organisation list steps aside until you save or cancel. Change opens a question again. After a save, Next continues and Finish later returns to the checklist. The page says how many of the four are done.
- Answers are saved on the server (`PUT /organizations/{org}/setup/profile`). The screen does not send a list of workflows to turn on.
- Who does what is one category per window: Money, then each kind of request, then If nobody is chosen, then Role cards, with Back and Next. Money is shown once. A step that still needs a chosen person names who is standing in for now. Other kinds of request can use those same people, or pick someone else on that request's window.
- Steps such as who goes out on a job are asked the first time. They do not block the checklist. Kinds of requests lists what is open and what still needs a person.

## 2026-10-05 — Attached photos and documents show as small previews

- While adding photos (or a wallet record for a receipt), the phone shows a thumbnail for each one, with Add and a remove button, before they are saved. Extra photos from the same step are kept with the sealed photo.
- The job shows the same small previews on the phone and in the portal job drawer, for photos and for an attached record.
