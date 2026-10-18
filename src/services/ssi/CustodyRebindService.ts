import { W3cCredentialService } from '@credo-ts/core'

import { PLATFORM_IDENTITY_VC_TYPE } from '../../config/credentials/PlatformIdentityVC'
import { DatabaseManager } from '../../persistence/DatabaseManager'
import { IssuedCredentialRepository } from '../../persistence/IssuedCredentialRepository'
import { rootLogger } from '../../utils/pinoLogger'

import { redeemOfferIntoWallet, withTenantHolder, type TenantHolderAgent } from './TenantHolder'

const logger = rootLogger.child({ module: 'CustodyRebindService' })

/** A record in the wallet that is bound to a key this wallet does not hold. */
export interface MisboundRecord {
  recordId: string
  kind: 'w3c' | 'sd-jwt'
  subjectDid: string
  credentialId?: string
  types: string[]
  /** Credential subject without `id`. */
  claims: Record<string, unknown>
}

export interface RebindOutcome {
  walletTenantId: string
  scanned: number
  misbound: number
  rebound: number
  failed: number
  skipped: number
}

interface ReissueSource {
  credentialType: string
  offerUri: string
}

const stripDidUrl = (value: unknown): string => (typeof value === 'string' ? value.split('#')[0] : '')

/**
 * Before holder custody, every wallet credential was bound to the platform's own key, so the
 * person could not prove they held it. This finds those records and replaces each with the same
 * claims, from the same issuer, bound to the wallet's own DID. The old record is revoked in the
 * issued register and removed from the wallet once its replacement is stored.
 */
export class CustodyRebindService {
  private readonly issued = new IssuedCredentialRepository()
  private readonly inFlight = new Map<string, Promise<RebindOutcome>>()

