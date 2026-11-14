/** Why someone cannot decide a request that is waiting for a decision (from the request's `decision`). */
export type RequestDecisionBlock = 'own_request' | 'own_request_no_other_approver' | 'not_stage_actor' | 'no_authority' | 'approved_earlier_step'

export interface RequestDecisionView {
  actorLabel?: string
  canAct?: boolean
  canApprove?: boolean
  canReject?: boolean
  blockedReason?: RequestDecisionBlock
  /** This request type's approval can be done with the approver's staff card (purchases, payments). */
  staffCard?: boolean
  /** Only the staff card can approve (org setting, or the amount is over the org's limit). */
  cardRequired?: boolean
  /** "Step 2 of 3: Finance approval" when the org's flow has more than one approval step. */
  stageLabel?: string
  stageNumber?: number
  stageCount?: number
}

/** Runs started to trace a request's approval steps are not jobs; keep them out of job lists and counts. */
export function isRequestFlowRun(run: any): boolean {
  const input = run?.output?.workflowInput || run?.input || {}
  if (input?.requestFlow === true) return true
  const ids = [run?.workflowId, run?.workflow_id, run?.templateId, run?.template_id].map((v) => String(v || ''))
  return ids.some((id) => id.startsWith('tpl-request-'))
}

/** Same words on the portal and the phone for the staff-card approval button. */
export const STAFF_CARD_APPROVE_LABEL = 'Approve with staff card'

/** One plain sentence explaining who decides, for a person who cannot decide this request. */
export function requestDecisionBlockText(decision: RequestDecisionView | undefined): string {
  const actor = String(decision?.actorLabel || '').trim() || 'the person chosen for this step'
  switch (decision?.blockedReason) {
    case 'own_request':
      return 'You raised this request, so someone else decides it. The other people chosen for this step have it in their inbox.'
    case 'own_request_no_other_approver':
      return 'You raised this request, so someone else has to decide it, and nobody else is chosen for this step. Add another person under Settings → Organisation → Who does what.'
    case 'no_authority':
      return 'You are chosen for this step, but your approval access has ended or does not cover this request. Ask an owner or admin to renew it under Settings → Organisation → Who does what.'
    case 'approved_earlier_step':
      return 'You approved an earlier step of this request, so someone else decides this one.'
    case 'not_stage_actor':
      return `This request is waiting for ${actor} to decide it.`
    default:
      return decision?.canAct === false && decision?.actorLabel
        ? `This request is waiting for ${actor} to decide it.`
        : 'This request is no longer waiting for you.'
  }
}
