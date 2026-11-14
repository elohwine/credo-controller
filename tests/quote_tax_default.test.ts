import { FinanceActions } from '../src/services/workflow/actions/FinanceActions'
import { CashCounterTemplate, QuoteInvoiceReceiptTemplate } from '../src/services/workflow/templates'

// Tax comes from each organisation's own registered values, never a platform default.
async function totalsFor(template: { steps: Array<{ action: string; config?: any }> }, input: any) {
  const step = template.steps.find((entry) => entry.action === 'finance.calculate_invoice')!
  const context: any = { input, state: {} }
  await FinanceActions.calculateInvoice(context, step.config)
  return context.state.finance
}

describe('quote and counter sale totals', () => {
  test('a priced quote adds no tax by default', async () => {
    const finance = await totalsFor(QuoteInvoiceReceiptTemplate, {
      items: [{ description: '10 chairs', qty: 1, unitPrice: 250 }],
    })
    expect(finance.taxAmount).toBe(0)
    expect(finance.grandTotal).toBe(250)
  })

  test('a tax rate given with the request still applies', async () => {
    const finance = await totalsFor(QuoteInvoiceReceiptTemplate, {
      items: [{ description: '10 chairs', qty: 1, unitPrice: 200 }],
      taxRate: 15,
    })
    expect(finance.taxAmount).toBe(30)
    expect(finance.grandTotal).toBe(230)
  })

  test('a counter sale shows no tax by default', async () => {
    const finance = await totalsFor(CashCounterTemplate, {
      items: [{ description: 'Bread', qty: 2, unitPrice: 1.5 }],
    })
    expect(finance.taxAmount).toBe(0)
    expect(finance.grandTotal).toBe(3)
  })
})
