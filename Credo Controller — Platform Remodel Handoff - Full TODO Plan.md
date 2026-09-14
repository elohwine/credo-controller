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

UI

Credentis Platform Remodel — UI & Inbox Workflow Guide

1. Product UI principle

Credentis is a verifiable organizational workflow platform.

The UI must therefore make this feel like:

«“I have something to do.”»

not:

«“I have a credential to manage.”»

The primary user interaction is:

Inbox → Item → Context → Required action → Decision / evidence / task → Workflow continues

SSI is embedded into that experience when required.

The platform architecture explicitly separates the organizational workflow layer from the SSI layer: SSI supplies evidence and trust, while the organization platform owns requests, authorization, workflow state and outcomes.

---

2. What must NOT be changed

The existing inbox-driven UX should remain the central interaction pattern.

Do not redesign the mobile application into:

- Requests
- Approvals
- Tasks
- Credentials
- Workflows

as unrelated top-level work areas.

Those are different kinds of work represented inside the user's inbox.

For example:

INBOX

School Fees
└── Review fee payment
└── Approve / Pay / Provide information

    Requisition
    └── Approve requisition
        └── Review / Approve / Reject / Request changes

        Supplier
        └── Verify supplier
            └── Review credential / Present credential / Continue
            Field Operation
            └── Complete site inspection
                └── Review / Submit evidence / Complete task

                Consent
                └── Permission requested
                    └── Review / Allow / Decline

                    The item type determines the interaction, but the user should still experience everything as one Action Inbox.

                    ---

                    3. Mobile application structure

                    The mobile application should become:

                    HOME / INBOX        │
                            ├── Inbox
                                    │    ├── Requests
                                            │    ├── Approvals
                                                    │    ├── Tasks
                                                            │    ├── Consent requests
                                                                    │    ├── Credential requests
                                                                            │    ├── Presentation requests
                                                                                    │    ├── Evidence requests
                                                                                            │    └── Notifications
                                                                                                    │
                                                                                                            ├── Wallet
                                                                                                                    │    ├── Credentials
                                                                                                                            │    ├── DIDs / Identity
                                                                                                                                    │    └── Presentations
                                                                                                                                            │
                                                                                                                                                    ├── Scan
                                                                                                                                                            │    └── Universal protocol entry
                                                                                                                                                                    │
                                                                                                                                                                            └── Profile / Settings

                                                                                                                                                                            Priority

                                                                                                                                                                            The default landing page should be Inbox, not Wallet.

                                                                                                                                                                            Wallet functionality remains important, but it is the user's private SSI capability.

                                                                                                                                                                            Inbox is the user's organizational action surface.

                                                                                                                                                                            ---

                                                                                                                                                                            4. Inbox design

                                                                                                                                                                            Header

                                                                                                                                                                            The inbox header should communicate:

                                                                                                                                                                            Good morning, Elowine

                                                                                                                                                                            You have 4 actions requiring attention

                                                                                                                                                                            Then:

                                                                                                                                                                            [ Search ]

                                                                                                                                                                            [All] [Needs action] [Waiting] [Completed]

                                                                                                                                                                            Optional filters:

                                                                                                                                                                            Priority
                                                                                                                                                                            Organisation
                                                                                                                                                                            Department
                                                                                                                                                                            Type
                                                                                                                                                                            Due date

                                                                                                                                                                            Avoid making users navigate to another section merely to find something they need to act on.

                                                                                                                                                                            ---

                                                                                                                                                                            5. Inbox item card

                                                                                                                                                                            Each inbox item should expose enough information to answer:

                                                                                                                                                                            1. What is this?
                                                                                                                                                                            2. Why am I seeing it?
                                                                                                                                                                            3. What do I need to do?
                                                                                                                                                                            4. How urgent is it?
                                                                                                                                                                            5. What happens after I act?

                                                                                                                                                                            Example:

                                                                                                                                                                            ┌──────────────────────────────────┐
                                                                                                                                                                            │ ?? ACTION REQUIRED               │
                                                                                                                                                                            │                                  │
                                                                                                                                                                            │ Requisition Approval             │
                                                                                                                                                                            │ Office Equipment                 │
                                                                                                                                                                            │                                  │
                                                                                                                                                                            │ Finance Department               │
                                                                                                                                                                            │ USD 4,200                        │
                                                                                                                                                                            │ Requested by: John M.            │
                                                                                                                                                                            │                                  │
                                                                                                                                                                            │ Due today                        │
                                                                                                                                                                            │                                  │
                                                                                                                                                                            │ [Review]                         │
                                                                                                                                                                            └──────────────────────────────────┘

                                                                                                                                                                            For a school-fees workflow:

                                                                                                                                                                            ┌──────────────────────────────────┐
                                                                                                                                                                            │ PAYMENT REQUIRED                 │
                                                                                                                                                                            │                                  │
                                                                                                                                                                            │ School Fees                     │
                                                                                                                                                                            │ Term 3 Fees                     │
                                                                                                                                                                            │                                  │
                                                                                                                                                                            │ Student: Brian T.               │
                                                                                                                                                                            │ School: Example High School     │
                                                                                                                                                                            │ Amount: USD 650                  │
                                                                                                                                                                            │                                  │
                                                                                                                                                                            │ Due: 12 Sep 2026                │
                                                                                                                                                                            │                                  │
                                                                                                                                                                            │ [Review & Pay]                  │
                                                                                                                                                                            └──────────────────────────────────┘

                                                                                                                                                                            The inbox card should not expose unnecessary credential technical detail.

                                                                                                                                                                            ---

                                                                                                                                                                            6. Inbox item detail

                                                                                                                                                                            Selecting an item opens a context-first detail screen.

                                                                                                                                                                            Recommended structure:

                                                                                                                                                                            ← Back

                                                                                                                                                                            ACTION REQUIRED

                                                                                                                                                                            Approve Requisition
                                                                                                                                                                            REQ-2026-00142

                                                                                                                                                                            ────────────────────

                                                                                                                                                                            Request
                                                                                                                                                                            Office laptops

                                                                                                                                                                            Amount
                                                                                                                                                                            USD 4,200

                                                                                                                                                                            Requested by
                                                                                                                                                                            John M.

                                                                                                                                                                            Department
                                                                                                                                                                            Finance

                                                                                                                                                                            Cost centre
                                                                                                                                                                            FIN-001

                                                                                                                                                                            ────────────────────

                                                                                                                                                                            Items

                                                                                                                                                                            4 × Laptop
                                                                                                                                                                            2 × Monitor
                                                                                                                                                                            1 × Printer

                                                                                                                                                                            ────────────────────

                                                                                                                                                                            Why am I seeing this?

                                                                                                                                                                            You are authorised to approve
                                                                                                                                                                            requests for this department.

                                                                                                                                                                            ────────────────────

                                                                                                                                                                            Trust & evidence

                                                                                                                                                                            Requester
                                                                                                                                                                            ✓ Organization member

                                                                                                                                                                            Authority
                                                                                                                                                                            ✓ Procurement approval authority

                                                                                                                                                                            Delegation
                                                                                                                                                                            ✓ Valid

                                                                                                                                                                            Credential status
                                                                                                                                                                            ✓ Current

                                                                                                                                                                            ────────────────────

                                                                                                                                                                            Workflow

                                                                                                                                                                            Submitted
                                                                                                                                                                               ↓
                                                                                                                                                                               Review
                                                                                                                                                                                  ↓
                                                                                                                                                                                  YOU ARE HERE
                                                                                                                                                                                     ↓
                                                                                                                                                                                     Procurement
                                                                                                                                                                                        ↓
                                                                                                                                                                                        Purchase Order
                                                                                                                                                                                           ↓
                                                                                                                                                                                           Fulfilment

                                                                                                                                                                                           ────────────────────

                                                                                                                                                                                           [Reject]     [Approve]

                                                                                                                                                                                           This is critical.

                                                                                                                                                                                           The UI should explain why the user can act, not simply display:

                                                                                                                                                                                           «“Credential verified.”»

                                                                                                                                                                                           Credential verification is only one part of authorization.

                                                                                                                                                                                           The policy model already evaluates tenant, membership, permissions, amount, department, project/cost centre, delegation and separation-of-duties constraints.

                                                                                                                                                                                           ---

                                                                                                                                                                                           7. Approval UX

                                                                                                                                                                                           Approval should be a deliberate action.

                                                                                                                                                                                           Pressing:

                                                                                                                                                                                           Approve

                                                                                                                                                                                           opens a confirmation sheet:

                                                                                                                                                                                           Approve requisition?

                                                                                                                                                                                           Office Equipment
                                                                                                                                                                                           USD 4,200

                                                                                                                                                                                           You are approving this request as:
                                                                                                                                                                                           Finance Manager

                                                                                                                                                                                           This action will:
                                                                                                                                                                                           ✓ record your decision
                                                                                                                                                                                           ✓ advance the workflow
                                                                                                                                                                                           ✓ notify the next participant

                                                                                                                                                                                           [Cancel]

                                                                                                                                                                                           [Confirm Approval]

                                                                                                                                                                                           Then:

                                                                                                                                                                                           ✓ Approved

                                                                                                                                                                                           The request has moved to Procurement.

                                                                                                                                                                                           [View request]
                                                                                                                                                                                           [Back to Inbox]

                                                                                                                                                                                           The item should leave the active inbox automatically.

                                                                                                                                                                                           The workflow engine is responsible for continuing execution rather than the UI manually orchestrating the next step. "WorkflowService" already supports action execution, run tracking, pause/resume, and human-task integration.

                                                                                                                                                                                           ---

                                                                                                                                                                                           8. Reject / request changes

                                                                                                                                                                                           Reject should not be a destructive red button with no context.

                                                                                                                                                                                           Flow:

                                                                                                                                                                                           Reject request

                                                                                                                                                                                           Reason

                                                                                                                                                                                           ○ Incorrect amount
                                                                                                                                                                                           ○ Insufficient documentation
                                                                                                                                                                                           ○ Not required
                                                                                                                                                                                           ○ Policy issue
                                                                                                                                                                                           ○ Other

                                                                                                                                                                                           Comment
                                                                                                                                                                                           [________________________]

                                                                                                                                                                                           [Cancel]
                                                                                                                                                                                           [Reject Request]

                                                                                                                                                                                           For workflows where rejection should return the request to the requester:

                                                                                                                                                                                           Rejected
                                                                                                                                                                                           ↓
                                                                                                                                                                                           Requester notified
                                                                                                                                                                                           ↓
                                                                                                                                                                                           Request returned for correction

                                                                                                                                                                                           The backend already models rejected requests as capable of returning to draft.

                                                                                                                                                                                           ---

                                                                                                                                                                                           9. Human task UX

                                                                                                                                                                                           A workflow may pause and wait for a person.

                                                                                                                                                                                           The user should never see:

                                                                                                                                                                                           «WORKFLOW_PAUSE»

                                                                                                                                                                                           or technical workflow state.

                                                                                                                                                                                           Instead:

                                                                                                                                                                                           ACTION REQUIRED

                                                                                                                                                                                           Supplier verification

                                                                                                                                                                                           The workflow is waiting for you
                                                                                                                                                                                           to verify the supplier's credentials.

                                                                                                                                                                                           [Review supplier]

                                                                                                                                                                                           The backend creates a request task and pauses execution; task completion then resumes the workflow.

                                                                                                                                                                                           The mobile app should therefore treat:

                                                                                                                                                                                           task

                                                                                                                                                                                           as an inbox interaction, not as a separate task-management application.

                                                                                                                                                                                           ---

                                                                                                                                                                                           10. School-fees reference workflow

                                                                                                                                                                                           School fees should be used as the UX reference for a simple multi-stage workflow.

                                                                                                                                                                                           Example:

                                                                                                                                                                                           Fee request / fee notice
                                                                                                                                                                                                   ↓
                                                                                                                                                                                                   Inbox
                                                                                                                                                                                                           ↓
                                                                                                                                                                                                           Open school-fees item
                                                                                                                                                                                                                   ↓
                                                                                                                                                                                                                   Display student + school + amount + period
                                                                                                                                                                                                                           ↓
                                                                                                                                                                                                                           Policy / eligibility / evidence
                                                                                                                                                                                                                                   ↓
                                                                                                                                                                                                                                   Payment action
                                                                                                                                                                                                                                           ↓
                                                                                                                                                                                                                                           EcoCash / payment provider
                                                                                                                                                                                                                                                   ↓
                                                                                                                                                                                                                                                   Payment proof
                                                                                                                                                                                                                                                           ↓
                                                                                                                                                                                                                                                           Reconciliation
                                                                                                                                                                                                                                                                   ↓
                                                                                                                                                                                                                                                                   Receipt / confirmation
                                                                                                                                                                                                                                                                           ↓
                                                                                                                                                                                                                                                                           Completed

                                                                                                                                                                                                                                                                           The user should experience this as a single journey.

                                                                                                                                                                                                                                                                           Do not force the user to navigate:

                                                                                                                                                                                                                                                                           Finance
                                                                                                                                                                                                                                                                           → Credentials
                                                                                                                                                                                                                                                                           → Payments
                                                                                                                                                                                                                                                                           → Receipts
                                                                                                                                                                                                                                                                           → Verification

                                                                                                                                                                                                                                                                           to finish one operation.

                                                                                                                                                                                                                                                                           Those capabilities appear inside the workflow where needed.

                                                                                                                                                                                                                                                                           ---

                                                                                                                                                                                                                                                                           11. Requisition reference workflow

                                                                                                                                                                                                                                                                           Requisition should demonstrate the richer organizational model.

                                                                                                                                                                                                                                                                           Requester
                                                                                                                                                                                                                                                                              ↓
                                                                                                                                                                                                                                                                              Create requisition
                                                                                                                                                                                                                                                                                 ↓
                                                                                                                                                                                                                                                                                 Submit
                                                                                                                                                                                                                                                                                    ↓
                                                                                                                                                                                                                                                                                    Inbox of reviewer
                                                                                                                                                                                                                                                                                       ↓
                                                                                                                                                                                                                                                                                       Review request
                                                                                                                                                                                                                                                                                          ↓
                                                                                                                                                                                                                                                                                          Authorization evaluation
                                                                                                                                                                                                                                                                                             ↓
                                                                                                                                                                                                                                                                                             Approve / Reject / Request changes
                                                                                                                                                                                                                                                                                                ↓
                                                                                                                                                                                                                                                                                                Procurement
                                                                                                                                                                                                                                                                                                   ↓
                                                                                                                                                                                                                                                                                                   Supplier verification
                                                                                                                                                                                                                                                                                                      ↓
                                                                                                                                                                                                                                                                                                      Purchase order
                                                                                                                                                                                                                                                                                                         ↓
                                                                                                                                                                                                                                                                                                         Fulfilment
                                                                                                                                                                                                                                                                                                            ↓
                                                                                                                                                                                                                                                                                                            Invoice
                                                                                                                                                                                                                                                                                                               ↓
                                                                                                                                                                                                                                                                                                               Payment approval
                                                                                                                                                                                                                                                                                                                  ↓
                                                                                                                                                                                                                                                                                                                  Payment
                                                                                                                                                                                                                                                                                                                     ↓
                                                                                                                                                                                                                                                                                                                     Proof
                                                                                                                                                                                                                                                                                                                        ↓
                                                                                                                                                                                                                                                                                                                        Reconciliation
                                                                                                                                                                                                                                                                                                                           ↓
                                                                                                                                                                                                                                                                                                                           Supplier notification
                                                                                                                                                                                                                                                                                                                              ↓
                                                                                                                                                                                                                                                                                                                              Complete

                                                                                                                                                                                                                                                                                                                              The mobile user should not see this as a collection of unrelated screens.

                                                                                                                                                                                                                                                                                                                              They see:

                                                                                                                                                                                                                                                                                                                              Inbox
                                                                                                                                                                                                                                                                                                                                 ↓
                                                                                                                                                                                                                                                                                                                                 Current action
                                                                                                                                                                                                                                                                                                                                    ↓
                                                                                                                                                                                                                                                                                                                                    Context
                                                                                                                                                                                                                                                                                                                                       ↓
                                                                                                                                                                                                                                                                                                                                       Decision
                                                                                                                                                                                                                                                                                                                                          ↓
                                                                                                                                                                                                                                                                                                                                          Next action appears when required

                                                                                                                                                                                                                                                                                                                                          The portal can expose richer operational views because it is intended for organizational administration and reporting.

                                                                                                                                                                                                                                                                                                                                          ---

                                                                                                                                                                                                                                                                                                                                          12. SSI inside workflows

                                                                                                                                                                                                                                                                                                                                          SSI should appear only when the workflow requires trust or evidence.

                                                                                                                                                                                                                                                                                                                                          Example:

                                                                                                                                                                                                                                                                                                                                          Approve Supplier

                                                                                                                                                                                                                                                                                                                                          Supplier Identity
                                                                                                                                                                                                                                                                                                                                          ✓ Verified

                                                                                                                                                                                                                                                                                                                                          Organization membership
                                                                                                                                                                                                                                                                                                                                          ✓ Valid

                                                                                                                                                                                                                                                                                                                                          Business credential
                                                                                                                                                                                                                                                                                                                                          ✓ Issued by trusted registry

                                                                                                                                                                                                                                                                                                                                          Credential status
                                                                                                                                                                                                                                                                                                                                          ✓ Active

                                                                                                                                                                                                                                                                                                                                          Presentation
                                                                                                                                                                                                                                                                                                                                          ✓ Verified

                                                                                                                                                                                                                                                                                                                                          Business authorization
                                                                                                                                                                                                                                                                                                                                          ✓ Supplier is eligible

                                                                                                                                                                                                                                                                                                                                          [Continue]

                                                                                                                                                                                                                                                                                                                                          Avoid exposing protocol jargon such as:

                                                                                                                                                                                                                                                                                                                                          DCQL
                                                                                                                                                                                                                                                                                                                                          OID4VP
                                                                                                                                                                                                                                                                                                                                          JWT VC
                                                                                                                                                                                                                                                                                                                                          SD-JWT
                                                                                                                                                                                                                                                                                                                                          DIDComm
                                                                                                                                                                                                                                                                                                                                          nonce
                                                                                                                                                                                                                                                                                                                                          presentation definition

                                                                                                                                                                                                                                                                                                                                          unless the user is in an advanced diagnostic/admin area.

                                                                                                                                                                                                                                                                                                                                          The normal user needs:

                                                                                                                                                                                                                                                                                                                                          «“Verified supplier identity”»

                                                                                                                                                                                                                                                                                                                                          not:

                                                                                                                                                                                                                                                                                                                                          «“DCQL query succeeded.”»

                                                                                                                                                                                                                                                                                                                                          ---

                                                                                                                                                                                                                                                                                                                                          13. Wallet integration

                                                                                                                                                                                                                                                                                                                                          Wallet is a private capability, not the business application's master record.

                                                                                                                                                                                                                                                                                                                                          Wallet screens:

                                                                                                                                                                                                                                                                                                                                          My Wallet

                                                                                                                                                                                                                                                                                                                                          Credentials
                                                                                                                                                                                                                                                                                                                                          ────────────
                                                                                                                                                                                                                                                                                                                                          Employee Credential
                                                                                                                                                                                                                                                                                                                                          Supplier Credential
                                                                                                                                                                                                                                                                                                                                          Professional License
                                                                                                                                                                                                                                                                                                                                          Student Credential

                                                                                                                                                                                                                                                                                                                                          Identity
                                                                                                                                                                                                                                                                                                                                          ────────
                                                                                                                                                                                                                                                                                                                                          My DID

                                                                                                                                                                                                                                                                                                                                          Activity
                                                                                                                                                                                                                                                                                                                                          ────────
                                                                                                                                                                                                                                                                                                                                          Presentations
                                                                                                                                                                                                                                                                                                                                          Credential requests

                                                                                                                                                                                                                                                                                                                                          When a workflow needs a credential:

                                                                                                                                                                                                                                                                                                                                          Requisition
                                                                                                                                                                                                                                                                                                                                             ↓
                                                                                                                                                                                                                                                                                                                                             Supplier verification required
                                                                                                                                                                                                                                                                                                                                                ↓
                                                                                                                                                                                                                                                                                                                                                [Present credential]
                                                                                                                                                                                                                                                                                                                                                   ↓
                                                                                                                                                                                                                                                                                                                                                   Wallet opens
                                                                                                                                                                                                                                                                                                                                                      ↓
                                                                                                                                                                                                                                                                                                                                                      User reviews requested information
                                                                                                                                                                                                                                                                                                                                                         ↓
                                                                                                                                                                                                                                                                                                                                                         [Approve disclosure]
                                                                                                                                                                                                                                                                                                                                                            ↓
                                                                                                                                                                                                                                                                                                                                                            Presentation generated
                                                                                                                                                                                                                                                                                                                                                               ↓
                                                                                                                                                                                                                                                                                                                                                               Return to workflow

                                                                                                                                                                                                                                                                                                                                                               The user should feel as though the wallet temporarily assists the workflow.

                                                                                                                                                                                                                                                                                                                                                               It should not feel like they have left the business application completely.

                                                                                                                                                                                                                                                                                                                                                               ---

                                                                                                                                                                                                                                                                                                                                                               14. Consent UX

                                                                                                                                                                                                                                                                                                                                                               Consent should be explicit.

                                                                                                                                                                                                                                                                                                                                                               Example:

                                                                                                                                                                                                                                                                                                                                                               Credential information requested

                                                                                                                                                                                                                                                                                                                                                               Finance Department wants to verify:

                                                                                                                                                                                                                                                                                                                                                               ✓ Organization name
                                                                                                                                                                                                                                                                                                                                                               ✓ Registration number
                                                                                                                                                                                                                                                                                                                                                               ✓ Authorized representative

                                                                                                                                                                                                                                                                                                                                                               Purpose:
                                                                                                                                                                                                                                                                                                                                                               Supplier onboarding

                                                                                                                                                                                                                                                                                                                                                               This information will be used for:
                                                                                                                                                                                                                                                                                                                                                               Supplier verification

                                                                                                                                                                                                                                                                                                                                                               Expires:
                                                                                                                                                                                                                                                                                                                                                               30 September 2026

                                                                                                                                                                                                                                                                                                                                                               [Decline]
                                                                                                                                                                                                                                                                                                                                                               [Approve & Present]

                                                                                                                                                                                                                                                                                                                                                               Consent should then return the user directly to the workflow.

                                                                                                                                                                                                                                                                                                                                                               The platform already has consent actions and workflow integration concepts; the UI should expose the human-readable version of that model.

                                                                                                                                                                                                                                                                                                                                                               ---

                                                                                                                                                                                                                                                                                                                                                               15. Evidence UX

                                                                                                                                                                                                                                                                                                                                                               Evidence should be displayed as contextual proof.

                                                                                                                                                                                                                                                                                                                                                               Example:

                                                                                                                                                                                                                                                                                                                                                               Evidence

                                                                                                                                                                                                                                                                                                                                                               Purchase Invoice
                                                                                                                                                                                                                                                                                                                                                               ✓ Validated

                                                                                                                                                                                                                                                                                                                                                               Payment Proof
                                                                                                                                                                                                                                                                                                                                                               ✓ Verified

                                                                                                                                                                                                                                                                                                                                                               Supplier Credential
                                                                                                                                                                                                                                                                                                                                                               ✓ Current

                                                                                                                                                                                                                                                                                                                                                               Presentation
                                                                                                                                                                                                                                                                                                                                                               ✓ Verified

                                                                                                                                                                                                                                                                                                                                                               [View evidence]

                                                                                                                                                                                                                                                                                                                                                               Do not turn the evidence screen into a technical repository browser.

                                                                                                                                                                                                                                                                                                                                                               Users need confidence and provenance, not raw protocol material.

                                                                                                                                                                                                                                                                                                                                                               ---

                                                                                                                                                                                                                                                                                                                                                               16. Workflow progress indicator

                                                                                                                                                                                                                                                                                                                                                               Every multi-step business workflow should support a visual progress indicator.

                                                                                                                                                                                                                                                                                                                                                               Example:

                                                                                                                                                                                                                                                                                                                                                               REQUEST
                                                                                                                                                                                                                                                                                                                                                                 ✓

                                                                                                                                                                                                                                                                                                                                                                 REVIEW
                                                                                                                                                                                                                                                                                                                                                                   ✓

                                                                                                                                                                                                                                                                                                                                                                   APPROVAL
                                                                                                                                                                                                                                                                                                                                                                     ● YOU ARE HERE

                                                                                                                                                                                                                                                                                                                                                                     FULFILMENT
                                                                                                                                                                                                                                                                                                                                                                       ○

                                                                                                                                                                                                                                                                                                                                                                       VERIFICATION
                                                                                                                                                                                                                                                                                                                                                                         ○

                                                                                                                                                                                                                                                                                                                                                                         COMPLETE
                                                                                                                                                                                                                                                                                                                                                                           ○

                                                                                                                                                                                                                                                                                                                                                                           For a long workflow, collapse completed stages.

                                                                                                                                                                                                                                                                                                                                                                           The active stage should be visually dominant.

                                                                                                                                                                                                                                                                                                                                                                           ---

                                                                                                                                                                                                                                                                                                                                                                           17. Notifications
                                                                                                                                                                                                                                                                                                                                                                           Notifications should deep-link directly into the relevant inbox item.

                                                                                                                                                                                                                                                                                                                                                                           Example:

                                                                                                                                                                                                                                                                                                                                                                           Credentis

                                                                                                                                                                                                                                                                                                                                                                           Requisition approval required

                                                                                                                                                                                                                                                                                                                                                                           John submitted a USD 4,200
                                                                                                                                                                                                                                                                                                                                                                           equipment requisition.

                                                                                                                                                                                                                                                                                                                                                                           [Review now]

                                                                                                                                                                                                                                                                                                                                                                           Opening notification:

                                                                                                                                                                                                                                                                                                                                                                           → /inbox/{itemId}

                                                                                                                                                                                                                                                                                                                                                                           Never:

                                                                                                                                                                                                                                                                                                                                                                           notification
                                                                                                                                                                                                                                                                                                                                                                           → dashboard
                                                                                                                                                                                                                                                                                                                                                                           → workflow
                                                                                                                                                                                                                                                                                                                                                                           → requisition
                                                                                                                                                                                                                                                                                                                                                                           → approval

                                                                                                                                                                                                                                                                                                                                                                           The notification should take the user directly to the action.

                                                                                                                                                                                                                                                                                                                                                                           ---

                                                                                                                                                                                                                                                                                                                                                                           18. Mobile bottom navigation

                                                                                                                                                                                                                                                                                                                                                                           Recommended:

                                                                                                                                                                                                                                                                                                                                                                           ┌──────────────────────────────────┐
                                                                                                                                                                                                                                                                                                                                                                           │                                  │
                                                                                                                                                                                                                                                                                                                                                                           │          CURRENT SCREEN          │
                                                                                                                                                                                                                                                                                                                                                                           │                                  │
                                                                                                                                                                                                                                                                                                                                                                           ├──────────────────────────────────┤
                                                                                                                                                                                                                                                                                                                                                                           │  Inbox   Scan   Wallet   Profile │
                                                                                                                                                                                                                                                                                                                                                                           └──────────────────────────────────┘

                                                                                                                                                                                                                                                                                                                                                                           Inbox receives the strongest emphasis.

                                                                                                                                                                                                                                                                                                                                                                           A badge can show:

                                                                                                                                                                                                                                                                                                                                                                           Inbox ④

                                                                                                                                                                                                                                                                                                                                                                           Scan should be universal:

                                                                                                                                                                                                                                                                                                                                                                           Scan
                                                                                                                                                                                                                                                                                                                                                                            ├── Credential offer
                                                                                                                                                                                                                                                                                                                                                                             ├── Presentation request
                                                                                                                                                                                                                                                                                                                                                                              ├── Workflow/action link
                                                                                                                                                                                                                                                                                                                                                                               ├── Evidence request
                                                                                                                                                                                                                                                                                                                                                                                └── Organization QR

                                                                                                                                                                                                                                                                                                                                                                                Do not create multiple competing scanning experiences.

                                                                                                                                                                                                                                                                                                                                                                                ---

                                                                                                                                                                                                                                                                                                                                                                                19. Portal UI architecture

                                                                                                                                                                                                                                                                                                                                                                                The web portal should complement the mobile inbox rather than duplicate it.

                                                                                                                                                                                                                                                                                                                                                                                Portal navigation

                                                                                                                                                                                                                                                                                                                                                                                Dashboard

                                                                                                                                                                                                                                                                                                                                                                                Work
                                                                                                                                                                                                                                                                                                                                                                                ├── Inbox / My actions
                                                                                                                                                                                                                                                                                                                                                                                ├── Requests
                                                                                                                                                                                                                                                                                                                                                                                ├── Approvals
                                                                                                                                                                                                                                                                                                                                                                                ├── Tasks
                                                                                                                                                                                                                                                                                                                                                                                └── Workflows

                                                                                                                                                                                                                                                                                                                                                                                Operations
                                                                                                                                                                                                                                                                                                                                                                                ├── Finance
                                                                                                                                                                                                                                                                                                                                                                                ├── Procurement
                                                                                                                                                                                                                                                                                                                                                                                ├── HR
                                                                                                                                                                                                                                                                                                                                                                                └── Field Operations

                                                                                                                                                                                                                                                                                                                                                                                Trust & Evidence
                                                                                                                                                                                                                                                                                                                                                                                ├── Credentials
                                                                                                                                                                                                                                                                                                                                                                                ├── Verification
                                                                                                                                                                                                                                                                                                                                                                                ├── Evidence
                                                                                                                                                                                                                                                                                                                                                                                └── Trusted issuers

                                                                                                                                                                                                                                                                                                                                                                                Organization
                                                                                                                                                                                                                                                                                                                                                                                ├── People
                                                                                                                                                                                                                                                                                                                                                                                ├── Departments
                                                                                                                                                                                                                                                                                                                                                                                ├── Roles
                                                                                                                                                                                                                                                                                                                                                                                ├── Authorities
                                                                                                                                                                                                                                                                                                                                                                                ├── Delegations
                                                                                                                                                                                                                                                                                                                                                                                └── Audit

                                                                                                                                                                                                                                                                                                                                                                                Settings

                                                                                                                                                                                                                                                                                                                                                                                The important distinction is:

                                                                                                                                                                                                                                                                                                                                                                                Mobile = execute actions

                                                                                                                                                                                                                                                                                                                                                                                Portal = manage, monitor, configure and analyze

                                                                                                                                                                                                                                                                                                                                                                                The portal may expose richer lists and administrative tables without forcing those concepts onto mobile.

                                                                                                                                                                                                                                                                                                                                                                                ---

                                                                                                                                                                                                                                                                                                                                                                                20. Portal dashboard

                                                                                                                                                                                                                                                                                                                                                                                The remodelled portal dashboard should stop presenting the product primarily as a credential/commerce demo.

                                                                                                                                                                                                                                                                                                                                                                                Current workflow UI is still explicitly framed around “Issuance Workflows” and directly executes workflows using "/agent/token" and "/workflows/{id}/execute"; that should become an organizational workflow surface rather than the main product metaphor.

                                                                                                                                                                                                                                                                                                                                                                                Recommended dashboard:

                                                                                                                                                                                                                                                                                                                                                                                Good morning

                                                                                                                                                                                                                                                                                                                                                                                Credentis Organization

                                                                                                                                                                                                                                                                                                                                                                                ────────────────────────

                                                                                                                                                                                                                                                                                                                                                                                82
                                                                                                                                                                                                                                                                                                                                                                                Active requests

                                                                                                                                                                                                                                                                                                                                                                                14
                                                                                                                                                                                                                                                                                                                                                                                Awaiting approval

                                                                                                                                                                                                                                                                                                                                                                                7
                                                                                                                                                                                                                                                                                                                                                                                Tasks due today

                                                                                                                                                                                                                                                                                                                                                                                3
                                                                                                                                                                                                                                                                                                                                                                                Exceptions

                                                                                                                                                                                                                                                                                                                                                                                ────────────────────────

                                                                                                                                                                                                                                                                                                                                                                                My work

                                                                                                                                                                                                                                                                                                                                                                                14 approvals
                                                                                                                                                                                                                                                                                                                                                                                7 assigned tasks
                                                                                                                                                                                                                                                                                                                                                                                2 information requests

                                                                                                                                                                                                                                                                                                                                                                                ────────────────────────

                                                                                                                                                                                                                                                                                                                                                                                Operations

                                                                                                                                                                                                                                                                                                                                                                                Finance
                                                                                                                                                                                                                                                                                                                                                                                $38,200 pending

                                                                                                                                                                                                                                                                                                                                                                                Procurement
                                                                                                                                                                                                                                                                                                                                                                                12 active requisitions

                                                                                                                                                                                                                                                                                                                                                                                HR
                                                                                                                                                                                                                                                                                                                                                                                4 onboarding cases

                                                                                                                                                                                                                                                                                                                                                                                ────────────────────────

                                                                                                                                                                                                                                                                                                                                                                                Trust

                                                                                                                                                                                                                                                                                                                                                                                98.2% verified requests
                                                                                                                                                                                                                                                                                                                                                                                2 credentials expiring
                                                                                                                                                                                                                                                                                                                                                                                1 trusted issuer warning

                                                                                                                                                                                                                                                                                                                                                                                This immediately communicates:

                                                                                                                                                                                                                                                                                                                                                                                organizational work + trust

                                                                                                                                                                                                                                                                                                                                                                                rather than:

                                                                                                                                                                                                                                                                                                                                                                                credential issuance

                                                                                                                                                                                                                                                                                                                                                                                ---

                                                                                                                                                                                                                                                                                                                                                                                21. Request creation UX

                                                                                                                                                                                                                                                                                                                                                                                Request creation should be guided.

                                                                                                                                                                                                                                                                                                                                                                                Example:

                                                                                                                                                                                                                                                                                                                                                                                Create request

                                                                                                                                                                                                                                                                                                                                                                                What do you need?

                                                                                                                                                                                                                                                                                                                                                                                [ Purchase something ]
                                                                                                                                                                                                                                                                                                                                                                                [ Make a payment ]
                                                                                                                                                                                                                                                                                                                                                                                [ Onboard a person ]
                                                                                                                                                                                                                                                                                                                                                                                [ Verify a supplier ]
                                                                                                                                                                                                                                                                                                                                                                                [ Request access ]
                                                                                                                                                                                                                                                                                                                                                                                [ Other ]

                                                                                                                                                                                                                                                                                                                                                                                Then the appropriate form appears.

                                                                                                                                                                                                                                                                                                                                                                                For requisition:

                                                                                                                                                                                                                                                                                                                                                                                Requisition

                                                                                                                                                                                                                                                                                                                                                                                Department
                                                                                                                                                                                                                                                                                                                                                                                Cost centre
                                                                                                                                                                                                                                                                                                                                                                                Required date

                                                                                                                                                                                                                                                                                                                                                                                Items
                                                                                                                                                                                                                                                                                                                                                                                ────────────────
                                                                                                                                                                                                                                                                                                                                                                                Laptop × 4
                                                                                                                                                                                                                                                                                                                                                                                Monitor × 2
                                                                                                                                                                                                                                                                                                                                                                                Printer × 1

                                                                                                                                                                                                                                                                                                                                                                                Estimated amount
                                                                                                                                                                                                                                                                                                                                                                                USD 4,200

                                                                                                                                                                                                                                                                                                                                                                                Supporting evidence
                                                                                                                                                                                                                                                                                                                                                                                [Add]

                                                                                                                                                                                                                                                                                                                                                                                [Save draft]
                                                                                                                                                                                                                                                                                                                                                                                [Submit]

                                                                                                                                                                                                                                                                                                                                                                                The user should not need to know which workflow will process the request.

                                                                                                                                                                                                                                                                                                                                                                                The platform selects or routes the appropriate workflow.

                                                                                                                                                                                                                                                                                                                                                                                ---

                                                                                                                                                                                                                                                                                                                                                                                22. Backend/UI contract

                                                                                                                                                                                                                                                                                                                                                                                The UI should consume generalized objects such as:

                                                                                                                                                                                                                                                                                                                                                                                {
                                                                                                                                                                                                                                                                                                                                                                                  id,
                                                                                                                                                                                                                                                                                                                                                                                    type,
                                                                                                                                                                                                                                                                                                                                                                                      requestId,
                                                                                                                                                                                                                                                                                                                                                                                        title,
                                                                                                                                                                                                                                                                                                                                                                                          summary,
                                                                                                                                                                                                                                                                                                                                                                                            status,
                                                                                                                                                                                                                                                                                                                                                                                              priority,
                                                                                                                                                                                                                                                                                                                                                                                                createdAt,
                                                                                                                                                                                                                                                                                                                                                                                                  dueAt,
                                                                                                                                                                                                                                                                                                                                                                                                    context,
                                                                                                                                                                                                                                                                                                                                                                                                      requiredAction,
                                                                                                                                                                                                                                                                                                                                                                                                        availableActions,
                                                                                                                                                                                                                                                                                                                                                                                                          evidence,
                                                                                                                                                                                                                                                                                                                                                                                                            trust,
                                                                                                                                                                                                                                                                                                                                                                                                              workflow
                                                                                                                                                                                                                                                                                                                                                                                }

                                                                                                                                                                                                                                                                                                                                                                                This is the UI model.

                                                                                                                                                                                                                                                                                                                                                                                The backend remains authoritative for:

                                                                                                                                                                                                                                                                                                                                                                                authorization
                                                                                                                                                                                                                                                                                                                                                                                request state
                                                                                                                                                                                                                                                                                                                                                                                workflow state
                                                                                                                                                                                                                                                                                                                                                                                task assignment
                                                                                                                                                                                                                                                                                                                                                                                policy decisions
                                                                                                                                                                                                                                                                                                                                                                                trust decisions
                                                                                                                                                                                                                                                                                                                                                                                evidence validity
                                                                                                                                                                                                                                                                                                                                                                                credential status
                                                                                                                                                                                                                                                                                                                                                                                audit

                                                                                                                                                                                                                                                                                                                                                                                The client must never decide:

                                                                                                                                                                                                                                                                                                                                                                                "show Approve because user has Manager credential"

                                                                                                                                                                                                                                                                                                                                                                                Instead:

                                                                                                                                                                                                                                                                                                                                                                                backend
                                                                                                                                                                                                                                                                                                                                                                                → authorized actions

                                                                                                                                                                                                                                                                                                                                                                                UI
                                                                                                                                                                                                                                                                                                                                                                                → renders those actions

                                                                                                                                                                                                                                                                                                                                                                                ---

                                                                                                                                                                                                                                                                                                                                                                                23. Error states

                                                                                                                                                                                                                                                                                                                                                                                Every action-oriented screen should have clear state handling.

                                                                                                                                                                                                                                                                                                                                                                                Loading

                                                                                                                                                                                                                                                                                                                                                                                Loading request...

                                                                                                                                                                                                                                                                                                                                                                                Awaiting backend

                                                                                                                                                                                                                                                                                                                                                                                Processing approval...

                                                                                                                                                                                                                                                                                                                                                                                Authorization denied

                                                                                                                                                                                                                                                                                                                                                                                You cannot approve this request.

                                                                                                                                                                                                                                                                                                                                                                                Your current authority does not permit
                                                                                                                                                                                                                                                                                                                                                                                approval for this amount or department.

                                                                                                                                                                                                                                                                                                                                                                                [Back]

                                                                                                                                                                                                                                                                                                                                                                                Credential problem

                                                                                                                                                                                                                                                                                                                                                                                Verification could not be completed.

                                                                                                                                                                                                                                                                                                                                                                                The supplier credential is expired.

                                                                                                                                                                                                                                                                                                                                                                                [Review details]
                                                                                                                                                                                                                                                                                                                                                                                [Try again]

                                                                                                                                                                                                                                                                                                                                                                                Workflow failure

                                                                                                                                                                                                                                                                                                                                                                                This request could not continue.

                                                                                                                                                                                                                                                                                                                                                                                No action was completed.

                                                                                                                                                                                                                                                                                                                                                                                Reference:
                                                                                                                                                                                                                                                                                                                                                                                REQ-2026-00142

                                                                                                                                                                                                                                                                                                                                                                                [Retry]
                                                                                                                                                                                                                                                                                                                                                                                [Contact administrator]

                                                                                                                                                                                                                                                                                                                                                                                Never expose raw exceptions, stack traces or protocol errors to ordinary users.

                                                                                                                                                                                                                                                                                                                                                                                ---

                                                                                                                                                                                                                                                                                                                                                                                24. Status language

                                                                                                                                                                                                                                                                                                                                                                                Use business language instead of technical workflow language.

                                                                                                                                                                                                                                                                                                                                                                                Backend concept| UI language
                                                                                                                                                                                                                                                                                                                                                                                "draft"| Draft
                                                                                                                                                                                                                                                                                                                                                                                "submitted"| Submitted
                                                                                                                                                                                                                                                                                                                                                                                "in_review"| Under review
                                                                                                                                                                                                                                                                                                                                                                                "approved"| Approved
                                                                                                                                                                                                                                                                                                                                                                                "rejected"| Rejected
                                                                                                                                                                                                                                                                                                                                                                                "in_fulfilment"| In progress
                                                                                                                                                                                                                                                                                                                                                                                "completed"| Completed
                                                                                                                                                                                                                                                                                                                                                                                "cancelled"| Cancelled
                                                                                                                                                                                                                                                                                                                                                                                pending task| Action required
                                                                                                                                                                                                                                                                                                                                                                                workflow paused| Waiting for action
                                                                                                                                                                                                                                                                                                                                                                                credential verified| Identity verified
                                                                                                                                                                                                                                                                                                                                                                                credential status valid| Credential current
                                                                                                                                                                                                                                                                                                                                                                                authorization allow| Authorized
                                                                                                                                                                                                                                                                                                                                                                                authorization deny| Not authorized

                                                                                                                                                                                                                                                                                                                                                                                ---

                                                                                                                                                                                                                                                                                                                                                                                25. Visual design direction

                                                                                                                                                                                                                                                                                                                                                                                Use the existing MUI/Material design language rather than replacing the UI framework.

                                                                                                                                                                                                                                                                                                                                                                                The remodel should feel:

                                                                                                                                                                                                                                                                                                                                                                                professional + trustworthy + operational + calm

                                                                                                                                                                                                                                                                                                                                                                                not:

                                                                                                                                                                                                                                                                                                                                                                                blockchain-heavy + crypto-oriented + developer-centric

                                                                                                                                                                                                                                                                                                                                                                                Cards

                                                                                                                                                                                                                                                                                                                                                                                Use cards for:

                                                                                                                                                                                                                                                                                                                                                                                - inbox items
                                                                                                                                                                                                                                                                                                                                                                                - KPIs
                                                                                                                                                                                                                                                                                                                                                                                - trust summaries
                                                                                                                                                                                                                                                                                                                                                                                - workflow progress
                                                                                                                                                                                                                                                                                                                                                                                - evidence

                                                                                                                                                                                                                                                                                                                                                                                Tables

                                                                                                                                                                                                                                                                                                                                                                                Use tables in the portal for:

                                                                                                                                                                                                                                                                                                                                                                                - request lists
                                                                                                                                                                                                                                                                                                                                                                                - approvals
                                                                                                                                                                                                                                                                                                                                                                                - transactions
                                                                                                                                                                                                                                                                                                                                                                                - suppliers
                                                                                                                                                                                                                                                                                                                                                                                - people
                                                                                                                                                                                                                                                                                                                                                                                - audit records

                                                                                                                                                                                                                                                                                                                                                                                Mobile

                                                                                                                                                                                                                                                                                                                                                                                Prefer:

                                                                                                                                                                                                                                                                                                                                                                                - large touch targets
                                                                                                                                                                                                                                                                                                                                                                                - bottom sheets
                                                                                                                                                                                                                                                                                                                                                                                - concise context
                                                                                                                                                                                                                                                                                                                                                                                - clear primary actions
                                                                                                                                                                                                                                                                                                                                                                                - one decision per screen

                                                                                                                                                                                                                                                                                                                                                                                ---

                                                                                                                                                                                                                                                                                                                                                                                26. The single most important reusable component

                                                                                                                                                                                                                                                                                                                                                                                Create a reusable:

                                                                                                                                                                                                                                                                                                                                                                                InboxActionScreen

                                                                                                                                                                                                                                                                                                                                                                                It should accept a workflow item and dynamically render:

                                                                                                                                                                                                                                                                                                                                                                                Header
                                                                                                                                                                                                                                                                                                                                                                                ↓
                                                                                                                                                                                                                                                                                                                                                                                Status
                                                                                                                                                                                                                                                                                                                                                                                ↓
                                                                                                                                                                                                                                                                                                                                                                                Context
                                                                                                                                                                                                                                                                                                                                                                                ↓
                                                                                                                                                                                                                                                                                                                                                                                Business information
                                                                                                                                                                                                                                                                                                                                                                                ↓
                                                                                                                                                                                                                                                                                                                                                                                Trust/evidence
                                                                                                                                                                                                                                                                                                                                                                                ↓
                                                                                                                                                                                                                                                                                                                                                                                Workflow progress
                                                                                                                                                                                                                                                                                                                                                                                ↓
                                                                                                                                                                                                                                                                                                                                                                                Available action
                                                                                                                                                                                                                                                                                                                                                                                ↓
                                                                                                                                                                                                                                                                                                                                                                                Confirmation
                                                                                                                                                                                                                                                                                                                                                                                ↓
                                                                                                                                                                                                                                                                                                                                                                                Outcome

                                                                                                                                                                                                                                                                                                                                                                                Conceptually:

                                                                                                                                                                                                                                                                                                                                                                                <InboxActionScreen
                                                                                                                                                                                                                                                                                                                                                                                  item={item}
                                                                                                                                                                                                                                                                                                                                                                                    onAction={handleAction}
                                                                                                                                                                                                                                                                                                                                                                                    />

                                                                                                                                                                                                                                                                                                                                                                                    The component should support:

                                                                                                                                                                                                                                                                                                                                                                                    approval
                                                                                                                                                                                                                                                                                                                                                                                    review
                                                                                                                                                                                                                                                                                                                                                                                    task completion
                                                                                                                                                                                                                                                                                                                                                                                    consent
                                                                                                                                                                                                                                                                                                                                                                                    credential presentation
                                                                                                                                                                                                                                                                                                                                                                                    evidence submission
                                                                                                                                                                                                                                                                                                                                                                                    information request
                                                                                                                                                                                                                                                                                                                                                                                    payment
                                                                                                                                                                                                                                                                                                                                                                                    verification

                                                                                                                                                                                                                                                                                                                                                                                    This is the key reusable surface of the remodel.

                                                                                                                                                                                                                                                                                                                                                                                    ---

                                                                                                                                                                                                                                                                                                                                                                                    27. Workflow-specific UI should be configuration-driven

                                                                                                                                                                                                                                                                                                                                                                                    Do not create:

                                                                                                                                                                                                                                                                                                                                                                                    SchoolFeesApprovalScreen.vue
                                                                                                                                                                                                                                                                                                                                                                                    RequisitionApprovalScreen.vue
                                                                                                                                                                                                                                                                                                                                                                                    SupplierApprovalScreen.vue
                                                                                                                                                                                                                                                                                                                                                                                    PaymentApprovalScreen.vue

                                                                                                                                                                                                                                                                                                                                                                                    as completely unrelated screens.

                                                                                                                                                                                                                                                                                                                                                                                    Instead:

                                                                                                                                                                                                                                                                                                                                                                                    InboxActionScreen
                                                                                                                                                                                                                                                                                                                                                                                            +
                                                                                                                                                                                                                                                                                                                                                                                            workflow/item configuration

                                                                                                                                                                                                                                                                                                                                                                                            Example:

                                                                                                                                                                                                                                                                                                                                                                                            {
                                                                                                                                                                                                                                                                                                                                                                                                  type: "requisition.approval",
                                                                                                                                                                                                                                                                                                                                                                                                    title: "Approve requisition",
                                                                                                                                                                                                                                                                                                                                                                                                      sections: [
                                                                                                                                                                                                                                                                                                                                                                                                            "requester",
                                                                                                                                                                                                                                                                                                                                                                                                                "department",
                                                                                                                                                                                                                                                                                                                                                                                                                    "items",
                                                                                                                                                                                                                                                                                                                                                                                                                        "amount",
                                                                                                                                                                                                                                                                                                                                                                                                                            "evidence",
                                                                                                                                                                                                                                                                                                                                                                                                                                "trust",
                                                                                                                                                                                                                                                                                                                                                                                                                                    "workflow"
                                                                                                                                                                                                                                                                                                                                                                                                      ],
                                                                                                                                                                                                                                                                                                                                                                                                        actions: [
                                                                                                                                                                                                                                                                                                                                                                                                                    "approve",
                                                                                                                                                                                                                                                                                                                                                                                                                        "reject",
                                                                                                                                                                                                                                                                                                                                                                                                                            "request_changes"
                                                                                                                                                                                                                                                                                                                                                                                                        ]
                                                                                                                                                                                                                                                                                                                                                                                                        }

                                                                                                                                                                                                                                                                                                                                                                                                        Then:

                                                                                                                                                                                                                                                                                                                                                                                                        {
                                                                                                                                                                                                                                                                                                                                                                                                          type: "school_fee.payment",
                                                                                                                                                                                                                                                                                                                                                                                                            sections: [
                                                                                                                                                                                                                                                                                                                                                                                                                    "student",
                                                                                                                                                                                                                                                                                                                                                                                                                        "school",
                                                                                                                                                                                                                                                                                                                                                                                                                            "period",
                                                                                                                                                                                                                                                                                                                                                                                                                                "amount",
                                                                                                                                                                                                                                                                                                                                                                                                                                    "payment_method",
                                                                                                                                                                                                                                                                                                                                                                                                                                        "evidence"
                                                                                                                                                                                                                                                                                                                                                                                                                                          ],
                                                                                                                                                                                                                                                                                                                                                                                                                                            actions: [
                                                                                                                                                                                                                                                                                                                                                                                                                                                    "pay",
                                                                                                                                                                                                                                                                                                                                                                                                                                                        "decline"
                                                                                                                                                                                                                                                                                                                                                                                                                                            ]
                                                                                                                                                                                                                                                                                                                                                                                                                                            }

                                                                                                                                                                                                                                                                                                                                                                                                                                            Same UX framework.

                                                                                                                                                                                                                                                                                                                                                                                                                                            Different business configuration.

                                                                                                                                                                                                                                                                                                                                                                                                                                            ---

                                                                                                                                                                                                                                                                                                                                                                                                                                            28. Remodel sequence

                                                                                                                                                                                                                                                                                                                                                                                                                                            Phase 1 — Preserve

                                                                                                                                                                                                                                                                                                                                                                                                                                            Preserve the existing working inbox flow exactly as the UX foundation.

                                                                                                                                                                                                                                                                                                                                                                                                                                            Do not redesign the established interaction model.

                                                                                                                                                                                                                                                                                                                                                                                                                                            Phase 2 — Generalize

                                                                                                                                                                                                                                                                                                                                                                                                                                            Extract reusable:

                                                                                                                                                                                                                                                                                                                                                                                                                                            Inbox
                                                                                                                                                                                                                                                                                                                                                                                                                                            InboxItem
                                                                                                                                                                                                                                                                                                                                                                                                                                            InboxActionScreen
                                                                                                                                                                                                                                                                                                                                                                                                                                            ActionBar
                                                                                                                                                                                                                                                                                                                                                                                                                                            ApprovalSheet
                                                                                                                                                                                                                                                                                                                                                                                                                                            EvidencePanel
                                                                                                                                                                                                                                                                                                                                                                                                                                            TrustPanel
                                                                                                                                                                                                                                                                                                                                                                                                                                            WorkflowProgress
                                                                                                                                                                                                                                                                                                                                                                                                                                            OutcomePanel

                                                                                                                                                                                                                                                                                                                                                                                                                                            Phase 3 — Connect to platform APIs

                                                                                                                                                                                                                                                                                                                                                                                                                                            Connect those components to:

                                                                                                                                                                                                                                                                                                                                                                                                                                            requests
                                                                                                                                                                                                                                                                                                                                                                                                                                            tasks
                                                                                                                                                                                                                                                                                                                                                                                                                                            workflow runs
                                                                                                                                                                                                                                                                                                                                                                                                                                            authorization
                                                                                                                                                                                                                                                                                                                                                                                                                                            policy decisions
                                                                                                                                                                                                                                                                                                                                                                                                                                            evidence
                                                                                                                                                                                                                                                                                                                                                                                                                                            trust
                                                                                                                                                                                                                                                                                                                                                                                                                                            consent

                                                                                                                                                                                                                                                                                                                                                                                                                                            Phase 4 — Embed SSI

                                                                                                                                                                                                                                                                                                                                                                                                                                            Only invoke wallet/SSI when a workflow requires:

                                                                                                                                                                                                                                                                                                                                                                                                                                            credential
                                                                                                                                                                                                                                                                                                                                                                                                                                            presentation
                                                                                                                                                                                                                                                                                                                                                                                                                                            consent
                                                                                                                                                                                                                                                                                                                                                                                                                                            identity evidence
                                                                                                                                                                                                                                                                                                                                                                                                                                            trust verification

                                                                                                                                                                                                                                                                                                                                                                                                                                            Phase 5 — Business modules

                                                                                                                                                                                                                                                                                                                                                                                                                                            Add:

                                                                                                                                                                                                                                                                                                                                                                                                                                            Finance
                                                                                                                                                                                                                                                                                                                                                                                                                                            Procurement
                                                                                                                                                                                                                                                                                                                                                                                                                                            HR
                                                                                                                                                                                                                                                                                                                                                                                                                                            Field Operations

                                                                                                                                                                                                                                                                                                                                                                                                                                            using the same inbox/action primitives.

                                                                                                                                                                                                                                                                                                                                                                                                                                            Phase 6 — Advanced automation

                                                                                                                                                                                                                                                                                                                                                                                                                                            Then add:

                                                                                                                                                                                                                                                                                                                                                                                                                                            workflow automation
                                                                                                                                                                                                                                                                                                                                                                                                                                            provider integrations
                                                                                                                                                                                                                                                                                                                                                                                                                                            EcoCash
                                                                                                                                                                                                                                                                                                                                                                                                                                            notifications
                                                                                                                                                                                                                                                                                                                                                                                                                                            AI assistance
                                                                                                                                                                                                                                                                                                                                                                                                                                            analytics

                                                                                                                                                                                                                                                                                                                                                                                                                                            ---

                                                                                                                                                                                                                                                                                                                                                                                                                                            29. Final target experience

                                                                                                                                                                                                                                                                                                                                                                                                                                            The finished product should allow this:

                                                                                                                                                                                                                                                                                                                                                                                                                                            Example A — Requisition

                                                                                                                                                                                                                                                                                                                                                                                                                                            Notification
                                                                                                                                                                                                                                                                                                                                                                                                                                               ↓
                                                                                                                                                                                                                                                                                                                                                                                                                                               Inbox
                                                                                                                                                                                                                                                                                                                                                                                                                                                  ↓
                                                                                                                                                                                                                                                                                                                                                                                                                                                  Approve requisition
                                                                                                                                                                                                                                                                                                                                                                                                                                                     ↓
                                                                                                                                                                                                                                                                                                                                                                                                                                                     Review details
                                                                                                                                                                                                                                                                                                                                                                                                                                                        ↓
                                                                                                                                                                                                                                                                                                                                                                                                                                                        See authorization + trust
                                                                                                                                                                                                                                                                                                                                                                                                                                                           ↓
                                                                                                                                                                                                                                                                                                                                                                                                                                                           Approve
                                                                                                                                                                                                                                                                                                                                                                                                                                                              ↓
                                                                                                                                                                                                                                                                                                                                                                                                                                                              Workflow continues
                                                                                                                                                                                                                                                                                                                                                                                                                                                                 ↓
                                                                                                                                                                                                                                                                                                                                                                                                                                                                 Procurement receives next task

                                                                                                                                                                                                                                                                                                                                                                                                                                                                 Example B — School fees

                                                                                                                                                                                                                                                                                                                                                                                                                                                                 Notification
                                                                                                                                                                                                                                                                                                                                                                                                                                                                    ↓
                                                                                                                                                                                                                                                                                                                                                                                                                                                                    Inbox
                                                                                                                                                                                                                                                                                                                                                                                                                                                                       ↓
                                                                                                                                                                                                                                                                                                                                                                                                                                                                       School fees
                                                                                                                                                                                                                                                                                                                                                                                                                                                                          ↓
                                                                                                                                                                                                                                                                                                                                                                                                                                                                          Review amount
                                                                                                                                                                                                                                                                                                                                                                                                                                                                             ↓
                                                                                                                                                                                                                                                                                                                                                                                                                                                                             Pay
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                ↓
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                EcoCash/provider
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   ↓
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   Payment proof
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      ↓
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      Reconciliation
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         ↓
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         Receipt
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            ↓
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            Completed

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            Example C — Supplier onboarding

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            Inbox
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               ↓
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               Verify supplier
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  ↓
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  Request credential presentation
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     ↓
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     Wallet
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        ↓
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        Consent
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           ↓
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           Presentation
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              ↓
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              Verification
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 ↓
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 Authorization
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    ↓
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    Workflow continues

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    From the user's perspective these are all the same product:

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    «“Credentis tells me what needs my attention, gives me the context and evidence I need, lets me act, and moves the work forward.”»

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    That should be the defining UI principle of the remodel.
                                                                                                                                                                                                                                                                                                                                                                                                                                            ]
                                                                                                                                                                                                                                                                                                                                                                                                            ]
                                                                                                                                                                                                                                                                                                                                                                                                        ]
                                                                                                                                                                                                                                                                                                                                                                                                      ]
                                                                                                                                                                                                                                                                                                                                                                                            }

                                                                                                                                                                                                                                                                                                                                                                        org onbparding
                                                                                                                                                                                                                                                                                                                                                             ORG ONBOARDONG STARTS HERE
                                                                                                                                                                                                                                                                                                                                                                        Exactly. After reviewing the remodel direction and the current Git branch, I would **not bring back the old “activate features → activate workflow” onboarding model**.

