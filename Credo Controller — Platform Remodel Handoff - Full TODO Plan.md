# Credo Controller — `platform-remodel`

## Full Engineering Handoff & TODO Plan

### 1. Mission

Continue remodeling `elohwine/credo-controller` into a **verifiable organizational workflow platform**.

This is NOT primarily:

- a procurement system,
- an SSI wallet,
- a credential demo,
- or a generic workflow builder.

The target architecture is:

```text
USER
 ├── MOBILE WALLET / ACTION CENTER
 └── WEB PORTAL
          ↓
     ORGANIZATION API
       ├── WORKFLOW ENGINE  ← reuse existing WorkflowService
       ├── POLICY / AUTHZ ENGINE
       ├── BUSINESS MODULES
       │   ├── Finance
       │   ├── Procurement
       │   ├── HR
       │   └── Field Ops
       └── SSI TRUST KERNEL
           ├── DIDs
           ├── VCs
           ├── Presentation Requests
           ├── Trust
           └── Status / Consent
```

Generic business lifecycle:

```text
requester
  → request
  → policy evaluation
  → routing
  → review
  → approval
  → fulfilment / execution
  → verification
  → closure
```

The key architectural principle:

**SSI provides evidence and trust.  
The organization platform owns business state, authorization, workflow and outcomes.**

Credential ≠ authorization.

The policy engine decides whether someone is authorized based on:

```text
authenticated subject
tenant / organization
membership
role / authority
delegation
action
amount
department
project
cost centre
temporal validity
credential validity
credential status
separation of duties
```

---

# 2. Current branch

Active branch:

```text
platform-remodel
```

Do NOT modify:

```text
mvp-fastlane
```

Current branch head as of the latest work:

```text
370abc249e8724c3cdeeb7641e56d9071f797cc9
```

Latest commit:

```text
Harden Bitstring Status List validation
```

---

# 3. Current stack

Backend:

```text
Node.js
TypeScript
Express
Credo.js / Aries JS
SQLite + better-sqlite3
```

Future production DB:

```text
PostgreSQL
```

Frontend / future portal:

```text
Next.js
JavaScript
MUI v5
```

Current Credo line:

```text
@credo-ts/core       0.7.0
@credo-ts/askar      0.7.0
@credo-ts/node       0.7.0
@credo-ts/openid4vc  0.7.0
@credo-ts/anoncreds  0.7.0
@credo-ts/question-answer 0.7.0
@credo-ts/tenants     0.7.0
dcql                  ^3.0.0
```

Node:

```text
>=24
```

Package manager:

```text
Yarn 1.22.22
```

Old Credo 0.5.x patches were removed because they were version-specific.

---

# 4. Standards target

The implementation should align with:

```text
W3C VC Data Model 2.0
W3C Data Integrity 1.0
DID Core
OpenID4VCI 1.0
OpenID4VP 1.0
DCQL
HAIP 1.0
W3C Bitstring Status List 1.0
```

Future trust/federation work:

```text
OpenID Federation 1.0
OpenID Authorization API
AuthZEN-style external authorization integration
```

---

# 5. SSI boundary

Use this separation strictly.

## Holder wallet owns

```text
private keys
seed material
credentials
presentations
wallet storage
holder cryptographic operations
```

## Platform owns

```text
workflow state
business requests
authorization
policy decisions
verification outcomes
credential references
trust decisions
consent records
audit records
status metadata
```

The platform must NOT become the user's wallet database.

Do not persist:

```text
raw VC payloads
raw VP payloads
private keys
seed phrases
raw JWT credential material
raw SD-JWT material
full mdoc payloads
```

Persist references/digests/metadata instead.

---

# 6. Existing WorkflowService

IMPORTANT:

There is already a WorkflowService.

DO NOT create a second workflow engine.

Existing action types include:

```text
finance.calculate_invoice
credential.issue
external.fetch
external.ecocash_payment
external.call_provider
external.send_notification
trust.update_score
trust.calculate_credit_score
trust.get_score
consent.capture
consent.verify
consent.revoke
workflow.trigger
```

