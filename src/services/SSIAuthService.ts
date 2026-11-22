/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/explicit-member-accessibility */
/**
 * SSI Auth Service - Self-Sovereign Identity Authentication
 *
 * The account record keeps a keyed hash of the phone number and email, never the number itself,
 * and the PIN as a slow per-account hash. The name, the number and the date of birth live in the
 * person's own card. See ssi/contactHash.ts and ssi/pinHash.ts for why a plain SHA-256 is not
 * enough, and docs/SSI_PRODUCTION_PROFILE.md for what else the platform does hold.
 *
 * Login options:
 *    a) Present the identity card → verify signature → issue a session
 *    b) Phone or email plus PIN, looked up by the keyed hash
 *
 * Fastlane Flow:
 * - At checkout, phone entered → encrypted temp record with tenantId (auto-expires 24h)
 * - On registration, if phone matches → claim existing tenant's VCs
 * - PlatformIdentityVC issued → temp record deleted
 */

import type { SSIUserRecord, PlatformIdentityClaims, IdentityVerificationSource } from '../config/credentials/PlatformIdentityVC'

import { Agent, W3cCredentialService, W3cJwtVerifiableCredential, W3cJwtVerifiablePresentation } from '@credo-ts/core'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import { container, injectable, inject } from 'tsyringe'

import { RestMultiTenantAgentModules } from '../cliAgent'
import { PLATFORM_IDENTITY_VC_TYPE } from '../config/credentials/PlatformIdentityVC'
import { DatabaseManager } from '../persistence/DatabaseManager'
import { getTenantById } from '../persistence/TenantRepository'
import { deploymentSecret } from '../utils/deploymentSecret'
import { rootLogger } from '../utils/pinoLogger'
import { getIssuerApiKey } from '../utils/serviceApiKey'

import { type DeviceAssertion, deviceTrustService } from './DeviceTrustService'
import { billDocumentClaims, documentClaims } from './documentFacts'
import { memberInviteService } from './MemberInviteService'
import { personalSessionVersion, requireDeviceLoginApproval } from './PersonalSessionPolicy'
import {
  contactHash,
  contactHashCandidates,
  normalizeContactEmail,
  phoneHashCandidates,
} from './ssi/contactHash'
import { hashPin, needsRehash, verifyPin } from './ssi/pinHash'
import { PRODUCT_NAME } from '../config/productEdition'

const logger = rootLogger.child({ module: 'SSIAuthService' })

/** The shape of the contact hashes written today; rows below this still hold an open digest. */
const CONTACT_HASH_VERSION = 2

/** Wrong PINs allowed against one account before it is locked, and for how long. */
const PIN_ATTEMPT_LIMIT = 5
const PIN_LOCK_MINUTES = 15

/** Too many wrong PINs against one account. Carries how long the wait is, in minutes. */
export class PinLockedError extends Error {
  public constructor(public readonly minutes: number) {
    super(
      `Too many wrong PINs. For safety this account is locked for ${minutes} minute${minutes === 1 ? '' : 's'}. ` +
        `Try again after that, or sign in on a device you have already used.`,
    )
    this.name = 'PinLockedError'
  }
}

export type PlatformIdentityFailure =
  | 'identity_credential_missing'
  | 'holder_binding_failed'
  | 'issuer_untrusted'
  | 'credential_unrecognised'
  | 'credential_inactive'
  | 'account_not_found'
  | 'presenter_not_account_holder'

/** A rejected PlatformIdentityVC presentation, with a stable reason code safe to share. */
export class PlatformIdentityError extends Error {
  public constructor(
    public readonly code: PlatformIdentityFailure,
    message: string,
  ) {
    super(message)
    this.name = 'PlatformIdentityError'
  }
}

/** An invited account signs in for the first time through its invite link, never with a guessed PIN. */
export class InviteRequiredError extends Error {
  public constructor() {
    super('Open the invite link sent to your phone to choose your PIN')
    this.name = 'InviteRequiredError'
  }
}

/** The audience a login presentation must be addressed to (bound into the VP `aud`). */
export function loginAudience(): string {
  const audience = (process.env.SSI_LOGIN_AUDIENCE || process.env.PUBLIC_BASE_URL || '').trim()
  if (!audience) throw new Error('VC login is not configured: set SSI_LOGIN_AUDIENCE or PUBLIC_BASE_URL')
  return audience
}

@injectable()
export class SSIAuthService {
  private agent: Agent<RestMultiTenantAgentModules>

