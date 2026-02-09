/**
 * SSI Auth Service - Self-Sovereign Identity Authentication
 * 
 * TRUE SSI APPROACH - No PII stored in database!
 * 
 * Key Architecture:
 * 1. PII (Phone, Email, Name) is NEVER stored in the database - only SHA-256 hashes for lookup
 * 2. Actual PII lives ONLY in the user's wallet as PlatformIdentityVC
 * 3. Login options:
 *    a) Present VC → Verify signature → Issue session token (TRUE SSI)
 *    b) Hash-based lookup with PIN (Web2-friendly fallback)
 * 4. User controls their data - we're not a PII honeypot
 * 
 * Fastlane Flow:
 * - At checkout, phone entered → encrypted temp record with tenantId (auto-expires 24h)
 * - On registration, if phone matches → claim existing tenant's VCs
 * - PlatformIdentityVC issued → temp record deleted
 */

import { injectable, inject } from 'tsyringe'
import { Agent, KeyType } from '@credo-ts/core'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import { DatabaseManager } from '../persistence/DatabaseManager'
import type { SSIUserRecord, PlatformIdentityClaims } from '../config/credentials/PlatformIdentityVC'
import { PLATFORM_IDENTITY_VC_TYPE } from '../config/credentials/PlatformIdentityVC'
import { RestMultiTenantAgentModules } from '../cliAgent'
import { rootLogger } from '../utils/pinoLogger'
import { W3cCredentialService } from '@credo-ts/core'

const logger = rootLogger.child({ module: 'SSIAuthService' })

@injectable()
export class SSIAuthService {
  private agent: Agent<RestMultiTenantAgentModules>

  constructor(
    @inject(Agent) agent: Agent
  ) {
    this.agent = agent as Agent<RestMultiTenantAgentModules>
  }

