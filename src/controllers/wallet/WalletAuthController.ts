import 'reflect-metadata'
import type { Request as ExRequest } from 'express'

import { Controller, Post, Get, Route, Tags, Body, Request } from 'tsoa'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import { Agent, Key, KeyType, TypedArrayEncoder, W3cCredentialService } from '@credo-ts/core'
import { container, inject, injectable } from 'tsyringe'
import { SSIAuthService } from '../../services/SSIAuthService'
import { saveWalletCredential, getWalletCredentialsByWalletId } from '../../persistence/WalletCredentialRepository'
import { saveLoginChallenge, getLoginChallenge, deleteLoginChallenge, cleanupExpiredChallenges } from '../../persistence/LoginChallengeRepository'
import { getWalletUserByWalletId } from '../../persistence/UserRepository'
import { findTenantByPhone, claimTenantForUser, getTenantCredentialCount } from '../../services/PhoneTenantLinkingService'
import { UnauthorizedError } from '../../errors/errors'
import { AgentRole } from '../../enums'
import type { RestMultiTenantAgentModules } from '../../cliAgent'
import type { VerifyPresentationRequestBody } from '../../types/api'

interface LoginRequest {
  username?: string
  email?: string
  phone?: string  // Fastlane: Support phone-based login
  pin?: string    // SSI: Optional PIN for Web2-friendly login
  [key: string]: any // Allow additional properties from auth module
}

interface RegisterRequest {
  username: string
  email?: string    // Optional if phone is provided
  phone?: string    // Fastlane: Phone-first registration
  pin?: string      // SSI: Optional PIN for Web2-friendly login fallback
  tenantType?: 'USER' | 'ORG'
  domain?: string
  claimExistingTenant?: boolean  // If true, claim any existing tenant linked to this phone
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
  constructor(
    @inject(SSIAuthService) private ssiAuthService: SSIAuthService
  ) {
    super()
  }

