/**
 * School fee chain — the same pay-link rail as the SGK client bill.
 *
 * A school fee is one run of `education_fee_payment`: the fee is set, the parent gets a pay link
 * (one payment or instalments) backed by a `fee_assessment` money record, the paid link resumes
 * the run, and the school keeps a receipt. Credential issuance is stubbed so no agent is needed;
 * client.request_payment, PaymentLinkService.settlePaid and the money records run unmodified.
 */

import 'reflect-metadata'
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'

import { DatabaseManager } from '../src/persistence/DatabaseManager'
import { WorkflowTemplateRepository } from '../src/persistence/WorkflowTemplateRepository'
import { paymentLinkService } from '../src/services/PaymentLinkService'
import { workflowService } from '../src/services/WorkflowService'
import { ActionRegistry } from '../src/services/workflow/ActionRegistry'

import {
  addMember,
  addPaymentService,
  configureSchoolFeeTemplate,
  initTestDatabases,
  seedOrganization,
  type SeededOrganization,
  type TestDatabases,
} from './utils/orgReadinessFixture'

let databases: TestDatabases
const issued: Array<{ runId?: string; type: string; holder?: string; claims: Record<string, unknown> }> = []

function resolveRef(context: any, ref: unknown): unknown {
  if (typeof ref !== 'string') return ref
  if (ref === 'runId') return context.runId
  if (ref.startsWith('input.') || ref.startsWith('state.')) {
    const [root, ...rest] = ref.split('.')
    let value: any = root === 'input' ? context.input : context.state
    for (const part of rest) value = value?.[part]
    return value
  }
  return ref
}

ActionRegistry.register('credential.issue', async (context, config = {}) => {
  if (config.skipUnless && !resolveRef(context, config.skipUnless)) return
  const claims: Record<string, unknown> = {}
  for (const [key, ref] of Object.entries(config.mapping || {})) claims[key] = resolveRef(context, ref)
  issued.push({ runId: context.runId, type: config.type, holder: config.holder, claims })
  context.state.issuedCredentials = {
    ...(context.state.issuedCredentials || {}),
    [config.type]: { offerId: `offer-${config.type}`, issuedAt: new Date().toISOString() },
  }
})
ActionRegistry.register('trust.update_score', async () => undefined)

beforeAll(() => {
  databases = initTestDatabases('credo-school-fee-chain-')
})

afterAll(() => {
  databases.cleanup()
})

function runRow(runId: string) {
  const row = DatabaseManager.getDatabase()
    .prepare(`SELECT status, output FROM workflow_runs WHERE id = ?`)
    .get(runId) as { status: string; output: string | null }
  return { status: row.status, state: row.output ? (JSON.parse(row.output) as Record<string, any>) : {} }
}

function transactionOf(transactionId: string) {
  const db = DatabaseManager.getDatabase()
  const transaction = db
    .prepare(`SELECT transaction_type AS type, source_id AS sourceId, title FROM business_transactions WHERE id = ?`)
    .get(transactionId) as { type: string; sourceId: string; title: string }
  const obligations = db
    .prepare(
      `SELECT id, original_amount AS amount, direction, status FROM financial_obligations
        WHERE business_transaction_id = ? ORDER BY original_amount DESC`,
    )
    .all(transactionId) as Array<{ id: string; amount: number; direction: string; status: string }>
  return { transaction, obligations }
}

const FEE = {
  studentName: 'Tatenda Moyo',
  studentId: 'STU-2026-001',
  term: 'Term 3 2026',
  feeType: 'Tuition',
  currency: 'USD',
  payerName: 'Rudo Moyo',
  payerPhone: '+263771234567',
}

