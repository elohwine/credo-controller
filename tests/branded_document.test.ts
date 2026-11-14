import { describe, expect, test } from '@jest/globals'

import {
  documentFromClaims,
  documentKindOf,
  renderDocumentHtml,
  renderDocumentPdf,
  type PdfDoc,
} from '../credo-ui/shared/brandedDocument'

const brand = {
  displayName: 'Sunrise <Builders>',
  primaryColor: '#123ABC',
  logoUrl: 'javascript:alert(1)',
  phone: '+263771234567',
  taxNumber: '200123456',
  bankDetails: 'CBZ 0123456789',
  mobileMoney: 'EcoCash merchant 12345',
  invoiceTerms: 'Pay within 14 days.',
  invoiceDueDays: 14,
  receiptFooter: 'Thank you for your business',
}

describe('branded documents', () => {
  test('tells payment documents apart from field evidence', () => {
    expect(documentKindOf(['VerifiableCredential', 'QuoteVC'])).toBe('quote')
    expect(documentKindOf(['VerifiableCredential', 'InvoiceVC'])).toBe('invoice')
    expect(documentKindOf(['VerifiableCredential', 'ReceiptVC'], { amount: '20', transactionId: 'T1' })).toBe('receipt')
    expect(documentKindOf(['VerifiableCredential', 'SchoolFeeReceiptVC'], { amount: 150, paymentRef: 'P1' })).toBe('receipt')
    expect(documentKindOf(['VerifiableCredential', 'ReceiptVC'], { supplier: 'Halsteds', receiptRef: 'R9', amount: 40 })).toBeUndefined()
    expect(documentKindOf(['VerifiableCredential', 'ExecutionAckVC'], { amount: 1 })).toBeUndefined()
  })

  test('reads invoices with line items, totals and a due date from the brand', () => {
    const doc = documentFromClaims({
      kind: 'invoice',
      issuedAt: '2025-01-01T00:00:00.000Z',
      brand,
      claims: {
        invoiceId: 'INV-7',
        currency: 'USD',
        payerName: 'Eloh',
        lineItems: [{ description: 'Cement', qty: 2, unitPrice: 10, lineTotal: 20 }],
        subtotal: 20,
        taxAmount: 3,
        grandTotal: 23,
      },
    })
    expect(doc).toMatchObject({
      number: 'INV-7',
      total: 23,
      tax: 3,
      billTo: { name: 'Eloh' },
      dueDate: '2025-01-15T00:00:00.000Z',
      status: 'overdue',
    })
    expect(doc.lines).toEqual([{ description: 'Cement', quantity: 2, unitPrice: 10, amount: 20 }])
  })

  test('shows the VAT, calls it a tax invoice only for a VAT-registered issuer, and uses the issuer details in the record', async () => {
    const { documentBrand, documentTitle, documentTotalRows, payPageDocument } = await import('../credo-ui/shared/brandedDocument')
    const included = documentFromClaims({
      kind: 'invoice',
      claims: {
        invoiceId: 'INV-8',
        amount: 115,
        currency: 'USD',
        taxRate: 15,
        taxAmount: 15,
        taxIncluded: true,
        subtotal: 100,
        issuerName: 'Sunrise Builders (Pvt) Ltd',
        issuerVatNumber: '10012345',
      },
    })
    expect(documentTotalRows(included)).toEqual([
      ['Amount before VAT', 100],
      ['VAT 15% (included)', 15],
    ])
    expect(included.lines).toEqual([{ description: 'Invoice', amount: 115 }])
    const merged = documentBrand(included, { displayName: 'Old name', primaryColor: '#111111' })
    expect(merged).toMatchObject({ displayName: 'Sunrise Builders (Pvt) Ltd', vatNumber: '10012345', primaryColor: '#111111' })
    const html = renderDocumentHtml(included, merged)
    expect(html).toContain('Tax invoice')
    expect(html).toContain('VAT 10012345')
    expect(html).toContain('VAT 15% (included)')

    const plain = documentFromClaims({ kind: 'invoice', claims: { amount: 50, currency: 'USD' } })
    expect(documentTitle(plain, { vatNumber: undefined })).toBe('Invoice')
    expect(documentTotalRows(plain)).toEqual([])

    const onTop = payPageDocument(
      { description: 'Job J-1', amount: 115, currency: 'USD', documentFacts: { taxAmount: 15, taxRate: 15, taxIncluded: false, subtotal: 100 } },
      'invoice',
    )
    expect(onTop.lines).toEqual([{ description: 'Job J-1', amount: 100 }])
    expect(documentTotalRows(onTop)).toEqual([
      ['Amount before VAT', 100],
      ['VAT 15%', 15],
    ])
  })

  test('a receipt without line items gets one line for what was paid', () => {
    const doc = documentFromClaims({
      kind: 'receipt',
      claims: { receiptId: 'R1', amount: '150', currency: 'USD', paymentRef: 'P1', feeType: 'Tuition', studentName: 'Tariro', term: 'Term 1', invoiceRef: 'INV-1' },
    })
    expect(doc.status).toBe('paid')
    expect(doc.lines).toEqual([{ description: 'Tuition · Tariro · Term 1', amount: 150 }])
    expect(doc.reference).toEqual({ label: 'For invoice', value: 'INV-1' })
  })

  test('escapes every value and refuses unsafe logo URLs', () => {
    const doc = documentFromClaims({
      kind: 'invoice',
      claims: { invoiceId: '<img src=x onerror=alert(1)>', amount: 5, currency: 'USD' },
    })
    const html = renderDocumentHtml(doc, brand)
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('javascript:')
    expect(html).toContain('Sunrise &lt;Builders&gt;')
    expect(html).toContain('#123ABC')
    expect(html).toContain('EcoCash merchant 12345')
    expect(html).toContain('Pay within 14 days.')
  })

  test('draws a PDF with the brand, the lines and the total', () => {
    const texts: string[] = []
    const fake: PdfDoc = {
      internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } },
      setFont: () => undefined,
      setFontSize: () => undefined,
      setTextColor: () => undefined,
      setDrawColor: () => undefined,
      setFillColor: () => undefined,
      setLineWidth: () => undefined,
      text: (value) => {
        texts.push(...(Array.isArray(value) ? value : [value]))
      },
      rect: () => undefined,
      line: () => undefined,
      splitTextToSize: (value) => [value],
      addImage: () => undefined,
      addPage: () => undefined,
      output: () => '',
    }
    const doc = documentFromClaims({ kind: 'receipt', claims: { amount: 20, currency: 'USD', transactionId: 'T1' } })
    renderDocumentPdf(fake, doc, brand)
    expect(texts).toEqual(expect.arrayContaining(['Sunrise <Builders>', 'RECEIPT', 'Total paid', 'Thank you for your business']))
    expect(texts.some((t) => t.includes('20.00'))).toBe(true)
  })
})

