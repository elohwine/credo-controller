/**
 * Where a field job stands, from its run status and state. One answer for the job board,
 * the store file, the attendant file and the schedule check.
 */
import { failedVisitsOf, openFailedVisit } from './failedVisit'

export type FieldJobCategory =
  | 'pending'
  | 'assigned'
  | 'active'
  | 'arrived'
  | 'on_hold'
  | 'failed'
  | 'completed'
  | 'reconciled'
  | 'cancelled'

/** The words the Jobs board, the export and the reports use for each category. */
export const FIELD_JOB_CATEGORY_LABELS: Record<FieldJobCategory, string> = {
  pending: 'Pending / unassigned',
  assigned: 'Assigned',
  active: 'In progress',
  arrived: 'Arrived',
  on_hold: 'On hold',
  failed: 'Needs attention',
  completed: 'Completed',
  reconciled: 'Closed',
  cancelled: 'Cancelled',
}

export interface FieldJobRunLike {
  status?: string
  input?: any
  output?: any
}

export const OPEN_FIELD_JOB_CATEGORIES: ReadonlySet<FieldJobCategory> = new Set(['pending', 'assigned', 'active', 'arrived', 'on_hold'])

export function fieldJobInput(job: FieldJobRunLike): Record<string, any> {
  return job.output?.workflowInput || job.input || {}
}

export function fieldJobAssigneeId(job: FieldJobRunLike): string {
  const state = job.output || {}
  const input = fieldJobInput(job)
  return String(state.assignment?.assigneeId || state.assigneeId || input.assigneeId || '').trim()
}

function holdIsLive(status: unknown): boolean {
  return status === 'open' || status === 'resolved'
}

function hasCurrentArrival(state: Record<string, any>): boolean {
  const checkpoint = state.checkpoints?.arrival
  const before = [state.evidenceBefore, state.evidence?.before].filter((evidence) => evidence?.evidenceHash)
  const arrivalTimes = [
    checkpoint?.status === 'completed' ? checkpoint.completedAt : undefined,
    ...before.map((evidence) => evidence.capturedAt),
  ]
  const arrived = checkpoint?.status === 'completed' || before.length > 0
  const finished = Boolean(state.evidenceAfter?.evidenceHash || state.evidence?.after?.evidenceHash)
  if (!arrived || finished) return false

  const rebookings = failedVisitsOf(state).filter((visit) => visit.status === 'rebooked')
  if (!rebookings.length) return true
  const rebookedAt = rebookings.map((visit) => Date.parse(visit.rebookedAt || ''))
  if (rebookedAt.some((time) => !Number.isFinite(time))) return false
  const latestRebooking = Math.max(...rebookedAt)
  return arrivalTimes.some((time) => typeof time === 'string' && Date.parse(time) > latestRebooking)
}

export function fieldJobCategory(job: FieldJobRunLike): FieldJobCategory {
  const state = job.output || {}
  const status = String(job.status || '').toLowerCase()
  const stage = String(state.workflowStage || state.stage || '').toUpperCase()
  const pauseReason = String(state.pauseReason || '').toLowerCase()

  if (status === 'failed' || stage === 'DISPUTED') return 'failed'
  if (status === 'cancelled' || ['CANCELLED', 'REVOKED'].includes(stage)) return 'cancelled'
  if (stage === 'RECONCILED') return 'reconciled'
  if (status === 'completed' || stage === 'COMPLETED') return 'completed'
  if (openFailedVisit(state)) return 'failed'
  if (
    pauseReason.startsWith('await_handoff:') ||
    (Array.isArray(state.checkpointBlocks) &&
      state.checkpointBlocks.some((hold: any) => hold?.checkpoint === 'risk_assessment' && holdIsLive(hold?.status)))
  )
    return 'on_hold'
  if (!fieldJobAssigneeId(job)) return 'pending'
  if (['running', 'paused'].includes(status) && hasCurrentArrival(state)) return 'arrived'
  if (stage === 'ASSIGNED') return 'assigned'
  if (
    ['running', 'paused'].includes(status) ||
    ['IN_PROGRESS', 'EVIDENCE_CAPTURED', 'ACKNOWLEDGED', 'PAYMENT_TRIGGERED', 'RECEIPT_ISSUED'].includes(stage)
  ) {
    return 'active'
  }
  return 'pending'
}
