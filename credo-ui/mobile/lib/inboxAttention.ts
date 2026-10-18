/**
 * Inbox attention. The same words on the phone and the website.
 *
 * New: arrived, not opened yet.
 * Opened: looked at, still waiting for the person.
 * Done: finished, declined, or filed away.
 *
 * A card to accept stays New or Opened until it is accepted. Opening it is not the same as keeping it.
 */

export type InboxAttention = 'new' | 'opened' | 'done'
export type InboxAttentionFilter = 'all' | InboxAttention

export const INBOX_ATTENTION_FILTERS: Array<{ value: InboxAttentionFilter; label: string }> = [
  { value: 'new', label: 'New' },
  { value: 'opened', label: 'Opened' },
  { value: 'done', label: 'Done' },
  { value: 'all', label: 'Everything' },
]

const DONE_STATUSES = new Set([
  'approved',
  'rejected',
  'completed',
  'cancelled',
  'canceled',
  'fulfilled',
  'settled',
  'revoked',
])

/**
 * `stillOpen`: an approved purchase, purchase order or payment still has to be marked bought,
 * delivered or paid, so it is not done yet.
 */
export function inboxAttention(input: {
  status?: string
  isRead?: boolean
  archived?: boolean
  stillOpen?: boolean
}): InboxAttention {
  if (input.archived) return 'done'
  const status = String(input.status || '')
    .trim()
    .toLowerCase()
  if (DONE_STATUSES.has(status) && !input.stillOpen) return 'done'
  if (input.isRead) return 'opened'
  return 'new'
}

export function matchesInboxAttention(attention: InboxAttention, filter: InboxAttentionFilter): boolean {
  return filter === 'all' || attention === filter
}

export const INBOX_FLOW_SECTION_ORDER = [
  'jobs',
  'requisitions',
  'people',
  'school_fees',
  'payments',
  'supplier_bills',
  'counter_sales',
  'receipts',
  'cards',
  'updates',
] as const

export type InboxFlowSectionKey = (typeof INBOX_FLOW_SECTION_ORDER)[number]

export const INBOX_FLOW_SECTION_LABELS: Record<InboxFlowSectionKey, string> = {
  jobs: 'Jobs',
  requisitions: 'Purchase requests',
  people: 'Staff requests',
  school_fees: 'School fees',
  payments: 'Payments',
  supplier_bills: 'Supplier bills',
  counter_sales: 'Counter sales',
  receipts: 'Receipts',
  cards: 'Cards',
  updates: 'Updates',
}

/** First matching kind of work. Cards to accept that are not a payment or a receipt land under Cards. */
export function inboxFlowSection(tabs: string[], itemType?: string): InboxFlowSectionKey {
  for (const key of INBOX_FLOW_SECTION_ORDER) {
    if (key === 'cards' || key === 'updates') continue
    if (tabs.includes(key)) return key
  }
  if (itemType === 'credential_offer' || itemType === 'receipt_offer') return 'cards'
  return 'updates'
}

export function groupByFlowSection<T>(
  items: T[],
  sectionOf: (item: T) => InboxFlowSectionKey,
): Array<{ key: InboxFlowSectionKey; label: string; items: T[] }> {
  const buckets = new Map<InboxFlowSectionKey, T[]>()
  for (const item of items) {
    const key = sectionOf(item)
    const list = buckets.get(key) || []
    list.push(item)
    buckets.set(key, list)
  }
  return INBOX_FLOW_SECTION_ORDER.filter((key) => (buckets.get(key) || []).length > 0).map((key) => ({
    key,
    label: INBOX_FLOW_SECTION_LABELS[key],
    items: buckets.get(key)!,
  }))
}

const TXN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * When a transaction happened, for example "11 Oct 2026 15:08".
 * A day with no clock time (a due date, a scheduled day) stays a date.
 */
export function formatTxnTime(value?: string | number | Date | null): string {
  if (value == null || value === '') return ''
  const raw = value instanceof Date ? value.toISOString() : String(value).trim()
  if (!raw) return ''
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw)
  const normalized = /^\d{4}-\d{2}-\d{2} \d/.test(raw) ? raw.replace(' ', 'T') : raw
  const parsed = new Date(dateOnly ? `${raw}T12:00:00` : normalized)
  if (Number.isNaN(parsed.getTime())) return ''
  const date = `${parsed.getDate()} ${TXN_MONTHS[parsed.getMonth()]} ${parsed.getFullYear()}`
  if (dateOnly) return date
  const hours = String(parsed.getHours()).padStart(2, '0')
  const minutes = String(parsed.getMinutes()).padStart(2, '0')
  return `${date} ${hours}:${minutes}`
}

/** Date and time on an inbox row. Same words as every other transaction list. */
export function inboxWhenLabel(iso?: string, _now = Date.now()): string {
  return formatTxnTime(iso)
}
