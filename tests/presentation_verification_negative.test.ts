/**
 * Presentation verification must fail closed. Credo checks the protocol; these tests drive the
 * platform policy on top of it with a stand-in Credo verifier and real trust/request tables.
 */

import 'reflect-metadata'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals'
import { Agent } from '@credo-ts/core'
import { randomUUID } from 'crypto'
import { container } from 'tsyringe'

import { DatabaseManager } from '../src/persistence/DatabaseManager'
import { IssuedCredentialRepository } from '../src/persistence/IssuedCredentialRepository'
import { credentialStatusService } from '../src/services/ssi/CredentialStatusService'
import { CredoPresentationVerificationService } from '../src/services/ssi/CredoPresentationVerificationService'

import { initTestDatabases, seedOrganization, type TestDatabases } from './utils/orgReadinessFixture'

const ISSUER = 'did:key:z6MkTrustedIssuer'
const CLIENT_ID = 'https://verifier.example/client'
const NONCE = 'nonce-123'
const VERIFIER_ID = 'credo-verifier-1'

const jwt = (payload: Record<string, unknown>) =>
  ['e30', Buffer.from(JSON.stringify(payload)).toString('base64url'), 'sig'].join('.')

let databases: TestDatabases
let orgA: { orgTenantId: string; organizationId: string }
let orgB: { orgTenantId: string; organizationId: string }
let credo: { verifyAuthorizationResponse: jest.Mock<(input: any) => Promise<any>> }
const service = new CredoPresentationVerificationService()

function seedVerifier(organizationId: string) {
  const db = DatabaseManager.getDatabase()
  const anchorId = randomUUID()
  db.prepare(
    `INSERT INTO trust_anchors (id, organization_id, anchor_type, subject_ref, status) VALUES (?, ?, 'issuer', ?, 'active')`,
  ).run(anchorId, organizationId, ISSUER)
  db.prepare(
    `INSERT INTO verifier_registrations (id, organization_id, verifier_ref, status, credo_verifier_id_ref, signer_did_url_ref)
     VALUES (?, ?, 'verifier-main', 'active', ?, 'did:key:z6MkVerifier#key-1')`,
  ).run(randomUUID(), organizationId, VERIFIER_ID)
}

function newRequest(organizationId: string, minutes = 10) {
  const requestId = randomUUID()
  const state = `state-${requestId}`
  DatabaseManager.getDatabase()
    .prepare(
      `INSERT INTO presentation_requests
        (id, organization_id, verifier_ref, purpose_code, query_language, query_ref, expires_at,
         protocol, credo_verification_session_id, protocol_state)
       VALUES (?, ?, 'verifier-main', 'test', 'dcql', 'q', ?, 'openid4vp', ?, ?)`,
    )
    .run(
      requestId,
      organizationId,
      new Date(Date.now() + minutes * 60_000).toISOString(),
      `session-${requestId}`,
      state,
    )
  return { requestId, state }
}

/** What Credo returns for an answer; each override breaks one property. */
function credoResult(state: string, overrides: { [key: string]: unknown } = {}) {
  const credential = {
    id: `urn:uuid:${randomUUID()}`,
    type: ['VerifiableCredential', 'EmployeeCredential'],
    issuer: overrides.issuer ?? ISSUER,
    credentialStatus: { type: 'BitstringStatusListEntry' },
  }
  return {
    verificationSession: {
      state: overrides.sessionState ?? 'ResponseVerified',
      verifierId: overrides.verifierId ?? VERIFIER_ID,
      authorizationRequestJwt: jwt({ client_id: CLIENT_ID, nonce: NONCE }),
      authorizationResponsePayload: {
        state: overrides.responseState ?? state,
        id_token: jwt({
          sub: 'sub' in overrides ? overrides.sub : 'did:key:z6MkHolder',
          aud: overrides.aud ?? CLIENT_ID,
          nonce: overrides.nonce ?? NONCE,
        }),
      },
    },
    dcql: { presentations: overrides.empty ? {} : { staff: [{ verifiableCredential: credential }] } },
    credential,
  }
}

