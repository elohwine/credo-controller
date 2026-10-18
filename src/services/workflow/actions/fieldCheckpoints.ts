/**
 * FEPT pre-work checkpoints.
 *
 * SGK lifecycle (SGK_SSI_OID4VC_SUPPLY_CHAIN_IMPLEMENTATION_PLAN §5.1) places three
 * structured checkpoints around the photo evidence:
 *
 *   assigned → (worker heads out) → arrival proof → site inspection → safety check
 *            → BEFORE evidence → work → AFTER evidence → receipt → customer sign-off
 *
 * Arrival comes first. A site check and a hazard check happen where the work is,
 * so they cannot be recorded before the worker proves they are on site.
 *
 * They are form-style checkpoints (not photos), so they get their own payload shape,
 * validation and state keys. Validation is pure so the resume API can reject a bad
 * submission without failing the run.
 *
 * The safety check is a stop-work call. The worker picks "safe" or "not safe" on purpose:
 * a missing choice is a plain validation error, never a hold. "Not safe" needs a reason and
 * a photo and raises a hold (`SafetyHold`) that tells the organisation; someone there marks
 * the issue resolved, the worker is told, and the worker redoes the same check to clear it.
 * See `FieldExecutionActions.prepareResume` / `resolveHold`.
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
  reconciliationEvent:
    | 'SITE_INSPECTION_COMPLETED'
    | 'RISK_ASSESSMENT_COMPLETED'
    | 'ARRIVAL_CONFIRMED'
    | 'COMPLETION_REVIEWED'
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
    return { ok: false, error: 'Site inspection is required before any work. Submit the inspection outcome.' }
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
      error:
        'Site inspection did not clear the job. It stays on hold until the site is cleared or the job is reassigned.',
      attempt: value,
    }
  }
  return { ok: true, value }
}

export type SafetyDecision = 'safe' | 'not_safe'

export interface RiskAssessmentOptions {
  /**
   * A safety hold on this job is still open, or the organisation marked it resolved and the
   * worker has not re-checked yet. A "safe" answer then has to say what changed.
   */
  openHold?: boolean
  /**
   * A hold the worker said only the organisation can fix is still open. A "safe" answer is
   * refused until the organisation marks it resolved; another "not safe" call is still allowed.
   */
  waitingForOrganisation?: boolean
}

/** Who the worker said must fix the problem behind a hold. */
export type SafetyHoldFixBy = 'organisation' | 'worker'

/** Older clients send nothing: the hold then waits for the organisation (the safer default). */
export function safetyHoldFixBy(raw: unknown): SafetyHoldFixBy {
  const value = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]/g, '_')
  return ['worker', 'self', 'on_site', 'me'].includes(value) ? 'worker' : 'organisation'
}

/** Shown when a worker tries "safe" while the organisation still has to fix the problem. */
export const SAFETY_HOLD_WAITING_MESSAGE =
  'This job is waiting for your organisation to fix the problem you reported. You can redo the safety check once they mark it resolved.'

/** Message shown when a worker says the job is not safe. Shared by the server and the tests. */
export const SAFETY_HOLD_MESSAGE =
  'The safety check says the job is not safe to start. It is on hold: your organisation has been told and will say when the issue is fixed.'

function safetyDecision(raw: any): SafetyDecision | undefined {
  const explicit = text(raw.decision, 20).toLowerCase().replace(/[\s-]/g, '_')
  if (explicit === 'safe' || explicit === 'not_safe') return explicit
  // Older clients send the boolean only. True is an explicit "safe"; false is "not safe" and
  // is then held to the same reason + photo rule as a new client.
  if (raw.safeToProceed === true) return 'safe'
  if (raw.safeToProceed === false) return 'not_safe'
  return undefined
}

const NO_HAZARD_WORDS = new Set(['none', 'no', 'nil', 'n/a', 'na', 'nothing', 'all good', 'no hazards', '-'])