Future task/wait functionality must extend the existing workflow mechanism rather than creating a competing state machine.

---

# 7. Existing data model

Existing migration:

```text
migrations/003_create_workflows.sql
```

Existing table:

```sql
workflows
```

Fields include:

```text
id
tenant_id
name
category
provider
description
input_schema
actions
created_at
```

---

# 8. Existing persistence layer

Existing repositories include:

```text
DidRepository
IssuedCredentialRepository
CredentialDefinitionRepository
CredentialOfferRepository
SchemaRepository
TrustRepository
ConsentRepository
TenantRepository
OidcStoreRepository
...
```

New reference-first repository already exists:

```text
src/persistence/CredentialReferenceRepository.ts
```

It intentionally contains NO full credential payload field.

It stores:

```text
id
organizationId
subjectRef
credentialType
issuerRef
format
externalRef
status
issuedAt
expiresAt
lastVerifiedAt
digest
```

This is the desired long-term persistence model.

---

# 9. Existing organization/platform schema

Migration 021 added the organizational foundation.

Concepts include:

```text
organizations
departments
people
organization_memberships
roles
authority_grants
delegations
requests
request_items
request_approvals
policy_decisions
credential_references
evidence_references
request_tasks
request_events
```

Important:

`people` uses opaque:

```text
subject_ref
```

Do NOT turn it into a general PII store.

Current concerns that still need work:

```text
organizations.tenant_id currently effectively gives one organization per tenant
context_json can contain arbitrary sensitive data
request list has a 500-item cap instead of cursor pagination
evidence references need strict reference/digest semantics
```

---

# 10. Existing trust/SSI presentation schema

Migration 022 added:

```text
trust_anchors
verifier_registrations
presentation_requests
presentation_consents
presentation_results
authority_policies
```

No raw VP/VC payloads should be stored.

`presentation_requests` currently tracks concepts such as:

```text
requester_person_id
verifier_ref
purpose
query_language
query_ref
transaction_ref
status
expiry
Credo verification session id
verifier client ref
protocol
```

Important semantic point:

`requester_person_id` is the employee/process initiating the verifier operation.

It is NOT the holder.

Do not bind holder identity to this field.

---

# 11. Authentication / authorization already implemented

Existing:

```text
src/authentication.ts
```

Supports multi-tenant JWT checks involving:

```text
tenantId
role
scopes
```

New:

```text
AuthorizationService.ts
```

It currently handles:

```text
authenticated tenant/member
active authority
permission checks
resource type
department
project
cost centre
maximum amount
currency
separation of duties
delegation
delegator authority
policy decision recording
```

Delegation was hardened to validate constrained scope, not merely a permission string.

Future improvements:

```text
role → permissions integration
versioned policy definitions
richer separation-of-duties
external authorization API / AuthZEN integration
```

---

# 12. Platform request lifecycle

New:

```text
PlatformRequestService.ts
```

Lifecycle:

```text
draft
→ submitted
→ in_review
→ approved / rejected
→ in_fulfilment
→ completed
```

Cancellation is supported.

Important security behavior:

- resolves authenticated tenant + opaque subject to active member
- client cannot simply submit actorPersonId
- non-requester transitions require authorization
- maker-checker prevents requester self-approval by default
- amount/currency/department/project/costCentre flow into authorization
- object-level visibility exists
- requester sees own requests
- privileged request.read can see broader scope

Remaining issues:

```text
list capped at 500
no cursor pagination
context_json lacks schema enforcement
```

---

# 13. Request controller

Existing:

```text
src/controllers/RequestController.ts
```

JWT-protected routes under:

```text
api/platform/requests
```

Supports:

```text
create
submit
transition
list
get
```

Keep authorization checks at the service layer, not only controller layer.

---

# 14. Native OpenID4VCI

Existing:

```text
src/controllers/oidc/OidcIssuerController.ts
```

Native Credo OpenID4VC issuer.

Supports compatibility formats including:

```text
jwt_vc_json
SD-JWT
LDP
```

Uses actual Credo issuance:

