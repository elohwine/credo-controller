import { DatabaseManager } from '../persistence/DatabaseManager'

/** How long finished items stay under Done. One value per person and per inbox. */
export const INBOX_DONE_DAY_CHOICES = [7, 30, 90] as const
export const DEFAULT_INBOX_DONE_DAYS = 7
const MAX_INBOX_DONE_DAYS = 90

export type InboxScope = 'personal' | string

export interface InboxPreferences {
  scope: InboxScope
  doneDays: number
  choices: number[]
}

/** A day count asked for in a request: whole days, 1..90. Anything else falls back. */
export function clampDoneDays(value: unknown, fallback = DEFAULT_INBOX_DONE_DAYS): number {
  const parsed = Math.floor(Number(value))
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  return Math.min(parsed, MAX_INBOX_DONE_DAYS)
}

/** How a finished inbox item ended. */
export type FinishedOutcome = 'accepted' | 'approved' | 'rejected' | 'done' | 'dismissed' | 'expired' | 'seen'

const TASK_SOURCE_SET = new Set<string>([
  'workflow_assignment',
  'workflow_request_assignment',
  'ap_workflow_assignment',
  'requisition_stage_action',
  'workflow_stage_action',
])

export function finishedOutcome(input: {
  sourceType?: string | null
  lastError?: string | null
  acceptedAt?: string | null
  requestStatus?: string | null
}): FinishedOutcome {
  const reason = String(input.lastError || '').toLowerCase()
  const sourceType = String(input.sourceType || '')
  if (sourceType === 'workflow_update') return 'seen'
  if (reason === 'dismissed_by_user') return 'dismissed'
  if (reason.startsWith('expired')) return 'expired'
  const requestStatus = String(input.requestStatus || '').toLowerCase()
  if (requestStatus === 'approved' || requestStatus === 'rejected') return requestStatus
  if (TASK_SOURCE_SET.has(sourceType)) return 'done'
  return input.acceptedAt ? 'accepted' : 'done'
}


/** Which items this person opened in one inbox, and when they last looked at it. */
export interface InboxReadState {
  scope: InboxScope
  lastSeenAt?: string
  readKeys: string[]
}

export interface InboxReadUpdate {
  readKeys?: unknown
  unreadKeys?: unknown
  lastSeenAt?: unknown
}

const MAX_READ_KEYS_PER_UPDATE = 500
const MAX_READ_KEY_LENGTH = 512
const MAX_READ_KEYS_RETURNED = 3000
const READ_MARK_KEEP_DAYS = 180
// A device clock a little ahead is fine; a "last seen" far in the future would hide new items.
const LAST_SEEN_CLOCK_SLACK_MS = 5 * 60 * 1000

function cleanKeys(value: unknown): string[] {
  if (value == null) return []
  if (!Array.isArray(value)) throw new Error('readKeys and unreadKeys must be lists')
  if (value.length > MAX_READ_KEYS_PER_UPDATE) throw new Error(`At most ${MAX_READ_KEYS_PER_UPDATE} items at a time`)
  const keys = new Set<string>()
  for (const raw of value) {
    const key = typeof raw === 'string' ? raw.trim() : ''
    if (!key || key.length > MAX_READ_KEY_LENGTH) throw new Error('Each item key must be a non-empty string')
    keys.add(key)
  }
  return [...keys]
}

function cleanLastSeen(value: unknown, now: Date): string | undefined {
  if (value == null || value === '') return undefined
  const time = Date.parse(String(value))
  if (!Number.isFinite(time)) throw new Error('lastSeenAt must be a date and time')
  return new Date(Math.min(time, now.getTime() + LAST_SEEN_CLOCK_SLACK_MS)).toISOString()
}

export class InboxPreferenceService {
  public get(ownerTenantId: string, scope: InboxScope = 'personal'): InboxPreferences {
    const row = DatabaseManager.getDatabase()
      .prepare('SELECT done_days FROM inbox_preferences WHERE owner_tenant_id = ? AND inbox_scope = ?')
      .get(ownerTenantId, scope || 'personal') as { done_days?: number } | undefined
    return {
      scope: scope || 'personal',
      doneDays: clampDoneDays(row?.done_days),
      choices: [...INBOX_DONE_DAY_CHOICES],
    }
  }

