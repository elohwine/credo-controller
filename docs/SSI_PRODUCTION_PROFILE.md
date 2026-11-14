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

### Which steps ask for a wallet share (2026-10-30)

A share screen (the card, the claims it reveals, "I agree") is shown only where one of three things
is true. Everything else is a signed-in step decided by the server (`AuthorizationService`,
`stepAssuranceFor`), with no share screen.

1. **There is no session yet.** The share *is* the sign-in: wallet login, phone sign-in, partner
   sign-in, the optional "Enter with a staff card" org entry, a contact check. The server turns the
   verified share into a session; it never uses the presentation itself as the permission for later
   calls (OpenID4VP issue 695).
2. **Someone else must check later who acted.** Job sign-off, a supplier's payment proof, the
   remittance advice, resolving a dispute. The share is evidence that crosses an organisation's
   boundary (see the paragraph above).
3. **Money leaves.** Paying a worker for a job and releasing funds for a purchase. The card signs the
   amount and the job (`transaction_data`, OpenID4VP 1.0 §8.4), the same "what you see is what you
   sign" link PSD2 RTS Art. 5 asks of a payment confirmation.

Approving a purchase, payment, expense claim or salary advance offers the card and requires it only above the organisation's
amount (`cardRequiredAbove`): step-up for higher-impact actions (NIST SP 800-63-4) and a
low-value exemption in the spirit of PSD2 RTS Art. 16. Asking for a share where nothing is
checked is consent theatre: it trains people to tap "I agree" without reading (consent and
warning fatigue), so a share the server does not verify is either verified or removed.

