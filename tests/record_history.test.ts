/**
 * One History, export and cancel path for requests, supplier bills and payment plans
 * (`/api/records/{kind}/{id}`), and the job History finding events by the job's own reference.
 */

import 'reflect-metadata'
import { afterAll, afterEach, beforeAll, describe, expect, jest, test } from '@jest/globals'
import { randomUUID } from 'crypto'

import { RecordController } from '../src/controllers/platform/RecordController'
import { DatabaseManager } from '../src/persistence/DatabaseManager'
import { workflowRepository } from '../src/persistence/WorkflowRepository'
import { workflowRunRepository } from '../src/persistence/WorkflowRunRepository'
import { orgWorkflowActorCredentialService } from '../src/services/OrgWorkflowActorCredentialService'
import { platformRequestService } from '../src/services/PlatformRequestService'
import { notificationService } from '../src/services/NotificationService'
import { ReconciliationService } from '../src/services/ReconciliationService'
import { workflowAuditService } from '../src/services/WorkflowAuditService'

import { addMember, initTestDatabases, seedOrganization, type TestDatabases } from './utils/orgReadinessFixture'

let databases: TestDatabases

beforeAll(() => {
  databases = initTestDatabases('credo-record-history-')
  orgWorkflowActorCredentialService.setOfferFactory(async () => ({
    offerId: `actor-${randomUUID()}`,
    offerUri: 'openid-credential-offer://?credential_offer_uri=https://issuer.example/offer/actor',
  }))
})

afterAll(() => {
  databases.cleanup()
})

afterEach(() => {
  jest.restoreAllMocks()
})

function asUser(tenantId: string, userId: string, headers: Record<string, string> = {}) {
  return { user: { tenantId, sub: userId, id: userId }, headers } as any
}

function seedBill(orgTenantId: string, status = 'outstanding') {
  const db = DatabaseManager.getDatabase()
  const now = new Date().toISOString()
  const supplierId = `sup-${randomUUID()}`
  const invoiceId = `inv-${randomUUID()}`
  db.prepare(
    `INSERT INTO ap_suppliers (id, buyer_tenant_id, supplier_name, created_at, updated_at) VALUES (?, ?, 'Stationers', ?, ?)`,
  ).run(supplierId, orgTenantId, now, now)
  db.prepare(
    `INSERT INTO ap_invoices (id, buyer_tenant_id, supplier_id, invoice_ref, amount, currency, status, balance_due, created_at, updated_at)
     VALUES (?, ?, ?, 'BILL-12', 300, 'USD', ?, 300, ?, ?)`,
  ).run(invoiceId, orgTenantId, supplierId, status, now, now)
  return { supplierId, invoiceId }
}

function seedPlan(orgTenantId: string) {
  const db = DatabaseManager.getDatabase()
  const now = new Date().toISOString()
  const planId = `plan-${randomUUID()}`
  db.prepare(
    `INSERT INTO ar_payment_plans (id, buyer_tenant_id, description, total_amount, currency, installments_total, created_at, updated_at)
     VALUES (?, ?, 'Term fees', 200, 'USD', 2, ?, ?)`,
  ).run(planId, orgTenantId, now, now)
  db.prepare(
    `INSERT INTO ar_plan_installments (id, plan_id, installment_number, amount, status, paid_at, created_at)
     VALUES (?, ?, 1, 100, 'paid', ?, ?), (?, ?, 2, 100, 'pending', NULL, ?)`,
  ).run(`i1-${planId}`, planId, now, now, `i2-${planId}`, planId, now)
  return planId
}

