# FEPT Worker Stage Access and Delegation Model

This document defines how FEPT job stages are performed by role, and how each assigned job is delivered as a job access grant VC with plain-language metadata in holder context.

## Objectives

- Keep FEPT and requisition flows separate.
- Let assigned workers act directly from the mobile app.
- Enforce least-privilege access: worker can only act on assigned job or delegated job scope.
- Keep all stage transitions auditable with a clear holder-facing action list.

## Proposed Workflow (SGK-aligned)

1. Client submits job request via Email or Purchase Order.
2. System creates a Job Card.
3. Job is assigned to a technician/team.
4. Worker starts the job (`IN_PROGRESS`).
5. Worker captures BEFORE evidence checkpoint (site state before work).
6. Team performs maintenance work and collects material receipts.
7. Worker captures AFTER evidence checkpoint (post-work proof + receipts).
8. Receiver/supervisor acknowledges completion.
9. Finance/admin triggers payment.
10. Receipt is issued.
11. Run is reconciled and closed.

Important: BEFORE and AFTER evidence are not treated as one immediate chained action. They are two separate checkpoints with execution time between them.

## FEPT Stage and Checkpoint Mapping

| FEPT runtime checkpoint | Primary actor | Secondary actor | Required proof/guard | App action |
|---|---|---|---|---|
| REQUEST_CREATED | Admin / Job assigner | Owner | Job request reference | Create run and set job metadata |
| APPROVAL_PENDING | Admin / Owner | Delegated approver | Approval VP (`approvalPresentation` or `approvalSignature`) | Approve run |
| APPROVED | Admin / Job assigner | Owner | Approval evidence retained | Assign worker |
| ASSIGNED | Job assigner | Worker | Assignment record + assignment card | Worker sees assigned job in app |
| IN_PROGRESS (`pauseReason=await_evidence_before`) | Worker | Job assigner | Assignment authorization | Start field work, then prepare BEFORE capture |
| BEFORE_EVIDENCE_CAPTURED (`workflowStage` remains `IN_PROGRESS`) | Worker | Supervisor | Before evidence hash + image/GPS policy | Submit BEFORE evidence only |
| IN_PROGRESS (`pauseReason=await_evidence_after`) | Worker | Job assigner | Before evidence already present | Continue/finish field work |
| EVIDENCE_CAPTURED (set only after AFTER evidence) | Worker | Supervisor | After evidence hash + receipts/images policy | Submit AFTER evidence and finalize evidence phase |
| ACKNOWLEDGED | Receiver / Supervisor | Worker | Acknowledgement VP | Confirm delivery/completion |
| PAYMENT_TRIGGERED | Admin / Finance | Owner | Release VP or payment trigger evidence | Trigger payment |
| RECEIPT_ISSUED | Finance | Admin | Receipt VC / receipt event | Mark receipt issued |
| RECONCILED | Finance / Admin | Owner | Reconciliation VP/evidence | Reconcile and close |
| COMPLETED | System | - | Final state | Read-only timeline |

### FEPT transition semantics (required)

- `IN_PROGRESS -> ACKNOWLEDGED` is invalid until AFTER evidence is captured.
- `IN_PROGRESS -> PAYMENT_TRIGGERED` is invalid until acknowledgement is completed.
- BEFORE evidence capture does not advance to `EVIDENCE_CAPTURED` by itself.
- `EVIDENCE_CAPTURED` represents completion of the AFTER evidence checkpoint, not both checkpoints collapsed into one step.
- UI must show BEFORE and AFTER as separate actions/checkpoints, even when both happen under `IN_PROGRESS` prior to `EVIDENCE_CAPTURED`.

## Worker Access Rules

A worker may view or act on a FEPT run when at least one condition is true:

- The worker holder context has an active job access grant linked to that run.
- The worker presents an active DelegationVC with required FEPT scope (fallback path).

### Strict issuance rule

- FEPT worker job access is DelegationVC-only.
- No separate job card credential is issued for authorization.
- Workflow assignment inbox items are delivery envelopes for DelegationVC grant metadata only.

### DelegationVC requirements for temporary access

Required scopes for assigned job access:

- `fept:job:act`
- `fept:job:view`

For strict run-level restriction, set DelegationVC limits:

- `limits.allowedWorkflows = ["<runId>"]`

This keeps delegation temporary and job-specific.