function validateRiskAssessment(raw: any, options: RiskAssessmentOptions = {}): CheckpointValidation {
  if (!raw || typeof raw !== 'object') {
    return {
      ok: false,
      error: 'The field worker must complete the safety check before starting the job.',
    }
  }
  const hazards = stringList(raw.hazards)?.filter((item) => !NO_HAZARD_WORDS.has(item.trim().toLowerCase()))
  if (!hazards) {
    return { ok: false, error: 'The safety check needs a hazards list (use an empty list when none were found).' }
  }
  // Leaving the choice out is a mistake, not a stop-work call. It never puts the job on hold.
  const decision = safetyDecision(raw)
  if (!decision) {
    return { ok: false, error: 'Choose whether it is safe to start or not safe (hold the job).' }
  }

  const controls = text(raw.controls)
  const notes = text(raw.notes)

  if (decision === 'not_safe') {
    // A stop-work call costs a reason and a photo of the hazard, so the organisation can act on
    // it and the record stands on its own later.
    const holdReason = text(raw.holdReason || raw.reason, 1000)
    const photoUri = text(raw.holdPhoto?.photoUri || raw.photoUri, 2_000_000)
    const evidenceHash = text(raw.holdPhoto?.evidenceHash || raw.evidenceHash, 200)
    if (!holdReason) {
      return { ok: false, error: 'Say why it is not safe to start before you put the job on hold.' }
    }
    if (!photoUri || !evidenceHash) {
      return { ok: false, error: 'Add a photo of what makes the job unsafe before you put it on hold.' }
    }
    return {
      ok: false,
      blocked: true,
      error: SAFETY_HOLD_MESSAGE,
      attempt: {
        decision,
        hazards,
        controls,
        ppeConfirmed: raw.ppeConfirmed === true,
        safeToProceed: false,
        holdReason,
        holdPhoto: { photoUri, evidenceHash },
        fixBy: safetyHoldFixBy(raw.fixBy),
        notes,
      },
    }
  }

  if (options.waitingForOrganisation) {
    return { ok: false, error: SAFETY_HOLD_WAITING_MESSAGE }
  }
  if (raw.ppeConfirmed !== true) {
    return {
      ok: false,
      error: 'Confirm you have the protective equipment this job needs, or choose "Not safe" to hold the job.',
    }
  }
  // "Safe" with protective equipment confirmed is the worker's call; measures taken are optional.
  const whatChanged = text(raw.whatChanged, 1000)
  if (options.openHold && !whatChanged) {
    return { ok: false, error: 'This job was on hold. Say what changed since the hold before you start.' }
  }
  return {
    ok: true,
    value: {
      decision,
      hazards,
      controls,
      ppeConfirmed: true,
      safeToProceed: true,
      notes,
      whatChanged: whatChanged || undefined,
    },
  }
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

export interface CheckpointValidationOptions {
  riskAssessment?: RiskAssessmentOptions
}

export function validateCheckpointPayload(
  name: FeptCheckpointName,
  raw: unknown,
  options: CheckpointValidationOptions = {},
): CheckpointValidation {
  if (name === 'completion_review') return validateCompletionReview(raw)
  if (name === 'site_inspection') return validateSiteInspection(raw)
  if (name === 'risk_assessment') return validateRiskAssessment(raw, options.riskAssessment)
  return validateArrival(raw)
}

// ── Safety holds ─────────────────────────────────────────────────────────────────

export type SafetyHoldStatus = 'open' | 'resolved' | 'cleared' | 'reassigned'

/**
 * One stop-work call on a job. Appended to `state.checkpointBlocks`, never overwritten:
 * the worker raises it, the organisation marks the issue resolved, and the worker's next
 * passing safety check clears it. Who did each step and when is set by the server.
 */
export interface SafetyHold {
  id: string
  checkpoint: FeptCheckpointName
  status: SafetyHoldStatus
  at: string
  by?: string
  reason: string
  attempt?: Record<string, unknown>
  photo?: { photoUri: string; evidenceHash: string }
  hazards?: string[]
  /** Who the worker said must fix it. Missing on older holds, which count as 'organisation'. */
  fixBy?: SafetyHoldFixBy
  resolvedAt?: string
  resolvedBy?: string
  resolutionNote?: string
  clearedAt?: string
  clearedBy?: string
  whatChanged?: string
  /** Older holds only: they used to end when the job moved to another worker. */
  reassignedAt?: string
  /** The job moved to another worker while this hold was live; it stayed with the job. */
  carriedOver?: Array<{ from?: string; to: string; at: string }>
}

/** An open hold the worker said only the organisation can fix: the redo waits for it. */
export function holdWaitsForOrganisation(hold: Pick<SafetyHold, 'status' | 'fixBy'> | undefined): boolean {
  if (!hold) return false
  return String(hold.status || 'open') === 'open' && safetyHoldFixBy(hold.fixBy) === 'organisation'
}

/** Holds that still gate the checkpoint: raised and not yet cleared by a passing check. */
export function isHoldLive(hold: Pick<SafetyHold, 'status'> | undefined): boolean {
  if (!hold) return false
  const status = String(hold.status || 'open')
  return status === 'open' || status === 'resolved'
}

export function holdsOf(state: Record<string, any> | undefined): SafetyHold[] {
  return Array.isArray(state?.checkpointBlocks) ? (state!.checkpointBlocks as SafetyHold[]) : []
}
