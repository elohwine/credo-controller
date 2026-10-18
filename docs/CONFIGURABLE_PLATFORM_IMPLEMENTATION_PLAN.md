# Configurable Credentis Platform: Architecture and Implementation Plan

Date: 2026-10-15  
Baseline: current `sgk` working tree, including uncommitted changes  
Status: **architectural source of truth.** `MVP_GOALS.md` (Fastlane commerce) and the SGK
field work are pilot configurations of this platform; the remodel handoff and
`ARCHITECTURAL_LAYERS.md` are historical records. Implemented since: connected systems
(organisation-defined record types sent by API or file upload, org-signed) — see
[CONNECTED_SYSTEMS.md](./CONNECTED_SYSTEMS.md).

Revision: SSI remains the platform foundation. This revision supersedes the earlier
proposals for SSI-disabled/business-only profiles, optional platform identity, and
on-demand replacement of existing organisation identity provisioning.

## 1. Decision and scope

Extend the existing Credo Controller platform, its Next.js portal, and its
Next.js/Capacitor mobile app. Do not build a second application, a second workflow
engine, or a separate identity/permissions system for each industry.

The full conversation evolved from a fiscalisation project and commercial
partnership into a broader architecture requirement:

> One SSI-based platform, one organisation setup, and one permission system.
> Questionnaire answers narrow which business work and capabilities apply, whether they
> operate inside Credentis, connect their own software, or combine both. Platform
> identity, wallets, DIDs and required credential proofs remain foundational.

The final clarification supersedes the earlier suggestion to start with a
separate fiscalisation product. Fiscalisation is one capability, not the platform's
centre. SGK job execution is another use case, not the universal parent of every
business transaction.

Preserve the existing SSI architecture and requirements; enhance reliability,
verification, recovery and usability rather than introducing an SSI-off mode.
Continue offering `PlatformIdentityCredential` to every registering platform user.
Organisation answers and settings must not suppress that personal identity offer,
remove existing proof requirements, or disable platform login/verification services.
Supported workflow-record issuance/delivery settings remain configurable within
their current policy constraints; they are not a switch for the SSI foundation.

### Customer configurations to support

| Configuration                                         | Business modules                                                  | Reusable capabilities                                                                                | Experience                                                                                                                                          |
| ----------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| SGK / field organisation                              | Jobs, evidence, approvals; finance when needed                    | Existing proof policies, payments as configured                                                      | Existing mobile jobs and portal administration remain intact                                                                                        |
| Business without its own software                     | Selected sales, AR/AP, procurement, store or school-fee workflows | SSI foundation retained; payments, permitted workflow-record settings and fiscalisation configurable | Operates directly in the existing apps                                                                                                              |
| Business with its own software needing trust services | No mandatory sales/jobs/AR/AP modules                             | Credential issuance, verification, wallet delivery, integrations                                     | Scoped API access and a small administration workspace                                                                                              |
| Business with its own software needing fiscalisation  | No mandatory store, jobs or AR/AP screens                         | SSI foundation retained; fiscalisation, document intake, connectors                                  | Sends documents from its system; human administrators retain platform identity/wallets without adding a wallet interaction to every machine request |
| Hybrid organisation                                   | Selected internal modules                                         | Selected integrations and capabilities                                                               | Uses Credentis for some work and its own systems for the rest                                                                                       |
| Service partner / reseller                            | Client onboarding and support                                     | Explicit client grants, optional branding                                                            | Manages only consenting client organisations within granted scope                                                                                   |

Neither an industry label nor a pricing tier grants access to another organisation.
Business modules are composable: an organisation may operate a shop and field
jobs, for example.

## 2. What already exists, and what does not

This map is based on source, not the roadmap's completion labels. Existing code
does not automatically imply production readiness.

