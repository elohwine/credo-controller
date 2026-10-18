import { validateCheckpointPayload } from '../src/services/workflow/actions/fieldCheckpoints'

describe('safety check: what the worker did is optional when it is safe', () => {
  test('safe with hazards listed and no measures is accepted', () => {
    const result = validateCheckpointPayload('risk_assessment', {
      decision: 'safe',
      hazards: ['wet floor'],
      controls: '',
      ppeConfirmed: true,
    })
    expect(result.ok).toBe(true)
  })

  test('"none" style hazard words are not counted as hazards', () => {
    const result = validateCheckpointPayload('risk_assessment', {
      decision: 'safe',
      hazards: ['All good', 'none'],
      ppeConfirmed: true,
    })
    expect(result).toMatchObject({ ok: true, value: { hazards: [] } })
  })

  test('safe still needs protective equipment confirmed', () => {
    const result = validateCheckpointPayload('risk_assessment', { decision: 'safe', hazards: [], ppeConfirmed: false })
    expect(result.ok).toBe(false)
  })

  test('not safe still needs a reason and a photo', () => {
    const result = validateCheckpointPayload('risk_assessment', { decision: 'not_safe', hazards: ['live wiring'] })
    expect(result).toMatchObject({ ok: false })
    expect(result.blocked).toBeFalsy()
  })
})
