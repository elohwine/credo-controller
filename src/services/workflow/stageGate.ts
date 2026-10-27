import { isStageAction } from '../../config/requestExperience'

/**
 * Where a run waits for a person.
 *
 * Field jobs keep their own pause reasons (`await_acknowledgement`, `await_payout_release` and
 * the checkpoints), so nothing about a job changes. Every other step — a purchase approval, a
 * supplier payment, a collection, and any step a template declares for itself — waits as
 * `await_stage:<step>`. One convention means the inbox card, the staff-card check and the resume
 * rules are written once and a workflow onboarded later inherits them.
 */
export const STAGE_GATE_PREFIX = 'await_stage:'

export interface StageGateState {
  stageAction: string
  /** The workflow the step belongs to, so "Who does what" is read for the right one. */
  workflowType: string
  /** False only when the template says the step is a plain confirmation. */
  requireProof: boolean
  reference?: string
  waitingSince?: string
}

function normalize(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
}

export function stageGateReason(stageAction: string): string {
  return `${STAGE_GATE_PREFIX}${normalize(stageAction)}`
}

/** The step a run waits at, or `''` when it is not waiting at a stage gate. */
export function stageGateStageOf(pauseReason: unknown): string {
  const reason = normalize(pauseReason)
  if (!reason.startsWith(STAGE_GATE_PREFIX)) return ''
  const stage = reason.slice(STAGE_GATE_PREFIX.length)
  return isStageAction(stage) ? stage : ''
}

/** What the run recorded when it stopped at the step; `undefined` when it is not at a gate. */
export function stageGateOf(state: Record<string, unknown> | undefined): StageGateState | undefined {
  const stageAction = stageGateStageOf(state?.pauseReason)
  if (!stageAction) return undefined
  const recorded = (state?.stageGate && typeof state.stageGate === 'object' ? state.stageGate : {}) as Partial<
    Record<keyof StageGateState, unknown>
  >
  return {
    stageAction,
    workflowType: normalize(recorded.workflowType) || 'general',
    requireProof: recorded.requireProof !== false,
    reference: recorded.reference ? String(recorded.reference) : undefined,
    waitingSince: recorded.waitingSince ? String(recorded.waitingSince) : undefined,
  }
}