describe('brand setup', () => {
  test('leaves blank fields out of the save so they are cleared', async () => {
    const { brandSavePayload } = await import('../credo-ui/shared/brandForm')
    const payload = brandSavePayload({
      displayName: ' Acme ',
      primaryColor: '#123456',
      phone: '',
      quoteValidityDays: undefined,
      invoiceDueDays: 0,
    })
    expect(payload).toEqual({ displayName: 'Acme', primaryColor: '#123456', invoiceDueDays: 0 })
    expect(brandSavePayload({ displayName: 'Acme', vatRate: 15 })).toEqual({ displayName: 'Acme', vatRate: 15, pricesIncludeVat: true })
    expect(brandSavePayload({ displayName: 'Acme', vatRate: 15, pricesIncludeVat: false })).toMatchObject({ pricesIncludeVat: false })
  })

  test('the preview shows VAT the way the organisation charges it', async () => {
    const { sampleBrandDocument } = await import('../credo-ui/shared/brandForm')
    expect(sampleBrandDocument('invoice', { vatRate: 15, pricesIncludeVat: false })).toMatchObject({ subtotal: 50, tax: 7.5, total: 57.5 })
    expect(sampleBrandDocument('invoice', { vatRate: 15 })).toMatchObject({ tax: 6.52, total: 50, taxIncluded: true })
    expect(sampleBrandDocument('invoice').tax).toBeUndefined()
  })

  test('renders the sample invoice with the brand', async () => {
    const { sampleBrandDocument } = await import('../credo-ui/shared/brandForm')
    const { renderDocumentHtml } = await import('../credo-ui/shared/brandedDocument')
    const html = renderDocumentHtml(sampleBrandDocument('invoice'), { displayName: 'Acme <Ltd>', primaryColor: '#123456' })
    expect(html).toContain('Acme &lt;Ltd&gt;')
    expect(html).toContain('#123456')
  })

  test('lists the brand step until the brand is saved', async () => {
    const { setupChecklist } = await import('../credo-ui/shared/orgProfile')
    const open = setupChecklist({ profile: null, items: [], memberCount: 1 })
    expect(open.find((step) => step.id === 'brand')?.done).toBe(false)
    const done = setupChecklist({ profile: null, items: [], memberCount: 1, brandConfigured: true })
    expect(done.find((step) => step.id === 'brand')?.done).toBe(true)
  })
})