```ts
agent.modules.openId4VcIssuer.createCredentialOffer(...)
```

IMPORTANT outstanding issue:

Current OIDC issuance path logs credential claims / body content.

This MUST be redacted before production.

---

# 15. DCQL / OpenID4VP implementation

New service:

```text
src/services/ssi/SsiPresentationService.ts
```

This is now DCQL-first.

Input supports:

```text
queryLanguage?: 'dcql' | 'pex_v2'
dcqlQuery?
presentationDefinition?
```

Default:

```text
dcql
```

The DCQL path:

1. resolves verifier registration
2. performs platform authorization first
3. creates platform presentation request
4. validates DCQL
5. creates Credo OpenID4VP authorization request
6. persists the Credo verification session ID
7. returns the protocol request URL

Credo call:

```ts
verifierModule.createAuthorizationRequest({
  verifierId: registration.credoVerifierIdRef,
  requestSigner: {
    method: 'did',
    didUrl: registration.signerDidUrlRef,
  },
  dcql: {
    query: dcqlQuery,
  },
  version: 'v1',
  expirationInSeconds,
})
```

PEX remains explicit compatibility:

```text
queryLanguage = pex_v2
```

and uses:

```text
presentationExchange
version = v1.draft24
```

DO NOT silently mix PEX into the DCQL path.

---

# 16. Important Credo 0.7 behavior already established

Credo's W3C credential verifier supports:

```ts
agent.w3cCredentials.verifyCredential(...)
```

and accepts JWT credentials or W3C JSON-LD credentials.

Credo OpenID4VP 1.0:

```text
version = v1
```

is the DCQL path.

The older PEX-style request is not the DCQL path.

Credo owns core protocol verification including the stored verification session and protocol validation.

Use Credo for protocol cryptography/protocol semantics rather than reimplementing this inside the platform.

---

# 17. SsiTrustService

Existing/new:

```text
src/services/SsiTrustService.ts
```

Responsibilities include:

```text
createPresentationRequest
getProtocolContext
bindCredoVerificationSession
recordVerification
```

Presentation request authorization currently uses:

```text
action: presentation.request
requiredPermission: presentation.request
resourceType: presentation_request
```

`getProtocolContext` provides values including:

```text
requestId
verifierRef
protocol
queryLanguage
queryRef
Credo session id
verifier client id ref
expiry
```

---

# 18. Credential Status Service — CURRENT STATE

Current:

```text
src/services/ssi/CredentialStatusService.ts
```

The latest version implements W3C Bitstring Status List v1.0 validation.

It currently:

```text
requires BitstringStatusListEntry
requires statusPurpose
requires statusListIndex
requires statusListCredential
defaults statusSize to 1
currently supports statusSize 1..8
requires correct statusMessage cardinality when statusSize > 1
requires decimal statusListIndex
rejects unsafe integer indexes
requires HTTPS status-list URL
rejects redirects
8-second request timeout
8 MB response cap
4 MB decompressed list cap
requires BitstringStatusListCredential type
cryptographically verifies fetched status-list VC using Credo
checks purpose matches
requires multibase u prefix
gunzips encoded bitstring
requires minimum list size
reads bits MSB-first
zero = valid
non-zero suspension = suspended
non-zero revocation = revoked
network/verification errors = unknown
```

Do NOT replace this with the older stub.

Security behavior is deliberately fail-closed.

Current implementation reference:

```text
commit 370abc249e8724c3cdeeb7641e56d9071f797cc9
```

Remaining status-list work:

```text
issuer trust validation for status-list issuer
cache strategy
refresh strategy
stapled status support
publisher/allocation service
persistent status-list management
tests using official examples
```

Note:

The current implementation conservatively caps:

```text
statusSize <= 8
```

W3C permits positive integers generally. This restriction is a platform profile choice and can be revisited.

---

# 19. Current CredoPresentationVerificationService

Current:

```text
src/services/ssi/CredoPresentationVerificationService.ts
```

It now attempts to bridge:

```text
Credo OpenID4VP verification
+
DCQL result
+
credential status
+
issuer trust
+
platform verification record
```

