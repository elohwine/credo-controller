/**
 * Inbox attention. The same words on the phone and the website.
 *
 * New: arrived, not opened yet.
 * Opened: looked at, still waiting for the person.
 * Done: finished, declined, or filed away.
 * Any status: New, Opened and Done together. The kind tabs (All kinds, Jobs, …) are a different filter.
 *
 * A card to accept stays New or Opened until it is accepted. Opening it is not the same as keeping it.
 */

export type InboxAttention = 'new' | 'opened' | 'done'
export type InboxAttentionFilter = 'all' | InboxAttention

export const INBOX_ATTENTION_FILTERS: Array<{ value: InboxAttentionFilter; label: string }> = [
  { value: 'new', label: 'New' },
  { value: 'opened', label: 'Opened' },
  { value: 'done', label: 'Done' },
  { value: 'all', label: 'Any status' },
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

/**
 * A row from the wallet inbox list that still waits for the person. The list also carries
 * finished items (status `resolved`, kept for the Done window); those never count as waiting.
 */
export function isOpenInboxOffer(row: { status?: string; resolvedAt?: string | null } | null | undefined): boolean {
  if (!row) return false
  if (row.resolvedAt) return false
  const status = String(row.status || '')
    .trim()
    .toLowerCase()
  return status !== 'resolved' && status !== 'accepted' && !DONE_STATUSES.has(status)
}

/** The open rows of a wallet inbox list response (`{ offers }` or a bare array). */
export function openInboxOffers<T extends { status?: string; resolvedAt?: string | null }>(data: unknown): T[] {
  const rows = Array.isArray((data as any)?.offers) ? (data as any).offers : Array.isArray(data) ? data : []
  return (rows as T[]).filter((row) => isOpenInboxOffer(row))
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

/** Date headings for the inbox, newest first. */
export type InboxDayKey = 'today' | 'yesterday' | 'this_week' | 'older'

export const INBOX_DAY_LABELS: Record<InboxDayKey, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  this_week: 'Earlier this week',
  older: 'Older',
}

export function inboxDayKey(time: number, now: Date = new Date()): InboxDayKey {
  if (!Number.isFinite(time)) return 'older'
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const day = 24 * 60 * 60 * 1000
  if (time >= startOfToday) return 'today'
  if (time >= startOfToday - day) return 'yesterday'
  if (time >= startOfToday - 6 * day) return 'this_week'
  return 'older'
}

export type InboxFeedEntry<T> =
  | { kind: 'pinned-head'; key: string; label: string; shown: number; total: number }
  | { kind: 'day'; key: string; label: string }
  | { kind: 'seen-divider'; key: string; label: string }
  | { kind: 'item'; key: string; item: T; pinned: boolean }

export const INBOX_NEEDS_ACTION_LABEL = 'Needs your action'
export const INBOX_SEEN_DIVIDER_LABEL = 'Before your last visit'

/**
 * The inbox as one list, newest first, the way mail and chat apps show it.
 *
 * - Every item is placed by `timeOf` (its latest activity). A newer item is never
 *   placed under an older one, including one that still needs a step.
 * - When the newest items are the ones that need a step, up to `pinLimit` of them
 *   are headed "Needs your action" and not repeated below. An older step stays
 *   in its time place.
 * - Date headings (Today, Yesterday, ...) split the rest.
 * - With `lastSeenAt`, a line marks where the items from before the person's last visit start.
 */
export function buildInboxFeed<T>(
  items: T[],
  options: {
    keyOf: (item: T) => string
    timeOf: (item: T) => number
    needsAction?: (item: T) => boolean
    pinLimit?: number
    lastSeenAt?: string | number | null
    now?: Date
  },
): InboxFeedEntry<T>[] {
  const time = (item: T) => {
    const value = options.timeOf(item)
    return Number.isFinite(value) ? value : -Infinity
  }
  const ordered = items
    .map((item, index) => ({ item, index, at: time(item) }))
    .sort((a, b) => (b.at === a.at ? a.index - b.index : b.at - a.at))
  const entries: InboxFeedEntry<T>[] = []

  const pinLimit = Math.max(0, options.pinLimit ?? 3)
  const pinned = new Set<T>()
  if (options.needsAction && pinLimit > 0) {
    for (const entry of ordered) {
      if (pinned.size >= pinLimit || !options.needsAction(entry.item)) break
      pinned.add(entry.item)
    }
  }
  const waitingTotal = options.needsAction ? ordered.filter((entry) => options.needsAction!(entry.item)).length : 0
  if (pinned.size > 0) {
    entries.push({ kind: 'pinned-head', key: 'pinned', label: INBOX_NEEDS_ACTION_LABEL, shown: pinned.size, total: waitingTotal })
    for (const entry of ordered) {
      if (!pinned.has(entry.item)) break
      entries.push({ kind: 'item', key: options.keyOf(entry.item), item: entry.item, pinned: true })
    }
  }

  const seenAt = options.lastSeenAt == null || options.lastSeenAt === ''
    ? NaN
    : typeof options.lastSeenAt === 'number' ? options.lastSeenAt : Date.parse(options.lastSeenAt)
  let sawNewer = false
  let dividerPlaced = !Number.isFinite(seenAt)
  let currentDay: InboxDayKey | null = null
  for (const entry of ordered) {
    if (pinned.has(entry.item)) continue
    const isOlder = entry.at <= seenAt
    if (!dividerPlaced && isOlder && sawNewer) {
      entries.push({ kind: 'seen-divider', key: 'seen-divider', label: INBOX_SEEN_DIVIDER_LABEL })
      dividerPlaced = true
    }
    if (!isOlder) sawNewer = true
    const day = inboxDayKey(entry.at, options.now)
    if (day !== currentDay) {
      entries.push({ kind: 'day', key: `day-${day}`, label: INBOX_DAY_LABELS[day] })
      currentDay = day
    }
    entries.push({ kind: 'item', key: options.keyOf(entry.item), item: entry.item, pinned: false })
  }
  return entries
}
