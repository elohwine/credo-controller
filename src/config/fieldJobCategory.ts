/**
 * Where a field job stands, from its run status and state. One answer for the job board,
 * the store file, the attendant file and the schedule check.
 */
import { openFailedVisit } from './failedVisit'

export type FieldJobCategory =
  | 'pending'
  | 'assigned'
  | 'active'
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

export const OPEN_FIELD_JOB_CATEGORIES: ReadonlySet<FieldJobCategory> = new Set(['pending', 'assigned', 'active', 'on_hold'])

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
  if (stage === 'ASSIGNED') return 'assigned'
  if (
    ['running', 'paused'].includes(status) ||
    ['IN_PROGRESS', 'EVIDENCE_CAPTURED', 'ACKNOWLEDGED', 'PAYMENT_TRIGGERED', 'RECEIPT_ISSUED'].includes(stage)
  ) {
    return 'active'
  }
  return 'pending'
}
