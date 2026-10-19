# SGK / FEPT Gap Map

This note compares the SGK maintenance flow described in the SGK docs with the current
`platform-remodel` branch so we can keep the FEPT path aligned while the remodel continues.

Important: the SGK / FEPT flow is not a separate product lane. It must be absorbed into the
remodel framework through the existing request, workflow, task, evidence, reconciliation, and
inbox surfaces.

The right comparison is:

- SGK web2 flow = the old form-based maintenance/job-card process.
- FEPT web3 flow = the verifiable, wallet-aware, proof-first version of that same process.
- Remodel goal = absorb both into one platform model, not build a parallel FEPT product.

## SGK web2 target flow

From the SGK docs in this repo, the operational flow is:

1. Client sends a purchase order or email.
2. The office creates a job card from that input.
3. The job is assigned to a worker or team.
4. The worker executes the job in the field.
5. The worker captures evidence: before photos, after photos, and receipts.
6. The job is closed and sent back to the office.
7. Finance reconciles the job, invoice, and payment trail.

The SGK docs also stress that the web2-style flow is form-driven, with manual evidence upload and
document chaining, not a wallet-only credential demo.

## SGK web3 / FEPT target flow

The FEPT docs define the web3 equivalent of that SGK flow:

1. Request created from purchase order / requisition / email intake.
2. Assignment is issued as a limited job access grant.
3. Worker opens the assigned job in a mobile-first context.
4. Worker captures explicit evidence checkpoints, not one collapsed upload.
5. BEFORE and AFTER evidence are separate stages.
6. Receipts, signatures, GPS, QR, and acknowledgements are captured as proofs.
7. Payment, receipt issuance, and reconciliation happen after the proof chain is complete.
8. Workflow state is resumable, idempotent, and single-run bound.

The FEPT docs also add stage access control:

- assignment-linked access
- DelegationVC or equivalent run-scoped access grant
- least-privilege stage visibility
- mobile-only execution for field workers
- backend enforcement before UI visibility

That is the web3 version we should compare against the SGK web2 flow.

## Current branch absorption points

The remodeled branch already has part of the FEPT capability, but it is expressed through the new
request/workflow model instead of a dedicated SGK job-card app:

- `src/types/WorkflowTemplate.ts` includes the FEPT template alias.
- `src/services/workflow/initiation.ts` maps `field_execution_fept` to `tpl-fept-field-execution`.
- `src/controllers/finance/RequisitionController.ts` handles approval, release, and acknowledgement.
- `credo-ui/portal/pages/finance/requisitions/*.tsx` provides the requisition UI.
- `credo-ui/portal/components/work/WorkSurface.tsx` provides tasks/approvals surfaces.
- `credo-ui/mobile/components/scan/EvidenceCapture.tsx` captures live, camera-only proof per phase
  (see "Evidence capture" below).
- `src/types/WorkflowTemplate.ts` defines the Field Operations sector and FEPT capability alias.
- `FEPT_MOBILE_WORKER_WORKFLOW_TEMPLATE_SPEC.md` and `FEPT_WORKER_STAGE_ACCESS_AND_DELEGATION.md`
  describe the target web3 behavior.
- `src/services/ReconciliationService.ts` provides reconciliation and audit status tracking.

## Match status

### Strong matches

- Request lifecycle and maker-checker style progression exist.
- Workflow pause/resume exists through `request.wait_for_task` and `request.complete_task`.
- Reconciliation and audit trail support exist.
- The portal has a Job Cards board with list and card presentations, status filters, a job detail
  drawer, assignment changes, audit history, and team workload counts.
- Job creation keeps the client's PO/store number (when provided) separate from the internal job
  reference, and captures problem type, client details, location, schedule, worker, sign-off actor,
  and an optional vehicle reference.
- Evidence capture is phase-locked on the phone: live camera only, before / after / receipt as
  separate steps the job drives, with an optional concealed-work photo for jobs that need it.
