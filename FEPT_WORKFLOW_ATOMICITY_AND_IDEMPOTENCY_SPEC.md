# FEPT Workflow Atomicity and Idempotency Spec
**Credo / Justice / Trust-as-a-Service Platform**

Version: 1.1

---

## 1. Purpose

This document defines the atomicity, idempotency, and resumability rules for workflow execution in Credo.

It applies to:
- invoice payment links
- approval flows
- acknowledgement flows
- delivery verification flows
- receipt issuance
- reconciliation
- any workflow step that can be interrupted, retried, redirected to login, or resumed later

The central rule is:

> One workflow action must map to one workflow run, one step, one actor, and one server-side state transition.

---

## 2. Core design principles

1. **Server is source of truth**  
   The client never decides whether a step completed. The server does.

2. **Single workflow run per action**  
   A payment link, approval link, or scan link must bind to one workflow run only.

3. **Single-use capability links**  
   A link is an opaque capability token with a short lifetime and a single purpose.

4. **Idempotent write operations**  
   Any action that can be retried must return the same result on repeat calls.

5. **Atomic state transitions**  
   State changes must happen inside a database transaction.

6. **Step-bound resume after login**  
   When auth redirects occur, the resumed action must be the exact same workflow run and exact same step.

---

## 3. Workflow run model

Each workflow run MUST store:

- workflow_run_id
- tenant_id
- workflow_template_id
- current_step_key
- current_state
- resume_token_hash
- step_nonce
- step_version
- status
- locked_by
- locked_at
- completed_at
- expires_at
- last_idempotency_key
- actor_type
- actor_id
- session_context_id

---

## 4. State machine

Suggested states:

- DRAFT
- OPENED
- AUTH_REQUIRED
- AUTHENTICATED
- IN_PROGRESS
- SUBMITTED
- PAID
- APPROVED
- ACKNOWLEDGED
- RECEIPT_ISSUED
- RECONCILED
- COMPLETED
- EXPIRED
- REVOKED
- DISPUTED

Only one current state may exist at a time.

---

## 5. Workflow link model

A workflow link MUST NOT be treated as a generic URL.

It must represent a single-use capability with:
- workflow_run_id
- step_key
- resume_token
- expires_at
- single_use = true
- allowed_actor_type
- allowed_transition

### Link requirements
- token must be random and unguessable
- token should be stored hashed
- token should expire
- token should be consumed on use or on successful completion
- token should be invalidated when the step changes
- token should never expose private workflow state in the URL

---

## 6. Resume after login

If a user opens a workflow link and authentication is required:

1. Server stores a resume context.
2. User authenticates.
3. Server looks up the resume context.
4. Server verifies:
   - same workflow_run_id
   - same step_key
   - token still valid
   - step not already completed
   - current state still matches expected state
5. Server restores the exact same workflow step.

The browser must never be trusted to decide which run to resume.

---

## 7. Step nonce rotation

Every step SHOULD have a nonce that changes when the step is consumed.

Example:
- step_nonce = abc123
- user opens step
- user submits step
- server marks nonce used
- server rotates nonce for next step

This prevents stale links from being reused.

---

## 8. Idempotency rules

Every state-changing endpoint MUST accept an idempotency key.

Examples:
- payment confirmation
- approval submit
- acknowledgement submit
- receipt issuance
- payout release
- reconciliation close

### Idempotency requirements
- same idempotency key + same tenant + same action => same result
- duplicate requests must not create duplicate receipts, approvals, or payouts
- the server must persist the first successful response and return it for retries

---

## 9. Atomic transaction boundaries

Use a database transaction for any action that changes state.

Example: payment completion

Inside one DB transaction:
1. lock the workflow run row
2. verify expected state
3. mark payment successful
4. issue ReceiptVC
5. write audit event
6. set next state
7. rotate step nonce
8. commit

If anything fails, rollback the entire action.

---

## 10. Locking strategy

Use either:
- row-level lock
- optimistic locking with version column
- or both

Recommended:
- use a version column on workflow_runs
- update with `WHERE version = current_version`
- if update count = 0, another actor already changed state

This prevents double completion.

---

## 11. Event outbox pattern

Workflow transitions SHOULD emit events through an outbox table.

Examples:
- workflow.request.created
- workflow.approval.completed
- workflow.payment.completed
- workflow.receipt.issued
- workflow.ack.received
- workflow.reconciled
- workflow.disputed

Write the event in the same transaction as the state update.
Publish it asynchronously after commit.

---

## 12. Example: invoice payment link + login redirect

### Scenario
A user opens an invoice payment link and is redirected to login before payment.

### Required behavior
- The original link must remain the only legitimate resume path.
- After login, the system should restore the same workflow run.
- A new unrelated link must not be able to hijack the session.

### Steps
1. User opens `/w/{resume_token}`
2. Server creates resume context
3. Login is requested
4. After login, server restores the stored workflow_run_id + step_key
5. User pays
6. Server completes payment atomically
7. ReceiptVC is issued
8. Original resume token is consumed
9. Next step token is rotated

---

## 13. Example: approval flow

