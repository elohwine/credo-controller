/* eslint-disable @typescript-eslint/explicit-member-accessibility */
/* eslint-disable no-console */
import 'reflect-metadata'
import type { RestMultiTenantAgentModules } from '../../cliAgent'
import type { WalletLoginPoll, WalletLoginStart } from '../../services/WalletLoginService'
import type { Request as ExRequest } from 'express'

import { Agent, W3cCredentialService, getPublicJwkFromVerificationMethod } from '@credo-ts/core'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import { Controller, Post, Get, Route, Tags, Body, Request, Path, Header } from 'tsoa'
import { container, inject, injectable } from 'tsyringe'

import { AgentRole } from '../../enums'
import { StatusException } from '../../errors'
import { UnauthorizedError } from '../../errors/errors'
import { DatabaseManager } from '../../persistence/DatabaseManager'
import {
  saveLoginChallenge,
  consumeLoginChallenge,
  cleanupExpiredChallenges,
} from '../../persistence/LoginChallengeRepository'
import { getWalletUserByWalletId } from '../../persistence/UserRepository'
import { saveWalletCredential, getWalletCredentialsByWalletId } from '../../persistence/WalletCredentialRepository'
import {
  findTenantByPhone,
  claimTenantForUser,
  getTenantCredentialCount,
} from '../../services/PhoneTenantLinkingService'
import { InviteRequiredError, SSIAuthService } from '../../services/SSIAuthService'
import { WalletLoginService } from '../../services/WalletLoginService'
import { stageProofService } from '../../services/ssi/StageProofService'
import { deviceTrustService } from '../../services/DeviceTrustService'
// import type { VerifyPresentationRequestBody } from '../../types/api'

interface SameDeviceLoginBody {
  /** Wallet already on this phone. It must hold the platform identity card. */
  walletId: string
  /** Authorization request from POST /login-wallet. The phone does not scan it. */
  authorizationRequest: string
  deviceAssertion?: {
    deviceKeyId: string
    nonce: string
    purpose: string
    signedAt: string
    signature: string
  }
}

interface LoginRequest {
  username?: string
  email?: string
  phone?: string // Fastlane: Support phone-based login
  pin?: string // SSI: Optional PIN for Web2-friendly login
  [key: string]: any // Allow additional properties from auth module
}

interface RegisterRequest {
  username: string
  email?: string // Optional if phone is provided
  phone?: string // Fastlane: Phone-first registration
  pin?: string // SSI: Optional PIN for Web2-friendly login fallback
  tenantType?: 'USER' | 'ORG'
  domain?: string
  claimExistingTenant?: boolean // If true, claim any existing tenant linked to this phone
}

interface InviteSummary {
  orgName: string
  role: string
  /** The name the organisation entered. The person confirms or corrects it. */
  proposedName?: string
  /** Last digits of the invited phone number */
  phoneHint?: string
}

interface AcceptInviteRequest {
  code: string
  name: string
  /** The invited phone number; must match the account. */
  phone: string
  /** 4 to 6 digits, chosen by the person */
  pin: string
}

interface LoginChallengeResponse {
  nonce: string
  expiresAt: string
}

interface LoginVerifyRequest {
  did: string
  signature: string
  nonce: string
}

interface SessionResponse {
  id: string
  username: string
  email: string
  walletId: string
}

interface WalletListing {
  id: string
  name: string
  createdOn: string
  addedOn: string
  permission: string
}

interface WalletListings {
  account: string
  wallets: WalletListing[]
}

@Route('api/wallet/auth')
@Tags('Wallet-Auth')
@injectable()
export class WalletAuthController extends Controller {
  constructor(@inject(SSIAuthService) private ssiAuthService: SSIAuthService) {
    super()
  }

