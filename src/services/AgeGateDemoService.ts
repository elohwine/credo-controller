import type { DcqlQuery } from '@credo-ts/core'

import { Agent } from '@credo-ts/core'
import crypto from 'crypto'
import { container } from 'tsyringe'

import { PLATFORM_IDENTITY_VC_TYPE } from '../config/credentials/PlatformIdentityVC'
import { StatusException } from '../errors'
import { DatabaseManager } from '../persistence/DatabaseManager'
import { extractPresentedCredentials } from './ActorCredentialProofService'
import { SITE_VERIFIER_PREFIX } from './ssi/siteVerifier'
import { shouldUseUnsignedLocalOid4vpRequest, stageProofService, verifierModuleOf } from './ssi/StageProofService'

const PRIVATE_CLAIMS = ['displayName', 'phone', 'email', 'dateOfBirth'] as const

/**
 * Asks the person's PlatformIdentityCredential for only the over18 disclosure. Same credential
 * type the person already holds for sign-in; the sd-jwt variant (see
 * SELECTIVE_DISCLOSURE_VC_TYPES) is what makes "18 or over" shareable without the rest of the
 * card.
 */
export function ageGateQuery(): DcqlQuery {
  return {
    credentials: [
      {
        id: 'age',
        format: 'vc+sd-jwt',
        meta: { vct_values: [PLATFORM_IDENTITY_VC_TYPE] },
        require_cryptographic_holder_binding: true,
        claims: [{ id: 'over18', path: ['over18'], values: ['Yes'] }],
      },
    ],
    credential_sets: [{ options: [['age']], required: true }],
  }
}

/** What the demonstration site is allowed to learn. Anything else is a failed check. */
export function ageGateDecision(subject: Record<string, unknown>): { admitted: boolean; leaked: string[] } {
  const leaked = PRIVATE_CLAIMS.filter((key) => {
    const value = subject[key]
    return value != null && String(value).trim() !== ''
  })
  const over = subject.over18 === 'Yes' || subject.over18 === true
  return { admitted: over && leaked.length === 0, leaked: [...leaked] }
}

export type AgeGateStart = {
  requestId: string
  presentationRequestUrl: string
  pollToken: string
  expiresAt: string
}

export type AgeGatePoll =
  | { status: 'pending'; expiresAt: string }
  | { status: 'admitted'; over18: 'Yes'; memberRef?: string }
  | { status: 'refused'; reason: string }

const hash = (value: string) => crypto.createHash('sha256').update(value).digest('hex')

const DEMO_SITE_KEY = 'age-gate-demo-site'
const DEMO_SITE_VERIFIER = { verifierId: `${SITE_VERIFIER_PREFIX}luckyplay`, clientName: 'LuckyPlay' }

/**
 * A stable member reference for one site, derived from the key the card is bound to. The same
 * wallet gets the same reference on every visit to this site, and a different one on any other
 * site, so sites cannot link a person across services. The key itself is never returned.
 */
export function siteMemberRef(holderId: string | undefined, siteKey = DEMO_SITE_KEY): string | undefined {
  const id = String(holderId || '').trim()
  if (!id) return undefined
  return hash(`${siteKey}:${id}`).slice(0, 12).toUpperCase()
}

