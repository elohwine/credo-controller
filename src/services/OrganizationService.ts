/**
 * OrganizationService — manages org tenants and memberships.
 *
 * Pattern: GitHub/Clerk style
 *   - User has ONE personal tenant (USER type, created at registration)
 *   - User can CREATE or JOIN multiple ORG tenants
 *   - Memberships tracked in org_memberships join table
 *   - Login returns personal context + list of orgs
 *   - "Switch org" means operating as that org's tenant agent
 */

import { injectable, inject } from 'tsyringe'
import { Agent } from '@credo-ts/core'
import crypto from 'crypto'
import { DatabaseManager } from '../persistence/DatabaseManager'
import { getTenantById, upsertTenant, type TenantPersistenceRecord } from '../persistence/TenantRepository'
import { RestMultiTenantAgentModules } from '../cliAgent'
import { provisionTenantResources } from './TenantProvisioningService'
import { signToken } from '../utils/jwt'
import { rootLogger } from '../utils/pinoLogger'
import { WorkflowTemplateRepository } from '../persistence/WorkflowTemplateRepository'
import type { SectorType, WorkflowTemplateDefinition } from '../types/WorkflowTemplate'
import { getWorkflowTypeCandidates } from './workflow/initiation'
import { getTemplateById, type WorkflowTemplate } from './workflow/templates'
import { upsertContact } from '../persistence/ContactRepository'
import { getWalletCredentialsByWalletId } from '../persistence/WalletCredentialRepository'
import { organizationRegistryRepository, type OrganizationCategory } from '../persistence/OrganizationRegistryRepository'

const logger = rootLogger.child({ module: 'OrganizationService' })

export interface OrgMembership {
  id: string
  userId: string
  orgTenantId: string
  role: 'owner' | 'admin' | 'member'
  status: 'active' | 'invited' | 'suspended'
  createdAt: string
  updatedAt: string
  // Joined from tenants table
  orgLabel?: string
  orgDomain?: string
  issuerDid?: string
}

export interface CreateOrgRequest {
  name: string
  domain?: string
  category?: OrganizationCategory
  paymentRails?: string[]
  sector?: SectorType
  additionalWorkflowTypes?: string[]
}

export interface OrgSummary {
  orgTenantId: string
  name: string
  role: string
  domain?: string
  issuerDid?: string
  memberCount: number
  sector?: SectorType
  additionalWorkflowTypes?: string[]
  assignedTemplateId?: string
}

export interface OrgPaymentRailsUpdateResult {
  orgTenantId: string
  paymentRails: string[]
}

export interface OrgDiscoveryVisibilityUpdateResult {
  orgTenantId: string
  isPublic: boolean
}

export interface ActivateOrgWorkflowRequest {
  sector?: SectorType
  additionalWorkflowTypes?: string[]
  name?: string
  paymentModes?: string[]
  reconciliationPolicy?: Record<string, unknown>
  evidencePolicy?: Record<string, unknown>
  brandingPolicy?: Record<string, unknown>
  initiation?: WorkflowTemplateDefinition['initiation']
}

export interface WorkflowFeatureCatalogItem {
  id: string
  name: string
  description: string
  recommendedSectors: SectorType[]
}

export interface OrgWorkflowConfiguration {
  orgTenantId: string
  sector?: SectorType
  templates: WorkflowTemplateDefinition[]
  // features: removed - derive from templates.workflowType instead (migration 062)
  // availableFeatures: removed - query workflow_templates WHERE tenant_id IS NULL instead
}

export type OrganizationSetupRequirement = 'mandatory' | 'conditional' | 'recommended'
export type OrganizationSetupStatus = 'ready' | 'needs_attention' | 'optional'

export interface OrganizationSetupReadinessItem {
  key: string
  title: string
  domain: 'core' | 'people' | 'authority' | 'operations' | 'trust' | 'integrations'
  requirement: OrganizationSetupRequirement
  status: OrganizationSetupStatus
  reason?: string
  requiredFor?: string[]
}

export interface OrganizationSetupDomainProgress {
  domain: 'core' | 'people' | 'authority' | 'operations' | 'trust' | 'integrations'
  ready: number
  total: number
  percent: number
}

export interface OrganizationSetupReadiness {
  orgTenantId: string
  orgName: string
  organizationId: string
  readinessPercent: number
  readinessState: 'ready' | 'in_progress' | 'blocked'
  items: OrganizationSetupReadinessItem[]
  domains: OrganizationSetupDomainProgress[]
  nextActions: string[]
}

const workflowTemplateRepository = new WorkflowTemplateRepository()

const IN_MEMORY_PAYMENT_MODES_BY_SECTOR: Record<SectorType, string[]> = {
  ecommerce: ['ecocash', 'innbucks', 'bank_transfer'],
  education: ['ecocash', 'bank_transfer', 'cash'],
  cash: ['cash', 'ecocash', 'pos'],
  field_execution: ['ecocash', 'bank_transfer', 'cash'],
  custom: ['ecocash'],
}

