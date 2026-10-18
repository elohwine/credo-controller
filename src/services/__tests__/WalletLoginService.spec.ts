import 'reflect-metadata'
import { W3cJwtVerifiablePresentation } from '@credo-ts/core'
import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals'
import Database from 'better-sqlite3'
import { readFileSync } from 'fs'
import { join } from 'path'

import { DatabaseManager } from '../../persistence/DatabaseManager'

const sessions = new Map<string, { state: string; presentations?: unknown[] }>()
let created = 0
const createAuthorizationRequest = jest.fn(async () => {
  const id = `session-${++created}`
  sessions.set(id, { state: 'RequestCreated' })
  return {
    authorizationRequest: `openid4vp://authorize?client_id=did%3Adid%3Akey%3Az6Mkplatform&request_uri=${encodeURIComponent(`https://credentis.test/oidc/verifier/request/${id}`)}&request_uri_method=get`,
    verificationSession: { id, authorizationRequestUri: `https://credentis.test/oidc/verifier/request/${id}` },
  }
})
const verifier = {
  createAuthorizationRequest,
  getVerificationSessionById: async (id: string) => sessions.get(id),
  getVerifiedAuthorizationResponse: async (id: string) => ({
    presentationExchange: { presentations: sessions.get(id)?.presentations ?? [] },
  }),
}

jest.unstable_mockModule('../ssi/StageProofService', () => ({
  shouldUseUnsignedLocalOid4vpRequest: () => false,
  verifierModuleOf: () => verifier,
  stageProofService: {
    getOrCreateDidForAgent: async () => ({ did: 'did:key:z6Mkplatform', didUrl: 'did:key:z6Mkplatform#key' }),
    getOrCreateVerifierForAgent: async () => ({ verifierId: 'platform', signerDidUrl: 'did:key:z6Mkplatform#key' }),
  },
}))

function fakePresentation(): W3cJwtVerifiablePresentation {
  return Object.create(W3cJwtVerifiablePresentation.prototype)
}

describe('WalletLoginService', () => {
  let db: Database.Database
  let service: any
  const loginWithVerifiedPresentation = jest.fn(async (_presentation: unknown) => ({
    token: 'session-token',
    tenantId: 'tenant-1',
    claims: {},
  }))

  beforeAll(async () => {
    db = new Database(':memory:')
    db.exec(readFileSync(join(process.cwd(), 'migrations/120_wallet_login_sessions.sql'), 'utf8'))
    ;(DatabaseManager as any).instance = db
    const { WalletLoginService } = await import('../WalletLoginService')
    service = new WalletLoginService({} as any, { loginWithVerifiedPresentation } as any)
  })

  afterAll(() => {
    ;(DatabaseManager as any).instance = undefined
  })

  beforeEach(() => {
    loginWithVerifiedPresentation.mockClear()
  })

  it('asks the wallet for a platform identity by reference and keeps only a hash of the poll token', async () => {
    const start = await service.start()
    expect(start.authorizationRequest).toBe(
      `openid4vp://authorize?client_id=did%3Adid%3Akey%3Az6Mkplatform&request_uri=${encodeURIComponent(`https://credentis.test/oidc/verifier/request/${start.loginId}`)}&request_uri_method=get`,
    )
    const definition = (createAuthorizationRequest.mock.calls.at(-1) as any)[0].presentationExchange.definition
    expect(JSON.stringify(definition)).toContain('PlatformIdentityCredential')
    const row = db
      .prepare('SELECT poll_token_hash FROM wallet_login_sessions WHERE login_id = ?')
      .get(start.loginId) as any
    expect(row.poll_token_hash).not.toContain(start.pollToken)
  })

  it('only answers the browser holding the poll token', async () => {
    const start = await service.start()
    await expect(service.poll(start.loginId, 'guess')).rejects.toMatchObject({ status: 404 })
    await expect(service.poll(start.loginId, '')).rejects.toMatchObject({ status: 404 })
  })

  it('does not replace a missing SDK request with an incomplete request_uri wrapper', async () => {
    createAuthorizationRequest.mockResolvedValueOnce({
      authorizationRequest: '',
      verificationSession: { id: 'missing-request', authorizationRequestUri: 'https://credentis.test/request' },
    })
    await expect(service.start()).rejects.toMatchObject({ status: 500 })
    expect(
      db.prepare('SELECT login_id FROM wallet_login_sessions WHERE login_id = ?').get('missing-request'),
    ).toBeUndefined()
  })

  it('stays pending until the wallet answers, then issues one token', async () => {
    const start = await service.start()
    expect(await service.poll(start.loginId, start.pollToken)).toMatchObject({ status: 'pending' })

    const presentation = fakePresentation()
    sessions.set(start.loginId, { state: 'ResponseVerified', presentations: [presentation] })
    const result = await service.poll(start.loginId, start.pollToken)
    expect(result).toMatchObject({ status: 'verified', token: 'session-token', tenantId: 'tenant-1' })
    expect(loginWithVerifiedPresentation).toHaveBeenCalledWith(presentation)

    await expect(service.poll(start.loginId, start.pollToken)).rejects.toMatchObject({ status: 410 })
    expect(loginWithVerifiedPresentation).toHaveBeenCalledTimes(1)
  })

  it('fails and burns the sign-in when the account checks refuse the presentation', async () => {
    const start = await service.start()
    sessions.set(start.loginId, { state: 'ResponseVerified', presentations: [fakePresentation()] })
    loginWithVerifiedPresentation.mockRejectedValueOnce(
      new Error('Presentation is not bound to the credential subject'),
    )
    await expect(service.poll(start.loginId, start.pollToken)).rejects.toMatchObject({ status: 401 })
    await expect(service.poll(start.loginId, start.pollToken)).rejects.toMatchObject({ status: 410 })
  })

  it('fails when the verifier rejected the wallet response', async () => {
    const start = await service.start()
    sessions.set(start.loginId, { state: 'Error' })
    await expect(service.poll(start.loginId, start.pollToken)).rejects.toMatchObject({ status: 401 })
  })

  it('fails when the wallet shared no platform identity presentation', async () => {
    const start = await service.start()
    sessions.set(start.loginId, { state: 'ResponseVerified', presentations: [{ notA: 'jwt presentation' }] })
    await expect(service.poll(start.loginId, start.pollToken)).rejects.toMatchObject({ status: 401 })
    expect(loginWithVerifiedPresentation).not.toHaveBeenCalled()
  })

  it('refuses an expired sign-in', async () => {
    const start = await service.start()
    db.prepare('UPDATE wallet_login_sessions SET expires_at = ? WHERE login_id = ?').run(
      new Date(Date.now() - 1000).toISOString(),
      start.loginId,
    )
    sessions.set(start.loginId, { state: 'ResponseVerified', presentations: [fakePresentation()] })
    await expect(service.poll(start.loginId, start.pollToken)).rejects.toMatchObject({ status: 410 })
    expect(loginWithVerifiedPresentation).not.toHaveBeenCalled()
  })
})
