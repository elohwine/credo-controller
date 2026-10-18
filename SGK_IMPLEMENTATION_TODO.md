# SGK Implementation TODO (Execution)

## 2026-10-16 - Purchase requests in Operations

- [x] Operations > Purchase requests uses the shared request list, scoped to purchases.
      Job-linked materials requests and older finance requisitions now appear together,
      with the same approval, receipt, status and job links as All requests.
      New requisition still opens the existing purchase request form.
- [x] Portal job actions follow the mobile order: next action before the timeline.
      Worker checkpoints, inspection, work review, sign-off and worker payout stay at the top;
      photo and receipt tabs remain available without hiding sign-off or payout.
- [x] Mobile primary actions come before related requests and evidence/history tabs.
      Opening photo capture keeps its destination instead of racing a drawer reset.

Status legend:

- [ ] Not started
- [~] In progress
- [x] Done

## Phase 1: Definition-Template Parity (P1)

- [x] Add missing credential definitions used by workflow templates:
  - `QuoteVC`
  - `PaymentReceiptVC`
  - `EscrowVC`
  - `DeliveryConfirmationVC`
  - `CreditEligibilityVC`
  - `ConsentVC`
  - `IdentityVerificationVC`
  - `PayslipVC`
  - `PayrollReportVC`
  - `DigitalTwinVC`
  - `PolicyVC`
- [x] Extend existing schemas for SGK profile compatibility:
  - `InvoiceVC` linkage fields (`requisitionId`, `linkedReceiptIds`, `linkedEvidenceIds`, etc.)
  - `ReceiptVC` material profile fields (`shopNumber`, `lineItems`, `vatAmount`, `jobId`, `workflowRunId`)
  - `RequisitionVC` job-card profile fields (`jobId`, `assignment`, `location`, `sla`, `approvedAmount`)
  - `ExecutionAckVC` completion profile fields (`completionStatus`, `customerSignoff`, `evidenceRefs`)
- [x] Relax over-strict required fields in shared schemas to avoid template issuance failures.

## Phase 2: FEPT and Scan Contract Enforcement (P1)

- [x] Add backend guard to block generic evidence route from mutating FEPT run progression.
- [x] Add explicit run-context scanner routing guard in mobile FEPT entry points.
- [x] Add tests for before/after checkpoint progression invariants.

## Phase 3: DID Contact Capability Routing (P2)

- [x] Extend contact/org capability metadata model with:
  - supported workflows
  - supported VC types/aliases
  - payment methods
  - verification/approval policies
- [x] Add capability-aware routing for workflow requests.
- [x] Add fallback policy for incomplete capability records.
- [x] Add API endpoints for contact capability setup and retrieval:
  - `GET /workflow-requests/contacts/{contactId}/capabilities`
  - `POST /workflow-requests/contacts/{contactId}/capabilities`

## Phase 4: Reconciliation Policy Packs (P2)

- [x] Implement policy modes:
  - 2-way matching (Approval/PO -> Invoice)
  - 3-way matching (Approval/PO -> Delivery/Receipt -> Invoice)
  - 4-way matching (Approval/PO -> Delivery/Receipt -> Invoice -> Payment/Completion)
- [x] Add duplicate billing and unauthorized charge checks.
- [x] Emit reconciliation decision evidence for audit.

## Phase 5: Verification and Delivery

- [x] Add integration test for SGK chain:
      request -> requisition/approval -> FEPT before/after -> receipt profile -> invoice -> payment receipt -> completion ack.
- [x] Validate metadata discovery exposure for newly seeded definitions.
- [x] Document rollout sequence for existing tenants (seed backfill + verification checks).

### Phase 5b: Org readiness replaces workflow activation (all workflows)

- [x] Per-template prerequisite declarations (`src/services/workflow/prerequisites.ts`) attached to every
      in-memory template and persisted per tenant (`workflow_templates.prerequisites`, migration 096).
- [x] Single readiness resolver (`WorkflowReadinessService`) used by the Setup Center readiness API, the
      per-template `GET /api/organizations/{orgTenantId}/workflows/{templateRef}/prerequisites` endpoint, the
      execution gate (`PlatformWorkflowService`, `WorkflowRequestController`) and the `workflow.start` action.
      `enabled` is a soft UI flag; `sector` is deprecated (mapped onto `workflowTypes`).
