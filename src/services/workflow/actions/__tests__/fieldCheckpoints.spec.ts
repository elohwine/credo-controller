import {
  SAFETY_HOLD_MESSAGE,
  SAFETY_HOLD_WAITING_MESSAGE,
  holdWaitsForOrganisation,
  isHoldLive,
  safetyHoldFixBy,
  validateCheckpointPayload,
} from '../fieldCheckpoints'

// ── safety check (risk_assessment) ────────────────────────────────────────────
//
// The worker picks "safe" or "not safe" on purpose. Leaving it out, or leaving the PPE box
// unticked, is a validation error and never a hold. "Not safe" is a hold only when it comes
// with a reason and a photo.

const photo = { photoUri: 'data:image/jpeg;base64,AAA', evidenceHash: 'abc123' }

describe('validateCheckpointPayload(risk_assessment)', () => {
  test('no choice at all is an error, not a hold', () => {
    const result = validateCheckpointPayload('risk_assessment', { hazards: [], ppeConfirmed: false })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.blocked).toBeUndefined()
      expect(result.error).toMatch(/Choose whether it is safe/)
    }
  })

  test('"safe" with the PPE box unticked is an error, not a hold', () => {
    const result = validateCheckpointPayload('risk_assessment', { decision: 'safe', hazards: [], ppeConfirmed: false })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.blocked).toBeUndefined()
      expect(result.error).toMatch(/protective equipment/)
    }
  })

  test('"safe" with hazards listed needs controls', () => {
    const result = validateCheckpointPayload('risk_assessment', {
      decision: 'safe',
      hazards: ['live wiring'],
      controls: '',
      ppeConfirmed: true,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/controls/)
  })

  test('"safe" with PPE passes and records the decision', () => {
    const result = validateCheckpointPayload('risk_assessment', {
      decision: 'safe',
      hazards: ['working at height'],
      controls: 'harness + spotter',
      ppeConfirmed: true,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toMatchObject({ decision: 'safe', safeToProceed: true, ppeConfirmed: true })
    }
  })

  test('older clients: safeToProceed=true behaves as "safe"', () => {
    const result = validateCheckpointPayload('risk_assessment', {
      hazards: [],
      ppeConfirmed: true,
      safeToProceed: true,
    })
    expect(result.ok).toBe(true)
  })

  test('"not safe" without a reason is an error, not a hold', () => {
    const result = validateCheckpointPayload('risk_assessment', {
      decision: 'not_safe',
      hazards: ['gas smell'],
      holdPhoto: photo,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.blocked).toBeUndefined()
      expect(result.error).toMatch(/Say why/)
    }
  })

  test('"not safe" without a photo is an error, not a hold', () => {
    const result = validateCheckpointPayload('risk_assessment', {
      decision: 'not_safe',
      hazards: ['gas smell'],
      holdReason: 'Strong gas smell',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.blocked).toBeUndefined()
      expect(result.error).toMatch(/photo/)
    }
  })

  test('"not safe" with a reason and a photo is a hold carrying both', () => {
    const result = validateCheckpointPayload('risk_assessment', {
      decision: 'not_safe',
      hazards: ['gas smell'],
      holdReason: 'Strong gas smell at the meter',
      holdPhoto: photo,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.blocked).toBe(true)
      expect(result.error).toBe(SAFETY_HOLD_MESSAGE)
      expect(result.attempt).toMatchObject({
        decision: 'not_safe',
        holdReason: 'Strong gas smell at the meter',
        holdPhoto: photo,
        hazards: ['gas smell'],
      })
    }
  })

  test('older clients: safeToProceed=false is held to the same reason + photo rule', () => {
    const result = validateCheckpointPayload('risk_assessment', {
      hazards: [],
      ppeConfirmed: true,
      safeToProceed: false,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.blocked).toBeUndefined()
  })

  test('"safe" after a hold needs "what changed"', () => {
    const base = { decision: 'safe', hazards: [], ppeConfirmed: true }
    const missing = validateCheckpointPayload('risk_assessment', base, { riskAssessment: { openHold: true } })
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.error).toMatch(/what changed/i)

    const given = validateCheckpointPayload(
      'risk_assessment',
      { ...base, whatChanged: 'Supply isolated by the site electrician' },
      { riskAssessment: { openHold: true } },
    )
    expect(given.ok).toBe(true)
    if (given.ok) expect(given.value.whatChanged).toBe('Supply isolated by the site electrician')
  })
})

describe('who fixes a safety hold', () => {
  const unsafe = { decision: 'not_safe', hazards: ['gas smell'], holdReason: 'Strong gas smell', holdPhoto: photo }

  test('the organisation by default; "on site" only when the worker says so', () => {
    expect(safetyHoldFixBy(undefined)).toBe('organisation')
    expect(safetyHoldFixBy('anything')).toBe('organisation')
    expect(safetyHoldFixBy('worker')).toBe('worker')
    expect(safetyHoldFixBy('ON_SITE')).toBe('worker')

    const byOrg = validateCheckpointPayload('risk_assessment', unsafe)
    if (!byOrg.ok) expect(byOrg.attempt?.fixBy).toBe('organisation')
    const byWorker = validateCheckpointPayload('risk_assessment', { ...unsafe, fixBy: 'worker' })
    if (!byWorker.ok) expect(byWorker.attempt?.fixBy).toBe('worker')
  })

  test('while the organisation must fix it, "safe" is refused but another "not safe" is still a hold', () => {
    const options = { riskAssessment: { openHold: true, waitingForOrganisation: true } }
    const safe = validateCheckpointPayload(
      'risk_assessment',
      { decision: 'safe', hazards: [], ppeConfirmed: true, whatChanged: 'nothing' },
      options,
    )
    expect(safe.ok).toBe(false)
    if (!safe.ok) {
      expect(safe.blocked).toBeUndefined()
      expect(safe.error).toBe(SAFETY_HOLD_WAITING_MESSAGE)
    }
    const again = validateCheckpointPayload('risk_assessment', unsafe, options)
    expect(again.ok).toBe(false)
    if (!again.ok) expect(again.blocked).toBe(true)
  })

  test('holdWaitsForOrganisation: only open holds the organisation must fix', () => {
    expect(holdWaitsForOrganisation({ status: 'open' })).toBe(true)
    expect(holdWaitsForOrganisation({ status: 'open', fixBy: 'organisation' })).toBe(true)
    expect(holdWaitsForOrganisation({ status: 'open', fixBy: 'worker' })).toBe(false)
    expect(holdWaitsForOrganisation({ status: 'resolved', fixBy: 'organisation' })).toBe(false)
    expect(holdWaitsForOrganisation(undefined)).toBe(false)
  })
})

describe('isHoldLive', () => {
  test('open and resolved holds still gate the step; cleared and reassigned do not', () => {
    expect(isHoldLive({ status: 'open' })).toBe(true)
    expect(isHoldLive({ status: 'resolved' })).toBe(true)
    expect(isHoldLive({ status: 'cleared' })).toBe(false)
    expect(isHoldLive({ status: 'reassigned' })).toBe(false)
    expect(isHoldLive(undefined)).toBe(false)
  })
})
