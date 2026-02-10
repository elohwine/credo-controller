/**
 * SSI Auth Controller - Self-Sovereign Identity Authentication
 * 
 * TRUE SSI APPROACH - No PII stored in database!
 * 
 * Endpoints:
 * - POST /register - Create account, issue PlatformIdentityVC to wallet
 * - POST /login/challenge - Get nonce for VC presentation
 * - POST /login/vc - Login by presenting PlatformIdentityVC  
 * - POST /login/pin - Web2 fallback: login with phone/email + PIN
 * - GET /session - Get current session info (from VC claims in wallet)
 * 
 * User's PII lives ONLY in their wallet. We store ONLY:
 * - tenantId, DID, credential hashes for lookup
 */

import 'reflect-metadata'
import type { Request as ExRequest } from 'express'
import { Controller, Post, Get, Route, Tags, Body, Request, Security } from 'tsoa'
import { StatusException } from '../../errors'
import { container } from 'tsyringe'
import { SSIAuthService } from '../../services/SSIAuthService'
import type { PlatformIdentityClaims } from '../../config/credentials/PlatformIdentityVC'
import { SCOPES } from '../../enums'

// Request/Response interfaces

interface SSIRegisterRequest {
  /** Username (will be stored in PlatformIdentityVC, not database) */
  username: string
  /** Phone number in any format (e.g., 0774123456 or +263774123456) */
  phone?: string
  /** Email address (optional if phone provided) */
  email?: string
  /** 4-6 digit PIN for Web2-friendly login fallback */
  pin?: string
  /** If provided, claim this existing tenant's VCs (from checkout flow) */
  claimExistingTenantId?: string
}

interface SSIRegisterResponse {
  /** Success message */
  message: string
  /** Tenant/Wallet ID */
  walletId: string
  /** JWT session token */
  token: string
  /** Whether an existing tenant was claimed (VCs preserved) */
  claimedExisting: boolean
  /** URL to claim the PlatformIdentityVC (if auto-push disabled) */
  vcOfferUrl?: string
  /** Number of existing credentials in claimed tenant */
  existingCredentialsCount?: number
  /** Number of past receipts queued for issuance */
  retroactiveReceiptsQueued?: number
}

interface SSILoginChallengeResponse {
  /** Nonce for VC presentation (include in VP) */
  nonce: string
  /** When the challenge expires (5 min) */
  expiresAt: string
}

interface VCLoginRequest {
  /** JWT-encoded Verifiable Credential (PlatformIdentityVC) */
  vcJwt: string
  /** Nonce from createLoginChallenge */
  nonce: string
}

interface PinLoginRequest {
  /** Phone number (either phone or email required) */
  phone?: string
  /** Email address (either phone or email required) */
  email?: string
  /** 4-6 digit PIN */
  pin: string
}

interface LoginResponse {
  /** JWT session token */
  token: string
  /** Tenant/Wallet ID */
  tenantId: string
  /** Display name from VC (only for VC login) */
  displayName?: string
}

interface SessionInfo {
  /** User ID (internal, not PII) */
  userId: string
  /** Tenant/Wallet ID */
  tenantId: string
  /** User's DID */
  did: string
  /** Session token valid until */
  expiresAt: string
}

interface ScopedSessionResponse {
  /** Short-lived wallet token */
  token: string
  /** Token expiry in seconds */
  expiresIn: number
}

@Route('api/ssi/auth')
@Tags('SSI-Auth')
export class SSIAuthController extends Controller {
  
  private get authService(): SSIAuthService {
    return container.resolve(SSIAuthService)
  }

  /**
   * Register a new user account
   * 
   * Creates a tenant wallet and issues PlatformIdentityVC containing user's identity.
   * PII (phone, email, name) is stored ONLY in the VC, not our database.
   * 
   * If claimExistingTenantId is provided, the user claims an existing tenant
   * (from Fastlane checkout flow) and preserves any VCs already issued.
   */
  @Post('/register')
  public async register(
    @Request() request: ExRequest,
    @Body() body: SSIRegisterRequest
  ): Promise<SSIRegisterResponse> {
    // Debug: Log incoming request
    request.logger?.info({ 
      username: body.username, 
      hasPhone: !!body.phone, 
      phoneValue: body.phone,
      phoneType: typeof body.phone,
      hasEmail: !!body.email,
      emailValue: body.email 
    }, '[SSIAuth] Registration request received')

    // Validate input
    if (!body.username || body.username.length < 2) {
      this.setStatus(400)
      throw new Error('Username must be at least 2 characters')
    }

    if (!body.phone && !body.email) {
      this.setStatus(400)
      throw new Error('Either phone or email is required')
    }

    if (body.pin && (body.pin.length < 4 || body.pin.length > 6)) {
      this.setStatus(400)
      throw new Error('PIN must be 4-6 digits')
    }

    try {
      const result = await this.authService.register({
        username: body.username,
        phone: body.phone,
        email: body.email,
        pin: body.pin,
        claimExistingTenantId: body.claimExistingTenantId
      })

      // Count existing credentials if claimed
      let existingCredentialsCount = 0
      if (result.claimedExisting) {
        try {
          const agent = request.agent as any
          await agent.modules.tenants.withTenantAgent({ tenantId: result.walletId }, async (tenantAgent: any) => {
            const records = await tenantAgent.w3cCredentials.getAllCredentialRecords()
            existingCredentialsCount = records.length
          })
        } catch (e) {
          request.logger?.warn('Failed to count existing credentials')
        }
      }

      // Set auth cookie for browser clients
      const cookieValue = `auth.token=${result.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`
      this.setHeader('Set-Cookie', cookieValue)

      const retroactiveReceiptsQueued = result.retroactiveReceiptsQueued || 0
      const totalLinked = Math.max(existingCredentialsCount, retroactiveReceiptsQueued)
      const message = result.claimedExisting
        ? (retroactiveReceiptsQueued > existingCredentialsCount
          ? `Account created! ${totalLinked} saved item(s) queued for linking.`
          : `Account created! ${totalLinked} saved item(s) linked.`)
        : 'Account created successfully'

      return {
        message,
        walletId: result.walletId,
        token: result.token,
        claimedExisting: result.claimedExisting,
        existingCredentialsCount: result.claimedExisting ? existingCredentialsCount : undefined,
        retroactiveReceiptsQueued: retroactiveReceiptsQueued > 0 ? retroactiveReceiptsQueued : undefined,
        vcOfferUrl: result.vcOfferUrl
      }
    } catch (error: any) {
      request.logger?.error({ error: error.message }, 'SSI Registration failed')
      
      if (error.message.includes('already exists')) {
        this.setStatus(409)
      } else {
        this.setStatus(500)
      }
      throw error
    }
  }