- [x] Missing prerequisites open an `organization.setup` task on the request (inbox/action model) instead
      of failing silently or warning-and-continuing.
- [x] FEPT stage actors (`assign_field_worker`, `acknowledge_execution`, `trigger_payout`) resolve via
      `OrgWorkflowActorService`; owner fallback surfaces as a readiness item rather than silently routing to
      the owner. `field.assign` uses the configured field worker when the dispatcher does not name one.
- [x] FEPT issues the SGK reuse-matrix VCs after checkpoints (RequisitionVC job card after assignment,
      ReceiptVC material profile after receipt evidence, ExecutionAckVC after acknowledgement) and hands off
      to `tpl-payment-collection` (InvoiceVC + PaymentReceiptVC) via `workflow.start`, gated on the org's
      payment readiness (`onNotReady: 'skip'`).
- [x] Engine: paused runs resume with their persisted state and the resume payload merged into input, so
      before → after → receipt checkpoints progress without losing stage/assignment/evidence.
- [x] Tests (`tests/org_readiness_resolver.test.ts`, `tests/org_readiness_gate.test.ts`,
      `tests/fept_chain.test.ts`): owner-only org missing items → adding role/actor/payment provider flips
      readiness; `startForRequest` on an unready org opens a setup task and does not start a run, then
      starts after configuration (FEPT + finance template); full FEPT chain incl. VC order/recipients,
      out-of-order evidence rejection, follow-on payment run and reconciliation ledger.
- [x] Migration `097_create_workflow_runtime_compat_schema.sql` gives fresh databases the workflow runtime,
      memberships, registry/catalog and reconciliation tables the registry previously skipped (no-op on live DBs).
- [x] Portal (`organization/onboarding.tsx`, `organization/setup.tsx`) and mobile (`settings/org.tsx`) post
      `workflowTypes` (no `sector`), show per-workflow readiness with prerequisite drill-down, and render
      `pending_external` as waiting rather than blocked.

### Phase 5c: Configurable stage actors and fallback policy (remodel §9 "Approval setup")

- [x] Per-organization fallback policy (`org_workflow_actor_policies`, migration 098) edited by owners/admins:
      ordered user/role/wallet chains per stage and org-wide, `useBuiltInRoleFallbacks`, `ownerFallbackEnabled`.
      `OrgWorkflowActorService.resolveActor` order: stage default → per-stage chain → org-wide chain → built-in
      role order (`roleFallbackFor`: per-workflow `ROLE_FALLBACK_BY_WORKFLOW_STAGE`, else `ROLE_FALLBACK_BY_STAGE_ACTION`, optional) → owner/admin (optional) → `unassigned`.
      New modes `policy_fallback` and `unassigned`; readiness treats `owner_fallback` and `unassigned` as
      setup items (`actionPath: /organization/actors`). Routing a stage explicitly to the owner counts as
      configured — the owner is only a _fallback_ when nobody chose them.
- [x] API (`OrganizationController`): `GET /{org}/workflows/actors` now returns saved defaults, members,
      role options, policy and `canEdit`; `PUT /{org}/workflows/actors/defaults` (person / role / wallet, or
      `enabled:false` to clear); `GET|PATCH /{org}/workflows/actors/policy`;
      `POST /{org}/workflows/actors/assign-unassigned` (cover every owner-fallback stage with one person/role).
- [x] Portal `organization/actors.tsx` (Organization → Workflow Actors): per-workflow stage pickers grouped
      People / Roles, resolution badge with "via" chain entry, org-wide chain editor (ordered), policy switches,
      bulk "assign all unassigned stages to…". Onboarding now lands here (`?from=onboarding`) before the
      readiness dashboard; Setup shows an "Approval setup" card and links `stage_actor:*` items to this page.
- [x] Mobile `settings/org.tsx` "Workflow Actors" covers every configured workflow (was AP-only) with the
      same person/role picker, bulk cover and the two policy checkboxes.
