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
}

export const inboxPreferenceService = new InboxPreferenceService()