describe('record history', () => {
  test('a request lists its steps in plain words and exports the same rows', async () => {
    const org = seedOrganization({ name: 'History Ltd' })
    const clerk = `user-${randomUUID()}`
    addMember({ orgTenantId: org.orgTenantId, organizationId: org.organizationId, role: 'member', userId: clerk })
    const created = platformRequestService.create({
      tenantId: org.orgTenantId,
      subjectRef: clerk,
      requestType: 'procurement.requisition',
      title: 'Desk lamps',
      amount: 60,
      currency: 'USD',
      targetModule: 'finance',
      items: [{ description: 'Desk lamp', quantity: 2, unitPrice: 30 }],
    }) as { id: string }
    platformRequestService.submit(created.id, org.orgTenantId, clerk)
    platformRequestService.decideBySubject(created.id, org.orgTenantId, org.ownerUserId, 'approve')

    const controller = new RecordController()
    const history = (await controller.history('request', created.id, asUser(org.orgTenantId, org.ownerUserId))) as any
    expect(history.error).toBeUndefined()
    const events = history.rows.map((row: any) => row.event)
    expect(events).toEqual(expect.arrayContaining(['Sent for approval', 'Approved']))
    expect(events.join(' ')).not.toMatch(/request\.status_changed|in_review/)

    const csv = (await controller.history('request', created.id, asUser(org.orgTenantId, org.ownerUserId), undefined, undefined, undefined, undefined, 'csv')) as any
    expect(csv.csv.split('\n')[0]).toContain('Date and time')
    expect(csv.csv).toContain('Approved')

    // The requester reads their own request's history; another org cannot.
    const own = (await controller.history('request', created.id, asUser(org.orgTenantId, clerk))) as any
    expect(own.rows.length).toBeGreaterThan(0)
    const other = seedOrganization({ name: 'Elsewhere Ltd' })
    const foreign = (await controller.history('request', created.id, asUser(other.orgTenantId, other.ownerUserId))) as any
    expect(foreign.error).toBe('Record not found')
  })

  test('a supplier bill and a payment plan share the same history shape', async () => {
    const org = seedOrganization({ name: 'Ledger Ltd' })
    const { invoiceId } = seedBill(org.orgTenantId)
    const planId = seedPlan(org.orgTenantId)

    const bill = workflowAuditService.readRecord('supplier_bill', invoiceId, org.orgTenantId)!
    expect(bill.rows[0]).toMatchObject({ event: 'Supplier bill recorded', source: 'record' })
    const plan = workflowAuditService.readRecord('collection', planId, org.orgTenantId)!
    expect(plan.rows.map((row) => row.event)).toEqual(['Payment plan set up', 'Instalment 1 paid'])
    expect(workflowAuditService.readRecord('collection', planId, 'someone-else')).toBeUndefined()
  })
})

