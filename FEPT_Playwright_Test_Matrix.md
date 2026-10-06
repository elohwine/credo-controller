# FEPT Playwright Test Matrix
**Credo / Justice / Trust-as-a-Service Platform**

Version: 1.0  
Purpose: Comprehensive real-life Playwright test cases for role-separated workflows across portal, mobile wallet, dashboards, audit trails, and reconciliation.

---

## 1. Testing objectives

Validate that the platform works as a **workflow engine** and not just a billing app.

Each test must verify:

- correct workflow template selection
- correct role separation between org tenant and holder
- correct VC issuance / save / claim behavior
- correct approval / signature behavior
- correct payment flow and payment link behavior
- correct delivery / acknowledgement / proof behavior
- correct reconciliation behavior
- correct audit trail behavior
- correct atomicity and idempotency behavior
- correct visual consistency across portal, app, wallet, dashboard, verifier

### Visual test policy (strict)

- visual runners/specs must fail fast if a required UI action is unavailable
- do not use API fallback paths to complete UI steps (payment, approval, acceptance, delivery, verification)
- if auth redirects or missing CTA blocks progress, mark case FAIL and capture screenshot evidence
- every VC acceptance validated in UI must be traceable in `integration_outbox` as `wallet.vc.accepted`
- accepted VCs must not be re-offered for the same source reference; tests should assert pending list stays deduped after relogin/refresh

---

## 2. Roles / actors

Use these standard roles in all tests:

- orgOwner
- bursar
- financeOfficer
- approver
- requester
- parentHolder
- studentHolder
- merchantOwner
- buyerHolder
- driverVerifier
- receiver
- cashier
- auditor
- worker

---

## 3. Common assertions

### Portal assertions
- workflow template name visible
- tenant branding visible
- correct status shown
- correct actor actions available
- correct provider reference shown
- correct VC / proof attachment visible
- correct reconciliation state visible
- audit trail populated
- no cross-role leakage

### Wallet assertions
- holder sees only their proofs and invoices
- holder can save / claim only when allowed
- holder can present / view proofs
- consumed / revoked status visible where relevant
- no org admin controls visible

### Dashboard assertions
- counts update correctly
- exceptions populate correctly
- reconciliation status updates correctly
- settlement state visible
- audit trail entries visible

### Atomicity / idempotency assertions
- duplicate submit does not create duplicate records
- duplicate webhook does not create duplicate receipts
- stale link cannot resume a different workflow run
- old link cannot be replayed to re-trigger a step
- VC accept flow emits `wallet.vc.accepted` outbox events that can be traced by tenant/workflow/provider reference
- once accepted, the same VC source is not re-queued in `wallet_pending_offers`

---

## 4. Screenshot checkpoints

Use these checkpoints in each major test:

- `01_start.png`
- `02_workflow_created.png`
- `03_holder_inbox.png`
- `04_payment_page.png`
- `05_payment_success.png`
- `06_receipt_saved.png`
- `07_acknowledgement.png`
- `08_org_dashboard.png`
- `09_audit_trail.png`
- `10_reopen_old_link.png`
- `11_role_switch_org.png`
- `12_role_switch_holder.png`

---

## 5. Suite A — School fee workflow

### A1. School invoice request sent to parent, payment, receipt VC, recon
**Workflow:** `education_fee_payment`  
**Actors:** bursar, parentHolder, orgOwner

**Preconditions**
- school tenant onboarded
- school fee template enabled
- parent contact preseeded or invite-by-contact enabled
- wallet policy set (`wallet_offered` or `wallet_required`)
- receipt VC issuance enabled
- auto recon enabled

**Steps**
1. bursar logs into org portal
2. bursar selects school fee workflow
3. bursar creates school fee invoice request
4. bursar selects child/student contact
5. bursar sends invoice / payment link
6. parent receives inbox notification in wallet/app
7. parent opens invoice
8. parent pays using simulated payment method
9. receipt VC is issued
10. parent sees receipt in wallet
11. bursar refreshes portal
12. invoice shows paid
13. dashboard shows reconciliation state
14. owner reviews audit trail

