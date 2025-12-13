import 'reflect-metadata'
import type { Request as ExRequest } from 'express'

import { Controller, Post, Get, Route, Tags, Body, Request } from 'tsoa'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import { Agent, Key, KeyType, TypedArrayEncoder } from '@credo-ts/core'
import { container } from 'tsyringe'
import { createWalletUser, getWalletUserByUsername, getWalletUserByEmail, getWalletUserByWalletId, type WalletUser } from '../../persistence/UserRepository'
import { saveWalletCredential, getWalletCredentialsByWalletId } from '../../persistence/WalletCredentialRepository'
import { saveLoginChallenge, getLoginChallenge, deleteLoginChallenge, cleanupExpiredChallenges } from '../../persistence/LoginChallengeRepository'
import { UnauthorizedError } from '../../errors/errors'
import { AgentRole } from '../../enums'
import type { RestMultiTenantAgentModules } from '../../cliAgent'
import type { VerifyPresentationRequestBody } from '../../types/api'

interface LoginRequest {
  username?: string
  email?: string
  password: string
  [key: string]: any // Allow additional properties from auth module
}

interface RegisterRequest {
  username: string
  email: string
  password: string
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
export class WalletAuthController extends Controller {
  private hashPassword(password: string): string {
    return crypto.createHash('sha256').update(password).digest('hex')
  }

  private async getJwtSecret(): Promise<string> {
    const baseAgent = container.resolve(Agent as unknown as new (...args: any[]) => Agent<RestMultiTenantAgentModules>)
    const genericRecords = await baseAgent.genericRecords.findAllByQuery({ hasSecretKey: 'true' })
    const secretKey = genericRecords[0]?.content.secretKey as string
    if (!secretKey) {
      throw new Error('JWT secret key not found')
    }
    return secretKey
  }

  private async generateJwtToken(user: WalletUser): Promise<string> {
    const secret = await this.getJwtSecret()
    const payload = {
      id: user.id,
      username: user.username,
      email: user.email,
      walletId: user.walletId,
      // Multi-tenancy fields
      role: AgentRole.RestTenantAgent,
      tenantId: user.walletId, // We use the user's walletId field to store the Tenant ID
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60), // 30 days
    }
    return jwt.sign(payload, secret)
  }

  @Post('/register')
  public async register(@Request() request: ExRequest, @Body() body: RegisterRequest): Promise<{ message: string; walletId: string; credential?: string; credentialOffer?: string; credentialOfferDeepLink?: string }> {
    // Check if user exists
    const existing = getWalletUserByUsername(body.username)
    if (existing) {
      this.setStatus(400)
      throw new Error('User already exists')
    }

    // Get the base agent
    const baseAgent = container.resolve(Agent as unknown as new (...args: any[]) => Agent<RestMultiTenantAgentModules>)

    // 1. Create Credo Tenant
    // We import provisionTenantResources dynamically or assume it's available
    const { provisionTenantResources } = await import('../../services/TenantProvisioningService')

    // Create the tenant record
    const tenantRecord = await baseAgent.modules.tenants.createTenant({
      config: {
        label: body.username,
      }
    })

    // Provision resources (DIDs) for the tenant
    let issuerDid = '' // This will be the User's DID (Tenant's DID)

    // Determine Base URL
    const protocol = request.protocol || 'http'
    const host = request.get('host') || 'localhost:3000'
    const fallbackBaseUrl = `${protocol}://${host}`
    const baseUrl = process.env.PUBLIC_BASE_URL || fallbackBaseUrl

    try {
      const provisioning = await provisionTenantResources({
        agent: baseAgent,
        tenantRecord,
        baseUrl,
        displayName: body.username
      })
      issuerDid = provisioning.issuerDid
    } catch (e: any) {
      // Cleanup if provisioning fails
      await baseAgent.modules.tenants.deleteTenantById(tenantRecord.id)
      throw new Error(`Failed to provision tenant: ${e.message}`)
    }

    const userDid = issuerDid
    // Store Tenant ID as walletId
    const tenantId = tenantRecord.id

    // 2. Get Platform DID (Issuer)
    let platformIssuerDid: string | undefined
    const createdDids = await baseAgent.dids.getCreatedDids({ method: 'key' })
    if (createdDids.length > 0) {
      platformIssuerDid = createdDids[0].did
    } else {
      const issuerDidResult = await baseAgent.dids.create({ method: 'key', options: { keyType: KeyType.Ed25519 } })
      platformIssuerDid = issuerDidResult.didState.did
    }

    if (!platformIssuerDid) {
      throw new Error('Failed to determine Platform Issuer DID')
    }

    // Create user in database
    const user = createWalletUser({
      username: body.username,
      email: body.email,
      passwordHash: this.hashPassword(body.password),
      walletId: tenantId, // Using Tenant ID here
    })

    // Issue GenericID VC Offer (Bootstrap)
    let credentialOffer: string | undefined
    let credentialOfferDeepLink: string | undefined

    try {
      const { credentialIssuanceService } = await import('../../services/CredentialIssuanceService')

      // Determine Base URL
      const protocol = request.protocol || 'http'
      const host = request.get('host') || 'localhost:3000'
      const baseUrl = process.env.PUBLIC_BASE_URL || `${protocol}://${host}`

      const offerResult = await credentialIssuanceService.createOffer({
        credentialType: 'GenericID',
        claims: {
          name: body.username,
          email: body.email,
          walletId: tenantId,
          role: 'member'
        },
        subjectDid: issuerDid, // User's DID
        baseUrl
      })

      credentialOffer = offerResult.credential_offer_uri
      credentialOfferDeepLink = offerResult.credential_offer_deeplink

      request.logger?.info({ offerId: offerResult.offerId }, 'Created Bootstrap GenericID Offer')

    } catch (e: any) {
      console.error('Failed to create Bootstrap Offer:', e)
    }

    return {
      message: 'User registered successfully',
      walletId: tenantId,
      credentialOffer,
      credentialOfferDeepLink
    }
  }