function parseJsonColumn<T>(value: string | null | undefined, fallback: T): T {
  if (!value) {
    return fallback
  }

  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function normalizePaymentRails(input?: string[]): string[] {
  const normalized = (input || [])
    .map((rail) => String(rail || '').trim())
    .filter(Boolean)

  return Array.from(new Set(normalized))
}

function inferSectorFromInMemoryTemplate(template: WorkflowTemplate): SectorType {
  const id = String(template.id || '').toLowerCase()
  if (id.includes('education')) return 'education'
  if (id.includes('cash-counter') || id.includes('cash_counter')) return 'cash'
  if (id.includes('field') || id.includes('fept')) return 'field_execution'
  if (template.category === 'ecommerce') return 'ecommerce'
  return 'custom'
}

function buildTemplateFromInMemory(params: {
  workflowType: string
  orgTenantId: string
  index: number
  fallbackSector?: SectorType
  template: WorkflowTemplate
}): WorkflowTemplateDefinition {
  const { workflowType, orgTenantId, index, fallbackSector, template } = params
  const inferredSector = fallbackSector ?? inferSectorFromInMemoryTemplate(template)

  return {
    id: `${workflowType}-${orgTenantId}-${Date.now()}-${index}`,
    tenantId: orgTenantId,
    workflowType,
    name: template.name,
    sector: inferredSector,
    enabled: true,
    version: 1,
    steps: template.steps.map((step: any) => ({
      action: step.action,
      description: step.description,
      config: step.config,
    })),
    paymentModes: IN_MEMORY_PAYMENT_MODES_BY_SECTOR[inferredSector] || ['ecocash'],
    credentialPolicy: {
      outputVCs: template.outputVCs || [],
      autoIssue: true,
    },
    reconciliationPolicy: {
      mode: 'automatic',
      events: [],
    },
    evidencePolicy: {},
    brandingPolicy: {},
  }
}

function mapPaymentModesToRails(paymentModes?: string[]): string[] {
  const rails = new Set<string>()
  for (const mode of paymentModes || []) {
    const normalized = String(mode || '').trim().toLowerCase()
    switch (normalized) {
      case 'mobile_money':
      case 'ecocash':
        rails.add('AcceptsEcoCash')
        break
      case 'bank_transfer':
      case 'zipit':
        rails.add('AcceptsZipit')
        break
      case 'qr_code':
      case 'clicknpay':
        rails.add('AcceptsClicknPay')
        break
      case 'cash':
      case 'usd_cash':
        rails.add('AcceptsUsdCash')
        break
      default:
        if (normalized) rails.add(mode)
        break
    }
  }

  return Array.from(rails)
}

function resolveDefaultWorkflowTemplateId(sector?: SectorType): string {
  switch (sector) {
    case 'education':
      return 'tpl-education-fee'
    case 'cash':
      return 'tpl-cash-counter'
    case 'field_execution':
      return 'tpl-fept-field-execution'
    case 'custom':
      return 'tpl-quote-invoice-receipt'
    case 'ecommerce':
    default:
      return 'tpl-quote-invoice-receipt'
  }
}

function inferWorkflowTypesForOrg(params: {
  sector?: SectorType
  paymentRails?: string[]
  category?: OrganizationCategory
  additionalWorkflowTypes?: string[]
}): string[] {
  const requested = (params.additionalWorkflowTypes ?? [])
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean)

  const workflowTypes = new Set<string>(requested)

  const isFinanceOrg = params.category === 'finance' || params.paymentRails?.some((rail) => /eco|bank|cash/i.test(rail))
  const hasCreditRole = params.additionalWorkflowTypes?.some((entry) => /ar|receivable|collection|credit/i.test(String(entry || '').toLowerCase()))

  if (isFinanceOrg || hasCreditRole) {
    workflowTypes.add('accounts_receivable')
  }

  if (params.sector === 'ecommerce') {
    workflowTypes.add('ecommerce_delivery')
  }

  return Array.from(workflowTypes)
}

// Deprecated: Features abstraction removed in favor of workflow templates (migration 062)
// Use workflow_templates table as single source of truth
// export const WORKFLOW_FEATURE_CATALOG: WorkflowFeatureCatalogItem[] = [...]
// export const DEFAULT_FEATURES_BY_SECTOR: Record<SectorType, string[]> = {...}
// function normalizeFeatures(features?: string[], sector?: SectorType): string[] {...}

@injectable()
export class OrganizationService {
  private agent: Agent<RestMultiTenantAgentModules>

  private ensurePlatformOrganizationRecord(orgTenantId: string, orgName?: string): { id: string; name: string } {
    const db = DatabaseManager.getDatabase()
    const existing = db
      .prepare('SELECT id, name FROM organizations WHERE tenant_id = ? LIMIT 1')
      .get(orgTenantId) as { id: string; name: string } | undefined

    if (existing?.id) {
      return existing
    }

    const tenant = getTenantById(orgTenantId)
    const registry = organizationRegistryRepository.findOrganizationByTenantId(orgTenantId)
    const resolvedName = orgName?.trim() || tenant?.label || registry?.displayName || 'Organization'
    const organizationId = crypto.randomUUID()

    db.prepare(
      `INSERT INTO organizations (id, tenant_id, name, status, created_at, updated_at)
       VALUES (?, ?, ?, 'active', ?, ?)`
    ).run(organizationId, orgTenantId, resolvedName, new Date().toISOString(), new Date().toISOString())

    logger.info({ organizationId, orgTenantId }, 'Created platform organization record during onboarding')
    return { id: organizationId, name: resolvedName }
  }

  private async ensureDiscoveryProfile(params: {
    orgTenantId: string
    name: string
    issuerDid?: string
    verifierDid?: string
    domain?: string
    category?: OrganizationCategory
    sector?: SectorType
    paymentRails?: string[]
    activatedWorkflowTypes?: string[]
  }): Promise<void> {
    const existing = organizationRegistryRepository.findOrganizationByTenantId(params.orgTenantId)
    const normalizedRails = params.paymentRails === undefined
      ? undefined
      : normalizePaymentRails(params.paymentRails)

    if (!existing) {
      if (!params.issuerDid) {
        logger.warn({ orgTenantId: params.orgTenantId }, 'Skipping discovery profile creation: issuerDid missing')
        return
      }

      organizationRegistryRepository.createOrganization({
        tenantId: params.orgTenantId,
        displayName: params.name,
        category: params.category || 'supplier',
        description: `Trusted organization profile for ${params.name}`,
        isPublic: true,
        verificationStatus: 'verified',
        issuerDid: params.issuerDid,
        verifierDid: params.verifierDid,
        website: params.domain ? `https://${params.domain}` : undefined,
        metadata: { source: 'organization-onboarding' },
      })
    }

    const current = organizationRegistryRepository.findOrganizationByTenantId(params.orgTenantId)
    if (!current) return

    const updates: Record<string, unknown> = {
      displayName: params.name,
      category: params.category || current.category,
      isPublic: true,
      verificationStatus: current.verificationStatus === 'suspended' ? current.verificationStatus : 'verified',
      website: params.domain ? `https://${params.domain}` : current.website,
      metadata: {
        ...(current.metadata || {}),
        source: 'organization-onboarding',
      },
    }

    organizationRegistryRepository.updateOrganization(current.id, updates as any)

    if (normalizedRails !== undefined) {
      try {
        const db = DatabaseManager.getDatabase()
        db.prepare(`UPDATE organization_registry SET payment_rails = ?, updated_at = ? WHERE id = ?`)
          .run(JSON.stringify(normalizedRails), new Date().toISOString(), current.id)
      } catch (error: any) {
        logger.warn({ error: error.message, orgTenantId: params.orgTenantId }, 'Failed to persist payment rails')
      }
    }

    await this.ensureInitialTrustBadges(current.id, params.orgTenantId)
    await this.ensureDefaultServiceCatalogEntries(current.id, params.orgTenantId, params.sector, params.category, params.activatedWorkflowTypes)
  }