It calls:

```ts
verifier.verifyAuthorizationResponse(...)
```

using the stored:

```text
credoVerificationSessionId
```

It transiently extracts:

```text
presentations
credentials
credential IDs
credential types
issuer references
```

It does NOT return/store the raw VP.

It checks:

```text
local revocation
status list status
issuer trust
DCQL / PEX verification
```

However:

## THIS SERVICE IS NOT YET FULLY PRODUCTION-SAFE.

The current implementation contains temporary assumptions:

```ts
holderBindingVerified = true
audienceVerified = true
nonceVerified = true
```

Those values must NOT remain hard-coded without verifying the exact Credo 0.7 verification semantics/results.

The service also needs exact validation of:

```text
schemaVerified
DCQL result interpretation
presentation extraction
credential extraction
credential status formats
issuer extraction
```

Do not claim this component is production-complete until those are resolved.

---

# 20. CRITICAL OpenID4VP callback architecture issue

There is a major outstanding design issue.

The wallet's OpenID4VP callback is a protocol interaction.

It should NOT depend solely on an arbitrary logged-in application JWT.

The verifier callback needs to derive/bind trust from:

```text
OpenID4VP state
Credo verification session
verifier registration
stored request context
nonce / audience / protocol session
tenant association
```

Therefore:

```text
protocol authentication
```

must be distinguished from:

```text
ordinary user authentication
```

The callback should identify the registered verifier/tenant from the protocol session and stored context.

Do not make the final architecture:

```text
wallet callback → requires random end-user JWT
```

unless that is specifically an optional administrative wrapper.

This is one of the most important remaining tasks.

---

# 21. IssuerTrustService

There is a separate issuer trust layer.

Keep this distinct from:

```text
TrustRepository
```

because `TrustRepository` is/was being used for business reputation / trust scores.

We need two separate concepts:

### SSI issuer trust

```text
issuer trust anchors
trusted issuers
verifier trust registrations
trust decisions
```

### Business trust

```text
subject DID
trust score
transaction history
reputation events
credit score
```

Do NOT conflate them.

Issuer trust should determine whether a credential issuer is acceptable to the verifier/platform.

---

# 22. Credential reference migration

Legacy:

```text
IssuedCredentialRepository
```

still stores full signed credential data.

That is legacy behavior.

Desired architecture:

```text
Legacy full credential storage
        ↓
compatibility/deprecation
        ↓
CredentialReferenceRepository
```

New credentials should be represented in application data primarily by:

```text
credential reference
issuer reference
credential type
subject reference
status
digest
dates
external reference
```

not full VC payload.

Do not break legacy functionality abruptly.

---

# 23. Consent

Existing:

```text
ConsentRepository
```

already supports:

```text
purpose-specific consent
retention period
end date
revocation
audit
workflow binding
expiry
```

Reuse/converge these semantics.

Do not create an unrelated second consent implementation for presentation flows.

Presentation consent must remain:

```text
holder-centric
purpose-specific
time-bounded where appropriate
auditable
revocable
```

---

# 24. Evidence model

Evidence should be:

```text
reference
digest
object-storage key
verification metadata
```

not raw sensitive evidence in normal workflow tables.

Use:

```text
evidence_references
```

for business evidence.

The system should be able to prove:

```text
which evidence was relied upon
when
by whom
for what purpose
what digest/reference was used
what verification result occurred
```

without making the platform a raw credential warehouse.

---

# 25. Policy integration target

Eventually policy checks should be able to express:

```text
User must have EmployeeCredential
AND
credential must be currently valid
AND
issuer must be trusted
AND
role must include finance.approve
AND
amount <= authority limit
AND
department = Finance
AND
maker != checker
```

Example:

```text
Finance manager approval
+
employment credential
+
valid status
+
trusted issuer
+
delegation validity
+
amount threshold
```

The final authorization decision should combine:

```text
application identity
+
organizational authority
+
delegation
+
SSI evidence
+
credential status
+
issuer trust
+
business constraints
```

---

# 26. Existing business modules

