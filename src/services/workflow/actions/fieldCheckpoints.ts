/**
 * FEPT pre-work checkpoints.
 *
 * SGK lifecycle (SGK_SSI_OID4VC_SUPPLY_CHAIN_IMPLEMENTATION_PLAN §5.1) places three
 * structured checkpoints around the photo evidence:
 *
 *   assigned → site inspection → risk assessment → (worker starts) → arrival proof
 *            → BEFORE evidence → work → AFTER evidence → receipt → customer sign-off
 *
 * They are form-style checkpoints (not photos), so they get their own payload shape,
 * validation and state keys. Validation is pure so the resume API can reject a bad
 * submission without failing the run.
 */

export type FeptCheckpointName = 'site_inspection' | 'risk_assessment' | 'arrival' | 'completion_review'

export interface FeptCheckpointDef {
  name: FeptCheckpointName
  label: string
  /** `pauseReason` the run carries while it waits for this checkpoint. */
  pauseReason: string
  /** Key on the resume payload / run input that carries the submission. */
  inputKey: string
  /** Request flag that lets a dispatcher waive the checkpoint for one job. */
  requireFlag: string
  /** Stage action used for actor resolution (Workflow Actors setup). */
  stageAction: string
  reconciliationEvent: 'SITE_INSPECTION_COMPLETED' | 'RISK_ASSESSMENT_COMPLETED' | 'ARRIVAL_CONFIRMED' | 'COMPLETION_REVIEWED'
}

export const FEPT_CHECKPOINTS: Record<FeptCheckpointName, FeptCheckpointDef> = {
  site_inspection: {
    name: 'site_inspection',
    label: 'Site inspection',
    pauseReason: 'await_site_inspection',
    inputKey: 'siteInspection',
    requireFlag: 'requireSiteInspection',
    stageAction: 'inspect_site',
    reconciliationEvent: 'SITE_INSPECTION_COMPLETED',
  },
  risk_assessment: {
    name: 'risk_assessment',
    label: 'Risk assessment',
    pauseReason: 'await_risk_assessment',
    inputKey: 'riskAssessment',
    requireFlag: 'requireRiskAssessment',
    stageAction: 'assess_risk',
    reconciliationEvent: 'RISK_ASSESSMENT_COMPLETED',
  },
  arrival: {
    name: 'arrival',
    label: 'Arrival proof',
    pauseReason: 'await_arrival',
    inputKey: 'arrival',
    requireFlag: 'requireArrivalProof',
    stageAction: 'confirm_arrival',
    reconciliationEvent: 'ARRIVAL_CONFIRMED',
  },
  completion_review: {
    name: 'completion_review',
    label: 'Completion review',
    pauseReason: 'await_completion_review',
    inputKey: 'completionReview',
    requireFlag: 'requireCompletionReview',
    stageAction: 'review_completion',
    reconciliationEvent: 'COMPLETION_REVIEWED',
  },
}

export const FEPT_CHECKPOINT_BY_PAUSE_REASON: Record<string, FeptCheckpointDef> = Object.values(
  FEPT_CHECKPOINTS,
).reduce<Record<string, FeptCheckpointDef>>((acc, def) => {
  acc[def.pauseReason] = def
  return acc
}, {})

export function flagEnabled(input: Record<string, any> | undefined, flag: string, byDefault = true): boolean {
  const raw = input?.[flag]
  if (raw === undefined || raw === null || raw === '') return byDefault
  if (typeof raw === 'string') return !['false', '0', 'no', 'off'].includes(raw.trim().toLowerCase())
  return Boolean(raw)
}

export function isCheckpointRequired(input: Record<string, any> | undefined, def: FeptCheckpointDef): boolean {
  return flagEnabled(input, def.requireFlag, true)
}

export type CheckpointValidation =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; error: string; blocked?: boolean; attempt?: Record<string, unknown> }

function text(value: unknown, max = 2000): string {
  return String(value ?? '')
    .trim()
    .slice(0, max)
}

function stringList(value: unknown, maxItems = 20): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value
    .map((item) => text(item, 200))
    .filter(Boolean)
    .slice(0, maxItems)
}