  private async ensureDefaultServiceCatalogEntries(
    orgId: string,
    orgTenantId: string,
    sector?: SectorType,
    category?: OrganizationCategory,
    activatedWorkflowTypes: string[] = []
  ): Promise<void> {
    try {
      const existing = organizationRegistryRepository.listServicesByOrganization(orgId, false)
      const existingVcTypes = new Set(existing.map((service) => service.vcType).filter(Boolean))
      const explicitArActivation = activatedWorkflowTypes.some((workflowType) => /ar|receivable|collection|credit/i.test(workflowType))

      if (!explicitArActivation) {
        return
      }

      const arService = {
        vcType: 'ReceiptVC',
        serviceType: 'workflow' as const,
        name: 'Collect Payment',
        description: 'Create a payment request and collect receivables from customers',
        workflowTemplateId: 'tpl-ar-collections',
      }

      if (existingVcTypes.has(arService.vcType)) {
        return
      }

      organizationRegistryRepository.createService({
        orgId,
        serviceType: arService.serviceType,
        vcType: arService.vcType,
        workflowTemplateId: arService.workflowTemplateId,
        name: arService.name,
        description: arService.description,
        requirements: [],
        feeAmount: 0,
        feeCurrency: 'USD',
        isActive: true,
        requestSchema: {},
        metadata: { seededForTenant: orgTenantId, capabilityType: arService.vcType },
      })
    } catch (error: any) {
      logger.warn({ error: error.message, orgId, orgTenantId }, 'Skipping explicit workflow service seeding')
    }
  }

  private async ensureInitialTrustBadges(orgId: string, orgTenantId: string): Promise<void> {
    try {
      const db = DatabaseManager.getDatabase()
      const now = new Date().toISOString()

      // Get org data for credential issuance
      const org = organizationRegistryRepository.findOrganizationById(orgId)
      if (!org) {
        logger.warn({ orgId }, 'Cannot issue trust badges: org not found')
        return
      }

      // Define badges with claims matching the Layer 2 Trust Network schemas  (lines 1017-1092 in modelRegistry.ts)
      const seedBadges = [
        {
          badgeType: 'RegistrationVC',
          label: 'Registered Organization',
          claims: {
            orgTenantId,
            orgDid: org.issuerDid,
            displayName: org.displayName,
            registrationNumber: orgId, // Use org ID as registration number
            registeredAt: now,
            category: org.category,
          },
        },
        {
          badgeType: 'KycAttestationVC',
          label: 'KYC Attested',
          claims: {
            orgTenantId,
            orgDid: org.issuerDid,
            kycLevel: 'basic',
            attestedAt: now,
            verificationSource: 'platform-attestation',
          },
        },
        {
          badgeType: 'MerchantVC',
          label: 'Merchant Onboarded',
          claims: {
            orgTenantId,
            orgDid: org.issuerDid,
            merchantId: orgId,
            displayName: org.displayName,
            category: org.category,
            onboardedAt: now,
            paymentRails: [], // Will be populated from org payment_rails column
            capabilities: ['RequestQuote', 'IssueInvoice', 'IssueReceipt'],
          },
        },
      ]

      // Import CredentialIssuanceService for VC offers
      const { CredentialIssuanceService } = await import('./CredentialIssuanceService')
      const issuanceService = new CredentialIssuanceService()

      for (const badge of seedBadges) {
        const existing = db.prepare(
          `SELECT id FROM org_trust_badges WHERE org_id = ? AND badge_type = ? AND revoked = 0 LIMIT 1`
        ).get(orgId, badge.badgeType) as { id: string } | undefined

        if (existing) continue

        // Create credential offer for this badge
        let vcLogId: string | null = null
        try {
          const offer = await issuanceService.createOffer({
            credentialType: badge.badgeType,
            claims: badge.claims,
            tenantId: orgTenantId,
            subjectDid: org.issuerDid, // Issue to the org's own DID
          })
          vcLogId = offer.offerId
          logger.info({ orgId, badgeType: badge.badgeType, offerId: offer.offerId }, 'Created trust badge credential offer')
        } catch (error: any) {
          logger.warn({ error: error.message, orgId, badgeType: badge.badgeType }, 'Failed to create trust badge offer')
        }

        // Store badge record with VC reference
        db.prepare(
          `INSERT INTO org_trust_badges (id, org_id, tenant_id, badge_type, label, vc_log_id, issued_at, revoked)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0)`
        ).run(crypto.randomUUID(), orgId, orgTenantId, badge.badgeType, badge.label, vcLogId, now)

        logger.info({ orgId, badgeType: badge.badgeType }, 'Trust badge record created')
      }
    } catch (error: any) {
      logger.warn({ error: error.message, orgTenantId }, 'Skipping trust badge seeding')
    }
  }

  private async ensureOrgTenantRuntime(orgTenantId: string): Promise<void> {
    try {
      await (this.agent.modules as any).tenants.getTenantById(orgTenantId)
      return
    } catch {
      // Continue with controlled recovery using persisted tenant metadata.
    }

    const persisted = getTenantById(orgTenantId)
    if (!persisted || persisted.tenantType !== 'ORG') {
      throw new Error('Organization context is stale')
    }
    logger.warn({ orgTenantId }, 'Runtime tenant is missing; recreate tenant from onboarding flow')
    throw new Error('Organization tenant runtime missing. Recreate tenant from onboarding flow.')
  }

  private resolveOwnerDisplayName(walletTenantId?: string): string {
    if (!walletTenantId) return 'Organization Owner'

    try {
      const creds = getWalletCredentialsByWalletId(walletTenantId)
      for (const cred of creds) {
        const isPlatformIdentity = cred.type.includes('PlatformIdentityVC') || cred.type.includes('PlatformIdentityCredential')
        if (!isPlatformIdentity) continue

        const parsed = JSON.parse(cred.credentialData || '{}')
        const subject = parsed?.credentialSubject || parsed?.vc?.credentialSubject || {}
        const candidate = subject?.displayName || subject?.username || subject?.name
        if (typeof candidate === 'string' && candidate.trim().length > 0) {
          return candidate.trim()
        }
      }
    } catch {
      // Best-effort enrichment only.
    }

    return 'Organization Owner'
  }

  constructor(@inject(Agent) agent: Agent) {
    this.agent = agent as Agent<RestMultiTenantAgentModules>
  }

