# SGK Implementation TODO (Execution)

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
  role order (`ROLE_FALLBACK_BY_STAGE_ACTION`, optional) → owner/admin (optional) → `unassigned`.
  New modes `policy_fallback` and `unassigned`; readiness treats `owner_fallback` and `unassigned` as
  setup items (`actionPath: /organization/actors`). Routing a stage explicitly to the owner counts as
  configured — the owner is only a *fallback* when nobody chose them.
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