The better model is:

> **Create Organization → Establish Organizational Identity → Configure Operating Structure → Establish Authority → Configure Workflow Rules → Connect Trust/Providers → Ready**

The critical distinction is that **you are configuring an organization, not switching product features on and off**.

The current backend already points in this direction. Creating a tenant provisions the technical SSI foundation — tenant wallet/profile, issuer DID, verifier DID, OpenID issuer/verifier records and default VC models for an ORG tenant. The organizational foundation is then a separate layer involving memberships, roles, authorities, requests and policy. Your new `PlatformRequestService` and authorization layer are already designed around that model.

## The onboarding model I recommend

Think of organization onboarding as **“Build your operating system”**, not a setup wizard that must be completed from start to finish.

### Stage 1 — Create the organization

The first screen should be extremely simple:

```text
Create your organization

Organization name
[______________________]

Organization type
[ Company ▼ ]

Country
[ Zimbabwe ▼ ]

Primary contact
[______________________]

Work email
[______________________]

[Create organization]
```

Once submitted, the system should immediately create the tenant and silently provision the SSI infrastructure in the background.

The administrator should **not** see:

```text
Creating issuer DID...
Creating verifier DID...
Creating Askar profile...
Creating credential definitions...
```

Those are infrastructure concerns.

The user should see:

