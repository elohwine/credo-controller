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
  /** A request decision step: it is decided on the request, which then moves the run on. */
  requestId?: string
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
    requestId: recorded.requestId ? String(recorded.requestId) : undefined,
  }
}

/**
 * When a step applies. A template can add a step only for bigger amounts, for example a second
 * approval from finance at 500 and above. No condition: the step always applies.
 */
export interface StageCondition {
  amountAtLeast?: number
  amountAbove?: number
  amountBelow?: number
}

export function stageApplies(when: unknown, facts: { amount?: number | null }): boolean {
  if (!when || typeof when !== 'object') return true
  const condition = when as StageCondition
  const amount = typeof facts.amount === 'number' && Number.isFinite(facts.amount) ? facts.amount : undefined
  const bound = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined)
  const atLeast = bound(condition.amountAtLeast)
  const above = bound(condition.amountAbove)
  const below = bound(condition.amountBelow)
  if (atLeast === undefined && above === undefined && below === undefined) return true
  if (amount === undefined) return false
  if (atLeast !== undefined && amount < atLeast) return false
  if (above !== undefined && amount <= above) return false
  if (below !== undefined && amount >= below) return false
  return true
}