function validateSiteInspection(raw: any): CheckpointValidation {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'Site inspection is required before the job can start. Submit the inspection outcome.' }
  }
  const outcome = text(raw.outcome).toLowerCase()
  if (!['passed', 'passed_with_notes', 'failed'].includes(outcome)) {
    return { ok: false, error: 'Site inspection outcome must be passed, passed_with_notes or failed.' }
  }
  const value = {
    outcome,
    accessConfirmed: raw.accessConfirmed === undefined ? true : Boolean(raw.accessConfirmed),
    findings: text(raw.findings),
    checklist: raw.checklist && typeof raw.checklist === 'object' ? raw.checklist : undefined,
    photoUri: raw.photoUri ? text(raw.photoUri, 500) : undefined,
    evidenceHash: raw.evidenceHash ? text(raw.evidenceHash, 200) : undefined,
  }
  if (outcome === 'failed' || value.accessConfirmed === false) {
    return {
      ok: false,
      blocked: true,
      error: 'Site inspection did not clear the job. It stays on hold until the site is cleared or the job is reassigned.',
      attempt: value,
    }
  }
  return { ok: true, value }
}

function validateRiskAssessment(raw: any): CheckpointValidation {
  if (!raw || typeof raw !== 'object') {
    return {
      ok: false,
      error: 'The field worker must complete the risk assessment before starting the job.',
    }
  }
  const hazards = stringList(raw.hazards)
  if (!hazards) {
    return { ok: false, error: 'Risk assessment needs a hazards list (use an empty list when none were found).' }
  }
  if (typeof raw.safeToProceed !== 'boolean') {
    return { ok: false, error: 'Risk assessment must state whether it is safe to proceed.' }
  }
  if (typeof raw.ppeConfirmed !== 'boolean') {
    return { ok: false, error: 'Risk assessment must confirm protective equipment.' }
  }
  const value = {
    hazards,
    controls: text(raw.controls),
    ppeConfirmed: raw.ppeConfirmed,
    safeToProceed: raw.safeToProceed,
    notes: text(raw.notes),
  }
  if (!value.safeToProceed || !value.ppeConfirmed) {
    return {
      ok: false,
      blocked: true,
      error: 'Risk assessment says the job is not safe to start. It stays on hold for a supervisor or reassignment.',
      attempt: value,
    }
  }
  if (hazards.length > 0 && !value.controls) {
    return { ok: false, error: 'List the controls that cover the hazards you identified.' }
  }
  return { ok: true, value }
}

function validateArrival(raw: any): CheckpointValidation {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'Arrival proof is required: share location or scan the site code.' }
  }
  const lat = Number(raw.gps?.lat ?? raw.lat)
  const lng = Number(raw.gps?.lng ?? raw.lng)
  const hasGps = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
  const qrToken = text(raw.qrToken, 500)
  if (!hasGps && !qrToken) {
    return { ok: false, error: 'Arrival proof needs a valid location or a scanned site code.' }
  }
  const accuracy = Number(raw.gps?.accuracy ?? raw.accuracy)
  return {
    ok: true,
    value: {
      method: qrToken && !hasGps ? 'qr' : 'gps',
      gps: hasGps ? { lat, lng, accuracy: Number.isFinite(accuracy) ? accuracy : undefined } : undefined,
      qrToken: qrToken || undefined,
      arrivedAt: new Date().toISOString(),
    },
  }
}

function validateCompletionReview(raw: any): CheckpointValidation {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'A reviewer must check the finished work (AFTER evidence) before customer sign-off.' }
  }
  const outcome = text(raw.outcome).toLowerCase()
  if (!['approved', 'approved_with_notes', 'rework_required'].includes(outcome)) {
    return { ok: false, error: 'Review outcome must be approved, approved_with_notes or rework_required.' }
  }
  const value = { outcome, notes: text(raw.notes) }
  if (outcome === 'rework_required') {
    return {
      ok: false,
      blocked: true,
      error: 'The review found work to redo. The job stays on hold until it is reassigned or the issue is resolved.',
      attempt: value,
    }
  }
  return { ok: true, value }
}

export function validateCheckpointPayload(name: FeptCheckpointName, raw: unknown): CheckpointValidation {
  if (name === 'completion_review') return validateCompletionReview(raw)
  if (name === 'site_inspection') return validateSiteInspection(raw)
  if (name === 'risk_assessment') return validateRiskAssessment(raw)
  return validateArrival(raw)
}