| Surface                                | Current implementation                                                                                                                                                                                                                                                     | Architectural gap / required change                                                                                                                                                           |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Organisation profile and questionnaire | [OrgSetupProfileService](../src/services/OrgSetupProfileService.ts), [portal questionnaire](../credo-ui/portal/pages/organization/onboarding.tsx), [mobile settings](../credo-ui/mobile/pages/settings/org.tsx)                                                            | Extend, do not replace. Current kinds are office/field/school/shop; no operating model or general capability selection                                                                        |
| Module entitlements                    | [OrgEntitlementService](../src/services/OrgEntitlementService.ts), [plan migration](../migrations/113_org_modules_and_plans.sql)                                                                                                                                           | Currently only `people_payroll`; pilot grants and selection exist but not a platform-wide catalogue                                                                                           |
| Request-type selection                 | [OrgSetupProfileService](../src/services/OrgSetupProfileService.ts)                                                                                                                                                                                                        | Procurement, AP, and collection are always on. That does not fit an integration-only organisation                                                                                             |
| Operational prerequisites              | [WorkflowReadinessService](../src/services/WorkflowReadinessService.ts), [prerequisite registry](../src/services/workflow/prerequisites.ts)                                                                                                                                | Retain mandatory `ssi_identity` and existing proof prerequisites. Add module-specific readiness without weakening the core                                                                    |
| UI capability derivation               | [mobile capability helpers](../credo-ui/mobile/lib/workflowCapabilities.ts), [portal capability helpers](../credo-ui/portal/lib/workflowCapabilities.ts), [portal layout](../credo-ui/portal/components/Layout.tsx)                                                        | UI infers features from workflow aliases/sector/`enabled`; backend readiness does not use `enabled` as an execution gate. Replace access inference with a server-resolved projection          |
| Business lifecycle and orchestration   | [PlatformRequestService](../src/services/PlatformRequestService.ts), [WorkflowService](../src/services/WorkflowService.ts), [FinanceModule](../src/services/modules/FinanceModule.ts), [FieldOpsModule](../src/services/modules/FieldOpsModule.ts)                         | Retain domain lifecycle owners and the single orchestration engine; add shared capability checks at all entry paths                                                                           |
| Finance correlation                    | [BusinessTransactionService](../src/services/BusinessTransactionService.ts), [AP controller](../src/controllers/finance/AccountsPayableController.ts), [AR controller](../src/controllers/finance/ArController.ts), [payment links](../src/services/PaymentLinkService.ts) | Keep work, obligations, settlements, business documents, fiscal results, and credentials distinct                                                                                             |
| SSI and configurable record settings   | [credential policy types](../src/types/WorkflowTemplate.ts), [record settings](../src/services/workflow/recordSettings.ts), [CredentialActions](../src/services/workflow/actions/CredentialActions.ts), [proof policy](../src/services/ProofVcPolicyService.ts)            | Preserve platform identity and required proofs. Scope configurable outputs to eligible workflow records; missing/erroring policy must not silently change issuance or required proof behavior |
| Organisation and identity provisioning | [OrganizationService](../src/services/OrganizationService.ts), [TenantProvisioningService](../src/services/TenantProvisioningService.ts), [SSIAuthService](../src/services/SSIAuthService.ts)                                                                              | Retain Credo tenancy, DIDs, issuer/verifier provisioning and platform identity registration. Enhance partial-failure recovery and verified login rather than decoupling SSI out               |
| Integrations and background work       | [ProviderRepository](../src/persistence/ProviderRepository.ts), [ExternalActions](../src/services/workflow/actions/ExternalActions.ts), [OutboxService](../src/services/OutboxService.ts)                                                                                  | Reuse, but harden before adding consumers. Current outbox handles specific topics, marks unhandled topics processed, and has no retry scheduling for failed rows                              |
| Mobile / offline                       | [mobile app](../credo-ui/mobile), [offline utilities](../credo-ui/mobile/lib/offline)                                                                                                                                                                                      | Existing queue/snapshot utilities are not a general guarantee of safe offline money, proof, or fiscal operations                                                                              |
| Fiscalisation and external devices     | ZIMRA provider seed and workflow references exist                                                                                                                                                                                                                          | No FDMS-specific domain located. Generic API calls and phone camera/QR plugins are not fiscal-device or IoT lifecycle support                                                                 |
| Custom workflows                       | Persisted/versioned templates and registered actions exist                                                                                                                                                                                                                 | Add governed configuration and validation before a visual builder; do not expose arbitrary execution                                                                                          |
| Industry coverage                      | Field, finance, commerce and school-fee paths exist                                                                                                                                                                                                                        | Do not present school-fee collection as a complete school-management system, or optional staff requests as a complete payroll suite                                                           |

The previous review's checks passed type-checking and 29 focused unit tests.
Tenant issuance e2e failed during ESM module loading; it also skips presentation
verification. Source lint failed with a large existing backlog. These are baseline
observations, not acceptance of the future architecture.

## 3. Target architecture: a modular monolith

```text
Existing portal + existing mobile app + external customer applications
                              |
                  Authenticated API / organisation context
                              |
              Shared access, configuration and readiness resolver
                              |
       +----------------------+---------------------------+
       |                      |                           |
   Business modules      SSI-based shared core     Additional capabilities
   Jobs / field          Identity, wallets, DIDs   External credential APIs
   Procurement           Issuer/verifier + proofs  Payments and notifications
   Sales / AR / AP        Membership and policy     Fiscalisation
   Store / checkout      Requests/workflows/audit  External device adapters
   School fees           Records/durable dispatch  External system connectors
   People / payroll
                              |
             Existing persistence / repositories / Credo adapters
```

These are responsibility boundaries, not instructions to create one service,
database, package, or deployment per box. Keep the existing deployment initially.
Add only the files and tables needed for the first proven capabilities.

### Invariants

1. The platform owns business state and permission decisions; SSI supplies
   independently verifiable evidence. Credential possession alone never grants access.
2. Work completion, approval, payment settlement, fiscal acceptance, and credential
   issuance are separate events with separate state.
3. `WorkflowService` remains the orchestration engine. Domain-specific state
   machines such as fiscal-day state are legitimate; a duplicate approval engine is not.
4. Organisation, Credo tenant, branch, device, integration client, and human member
   are different concepts. Initially preserve existing organisation-to-tenant mappings.
5. Disabled or unentitled features reject new operations in the backend. UI hiding
   is not enforcement.
6. Disabling features preserves records, evidence references, audit, and legally or
   operationally required reconciliation.
7. An external-system connector does not require adoption of the corresponding
   internal business screens.
8. Preserve platform identity offers, core SSI provisioning and required evidence.
   Organisation record preferences apply only to eligible workflow outputs, never
   to platform authentication, mandatory proofs or core credential lifecycle.
   Internal audit events do not automatically require an additional VC.