```text
✓ Organization created

Let's set up how your organization works.
```

---

# 1. Replace the old feature activation model

The old conceptual model was effectively:

```text
Organization
   ↓
Choose features
   ↓
Activate Finance
Activate Procurement
Activate HR
...
   ↓
Configure workflows
```

I would retire that.

The new model is:

```text
Organization
   ↓
Organization setup
   ├── People
   ├── Departments
   ├── Roles
   ├── Authorities
   ├── Approval rules
   ├── Delegations
   ├── Trust
   └── Providers
        ↓
Workflow becomes usable when its prerequisites exist
```

So **Finance is not “activated.”**

Instead:

```text
Finance exists
     ↓
No finance approver configured
     ↓
Finance workflow is not yet operational
```

Once the required authority is configured:

```text
Finance
✓ Operational
```

This is a much better fit for the remodel.

---

# 2. The organization should have a “Setup Center”

After creation, the administrator lands on:

```text
Organization Setup

Acme Holdings

Your organization is 68% ready

━━━━━━━━━━━━━━━━━━━━

CORE ORGANIZATION
✓ Organization profile
✓ Primary administrator
● Departments
● People

AUTHORITY
● Roles
● Approval authorities
● Delegations

OPERATIONS
● Workflow policies
○ Finance configuration
○ Procurement configuration
○ HR configuration

TRUST
✓ Organization identity
● Trusted issuers
○ Credentials

INTEGRATIONS
○ EcoCash
○ Notifications

────────────────────

[Continue setup]
```