  @Post('/register')
  public async register(@Request() request: ExRequest, @Body() body: RegisterRequest): Promise<{ 
    message: string
    walletId: string
    holderDid?: string
    claimedExistingTenant?: boolean
    existingCredentialsCount?: number
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

            request.logger?.info({ 
                phone: body.phone, 
                tenantId: claimExistingTenantId, 
                creds: existingCredentialsCount 
            }, 'Found existing tenant to claim via SSIAuthService')
        }
    }

    try {
        const result = await this.ssiAuthService.register({
            username: body.username,
            pin: body.pin,
            email: body.email,
            phone: body.phone,
            claimExistingTenantId
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
            existingCredentialsCount
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
  public async login(@Request() request: ExRequest, @Body() body: LoginRequest): Promise<{ token: string; hasGenericId?: boolean }> {
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
            pin: body.pin
        })

        console.log('[LOGIN] User authenticated via SSI Service')
        return {
            token: result.token,
            hasGenericId: true 
        }
    } catch (e: any) {
        console.log('[LOGIN] Authentication failed:', e.message)
        this.setStatus(401)
        throw new Error('Invalid credentials')
    }
  }

  /**
   * Initiate Vc-Based Login (SIOPv2)
   */
  @Post('/login-wallet')
  public async loginWithWallet(@Request() request: ExRequest): Promise<{ authorizationRequest: string; state: string }> {
    const baseAgent = container.resolve(Agent as unknown as new (...args: any[]) => Agent<RestMultiTenantAgentModules>)

    // Define what we are asking for: The 'GenericID' credential
    const presentationDefinition = {
      id: 'LoginRequest',
      input_descriptors: [
        {
          id: 'MemberCredential',
          name: 'Member Credential',
          purpose: 'Login to Credo Controller',
          constraints: {
            fields: [
              {
                path: ['$.type'],
                filter: {
                  type: 'array',
                  contains: { const: 'GenericID' }
                }
              }
            ]
          }
        }
      ]
    }

    // Create Authorization Request
    const result = await (baseAgent.modules as any).openId4VcVerifier.createAuthorizationRequest({
      requestSigner: {
        method: 'did',
        did: await (baseAgent.dids as any).getCreatedDids({ method: 'key' }).then((dids: any[]) => dids[0].did)
      },
      presentationExchange: {
        definition: presentationDefinition
      }
    })

    return {
      authorizationRequest: result.authorizationRequest,
      state: result.authorizationRequest.split('state=')[1]?.split('&')[0] || 'unknown'
    }
  }

  /**
   * Verify VC-Based Login
   */
  @Post('/login-wallet/verify')
  public async verifyWalletLogin(@Request() request: ExRequest, @Body() body: VerifyPresentationRequestBody): Promise<{ token: string }> {
    const baseAgent = container.resolve(Agent as unknown as new (...args: any[]) => Agent<RestMultiTenantAgentModules>)

    try {
      const verificationResult = await (baseAgent.modules as any).openId4VcVerifier.verifyAuthorizationResponse({
        authorizationResponse: {
          vp_token: body.verifiablePresentation,
          presentation_submission: body.presentationSubmission,
          state: body.requestId // Frontend sends state as requestId
        }
      })

      if (!verificationResult.isVerified) {
        throw new UnauthorizedError(`Verification failed: ${verificationResult.error?.message}`)
      }

      // Extract Tenant ID from the presented credential
      // We expect the 'GenericID' to contain the 'walletId' or 'sub' mapping to tenant.
      // Simplification: Parse the VP payload manually to find the credential
      const vp = verificationResult.presentation
      const vc = Array.isArray(vp.verifiableCredential) ? vp.verifiableCredential[0] : vp.verifiableCredential

      // Decode VC if it's a JWT
      // For now, assuming we trust the verification, we need to deserialize the credential data
      // But 'presentation' object in Credo result is the W3C model.

      // Hack: we need the claim 'walletId' or 'sub'. 
      // If expecting 'GenericID' format we issued:
      const credentialSubject = (vc as any).credentialSubject
      const walletId = credentialSubject.id // In our issue logic, sub/id was the User DID. 
      // Wait, in 'register', we set `walletId: tenantId` in the DB, and `sub: userDid` in the VC.
      // And we saved it to `WalletCredentialRepository`.
      // We need a way to look up the User/Tenant by the DID presented.

      // Ideally the VC has a claim 'walletId'.
      // In 'register', we didn't explicitly check if 'GenericID' scheme has 'walletId'. 
      // Let's modify 'register' to include 'walletId' in claims if not there.
      // Re-checking register: claims: { name, email, walletId, role }. YES.

      const tenantId = credentialSubject.walletId
      if (!tenantId) {
        throw new Error('Credential missing walletId claim')
      }

      // Generate Session Token
      const secret = await this.getJwtSecret()
      const token = jwt.sign({
        walletId: tenantId,
        role: AgentRole.RestTenantAgent,
        tenantId: tenantId,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60)
      }, secret)

      return { token }

    } catch (e: any) {
      throw new UnauthorizedError(`Login Failed: ${e.message}`)
    }
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
        walletId: user.walletId
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
      expiresAt: expiresAt.toISOString()
    })

    request.logger?.info({ nonce }, 'Generated login challenge')

    return {
      nonce,
      expiresAt: expiresAt.toISOString()
    }
  }

  /**
   * Verify signed nonce and authenticate user by DID
   */
  @Post('/login-verify')
  public async loginVerify(@Request() request: ExRequest, @Body() body: LoginVerifyRequest): Promise<{ token: string }> {
    const { did, signature, nonce } = body

    // 1. Verify the challenge exists and hasn't expired
    const challenge = getLoginChallenge(nonce)
    if (!challenge) {
      this.setStatus(401)
      throw new Error('Invalid or expired nonce')
    }

    const now = new Date()
    if (new Date(challenge.expiresAt) < now) {
      deleteLoginChallenge(nonce)
      this.setStatus(401)
      throw new Error('Challenge has expired')
    }

    // 2. Get the base agent to verify signature
    const baseAgent = container.resolve(Agent as unknown as new (...args: any[]) => Agent<RestMultiTenantAgentModules>)

    // 3. Resolve the DID to get the verification method
    try {
      const resolvedDid = await baseAgent.dids.resolve(did)
      if (!resolvedDid.didDocument?.verificationMethod?.length) {
        this.setStatus(401)
        throw new Error('Invalid DID: No verification method found')
      }

      // 4. Extract the public key
      const verificationMethod = resolvedDid.didDocument.verificationMethod[0]
      const publicKeyBase58 = verificationMethod.publicKeyBase58
      if (!publicKeyBase58) {
        this.setStatus(401)
        throw new Error('Invalid DID: No public key found')
      }

      // 5. Verify the signature
      const key = Key.fromPublicKeyBase58(publicKeyBase58, KeyType.Ed25519)
      const signatureBytes = new Uint8Array(Buffer.from(signature, 'base64'))
      const messageBytes = TypedArrayEncoder.fromString(nonce)

      const isValid = await baseAgent.context.wallet.verify({
        data: messageBytes,
        key,
        signature: Buffer.from(signature, 'base64') as any,
      })

      if (!isValid) {
        this.setStatus(401)
        throw new Error('Invalid signature')
      }

      // 6. Look up the user by DID
      const user = getWalletUserByWalletId(did)
      if (!user) {
        this.setStatus(404)
        throw new Error('User not found for this DID')
      }

      // 7. Delete the used challenge
      deleteLoginChallenge(nonce)

      // 8. Generate and return JWT token
      const token = await this.generateJwtToken(user)

      request.logger?.info({ did, userId: user.id }, 'User authenticated via DID signature')

      return { token }

    } catch (error) {
      request.logger?.error({ error: (error as Error).message, did }, 'DID verification failed')
      this.setStatus(401)
      throw new Error('Authentication failed')
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
    return jwt.sign({
      id: user.id,
      walletId: user.walletId || user.id,
      role: AgentRole.RestTenantAgent,
      tenantId: user.walletId || user.id,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30 days
    }, secret)
  }
}