9. Financial/fiscal facts cannot be inferred from the existence of a receipt VC.
10. Industry presets suggest configuration; they are not hardcoded product boundaries.
11. No organisation setting, plan downgrade, module disable or custom template may
    disable the SSI foundation or silently replace required proof with a weaker path.

## 4. Capabilities follow questionnaire answers and readiness, not activation

This follows the platform remodel rule (see
[the remodel handoff](../Credo%20Controller%20—%20Platform%20Remodel%20Handoff%20-%20Full%20TODO%20Plan.md),
sections 1–26 of the onboarding part): **configuration is capability-driven, not
feature-driven**. There is no "Activate Finance/Procurement/Workflow" button and no
screen listing every module/capability for the owner to tick. The organisation
answers a few plain questions; the server narrows the scope from those answers and
suggests the items that fit; workflows become operational when their prerequisites
are configured.

Extend what already exists rather than adding a parallel authority:

- [OrgSetupProfileService](../src/services/OrgSetupProfileService.ts) already turns
  answers (`kinds`, `modules`) into `requestTypes`. It remains the single place that
  maps answers to what the organisation uses. Its mapping becomes the internal
  catalogue; it is not exposed as a picker.
- [OrgEntitlementService](../src/services/OrgEntitlementService.ts) remains the only
  commercial gate (plans/grants), separate from operational readiness.
- [WorkflowReadinessService](../src/services/WorkflowReadinessService.ts) and
  template prerequisites remain the operational gate (required / conditional /
  recommended). Core `ssi_identity` stays mandatory.
- [PlatformRequestService](../src/services/PlatformRequestService.ts) remains the
  shared enforcement point for starting work.

### Align the misaligned pieces

| Today                                                                                         | Aligned                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Purchase requests, supplier bills and customer payments are "always on" regardless of answers | They follow from answers like every other request type. Existing organisations keep them through an explicit compatibility rule; an organisation that only connects its own systems is not given internal finance setup work |
| The answer → request-type mapping is mirrored in two UI helper files                          | The server returns the resolved scope and suggestions; the UIs render them and stop deciding access                                                                                                                          |
| UI capability flags are inferred from workflow aliases/sectors                                | Navigation and start actions use the server's resolved scope; workflow `enabled` is never an access authority                                                                                                                |
| Only People & payroll is checked server-side                                                  | Request creation checks every request type against the resolved scope (and plan), with an actionable message pointing to the setup question                                                                                  |

### Internal mapping (code-owned, not shown as a list)

Each answer-derived item declares: stable id, which answer(s) imply it, request types
/ routes it opens, readiness prerequisites, plan requirement, and availability
(`supported` or `planned`). Planned items (fiscalisation, device integrations,
external credential APIs, custom workflows) may be _suggested_ as "coming" but never
become operational because an answer implies them.

Platform identity, wallets, DIDs, issuer/verifier identities, required proofs and
status/revocation are foundation, not items in this mapping. No answer, plan or
setting removes them.

### Resolved scope

```text
in scope    = implied by answers (or legacy compatibility) AND implementation supported
usable      = in scope AND plan allows AND readiness prerequisites hold
              AND caller authorised AND business/policy preconditions hold
              AND foundational SSI / required proof checks hold
```

The server returns, with the existing setup profile: the answers, the request types
in scope, suggestions with a plain reason ("because you send people out to do jobs"),
items that need plan changes, and the next setup steps from readiness. A request type
outside the scope is refused with a message naming the question that would open it.
Missing/corrupt configuration is reported, not silently granted.

### Changing answers

- Changing an answer changes scope going forward; it never deletes history.
- Work already started continues to completion (callbacks, settlement and required
  proofs keep working); only new starts are refused.
- Live membership, permissions and revocation are rechecked on every sensitive action.

## 5. Extend the existing questionnaire; suggest, don't list

Keep the existing questions (what you do, staff, who handles money, payments) and
the single-question edit from the Setup checklist. Add only what narrows scope:

1. **How will you use Credentis?** Run our work here / connect our own systems / both.
   "Connect our own systems" skips the internal work questions and money setup.
2. **What you do** (existing kinds), asked when work runs here.
3. Existing staff/money/payment questions, asked only when the answers above make
   them relevant.

After the answers, show a short **suggested setup** derived on the server: what the
organisation will be able to do, what still needs setting up, and what is coming
later. The owner confirms or goes back to change an answer; there is no catalogue
to browse. Identity and required proofs are presented as built in, never as a choice.

A later GenUI-assisted onboarding will replace fixed questions with a conversation
that produces the same answers; it reuses this server mapping and suggestion output
rather than introducing a new configuration model.

## 6. SSI foundation preserved; workflow-record settings remain bounded

### Policy boundaries

| Concern                                                   | Policy                                                                                                                                        |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Personal platform identity                                | Continue offering `PlatformIdentityCredential` on every platform-user registration; not controlled by organisation settings or plan           |
| Wallets, DIDs and organisation issuer/verifier identities | Preserve current provisioning and core `ssi_identity` readiness; enhance reliability and recovery                                             |
| Authentication                                            | Preserve current supported login methods and VC-login direction; enhance verified presentation handling, not add an SSI-disabled account mode |
| Membership/authority/stage proofs                         | Preserve existing requirements and fail-closed checks; no module preference can bypass them                                                   |
| Business authorisation                                    | Platform membership, roles, delegations, live policy and required evidence remain decisive                                                    |
| Eligible workflow output records                          | Retain supported per-organisation/per-workflow issuance and delivery modes, subject to mandatory proof/dependency constraints                 |
| External API clients                                      | Scoped machine credentials represent an integration, not a human identity; retain organisation SSI context and required evidence policies     |