  /**
   * Create a new organization.
   * Creates a Credo tenant (ORG type) + provisions DIDs + adds creator as owner.
   */
  async createOrganization(userId: string, req: CreateOrgRequest): Promise<OrgSummary> {
    const db = DatabaseManager.getDatabase()
    const orgName = req.name.trim()

    // Deduplication check: see if an ORG with this name already exists
    const existingOrg = db.prepare("SELECT id FROM tenants WHERE label = ? AND tenant_type = 'ORG' COLLATE NOCASE").get(orgName) as { id: string } | undefined

    let orgTenantId: string;
    let tenantRecord: any = null;

    if (existingOrg?.id) {
      orgTenantId = existingOrg.id;
      logger.info({ orgTenantId, name: orgName }, 'Deduplication: reusing existing organization tenant');
    } else {
      // Create the Credo tenant for this org since it doesn't exist
      tenantRecord = await this.agent.modules.tenants.createTenant({
        config: { label: orgName, tenantType: 'ORG', domain: req.domain } as any,
      })
      orgTenantId = tenantRecord.id
      logger.info({ orgTenantId, name: orgName, creatorUserId: userId }, 'Created org tenant')

      // Provision issuer/verifier DIDs + SQL tenants row only for NEW tenants
      try {
        await provisionTenantResources({
          agent: this.agent,
          tenantRecord,
          baseUrl: process.env.PUBLIC_BASE_URL || 'http://localhost:3000',
          displayName: orgName,
        })
        logger.info({ orgTenantId }, 'Org tenant fully provisioned')
      } catch (err: any) {
        logger.warn({ error: err.message, orgTenantId }, 'Org provisioning partial failure, continuing')
      }
    }

    // Update both tenants.db and persistence.db to ensure data consistency
    const tenant = getTenantById(orgTenantId)
    if (tenant) {
      // Update tenants.db (main Credo-TS tenant store)
      upsertTenant({
        ...tenant,
        label: req.name,
        domain: req.domain ?? tenant.domain,
      })

      // Sync to persistence.db (local application tenant cache used for SQL joins)
      db.prepare(`
        INSERT INTO tenants (
          id, label, status, created_at, issuer_did, issuer_kid, verifier_did, verifier_kid, askar_profile, metadata, tenant_type, domain, phone
        ) VALUES (
          @id, @label, @status, @createdAt, @issuerDid, @issuerKid, @verifierDid, @verifierKid, @askarProfile, @metadata, @tenantType, @domain, @phone
        )
        ON CONFLICT(id) DO UPDATE SET
          label = excluded.label,
          domain = excluded.domain,
          status = excluded.status
      `).run({
        id: tenant.id,
        label: req.name,
        status: tenant.status,
        createdAt: tenant.createdAt,
        issuerDid: tenant.issuerDid,
        issuerKid: tenant.issuerKid,
        verifierDid: tenant.verifierDid,
        verifierKid: tenant.verifierKid,
        askarProfile: tenant.askarProfile,
        metadata: JSON.stringify(tenant.metadata),
        tenantType: tenant.tenantType,
        domain: req.domain ?? tenant.domain,
        phone: (tenant as any).phone || null,
      })
      logger.info({ orgTenantId }, 'Org tenant synchronized across databases')
    }

    this.ensurePlatformOrganizationRecord(orgTenantId, req.name)

    // Create ownership membership if one doesn't exist
    const existingMembership = db.prepare('SELECT id FROM org_memberships WHERE user_id = ? AND org_tenant_id = ?').get(userId, orgTenantId) as { id: string } | undefined
    const now = new Date().toISOString()

    if (!existingMembership) {
      const membershipId = crypto.randomUUID()
      db.prepare(`
        INSERT INTO org_memberships (id, user_id, org_tenant_id, role, status, created_at, updated_at)
        VALUES (?, ?, ?, 'owner', 'active', ?, ?)
      `).run(membershipId, userId, orgTenantId, now, now)

      logger.info({ membershipId, userId, orgTenantId, role: 'owner' }, 'Created org ownership membership')
    }

    // Always upsert owner contact with current wallet_tenant_id — idempotent, self-heals stale entries.
    try {
      const owner = db.prepare('SELECT tenant_id, did FROM ssi_users WHERE id = ?').get(userId) as
        | { tenant_id?: string; did?: string }
        | undefined
      const ownerDisplayName = this.resolveOwnerDisplayName(owner?.tenant_id)

      upsertContact({
        id: `${orgTenantId}:owner:${userId}`,
        orgTenantId,
        contactScope: 'internal',
        name: ownerDisplayName,
        did: owner?.did,
        walletTenantId: owner?.tenant_id,
        linkedAt: now,
        notes: 'Auto-linked from organization creator account',
      })
    } catch (error: any) {
      logger.warn({ error: error.message, orgTenantId, userId }, 'Failed to upsert owner contact')
    }

    let assignedTemplateId: string | undefined
    const hasExplicitWorkflowRequest = (req.additionalWorkflowTypes?.length ?? 0) > 0

    if (hasExplicitWorkflowRequest) {
      const activated = await this.configureOrganizationWorkflows(userId, orgTenantId, {
        sector: req.sector,
        additionalWorkflowTypes: req.additionalWorkflowTypes,
        name: req.name,
      })
      assignedTemplateId = activated.templates.find((template) => template.enabled)?.id
    }

    await this.ensureDiscoveryProfile({
      orgTenantId,
      name: req.name,
      issuerDid: tenant?.issuerDid,
      verifierDid: tenant?.verifierDid,
      domain: req.domain,
      category: req.category,
      sector: req.sector,
      paymentRails: req.paymentRails,
      activatedWorkflowTypes: req.additionalWorkflowTypes,
    })

    return {
      orgTenantId,
      name: req.name,
      role: 'owner',
      domain: req.domain,
      issuerDid: tenant?.issuerDid,
      memberCount: 1,
      sector: req.sector,
      assignedTemplateId,
    }
  }

  async updateOrganizationPaymentRails(
    userId: string,
    orgTenantId: string,
    paymentRails: string[]
  ): Promise<OrgPaymentRailsUpdateResult> {
    const role = this.getUserOrgRole(userId, orgTenantId)
    if (!role) {
      throw new Error('Not a member of this organization')
    }

    if (role !== 'owner' && role !== 'admin') {
      throw new Error('Only org owners/admins can manage organization settings')
    }

    const normalizedRails = normalizePaymentRails(paymentRails)
    const org = organizationRegistryRepository.findOrganizationByTenantId(orgTenantId)
    if (!org) {
      throw new Error('Organization not found')
    }

    organizationRegistryRepository.updateOrganization(org.id, {
      paymentRails: normalizedRails,
    } as any)

    return {
      orgTenantId,
      paymentRails: normalizedRails,
    }
  }

  async updateOrganizationDiscoveryVisibility(
    userId: string,
    orgTenantId: string,
    isPublic: boolean
  ): Promise<OrgDiscoveryVisibilityUpdateResult> {
    const role = this.getUserOrgRole(userId, orgTenantId)
    if (!role) {
      throw new Error('Not a member of this organization')
    }

    if (role !== 'owner' && role !== 'admin') {
      throw new Error('Only org owners/admins can manage organization settings')
    }

    const org = organizationRegistryRepository.findOrganizationByTenantId(orgTenantId)
    if (!org) {
      throw new Error('Organization not found')
    }

    organizationRegistryRepository.updateOrganization(org.id, {
      isPublic,
    } as any)

    return {
      orgTenantId,
      isPublic,
    }
  }

