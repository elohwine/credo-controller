import { RequestContextValidator } from '../RequestContextValidator'

describe('RequestContextValidator', () => {
  let validator: RequestContextValidator

  beforeEach(() => {
    validator = new RequestContextValidator()
  })

  // ── Global denied keys ──────────────────────────────────────────────────────

  it('rejects a context containing a globally denied top-level key', () => {
    const result = validator.validate('platform.general', { password: 'hunter2' })
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toMatch(/password/)
  })

  it('rejects a context containing a private key field', () => {
    const result = validator.validate('finance.payment_request', { privateKey: 'abc123' })
    expect(result.valid).toBe(false)
    expect(result.errors.join()).toMatch(/privateKey/)
  })

  it('rejects a context containing a raw credential field', () => {
    const result = validator.validate('hr.onboarding', { credential: { type: 'VerifiableCredential' } })
    expect(result.valid).toBe(false)
  })

  it('rejects a context whose nested object contains a denied key', () => {
    const result = validator.validate('platform.general', {
      referenceCode: 'ok',
      nested: { secretKey: 'leak' },
    })
    expect(result.valid).toBe(false)
    expect(result.errors.join()).toMatch(/secretKey/)
  })

  // ── JWT / credential material detection ────────────────────────────────────

  it('rejects a JWT string stored in context', () => {
    // Build a minimal valid JWT header + payload
    const header = Buffer.from(JSON.stringify({ alg: 'EdDSA', typ: 'JWT' })).toString('base64url')
    const payload = Buffer.from(JSON.stringify({ sub: 'test' })).toString('base64url')
    const fakeJwt = `${header}.${payload}.fakesig`

    const result = validator.validate('platform.general', { purposeCode: fakeJwt })
    expect(result.valid).toBe(false)
    expect(result.errors.join()).toMatch(/JWT/)
  })

  it('does NOT flag a normal short string as a JWT', () => {
    const result = validator.validate('platform.general', { purposeCode: 'INVOICE-001' })
    expect(result.valid).toBe(true)
  })

  // ── JSON-LD / raw credential object detection ───────────────────────────────

  it('rejects a context key containing a JSON-LD object with @context', () => {
    const result = validator.validate('platform.general', {
      purposeCode: 'ok',
      evidenceDoc: { '@context': ['https://www.w3.org/2018/credentials/v1'], type: 'VerifiableCredential' },
    })
    expect(result.valid).toBe(false)
    expect(result.errors.join()).toMatch(/JSON-LD|context_json/)
  })

  // ── Per-requestType schema enforcement ─────────────────────────────────────

  it('allows all valid keys for finance.payment_request', () => {
    const result = validator.validate('finance.payment_request', {
      paymentReference: 'PAY-001',
      invoiceRef: 'INV-002',
      purposeCode: 'SUPPLIER',
    })
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('rejects unknown keys for a known requestType', () => {
    const result = validator.validate('finance.payment_request', {
      paymentReference: 'PAY-001',
      holderDid: 'did:key:xyz', // not allowed for this type
    })
    expect(result.valid).toBe(false)
    expect(result.errors.join()).toMatch(/holderDid/)
  })

  it('allows an empty context for any known requestType', () => {
    const result = validator.validate('hr.onboarding', {})
    expect(result.valid).toBe(true)
  })

  // ── Unknown request types ───────────────────────────────────────────────────

  it('warns but allows context for an unknown requestType', () => {
    const result = validator.validate('custom.unknown_type', { anything: 'goes' })
    expect(result.valid).toBe(true)
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.warnings[0]).toMatch(/No context schema/)
  })

  it('still rejects globally denied keys even for unknown requestTypes', () => {
    const result = validator.validate('custom.unknown_type', { apiKey: 'secret' })
    expect(result.valid).toBe(false)
  })

  // ── Multiple errors ─────────────────────────────────────────────────────────

  it('accumulates multiple error messages', () => {
    const result = validator.validate('finance.payment_request', {
      password: 'x',
      privateKey: 'y',
      holderDid: 'z',
    })
    expect(result.valid).toBe(false)
    // Both globally denied keys appear in a single combined error message
    expect(result.errors.join()).toMatch(/password/)
    expect(result.errors.join()).toMatch(/privateKey/)
  })
})