  public set(ownerTenantId: string, scope: InboxScope, doneDays: number): InboxPreferences {
    if (!(INBOX_DONE_DAY_CHOICES as readonly number[]).includes(doneDays)) {
      throw new Error(`doneDays must be one of ${INBOX_DONE_DAY_CHOICES.join(', ')}`)
    }
    DatabaseManager.getDatabase()
      .prepare(
        `INSERT INTO inbox_preferences (owner_tenant_id, inbox_scope, done_days, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(owner_tenant_id, inbox_scope) DO UPDATE SET done_days = excluded.done_days, updated_at = excluded.updated_at`,
      )
      .run(ownerTenantId, scope || 'personal', doneDays, new Date().toISOString())
    return this.get(ownerTenantId, scope)
  }

  public getReadState(ownerTenantId: string, scope: InboxScope = 'personal'): InboxReadState {
    const db = DatabaseManager.getDatabase()
    const inboxScope = scope || 'personal'
    const seen = db
      .prepare('SELECT last_seen_at FROM inbox_seen WHERE owner_tenant_id = ? AND inbox_scope = ?')
      .get(ownerTenantId, inboxScope) as { last_seen_at?: string } | undefined
    const rows = db
      .prepare(
        `SELECT item_key FROM inbox_read_marks WHERE owner_tenant_id = ? AND inbox_scope = ?
         ORDER BY read_at DESC LIMIT ?`,
      )
      .all(ownerTenantId, inboxScope, MAX_READ_KEYS_RETURNED) as Array<{ item_key: string }>
    return { scope: inboxScope, lastSeenAt: seen?.last_seen_at || undefined, readKeys: rows.map((row) => row.item_key) }
  }

  /** Marks items read or unread and moves "last seen" forward (never back). */
  public updateReadState(
    ownerTenantId: string,
    scope: InboxScope,
    update: InboxReadUpdate,
    now = new Date(),
  ): InboxReadState {
    const inboxScope = scope || 'personal'
    const readKeys = cleanKeys(update?.readKeys)
    const unreadKeys = cleanKeys(update?.unreadKeys)
    const lastSeenAt = cleanLastSeen(update?.lastSeenAt, now)
    const db = DatabaseManager.getDatabase()
    const at = now.toISOString()
    const markRead = db.prepare(
      `INSERT INTO inbox_read_marks (owner_tenant_id, inbox_scope, item_key, read_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(owner_tenant_id, inbox_scope, item_key) DO UPDATE SET read_at = excluded.read_at`,
    )
    const markUnread = db.prepare(
      'DELETE FROM inbox_read_marks WHERE owner_tenant_id = ? AND inbox_scope = ? AND item_key = ?',
    )
    db.transaction(() => {
      for (const key of readKeys) markRead.run(ownerTenantId, inboxScope, key, at)
      for (const key of unreadKeys) markUnread.run(ownerTenantId, inboxScope, key)
      if (lastSeenAt) {
        db.prepare(
          `INSERT INTO inbox_seen (owner_tenant_id, inbox_scope, last_seen_at) VALUES (?, ?, ?)
           ON CONFLICT(owner_tenant_id, inbox_scope) DO UPDATE SET last_seen_at =
             CASE WHEN excluded.last_seen_at > inbox_seen.last_seen_at THEN excluded.last_seen_at ELSE inbox_seen.last_seen_at END`,
        ).run(ownerTenantId, inboxScope, lastSeenAt)
      }
      const cutoff = new Date(now.getTime() - READ_MARK_KEEP_DAYS * 24 * 60 * 60 * 1000).toISOString()
      db.prepare('DELETE FROM inbox_read_marks WHERE owner_tenant_id = ? AND inbox_scope = ? AND read_at < ?').run(
        ownerTenantId,
        inboxScope,
        cutoff,
      )
    })()
    return this.getReadState(ownerTenantId, inboxScope)
  }
}

export const inboxPreferenceService = new InboxPreferenceService()
