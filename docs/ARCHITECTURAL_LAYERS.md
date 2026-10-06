# Platform Remodel — Architectural Layers

**Status**: Documentation verified against actual codebase (no guessing)  
**Branch**: `platform-remodel`  
**Reference Commit**: `370abc249e8724c3cdeeb7641e56d9071f797cc9`

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
