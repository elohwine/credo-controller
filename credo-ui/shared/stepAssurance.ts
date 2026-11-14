/**
 * Which steps need a fresh staff-card share. Mirrors `src/services/stepAssurance.ts`; the server
 * decides and enforces, the apps only show and edit the organisation's choice.
 */
export type StepAssuranceMode = 'session' | 'card_optional' | 'card_required'

export interface StepAssuranceSetting {
  cardRequiredAbove: number | null
  steps: Record<string, StepAssuranceMode>
}

export interface StepAssuranceStepView {
  actionKey: string
  label: string
  mode: StepAssuranceMode
  locked: boolean
}

export interface StepAssuranceView {
  setting: StepAssuranceSetting
  steps: StepAssuranceStepView[]
  suggestedLimit: number
}

export const STEP_ASSURANCE_MODES: Array<{ value: StepAssuranceMode; label: string; hint: string }> = [
  { value: 'session', label: 'Signed in is enough', hint: 'Approve in the app. No staff card asked.' },
  { value: 'card_optional', label: 'Staff card offered', hint: 'Approve in the app, or confirm with the staff card.' },
  { value: 'card_required', label: 'Staff card required', hint: 'Only a staff card shared from the wallet moves this step.' },
]

export function stepAssuranceModeLabel(mode: StepAssuranceMode): string {
  return STEP_ASSURANCE_MODES.find((item) => item.value === mode)?.label || mode
}

/** The proof-policy response, read into what the settings card shows. */
export function stepAssuranceView(data: any): StepAssuranceView | null {
  if (!data || typeof data !== 'object' || !Array.isArray(data.assuranceSteps)) return null
  const raw = data.stepAssurance && typeof data.stepAssurance === 'object' ? data.stepAssurance : {}
  return {
    setting: {
      cardRequiredAbove: typeof raw.cardRequiredAbove === 'number' ? raw.cardRequiredAbove : null,
      steps: raw.steps && typeof raw.steps === 'object' ? raw.steps : {},
    },
    steps: data.assuranceSteps,
    suggestedLimit: Number(data.suggestedCardRequiredAbove) || 100,
  }
}

/** The setting after one step's mode changed. */
export function withStepMode(setting: StepAssuranceSetting, actionKey: string, mode: StepAssuranceMode): StepAssuranceSetting {
  return { ...setting, steps: { ...setting.steps, [actionKey]: mode } }
}
