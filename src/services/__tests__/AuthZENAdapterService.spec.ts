import { AuthZENAdapterService } from '../AuthZENAdapterService'

describe('AuthZENAdapterService', () => {
  let service: AuthZENAdapterService

  beforeEach(() => {
    service = new AuthZENAdapterService()
  })

  // ── Input validation ────────────────────────────────────────────────────────

  it('denies immediately when endpoint is not HTTPS', async () => {
    const result = await service.evaluate(
      'http://insecure.example.com/access/v1/evaluations',
      'token',
      { type: 'person', id: 'person-1' },
      { name: 'finance.approve' },
      { type: 'request' },
    )
    expect(result.decision).toBe(false)
    expect(result.reasonCode).toBe('authzen_endpoint_not_https')
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
  })

  it('denies immediately when endpoint URL is malformed', async () => {
    const result = await service.evaluate(
      'not-a-url',
      'token',
      { type: 'person', id: 'person-1' },
      { name: 'finance.approve' },
      { type: 'request' },
    )
    expect(result.decision).toBe(false)
    expect(result.reasonCode).toBe('authzen_endpoint_invalid_url')
  })

  // ── Network failures ────────────────────────────────────────────────────────

  it('denies and returns transport_error reason on network failure', async () => {
    // Use a valid HTTPS URL that is guaranteed unreachable
    const result = await service.evaluate(
      'https://localhost:19999/access/v1/evaluations',
      'token',
      { type: 'person', id: 'person-1' },
      { name: 'finance.approve' },
      { type: 'request' },
    )
    expect(result.decision).toBe(false)
    expect(['authzen_transport_error', 'authzen_timeout']).toContain(result.reasonCode)
  })

  // ── Response parsing (mocked fetch) ─────────────────────────────────────────

  it('returns allow decision when external endpoint responds true', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      body: null,
      text: jest.fn().mockResolvedValue(JSON.stringify({ decision: true })),
    }) as any

    const result = await service.evaluate(
      'https://authz.example.com/access/v1/evaluations',
      'tok',
      { type: 'person', id: 'p1' },
      { name: 'action' },
      { type: 'resource' },
    )
    expect(result.decision).toBe(true)

    delete (global as any).fetch
  })

  it('returns deny decision when external endpoint responds false', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      body: null,
      text: jest.fn().mockResolvedValue(JSON.stringify({ decision: false })),
    }) as any

    const result = await service.evaluate(
      'https://authz.example.com/access/v1/evaluations',
      'tok',
      { type: 'person', id: 'p1' },
      { name: 'action' },
      { type: 'resource' },
    )
    expect(result.decision).toBe(false)

    delete (global as any).fetch
  })

  it('extracts reason_admin.en as reasonCode from response context', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      body: null,
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          decision: false,
          context: { reason_admin: { en: 'insufficient_authority' } },
        }),
      ),
    }) as any

    const result = await service.evaluate(
      'https://authz.example.com/access/v1/evaluations',
      'tok',
      { type: 'person', id: 'p1' },
      { name: 'action' },
      { type: 'resource' },
    )
    expect(result.reasonCode).toBe('insufficient_authority')

    delete (global as any).fetch
  })

  it('denies on non-2xx HTTP response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      body: null,
      text: jest.fn().mockResolvedValue(''),
    }) as any

    const result = await service.evaluate(
      'https://authz.example.com/access/v1/evaluations',
      'tok',
      { type: 'person', id: 'p1' },
      { name: 'action' },
      { type: 'resource' },
    )
    expect(result.decision).toBe(false)
    expect(result.reasonCode).toBe('authzen_http_403')

    delete (global as any).fetch
  })
})
