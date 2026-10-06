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
- Evidence capture is phase-locked on the phone: live camera only, before / after / receipt as
  separate steps the job drives (see "Evidence capture" below).
- The remodel has a FEPT/Field Operations capability alias and sector metadata.
- The remodel has the right architectural boundary: requests, tasks, workflow, and reconciliation are
   already the owning primitives.

### Partial matches

- Evidence capture is phase-locked (before / after / receipt), not generic; the remaining gap is the
  in-progress photo prompt for work that will be covered up (see "Evidence capture" below).
- The current branch supports requisitions and approvals, but not a dedicated SGK job card board.
- The current branch supports receipt and reconciliation screens, but not SGK's explicit before/after
   photo chain.
- The current branch does not yet expose the FEPT stage-access model in the inbox/UI surface.

### Distance to parity

FEPT is closer to SGK than a blank-slate implementation because the remodel already has the correct
platform primitives: requests, tasks, workflow initiation, reconciliation, and a mobile evidence
component. The remaining work is mostly specialization, not invention.

The main distance is in three areas:

1. Surface language: the portal and phone app now say "job", "requisition", "payments" and
   "supplier bills" instead of workflow plumbing, but some older screens still leak internal terms.
2. Evidence semantics: before / after / receipt are separate, camera-locked steps; the in-progress
   photo prompt for concealed work is not built yet (see "Evidence capture" below).
3. Access model: the FEPT delegation and run-scoped access rules are described in specs, but not
   yet exposed in the live inbox/work-surface experience.

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
  `field.assign`, ReceiptVC (material profile) after receipt evidence, ExecutionAckVC after
  acknowledgement; InvoiceVC + PaymentReceiptVC come from the follow-on `tpl-payment-collection` run
  started with `workflow.start` when the org has payments configured.
- FEPT stage actors (`assign_field_worker`, `acknowledge_execution`, `trigger_payout`) resolve from org
  configuration / role fallbacks; owner fallback is a readiness item, not a silent default.
- End-to-end coverage: `tests/org_readiness_resolver.test.ts`, `tests/org_readiness_gate.test.ts`,
  `tests/fept_chain.test.ts`.

### Remaining gaps

1. No explicit purchase-order or email intake route that creates a job card / FEPT run in SGK terms.
2. No dedicated job card lifecycle screen that mirrors SGK's office → field → office chain.
3. No email attachment ingestion path for inbound job evidence.
4. No SGK-specific workflow template label in the portal UI; the flow is still presented as generic
    requisition / workflow execution.
5. No visible run-scoped worker access grant model in the UI that matches the FEPT delegation docs.
6. No explicit job-card inbox surface that hides the underlying SSI jargon from operational users.
7. The `DatabaseManager` registry still skips historical migration files (`013`, `014`, `036`, `061`,
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

Still open: an in-progress photo prompt for work that will be covered up (pipework, wiring), and
writing the time and location into the image file itself rather than only the record.

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

## 2026-10-06 — The `sgk` branch is a demo that hides what SGK does not use

The `sgk` branch was cut from `platform-remodel` at f310880 so the real SGK organisation can use the job flow on its own. Nothing is deleted: the school-fee, shop and store surfaces are hidden behind constants (`SHOW_STORE`, `SHOW_STORE_SECTION`, `hasEducation = false`, `invoices: false`) and the setup question offers only "Buys things and pays suppliers" and "Sends people out to do jobs". Request tabs read **Jobs** and **Purchase requests**. The main product keeps the full list on `platform-remodel`.

What SGK answers at setup: both kinds of work (jobs plus supplier purchases); who approves and releases money (owner handles money, or manager then finance); a payment method (Click n Pay or EcoCash, Practice payments for a dry run); then invite the office staff and the field staff from Team. Who goes out and who checks the work is asked on each job. Do not reuse the Harare trial organisation for SGK; create SGK's own.

## Reference docs

- [SGK_FLOW.md](../SGK_FLOW.md)
- [docs/sgk-rollout-sequence.md](sgk-rollout-sequence.md)
- [sgk-web3.md](../sgk-web3.md)
- [FEPT_MOBILE_WORKER_WORKFLOW_TEMPLATE_SPEC.md](../FEPT_MOBILE_WORKER_WORKFLOW_TEMPLATE_SPEC.md)
- [FEPT_WORKFLOW_ATOMICITY_AND_IDEMPOTENCY_SPEC.md](../FEPT_WORKFLOW_ATOMICITY_AND_IDEMPOTENCY_SPEC.md)
- [FEPT_WORKER_STAGE_ACCESS_AND_DELEGATION.md](../FEPT_WORKER_STAGE_ACCESS_AND_DELEGATION.md)