- [x] Tests `tests/org_actor_policy.test.ts`: default policy, org-wide chain, per-stage chain precedence,
      unresolvable entries skipped, stage default beats chains / clearing restores chain, built-in order and
      owner fallback switches (→ `unassigned`, readiness reason), chain sanitising and role options.

## 2026-10-07 — Saved accounts, stage records, quiet offline

- [x] The account menu remembers people signed in on this browser or phone and switches without mixing sessions. Stage records follow the organisation's record settings. A site inspection record and the completion record go to the organisation wallet. With no connection the last screen stays up, with no warning popup and no wait for a timeout.
- [x] 2026-10-07 test run (owner 263774183277, worker 263714123456, IdenEx Demo): job created on the portal, started, arrival by location and site inspection on the phone; the site inspection record reached the organisation inbox and the owner kept it. Fixed on the way: a field worker saw and could try to keep the organisation's record (now owner/admin only, refused with a plain message); the portal organisation inbox dropped records; the phone cut the record title to "Site"; the phone Settings sheet had no accounts list.

## 2026-10-08 — Android popup alerts

- [x] A waiting job or record can show an Android banner (high-importance channel, high-priority delivery). The status bar shows a white bell while that alert is waiting. The website has no banner. Delivery still needs Firebase app and server credentials, and a rebuilt app.

## 2026-10-07 — Native-feeling phone shell and priority dashboard

- [x] Phone source now handles Android status/navigation/cutout insets, keeps every sheet close button and the bottom menu out of the system bars, includes an in-app Back button, follows light/dark system-bar icon contrast, uses the device font, and spells role names in plain words. Portal Home now starts with "Needs your attention" and changes its links for personal versus organisation context. The installed APK still needs a later rebuild before these native-shell changes appear on the device.

## 2026-10-07 — Inbox split, record check, waiting-for name, photo location

- [x] Organisation and personal inboxes no longer mix. A record check uses the public check. Job waiting lines name the person. Before and after photos ask for location before the camera opens.

## 2026-10-07 — A team invite opens an account when there is none

- [x] Inviting a phone that has not signed up creates their account, the employee contact, and the staff card, then sends them a message. They choose their own PIN on first sign-in.

## 2026-10-07 — Saved contacts show who is actually in the app

- [x] Contact lists on the website and the phone mark each saved person In the app or Invite. Invite is for a phone that has not signed up yet. A saved outside contact is not treated as ready to receive a job card.

## 2026-10-07 — Roles follow the setup answers

- [x] Roles page fills from the setup answers (and from roles already in use) instead of staying empty after a field worker accepts a staff card. Team invites and on-the-team contacts use that list. An outside contact is not given a role and is not added to the team when sent a job; they get the job card only if they already have the app.

## 2026-10-06 — Inbox tabs follow the organisation's setup

- [x] The phone inbox and the website Inbox / Requests pages now show the same tabs the Money page does, taken from the workflows the organisation switched on at setup: Jobs, Purchase requests, School fees, Payments, Supplier bills, Counter sales (phone adds Receipts and Archived). The old fixed Finance / Ops pair is gone. A tab also appears when the list already holds an item of that kind, so the personal account sees Jobs when jobs are waiting even without an organisation selected. Job records issued from a job (job card, completion record) sit under Jobs. Shared rule: `credo-ui/mobile/lib/workflowCapabilities.ts` ↔ `credo-ui/portal/lib/workflowCapabilities.ts` (`visibleInboxTabs`, `INBOX_TAB_LABELS`).

## 2026-10-06 — Old staff cards stop working when a role changes

