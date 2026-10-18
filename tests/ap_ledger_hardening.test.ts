import 'reflect-metadata'
import { randomUUID } from 'crypto'
import { afterAll, afterEach, beforeAll, describe, expect, jest, test } from '@jest/globals'

import { AccountsPayableController } from '../src/controllers/finance/AccountsPayableController'
import { DatabaseManager } from '../src/persistence/DatabaseManager'
import { businessTransactionService } from '../src/services/BusinessTransactionService'

import { initTestDatabases, seedOrganization, type TestDatabases } from './utils/orgReadinessFixture'

let databases: TestDatabases

beforeAll(() => {
  databases = initTestDatabases('credo-ap-hardening-')
})

afterAll(() => {
  databases.cleanup()
})

afterEach(() => {
  jest.restoreAllMocks()
})

function requestFor(orgTenantId: string) {
  return { user: { tenantId: orgTenantId, orgRole: 'owner' }, headers: {} } as any
}

function seedSupplier(orgTenantId: string): string {
  const id = `SUP-${randomUUID()}`
  const now = new Date().toISOString()
  DatabaseManager.getDatabase()
    .prepare(
      `
    INSERT INTO ap_suppliers (id, buyer_tenant_id, supplier_name, created_at, updated_at)
    VALUES (?, ?, 'Test Supplier', ?, ?)
  `,
    )
    .run(id, orgTenantId, now, now)
  return id
}

describe('Accounts payable ledger integrity', () => {
  test('rejects non-positive invoice amounts without recording financial rows', async () => {
    const org = seedOrganization()
    const supplierId = seedSupplier(org.orgTenantId)
    const result = await new AccountsPayableController().recordInvoice(
      { supplierId, invoiceRef: 'INVALID-AMOUNT', amount: 0 },
      requestFor(org.orgTenantId),
    )

    expect(result).toMatchObject({ error: expect.stringMatching(/positive amount/i) })
    expect(DatabaseManager.getDatabase().prepare('SELECT COUNT(*) AS count FROM ap_invoices').get()).toEqual({
      count: 0,
    })
    expect(DatabaseManager.getDatabase().prepare('SELECT COUNT(*) AS count FROM business_transactions').get()).toEqual({
      count: 0,
    })
  })

  test('rolls back the transaction and obligation when invoice persistence fails', async () => {
    const org = seedOrganization()
    const supplierId = seedSupplier(org.orgTenantId)
    const ensureObligation = jest.spyOn(businessTransactionService, 'ensureObligation').mockImplementation(() => {
      throw new Error('injected obligation failure')
    })

    const result = await new AccountsPayableController().recordInvoice(
      { supplierId, invoiceRef: 'ATOMIC-FAILURE', amount: 125, currency: 'USD' },
      requestFor(org.orgTenantId),
    )

    expect(result).toMatchObject({ error: 'injected obligation failure' })
    const db = DatabaseManager.getDatabase()
    expect(
      db.prepare("SELECT COUNT(*) AS count FROM business_transactions WHERE source_type = 'manual_ap_invoice'").get(),
    ).toEqual({ count: 0 })
    expect(db.prepare('SELECT COUNT(*) AS count FROM financial_obligations').get()).toEqual({ count: 0 })
    expect(db.prepare('SELECT COUNT(*) AS count FROM ap_invoices').get()).toEqual({ count: 0 })
    ensureObligation.mockRestore()
  })

  test('rejects a payment in a different currency or above the remaining balance', async () => {
    const org = seedOrganization()
    const controller = new AccountsPayableController()
    const supplierId = seedSupplier(org.orgTenantId)
    const invoice = (await controller.recordInvoice(
      { supplierId, invoiceRef: 'VALIDATION-INVOICE', amount: 100, currency: 'USD' },
      requestFor(org.orgTenantId),
    )) as { id: string }
    const db = DatabaseManager.getDatabase()

    const wrongCurrency = await controller.recordPayment(
      { supplierId, apInvoiceId: invoice.id, amountPaid: 10, currency: 'EUR' },
      requestFor(org.orgTenantId),
    )
    expect(wrongCurrency).toMatchObject({ error: 'Payment currency must be USD' })

    const overpayment = await controller.recordPayment(
      { supplierId, apInvoiceId: invoice.id, amountPaid: 101, currency: 'USD' },
      requestFor(org.orgTenantId),
    )
    expect(overpayment).toMatchObject({ error: 'Payment amount exceeds the remaining invoice balance' })
    expect(db.prepare('SELECT balance_due FROM ap_invoices WHERE id = ?').get(invoice.id)).toEqual({ balance_due: 100 })
    expect(db.prepare('SELECT COUNT(*) AS count FROM ap_payments WHERE ap_invoice_id = ?').get(invoice.id)).toEqual({
      count: 0,
    })
  })
})
