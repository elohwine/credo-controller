## Shared-browser follow-up: request details and credential offers

- Live SGK acceptance exposed an organisation request opening the personal
  `/mine/{id}` endpoint. Operational rows now retain their organisation context;
  both clients reject empty/mismatched details rather than rendering a fabricated
  "Request / Draft". Missing personal details return 404. Purchase requests use a
  descriptive type, not their initiation CTA.
- List and detail progress now use the same persisted events. The existing SGK
  materials request shows its actual actors/history, purchase-request type and
  4/5 progress; the unrecorded fulfilment step is not invented. History Table and
  parent job -> purchase-request navigation were exercised in the shared browser.
- Credential operations reuses the original branded cards, modal and claims-form
  presentation found in Git commit `497f84c`. A clean card catalogue, focused
  issuance popup and dedicated offer page replace the always-visible raw form.
  Offers and issued credentials have separate tabs; lifecycle actions request a
  reason in a confirmation dialog.
- Tenant-seeded definitions are capabilities, **not tenant selections**. The new
  catalogue follows the existing questionnaire/entitlement/workflow configuration
  and enabled record settings. Unconfigured, disabled and foreign templates add
  nothing; unrelated health/commerce/staff models do not appear on SGK. Direct
  issuance and replacement enforce the same catalogue server-side. Source-backed
  records keep their workflow approvals/evidence; generic configured types are
  not guessed from sector names.
- The original offer-page presentation now reads an existing pending offer through
  an owner/admin, issuer-scoped API. It does not issue on page load or treat opening
  a wallet as acceptance. Expired/accepted/resolved offers cannot supply a current
  link. Copy failures are visible; the raw link is collapsed by default. Legacy
  issuance entry pages lead to the same workspace; explicit verification mode is
  preserved.
- Live SGK browser checks confirm the scoped catalogue and existing pending-offer
  page. Some historical offers contain `localhost` addresses: the page explicitly
  warns they cannot be redeemed from a phone. Resending the same link cannot fix
  its origin; source-controlled replacement is required. No records were replaced,
  revoked or accepted during these read-only checks.
- Focused credential/questionnaire regression: **3 suites / 25 tests pass**.
  Isolated browser checks exercise required claims, typed numeric/boolean/structured
  values, backend/schema failures, holder-identity override rejection, source-flow
  gates, narrow cards and the dedicated offer page. Fixture submissions are not
  live issuance evidence.
- The request follow-up reached **12 suites / 182 tests**. Portal typecheck and
  integrated TSOA/OpenAPI/API build pass; credential catalogue/controller lint is
  clean. The previously delivered Android 1.0.15 (16) predates these follow-up
  request-detail fixes and is not evidence of their installed-device acceptance.

Still outstanding: the raw commerce-oriented New Request form, the complete live
family create/action/outcome matrix, installed-phone acceptance, and configured
consented WhatsApp delivery. This follow-up does not declare the architecture plan
complete.

## Shared request experience: implemented increment

The request layer now has one data-only
[experience contract](../src/config/requestExperience.ts), consumed by both apps.
It reuses the existing request lifecycle, workflow engine, actor resolution,
history and related-work components; it is not another workflow engine.

### Behaviour

- Exact family declarations cover purchases/AP, collections/AR, fees,
  commerce, staff and field requests. An unknown request name uses an explicitly
  logged generic review, not a requisition guessed from name fragments.
- A tenant's persisted workflow template can declare its family, review action,
  optional fulfilment action, phase labels and decision-only semantics.
  The owner/admin-only
  `PUT /api/organizations/{orgTenantId}/workflows/{templateId}/request-experience`
  accepts `{ expectedVersion, experience }`. Revision checking and saving occur
  in one SQLite transaction. Foreign templates, stale revisions, unsupported
  actions, versions and phases fail explicitly.
- These declarations also supply actor requirements to existing setup/readiness
  reports and determine request inbox routing. Metadata does not register new
  executable actions, grant permissions, waive proofs or activate modules.
  Existing payment-request follow-up retains its `record_payment` actor.
- Request lists/details include resource-bound progress. Portal operational
  requests offer Cards/Table; personal requests on portal and mobile use the same
  progress projection and existing history Timeline/Table components.
  Details load persisted events and actor names. Late responses from a previously
  selected personal request cannot overwrite the next selection.
- Review completion uses the decision event's actor/time, not the review-start
  actor/time. Resubmission begins a fresh progress attempt while retaining old
  events in history. Declined/cancelled/expired work does not complete later steps.
  Leave approval needs no invented finance release or FEPT checkpoint.
- Inbox cards carry authoritative request identity, including custom request
  names and delegated cards. Notifications link to an exact `inbox?item=...`
  when a recipient-owned item is available; foreign-holder/organisation items
  cannot provide that link. Missing items display an explicit unavailable message.
  Opening a link does not approve the task or submit a proof.

### Verification and delivery

- **11 suites / 175 tests pass**, covering request experiences, request-type SSI,
  request families/handoffs, workflow handoffs, task context, organisation
  configuration/readiness/membership and transactional notifications.
- Backend, portal and mobile typechecks pass. Focused metadata/repository/routing
  lint passes. TSOA routes/OpenAPI were regenerated and patched; integrated API
  compilation and the Android release build pass. Mobile's web release command
  skips its own lint; this is not a claim of a full repository lint pass.
  A broader check of the existing organisation controller/request service remains
  non-clean with formatting/import debt; unrelated file-wide reformatting is not
  included in this increment.
- Intercepted-API browser checks on both apps verify leave and
  purchases/AP/AR/fees/commerce/field progress, a custom equipment declaration,
  recorded actors in history Timeline/Table, late-detail isolation, and exact
  inbox selection without approval. Portal operational Table opens the existing
  request detail/history. These are UI checks, not live per-family delivery.
- Signed APK **1.0.15 (16)** includes this request UI. Signature, packaged version,
  Capacitor App plugin and wallet schemes were checked. It targets the current
  HTTPS test tunnel; tunnel availability remains necessary.
- The local API was rebuilt/restarted. Migration 125 and its template metadata
  column are persisted. Local/tunnel health and portal sign-in return HTTP 200;
  the new configuration route returns 401 without authentication. An isolated
  real Credo holder still resolves a live signed login request and rejects a
  changed outer `client_id`.

### Scope and remaining gates

This contract describes **request progress**, not arbitrary workflow-run
execution. Approval/completion of a request does not establish payment
settlement, credential issuance, holder acceptance or closure of its whole
related-work family. Existing specialist finance/FEPT and credential operations
surfaces remain authoritative for those states. No second child history is added.

Future supported request types need a valid domain/create handler and existing
authorisation/module/proof policy, a tenant template declaration (or a code-owned
family declaration), configured actors and legitimate source events. The shared
list/detail/inbox renderer then needs no new per-type switch. Publication in the
request catalogue and specialist business outcomes still require explicit wiring;
this does not make arbitrary templates executable.

Template experience configuration is resolved live, not snapshotted per request.
There is currently no dedicated visual editor for this metadata. Full live
create -> actor action -> related outcome journeys across every family remain
an acceptance gate. Installed-phone cold/warm links and approval-to-portal login
remain unverified; WhatsApp needs approved sender/template/consented-recipient
configuration before live acceptance. No live messages or payments were sent
in this increment. Service broadcasting remains deferred.

## Local phone-to-portal wallet sign-in

- Start the API with `PUBLIC_BASE_URL` set to its public HTTPS tunnel before agent
  initialization; the APK API URL and OID4VP request/response URLs must reach the
  same API instance. The local portal can use localhost for that same instance.
- CORS admits Capacitor's `https://localhost` / `capacitor://localhost` origins,
  the wallet sign-in `x-login-poll-token`, and the ngrok warning-bypass header.
- Portal and mobile PIN login use one phone-or-email field. Portal wallet polling
  stops when the QR dialog closes, a newer attempt starts, or the page unmounts.
- A build, a displayed QR, and successful pending polling do not establish a
  completed native wallet login; scan, holder approval, and portal session
  collection still need to be exercised on the installed APK.
- Authorization links now preserve the complete SDK-generated request in wallet
  login, partner verification and workflow stage proofs. Rebuilding a link from
  only `request_uri` discarded `client_id` and caused real holder resolution to
  fail before consent. An isolated real Credo holder resolved a live signed login
  request after this fix and still rejected a deliberately mismatched `client_id`.
  This verifies request resolution, not physical-phone login completion.

## Wallet scanning and contextual Home actions

- Scan offers camera or paste without first choosing an exchange type. OpenID4VP
  sign-in/sharing requests go to the existing personal-holder credential
  selection and consent screen, never the credential-offer acceptance endpoint.
  Previously, choosing “Save Credential” incorrectly sent presentation requests
  to issuance and could report an expired offer.
- Credential-offer QRs retain their existing acceptance path; unknown QRs are
  not treated as offers by the default scanner. Explicit workflow scan modes
  and their requisition/run context remain supported.
- Home keeps Scan and one contextual Request entry, plus its existing
  pending-work/inbox sections, rather than duplicate receive/share/pay/navigation
  buttons. Removing Request entirely was a regression: the existing request sheet
  is mounted again. Members can request items/purchases where purchases are
  selected, leave/expenses where staff tools apply, records again, and services
  from other organisations. The API still checks membership and work-area access.
  Request choices/status words now have one shared implementation for both apps.
  Field-job shortcuts require employee context, an active field workflow and
  assigned work. Organisation scan actions are hidden in personal context even
  if an organisation token remains stored.
- QR dispatch has 12 regression cases. Browser checks with intercepted APIs
  verify presentation routing, offer acceptance and simplified personal Home;
  they do not prove cryptographic verification or native phone sign-in.
- Native scanning offers camera or manual paste before requesting camera access;
  a camera failure is no longer required to paste a copied wallet link.
  The Android app registers the supported OpenID wallet schemes and uses the
  Capacitor App plugin for warm/cold link events. This is custom-scheme handling,
  not verified HTTPS app-link association for an arbitrary tunnel domain.
- The preceding signed Android test build was **1.0.14 (15)**. Its packaged signature,
  Capacitor App plugin and wallet-scheme declarations were checked. Launch URLs
  are consumed once rather than replayed on each navigation, while a subsequent
  warm-link event can reopen the same request after leaving its consent screen.
  Installed-device cold/warm navigation and approval-to-portal completion remain
  unverified because no Android device was attached.

### Verification boundary for this increment

- Eight combined suites pass **94 tests**, covering canonical wallet/partner
  request URLs, missing-request failures, QR dispatch, member item requests,
  organisation configuration/readiness gates and transactional notifications.
- The integrated API build, portal typecheck and signed Android release build
  pass. The restarted local API, public tunnel and portal login respond; an
  isolated real holder still resolves a live signed request and rejects a
  mismatched outer `client_id`.
- Real phone approval and WhatsApp provider acceptance/delivery are not implied
  by these tests. No live WhatsApp messages were sent.
- At that milestone the shared future-flow contract and broad
  purchases/AP/AR/fees/commerce/staff rollout were outstanding. The shared request
  increment above supersedes that status for request presentation/routing, not
  for every specialist business journey.

## Wallet credentials are held under the person's own key (latest)

- Accepting an offer and sharing a proof now run in the person's own wallet. Each credential
  is bound to that wallet's own key, so only that person can present it. Before this, every
  card was bound to the platform's key, and wallet sign-in could not prove who held it.
- Cards already in wallets are replaced automatically, with the same details from the same
  issuer, at PIN sign-in or when the inbox loads. The old copy is withdrawn as "replaced".
  Withdrawn cards are not brought back.
- Checked locally on existing accounts:
  - a platform identity, organisation staff cards (SD-JWT), job and request records, and a
    checkout receipt were all replaced;
  - wallet sign-in then succeeded, and a replayed answer was refused;
  - a payout proof from the owner's wallet was accepted by the organisation's verifier.

## Inbox acceptance follow-up: isolated local browser verification

The next acceptance order is inbox/task-context parity first, then the SGK job and
billing journey. Verification found and repaired two additional UI-context gaps:

- All supported task-route branches now reject conflicting item identifiers,
  repeated identity parameters and conflicting run aliases. Photo, payment,
  requisition and proof links cannot introduce another business item. The job-card
  route cannot be used to change to another finance tab. Proof-session request IDs
  remain distinct from business-item IDs.