- [x] Every staff card now carries a status entry (W3C Bitstring Status List) and an id, on both issuers (`samples/startServer.js` and `cliAgent.ts`). The issuer keeps a row per card in `issued_credentials`; the step verifier refuses a withdrawn card with "The card you shared is no longer valid. Accept the newer card in your inbox, then try again." Two defects that had silently blocked this were fixed: migration 050 (status-list tables) was never registered (now `106_create_credential_status_lists_compat.sql`) and `IssuedCredentialRepository.save` had a broken `ON CONFLICT` clause.
- [x] Role change: the person gets a new staff card whose inbox text says what changed ("Your role at SGK Trial changed from field worker to supervisor…"). The card they hold stops straight away only when the new role has fewer steps; otherwise it keeps working until they accept the new one. Accepting the new card withdraws every earlier accepted staff card from that organisation. Removing a member withdraws all their staff cards and clears waiting offers. Logic: `src/services/ssi/CredentialLifecycleService.ts`, called from `OrgMembershipCredentialService` and `OrganizationService`.
- [x] Organisation setting "When a role changes" on the People page (website) and Team section (phone): stops only if the new role has fewer steps (recommended) / stops straight away, every time. Saved through `PUT /setup/profile { staffCardChange }` without touching the setup answers.
- [x] People table: "Send again" is available for an accepted staff card on both surfaces, with the hint "Sends a fresh card. The one they hold stops working once they accept it." Verified: Tendai's resend → accept → earlier card revoked on the status list and in `issued_credentials`.
- [x] Records (phone) and My Saved Items (website) flag a withdrawn card "No longer valid", hide Share on it, and offer "Remove from this device" (new `DELETE /api/wallet/{walletId}/credentials/{id}`, works for W3C and selective-disclosure cards). Verified on the phone: the withdrawn card was removed and the Active count dropped.
- [x] Inbox cards on the phone and inbox rows on the website show "Your step: …" (Start job, Add photos, Sign off job, Release payment, Review work, Approve request, Accept card, Save receipt, Pay, Share proof…). One helper, `stepRequiredLabel`, identical in `credo-ui/mobile/lib/uxCopy.ts` and `credo-ui/portal/components/finance/financeStages.ts`; it replaced the three separate word lists the inbox, the website inbox and the field cards used.
- [x] 2026-10-10: the share screen no longer lists a withdrawn, expired or inactive card (`StageProofService.presentableCandidates`). Still true: cards issued before 2026-10-06 22:30 have no issued row and are only withdrawn by the inbox flag, not on the status list.

## 2026-10-06 — A share shows what is shared and what stays on the phone

- [x] Staff cards and role cards are issued so a step can ask for only the details it needs. The phone and the website list those under Shared and the rest under Not shared. Older cards still share the whole record, and the screen says so. New proof requests use the newer query; the older one stays for wallets that only speak that.
- [x] Tendai accepted a new SGK Trial staff card in the phone inbox. It is stored as a selective-disclosure card. 2026-10-10: Rudo's live sign-off on job FR-1791644376331 was watched on the share screen; her card is an older whole-record card, so the screen said "The whole record is shared" and the step went through.
- [x] 2026-10-11: A step asks only for that step (`buildStageProofDcqlQuery` filters `stageActions`). New cards disclose each step on its own (`sdJwtDisclosureFrame`). The share names the step and the job, and the wallet signs them. The next staff card replaces one that still shares the whole list.
- [x] 2026-10-11, later: Only that step is sent (Credo's empty step list is filled from the request's value; the card signs the job line). Run on FR-1791718401539 end to end; the verifier got one step each for sign-off and payout.
- [x] 2026-10-11: Quote for extra work runs: the client gets a link by text to accept and pay, or decline (`client.request_payment`, `/pay/{code}` on phone and website). Paid → the job continues; declined → the quote shows Declined and the job stops waiting.
- [x] 2026-10-11: After-job bill and receipt reach the client, not the payout person; quote lines count; client phone on the job form (website and phone). Run on FR-1791721053299.
- [ ] 2026-10-11: Real EcoCash prompt (payments are simulated while `ECOCASH_API_KEY` is unset); SMS/WhatsApp delivery needs the provider keys to reach a real phone.

## 2026-10-06 — One staff card instead of a card per kind of request