- Arrival, safety checks/holds, review, sign-off, worker payout, client billing, and reconciliation
  are part of the existing FEPT flow.
- The remodel has a FEPT/Field Operations capability alias and sector metadata.
- The remodel has the right architectural boundary: requests, tasks, workflow, and reconciliation are
  already the owning primitives.

### Partial matches

- Concealed-work evidence is now an opt-in, job-configurable checkpoint. Jobs that do not need it
  keep the existing flow; enabled jobs require a live photo with location before after-work evidence.
- The board can identify unassigned jobs and highlight those waiting over a week. Operational Intake
  now persists tenant-scoped, unassigned manual submissions and source documents until an authorized
  dispatcher assigns a worker and starts the existing FEPT run.
- The job form accepts a vehicle reference as text, not a managed vehicle/fleet assignment.
- The job detail now includes an office closeout checklist projected from the same job audit trail,
  including operational proof, customer billing, payout, and reconciliation status.
- The existing Catalog, Inventory, quote, invoice, and reconciliation capabilities are not yet
  composed into a complete job-specific pricing, stock-reservation, and quote-to-invoice workflow.
- Inbound email/PO mailbox ingestion remains unimplemented until a mail-provider and deployment
  contract is selected; manual intake is available without introducing a provider-specific dependency.

### Distance to parity

FEPT is closer to SGK than a blank-slate implementation because the remodel already has the correct
platform primitives and the portal already provides a dedicated job board. The remaining work is
integration and lifecycle completion, not a replacement UI or parallel job system.

The main distance is in four areas:

1. Surface language: the portal and phone app now say "job", "requisition", "payments" and
   "supplier bills" instead of workflow plumbing, but some older screens still leak internal terms.
2. Evidence semantics: before / concealed-work / after / receipt are distinct, camera-locked steps;
   concealed-work proof is optional per job and off by default (see "Evidence capture" below).
3. Intake and dispatch: manual source-document intake, durable unassigned jobs, and
   dispatch-to-FEPT assignment now share one persistent flow; automatic mailbox ingestion remains.
4. Management and finance integration: the board has workload and audit views plus an office
   closeout checklist; managed vehicle selection and connected job pricing/stock workflows remain
   incomplete.

### Closed by the org-readiness remodel

- Workflow activation is gone: every template declares prerequisites
  (`src/services/workflow/prerequisites.ts`) and `WorkflowReadinessService` decides whether a workflow
  is operational for an organization. The readiness API, the execution gate and `workflow.start` share
  that one resolver; `enabled` is a soft UI flag and `sector` is deprecated in favour of `workflowTypes`.
- Missing setup surfaces as an `organization.setup` task on the request (inbox/action model), and the
  Setup Center / mobile org settings show per-workflow readiness with a prerequisite drill-down
  (`GET /api/organizations/{orgTenantId}/workflows/{templateRef}/prerequisites`).
- Before / after / receipt capture are distinct checkpoint stages in the FEPT template
  (`field.pause` + `field.capture_evidence` per phase); the engine resumes paused runs with their state.
- The SGK reuse matrix is issued in-flow: RequisitionVC (job card) to the assigned worker after
  `field.assign`, SiteInspectionVC after the site inspection checkpoint (held by the organisation),
  ReceiptVC (material profile) after receipt evidence, ExecutionAckVC after acknowledgement (held by
  the organisation; owner/admin keep both from the organisation inbox); every `credential.issue` step
  honours the template's `credentialPolicy.vcOfferModes`; the client's invoice and receipt come from the follow-on `tpl-payment-collection` run
  started with `workflow.start` when the job has a client phone: it texts the client a pay link and the client's wallet keeps both after paying.
- FEPT stage actors (`assign_field_worker`, `acknowledge_execution`, `trigger_payout`) resolve from org
  configuration / role fallbacks; owner fallback is a readiness item, not a silent default.