This is **not feature activation**.

It is a **readiness dashboard**.

---

# 3. Mandatory vs conditional vs recommended

This is where the onboarding becomes powerful.

Do not simply say:

```text
Required
Optional
```

Use three states:

### Required

Must exist before a particular organizational capability can operate.

### Conditional

Required only when the organization uses a workflow that depends on it.

### Recommended

Improves the organization's setup but does not block operations.

For example:

| Configuration              | Status      |
| -------------------------- | ----------- |
| Organization profile       | Mandatory   |
| Primary administrator      | Mandatory   |
| At least one active member | Mandatory   |
| At least one role          | Mandatory   |
| Approval authority         | Conditional |
| Department                 | Conditional |
| Delegation                 | Optional    |
| Trusted issuer             | Conditional |
| EcoCash                    | Conditional |
| Finance approver           | Conditional |
| Procurement approver       | Conditional |

This means you don't force a tiny organization to configure 25 people and 12 departments just to create its first request.

---

# 4. Don't ask the organization to configure everything immediately

This is probably the biggest UX decision.

The onboarding should **progressively discover configuration requirements**.

Example:

An organization creates itself and only wants to use:

```text
School fees
```

You shouldn't ask for:

```text
Procurement policies
HR approval hierarchy
Supplier credentials
Inventory
Purchase orders
```

