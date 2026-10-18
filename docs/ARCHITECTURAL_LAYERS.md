# Platform Remodel — Architectural Layers

## Current platform direction (2026-10-15)

The [configurable-platform implementation plan](./CONFIGURABLE_PLATFORM_IMPLEMENTATION_PLAN.md)
extends this architecture as one modular platform. SSI remains foundational:
platform identity offers on registration, personal wallets/DIDs, organisation
issuer/verifier provisioning, core `ssi_identity` readiness and existing required
proof policies are preserved and may only be enhanced.

Business modules and additional integrations (payments, fiscalisation, devices,
external credential APIs and later custom workflows) are configurable. Supported
workflow-record offer/delivery settings do not disable platform identity or required
proofs. Integration-only organisations need not use internal jobs/store/finance
screens, but retain their platform SSI context. See the plan for migration and
acceptance gates; it does not introduce an SSI-off profile or a new runtime behavior.

The branch/reference and implementation-completeness statements below are historical.
For authentication verification qualifications, see the
[current SSI authentication notes](./SSI_AUTH_IMPLEMENTATION.md#architecture-decision-and-current-code-qualification-2026-10-15).

---

**Status**: Layer descriptions verified against the codebase at the reference commit below (historical)  
**Branch at the time**: `platform-remodel` (work now continues on `sgk`)  
**Reference Commit**: `370abc249e8724c3cdeeb7641e56d9071f797cc9` (historical; not the current head)

---

## Layer Stack

```
┌──────────────────────────────────────────────────────────────┐
│                    USER INTERFACES                            │
├──────────────────────────────────────────────────────────────┤
│  • Next.js Portal (Port 5000)    ← Org admin, request mgmt   │
│  • Nuxt Wallet (Port 4000)       ← Credential storage        │
│  • Mobile Web Verifier           ← Delivery verification     │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────┐
│              CREDO CONTROLLER API (Port 3000)                 │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  BUSINESS LOGIC LAYER                                  │  │
│  ├────────────────────────────────────────────────────────┤  │
│  │  • PlatformRequestService  ← Request lifecycle         │  │
│  │  • WorkflowService        ← Action execution (no #2)  │  │
│  │  • AuthorizationService   ← Policy + SSI integration  │  │
│  │  • CredentialIssuanceService ← Issue VCs              │  │
│  │  • TrustService           ← Issuer trust + scores     │  │
│  │  • SsiPresentationService ← DCQL presentation queries │  │
│  └────────────────────────────────────────────────────────┘  │
│                        │                                       │
│  ┌────────────────────▼────────────────────────────────────┐  │
│  │  PERSISTENCE LAYER (SQLite via better-sqlite3)         │  │
│  ├────────────────────────────────────────────────────────┤  │
│  │  • DatabaseManager        ← Connection + migrations    │  │
│  │  • Repositories           ← Data access objects        │  │
│  │    ├─ OrganizationRegistry                             │  │
│  │    ├─ PlatformRequestRepository                        │  │
│  │    ├─ WorkflowRepository                               │  │
│  │    ├─ CredentialReferenceRepository (no raw payloads)  │  │
│  │    ├─ PolicyDecisionRepository   (audit trail)         │  │
│  │    ├─ TrustRepository                                  │  │
│  │    └─ ConsentRepository                                │  │
│  └────────────────────────────────────────────────────────┘  │
│                        │                                       │
│  ┌────────────────────▼────────────────────────────────────┐  │
│  │  EXPRESS CONTROLLERS                                   │  │
│  ├────────────────────────────────────────────────────────┤  │
│  │  • RequestController         ← Request CRUD            │  │
│  │  • WorkflowController        ← Workflow triggers       │  │
│  │  • OrganizationController    ← Org setup + readiness   │  │
│  │  • OidcIssuerController      ← OpenID4VCI              │  │
│  │  • OidcVerifierController    ← OpenID4VP (DCQL)        │  │
│  │  • PresentationController    ← Verification           │  │
│  │  • CredentialController      ← Issue/verify/revoke     │  │
│  │  • WebhookController         ← Payment confirmations   │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                               │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────┐
│                   CREDO FRAMEWORK LAYER                       │
├──────────────────────────────────────────────────────────────┤
│  (Agent/Tenant context, handled by src/cliAgent.ts)          │
│  • Askar (wallet/KMS)            ← Default, ProfilePerWallet │
│  • TenantsModule                 ← Multi-tenancy agent mgmt  │
│  • OpenID4VcIssuer               ← VC issuance protocol      │
│  • OpenID4VcVerifier             ← VP verification protocol  │
│  • W3cCredentials                ← VC signing/verification   │
│  • CredentialStatusList          ← Bitstring Status List v1.0│
│  └─ Per-tenant Credo agents      ← DIDs, keys, credentials   │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────┐
│              EXTERNAL INTEGRATIONS                            │
├──────────────────────────────────────────────────────────────┤
│  • EcoCash Payment API      ← Payment execution              │
│  • Provider Services        ← Custom business logic          │
│  • Webhook Handlers         ← Async event processing        │
│  • OpenTelemetry            ← Observability/tracing         │
└──────────────────────────────────────────────────────────────┘
```

---

## Layer Responsibilities

### Layer 1: User Interfaces

| Component    | Port    | Purpose                                                   |
| ------------ | ------- | --------------------------------------------------------- |
| **Portal**   | 5000    | Organization admin: setup, requests, approvals, workflows |
| **Wallet**   | 4000    | Credential storage, presentation consent, VC management   |
| **Verifier** | Dynamic | Driver/receiver verification: QR scan, proof check        |

**Data Flow**:

- Portal → API (org token in Authorization header)
- Wallet → API (wallet token)
- Verifier → API (protocol session binding)

### Layer 2: Business Logic Layer

**Responsibility**: Implement organizational workflow patterns WITHOUT reimplementing infrastructure logic.

#### PlatformRequestService

Manages request lifecycle:

```
draft → submitted → approved/rejected → in_fulfilment → completed
```

**Responsibilities**:

- Create request with context validation
- Transition states with authorization checks
- Enforce maker-checker (requester ≠ approver)
- Visibility filtering (requester sees own)
- Audit trail generation
- Context schema enforcement (prevent arbitrary blobs)

**Files**:

- `src/services/PlatformRequestService.ts`
- `src/persistence/PlatformRequestRepository.ts`

#### OrgEntitlementService (modules and plans, added 2026-10-12)

Decides whether an organisation may use an optional module. Today there is one module,
`people_payroll` (staff leave, expense claims, payslips sent again).

- Chosen in setup: `org_setup_profiles.modules` (JSON list, written by `OrgSetupProfileService.save`).
- Allowed by the plan: `org_plans` (`plan` = `free` | `premium`, `granted_modules`, `note`). A module is
  allowed when the tier is at least its required tier (`MODULE_PLAN`) or it is in `granted_modules`.
  An organisation with no row is `free` with `people_payroll` granted and `note = 'pilot'`.
- `hasModule(orgTenantId, module)` = chosen **and** allowed. Callers: `OrgSetupProfileService.get`
  (request types and inbox tabs), `PlatformRequestService.optionsForSubject` / `create`,
  `OrgStarterRoles`. Controllers never read `org_plans` directly.

**Files**:

- `src/services/OrgEntitlementService.ts`
- `src/services/OrgSetupProfileService.ts`
- `migrations/113_org_modules_and_plans.sql`

#### HolderActivityService (the person's own log, added 2026-10-12)

Keeps, per wallet, an append-only list of what happened to the person's data: a share and its
result, a request turned down, a card received or replaced, a card withdrawn. It answers
"Your activity" on the phone (`/activity`, personal lens) and the website (`/activity`), and the
Home strips in personal context.

- Rows: `holder_activity` (migration 114), one per `(wallet, kind, source_id)` so retries are no-ops
  (`INSERT OR IGNORE`). Kinds: `shared`, `share_verified`, `share_refused`, `share_declined`,
  `card_received`, `card_withdrawn`. The person cannot delete rows; they can export them (CSV).
- Stored: organisation id and name, the step (`stage_action`) and the job or request reference,
  the purpose line, the **names** of the card types and claims asked for, the names shared and the
  names kept back, the signed job line (step · job · amount), the outcome and a plain reason.
- Never stored: claim values, the presentation or credential itself, keys, nonces or any other
  VP material (handoff §30). The platform already keeps the verification result on the run.
- Writers, one per event owner: `StageProofService.recordShareFromWallet` (every embedded or
  phone share: field sign-off / payout, purchase approve / release / acknowledge, payable
  transitions, collection consent) and `verifyStageProof` (`share_verified` / `share_refused`);
  `WalletController.declinedShare` (`POST /api/wallet/activity/declined`, the phone's "Not now");
  `WalletCredentialsController.acceptOffer` (`card_received`, `outcome = replaced` when the offer
  carries `metadata.replaces`); `CredentialLifecycleService.revokeStaffCards` (`card_withdrawn`).
  Controllers never insert rows themselves.
- Readers: `GET /api/wallet/activity` (cursor paged, `kind`, `orgTenantId`, `format=csv`) and
  `GET /api/wallet/activity/partners` (who holds a working card of yours, what it lets them check,
  how many shares, membership). The wallet is taken from the personal token, never from a
  parameter.
- A one-time backfill on start (`backfill()`) writes `card_received` from accepted wallet offers and
  past shares from the `ack` / `payment` presentation stamps on finished runs; it is idempotent.

**Files**:

- `src/services/ssi/HolderActivityService.ts`
- `src/services/ssi/StageProofService.ts` (`recordShareFromWallet`, `verifyStageProof`)
- `src/controllers/wallet/WalletController.ts` (`/api/wallet/activity*`)
- `migrations/114_holder_activity.sql`
- UI twins: `credo-ui/mobile/lib/holderActivity.ts` ↔ `credo-ui/portal/lib/holderActivity.ts`,
  `credo-ui/mobile/components/shared/PersonalActivityPanel.tsx` ↔
  `credo-ui/portal/components/activity/PersonalActivityPanel.tsx`

#### WorkflowService

Executes business automations using ActionRegistry:

```
Action 1 → Action 2 → [Pause for Task] → Action 3 → [Verification] → Complete
```

**Responsibilities**:

- Load workflow definitions
- Execute actions sequentially
- Track runs with full state
- Support pause/resume for async operations (payments, human approval)
- Error handling + step logging
- Integration with Credo agents for SSI operations

**Registered Actions**:

- `credential.issue` — Sign VC with tenant DID
- `credential.verify` — Check status, issuer trust, expiration
- `finance.calculate_invoice` — Compute totals, taxes
- `external.ecocash_payment` — Initiate payment via provider
- `request.wait_for_task` — Create task, pause workflow
- `request.complete_task` — Resume workflow on task completion
- `trust.update_score` — Adjust business reputation
- `consent.capture` / `consent.revoke` — User consent lifecycle
- (Extensible via `ActionRegistry.register()`)

**Files**:

- `src/services/WorkflowService.ts`
- `src/services/workflow/ActionRegistry.ts`
- `src/services/workflow/actions/*.ts`

#### AuthorizationService

Policy evaluation engine integrating SSI evidence:

```
Member + Role + Authority + Delegation + Credential + Policy → Decision
```

**Responsibilities**:

- Verify subject is active member
- Check role permissions
- Validate authority limits (amount, currency, department)
- Enforce delegation chain validity & constraints
- Check credential if policy requires:
  - ✓ Credential exists
  - ✓ Status = valid (fail-closed if unknown)
  - ✓ Issuer trusted
  - ✓ Not expired
- Record decision in `policy_decisions` table (AUDIT)
- Support SoD (Separation of Duties)

**Files**:

- `src/services/AuthorizationService.ts`
- `src/services/SsiTrustService.ts`

#### CredentialIssuanceService

Issues verifiable credentials:

```
Organization policy → Claims → Sign with tenant DID → Credential reference stored
```

**Responsibilities**:

- Build credential claims from request context
- Sign VC using Credo W3C credentials module
- Store credential reference (NOT payload)
- Generate OpenID4VCI offer URI
- Track issuance in audit

**Files**:

- `src/services/CredentialIssuanceService.ts`
- `src/persistence/CredentialReferenceRepository.ts`

#### SsiPresentationService

Handles verifiable presentation requests (DCQL-first):

```
DCQL Query → Credo OpenID4VP → Holder Presentation → Status Check → Trust Check → Record Result
```

**Responsibilities**:

- Validate DCQL query
- Create OpenID4VP authorization request
- Store Credo verification session ID
- On response: verify signature, check status list, validate issuer
- Record verification result (not presentation payload)
- Fail-closed: unknown status = verification fails

**Files**:

- `src/services/ssi/SsiPresentationService.ts`
- `src/services/ssi/CredoPresentationVerificationService.ts`
- `src/services/ssi/CredentialStatusService.ts`

#### TrustService

Manages business trust (distinct from issuer trust):

```
Transaction history → Trust events → Score calculation → Reputation
```

**Responsibilities**:

- Update trust scores based on workflow outcomes
- Track trust events (good/bad transactions)
- Calculate credit scores
- Separate from issuer trust (different concern)

**Files**:

- `src/services/TrustService.ts`
- `src/persistence/TrustRepository.ts`

### Layer 3: Persistence Layer

**SQLite via better-sqlite3** — no ORM, direct SQL queries.

#### Business transaction and obligation correlation

The finance projection deliberately separates four things:

```
purchase / sale / fee / field job
  → payable or receivable obligation
    → one or more settlement allocations
      → credential or receipt only at a trust boundary
```

`BusinessTransactionService` links existing request, workflow, invoice and payment ids without
replacing their owning modules. `business_transactions` is the stable commercial centre;
`financial_obligations` holds the amount owed and its remaining balance; and
`settlement_allocations` applies a payment idempotently. A payment link is a collection attempt,
not the receivable. A supplier bill is payable only after the order, receipt and bill match, or
after an authorised variance decision. AP/AR reports read obligations and allocations; they do
not infer debt from a pending cart, workflow approval or payment-link status.

Field-job client terms follow the same model: one-time, fixed-instalment and recurring schedules
create separate dated receivable obligations under the job transaction. Retrying or replacing a
link reuses the obligation; cancelling a link cancels the attempt, while cancelling a plan cancels
its unsettled obligations. A settlement applies only up to the balance and records any excess as
unapplied instead of silently overpaying the debt.

Purchases select their evidence boundary explicitly. Goods or services that require confirmation
use three-way matching (order, delivery/service receipt, supplier bill). A purchase that explicitly
does not require confirmation uses two-way matching (order and bill), stores no fictional receipt,
and still creates the payable only after those amounts agree.

This layer is not a general ledger and does not implement tax, inventory, payroll accounting or
one invoice allocated across multiple jobs.

#### Product centres and shared capabilities

The UI follows the same ownership rule as the data:

- **Operations** owns field jobs, purchase requests, school fees, shop/services and their
  fulfilment history. A school fee is its own `fee_assessment` business transaction (no parent
  job): the `education_fee_payment` run creates it through `ReceivablePlanService.createForJob`
  with one obligation and pay link per instalment.
- **People** owns leave, expense claims, staff records and payroll runs when that module is on.
- **Money** is a shared projection: money in (AR) and money out (AP), linked back to the job,
  purchase, fee, sale or payroll run that created the obligation.
- Payment links, EcoCash/card/cash/bank methods, instalment schedules and delivery/service
  confirmation are attached capabilities. They are not top-level business transactions and are
  used only by centres that need them.
- **Work** is the action queue (Inbox and Approvals); All requests is the history/registry.

The mirrored `workflowCapabilities.ts` helpers classify the owning centre before the UI chooses
an inbox section, route or stage copy. Portal and phone therefore use the same centre names even
when the phone performs wallet actions that the portal cannot.

#### DatabaseManager

Central connection + migration coordinator:

```
src/persistence/DatabaseManager.ts
├─ Opens SQLite connection (data/persistence.db by default)
├─ Runs migrations from migrations/*.sql
├─ Provides db instance to all repositories
└─ Handles transactions
```

#### Repositories (Data Access Objects)

Each repository encapsulates SQL for one entity:

| Repository                      | Table                                        | Purpose                      |
| ------------------------------- | -------------------------------------------- | ---------------------------- |
| `OrganizationRegistry`          | organizations, roles, authority_grants, etc. | Org CRUD                     |
| `PlatformRequestRepository`     | requests, request_items, request_events      | Request lifecycle            |
| `WorkflowRepository`            | workflows, workflow_templates                | Workflow definitions         |
| `WorkflowRunRepository`         | workflow_runs, workflow_run_steps            | Execution tracking           |
| `CredentialReferenceRepository` | credential_references                        | SSI references (NO payloads) |
| `PolicyDecisionRepository`      | policy_decisions                             | Authorization audit          |
| `TrustRepository`               | trust_scores, trust_events                   | Business reputation          |
| `ConsentRepository`             | consents                                     | User consent records         |
| `ProviderRepository`            | providers, provider_configs                  | External service registry    |

**Key Design**: No full VC/VP payloads stored locally.

- Store credential_type, issuer_ref, subject_ref, status, digest
- Keep actual credentials in wallet/external storage
- Enables privacy + compliance with SSI separation principle

### Layer 4: Express Controllers

HTTP request handling with TSOA (TypeScript OpenAPI auto-generation).

**CRITICAL**: Controllers delegate authorization to `AuthorizationService`, not implement RBAC themselves.

```typescript
// CORRECT
@Post('/requests')
async createRequest(
  @Header() auth: { Authorization: string },
  @Body() body: CreateRequestInput
) {
  const { tenant, subject } = parseToken(auth.Authorization);
  const request = await platformRequestService.createRequest(tenant, subject, body);
  return request;
}

// WRONG (don't do this)
@Post('/requests')
async createRequest(...) {
  if (token.role !== 'admin') throw new Error('Forbidden');  // ← WRONG
}
```

**Controllers' Responsibilities**:

- Parse HTTP request
- Extract auth context (tenant, subject)
- Delegate to service layer
- Format response
- Map HTTP status codes

**Files**:

- `src/controllers/RequestController.ts`
- `src/controllers/WorkflowController.ts`
- `src/controllers/OrganizationController.ts`
- `src/controllers/oidc/*.ts` (OpenID issuance/verification)
- `src/controllers/discovery/DiscoveryController.ts` (public, read-only: organisations that chose to be found, their services and storefront)

2026-10-12: `RequestController` gained the holder-side routes behind the Home "Request" sheet: `GET /api/platform/requests/options` (what this person can ask for, by membership, from `PlatformRequestService.optionsForSubject`), `POST …/raise` (idempotent), `GET …/mine` and `GET …/mine/{id}`. They take the personal wallet token and resolve the organisation from the body, so the person never switches context to ask. `WalletCredentialsController` gained `POST /api/wallet/credentials/resend-mine` (holder-initiated re-issue of staff card and receipts; payslips answer "ask the organisation"). `WorkflowRequestController` accepts `targetOrgTenantId` as an alternative to `contactId` and creates the organisation-side contact on first contact. Controllers still only parse, delegate and map status codes; routing of the resulting cards stays in `WorkflowStageInboxService`, the decision in `AuthorizationService`.

### Layer 5: Credo Framework Layer

**Credo.js v0.7.0** — SSI agent framework.

#### Askar (Wallet/KMS)

Default key management:

- Stores private keys securely
- Per-tenant Askar profiles via `ProfilePerWallet` scheme
- No key rotation/backup yet (P2 hardening task)

#### TenantsModule

Multi-tenancy:

```
Root Agent
├─ Askar wallet
├─ TenantsModule
│  ├─ Tenant A (profilePerWallet)
│  │  ├─ Private key (Askar)
│  │  ├─ DIDs
│  │  └─ Credentials
│  └─ Tenant B (separate profile)
```

#### OpenID4VcIssuer / OpenID4VcVerifier

Standard protocols:

- **OpenID4VCI**: Credential offers, token endpoint, credential endpoint
- **OpenID4VP 1.0**: Authorization requests, presentation responses

#### W3C Credentials Module

Signs/verifies VCs:

```
issueCredential() → Signed JWT VC
verifyCredential() → ✓ Signature + expiration + status
```

#### CredentialStatusService

W3C Bitstring Status List v1.0:

```
Fetch status list VC
├─ HTTPS only
├─ Verify issuer
├─ Decompress bitstring
├─ Read status bit at credentialStatusListIndex
├─ 0 = valid, 1+ = revoked/suspended
└─ Fail if unknown (fail-closed)
```

### Layer 6: External Integrations

#### EcoCash Payment API

Payment execution:

```
Workflow action: external.ecocash_payment
├─ Create payment request
├─ Return status check URL
├─ Wait for webhook
└─ Webhook confirms payment → trigger receipt issuance
```

#### Provider Services

Custom business logic:

```
src/controllers/provider/ProviderController.ts
├─ Register payment provider (Stripe, mobile money, bank)
├─ Store provider config
├─ Inject into workflow actions
└─ Call provider-specific logic
```

#### Webhooks

Async event processing:

```
EcoCash webhook → Verify signature → Create workflow trigger
    → Update payment status → Issue receipt VC → Notify customer
```

---

## Data Flow: Complete Workflow Example

### E-Commerce Order → Payment → Receipt → Delivery

```
1. PORTAL: Customer adds to cart, checks out
   POST /api/platform/requests {
     requestType: 'ecommerce_order',
     title: 'Order #12345',
     amount: 150.00,
     context: { items: [...], deliveryAddress: '...' }
   }
   → RequestController → PlatformRequestService
   → CredentialReference created
   → Status: 'draft'

2. PORTAL: Requester submits order
   PATCH /api/platform/requests/{id} { action: 'submit' }
   → AuthorizationService.canActOn('request.submit')
   ✓ Member active, role has permission
   → PlatformRequestService.submit()
   → PolicyDecision recorded (AUDIT)
   → Status: 'submitted'

3. PAYMENT: EcoCash processes payment (async)
   POST /webhooks/ecocash {paymentRequestToken: '...', status: 'paid'}
   → Verify signature
   → PlatformRequestService.updateFromWebhook()
   → WorkflowService.executeWorkflow(orderId) ← ASYNC

4. WORKFLOW: Issue Receipt VC
   Action: credential.issue
   → CredentialIssuanceService.issue({
       credentialType: 'ReceiptVC',
       claims: {orderId, items, totalAmount, merchant, timestamp}
     })
   → Sign with merchant Credo agent (DID)
   → Store credential reference (NOT payload)
   → Generate offer URI
   → Send to customer (email/WhatsApp)
   → Status: 'in_fulfilment'

5. WALLET: Customer scans receipt credential offer
   → Wallet fetches OpenID4VCI offer
   → User consents to save
   → Wallet stores ReceiptVC

6. WORKFLOW: Wait for delivery
   Action: request.wait_for_task
   → Create request_task ('Deliver to customer')
   → Assign to logistics team
   → Workflow PAUSES

7. DRIVER: Marks delivery complete
   POST /api/platform/requests/{id}/tasks/{taskId}/complete
   → PlatformRequestService.completeTask()
   → Workflow RESUMES

8. WORKFLOW: Verify delivery
   Action: credential.verify
   → SsiPresentationService.createPresentationRequest({
       queryLanguage: 'dcql',
       dcqlQuery: {
         credentials: [{
           meta: {issuer: 'did:key:...logistics'},
           claims: ['$.credentialSubject.orderId']
         }]
       }
     })
   → Credo OpenID4VP authorization URL
   → Driver scans in wallet
   → Wallet sends VP
   → CredoPresentationVerificationService.verify():
       ├─ Credo signature check ✓
       ├─ Status list check ✓
       ├─ Issuer trust check ✓
       └─ Return verification_result

9. REQUEST COMPLETE
   PATCH /api/platform/requests/{id} { action: 'complete' }
   → AuthorizationService.canActOn('request.execute')
   → PlatformRequestService.complete()
   → PolicyDecision recorded
   → Status: 'completed'
   → Audit trail sealed
```

**Authorization Checkpoints**:

```
Step 2 (Submit):
  ✓ Subject is org member
  ✓ Role has 'request.submit'
  → Decision recorded

Step 8 (Verify credential):
  ✓ If policy requires EmployeeCredential:
    ├─ Credential status = 'valid'
    ├─ Issuer trusted
    └─ Not expired
  → If ANY fails → authorization fails (fail-closed)

Step 9 (Complete):
  ✓ Subject is org member
  ✓ Role has 'request.execute'
  ✓ All required tasks completed
  → Decision recorded
```

---

## Standards Alignment

| Standard                  | Component            | Implementation                                    |
| ------------------------- | -------------------- | ------------------------------------------------- |
| W3C VC Data Model 2.0     | Credential types     | JSON-LD contexts in `src/config/credentials.ts`   |
| W3C Data Integrity 1.0    | VC signing           | Credo W3cCredentials module                       |
| DID Core                  | Agent identity       | Credo DID management, per-tenant DIDs             |
| OpenID4VCI 1.0            | Issuance             | Credo OpenID4VcIssuer, pre-auth code flow         |
| OpenID4VP 1.0             | Verification         | Credo OpenID4VcVerifier, DCQL queries             |
| DCQL                      | Query language       | SsiPresentationService (DCQL-first, PEX fallback) |
| Bitstring Status List 1.0 | Status               | CredentialStatusService (fail-closed validation)  |
| HAIP 1.0                  | Multi-wallet interop | Future: support multiple wallet standards         |

---

## Critical Design Decisions

### 1. No SSI Blobs in Platform DB

❌ **NEVER**: Store raw VC/VP in request/approval records
✅ **ALWAYS**: Store credential reference (type, issuer, status, digest)

**Why**:

- SSI payloads are sensitive (PII, cryptographic material)
- Wallet is source of truth for credentials
- Platform is source of truth for business decisions

### 2. One Workflow Engine

❌ **NEVER**: Implement second state machine in RequestService
✅ **ALWAYS**: Use WorkflowService for orchestration

**Why**:

- Avoid parallel authorization logic
- Single audit trail
- Reuse action patterns

### 3. Fail-Closed on Unknown Status

❌ **NEVER**: Accept unknown credential status if policy requires valid
✅ **ALWAYS**: Deny access if status cannot be verified

**Why**:

- Security principle: assume worst-case
- Network/availability issues should not grant access

### 4. Policy Decision Recording is Mandatory

❌ **NEVER**: Skip recording auth decision
✅ **ALWAYS**: Record in policy_decisions table with reason + credentials checked

**Why**:

- Compliance: show what was considered
- Dispute resolution: why was request approved?
- Maker-checker validation: who approved and when?

---

## Testing Strategy

**E2E Test Suite** covers all layers:

1. User request creation (RequestController)
2. Workflow execution (WorkflowService)
3. Credential issuance (CredentialIssuanceService)
4. Credential verification (CredoPresentationVerificationService)
5. Authorization decisions (AuthorizationService)
6. Audit trail (PolicyDecisionRepository)
7. Failure scenarios (revoked credentials, untrusted issuers)

**File**: `tests/e2e/platformRemodel.e2e.spec.ts`

---

## Checklist: Architectural Compliance

- [ ] No raw VC/VP payloads stored in requests/approvals tables
- [ ] All authorization decisions recorded in policy_decisions
- [ ] WorkflowService is only orchestration engine
- [ ] SSI boundary enforced: wallet owns keys, platform owns business state
- [ ] Credential status check fails-closed (unknown = invalid)
- [ ] Maker-checker enforced (requester ≠ approver)
- [ ] All new actions registered in ActionRegistry
- [ ] Audit trail complete for every request transition
- [ ] Trust (business reputation) separate from issuer trust
- [ ] Delegation chain validated (constrained scope)
- [ ] OpenID4VP uses DCQL (PEX is compatibility only)
- [ ] Credo session IDs stored for protocol sessions
- [ ] Multi-tenancy enforced at every DB query