### Registration and identity lifecycle

The current [registration service](../src/services/SSIAuthService.ts) provisions a
personal DID, requests a platform identity offer, queues it and attempts acceptance
into the embedded wallet. Preserve that path for all registering platform users,
including administrators of integration-only organisations.

Do not suppress platform identity offers when sales, jobs or workflow-record delivery
is disabled. An offer, issued credential, wallet acceptance and successful login
are different states. Preserve current acceptance UX; this documentation does not
introduce a new blanket acceptance-before-access rule.

Enhance issuance/queue/acceptance with explicit pending, offered, accepted and failed
states, idempotent retries and safe reissue. A failed offer must be visible and
recoverable, never reported as a credential already held. Keep existing registration
and PIN/bootstrap behavior unless a separately tested security enhancement changes
it; existing proof-gated actions must still reject missing proof.

Preserve account-to-holder binding, issuer trust and credential lifecycle across
expiry, revocation, replacement, account suspension and device/key recovery.
Reissue/rebind only after authorised recovery; a claimed phone or tenant ID alone
is not proof of account ownership. Platform identity establishes an account-level
assertion, not KYC or verified phone ownership unless those checks actually occurred.
Keep `verificationLevel` accurate and minimise disclosed identity claims.

### VC login: preserve the feature, enhance its verification

Offering platform identity at registration is appropriate preparation for VC login,
but issuance alone does not authenticate a future presenter. Use the existing
Credo/OpenID4VP verification primitives where compatible; do not add a second
decode-only verification path.

The current [loginWithVC](../src/services/SSIAuthService.ts) consumes a stored nonce
and decodes the supplied credential JWT before account lookup. This is not evidence
that issuer signatures, presenter key possession or nonce/audience binding have
been cryptographically verified. Treat the earlier authentication summary's complete
verification claims as a target, not established behavior.

Before describing VC login as production-ready, require tests proving:

- A cryptographically verified credential from the trusted platform issuer, with
  supported type, validity interval and authoritative status checks.
- Holder/presenter binding and proof of control of the appropriate key. A copied
  credential plus an unrelated valid nonce must not be accepted.
- Fresh presentation bound to the login transaction, intended verifier/audience and
  unpredictable nonce, with session/state correlation and atomic replay prevention.
- Account/subject mapping from verified claims and bindings only; consistent handling
  of current `platformTenantId` and legacy `tenantId`, with conflicts rejected.
- Active account and current key/credential lifecycle validation before issuing a
  session; no permission inferred solely from the identity credential.
- Negative tests for modified signatures, wrong issuer/holder/audience, expired or
  revoked credentials, replay and account/key-recovery edge cases.

These are enhancements to the existing SSI design, not a proposal to remove SSI
or require a credential presentation for every API call. Normal authenticated
sessions remain sessions; sensitive actions retain their specific proof policies.

### Sign in with Credentis on partner platforms

Other organisations' platforms reuse the same verified VC login instead of each
building SSI support:

- **Partner verification API** (`/api/partner/v1/verifications`): an OID4VP
  session run by the platform verifier, always for the PlatformIdentityCredential,
  through the same `SSIAuthService.verifiedPlatformIdentity` checks as VC login.
  Each session is bound to a caller-supplied `bindingRef`, and its result can be
  read once. The partner receives a pairwise subject
  (`HMAC(client salt, account)`) and only the claims its policy allows. It never
  receives the holder DID.
- **Partner clients** are owned by an organisation and managed by its owners and
  admins (`/api/organizations/partner-clients`, portal _Sign-in partners_). Each
  client has its redirect URIs, released claims, and an audience: `any` or
  `org_members`. The secret is stored hashed, can be rotated, and can be revoked.
  Every change is audited.
- **Hosted OIDC bridge** (fork of `ssi-to-oidc-bridge`, see its `CREDENTIS.md`):
  Ory Hydra is the OpenID Provider and vclogin delegates verification to the API
  above. Partner clients are synced to Hydra, so any standard OIDC relying party
  can integrate without SSI code.

Open: only PlatformIdentityCredential is accepted. Per-client credential types and
trusted issuers, and per-organisation issuer DIDs for org-issued credentials, are
follow-ups.

### Workflow issuance, delivery and saving

Reuse `required` / `optional` / `disabled` record-offer modes only for eligible
workflow outputs. Keep platform identity and mandatory membership/authority/stage
evidence outside that configurable-output scope.

Distinguish issuance, offer delivery, wallet acceptance/storage and presentation.
Current offer modes do not implement all of those as independent settings. If
additional saving/delivery controls are implemented, define recipient scope and
consent clearly, and preserve required evidence dependencies. An organisation cannot
delete a user's held identity or remotely revoke access merely by hiding a card.
Actual credential withdrawal/status updates follow the credential lifecycle.

Validate policy changes against downstream consumers before saving. An output
required for a later proof cannot simply be disabled. Report the conflict; retain
current requirements until an explicitly authorised, versioned policy change is
implemented and verified. No generic business-only downgrade is introduced here.