Instead:

```text
Let's get your organization ready.

First, we'll configure:

✓ Organization
✓ Administrator
→ People
→ Payment authority
→ School-fee workflow
```

Later, when the organization starts Procurement:

```text
Procurement requires additional setup

You need:

• Procurement approver
• Procurement department
• Supplier verification policy

[Set up now]
```

This is much cleaner than feature activation.

---

# 5. Use workflow prerequisites

This should become a platform primitive.

Every workflow should declare something conceptually like:

```text
Workflow
School Fees Payment

Prerequisites

Organization
✓ Active

Requester
✓ Available

Payment authority
✓ Configured

Payment provider
✓ Configured

Approval authority
✓ Configured
```

For requisition:

```text
Workflow
Purchase Requisition

Prerequisites

Requester
✓

Department
✓

Cost centre
✓

Approver
✓

Approval threshold
✓

Procurement authority
✗

Supplier verification
○ Optional
```

Therefore the workflow itself tells the admin what is missing.

This is far better than:

```text
Activate Procurement
```

---

# 6. Organization onboarding stages

I would use seven setup domains.

## A. Organization identity

```text
Organization details
Legal/display name
Organization type
Country
Address
Contact information
Logo
Domain
```

Some can be optional initially.

---

## B. People

This is where the organization starts becoming operational.

