import { getFriendlyActivityActionLabel, getInboxDisplayTitle } from './uxCopy'

describe('ux copy helpers', () => {
  it('derives a field-stage title from the workflow stage instead of a generic fallback', () => {
    expect(
      getInboxDisplayTitle({
        module: 'field',
        workflowStage: 'ACKNOWLEDGED',
        actionLabel: 'Open',
      }),
    ).toBe('Acknowledged')
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