- [x] The steps a person confirms are claims on their staff card. The team list on the website and the phone shows those steps on that card. Waiting per-request cards are cleared when the staff card is sent. Selective disclosure was not adopted: the organization checking the card is the one that sent it.
- [x] Kuda, Tendai, Rudo and Chipo accepted their SGK Trial staff cards in their own account inbox on the phone (cards arrive on the person's account, not the organisation view). The team list stayed on "Cards to send · 1/2" because it looked for the accepted card in the legacy `wallet_credentials` table (empty); it now reads the accepted offer row and the list says "Everyone has what they need in the app."
- [x] My Records (phone) and My Saved Items (website) now show the staff card under Employment as "Staff card · From SGK Trial" with plain details (Organisation, Role, You confirm: signing off…). The phone list was collapsing every record into one card (dedupe keyed on `id`/`type` but the list endpoint returns `vc_id`/`vc_type`); fixed. The inbox offer reads "Staff card · SGK Trial". Older per-request cards read "Role card (older)".

## 2026-10-06 — Setup answers gate the store

- [x] One project. The setup question offers school fees and selling or advertising again. Those answers show school-fee invoices, the store, the catalog and publishing. An organisation that does not sell or advertise cannot be made public, cannot add catalog items, and is left out of discovery.

## 2026-10-06 — `sgk` demo branch hides non-SGK surfaces

- [x] Branch `sgk` was cut from `platform-remodel` (f310880). The later setup-answers section replaces the hardcoded hide: school fees, the store and publishing follow the setup question.

## 2026-10-06 — The four workflow-shaped setup gaps are closed

- [x] Saving setup answers no longer writes a workflow catalog. Readiness no longer blocks on non-money people. Who does what does not assign job stages up front; the job form asks who goes out and who checks the work. The onboarding write-up no longer describes choosing a workflow.

## 2026-10-05 — Setup is one question per window

- [x] Website and phone setup is a four-step checklist. Each step opens its own window, then offers Next or Finish later. Who does what is one category per window (Money, each kind of request, If nobody is chosen, Role cards). A money step that still needs a chosen person names who is standing in. Answers are saved with `PUT /setup/profile`.

## 2026-10-05 — Field worker name and receipt line on the closed job

- [x] Opening the team list reads a person's name from their identity card when the contact was still the placeholder "Team member". Job FR-1791199813840 now shows Tendai on the assignment, the history, and the progress steps. Receipt issued shows Chipo, the same person who released payment.

## 2026-10-05 — Field job FR-1791199813840 closed through the review screen

- [x] Harare Field Co job FR-1791199813840 reached Closed / reconciled after Chipo reviewed what the wallet would share and released the $150 payment in the phone app. History shows Rudo (work review), Kuda Moyo (sign-off) and Chipo (payment released). The field worker line still says "Team member".

## 2026-10-04 — Progressive evidence and single next step

- [x] Evidence capture is camera-only and phase-locked (`credo-ui/mobile/components/scan/EvidenceCapture.tsx`):
      before and after photos are always live, after photos require a "work is finished" confirmation, and
      the capture time is fixed on the device while the server seals its own time
      (`FieldExecutionActions.captureEvidence` stores `deviceCapturedAt` + `capturedAt`).
- [x] Portal job drawer (`JobCardDetail.tsx`) shows the before/after pair with both times, location and
      a sealed mark; the Documents tab lists issued records instead of a placeholder purchase order.
- [x] Requisition detail shows exactly one next step on the portal and the phone app
      (`requisitionNextStep` in `financeStages.ts` and `uxCopy.ts`).
- [x] Requisition delivery confirmation issues `ExecutionAckVC` through the `workflow.vc.issue` outbox,
      matching approval and release (`RequisitionController.acknowledgeExecution`).
- [ ] Still open: an in-progress photo prompt for work that will be covered up, and embedding the time
      and location inside the image file itself.

## 2026-10-08 — Record settings and the job timeline

- [x] Owners and admins set Always, optional, or Off for the records a workflow in use actually issues. The website Setup page and the phone Organisation screen share that section. Running jobs are not rebuilt.
- [x] The job timeline on the website and the phone shows those issued records next to the photos, names the field worker on the site check, says "Start the job" when the worker has not begun, and hides the raw run id.

## 2026-10-06 — Arrival before the site check

- [x] A new field job pauses for the worker to head out, then to prove arrival, and only then for the site check and the safety check. Jobs already started keep the step list they began with.

## 2026-10-06 — Phone inbox shows one plain status row

- [x] The status pills sit once, at the bottom of the card: Job, Payment, Invoice sent, Waiting, and Needs attention when it is urgent. The date sits on the title line. The sentence about the message stays under the title. The card does not show a raw organisation id or run id.

## 2026-10-06 — A saved money choice ticks setup

- [x] "Choose who handles money" ticks once that answer is saved, on the website and the phone. If the named people are not on the team yet, the tick stays and the step says who to invite. The owner stands in until then.
- [x] Each money choice shows what it means, who confirms, and who releases the money. Payment choices show their short explanation too.

## 2026-10-06 — Full four-person job run closed through the screens

- [x] Job FR-1791305444812 ran owner → field worker → supervisor → finance manager on the SGK Trial organisation and closed with both wallet confirmations (details in `docs/SGK_FEPT_GAP_MAP.md`).
- [x] Phone share screen no longer crashes when boxes are unticked quickly.
- [x] Website Progress "Who" lines name the person who actually did the step.
- [ ] Decide whether the site check belongs to the chosen inspector only; today the worker can also record it. (2026-10-10 rerun: unchanged, Tendai recorded it.)
- [x] Share screens list only the job organisation's records (2026-10-10 rerun: Rudo's and Chipo's share screens each listed one SGK Trial staff card).
- [ ] Replace raw run ids and stage names on the phone (capture titles, inbox badges, history, Activity page) with the job reference and plain words; stamp each timeline step with its own time. (2026-10-10 rerun: inbox cards and the job timeline are clean; the capture header still says "Attaching before photos to: Job c5c8410e-…".)

## 2026-10-09 — Safety check hold: explicit choice, organisation resolves, worker re-checks

- [x] The phone safety check is a choice (Safe to start / Not safe - hold the job). A blank choice or Safe without the PPE tick is an error and records nothing; it cannot put the job on hold.
- [x] Not safe needs a reason and a live photo. The hold is stored on the job with an id, the organisation gets a "Safety hold on job" inbox card, and the event and outbox message are recorded once even if the phone retries.
- [x] An owner, admin or the "Sort out the safety hold" person marks the issue resolved with a note (idempotent); the worker gets a "safety issue resolved" card and must redo the check, saying what changed. The organisation never passes the check for the worker.
- [x] Holds, photos, notes and state show on the job timeline on the phone and the website; reassigning the job ends a live hold.
- [x] Tests: `src/services/workflow/actions/__tests__/fieldCheckpoints.spec.ts`, hold / resolve / replay steps in `tests/fept_chain.test.ts`.

## 2026-10-10 — Purchases for a job: bought, delivered, paid, receipts back on the job

- [x] Approved purchase requests, purchase orders and payment requests get a follow-up card (Mark as bought / delivered / paid) with receipt or bill number and amount; the server checks them.
- [x] Purchase order → supplier payment starts on delivery with the bill number (migration 110).
- [x] Buy materials: no supplier = cash purchase; supplier = purchase order → supplier payment. The job waits for the receipt by default; What happens next can switch it to approval.
- [x] The job's receipt step (phone) can use the purchase receipts.
- [x] Tests: `tests/workflow_handoff.test.ts`, `tests/request_handoff.test.ts`, `tests/inbox_attention.test.ts`.
- [x] Mark as bought / delivered / paid needs a receipt photo (website upload; phone live photo or a wallet receipt record). The images come back to the job as its receipt evidence and show as thumbnails on both surfaces.
- [x] Write the supplier bill to the payables ledger (2026-10-11, `AccountsPayableLedgerService`; the bill keeps the request and the job reference).
- [x] List request follow-up cards in the website inbox (2026-10-11, inbox shows the next step on each request card).
- [ ] Requests approved before 2026-10-10 get no follow-up card.

## 2026-10-10 — SGK rerun with a purchase; roles and steps mapped once

- [x] Job FR-1791644376331 closed through the real screens: owner (website) → Tendai (phone, including Buy materials and Use the purchase receipts) → owner approves and marks bought with a receipt photo (website) → Rudo reviews and signs off (phone) → Chipo releases payout (phone). Website: Closed, Photos (2), Receipts (1). Write-up in `docs/SGK_FEPT_GAP_MAP.md`.
- [x] Fixed on the way: hand-offs missing on jobs from the organisation's copy of the field template; receipt step demanded a location; Use the purchase receipts needed a reload; sign-off person's card refused on the share screen.
- [x] Who may act on a step is answered once (`OrgWorkflowActorService.mayAct`): named on the job, chosen for the step, holds the step's role (every member in it; owner and admin as one role), or an owner/admin standing in. Inbox routing, staff-card steps, finishing endpoints (sign-off, payout, safety hold) and the share screen / proof check all use it. Field sign-off role order: supervisor, inspector, manager, dispatcher (field worker removed). Sign-off waived with nobody chosen → owner recorded. Tests: `tests/org_membership_inbox.test.ts` (role stand-ins, chosen person, named person's card).
- [ ] Website request detail prints raw kind names (`PROCUREMENT.REQUISITION`) and stale "Last status update PENDING" / "WORKFLOW ROUTING …" on a finished request.