- 2026-10-10: `trigger_payout` follows the purchase-request `release_funds` person. A saved role with no person on the field job does not replace that person.
- End-to-end coverage: `tests/org_readiness_resolver.test.ts`, `tests/org_readiness_gate.test.ts`,
  `tests/fept_chain.test.ts`.

### Remaining gaps

1. Add authenticated inbound email/PO ingestion after selecting the mail provider contract; manual
   intake and durable unassigned queue are implemented, with per-tenant idempotency and content-hashed
   source attachments.
2. Add a retention policy and operator controls for stored source documents; currently attachments
   remain with the job intake record.
3. Integrate managed vehicle assignment and existing Catalog/Inventory/finance services into the job
   flow without duplicating stock, quote, invoice, payment, or reconciliation state.
4. The `DatabaseManager` registry still skips historical migration files (`013`, `014`, `036`, `061`,
   reconciliation ledger). Migration `097_create_workflow_runtime_compat_schema.sql` recreates those
   tables with `IF NOT EXISTS` so fresh databases work; the registry itself has not been reconciled.

## Evidence capture (updated 2026-10-04)

Field-service practice and the SSI direction agree on the same shape: proof is captured at the moment
of the work, not assembled afterwards. The phone app now follows that:

- Live camera only. Before and after photos come from the camera; picking from the gallery is not
  offered, so a photo cannot be taken elsewhere and attached later.
- The job decides the phase. The paused step (`await_evidence_before`, `await_evidence_after`,
  `await_evidence_receipt`) chooses what is captured. The worker cannot file all three at once.
- Finished-work confirmation. After photos stay locked until the worker confirms the work is finished,
  so an after photo is a statement that the job is done.
- Two times. The device time is fixed when the photo is taken (`deviceCapturedAt`) and the server adds
  its own sealed time when the step is recorded (`capturedAt`). The portal shows both, plus the
  location and a "Sealed" mark, as a before/after pair with the time between them.
- A wallet record only stands in for a receipt or a confirmation, never for a before or after photo.

The concealed-work checkpoint is optional per job and off by default. When enabled, the job pauses
for a live photo with location before after-work evidence; the server records the sealed time and
the device time alongside the photo. Writing time and location into the image file itself remains
open.

- 2026-10-05 — The capture screen shows a thumbnail for each photo or attached record, with add and
  remove, before saving. The job drawer on the phone and the portal shows the same small previews.
- 2026-10-05 — Sign-off and payment release ask for a wallet proof only after the person reviews
  what will be shared. The same review is the first step on the portal and on the phone. A code or
  link can be opened in this app or in any other wallet. Photos, the safety check, and the work
  review stay job records; they are not labelled as a wallet confirmation.

## Practical mapping

SGK concept → Current branch equivalent

- Purchase order / email intake → request creation / workflow initiation
- Job card → requisition or workflow request
- Assignment → task / approval / delegation surfaces
- Before / after photos → live camera capture, one phase per step, sealed with time and location
- Material receipts → receipt evidence / wallet records
- Completion → task completion / requisition acknowledgement
- Office reconciliation → reconciliation service and receipt timelines
- Run-scoped access grant → DelegationVC / assignment-linked job access (spec-level target)

## What to do next

1. Map the SGK job-card language onto the existing request/workflow template names instead of
   introducing a parallel FEPT product surface.
2. Add an intake step for purchase orders or inbound email attachments that creates the same
   request object used by the remodel framework.
3. Add the FEPT stage-access model to the inbox/work-surface UI so workers only see assigned runs.
4. Add a specific FEPT job-card surface or label in the portal, but keep it backed by the remodel
   request/workflow primitives.
5. Reconcile the migration registry with the files on disk so compat migrations (089, 090, 097) are no
   longer needed for fresh databases (see gap 7).

## 2026-10-05

The phone inbox keeps each person's field jobs separate. A platform identity card stays until it is accepted, even if issuer details fail to load on the first open.

Organisation payments offer Click n Pay, EcoCash, then Simulated pay, on the portal and the phone. Simulated pay is its own method.

