import { getFriendlyActivityActionLabel, getInboxDisplayTitle } from './uxCopy'

describe('ux copy helpers', () => {
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
