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
