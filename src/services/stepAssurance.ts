/**
 * How sure the organisation wants to be of who acted on a step.
 *
 * - `session`: the signed-in app is enough; the staff card is not offered.
 * - `card_optional`: plain approve works; the person may confirm with their staff card.
 * - `card_required`: only a fresh staff-card share (OID4VP, bound to the record) moves the step.
 *
 * Steps that release or pay money on a job always require the card, so job flows keep working
 * the way they do today. Purchase and payment approvals offer the card and can require it above
 * an amount the organisation picks.
 */
export type StepAssuranceMode = 'session' | 'card_optional' | 'card_required'

export interface StepAssurancePolicy {
  /** Above this amount (in the record's own currency) a card-optional step requires the card. Null: never. */
  cardRequiredAbove: number | null
  steps: Record<string, StepAssuranceMode>
}

export interface StepAssuranceStep {
  actionKey: string
  label: string
  mode: StepAssuranceMode
  /** Fixed by the platform; settings show it but cannot change it. */
  locked: boolean
}

/** The amount settings suggest when an organisation turns the limit on. */
export const SUGGESTED_CARD_REQUIRED_ABOVE = 100

const MODES: StepAssuranceMode[] = ['session', 'card_optional', 'card_required']

/** Steps an organisation can tune, with their default. */
const CONFIGURABLE: Record<string, { label: string; mode: StepAssuranceMode }> = {
  requisition_approval: {
    label: 'Approve a purchase, payment, expense claim or salary advance',
    mode: 'card_optional',
  },
}

/** Steps that always need the card (money leaves or a job is signed off). */
const LOCKED: Record<string, string> = {
  field_ack: 'Sign off a finished job',
  field_payout: 'Pay a worker for a job',
  requisition_release: 'Release funds for a purchase',
}

export function defaultStepAssurance(): StepAssurancePolicy {
  return { cardRequiredAbove: null, steps: {} }
}

export function parseStepAssurance(value: unknown): StepAssurancePolicy {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
  const limit = Number(raw.cardRequiredAbove)
  const steps: Record<string, StepAssuranceMode> = {}
  const rawSteps =
    raw.steps && typeof raw.steps === 'object' && !Array.isArray(raw.steps) ? (raw.steps as Record<string, unknown>) : {}
  for (const [key, mode] of Object.entries(rawSteps)) {
    if (CONFIGURABLE[key] && MODES.includes(mode as StepAssuranceMode)) steps[key] = mode as StepAssuranceMode
  }
  return {
    // Off until the organisation turns it on, so approvals that work today keep working.
    cardRequiredAbove:
      raw.cardRequiredAbove === null || raw.cardRequiredAbove === undefined || raw.cardRequiredAbove === ''
        ? null
        : Number.isFinite(limit) && limit >= 0
          ? limit
          : null,
    steps,
  }
}

/** Every step the setting covers, configurable ones first. */
export function stepAssuranceSteps(policy: StepAssurancePolicy): StepAssuranceStep[] {
  return [
    ...Object.entries(CONFIGURABLE).map(([actionKey, step]) => ({
      actionKey,
      label: step.label,
      mode: policy.steps[actionKey] || step.mode,
      locked: false,
    })),
    ...Object.entries(LOCKED).map(([actionKey, label]) => ({
      actionKey,
      label,
      mode: 'card_required' as const,
      locked: true,
    })),
  ]
}

/** What this step needs for this record. Unknown steps keep the plain sign-in. */
export function resolveStepAssurance(
  policy: StepAssurancePolicy,
  actionKey: string | undefined,
  amount?: number | null,
): { mode: StepAssuranceMode; reason?: 'locked' | 'over_limit' | 'setting' } {
  if (!actionKey) return { mode: 'session' }
  if (LOCKED[actionKey]) return { mode: 'card_required', reason: 'locked' }
  const configured = CONFIGURABLE[actionKey]
  if (!configured) return { mode: 'session' }
  const mode = policy.steps[actionKey] || configured.mode
  if (mode === 'card_optional' && policy.cardRequiredAbove !== null && typeof amount === 'number' && amount > policy.cardRequiredAbove) {
    return { mode: 'card_required', reason: 'over_limit' }
  }
  return { mode, reason: 'setting' }
}
