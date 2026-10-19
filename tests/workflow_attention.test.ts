import { describe, expect, test } from '@jest/globals'
import { workflowAttentionPreview } from '../credo-ui/mobile/lib/workflowAttention'

describe('Home workflow attention previews', () => {
  test('preserves the actual job/action title instead of replacing it with Workflow action', () => {
    expect(
      workflowAttentionPreview({
        id: 'wsa:arrival',
        title: 'Continue job FR-1792390849786: Confirm arrival',
        issuerName: 'Demo Org',
        body: 'Open it to continue.',
        claims: { stageAction: 'confirm_arrival' },
      }),
    ).toEqual({
      title: 'Continue job FR-1792390849786: Confirm arrival',
      summary: 'Demo Org · Open it to continue.',
      route: '/inbox?item=wsa%3Aarrival',
    })
  })

  test('uses action and reference when older cards have generic titles', () => {
    expect(
      workflowAttentionPreview({
        offerId: 'safety-offer',
        title: 'Workflow action',
        claims: { stageAction: 'assess_risk', reference: 'FR-123', orgName: 'Demo Org' },
      }),
    ).toMatchObject({ title: 'Safety check · FR-123', summary: 'Demo Org', route: '/inbox?item=safety-offer' })
  })

  test('distinguishes two actions from the same organisation', () => {
    const arrival = workflowAttentionPreview({ claims: { stageAction: 'confirm_arrival', orgName: 'Demo Org' } })
    const signoff = workflowAttentionPreview({ claims: { stageAction: 'acknowledge_execution', orgName: 'Demo Org' } })
    expect(arrival.title).toBe('Confirm arrival')
    expect(signoff.title).toBe('Sign off job')
    expect(arrival.route).toBe('/inbox')
  })
})
