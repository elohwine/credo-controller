import {
  clientPayCopy,
  getFriendlyActivityActionLabel,
  getInboxDisplayTitle,
  SAFETY_HOLD_COPY,
  safetyHoldStateWords,
} from './uxCopy'
import {
  SAFETY_HOLD_COPY as PORTAL_SAFETY_HOLD_COPY,
  safetyHoldStateWords as portalSafetyHoldStateWords,
} from '../../portal/components/finance/financeStages'
import { buildJobAuditTrail, holdWaitsForOrganisation } from './jobAuditTrail'

describe('ux copy helpers', () => {
  it('does not claim payment receipt offers are already saved in the wallet', () => {
    for (const kind of ['quote', 'invoice']) {
      const copy = clientPayCopy(kind)
      expect(copy.paidBody).toContain('receipt offer')
      expect(copy.keepHelp).toContain('inbox')
      expect(copy.openRecordsLabel).toBe('Open my inbox')
      expect(copy.paidBody).not.toContain('receipt is in your records')
    }
  })
  it('distinguishes identified hazards from the reason work cannot start safely', () => {
    expect(SAFETY_HOLD_COPY.hazardsLabel).toBe('What hazards did you find?')
    expect(SAFETY_HOLD_COPY.hazardsHelp).toContain('including hazards you can control')
    expect(SAFETY_HOLD_COPY.hazardsHelp).toContain('Leave empty if none')
    expect(SAFETY_HOLD_COPY.reasonLabel).toBe('What prevents you working safely?')
    expect(SAFETY_HOLD_COPY.reasonHelp).toContain('You do not need to repeat the hazards above')
    expect(SAFETY_HOLD_COPY.reasonPlaceholder).toContain('fall protection')
  })

  it('keeps mobile and portal safety-hold copy consistent', () => {
    expect(SAFETY_HOLD_COPY).toEqual(PORTAL_SAFETY_HOLD_COPY)
  })

  it('words an open hold by who must fix it, the same on phone and portal', () => {
    const worker = safetyHoldStateWords('open', 'worker', { fixBy: 'worker' })
    expect(worker.line).toMatch(/fix this on site/)
    expect(safetyHoldStateWords('open', 'worker', {}).line).toMatch(/Waiting for your organisation/)
    expect(safetyHoldStateWords('open', 'org', { by: 'Tendai', fixBy: 'worker' }).line).toMatch(
      /You can also mark it resolved/,
    )
    for (const fixBy of ['organisation', 'worker'] as const) {
      for (const viewer of ['worker', 'org'] as const) {
        expect(safetyHoldStateWords('open', viewer, { by: 'T', fixBy })).toEqual(
          portalSafetyHoldStateWords('open', viewer, { by: 'T', fixBy }),
        )
      }
    }
  })

  it('reads who fixes a hold from run output; older holds wait for the organisation', () => {
    const run = {
      output: {
        checkpointBlocks: [
          { id: 'h1', checkpoint: 'risk_assessment', status: 'open', reason: 'old hold' },
          { id: 'h2', checkpoint: 'risk_assessment', status: 'open', reason: 'on site', fixBy: 'worker' },
        ],
      },
    }
    const holds = buildJobAuditTrail(run).holds
    expect(holds.map((h) => h.fixBy)).toEqual(['organisation', 'worker'])
    expect(holdWaitsForOrganisation(holds[0])).toBe(true)
    expect(holdWaitsForOrganisation(holds[1])).toBe(false)
    expect(holdWaitsForOrganisation({ status: 'resolved', fixBy: 'organisation' })).toBe(false)
  })

  it('derives a field-stage title from the workflow stage instead of a generic fallback', () => {
    expect(
      getInboxDisplayTitle({
        module: 'field',
        workflowStage: 'ACKNOWLEDGED',
        actionLabel: 'Open',
      }),
    ).toBe('Signed off')
  })

  it('uses Job Card wording for field execution items when there is no explicit stage label', () => {
    expect(
      getInboxDisplayTitle({
        module: 'field',
        workflowRunId: 'run-123',
        actionLabel: 'Open',
      }),
    ).toBe('Job Card')
  })

  it('derives a payment-oriented label from the action and flow context', () => {
    expect(
      getFriendlyActivityActionLabel('api post', undefined, {
        workflowType: 'field_execution',
        providerRef: 'paylink-123',
      }),
    ).toBe('Payment ready')
  })
})
