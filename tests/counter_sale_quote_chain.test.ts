/**
 * Counter sale and quote chains — the same pay-link rail as the job bill and school fees.
 *
 * Counter sale: the cashier records the money, the sale is a paid link with a `sale` money record
 * that closes at once, and the receipt names the receipt number. Quote: the buyer gets a link,
 * paying settles the sale, declining cancels what was quoted. Credential issuance and the phone
 * message are stubbed; every other step runs unmodified.
 */

import 'reflect-metadata'
import { afterAll, beforeAll, describe, expect, jest, test } from '@jest/globals'

import { DatabaseManager } from '../src/persistence/DatabaseManager'
import { notificationService } from '../src/services/NotificationService'
import { paymentLinkService } from '../src/services/PaymentLinkService'
import { workflowService } from '../src/services/WorkflowService'
import { ActionRegistry } from '../src/services/workflow/ActionRegistry'
import { AccountsPayableTemplate, CashCounterTemplate } from '../src/services/workflow/templates'
import { WorkflowTemplateController } from '../src/controllers/workflow/WorkflowTemplateController'

import {
  addMember,
  addPaymentService,
  configureCashCounterTemplate,
  configureQuoteTemplate,
  initTestDatabases,
  seedOrganization,
  type SeededOrganization,
  type TestDatabases,
} from './utils/orgReadinessFixture'

let databases: TestDatabases
const issued: Array<{ runId?: string; type: string; claims: Record<string, unknown> }> = []

function resolveRef(context: any, ref: unknown): unknown {
  if (typeof ref !== 'string') return ref
  if (ref.startsWith('input.') || ref.startsWith('state.')) {
    const [root, ...rest] = ref.split('.')
    let value: any = root === 'input' ? context.input : context.state
    for (const part of rest) value = value?.[part]
    return value
  }
  return ref
}

ActionRegistry.register('credential.issue', async (context, config = {}) => {
  const claims: Record<string, unknown> = {}
  for (const [key, ref] of Object.entries(config.mapping || {})) claims[key] = resolveRef(context, ref)
  issued.push({ runId: context.runId, type: config.type, claims })
})
ActionRegistry.register('trust.update_score', async () => undefined)

beforeAll(() => {
  databases = initTestDatabases('credo-counter-quote-chain-')
  jest
    .spyOn(notificationService, 'dispatchContactNotification')
    .mockResolvedValue({ accepted: true, channels: [{ channel: 'sms', status: 'accepted' }] } as any)
})

afterAll(() => {
  databases.cleanup()
})

function runRow(runId: string) {
  const row = DatabaseManager.getDatabase()
    .prepare(`SELECT status, error, output FROM workflow_runs WHERE id = ?`)
    .get(runId) as { status: string; error?: string; output: string | null }
  return { status: row.status, error: row.error, state: row.output ? (JSON.parse(row.output) as Record<string, any>) : {} }
}

function moneyOf(linkId: string) {
  const db = DatabaseManager.getDatabase()
  const link = db
    .prepare(`SELECT status, invoice_ref AS invoiceRef, metadata, business_transaction_id AS transactionId, obligation_id AS obligationId FROM payment_links WHERE id = ?`)
    .get(linkId) as { status: string; invoiceRef: string; metadata: string; transactionId: string; obligationId: string }
  const transaction = db
    .prepare(`SELECT transaction_type AS type, status FROM business_transactions WHERE id = ?`)
    .get(link.transactionId) as { type: string; status: string }
  const obligation = db
    .prepare(`SELECT status, balance_due AS balanceDue FROM financial_obligations WHERE id = ?`)
    .get(link.obligationId) as { status: string; balanceDue: number }
  return { link: { ...link, metadata: JSON.parse(link.metadata || '{}') }, transaction, obligation }
}

describe('Counter sale chain — cash taken → paid link → closed sale → receipt', () => {
  let org: SeededOrganization

  beforeAll(() => {
    org = seedOrganization({ name: 'Corner Pharmacy' })
    addMember({ orgTenantId: org.orgTenantId, organizationId: org.organizationId, role: 'finance_manager' })
    addPaymentService(org.orgTenantId, 'EcoCash')
    configureCashCounterTemplate(org.orgTenantId)
  })

  test('a cash sale finishes in one go: paid link, closed sale, receipt with its number', async () => {
    issued.length = 0
    const start = await workflowService.executeWorkflow(
      'cash_counter_payment',
      { amount: 23.5, currency: 'USD', paymentMethod: 'cash', cashierRef: 'TILL-1', items: [{ description: 'Paracetamol' }] },
      org.orgTenantId,
    )
    const { status, state } = runRow(start.runId)
    expect(status).toBe('completed')
    expect(state.payment).toMatchObject({ status: 'completed', method: 'cash', amount: 23.5, currency: 'USD' })
    expect(state.payment.receiptId).toMatch(/^RCPT-/)

    const { link, transaction, obligation } = moneyOf(state.payment.linkId)
    expect(link.status).toBe('paid')
    expect(link.invoiceRef).toBe(state.payment.receiptId)
    expect(link.metadata).toMatchObject({ centre: 'counter_sales', paymentMethod: 'cash', cashierRef: 'TILL-1' })
    expect(transaction).toEqual({ type: 'sale', status: 'settled' })
    expect(obligation).toEqual({ status: 'settled', balanceDue: 0 })

    expect(issued.map((vc) => vc.type)).toEqual(['InvoiceVC', 'PaymentReceiptVC'])
    expect(issued[1].claims).toMatchObject({ receiptId: state.payment.receiptId, paymentMethod: 'cash', amount: 23.5 })
  })

  test('running the cash step again finds the same sale instead of taking the money twice', async () => {
    const start = await workflowService.executeWorkflow(
      'cash_counter_payment',
      { amount: 10, paymentMethod: 'pos', cashierRef: 'TILL-2' },
      org.orgTenantId,
    )
    const { state } = runRow(start.runId)
    const context: any = { tenantId: org.orgTenantId, runId: start.runId, input: { amount: 10, paymentMethod: 'pos', cashierRef: 'TILL-2' }, state: {} }
    await ActionRegistry.get('external.cash_capture')!(context, {})
    expect(context.state.payment.linkId).toBe(state.payment.linkId)
    const count = DatabaseManager.getDatabase()
      .prepare(`SELECT COUNT(*) AS n FROM payment_links WHERE invoice_ref = ?`)
      .get(state.payment.receiptId) as { n: number }
    expect(count.n).toBe(1)
  })

  test('no payment method, or a required cashier reference missing: a plain reason and no money recorded', async () => {
    const noMethod = await workflowService.executeWorkflow('cash_counter_payment', { amount: 5, cashierRef: 'TILL-1' }, org.orgTenantId)
    expect(runRow(noMethod.runId)).toMatchObject({ status: 'failed', error: 'Choose how the customer paid: cash, EcoCash or card.' })

    // The cashier reference is asked for only when the organisation switched that setting on.
    const capture = ActionRegistry.get('external.cash_capture')!
    const context: any = { tenantId: org.orgTenantId, runId: 'run-no-cashier', input: { amount: 5, paymentMethod: 'cash' }, state: {} }
    await expect(capture(context, { requireCashierRef: true })).rejects.toThrow('Enter the cashier reference.')
    expect(context.state.payment).toBeUndefined()

    const optional = await workflowService.executeWorkflow('cash_counter_payment', { amount: 5, paymentMethod: 'cash' }, org.orgTenantId)
    expect(runRow(optional.runId).status).toBe('completed')
  })
})