  /**
   * List all organizations a user belongs to.
   */
  async listUserOrganizations(userId: string): Promise<OrgSummary[]> {
    const db = DatabaseManager.getDatabase()

    const rows = db.prepare(`
      SELECT 
        m.org_tenant_id,
        m.role,
        m.status,
        m.updated_at
      FROM org_memberships m
      WHERE m.user_id = ? AND m.status = 'active'
      ORDER BY m.updated_at DESC, m.created_at DESC
    `).all(userId) as Array<{ org_tenant_id: string; role: string; status: string; updated_at: string }>

    const orgs: Array<OrgSummary> = await Promise.all(rows.map(async (row): Promise<OrgSummary> => {
      const tenant = getTenantById(row.org_tenant_id)

      // Do not hide memberships if runtime tenant lookup is stale.
      // UI must still show linked orgs so users can recover/switch context.
      try {
        const tenantRecord = await (this.agent.modules as any).tenants.getTenantById(row.org_tenant_id)
        if (!tenantRecord) {
          logger.warn({ userId, orgTenantId: row.org_tenant_id }, 'Org membership references missing runtime tenant record')
        }
      } catch {
        logger.warn({ userId, orgTenantId: row.org_tenant_id }, 'Org membership runtime lookup failed; returning persisted org summary')
      }

      const memberCount = (db.prepare(
        'SELECT COUNT(*) as cnt FROM org_memberships WHERE org_tenant_id = ? AND status = ?'
      ).get(row.org_tenant_id, 'active') as any)?.cnt || 0

      return {
        orgTenantId: row.org_tenant_id,
        name: tenant?.label || 'Unknown',
        role: row.role,
        domain: tenant?.domain ?? undefined,
        issuerDid: tenant?.issuerDid,
        memberCount,
      }
    }))

    return orgs
  }

  /**
   * Get members of an organization.
   */
  listOrgMembers(orgTenantId: string): Array<{ userId: string; role: string; status: string; createdAt: string }> {
    const db = DatabaseManager.getDatabase()

    const rows = db.prepare(`
      SELECT user_id, role, status, created_at
      FROM org_memberships
      WHERE org_tenant_id = ? AND status IN ('active', 'invited')
      ORDER BY created_at ASC
    `).all(orgTenantId) as Array<{ user_id: string; role: string; status: string; created_at: string }>

    return rows.map(r => ({ userId: r.user_id, role: r.role, status: r.status, createdAt: r.created_at }))
  }

  /**
   * Invite a user to an organization by their ssi_users.id.
   */
  async inviteMember(orgTenantId: string, targetUserId: string, role: 'admin' | 'member', invitedBy: string): Promise<{ membershipId: string }> {
    const db = DatabaseManager.getDatabase()

    // Check the inviter is owner/admin of this org
    const inviterMembership = db.prepare(
      'SELECT role FROM org_memberships WHERE user_id = ? AND org_tenant_id = ? AND status = ?'
    ).get(invitedBy, orgTenantId, 'active') as { role: string } | undefined

    if (!inviterMembership || (inviterMembership.role !== 'owner' && inviterMembership.role !== 'admin')) {
      throw new Error('Only org owners/admins can invite members')
    }

    // Check target isn't already a member
    const existing = db.prepare(
      'SELECT id FROM org_memberships WHERE user_id = ? AND org_tenant_id = ?'
    ).get(targetUserId, orgTenantId) as { id: string } | undefined

    if (existing) {
      throw new Error('User is already a member of this organization')
    }

    const membershipId = crypto.randomUUID()
    const now = new Date().toISOString()
    db.prepare(`
      INSERT INTO org_memberships (id, user_id, org_tenant_id, role, invited_by, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
    `).run(membershipId, targetUserId, orgTenantId, role, invitedBy, now, now)

    logger.info({ membershipId, targetUserId, orgTenantId, role, invitedBy }, 'Member added to org')

    return { membershipId }
  }

  /**
   * Remove a member from an organization.
   */
  removeMember(orgTenantId: string, targetUserId: string, removedBy: string): void {
    const db = DatabaseManager.getDatabase()

    // Check the remover is owner/admin
    const removerMembership = db.prepare(
      'SELECT role FROM org_memberships WHERE user_id = ? AND org_tenant_id = ? AND status = ?'
    ).get(removedBy, orgTenantId, 'active') as { role: string } | undefined

    if (!removerMembership || (removerMembership.role !== 'owner' && removerMembership.role !== 'admin')) {
      throw new Error('Only org owners/admins can remove members')
    }

    // Cannot remove the owner
    const target = db.prepare(
      'SELECT role FROM org_memberships WHERE user_id = ? AND org_tenant_id = ?'
    ).get(targetUserId, orgTenantId) as { role: string } | undefined

    if (target?.role === 'owner' && removedBy !== targetUserId) {
      throw new Error('Cannot remove the org owner')
    }

    db.prepare(
      'UPDATE org_memberships SET status = ?, updated_at = ? WHERE user_id = ? AND org_tenant_id = ?'
    ).run('suspended', new Date().toISOString(), targetUserId, orgTenantId)

    logger.info({ targetUserId, orgTenantId, removedBy }, 'Member removed from org')
  }

  getOrganizationWorkflowConfiguration(userId: string, orgTenantId: string): OrgWorkflowConfiguration {
    const role = this.getUserOrgRole(userId, orgTenantId)
    if (!role) {
      throw new Error('Not a member of this organization')
    }

    const templates = workflowTemplateRepository.listByTenantId(orgTenantId)
    const activeTemplate = templates.find((template) => template.enabled)

    return {
      orgTenantId,
      sector: activeTemplate?.sector,
      templates,
      // features: removed - derive from templates on client side
      // availableFeatures: removed - query global templates instead
    }
  }

