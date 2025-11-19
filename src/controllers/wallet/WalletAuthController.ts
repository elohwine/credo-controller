import 'reflect-metadata'
import type { Request as ExRequest } from 'express'

import { Controller, Post, Get, Route, Tags, Body, Request } from 'tsoa'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import { Agent, Key, KeyType, TypedArrayEncoder } from '@credo-ts/core'
import { container } from 'tsyringe'
import { createWalletUser, getWalletUserByUsername, getWalletUserByEmail, getWalletUserByWalletId, type WalletUser } from '../../persistence/UserRepository'
import { saveWalletCredential } from '../../persistence/WalletCredentialRepository'
import { saveLoginChallenge, getLoginChallenge, deleteLoginChallenge, cleanupExpiredChallenges } from '../../persistence/LoginChallengeRepository'
import { UnauthorizedError } from '../../errors/errors'
import type { RestMultiTenantAgentModules } from '../../cliAgent'

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
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60), // 30 days
    }
    return jwt.sign(payload, secret)
  }

  @Post('/register')
  public async register(@Request() request: ExRequest, @Body() body: RegisterRequest): Promise<{ message: string; walletId: string; credential?: string }> {
    // Check if user exists
    const existing = getWalletUserByUsername(body.username)
    if (existing) {
      this.setStatus(400)
      throw new Error('User already exists')
    }

    // Get the base agent
    const baseAgent = container.resolve(Agent as unknown as new (...args: any[]) => Agent<RestMultiTenantAgentModules>)

    // 1. Create user DID (Subject)
    const didResult = await baseAgent.dids.create({ method: 'key', options: { keyType: KeyType.Ed25519 } })
    const userDid = didResult.didState.did
    if (!userDid) {
      throw new Error('Failed to create user DID')
    }

    // 2. Get Base Tenant DID (Issuer)
    // We try to find an existing DID for the base agent to act as the "Platform Issuer"
    let issuerDid: string | undefined
    const createdDids = await baseAgent.dids.getCreatedDids({ method: 'key' })
    if (createdDids.length > 0) {
      issuerDid = createdDids[0].did
    } else {
      // Create one if none exists (first time setup)
      const issuerDidResult = await baseAgent.dids.create({ method: 'key', options: { keyType: KeyType.Ed25519 } })
      issuerDid = issuerDidResult.didState.did
    }

    if (!issuerDid) {
      throw new Error('Failed to determine Issuer DID')
    }

    // Create user in database
    const user = createWalletUser({
      username: body.username,
      email: body.email,
      passwordHash: this.hashPassword(body.password),
      walletId: userDid,
    })

    // Issue GenericID VC with PII
    let credential: string | undefined
    try {
      const vcId = crypto.randomUUID()
      const now = Math.floor(Date.now() / 1000)
      const payload = {
        jti: vcId,
        iss: issuerDid, // Signed by Platform
        sub: userDid,   // Subject is User
        nbf: now,
        iat: now,
        vc: {
          '@context': ['https://www.w3.org/2018/credentials/v1'],
          type: ['VerifiableCredential', 'GenericID'],
          credentialSubject: {
            id: userDid,
            name: body.username,
            email: body.email,
          },
        },
      }

      // Sign the VC with Issuer's Key
      const resolvedDid = await baseAgent.dids.resolve(issuerDid)
      if (!resolvedDid.didDocument?.verificationMethod?.length) {
        throw new Error(`No verification method found for issuer ${issuerDid}`)
      }
      const verificationMethod = resolvedDid.didDocument.verificationMethod[0]
      const publicKeyBase58 = verificationMethod.publicKeyBase58
      if (!publicKeyBase58) {
        throw new Error(`No publicKeyBase58 found for issuer ${issuerDid}`)
      }
      const key = Key.fromPublicKeyBase58(publicKeyBase58, KeyType.Ed25519)
      const header = { alg: 'EdDSA', typ: 'JWT', kid: verificationMethod.id }
      const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url')
      const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')
      const signingInput = `${encodedHeader}.${encodedPayload}`

      // Sign using the base agent's wallet (which holds the issuer key)
      const sig = await baseAgent.context.wallet.sign({
        data: TypedArrayEncoder.fromString(signingInput),
        key,
      })
      const signatureB64Url = Buffer.from(sig).toString('base64url')
      credential = `${signingInput}.${signatureB64Url}`

      request.logger?.info({ userDid, issuerDid, vcId }, 'Issued GenericID VC on signup')

      // Save to Wallet Storage
      saveWalletCredential({
        id: crypto.randomUUID(),
        walletId: userDid,
        credentialId: vcId,
        credentialData: credential,
        issuerDid: issuerDid,
        type: 'GenericID'
      })

    } catch (e) {
      request.logger?.error({ error: (e as Error).message }, 'Failed to issue GenericID VC')
      // Continue without VC for now, but log error
    }

    return {
      message: 'User registered successfully',
      walletId: userDid,
      credential
    }
  }

  @Post('/login')
  public async login(@Request() request: ExRequest, @Body() body: LoginRequest): Promise<{ token: string }> {
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

    return { token }
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

  @Get('/accounts/wallets')
  public async getWallets(@Request() request: ExRequest): Promise<WalletListings> {
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

      // Return user's wallet information
      const wallet: WalletListing = {
        id: user.walletId,
        name: `${user.username}'s Wallet`,
        createdOn: user.createdAt,
        addedOn: user.createdAt,
        permission: 'owner'
      }

      return {
        account: user.username,
        wallets: [wallet]
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