**Assertions**
- invoice uses `education_fee_payment`, not generic payment link
- invoice references student or admission number
- wallet inbox shows the invoice and receipt only
- portal shows invoice `issued → paid → reconciled`
- receipt VC ID is linked to invoice
- dashboard shows provider ref and auto-recon status
- audit trail includes bursar action, payment event, VC issuance, recon event

**Failure cases**
- reopening old invoice link after payment shows already paid
- duplicate payment webhook does not create duplicate receipt
- if parent logs out and back in, the same invoice still appears
- if payment is retried, same workflow run remains unchanged

---

### A2. School invoice to unknown contact, claim later
**Actors:** bursar, parentHolder

**Preconditions**
- recipient contact not preseeded
- invite-by-contact enabled
- claim-later enabled

**Steps**
1. bursar creates invoice
2. bursar enters new phone/email
3. system creates pending holder reference
4. invoice link is sent
5. parent opens link
6. parent is prompted to claim or continue as guest
7. parent pays
8. receipt VC is issued and stored in claimable state
9. parent later logs in and claims history with same contact
10. bursar sees the same receipt and recon state

**Assertions**
- pending holder record is created
- claim preserves original workflow run
- no duplicate receipt object is created
- org portal and wallet show the same reference
- history becomes visible after claim

---

### A3. School owner reviews audit trail after payment
**Actors:** bursar, orgOwner

**Steps**
1. bursar sends invoice
2. parent pays
3. owner opens portal
4. owner reviews invoice history
5. owner opens audit trail
6. owner confirms invoice, payment, receipt, recon states

**Assertions**
- audit trail shows actor, timestamp, template, payment ref, receipt VC ID
- portal state is synchronized without manual correction
- no stale dashboard counts

---

## 6. Suite B — E-commerce delivery workflow

### B1. Merchant quote → invoice → payment → receipt → delivery ack → recon
**Workflow:** `ecommerce_delivery`  
**Actors:** merchantOwner, buyerHolder, driverVerifier, receiver, auditor

**Preconditions**
- e-commerce workflow enabled
- delivery verification enabled
- receipt consume/status-list enabled
- configured gateway enabled
- wallet policy set

**Steps**
1. merchantOwner creates quote
2. merchant converts quote to invoice
3. merchant generates secure payment link
4. merchant sends link to buyer
5. buyer opens wallet inbox / payment page
6. buyer pays via simulated gateway
7. receipt VC is issued
8. driverVerifier scans delivery QR
9. driver confirms handover
10. receiver acknowledges delivery
11. receipt status becomes consumed / torn
12. recon closes
13. merchantOwner reviews dashboard and audit trail

**Assertions**
- quote and invoice are tied to same workflow run
- payment link is not generic
- delivery verification appears only in this workflow
- wallet shows receipt with correct status
- verifier UI is separate from buyer wallet
- after ack, receipt shows consumed/completed
- dashboard shows delivery proof and settlement
- no duplicate receipt after webhook retry

**Failure cases**
- old payment link cannot be reused after completion
- if driver scans same QR twice, second scan is rejected or marked already used
- if buyer reopens receipt after consumption, status remains consumed
- duplicate settlement event does not duplicate recon record

---

### B2. Guest buyer, later claim by phone/email
**Actors:** merchantOwner, buyerHolder, driverVerifier

**Steps**
1. buyer pays as guest
2. receipt is issued to a temporary guest reference
3. buyer later claims receipt using same contact
4. delivery occurs
5. delivery proof is attached
6. recon closes

**Assertions**
- guest receipt can be claimed later
- claim preserves original workflow run
- no duplicate wallet proof object is created
- org audit trail is unchanged except for claim event

---

### B3. Delivery verifier role separation
**Actors:** driverVerifier, merchantOwner, buyerHolder

**Steps**
1. driver logs in
2. driver sees only assigned deliveries
3. driver scans QR
4. driver confirms delivery
5. buyer sees consumed receipt
6. merchant sees completed sale

**Assertions**
- driver cannot edit payment data
- driver cannot access merchant admin dashboards
- buyer cannot see driver admin data
- merchant sees only approved workflow state changes

---

## 7. Suite C — Internal requisition workflow