  getOrganizationSetupReadiness(userId: string, orgTenantId: string): OrganizationSetupReadiness {
    const role = this.getUserOrgRole(userId, orgTenantId)
    if (!role) {
      throw new Error('Not a member of this organization')
    }

    const db = DatabaseManager.getDatabase()
    const tenant = getTenantById(orgTenantId)
    const org = this.ensurePlatformOrganizationRecord(orgTenantId, tenant?.label)
    const nowIso = new Date().toISOString()

    const orgMembershipStats = db
      .prepare(
        `SELECT
            SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as activeCount,
            SUM(CASE WHEN status = 'active' AND role IN ('owner', 'admin') THEN 1 ELSE 0 END) as adminCount
         FROM org_memberships
         WHERE org_tenant_id = ?`
      )
      .get(orgTenantId) as { activeCount?: number; adminCount?: number } | undefined

    const peopleCount =
      ((db
        .prepare(`SELECT COUNT(*) as cnt FROM people WHERE organization_id = ? AND status = 'active'`)
        .get(org.id) as { cnt?: number } | undefined)?.cnt ?? 0)

    const departmentCount =
      ((db
        .prepare(`SELECT COUNT(*) as cnt FROM departments WHERE organization_id = ? AND status = 'active'`)
        .get(org.id) as { cnt?: number } | undefined)?.cnt ?? 0)

    const roleCount =
      ((db
        .prepare(`SELECT COUNT(*) as cnt FROM roles WHERE organization_id = ?`)
        .get(org.id) as { cnt?: number } | undefined)?.cnt ?? 0)

    const authorityGrantCount =
      ((db
        .prepare(
          `SELECT COUNT(*) as cnt
           FROM authority_grants
           WHERE organization_id = ?
             AND status = 'active'
             AND (valid_from IS NULL OR valid_from <= ?)
             AND (valid_until IS NULL OR valid_until >= ?)`
        )
        .get(org.id, nowIso, nowIso) as { cnt?: number } | undefined)?.cnt ?? 0)

    const delegationCount =
      ((db
        .prepare(
          `SELECT COUNT(*) as cnt
           FROM delegations
           WHERE organization_id = ?
             AND status = 'active'
             AND valid_from <= ?
             AND (valid_until IS NULL OR valid_until >= ?)`
        )
        .get(org.id, nowIso, nowIso) as { cnt?: number } | undefined)?.cnt ?? 0)

    const trustedIssuerCount =
      ((db
        .prepare(`SELECT COUNT(*) as cnt FROM trust_anchors WHERE organization_id = ? AND status = 'active'`)
        .get(org.id) as { cnt?: number } | undefined)?.cnt ?? 0)

    const verifierRegistrationCount =
      ((db
        .prepare(`SELECT COUNT(*) as cnt FROM verifier_registrations WHERE organization_id = ? AND status = 'active'`)
        .get(org.id) as { cnt?: number } | undefined)?.cnt ?? 0)

    const paymentServiceCount =
      ((db
        .prepare(
          `SELECT COUNT(*) as cnt
           FROM service_catalog sc
           JOIN organization_registry o ON o.id = sc.org_id
           WHERE o.tenant_id = ? AND sc.service_type = 'payment' AND sc.is_active = 1`
        )
        .get(orgTenantId) as { cnt?: number } | undefined)?.cnt ?? 0)

    const templates = workflowTemplateRepository.listByTenantId(orgTenantId)
    const activeTemplates = templates.filter((template) => template.enabled)
    const activeWorkflowTypes = activeTemplates.map((template) => String(template.workflowType || '').toLowerCase())

    const usesApprovalOrAuthority = activeWorkflowTypes.length > 0
    const usesStructuredOrg = activeWorkflowTypes.some((workflowType) =>
      /(requisition|procure|hr|payroll|field|operations|approval)/i.test(workflowType)
    )
    const usesVerification = activeWorkflowTypes.some((workflowType) =>
      /(verify|verification|trust|credential|vp|openid)/i.test(workflowType)
    )
    const usesPayments = activeWorkflowTypes.some((workflowType) =>
      /(payment|invoice|cash|receivable|payable|education|delivery|ecommerce)/i.test(workflowType)
    )

    const items: OrganizationSetupReadinessItem[] = [
      {
        key: 'organization_profile',
        title: 'Organization profile exists',
        domain: 'core',
        requirement: 'mandatory',
        status: org.name ? 'ready' : 'needs_attention',
        reason: org.name ? undefined : 'Organization profile name is missing',
      },
      {
        key: 'primary_admin',
        title: 'Primary administrator assigned',
        domain: 'core',
        requirement: 'mandatory',
        status: (orgMembershipStats?.adminCount ?? 0) > 0 ? 'ready' : 'needs_attention',
        reason: (orgMembershipStats?.adminCount ?? 0) > 0 ? undefined : 'No active owner/admin membership found',
      },
      {
        key: 'active_members',
        title: 'At least one active member',
        domain: 'people',
        requirement: 'mandatory',
        status: (orgMembershipStats?.activeCount ?? 0) > 0 ? 'ready' : 'needs_attention',
        reason: (orgMembershipStats?.activeCount ?? 0) > 0 ? undefined : 'Invite or activate at least one member',
      },
      {
        key: 'ssi_identity',
        title: 'Issuer and verifier identities provisioned',
        domain: 'trust',
        requirement: 'mandatory',
        status: tenant?.issuerDid && tenant?.verifierDid ? 'ready' : 'needs_attention',
        reason:
          tenant?.issuerDid && tenant?.verifierDid
            ? undefined
            : 'Organization tenant is missing issuer/verifier DID provisioning',
      },
      {
        key: 'workflow_configuration',
        title: 'Workflow configuration',
        domain: 'operations',
        requirement: 'conditional',
        status: activeTemplates.length > 0 ? 'ready' : 'needs_attention',
        reason:
          activeTemplates.length > 0
            ? undefined
            : 'Configure at least one workflow template to make organization capabilities operational',
      },
      {
        key: 'roles',
        title: 'At least one organization role',
        domain: 'authority',
        requirement: 'mandatory',
        status: roleCount > 0 ? 'ready' : 'needs_attention',
        reason: roleCount > 0 ? undefined : 'Create starter roles (for example: Approver, Finance Manager, Employee)',
      },
      {
        key: 'authorities',
        title: 'Approval authorities configured',
        domain: 'authority',
        requirement: 'conditional',
        status: !usesApprovalOrAuthority ? 'optional' : authorityGrantCount > 0 ? 'ready' : 'needs_attention',
        reason:
          !usesApprovalOrAuthority
            ? 'No active workflows currently require approval authority'
            : authorityGrantCount > 0
              ? undefined
              : 'No active authority grants found for enabled workflows',
        requiredFor: usesApprovalOrAuthority ? activeWorkflowTypes : undefined,
      },
      {
        key: 'departments',
        title: 'Departments for routing and SoD context',
        domain: 'people',
        requirement: 'conditional',
        status: !usesStructuredOrg ? 'optional' : departmentCount > 0 ? 'ready' : 'needs_attention',
        reason:
          !usesStructuredOrg
            ? 'Current workflows do not require department routing'
            : departmentCount > 0
              ? undefined
              : 'Create at least one active department for structured request routing',
        requiredFor: usesStructuredOrg ? activeWorkflowTypes : undefined,
      },
      {
        key: 'trusted_issuers',
        title: 'Trusted issuers and verifier registrations',
        domain: 'trust',
        requirement: 'conditional',
        status: !usesVerification ? 'optional' : trustedIssuerCount > 0 && verifierRegistrationCount > 0 ? 'ready' : 'needs_attention',
        reason:
          !usesVerification
            ? 'Verification-heavy workflows are not currently enabled'
            : trustedIssuerCount > 0 && verifierRegistrationCount > 0
              ? undefined
              : 'Configure trust anchors and verifier registration before strict credential verification flows',
        requiredFor: usesVerification ? activeWorkflowTypes : undefined,
      },
      {
        key: 'payment_provider',
        title: 'Payment provider integration',
        domain: 'integrations',
        requirement: 'conditional',
        status: !usesPayments ? 'optional' : paymentServiceCount > 0 ? 'ready' : 'needs_attention',
        reason:
          !usesPayments
            ? 'No payment-intensive workflows currently enabled'
            : paymentServiceCount > 0
              ? undefined
              : 'Add an active payment service entry (for example EcoCash) for payment flows',
        requiredFor: usesPayments ? activeWorkflowTypes : undefined,
      },
      {
        key: 'delegations',
        title: 'Delegation readiness',
        domain: 'authority',
        requirement: 'recommended',
        status: delegationCount > 0 ? 'ready' : 'optional',
        reason:
          delegationCount > 0
            ? undefined
            : 'Delegations are optional but recommended for leave/backup approval scenarios',
      },
      {
        key: 'people_records',
        title: 'Organization member records mapped to people',
        domain: 'people',
        requirement: 'recommended',
        status: peopleCount > 0 ? 'ready' : 'optional',
        reason: peopleCount > 0 ? undefined : 'Map member identities into people records for richer policy decisions',
      },
    ]

    const assessable = items.filter((item) => item.status !== 'optional')
    const readyAssessable = assessable.filter((item) => item.status === 'ready')
    const readinessPercent = assessable.length === 0 ? 100 : Math.round((readyAssessable.length / assessable.length) * 100)

    const domainNames: OrganizationSetupDomainProgress['domain'][] = [
      'core',
      'people',
      'authority',
      'operations',
      'trust',
      'integrations',
    ]

    const domains = domainNames.map((domain): OrganizationSetupDomainProgress => {
      const domainItems = items.filter((item) => item.domain === domain && item.status !== 'optional')
      const ready = domainItems.filter((item) => item.status === 'ready').length
      const total = domainItems.length
      return {
        domain,
        ready,
        total,
        percent: total === 0 ? 100 : Math.round((ready / total) * 100),
      }
    })

    const nextActions = items
      .filter((item) => item.status === 'needs_attention')
      .slice(0, 5)
      .map((item) => item.title)

    const readinessState: OrganizationSetupReadiness['readinessState'] =
      readinessPercent === 100
        ? 'ready'
        : items.some((item) => item.requirement === 'mandatory' && item.status === 'needs_attention')
          ? 'blocked'
          : 'in_progress'

    return {
      orgTenantId,
      orgName: org.name,
      organizationId: org.id,
      readinessPercent,
      readinessState,
      items,
      domains,
      nextActions,
    }
  }

