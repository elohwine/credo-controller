import { redactSecrets } from '../logger'

describe('log redaction', () => {
  it('masks the wallet key Credo logs with its agent config, keeping the rest', () => {
    const logged = redactSecrets({
      agentConfig: { walletConfig: { id: 'sgk-controller-agent', key: 'wallet-secret' }, label: 'Agent' },
      accessToken: 'abc',
      endpoints: [{ apiKey: 'k', url: 'https://x' }],
    })
    expect(logged).toEqual({
      agentConfig: { walletConfig: { id: 'sgk-controller-agent', key: 'REDACTED' }, label: 'Agent' },
      accessToken: 'REDACTED',
      endpoints: [{ apiKey: 'REDACTED', url: 'https://x' }],
    })
  })
})