describe('record cancel', () => {
  test('an unpaid supplier bill cancels once; a paid one refuses', async () => {
    const org = seedOrganization({ name: 'Cancel Ltd' })
    const { invoiceId, supplierId } = seedBill(org.orgTenantId)
    const controller = new RecordController()

    const first = await controller.cancel('supplier_bill', invoiceId, asUser(org.orgTenantId, org.ownerUserId))
    const again = await controller.cancel('supplier_bill', invoiceId, asUser(org.orgTenantId, org.ownerUserId))
    expect(first).toEqual({ kind: 'supplier_bill', id: invoiceId, status: 'cancelled' })
    expect(again).toEqual(first)
    const history = workflowAuditService.readRecord('supplier_bill', invoiceId, org.orgTenantId)!
    expect(history.rows.at(-1)?.event).toBe('Cancelled')

    const paid = seedBill(org.orgTenantId)
    const now = new Date().toISOString()
    DatabaseManager.getDatabase()
      .prepare(
        `INSERT INTO ap_payments (id, buyer_tenant_id, supplier_id, ap_invoice_id, amount_paid, currency, paid_at, created_at)
         VALUES (?, ?, ?, ?, 100, 'USD', ?, ?)`,
      )
      .run(`pay-${randomUUID()}`, org.orgTenantId, paid.supplierId || supplierId, paid.invoiceId, now, now)
    const refused = (await controller.cancel('supplier_bill', paid.invoiceId, asUser(org.orgTenantId, org.ownerUserId))) as any
    expect(refused.error).toBe('This bill has a payment against it, so it cannot be cancelled.')
  })

  test('a payment plan cancels its unpaid instalments and keeps the paid one', async () => {
    const org = seedOrganization({ name: 'Plan Cancel Ltd' })
    const planId = seedPlan(org.orgTenantId)
    const result = await new RecordController().cancel('collection', planId, asUser(org.orgTenantId, org.ownerUserId))
    expect(result).toMatchObject({ status: 'cancelled' })
    const rows = DatabaseManager.getDatabase()
      .prepare(`SELECT installment_number, status FROM ar_plan_installments WHERE plan_id = ? ORDER BY installment_number`)
      .all(planId) as Array<{ installment_number: number; status: string }>
    expect(rows.map((row) => row.status)).toEqual(['paid', 'cancelled'])
  })

  test('the requester withdraws their own request from their personal wallet; nobody else can there', async () => {
    const org = seedOrganization({ name: 'Withdraw Ltd' })
    const clerk = `user-${randomUUID()}`
    const other = `user-${randomUUID()}`
    addMember({ orgTenantId: org.orgTenantId, organizationId: org.organizationId, role: 'member', userId: clerk })
    addMember({ orgTenantId: org.orgTenantId, organizationId: org.organizationId, role: 'member', userId: other })
    const created = platformRequestService.create({
      tenantId: org.orgTenantId,
      subjectRef: clerk,
      requestType: 'procurement.requisition',
      title: 'Printer ink',
      amount: 40,
      currency: 'USD',
      targetModule: 'finance',
      items: [{ description: 'Ink', quantity: 1, unitPrice: 40 }],
    }) as { id: string }
    platformRequestService.submit(created.id, org.orgTenantId, clerk)
    const controller = new RecordController()

    const refused = (await controller.cancel('request', created.id, asUser(`personal-${other}`, other))) as any
    expect(refused.error).toBe('Only the person who raised this request can withdraw it here.')
    const first = await controller.cancel('request', created.id, asUser(`personal-${clerk}`, clerk), { reason: 'Bought it myself' })
    const again = await controller.cancel('request', created.id, asUser(`personal-${clerk}`, clerk))
    expect(first).toEqual({ kind: 'request', id: created.id, status: 'cancelled' })
    expect(again).toEqual(first)
    const row = DatabaseManager.getDatabase().prepare('SELECT status FROM requests WHERE id = ?').get(created.id) as { status: string }
    expect(row.status).toBe('cancelled')
  })

  test('a member who is not in finance cannot cancel a bill, and jobs are not cancelled here', async () => {
    const org = seedOrganization({ name: 'Roles Ltd' })
    const clerk = `user-${randomUUID()}`
    addMember({ orgTenantId: org.orgTenantId, organizationId: org.organizationId, role: 'member', userId: clerk })
    const { invoiceId } = seedBill(org.orgTenantId)
    const controller = new RecordController()
    const refused = (await controller.cancel('supplier_bill', invoiceId, asUser(org.orgTenantId, clerk))) as any
    expect(refused.error).toBe('Only an owner, admin or finance manager can cancel this.')
    const job = (await controller.cancel('job', 'run-1', asUser(org.orgTenantId, org.ownerUserId))) as any
    expect(job.error).toBe('Choose a request, a supplier bill or a payment plan.')
  })
})