  async configureOrganizationWorkflows(userId: string, orgTenantId: string, req: ActivateOrgWorkflowRequest): Promise<OrgWorkflowConfiguration> {
    this.assertOrgAdmin(userId, orgTenantId)

    const tenant = getTenantById(orgTenantId)
    if (!tenant) {
      throw new Error('Organization tenant not found')
    }

    // Features removed - workflow templates are the single source of truth (migration 062)
    // Previously: merged features array and stored on tenant record
    // Now: activate templates directly

    if (req.sector) {
      const defaultTemplate = workflowTemplateRepository.findDefaultBySector(req.sector)
      if (!defaultTemplate) {
        throw new Error(`No default template for sector: ${req.sector}`)
      }

      const existingTemplates = workflowTemplateRepository.listByTenantId(orgTenantId)
      const existingForSector = existingTemplates.find((template) => template.sector === req.sector)

      existingTemplates.forEach((template) => {
        // Only disable templates that share the same sector as the one being replaced.
        // Cross-sector templates (e.g., requisitions alongside education) must remain enabled.
        if (template.id !== existingForSector?.id && template.enabled && template.sector === req.sector) {
          workflowTemplateRepository.setEnabled(template.id, false)
        }
      })

      const nextTemplate: WorkflowTemplateDefinition = {
        ...(existingForSector ?? defaultTemplate),
        id: existingForSector?.id ?? `${defaultTemplate.workflowType}-${orgTenantId}-${Date.now()}`,
        tenantId: orgTenantId,
        name: req.name ?? existingForSector?.name ?? defaultTemplate.name,
        sector: req.sector,
        enabled: true,
        version: existingForSector?.version ?? defaultTemplate.version,
        steps: existingForSector?.steps ?? defaultTemplate.steps,
        paymentModes: req.paymentModes ?? existingForSector?.paymentModes ?? defaultTemplate.paymentModes,
        credentialPolicy: existingForSector?.credentialPolicy ?? defaultTemplate.credentialPolicy,
        reconciliationPolicy: {
          mode: 'automatic',
          events: [],
          ...req.reconciliationPolicy
        } as WorkflowTemplateDefinition['reconciliationPolicy'],
        evidencePolicy: {
          ...defaultTemplate.evidencePolicy,
          ...(existingForSector?.evidencePolicy ?? {}),
          ...(req.evidencePolicy ?? {}),
        },
        brandingPolicy: {
          ...defaultTemplate.brandingPolicy,
          ...(existingForSector?.brandingPolicy ?? {}),
          ...(req.brandingPolicy ?? {}),
        },
        initiation: req.initiation ?? existingForSector?.initiation ?? defaultTemplate.initiation,
      }

      workflowTemplateRepository.save(nextTemplate)
    }

    this.provisionAdditionalWorkflowTemplates(orgTenantId, req.additionalWorkflowTypes, req.sector)

    const inferredWorkflowTypes = inferWorkflowTypesForOrg({
      sector: req.sector,
      paymentRails: mapPaymentModesToRails(req.paymentModes),
      category: undefined,
      additionalWorkflowTypes: req.additionalWorkflowTypes,
    })

    if (inferredWorkflowTypes.length > 0) {
      this.provisionAdditionalWorkflowTemplates(orgTenantId, inferredWorkflowTypes, req.sector)
    }

    const activatedWorkflowTypes = Array.from(new Set(
      (req.additionalWorkflowTypes ?? [])
        .map((value) => String(value || '').trim().toLowerCase())
        .filter(Boolean)
    ))

    await this.ensureDiscoveryProfile({
      orgTenantId,
      name: req.name || tenant?.label || 'Organization',
      issuerDid: tenant?.issuerDid,
      verifierDid: tenant?.verifierDid,
      domain: tenant?.domain,
      paymentRails: mapPaymentModesToRails(req.paymentModes),
      activatedWorkflowTypes,
    })

    return this.getOrganizationWorkflowConfiguration(userId, orgTenantId)
  }

  async activateOrganizationWorkflows(userId: string, orgTenantId: string, req: ActivateOrgWorkflowRequest): Promise<OrgWorkflowConfiguration> {
    return this.configureOrganizationWorkflows(userId, orgTenantId, req)
  }