| Step | What it needs | Key |
|---|---|---|
| Wallet login, phone sign-in, partner sign-in, contact check | Share, verified, becomes a session | `wallet_login`, `partner_sign_in`, `contact_check` |
| Enter an organisation | Session; staff card optional | `organization_entry` |
| Job sign-off | Share, always | `field_ack` |
| Pay a worker for a job | Share, always, signs amount and job | `field_payout` |
| Job checkpoints, evidence, inspection | Session | — |
| A custom workflow step set to "needs proof" | Share (the template author's choice; `requireProof` defaults to true) | step's own key |
| Approve a purchase or payment | Session; card offered; card required above the org's amount or when set to "always" | `requisition_approval` |
| Approve an expense claim or salary advance | Same as a purchase approval (money is committed); checked against the step itself | `stage:approve_request` (assurance from `requisition_approval`) |
| Any request approval the organisation marked "needs the staff card" (Settings → Who approves requests) | Share, always | the step's key; the usual approver of a purchase or payment keeps `requisition_approval` |
| Finance as a later approval (from an amount up) | "Needs the staff card" is switched on when finance is added; the organisation can turn it off | `stage:finance_approve_requisition` |
| Release funds for a purchase | Share, always, verified before money moves | `requisition_release` |
| Confirm a purchase was delivered / mark a purchase order delivered | Session | `requisition_ack` |
| Mark a payment request paid | Session | `payment_record` |
| Supplier bill: payment proof, record payment, remittance, resolve a dispute | Share, always | `ap_workflow_proof` |
| Supplier bill: issue the receipt | Session (the receipt itself is the record that crosses over) | — |
| Leave and general requests | Session, unless the organisation marked the approval "needs the staff card" | — |

Every request step reads one rule (`PlatformRequestService.cardRuleFor`): the transition guard, the
decision the apps show (`staffCard`, `cardRequired`) and the share the wallet answers. The share
screen is the job sign-off one on both apps: the step, the request and its amount (signed as
`transaction_data`, with the currency), who is asking, what the card reveals and keeps back, and
"I agree". A marked request step asks for that flow's staff card (the person Who does what names,
including the organisation's main approver), not the platform identity card.

Sources: OpenID for Verifiable Presentations 1.0 §8.4 (transaction data); EUDI ARF OIA_05–07 and
RPA_10a (show the relying party and the attributes, ask approval, allow selective disclosure,
approve all or none); W3C VC Data Model 2.0 privacy considerations and the VC implementation guide
on data minimisation; NIST SP 800-63-4 (assurance proportional to impact); PSD2 RTS Arts. 5 and 16;
"Don't Annoy Me With Privacy Decisions" (IEEE Access, 2023) on consent fatigue.

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

## Personal data, custody and recovery (2026-11-04)

This is the answer to the question a regulator asks: what personal data the platform holds, where a person's wallet actually lives, and what happens when a phone is lost. It describes the code as it is. It is not a claim that the platform stores nothing.

### What "user-centric" means here, and what it does not

The person holds the claims that are about them — name, phone number, date of birth — inside their own card, and they choose what to show. A public check of a record answers about the record (the job, the amount, the organisation, whether it is still valid). It does not answer about the person.

The keys that sign those cards are not on the phone. They are in one server-side wallet store (Askar), one profile per person, opened with a single `WALLET_KEY`. The phone holds a separate device key in the Android keystore, used to sign in with fingerprint or face and to confirm a payment. It does not hold the card-signing key. This is a custodial wallet: the platform can open the person's wallet because the platform holds the key. That is a real choice, and it is the opposite of the European Digital Identity Wallet rule that the person has sole control of their keys and that those keys are not extractable (EUDI Architecture and Reference Framework 2.4, wallet provider responsibility and the Wallet Secure Cryptographic Device; https://eu-digital-identity-wallet.github.io/eudi-doc-architecture-and-reference-framework/2.4.0/architecture-and-reference-framework-main/).

### What is stored, and in what form

Looked up by a keyed hash, never the value itself (`ssi_users`):

- Phone number and email address: HMAC-SHA256 under `CONTACT_HASH_PEPPER` (`src/services/ssi/contactHash.ts`). A plain SHA-256 of a Zimbabwean mobile number is not a pseudonym. The number is `2637` plus seven digits, so hashing every possible number recovers the real one in under a second. A keyed hash has no such shortcut. Accounts opened before this change still hold the old open digest until the person next signs in, which is the moment the number is in hand and the row is rewritten. `contact_hash_version` marks which rows are done (migration 147).
- PIN: a slow per-account hash (scrypt, its own salt) in `pin_hash` (`src/services/ssi/pinHash.ts`). The older form was one SHA-256 over a salt shared by every account, which a stolen database reverses for every PIN at once. An old PIN still signs in, and is replaced with the slow hash on that sign-in. Five wrong PINs against one account lock it for 15 minutes. There is no forgotten-PIN reset. Changing a PIN needs a device the person has already enrolled.

Kept because a message, a bill or a team list cannot be sent without it. These are plaintext, on purpose, and they are the personal data the platform does process:

- `org_contacts` — the name and phone number an organisation saved for its own team or a client.
- `payment_links.payer_phone`, `ack_payments.payer_phone`, `ar_payment_plans` payer name, phone and email — who a bill was sent to, so a receipt can be matched and sent again.
- `notification_preferences.phone` and `notification_deliveries.recipient` — the number a person asked to be reached on.
- `member_invites.proposed_name` — the name the organisation suggested, which the person confirms or replaces.
- `audit_logs.ip_address` and `user_agent` — the organisation's own security log. An IP address is personal data. It is not on a public page. There is no retention limit on these rows yet. The application log (`src/utils/pinoLogger.ts`) drops a name, phone, email, PIN or date of birth when a service passes one under those field names. The historical log file on disk was not re-read for this review.

Not kept:

- The issued-card register (`issued_credentials.credential_data`) used to hold the whole card, including name, phone, date of birth, photos and notes, and `GET /api/verify/{id}` (no sign-in) handed those claims to anyone who had the reference. From migration 145 the register keeps the card's type, dates and standing, plus a SHA-256 digest of the document as issued, and drops the person's own claims. The public answer is an allow-list (`src/services/ssi/publicRecordClaims.ts`): a claim is shown only when it names the work, the money or the organisation. A claim the allow-list does not recognise is withheld.
- The public check log (`vc_verifications`) used to store the caller's IP address and browser, and its history page returned them. It now stores a short salted hash of the address (migration 146). The history page no longer returns it.
- `ssi_users` does not hold a name, a date of birth or a national id.

A guest checkout keeps the phone encrypted for 24 hours (`temp_phone_links`, AES-256-CBC under `PII_ENCRYPTION_KEY`) so the person can claim that session when they sign up. Expired rows are skipped on read. Nothing deletes them on a schedule, so an expired encrypted phone can sit until the next cleanup.

In production the server refuses to start if `CONTACT_HASH_PEPPER`, `PIN_SALT`, `PII_ENCRYPTION_KEY`, `JWT_SECRET` or `WALLET_KEY` is missing. A default written in the source is a published value, and this repository's env files were committed once (`docs/SECRETS_ROTATION.md`). Local development still runs on the documented development values and says so in the log.

### Backup and a lost phone

There is no recovery phrase, no seed export, and no encrypted backup file the person can download. `scripts/backup.sh` copies the operational database and the wallet store into a tar and keeps the last seven. The wallet file is still protected by `WALLET_KEY`. The database file is not encrypted, so a backup is a copy of the contacts, the bills and the keyed hashes. The config file in that tar has its secrets removed; the database does not. The phone screen that talks about "Backup & Recovery" (`SyncDialog`) calls `/api/ssi/auth/sync`, and that endpoint does not exist. The component is not used by any screen.

Recovery works because the wallet is on the server. A person who loses the phone signs in on another phone with the same number and PIN, then enrols that phone (`device_keys`, confirmed with the PIN) and can revoke the lost one. Cards, receipts and staff cards are still there, because they were never only on the device. The lost phone's existing session stays valid until it expires or the PIN is changed, which is the one action that ends other sessions.

What the phone does keep locally is a cache: the session token, the person's name and number, and a copy of card claims for offline use (`credoOffline.v1`). In the browser that cache is plain. On the Android app it is encrypted with a key that is stored beside it, and Android backup is set to exclude the app's data. Clearing the phone does not delete the account.

Deleting an account is not self-service. The privacy notice tells the person to write to the operator. An administrator can delete a tenant, which removes that wallet profile and does not by itself remove the account row, the contacts, the bills or the register.

This is the custodial end of the range other systems use:

- The EUDI Wallet's migration object records which cards the person held and who issued them, and must not contain the attribute values or the private keys. A lost phone is recovered by revoking the old wallet and having each issuer issue the cards again (CIR 2024/2979 discussion of export, requirements Mig_01 to Mig_05; https://eudi.dev/2.0.0/discussion-topics/n-export-and-data-portability/). Technical specification TS10 describes the same file as password-protected, with device-bound cards re-issued rather than copied (https://github.com/eu-digital-identity-wallet/eudi-doc-standards-and-technical-specifications/blob/main/docs/technical-specifications/ts10-data-portability-and-download-(export).md).
- Microsoft Entra Verified ID keeps the credential in the person's Authenticator app. Backup is an export protected by an 11-word passphrase, or the issuer issues the credential again (https://aka.ms/VerifiedIDFAQ, "Can a user back up a Microsoft Entra Verified ID credential?").
- Hyperledger Indy's own privacy note is that keys and personal data stay at the edge, and the ledger holds schemas, credential definitions and revocation state, not the credential (https://www.lfdecentralizedtrust.org/blog/2018/09/12/privacy-by-design-in-hyperledger-indy).
- walt.id's mobile wallet keeps credentials in an encrypted database on the phone and signing keys in the Android keystore or the iOS keychain (https://docs.walt.id/community-stack/mobile-wallet/security). Recovery is a secret handed to a recovery provider; on iOS a Secure Enclave key cannot be restored onto another phone, so the choice is a non-exportable key or a recoverable software key (https://docs.walt.id/community-stack/mobile-wallet/backup-and-recovery). ISO/IEC 18013-5, the mobile driving licence, is one of the formats that wallet presents in person, with only the requested claims leaving the device (https://docs.walt.id/wallet).
- Dock's Cloud Wallet is a backup held by the issuer's operator, encrypted with a key from the person's biometric, and Dock's description says the server cannot read the unlocked wallet (https://www.dock.io/post/introducing-credential-recovery-ensuring-seamless-access-to-your-digital-credentials-anywhere). That claim depends on the biometric provider and was not re-tested here.
- Trinsic moved the other way: from a wallet that lived only on the device to a custodial wallet in their cloud, so a product can keep working when the phone is gone (https://trinsic-docs-pr-tm-docs-migration.netlify.app/learn/migrate/). That is the same shape Credentis has now.

Credentis today is closer to a bank's card vault than to those three: the operator can restore the wallet because the operator holds it. Moving to the EUDI shape — keys on the device, recovery by re-issuance, a migration file with no attribute values — is a product change, not a configuration change. Until that change, the honest description is custodial, and the controls that matter are the single wallet key, who can read the database, and the PIN lock.

### A shared ledger, if one is added

A future Hyperledger Fabric (or Fabric X) network is a shared log between organisations. It is not a second copy of the database. The rule, which matches both Indy and the European Data Protection Board's Guidelines 02/2025 on blockchain (paragraphs 50–52 and 102–104; https://www.edpb.europa.eu/system/files/2026-07/edpb_guidelines_202502_blockchain_v2_en.pdf):

- On the ledger: a credential's reference, its type, its status (valid, withdrawn), and a hash of the document as issued. Nothing that names a person.
- Never on the ledger: a name, a phone number, an email address, a date of birth, a national id, a photograph, a note, a plaintext credential, or a hash of any of those that was computed without a secret key. The Board's point is that a hash or an encrypted copy written on a chain is still personal data, and a chain that cannot be edited cannot honour a request to delete it. Technical impossibility is not a defence. So the personal data stays off the chain, where it can be deleted, and the chain keeps only what is still true after that deletion: "this reference was issued, and it has been withdrawn."
- The same register the platform already keeps (`issued_credentials`, redacted, with `credential_digest`) is the off-chain record. The ledger would publish the digest and the status, not a new copy of the card.

### A public transaction explorer does not fit (2026-11-05)

Bitcoin and Ethereum explorers (Blockchain.com, Etherscan and the rest) list every transfer: the two addresses, the amount, the time, and the links from one transfer to the next. That page exists because those networks can only agree on the next block if every participant can see every transfer. An address is a pseudonym, not anonymity. Grouping addresses that spent together routinely ties them back to one holder (Möser and Narayanan, "Resurrecting Address Clustering in Bitcoin", 2021, https://arxiv.org/abs/2107.05749). The European Data Protection Board treats a public key, a wallet address and the other traces on a chain as personal data when they can identify someone with extra information (Guidelines 02/2025 consultation report, the note added at paragraph 30; https://www.edpb.europa.eu/system/files/2026-07/edpbreport_publicconsultaton_guidelines_blockchain_202502_en.pdf).

Credentis payments are not that. A school fee, a wage and a job bill are between named people. A page that listed them, even with the names taken off, would still show the organisation, the amount and the time, which is often enough to tell who it was. Publishing that list would also fight the minimisation rule already in force (section 7 of the Cyber and Data Protection Act): the platform does not need the world to see every payment in order to move the money.

What already covers the honest part of the idea:

| Who is asking | What they can open | What they cannot do |
| --- | --- | --- |
| Anyone who already has a record reference | "Check a record" (`GET /api/verify/{id}`, the same panel on both apps). Standing, type, issuer, and the allow-listed work, money and organisation fields. | Search by person, phone or organisation. There is no list of recent records. |
| Anyone who was sent a pay link | The bill at `GET /api/public/pay/{code}`, including the payer's name on that bill, because the link is the bill. | Browse other people's bills. The code is the permission. |
| A signed-in owner or auditor | `GET /api/audit/logs` for their own organisation. | Read another organisation's log. |
| The person | "Your activity": what they shared, with whom, and when. | See someone else's activity. |

A shared-ledger explorer, if Fabric is added, may look up one reference and show its type, status, digest and time. It may not offer "latest transactions", a search by name, or a search by organisation. The check page above is that explorer. A second one would only repeat it, or it would start listing people.

### The duties this has to meet

Zimbabwe's Cyber and Data Protection Act [Chapter 12:07] (Act No. 5 of 2021) makes POTRAZ the Data Protection Authority. The text POTRAZ publishes (https://www.potraz.gov.zw/wp-content/uploads/2022/02/Data-Protection-Act-5-of-2021.pdf) requires, among other things: data that is adequate, relevant and not excessive, and not kept identifiable for longer than necessary (section 7); consent for non-sensitive data, with listed exceptions (section 10); a higher bar for sensitive data and written consent for biometric, genetic and health data (sections 11 and 12); security measures matched to the data and the risk (section 18); notice to the Authority within 24 hours of a breach (section 19); notice to the Authority before automated processing (section 20); and no transfer out of Zimbabwe unless the destination protects the data adequately or a listed condition applies (section 28). The 2024 licensing regulations (SI 155 of 2024, https://www.potraz.gov.zw/wp-content/uploads/2025/02/sI-155-of-2024-Cyber-and-Data-Protection-Normal_240913_1250178.pdf) add a licence for controllers who decide what is collected and process it commercially, a data protection officer for a licensed controller, and, for a breach likely to harm people, notice to those people within 72 hours (regulation 17). POTRAZ's own breach note repeats the 24-hour notice and the DP3 form (https://potraz.zw/wp-content/uploads/2026/03/Data-Breach-Notification-an-handling-final.pdf).

Two consequences for this platform, stated as engineering facts rather than legal advice. First, the plaintext list above is the processing that has to be notified: contacts, bills, and the numbers people asked to be reached on. The keyed hashes are still personal data for as long as the pepper exists, because the pepper makes them reversible to someone who holds both; they stop being linkable to a person only if the pepper is destroyed. Second, a ledger that cannot be edited must not be where any of that data is written.

## Implementation consequence

The platform remodel should therefore grow in this order:

`Identity/tenant boundary -> Authority/delegation -> Policy decision -> Generic request/workflow -> Module execution -> Evidence/outcome -> SSI issuance/presentation`

The existing Fastlane implementation remains a reference workflow and is not the architectural boundary for future modules.