1. Request created
2. Approver opens approval link
3. Server validates token + actor role
4. Approver signs approval
5. Server writes approval VC / approval record in one transaction
6. Idempotency key prevents double-approval
7. Token is consumed
8. Next approver or next step is issued

---

## 14. Example: acknowledgement flow

1. Delivery completed
2. Receiver scans QR
3. Server validates step token
4. Receiver acknowledges
5. Server writes acknowledgement record
6. ReceiptVC is issued or consumed
7. Reconciliation step begins
8. Token rotates or expires

---

## 15. Threat model

The system must defend against:

- duplicate link use
- stale link replay
- auth redirect hijack
- double approval
- duplicate payment confirmation
- duplicate receipt issuance
- race conditions between webhook and UI submit
- retry storms
- stale browser state

---

## 16. Recommended API rules

### All workflow actions should include:
- workflow_run_id
- step_key
- idempotency_key
- actor_session_id
- resume_token or step_token
- client_time
- server-validated authorization context

### Server must validate:
- actor is allowed
- step is active
- token is valid
- state transition is legal
- request is idempotent
- workflow version matches expected version

---

## 17. Security rules

- do not trust client-side state
- do not use raw URL parameters as authority
- do not allow one link to resume a different workflow run
- do not allow a completed step to be reopened without explicit admin override
- do not expose sensitive workflow metadata in the URL
- store tokens hashed
- expire tokens aggressively

---

## 18. School invoice example

### Flow
Invoice issued -> payment link -> login -> pay -> receipt -> reconcile

### Atomic points
- payment success
- receipt issuance
- ledger update
- wallet save
- reconciliation status update

Each must be atomic and idempotent.

---

## 19. E-commerce delivery example

### Flow
Quote -> invoice -> payment link -> payment -> receipt -> delivery ack -> consume receipt -> reconcile

### Atomic points
- payment confirmation
- receipt issuance
- delivery acknowledgement
- receipt consume
- settlement trigger
- reconciliation close

Each step must be independently idempotent.

---

## 20. Engineering acceptance criteria

A workflow system is acceptable only when:
- the same link cannot be used twice for the same step
- login redirect always returns to the correct workflow run
- duplicate retries do not duplicate receipts or approvals
- all step transitions are transactional
- audit logs are written once per actual event
- old links are invalid after step completion
- state mismatches are rejected
- resumed actions work across app refreshes and device changes

---

## 21. Copilot implementation prompt

Build a workflow orchestration layer with:
- workflow_runs table
- workflow_steps table
- workflow_resume_tokens table
- idempotency key support
- step nonce rotation
- row locking or optimistic versioning
- event outbox
- resume-after-login context
- single-use workflow capability links
- transactional completion for payment, approval, acknowledgement, receipt issuance, and reconciliation

Do not trust client-side state. The server must be the only source of truth.

---

## 22. Product goal

The goal is to make every workflow action:
- safe to retry
- safe to redirect through login
- safe to resume
- safe to audit
- safe to consume once only
- safe to reconcile later

That is the basis for a reliable SSI-backed workflow engine.

---

## 23. 2026-06 alignment update (TC-16 findings)

This section is normative for all workflow actors (portal, mobile, webhooks).

### 23.1 Canonical resume endpoint contract

`POST /workflows/runs/{runId}/resume`

Required behavior:
- Resolve actor authorization on the server (run owner tenant or assigned worker tenant).
- Bind idempotency enforcement to `runId + current_step + tenant + idempotency_key`.
- Treat the server-side run state as source of truth for transitions.
- Return replayed response for duplicate retry with same payload.
- Reject key reuse with different payload for the same step.

### 23.2 Idempotency key behavior for resume

All clients SHOULD send `x-idempotency-key` for resume actions.

Recommended key format:
- `resume:{runId}:{action}:{uuid}`

Where action is one of:
- `start_job`
- `capture_evidence`
- `approve`
- `acknowledge`

Server handling:
- If key is first-seen: persist processing marker, execute, then persist completion result.
- If duplicate key + same payload and processing not finished: return `409 Conflict`.
- If duplicate key + same payload and already completed: return stored prior result.
- If duplicate key + different payload: return `422 Unprocessable Content`.

### 23.3 Payload fingerprinting

Resume idempotency MUST include a request fingerprint hash over canonicalized payload JSON.

Minimum rule:
- stable canonical JSON stringification
- SHA-256 hash persisted with idempotency entry

### 23.4 UI flow requirements

All actor UIs MUST:
- fetch stage from workflow run status API (not stale assignment metadata only)
- map CTA visibility from current server stage
- send stable idempotency key per user action retry cycle
- avoid issuing multiple concurrent resume mutations for the same run and action

### 23.5 Test and operations requirements

Automated tests MUST:
- include `x-idempotency-key` on all resume/write calls
- verify replay semantics for duplicate requests
- verify `409` behavior for concurrent duplicate submit
- verify `422` for key reuse with payload mismatch

Operational monitoring SHOULD include:
- duplicate replay count per endpoint
- 409 conflict count per action
- 422 mismatch count per action
- resume success latency by actor type
