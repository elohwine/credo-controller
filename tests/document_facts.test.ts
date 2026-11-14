import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals'
import { readFileSync } from 'fs'
import { join } from 'path'

import { DatabaseManager } from '../src/persistence/DatabaseManager'
import { orgBrandService, sanitizeBrandInput, vatBreakdown } from '../src/services/OrgBrandService'
import { billDocumentClaims, documentClaims, financeClaims, taxFromFinance } from '../src/services/documentFacts'
import { FinanceActions } from '../src/services/workflow/actions/FinanceActions'

// Every quote, invoice and receipt carries the issuing organisation's details and the VAT in its amount.
describe('document facts', () => {
  let db: Database.Database
  let restore: ReturnType<typeof jest.spyOn>

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(readFileSync(join(process.cwd(), 'migrations/136_org_brand.sql'), 'utf8'))
    db.exec(`
      CREATE TABLE organization_registry (
        id TEXT, tenant_id TEXT, display_name TEXT, logo_url TEXT, website TEXT, contact_phone TEXT,
        contact_email TEXT, address TEXT, updated_at TEXT
      );
      CREATE TABLE organizations (id TEXT, tenant_id TEXT, name TEXT);
    `)
    db.prepare(`INSERT INTO organizations VALUES ('o1', 'org-1', 'Sunrise Builders'), ('o2', 'org-2', 'Plain Co')`).run()
    restore = jest.spyOn(DatabaseManager, 'getDatabase').mockReturnValue(db as any)
    orgBrandService.save('org-1', {
      displayName: 'Sunrise Builders (Pvt) Ltd',
      address: '12 Main St, Harare',
      vatNumber: '10012345',
      taxNumber: '200123456',
      vatRate: 15,
    })
  })

  afterEach(() => {
    restore.mockRestore()
    db.close()
  })

  test('the brand keeps a VAT rate and whether prices include it', () => {
    expect(sanitizeBrandInput({ vatRate: '15%', pricesIncludeVat: 'false' } as any)).toEqual({
      vatRate: 15,
      pricesIncludeVat: false,
    })
    expect(sanitizeBrandInput({ vatRate: 0 } as any)).toEqual({})
    expect(sanitizeBrandInput({ vatRate: 150 } as any)).toEqual({})
    expect(vatBreakdown(115, { rate: 15, included: true })).toMatchObject({ subtotal: 100, taxAmount: 15, total: 115 })
    expect(vatBreakdown(100, { rate: 15, included: false })).toMatchObject({ subtotal: 100, taxAmount: 15, total: 115 })
  })

  test('an invoice names its issuer and reads the VAT out of the amount charged', () => {
    const claims = documentClaims('InvoiceVC', { invoiceId: 'INV-1', amount: 115, currency: 'USD' }, 'org-1')
    expect(claims).toMatchObject({
      invoiceId: 'INV-1',
      amount: 115,
      issuerTenantId: 'org-1',
      issuerName: 'Sunrise Builders (Pvt) Ltd',
      issuerAddress: '12 Main St, Harare',
      issuerVatNumber: '10012345',
      issuerTaxNumber: '200123456',
      orgName: 'Sunrise Builders (Pvt) Ltd',
      taxRate: 15,
      taxAmount: 15,
      taxIncluded: true,
      subtotal: 100,
    })
    expect(typeof claims.brandVersion).toBe('number')
  })

  test('school fees, evidence receipts and other records never get VAT', () => {
    const fee = documentClaims('SchoolFeeReceiptVC', { receiptId: 'R1', amount: 150 }, 'org-1')
    expect(fee.issuerName).toBe('Sunrise Builders (Pvt) Ltd')
    expect(fee.taxAmount).toBeUndefined()
    expect(documentClaims('InvoiceVC', { amount: 150 }, 'org-1', { exempt: true }).taxAmount).toBeUndefined()
    expect(documentClaims('ReceiptVC', { receiptId: 'M1', evidenceHash: 'abc', amount: 40 }, 'org-1').taxAmount).toBeUndefined()
    const other = { leaveType: 'Annual' }
    expect(documentClaims('LeaveApprovalVC', other, 'org-1')).toBe(other)
  })

  test('an organisation without VAT gets its details but no VAT line', () => {
    const claims = documentClaims('ReceiptVC', { receiptId: 'R1', amount: 20, paymentRef: 'P1' }, 'org-2')
    expect(claims.issuerName).toBe('Plain Co')
    expect(claims.taxAmount).toBeUndefined()
    expect(claims.issuerVatNumber).toBeUndefined()
  })

  test('the claims the issuer set and the VAT worked out at pricing win', () => {
    const claims = documentClaims('InvoiceVC', { amount: 230, issuerName: 'Given name' }, 'org-1', {
      tax: { rate: 15, amount: 30, included: false, subtotal: 200 },
    })
    expect(claims).toMatchObject({ issuerName: 'Given name', taxAmount: 30, taxIncluded: false, subtotal: 200 })
  })

  test('a pay link gives its lines, payer and VAT to the quote, invoice, receipt and pay page alike', () => {
    const link = {
      merchant_id: 'org-1',
      sector: 'general',
      metadata: JSON.stringify({
        payerName: 'Tariro',
        items: [{ description: 'Tiles', qty: 2, unitPrice: 50 }],
        tax: { rate: 15, amount: 15, included: false, subtotal: 100 },
      }),
    }
    const invoice = billDocumentClaims('InvoiceVC', link, { invoiceId: 'INV-9', amount: 115 })
    expect(invoice).toMatchObject({
      payerName: 'Tariro',
      lineItems: [{ description: 'Tiles', qty: 2, unitPrice: 50, lineTotal: 100 }],
      taxAmount: 15,
      taxIncluded: false,
      subtotal: 100,
      issuerVatNumber: '10012345',
    })
    const fee = billDocumentClaims('InvoiceVC', { merchant_id: 'org-1', sector: 'education', metadata: '{}' }, { amount: 300 })
    expect(fee.taxAmount).toBeUndefined()
  })

  test('the price step uses the organisation VAT, added on top or read out of the price', async () => {
    const run = async (input: any, workflowType = 'tpl-payment-collection', config: any = { taxRate: 0, taxInclusive: true }) => {
      const context: any = { input, state: {}, tenantId: 'org-1', workflowType }
      await FinanceActions.calculateInvoice(context, config)
      return context.state.finance
    }
    expect(await run({ amount: 115 })).toMatchObject({ taxRate: 15, taxIncluded: true, grandTotal: 115 })
    expect((await run({ amount: 115 })).taxAmount).toBeCloseTo(15, 5)

    orgBrandService.save('org-1', { displayName: 'Sunrise Builders (Pvt) Ltd', vatRate: 15, pricesIncludeVat: false })
    const added = await run({ items: [{ description: 'Tiles', qty: 2, unitPrice: 50 }] })
    expect(added).toMatchObject({ subtotal: 100, taxAmount: 15, grandTotal: 115, taxIncluded: false })
    expect(taxFromFinance(added)).toEqual({ rate: 15, amount: 15, included: false, subtotal: 100 })
    expect(financeClaims(added, {})).toMatchObject({ taxAmount: 15, subtotal: 100, lineItems: [{ description: 'Tiles', lineTotal: 100 }] })

    const fee = await run({ amount: 300 }, 'education_fee_payment', { taxRate: 0, taxInclusive: true, taxExempt: true })
    expect(fee.taxAmount).toBe(0)
    const requested = await run({ items: [{ description: 'Chairs', qty: 1, unitPrice: 200 }], taxRate: 10 }, 'quote_invoice_receipt', {
      taxRate: 0,
      taxInclusive: false,
    })
    expect(requested).toMatchObject({ taxRate: 10, taxAmount: 20, grandTotal: 220 })
  })
})