Target module structure:

```text
Finance
Procurement
HR
Field Ops
```

Start generic.

Do NOT duplicate request/approval engines inside every module.

Use:

```text
PlatformRequestService
AuthorizationService
WorkflowService
```

as shared infrastructure.

Business modules should provide:

```text
schemas
policies
commands
actions
handlers
outcomes
```

---

# 27. Workflow task integration

There is:

```text
request_tasks
```

Do not create another workflow state machine.

Instead map request task behavior onto existing WorkflowService functionality.

Desired architecture:

```text
workflow action starts request task
        ↓
workflow pauses / waits
        ↓
human completes task
        ↓
workflow resumes
        ↓
fulfilment executes
```

Likely conceptual actions:

```text
request.wait_for_task
request.complete_task
workflow.trigger
```

Implement this through the existing WorkflowService infrastructure.

---

# 28. OIDC4VP legacy controller

Existing:

```text
src/controllers/oidc/OidcVerifierController.ts
```

is a legacy DIF Presentation Exchange path.

It should eventually become:

```text
compatibility route
```

not the primary protocol surface.

Tasks:

```text
mark compatibility semantics clearly
remove full VP response payloads from API output
remove sensitive logging
route verification into shared trust/status verification
avoid duplicate verification logic
```

DCQL/OpenID4VP 1.0 is the primary path.

---

# 29. OIDC4VCI logging hardening

Current issuer controller can log sensitive credential claims.

Remove logs containing:

```text
credential body
claims
private identity values
raw credential material
```

Replace with metadata such as:

```text
operation
tenant
credential type
request id
protocol
result
error code
```

Never log entire VC/VP/JWT/SD-JWT payloads.

---

# 30. Privacy requirements

Application records should generally contain:

```text
opaque subject refs
credential refs
issuer refs
verification outcome
digests
timestamps
authorization decisions
workflow outcomes
```

Avoid:

```text
email
phone
full names
raw credential
raw presentation
private keys
raw tokens
```

unless explicitly required in a separate controlled domain service.

Use pairwise identifiers where practical.

---

# 31. Tenant isolation

Every domain read/write must remain tenant/org scoped.

Audit:

```text
request
approval
policy
credential reference
presentation request
presentation result
trust anchor
verifier registration
delegation
role
authority
department
evidence
workflow
```

No route should depend only on object ID.

---

# 32. Pagination

Current request listing is capped around:

```text
500
```

Replace with cursor pagination.

Target:

```text
limit
cursor
nextCursor
```

Do this for all growing organizational resources eventually.

Avoid offset-based pagination for high-volume tables.

---

# 33. Audit/event model

Use:

```text
request_events
policy_decisions
presentation_results
consent audit
```

to provide traceability.

The audit model should support:

```text
actor
action
target
tenant
timestamp
decision
reason
workflow/request reference
```

without persisting sensitive payloads.

---

# 34. Status semantics

Credential status should be explicit:

```text
valid
revoked
suspended
expired
unknown
```

Fail closed where status is required.

If policy says:

```text
credential must be currently valid
```

then:

```text
unknown
```

must NOT pass.

---

# 35. Issuer trust semantics

Issuer trust should be evaluated independently from credential status.

Example:

```text
credential status = valid
issuer trust = false
```

Result:

```text
verification fails
```

Likewise:

```text
issuer trust = true
credential status = unknown
```

Result:

```text
verification fails when policy requires current status
```

---

# 36. Business trust semantics

Do not treat:

```text
business trust score
```

as equivalent to:

```text
cryptographic issuer trust
```

For example:

```text
EcoCash transaction history
→ business trust / credit score
```

is separate from:

```text
Registrar-issued credential
→ issuer trust
```

This separation is essential.

---

# 37. EcoCash integration

Longer-term business module:

```text
EcoCash
```

Use cases include:

```text
transaction credential
payment execution
payment proof
supplier payment reconciliation
credit scoring
```

The architecture should allow:

```text
EcoCash API
→ workflow action
→ transaction/outcome
→ optional verifiable evidence
→ payment proof
→ supplier notification
```

