/**
 * Org setup provisioning: payment service + trusted partners.
 *
 * These are the two integrations an organization must have before certain workflows can run
 * (readiness points the owner here). Payments offer Click n Pay, EcoCash, or Simulated pay —
 * the same three as the school-fees payment dialog. A new organization starts on Simulated pay.
 * Trusted partners default to the organization itself so its own proofs are accepted.
 */
import { randomUUID } from 'crypto'

import { DatabaseManager } from '../persistence/DatabaseManager'
import { providerRepository } from '../persistence/ProviderRepository'
import { getTenantById } from '../persistence/TenantRepository'
import { rootLogger } from '../utils/pinoLogger'

const logger = rootLogger.child({ module: 'OrgSetupProvisioningService' })

/**
 * Same choices as the school-fees payment dialog, in the same order:
 * Click n Pay, EcoCash, then simulated pay.
 */
export const PAYMENT_METHODS = [
  { id: 'clicknpay', providerId: 'clicknpay', name: 'Click n Pay', detail: 'Pay with card' },
  { id: 'ecocash', providerId: 'ecocash-zw', name: 'EcoCash', detail: 'Pay via EcoCash' },
  { id: 'simulated', providerId: 'simulated', name: 'Simulated pay', detail: 'Practice payment. No real money moves.' },
] as const

export type PaymentMethodId = (typeof PAYMENT_METHODS)[number]['id']

export interface PaymentMethodChoice {
  id: PaymentMethodId
  name: string
  detail: string
  selected: boolean
}

export const SIMULATED_PAYMENT_CONFIG_NAME = 'Simulated pay'

export interface TrustedPartner {
  id: string
  name: string
  reference: string
  status: string
  isOwnOrganization: boolean
  createdAt?: string
}

export interface PaymentSetupItem {
  id: string
  name: string
  providerId: string
  providerName: string
  simulated: boolean
  environment: string
  isDefault: boolean
  status: string
}

export class OrgSetupProvisioningService {
  private organizationId(orgTenantId: string): string | undefined {
    const db = DatabaseManager.getDatabase()
    const row = db.prepare('SELECT id FROM organizations WHERE tenant_id = ? LIMIT 1').get(orgTenantId) as
      | { id: string }
      | undefined
    return row?.id
  }

  // ------------------------------------------------------------------ payments

  /** Make sure Click n Pay, EcoCash and Simulated pay exist in the provider catalogue. */
  private ensurePaymentCatalogue(): void {
    const catalogue = [
      {
        id: 'clicknpay',
        name: 'Click n Pay',
        description: 'Pay with card',
        authType: 'none' as const,
      },
      {
        id: 'simulated',
        name: 'Simulated pay',
        description: 'Practice payment. No real money moves.',
        authType: 'none' as const,
      },
    ]
    for (const item of catalogue) {
      if (providerRepository.findProviderById(item.id)) continue
      providerRepository.saveProvider({
        id: item.id,
        tenantId: 'system',
        name: item.name,
        type: 'payment',
        description: item.description,
        authType: item.authType,
        isSystem: true,
        status: 'active',
      })
    }
  }

  private methodForSetup(item: PaymentSetupItem): PaymentMethodId | undefined {
    if (item.providerId === 'simulated' || item.simulated) return 'simulated'
    if (item.providerId === 'clicknpay') return 'clicknpay'
    if (item.providerId === 'ecocash-zw' || item.providerId === 'ecocash') return 'ecocash'
    return undefined
  }

  public listPaymentMethods(orgTenantId: string): PaymentMethodChoice[] {
    this.ensurePaymentCatalogue()
    const active = this.listPaymentSetup(orgTenantId).filter((item) => item.status === 'active')
    const selected = active
      .map((item) => this.methodForSetup(item))
      .find((id): id is PaymentMethodId => Boolean(id))
    // Older practice setups were saved on EcoCash with a simulated flag. Move those onto Simulated pay.
    if (selected === 'simulated' && !active.some((item) => item.providerId === 'simulated')) {
      this.selectPaymentMethod(orgTenantId, 'simulated')
    }
    return PAYMENT_METHODS.map((method) => ({
      id: method.id,
      name: method.name,
      detail: method.detail,
      selected: method.id === selected,
    }))
  }

  /** Choose which of the three payment methods this organization uses. The others are turned off. */
  public selectPaymentMethod(orgTenantId: string, methodId: string): { id: string } {
    this.ensurePaymentCatalogue()
    const method = PAYMENT_METHODS.find((item) => item.id === methodId)
    if (!method) throw new Error('Choose Click n Pay, EcoCash, or Simulated pay')

    const configs = providerRepository.listConfigs(orgTenantId)
    for (const cfg of configs) {
      const provider = providerRepository.findProviderById(cfg.providerId)
      if (!provider || provider.type !== 'payment') continue
      const keep = cfg.providerId === method.providerId
      providerRepository.saveConfig({
        id: cfg.id,
        tenantId: orgTenantId,
        providerId: cfg.providerId,
        name: keep ? method.name : cfg.name,
        config: keep ? this.configForMethod(method.id, cfg.config) : cfg.config,
        environment: cfg.environment,
        isDefault: keep,
        status: keep ? 'active' : 'inactive',
      })
    }

    const active = this.listPaymentSetup(orgTenantId).find(
      (item) => item.status === 'active' && item.providerId === method.providerId,
    )
    if (active) return { id: active.id }

    const saved = providerRepository.saveConfig({
      tenantId: orgTenantId,
      providerId: method.providerId,
      name: method.name,
      config: this.configForMethod(method.id, {}),
      environment: 'sandbox',
      isDefault: true,
      status: 'active',
    })
    logger.info({ orgTenantId, method: method.id, configId: saved.id }, 'Selected payment method')
    return { id: saved.id }
  }

