# Credentis Production SSI Profile

## Purpose

This document defines the security, privacy, data-minimisation and interoperability rules for the platform-remodel branch. It is normative for new platform modules and is intentionally stricter than the historical Fastlane implementation.

## Standards baseline

- W3C Verifiable Credentials Data Model 2.0 Recommendation is the baseline credential model.
- W3C Verifiable Credential Data Integrity 1.0 is the baseline for proof/integrity where Data Integrity is selected.
- DID Core 1.0 is the baseline DID model. DID Core 1.1 is treated as a future compatibility target until it reaches Recommendation status.
- OpenID4VCI 1.0 Final is the baseline issuance protocol.
- OpenID4VP 1.0 Final is the baseline presentation protocol.
- HAIP 1.0 Final is the high-assurance interoperability profile where ecosystem requirements justify it.
- Implementations must not invent a proprietary credential-exchange protocol when an applicable standards flow exists.

## Data minimisation rules

1. The application database must not become a copy of a user's wallet.
2. Never persist private keys, seed material, raw credential JWTs, raw SD-JWTs, raw mdoc payloads, or complete Verifiable Presentations in ordinary application tables.
3. Store opaque internal subject references rather than government identifiers, phone numbers, email addresses or identity-document values unless a specific business/legal requirement has been approved.
4. Store credential references and status metadata, not credential payloads, whenever the payload can remain in the holder/issuer trust layer.
5. Store only the claims required for the workflow decision. Do not persist attributes merely because a credential contains them.
6. Prefer derived assertions such as `is_employee=true` or `approval_authorized=true` over copying source identity attributes into operational records.
7. Free-form request context is treated as potentially sensitive. It must contain business references, not identity-document data or secrets.
8. Evidence should normally be an opaque reference, digest, URI or object-store key with controlled retention rather than an embedded document blob.
9. Presentation records should capture purpose, verifier, requested claim categories, decision and timestamps; the full presentation should not be stored by default.
10. Logs must be redacted by default. Authentication headers, API keys, credentials, presentations, payment secrets and personal attributes must never be emitted to normal application logs.

## Identity and correlation

- Use an internal opaque `person_id` for application relationships.
- Use stable subject references only where correlation is explicitly required by the organization.
- Prefer pairwise identifiers for external relationships where the selected DID method and wallet support them.
- Do not assume a single public DID should represent a person across every verifier relationship.
- DID documents must not contain unnecessary identifying service metadata that defeats pairwise correlation protections.

## Authority model

A credential is evidence, not an authorization decision.

Authorization decisions must evaluate:

- authenticated principal
- organization and tenant boundary
- organizational membership
- role and authority scope
- delegation, if any
- requested action
- amount or other limits
- resource/project/cost-centre scope
- temporal validity
- credential/status validity
- separation-of-duties constraints

The system must record the decision result and the references used to reach it, without copying sensitive credential contents into the transaction record.

2026-10-12: `AuthorizationService.decide` evaluates, in order: active actor → explicit authority grant (scope, limits) → delegation → owner/admin → the member's role permissions (`roles.permissions` by `membership_role`, else the starter catalogue; `request.approve` implies review and reject, `finance.release|pay` imply fulfil and complete) → separation of duties. The role step is what lets a manager decide a leave request or an expense claim raised from Home without an individual grant; the decision record names the step that allowed it (`org_role_permission_match`). A credential (staff card) remains evidence of the role; the decision is still made here.

2026-10-12: Finance follows the same boundary. Purchase, sale, payable, receivable and settlement
state is normal tenant-scoped application data (`business_transactions`,
`financial_obligations`, `settlement_allocations`). Order/receipt/bill matching, ageing, reminders,
partial-payment arithmetic and variance decisions do not issue credentials. A credential or
signed record is used only when another person or organisation must later verify who acted or
what crossed that boundary, such as an authority card, externally shared invoice, delivery
receipt or payment receipt. The credential is evidence for that event; it is not the payable,
receivable, authorization decision or general ledger.

## Holder/user centricity

The primary user experience is the user's action queue:

- what requires my action
- why it requires action
- who requested it
- what authority is being exercised
- what evidence supports it
- what information will be shared externally
- what happens after approval or rejection

SSI terminology should be progressive disclosure. A normal employee should be able to approve a request without understanding DIDs, credential formats or protocol internals.

Where a verifier requests a credential presentation, the holder must be shown the purpose, verifier identity, requested information categories and the effect of accepting the presentation before consent is recorded.

2026-10-11: That purpose is the one step. The request names the step, the share screen shows it ("Release worker payout · Job FR-…"), and the wallet signs the job and the amount with the card. Each step on a new staff card can be revealed on its own.