  @Post('/register')
  public async register(
    @Request() request: ExRequest,
    @Body() body: RegisterRequest,
  ): Promise<{
    message: string
    walletId: string
    holderDid?: string
    claimedExistingTenant?: boolean
    existingCredentialsCount?: number
    vcOfferUrl?: string
    vcOfferAutoAccepted?: boolean
  }> {
    let claimExistingTenantId: string | undefined
    let existingCredentialsCount = 0

    // Fastlane: Check if phone has an associated anonymous tenant
    if (body.claimExistingTenant && body.phone) {
      // Use SSIAuthService (temp_phone_links) instead of PhoneTenantLinkingService (browser_session_tenants)
      // to ensure compatibility with WhatsApp/Checkout flows
      const existingTenantId = await this.ssiAuthService.findTenantByPhone(body.phone)

      if (existingTenantId) {
        // Check if it's already claimed/registered?
        // SSIAuthService.findTenantByPhone returns IDs from temp links (unclaimed usually)
        // or we can check via ssi_users table if we had that method exposed

        // Assume if it's in temp links, it's a candidate for claiming
        // OR it might be the registered tenant ID if we updated checkout logic
        claimExistingTenantId = existingTenantId

        // Optional: Get credential count for logging
        try {
          existingCredentialsCount = getTenantCredentialCount(existingTenantId)
        } catch (e) {
          // Ignore count error
        }

        request.logger?.info(
          {
            phone: body.phone,
            tenantId: claimExistingTenantId,
            creds: existingCredentialsCount,
          },
          'Found existing tenant to claim via SSIAuthService',
        )
      }
    }

    try {
      const result = await this.ssiAuthService.register({
        username: body.username,
        pin: body.pin,
        email: body.email,
        phone: body.phone,
        claimExistingTenantId,
      })

      // If we claimed a tenant, ensure the link is finalized
      if (claimExistingTenantId) {
        try {
          // If we accessed the user ID from the result (implied), we'd use it here.
          // The service handles most logic, but let's confirm usage.
        } catch (e) {
          // ignore
        }
      }

      return {
        message: 'User registered successfully (SSI)',
        walletId: result.walletId,
        claimedExistingTenant: !!claimExistingTenantId,
        existingCredentialsCount,
        vcOfferUrl: result.vcOfferUrl,
        vcOfferAutoAccepted: result.vcOfferAutoAccepted,
      }
    } catch (e: any) {
      if (e.message.includes('already exists')) {
        this.setStatus(400)
      } else {
        console.error('Registration failed:', e)
        this.setStatus(500)
      }
      throw e
    }
  }

  @Post('/login')
  public async login(
    @Request() request: ExRequest,
    @Body() body: LoginRequest,
  ): Promise<{ token: string; hasGenericId?: boolean }> {
    console.log('[LOGIN] ===== START LOGIN FLOW (SSI) =====')

    try {
      // If no PIN provided, we can't do PIN-based login
      if (!body.pin) {
        this.setStatus(400)
        throw new Error('PIN required for login')
      }

      const result = await this.ssiAuthService.loginWithPin({
        phone: body.phone,
        email: body.email || (body.username?.includes('@') ? body.username : undefined),
        pin: body.pin,
      })

      console.log('[LOGIN] User authenticated via SSI Service')
      return {
        token: result.token,
        hasGenericId: true,
      }
    } catch (e: any) {
      console.log('[LOGIN] Authentication failed:', e.message)
      if (e instanceof InviteRequiredError) throw new StatusException(e.message, 403)
      throw new StatusException('Invalid credentials', 401)
    }
  }

  /** What an invite link is for, before the person accepts it. */
  @Get('/invite/{code}')
  public async describeInvite(@Path() code: string): Promise<InviteSummary> {
    try {
      return this.ssiAuthService.describeInvite(code)
    } catch (e: any) {
      throw new StatusException(e.message, 404)
    }
  }

  /** The invited person confirms their name and chooses their own PIN, then is signed in. */
  @Post('/invite/accept')
  public async acceptInvite(
    @Body() body: AcceptInviteRequest,
  ): Promise<{ token: string; tenantId: string; name: string }> {
    try {
      return await this.ssiAuthService.acceptInvite(body)
    } catch (e: any) {
      const message = String(e?.message || 'Could not accept the invite')
      if (/expired|replaced/.test(message)) throw new StatusException(message, 404)
      if (/already chosen/.test(message)) throw new StatusException(message, 409)
      if (/Enter your name|PIN of|not the phone/.test(message)) throw new StatusException(message, 400)
      throw e
    }
  }