## 2026-10-12 — Requests from Home: one entry, three groups, context-aware

- [x] Phone Home: Scan · Receive · Pay · Share · **Request**. Website Home: "Share a record · Request" split button and an "Ask for something" card grid. Both open the same Request sheet from one options payload (`GET /api/platform/requests/options`), grouped My organisations · My records · Other businesses, or Organisation actions in organisation context.
- [x] Walked in SGK Trial over the API: Tendai asks for leave → Kuda's inbox (owner, no manager role) → Chipo (finance) refused → Kuda approves, replay is a no-op, card gone, Tendai sees Approved with History. Tendai's payout reminder for FR-1791718368527 → Chipo's inbox as the job's Release worker payout step → Chipo releases → reminder completes itself. Rudo "new phone": staff card re-sent (then "already in your app"), receipts none to send, payslips → ask the organisation. Rudo (client) finds Harare Field Co in Discover (it now sells: setup kind `shop`, public) and asks for a quote → Harare's inbox, Rudo's My requests.
- [x] Dead calls removed: Network → Discover, organisation page "Request", `/shop` service request and `/my-requests` now hit `/api/discovery/*` and `POST /workflow-requests`.
- [x] Approving leave sends a Leave approved record to the person's wallet (proof they are on leave). Approving an expense sends an Expense approved record. Already-approved ones are sent when the API starts.
- [ ] Website HR Operations page (`hr/operations.tsx`) still uses the deprecated tenant-less `/api/operations/*`; re-point it to `POST /api/platform/requests/raise` and remove `OperationsController`.
- [ ] Refused transitions answer 500 "Insufficient authority"; should be 403 with plain words on both apps.
- [ ] Add a manager to SGK Trial (role `manager`) so leave and expense claims stop falling to the owner.
- [x] 2026-10-12: People & payroll is its own setup question (question 2 of 4, "Do you manage staff leave and payroll here?") and a plan-gated module (`org_plans`, free during the pilot). SGK Trial was backfilled **on** by migration 113 because it already had leave requests, so Tendai still sees Ask for leave and his "Annual leave approved" record, now under the **Staff requests** inbox tab instead of Jobs. Harare Field Co and any new organisation are off until the owner ticks the answer.
- [x] 2026-10-12: My Records on both apps files cards under the inbox-tab words (Identity, Staff cards, Jobs, Purchase requests, Staff requests, School fees, Payments, Counter sales); "Leave approved" sits under Staff requests, job records read "Job card · FR-…" from the organisation that issued them, and empty sections are gone. New job records are issued as `RequisitionVC` (model registered on first use), not as a generic card.
- [x] 2026-10-12: School fees run like a job's bill on both apps: one `education_fee_payment` run per fee (one payment or instalments), its own `fee_assessment` record and amounts owed, parent pays on the phone pay page without signing in first, the school keeps its receipt. Portal run `090fdf6d…` paid and completed; phone run `89d215d5…` (3 instalments) shows on both apps. See `docs/SGK_FEPT_GAP_MAP.md`.
