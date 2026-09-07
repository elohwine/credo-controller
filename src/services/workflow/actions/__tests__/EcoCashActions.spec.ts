import type { WorkflowActionContext } from '../../ActionRegistry'

import { ecocashPayment, ecocashPaymentProof, ecocashTransactionLookup } from '../EcoCashActions'

// ── helpers ───────────────────────────────────────────────────────────────────

function makeContext(overrides: Partial<WorkflowActionContext> = {}): WorkflowActionContext {
  return {
    workflowId: 'wf-001',
    tenantId: 'tenant-001',
    input: {},
    state: {},
    ...overrides,
  }
}

function mockFetch(status: number, body: unknown): jest.SpyInstance {
  return jest.spyOn(global, 'fetch').mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response)
}

afterEach(() => jest.restoreAllMocks())

// ── ecocash.payment ───────────────────────────────────────────────────────────

describe('ecocashPayment', () => {
  it('throws when ECOCASH_API_KEY is missing and config has no apiKey', async () => {
    const original = process.env.ECOCASH_API_KEY
    delete process.env.ECOCASH_API_KEY
    const ctx = makeContext({ input: { customerMsisdn: '0771234567', amount: 10 } })
    await expect(ecocashPayment(ctx, {})).rejects.toThrow(/ECOCASH_API_KEY/)
    process.env.ECOCASH_API_KEY = original
  })

  it('throws when customerMsisdn is absent', async () => {
    const ctx = makeContext({ input: { amount: 10 } })
    await expect(ecocashPayment(ctx, { apiKey: 'k', sandboxMode: true })).rejects.toThrow(/customerMsisdn/)
  })

  it('throws when amount is zero or negative', async () => {
    const ctx = makeContext({ input: { customerMsisdn: '0771234567', amount: 0 } })
    await expect(ecocashPayment(ctx, { apiKey: 'k', sandboxMode: true })).rejects.toThrow(/positive number/)
  })

  it('sets context.state.ecocashPayment on success', async () => {
    mockFetch(200, { status: 'PENDING', transactionId: 'tx-001' })
    const ctx = makeContext({
      input: { customerMsisdn: '0771234567', amount: 50, currency: 'USD', sourceReference: 'PAY-TEST-001' },
    })
    await ecocashPayment(ctx, { apiKey: 'test-key', sandboxMode: true })
    expect(ctx.state.ecocashPayment).toMatchObject({
      status: 'pending',
      sourceReference: 'PAY-TEST-001',
      sandboxMode: true,
    })
    expect(ctx.state.ecocashPayment.initiatedAt).toBeTruthy()
  })

  it('throws when API returns non-2xx status', async () => {
    mockFetch(400, { error: 'Bad request' })
    const ctx = makeContext({ input: { customerMsisdn: '0771234567', amount: 20 } })
    await expect(ecocashPayment(ctx, { apiKey: 'k', sandboxMode: true })).rejects.toThrow(/400/)
  })

  it('does NOT store raw API response body in state', async () => {
    mockFetch(200, { status: 'PENDING', customerMsisdn: '0771234567', apiKey: 'secret-key' })
    const ctx = makeContext({
      input: { customerMsisdn: '0771234567', amount: 10, sourceReference: 'PAY-SAFE' },
    })
    await ecocashPayment(ctx, { apiKey: 'test-key', sandboxMode: true })
    const stored = JSON.stringify(ctx.state.ecocashPayment)
    expect(stored).not.toContain('secret-key')
    expect(stored).not.toContain('0771234567')
  })
})

// ── ecocash.transaction.lookup ────────────────────────────────────────────────