## 2026-10-06 — Arrival comes before the site check

The worker heads out and proves arrival before anyone records the site check or the safety check. Both of those happen on site. A job already in progress keeps the step list it started with.

## 2026-10-06 — Setup decides what the organisation sees

One project. The first setup question offers buys-and-pays, jobs, school fees, and selling or advertising. School-fee invoices show only when school fees is selected. The store, catalog, publishing and being found by others show only when the organisation sells or advertises. An organisation that only does jobs and supplier payments is not listed and has no publish control. Discovery lists organisations that chose to sell or advertise and have published.

What SGK answers at setup: both kinds of work (jobs plus supplier purchases); who approves and releases money (owner handles money, or manager then finance); a payment method (Click n Pay or EcoCash, Practice payments for a dry run); then invite the office staff and the field staff from Team. Who goes out and who checks the work is asked on each job. Do not reuse the Harare trial organisation for SGK; create SGK's own.

## 2026-10-10 — Materials bought for a job come back as the job's receipts

When the worker needs materials, Buy materials (Related work on the job) raises a purchase. With no supplier it is a cash purchase request; with a supplier it is a purchase order, then a supplier payment. By default the job waits until the purchase is bought (or delivered and paid) with its receipt or bill number, not just approved; the owner can change that under What happens next. The receipt and bill numbers show on the job, and the worker's receipt step on the phone can use them instead of a photo. Details in `docs/WORKFLOW_ALIGNMENT.md` under the same date.

2026-10-10, later: Mark as bought / delivered / paid also needs a photo of the receipt (website: upload; phone: live photo, or a receipt record already in the wallet). Those photos come back to the job as its receipt evidence and show as thumbnails on the job panel and the website Receipts tab.

2026-10-12: Buy materials and standalone purchases distinguish goods from services and ask whether a delivery or service-completion confirmation is actually required. Required confirmation keeps the receipt/photo evidence and three-way match. An intentional no-confirmation purchase checks the order against the supplier bill without creating fake delivery evidence. The same choices and words are on the portal and phone.

2026-10-12: The after-job client charge stays attached to the field job. It may be one payment, fixed instalments, or recurring; the job may operationally close while Finance continues to show the balance, payments received and next due date. A resent link remains an attempt to collect the same scheduled debt rather than a second invoice.

## 2026-10-10 — Full job run with a purchase, through the real screens; roles and steps mapped once

Job FR-1791644376331 ("Replace broken tap, Pharmacy sink", USD 150, SGK Trial) went from New job on the website to Closed: Kuda created it naming Tendai to go out and Rudo to sign off; Tendai started, confirmed arrival by location, recorded the site check and the safety check, took the before photo, raised Buy materials (cash, USD 44.50); Kuda approved it on the website and marked it bought with a receipt photo (RCT-4471); back on the phone the job's receipt step used that purchase receipt; Tendai took the after photo; Rudo reviewed the work and signed off from her staff card; Chipo released the payout. Website: Closed, Photos (2), Receipts (1), sign-off and payout both confirmed from a wallet.

Fixed on the way:

- Related work was empty on jobs started from the organisation's copy of the built-in field template, so Buy materials could not be raised. Hand-offs now match on the workflow's category.
- Use the purchase receipts failed with "GPS evidence is required": the receipt step no longer asks for a location, and a wallet receipt record satisfies the photo rule on that step.
- Use the purchase receipts only appeared after a reload; the job panel now refreshes itself when the purchase finishes.
- Rudo's sign-off said No card for this step although the job named her and she had the card and the finishing right. Roles and steps are now mapped once (`OrgWorkflowActorService.mayAct`): the person the job names, the configured person, everyone holding the step's role (every supervisor, owner and admin as one role), then an owner or admin. The inbox card, the steps printed on the staff card, the finishing button and the share screen all follow it. Field sign-off goes to supervisor, inspector, manager or dispatcher; the field worker is no longer in that order. Details in `docs/WORKFLOW_ALIGNMENT.md` under the same date.

