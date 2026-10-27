/**
 * Words on the Finance list badges, identical on the website and the phone.
 * A row's flow badge says what kind of thing it is; its status badge says where it stands.
 */

export type FinanceFlow =
  | 'requisition'
  | 'purchase'
  | 'job'
  | 'school_fee'
  | 'customer_payment'
  | 'client_billing'
  | 'invoice'
  | 'checkout'
  | 'instalment'
  | 'recurring'
  | 'one_time'
  | 'supplier_bill'
  | 'supplier_payment'
  | 'supplier'

export const FINANCE_FLOW_WORDS: Record<FinanceFlow, { label: string; color: string }> = {
  requisition: { label: 'Requisition', color: 'indigo' },
  purchase: { label: 'Purchase', color: 'indigo' },
  job: { label: 'Job', color: 'teal' },
  school_fee: { label: 'School fee', color: 'teal' },
  customer_payment: { label: 'Customer payment', color: 'grape' },
  client_billing: { label: 'Bill to send', color: 'orange' },
  invoice: { label: 'Invoice', color: 'indigo' },
  checkout: { label: 'Checkout', color: 'cyan' },
  instalment: { label: 'Payment plan', color: 'orange' },
  recurring: { label: 'Repeat bill', color: 'pink' },
  one_time: { label: 'One payment', color: 'violet' },
  supplier_bill: { label: 'Supplier bill', color: 'orange' },
  supplier_payment: { label: 'Supplier payment', color: 'orange' },
  supplier: { label: 'Supplier', color: 'orange' },
}

const STATUS_WORDS: Record<string, string> = {
  active: 'Not paid yet',
  pending: 'Pending',
  draft: 'Draft',
  sent: 'Sent',
  paid: 'Paid',
  partially_paid: 'Part paid',
  partial: 'Part paid',
  overdue: 'Overdue',
  expired: 'Expired',
  cancelled: 'Cancelled',
  canceled: 'Cancelled',
  open: 'Open',
  outstanding: 'Owed',
  settled: 'Settled',
  disputed: 'Disputed',
  submitted: 'Submitted',
  in_review: 'In review',
  approved: 'Approved',
  rejected: 'Declined',
  completed: 'Done',
  failed: 'Needs attention',
}

/** A stored status ("partially_paid", "OUTSTANDING") as words a customer reads. */
export function financeStatusWord(status: unknown): string {
  const key = String(status || '')
    .trim()
    .toLowerCase()
  if (!key) return 'Pending'
  if (STATUS_WORDS[key]) return STATUS_WORDS[key]
  const words = key.replace(/[_-]+/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}