function ensureTable(): void {
  DatabaseManager.getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS age_gate_checks (
      request_id TEXT PRIMARY KEY,
      poll_token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `)
}

function demoOrgTenantId(): string {
  const row = DatabaseManager.getDatabase()
    .prepare(`SELECT tenant_id AS tenantId FROM organizations WHERE name = ? LIMIT 1`)
    .get('SGK Construction') as { tenantId?: string } | undefined
  const id = String(row?.tenantId || '').trim()
  if (!id) throw new StatusException('The demonstration organisation is not set up', 404)
  return id
}

export class AgeGateDemoService {
  /**
   * Reissues this person's PlatformIdentityCredential with the date of birth they entered
   * (self-attested) so it can disclose "18 or over" to this demonstration site. The date of
   * birth must be the real one the caller supplies — nothing here invents one. A Central
   * Registry confirmation, when that connection exists, would call
   * IdentityVerificationRequestService.fulfillWithRegistryDateOfBirth instead and arrive at the
   * same card.
   */
  public async issue(
    _orgTenantId: string,
    walletTenantId: string,
    dateOfBirth: string,
    displayName?: string,
  ): Promise<{ status: 'offered' }> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
      throw new StatusException('dateOfBirth must be an ISO date (YYYY-MM-DD)', 400)
    }
    const { SSIAuthService } = await import('./SSIAuthService')
    const ssiAuthService = container.resolve(SSIAuthService)
    const offerUri = await ssiAuthService.reissuePlatformIdentityWithDateOfBirth(
      walletTenantId,
      dateOfBirth,
      'self_attested',
      displayName,
    )
    if (!offerUri) throw new StatusException('Could not create the age verification card', 500)
    return { status: 'offered' }
  }

  public async start(): Promise<AgeGateStart> {
    ensureTable()
    const orgTenantId = demoOrgTenantId()
    const base = container.resolve(Agent as unknown as new (...args: unknown[]) => Agent)
    const started = await (base.modules as any).tenants.withTenantAgent({ tenantId: orgTenantId }, async (tenantAgent: any) => {
      const signer = await stageProofService.getOrCreateDidForAgent(tenantAgent)
      const verifier = await stageProofService.getOrCreateVerifierForAgent(tenantAgent, signer.didUrl, DEMO_SITE_VERIFIER)
      return verifierModuleOf(tenantAgent).createAuthorizationRequest({
        verifierId: verifier.verifierId,
        version: 'v1.draft24',
        expirationInSeconds: 600,
        requestSigner: shouldUseUnsignedLocalOid4vpRequest()
          ? { method: 'none' }
          : { method: 'did', didUrl: verifier.signerDidUrl },
        dcql: { query: ageGateQuery() },
      })
    })
    if (!started?.verificationSession?.id || !started.authorizationRequest) {
      throw new StatusException('The age check could not be started', 500)
    }
    const requestId = String(started.verificationSession.id)
    const pollToken = crypto.randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + 600_000).toISOString()
    DatabaseManager.getDatabase()
      .prepare(
        `INSERT INTO age_gate_checks (request_id, poll_token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)`,
      )
      .run(requestId, hash(pollToken), expiresAt, new Date().toISOString())
    return { requestId, presentationRequestUrl: String(started.authorizationRequest), pollToken, expiresAt }
  }

  public async poll(requestId: string, pollToken: string): Promise<AgeGatePoll> {
    ensureTable()
    const row = DatabaseManager.getDatabase()
      .prepare(`SELECT poll_token_hash, expires_at FROM age_gate_checks WHERE request_id = ?`)
      .get(requestId) as { poll_token_hash: string; expires_at: string } | undefined
    if (!row || !pollToken) throw new StatusException('Unknown age check', 404)
    const given = Buffer.from(hash(pollToken), 'hex')
    const stored = Buffer.from(row.poll_token_hash, 'hex')
    if (given.length !== stored.length || !crypto.timingSafeEqual(given, stored)) {
      throw new StatusException('Unknown age check', 404)
    }
    if (row.expires_at <= new Date().toISOString()) throw new StatusException('This age check has expired', 410)

    const orgTenantId = demoOrgTenantId()
    const base = container.resolve(Agent as unknown as new (...args: unknown[]) => Agent)
    return (base.modules as any).tenants.withTenantAgent({ tenantId: orgTenantId }, async (tenantAgent: any) => {
      const verifier = verifierModuleOf(tenantAgent)
      const session = await verifier.getVerificationSessionById(requestId)
      if (session?.state !== 'ResponseVerified' && session?.state !== 'Error') {
        return { status: 'pending', expiresAt: row.expires_at } satisfies AgeGatePoll
      }
      if (session.state === 'Error') return { status: 'refused', reason: 'The share was rejected' }
      const verified = await verifier.getVerifiedAuthorizationResponse(requestId)
      const cards = extractPresentedCredentials(verified).filter((card) => card.types.includes(PLATFORM_IDENTITY_VC_TYPE))
      const decision = ageGateDecision(cards[0]?.subject || {})
      if (!decision.admitted) {
        return {
          status: 'refused',
          reason: decision.leaked.length
            ? 'The share included details the site did not ask for'
            : 'The share did not confirm 18 or over',
        }
      }
      const memberRef = siteMemberRef(cards[0]?.subject?.id ? String(cards[0].subject.id).split('#')[0] : undefined)
      return memberRef ? { status: 'admitted', over18: 'Yes', memberRef } : { status: 'admitted', over18: 'Yes' }
    })
  }
}

export const ageGateDemoService = new AgeGateDemoService()