Still open, found on this run:

- Website request detail prints raw kind names (`PROCUREMENT.REQUISITION`, "Type: procurement.requisition") and, on a finished request, "Last status update PENDING" and "WORKFLOW ROUTING ORG INBOUND APPROVAL Action required: approval."
- Phone capture header still reads "Attaching before photos to: Job c5c8410e-…" (raw run id) — same item as the 2026-10-06 list.
- Requests approved before 2026-10-10 get no Mark as bought card. (2026-10-11: the supplier bill is now written to the payables ledger and the website inbox lists request follow-up cards; only the backfill of older approvals is still open.)

2026-10-11: A purchase raised from a job now says so on the website Requests list ("Part of job …", "From a job", "Linked to a job") and on the request page ("Where this fits" in place of the routing box). Related work uses the same strip, and a step opens the child. New purchase cards in the website inbox and the phone inbox use that sentence; finishing one says "The job continues." Cards sent before this, and the raw run id on the phone capture header, are unchanged.

2026-10-11, later: A share asks for the one step. New staff cards reveal steps one at a time, and the share screen names the step and the job. People who already hold a card need the replacement ("shares one step") before that card can answer the new request.

2026-10-11, run on job FR-1791718401539: dispatch, arrival, site check, safety check, before photo, a materials purchase (receipt RCT-5520, USD 38, "The job continues."), after photo, review, sign-off by Rudo and payout by Chipo on the phone all went through, each sharing only its one step. Gaps found: the quote for extra work fails at start (`workflow.pause_for_event` missing) and shows as Declined; the after-job client invoice and payment receipt go to the payout person, the payment is simulated at once and the invoice totals are 0; the job form has no client phone.

2026-10-11, run on job FR-1791721053299: the gaps above are closed. The job form asks for the client's mobile number. The extra-work quote texts the client a link; the client paid USD 69 and the job stopped waiting. Sign-off texted the client a USD 240 bill; the client paid on the pay page and has the invoice and both receipts. Chipo then released the payout and the job closed. On a second job the client declined the quote: the quote shows Declined and the job waits only on its materials. The invoice and receipt no longer go to the payout person.

2026-10-11, run on job FR-1791723681813, created on the website with the client's number: the texted link opened "Your quote" on the phone with Accept and pay or Decline. The client paid USD 69 (reference SIM-E4DBB657). Sign-off texted a USD 180 bill, which the client paid; the website pay page shows Paid with reference SIM-80C61F82. Rudo's sign-off shared only the sign-off step, Chipo's payout shared only the payout step, and the job closed.

## 2026-10-09 — The safety check cannot be used to stall a job

The 2026-10-06 run below put the job on hold when the safety boxes were left unticked. That is no longer how it works. The worker now chooses Safe to start or Not safe - hold the job. A blank choice, or Safe without the protective-equipment tick, is an error and records nothing. Not safe needs a written reason and a live photo of the hazard; with both, the organisation gets a "Safety hold on job" inbox card, the hold sits on the job timeline (phone and website) with the photo, who raised it and when, and the same hold sent twice is recorded once. The organisation marks the issue resolved with a note, which sends the worker a "safety issue resolved" card; only the worker's own passing re-check (saying what changed) clears the hold and opens the before photos. The website shows holds and lets an owner, admin or the chosen "Sort out the safety hold" person resolve them; the check itself stays on the phone. Details in `docs/WORKFLOW_ALIGNMENT.md` under the same date.

## 2026-10-08 — Timeline words and who checks the site

The job timeline on the website and the phone now places issued records on the matching step (job card, site inspection, material receipt, completion) and uses plain stage names. The status card no longer prints the raw run id. The site check's "Who" line names the assigned field worker, because that person records the check on site. Who is allowed to record it is still the open choice below: the worker can record it, and a supervisor may still get an inbox card.

## 2026-10-06 — Full job run with the SGK Trial team, through the real screens