Do not hardwire EcoCash into the SSI core.

EcoCash should be a provider/integration module.

---

# 38. Procurement architecture

Procurement should eventually support:

```text
requisition
→ approval
→ purchase order
→ supplier credential verification
→ fulfilment
→ invoice
→ payment
→ payment proof
→ reconciliation
→ supplier notification
```

Supplier identity and credentials should be reusable across workflows.

---

# 39. Finance architecture

Target:

```text
invoice
→ validation
→ approval
→ authorization
→ payment
→ proof
→ reconciliation
→ payable aging
```

Potential future:

```text
supplier outstanding age analysis
payment allocations
payment proof VC
credential-backed supplier identity
```

Again:

workflow engine handles orchestration.

Finance module handles domain rules.

---

# 40. HR architecture

Target:

```text
employee onboarding
credential issuance
employment status
role/authority changes
delegation
offboarding
credential status changes
```

Important:

HR events may drive credential lifecycle/status but should not directly expose raw HR records into general platform data.

---

# 41. Field operations

Potential examples:

```text
field worker authorization
site access
inspection
maintenance task
incident reporting
proof of work
```

The worker can present appropriate credentials from a wallet.

The organization verifies:

```text
who
credential type
issuer trust
credential status
task authorization
```

---

# 42. Credential issuance architecture

Primary:

```text
OpenID4VCI
```

Do not invent a custom credential exchange if standard protocol supports it.

Issuance flow:

```text
organization policy
→ credential request
→ OpenID4VCI offer
→ wallet
→ holder consent
→ issuance
→ credential reference persisted
```

Private credential payload remains with holder/protocol layer.

---

# 43. Presentation architecture

Primary:

```text
OpenID4VP 1.0
+
DCQL
```

Flow:

```text
business workflow
→ policy requires evidence
→ presentation request
→ wallet
→ holder consent
→ VP
→ Credo verification
→ DCQL evaluation
→ credential status
→ issuer trust
→ authorization decision
→ workflow continues
```

---

# 44. Critical security invariant

The system must never conclude:

```text
"credential exists"
```

therefore:

```text
"user is authorized"
```

Instead:

```text
credential
+
status
+
issuer trust
+
organization membership
+
authority
+
policy
=
authorization decision
```

---

# 45. Testing strategy

Need tests for:

## Credential status

```text
valid bit
revoked bit
suspended bit
wrong purpose
wrong type
invalid index
out-of-range index
missing status list
malformed encoded list
malformed gzip
oversized decompressed payload
invalid statusMessage cardinality
unverified status-list credential
network failure
timeout
```

Use official W3C Bitstring examples where practical.

## DCQL

```text
valid query
invalid query
matching credential
non-matching credential
multiple credentials
multiple query groups
```

## OpenID4VP

```text
invalid state
invalid session
wrong verifier
expired request
wrong audience
wrong nonce
holder binding failure
valid response
```

## Authorization

```text
no permission
wrong tenant
inactive member
expired delegation
delegation exceeds authority
SoD violation
amount exceeds limit
credential missing
credential revoked
credential untrusted
credential status unknown
```

## Requests

```text
request creation
submit
approve
reject
cancel
maker-checker
visibility
tenant isolation
```

---

# 46. CI state

CI currently runs:

```text
Install dependencies
→ lint
→ prettier
→ type check
```

Current workflow:

```text
.github/workflows/continuous-integration.yml
```

includes:

```text
main
develop
platform-remodel
```

The latest known run stopped at:

```text
Linting
```

with dependency installation succeeding.

Therefore:

**Do NOT claim the branch is CI-green until a later run completes successfully through type-checking.**

---

# 47. CI debugging process

When CI fails:

1. Fetch workflow job.
2. Fetch job logs.
3. Identify exact lint/format/type error.
4. Fix only relevant files.
5. Commit.
6. Let CI rerun.
7. Repeat until:
   ```text
   lint = success
   prettier = success
   compile = success
   ```

Do not blindly change workflow rules just to make CI pass.

---