```text
People

You
✓ Organization administrator

[Invite people]
```

Allow:

```text
Email
Phone
Name
Role assignment
Department
Status
```

The organization should be able to continue with only the administrator and add employees later.

---

# 7. Roles

Do not make the administrator define a complicated RBAC matrix during onboarding.

Provide sensible starter roles.

For example:

```text
Choose your organization roles

✓ Organization Administrator

[+ Add role]

Suggested roles

Finance Manager
Procurement Officer
Approver
HR Manager
Employee
Field Officer
```

Then advanced administrators can customise them later.

---

# 8. Authority is more important than roles

This is a major consequence of the new architecture.

Don't make the onboarding model:

```text
John → Manager
```

and assume John can approve everything.

Instead:

```text
John
Role: Finance Manager

Authorities
✓ Approve finance requests
✓ Approve payments up to USD 5,000
✓ Department: Finance
✓ Cost centres: FIN-*
```

Because your authorization model already considers much more than role alone — including amount, department, project, cost centre, delegation and separation of duties.

The onboarding UI therefore needs an **Authority Setup** stage.

---

# 9. Approval setup

This should be one of the most important onboarding screens.

```text
Approval setup

Who can approve organizational requests?

Finance
   Approver
   [Select person]

Procurement
   Approver
   [Select person]

HR
   Approver
   [Select person]

Payments
   Primary approver
   [Select person]

```