  /**
   * Start a cross-device wallet sign-in (OpenID4VP). Show `authorizationRequest` as a QR
   * code for the wallet, keep `pollToken` in this browser only, and poll
   * `GET /login-wallet/{loginId}` with it until the wallet has answered.
   */
  @Post('/login-wallet')
  public async loginWithWallet(): Promise<WalletLoginStart> {
    return this.walletLoginService().start()
  }

  /**
   * Collect the result of a wallet sign-in. Returns `pending` until the wallet has answered
   * the verifier, then issues one session token for the verified account.
   */
  @Get('/login-wallet/{loginId}')
  public async walletLoginStatus(
    @Path() loginId: string,
    @Header('x-login-poll-token') pollToken: string,
  ): Promise<WalletLoginPoll> {
    return this.walletLoginService().poll(loginId, pollToken)
  }

  /**
   * Same-device sign-in. The phone starts a wallet login, then answers it here
   * with the platform card already in its wallet. No QR. Fingerprint or face is
   * required when this phone is enrolled.
   */
  @Post('/login-wallet/present')
  public async presentSameDeviceLogin(
    @Request() request: ExRequest,
    @Body() body: SameDeviceLoginBody,
  ): Promise<{ presented: true }> {
    if (!body?.walletId || !body?.authorizationRequest) {
      this.setStatus(400)
      throw new StatusException('walletId and authorizationRequest are required', 400)
    }
    const account = DatabaseManager.getDatabase()
      .prepare('SELECT id FROM ssi_users WHERE tenant_id = ?')
      .get(body.walletId) as { id?: string } | undefined
    if (!account?.id) {
      this.setStatus(404)
      throw new StatusException('This phone has no account yet. Sign in with your PIN once.', 404)
    }
    const enrolled = deviceTrustService.list(body.walletId).some((device) => !device.revokedAt)
    if (enrolled) {
      if (!body.deviceAssertion) {
        this.setStatus(403)
        throw new StatusException('Confirm with fingerprint or face on this phone.', 403)
      }
      deviceTrustService.verifyAssertion({
        walletTenantId: body.walletId,
        assertion: { ...body.deviceAssertion, purpose: 'vc_login' },
        purpose: 'vc_login',
      })
    }
    await stageProofService.presentFromEmbeddedWallet({
      request,
      walletId: body.walletId,
      presentationRequestUrl: body.authorizationRequest,
      allowUnsignedWallet: true,
    })
    return { presented: true }
  }

  @Get('/session')
  public async getSession(@Request() request: ExRequest): Promise<SessionResponse> {
    const authHeader = request.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('No token provided')
    }

    const token = authHeader.substring(7) // Remove 'Bearer ' prefix
    const secret = await this.getJwtSecret()