  /**
   * Register a new user - creates tenant and issues PlatformIdentityVC
   * 
   * Flow:
   * 1. Check if phone/email hash exists
   * 2. Check for existing tenant to claim (Fastlane: phone was linked at checkout)
   * 3. Create or reuse Tenant (Wallet)
   * 4. Issue PlatformIdentityVC to that tenant (PII lives in wallet only)
   * 5. Save SSI User record (hashes only - NO PII, NO PASSWORD)
   */
  async register(claims: {
    username: string
    pin?: string  // Optional 4-6 digit PIN for Web2-friendly login fallback
    phone?: string
    email?: string
    claimExistingTenantId?: string
  }): Promise<{
    tenantId: string
    token: string
    walletId: string
    claimedExisting: boolean
    vcOfferUrl?: string
  }> {
    const db = DatabaseManager.getDatabase()
    
    // Debug: Log incoming claims
    console.log('[SSIAuthService] Processing registration:', JSON.stringify({
      username: claims.username,
      phone: claims.phone,
      phoneType: typeof claims.phone,
      phoneLength: claims.phone?.length,
      hasPhone: !!claims.phone,
      email: claims.email,
      hasEmail: !!claims.email
    }, null, 2))
    
    // 1. Hash PII for lookup (Privacy Preserving - only hashes stored)
    // We normalize phone to ensure consistent lookups (077... matches 26377...)
    const phoneHash = claims.phone ? this.hashData(this.normalizePhone(claims.phone)) : null
    const emailHash = claims.email ? this.hashData(claims.email) : null
    const pinHash = claims.pin ? this.hashPin(claims.pin) : null
    
    console.log('[SSIAuthService] Computed hashes:', JSON.stringify({
      phoneHash: phoneHash ? phoneHash.substring(0, 16) + '...' : null,
      emailHash: emailHash ? emailHash.substring(0, 16) + '...' : null,
      hasPinHash: !!pinHash
    }, null, 2))
    
    // Check duplication by hash
    let existingUser = null
    if (phoneHash) {
      existingUser = db.prepare('SELECT * FROM ssi_users WHERE phone_hash = ?').get(phoneHash) as any
      if (existingUser) {
          // If we have a guest tenant to claim, but user exists -> MIGRATE
          const guestId = claims.claimExistingTenantId || (claims.phone ? await this.findTenantByPhone(claims.phone) : undefined)
          
          if (guestId && guestId !== existingUser.tenant_id) {
              logger.info({ guestId, targetId: existingUser.tenant_id }, 'User exists: Migrating guest tenant data to registered account')
              await this.migrateGuestTenant(guestId, existingUser.tenant_id)
              
              // Return successful "Registration" (effectively login + claim)
              const token = await this.generateSessionToken(existingUser.id, existingUser.tenant_id)
              return {
                  tenantId: existingUser.tenant_id,
                  walletId: existingUser.tenant_id,
                  token,
                  claimedExisting: true,
                  vcOfferUrl: undefined // No new identity VC needed
              }
          }
          throw new Error('User already exists (phone)')
      }
    }
    if (emailHash) {
      const existing = db.prepare('SELECT id FROM ssi_users WHERE email_hash = ?').get(emailHash) as any
      if (existing) throw new Error('User already exists (email)')
    }

    // 2. Check for existing tenant to claim (from Fastlane checkout)
    let tenantId = claims.claimExistingTenantId
    let claimedExisting = false
    
    // Also check temp_phone_links if phone provided
    // We fetch ALL tenants that match the phone, to handle cases where multiple guest sessions were created
    // due to inconsistent phone formatting or device switching
    const foundGuestTenants = claims.phone ? await this.findAllTenantsByPhone(claims.phone) : []
    
    if (!tenantId && foundGuestTenants.length > 0) {
      tenantId = foundGuestTenants[0]
      if (tenantId) {
        logger.info({ tenantId, count: foundGuestTenants.length, phone: '***' }, 'Found existing tenant(s) to claim via phone link')
      }
    }

    // 3. Create or Reuse Tenant
    let tenantRecord = null
    if (tenantId) {
      try {
        tenantRecord = await this.agent.modules.tenants.getTenantById(tenantId)
        claimedExisting = true
        logger.info({ tenantId }, 'Claiming existing tenant')
        
        // MIGRATE other found tenants to this one
        for (const guestId of foundGuestTenants) {
            if (guestId !== tenantId) {
                logger.info({ guestId, targetId: tenantId }, 'Merging secondary guest tenant into main account')
                await this.migrateGuestTenant(guestId, tenantId)
            }
        }
      } catch (e) {
        logger.warn({ tenantId }, 'Failed to find existing tenant, creating new one')
        tenantId = undefined
      }
    }

    if (!tenantId) {
      tenantRecord = await this.agent.modules.tenants.createTenant({
        config: { label: `user-${Date.now()}` }  // No PII in label
      })
      tenantId = tenantRecord.id
    }

    // Provision DID for the tenant
    const userDid = await this.provisionTenantDid(tenantId!)

    // 4. Issue PlatformIdentityVC (PII goes into wallet, not our DB)
    const vcOfferUrl = await this.issuePlatformIdentityVC(tenantId!, {
      displayName: claims.username,
      phone: claims.phone,
      email: claims.email,
      registeredAt: new Date().toISOString(),
      platformTenantId: tenantId!,
      platformName: process.env.PLATFORM_NAME || 'Credentis',
      verificationLevel: 'unverified'
    })

    // 5. Create SSI User Record - NO PII, NO PASSWORD stored
    const userId = crypto.randomUUID()
    db.prepare(`
      INSERT INTO ssi_users (
        id, tenant_id, did, phone_hash, email_hash, pin_hash, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      tenantId,
      userDid,
      phoneHash,
      emailHash,
      pinHash,  // Optional PIN hash for Web2 fallback
      new Date().toISOString(),
      new Date().toISOString()
    )

    // 6. Retroactive Issuance: Source-of-Truth Re-Issuance (Fastlane Fix)
    // We check the immutable payment ledger for past transactions and issue fresh receipts
    // This removes dependency on fragile Guest Wallet migration
    if (claims.phone) {
        // Run un-awaited to not block the UI response
        this.reissuePastReceipts(tenantId!, claims.phone).catch(err => 
            logger.error({ error: err.message, phone: '***' }, 'Retroactive issuance failed')
        )
    }

    // Clean up temp phone link if we claimed it
    if (claimedExisting && claims.phone) {
      await this.deletePhoneLink(tenantId!)
    }

    // Generate Auth Token
    const token = await this.generateSessionToken(userId, tenantId!, userDid)

    return {
      tenantId: tenantId!,
      walletId: tenantId!,
      token,
      claimedExisting,
      vcOfferUrl
    }
  }

  /**
   * Login via VC Presentation (TRUE SSI)
   * User presents their PlatformIdentityVC, we verify and issue session
   */
  async loginWithVC(params: {
    vcJwt: string
    nonce: string
  }): Promise<{ token: string; tenantId: string; claims: PlatformIdentityClaims }> {
    const db = DatabaseManager.getDatabase()
    
    // Verify nonce is valid
    const challenge = db.prepare(`
      SELECT * FROM ssi_login_challenges WHERE nonce = ? AND expires_at > ?
    `).get(params.nonce, new Date().toISOString()) as any

    if (!challenge) throw new Error('Invalid or expired login challenge')

    // Delete used challenge (one-time use)
    db.prepare('DELETE FROM ssi_login_challenges WHERE nonce = ?').run(params.nonce)

    // Decode VC JWT
    const parts = params.vcJwt.split('.')
    if (parts.length !== 3) throw new Error('Invalid VC JWT format')

    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
    const vc = payload.vc || payload
    const credentialSubject = vc.credentialSubject || {}

    // Verify it's a PlatformIdentityVC from our platform
    const types = vc.type || []
    if (!types.includes(PLATFORM_IDENTITY_VC_TYPE)) {
      throw new Error('Not a valid PlatformIdentityVC')
    }

    // Extract tenantId from VC claims
    const tenantId = credentialSubject.tenantId
    if (!tenantId) throw new Error('VC missing tenantId claim')

    // Lookup user by tenantId
    const user = db.prepare('SELECT * FROM ssi_users WHERE tenant_id = ?').get(tenantId) as any
    if (!user) throw new Error('User not found')

    // Update last login
    db.prepare('UPDATE ssi_users SET last_login_at = ? WHERE id = ?')
      .run(new Date().toISOString(), user.id)

    const token = await this.generateSessionToken(user.id, tenantId, user.did)

    return {
      token,
      tenantId,
      claims: credentialSubject as PlatformIdentityClaims
    }
  }

  /**
   * Login via Phone/Email + PIN (Web2-friendly fallback)
   * For users who prefer traditional UX
   */
  async loginWithPin(credentials: {
    phone?: string
    email?: string
    pin: string
  }): Promise<{ token: string; tenantId: string }> {
    const db = DatabaseManager.getDatabase()
    
    // Normalize phone on login too!
    const lookupHash = credentials.phone 
      ? this.hashData(this.normalizePhone(credentials.phone)) 
      : (credentials.email ? this.hashData(credentials.email) : null)

    if (!lookupHash) throw new Error('Phone or Email required')

    const user = db.prepare(`
      SELECT * FROM ssi_users 
      WHERE phone_hash = ? OR email_hash = ?
    `).get(lookupHash, lookupHash) as any

    if (!user) throw new Error('Invalid credentials')

    // Verify PIN hash
    const inputPinHash = this.hashPin(credentials.pin)
    if (user.pin_hash !== inputPinHash) {
      throw new Error('Invalid credentials')
    }

    // Update last login
    db.prepare('UPDATE ssi_users SET last_login_at = ? WHERE id = ?')
      .run(new Date().toISOString(), user.id)

    const token = await this.generateSessionToken(user.id, user.tenant_id, user.did)

    return { token, tenantId: user.tenant_id }
  }

  /**
   * Create login challenge for VC presentation
   */
  async createLoginChallenge(): Promise<{ nonce: string; expiresAt: string }> {
    const db = DatabaseManager.getDatabase()
    const nonce = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString() // 5 min

    db.prepare(`
      INSERT INTO ssi_login_challenges (nonce, expires_at, created_at)
      VALUES (?, ?, ?)
    `).run(nonce, expiresAt, new Date().toISOString())

    return { nonce, expiresAt }
  }

  /**
   * Link phone to tenant temporarily (Fastlane: checkout → registration)
   * Phone is encrypted and auto-expires after 24h
   */
  async linkPhoneTemporarily(tenantId: string, phone: string): Promise<void> {
    const db = DatabaseManager.getDatabase()
    const encryptedPhone = this.encryptPII(phone)
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    db.prepare(`
      INSERT OR REPLACE INTO temp_phone_links (tenant_id, encrypted_phone, expires_at, created_at)
      VALUES (?, ?, ?, ?)
    `).run(tenantId, encryptedPhone, expiresAt, new Date().toISOString())
    
    logger.info({ tenantId }, 'Phone linked temporarily for Fastlane flow')
  }

  /**
   * Find REGISTERED tenant by phone
   */
  async findRegisteredTenantByPhone(phone: string): Promise<string | undefined> {
    const db = DatabaseManager.getDatabase()
    const phoneHash = this.hashData(this.normalizePhone(phone))
    const user = db.prepare('SELECT tenant_id FROM ssi_users WHERE phone_hash = ?').get(phoneHash) as { tenant_id: string }
    
    if (user) {
      logger.info({ tenantId: user.tenant_id }, 'Found Registered Tenant for phone number')
      return user.tenant_id
    }
    return undefined
  }

  /**
   * Find tenant by phone (for claiming pre-registration VCs)
   */
  async findTenantByPhone(phone: string): Promise<string | undefined> {
    const tenants = await this.findAllTenantsByPhone(phone)
    return tenants.length > 0 ? tenants[0] : undefined
  }

  async findAllTenantsByPhone(phone: string): Promise<string[]> {
    const db = DatabaseManager.getDatabase()
    const foundIds: string[] = []

    const links = db.prepare(`
      SELECT tenant_id, encrypted_phone FROM temp_phone_links 
      WHERE expires_at > ?
    `).all(new Date().toISOString()) as { tenant_id: string; encrypted_phone: string }[]

    const normalizedInput = this.normalizePhone(phone)
    for (const link of links) {
      try {
        const decrypted = this.decryptPII(link.encrypted_phone)
        if (this.normalizePhone(decrypted) === normalizedInput) {
          foundIds.push(link.tenant_id)
        }
      } catch {
        // Skip corrupted records
      }
    }
    return foundIds
  }

  async deletePhoneLink(tenantId: string): Promise<void> {
    const db = DatabaseManager.getDatabase()
    db.prepare('DELETE FROM temp_phone_links WHERE tenant_id = ?').run(tenantId)
  }

  // --- Private Helpers ---

  private async provisionTenantDid(tenantId: string): Promise<string> {
    const tenantAgent = await this.agent.modules.tenants.getTenantAgent({ tenantId })
    const existingDids = await tenantAgent.dids.getCreatedDids({ method: 'key' })
    let userDid: string
    if (existingDids.length === 0) {
      const result = await tenantAgent.dids.create({ method: 'key', options: { keyType: KeyType.Ed25519 } })
      userDid = result.didState.did!
    } else {
      userDid = existingDids[0].did
    }
    await tenantAgent.endSession()
    return userDid
  }

  private async issuePlatformIdentityVC(tenantId: string, claims: PlatformIdentityClaims): Promise<string | undefined> {
    // Issue VC via OID4VC endpoint (user claims it into their wallet)
    const issuerApiUrl = process.env.ISSUER_API_URL || 'http://localhost:3000'
    const apiKey = process.env.ISSUER_API_KEY || 'test-api-key-12345'

    try {
      const response = await fetch(`${issuerApiUrl}/custom-oidc/issuer/credential-offers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey
        },
        body: JSON.stringify({
          credentials: [{
            credentialDefinitionId: PLATFORM_IDENTITY_VC_TYPE,
            format: 'jwt_vc_json',
            type: ['VerifiableCredential', PLATFORM_IDENTITY_VC_TYPE],
            claims: {
              ...claims,
              tenantId  // Include tenantId for later lookup
            }
          }]
        })
      })

      if (!response.ok) {
        logger.error({ status: response.status }, 'Failed to issue PlatformIdentityVC')
        return undefined
      }

      const data = await response.json() as { offerUrl?: string; credentialOffer?: string; credential_offer_uri?: string }
      return data.offerUrl || data.credentialOffer || data.credential_offer_uri
    } catch (err: any) {
      logger.error({ error: err.message }, 'Error issuing PlatformIdentityVC')
      return undefined
    }
  }

  /**
   * Retroactive Issuance:
   * Query ack_payments for past successful transactions matching this phone
   * and issue ReceiptVCs to the new tenant.
   * This is the "Source of Truth" recovery strategy.
   */
  private async reissuePastReceipts(tenantId: string, phone: string): Promise<void> {
    const db = DatabaseManager.getDatabase()
    
    // Normalize phone to match potential DB formats
    const normalizedPhone = this.normalizePhone(phone)
    
    // Find all PAID payments for this phone (check both raw and normalized)
    const payments = db.prepare(`
        SELECT * FROM ack_payments 
        WHERE (payer_phone = ? OR payer_phone = ?) 
        AND state IN ('paid', 'delivered')
    `).all(normalizedPhone, phone) as any[]

    if (payments.length === 0) return

    logger.info({ tenantId, count: payments.length }, 'Found past payments for retroactive receipt issuance')

    const issuerApiUrl = process.env.ISSUER_API_URL || 'http://localhost:3000'
    const apiKey = process.env.ISSUER_API_KEY || 'test-api-key-12345'

    for (const payment of payments) {
        try {
            // Issue ReceiptVC
            // We issue directly to the new tenant (x-tenant-id header target)
            const response = await fetch(`${issuerApiUrl}/custom-oidc/issuer/credential-offers`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'x-tenant-id': tenantId // Target the new registered tenant!
                },
                body: JSON.stringify({
                    credentials: [{
                        credentialDefinitionId: 'ReceiptVC',
                        format: 'jwt_vc_json',
                        type: ['VerifiableCredential', 'ReceiptVC'],
                        claims: {
                            transactionId: payment.provider_ref || payment.id,
                            amount: String(payment.amount),
                            currency: payment.currency || 'USD',
                            merchant: payment.tenant_id,
                            cartId: payment.cart_id,
                            invoiceId: payment.invoice_id,
                            invoiceHash: payment.invoice_hash, // Preserves audit chain if available
                            previousRecordHash: payment.invoice_hash,
                            timestamp: payment.updated_at || new Date().toISOString()
                        }
                    }]
                })
            })

            if (response.ok) {
                 logger.debug({ paymentId: payment.id, tenantId }, 'Retroactively issued ReceiptVC')
            } else {
                 logger.warn({ status: response.status, paymentId: payment.id }, 'Failed to retro-issue receipt')
            }
        } catch (e: any) {
             logger.error({ error: e.message, paymentId: payment.id }, 'Error retro-issuing receipt')
        }
    }
  }

  private normalizePhone(phone: string): string {
    let clean = phone.replace(/\D/g, '')
    if (clean.startsWith('0') && clean.length === 10) {
      clean = '263' + clean.slice(1)
    }
    return clean
  }

  private hashData(data: string): string {
    return crypto.createHash('sha256').update(data.trim().toLowerCase()).digest('hex')
  }

  private hashPin(pin: string): string {
    // PIN with salt for extra security
    const salt = process.env.PIN_SALT || 'credo-pin-salt-v1'
    return crypto.createHash('sha256').update(salt + pin).digest('hex')
  }

  private encryptPII(data: string): string {
    const key = process.env.PII_ENCRYPTION_KEY || 'default-dev-key-32-chars-long!!'
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key.padEnd(32).slice(0, 32)), iv)
    let encrypted = cipher.update(data, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    return iv.toString('hex') + ':' + encrypted
  }

  private decryptPII(encryptedData: string): string {
    const key = process.env.PII_ENCRYPTION_KEY || 'default-dev-key-32-chars-long!!'
    const [ivHex, encrypted] = encryptedData.split(':')
    const iv = Buffer.from(ivHex, 'hex')
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key.padEnd(32).slice(0, 32)), iv)
    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  }

  /**
   * Migrate credentials from a guest/anonymous tenant to a registered tenant
   */
  async migrateGuestTenant(guestTenantId: string, targetTenantId: string): Promise<void> {
    try {
        const guestAgent = await this.agent.modules.tenants.getTenantAgent({ tenantId: guestTenantId })
        const targetAgent = await this.agent.modules.tenants.getTenantAgent({ tenantId: targetTenantId })

        // 1. Get W3C Credentials (JWT VCs)
        // Note: We resolve service from dependency manager to ensure correct context
        const guestW3c = guestAgent.dependencyManager.resolve(W3cCredentialService)
        const targetW3c = targetAgent.dependencyManager.resolve(W3cCredentialService)

        const records = await guestW3c.getAllCredentialRecords(guestAgent.context)
        
        logger.info({ guestTenantId, targetTenantId, count: records.length }, 'Migrating credentials from guest to registered account')

        for (const record of records) {
            try {
                // Check if already exists? (by ID)
                // W3cCredentialService doesn't strictly enforce ID uniqueness across wallets, but good to check?
                // Just try store, if it fails it fails.
                await targetW3c.storeCredential(targetAgent.context, {
                    credential: record.credential
                })
            } catch (e: any) {
                // Ignore duplicates
                logger.debug({ id: record.id, error: e.message }, 'Skipping credential migration (likely duplicate)')
            }
        }

        // 2. Clear temp links for guest so we don't find it again
        await this.deletePhoneLink(guestTenantId)
        
        // 3. Mark guest tenant as migrated in some way? 
        // For now, removing the phone link effectively "hides" it from future lookups.

    } catch (error: any) {
        logger.error({ error: error.message, guestTenantId, targetTenantId }, 'Tenant migration failed')
        // Don't block the auth flow, best effort
    }
  }

  private async generateSessionToken(userId: string, tenantId: string, did?: string): Promise<string> {
    let secret = process.env.JWT_SECRET
    
    if (!secret) {
        const genericRecords = await this.agent.genericRecords.findAllByQuery({ hasSecretKey: 'true' })
        secret = genericRecords[0]?.content.secretKey as string
    }

    if (!secret) {
        throw new Error('No JWT secret found for signing session token')
    }
    
    return jwt.sign({
      id: userId,
      tenantId,
      did: did || 'unknown',
      role: 'RestTenantAgent',
      // NO PII in token - claims come from VC when needed
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30 days
    }, secret)
  }

  /**
   * Cleanup expired challenges and temp phone links
   */
  async cleanupExpired(): Promise<void> {
    const db = DatabaseManager.getDatabase()
    const now = new Date().toISOString()
    db.prepare('DELETE FROM ssi_login_challenges WHERE expires_at < ?').run(now)
    db.prepare('DELETE FROM temp_phone_links WHERE expires_at < ?').run(now)
  }
}