Job FR-1791305444812 ("Fix leaking roof flashing, Ward 2", USD 220) went from New job on the website to Closed with four people on the phone web build: the owner created it, the field worker accepted, started, confirmed arrival with the site code, recorded the site check and safety check (one hold when the safety boxes were left unticked, then cleared; since 2026-10-09 a blank check is an error, not a hold), took before, after and receipt photos; the supervisor reviewed and signed off sharing only the organisation's own records; the finance manager released payment the same way. The website shows Closed, Photos (2), Receipts (1), Records (3), and both wallet confirmations.

Fixed on the way:

- Phone share screen crashed when several boxes were unticked quickly (`present.tsx` read the box after React had cleared it).
- Website Progress "Who" lines now name the person who actually did each step (from the job history) instead of the person planned for it. Sign-off reads Rudo, site check reads Tendai, payment reads Chipo.

Still open, found on this run:

- The site check is not limited to the person chosen to check. The supervisor gets the inbox card, yet the field worker can record it from the job screen. Decide whether the check belongs to the inspector only (then block the worker) or to whoever is on site (then stop sending the supervisor a card). `prerequisites.ts` says it defaults to the field worker; `OrgWorkflowActorService` resolves it to the supervisor.
- The share screens for sign-off and payment listed records from other organisations. Fixed 2026-10-06: a share for one organisation lists that organisation's records. A personal identity card is kept only when the organisation has nothing of its own.
- Capture and attach screens on the phone show the raw run id ("Attaching before photos to: Job 76cdb59f-…") instead of the job reference FR-….
- Phone inbox cards keep the sentence about the message under the title (the work itself, or the offer sentence, plus the place). The date sits on the same line as the title. One status row at the bottom uses plain words (Job, Payment, Invoice sent, Waiting). The middle row of FEPT / PAYMENT FLOW / PRIORITY pills is gone, and the card no longer shows a raw organisation or run id. History and the Activity page still leak raw stage names: EVIDENCE CAPTURED, ACKNOWLEDGED, FIELD, REQUEST_CREATED, RECONCILED. Activity page says "Holder Audit View", "Reopen in-progress holder tasks", "Running Actions".
- Phone job timeline stamps every step with the job's created time (and in UTC), so all steps show the same clock time.
- Website people panels read "Team member · 5ae2b8" until names load; the finance manager role reads "Finance officer".
- Supervisor's Money page is blank after "Continue as SGK Trial" until the page is reloaded.

Job FR-1791310646169 ("Replace cracked basin and tap, Outpatients", USD 180) closed the same way on 2026-10-06: Tendai through the receipt, Rudo reviewed and signed off, Chipo released payment.

## 2026-10-06 — A share names what is shared

Staff cards and role cards issued from this point are selective-disclosure cards. The step asks for the organisation, the role, the status and the steps that person confirms. The phone and the website list those under Shared and the rest of the card under Not shared. A card saved earlier is still a whole record: the screen says the whole record is shared. Requests use the newer query first. The older query stays for wallets that only speak that. Tendai accepted a new staff card into the app on 2026-10-06 (stored as a selective-disclosure card). A live sign-off on that card is the next check.

## 2026-10-06 — An earlier staff card stops working

Tendai's staff card was sent again from the People page and accepted on the phone. The card held before was withdrawn when the new one was accepted: its status-list bit is set and the issuer row says why ("replaced by a newer staff card"). Records on the phone showed it as "No longer valid" with Share hidden, and "Remove from this device" took it off the phone. The People page setting "When a role changes" decides whether an earlier card stops straight away only when the new role has fewer steps (default) or every time. Cards issued before the status-list tables existed carry no status entry and are withdrawn only by the inbox flag.

## 2026-10-12 — School fees reach the job's level

A school fee now runs the way a field job's bill does: one `education_fee_payment` run per fee, started from the portal School fees page or the phone School fees tab. The run makes its own `fee_assessment` record, sends the parent a pay link (one payment or instalments, one amount owed each), waits, records the payment and keeps the school's receipt. The parent pays on the phone pay page without being signed in first and gets the invoice and the receipt.