- Portal organisation-switch responses and the mobile inbox consent/switch flow
  check that the initiating account/task context has not changed before applying
  the result. A delayed switch cannot overwrite a newer stored account/task choice.
  A failed portal switch no longer ends a different task selected while it waited.
  This guard does not establish that every asynchronous data loader is race-safe.

Seven new route cases failed before the shared guard fix. The final focused
regression set passes **10 suites / 114 tests**, including the actual portal switch
helper with delayed responses, shared route checks, existing run-access decisions,
assignment lifecycle, truthful billing/history and two-player field jobs.
Backend, portal and mobile typechecks pass. No controller contract changed in this
follow-up, so API regeneration was not required.

The earlier separate organisation-configuration baseline was **6 passing / 5 failing**;
the bounded setup-contract follow-up below supersedes it. Focused root-test lint also
reports existing dependency/import and fixture-accessibility rules; lint is not
claimed clean.

### Organisation setup contract follow-up

The later focused baseline was **13 passing / 8 failing** across configuration,
readiness resolution and execution gates. Fixture-only repair reduced this to
**18 passing / 3 failing**: the fixture had ignored `{ setup: 'new' }` and seeded
no setup rows after migration 117. It now explicitly mirrors new provisioning
(`unconfigured`) and migrated organisations (`legacy`), with project-local databases.

The remaining service defects are repaired:

- Scope answers (kinds, modules or operating model) require the current revision
  on both legacy and explicit configurations. Staff-card settings alone do not.
- Legacy staff-tool saves retain their effective finance/kind-derived scope.
  Explicit selections remain separate from entitlements; an unentitled selection
  stays selected but cannot run.
- Catalogue template identities and their instantiated IDs are shared by setup
  gating and readiness resolution, rather than trusting generic `finance` or
  `utilities` categories. Meaningful custom categories retain their fallback.
- Module removal checks requests and concrete workflow identities. Pending,
  running and paused runs block removal; completed, cancelled and failed history
  remains readable and unchanged. Retrying failed history rechecks selected scope
  and readiness before changing the run.
- Direct starts and nested `workflow.start` / `workflow.trigger` starts enforce
  the child workflow's scope. SSI prerequisites and checkpoint proof logic are
  unchanged; these tests do not establish live wallet proof acceptance.

Validation: `NODE_OPTIONS=--experimental-vm-modules npx jest
tests/org_configuration.test.ts tests/org_readiness_resolver.test.ts
tests/org_readiness_gate.test.ts --runInBand --forceExit` passes **3 suites / 28 tests**.
Adding `tests/stage_proof_dcql.test.ts` and `tests/workflow_handoff.test.ts` passes
**5 suites / 47 tests**, including organisation-template-specific prerequisites.
Backend (`npx tsc --noEmit -p tsconfig.build.json`) and focused service/test
typechecks pass. Earlier runs encountered transient errors in concurrently edited
outbox/request services; the final checks pass without edits to those parent-owned
sections. No controller or generated API contract changes were required.

| Acceptance area                                                           | Evidence                                                                                                                           | Remaining requirement                                       |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Same-item routing, proof/photo/payment links, duplicate/conflicting IDs   | Automated regression pass                                                                                                          | Mounted portal/mobile browser journeys                      |
| Stored account/task changes while switch response is pending              | Shared guard and actual portal-helper tests pass                                                                                   | Cross-tab and mobile interaction acceptance                 |
| Personal-context restoration and same-org entry                           | Shared portal close/current-stage inbox verified; shared mobile consent, reload, close and manually active same-org entry verified | Completion, expiry/error and linked-child browser matrix    |
| Current vs former worker, inactive membership, checker, audit-only access | Existing controller/access regression pass                                                                                         | Production-authenticated actor journeys                     |
| SGK assignment/materials/billing/history                                  | Existing focused and two-player regression pass                                                                                    | Live end-to-end demonstration without real provider effects |
| Linked-child navigation and all delayed data loaders                      | Not established by these tests                                                                                                     | Explicit item-scoped browser acceptance                     |

An isolated local API and portal now run against session-specific SQLite/Askar data,
without provider credentials or real messaging/payment effects. The shared browser
verified personal inbox → organisation consent → assigned job in a task-only shell.
Starting the job persisted `await_arrival`; reload showed the arrival controls.
Closing returned to the personal inbox, whose existing job continuation now says
“Confirm arrival”. The initial immediate snapshot preceded this refresh; it is not
evidence of a failed start. The logged `WORKFLOW_PAUSE` was expected control flow,
not an action failure; it no longer produces an error-level “Action failed” entry.

Fresh-organisation issuance exposed a missing JobAssignment model registration,
now repaired with a first-use regression. The latest focused assignment, route and
portal-switch run passes **3 suites / 50 tests**; the later combined job, access,
handoff, proof, context and two-player run passes **8 suites / 99 tests** with
open-handle detection. All three typechecks pass.
Portal and mobile step submissions now check the shared result assertion before
showing success, including when HTTP succeeds but the workflow result reports failure.
Mobile shared-browser login and current-stage inbox loaded. Receipt sync exposed
missing context headers in the API CORS allowlist; all three existing mobile headers
are now permitted, verified by an HTTP 204 preflight against the rebuilt local API.
Browser focus emulation resolved hidden-tab animation-frame suspension without app
changes. Normal shared-browser mobile clicks then verified consent → exact arrival
step, checkpoint form, reload, close → personal inbox, and the same path when the
organisation was already manually active. Task mode now hides the account/settings
entry points and organisation-wide bottom navigation. Its header sits below the
task drawer so the real close button remains clickable at phone width; ordinary
personal/organisation shell behaviour is unchanged. Browser assertions confirmed
zero bottom-nav/settings entry points during the task and personal context on return.

The complete SGK billing/materials journey, task completion/error/linked-child matrix
and browser permission-denied background queries remain outstanding. No real payment,
message or external-wallet cryptography pass is claimed; no pilot data was changed.

## Linked parent-child navigation closure (latest)

- Related work links now open explicit server-linked children and parents inside the same inbox task scope, without allowing unrelated organization routes.
- Existing timelines/history views were kept; they now show compact “Open …” actions for recorded related items instead of adding a second timeline.
- Mobile and portal both preserve the original task `startedAt`, admit only validated linked targets, and reject stale/cross-org/context-changed path extension.
- Portal request deep links now load the exact request item during task mode (not broad list loaders), and close/back returns to personal inbox without triggering a new org-switch prompt.
- Mobile sheet back handling now respects task route history for parent/child navigation and no longer strips task URLs as generic drawer history.

Validation:

- Focused tests: `tests/inbox_task_context.test.ts` + `tests/job_workflow_alignment.test.ts` (**2 suites / 52 tests passed**).
- Combined regression: assignment + run access + handoff + task context + stage proof + SGK + portal org context (**8 suites / 109 tests passed**).
- Typechecks: mobile, portal and backend build configs all pass.

## Materials and wallet sign-off: latest isolated acceptance

The shared portal/mobile journey now reaches a closed local demo job through the
existing engine, not a second workflow or timeline:

- Owner approved the linked USD10 materials request. Approval left the parent held
  at receipts; it did not imply that materials had been bought.
- The linked request's family strip had accidentally hidden approval, receipt and
  completion controls. Only redundant routing explanations now depend on whether
  a family strip exists; actions and the recorded receipt remain visible.
- Owner completed the purchase through the existing receipt form with an explicitly
  labelled synthetic receipt. An empty save was rejected. A transient connection
  reset did not record completion; after checking that state, retry saved exactly
  one completion event with the owner as actor.
- Mobile reused that purchase receipt and its SHA-256 hash in the parent, then
  advanced to after photos. The worker submitted a labelled synthetic after photo
  and simulated GPS. These are test fixtures, not evidence of actual site work.
- Owner reviewed the photos/receipt and recorded a clearly labelled demo review.
  Sign-off then required the actual personal wallet's staff credential.
- Portal had silently omitted staff/role credential offers from personal inbox.
  It now uses the existing record acceptance path with the personal token, while
  organisation record offers keep their organisation token and storage scope.
- Wallet review now displays loading, missing-request, no-match and failure states
  instead of silently falling back to the records list. Retry and a simulated 503
  were verified in the shared browser; no Share action was exposed on failure.
- A failing regression reproduced portal task scope rejecting its own wallet proof
  review route. The guard now admits only approval review with one request source,
  the same organisation and the same job/requisition. General wallet navigation,
  conflicting identifiers and unrelated items remain rejected.
- After an old proof session correctly reported expiry, a fresh request completed
  the real local holder presentation and proof-complete calls (both HTTP 200).
  SQLite records the owner's acknowledgement as verifiable with
  `EmployeeCredential`, and the job as completed. No plain-resume bypass was used.
- Reload showed the closed job in mobile. Closing its drawer restored the personal
  inbox and removed the task marker and temporary organisation token. Portal also
  returned to personal context without retaining those values.

Client billing remains an independent fact: the projection shows USD150 owed and
USD0 received, with invoice delivery needing attention. Worker payout and its
receipt are skipped because this job has no worker payout. No real purchase,
payment, provider delivery or production/external-wallet assurance is claimed.

The job-to-billing task-route gap described during this acceptance is now closed;
see the scoped billing results below. Client settlement and personal purchase-stage
summary hydration remain outstanding.

Validation: **9 suites / 113 tests pass** with open-handle detection, including
receipt deduplication/actor history, parent advancement, task routing, assignment,
run access, stage-proof DCQL and two-player SGK tests. Portal and mobile typechecks
pass. The separately run legacy `request_handoff` suite has **4 failing / 3 passing**
tests: four fixtures omit required organisation procurement setup and are rejected
by the existing setup gate. Those failures were not bypassed or counted as passing.

## Scoped client billing: isolated acceptance

- Both portal job billing buttons now register only the recorded job/payment-link
  route as a linked target. This preserves the original task, its start time and
  personal inbox return; it does not admit the general finance area.
- In task mode the portal reads the exact authorised run first, checks its recorded
  link ID, then reads that link and checks the reciprocal `sourceRunId`. Missing or
  expired context cannot fall through to organisation-wide finance loading.
- Mobile reuses its existing billing drawer from both job billing entry points.
  A simulated HTTP503 showed an explicit billing error and left the job available
  rather than dismissing it first.
- Exact payment-link reads return `{ link }`. Billing opens and refreshes on both
  apps now unwrap that envelope. Delayed results/errors are discarded if the
  initiating account or task changed.
- Shared-browser owner portal and assigned-worker mobile checks verified the job,
  billing and return-to-job controls. Portal reload and browser Back retained scope;
  closing either billing drawer restored personal inbox and cleared temporary
  task/org credentials. The worker's edit/resend/renew controls were disabled.
- Resource timing after a scoped portal reload showed the exact run and link reads,
  not finance collection/list requests. Opening mobile billing fetched just the
  exact recorded payment link.
- These billing checks used the already-completed local demo job. Since its
  actionable inbox item was resolved, task-resumption markers were explicitly
  seeded for browser acceptance after normal authenticated organisation switching.
  This verifies scoped continuation, not a newly delivered inbox notification.
- Owner used the existing resend and renew/resend buttons against disabled local
  messaging providers. Both attempts were recorded as **Not sent**, with channels
  skipped. Renewal changed the short URL, not the link record or debt: SQLite still
  contained one payment link and one receivable, with the same obligation ID and
  USD150 outstanding / USD0 received. No real message or payment occurred.

Validation: **9 suites / 114 tests pass** with open-handle detection, including
recorded billing target admission, conflicting link/run/query rejection, preserved
return/start time, and existing delivery/renewal/debt invariants. Portal, mobile
and backend typechecks pass. A delayed-response browser probe did not confirm
response completion; it is not counted as passing coverage. Legacy
configuration/procurement fixture failures, client settlement, live-provider
delivery, delayed/cross-tab browser acceptance and broader
SSI/outbox architecture work are not claimed complete.
No controller contracts changed, and no generated routes were edited.

## Existing simulated checkout: settlement and receipt follow-through

The isolated demo invoice has now been paid with the **existing Simulated pay**
provider. No second simulator, payment engine, receivable or timeline was added.

- Organisation setup already selected the simulated provider. Public checkout had
  ignored that selection and advertised only EcoCash. It now reads the existing
  payment setup, exposes Simulated pay when selected, and reuses
  `ExternalActions.initiateEcoCashPayment` with explicit simulation and no live API
  key. An unrelated organisation cannot enable that method for another merchant.