describe('School fee chain — fee → pay link → paid → receipt', () => {
  let org: SeededOrganization

  beforeAll(() => {
    org = seedOrganization({ name: 'Springfield High' })
    addMember({ orgTenantId: org.orgTenantId, organizationId: org.organizationId, role: 'finance_manager' })
    addPaymentService(org.orgTenantId, 'EcoCash')
    configureSchoolFeeTemplate(org.orgTenantId)
  })

  test('one payment: a fee_assessment record, a waiting run, and a receipt once the parent pays', async () => {
    issued.length = 0
    const start = await workflowService.executeWorkflow(
      'education_fee_payment',
      { ...FEE, amount: 650, reference: 'FEE-STU1-1' },
      org.orgTenantId,
    )
    const runId = start.runId
    let { status, state } = runRow(runId)
    expect(status).toBe('paused')
    expect(state.pauseReason).toBe('await_client_payment')
    expect(state.clientBill).toMatchObject({ status: 'sent', kind: 'invoice', amount: 650, instalments: 1 })
    expect(issued).toEqual([])

    const { transaction, obligations } = transactionOf(state.clientBill.transactionId)
    expect(transaction.type).toBe('fee_assessment')
    expect(transaction.sourceId).toBe(runId)
    expect(transaction.title).toBe('School fees — Tatenda Moyo (Term 3 2026)')
    expect(obligations).toHaveLength(1)
    expect(obligations[0]).toMatchObject({ amount: 650, direction: 'receivable' })

    const link = DatabaseManager.getDatabase()
      .prepare(`SELECT sector, description, metadata FROM payment_links WHERE id = ?`)
      .get(state.clientBill.linkId) as { sector: string; description: string; metadata: string }
    expect(link.sector).toBe('education')
    expect(link.description).toBe('School fees — Tatenda Moyo (Term 3 2026)')
    expect(JSON.parse(link.metadata)).toMatchObject({
      kind: 'invoice',
      centre: 'school_fees',
      studentId: 'STU-2026-001',
      workflowRunId: runId,
    })

    // A resume without the money keeps the fee waiting.
    await workflowService.resumeWorkflow(runId, {})
    expect(runRow(runId).status).toBe('paused')

    await paymentLinkService.settlePaid(state.clientBill.linkId, { reference: 'ECO-FEE-1' })
    ;({ status, state } = runRow(runId))
    expect(status).toBe('completed')
    expect(state.clientBill.status).toBe('paid')
    expect(state.payment).toMatchObject({ status: 'completed', reference: 'ECO-FEE-1', amount: 650 })

    const allocated = DatabaseManager.getDatabase()
      .prepare(`SELECT SUM(amount) AS total FROM settlement_allocations WHERE obligation_id = ?`)
      .get(obligations[0].id) as { total: number }
    expect(allocated.total).toBe(650)
    expect(transactionOf(state.clientBill.transactionId).obligations[0].status).toBe('settled')

    expect(issued.map((vc) => vc.type)).toEqual(['SchoolFeeReceiptVC'])
    expect(issued[0].holder).toBe('organization')
    expect(issued[0].claims).toMatchObject({
      amount: 650,
      paymentRef: 'ECO-FEE-1',
      studentId: 'STU-2026-001',
      term: 'Term 3 2026',
    })

    // Paying twice changes nothing.
    await paymentLinkService.settlePaid(state.clientBill.linkId, { reference: 'ECO-FEE-1' })
    expect(issued).toHaveLength(1)
  })

  test('instalments: one fee_assessment with three obligations; the first paid link moves the fee on', async () => {
    issued.length = 0
    const start = await workflowService.executeWorkflow(
      'education_fee_payment',
      {
        ...FEE,
        studentName: 'Brian Moyo',
        studentId: 'STU-2026-002',
        amount: 900,
        reference: 'FEE-STU2-1',
        paymentTerms: 'instalment',
        instalments: 3,
        paymentCadence: 'monthly',
      },
      org.orgTenantId,
    )
    const { state } = runRow(start.runId)
    expect(state.clientBill).toMatchObject({ status: 'sent', paymentTerms: 'instalment', instalments: 3, amount: 300 })
    expect(state.clientBill.planId).toBeTruthy()

    const { transaction, obligations } = transactionOf(state.clientBill.transactionId)
    expect(transaction.type).toBe('fee_assessment')
    expect(obligations.map((o) => o.amount)).toEqual([300, 300, 300])

    const plan = DatabaseManager.getDatabase()
      .prepare(
        `SELECT installments_total AS total, business_transaction_id AS transactionId FROM ar_payment_plans WHERE id = ?`,
      )
      .get(state.clientBill.planId) as { total: number; transactionId: string }
    expect(plan).toEqual({ total: 3, transactionId: state.clientBill.transactionId })

    await paymentLinkService.settlePaid(state.clientBill.linkId, { reference: 'ECO-FEE-2' })
    const after = runRow(start.runId)
    expect(after.status).toBe('completed')
    expect(after.state.payment).toMatchObject({ amount: 300, reference: 'ECO-FEE-2' })
  })

  test('no parent phone: no link, no receipt, the fee says why', async () => {
    issued.length = 0
    const start = await workflowService.executeWorkflow(
      'education_fee_payment',
      { ...FEE, payerPhone: '', amount: 100, reference: 'FEE-STU3-1' },
      org.orgTenantId,
    )
    const { status, state } = runRow(start.runId)
    expect(status).toBe('completed')
    expect(state.clientBill).toMatchObject({ status: 'not_sent' })
    expect(issued).toEqual([])
  })

  test('a school template saved with the old capture stub is upgraded to the pay-link steps', () => {
    const repo = new WorkflowTemplateRepository()
    const legacy = configureSchoolFeeTemplate(`org-legacy-${Date.now()}`, {
      steps: [
        { action: 'finance.calculate_invoice', config: {} },
        { action: 'external.ecocash_payment', config: { provider: 'ecocash-zw' } },
      ],
    })
    const loaded = repo.findById(legacy.id)!
    const actions = loaded.steps.map((step) => step.action)
    expect(actions).toContain('client.request_payment')
    expect(actions).not.toContain('external.ecocash_payment')
  })
})