| Check       | Portal-started                                          | Phone-started                          |
| ----------- | ------------------------------------------------------- | -------------------------------------- |
| Run         | `090fdf6d-e4a5-462d-8ab2-d8d08014766d`                  | `89d215d5-b7b0-46b6-86cf-b94d1bed9ae7` |
| Record      | BTX-E1CF9ECB, $650 one payment                          | BTX-F41EF8B6, $900 in 3 instalments    |
| Pay link(s) | 8AEASG, paid                                            | TQVX8Q, 5JGSNA, TGK3PQ, waiting        |
| Result      | Run completed, amount owed settled, school receipt kept | Same row and steps on both apps        |

Still behind the job: business transactions stay `open` after the last payment (same as jobs today), and the school receipt is not offered to the parent's wallet (the parent's proof is the receipt from the pay page).

## 2026-10-12 — How ready each business transaction is

The field job is the reference. Work, money owed and proof stay separate records. Five types are stored (`BusinessTransactionService`): `field_job`, `purchase`, `sale`, `fee_assessment`, `collection_plan`. People and payroll are a module an organisation switches on. They are not a sixth type.

| Transaction                         | From setup to daily use                                                                                                                                                                                                               | What is still open                                                                                                                                                                                              |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Field job (`field_job`)             | Usable on both apps: create, assign, evidence, sign-off, client bill, materials purchase, payout. Concealed-work photo is optional per job.                                                                                                                                     | The job record stays `open` after the last payment. No single money summary on the job. |
| Purchase (`purchase`)               | Usable. Home or a job starts a purchase request, then an order, then a supplier payment. The amount owed is a linked obligation. `tpl-ap-payables` stays unused on purpose. One bill is not split across jobs.                        | Partial receipt, deposits and credit notes are not first-class states.                                                                                                                                          |
| School fee (`fee_assessment`)       | Usable as of today. Both apps start `education_fee_payment`. Portal run `090fdf6d-e4a5-462d-8ab2-d8d08014766d` paid and completed. Phone run `89d215d5-b7b0-46b6-86cf-b94d1bed9ae7` is three instalments, still waiting.              | The fee record stays `open`. The school keeps its receipt; the parent keeps the pay-page receipt. Suite A in `FEPT_Playwright_Test_Matrix.md` is still a hand walk.                                             |
| Sale (`sale`)                       | Split. A job's quote and client bill already send a pay link. A counter sale does not: `tpl-cash-counter` still records cash itself and never creates a `sale` record. Choosing "shop" at setup only turns on `cash_counter_payment`. | Shop and services is named in navigation and is the largest hole in Operations.                                                                                                                                 |
| Collection plan (`collection_plan`) | Partial. `tpl-ar-collections` is one step (`ar.create_plan`). Plans with no owner are adopted as `collection_plan` when the API starts. The phone still offers "New AR Collection" and "New Payment Link" beside Operations.          | Money in is the pay link. This template stays a template until it grows the same progress words as a fee.                                                                                                       |
| People (not a transaction type)     | Leave and expenses are usable: inbox cards and approval records, shown only when the organisation switched on People and payroll.                                                                                                     | Payroll is the website-only `/api/payroll` page (runs and payslips). There is no phone payroll screen and no `business_transactions` row. Job-costed payroll stays out until a pilot asks.                      |

Way forward, in this order:

1. Next implementation, when asked: bring counter sales onto the same rail as school fees (a `sale` record, both apps). A cash sale can stay a cash branch, and it still creates the record. The job-invoice branch stays as it is.
2. After that: progress words for a standalone collection plan, reusing the school-fee progress shape rather than a third helper.
3. Leave payroll as the website API until a pilot asks for a pay run. Do not add a transaction type for it.
4. Shared leftovers (the record stays `open`, the `fept_chain` test) are fixed once, for every type, not inside the next centre.

