/**
 * Someone asked an organisation for a bill or a quote from its public page. It has no price
 * until the organisation sets one, so accepting it asks for the price first; the bill or quote
 * the customer gets is built from it (server: ORG_OFFERINGS `priceOnAccept`).
 */

const PRICED_OFFERINGS: Record<string, 'bill' | 'quote'> = {
  ask_quote: 'quote',
  pay_bill: 'bill',
  order_quote: 'quote',
}

export const PRICE_CURRENCIES = ['USD', 'ZWG', 'ZAR']

export interface AcceptPriceNeed {
  document: 'bill' | 'quote'
  title: string
  hint: string
  amount?: number
  currency: string
  note: string
}

export interface AcceptPriceInput {
  amount: number | string
  currency?: string
  note?: string
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** What to ask before accepting this request, or null when it needs no price. */
export function acceptPriceNeed(payload: Record<string, unknown> | null | undefined): AcceptPriceNeed | null {
  const details = payload || {}
  const document = PRICED_OFFERINGS[text(details.offeringKey)]
  if (!document) return null
  const amount = Number(details.totalAmount)
  return {
    document,
    title: document === 'quote' ? 'Price for the quote' : 'Amount on the bill',
    hint:
      document === 'quote'
        ? 'They get the quote with this price and can accept and pay it in the app.'
        : 'They get the bill with this amount and pay it in the app. The receipt goes to them.',
    amount: Number.isFinite(amount) && amount > 0 ? amount : undefined,
    currency: text(details.currency) || 'USD',
    note: text(details.priceNote) || text(details.description),
  }
}

/** The approve body's price, or an error to show when the amount is missing. */
export function acceptPriceBody(input: AcceptPriceInput): { price: { amount: number; currency: string; note?: string } } {
  const amount = Number(input.amount)
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter the price before you accept.')
  const note = text(input.note)
  return { price: { amount, currency: text(input.currency) || 'USD', ...(note ? { note } : {}) } }
}

/** "USD 42.50 · Water for March" for a request that has its price, else ''. */
export function acceptedPriceLine(payload: Record<string, unknown> | null | undefined): string {
  const details = payload || {}
  if (!PRICED_OFFERINGS[text(details.offeringKey)]) return ''
  const amount = Number(details.totalAmount)
  if (!Number.isFinite(amount) || amount <= 0) return ''
  const money = `${text(details.currency) || 'USD'} ${amount.toFixed(2)}`
  const note = text(details.priceNote)
  return note ? `${money} · ${note}` : money
}
