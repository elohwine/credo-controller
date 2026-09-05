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

## Wallet boundary

The holder wallet is the system of record for the holder's credentials. The organization platform is the system of record for workflow state and business outcomes.

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