- The owner signed into a personal wallet and acted as the labelled demo payer;
  this was not an independent real client. Portal checkout showed the no-real-money
  method and used the existing public-pay, webhook, settlement and receipt path.
- Payment reference `SIM-D9238119` settled the original USD150 obligation
  `REC-C4B6533B`. Persistence still contains one link and one obligation. The billing
  child completed; the parent job stayed completed/RECONCILED, with no worker payout.
- Both portal and assigned-worker mobile billing showed **USD0 outstanding /
  USD150 received**, and no resend/renew controls for the paid link. Prior skipped
  delivery attempts remain truthfully recorded as Not sent.
- Checkout had claimed the receipt was already saved, while portal inbox omitted
  payment/invoice offers. It now directs the holder to their inbox and describes
  offers rather than claiming automatic storage. Portal reuses its existing
  personal-token Keep record action for these offers.
- A real pending-receipts query failed silently: it referenced a nonexistent
  merchant column and `ack_payment_receipts.resolved_at` had no migration.
  Migration 119 adds the resolution column through normal startup. Merchant data
  is read from existing payment metadata; query failures now surface explicitly.
  The holder accepted the invoice and receipt in the browser, and both appeared in
  saved records. Receipt resolution and invoice acceptance persisted after reload.
- Inspection of that first receipt exposed a pre-existing attribution bug: the
  webhook used the payer tenant as merchant/issuer. Corrected future issuance to
  use the payment's recorded merchant tenant, while retaining the payer as holder.
  A controller integration regression exercises the actual simulation, webhook,
  ledger allocation, correct merchant claims/header, and duplicate replay.
  **The earlier demo credential was not rewritten or silently replaced**; its
  pre-fix attribution remains a fixture limitation, not production SSI sign-off.

Validation: **11 suites / 125 tests pass** with open-handle detection; portal,
mobile and backend typechecks pass, and the existing compile command regenerates
TSOA routes/OpenAPI. An expanded run additionally tried legacy FEPT/school-fee
chain suites: **7 failures** stop at missing organisation setup prerequisites
(4 field-job, 3 collections fixtures), before checkout. They were not bypassed.
Logs are retained in the session workspace as `simulated-settlement-focused.log`
and `simulated-settlement-regression.log`.

Remaining: personal purchase-stage hydration, receipt-count parity on portal
home/navigation, delayed/cross-tab/expiry browser acceptance, corrected-merchant
live receipt/replacement acceptance, and the broader SSI assurance/outbox work.
No real funds, provider messages, production data, commits or deployments.

## Billing, assignment records and job histories: current implementation qualification

These changes extend the existing workflow engine, record dispatcher and payment
link service; they do not introduce another engine or a capability-selection UI.

- Billing-only retry keeps a closed job closed and reuses the existing billing
  child and debt. Resend and renewal retain the same receivable; renewal invalidates
  the old link. Delivery attempts distinguish provider acceptance from failure,
  and neither is evidence that the client paid. Portal/mobile use the same billing
  details and truthful job-stage outcomes.
- New field-job templates issue `JobAssignmentVC` to the actual assigned worker.
  Old field-job action snapshots naming `RequisitionVC` are normalised at issuance.
  An existing legacy assignment record can be replaced explicitly by an active
  organisation owner/admin in either app, without resetting job progress.
- Assignment offers request a 30-day issuer offer/session lifetime through Credo's
  top-level `expirationInSeconds` option. This is not credential validity and does
  not extend access-token lifetime. Current unclaimed expired offers can be renewed;
  cancelled, replaced, saved or withdrawn offers cannot be used to recover old
  assignments.
- Reassignment withdraws old offers, revokes saved assignment records and delivers
  the replacement to the current worker. Revocation also uses the run's saved
  record reference if its inbox row is missing. Issuer-side checks reject stale
  bearer offers, including replaced legacy records, outside the app's accept API.
  Named external workers retain item-scoped eligibility; explicitly inactive
  organisation membership prevents assignment-record issuance.
- If record transfer fails after reassignment, the API explicitly reports that the
  job moved but record delivery failed. Retry the same reassignment to recover
  delivery without adding another reassignment event. If offer renewal fails after
  withdrawal, the old link stays withdrawn; an authorised operator can recover
  delivery by reassigning to the same current worker.
- Current-stage inbox continuations resolve obsolete cards, name the existing job
  and required action, and do not present the continuation as a new request.
  Organisation-held records remain in the organisation wallet. Portal/mobile
  histories and exported tables retain skipped/held reasons and do not equate
  job closure with invoice delivery, payment collection or worker payout.

Verification: nine focused suites / 95 tests pass together, covering assignment
lifetime, renewal, reassignment, replacement, issuer guards, billing/history
alignment, run access, task context, handoffs, stage proofs, canonical HR and the
two-player field-job journey. Backend, portal and mobile typechecks pass. Focused
assignment backend lint passes; repository-wide lint is not claimed. Routes and
OpenAPI were regenerated from controllers rather than edited by hand.

External issuance/payment providers are stubbed in these tests. Live browser,
external-wallet cryptographic issuance, production authentication and status-list
publication acceptance remain outstanding. Inbox back/error/reload/cross-tab and
linked-child journeys still need live acceptance. Assignment renewal/transfer is
serialised per run within one process, not through a distributed durable lock.
These results do not establish full architecture or production readiness.

## Access and inbox-task closure: earlier baseline qualification

Onboarding is answer-driven. It does not display a capability/module catalogue for
selection; answers determine relevant work areas and setup prompts. Internal module
identifiers are a server configuration contract, not a new onboarding UI.

- Run reads, list results and generic resume now use the shared run-access policy.
  Current assignment takes precedence over stale input, and historical checkpoints
  do not grant ongoing access. Explicitly inactive membership revokes named-worker
  access; named external contacts without a membership row retain the existing
  actor model's item-specific eligibility.
- Reading is distinct from acting: only the worker/admin advances worker stages,
  the existing actor resolver controls inspection/review, and acknowledgement/payout
  must use the wallet-proof endpoints. An audit permission is not a mutation grant.
  Resume accepts only current-stage fields, so submitting a future checkpoint or
  changing actors/proof requirements cannot pre-fill a later step.
- Inbox task markers are bound to an item rather than the entire finance area.
  Mobile and portal share the route contract. Expiry restores personal context,
  and the marker is stored alongside the shared organisation context so another
  tab cannot retain an unmarked temporary organisation session. Account-picker
  switches deliberately clear the temporary marker. Opening an inbox item also
  starts a task when its organisation is already active; this does not turn the
  account picker itself into a temporary switch.
  Same-item proof, requisition scan, photo and known payment-code routes are
  supported without opening the whole finance area. Successful mobile proof
  completion restores the personal inbox.
- The task pages provide a personal-inbox return and hide the organisation lists
  behind the opened item. Portal and mobile close handlers return to the inbox.
  Browser/back-navigation and linked-item acceptance remain release checks; helper
  tests alone do not establish end-to-end UI completion.
- Purchase kind and receiving confirmation remain explicit answers. Missing
  automatic-handoff inputs create no child and surface a needs-input explanation.
  The handoff request-context schema accepts these business metadata fields.

The old operations service was replaced by the shared request engine, not another
HR-specific engine. The portal's HR Operations page already creates/lists
`hr.leave` and `finance.expense_claim` through `/api/platform/requests`.
The dangling legacy operations controller and its dead audit-route mappings have
now been removed. Approvals, employee record offers and expense payment handoffs
remain owned by `PlatformRequestService` and the existing request handoff service.
Legacy leave/expense tables are retained for historical reporting; no rows have
been deleted or reassigned from the old `default` tenant.

Verification: 5 focused suites / 42 tests for HTTP-controller access, shared
task-context, workflow handoff, stage-proof queries and canonical HR request
families pass together. HR coverage checks foreign-tenant/unauthorised decision
denial, one employee leave record and the expense-to-payment handoff. These tests
use test principals and a stub issuer; they do not establish production JWT or
cryptographic issuance acceptance.

At this earlier baseline, regeneration removed stale generated references to
then-absent billing-retry, assignment-replacement and payment-link-send methods.
Those methods are implemented and regenerated in the current slice above.
Configuration/SSI assurance and live browser/back/error/linked-child acceptance
remain separate work. Do not treat the earlier all-complete report, or these
focused checks, as evidence of full release readiness.

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
- Both apps separate Operations (Jobs, Purchase requests, School fees, Shop/services) from Money (Money in and Money out).

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

## 2026-10-07 — Saved accounts, stage records, and a quiet offline screen

- The account menu on the portal and the phone lists the people who have signed in on this browser or phone, and can add another, the same way GitHub keeps several accounts on one computer. Switching opens that person's own session. It does not mix the two. A different browser still has to sign in. On the phone the list is in Settings (every screen) and in the organisation menu.
- Every stage that issues a record follows the organisation's record settings. A record marked off is not issued. An optional record is issued only when the organisation turned optional records on. A site inspection record and the completion record are issued into the organisation wallet, and they show in the organisation inbox with the step "Keep the record" (portal: Keep record; phone: Accept).
- Only an owner or admin sees and keeps the organisation's records. A field worker in the organisation inbox does not get them, and keeping one from a worker's sign-in is refused with "Only an owner or admin can keep this record for the organisation."
- With no connection the last screen stays up. The app does not pop up a warning and does not wait until a request times out. New messages and new actions wait until the connection is back.

## 2026-10-08 — Record settings, job timeline, portal home

- Owners and admins choose which records a workflow in use should issue, on the website Setup page and on the phone under Organisation, Record settings. Each record is Always, Only when optional records are on, or Off. Off means that record is not created. Jobs already running keep the steps they started with.
- Issued records sit on the job timeline with the photos: the job card on Assigned, the site inspection on Site inspection, the material receipt on the after photos, and completion on Sign-off. The site check names the assigned field worker. A job waiting for that worker says "Start the job". The job screen does not show the raw run id, and stage history uses plain names.
- The website menu is a left sidebar (Work, Records, and Organisation for owners and admins). Home is a dashboard: status tiles, what needs you, recent activity and recent records. The phone's bottom bar uses a pill on the current tab, inner pages put the page name in the top bar, and sheets close with the Android Back button.
- 2026-10-08: A sign-off or payment step only offers a card that can complete that step. A withdrawn card, an expired card, a card for someone who has left, and a staff card whose steps do not include this step stay off the list. The review still shows Shared and Not shared, with the full step list, before the person agrees. When Who does what changes — including an owner choosing themselves — the changed step list queues a replacement staff card. The old card does not gain the new step; accepting the replacement withdraws it.
- 2026-10-08: When a step falls to "an owner" by role — the built-in owner stand-in, an Owner entry in the backup list, or an Owner role default such as the Owner handles money setup — every active owner and admin gets the inbox card and the step on their staff card, so whichever owner is on duty can finish it. A step that names one person still goes to that person only, so a backup list that names a specific account sends cards to that account alone.
- 2026-10-08: The same rule covers purchase requests: the other owners get the approval card too, and the card closes for everyone once one of them approves or declines. If an approval stops after the staff card was shared, the phone inbox card shows "Resume approval". Resuming finishes that same approval without sharing the card again, and a repeated finish returns the first result instead of approving twice. If the approval has ended, the phone says so and the person taps Approve again to start fresh. The website has no resume step; Approve there always starts a fresh request.
- 2026-10-08: A card that replaces one the person already holds says so in the inbox, on the phone and on the website. The badge reads "Replaces your current card", "Replaces your current card: steps changed", "Replaces your current card: role changed", or "Sent again", and the line under it says what changed (added or removed steps) and whether the earlier card stops now or once the new one is accepted. The same note appears on any inbox item that carries it, including a step card or a record sent again. Settings on the phone shows one scope in use. The other scope is listed under Switch to, and the phone numbers under Sign-ins are logins, not a second scope that is also on. Organisation settings stays a separate page for owners and admins.
- 2026-10-08: Resume now works the same for every step finished from the phone's share screen — purchase approve, release and acknowledge, job sign-off and payment, payable transition and collection consent (`FINISHING_MODES` in `present.tsx`). If the finish stops after the card was shared, the inbox card shows "Resume step" (or "Resume approval"); resuming skips the share and finishes on the same request, the server replays the first result on a repeat (every finish call carries a stable idempotency key; the job step also replays on its request id), and if the step has ended the phone says so and clears the resume so the person starts fresh from the inbox. The website has no resume step by design. The rule `.cursor/rules/workflow-parity.mdc` says a fix on one workflow lands in the shared helper so all workflows, including future ones, get it.