describe('job history lookup', () => {
  test('events filed under the job reference show up after the payout sets a payment reference', () => {
    const org = seedOrganization({ name: 'Lookup Ltd' })
    const workflowId = `lookup-${org.orgTenantId}`
    workflowRepository.save({
      id: workflowId,
      tenantId: org.orgTenantId,
      name: 'Job',
      category: 'field_execution_fept',
      provider: 'test',
      actions: [],
    })
    const run = workflowRunRepository.createRun({
      workflowId,
      tenantId: org.orgTenantId,
      status: 'completed',
      input: { reference: 'JOB-77' },
      output: { providerRef: 'PAYOUT-9' },
    } as any)
    new ReconciliationService().recordEvent('JOB-77', 'JOB_STARTED' as any, 'workflow', { tenantId: org.orgTenantId })
    new ReconciliationService().recordEvent('PAYOUT-9', 'PAYMENT_SUCCESS' as any, 'workflow', { tenantId: org.orgTenantId })

    const audit = workflowAuditService.readRun(run.id, org.orgTenantId)!
    expect(audit.rows.map((row) => row.event)).toEqual(expect.arrayContaining(['Job started', 'Payment released']))
  })

  test('a paid Money in request reconciles on its own trail, once, even for a shop', async () => {
    const org = await seedOrganization({ name: `Paid Request ${randomUUID().slice(0, 6)}` })
    const db = DatabaseManager.getDatabase()
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO workflow_templates (id, tenant_id, name, sector, workflow_type, created_at, updated_at)
       VALUES (?, ?, 'Shop', 'ecommerce', 'ecommerce_delivery', ?, ?)`,
    ).run(`tpl-${randomUUID()}`, org.orgTenantId, now, now)
    const recon = new ReconciliationService()
    const paid = { tenantId: org.orgTenantId, amount: 24, currency: 'USD', linkId: 'L-1', settled: true }

    recon.recordPaidCheckout('SIM-REQ-1', { ...paid, kind: 'payment_request', deliveryRequired: false })
    recon.recordPaidCheckout('SIM-REQ-1', { ...paid, kind: 'payment_request', deliveryRequired: false })
    recon.recordPaidCheckout('SIM-CART-1', { ...paid, linkId: undefined, settled: false, kind: 'cart' })

    const status = (ref: string) =>
      (db.prepare('SELECT status FROM reconciliation_status WHERE provider_ref = ?').get(ref) as { status: string }).status
    expect(status('SIM-REQ-1')).toBe('RECONCILED')
    expect(
      db.prepare(`SELECT COUNT(*) AS n FROM reconciliation_events WHERE provider_ref = 'SIM-REQ-1'`).get(),
    ).toEqual({ n: 3 })
    // A cart on a delivery workflow still waits for delivery, as before.
    expect(status('SIM-CART-1')).toBe('RECEIPT_ISSUED')
    // The website receipt and the phone delivery scan share one handover. It records delivery once.
    recon.recordPaidCheckout('SIM-HANDOVER', { ...paid, kind: 'cart' })
    expect(status('SIM-HANDOVER')).toBe('RECEIPT_ISSUED')
    db.prepare(
      `INSERT INTO ack_payments (id, tenant_id, provider_ref, amount, currency, state, idempotency_key, created_at, updated_at)
       VALUES (?, ?, 'SIM-HANDOVER', 24, 'USD', 'paid', ?, ?, ?)`,
    ).run(`pay-handover-${randomUUID()}`, org.orgTenantId, `idem-handover-${randomUUID()}`, now, now)
    expect(recon.confirmHandover('SIM-HANDOVER').ok).toBe(true)
    expect(recon.confirmHandover('SIM-HANDOVER').ok).toBe(true)
    expect(status('SIM-HANDOVER')).toBe('RECONCILED')
    expect(recon.checkoutTrail('SIM-HANDOVER')).toMatchObject({ status: 'RECONCILED', settledAt: expect.any(String), deliveredAt: expect.any(String) })
    expect(
      db.prepare(`SELECT COUNT(*) AS n FROM reconciliation_events WHERE provider_ref = 'SIM-HANDOVER' AND event_type = 'DELIVERY_VERIFIED'`).get(),
    ).toEqual({ n: 1 })
    expect((db.prepare(`SELECT state FROM ack_payments WHERE provider_ref = 'SIM-HANDOVER'`).get() as { state: string }).state).toBe(
      'delivered',
    )
    // A payment recorded before the bill is matched gains the settlement later, once.
    recon.recordPaidCheckout('SIM-LATE', { ...paid, linkId: undefined, settled: false, kind: 'cart', deliveryRequired: false })
    recon.recordPaidCheckout('SIM-LATE', { ...paid, settled: true, kind: 'cart', deliveryRequired: false })
    recon.recordPaidCheckout('SIM-LATE', { ...paid, settled: true, kind: 'cart', deliveryRequired: false })
    expect(status('SIM-LATE')).toBe('RECONCILED')
    expect(db.prepare(`SELECT COUNT(*) AS n FROM reconciliation_events WHERE provider_ref = 'SIM-LATE'`).get()).toEqual({
      n: 3,
    })
  })

  test('a supplier payment reconciles on its own trail; without an advice it stops at Paid', async () => {
    const org = await seedOrganization({ name: `Supplier Pay ${randomUUID().slice(0, 6)}` })
    const db = DatabaseManager.getDatabase()
    const recon = new ReconciliationService()
    const base = { tenantId: org.orgTenantId, amount: 60, currency: 'USD', settled: true, deliveryRequired: false }

    recon.recordPaidCheckout('APPAY-OK', { ...base, kind: 'supplier_payment', source: 'ap_payment', receiptId: 'VC-1' })
    recon.recordPaidCheckout('APPAY-NOVC', {
      ...base,
      kind: 'supplier_payment',
      source: 'ap_payment',
      receiptIssued: false,
    })

    const status = (ref: string) =>
      (db.prepare('SELECT status FROM reconciliation_status WHERE provider_ref = ?').get(ref) as { status: string }).status
    expect(status('APPAY-OK')).toBe('RECONCILED')
    expect(status('APPAY-NOVC')).toBe('PAID')
    expect(
      db.prepare(`SELECT source FROM reconciliation_events WHERE provider_ref = 'APPAY-OK' GROUP BY source`).all(),
    ).toEqual([{ source: 'ap_payment' }])
    // Replaying the same supplier payment records nothing new.
    recon.recordPaidCheckout('APPAY-OK', { ...base, kind: 'supplier_payment', source: 'ap_payment', receiptId: 'VC-1' })
    expect(
      db.prepare(`SELECT COUNT(*) AS n FROM reconciliation_events WHERE provider_ref = 'APPAY-OK'`).get(),
    ).toEqual({ n: 3 })
  })

  test('a shop receipt WhatsApp can be marked delivered once, without creating consent', async () => {
    const org = await seedOrganization({ name: `Receipt Wa ${randomUUID().slice(0, 6)}` })
    const db = DatabaseManager.getDatabase()
    const messageId = `wamid-${randomUUID()}`
    const input = {
      tenantId: org.orgTenantId,
      to: '0774183277',
      eventType: 'payment_link',
      messageId,
      senderKey: 'platform',
      phoneNumberId: '1232138763320433',
    }
    const prefsBefore = db.prepare(`SELECT COUNT(*) AS n FROM notification_preferences`).get()
    notificationService.recordAcceptedWhatsApp(input)
    notificationService.recordAcceptedWhatsApp(input)
    expect(
      db.prepare(`SELECT COUNT(*) AS n FROM notification_deliveries WHERE provider_message_id = ?`).get(messageId),
    ).toEqual({ n: 1 })
    expect(db.prepare(`SELECT COUNT(*) AS n FROM notification_preferences`).get()).toEqual(prefsBefore)
    notificationService.applyWhatsAppStatus('platform', input.phoneNumberId, {
      id: messageId,
      status: 'delivered',
      timestamp: '1730000000',
      recipient_id: '263774183277',
    })
    expect(
      (db.prepare(`SELECT status FROM notification_deliveries WHERE provider_message_id = ?`).get(messageId) as { status: string }).status,
    ).toBe('delivered')
  })
})
