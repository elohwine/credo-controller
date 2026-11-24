import { redactPath, redactSecrets } from '../logger'

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

  it('masks an invite code in request paths but keeps the accept route readable', () => {
    expect(redactPath('/api/wallet/auth/invite/Ab3_x-9')).toBe('/api/wallet/auth/invite/REDACTED')
    expect(redactPath('/api/wallet/auth/invite/accept')).toBe('/api/wallet/auth/invite/accept')
    expect(redactPath('/api/organizations/o1/members/u1/invite')).toBe('/api/organizations/o1/members/u1/invite')
  })
})