## 2026-10-08 — Payments and supplier bills have a server

- Purchase requests, supplier bills and customer payments are already prepared for every organisation from the setup answers. Their routes are payment links, collections, suppliers, bills, payments, and the shared step that moves a bill (`/api/payment-links`, `/api/finance/ar`, `/api/finance/ap`). Who handles the money is still the purchase-request people. Purchase requests now live under Operations; their linked balances appear under Money.
- 2026-10-12: A field job now keeps one client debt while payment links remain retryable collection attempts. Job billing can be one payment, fixed instalments, or recurring; every scheduled amount is an obligation on the job's transaction, and the job can close while the balance remains open. The portal and phone show the same owed, received, next-due, reminder and cancellation controls.
- 2026-10-12: Purchase requests now ask the same explicit questions on both apps: goods or service, supplier or immediate payment, and whether delivery/service confirmation is required. Required confirmation uses three-way matching (order, receipt, bill); when it is intentionally waived, payables use two-way matching (order, bill) and do not invent a delivery receipt. Field-job Buy materials uses these same choices. Field sign-off/payout, collection consent and staff-card replacement continue through their existing shared paths.

## 2026-10-08 — Cards that no longer work look different

- 2026-10-08: A live card keeps its own colour. A replaced card is amber, a withdrawn card is red, and an expired card is grey, on the phone and on the website (`cardLife` in both `lib/cardLife.ts`, colours on the record cards). A replaced or withdrawn card is filed under Archived on its own and stays on the device; it is not deleted and it cannot be shared. An expired card stays with the live cards, in grey, and the screen asks the person to archive it, because the end date is the cue to renew. Filing an expired card is remembered on that browser.
- 2026-10-12: The phone inbox files an expired offer or payment link under Archived on its own (`isArchived` in `credo-ui/mobile/pages/inbox.tsx` treats `isExpiredItem` as filed), the same way a replaced or withdrawn card is filed. It no longer sits beside live items, no longer counts on the Activity badge, and cannot be unarchived; the detail sheet says it was filed and offers Remove. Expired items are plain cards with a grey "Expired" label, not red; red stays for a decline or an error. "Clear N expired" lives on the Archived tab only. The website inbox has no Archived tab by design (`RequestWorkspace.tsx`: receipts and archive live on the phone only).

## 2026-10-08 — Light and dark mode stay readable

- 2026-10-08: Tab rows on the phone and the website work like Android's tab bar (WhatsApp style). When the tabs fit they share the width; when there are more than fit, each keeps its name on one line and the row scrolls sideways, with the chosen tab brought into view and the underline across the whole row. Counts sit in a small pill next to the name instead of "(3)". This comes from the theme (`Tabs` classNames → `.app-tabs-list` / `.app-tabs-tab` in `styles/globals.css`) and `useActiveTabInView` in `lib/tabs.ts`, mounted once in `_app.tsx` on both apps, so every tab row, present and future, gets it without page changes.
- The website has the same Light / Dark switch as the phone, in the top bar. Record cards keep their own colours, so the status stays readable in both modes. The phone's coloured record cards use white words on a darker card, with the status on a dark pill.

## 2026-10-08 — Android popup alerts

- The phone asks to show alerts, then a waiting job or record can drop a banner on the Android screen the way other apps do, including while Credentis is in the background. The same alert puts a white bell in the top status bar; the bell is blue on the alert card itself. Tapping the banner opens the inbox. Signing out on that phone stops alerts for it. The website does not show these banners.
- The banner only arrives after two setup files that are not in the project: `google-services.json` in the Android app, and `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL` and `FCM_PRIVATE_KEY` on the server. The installed app needs a rebuild before the banner can appear. A build without `google-services.json` skips alert sign-up, so the app still opens; it just shows no banners.

## 2026-10-09 — Safety check: a clear choice, an organisation hold, and the worker re-checks

- 2026-10-09: The safety check on the phone is a choice, "Safe to start" or "Not safe - hold the job", not two boxes. Leaving the choice out, or choosing Safe without ticking the protective-equipment box, is a plain error ("Choose whether it is safe to start…", "Confirm you have the protective equipment…") and nothing is recorded. It no longer puts the job on hold. The worker cannot delay a job by leaving a box blank.
- "Not safe" needs a written reason and a live photo of the hazard before it is accepted. With both, the job goes on hold once: the hold is stored on the job with its own id, who raised it and when, the reason and the photo; the organisation gets an inbox card "Safety hold on job FR-…" (step "Sort out the safety hold", routed to the person set for `resolve_safety_hold`, otherwise supervisor, operations manager, dispatcher, manager, then the owner); a `RISK_ASSESSMENT_HOLD_RAISED` event and a `field.checkpoint.held` outbox message are recorded. Sending the same hold again (a retry, same reason and photo) adds nothing. The phone shows an orange "Job on hold" message, not a red error.
- The organisation does not pass the check for the worker. An owner or admin, or the `resolve_safety_hold` person, marks the issue resolved with a note of what was done (`POST /workflows/runs/{runId}/holds/{holdId}/resolve`, idempotent on the hold id, and the person who raised the hold cannot resolve their own unless they are an owner or admin). That closes the organisation's card, records `RISK_ASSESSMENT_HOLD_RESOLVED` and `field.checkpoint.hold_resolved`, and sends the worker an inbox card "Job FR-…: safety issue resolved" that opens the same job. The hold stays live until the worker redoes the safety check.
- While a hold is live, a Safe answer must also say what changed since the hold. A passing check marks the hold cleared, closes both cards, and keeps the hold, the resolution note and "what changed" on the job timeline (phone and website, with the photo thumbnail and a state line: waiting for the organisation, waiting for the worker to re-check, cleared). Moving the job to another worker ends any live hold and closes its cards.
- Plain resume is guarded too: a repeated resume on the same run with the same idempotency key replays the first result.
- Only the field job has a safety check, so this fix is field-job only; purchase requests, payables, collections and staff cards are not affected. The "Sort out the safety hold" step shows on the Who does what list (recommended, defaults to the owner) and on staff cards like every other step.
- 2026-10-10: A job still in progress names the step it is actually waiting on. The phone inbox says "Waiting: Worker safety check" and "Your step: Safety check" while the safety check is open, and "Before photos" only after that check has passed. The same pause words are used on the website job board.
- 2026-10-10: Job payment release uses whoever releases the money on purchase requests. Naming a role and no person on the job (for example the field worker) is not an override. If that money person is unset, If nobody is chosen applies. Naming a person on the job still overrides. Purchase requests, supplier bills and collections use the same rule for their borrowed money steps.

## 2026-10-07 — Android-safe phone navigation and useful home dashboards

- The phone keeps its header, back button, sheet close buttons and bottom navigation clear of Android and iPhone system bars. Android supplies the real status-bar, cutout and navigation-bar sizes to the web screen; changing light or dark mode also changes the Android system-bar icons so they remain visible.
- Every phone screen except Home has an in-app Back button. Sheets still close by their large close button, by the Android Back action, or by touching outside when that sheet allows it.
- The phone uses the device's own interface font (Roboto on Android) and 44-pixel controls instead of downloading a web font. Role names use plain words such as "Field worker".
- Portal Home now follows the phone's calm priority layout in both personal and organisation contexts: what needs attention comes first, followed by links that apply to the current context. Personal Home does not show organisation administration tools.

## 2026-10-07 — Inbox, record check, who a job is waiting for, and photo location

- The organisation inbox and the personal inbox stay separate, even when the same person runs the organisation. Personal cards stay on the personal inbox. Organisation work stays on the organisation inbox.
- Checking a record from its details, and the portal Check a record page, asks whether a record issued here is still valid. No sign-in is required for that check.
- "Waiting for" on a job names the person who has to act. It says "you" only when the person looking is that person in their own account. Looking as the organisation shows the person's name.
- Before and after photos on a job ask for the phone's location first, the same way other phone apps ask, and the job does not take the photo until location is allowed.

## 2026-10-07 — Inviting someone opens their account if they do not have one

- Inviting a team member no longer stops when that phone has not signed up. The organisation opens their account, adds them as an employee contact, and queues their staff card. They are sent a message. The organisation does not choose their PIN. The first time they sign in, the PIN they type becomes theirs, and the staff card is already waiting.

## 2026-10-07 — A saved contact is not in the app until their phone matches an account

- Saving someone, especially an outside contact, does not mean they can receive a job card. The contact list checks the phone (and email) against people who have already signed up. In the app means they can be sent work. Invite means they are only saved, and the list offers a message asking them to sign up with that phone number. Once they sign up, the same saved contact shows as in the app.

## 2026-10-07 — Roles follow the setup answers; outside contacts stay off the team

- The Roles page was empty even when someone was already a field worker with a staff card. Those are two lists: the team role on the person, and the Roles page. Opening Roles, or finishing the setup questions, now fills Roles from those answers (Owner always; field worker and supervisor when the organisation sends people out; the money roles named by the money answer; cashier for a shop) plus any role already given to someone.
- Inviting someone, and adding a contact who is on the team, offers those roles. If that phone already has the app they join the team and get a staff card. An outside contact has no role. Sending them a job does not add them to the team; they get the job card only when they already have the app.

## 2026-10-06 — A staff card can be withdrawn, and the person is told

- Every staff card carries a status entry and an id. The organisation keeps a record of each card it issued; a step refuses a withdrawn card and tells the person to accept the newer card in their inbox.
- Role change: a new staff card arrives in the inbox with a sentence that says what changed and what happens to the earlier card. The organisation chooses on the People page whether the earlier card stops straight away only when the new role has fewer steps (recommended) or stops straight away every time. Accepting the new card withdraws every earlier staff card from that organisation. Leaving the organisation withdraws them all.
- "Send again" works for an accepted staff card too; the fresh card replaces the one they hold once accepted.
- A withdrawn card stays on the device marked "No longer valid" until the person removes it from Records (phone) or My Saved Items (website) with "Remove from this device". The organisation's record of what it issued is not affected.
- Inbox cards (phone) and inbox rows (website) show "Your step: …" so the person sees the action a card asks of them (Start job, Sign off job, Release payment, Approve request, Accept card…).

## 2026-10-06 — One staff card lists the steps a person confirms

- A person gets one staff card for an organization. It says their role and every step they confirm (approving a request, releasing payment, signing off, and so on). The team list shows those steps on the staff card. A separate card per kind of request is no longer sent, and any of those still waiting in the inbox are cleared when the staff card is sent.
- Cards already saved in a wallet still work for the steps they list. A staff card that lists steps only confirms those steps. The organization checks that when the step is confirmed.
- 2026-10-06: The staff card and the role card are now selective-disclosure cards. A step asks for the details it needs (organisation, role, status, the steps that person confirms). The share screen lists those under Shared and the rest of the card under Not shared. A card already saved as a whole record is still accepted and the screen says the whole record is shared. New requests use the newer query (DCQL). The older query (presentation exchange) remains for wallets that only speak that, and when the newer request cannot be built (`PROOF_REQUEST_QUERY=pex`).

## 2026-10-06 — Setup answers do not write a workflow list

- Saving what the organization does, who handles money, or how payments are taken stores those answers only. It does not add rows to the workflow catalog. A request is available because the organization said it does that work and the purchase-request money people are in place. The same money people cover every later money step.
- Readiness does not block on people who are not the money person. Who goes out and who checks the work is asked when a job is created, on the website and the phone. Who does what shows the money people once, and says the job people are asked on the job.
- The onboarding write-up no longer describes a "choose a workflow" screen.

## 2026-10-06 — The `sgk` branch hides non-SGK surfaces rather than deleting them

- One project. The setup question (what the organisation does) turns school-fee invoices, counter sales, the store, the catalog and publishing on. An organisation that does not sell or advertise is not listed for others to find, and cannot publish a store. Discovery lists only organisations that chose to sell or advertise and have published.

## 2026-10-05 — Setup is one question per window

- On the website and the phone, setup is a checklist of four steps: Say what you do, Choose who handles money, Pick how you take payments, Invite your team. Start opens that one question on its own, with which question of 3 you are on. On the phone the organisation list steps aside until you save or cancel. Change opens a question again. After a save, Next continues and Finish later returns to the checklist. The page says how many of the four are done.
- Answers are saved on the server (`PUT /organizations/{org}/setup/profile`). The screen does not send a list of workflows to turn on.
- Who does what is one category per window: Money, then each kind of request, then If nobody is chosen, then Role cards, with Back and Next. Money is shown once. A step that still needs a chosen person names who is standing in for now. Other kinds of request can use those same people, or pick someone else on that request's window.
- Steps such as who goes out on a job are asked the first time. They do not block the checklist. Kinds of requests lists what is open and what still needs a person.