### Plain-language holder metadata (no SSI jargon)

Each assigned job grant should include these holder-friendly fields:

- `plainLanguageTitle`: `Assigned Task Access`
- `grantType`: `job_access`
- `role`: worker role label (example: `Field worker`)
- `poNumber`: job reference shown to the worker
- `location`: where to perform the task
- `description`: short job summary
- `delegationGrantId`: grant identifier for audit
- `delegationGrantExpiresAt`: expiry time for the grant

## Mobile App Behavior

Assigned worker app surface should provide:

- My Assigned Jobs list (from `workflow_assignment` cards + authorized workflow runs).
- Job detail screen with current stage badge and timeline.
- Stage-aware action buttons for only allowed worker steps.
- Evidence capture form for image(s), receipt image, optional GPS, notes, and signature.
- Explicit guard prompt when VC proof is required for a stage.
- Clear separation of evidence actions: `Capture BEFORE` and `Capture AFTER` must be distinct and context-aware.

### Dynamic visibility rules (required)

The worker FEPT view must render only when all conditions are true:

- User is currently in org context (`contextMode=org`) with an active org selected.
- Active org has FEPT/field workflow enabled.
- User has at least one unresolved `workflow_assignment` task for FEPT.
- User has an employee org role (for example owner/admin/manager/field_worker/dispatcher/technician).

If any condition is false, hide the worker FEPT view to avoid showing operations UX to users focused on non-org or unrelated flows.

Non-employee users who only interact with the organization (e.g. holder/member/external users) must never see FEPT operational interfaces.

## API Behavior

- `GET /workflows/runs`: in wallet context, return runs linked to worker assignment cards.
- `GET /workflows/runs/{runId}`: allow if run owner tenant, assignment-linked worker, or valid DelegationVC.
- `POST /workflows/runs/{runId}/resume`: allow if run owner tenant, assignment-linked worker, or valid DelegationVC with action scope.
- `GET /workflows/runs/{runId}/actions`: return holder-friendly final action timeline for that run.

### Guard precedence

FEPT authorization must start at backend controllers first, then be mirrored in UI visibility:

- Backend denies FEPT run execution/view/resume/list for non-employee org roles.
- UI hides FEPT tabs/pages/cards for non-employee users.
- Direct URL access without backend authorization must still be rejected.

## Data and Audit Expectations

- Every transition records stage, actor tenant/user, and timestamp.
- Every VC-guarded transition stores proof reference (`presentationId`/hash).
- Assignment, grant issuance, reassignment revocation, and completion revocation are traceable for compliance.

### Grant lifecycle rules

- Issue job access grant VC when the job is assigned.
- Revoke all active run-scoped grants immediately when the job is reassigned.
- Revoke remaining run-scoped grants automatically when the job reaches terminal completion state.

## OID4VC Progressive Authentication (Next Phase)

This project should evolve from internal JWT transport to standards-based OID4VC progressive authentication:

1. DelegationVC issuance via OID4VCI
- Org issuer exposes OID4VC credential offer endpoints.
- Worker wallet receives/accepts short-lived DelegationVC through OID4VC flow.
- Claim shape remains plain-language for holder UX while preserving verifiable structure.

2. Progressive auth via OID4VP
- Sensitive FEPT transitions (for example payment/release/finalization) request progressively stronger proofs.
- Verifier sends presentation definition with required constraints (scope, runId, freshness, role).
- Holder presents minimal claims first, escalates proof depth only when policy requires.

3. Policy-driven step-up
- Map FEPT stage and risk level to required presentation profile.
- Example: `ASSIGNED/IN_PROGRESS` minimal DelegationVC proof; `PAYMENT_TRIGGERED/RECONCILED` enhanced presentation + stronger assurance.

4. Standards alignment
- Use OID4VCI/OID4VP metadata/discovery endpoints per tenant.
- Keep credential status and revocation aligned with VC status list strategy.
- Maintain least-privilege scopes (`fept:job:view`, `fept:job:act`) and run binding (`allowedWorkflows=[runId]`).

## Implementation Notes

- FEPT run access is enforced at workflow controller authorization layer.
- Assignment cards (`workflow_assignment`) are used as worker access grants.
- DelegationVC verification supports workflow-level scoping via `limits.allowedWorkflows`.
- Evidence upload remains FEPT-specific and does not use requisition endpoints.