  /** Records whose subject is not a DID this wallet created. */
  public async findMisbound(tenantAgent: TenantHolderAgent): Promise<{ scanned: number; misbound: MisboundRecord[] }> {
    const own = new Set<string>(((await tenantAgent.dids.getCreatedDids({})) as any[]).map((record) => record.did))
    const misbound: MisboundRecord[] = []
    let scanned = 0

    const w3cService = tenantAgent.dependencyManager.resolve(W3cCredentialService)
    for (const record of (await w3cService.getAllCredentialRecords(tenantAgent.context)) as any[]) {
      scanned += 1
      const credential = record?.firstCredential ?? record?.credential
      const subjectIds: string[] = Array.isArray(credential?.credentialSubjectIds)
        ? credential.credentialSubjectIds
        : []
      const subjectDid = stripDidUrl(subjectIds[0])
      if (!subjectDid.startsWith('did:') || own.has(subjectDid)) continue
      const json = credential?.jsonCredential ?? credential?.toJSON?.() ?? {}
      const subject = Array.isArray(json?.credentialSubject) ? json.credentialSubject[0] : json?.credentialSubject
      const { id: _subjectId, ...claims } = (subject && typeof subject === 'object' ? subject : {}) as Record<
        string,
        unknown
      >
      misbound.push({
        recordId: record.id,
        kind: 'w3c',
        subjectDid,
        credentialId: credential?.id || credential?.jwt?.payload?.jti,
        types: (Array.isArray(credential?.type) ? credential.type : []).map(String),
        claims,
      })
    }

    for (const record of ((await tenantAgent.sdJwtVc?.getAll?.()) || []) as any[]) {
      scanned += 1
      const payload = record?.firstCredential?.payload ?? {}
      const subjectDid = stripDidUrl(payload?.cnf?.kid)
      if (!subjectDid.startsWith('did:') || own.has(subjectDid)) continue
      const prettyClaims = record?.firstCredential?.prettyClaims ?? {}
      const claims: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(prettyClaims as Record<string, unknown>)) {
        if (['iss', 'iat', 'nbf', 'exp', 'cnf', 'vct', 'status', 'jti', 'sub', '_sd_alg'].includes(key)) continue
        claims[key] = value
      }
      misbound.push({
        recordId: record.id,
        kind: 'sd-jwt',
        subjectDid,
        credentialId: payload?.jti || payload?.id,
        types: payload?.vct ? [String(payload.vct)] : [],
        claims,
      })
    }
    return { scanned, misbound }
  }

  /** Rebind once per wallet at a time; later calls reuse the running pass. */
  public rebindWallet(walletTenantId: string): Promise<RebindOutcome> {
    const running = this.inFlight.get(walletTenantId)
    if (running) return running
    const pass = this.runPass(walletTenantId).finally(() => this.inFlight.delete(walletTenantId))
    this.inFlight.set(walletTenantId, pass)
    return pass
  }

  /** Fire-and-forget trigger for sign-in and inbox loads. */
  public scheduleRebind(walletTenantId: string | undefined): void {
    if (!walletTenantId) return
    this.rebindWallet(walletTenantId).catch((error: any) =>
      logger.warn({ walletTenantId, err: error?.message }, 'Custody rebind pass failed'),
    )
  }

  private async runPass(walletTenantId: string): Promise<RebindOutcome> {
    const outcome: RebindOutcome = { walletTenantId, scanned: 0, misbound: 0, rebound: 0, failed: 0, skipped: 0 }
    const { scanned, misbound } = await withTenantHolder(walletTenantId, (agent) => this.findMisbound(agent))
    outcome.scanned = scanned
    outcome.misbound = misbound.length
    for (const record of misbound) {
      // Re-check no_source each pass: a source can appear later, and the lookup is cheap.
      if (this.state(walletTenantId, record.recordId) === 'rebound') {
        outcome.skipped += 1
        continue
      }
      try {
        const source = await this.reissueSource(walletTenantId, record)
        if (!source) {
          this.record(walletTenantId, record, 'no_source')
          outcome.skipped += 1
          continue
        }
        const newRecordId = await withTenantHolder(walletTenantId, async (agent) => {
          const redeemed = await redeemOfferIntoWallet(agent, [source.offerUri])
          if (!redeemed.savedCredentialId) throw new Error('The replacement was not stored')
          await this.removeRecord(agent, record)
          return redeemed.savedCredentialId
        })
        if (record.credentialId) {
          const { credentialLifecycleService } = await import('./CredentialLifecycleService')
          credentialLifecycleService.revoke(record.credentialId, 'replaced: rebound to the holder wallet key')
        }
        this.record(walletTenantId, record, 'rebound', newRecordId)
        outcome.rebound += 1
      } catch (error: any) {
        this.record(walletTenantId, record, 'failed', undefined, String(error?.message || error).slice(0, 500))
        outcome.failed += 1
      }
    }
    if (outcome.misbound > 0) logger.info(outcome, 'Custody rebind pass finished')
    return outcome
  }

  /** A fresh offer for the same claims from the same issuer, or undefined when the source is unknown. */
  private async reissueSource(walletTenantId: string, record: MisboundRecord): Promise<ReissueSource | undefined> {
    if (record.types.includes(PLATFORM_IDENTITY_VC_TYPE) || record.types.includes('PlatformIdentityVC')) {
      const { container } = await import('tsyringe')
      const { SSIAuthService } = await import('../SSIAuthService')
      const claims = record.claims as any
      if (claims.tenantId && claims.tenantId !== walletTenantId) return undefined
      const offerUri = await container.resolve(SSIAuthService).createPlatformIdentityOfferUri(walletTenantId, {
        displayName: String(claims.displayName || 'Member'),
        registeredAt: String(claims.registeredAt || new Date().toISOString()),
        platformTenantId: walletTenantId,
        platformName: String(claims.platformName || process.env.PLATFORM_NAME || 'Credentis'),
        verificationLevel: claims.verificationLevel || 'unverified',
        ...(claims.phone ? { phone: String(claims.phone) } : {}),
        ...(claims.email ? { email: String(claims.email) } : {}),
      })
      return offerUri ? { credentialType: PLATFORM_IDENTITY_VC_TYPE, offerUri } : undefined
    }

    const issued = record.credentialId ? this.issued.findByCredentialId(record.credentialId) : undefined
    if (!issued?.tenantId || !issued.credentialDefinitionId || issued.revoked) return undefined

    if (issued.tenantId === 'default') {
      // Issued by the platform itself (e.g. a checkout receipt): reissue from the root issuer.
      const { container } = await import('tsyringe')
      const { SSIAuthService } = await import('../SSIAuthService')
      const offerUri = await container.resolve(SSIAuthService).createPlatformOfferUri({
        credentialDefinitionId: issued.credentialDefinitionId,
        claims: record.claims,
        format: record.kind === 'sd-jwt' ? 'sd_jwt' : 'jwt_vc_json',
      })
      return offerUri ? { credentialType: issued.credentialDefinitionId, offerUri } : undefined
    }

    const { credentialIssuanceService } = await import('../CredentialIssuanceService')
    const offer = await credentialIssuanceService.createOffer({
      credentialType: issued.credentialDefinitionId,
      claims: record.claims,
      tenantId: issued.tenantId,
      requireExactCredentialType: true,
    })
    return { credentialType: issued.credentialDefinitionId, offerUri: offer.credential_offer_deeplink }
  }

  private async removeRecord(agent: TenantHolderAgent, record: MisboundRecord): Promise<void> {
    if (record.kind === 'sd-jwt') {
      await agent.sdJwtVc.deleteById(record.recordId)
      return
    }
    const w3cService = agent.dependencyManager.resolve(W3cCredentialService)
    await w3cService.removeCredentialRecord(agent.context, record.recordId)
  }

  private state(walletTenantId: string, recordId: string): string | undefined {
    const row = DatabaseManager.getDatabase()
      .prepare('SELECT status FROM wallet_custody_rebinds WHERE wallet_tenant_id = ? AND old_record_id = ?')
      .get(walletTenantId, recordId) as { status?: string } | undefined
    return row?.status
  }

  private record(
    walletTenantId: string,
    record: MisboundRecord,
    status: 'rebound' | 'failed' | 'no_source',
    newRecordId?: string,
    error?: string,
  ): void {
    DatabaseManager.getDatabase()
      .prepare(
        `INSERT INTO wallet_custody_rebinds
           (wallet_tenant_id, old_record_id, credential_id, credential_type, old_subject_did, new_record_id, status, error, updated_at)
         VALUES (@wallet, @old, @credentialId, @type, @subject, @newRecord, @status, @error, @now)
         ON CONFLICT(wallet_tenant_id, old_record_id) DO UPDATE SET
           new_record_id = excluded.new_record_id, status = excluded.status,
           error = excluded.error, updated_at = excluded.updated_at`,
      )
      .run({
        wallet: walletTenantId,
        old: record.recordId,
        credentialId: record.credentialId || null,
        type: record.types.filter((type) => type !== 'VerifiableCredential').pop() || null,
        subject: record.subjectDid,
        newRecord: newRecordId || null,
        status,
        error: error || null,
        now: new Date().toISOString(),
      })
  }
}

export const custodyRebindService = new CustodyRebindService()
