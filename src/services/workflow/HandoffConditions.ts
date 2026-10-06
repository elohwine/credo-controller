/**
 * When a follow-on procedure is actually needed, decided from the request itself.
 *
 * Organizations never write these. Each hand-off in the catalog names one condition; the
 * platform reads facts the request already carries (supplier, items, payment method,
 * category, amount, customer) and starts the next procedure only when it applies. A cash
 * requisition pays out through its own release step, so it never opens procurement.
 */

export type HandoffConditionId = 'always' | 'needs_supplier_purchase' | 'has_customer' | 'has_customer_charge'

export interface HandoffFacts {
  amount?: number
  supplier?: string
  paymentMethod?: string
  category?: string
  items: Array<{ description?: string; itemType?: string; supplier?: string }>
  customer?: string
}

const NO_SUPPLIER = new Set(['', 'tbd', 'none', 'n/a', 'na', 'unassigned', 'unknown', '-', 'null'])
// An explicit "buy from a supplier" choice on the request (portal/phone "How will this be paid?").
const SUPPLIER_METHODS = new Set(['supplier', 'purchase_order', 'po', 'vendor', 'supplier_invoice'])
const CASH_METHODS = new Set([
  'cash',
  'petty_cash',
  'petty cash',
  'cash_advance',
  'mobile_money',
  'ecocash',
  'innbucks',
  'bank_transfer_to_staff',
  'reimbursement',
])
const CASH_CATEGORIES = new Set([
  'cash',
  'petty_cash',
  'cash_advance',
  'allowance',
  'per_diem',
  'travel',
  'transport',
  'reimbursement',
  'fuel_allowance',
  'advance',
])
const GOODS_ITEM_TYPES = new Set([
  'goods',
  'product',
  'material',
  'materials',
  'inventory',
  'asset',
  'equipment',
  'stock',
  'part',
  'parts',
])

function clean(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
}

function hasSupplier(value: unknown): boolean {
  return !NO_SUPPLIER.has(clean(value))
}

export const HANDOFF_CONDITIONS: Record<HandoffConditionId, { label: string; test: (facts: HandoffFacts) => boolean }> =
  {
    always: {
      label: 'Every time',
      test: () => true,
    },
    needs_supplier_purchase: {
      label: 'Only when something is bought from a supplier. Cash requests are paid on release and skip this.',
      test: (facts) => {
        if (CASH_METHODS.has(clean(facts.paymentMethod))) return false
        if (SUPPLIER_METHODS.has(clean(facts.paymentMethod))) return true
        if (CASH_CATEGORIES.has(clean(facts.category))) return false
        if (hasSupplier(facts.supplier)) return true
        return facts.items.some((item) => hasSupplier(item.supplier) || GOODS_ITEM_TYPES.has(clean(item.itemType)))
      },
    },
    has_customer: {
      label: 'Only when the job has a client to send it to',
      test: (facts) => Boolean(clean(facts.customer)),
    },
    has_customer_charge: {
      label: 'Only when there is an amount to collect from a customer',
      test: (facts) => typeof facts.amount === 'number' && facts.amount > 0 && Boolean(clean(facts.customer)),
    },
  }

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

function toNumber(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : undefined
}

/** Read the facts out of whatever shape a request, workflow request or job carries. */
export function collectHandoffFacts(source: {
  amount?: unknown
  context?: Record<string, unknown>
  items?: unknown[]
}): HandoffFacts {
  const context = source.context || {}
  const rawItems = Array.isArray(source.items)
    ? source.items
    : Array.isArray(context.items)
      ? (context.items as unknown[])
      : []
  return {
    amount: toNumber(source.amount ?? context.amount ?? context.totalAmount),
    supplier: firstString(context.supplierRef, context.supplier, context.vendor, context.vendorName),
    paymentMethod: firstString(context.paymentMethod, context.payoutMethod, context.disbursementMethod),
    category: firstString(context.categoryCode, context.category, context.requisitionType),
    customer: firstString(
      context.customerMsisdn,
      context.payerPhone,
      context.buyerPhone,
      context.clientName,
      context.payerName,
      context.buyerDid,
    ),
    items: rawItems
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item) => ({
        description: firstString(item.description, item.name),
        itemType: firstString(item.itemType, item.type, item.kind),
        supplier: firstString(item.supplier, item.vendor, item.supplierRef),
      })),
  }
}

export function handoffConditionMet(id: HandoffConditionId | undefined, facts: HandoffFacts): boolean {
  return (HANDOFF_CONDITIONS[id || 'always'] || HANDOFF_CONDITIONS.always).test(facts)
}

export function handoffConditionLabel(id: HandoffConditionId | undefined): string {
  return (HANDOFF_CONDITIONS[id || 'always'] || HANDOFF_CONDITIONS.always).label
}
