import { ExternalActions } from '../ExternalActions'

function makeContext() {
  return {
    workflowId: 'wf-001',
    tenantId: 'tenant-001',
    input: { customerMsisdn: '0771234567', amount: 10, currency: 'USD', sourceReference: 'PAY-TEST-001' },
    state: {} as Record<string, any>,
  }
}

describe('ExternalActions.initiateEcoCashPayment', () => {
  const originalEnvironment = {
    apiKey: process.env.ECOCASH_API_KEY,
    simulated: process.env.ECOCASH_SIMULATED_PAYMENTS,
    ngrok: process.env.NGROK_URL,
    publicBase: process.env.PUBLIC_BASE_URL,
  }

  beforeEach(() => {
    delete process.env.ECOCASH_API_KEY
    delete process.env.ECOCASH_SIMULATED_PAYMENTS
    delete process.env.NGROK_URL
    delete process.env.PUBLIC_BASE_URL
  })

  afterEach(() => {
    jest.restoreAllMocks()
    if (originalEnvironment.apiKey === undefined) delete process.env.ECOCASH_API_KEY
    else process.env.ECOCASH_API_KEY = originalEnvironment.apiKey
    if (originalEnvironment.simulated === undefined) delete process.env.ECOCASH_SIMULATED_PAYMENTS
    else process.env.ECOCASH_SIMULATED_PAYMENTS = originalEnvironment.simulated
    if (originalEnvironment.ngrok === undefined) delete process.env.NGROK_URL
    else process.env.NGROK_URL = originalEnvironment.ngrok
    if (originalEnvironment.publicBase === undefined) delete process.env.PUBLIC_BASE_URL
    else process.env.PUBLIC_BASE_URL = originalEnvironment.publicBase
  })

  it('does not simulate a payment just because sandbox mode is enabled', async () => {
    const context = makeContext()

    await expect(ExternalActions.initiateEcoCashPayment(context, { sandboxMode: true })).rejects.toThrow(
      'EcoCash API key is required',
    )
    expect(context.state.payment).toBeUndefined()
  })

  it('preserves an explicitly configured webhook callback URL', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'PENDING' }),
    } as Response)
    const context = makeContext()

    await ExternalActions.initiateEcoCashPayment(context, {
      apiKey: 'test-key',
      sandboxMode: false,
      callbackUrl: 'https://example.test/ecocash-callback',
    })

    expect(context.state.ecocashPayment.webhookUrl).toBe('https://example.test/ecocash-callback')
  })
})