### C1. Lunch requisition request → approvals → release → execution → ack → recon
**Workflow:** `procurement_request`  
**Actors:** requester, approver, financeOfficer, supplierOwner, receiver, orgOwner, auditor

**Preconditions**
- requisition workflow enabled
- approvals required set to at least 2
- release authorization VC enabled
- acknowledgement VC enabled
- auto recon enabled

**Steps**
1. requester creates lunch requisition
2. manager/approver signs approval
3. financeOfficer signs approval
4. release authorization VC is generated
5. supplierOwner receives request / payout link
6. supplier executes order
7. receiver acknowledges delivery
8. acknowledgement VC is issued
9. recon closes
10. orgOwner reviews audit trail

**Assertions**
- approvals are role-bound and visible only to authorized org roles
- requisition is not treated like generic e-commerce order
- release does not occur before approvals complete
- supplier sees only the minimum execution detail
- orgOwner sees full audit trail and final closure
- receipt / ack / recon states are linked to same workflow run

**Failure cases**
- duplicate approval does not create duplicate approval VC
- if approver logs out and returns, approval step remains completed
- stale approval link cannot be replayed
- if supplier ack is repeated, only one acknowledgement event is stored

---

### C2. Requisition approval denied
**Actors:** requester, approver, financeOfficer

**Steps**
1. requester submits
2. approver rejects
3. workflow stops
4. no release link generated
5. audit trail stores rejection reason

**Assertions**
- no payout release exists
- no receipt VC is issued
- dashboard shows rejected state
- requester sees rejection reason only if allowed

---

## 8. Suite D — Cash counter workflow

### D1. Invoice → cash capture → receipt VC → batch recon
**Workflow:** `cash_counter_payment`  
**Actors:** cashier, parentHolder, orgOwner

**Steps**
1. cashier issues invoice
2. parent pays cash
3. cashier logs cash capture
4. receipt VC is issued
5. end-of-day batch reconciliation runs
6. orgOwner reviews close-out report

**Assertions**
- no delivery step is shown
- wallet prompt follows policy
- receipt appears in wallet only if allowed
- dashboard shows batch close summary
- audit trail includes cashier identity, amount, time, receipt ID

**Failure cases**
- cash capture double-click does not create duplicate receipt
- same invoice cannot be paid twice
- batch recon cannot close unmatched invoices silently

---

## 9. Suite E — Mobile worker / field execution workflow

### E1. Task assignment → GPS check-in → evidence upload → completion → ack → receipt
**Workflow:** `field_service_completion`  
**Actors:** dispatcher, worker, receiver, orgOwner, auditor

**Steps**
1. dispatcher assigns task
2. worker receives task on mobile app
3. worker checks in with GPS
4. worker captures photo evidence
5. worker completes task
6. receiver acknowledges
7. completion VC or receipt VC is issued
8. recon updates
9. orgOwner reviews audit trail

**Assertions**
- worker sees only assigned tasks
- evidence is attached to the workflow run
- photo/GPS hash appears in audit trail
- receiver ack is distinct from worker completion
- org dashboard reflects complete status

---

## 10. Suite F — Role separation / SSI compliance

### F1. Holder vs org tenant separation
**Actors:** parentHolder, bursar, orgOwner

**Steps**
1. parent logs in
2. confirm holder wallet only shows own receipts
3. bursar logs in
4. confirm bursar portal shows org invoices and dashboard only
5. orgOwner logs in
6. confirm admin controls and audit only
7. switch roles and confirm persistence is correct

**Assertions**
- holder cannot access org admin actions
- org admin cannot mutate holder wallet data directly
- each role sees only allowed actions
- role switching requires explicit auth / context switch

---

### F2. Approver / signer presentation proof
**Actors:** approver, orgOwner, auditor

**Steps**
1. approver opens approval request
2. approver presents proof or signs approval
3. workflow records approval VC or VP proof
4. orgOwner reviews who approved
5. auditor reviews same record later

**Assertions**
- approval is attributable
- signer role is captured
- approval cannot be forged through UI manipulation
- audit trail includes proof and time

---

## 11. Suite G — Atomicity and idempotency

### G1. Old link replay after login redirect
**Actors:** parentHolder, bursar