## 2026-10-13 — Guidance with GenUI (Vercel AI SDK): not the next build

Reviewed whether a generative-UI assistant (Vercel AI SDK, AI Elements chat kit) should guide people through setup, daily work and sharing. Decision: not now as a chat product.

- **What fits.** AI SDK Core tool calling (the model reads facts through our APIs and proposes an action) and `useChat` in a React panel. RSC `streamUI` needs the Next.js App Router; the portal uses the Pages Router and the phone is a static Capacitor build, so "GenUI" here would mean a tool result drawn as our own Mantine component. AI Elements is shadcn/Tailwind and would add a second design system; use it only as a layout reference.
- **Where the system is.** `MVP_GOALS.md` keeps Gen-UI and AI assistants out of the MVP; no package depends on `ai` or `@ai-sdk/*`; `docs/AGENT_TERMINOLOGY_AND_NAMING.md` already reserves `src/ai/`, `/ai/*` and `Ai*` names. Deterministic guidance exists but is scattered: readiness `nextActions` (`OrganizationService`), the mirrored step helpers (`schoolFeeProgress`, job stages, `jobAuditTrail`), one help popover (phone School fees only), and Shared / Not shared, Activity and the record check.
- **The real gap is not an AI.** There is no single "your next step" across Setup, Inbox, Operations and Records.
- **Usefulness.** Setup for the owner: high value, low risk (explain an item, fill in setup answers, owner saves). Daily "what do I do": medium, after a deterministic answer exists. Start work from a sentence: medium, opens the existing form filled in, never runs it. Sharing and consent: low value, high risk; the share screen stays deterministic and an explainer may only quote `STAGE_PROOF_CONFIG` / `ProofVcPolicyService`. Phone: leave it off (low data, static build, cost, privacy).
- **Rules if it is built.** No claim values, phone numbers, keys or tokens go to a model. Every writing tool returns a proposal the person confirms. Step words come from the mirrored helpers through tools, not from the model. Both apps work fully with it switched off (per-organisation flag).

Order:

1. Done 2026-10-13. `GET /api/organizations/{id}/next-steps` (`OrganizationService.nextStepsFor`) lists inbox cards already routed to this person, then setup blockers for an owner or admin only. The mirrored `nextSteps.ts` writes the Home card on both apps. Jobs, purchases, fees and approvals reach it through the existing inbox. Payroll and the assistant do not.
2. Done 2026-10-13. `StepHelp` is on both apps (Setup, the share screen, job progress, and the phone money tabs). It is not a hover card. Android has no hover, and Material's pattern for extra explanation is a labelled control that opens a bottom sheet. The word Help stays on screen and a tap slides the points up.
3. A portal-only setup assistant pilot (onboarding phase 5): AI SDK Core under `src/ai/` (`AiSetupAssistantService`, `POST /ai/setup/chat`), `useChat` in a Mantine side panel, read-only tools (readiness, next steps, help text) plus one proposal tool (setup answers). Owners only, behind a flag, written to the organisation audit.
4. Only if the pilot is used: a sentence-to-workflow proposal tool and a policy-grounded "why is this asked" line on the share screen.

## Reference docs

- [SGK_FLOW.md](../SGK_FLOW.md)
- [docs/sgk-rollout-sequence.md](sgk-rollout-sequence.md)
- [sgk-web3.md](../sgk-web3.md)
- [FEPT_MOBILE_WORKER_WORKFLOW_TEMPLATE_SPEC.md](../FEPT_MOBILE_WORKER_WORKFLOW_TEMPLATE_SPEC.md)
- [FEPT_WORKFLOW_ATOMICITY_AND_IDEMPOTENCY_SPEC.md](../FEPT_WORKFLOW_ATOMICITY_AND_IDEMPOTENCY_SPEC.md)
- [FEPT_WORKER_STAGE_ACCESS_AND_DELEGATION.md](../FEPT_WORKER_STAGE_ACCESS_AND_DELEGATION.md)