2026-10-11, later: Only the asked-for step leaves the phone. The verifier receives that step, the organisation and the status; role, name and the other steps stay on the phone and are listed under Not shared ("Other steps on your card"). The card that answers also signs the job line (`transactionDataSigners`). A card issued with the list as one unit still shares the whole list.

2026-10-12: The person keeps their own record of all of this. "Your activity" (phone `/activity` personal lens, website `/activity`, and the Home strips in personal context) lists who has their data, what they shared and for what, from `holder_activity` (`HolderActivityService`, migration 114). Mapping to the EUDI ARF dashboard requirements and ISO/IEC TS 27560 consent records:

- DASH_02 (log of every presentation): one `shared` row per share with the organisation, date and time, step and reference; `share_verified` / `share_refused` add the verifier's answer and a plain reason; `share_declined` keeps the requests the person turned down ("Not now" on the share screen).
- DASH_03 (what was asked and what was given): `requested_types_json`, `requested_claims_json`, `shared_claims_json`, `withheld_claims_json` hold **claim and card-type names only**, shown in plain words (Staff card, Your role, Steps you may confirm). Claim values, the presentation and credential material are never written (handoff §30); the signed line (`signed_line`, step · job · amount) is kept because it is the purpose the person agreed to, not a card value.
- DASH_05 (identity of the relying party): `org_tenant_id` and `org_name` from the platform's organisation register, not from the verifier DID (every card is signed with one platform key, so the DID names no organisation). The identity card from the platform is attributed to the platform itself.
- DASH_07 (export): `GET /api/wallet/activity?format=csv` and "Export CSV" on both apps, every page, no role gate — the log belongs to the person.
- ISO/IEC TS 27560 consent record fields: PII principal = the wallet (`wallet_tenant_id`), PII controller = `org_tenant_id`, purpose = `purpose_label` + `stage_action`, PII categories = the claim names above, event time = `occurred_at`, consent status = `kind` + `outcome`. Receipts the person holds in their wallet (job records, leave approved) appear as `card_received` so the log and My Records agree.
- Retention: the log is append-only for the person (no delete from the UI); withdrawn cards stay listed as `card_withdrawn` so the "Who has your data" summary can say an organisation no longer holds a working card. The row carries no personal data beyond the names of fields, so it falls under the "references, not originals" retention class below.

## Wallet boundary

The holder wallet is the system of record for the holder's credentials. The organization platform is the system of record for workflow state and business outcomes.

2026-10-12: Re-issuance is holder-initiated as well as issuer-initiated. From Home → Request → My records a person asks for their staff card or receipts "on this phone" (`POST /api/wallet/credentials/resend-mine`); the issuer re-offers through the same path the organisation uses (`OrgMemberOnboardingService.sendCards`, receipts by payer match), the old card is replaced when the new one is accepted (`metadata.replaces`), and nothing about the holder is read back from the wallet. Records the platform does not hold as credentials (payslips) are not re-issued by the platform; the person is handed a plain request to the organisation instead.

The platform may keep:

- opaque credential reference
- issuer reference
- credential type/category
- status reference
- issuance/presentation timestamps
- trust/verification result
- consent/purpose metadata
- cryptographic digest where useful for integrity correlation

The platform should not retain the complete credential or presentation merely for convenience.

## Workflow evidence model

A workflow event should answer:

- what happened
- when it happened
- who/which principal caused it
- under which organization/tenant
- what policy decision applied
- what evidence reference supports the event
- what the resulting state was

It should not answer by storing unnecessary identity data or private credential contents.

## Retention and deletion

Every sensitive operational record must have a defined retention class. Default retention should be the shortest period that still supports accounting, dispute, regulatory and security requirements.

Deletion or expiry must not destroy the minimum evidence required to establish the integrity of an already completed decision. Where deletion is required but evidence must survive, retain non-reversible references/digests rather than the original personal data.

## Multi-tenancy

Every organization-scoped resource must be bound to the authenticated tenant/organization context on the server side.

Client-supplied `organizationId`, `tenantId`, `personId` or similar identifiers are selectors, not proof of authority. Every object access must perform an authorization check against the authenticated principal and tenant context.

## Interoperability

The platform should use standards-native metadata and protocol endpoints so that a credential can move between issuer, holder and verifier implementations without requiring Credentis-specific wallet APIs.

Business modules must depend on an SSI abstraction such as `CredentialReference`, `VerificationResult`, `PresentationRequest` and `AuthorityDecision`, rather than on a particular JWT/JSON-LD/SD-JWT representation.

## Implementation consequence

The platform remodel should therefore grow in this order:

`Identity/tenant boundary -> Authority/delegation -> Policy decision -> Generic request/workflow -> Module execution -> Evidence/outcome -> SSI issuance/presentation`

The existing Fastlane implementation remains a reference workflow and is not the architectural boundary for future modules.