async function answer(tenantId: string, request: { requestId: string; state: string }, overrides = {}) {
  const result = credoResult(request.state, overrides)
  credo.verifyAuthorizationResponse.mockResolvedValueOnce(result)
  const verdict = await service.verify({
    tenantId,
    requestId: request.requestId,
    state: request.state,
    verifiablePresentation: 'vp',
    request: { agent: { modules: { openId4VcVerifier: credo } }, logger: console } as any,
  })
  return { verdict, credentialId: result.credential.id }
}

beforeAll(() => {
  databases = initTestDatabases('credo-vp-negative-')
  orgA = seedOrganization({ name: 'Org A' })
  orgB = seedOrganization({ name: 'Org B' })
  seedVerifier(orgA.organizationId)
  seedVerifier(orgB.organizationId)
  // A root agent without the tenants module: the request's own agent verifies.
  container.registerInstance(Agent as any, { modules: {} })
})

afterAll(() => databases.cleanup())

beforeEach(() => {
  credo = { verifyAuthorizationResponse: jest.fn<(input: any) => Promise<any>>() }
  jest.spyOn(credentialStatusService, 'resolve').mockResolvedValue({ status: 'valid', checked: true } as any)
})

afterEach(() => jest.restoreAllMocks())

describe('presentation verification fails closed', () => {
  test('a correct answer verifies, and every check is recorded', async () => {
    const { verdict } = await answer(orgA.orgTenantId, newRequest(orgA.organizationId))
    expect(verdict).toMatchObject({ verified: true, reasonCode: 'verified', credentialCount: 1, statusChecked: true })
    const row = DatabaseManager.getDatabase()
      .prepare(
        'SELECT nonce_verified AS n, audience_verified AS a, trust_verified AS t FROM presentation_results WHERE id = ?',
      )
      .get(verdict.resultId) as any
    expect(row).toEqual({ n: 1, a: 1, t: 1 })
  })

  test('the wrong nonce is refused', async () => {
    const { verdict } = await answer(orgA.orgTenantId, newRequest(orgA.organizationId), {
      nonce: 'someone-elses-nonce',
    })
    expect(verdict).toMatchObject({ verified: false, reasonCode: 'nonce_mismatch' })
  })

  test('an answer meant for another verifier (audience) is refused', async () => {
    const { verdict } = await answer(orgA.orgTenantId, newRequest(orgA.organizationId), { aud: 'https://evil.example' })
    expect(verdict).toMatchObject({ verified: false, reasonCode: 'audience_mismatch' })
  })

  test('an answer with no holder is refused', async () => {
    const { verdict } = await answer(orgA.orgTenantId, newRequest(orgA.organizationId), { sub: undefined })
    expect(verdict).toMatchObject({ verified: false, reasonCode: 'holder_binding_failed' })
  })

  test('a response for another state, or a session Credo did not verify, is refused', async () => {
    const swapped = await answer(orgA.orgTenantId, newRequest(orgA.organizationId), { responseState: 'state-other' })
    expect(swapped.verdict).toMatchObject({ verified: false, reasonCode: 'protocol_state_mismatch' })
    const unverified = await answer(orgA.orgTenantId, newRequest(orgA.organizationId), { sessionState: 'Error' })
    expect(unverified.verdict).toMatchObject({ verified: false, reasonCode: 'protocol_verification_failed' })
    const otherVerifier = await answer(orgA.orgTenantId, newRequest(orgA.organizationId), {
      verifierId: 'another-verifier',
    })
    expect(otherVerifier.verdict).toMatchObject({ verified: false, reasonCode: 'verifier_session_mismatch' })
  })

  test('the wrong state on the request itself never reaches Credo', async () => {
    const request = newRequest(orgA.organizationId)
    await expect(answer(orgA.orgTenantId, { ...request, state: 'guessed-state' })).rejects.toThrow(
      /state does not match/,
    )
    expect(credo.verifyAuthorizationResponse).not.toHaveBeenCalled()
  })

  test('replaying an answer to a request that was already verified is refused', async () => {
    const request = newRequest(orgA.organizationId)
    expect((await answer(orgA.orgTenantId, request)).verdict.verified).toBe(true)
    credo.verifyAuthorizationResponse.mockReset()
    const replay = await service.verify({
      tenantId: orgA.orgTenantId,
      requestId: request.requestId,
      state: request.state,
      verifiablePresentation: 'vp',
      request: { agent: { modules: { openId4VcVerifier: credo } }, logger: console } as any,
    })
    expect(replay).toMatchObject({ verified: false, reasonCode: 'presentation_already_used' })
    expect(credo.verifyAuthorizationResponse).not.toHaveBeenCalled()
  })

  test('a revoked credential is refused, by status list or by our own record', async () => {
    jest.spyOn(credentialStatusService, 'resolve').mockResolvedValueOnce({ status: 'revoked', checked: true } as any)
    const listed = await answer(orgA.orgTenantId, newRequest(orgA.organizationId))
    expect(listed.verdict).toMatchObject({ verified: false, reasonCode: 'credential_status_invalid' })

    jest.spyOn(IssuedCredentialRepository.prototype, 'isRevoked').mockReturnValue(true)
    const local = await answer(orgA.orgTenantId, newRequest(orgA.organizationId))
    expect(local.verdict).toMatchObject({ verified: false, reasonCode: 'credential_status_invalid' })
  })

  test('a credential whose status cannot be checked is not trusted', async () => {
    jest.spyOn(credentialStatusService, 'resolve').mockResolvedValueOnce({ status: 'unknown', checked: false } as any)
    const { verdict } = await answer(orgA.orgTenantId, newRequest(orgA.organizationId))
    expect(verdict).toMatchObject({ verified: false, reasonCode: 'credential_status_unverified' })
  })

  test('a credential from an issuer this organisation does not trust is refused', async () => {
    const { verdict } = await answer(orgA.orgTenantId, newRequest(orgA.organizationId), {
      issuer: 'did:key:z6MkStranger',
    })
    expect(verdict).toMatchObject({ verified: false, reasonCode: 'issuer_untrusted' })
  })

  test('an answer with nothing in it is refused', async () => {
    const { verdict } = await answer(orgA.orgTenantId, newRequest(orgA.organizationId), { empty: true })
    expect(verdict).toMatchObject({ verified: false, reasonCode: 'no_credentials_presented' })
  })

  test("one organisation cannot answer or read another organisation's request", async () => {
    const theirs = newRequest(orgB.organizationId)
    await expect(answer(orgA.orgTenantId, theirs)).rejects.toThrow()
    expect(credo.verifyAuthorizationResponse).not.toHaveBeenCalled()
  })

  test('an expired request is refused before Credo is asked', async () => {
    const expired = newRequest(orgA.organizationId, -1)
    await expect(answer(orgA.orgTenantId, expired)).rejects.toThrow()
    expect(credo.verifyAuthorizationResponse).not.toHaveBeenCalled()
  })

  test('a Credo error never verifies', async () => {
    const request = newRequest(orgA.organizationId)
    credo.verifyAuthorizationResponse.mockRejectedValueOnce(new Error('invalid signature'))
    const verdict = await service.verify({
      tenantId: orgA.orgTenantId,
      requestId: request.requestId,
      state: request.state,
      verifiablePresentation: 'tampered',
      request: { agent: { modules: { openId4VcVerifier: credo } }, logger: console } as any,
    })
    expect(verdict).toMatchObject({ verified: false, reasonCode: 'verification_failed' })
  })
})