But do not stop there.

Add rules:

```text
Payment approvals

USD 0 – 1,000
→ Finance Officer

USD 1,001 – 5,000
→ Finance Manager

USD 5,001+
→ Finance Manager + Executive
```

This becomes the bridge between onboarding and the policy engine.

---

# 10. Avoid requiring “approval persons” universally

This is important.

An approval person is not inherently mandatory for organization creation.

Instead:

```text
Organization exists
✓

Can create requests
✓

Can submit requests
✓

Can approve requests
?
```

The platform can say:

> “You don't currently have an approver configured for payment requests above USD 1,000.”

That is much more intelligent than:

> “Please configure an approver before continuing onboarding.”

The requirement emerges from the business operation.

---

# 11. Departments

Same principle.

Don't force:

```text
Finance
HR
Procurement
Operations
IT
Marketing
```

during initial setup.

Instead:

```text
Departments

No departments configured yet.

Departments help route organizational work.

[Add department]

Suggested:
Finance
Procurement
HR
Operations
```

Then workflows can request department context when needed.

---

# 12. Delegations

Delegation should also be progressive.

```text
Delegations

No active delegations

Delegations allow another authorized
person to act on your behalf.

[Add delegation]
```

Setup:

```text
Delegate

From:
Finance Manager

To:
Deputy Finance Manager

Authorities:
✓ Payment approval

Maximum:
USD 5,000

Valid:
1 Oct → 31 Dec 2026

[Create delegation]
```