## 2026-10-05 — Attached photos and documents show as small previews

- While adding photos (or a wallet record for a receipt), the phone shows a thumbnail for each one, with Add and a remove button, before they are saved. Extra photos from the same step are kept with the sealed photo.
- The job shows the same small previews on the phone and in the portal job drawer, for photos and for an attached record.

## 2026-10-06 — A job is checked after the worker arrives

- The worker accepts the job and heads out, then proves they are on site. The site check and the safety check come after that, then the before photos. A check of the site cannot be recorded before anyone has arrived.
- A job that was already started keeps the steps it began with. New jobs follow this order, on the website and the phone.

## 2026-10-06 — The website Progress list names who really did each step

- Each step's "Who" line comes from the job history (`whoDidStages` in `jobAuditTrail.ts`, same helper in the portal and phone copies). Before, it showed the person planned for the step, so sign-off read as the field worker when the supervisor had signed. The planned person is still shown for steps that have not happened yet.
- A full job run with four people on the SGK Trial organisation closed cleanly through the screens; the open findings are listed in `docs/SGK_FEPT_GAP_MAP.md` under the same date, including that the site check is not yet limited to the chosen inspector and that the share screens list records from other organisations.

## 2026-10-06 — Choosing who handles money ticks that setup step

- Saving Owner handles money, Manager then finance, or Director confirms once ticks "Choose who handles money" on the website and the phone. The circle is not a box you tick yourself.
- When that choice names people who are not on the team yet, the step stays ticked and says who to invite. The owner stands in until they join.
- Each choice says who confirms a request and who releases the money. Payment choices show a short explanation under the name.

## 2026-10-10 — Inbox shows new, opened, and done

- The phone inbox and the website inbox use the same four filters: New, Opened, Done, and All. New has not been opened. Opened has been looked at and is still waiting. Done is approved, declined, finished, or filed away. Opening a card marks it opened; accepting or finishing it is what makes it done.
- All groups cards by the kind of work (jobs, purchase requests, payments, and so on). The kind tabs stay, for the same kinds on both screens. Newest first. A new card is bold with a dot. The time is short (2h, 3d) until it is a week old.
- The website inbox no longer prints internal flow names or proof labels on the list. Those stay off the list a person reads. The Requests page is unchanged.
- 2026-10-10: On a job, the short History under the steps repeated job created, assigned, and where the job is now. That list is gone on the phone and on the website job preview. The step list stays. See the full history (phone) and the job card History tab (website) still show who did each step, when, and the proof.

## 2026-10-10 — A purchase is finished when it is bought, not when it is approved