    try {
      const decoded = jwt.verify(token, secret) as any
      const user = getWalletUserByWalletId(decoded.walletId)
      if (!user) {
        throw new UnauthorizedError('User not found')
      }

      return {
        id: user.id.toString(),
        username: user.username,
        email: user.email,
        walletId: user.walletId,
      }
    } catch (error) {
      throw new UnauthorizedError('Invalid token')
    }
  }

  /**
   * Generate a login challenge (nonce) for DID-based authentication
   */
  @Post('/login-challenge')
  public async loginChallenge(@Request() request: ExRequest): Promise<LoginChallengeResponse> {
    // Cleanup expired challenges periodically
    cleanupExpiredChallenges()

    const nonce = crypto.randomUUID()
    const now = new Date()
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000) // 5 minutes

    saveLoginChallenge({
      id: nonce,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    })

    request.logger?.info({ nonce }, 'Generated login challenge')

    return {
      nonce,
      expiresAt: expiresAt.toISOString(),
    }
  }

  /**
   * Verify signed nonce and authenticate user by DID
   */
  @Post('/login-verify')
  public async loginVerify(
    @Request() request: ExRequest,
    @Body() body: LoginVerifyRequest,
  ): Promise<{ token: string }> {
    const { did, signature, nonce } = body
    if (!did || !signature || !nonce) throw new StatusException('did, signature and nonce are required', 400)

    // 1. A challenge can be used once, by whoever claims it first while it is unexpired.
    if (!consumeLoginChallenge(nonce)) throw new StatusException('Invalid or expired nonce', 401)

    const baseAgent = container.resolve(Agent as unknown as new (...args: any[]) => Agent<RestMultiTenantAgentModules>)

    try {
      // 2. Only a key the DID lists for authentication may sign in.
      const resolvedDid = await baseAgent.dids.resolve(did)
      const didDocument = resolvedDid.didDocument
      const authenticationIds = new Set(
        (didDocument?.authentication ?? []).map((entry: any) => (typeof entry === 'string' ? entry : entry?.id)),
      )
      const verificationMethod = [
        ...(didDocument?.verificationMethod ?? []),
        ...(didDocument?.authentication ?? []).filter((entry: any) => typeof entry === 'object'),
      ].find((method: any) => method?.id && authenticationIds.has(method.id))
      if (!verificationMethod) throw new Error('Invalid DID: no authentication key')

      const signatureBytes = new Uint8Array(Buffer.from(signature, 'base64'))
      const messageBytes = new TextEncoder().encode(nonce)
      const publicJwk = getPublicJwkFromVerificationMethod(verificationMethod as any) as any

      const verification = await baseAgent.kms.verify({
        key: { publicJwk },
        algorithm: 'EdDSA',
        data: messageBytes,
        signature: signatureBytes,
      })

      if (verification.verified !== true) throw new Error('Invalid signature')

      // 3. The DID must be the one registered for an account.
      const account = DatabaseManager.getDatabase()
        .prepare('SELECT id, tenant_id AS tenantId FROM ssi_users WHERE did = ?')
        .get(did) as { id: string; tenantId: string } | undefined
      if (!account?.tenantId) throw new Error('No account for this DID')
      const user = { id: account.id, walletId: account.tenantId }

      const token = await this.generateJwtToken(user)

      request.logger?.info({ did, userId: user.id }, 'User authenticated via DID signature')

      return { token }
    } catch (error) {
      request.logger?.error({ error: (error as Error).message, did }, 'DID verification failed')
      throw new StatusException('Authentication failed', 401)
    }
  }

  @Post('/logout')
  public async logout(@Request() request: ExRequest): Promise<{ message: string }> {
    // Clear session cookie
    if (request.res) {
      request.res.clearCookie('auth.token', { path: '/' })
      // Clear potential other cookies if used
      request.res.clearCookie('auth.refreshToken', { path: '/' })
    }
    return { message: 'Logged out successfully' }
  }

  // --- Private Helpers ---

  private walletLoginService(): WalletLoginService {
    return new WalletLoginService(container.resolve(Agent), this.ssiAuthService)
  }

  private async getJwtSecret(): Promise<string> {
    if (process.env.JWT_SECRET) return process.env.JWT_SECRET

    const agent = container.resolve<Agent<RestMultiTenantAgentModules>>(Agent)
    const genericRecords = await agent.genericRecords.findAllByQuery({ hasSecretKey: 'true' })
    const record = genericRecords[0]
    if (!record?.content?.secretKey) {
      throw new Error('JWT secret not configured')
    }
    return record.content.secretKey as string
  }

  private async generateJwtToken(user: { id: string | number; walletId?: string }): Promise<string> {
    const secret = await this.getJwtSecret()
    return jwt.sign(
      {
        id: user.id,
        walletId: user.walletId || user.id,
        role: AgentRole.RestTenantAgent,
        tenantId: user.walletId || user.id,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, // 30 days
      },
      secret,
    )
  }
}