  /**
   * Exchange an existing tenant token for a short-lived wallet session token.
   */
  @Post('/session')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async createSession(@Request() request: ExRequest, @Body() body?: { expiresInSeconds?: number }): Promise<ScopedSessionResponse> {
    const user = (request as any).user as { id?: string; tenantId?: string; did?: string } | undefined
    if (!user?.id || !user?.tenantId) {
      this.setStatus(401)
      throw new Error('Unauthorized')
    }

    const expiresInSeconds = Math.min(Math.max(body?.expiresInSeconds || 900, 300), 3600)
    const token = await this.authService.generateScopedSessionToken({
      userId: user.id,
      tenantId: user.tenantId,
      did: user.did,
      expiresInSeconds,
      audience: 'holder-wallet'
    })

    return { token, expiresIn: expiresInSeconds }
  }

  /**
   * Create a login challenge for VC-based authentication
   * 
   * Returns a nonce that must be included in the Verifiable Presentation.
   * Challenge expires after 5 minutes.
   */
  @Post('/login/challenge')
  public async createLoginChallenge(): Promise<SSILoginChallengeResponse> {
    return await this.authService.createLoginChallenge()
  }

  /**
   * Login by presenting PlatformIdentityVC
   * 
   * TRUE SSI Login: User presents their VC, we verify the signature and extract claims.
   * No password stored, no PII stored - the VC IS the credential.
   */
  @Post('/login/vc')
  public async loginWithVC(
    @Request() request: ExRequest,
    @Body() body: VCLoginRequest
  ): Promise<LoginResponse> {
    if (!body.vcJwt || !body.nonce) {
      this.setStatus(400)
      throw new Error('vcJwt and nonce are required')
    }

    try {
      const result = await this.authService.loginWithVC({
        vcJwt: body.vcJwt,
        nonce: body.nonce
      })

      // Set auth cookie
      const cookieValue = `auth.token=${result.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`
      this.setHeader('Set-Cookie', cookieValue)

      return {
        token: result.token,
        tenantId: result.tenantId,
        displayName: result.claims.displayName
      }
    } catch (error: any) {
      request.logger?.error({ error: error.message }, 'VC Login failed')
      throw new StatusException('Authentication failed', 401)
    }
  }

  /**
   * Login with phone/email + PIN (Web2 fallback)
   * 
   * For users who prefer traditional login UX.
   * We still don't store PII - only lookup by hash.
   */
  @Post('/login/pin')
  public async loginWithPin(
    @Request() request: ExRequest,
    @Body() body: PinLoginRequest
  ): Promise<LoginResponse> {
    if (!body.phone && !body.email) {
      throw new StatusException('Phone or email required', 400)
    }

    if (!body.pin) {
      throw new StatusException('PIN required', 400)
    }

    try {
      const result = await this.authService.loginWithPin({
        phone: body.phone,
        email: body.email,
        pin: body.pin
      })

      // Set auth cookie
      const cookieValue = `auth.token=${result.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`
      this.setHeader('Set-Cookie', cookieValue)

      return {
        token: result.token,
        tenantId: result.tenantId
      }
    } catch (error: any) {
      request.logger?.error({ error: error.message }, 'PIN Login failed')
      throw new StatusException('Invalid credentials', 401)
    }
  }

  /**
   * Get current session info
   * 
   * Returns basic session info. PII (name, phone, email) must be retrieved
   * from the user's wallet VC - we don't store it.
   */
  @Get('/session')
  @Security('jwt')
  public async getSession(
    @Request() request: ExRequest
  ): Promise<SessionInfo> {
    const user = (request as any).user
    
    if (!user?.id || !user?.tenantId) {
      this.setStatus(401)
      throw new Error('Not authenticated')
    }

    return {
      userId: user.id,
      tenantId: user.tenantId,
      did: user.did || 'unknown',
      expiresAt: new Date(user.exp * 1000).toISOString()
    }
  }

  /**
   * Logout - clear session cookie
   */
  @Post('/logout')
  public async logout(): Promise<{ message: string }> {
    // Clear auth cookie
    this.setHeader('Set-Cookie', 'auth.token=; Path=/; HttpOnly; Max-Age=0')
    return { message: 'Logged out successfully' }
  }
}