**Steps**
1. open invoice link
2. auth redirect occurs
3. login completes
4. same workflow run resumes
5. payment completes
6. reopen old link
7. verify it cannot create a second path

**Assertions**
- resume token is consumed
- old link cannot resume a new workflow run
- no duplicate payment or receipt
- server state matches visual state

---

### G2. Duplicate webhook / duplicate submit
**Actors:** system, orgOwner

**Steps**
1. send payment webhook once
2. send same webhook again
3. submit approval twice
4. submit ack twice

**Assertions**
- only one record is created for each event type
- audit log shows deduped state
- final state remains correct
- dashboard does not double-count

---

## 12. Suite H — Dashboard consistency

### H1. Org dashboard sync after holder payment
**Actors:** orgOwner, parentHolder

**Steps**
1. parent pays
2. receipt is saved
3. owner refreshes dashboard
4. reconciliation widget updates
5. audit trail shows completion

**Assertions**
- no stale counts
- no manual refresh needed if live updates exist
- dashboard totals equal actual workflow state
- wallet and portal show same transaction reference

---

### H2. Exception state
**Actors:** orgOwner, auditor

**Steps**
1. trigger mismatch or incomplete payment
2. recon dashboard flags exception
3. owner views exception detail
4. auditor reviews evidence

**Assertions**
- exception is visible
- mismatch reason is readable
- evidence bundle attached
- no accidental closure

---

## 13. Template selection tests

### T1. School fee flow must not use generic payment link
**Actors:** bursar

**Steps**
1. create invoice
2. verify template selection
3. send invoice
4. open workflow metadata

**Assertions**
- workflow type is `education_fee_payment`
- generic payment link template is not selected
- invoice page uses school branding and school logic
- recon policy is school-specific

---

### T2. Procurement flow must not use school workflow
**Actors:** requester, approver, financeOfficer

**Assertions**
- template is procurement
- approval chain exists
- release authorization exists
- receipt flow is different from education

---

## 14. Suggested regression matrix

| Test ID | Workflow | Actors | Primary goal |
|---|---|---|---|
| S1 | School fee | bursar, parentHolder, orgOwner | invoice → pay → receipt → recon |
| S2 | School claim later | bursar, newParentHolder | pending contact claim path |
| E1 | E-commerce | merchantOwner, buyerHolder, driverVerifier | quote → delivery → ack |
| E2 | Guest buyer | merchantOwner, buyerHolder | claim later without duplicate state |
| C1 | Cash counter | cashier, parentHolder, orgOwner | cash receipt + batch recon |
| P1 | Procurement | requester, approver, financeOfficer | approvals → release → ack |
| F1 | Field execution | dispatcher, worker, receiver | GPS + evidence + completion |
| R1 | Role separation | holder, orgAdmin | no cross-role leakage |
| G1 | Atomicity | holder, orgAdmin | one link, one run, one resume |
| H1 | Dashboard sync | orgOwner, holder | portal/wallet state consistency |

---

## 15. Playwright helper functions

Recommended helpers:
- `loginAs(role)`
- `switchTenantContext(tenantId)`
- `createWorkflowRun(template, payload)`
- `sendInvoice(contact)`
- `openWalletInbox()`
- `openOrgDashboard()`
- `scanQr(mode)`
- `simulatePayment(method)`
- `simulateApproval(role)`
- `captureEvidence(type)`
- `assertAuditTrailContains(event)`
- `assertNoDuplicateRecord(type)`
- `assertReconStatus(expected)`

---

## 16. Acceptance criteria

The MVP is ready only when:

1. School invoice flow is correct end-to-end.
2. E-commerce delivery flow is correct end-to-end.
3. Internal requisition flow is correct end-to-end.
4. Cash counter flow is correct end-to-end.
5. Org-owner and holder views remain separate.
6. Old links cannot be replayed.
7. Duplicate actions do not duplicate records.
8. Wallet and portal show the same truth.
9. Reconciliation dashboards populate correctly.
10. Audit trails are complete and readable.

---

## 17. Final note

Do not test this like a billing app.

Test it as:
- a workflow engine
- a trust engine
- a role-separated SSI system
- a reconciliation system
- an audit system

That is the only way to catch the bugs that matter.
