/** Why someone cannot decide a request that is waiting for a decision (from the request's `decision`). */
export type RequestDecisionBlock = 'own_request' | 'own_request_no_other_approver' | 'not_stage_actor' | 'no_authority'

export interface RequestDecisionView {
  actorLabel?: string
  canAct?: boolean
  canApprove?: boolean
  canReject?: boolean
  blockedReason?: RequestDecisionBlock
}

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
    case 'not_stage_actor':
      return `This request is waiting for ${actor} to decide it.`
    default:
      return decision?.canAct === false && decision?.actorLabel
        ? `This request is waiting for ${actor} to decide it.`
        : 'This request is no longer waiting for you.'
  }
}