- An approved purchase request, purchase order or payment request is no longer the end. The person who releases money gets a follow-up card: Mark as bought (receipt number and amount paid), Mark as delivered (supplier bill number and amount), or Mark as paid (receipt number and amount paid). The server checks those fields (`PlatformRequestService.nextStepFor`); the card stays under New or Opened until it is done. Phone: the inbox card. Website: the Requests page row and detail (the website inbox does not list request cards yet).
- Purchase order → supplier payment now starts when the order is marked delivered, carrying the supplier bill number, not when the order is approved (`RequestHandoffService`; migration 110 moves saved organisation settings). An approved parent closes itself once everything under it is finished.
- Buy materials from a job asks for a supplier. No supplier means a cash purchase (purchase request → Mark as bought). A supplier means purchase order → Mark as delivered → supplier payment → Mark as paid. The job panel shows each step and the receipt and bill numbers as they come back.
- What happens next (organisation setup, website and phone) has a new choice per job link, The job continues: When it is bought and the receipt is in (default for Buy materials) or As soon as it is approved. A decline anywhere in the chain stops the link.
- The job's receipt step can use the purchase receipts instead of a photo (phone: Use these receipts). They are stored as the receipt evidence with their own fingerprint. The receipt step is phone only.
- Parity walk: purchase approve / release / acknowledge get the follow-up card through the shared inbox router (`routeWorkflowStageInbox` with a `stageAction` override) and the shared `inboxAttention` (`stillOpen`). Field sign-off / payout, payable transition, collection consent and staff card re-send do not go through platform requests and are unchanged. Excluded: the supplier bill is not yet written to the payables ledger.
- 2026-10-10: Mark as bought / delivered / paid needs a receipt photo (or a receipt record already in the person's wallet) on the phone and on the website, not just a number. Those images come back to the job as its receipt evidence. The receipt step asks for no location: a receipt is read where it is kept, not where the work is. Hand-offs (Buy materials, Quote for extra work) are offered on jobs started from the organisation's copy of the built-in field template too, not only on the raw template id (`WorkflowHandoffService.runWorkflowType` reads the workflow category). When the purchase finishes, the job panel on the phone updates by itself and offers Use the purchase receipts without a reload.

## 2026-10-10 — One answer to "may this person do this step"

- Who gets a step's card, which steps are printed on a staff card, who may press the finishing button, and which card the share screen offers were four separate checks that could disagree. A supervisor named as the sign-off person on a job got the card and passed the finishing check, but the share screen said No card for this step because her staff card did not list sign-off.
- One answer now: `OrgWorkflowActorService.mayAct` — the person the job names for the step (`namedPersonOnRun`: the sign-off person chosen at job creation, the assigned worker for worker steps), then the person the organisation chose, then anyone holding the step's role (`roleStandIns`: every active member in that role, owner and admin counted as one role), then an owner or admin standing in. The finishing endpoints (`WorkflowController.assertStageActor`, safety-hold resolve) call it; the inbox router and staff-card step list use the same role stand-ins; the wallet-proof check (`evaluateOrgEvidenceProof` / `cardCoversStep`, `StageProofService.presentableCandidates`) accepts the named person's card even when that card does not list the step. The phone sends the job id with the share request so the server knows who the job names.
- Field sign-off belongs to supervisor, inspector, manager or dispatcher (`ROLE_FALLBACK_BY_WORKFLOW_STAGE`); the field worker is no longer in that list, so a worker never signs off their own job through the role order. When sign-off is waived on a job and nobody is chosen, the owner is recorded as the person who closed that step.
- Parity walk: field sign-off / payout (`mayAct` + named person), safety hold (`mayAct`), purchase approve / release / acknowledge, payable transition and collection consent (same `roleStandIns` through `routeWorkflowStageInbox` / `notifyStageDelegates` and the same `presentableCandidates` on the share screen), staff card re-send (`coveredStageActions` uses `roleStandIns`, so each supervisor's card lists sign-off). Only the field job names a person per run today; requests and payables have no named person and go by configured person, role, then owner.
- Verified on the screens 2026-10-10: job FR-1791644376331 (SGK Trial) ran Kuda (owner, website) → Tendai (worker, phone: start, arrival, site check, safety check, before photos, Buy materials, purchase receipts, after photos) → Rudo (supervisor, phone: work review and sign-off from her staff card) → Chipo (finance manager, phone: payout) and closed with Photos (2) and Receipts (1) on the website job card.
- 2026-10-10: A job keeps one step button. Quote for extra work and Buy materials sit under More for this job, closed until opened, on the phone and the website. A wallet step keeps one button, Review and share; scanning, another wallet and copy link sit under Other ways.

## 2026-10-11 — A child says which job it belongs to

- One family object (`WorkflowHandoffService.familyOf`) is attached to a request list row and a request page. It names the job, or the request this one follows, then each step: Purchase request, Purchase order, Supplier payment. A request with no parent and no job has no family.
- Website Requests rows show "Part of job …" (opens the job) and a "From a job" or "From a purchase order" badge, plus a "Linked to a job" filter. The request page shows "Where this fits" instead of the routing box when a family exists. The same strip is on Related work, and each step opens the child. A paused job that is waiting on a purchase says "Waiting for:" the child's name.
- New inbox cards for a job's purchase say "Part of job …" and "The job waits for this purchase." Finishing that card says "The job continues." The website inbox now lists those purchase cards as well as job cards. The phone has no separate purchase page; tapping the child opens the inbox card when one is waiting.
- Left as they were: only a field job names a person per run; the website still has no wallet (receipt upload only); the receipt step stays on the phone.
- 2026-10-11: A fresh database now creates the contacts table the actor list reads (`org_contacts`), so organisation readiness checks can run. A share now asks for the one step, not the whole list. The card is issued so each step can be revealed on its own. The share screen says which step, and the job and amount when it has them ("Release worker payout · Job FR-… · 95"). The wallet signs that line. A card issued before this still has the list as one unit, so the next staff card replaces it ("shares one step"). Wallets that only speak the older query still can (`PROOF_REQUEST_QUERY=pex`).
- 2026-10-11: Where this fits is a row of cards. On a purchase, Open on the job goes to that job's Receipts tab when the purchase is finished, or the job details while it is still waiting. On the job, Open on the purchase opens that purchase. On the phone the purchase opens as a sheet on the job, and Open on the job returns to the receipts or the related-work section.
- 2026-10-11: Phone Back closes the open sheet first, then leaves the page. The top bar stays above the sheet so Back can be pressed. Closing a job removes it from the address so a refresh does not open it again. The bottom bar replaces the current page, so Back does not walk Home, Jobs, Inbox one at a time.
- 2026-10-11, later: A share now sends only the step it asks for. Credo hands back an empty step list for a card whose steps are revealed one at a time, so the step is picked from the card by the value the request asks for (`splitSdJwtShare` + `wantedListItems`) and Credo is told exactly which position to reveal. The wallet names its card for the job line it signs (`transactionDataSigners`), on both the in-app share and the wallet share screen. The share line shows the client amount on sign-off and the payout amount on payout. The person a job names (the sign-off person, the worker) may answer with who they are when their card does not list the step. The share screen lists the other steps as "Other steps on your card" under Not shared, on the phone and the website. Checked on job FR-1791718401539: the sign-off sent only "sign off" and the payout only "release payout"; role, name and other steps stayed on the phone. Applies to every step that asks for a staff card (field sign-off / payout, purchase approve / release / acknowledge, payable transition, collection consent).
- 2026-10-11, open: after sign-off, the client follow-on (`tpl-payment-collection`) gives the client invoice and payment receipt to the payout person, not the client, records a simulated payment of the full amount at once, and its invoice totals are 0 because the job sends no lines. The website job form never asks for the client's phone (`customerMsisdn`). The quote for extra work (`tpl-quote-invoice-receipt`) fails as soon as it starts (`workflow.pause_for_event` is not an action), and the job shows it as Declined.
- 2026-10-11: Home, inbox, activity, finance lists and their details show when a transaction happened, date and time (11 Oct 2026 15:08), on the website and the phone. A due date or a scheduled day stays a date.
- 2026-10-11: A job's heading is the work (client and site under it), on the website job card and the phone job sheet. Every reached stage shows a green tick, including on a closed job. Opening a photo or a record shows the picture and what was recorded.
- 2026-10-11: The phone job sheet keeps workflow actions at the top, then the same tabs as the website job card: Details, Photos, Receipts, Records and History. Photos, receipt photos and issued records use the same words and the same counts. History is the tick timeline; a stage opens for its notes, and a photo or record opens the picture and what was recorded.
- 2026-10-11: A phone on the job is the actor when Who does what has not named one. A known role is used for the step it fits (a field worker goes out, a supervisor checks the work, a finance officer releases the payout). Someone who already has the app but is not on the team gets this job only. A new number given as who goes out or who checks the work is invited. The client number stays the bill contact unless that person already has the matching role. A workflow that declares no organisation needs (the quote calculation) is not asked for an owner, members or an issuer.
- 2026-10-11, closed: the client is billed by phone. The job form on the website and the phone asks for the client's mobile number (`customerMsisdn`; the phone form also gained the client name). On sign-off the bill (`tpl-payment-collection`) and the extra-work quote (`tpl-quote-invoice-receipt`) both run `client.request_payment`: a pay link (`PaymentLinkService`, shared with the merchant API) goes to the client by text, and the run waits (`await_client_payment`). The text opens `/pay/{code}` on the phone app; the website has the same page (`clientPayCopy` in `uxCopy.ts` ↔ `financeStages.ts`). The client pays there; the payment webhook gives the client the receipt and the paid link continues the run (`settlePaid`). `client.record_payment` rejects any other resume, so only real money moves the bill on. A quote can be declined on the same page; that cancels the quote run (`WorkflowService.cancelRun`) and the job stops waiting on it ("Declined"). The invoice and receipt no longer go to the payout person. Quote lines count (`quantity` as well as `qty`); a quote gets its own invoice number (`FR-…-Q…`) so the client keeps one invoice per bill. Run on job FR-1791721053299: materials bought, quote USD 69 (60 + 15% tax) paid by the client, bill USD 240 paid by the client, payout by Chipo, job closed; a second job checked Decline. Excluded: purchases, payables and staff cards do not bill a client.
- 2026-10-11: Phone Details starts with the same Progress list as the website. Its reached stages show the person and role, confirmation, photos and records; photo and record cards open a full preview. The full History on both surfaces can switch between Timeline and Table. Both views use the same `JobAuditTrail` step projection and the customer-facing choices are called Timeline and Table.
- 2026-10-11: `GET /workflows/runs/{runId}/audit` is the organization-scoped reporting projection over the append-only reconciliation events. Saved workflow steps are used only when a run has recorded no events, so a field job is not listed twice. `format=csv` sends a CSV file (not a JSON wrapper). Owners, admins and the read-only Auditor role can export. Finance reports now use the signed-in organization instead of the `default` tenant.
- 2026-10-11: On the job History, owners, admins and auditors see Export CSV and Export JSON next to Timeline / Table, on the website and the phone. That file is the same rows as the table on screen (step, date and time, status, person, evidence and records, confirmation). The audit endpoint is the recorded-event log and can have a different count, because "Job created" and "Client invoice" are not recorded as their own events.
- 2026-10-11: A purchase order marked delivered records the supplier bill in the payables ledger, and the supplier payment marked paid settles that bill (`AccountsPayableLedgerService`). The bill keeps the request and the job reference. Money in is client debt and collection; Money out is supplier debt and payment. A step in the job's purchase chain opens its owning purchase under Operations or its linked balance under Money, with the same Timeline / Table history and export as a job, on the website and the phone. The material receipt record is held by the organisation.
- 2026-10-11 parity: field sign-off/payout has domain events for assignment, checkpoints, evidence, wallet confirmation, payout and closure. Purchase approval/release/acknowledge, payable transitions and collection consent currently enter the normalized audit through their persisted workflow steps; staff-card replacement remains in the organization audit log because it is not a workflow run. Those are explicit fallbacks until each workflow emits the same domain-event detail as field execution.
- 2026-10-12: Every Finance list on the website and the phone (Payments · money in, Invoices, Requisitions, Jobs, Supplier bills · money out) can switch between Cards and Table (`FinanceViewToggle`, remembered on the device). Both views come from one row array per tab (`FinanceListRow`, mirrored `FinanceListCard` / `FinanceListTable`), so a table row opens the same detail as its card. Table rules on both surfaces: the table scrolls inside its own container (the page never scrolls sideways), header and first column stay put, status is a badge, amounts line up on the right, rows are keyboard-reachable; the job History table uses the same frame. The phone Finance page now also lists supplier bills (money out, with the job reference) and purchase requests raised from jobs, and a client payment has a History button; all three open the same Timeline / Table panel as a job. Exports: owners, admins, auditors and finance managers may export; in Table view "Export CSV" downloads the rows on screen for that tab; inside the Android app the file goes to the phone's share sheet (save to Files or Drive, send on WhatsApp) through `@capacitor/filesystem` + `@capacitor/share`, in a browser it downloads. Request history shows who did each step: the server returns the actor's user id on each request event and both apps resolve it to the member's name. Left out on purpose: a phone version of the website Reports page, server-side CSV endpoints for requests, bills and payment links (the visible rows are exported client-side; only job runs have `GET /workflows/runs/{id}/audit?format=csv`), and merging purchase-chain rows into the job's own History (linked purchases show under the job in Related work). The cross-organisation payables action queue on the phone stays a list of actions, not a table.
- 2026-10-12 (follow-up, verified on both apps in the SGK Trial organisation): the History drawer of a purchase chain is headed by the member you opened (`chainHistoryTitle`: a purchase request or order keeps its own title; only the supplier payment is headed "Supplier bill BILL-…", because the bill number is shared by the whole chain); purchase rows show their date (platform requests use `updated_at` / `created_at`); the website uses the same plain type words as the phone (`JOB`, `REQUISITION`, not `FEPT`); a paid bill shows the amount paid, not a zero balance; long status badges no longer collapse to "WAITING: RECEI…" in tables. Known gap, not changed: `PlatformRequestService.list` grants "see every request" only through an explicit `authority_grants` row (`request.read`), never from the member's role permissions, so a finance manager with no grant sees an empty Requisitions tab on both apps while the owner (as requester) sees them. Decide whether role permissions should feed `AuthorizationService.decide` before the pilot.
- 2026-10-12 — Requests from Home (one entry, three groups, context-aware). Home on the phone keeps Scan · Receive · Pay · Share and adds a fifth tile, **Request**; the website header CTA becomes "Share a record · Request" and Home shows the same catalogue as cards ("Ask for something"). Both open the same sheet (`RequestSheet.tsx` on each surface) fed by one payload, `GET /api/platform/requests/options` (`PlatformRequestService.optionsForSubject`, personal wallet token, no context switch), filtered by the mirrored `requestCatalog.ts` (`requestKindsFor`). Groups: _My organisations_ (one block per membership: Ask for leave `hr.leave`, Claim an expense `finance.expense_claim`, Ask for my payout `finance.payout_request` only while a finished job of mine waits for its payout, Something else `platform.general`); _My records_ (Get my staff card / receipts / payslips on this phone → `POST /api/wallet/credentials/resend-mine`; payslips answer `ask_org`, which turns into a `platform.general` request with `purposeCode: resend_record`); _Other businesses_ (Ask for a quote / bill / Book a service → phone Network → Discover → organisation page, website inline search in the sheet; both end in `POST /workflow-requests` with `targetOrgTenantId`, which creates the organisation-side contact on first contact). In organisation context the sheet shows only _Organisation actions_ (purchase request, new field job, collect a payment, gated by active workflow types); personal kinds stay with the person. Raising goes through `POST /api/platform/requests/raise` (type whitelist `MEMBER_REQUEST_TYPES`, payout eligibility checked server-side, `IdempotencyGuard`). "My requests" (`/my-requests` phone, `/requests/mine` website) merges `GET /api/platform/requests/mine` and `GET /workflow-requests/outbound`; an organisation request opens the same History drawer (`trailFromRequest`).
- 2026-10-12 — Routing and who decides (one fix, every workflow). `resolveStageRoute`: `hr.leave` / `finance.expense_claim` → `hr_requests/approve_request` (role fallback manager → hr_manager → director → approver, else owner; `STAGE_PERMISSION_ALIASES.approve_request`); `finance.payout_request` → `field_execution_fept/trigger_payout`, the card carries `workflowRunId` so on both apps it opens the job's **Release worker payout** step (no approve form); when the payout is triggered, `FieldExecutionActions.triggerPayment` calls `platformRequestService.closePayoutNudges`, which completes the nudge and clears its cards. Approvals of hand-raised requests use the existing platform transition path (`POST /api/platform/requests/transition`, now idempotent on `requestId:toStatus`) from the inbox on both apps; there is no VP share on this step, so **no new `FINISHING_MODES` entry was needed** (deviation from the plan, which assumed the requisition share path). `AuthorizationService.decide` gained the role-permissions fallback the 2026-10-12 note above asked for: after grants, delegation and owner/admin, a member whose `roles.permissions` (by `membership_role`, else the starter catalogue) carry the permission is allowed (`request.approve` implies review/reject; `finance.release|pay` imply fulfil/complete), still subject to separation of duties. Verified in SGK Trial: Tendai raises leave → card to Kuda (owner; no manager role exists) → Chipo (finance manager, no `request.approve`) is refused → Kuda reviews and approves, replaying the same key is a no-op, the card leaves the inbox; Tendai's payout nudge for FR-1791718368527 lands with Chipo (`trigger_payout`), Chipo releases the payout by the normal share step and the nudge completes itself. Approval is the last step for `hr.leave`, `platform.general`, `finance.payout_request` (`DONE_WHEN_APPROVED`); an approved expense claim gets a typed finishing step, **Mark as paid back** (`receiptRef`, `amountPaid`), routed to finance (`release_funds`). "My requests" lists only roots (`parent_request_id IS NULL`); follow-ons (purchase order, supplier payment) show in the parent's History.
- 2026-10-12 — Approval records. Approving `hr.leave` sends a **Leave approved** record (`LeaveApprovalVC`) to the requester's wallet; approving `finance.expense_claim` sends an **Expense approved** record (`ExpenseApprovalVC`). Both go through `WorkflowVcOfferDispatcher.issueToHolder` (same inbox card as a job record, no second verify path) after `ensureRequestRecordModels` registers the model on that organisation. The person keeps it and can show it. A payout nudge does not get its own record; the job's payment record is the proof. Already-approved leave and expenses are sent once when the API starts. Deciding from the website inbox switches into the organisation that owns the request before `POST /api/platform/requests/transition`, so a personal session can approve the card it was sent.
- 2026-10-12 — Discovery and clients. `src/controllers/discovery/DiscoveryController.ts` (public, read-only) now backs the phone's Network → Discover, organisation page, mini-store and the website sheet: `GET /api/discovery/organizations|search|organizations/{id}|organizations/{id}/storefront`, limited to organisations that chose to sell (setup kind `shop`, the 2026-10-06 rule) and set themselves public. The dead `POST /api/vc-requests` calls on the phone (organisation page, `/shop`) were re-pointed to `POST /workflow-requests`. A person's wallet tenant is not in the canonical tenant store, so `PersistenceTenantMirrorService` mirrors a minimal `USER` row from `ssi_users` when such a person writes to an FK-bound table (the FK on `workflow_requests.requester_tenant_id` otherwise refused every client request). Excluded on purpose: payroll bulk payout, wallet backup/migration file, parent school-fee request kind (pay-by-link exists), unauthenticated public requests. The legacy `OperationsController` (`/api/operations/leave|expenses`, tenant-less) is marked deprecated and kept only for the website HR Operations page, which is not yet re-pointed.
- 2026-10-12 — People & payroll is a module an organisation chooses, not a given. Setup asks a fourth question, "Do you manage staff leave and payroll here?" (portal `onboarding.tsx`, phone `settings/org.tsx`, mirrored `orgProfile.ts`); the answer is `org_setup_profiles.modules` (`["people_payroll"]`, migration 113). A small plan layer sits beside it: `org_plans` (tier `free` | `premium`, `granted_modules`, `note`) read through `OrgEntitlementService.hasModule(orgTenantId, 'people_payroll')` = chosen in setup **and** allowed by the plan (premium, or granted; an organisation with no plan row is free with People & payroll granted, note `pilot`, so the UI says "Part of the paid plan. Free during the pilot."). Existing organisations were backfilled on only when they already had `hr.leave` / `finance.expense_claim` requests or an HR/payslip workflow template (SGK Trial is on). Gates, one place each: `OrgSetupProfileService.requestTypesFor` adds `hr_requests` ("Staff requests") to the organisation's request types only when the module is usable, so the Staff requests inbox tab (`inboxTabConfigured('people')` ← `hrOps` ← `hr-requests` token in both `workflowCapabilities.ts`) and the readiness list follow it; `PlatformRequestService.optionsForSubject` leaves out Ask for leave / Claim an expense / payslips for memberships whose organisation is off, and `create` refuses `hr.leave` / `finance.expense_claim` with the plain line "Your organisation has not switched on People & payroll. Ask the owner to turn it on under Organization setup." (`RequestController.raise` → 403). `hr_requests` has its own prerequisite ("Who approves leave and expense claims", `approve_request`) and `OrgStarterRoles` adds the _Manager_ starter role when the module is on. Inbox filing on both apps: `isPeopleRequestType` (hr._, finance.expense_claim) puts the approver's leave/expense card **and** the Leave approved / Expense approved record under **Staff requests**, never under Jobs — `issueToHolder` no longer writes `workflow_run_id` for a request record; it writes `metadata.requestType` instead (migration 113 fixed the three existing LeaveApprovalVC offers). `GET /api/wallet/credentials/pending-offers` returns that metadata as `claims`, so the phone reads `claims.requestType`. Walked end to end on Harare Field Co (off → 403; on → Tendai raises, Kuda's card says `hr.leave`, in_review → approved, "Annual leave approved" from Harare Field Co lands under Staff requests with no run id; off again → not offered, record stays). Portal `RequestWorkspace.tsx` has the same `people` tab and `isPeopleLikeRequest`; the website still shows no personal record offers (phone only). Excluded on purpose: `finance.payout_request` and `platform.general` stay available to every organisation (they are not HR), and the deprecated `/api/operations/_` page is not gated.
- 2026-10-12 — My Records filed by workflow (both apps). The phone Records page (`credo-ui/mobile/pages/proofs.tsx`) and the website wallet (`credo-ui/portal/pages/wallet/index.tsx`) used three separate regex taxonomies (Identity / Payments / Employment / Education / Healthcare / Government / Other on the phone; Receipts / Invoices / Other Credentials on the website; a fourth copy on the phone Home), so a **Leave approved** record fell into "Other", every empty section was still drawn, and job records read "Generic ID · Issued by Cryptographic Key Issuer" under Identity. Both pages (and phone Home) now call one mirrored helper in `workflowCapabilities.ts` (`recordSectionOf`, `RECORD_SECTION_ORDER`, `RECORD_SECTION_LABELS`, `recordCardTitle`): sections use the inbox-tab words (Identity, Staff cards, Jobs, Purchase requests, Staff requests, School fees, Money in, Counter sales, Other), only non-empty sections render, and a job record is titled "Job card · FR-…" from its claims even when its type is the older generic one. Two server causes fixed: (1) `CredentialIssuanceService.createOffer` fell back to the first supported issuer config when `RequisitionVC_jwt_vc_json` (and SiteInspectionVC, ExecutionAckVC, QuoteVC, PaymentReceiptVC, DeliveryProofVC, PayslipVC) was not registered on the organisation, so job cards were issued as `GenericIDCredential`; it now calls `modelRegistry.ensureRecordModels` (the same path `ensureRequestRecordModels` used for leave/expense) before falling back — verified: "Registered record model on first use", RequisitionVC now on SGK Trial. (2) `WorkflowVcOfferDispatcher` adds `orgName` to every record's claims, and `GET /api/wallet/{id}/credentials/list` returns `issuerName` for older cards without it (issued-card register, else the accepted inbox offer with the same reference), because every card is signed with the shared platform key and the issuer DID cannot name the organisation. Not changed: the "Role card (older)" still shows its raw `field_execution_fept` claim on the website.
- 2026-10-12 — Personal activity: who has your data, what you shared, for what (one log, every workflow). Every share a wallet makes is written by `StageProofService.recordShareFromWallet` — the embedded-wallet path (`presentFromEmbeddedWallet`, used by field sign-off / payout in `WorkflowController`, purchase approve / release / acknowledge in `RequisitionController`, payable transitions and collection consent) and the phone path (`WalletController.usePresentationRequest`) both end there, so no workflow gets its own writer. `verifyStageProof` writes the answer (`share_verified`, or `share_refused` with the plain reason: card withdrawn, job line did not match, step not on the card). The phone share screen gained **Not now**, which posts `POST /api/wallet/activity/declined` (`share_declined`) and goes back; a stable `source_id` (`requestId:outcome`) makes every retry a no-op, matching the `IdempotencyGuard` rule for finishing steps. Cards: `WalletCredentialsController.acceptOffer` writes `card_received` (outcome `replaced` when the offer carries `metadata.replaces`, so a re-sent staff card shows "replaces your earlier one"); `CredentialLifecycleService.revokeStaffCards` writes `card_withdrawn`. Deviation from the plan: there is no separate `share_requested` row — the names of the cards and claims asked for live on the `shared` row (and on the `share_declined` row), because a request the wallet never answered is already an inbox card and would otherwise appear twice. Approvals of the person's own requests stay in "My requests". Readers: `GET /api/wallet/activity` (cursor paged, `kind`, `orgTenantId`, `format=csv`) and `/partners`; UI twins `holderActivity.ts` and `PersonalActivityPanel.tsx` (phone `/activity` personal lens with "Payments, receipts and job history →" to the organisation view, website `/activity`; Home strips in personal context read the same endpoint, organisation context unchanged). Verified: migration 114 and the start-up backfill (49 cards, 46 past shares from the `ack` / `payment` presentation stamps); the writers with a runtime check (`shared` with requested / shared / withheld names and the signed line "Release worker payout · Job FR-1791721983617 · 110", `share_verified`, `share_refused` with reason, replay deduped, `share_declined`, paging, CSV, partners); the pages on both apps in the browser (Tendai: Harare Field Co "3 cards · no shares · you are a member", SGK Trial "no working card", 14 entries, detail sheet, identity card attributed to IdenEx Credentis). Not driven live this round: a fresh share → verified → "Not now" → card withdrawn through the two UIs, because no step was waiting on either signed-in account; the next job that reaches sign-off exercises the same path. Excluded on purpose: organisation-side audit (`/workflows/runs/{id}/audit`, finance reports) is unchanged; the staff-card re-send itself is still logged on the organisation audit, the person sees it as `card_received · replaced`.
- 2026-10-12 — Design rule, recorded after the "one job, linked workflows" review: work, money owed and proof stay three separate records, and the field job is the parent only for its own hand-offs. **Work** is the field-job run (`field_execution_fept`) with the FEPT stage list (assign, evidence checkpoints, sign-off, payout); its children — materials purchase → purchase order → supplier payment (`RequestHandoffService` `DEFAULT_REQUEST_HANDOFFS`), extra-work quote, client bill, worker payout — are their own runs or platform requests with their own id and status, linked by `workflow_handoff_links` / `parent_request_id` (`WorkflowHandoffService`, durable link row first so a retry never starts a child twice). **Money owed** lives in its own ledgers: supplier bills in `AccountsPayableLedgerService` (money out), client payment links and receipts (money in), the worker payout as a step on the job; closing the work, the client paying and releasing the payout are three events, and approval is never payment. **Proof** is issued only where another person or organisation must check it later (staff card, job card, receipt, leave or expense approval); internal status changes are append-only audit events, never credentials. The job screen assembles the chain without merging lifecycles (`familyOf`, Where this fits / Related work); purchase rows stay out of the job History. Out of scope on purpose, so later work does not collapse these chains: no stock check, issue-to-job or inventory (MVP_GOALS); no job-costed payroll, timesheets, pay runs or deductions (People & payroll is leave, expenses and resending a payslip; a contractor who invoices is a supplier bill, not payroll); no supplier bill or payment allocated across several jobs (one chain, one job reference — add allocation only when a real invoice arrives that way); no second, generic job status machine beside the FEPT stages; no general ledger, tax or fiscalisation; no credential per internal hand-off; no supplier-facing verifier product this pass. School fees, counter sales and checkout keep their own parents — the field job is one parent, not the centre of the platform. Known limits left until a pilot asks: partial receipt / partial payment / deposits / returns and credit notes are not first-class states; an expense claim is not tied to a job; the job has no single money summary (materials spent, supplier owed, client to pay, payout to release) — Related work and the Finance tabs show the pieces, and a short summary on the job that still opens each item in its own module is the one UI idea worth keeping for later.
- 2026-10-12 — The other centres, checked against the same rule. `WORKFLOW_HANDOFF_CATALOG` starts children only from `field_execution_fept` (materials purchase, extra-work quote). No other live flow hangs a purchase, a client bill and a worker payout off one parent. The same link (`parent_request_id`, own id, own status, the next person still acts) is reused by shorter chains that are their own centre: a purchase raised from organisation Home (`procurement.requisition` → purchase order → supplier payment; cash stops at the receipt), an expense claim (`finance.expense_claim` → expense payment → mark as paid back, not tied to a job), a quote asked from Discover (`quote` → `invoice` → `finance.payment_request`; the quote template is the job's child only when the job starts it), and site access → inspection → maintenance (no client bill, no supplier bill, no payout). Standing alone, one transaction each: school fees (`tpl-education-fee`), a counter sale (`tpl-cash-counter`), collect a payment (`tpl-payment-collection` when no job started it), leave (`hr.leave`, approval is the last step), something else and send-it-again (`platform.general`; a payslip sent again is not a pay run), and the staff card and identity card (membership, not a transaction). `tpl-ap-payables` and `tpl-ar-collections` stay templates: money out is the purchase chain plus the payables ledger, money in is the pay link and the receipt. Shared with the field job, and only that: a child never takes the parent's status, a retry does not start the child twice, and a credential is issued only where someone else must check it later.
- 2026-10-12 — AP and AR now enforce that rule in persisted data (migration 115, `BusinessTransactionService`). A purchase — whether raised from a field job or directly from Home — is one `business_transaction`; the approved order, delivery/service receipt (`purchase_receipts`), supplier bill (`ap_invoices`) and payable (`financial_obligations`) are separate linked facts. The normal UI now raises `procurement.requisition` through the platform request chain instead of the legacy finance-only route. A supplier-payment request starts only after ordered, received and billed values match; a mismatch is a disputed payable until an authorised person accepts the stated difference. A sale, fee or field-job bill is the centre on the money-in side; its receivable survives failed or expired `payment_links`, because those links are collection attempts rather than the debt itself. A payment produces one idempotent `settlement_allocation` and can partly reduce an obligation; instalment plans have one transaction and one receivable per instalment. Finance on the website and phone shows transaction, owed and received/paid separately, and balance-sheet reporting reads open obligations instead of treating pending carts or expense claims as debts. Existing request, invoice and payment ids remain authoritative in their modules and are linked, not replaced. Proof remains at a person/organisation boundary (staff card, approval, invoice/receipt or payment record); matching, ageing, reminders and balance arithmetic remain ordinary auditable application data. Explicit limits remain: this is not a general ledger, tax or inventory system, and one supplier bill is not allocated across several jobs.
- 2026-10-12 — Duplicate staff cards in My Records, and the Records screen that kept refreshing (debugged with runtime logs, verified on both apps). **Cause 1, duplicates:** the wallet listing decided "withdrawn" only from the issued-card register (`issued_credentials`, keyed by the card's `id` / `jti`). Cards issued before the register existed have no row there and most carry no `id` or `jti` at all, so `revocationOf(undefined)` always said "valid" even when the inbox row that delivered the card said `withdrawn: replaced by a newer staff card`. Tendai showed five live staff cards; the Activity page already said SGK Trial held none. Fix: `CredentialLifecycleService.heldCardLife` — register first; when the register has nothing, a staff card is paired with the accepted `org_employee` inbox row for the same organisation whose `accepted_at` is nearest the card's `createdAt` (same request, within two minutes), and that row's `withdrawn:` note, or a newer accepted row for the same membership, ends the card. `WalletController.allWalletCards` calls it with the bare wallet id (Credo's `contextCorrelationId` is `tenant-<id>`; the first attempt matched nothing because of that prefix). **Cause 2:** memberships that accepted two staff cards before the 2026-10-08 rule ("accepting a new card withdraws the earlier ones") were never swept; `withdrawSupersededStaffCards` runs on every start, keeps the newest accepted card per (wallet, organisation, person) and withdraws the rest through `revokeStaffCards`, so the person's Activity log gets the "withdrew your staff card" line. First run: one older Harare Field Co card for each of four people; second run: nothing. Result: phone Records Active 11 → 7, Archived 1 → 5; website wallet files Kuda's older Harare card under Archived. **Cause 3, refreshing:** `proofs.tsx` re-fetched the wallet every 15 s and on every focus / visibility event (including `hidden`), each time setting `loading = true`, so the list was swapped for a spinner every 15 s (five requests per cycle), and `_app.tsx` ran a second full snapshot sync every 30 s. Now: the last known list paints first from the offline copy; the network load follows; a background refresh (`focus`, `online`, `visibilitychange` → visible only) is silent — cards stay on screen and the new list swaps in; only first load, pull-to-refresh and the Refresh button show the spinner; one request in flight at a time; no timer. The offline snapshot sync is event-driven the same way with a five-minute ceiling while the app is open. **Cause 4, offline copy:** `normalizeCredentialRows` in `walletSnapshotSync.ts` read `id` / `type` / `addedOn` but the list endpoint returns `vc_id` / `vc_type` / `issued_at`, so every card collapsed to one key and the background sync overwrote the cache with a single card (the first paint showed "Active (1)"). One exported `normalizeWalletCredentialRows` now serves the Records screen and the sync. Not changed: the three "Annual leave approved" cards in Tendai's inbox are three distinct approved requests raised during testing, one record each, not a duplicate offer; the Records banner "16 records are waiting" counts every unresolved offer while the inbox files three of them under Archived — the two counts come from different rules (`pending-offers` vs `isArchived` in `inbox.tsx`) and were left as is this round.
- 2026-10-12 — "Check it is still valid" failed on every record. `GET /api/verify/:vcId` read columns `issued_credentials` does not have (`type`, `claims`, `issuer_did`, `expires_at`); the document lives in `credential_data`, so `JSON.parse` threw and the catch answered `invalid`, which both apps showed as "not found". `CredentialLifecycleService.checkRecord` reads the register properly (type and subject from the stored document, standing from `revoked`) and falls back to an accepted `wallet_pending_offers` row; the controller only calls it. The public page `credo-ui/portal/pages/verify` (also the `?id=` short-link target; the raw-id `[vcId]` page is gone), both Home dashboards (phone quick action "Check", website header button "Check a record") and both record-detail screens render the same `RecordCheckPanel`, with the words and claim rows in the mirrored `recordCheck` helper. A check that comes back revoked marks the card withdrawn on that device.
- 2026-10-12 — The "16 records waiting" banner was not a second copy of the cards already in My Records. Of the 16 unresolved inbox rows, three were the same annual leave (20–21 Oct, SGK Trial) queued once per approved request, because `issueToHolder` only skips a repeat when the request id matches. `PlatformRequestService.collapseDuplicateApprovalOffers` keeps one card per leave window (or per expense amount and description) and closes the rest (`superseded: same approval already offered`); `issueApprovalRecord` now refuses a second card for that same window. Verified on Tendai: first pass closed 2, second pass closed 0, Records banner 16 → 13. The remaining 13 are different things still waiting to be kept: 7 job cards (different job numbers), 3 completion records, 2 replacement staff cards, and 1 leave record. The job-assignment step is no longer counted on the Records banner; it stays in the inbox. The phone inbox was still showing the closed copies because `mergeWithInboxCache` put every previously seen card back on a successful load. A successful load now replaces the cache (`authoritative`); the cache is used only when the load fails, which is the offline case. Verified: Staff requests 3 → 1, inbox 12 new → 10 new, cache merge log `resurrected: 0`. Phone only for the cache; the website inbox does not keep that copy. The website wallet has no waiting-count banner.
- 2026-10-12 — Navigation now follows the transaction model. Work is the action queue (Inbox, Approvals, All requests); Operations owns Jobs, Purchase requests, School fees and Shop & services; Money shows only Money in and Money out; People exposes Staff requests and Payroll when enabled. The phone uses the same Operations/Money split inside its organisation hub. `classifyBusinessCentre` in both mirrored `workflowCapabilities.ts` copies classifies the owning field job, purchase, fee, commerce/service or People flow before inbox filing; AR, AP, payment methods and delivery/service confirmation remain attached capabilities. Old `/finance?tab=field|requisitions|invoices` website links redirect to the canonical Operations page without losing the selected job, request or fee. Intentional phone difference: People administration remains website-only; the phone opens Staff requests in the inbox.
- 2026-10-12 — School fees run on the same pay-link rail as a field job's bill. Both apps start one `education_fee_payment` run per fee with `POST /workflows/education_fee_payment/execute` (portal `/finance/school-fees` "New fee", phone Operations → School fees "New school fee"); the old `/api/finance/invoices/issue` path is no longer used by either screen. `tpl-education-fee` is now `finance.calculate_invoice` → `client.request_payment` (`transactionType: 'fee_assessment'`, waits on `AWAIT_CLIENT_PAYMENT`) → `client.record_payment` → `credential.issue SchoolFeeReceiptVC` (`holder: 'organization'`, so the school keeps its copy; the parent gets the invoice and receipt from the pay page). A fee that has no parent job owns its debt: `ReceivablePlanService.createForJob` makes the `fee_assessment` business transaction, one pay link and one amount owed per instalment, and `PaymentLinkService.settlePaid` resumes the run. Progress words come from the mirrored `schoolFeeProgress` / `schoolFeeStatusWords` / `schoolFeeTitle` (`financeStages.ts` ↔ `uxCopy.ts`); the Paid step names the parent ("Rudo Moyo (parent)"), the receipt step names the stage actor. Fixes found on the live walk reach every pay link, not only fees: the phone `/pay/[code]` page opens for signed-out payers (`PUBLIC_ROUTES` and the `/api/public/pay/` API prefix); links made by `ReceivablePlanService` carry `kind: 'invoice'`, so paying a bill or instalment no longer also sends the payer a quote; Money in shows "School fee" instead of "Sale" for education links (mirrored `moneyInKindWord`). Excluded, because they do not use `client.request_payment`: purchases, payables, counter sales and payroll. Verified: portal run `090fdf6d-e4a5-462d-8ab2-d8d08014766d` (BTX-E1CF9ECB, link 8AEASG) paid on the phone pay page and completed; phone run `89d215d5-b7b0-46b6-86cf-b94d1bed9ae7` (BTX-F41EF8B6, 3 × $300 links TQVX8Q / 5JGSNA / TGK3PQ) shows the same row and steps on both apps.
- 2026-10-12 — Readiness of every central business transaction, measured against the field job, is recorded in `docs/SGK_FEPT_GAP_MAP.md` ("How ready each business transaction is"). Usable: field job, purchase, school fee, and leave/expense requests. Split or partial: sale (a job's bill is on the pay-link rail; a counter sale is not) and collection plans. Payroll stays the website `/api/payroll` page and is not a transaction type. Next, when asked: counter sales, then collection-plan progress words. Shared leftovers (the record stays `open`, `tests/fept_chain.test.ts`) are fixed once for every type. Gaps 4 and 6 in that same file (generic labels, jargon on the job card) are closed by the plain-words remodel.
- 2026-10-13 — GenUI (Vercel AI SDK, AI Elements) reviewed for guidance; not the next build. Recorded in `docs/SGK_FEPT_GAP_MAP.md` ("Guidance with GenUI"). Order: a deterministic next-step layer on both apps (`GET /api/organizations/{id}/next-steps`, mirrored `nextSteps.ts`, one Home card), then a shared `StepHelp` popover on both apps, then a portal-only, owners-only setup assistant pilot under `src/ai/` that proposes and never acts. The phone, sharing and consent stay without an assistant; no claim values, phone numbers, keys or tokens go to a model.
- 2026-10-13 — Next step and shared help, no assistant. `GET /api/organizations/{id}/next-steps` returns at most five items: unresolved inbox cards for this person's wallet (and pending requests assigned to them, or unassigned ones for an owner, admin, manager or approver), then setup blockers only for an owner or admin. Both Home screens show one Next step card from the mirrored `nextSteps.ts`. `StepHelp` replaces the phone finance hover card and is also on Setup, the share review and job progress, on both apps. It follows Android's labelled control plus bottom sheet, because a hover card does not show on a phone. Reaches every inbox card (jobs, purchases, fees, approvals). Excluded: payroll, and any assistant.
- 2026-10-13 — Material 3 cleanup on the phone, per `.cursor/rules/android-material-3.mdc`. Touch targets 44 → 48 (top bar, bottom nav, sheet close, Help on both apps); theme shape scale (Paper 12dp, Modal 28dp); the last `Tooltip` (scan modes) is now plain inline text. Every bottom sheet was full height because Mantine never defines `--drawer-size-auto`; `styles/globals.css` now sets it, so Help, Settings, Scan modes and the Money sheets size to their content. `StepHelp` sets the same token itself so the portal sheet matches, and shows bullets under the portal's CSS reset. Phone Money help rewritten in plain words (Money in, Purchases, Money out). One "Progress" header per step list: `StageActorTimeline` takes an optional `title` on both apps, and the portal request, requisition and Money in wrappers no longer print a second one; the phone purchase detail label is "Progress" too. Reaches jobs, purchases, supplier bills, school fees and collections wherever they show steps or a sheet. Excluded: the docked Scan FAB and the glass top bar (known deviations, unchanged).
- 2026-10-13 — Help chip is 32dp on the action row (48dp tap target) on both apps, beside New job, New payment link, New school fee, New purchase and Record supplier bill on the phone. The phone Home attention card lists only what is waiting (wallet offers, or the organisation next-step inbox items) and says "All caught up" only when that list is empty; recent activity stays in its own list. Portal request details say "Purchase request" instead of `procurement.requisition`, and "Raised for this organisation" instead of `Source: platform`. Reaches jobs, purchases, fees, collections and supplier bills. Excluded: payroll.
- 2026-10-13 — Parent → child open restored on both apps. When the portal Money page was cut to Money in / Money out, its `tab=requisitions` redirect sent a child opened from a job ("Where this fits" / Related work, `financePathForChainMember`) to `/requests?tab=…&requestId=…`, which `RequestWorkspace` did not read, so nothing opened. Now `RequestWorkspace` reads `?tab=<category>` (also fixes the sidebar "Staff requests" link) and `?request=` / `?requestId=`, and fetches a request that is not on the loaded page; the redirect and the Purchases "New" page send `/requests?tab=requisitions&request=<id>`; a legacy `requisitionId` goes to `/finance/requisitions/<requisitionId>`; the job's client-payment button goes to Money in (`tab=ar`), not the removed `tab=payments`. On the phone, Open on a child now leaves the job sheet and lands on that child's tab with its History drawer (Purchases for a purchase request, expense claim or quote; Money out for an order, supplier bill or payment request), the same as the website; this supersedes the 2026-10-11 "opens as a sheet on the job" note. `AppShellMobile` steps over a stale sheet history marker on back so the Jobs tab and list come back cleanly. `financePathForChainMember` (both copies) also routes "payment request" to Money out. Reaches field-job children, purchase → order → supplier bill, expense claims, quotes / invoices / payment requests and the job's client bill. Excluded: school fees and counter sales (no parent/child link). `tests/fept_chain.test.ts` and two `tests/request_family_chain.test.ts` cases (readiness and the people_payroll module gate) were already failing before this change and are untouched by it.
- 2026-10-16 — Credential lifecycle operations has a unified organization workspace at `/organization/credential-operations` and backend API (`/api/organizations/credential-operations/*`) over the existing engine. It tracks queued offers and issued credentials, supports reasoned reoffer/replacement, and revokes through the existing status-list service. Suspension/reactivation are deliberately not exposed: current issued credentials carry revocation-purpose entries, so changing a bit for suspension would be interpreted as irreversible revocation by verifiers. Direct issue is restricted to configured standalone credential types; source-backed types stay tied to authoritative workflows. Receipt "send again" queues inbox offers for explicit holder acceptance rather than auto-accepting on behalf of holders.
- 2026-10-17 — Sign in with Credentis for partner platforms. Organisations register partner clients (migration 122 `partner_clients` / `partner_verification_sessions`; `PartnerClientService`; `/api/organizations/partner-clients`; portal _Organisation → Sign-in partners_). The secret is shown once and stored hashed. Changing the release policy, issuing a new secret, and turning a client off are all audited. Partners verify people through `/api/partner/v1/verifications` (`PartnerVerificationService`). It reuses `SSIAuthService.verifiedPlatformIdentity` (holder binding, trusted platform issuer, status, account control), so VC login and partner sign-in cannot drift. Each session is bound to the caller's `bindingRef`, and the result is read once (a second read gives 410). The partner gets a pairwise subject and allow-listed claims; with `org_members`, only active members get through, and their role is added. The hosted bridge (fork of `ssi-to-oidc-bridge`, branch `credentis`, `CREDENTIS.md`) runs Ory Hydra with vclogin delegating to that API via `x-bridge-key`. `HydraAdminClient` keeps Hydra clients in sync when `HYDRA_ADMIN_URL` is set. Verified live: authorize → wallet QR → presentation → code → id_token with the pairwise `sub` (equal to the direct-API subject), `name`, `credentis_org_role`, and no DID or contact claims. Also verified: a replayed code or a reused login challenge is refused; a non-member gets `access_denied`; the old secret is refused after rotation; revoke removes the Hydra client; dynamic registration and the legacy bridge routes are off. Fixed during the live run: Hydra v2 login challenges are about 1.5k characters, so the `bindingRef` limit is now 4096 (only its hash is stored). Excluded: credential types other than PlatformIdentityCredential, per-client trusted issuers, and a branded Hydra error page.
