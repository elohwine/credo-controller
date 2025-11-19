import 'reflect-metadata'
import type { Request as ExRequest } from 'express'

import { Controller, Post, Get, Route, Tags, Body, Request } from 'tsoa'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import { Agent, Key, KeyType, TypedArrayEncoder } from '@credo-ts/core'
import { container } from 'tsyringe'
import { createWalletUser, getWalletUserByUsername, getWalletUserByEmail, getWalletUserByWalletId, type WalletUser } from '../../persistence/UserRepository'
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

    // Create user DID
    const didResult = await baseAgent.dids.create({ method: 'key', options: { keyType: KeyType.Ed25519 } })
    const userDid = didResult.didState.did
    if (!userDid) {
      throw new Error('Failed to create user DID')
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
        iss: userDid, // Self-signed for now
        sub: userDid,
        nbf: now,
        iat: now,
        vc: {
          '@context': ['https://www.w3.org/2018/credentials/v1'],
          type: ['VerifiableCredential', 'GenericID'],
          credentialSubject: {
            id: userDid,
            name: body.username, // Using username as name for now
            email: body.email,
          },
        },
      }

      // Sign the VC
      const resolvedDid = await baseAgent.dids.resolve(userDid)
      if (!resolvedDid.didDocument?.verificationMethod?.length) {
        throw new Error(`No verification method found for ${userDid}`)
      }
      const verificationMethod = resolvedDid.didDocument.verificationMethod[0]
      const publicKeyBase58 = verificationMethod.publicKeyBase58
      if (!publicKeyBase58) {
        throw new Error(`No publicKeyBase58 found for ${userDid}`)
      }
      const key = Key.fromPublicKeyBase58(publicKeyBase58, KeyType.Ed25519)
      const header = { alg: 'EdDSA', typ: 'JWT', kid: verificationMethod.id }
      const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url')
      const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')
      const signingInput = `${encodedHeader}.${encodedPayload}`
      const sig = await baseAgent.context.wallet.sign({
        data: TypedArrayEncoder.fromString(signingInput),
        key,
      })
      const signatureB64Url = Buffer.from(sig).toString('base64url')
      credential = `${signingInput}.${signatureB64Url}`
    } catch (e) {
      request.logger?.error({ error: (e as Error).message }, 'Failed to issue GenericID VC')
      // Continue without VC for now
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
      this.setStatus(401)
      throw new Error('No token provided')
    }

    const token = authHeader.substring(7) // Remove 'Bearer ' prefix
    const secret = await this.getJwtSecret()

    try {
      const decoded = jwt.verify(token, secret) as any
      const user = getWalletUserByWalletId(decoded.walletId)
      if (!user) {
        this.setStatus(401)
        throw new Error('User not found')
      }

      return {
        id: user.id.toString(),
        username: user.username,
        email: user.email,
        walletId: user.walletId
      }
    } catch (error) {
      this.setStatus(401)
      throw new Error('Invalid token')
    }
  }

  @Get('/accounts/wallets')
  public async getWallets(@Request() request: ExRequest): Promise<WalletListings> {
    const authHeader = request.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      this.setStatus(401)
      throw new Error('No token provided')
    }

    const token = authHeader.substring(7) // Remove 'Bearer ' prefix
    const secret = await this.getJwtSecret()

    try {
      const decoded = jwt.verify(token, secret) as any
      const user = getWalletUserByWalletId(decoded.walletId)
      if (!user) {
        this.setStatus(401)
        throw new Error('User not found')
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
      this.setStatus(401)
      throw new Error('Invalid token')
    }
  }

  @Post('/logout')
  public async logout(@Request() request: ExRequest): Promise<{ message: string }> {
    // TODO: Implement logout
    return { message: 'Logged out successfully' }
  }
}