describe('Quote chain — quote link → paid or declined → sale closed or cancelled', () => {
  let org: SeededOrganization
  const QUOTE = {
    items: [{ description: 'Website design', unitPrice: 200, quantity: 2 }],
    buyerPhone: '+263771112233',
    buyerName: 'Kuda Shumba',
    reference: 'Q-100',
    currency: 'USD',
  }

  beforeAll(() => {
    org = seedOrganization({ name: 'Pixel Studio' })
    addMember({ orgTenantId: org.orgTenantId, organizationId: org.organizationId, role: 'finance_manager' })
    addPaymentService(org.orgTenantId, 'EcoCash')
    configureQuoteTemplate(org.orgTenantId)
  })

  test('the buyer pays the quote: the run finishes and the sale closes', async () => {
    const start = await workflowService.executeWorkflow('ecommerce_delivery', QUOTE, org.orgTenantId)
    let { status, state } = runRow(start.runId)
    expect(status).toBe('paused')
    expect(state.clientBill).toMatchObject({ status: 'sent', kind: 'quote', amount: 460 })
    expect(moneyOf(state.clientBill.linkId).transaction).toEqual({ type: 'sale', status: 'open' })

    await paymentLinkService.settlePaid(state.clientBill.linkId, { reference: 'ECO-Q-1' })
    ;({ status, state } = runRow(start.runId))
    expect(status).toBe('completed')
    expect(state.payment).toMatchObject({ status: 'completed', reference: 'ECO-Q-1', amount: 460 })
    const money = moneyOf(state.clientBill.linkId)
    expect(money.transaction.status).toBe('settled')
    expect(money.obligation.status).toBe('settled')
  })

  test('the buyer declines: the run is cancelled and nothing stays owed', async () => {
    const start = await workflowService.executeWorkflow('ecommerce_delivery', { ...QUOTE, reference: 'Q-101' }, org.orgTenantId)
    const { state } = runRow(start.runId)
    expect(await paymentLinkService.decline(state.clientBill.linkId, 'Too expensive')).toBe(true)
    expect(runRow(start.runId).status).toBe('cancelled')
    const money = moneyOf(state.clientBill.linkId)
    expect(money.link.status).toBe('cancelled')
    expect(money.obligation.status).toBe('cancelled')
    expect(money.transaction.status).toBe('cancelled')
  })
})

describe('Template catalogue only offers what can run', () => {
  test('supplier payments (steps not built) are hidden; counter sales are listed', async () => {
    expect(ActionRegistry.missing(AccountsPayableTemplate.steps)).toEqual(['ap.record_invoice', 'ap.record_payment'])
    expect(ActionRegistry.missing(CashCounterTemplate.steps)).toEqual([])
    const listed = (await new WorkflowTemplateController().listTemplates()).map((t) => t.id)
    expect(listed).toContain('tpl-cash-counter')
    expect(listed).not.toContain('tpl-ap-payables')
  })

  test('starting a workflow with a step that is not built is refused before any run is created', async () => {
    const org = seedOrganization({ name: 'Unbuilt Steps Ltd' })
    const db = DatabaseManager.getDatabase()
    db.prepare(
      `INSERT INTO workflows (id, tenant_id, name, category, provider, actions, created_at)
       VALUES (?, ?, 'Half built', 'finance', 'custom', ?, ?)`,
    ).run('wf-half-built', org.orgTenantId, JSON.stringify([{ action: 'ap.record_invoice', config: {} }]), new Date().toISOString())
    const before = (db.prepare(`SELECT COUNT(*) AS n FROM workflow_runs`).get() as { n: number }).n
    await expect(workflowService.executeWorkflow('wf-half-built', {}, org.orgTenantId)).rejects.toThrow(
      '"Half built" is not available yet. Some of its steps are not built.',
    )
    expect((db.prepare(`SELECT COUNT(*) AS n FROM workflow_runs`).get() as { n: number }).n).toBe(before)
  })
})