  @Post('/login')
  public async login(@Request() request: ExRequest, @Body() body: LoginRequest): Promise<{ token: string; credentialOfferUri?: string }> {
    // Find user by username or email
    let user: WalletUser | null = null
    if (body.username) {
      user = getWalletUserByUsername(body.username)
    } else if (body.email) {
      user = getWalletUserByEmail(body.email)
    }

    if (!user || user.passwordHash !== this.hashPassword(body.password)) {
      this.setStatus(401)
      throw new Error('Invalid credentials')
    }

    const token = await this.generateJwtToken(user)

    // After successful username/password login, check whether this wallet already
    // has a GenericID verifiable credential. If not, create a pre-authorized
    // credential offer so the frontend can fetch/accept it.
    try {
      const existing = getWalletCredentialsByWalletId(user.walletId)
      let hasGeneric = false
      for (const c of existing) {
        try {
          const doc = typeof (c as any).credentialData === 'string' ? JSON.parse((c as any).credentialData) : (c as any).credentialData || (c as any).credential_data
          const types = doc?.vc?.type || doc?.type || doc?.types || []
          if (Array.isArray(types) && types.includes('GenericID')) {
            hasGeneric = true
            break
          }
        } catch (e) {
          // ignore parse errors
        }
      }

      if (!hasGeneric) {
        // Create a pre-authorized offer for this user using unified service
        const { credentialIssuanceService } = await import('../../services/CredentialIssuanceService')

        const baseUrl = `${request.protocol}://${request.get('host')}`
        const offerResult = await credentialIssuanceService.createOffer({
          credentialType: 'GenericID',
          claims: {
            name: user.username,
            email: user.email,
            walletId: user.walletId,
          },
          subjectDid: user.walletId,
          baseUrl,
        })

        const credentialOfferUri = offerResult.credential_offer_uri
        const credentialOfferDeepLink = offerResult.credential_offer_deeplink

        // Expose as response headers
        try {
          this.setHeader('x-credential-offer-uri', credentialOfferUri)
          this.setHeader('x-credential-offer-deeplink', credentialOfferDeepLink)
        } catch (_) {
          // fall back silently if setting header is not available
        }

        request.logger?.info({ credentialOfferUri, credentialOfferDeepLink, offerId: offerResult.offerId }, 'Created pre-authorized credential offer for user login')

        return { token, credentialOfferUri, credentialOfferDeepLink } as any
      }
    } catch (e) {
      request.logger?.error({ err: (e as Error).message }, 'Post-login GenericID offer creation failed')
    }

    return { token }
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
        role: 'member',
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
    // TODO: Implement logout
    return { message: 'Logged out successfully' }
  }
}