Always persist required operational records and audit history independently of
optional output offers. Restrict output configuration consistently across workflow
actions, finance, payment/webhook and delivery paths, while preserving the separate
platform identity and mandatory credential paths.

### Standards rationale

Reviewed on 2026-10-15:

- [W3C Verifiable Credentials Data Model 2.0](https://www.w3.org/TR/vc-data-model-2.0/):
  issuer/holder/verifier roles and privacy considerations support separating
  credential evidence from business decisions and minimising disclosure. A VC
  does not make all asserted identity facts independently verified.
- [OpenID for Verifiable Credential Issuance 1.0](https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html):
  the offer and credential request/response are separate protocol steps, supporting
  explicit offer/issuance/acceptance state rather than treating an offer as a held VC.
- [OpenID for Verifiable Presentations 1.0](https://openid.net/specs/openid-4-verifiable-presentations-1_0.html):
  use verifier-bound presentation, nonce and session correlation appropriate to the
  selected credential format/profile, not a raw credential as a bearer login token.

Keeping SSI foundational is this product's architectural decision, not a mandate
from these standards. Confirm the installed Credo version's supported protocol
profiles before changing draft/final protocol settings; this plan does not claim
the current runtime is conformant merely because it uses Credo.

## 7. Shared records, adapters, fiscalisation and devices

### Records and finance

Reuse transaction families, obligations, allocations, and existing domain IDs.
Introduce a minimal immutable document snapshot/reference contract for integrated
business documents: organisation, source integration, external document ID/version,
document type, currency, lines/tax data, totals, digest, and correlation references.

Use an adapter for existing internal invoice records and the same validated intake
contract for external documents. Do not create a second general ledger or force an
external invoice to create internal sales/AR workflows.

Validate money, currencies, rounding and tax categories explicitly. Choose and
document one monetary representation suitable for each document contract; avoid
floating-point surprises or silently replacing invalid values with zero.
Corrections create linked versions/credit/debit documents, not mutation of accepted
fiscal evidence.

### Integration contract

- Organisation-scoped integration clients with least-privilege operation scopes,
  separate from root API keys and human membership tokens.
- Rotatable credentials, secret references, redacted config responses.
- Versioned document/event schemas and an explicit external source-of-truth map.
- Idempotency scoped by organisation + integration + operation + caller key;
  same key/different payload is an error.
- Authenticated/signed webhooks, replay protection, delivery attempts, and status query.
- Transactional event writes with dispatch only after commit.
- Explicit topic handlers, durable leases, bounded retries/backoff, dead-letter
  visibility, and reconciliation after ambiguous provider timeouts.
- Unknown topics and failed delivery never appear as successful processing.
- Rate limits and bounded payloads per integration. Avoid arbitrary provider URLs
  or executable scripts supplied through workflow configuration.

Harden the existing outbox first; introduce a broker or separate worker deployment
only when measured throughput/reliability requirements justify it. External effects
are at-least-once plus provider-specific idempotency/reconciliation, not a promised
universal exactly-once guarantee.

### Fiscalisation capability

Own taxpayer/branch configuration, registered fiscal devices and secret references,
fiscal-day state, submission attempts, accepted documents, and reconciliation.
Consume document commands/events from either internal modules or external intake.

Keep fiscal status distinct from payment and credential status. Follow the selected
FDMS specification for signatures, sequencing, certificates, asynchronous operations,
corrections and offline submissions. Serialise operations per fiscal device when its
protocol requires ordering. A device key is not an organisation's SSI key.

Expose accepted/pending/rejected/unknown-result status and authoritative verification
data. Only confirmed, persisted facts may trigger optional credential issuance.
FDMS test registration/validation/live approval is a separate release gate.

### Device integration capability

Start with one actual customer device/adapter requirement. Own organisation/branch
binding, device identity, permissions, enrolment, credential rotation, protocol
adapter, event validation, sequence/replay checks, health and audit.

Reuse native camera/location/QR capture where appropriate; do not call it a generic
external-device platform. Device events are evidence inputs, not automatic human
approval or authoritative payment/fiscal confirmation.

### Offline behavior

Classify operations: cached read, offline draft/evidence capture, or online-only
sensitive mutation. Queued commands carry organisation, user, operation ID,
configuration revision and dedupe key. Re-authorise on replay and expose conflicts.
Prevent cross-organisation queue/snapshot leakage when switching accounts.

Generic mobile queueing does not implement FDMS offline mode. Do not show queued
payment/fiscal operations as settled/accepted before authoritative confirmation.

## 8. Lightweight UI and delegated client administration

- Keep one mobile app and one portal; derive navigation/actions from the same API
  projection, refreshed on login, organisation switch and configuration changes.
- Lazy-load in-scope screens; do not fetch out-of-scope data on startup.
- Retain personal identity/wallet onboarding and access independently of a selected
  organisation's business modules; keep mandatory identity/proof tasks visible even
  when optional business-record delivery is disabled.
- Deep links/direct API access receive the same access checks and actionable errors.
- Integration-only customers see clients, credentials, document/result monitoring,
  relevant setup and audit, not an empty jobs/store workspace.
- Job, invoice and collection screens show linked work/money/proof/fiscal records
  without merging their lifecycles.
- Keep ordinary-language setup and evidence labels; protocol details belong in
  advanced integration/trust screens.

A partner gets explicit client access grants with scope, expiry and audit, approved
by the client and revocable by it. Reuse existing authorisation/delegation primitives
where their subject model fits; extend them for external partner principals rather
than interpreting organisation membership as unrestricted cross-client access.

White-label branding and reseller entitlements are configuration, not a separate
copy of the application. Client data ownership, software IP/licensing, support,
compliance responsibility, fees and exit/export rights require a written agreement;
they are not solved by granting a partner an owner token.

## 9. Governed custom workflows, later

Start with editable, versioned templates over registered actions. Allow bounded
input schemas, actor assignments, thresholds, conditions, evidence requirements,
notifications and handoffs. Validate action inputs, dependencies, allowed resources
and capability entitlements before publication.

Draft -> validate -> test -> publish immutable version -> retire.
New runs use the published version; existing runs retain their snapshot.
Record who changed/published policy and require appropriate approval.

No arbitrary JavaScript, shell commands, SQL, unconstrained HTTP destinations,
or second workflow runtime. Enforce execution/recursion limits and idempotent action
contracts. Premium pricing grants editing tools, not extra authority.

Build a visual designer only after real customers validate template-level
customisation. AI-assisted authoring, if later added, produces reviewed drafts;
it does not publish policy or execute actions autonomously.

## 10. Delivery sequence and acceptance gates

Each phase is independently reviewable. Do not start by relocating all code into
new directories or finishing every industry module.

### P0 - Establish a safe, reproducible baseline

Scope:

- Capture relevant existing SGK journeys and database fixtures.
- Fix the tenant e2e loading failure and replace prefix-only credential checks
  with actual signature/presentation verification.
- Capture registration/platform identity offer and acceptance behavior; add verified
  VC-login/holder-binding/replay tests before claiming login assurance.
- Address the review's AP amount/currency/atomicity and receipt merchant-identity bugs.
- Remove unconditional debug ingestion; harden provider secrets, revocation paths,
  incorrect tenant discovery URLs, and partial provisioning behavior.
- Review tracked environment/signing files locally; rotate exposed material if needed.
- Record pre-existing lint debt separately from new failures.

Exit: reproducible targeted tests for job/approval/handoff/payment/proof paths;
type-check passes; changed code introduces no lint failures; no unintended telemetry
or success-shaped provisioning/verification errors.

Holder custody (done, found during VC-login hardening):

- Every wallet credential used to be bound to the platform's own issuer key, so holder
  binding proved nothing. Accepting offers and signing presentations now run on the
  holder's own tenant agent (`src/services/ssi/TenantHolder.ts`); credentials bind to the
  wallet's first did:key (`ssi_users.did`).
- The platform issuer DID is pinned (`PlatformIssuerDid.ts`, override `PLATFORM_ISSUER_DID`)
  and is never a holder key.
- Existing misbound records are reissued with the same claims by their original issuer
  (organisation tenant or platform) and the old credential is revoked as replaced
  (`CustodyRebindService`, table `wallet_custody_rebinds`). It runs on PIN sign-in and when
  the inbox loads; revoked credentials are never reissued.
- Open: organisation credentials are still signed by the platform issuer unless the
  credential definition names an issuer DID; per-organisation issuer signing is a follow-up.

### P1 - Answer-driven scope and compatibility

Scope:

- Extend the existing answer → request-type mapping in OrgSetupProfileService into
  the internal mapping (implied-by answers, prerequisites, plan, availability).
- Add the "how will you use Credentis" answer; derive the purchase/bills/payments
  request types from answers instead of always-on.
- Existing organisations keep their current scope through an explicit compatibility
  rule (no saved usage answer = current behaviour), not a silent default.
- Return resolved scope + suggestions with the existing setup profile response.
- Enforce scope + plan at request creation (PlatformRequestService) for every request
  type, reusing readiness for operational prerequisites. Foundation SSI is never gated.
- Apply the same gate to workflow start and failed-run retry. Instantiated catalogue
  workflows keep a generic category (e.g. `finance`), so the module is resolved from
  the category or, failing that, the catalogue template id (`templateIds` in
  `src/config/orgModules.ts`).
- Scope answers (`operatingModel`, `kinds`, `modules`) require the revision the admin
  loaded, in every mode including legacy; settings such as the staff-card rule or the
  approval preset do not change scope and skip that check.

Exit: a request type outside the answers cannot be started through any path;
existing SGK organisations behave as before; connect-only organisations get no
internal finance/jobs setup work and keep organisation SSI.

### P2 - Questionnaire, suggestions and both UIs

Scope:

- Add the usage question to the existing portal and mobile questions; skip
  irrelevant questions from the answers.
- Show the server-derived suggested setup (can do / needs setup / coming later);
  no catalogue to browse.
- Navigation and start actions use the server scope instead of mirrored mappings.

Exit: the same answers produce the same actions on mobile and portal.

### P3 - Enhance SSI reliability and bounded workflow-record configuration

Scope:

- Preserve core `ssi_identity` readiness and current organisation provisioning.
- Preserve personal platform identity offers on registration and recovery/reissue;
  make offer/acceptance/provisioning failures visible and retryable.
- Enhance VC login through trusted cryptographic presentation verification,
  holder binding, freshness, status and replay checks.
- Keep mandatory membership/authority/stage proofs unchanged.
- Apply existing configurable modes only to eligible workflow outputs and validate
  downstream proof dependencies before saving settings.
- Keep operational records separate from optional offers without removing mandatory
  evidence requirements or changing current account acceptance rules.

Exit: disabling optional workflow-record outputs does not suppress platform identity,
wallet onboarding, core readiness or required proofs; registration/reissue remains
recoverable; VC login rejects invalid/unbound/replayed proof; SGK behavior is preserved.

### P4 - Integration-only vertical slice and durable dispatch

Scope:

- Add scoped integration clients and minimal external-document intake.
- Harden existing outbox dispatch/retry/leases and observable operation status.
- Prove an external app can request credential issuance and receive/query the result
  without configuring internal finance/jobs/store.
- Provide schema examples and a small integration runbook.

Exit: duplicate commands do not duplicate effects; payload conflicts are explicit;
restart/timeout recovery works; cross-org clients are denied; rejected/failed
operations do not masquerade as successful delivery.

### P5 - First additional capabilities

Fiscalisation slice:

- Confirm the pilot's direct FDMS vs middleware path and exact document contract.
- Add fiscal-specific persistence/configuration and adapter using P4 intake/dispatch.
- Wire selected internal invoice sources and external-only sources.
- Prove device/day/submission/reconciliation and approval requirements in test first.

Device slice:

- Implement one selected adapter only if a pilot needs it; otherwise keep planned.
- Reuse P4 ingestion/authentication/audit with protocol-specific validation.

Partner slice:

- Add scoped client grants and multi-client setup/status monitoring after client
  permissions and data isolation are tested.

Exit: fiscalisation works without internal AR/AP or a wallet prompt for each machine
submission, while organisation SSI and human account identity remain in place; an
internal business can turn it on without changing its payment lifecycle; partner
access is explicit and revocable.
Device and fiscal release gates remain independent.

### P6 - Premium template configuration

Scope: governed draft/test/publish/versioning over existing actions, limits,
capability validation, and policy-change audit. Then evaluate a visual designer.

Exit: forbidden actions/dependencies cannot publish; template changes cannot alter
active runs or bypass membership/proof policy; disabled capabilities block new starts.

Do not quote a calendar or full build price until P0/P1 establish the real baseline
and the customer pilot, integration route and ownership agreement are confirmed.

## 11. Planned code surfaces

| Work item                                               | Reuse / update first                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Profile and entitlement resolution                      | [OrgSetupProfileService](../src/services/OrgSetupProfileService.ts), [OrgEntitlementService](../src/services/OrgEntitlementService.ts), [OrganizationController](../src/controllers/organizations/OrganizationController.ts)                                                                                                                                                                                                             |
| Operation gates and policy                              | [PlatformRequestService](../src/services/PlatformRequestService.ts), [AuthorizationService](../src/services/AuthorizationService.ts), [WorkflowReadinessService](../src/services/WorkflowReadinessService.ts), [prerequisites](../src/services/workflow/prerequisites.ts), [WorkflowService](../src/services/WorkflowService.ts)                                                                                                         |
| SSI foundation enhancements and bounded record settings | [OrganizationService](../src/services/OrganizationService.ts), [TenantProvisioningService](../src/services/TenantProvisioningService.ts), [SSIAuthService](../src/services/SSIAuthService.ts), [CredentialIssuanceService](../src/services/CredentialIssuanceService.ts), [CredentialActions](../src/services/workflow/actions/CredentialActions.ts), [WorkflowVcOfferDispatcher](../src/services/workflow/WorkflowVcOfferDispatcher.ts) |
| Business documents and money                            | [BusinessTransactionService](../src/services/BusinessTransactionService.ts), [finance controllers](../src/controllers/finance), [payment controllers](../src/controllers/payments), [public payments](../src/controllers/public), [EcoCash webhook](../src/controllers/webhooks/EcoCashWebhookController.ts)                                                                                                                             |
| Integration reliability                                 | [OutboxService](../src/services/OutboxService.ts), [ProviderRepository](../src/persistence/ProviderRepository.ts), [ExternalActions](../src/services/workflow/actions/ExternalActions.ts), [server lifecycle](../src/server.ts)                                                                                                                                                                                                          |
| Portal configuration/navigation                         | [questionnaire](../credo-ui/portal/pages/organization/onboarding.tsx), [Setup](../credo-ui/portal/pages/organization/setup.tsx), [profile helpers](../credo-ui/portal/utils/orgProfile.ts), [Layout](../credo-ui/portal/components/Layout.tsx), [capability helpers](../credo-ui/portal/lib/workflowCapabilities.ts)                                                                                                                     |
| Mobile configuration/navigation                         | [org settings](../credo-ui/mobile/pages/settings/org.tsx), [profile helpers](../credo-ui/mobile/lib/orgProfile.ts), [capability helpers](../credo-ui/mobile/lib/workflowCapabilities.ts), [offline utilities](../credo-ui/mobile/lib/offline)                                                                                                                                                                                            |
| Migration/testing/docs                                  | [migrations](../migrations), [tests](../tests), [architecture reference](./ARCHITECTURAL_LAYERS.md), [project overview](../PROJECT_OVERVIEW.md), [MVP goals](../MVP_GOALS.md)                                                                                                                                                                                                                                                            |

Add new fiscal/device/integration tables only in their phases. Assign migration
numbers from the actual current migration registry at implementation time; do not
reserve numbers against this dirty working tree.

Controller changes regenerate TSOA routes/schema and run the swagger patch script;
never hand-edit generated routes or swagger. Update architecture/MVP documentation
to distinguish the historical commerce pilot from this expanded configurable-platform
scope, without silently marking planned capabilities complete.

## 12. Acceptance matrix

| Scenario                                                     | Required outcome                                                                                                                            |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing SGK organisation migrated                           | Current actors, handoffs, assignments, safety holds, proof checks and payment semantics preserved                                           |
| New jobs organisation                                        | Core identity provisioning, existing proof requirements and membership/authorisation preserved; no unrelated business-module setup          |
| Internal sales organisation, eligible output offers disabled | Durable invoice/receipt and correct AR/payment state; configured outputs suppressed, platform identity and mandatory proof unaffected       |
| Registration with organisation output delivery disabled      | Platform identity still offered and current wallet acceptance path retained; failures explicitly tracked/retryable                          |
| Invalid or copied credential used for VC login               | No session issued without verified issuer, holder binding, freshness/audience and account/status checks                                     |
| Attempt to switch off SSI through profile/plan/template      | Rejected; no SSI-off profile or commercial gate for core identity/proof services                                                            |
| Credentials-only external customer                           | Scoped issue/verify/delivery works without jobs, AR/AP, store or payment setup                                                              |
| Fiscal-only external customer                                | Document/result workflow works without internal sales; organisation SSI and administrator identity preserved; scoped machine authentication |
| Hybrid organisation                                          | Source references remain stable; no duplicate documents or obligations                                                                      |
| Mixed shop/field organisation                                | Both answers use shared finance/permissions without one becoming the other's parent                                                         |
| School-fee organisation                                      | Existing fee workflow preserved; no unsupported full school-management claims                                                               |
| Disabled/unentitled capability                               | UI hidden or explanatory; API, direct actions and background starts denied                                                                  |
| Capability disabled with active work                         | Explicit drain/conflict decision; histories retained; callbacks/reconciliation safely handled                                               |
| Required proof unavailable/revoked                           | Denied; output preferences never downgrade required proof                                                                                   |
| Template edited during active run                            | Existing snapshot retained; revoked live permissions still enforced                                                                         |
| Integration retries/restarts                                 | One logical operation; bounded replay/reconciliation; visible pending/failed/unknown results                                                |
| Partner grant revoked                                        | All subsequent cross-client reads/writes denied, including existing tokens                                                                  |
| Offline command after org/role change                        | Correct-org replay only; live authorisation rechecked; conflict visible                                                                     |
| Configuration save conflict                                  | Revision conflict, not silent overwrite                                                                                                     |
| Mobile/portal parity                                         | Same server projection and permitted actions; no disabled-module eager fetches                                                              |

Use the existing Jest and workflow fixtures for focused backend coverage, then add
HTTP/integration tests and Playwright coverage for both existing UIs. Measure bundle
and startup request changes against a captured baseline; set budgets before claiming
the app is lightweight. Do not infer production readiness from type-check or a
JWT-prefix assertion.

## 13. Decisions to confirm before behavior-changing implementation

Recommended defaults in this plan:

- Modular monolith, one existing API and both existing UIs.
- Capability configuration built into existing profile/entitlement/readiness services.
- Existing organisations retain behavior; new organisations get a scope narrowed
  from their questionnaire answers and confirm the suggested setup (no module list).
- SSI foundation, platform identity registration offers, organisation provisioning
  and existing required proofs are preserved; enhancements only.
- Eligible workflow-record issuance/delivery preferences remain configurable;
  they cannot disable platform identity, mandatory evidence or wallet infrastructure.
- No forced store/AR/AP adoption for external integration customers.
- Historical records survive answer changes; started work runs to completion.
- Standard templates first; premium custom templates before a visual designer.
- Commercial partner access through scoped grants, not blanket ownership tokens.

SSI preservation is a settled constraint, not a pending opt-out decision. Confirm
the eligible output-record controls, recovery/acceptance UX, initial customer presets,
disable/drain policy and commercial grants before P1/P3 ship. Confirm FDMS provider
strategy and the first real device requirement before P5. Agreement on reusable IP,
branding, client/data ownership, support and fees precedes reseller commitments.

## 14. First implementation increment

After agreeing this map, start with P0 and a narrow P1/P2 slice:

1. Preserve a passing SGK fixture, platform identity registration path, core
   provisioning/proof prerequisites and current organisation defaults.
2. Extend the existing answer → request-type mapping with the usage answer and
   planned items; remove always-on finance for new connect-only organisations.
3. Return resolved scope and suggestions with the existing setup profile.
4. Extend the existing questionnaire and show suggested setup, not a module list.
5. Enforce the scope at request creation and prove a connect-only organisation
   does not inherit jobs/store/finance setup.

Next prove configurable workflow-output preferences without changing platform
identity/required proof, and a credentials-only external integration without internal
finance/jobs/store. Those two slices validate modular business capabilities over
the same SSI foundation before fiscal/device work expands it. Fiscalisation then
plugs into that foundation instead of determining the architecture of the product.