# 48. Current immediate execution order

Do the work in this exact order.

## STEP 1 — Get CI fully green

Fix current lint failure.

Then run:

```text
Prettier
Compile / yarn check-types
```

Fix every error revealed.

Do NOT move on until the latest branch has a clean CI run.

---

## STEP 2 — Finish CredoPresentationVerificationService

Remove temporary:

```ts
holderBindingVerified = true
audienceVerified = true
nonceVerified = true
```

Determine exactly what Credo 0.7 proves when:

```ts
verifyAuthorizationResponse(...)
```

returns successfully.

Map actual Credo result/session fields to:

```text
holder binding
audience
nonce
state
DCQL evaluation
credential proof validation
```

Only set a verification flag true when supported by actual Credo semantics.

---

## STEP 3 — Fix protocol callback authentication

Redesign the wallet callback so it binds to:

```text
Credo verification session
state
verifier registration
tenant
request
```

instead of relying solely on ordinary user JWT authentication.

The protocol session must prove which verifier/tenant/request the callback belongs to.

---

## STEP 4 — Complete issuer trust

Finalize:

```text
IssuerTrustService
```

It should be able to answer:

```text
is this issuer trusted for this tenant/verifier/policy?
```

Use the trust anchor registry.

Do not use business trust scores for issuer trust.

---

## STEP 5 — Connect status + issuer trust to authorization

Authorization should support conditions such as:

```text
requiresCredential
trustedIssuer
statusMustBeValid
```

Example:

```text
finance.approve
AND
employeeCredential valid
AND
issuer trusted
AND
amount <= 5000
```

The result should be persisted as a policy decision.

---

## STEP 6 — Credential reference integration

Use:

```text
CredentialReferenceRepository
```

as the platform application's credential metadata store.

Add reference creation/update when issuance/verification is completed.

Keep legacy full credential storage only as compatibility.

---

## STEP 7 — Consent convergence

Connect presentation consent into the existing:

```text
ConsentRepository
```

semantics.

Support:

```text
purpose
workflow/request binding
expiry
revocation
audit
```

---

## STEP 8 — Workflow task integration

Map:

```text
request_tasks
```

onto existing WorkflowService.

No second workflow engine.

Implement:

```text
wait
complete
resume
```

semantics.

---

## STEP 9 — Harden legacy OIDC4VP

Make old PEX controller:

```text
compatibility-only
```

Reuse shared verification services.

Remove:

```text
raw VP responses
sensitive logs
duplicated trust/status logic
```

---

## STEP 10 — Harden OIDC4VCI

Remove raw claim/credential logging.

Add:

```text
safe structured audit logs
```

---

## STEP 11 — Pagination and object-level authorization

Replace 500-item list caps with cursor pagination.

Audit every resource for:

```text
tenant scope
organization scope
member scope
role scope
department scope
```

---

## STEP 12 — Context schema hardening

`context_json` should eventually use per-request/module schemas.

Do not allow unrestricted arbitrary sensitive blobs.

---

## STEP 13 — Status list producer

After verifier path is stable, implement:

```text
status list allocation
status index assignment
publisher
list persistence
credential status updates
```

Use random index assignment where privacy requires it.

---

## STEP 14 — Status list caching

Implement controlled caching:

```text
cache
TTL
refresh
stale handling
failure semantics
```

Never allow stale/unknown status to accidentally pass a strict policy.

---

## STEP 15 — Trust policy evolution

Add:

```text
versioned policy definitions
policy version in decisions
optional external authorization adapter
```

Future compatibility:

```text
OpenID Authorization API / AuthZEN
```

---

## STEP 16 — Business modules

Build the shared platform first.

Then:

```text
Finance
Procurement
HR
Field Ops
```

Do not duplicate request/approval/authorization logic.

---

## STEP 17 — EcoCash provider

Add EcoCash as a provider module.

Potential actions:

```text
ecocash.payment
ecocash.transaction.lookup
ecocash.payment.proof
```

Use existing workflow action framework.

---

## STEP 18 — PostgreSQL adapter

Once domain stabilizes:

```text
Repository interfaces
        ↓
SQLite adapter
PostgreSQL adapter
```

Do NOT rewrite domain logic.

---

# 49. Definition of done

The remodel is not "done" merely because the app starts.

Minimum acceptable done state:

```text
✓ Credo 0.7 running
✓ OpenID4VCI native
✓ OpenID4VP 1.0 native
✓ DCQL primary
✓ PEX compatibility only
✓ verification session binding
✓ protocol callback securely bound
✓ issuer trust
✓ Bitstring status verification
✓ authorization policy integration
✓ maker-checker
✓ delegations
✓ tenant isolation
✓ credential references
✓ no raw VC/VP in platform tables
✓ consent integration
✓ workflow task integration
✓ audit records
✓ redacted logging
✓ CI lint green
✓ Prettier green
✓ type-check green
✓ tests for critical security paths
```

Only after these are working should the system be described as approaching production readiness.

---

# 50. Important engineering rules for the next chat

1. Continue directly from `platform-remodel`.

2. Never modify:

```text
mvp-fastlane
```

3. Never replace working Credo native protocol functionality with homemade protocol implementations.

4. Never create a second workflow engine.

5. Never store raw VC/VP/private keys in platform application tables.

6. Never equate credential possession with authorization.

7. Never equate issuer trust with business trust score.

8. Never silently fall back from DCQL to PEX.

9. Never make OpenID4VP wallet callback dependent solely on an ordinary application JWT.

10. Never leave hard-coded verification assertions in security-critical code.

11. Never claim CI is green without seeing a completed successful run.

12. Prefer incremental commits so a single failure is easy to isolate.

13. After every meaningful implementation group, inspect the branch and CI before continuing.

14. Keep changes focused and avoid large speculative refactors.

15. If a problem is discovered, fix the underlying architecture rather than masking it with a permissive fallback.

---

# 51. Immediate command to the new chat

Start by saying:

```text
Continue from this handoff on branch platform-remodel.

First inspect the latest branch head and CI state.

Then fix the remaining CI failure and finish the production-critical OpenID4VP/DCQL verification path piece by piece.

Do not ask me to re-explain the architecture.
Do not touch mvp-fastlane.
Do not stop at analysis; make the repository changes and verify each stage.
```

Then continue from:

```text
370abc249e8724c3cdeeb7641e56d9071f797cc9
```

and the first unresolved issue:

```text
CI lint failure
```

followed by:

```text
CredoPresentationVerificationService correctness
→ protocol callback binding
→ issuer trust
→ status + trust + policy integration
→ credential references
→ consent
→ workflow tasks
→ legacy hardening
→ testing
→ final CI green
```

# 52. Final architectural target

The finished system should look conceptually like:

```text
                         ┌─────────────────────┐
                         │     WALLET          │
                         │ credentials/keys    │
                         └──────────┬──────────┘
                                    │
                            OpenID4VP / VCI
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────┐
│                 ORGANIZATION PLATFORM                    │
│                                                          │
│  Authentication                                          │
│       ↓                                                  │
│  Organization / Membership                               │
│       ↓                                                  │
│  Authority / Delegation                                  │
│       ↓                                                  │
│  Policy Engine                                           │
│       ↓                                                  │
│  Request / Workflow                                      │
│       ↓                                                  │
│  Business Module                                         │
│       ↓                                                  │
│  SSI Verification                                        │
│    ├── Credo protocol verification                       │
│    ├── DCQL                                              │
│    ├── issuer trust                                      │
│    ├── credential status                                 │
│    └── consent                                           │
│       ↓                                                  │
│  Authorization Decision                                  │
│       ↓                                                  │
│  Fulfilment / Execution                                  │
│       ↓                                                  │
│  Evidence / Outcome / Audit                              │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

The central idea is:

```text
IDENTITY
   +
AUTHORITY
   +
POLICY
   +
TRUSTED EVIDENCE
   +
WORKFLOW
   +
BUSINESS EXECUTION
   =
VERIFIABLE ORGANIZATIONAL OPERATIONS
```