This plugs directly into the authorization architecture rather than being a separate administrative concept.

---

# 13. Trust setup

This should be another setup domain, but not something ordinary users are forced to understand.

The organization gets:

```text
Trust & Identity

Organization identity
✓ Created

Issuer identity
✓ Ready

Verifier identity
✓ Ready

Trusted issuers
0 configured

Credentials
3 credential types available
```

The technical tenant provisioning already creates issuer/verifier infrastructure for ORG tenants.

So this screen is primarily for **business trust configuration**, not DID setup.

---

# 14. Integrations should be conditional

EcoCash is a good example.

Don't ask every organization:

```text
Configure EcoCash
```

during initial onboarding.

Instead:

```text
Payments

Available payment providers

○ EcoCash
○ Bank
○ Zimswitch
○ Other
```

Selecting EcoCash opens:

```text
EcoCash

Used by:
School fees
Supplier payments
Payroll

Connection status
Not connected

[Connect]
```

Again:

**provider configuration becomes a prerequisite for workflows that need it.**

---

# 15. The best onboarding experience is a hybrid

I would therefore build:

```text
            CREATE ORGANIZATION
                    ↓
        ┌───────────────────────┐
        │ Automatic provisioning│
        │                       │
        │ Tenant                │
        │ DID                   │
        │ Issuer                │
        │ Verifier              │
        │ Wallet profile        │
        └───────────────────────┘
                    ↓
           ORGANIZATION SETUP
                    ↓
      ┌──────────────────────────┐
      │ Core mandatory setup     │
      │                          │
      │ Organization             │
      │ Administrator            │
      │ Initial people           │
      │ Initial role             │
      └──────────────────────────┘
                    ↓
           READY TO START
                    ↓
            USE THE PLATFORM
                    ↓
      WORKFLOWS DISCOVER NEEDS
                    ↓
       MISSING CONFIGURATION?
                    ↓
         "Setup required"
                    ↓
        Complete configuration
                    ↓
          Workflow continues
```

That is the architecture I would lock in.

---

# 16. The onboarding should finish before the organization is “fully configured”

This is subtle but important.

Have two concepts:

### Organization status

```text
ACTIVE
```

### Readiness

```text
Core setup      100%
People setup     60%
Authority setup  40%
Finance setup    80%
Procurement      20%
Trust setup       90%
```

So:

```text
Organization: ACTIVE
Readiness: 72%
```

The organization can operate while continuing setup.

This avoids the classic SaaS onboarding problem where administrators get trapped inside a huge wizard.

---

# 17. The dashboard should continuously surface missing setup

Example:

```text
Setup

Your organization is ready for most operations.

⚠ 2 configurations need attention

Payment approvals
Configure an approver for payments
over USD 5,000.

Procurement
Add a procurement approver.

[Review setup]
```

This is much more natural than a permanent onboarding wizard.

---

# 18. First-run experience

After minimum setup:

```text
You're ready to go.

Acme Holdings

✓ Organization created
✓ Your account configured
✓ Authority established
✓ Organizational identity ready

Next:

Create your first request

[Create request]
```

Then the user immediately enters the actual product.

This is important because your product's strongest interaction is the workflow/inbox, not administration.

---

# 19. The inbox can also drive onboarding

This is where the remodel becomes especially interesting.

Suppose an administrator creates a payment workflow but there is no approver.

Instead of only displaying an error:

```text
Cannot continue.
```

the platform could create an organizational setup item:

```text
SETUP REQUIRED

Payment approval authority missing

No authorized approver is configured
for payments above USD 5,000.

[Configure approver]
```

That opens the setup screen.

After configuration:

```text
✓ Approval authority configured

Return to workflow
```

So onboarding itself starts using your **inbox/action model**.

That's a very powerful unification.

---

# 20. What onboarding becomes in the final architecture

You effectively get two types of work:

```text
BUSINESS WORK
────────────────────
Requisition
Payment
School fees
Supplier verification
HR onboarding
Field inspection
```

and:

```text
ORGANIZATION SETUP WORK
────────────────────
Configure approver
Invite employee
Create department
Define authority
Configure delegation
Connect EcoCash
Configure trust issuer
```

**Both can use the same action/inbox primitives.**

That means you don't need a second completely different workflow UX for administration.

---

# 21. UI architecture

I would structure the portal around:

```text
Dashboard
│
├── Inbox
│
├── Requests
│
├── Operations
│
├── Trust & Evidence
│
└── Organization
      │
      ├── Overview
      ├── Setup
      ├── People
      ├── Departments
      ├── Roles
      ├── Authorities
      ├── Delegations
      ├── Policies
      └── Integrations
```

And:

```text
Organization → Setup
```

becomes the **configuration/readiness center**, not a feature manager.

---

# 22. One reusable setup component

I would introduce something like:

```text
OrganizationReadiness
```

It displays:

```text
Organization readiness

Core
██████████ 100%

People
███████░░░ 70%

Authority
██████░░░░ 60%

Trust
█████████░ 90%

Integrations
████░░░░░░ 40%
```

Each item has:

```text
Ready
Needs attention
Not configured
Optional
```

And each setup item knows:

```text
What it enables
What is missing
Who can configure it
```

---

# 23. Most important architectural rule

I would add this rule to the remodel plan:

> **Configuration must be capability-driven, not feature-driven.**

A workflow asks:

```text
What does this workflow require?
```

The organization setup system answers:

```text
Is it configured?
Who is responsible?
What's missing?
```

The UI then guides the administrator to fix it.

So:

```text
Workflow
   ↓
Prerequisites
   ↓
Organization configuration
   ↓
Authorization policy
   ↓
Execution
```

rather than:

```text
Feature
   ↓
Activate
   ↓
Activate workflow
```

---

# 24. How this fits the existing backend

This actually fits your current branch quite well.

You already have:

```text
organizations
departments
people
organization_memberships
roles
authority_grants
delegations
requests
request_approvals
policy_decisions
request_tasks
request_events
```

and the authorization service already evaluates those organizational relationships when deciding whether someone can act.

You also have a platform workflow boundary rather than replacing the existing workflow engine: `PlatformWorkflowService` authorizes the principal, correlates a workflow run with a request and resumes workflows after human tasks complete.

So I would **not create a second onboarding framework** that sits beside this.

I would create an:

```text
OrganizationSetup / Readiness layer
```

on top of the existing organization foundation and authorization primitives.

---

# 25. Final target

The organization experience should ultimately feel like this:

```text
CREATE ORGANIZATION
       ↓
Automatically provision identity/trust infrastructure
       ↓
Configure yourself as administrator
       ↓
Add the people you need
       ↓
Define roles/authority
       ↓
Configure the workflows you actually intend to use
       ↓
Platform identifies missing prerequisites
       ↓
Administrator resolves them
       ↓
Organization becomes progressively more capable
```

And critically:

> **There is no “Activate Finance”, “Activate Procurement”, or “Activate Workflow” button anymore.**

There are simply **organizational capabilities that become operational when their prerequisites are configured**.

That is much more consistent with the remodel we've been building toward, and it also gives us a clean path for the school-fees, requisition, finance, HR and field-operations examples without turning the product into a collection of disconnected modules.

---

# 26. Backend Realignment Implemented (Reuse-First)

To align with the onboarding model above while reusing the existing platform stack:

1. Keep the existing organization service/controller foundation.
2. Add setup readiness instead of a new onboarding engine.
3. Keep legacy activation route for compatibility, but treat it as an alias.

Implemented API alignment:

```text
GET  /api/organizations/{orgTenantId}/setup/readiness
POST /api/organizations/{orgTenantId}/workflows/configure
POST /api/organizations/{orgTenantId}/workflows/activate   (legacy alias)
```

Readiness semantics:

```text
mandatory   -> blocks core readiness when missing
conditional -> required only when enabled workflows need it
recommended -> optional improvement, not a hard blocker
```

Readiness domains:

```text
core
people
authority
operations
trust
integrations
```

Important reuse behavior:

```text
- No second workflow engine
- No new parallel onboarding framework
- Existing OrganizationService remains the source of truth
- Existing workflow template activation logic is reused under configure semantics
- Platform organization record is auto-healed/created during org onboarding
```