describe('ecocashTransactionLookup', () => {
  it('throws when API key is missing', async () => {
    const original = process.env.ECOCASH_API_KEY
    delete process.env.ECOCASH_API_KEY
    const ctx = makeContext({ input: { sourceReference: 'PAY-001' } })
    await expect(ecocashTransactionLookup(ctx, {})).rejects.toThrow(/ECOCASH_API_KEY/)
    process.env.ECOCASH_API_KEY = original
  })

  it('throws when sourceReference is absent from both input and state', async () => {
    const ctx = makeContext({ input: {} })
    await expect(ecocashTransactionLookup(ctx, { apiKey: 'k' })).rejects.toThrow(/sourceReference/)
  })

  it('reads sourceReference from context.state.ecocashPayment when not in input', async () => {
    mockFetch(200, { status: 'SUCCESS', transactionId: 'tx-abc' })
    const ctx = makeContext({
      input: {},
      state: { ecocashPayment: { sourceReference: 'PAY-FROM-STATE' } },
    })
    await ecocashTransactionLookup(ctx, { apiKey: 'k', sandboxMode: true })
    expect(ctx.state.ecocashLookup.sourceReference).toBe('PAY-FROM-STATE')
    expect(ctx.state.ecocashLookup.status).toBe('SUCCESS')
  })

  it('stores structured lookup result in state', async () => {
    mockFetch(200, { status: 'SUCCESS', transactionId: 'tx-xyz' })
    const ctx = makeContext({ input: { sourceReference: 'PAY-XYZ' } })
    await ecocashTransactionLookup(ctx, { apiKey: 'k', sandboxMode: true })
    expect(ctx.state.ecocashLookup).toMatchObject({
      sourceReference: 'PAY-XYZ',
      transactionId: 'tx-xyz',
      status: 'SUCCESS',
    })
    expect(ctx.state.ecocashLookup.checkedAt).toBeTruthy()
  })

  it('throws when API returns non-2xx', async () => {
    mockFetch(404, { error: 'Not found' })
    const ctx = makeContext({ input: { sourceReference: 'MISSING' } })
    await expect(ecocashTransactionLookup(ctx, { apiKey: 'k', sandboxMode: true })).rejects.toThrow(/404/)
  })
})

// ── ecocash.payment.proof ─────────────────────────────────────────────────────

describe('ecocashPaymentProof', () => {
  it('throws when sourceReference is absent', async () => {
    const ctx = makeContext({ input: {}, state: {} })
    await expect(ecocashPaymentProof(ctx)).rejects.toThrow(/sourceReference/)
  })

  it('throws when transaction is not confirmed', async () => {
    const ctx = makeContext({
      input: { sourceReference: 'PAY-001' },
      state: { ecocashLookup: { status: 'PENDING' } },
    })
    await expect(ecocashPaymentProof(ctx)).rejects.toThrow(/unconfirmed/)
  })

  it('creates a proof object for a SUCCESS transaction', async () => {
    const ctx = makeContext({
      input: { sourceReference: 'PAY-001' },
      state: {
        ecocashPayment: { sourceReference: 'PAY-001' },
        ecocashLookup: { status: 'SUCCESS', transactionId: 'tx-done' },
      },
    })
    await ecocashPaymentProof(ctx, { purpose: 'supplier_payment' })
    expect(ctx.state.ecocashPaymentProof).toMatchObject({
      sourceReference: 'PAY-001',
      transactionId: 'tx-done',
      transactionStatus: 'SUCCESS',
      purpose: 'supplier_payment',
    })
    expect(ctx.state.ecocashPaymentProof.proofRef).toContain('ecocash-proof:')
    expect(ctx.state.ecocashPaymentProof.digest).toHaveLength(64) // sha256 hex
    expect(ctx.state.ecocashPaymentProof.createdAt).toBeTruthy()
  })

  it('accepts COMPLETED and APPROVED as confirmed statuses', async () => {
    for (const status of ['COMPLETED', 'APPROVED']) {
      const ctx = makeContext({
        input: { sourceReference: 'PAY-X' },
        state: { ecocashLookup: { status, transactionId: 'tx-x' } },
      })
      await expect(ecocashPaymentProof(ctx)).resolves.toBeUndefined()
      expect(ctx.state.ecocashPaymentProof.transactionStatus).toBe(status)
    }
  })
})