  private configForMethod(methodId: PaymentMethodId, existing: Record<string, any>): Record<string, any> {
    if (methodId === 'simulated') return { ...existing, simulatedMode: true, sandboxMode: true }
    return { ...existing, simulatedMode: false, sandboxMode: existing.sandboxMode !== false }
  }

  public listPaymentSetup(orgTenantId: string): PaymentSetupItem[] {
    const configs = providerRepository.listConfigs(orgTenantId)
    return configs
      .map((cfg) => {
        const provider = providerRepository.findProviderById(cfg.providerId)
        if (!provider || provider.type !== 'payment') return undefined
        return {
          id: cfg.id,
          name: cfg.name,
          providerId: cfg.providerId,
          providerName: provider.name,
          simulated: cfg.providerId === 'simulated' || Boolean(cfg.config?.simulatedMode),
          environment: cfg.environment,
          isDefault: cfg.isDefault,
          status: cfg.status,
        } as PaymentSetupItem
      })
      .filter((item): item is PaymentSetupItem => Boolean(item))
  }

  /** Idempotently give the organization simulated pay when it has no payment method yet. */
  public ensureSimulatedPayments(orgTenantId: string): { created: boolean; id: string } {
    const existing = this.listPaymentSetup(orgTenantId).find((item) => item.status === 'active')
    if (existing) return { created: false, id: existing.id }
    const saved = this.selectPaymentMethod(orgTenantId, 'simulated')
    return { created: true, id: saved.id }
  }

  // ------------------------------------------------------------ trusted partners

  public listTrustedPartners(orgTenantId: string): TrustedPartner[] {
    const organizationId = this.organizationId(orgTenantId)
    if (!organizationId) return []
    const ownDid = getTenantById(orgTenantId)?.issuerDid
    const db = DatabaseManager.getDatabase()
    const rows = db
      .prepare(
        `SELECT id, subject_ref AS reference, display_name_ref AS name, status, created_at AS createdAt
         FROM trust_anchors WHERE organization_id = ? AND status != 'removed' ORDER BY created_at ASC`,
      )
      .all(organizationId) as Array<{ id: string; reference: string; name?: string; status: string; createdAt?: string }>
    return rows.map((row) => ({
      id: row.id,
      name: row.name || row.reference,
      reference: row.reference,
      status: row.status,
      isOwnOrganization: Boolean(ownDid && ownDid === row.reference),
      createdAt: row.createdAt,
    }))
  }

  public addTrustedPartner(orgTenantId: string, input: { reference: string; name?: string }): TrustedPartner {
    const organizationId = this.organizationId(orgTenantId)
    if (!organizationId) throw new Error('Organization not found')
    const reference = String(input.reference || '').trim()
    if (!reference || reference.length > 500) throw new Error('A partner identifier is required')

    const db = DatabaseManager.getDatabase()
    const existing = db
      .prepare(`SELECT id FROM trust_anchors WHERE organization_id = ? AND subject_ref = ? AND status != 'removed'`)
      .get(organizationId, reference) as { id: string } | undefined
    const id = existing?.id || randomUUID()
    if (existing) {
      db.prepare(`UPDATE trust_anchors SET status = 'active', display_name_ref = COALESCE(?, display_name_ref) WHERE id = ?`).run(
        input.name?.trim() || null,
        id,
      )
    } else {
      db.prepare(
        `INSERT INTO trust_anchors (id, organization_id, anchor_type, subject_ref, display_name_ref, status)
         VALUES (?, ?, 'issuer', ?, ?, 'active')`,
      ).run(id, organizationId, reference, input.name?.trim() || null)
    }
    return this.listTrustedPartners(orgTenantId).find((partner) => partner.id === id)!
  }

  public removeTrustedPartner(orgTenantId: string, id: string): boolean {
    const organizationId = this.organizationId(orgTenantId)
    if (!organizationId) return false
    const db = DatabaseManager.getDatabase()
    const result = db
      .prepare(`UPDATE trust_anchors SET status = 'removed' WHERE id = ? AND organization_id = ?`)
      .run(id, organizationId)
    return result.changes > 0
  }

  /** Idempotently trust the organization's own issuer so proofs it issues are accepted. */
  public ensureOwnOrganizationTrusted(orgTenantId: string): { created: boolean } {
    const ownDid = getTenantById(orgTenantId)?.issuerDid
    if (!ownDid || !this.organizationId(orgTenantId)) return { created: false }
    const already = this.listTrustedPartners(orgTenantId).some(
      (partner) => partner.reference === ownDid && partner.status === 'active',
    )
    if (already) return { created: false }
    this.addTrustedPartner(orgTenantId, { reference: ownDid, name: 'This organization' })
    return { created: true }
  }

  /** Onboarding defaults: simulated payments + trust our own proofs. Never throws. */
  public provisionOnboardingDefaults(orgTenantId: string): void {
    try {
      this.ensureOwnOrganizationTrusted(orgTenantId)
    } catch (error: any) {
      logger.warn({ error: error.message, orgTenantId }, 'Could not trust own organization at onboarding')
    }
    if (process.env.ONBOARDING_SIMULATED_PAYMENTS === 'false') return
    try {
      this.ensureSimulatedPayments(orgTenantId)
    } catch (error: any) {
      logger.warn({ error: error.message, orgTenantId }, 'Could not provision simulated payments at onboarding')
    }
  }
}

export const orgSetupProvisioningService = new OrgSetupProvisioningService()