  constructor(@inject(Agent) agent: Agent) {
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
  /**
   * Open an account for someone an organisation invited, before they have signed up.
   * Creates the wallet and queues their identity card. Does not choose a PIN and does not
   * hand the inviter a session. The person sets their PIN the first time they sign in.
   */
  async provisionInvitedHolder(
    phone: string,
    displayName: string,
  ): Promise<{ userId: string; tenantId: string; created: boolean }> {
    const existing = this.findUserByContact(phone) as { id: string; tenant_id: string } | undefined
    if (existing?.id && existing.tenant_id) {
      return { userId: existing.id, tenantId: existing.tenant_id, created: false }
    }
    await this.register({ username: displayName.trim() || 'Team member', phone }, { quiet: true })
    const created = this.findUserByContact(phone) as { id: string; tenant_id: string } | undefined
    if (!created?.id || !created.tenant_id) {
      throw new Error('Could not open an account for that phone number')
    }
    return { userId: created.id, tenantId: created.tenant_id, created: true }
  }

  async register(
    claims: {
      username: string
      pin?: string // Optional 4-6 digit PIN for Web2-friendly login fallback
      phone?: string
      email?: string
      claimExistingTenantId?: string
      /** Opt in to a Central Registry confirmation. The plain identity card is still issued. */
      requestRegistryVerification?: boolean
    },
    options?: { quiet?: boolean },
  ): Promise<{
    tenantId: string
    token: string
    walletId: string
    claimedExisting: boolean
    vcOfferUrl?: string
    vcOfferAutoAccepted?: boolean
    retroactiveReceiptsQueued?: number
  }> {
    const db = DatabaseManager.getDatabase()

    if (!options?.quiet) {
      console.log(
        '[SSIAuthService] Processing registration:',
        JSON.stringify(
          {
            username: claims.username,
            hasPhone: !!claims.phone,
            hasEmail: !!claims.email,
          },
          null,
          2,
        ),
      )
    }

    // 1. Hash PII for lookup (Privacy Preserving - only hashes stored)
    // We normalize phone to ensure consistent lookups (077... matches 26377...)
    const phoneHash = claims.phone ? this.hashData(this.normalizePhone(claims.phone)) : null
    const emailHash = claims.email ? this.hashData(claims.email) : null
    const pinHash = claims.pin ? this.hashPin(claims.pin) : null

    if (!options?.quiet) {
      console.log(
        '[SSIAuthService] Computed hashes:',
        JSON.stringify({ hasPhoneHash: !!phoneHash, hasEmailHash: !!emailHash, hasPinHash: !!pinHash }, null, 2),
      )
    }

    // Check duplication by hash. An account opened before the keyed hash still holds an open
    // digest, so the check has to look for both or the same person would be signed up twice.
    let existingUser = null
    if (phoneHash) {
      existingUser = this.findUserByContact(claims.phone) as any
      if (existingUser) {
        // If we have a guest tenant to claim, but user exists -> MIGRATE
        const guestId =
          claims.claimExistingTenantId || (claims.phone ? await this.findTenantByPhone(claims.phone) : undefined)

        if (guestId && guestId !== existingUser.tenant_id) {
          logger.info(
            { guestId, targetId: existingUser.tenant_id },
            'User exists: Migrating guest tenant data to registered account',
          )
          await this.migrateGuestTenant(guestId, existingUser.tenant_id)

          // Return successful "Registration" (effectively login + claim)
          const token = await this.generateSessionToken(existingUser.id, existingUser.tenant_id)
          this.noteRegistryOptIn(existingUser.tenant_id, claims.requestRegistryVerification)
          return {
            tenantId: existingUser.tenant_id,
            walletId: existingUser.tenant_id,
            token,
            claimedExisting: true,
            vcOfferUrl: undefined, // No new identity VC needed
          }
        }
        throw new Error('User already exists (phone)')
      }
    }
    if (emailHash) {
      const existing = this.findUserByContact(undefined, claims.email) as any
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
        logger.info(
          { tenantId, count: foundGuestTenants.length, phone: '***' },
          'Found existing tenant(s) to claim via phone link',
        )
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
        config: { label: `user-${Date.now()}` }, // No PII in label
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
      platformName: process.env.PLATFORM_NAME || PRODUCT_NAME,
      verificationLevel: 'unverified',
    })

    // 5. Create SSI User Record - NO PII, NO PASSWORD stored
    const userId = crypto.randomUUID()
    db.prepare(
      `
      INSERT INTO ssi_users (
        id, tenant_id, did, phone_hash, email_hash, pin_hash, contact_hash_version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      userId,
      tenantId,
      userDid,
      phoneHash,
      emailHash,
      pinHash,
      phoneHash || emailHash ? CONTACT_HASH_VERSION : null,
      new Date().toISOString(),
      new Date().toISOString(),
    )

    if (vcOfferUrl && tenantId) {
      void import('./OrgMembershipCredentialService')
        .then(({ orgMembershipCredentialService }) => {
          orgMembershipCredentialService.queuePlatformIdentityOffer({
            walletTenantId: tenantId!,
            offerUri: vcOfferUrl,
            displayName: claims.username,
          })
        })
        .catch((error: any) => {
          logger.warn({ error: error?.message }, 'Could not queue platform identity offer')
        })
    }

    // 6. Retroactive Issuance: Source-of-Truth Re-Issuance (Fastlane Fix)
    // We check the immutable payment ledger for past transactions and issue fresh receipts
    // This removes dependency on fragile Guest Wallet migration
    let retroactiveReceiptsQueued = 0
    if (claims.phone) {
      retroactiveReceiptsQueued = await this.countPastReceipts(claims.phone)
      if (retroactiveReceiptsQueued > 0) {
        // Run un-awaited to not block the UI response
        this.reissuePastReceipts(tenantId!, claims.phone, userId).catch((err) =>
          logger.error({ error: err.message, phone: '***' }, 'Retroactive issuance failed'),
        )
      }
    }

    // Clean up temp phone link if we claimed it
    if (claimedExisting && claims.phone) {
      await this.deletePhoneLink(tenantId!)
    }

    this.noteRegistryOptIn(tenantId!, claims.requestRegistryVerification)

    // Generate Auth Token
    const token = await this.generateSessionToken(userId, tenantId!, userDid)

    // The identity card waits in the inbox until the person accepts it. Saving other cards
    // automatically never includes this card.
    const vcOfferAutoAccepted = vcOfferUrl ? false : undefined

    return {
      tenantId: tenantId!,
      walletId: tenantId!,
      token,
      claimedExisting,
      vcOfferUrl,
      vcOfferAutoAccepted,
      retroactiveReceiptsQueued,
    }
  }

  /**
   * Login via VC Presentation (TRUE SSI)
   *
   * The holder signs a JWT presentation over the one-time challenge nonce and includes
   * their PlatformIdentityVC. A session is issued only when the presentation and
   * credential signatures verify, the credential comes from this platform's issuer,
   * the presenter is the credential subject and owns that DID in the account's wallet,
   * and the credential has not been revoked.
   */
  async loginWithVC(params: {
    vpJwt: string
    nonce: string
    deviceAssertion?: DeviceAssertion
  }): Promise<{ token: string; tenantId: string; claims: PlatformIdentityClaims }> {
    const db = DatabaseManager.getDatabase()
    const challenge = db
      .prepare('SELECT tenant_id FROM ssi_login_challenges WHERE nonce = ? AND expires_at > ?')
      .get(params.nonce, new Date().toISOString()) as { tenant_id?: string | null } | undefined
    if (!challenge) throw new Error('Invalid or expired login challenge')
    // A presented nonce is spent even when the presentation is garbage, so it cannot be retried.
    db.prepare('DELETE FROM ssi_login_challenges WHERE nonce = ?').run(params.nonce)

    let presentation: W3cJwtVerifiablePresentation
    try {
      presentation = W3cJwtVerifiablePresentation.fromSerializedJwt(params.vpJwt)
    } catch {
      throw new Error('Invalid presentation format')
    }

    const audience = loginAudience()
    const verification = await this.agent.w3cCredentials.verifyPresentation({
      presentation,
      challenge: params.nonce,
      domain: audience,
      verifyCredentialStatus: false,
    })
    if (!verification.isValid) throw new Error('Presentation verification failed')
    if (!verification.validations.presentationSignature?.isValid) {
      throw new PlatformIdentityError('holder_binding_failed', 'Presentation signature did not verify')
    }

    const identity = await this.verifiedPlatformIdentity(presentation, this.presentationSignerDid(presentation))
    this.requireEnrolledDevice(identity.tenantId, params.nonce, params.deviceAssertion)
    return this.sessionForVerifiedPresentation(presentation, identity.holderDid, identity)
  }

  /** An enrolled phone must sign the same login nonce. A browser cannot. */
  private requireEnrolledDevice(walletTenantId: string, nonce: string, assertion?: DeviceAssertion): void {
    const enrolled = deviceTrustService.list(walletTenantId).some((device) => !device.revokedAt)
    if (!enrolled) return
    if (!assertion) {
      throw new PlatformIdentityError(
        'holder_binding_failed',
        'Confirm with fingerprint or face on the enrolled phone.',
      )
    }
    deviceTrustService.verifyAssertion({
      walletTenantId,
      assertion: { ...assertion, nonce, purpose: 'vc_login' },
      purpose: 'vc_login',
      consumeNonce: false,
    })
  }

  /**
   * Sign-in from a presentation whose signature, nonce and audience a Credo verifier
   * session has already checked (the OpenID4VP wallet login). The same issuer, status,
   * holder-binding and account checks as `loginWithVC` apply.
   */
  async loginWithVerifiedPresentation(
    presentation: W3cJwtVerifiablePresentation,
    verificationId?: string,
  ): Promise<{ token: string; tenantId: string; claims: PlatformIdentityClaims }> {
    const identity = await this.verifiedPlatformIdentity(presentation, this.presentationSignerDid(presentation))
    if (!verificationId) throw new Error('A device-approved verifier session is required')
    const device = requireDeviceLoginApproval(verificationId, identity.tenantId)
    return this.sessionForVerifiedPresentation(presentation, identity.holderDid, identity, device.deviceKeyId)
  }

  public async sessionForTrustedDevice(
    tenantId: string,
    deviceKeyId: string,
  ): Promise<{ token: string; tenantId: string }> {
    const account = DatabaseManager.getDatabase()
      .prepare('SELECT id, did FROM ssi_users WHERE tenant_id = ?')
      .get(tenantId) as { id: string; did: string } | undefined
    if (!account) throw new Error('Account unavailable')
    const device = deviceTrustService.getVerifiedDevice(deviceKeyId)
    if (device.walletTenantId !== tenantId) throw new Error('This device belongs to a different account')
    const token = await this.generateSessionToken(account.id, tenantId, account.did, deviceKeyId)
    return { token, tenantId }
  }

  public pinDigest(pin: string): string {
    return this.hashPin(pin)
  }

  public verifyEnrollmentPin(tenantId: string, pin: string): void {
    const db = DatabaseManager.getDatabase()
    const row = db.prepare('SELECT pin_hash FROM ssi_users WHERE tenant_id = ?').get(tenantId) as
      | { pin_hash: string | null }
      | undefined
    if (!row?.pin_hash || !verifyPin(pin, row.pin_hash)) {
      throw new Error('Confirm your account PIN to enroll this device.')
    }
    // A correct PIN is the moment an older, reversible hash can be replaced.
    if (needsRehash(row.pin_hash)) {
      db.prepare('UPDATE ssi_users SET pin_hash = ?, updated_at = ? WHERE tenant_id = ?').run(
        hashPin(pin),
        new Date().toISOString(),
        tenantId,
      )
    }
  }

  private async sessionForVerifiedPresentation(
    presentation: W3cJwtVerifiablePresentation,
    holderDid: string | undefined,
    known?: { user: { id: string; did: string }; tenantId: string; claims: Record<string, unknown> },
    deviceKeyId?: string,
  ): Promise<{ token: string; tenantId: string; claims: PlatformIdentityClaims }> {
    const resolved = known || (await this.verifiedPlatformIdentity(presentation, holderDid))
    const db = DatabaseManager.getDatabase()
    db.prepare('UPDATE ssi_users SET last_login_at = ? WHERE id = ?').run(new Date().toISOString(), resolved.user.id)
    const token = await this.generateSessionToken(resolved.user.id, resolved.tenantId, resolved.user.did, deviceKeyId)
    return {
      token,
      tenantId: resolved.tenantId,
      claims: resolved.claims as unknown as PlatformIdentityClaims,
    }
  }

  /**
   * The account behind a verified presentation of a PlatformIdentityVC, after the same
   * checks wallet sign-in applies: holder binding, trusted issuer, issued here and active,
   * and the presenter controls the account. Issues no session.
   */
  async verifiedPlatformIdentity(
    presentation: W3cJwtVerifiablePresentation,
    holderDid: string | undefined = this.presentationSignerDid(presentation),
  ): Promise<{
    user: { id: string; did: string }
    tenantId: string
    holderDid: string
    claims: Record<string, unknown>
  }> {
    const db = DatabaseManager.getDatabase()
    const presented = presentation.presentation.verifiableCredential
    const credential = (Array.isArray(presented) ? presented : [presented])
      .map((item) => (item instanceof W3cJwtVerifiableCredential ? item : undefined))
      .find((item) => item?.type.includes(PLATFORM_IDENTITY_VC_TYPE))
    if (!credential)
      throw new PlatformIdentityError(
        'identity_credential_missing',
        'Presentation does not contain a PlatformIdentityVC',
      )

    // Holder binding: the presentation signer must be the credential subject.
    const subjectIds = credential.credentialSubjectIds
    if (!holderDid || subjectIds.length === 0 || !subjectIds.includes(holderDid)) {
      throw new PlatformIdentityError('holder_binding_failed', 'Presentation is not bound to the credential subject')
    }

    // Issuer trust: only the platform issues PlatformIdentityVC.
    if (!(await this.platformIdentityIssuerDids()).has(credential.issuerId)) {
      throw new PlatformIdentityError('issuer_untrusted', 'Untrusted PlatformIdentityVC issuer')
    }

    // Status is fail-closed: the credential must be one this platform recorded as issued.
    const credentialId = credential.id || credential.jwt.payload.jti
    if (!credentialId)
      throw new PlatformIdentityError('credential_unrecognised', 'PlatformIdentityVC has no identifier')
    const { credentialLifecycleService } = await import('./ssi/CredentialLifecycleService')
    const { statusListAllocatorService } = await import('./ssi/StatusListAllocatorService')
    if (!credentialLifecycleService.isIssuedHere(credentialId))
      throw new PlatformIdentityError('credential_unrecognised', 'PlatformIdentityVC is not recognised')
    const status = statusListAllocatorService.getStatusByCredentialRef(credentialId)
    if (credentialLifecycleService.revocationOf(credentialId).revoked || (status && status !== 'valid')) {
      throw new PlatformIdentityError('credential_inactive', 'PlatformIdentityVC is not active')
    }

    const vcClaim = credential.jwt.payload.additionalClaims.vc as { credentialSubject?: unknown } | undefined
    const subject = Array.isArray(vcClaim?.credentialSubject)
      ? vcClaim?.credentialSubject[0]
      : vcClaim?.credentialSubject
    const claims = (subject && typeof subject === 'object' ? subject : {}) as Record<string, unknown>
    const tenantId = typeof claims.tenantId === 'string' ? claims.tenantId : undefined
    if (!tenantId) throw new PlatformIdentityError('account_not_found', 'VC missing tenantId claim')

    const user = db.prepare('SELECT * FROM ssi_users WHERE tenant_id = ?').get(tenantId) as any
    if (!user) throw new PlatformIdentityError('account_not_found', 'User not found')
    if (!(await this.walletOwnsDid(tenantId, user.did, holderDid))) {
      throw new PlatformIdentityError('presenter_not_account_holder', 'Presenter does not control this account')
    }

    return { user: { id: user.id, did: user.did }, tenantId, holderDid, claims }
  }

  /** Explicit allowlist when configured; otherwise only the pinned platform issuer DID. */
  private async platformIdentityIssuerDids(): Promise<Set<string>> {
    const configured = (process.env.PLATFORM_IDENTITY_ISSUER_DIDS || '')
      .split(',')
      .map((did) => did.trim())
      .filter(Boolean)
    if (configured.length > 0) return new Set(configured)
    const { platformIssuerDid } = await import('./ssi/PlatformIssuerDid')
    return new Set([await platformIssuerDid(this.agent.context)])
  }

  private presentationSignerDid(presentation: W3cJwtVerifiablePresentation): string | undefined {
    const kid = presentation.jwt.header.kid
    return typeof kid === 'string' && kid.startsWith('did:') ? kid.split('#')[0] : undefined
  }

  /** The holder DID is the account's registered DID or one created in its own wallet. */
  private async walletOwnsDid(
    tenantId: string,
    registeredDid: string | undefined,
    holderDid: string,
  ): Promise<boolean> {
    if (registeredDid && registeredDid === holderDid) return true
    const tenantAgent = await this.agent.modules.tenants.getTenantAgent({ tenantId })
    try {
      const created = await tenantAgent.dids.getCreatedDids({ did: holderDid })
      return created.length > 0
    } finally {
      await tenantAgent.endSession()
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

    if (!credentials.phone?.trim() && !credentials.email?.trim()) throw new Error('Phone or Email required')

    // Matches the keyed hash written today and the open digest an older account still holds.
    const user = (
      credentials.phone?.trim()
        ? this.findUserByContact(credentials.phone)
        : this.findUserByContact(undefined, credentials.email)
    ) as any

    if (!user) throw new Error('Invalid credentials')

    this.assertPinNotLocked(user)

    // An invited account has no PIN until the person opens their invite link and chooses one.
    // The organisation never sets that PIN, and nobody else can claim it by guessing first.
    if (!user.pin_hash && memberInviteService.wasInvited(user.id)) {
      throw new InviteRequiredError()
    }
    if (!user.pin_hash) {
      db.prepare(
        'UPDATE ssi_users SET pin_hash = ?, pin_attempts = 0, pin_locked_until = NULL, updated_at = ? WHERE id = ?',
      ).run(hashPin(credentials.pin), new Date().toISOString(), user.id)
    } else if (!verifyPin(credentials.pin, user.pin_hash)) {
      this.notePinFailure(user.id, Number(user.pin_attempts || 0))
      throw new Error('Invalid credentials')
    } else if (needsRehash(user.pin_hash)) {
      db.prepare('UPDATE ssi_users SET pin_hash = ?, updated_at = ? WHERE id = ?').run(
        hashPin(credentials.pin),
        new Date().toISOString(),
        user.id,
      )
    }

    this.clearPinFailures(user.id)
    this.upgradeContactHashes(
      user.id,
      credentials.phone ? this.normalizePhone(credentials.phone) : undefined,
      credentials.email,
    )

    // Update last login
    db.prepare('UPDATE ssi_users SET last_login_at = ? WHERE id = ?').run(new Date().toISOString(), user.id)

    // Records issued before holder custody are rebound to this wallet's own key in the background.
    void import('./ssi/CustodyRebindService').then(({ custodyRebindService }) =>
      custodyRebindService.scheduleRebind(user.tenant_id),
    )

    const token = await this.generateSessionToken(user.id, user.tenant_id, user.did)

    return { token, tenantId: user.tenant_id }
  }

  /** What the invite link shows before the person accepts: organisation, role, proposed name. */
  describeInvite(code: string): { orgName: string; role: string; proposedName?: string; phoneHint?: string } {
    const invite = memberInviteService.findOpenByCode(code)
    if (!invite) throw new Error('This invite link has expired or was replaced by a newer one')
    const db = DatabaseManager.getDatabase()
    const membership = db
      .prepare('SELECT role FROM org_memberships WHERE user_id = ? AND org_tenant_id = ?')
      .get(invite.user_id, invite.org_tenant_id) as { role: string } | undefined
    const contact = db
      .prepare(`SELECT phone FROM org_contacts WHERE org_tenant_id = ? AND id IN (?, ?) AND phone IS NOT NULL LIMIT 1`)
      .get(
        invite.org_tenant_id,
        `${invite.org_tenant_id}:member:${invite.user_id}`,
        `${invite.org_tenant_id}:owner:${invite.user_id}`,
      ) as { phone: string } | undefined
    const digits = (contact?.phone || '').replace(/\D/g, '')
    return {
      orgName: getTenantById(invite.org_tenant_id)?.label || 'Your organisation',
      role: membership?.role || 'member',
      proposedName: invite.proposed_name || undefined,
      phoneHint: digits.length >= 4 ? `•••• ${digits.slice(-4)}` : undefined,
    }
  }

  /**
   * The invited person confirms their name, proves they hold the invited phone number and
   * chooses their own PIN. Spends the link and signs them in.
   */
  async acceptInvite(input: {
    code: string
    name: string
    phone: string
    pin: string
    whatsappAlerts?: boolean
  }): Promise<{ token: string; tenantId: string; name: string }> {
    const { OrganizationService } = await import('./OrganizationService')
    const invite = memberInviteService.findOpenByCode(input.code)
    if (!invite) throw new Error('This invite link has expired or was replaced by a newer one')
    const name = OrganizationService.cleanPersonName(input.name)
    if (!name) throw new Error('Enter your name')
    if (!/^\d{4,6}$/.test(String(input.pin || ''))) throw new Error('Choose a PIN of 4 to 6 digits')
    const db = DatabaseManager.getDatabase()
    const user = db
      .prepare('SELECT id, tenant_id, did, phone_hash, pin_hash FROM ssi_users WHERE id = ?')
      .get(invite.user_id) as
      | { id: string; tenant_id: string; did?: string; phone_hash?: string; pin_hash?: string | null }
      | undefined
    if (!user) throw new Error('This invite link has expired or was replaced by a newer one')
    const phone = this.normalizePhone(String(input.phone || ''))
    if (!phone || !this.contactMatches(user.phone_hash, phone)) {
      throw new Error('That is not the phone number this invite was sent to')
    }
    const now = new Date().toISOString()
    const claimed = db.transaction(() => {
      const set = db
        .prepare(
          `UPDATE ssi_users
              SET pin_hash = ?, phone_hash = ?, contact_hash_version = ?, updated_at = ?, last_login_at = ?
            WHERE id = ? AND pin_hash IS NULL`,
        )
        .run(hashPin(input.pin), contactHash(phone), CONTACT_HASH_VERSION, now, now, user.id)
      if (!set.changes) return false
      memberInviteService.markUsed(user.id)
      return true
    })()
    if (!claimed) throw new Error('A PIN was already chosen for this account. Sign in with it instead')

    const organizations = container.resolve(OrganizationService)
    await organizations.applyConfirmedMemberName(user.id, name)
    if (name !== invite.proposed_name) {
      await this.reissuePlatformIdentityOffer(user.tenant_id, name, phone).catch((error: any) =>
        logger.warn({ error: error?.message }, 'Could not reissue identity card after invite'),
      )
    }
    if (input.whatsappAlerts) {
      // The person's own opt-in, so their staff card, tasks and requests from this org reach WhatsApp too.
      const { notificationService } = await import('./NotificationService')
      for (const eventType of ['task', 'vc_offer', 'proof_request', 'payment_link', 'remittance']) {
        try {
          notificationService.setPreference({
            tenantId: invite.org_tenant_id,
            userId: user.id,
            phone,
            eventType,
            enabled: true,
          })
        } catch (error: any) {
          logger.warn({ error: error?.message, eventType }, 'Could not turn on WhatsApp alerts after invite')
        }
      }
    }
    void import('./ssi/CustodyRebindService').then(({ custodyRebindService }) =>
      custodyRebindService.scheduleRebind(user.tenant_id),
    )
    const token = await this.generateSessionToken(user.id, user.tenant_id, user.did)
    return { token, tenantId: user.tenant_id, name }
  }

  /**
   * Create login challenge for VC presentation
   */
  async createLoginChallenge(): Promise<{ nonce: string; expiresAt: string; audience: string }> {
    const db = DatabaseManager.getDatabase()
    const audience = loginAudience()
    const nonce = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString() // 5 min

    db.prepare(
      `
      INSERT INTO ssi_login_challenges (nonce, expires_at, created_at)
      VALUES (?, ?, ?)
    `,
    ).run(nonce, expiresAt, new Date().toISOString())

    return { nonce, expiresAt, audience }
  }

  /**
   * Link phone to tenant temporarily (Fastlane: checkout → registration)
   * Phone is encrypted and auto-expires after 24h
   */
  async linkPhoneTemporarily(tenantId: string, phone: string): Promise<void> {
    const db = DatabaseManager.getDatabase()
    const encryptedPhone = this.encryptPII(phone)
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    db.prepare(
      `
      INSERT OR REPLACE INTO temp_phone_links (tenant_id, encrypted_phone, expires_at, created_at)
      VALUES (?, ?, ?, ?)
    `,
    ).run(tenantId, encryptedPhone, expiresAt, new Date().toISOString())

    logger.info({ tenantId }, 'Phone linked temporarily for Fastlane flow')
  }

  /**
   * Find REGISTERED tenant by phone
   */
  async findRegisteredTenantByPhone(phone: string): Promise<string | undefined> {
    const user = this.findUserByContact(phone) as { tenant_id: string } | undefined

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

    const links = db
      .prepare(
        `
      SELECT tenant_id, encrypted_phone FROM temp_phone_links 
      WHERE expires_at > ?
    `,
      )
      .all(new Date().toISOString()) as { tenant_id: string; encrypted_phone: string }[]

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
      const result = await tenantAgent.dids.create({
        method: 'key',
        options: {
          createKey: {
            type: {
              kty: 'OKP',
              crv: 'Ed25519',
            },
          },
        },
      })
      if (!result.didState.did) {
        await tenantAgent.endSession()
        const reason = (result.didState as { reason?: string }).reason
        throw new Error(`Could not create the account DID (${result.didState.state}${reason ? `: ${reason}` : ''})`)
      }
      userDid = result.didState.did
    } else {
      userDid = existingDids[0].did
    }
    await tenantAgent.endSession()
    return userDid
  }

  /** Records an opt-in. The identity card issued above is unchanged. */
  private noteRegistryOptIn(walletTenantId: string, optedIn: boolean | undefined): void {
    if (!optedIn) return
    try {
      const { identityVerificationRequestService } = require('./IdentityVerificationRequestService') as typeof import('./IdentityVerificationRequestService')
      identityVerificationRequestService.requestRegistryVerification(walletTenantId)
    } catch (error: any) {
      logger.warn({ error: error?.message }, 'Could not record the registry verification request')
    }
  }

  private async issuePlatformIdentityVC(tenantId: string, claims: PlatformIdentityClaims): Promise<string | undefined> {
    return this.createPlatformOfferUri({
      credentialDefinitionId: PLATFORM_IDENTITY_VC_TYPE,
      claims: {
        ...claims,
        tenantId, // Include tenantId for later lookup
      },
    })
  }

  /** An offer signed by the platform (root) issuer, e.g. identity or checkout receipts. */
  public async createPlatformOfferUri(input: {
    credentialDefinitionId: string
    claims: Record<string, unknown>
    format?: 'jwt_vc_json' | 'sd_jwt'
  }): Promise<string | undefined> {
    const issuerApiUrl = process.env.ISSUER_API_URL || 'http://localhost:3000'
    const apiKey = getIssuerApiKey()

    try {
      const response = await fetch(`${issuerApiUrl}/custom-oidc/issuer/credential-offers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          credentials: [
            {
              credentialDefinitionId: input.credentialDefinitionId,
              format: input.format || 'jwt_vc_json',
              type: ['VerifiableCredential', input.credentialDefinitionId],
              claims: input.claims,
            },
          ],
        }),
      })

      if (!response.ok) {
        logger.error(
          { status: response.status, credentialDefinitionId: input.credentialDefinitionId },
          'Failed to create platform credential offer',
        )
        return undefined
      }

      const data = (await response.json()) as {
        offerUrl?: string
        credentialOffer?: string
        credential_offer_uri?: string
      }
      return data.offerUrl || data.credentialOffer || data.credential_offer_uri
    } catch (err: any) {
      logger.error(
        { error: err.message, credentialDefinitionId: input.credentialDefinitionId },
        'Error creating platform credential offer',
      )
      return undefined
    }
  }

  /** A platform identity offer carrying the given claims, not queued in the inbox (custody rebind). */
  public async createPlatformIdentityOfferUri(
    walletTenantId: string,
    claims: PlatformIdentityClaims,
  ): Promise<string | undefined> {
    return this.issuePlatformIdentityVC(walletTenantId, claims)
  }

  /** A fresh platform identity offer when the inbox card can no longer be accepted. */
  public async reissuePlatformIdentityOffer(
    walletTenantId: string,
    displayName?: string,
    phone?: string,
  ): Promise<string | undefined> {
    const offerUri = await this.issuePlatformIdentityVC(walletTenantId, {
      displayName: displayName || 'Member',
      ...(phone ? { phone } : {}),
      registeredAt: new Date().toISOString(),
      platformTenantId: walletTenantId,
      platformName: process.env.PLATFORM_NAME || PRODUCT_NAME,
      verificationLevel: 'unverified',
    })
    if (!offerUri) return undefined
    const { orgMembershipCredentialService } = await import('./OrgMembershipCredentialService')
    orgMembershipCredentialService.queuePlatformIdentityOffer({
      walletTenantId,
      offerUri,
      displayName,
    })
    return offerUri
  }

  /**
   * The same PlatformIdentityCredential, carrying a dateOfBirth and the over18 fact it
   * derives — not a new credential type. Issued as `vc+sd-jwt` (see
   * SELECTIVE_DISCLOSURE_VC_TYPES) so a verifier can be shown only "18 or over" while
   * name, phone and the date of birth itself stay on the phone. The person's existing
   * jwt_vc_json identity card is untouched and keeps working for sign-in.
   *
   * `source` records how dateOfBirth got here: 'self_attested' when the person entered it
   * themselves, 'registry_confirmed' when the Central Registry supplied it. Nothing here
   * invents a date of birth; the caller must have a real one.
   */
  public async reissuePlatformIdentityWithDateOfBirth(
    walletTenantId: string,
    dateOfBirth: string,
    source: IdentityVerificationSource,
    displayName?: string,
    phone?: string,
  ): Promise<string | undefined> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
      throw new Error('dateOfBirth must be an ISO date (YYYY-MM-DD)')
    }
    const over18: 'Yes' | 'No' = this.isAtLeast18(dateOfBirth) ? 'Yes' : 'No'
    const offerUri = await this.createPlatformOfferUri({
      credentialDefinitionId: PLATFORM_IDENTITY_VC_TYPE,
      format: 'sd_jwt',
      claims: {
        displayName: displayName || 'Member',
        ...(phone ? { phone } : {}),
        registeredAt: new Date().toISOString(),
        platformTenantId: walletTenantId,
        platformName: process.env.PLATFORM_NAME || PRODUCT_NAME,
        verificationLevel: source === 'registry_confirmed' ? 'kyc_verified' : 'phone_verified',
        dateOfBirth,
        over18,
        identityVerification: source,
        tenantId: walletTenantId,
      },
    })
    if (!offerUri) return undefined
    const { orgMembershipCredentialService } = await import('./OrgMembershipCredentialService')
    orgMembershipCredentialService.queuePlatformIdentityOffer({
      walletTenantId,
      offerUri,
      displayName,
      variant: 'age_verification',
    })
    return offerUri
  }

  private isAtLeast18(dateOfBirthIso: string): boolean {
    const dob = new Date(`${dateOfBirthIso}T00:00:00Z`)
    if (Number.isNaN(dob.getTime())) throw new Error('dateOfBirth is not a valid date')
    const now = new Date()
    let age = now.getUTCFullYear() - dob.getUTCFullYear()
    const beforeBirthdayThisYear =
      now.getUTCMonth() < dob.getUTCMonth() ||
      (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() < dob.getUTCDate())
    if (beforeBirthdayThisYear) age -= 1
    return age >= 18
  }

  /**
   * Retroactive Issuance:
   * Query ack_payments for past successful transactions matching this phone
   * and issue ReceiptVCs to the new tenant.
   * This is the "Source of Truth" recovery strategy.
   */
  private async reissuePastReceipts(tenantId: string, phone: string, userId?: string): Promise<void> {
    const payments = await this.getPastPayments(phone)

    if (payments.length === 0) return

    logger.info({ tenantId, count: payments.length }, 'Found past payments for retroactive receipt issuance')
    await this.reissueReceiptsForPayments(tenantId, payments, this.hashData(this.normalizePhone(phone)), userId)
  }

  /**
   * Payment receipts this signed-in person earned, matched on the phone they registered with.
   * The ledger keeps the payer's phone; the account keeps only its hash, so match by hash.
   */
  public pastPaymentsForUser(userId: string): any[] {
    const db = DatabaseManager.getDatabase()
    const user = db.prepare('SELECT phone_hash FROM ssi_users WHERE id = ? LIMIT 1').get(userId) as
      | { phone_hash?: string }
      | undefined
    if (!user?.phone_hash) return []
    const paid = db
      .prepare(
        `SELECT * FROM ack_payments WHERE state IN ('paid', 'delivered') AND payer_phone IS NOT NULL AND payer_phone <> ''`,
      )
      .all() as any[]
    return paid.filter((payment) => this.hashData(this.normalizePhone(String(payment.payer_phone))) === user.phone_hash)
  }

  /**
   * "Send my receipts again": fresh receipt records for every payment this person made, issued
   * to the wallet they are signed in with now (a new phone, for example). Returns how many.
   */
  public async reissueReceiptsForUser(userId: string, walletTenantId: string): Promise<number> {
    const payments = this.pastPaymentsForUser(userId)
    if (payments.length === 0) return 0
    const user = DatabaseManager.getDatabase()
      .prepare('SELECT phone_hash FROM ssi_users WHERE id = ? LIMIT 1')
      .get(userId) as { phone_hash?: string } | undefined
    await this.reissueReceiptsForPayments(walletTenantId, payments, String(user?.phone_hash || ''), userId)
    return payments.length
  }

  private async reissueReceiptsForPayments(
    tenantId: string,
    payments: any[],
    subjectHash: string,
    userId?: string,
  ): Promise<void> {
    const issuerApiUrl = process.env.ISSUER_API_URL || 'http://localhost:3000'
    const apiKey = getIssuerApiKey()
    const holderApiUrl = process.env.HOLDER_API_URL || process.env.HOLDER_BASE_URL || 'http://localhost:7000'
    const sessionToken = undefined

    for (const payment of payments) {
      try {
        const merchantTenantId = this.merchantOfPayment(payment)
        const receipt = {
          transactionId: payment.provider_ref || payment.id,
          paymentRef: payment.provider_ref || payment.id,
          amount: String(payment.amount),
          currency: payment.currency || 'USD',
          payerPhone: payment.payer_phone,
          subjectHash,
          merchant: merchantTenantId,
          cartId: payment.cart_id,
          invoiceId: payment.invoice_id,
          invoiceRef: payment.invoice_id,
          invoiceHash: payment.invoice_hash, // Preserves audit chain if available
          previousRecordHash: payment.invoice_hash,
          paidAt: payment.updated_at || new Date().toISOString(),
          timestamp: payment.updated_at || new Date().toISOString(),
        }
        const billLink = this.billLinkOfPayment(payment)
        const receiptClaims = billLink
          ? billDocumentClaims('ReceiptVC', billLink, receipt)
          : documentClaims('ReceiptVC', receipt, merchantTenantId, { when: payment.updated_at || undefined })
        // Issue ReceiptVC
        // We issue directly to the new tenant (x-tenant-id header target)
        const response = await fetch(`${issuerApiUrl}/custom-oidc/issuer/credential-offers`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'x-tenant-id': tenantId, // Target the new registered tenant!
          },
          body: JSON.stringify({
            credentials: [
              {
                credentialDefinitionId: 'ReceiptVC',
                format: 'jwt_vc_json',
                type: ['VerifiableCredential', 'ReceiptVC'],
                claims: receiptClaims,
              },
            ],
          }),
        })

        if (response.ok) {
          logger.debug({ paymentId: payment.id, tenantId }, 'Retroactively issued ReceiptVC')
          const offerPayload = (await response.json()) as any
          const offerUri =
            offerPayload?.credential_offer_uri ||
            offerPayload?.credential_offer_url ||
            offerPayload?.offerUrl ||
            offerPayload?.credentialOffer
          if (offerUri && userId) {
            await this.queueRetroReceiptOffer({
              tenantId,
              userId,
              payment,
              offerUri,
            })
          }
          if (sessionToken) {
            try {
              const retryOfferUri = offerUri
              if (retryOfferUri) {
                await fetch(`${holderApiUrl}/api/wallet/credentials/accept-offer`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${sessionToken}`,
                  },
                  body: JSON.stringify({ offerUri: retryOfferUri }),
                })
              }
            } catch (acceptError: any) {
              logger.warn(
                { paymentId: payment.id, error: acceptError.message },
                'Failed to auto-accept retro ReceiptVC',
              )
            }
          }
        } else {
          logger.warn({ status: response.status, paymentId: payment.id }, 'Failed to retro-issue receipt')
        }
      } catch (e: any) {
        logger.error({ error: e.message, paymentId: payment.id }, 'Error retro-issuing receipt')
      }
    }
  }

  private paymentMetadata(payment: any): Record<string, any> {
    try {
      const parsed = JSON.parse(String(payment?.metadata || '{}'))
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  }

  /** The organisation that was paid. Pay-link payments keep it in metadata; their tenant column is the payer's wallet. */
  private merchantOfPayment(payment: any): string | undefined {
    const fromMetadata = this.paymentMetadata(payment).merchantTenantId
    if (typeof fromMetadata === 'string' && fromMetadata.trim()) return fromMetadata.trim()
    return payment?.tenant_id || undefined
  }

  private billLinkOfPayment(
    payment: any,
  ): { merchant_id: string; sector?: string; metadata?: string; created_at?: string } | undefined {
    const linkId = this.paymentMetadata(payment).paymentLinkId
    if (typeof linkId !== 'string' || !linkId) return undefined
    return DatabaseManager.getDatabase()
      .prepare('SELECT merchant_id, sector, metadata, created_at FROM payment_links WHERE id = ?')
      .get(linkId) as { merchant_id: string; sector?: string; metadata?: string; created_at?: string } | undefined
  }

  private async queueRetroReceiptOffer(input: {
    tenantId: string
    userId: string
    payment: any
    offerUri: string
  }): Promise<void> {
    const db = DatabaseManager.getDatabase()
    const now = new Date().toISOString()
    const amount = Number(input.payment.amount || 0)
    const currency = String(input.payment.currency || 'USD')
    const reference = String(input.payment.provider_ref || input.payment.id || '').trim()
    const sourceId = String(input.payment.id || reference || crypto.randomUUID())
    try {
      db.prepare(
        `INSERT INTO wallet_pending_offers (
           id, tenant_id, issuer_tenant_id, source_type, source_id, credential_type, offer_uri,
           title, body, metadata, created_at, attempt_count, last_attempt_at
         )
         SELECT @id, @tenantId, @issuerTenantId, 'payment', @sourceId, 'ReceiptVC', @offerUri,
                @title, @body, @metadata, @now, 0, @now
         WHERE NOT EXISTS (
           SELECT 1 FROM wallet_pending_offers
            WHERE tenant_id = @tenantId AND source_type = 'payment' AND source_id = @sourceId AND resolved_at IS NULL
         )`,
      ).run({
        id: crypto.randomUUID(),
        tenantId: input.tenantId,
        issuerTenantId: this.merchantOfPayment(input.payment) || null,
        sourceId,
        offerUri: input.offerUri,
        title: `Payment receipt${reference ? ` · ${reference}` : ''}`,
        body: `A payment receipt record (${currency} ${amount.toFixed(2)}) is ready. Keep it from your inbox.`,
        metadata: JSON.stringify({
          userId: input.userId,
          amount,
          currency,
          providerRef: reference || null,
          paymentId: input.payment.id || null,
          offerUri: input.offerUri,
        }),
        now,
      })
    } catch (error: any) {
      logger.warn(
        { error: error?.message, paymentId: input.payment.id },
        'Could not queue retro receipt offer in inbox',
      )
    }
  }

  private async countPastReceipts(phone: string): Promise<number> {
    const payments = await this.getPastPayments(phone)
    return payments.length
  }

  private async getPastPayments(phone: string): Promise<any[]> {
    const db = DatabaseManager.getDatabase()

    // Normalize phone to match potential DB formats
    const normalizedPhone = this.normalizePhone(phone)

    // Find all PAID payments for this phone (check both raw and normalized)
    return db
      .prepare(
        `
        SELECT * FROM ack_payments 
        WHERE (payer_phone = ? OR payer_phone = ?) 
        AND state IN ('paid', 'delivered')
    `,
      )
      .all(normalizedPhone, phone) as any[]
  }

  private normalizePhone(phone: string): string {
    let clean = phone.replace(/\D/g, '')
    if (clean.startsWith('0') && clean.length === 10) {
      clean = '263' + clean.slice(1)
    }
    return clean
  }

  /**
   * The value written to `phone_hash` / `email_hash`: a keyed hash, so the number cannot be
   * recovered by hashing every possible number. See `ssi/contactHash.ts` for why that matters.
   */
  private hashData(data: string): string {
    return contactHash(data.trim().toLowerCase())
  }

  /** The row for a phone number or email address, matching the keyed hash or an older digest. */
  private findUserByContact(phone?: string, email?: string): any | undefined {
    const candidates = contactHashCandidates(phone, email)
    if (candidates.length === 0) return undefined
    const db = DatabaseManager.getDatabase()
    const placeholders = candidates.map(() => '?').join(', ')
    return db
      .prepare(
        `SELECT * FROM ssi_users
          WHERE phone_hash IN (${placeholders}) OR email_hash IN (${placeholders})
          LIMIT 1`,
      )
      .get(...candidates, ...candidates)
  }

  /** Whether a stored hash belongs to this phone number, old shape or new. */
  private contactMatches(storedHash: string | null | undefined, phone: string): boolean {
    if (!storedHash) return false
    return phoneHashCandidates(phone).includes(storedHash)
  }

  /**
   * Rewrites an account's contact hashes to the keyed form. Called on a successful sign-in, the
   * one moment the person's own number is in hand, so the open digests disappear as people return.
   */
  private upgradeContactHashes(userId: string, phone?: string, email?: string): void {
    try {
      const db = DatabaseManager.getDatabase()
      const row = db
        .prepare('SELECT phone_hash, email_hash, contact_hash_version FROM ssi_users WHERE id = ?')
        .get(userId) as { phone_hash?: string; email_hash?: string; contact_hash_version?: number } | undefined
      if (!row || row.contact_hash_version === CONTACT_HASH_VERSION) return

      const phoneHash = phone?.trim() ? contactHash(this.normalizePhone(phone)) : row.phone_hash
      const emailHash = email?.trim() ? contactHash(normalizeContactEmail(email)) : row.email_hash
      // Only mark the row done once every stored contact hash has been rewritten. Signing in with
      // a phone leaves an old email digest in place, and the report should keep counting it.
      const phoneSettled = !row.phone_hash || Boolean(phone?.trim())
      const emailSettled = !row.email_hash || Boolean(email?.trim())
      db.prepare(
        'UPDATE ssi_users SET phone_hash = ?, email_hash = ?, contact_hash_version = ?, updated_at = ? WHERE id = ?',
      ).run(
        phoneHash ?? null,
        emailHash ?? null,
        phoneSettled && emailSettled ? CONTACT_HASH_VERSION : null,
        new Date().toISOString(),
        userId,
      )
    } catch (error) {
      // A failed rewrite must never block a sign-in; the row stays on the old digest and the
      // data-protection report keeps counting it.
      logger.warn({ userId, error: (error as Error).message }, 'Could not rewrite contact hashes to the keyed form')
    }
  }

  /**
   * How long an account is locked after repeated wrong PINs. A four-to-six digit PIN with no limit
   * is guessable by anyone who can reach the endpoint; the global rate limit counted every caller
   * together rather than attempts against one account.
   */
  private assertPinNotLocked(user: { id: string; pin_locked_until?: string | null }): void {
    if (!user.pin_locked_until) return
    const until = new Date(user.pin_locked_until)
    if (Number.isNaN(until.getTime()) || until.getTime() <= Date.now()) return
    const minutes = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60000))
    throw new PinLockedError(minutes)
  }

  /** Counts a wrong PIN and locks the account once the allowance is used up. */
  private notePinFailure(userId: string, attempts: number): void {
    const db = DatabaseManager.getDatabase()
    const next = attempts + 1
    const lockedUntil =
      next >= PIN_ATTEMPT_LIMIT ? new Date(Date.now() + PIN_LOCK_MINUTES * 60000).toISOString() : null
    db.prepare('UPDATE ssi_users SET pin_attempts = ?, pin_locked_until = ? WHERE id = ?').run(
      next >= PIN_ATTEMPT_LIMIT ? 0 : next,
      lockedUntil,
      userId,
    )
  }

  /** Clears the attempt count after a correct PIN. */
  private clearPinFailures(userId: string): void {
    DatabaseManager.getDatabase()
      .prepare('UPDATE ssi_users SET pin_attempts = 0, pin_locked_until = NULL WHERE id = ?')
      .run(userId)
  }

  private hashPin(pin: string): string {
    return hashPin(pin)
  }

  private encryptPII(data: string): string {
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv('aes-256-cbc', this.piiKey(), iv)
    let encrypted = cipher.update(data, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    return iv.toString('hex') + ':' + encrypted
  }

  private decryptPII(encryptedData: string): string {
    const [ivHex, encrypted] = encryptedData.split(':')
    const iv = Buffer.from(ivHex, 'hex')
    const decipher = crypto.createDecipheriv('aes-256-cbc', this.piiKey(), iv)
    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  }

  /**
   * The AES key for the short-lived guest phone link. The configured secret is stretched to 32
   * bytes with SHA-256 rather than padded with spaces, which is what the old code did: padding
   * threw away the end of a long secret and filled a short one with a known byte.
   */
  private piiKey(): Buffer {
    return crypto
      .createHash('sha256')
      .update(deploymentSecret('PII_ENCRYPTION_KEY', 'credo-development-pii-key'))
      .digest()
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

      logger.info(
        { guestTenantId, targetTenantId, count: records.length },
        'Migrating credentials from guest to registered account',
      )

      for (const record of records) {
        try {
          // Check if already exists? (by ID)
          // W3cCredentialService doesn't strictly enforce ID uniqueness across wallets, but good to check?
          // Just try store, if it fails it fails.
          await (targetW3c as any).storeCredential(targetAgent.context, {
            credential: (record as any).credential,
          } as any)
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

  private async generateSessionToken(
    userId: string,
    tenantId: string,
    did?: string,
    deviceKeyId?: string,
  ): Promise<string> {
    let secret = process.env.JWT_SECRET

    if (!secret) {
      const genericRecords = await this.agent.genericRecords.findAllByQuery({ hasSecretKey: 'true' })
      secret = genericRecords[0]?.content.secretKey as string
    }

    if (!secret) {
      throw new Error('No JWT secret found for signing session token')
    }

    return jwt.sign(
      {
        id: userId,
        tenantId,
        did: did || 'unknown',
        role: 'RestTenantAgent',
        sessionVersion: personalSessionVersion(userId),
        ...(deviceKeyId ? { deviceKeyId, amr: ['device_key'], auth_time: Math.floor(Date.now() / 1000) } : {}),
        // NO PII in token - claims come from VC when needed
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, // 30 days
      },
      secret,
    )
  }

  async generateScopedSessionToken(params: {
    userId: string
    tenantId: string
    did?: string
    expiresInSeconds: number
    audience?: string
  }): Promise<string> {
    let secret = process.env.JWT_SECRET

    if (!secret) {
      const genericRecords = await this.agent.genericRecords.findAllByQuery({ hasSecretKey: 'true' })
      secret = genericRecords[0]?.content.secretKey as string
    }

    if (!secret) {
      throw new Error('No JWT secret found for signing session token')
    }

    const now = Math.floor(Date.now() / 1000)
    return jwt.sign(
      {
        id: params.userId,
        sessionVersion: personalSessionVersion(params.userId),
        tenantId: params.tenantId,
        did: params.did || 'unknown',
        role: 'RestTenantAgent',
        aud: params.audience || 'holder-wallet',
        iat: now,
        exp: now + params.expiresInSeconds,
      },
      secret,
    )
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