  private provisionAdditionalWorkflowTemplates(
    orgTenantId: string,
    requestedWorkflowTypes?: string[],
    fallbackSector?: SectorType
  ): void {
    const workflowTypes = Array.from(new Set(
      (requestedWorkflowTypes ?? [])
        .map((value) => String(value || '').trim().toLowerCase())
        .filter(Boolean)
    ))

    if (workflowTypes.length === 0) {
      return
    }

    const db = DatabaseManager.getDatabase()
    const existingTemplates = workflowTemplateRepository.listByTenantId(orgTenantId)

    workflowTypes.forEach((workflowType, index) => {
      const workflowTypeCandidates = getWorkflowTypeCandidates(workflowType)
      const existingTemplate = existingTemplates.find((template) => {
        const templateType = String(template.workflowType || '').trim().toLowerCase()
        return workflowTypeCandidates.includes(templateType)
      })
      if (existingTemplate) {
        if (!existingTemplate.enabled) {
          workflowTemplateRepository.setEnabled(existingTemplate.id, true)
        }
        return
      }

      const defaultTemplateStatement = db.prepare(`
        SELECT
          id, tenant_id as tenantId, workflow_type as workflowType, name, sector,
          enabled, version, steps, payment_modes as paymentModes,
          credential_policy as credentialPolicy, reconciliation_policy as reconciliationPolicy,
          evidence_policy as evidencePolicy, branding_policy as brandingPolicy, initiation_schema as initiationSchema
        FROM workflow_templates
        WHERE workflow_type = ? AND tenant_id IS NULL AND enabled = 1
        LIMIT 1
      `)

      let defaultTemplate: any | undefined
      for (const candidate of workflowTypeCandidates) {
        defaultTemplate = defaultTemplateStatement.get(candidate) as any
        if (defaultTemplate) {
          break
        }
      }

      if (!defaultTemplate) {
        let inMemoryTemplate: WorkflowTemplate | undefined
        for (const candidate of workflowTypeCandidates) {
          inMemoryTemplate = getTemplateById(candidate)
          if (inMemoryTemplate) break
        }

        if (!inMemoryTemplate) {
          logger.warn(
            { orgTenantId, workflowType, candidates: workflowTypeCandidates },
            'Requested additional workflow has no global default template'
          )
          return
        }

        const tenantTemplateFromMemory = buildTemplateFromInMemory({
          workflowType,
          orgTenantId,
          index,
          fallbackSector,
          template: inMemoryTemplate,
        })
        workflowTemplateRepository.save(tenantTemplateFromMemory)
        existingTemplates.push(tenantTemplateFromMemory)
        logger.info(
          { orgTenantId, workflowType, source: 'in-memory-template' },
          'Provisioned workflow template from in-memory fallback'
        )
        return
      }

      const tenantTemplate: WorkflowTemplateDefinition = {
        id: `${workflowType}-${orgTenantId}-${Date.now()}-${index}`,
        tenantId: orgTenantId,
        workflowType,
        name: defaultTemplate.name,
        sector: (defaultTemplate.sector as SectorType | null) ?? fallbackSector ?? 'custom',
        enabled: true,
        version: defaultTemplate.version,
        steps: parseJsonColumn(defaultTemplate.steps, []),
        paymentModes: parseJsonColumn(defaultTemplate.paymentModes, []),
        credentialPolicy: parseJsonColumn<WorkflowTemplateDefinition['credentialPolicy']>(defaultTemplate.credentialPolicy, {
          outputVCs: [],
          autoIssue: false,
        }),
        reconciliationPolicy: parseJsonColumn<WorkflowTemplateDefinition['reconciliationPolicy']>(defaultTemplate.reconciliationPolicy, {
          mode: 'manual_close',
          events: [],
        }),
        evidencePolicy: parseJsonColumn(defaultTemplate.evidencePolicy, {}),
        brandingPolicy: parseJsonColumn(defaultTemplate.brandingPolicy, {}),
        initiation: parseJsonColumn<WorkflowTemplateDefinition['initiation'] | undefined>(defaultTemplate.initiationSchema, undefined),
      }

      workflowTemplateRepository.save(tenantTemplate)
      existingTemplates.push(tenantTemplate)
    })
  }

  private assertOrgAdmin(userId: string, orgTenantId: string): void {
    const role = this.getUserOrgRole(userId, orgTenantId)
    if (!role) {
      throw new Error('Not a member of this organization')
    }

    if (role !== 'owner' && role !== 'admin') {
      throw new Error('Only org owners/admins can manage workflows')
    }
  }

  /**
   * Check if a user has a specific role in an org.
   */
  getUserOrgRole(userId: string, orgTenantId: string): string | null {
    const db = DatabaseManager.getDatabase()
    const row = db.prepare(
      'SELECT role FROM org_memberships WHERE user_id = ? AND org_tenant_id = ? AND status = ?'
    ).get(userId, orgTenantId, 'active') as { role: string } | undefined
    return row?.role ?? null
  }

  /**
   * Marks an org membership as the user's latest active org context.
   * Used by switch endpoint so other clients can hydrate the freshest org.
   */
  markOrgAsActive(userId: string, orgTenantId: string): void {
    const db = DatabaseManager.getDatabase()
    db.prepare(
      'UPDATE org_memberships SET updated_at = ? WHERE user_id = ? AND org_tenant_id = ? AND status = ?'
    ).run(new Date().toISOString(), userId, orgTenantId, 'active')
  }

  /**
   * Generate a scoped token for operating as an org.
   * The user must be an active member.
   */
  async generateOrgToken(userId: string, orgTenantId: string): Promise<string> {
    const role = this.getUserOrgRole(userId, orgTenantId)
    if (!role) {
      throw new Error('Not a member of this organization')
    }

    try {
      await this.ensureOrgTenantRuntime(orgTenantId)
    } catch {
      throw new Error('Organization context is stale')
    }

    const db = DatabaseManager.getDatabase()
    const user = db.prepare('SELECT tenant_id, did FROM ssi_users WHERE id = ?').get(userId) as { tenant_id?: string; did?: string } | undefined

    // Always keep the owner/member contact row in sync with their current wallet tenant.
    // This self-heals stale wallet_tenant_id caused by re-registration or wallet migration.
    if (user?.tenant_id) {
      try {
        const ownerDisplayName = this.resolveOwnerDisplayName(user.tenant_id)
        upsertContact({
          id: `${orgTenantId}:owner:${userId}`,
          orgTenantId,
          contactScope: 'internal',
          name: ownerDisplayName,
          did: user.did,
          walletTenantId: user.tenant_id,
          linkedAt: new Date().toISOString(),
          notes: 'Auto-linked from organization member account',
        })
      } catch (err: any) {
        logger.warn({ error: err.message, orgTenantId, userId }, 'generateOrgToken: failed to sync member contact (non-critical)')
      }
    }

    return signToken({
      id: userId,
      tenantId: orgTenantId,
      did: user?.did,
      role: 'RestTenantAgent',
      orgRole: role,
    })
  }
}
