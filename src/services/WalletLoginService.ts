import type { SSIAuthService } from './SSIAuthService'
import type { PlatformIdentityClaims } from '../config/credentials/PlatformIdentityVC'
import type { Agent } from '@credo-ts/core'

import { W3cJwtVerifiablePresentation } from '@credo-ts/core'
import crypto from 'crypto'

import { PLATFORM_IDENTITY_VC_TYPE } from '../config/credentials/PlatformIdentityVC'
import { StatusException } from '../errors'
import { DatabaseManager } from '../persistence/DatabaseManager'

import { shouldAllowWholeCardType } from './ssi/proofModeMatrix'
import { shouldUseUnsignedLocalOid4vpRequest, stageProofService, verifierModuleOf } from './ssi/StageProofService'

const LOGIN_TTL_MS = 5 * 60 * 1000

export interface WalletLoginStart {
  loginId: string
  authorizationRequest: string
  pollToken: string
  expiresAt: string
}

export type WalletLoginPoll =
  | { status: 'pending'; expiresAt: string }
  | { status: 'verified'; token: string; tenantId: string; claims: PlatformIdentityClaims }

interface WalletLoginRow {
  login_id: string
  poll_token_hash: string
  expires_at: string
  consumed_at: string | null
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex')
  const right = Buffer.from(b, 'hex')
  return left.length === right.length && crypto.timingSafeEqual(left, right)
}

/**
 * Cross-device "sign in with your wallet". The platform (root agent) opens an OpenID4VP
 * request for a PlatformIdentityCredential; the wallet answers the request directly to the
 * verifier, and the browser that started the sign-in collects one session token with its
 * secret poll token. No presentation is ever accepted from the browser.
 */
export class WalletLoginService {
  public constructor(
    private readonly agent: Agent,
    private readonly ssiAuthService: SSIAuthService,
  ) {}

  public async start(): Promise<WalletLoginStart> {
    if (!shouldAllowWholeCardType('wallet_login', PLATFORM_IDENTITY_VC_TYPE)) {
      throw new StatusException('Wallet sign-in proof policy does not allow PlatformIdentityCredential', 500)
    }
    const signer = await stageProofService.getOrCreateDidForAgent(this.agent)
    const { verifierId, signerDidUrl } = await stageProofService.getOrCreateVerifierForAgent(this.agent, signer.didUrl)
    const result = await verifierModuleOf(this.agent).createAuthorizationRequest({
      verifierId,
      version: 'v1.draft24',
      requestSigner: shouldUseUnsignedLocalOid4vpRequest()
        ? { method: 'none' }
        : { method: 'did', didUrl: signerDidUrl },
      presentationExchange: {
        definition: {
          id: `platform-login-${crypto.randomUUID()}`,
          input_descriptors: [
            {
              id: 'platform-identity',
              name: 'Platform identity',
              purpose: 'Sign in',
              constraints: {
                fields: [
                  {
                    path: ['$.type', '$.vc.type'],
                    filter: { type: 'array', contains: { const: PLATFORM_IDENTITY_VC_TYPE } },
                  },
                ],
              },
            },
          ],
        },
      },
    })

    const loginId = result.verificationSession?.id as string | undefined
    if (!loginId) throw new StatusException('Unable to start wallet sign-in', 500)
    const authorizationRequest = result.authorizationRequest
    if (typeof authorizationRequest !== 'string' || !authorizationRequest) {
      throw new StatusException('Verifier did not return a wallet authorization request', 500)
    }

    const pollToken = crypto.randomBytes(32).toString('base64url')
    const now = new Date()
    const expiresAt = new Date(now.getTime() + LOGIN_TTL_MS).toISOString()
    DatabaseManager.getDatabase()
      .prepare(
        'INSERT INTO wallet_login_sessions (login_id, poll_token_hash, created_at, expires_at) VALUES (?, ?, ?, ?)',
      )
      .run(loginId, hashToken(pollToken), now.toISOString(), expiresAt)

    return { loginId, authorizationRequest, pollToken, expiresAt }
  }

  public async poll(loginId: string, pollToken: string): Promise<WalletLoginPoll> {
    const db = DatabaseManager.getDatabase()
    const row = db
      .prepare(
        'SELECT login_id, poll_token_hash, expires_at, consumed_at FROM wallet_login_sessions WHERE login_id = ?',
      )
      .get(loginId) as WalletLoginRow | undefined
    if (!row || !pollToken || !sameHash(row.poll_token_hash, hashToken(pollToken))) {
      throw new StatusException('Unknown sign-in', 404)
    }
    if (row.consumed_at) throw new StatusException('This sign-in has already been used', 410)
    if (new Date(row.expires_at).getTime() <= Date.now()) throw new StatusException('This sign-in has expired', 410)

    const verifier = verifierModuleOf(this.agent)
    const session = await verifier.getVerificationSessionById(loginId)
    if (session?.state === 'Error') {
      this.consume(loginId)
      throw new StatusException('The wallet response was rejected', 401)
    }
    if (session?.state !== 'ResponseVerified') return { status: 'pending', expiresAt: row.expires_at }

    // One token per sign-in: claim the session before issuing anything.
    if (!this.consume(loginId)) throw new StatusException('This sign-in has already been used', 410)

    const verified = await verifier.getVerifiedAuthorizationResponse(loginId)
    const presentations: unknown[] = verified?.presentationExchange?.presentations ?? []
    const presentation = presentations.find(
      (item): item is W3cJwtVerifiablePresentation => item instanceof W3cJwtVerifiablePresentation,
    )
    if (!presentation) throw new StatusException('The wallet did not share a platform identity', 401)

    try {
      const session = await this.ssiAuthService.loginWithVerifiedPresentation(presentation)
      return { status: 'verified', ...session }
    } catch (error: any) {
      throw new StatusException(error?.message || 'Wallet sign-in failed', 401)
    }
  }

  private consume(loginId: string): boolean {
    return (
      DatabaseManager.getDatabase()
        .prepare(
          'UPDATE wallet_login_sessions SET consumed_at = ? WHERE login_id = ? AND consumed_at IS NULL AND expires_at > ?',
        )
        .run(new Date().toISOString(), loginId, new Date().toISOString()).changes === 1
    )
  }
}
