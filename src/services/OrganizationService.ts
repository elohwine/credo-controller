/* eslint-disable @typescript-eslint/explicit-member-accessibility */
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

import type { SectorType, WorkflowTemplateDefinition } from '../types/WorkflowTemplate'

import { Agent, W3cCredentialService } from '@credo-ts/core'
import crypto from 'crypto'
import { injectable, inject, container } from 'tsyringe'

import { RestMultiTenantAgentModules } from '../cliAgent'
import { deleteContact, getContactById, upsertContact } from '../persistence/ContactRepository'
import { DatabaseManager } from '../persistence/DatabaseManager'
import { StatusException } from '../errors/StatusException'
import {
  organizationRegistryRepository,
  type OrganizationCategory,
} from '../persistence/OrganizationRegistryRepository'
import { notificationService } from './NotificationService'
import {
  ORG_CONTEXT_ADMINS_ONLY,
  ORG_CONTEXT_ADMINS_ONLY_MESSAGE,
  ORG_TASK_CONTEXT,
  ORG_TASK_TTL_SECONDS,
  isOrgTaskPurpose,
  normalizeTaskRefs,
  roleMayOpenOrgContext,
  type OrgTaskPurpose,
} from './OrgContextPolicy'
import { orgOfferingsService } from './OrgOfferingsService'
import { applyOrgSetupBootstrap, type OrgSetupBootstrapRequest, type OrgSetupBootstrapResult } from './OrgSetupBootstrap'
import { ensureDefaultDepartment } from './OrgStarterDepartments'
import { ensureStarterRoles } from './OrgStarterRoles'
import { SSIAuthService } from './SSIAuthService'
import {
  orgSetupProfileService,
  REQUEST_TYPE_NAMES,
  type OrgSetupProfile,
  type OrgSetupProfileInput,
} from './OrgSetupProfileService'
import { orgSetupProvisioningService } from './OrgSetupProvisioningService'
import {
  canSeeSetupSteps,
  canSeeUnassignedInbound,
  rankNextSteps,
  type NextStepItem,
  type NextStepsResult,
} from './nextSteps'
import { getTenantById, upsertTenant, type TenantPersistenceRecord } from '../persistence/TenantRepository'
import { getWalletCredentialsByWalletId } from '../persistence/WalletCredentialRepository'
import { WorkflowTemplateRepository } from '../persistence/WorkflowTemplateRepository'
import { workflowRequestRepository } from '../persistence/WorkflowRequestRepository'
import { isWorkflowRequestActionable } from './workflowRequestInbox'
import { platformRequestService } from './PlatformRequestService'
import { isPlatformRequestWaiting } from '../config/requestInbox'
import { signToken } from '../utils/jwt'
import { rootLogger } from '../utils/pinoLogger'

import {
  ACTOR_PRESETS,
  OrgWorkflowActorService,
  roleFallbackFor,
  describeActorMode,
  orgWorkflowActorService,
  type ActorFallbackEntry,
  type ActorPreset,
  type OrgMemberActor,
  type OrgWorkflowActorPolicy,
  type OrgWorkflowActorPolicyPatch,
  type ResolvedOrgWorkflowActor,
  type WorkflowActorDefaultRecord,
} from './OrgWorkflowActorService'
import { provisionTenantResources } from './TenantProvisioningService'
import { workflowReadinessService, type TemplateReadinessReport } from './WorkflowReadinessService'
import { getWorkflowTypeCandidates, normalizeWorkflowTypeAlias } from './workflow/initiation'
import { issuedRecordTypes, sanitizeRecordSettings } from './workflow/recordSettings'
import { actorCredentialFingerprint, orgWorkflowActorCredentialService } from './OrgWorkflowActorCredentialService'
import { getDeclaredPrerequisites } from './workflow/prerequisites'
import { getTemplateById, type WorkflowTemplate } from './workflow/templates'

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

export interface DepartmentRecord {
  id: string
  name: string
  code: string
  description?: string
  memberCount?: number
  createdAt: string
}

export interface AuthorityGrantRecord {
  id: string
  userId: string
  role: string
  domain: string
  thresholdAmount?: number
  currency?: string
  status: string
  createdAt: string
}

export interface RoleRecord {
  id: string
  name: string
  description?: string
  permissions: string[]
  /** Membership role this row assigns when someone joins the team. */
  membershipRole?: string
  createdAt: string
}

export interface DelegationRecord {
  id: string
  delegatorUserId: string
  delegateUserId: string
  permissions: string[]
  maxAmount?: number
  currency?: string
  validFrom: string
  validUntil?: string
  status: string
  createdAt: string
}

export interface CreateOrgRequest {
  name: string
  domain?: string
  category?: OrganizationCategory
  paymentRails?: string[]
  /** Workflow types the organization intends to use. Prerequisites surface in readiness. */
  workflowTypes?: string[]
  /** @deprecated use `workflowTypes`. */
  sector?: SectorType
  /** @deprecated use `workflowTypes`. */
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
  /** Owners and admins may open the organisation; everyone else works from their personal wallet. */
  canOpenOrgContext?: boolean
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
  /** Workflow types / template ids the organization intends to use. */
  workflowTypes?: string[]
  /** @deprecated use `workflowTypes`. Kept for older clients; mapped onto the sector's default workflow. */
  sector?: SectorType
  /** @deprecated use `workflowTypes`. */
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
  access: OrgSetupProfile['access']
  /** @deprecated derived from the first configured template; workflows are prerequisite-driven, not sector-driven. */
  sector?: SectorType
  templates: WorkflowTemplateDefinition[]
  /** Workflow types the organization has configured (regardless of readiness). */
  workflowTypes: string[]
  /** Per-workflow readiness derived from declared prerequisites. */
  workflows: OrganizationWorkflowReadinessSummary[]
  // features: removed - derive from templates.workflowType instead (migration 062)
  // availableFeatures: removed - query workflow_templates WHERE tenant_id IS NULL instead
}

export type OrganizationSetupRequirement = 'mandatory' | 'conditional' | 'recommended'
export type OrganizationSetupStatus = 'ready' | 'needs_attention' | 'pending_external' | 'optional'

export interface OrganizationSetupReadinessItem {
  key: string
  title: string
  domain: 'core' | 'people' | 'authority' | 'operations' | 'trust' | 'integrations'
  requirement: OrganizationSetupRequirement
  status: OrganizationSetupStatus
  reason?: string
  requiredFor?: string[]
  /** Stage action for stage-actor prerequisites. */
  stageAction?: string
  /** Portal route hint for the "Configure" action. */
  actionPath?: string
  /** A non-money step nobody was chosen for. Asked when the request is first used. */
  askedOnFirstUse?: boolean
}

export interface OrganizationWorkflowReadinessSummary {
  templateId?: string
  workflowType: string
  name?: string
  /** True when all mandatory / conditional prerequisites are satisfied. */
  ready: boolean
  /** Keys of blocking readiness items. */
  blocking: string[]
}

export interface WorkflowStageActorView {
  stageAction: string
  title?: string
  requirement: string
  actor: ResolvedOrgWorkflowActor
  /** Human readable explanation of `actor.mode`. */
  actorDescription: string
  /** True when the stage would fall to the owner or nobody — surfaced as a setup item. */
  needsAssignment: boolean
  /** Approving, releasing, recording or receipting money. Shares the purchase-request people. */
  moneyStep: boolean
  /** A non-money step nobody was chosen for. Asked when the request is first used. */
  askedOnFirstUse: boolean
  /** Saved stage default, if any (alias-aware). */
  default?: WorkflowActorDefaultRecord
  /** Platform role order tried when no default / org chain matches. */
  builtInRoles: string[]
  /** Org-defined chain for this stage, if any. */
  stageChain: ActorFallbackEntry[]
  /**
   * Whether the resolved actor holds / was offered the OrgWorkflowActorCredential that the
   * stage's OIDC4VP presentation accepts. `not_applicable` when nobody is configured.
   */
  credential: StageActorCredentialView
}

export interface StageActorCredentialView {
  state: 'accepted' | 'offered' | 'not_offered' | 'not_applicable'
  offeredAt?: string
  acceptedAt?: string
  /** Stage actions covered by the latest credential. */
  stageActions?: string[]
  /** The assignment changed since the credential was offered/accepted. */
  stale?: boolean
}

export interface WorkflowActorsView {
  orgTenantId: string
  workflows: Array<{
    templateId?: string
    workflowType: string
    name?: string
    stages: WorkflowStageActorView[]
  }>
  /** Active members who can be picked as stage actors. */
  members: OrgMemberActor[]
  /** Role keys an admin can pick (membership roles, org roles, built-in stage roles). */
  roles: string[]
  policy: OrgWorkflowActorPolicy
  /** Ready-made setups for purchase-request approvals. */
  presets: Array<Pick<ActorPreset, 'id' | 'title' | 'detail' | 'signMode'>>
  /** Whether the caller may change assignments (owner/admin). */
  canEdit: boolean
}

export interface WorkflowActorDefaultInput {
  workflowType: string
  stageAction: string
  defaultUserId?: string
  defaultRole?: string
  defaultWalletTenantId?: string
  /** `false` removes the stage default so the fallback policy applies again. */
  enabled?: boolean
}

export interface AssignUnassignedStagesInput {
  /** Assign every unassigned stage to this member… */
  userId?: string
  /** …or to this role. */
  role?: string
  /** Limit to one workflow type (alias-aware). Omit for all configured workflows. */
  workflowType?: string
}

export interface AssignUnassignedStagesResult {
  assigned: Array<{ workflowType: string; stageAction: string }>
  skipped: Array<{ workflowType: string; stageAction: string; reason: string }>
}

export interface OfferWorkflowActorCredentialsInput {
  workflowType?: string
  /** Re-offer even when an identical credential was already accepted. */
  force?: boolean
}

export interface OfferWorkflowActorCredentialsResult {
  offered: Array<{ workflowType: string; stageActions: string[]; userId?: string; role?: string }>
  alreadyCovered: Array<{
    workflowType: string
    stageActions: string[]
    userId?: string
    role?: string
    outcome: string
  }>
  skipped: Array<{ workflowType: string; stageActions: string[]; reason?: string }>
  failed: Array<{ workflowType: string; stageActions: string[]; reason?: string }>
}

/**
 * Resolve the stage actor for a workflow type. `OrgWorkflowActorService.resolveActor` is alias-aware
 * (see `WORKFLOW_ACTOR_ALIASES`), so one call covers the configured type and its runtime aliases.
 */
function resolveBestStageActor(
  orgTenantId: string,
  workflowType: string,
  stageAction: string,
): ResolvedOrgWorkflowActor {
  return orgWorkflowActorService.resolveActor({ orgTenantId, workflowType, stageAction })
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
  /** Per-workflow operational state derived from declared prerequisites. */
  workflows: OrganizationWorkflowReadinessSummary[]
}

const workflowTemplateRepository = new WorkflowTemplateRepository()

/** Deprecated sector → default workflow type mapping, kept for older clients. */
const SECTOR_DEFAULT_WORKFLOW_TYPE: Partial<Record<SectorType, string>> = {
  ecommerce: 'ecommerce_delivery',
  education: 'education_fee_payment',
  cash: 'cash_counter_payment',
  field_execution: 'field_execution_fept',
}

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
  const normalized = (input || []).map((rail) => String(rail || '').trim()).filter(Boolean)

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
    const normalized = String(mode || '')
      .trim()
      .toLowerCase()
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
    .map((value) =>
      String(value || '')
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean)

  const workflowTypes = new Set<string>(requested)

  const isFinanceOrg = params.category === 'finance' || params.paymentRails?.some((rail) => /eco|bank|cash/i.test(rail))
  const hasCreditRole = params.additionalWorkflowTypes?.some((entry) =>
    /ar|receivable|collection|credit/i.test(String(entry || '').toLowerCase()),
  )

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

/** A request the answers make available. Not a saved workflow row. */
function templateOfferedByAnswers(orgTenantId: string, workflowType: string): WorkflowTemplateDefinition {
  const builtin = getTemplateById(normalizeWorkflowTypeAlias(workflowType))
  return {
    id: workflowType,
    tenantId: orgTenantId,
    workflowType,
    name: builtin?.name || REQUEST_TYPE_NAMES[workflowType] || workflowType,
    sector: 'custom',
    enabled: true,
    version: 1,
    steps: [],
    paymentModes: [],
    credentialPolicy: { outputVCs: builtin?.outputVCs || [], autoIssue: false },
    reconciliationPolicy: { mode: 'manual_close', events: [] },
    evidencePolicy: {},
    brandingPolicy: {},
  }
}

@injectable()
export class OrganizationService {
  private agent: Agent<RestMultiTenantAgentModules>

  private ensurePlatformOrganizationRecord(orgTenantId: string, orgName?: string): { id: string; name: string } {
    const db = DatabaseManager.getDatabase()
    const existing = db.prepare('SELECT id, name FROM organizations WHERE tenant_id = ? LIMIT 1').get(orgTenantId) as
      | { id: string; name: string }
      | undefined

    if (existing?.id) {
      return existing
    }

    const tenant = getTenantById(orgTenantId)
    const registry = organizationRegistryRepository.findOrganizationByTenantId(orgTenantId)
    const resolvedName = orgName?.trim() || tenant?.label || registry?.displayName || 'Organization'
    const organizationId = crypto.randomUUID()

    db.prepare(
      `INSERT INTO organizations (id, tenant_id, name, status, created_at, updated_at)
       VALUES (?, ?, ?, 'active', ?, ?)`,
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
    const normalizedRails = params.paymentRails === undefined ? undefined : normalizePaymentRails(params.paymentRails)

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
        isPublic: false,
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
        db.prepare(`UPDATE organization_registry SET payment_rails = ?, updated_at = ? WHERE id = ?`).run(
          JSON.stringify(normalizedRails),
          new Date().toISOString(),
          current.id,
        )
      } catch (error: any) {
        logger.warn({ error: error.message, orgTenantId: params.orgTenantId }, 'Failed to persist payment rails')
      }
    }

    // Public services come from the work areas (OrgOfferingsService); the owner chooses what shows.
    await this.ensureInitialTrustBadges(current.id, params.orgTenantId)
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
        const existing = db
          .prepare(`SELECT id FROM org_trust_badges WHERE org_id = ? AND badge_type = ? AND revoked = 0 LIMIT 1`)
          .get(orgId, badge.badgeType) as { id: string } | undefined

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
          logger.info(
            { orgId, badgeType: badge.badgeType, offerId: offer.offerId },
            'Created trust badge credential offer',
          )
        } catch (error: any) {
          logger.warn({ error: error.message, orgId, badgeType: badge.badgeType }, 'Failed to create trust badge offer')
        }

        // Store badge record with VC reference
        db.prepare(
          `INSERT INTO org_trust_badges (id, org_id, tenant_id, badge_type, label, vc_log_id, issued_at, revoked)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
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

  /** A person's own name from their wallet, when they have set one. Never a role label. */
  private resolveIdentityDisplayName(walletTenantId?: string): string | undefined {
    if (!walletTenantId) return undefined

    try {
      const creds = getWalletCredentialsByWalletId(walletTenantId)
      for (const cred of creds) {
        const isPlatformIdentity =
          cred.type.includes('PlatformIdentityVC') || cred.type.includes('PlatformIdentityCredential')
        if (!isPlatformIdentity) continue

        const parsed = JSON.parse(cred.credentialData || '{}')
        const subject = parsed?.credentialSubject || parsed?.vc?.credentialSubject || {}
        const nested = subject?.claims && typeof subject.claims === 'object' ? subject.claims : {}
        const candidate =
          nested.displayName || subject?.displayName || nested.username || subject?.username || subject?.name
        if (typeof candidate === 'string' && candidate.trim().length > 0) {
          return candidate.trim()
        }
      }
    } catch {
      // Best-effort enrichment only.
    }

    return undefined
  }

  private resolveOwnerDisplayName(walletTenantId?: string): string {
    return this.resolveIdentityDisplayName(walletTenantId) || 'Organization owner'
  }

  /**
   * The person's name as held in their own wallet (platform identity card). Phone-and-PIN
   * sign-ups keep the card in the Credo tenant wallet, not the legacy table, so this reads
   * the tenant wallet when the quick lookup finds nothing. Best effort: never throws.
   */
  private async resolveIdentityDisplayNameAsync(walletTenantId?: string): Promise<string | undefined> {
    if (!walletTenantId) return undefined
    const quick = this.resolveIdentityDisplayName(walletTenantId)
    if (quick) return quick
    try {
      const tenantAgent = await this.agent.modules.tenants.getTenantAgent({ tenantId: walletTenantId })
      try {
        const w3c = tenantAgent.dependencyManager.resolve(W3cCredentialService)
        const records = await w3c.getAllCredentialRecords(tenantAgent.context)
        for (const record of records) {
          const cred: any = (record as any).firstCredential || (record as any).credential
          const types: string[] = Array.isArray(cred?.type) ? cred.type : []
          if (!types.some((t) => /PlatformIdentity/i.test(String(t)))) continue
          const subject = cred?.credentialSubject || {}
          const claims = subject?.claims && typeof subject.claims === 'object' ? subject.claims : {}
          const candidate = claims.displayName || subject.displayName || claims.username || subject.username
          if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
        }
      } finally {
        await tenantAgent.endSession().catch(() => undefined)
      }
    } catch (err: any) {
      logger.debug({ error: err?.message, walletTenantId }, 'Identity display name lookup skipped')
    }
    return undefined
  }

  /**
   * Name to store on the member's contact. A real name always wins. Switching into the
   * organization must not rename a field worker "Organization owner".
   */
  private memberContactName(role: string | undefined, identityName: string | undefined, storedName?: string): string {
    if (identityName) return identityName
    const stored = storedName?.trim()
    const generic = !stored || /^(organization owner|team member)$/i.test(stored)
    if (stored && !generic) return stored
    if (String(role || '').toLowerCase() === 'owner') return 'Organization owner'
    return 'Team member'
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
    const existingOrg = db
      .prepare("SELECT id FROM tenants WHERE label = ? AND tenant_type = 'ORG' COLLATE NOCASE")
      .get(orgName) as { id: string } | undefined

    let orgTenantId: string
    let tenantRecord: any = null

    if (existingOrg?.id) {
      orgTenantId = existingOrg.id
      logger.info({ orgTenantId, name: orgName }, 'Deduplication: reusing existing organization tenant')
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
        logger.error({ error: err.message, orgTenantId }, 'Org provisioning failed')
        throw err
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
      db.prepare(
        `
        INSERT INTO tenants (
          id, label, status, created_at, issuer_did, issuer_kid, verifier_did, verifier_kid, askar_profile, metadata, tenant_type, domain, phone
        ) VALUES (
          @id, @label, @status, @createdAt, @issuerDid, @issuerKid, @verifierDid, @verifierKid, @askarProfile, @metadata, @tenantType, @domain, @phone
        )
        ON CONFLICT(id) DO UPDATE SET
          label = excluded.label,
          domain = excluded.domain,
          status = excluded.status
      `,
      ).run({
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
    if (!existingOrg) orgSetupProfileService.initializeNew(orgTenantId)

    // Create ownership membership if one doesn't exist
    const existingMembership = db
      .prepare('SELECT id FROM org_memberships WHERE user_id = ? AND org_tenant_id = ?')
      .get(userId, orgTenantId) as { id: string } | undefined
    const now = new Date().toISOString()

    if (!existingMembership) {
      const membershipId = crypto.randomUUID()
      db.prepare(
        `
        INSERT INTO org_memberships (id, user_id, org_tenant_id, role, status, created_at, updated_at)
        VALUES (?, ?, ?, 'owner', 'active', ?, ?)
      `,
      ).run(membershipId, userId, orgTenantId, now, now)

      logger.info({ membershipId, userId, orgTenantId, role: 'owner' }, 'Created org ownership membership')
      this.offerEmployeeCredential(orgTenantId, userId, 'owner', 'membership')
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
      if (owner?.tenant_id) {
        this.offerEmployeeCredentialForWallet(orgTenantId, owner.tenant_id, ownerDisplayName)
      }
    } catch (error: any) {
      logger.warn({ error: error.message, orgTenantId, userId }, 'Failed to upsert owner contact')
    }

    let assignedTemplateId: string | undefined
    const hasExplicitWorkflowRequest =
      (req.workflowTypes?.length ?? 0) > 0 || (req.additionalWorkflowTypes?.length ?? 0) > 0

    if (hasExplicitWorkflowRequest) {
      const configured = await this.configureOrganizationWorkflows(userId, orgTenantId, {
        sector: req.sector,
        workflowTypes: req.workflowTypes,
        additionalWorkflowTypes: req.additionalWorkflowTypes,
      })
      assignedTemplateId = configured.templates[0]?.id
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
      activatedWorkflowTypes: [...(req.workflowTypes ?? []), ...(req.additionalWorkflowTypes ?? [])],
    })

    // Setup defaults: practice-mode payments + trust our own proofs, so a new org can run end to end.
    orgSetupProvisioningService.provisionOnboardingDefaults(orgTenantId)

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
    paymentRails: string[],
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
    isPublic: boolean,
  ): Promise<OrgDiscoveryVisibilityUpdateResult> {
    const role = this.getUserOrgRole(userId, orgTenantId)
    if (!role) {
      throw new Error('Not a member of this organization')
    }

    if (role !== 'owner' && role !== 'admin') {
      throw new Error('Only org owners/admins can manage organization settings')
    }

    if (!organizationRegistryRepository.findOrganizationByTenantId(orgTenantId)) {
      throw new Error('Organization not found')
    }

    orgOfferingsService.setListed(orgTenantId, isPublic)

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

    const rows = db
      .prepare(
        `
      SELECT 
        m.org_tenant_id,
        m.role,
        m.status,
        m.updated_at
      FROM org_memberships m
      WHERE m.user_id = ? AND m.status = 'active'
      ORDER BY m.updated_at DESC, m.created_at DESC
    `,
      )
      .all(userId) as Array<{ org_tenant_id: string; role: string; status: string; updated_at: string }>

    const orgs: Array<OrgSummary> = await Promise.all(
      rows.map(async (row): Promise<OrgSummary> => {
        const tenant = getTenantById(row.org_tenant_id)

        // Do not hide memberships if runtime tenant lookup is stale.
        // UI must still show linked orgs so users can recover/switch context.
        try {
          const tenantRecord = await (this.agent.modules as any).tenants.getTenantById(row.org_tenant_id)
          if (!tenantRecord) {
            logger.warn(
              { userId, orgTenantId: row.org_tenant_id },
              'Org membership references missing runtime tenant record',
            )
          }
        } catch {
          logger.warn(
            { userId, orgTenantId: row.org_tenant_id },
            'Org membership runtime lookup failed; returning persisted org summary',
          )
        }

        const memberCount =
          (
            db
              .prepare('SELECT COUNT(*) as cnt FROM org_memberships WHERE org_tenant_id = ? AND status = ?')
              .get(row.org_tenant_id, 'active') as any
          )?.cnt || 0

        return {
          orgTenantId: row.org_tenant_id,
          name: tenant?.label || 'Unknown',
          role: row.role,
          domain: tenant?.domain ?? undefined,
          issuerDid: tenant?.issuerDid,
          memberCount,
          canOpenOrgContext: roleMayOpenOrgContext(row.role),
        }
      }),
    )

    return orgs
  }

  /**
   * Get members of an organization.
   */
  /**
   * Contacts saved before a person accepted their identity card keep the placeholder
   * "Team member". Read the name from the wallet and store it, once.
   */
  async refreshMemberNames(orgTenantId: string): Promise<void> {
    const members = this.listOrgMembers(orgTenantId)
    for (const member of members) {
      const stored = String(member.displayName || '').trim()
      const generic = !stored || /^(team member|organization owner)$/i.test(stored)
      if (!generic) continue
      if (member.role === 'owner' && /^organization owner$/i.test(stored)) continue
      await this.syncMemberContact(orgTenantId, member.userId, member.role)
    }
  }

  listOrgMembers(
    orgTenantId: string,
  ): Array<{ userId: string; role: string; status: string; createdAt: string; displayName?: string; phone?: string }> {
    const db = DatabaseManager.getDatabase()

    const rows = db
      .prepare(
        `
      SELECT m.user_id, m.role, m.status, m.created_at,
             (
               SELECT c.name FROM org_contacts c
               JOIN ssi_users u ON u.tenant_id = c.wallet_tenant_id
               WHERE c.org_tenant_id = m.org_tenant_id AND u.id = m.user_id AND c.name IS NOT NULL AND c.name != ''
               ORDER BY CASE WHEN c.contact_scope = 'internal' THEN 0 ELSE 1 END
               LIMIT 1
             ) AS display_name,
             (
               SELECT c.phone FROM org_contacts c
               JOIN ssi_users u ON u.tenant_id = c.wallet_tenant_id
               WHERE c.org_tenant_id = m.org_tenant_id AND u.id = m.user_id AND c.phone IS NOT NULL AND c.phone != ''
               ORDER BY CASE WHEN c.contact_scope = 'internal' THEN 0 ELSE 1 END
               LIMIT 1
             ) AS phone
      FROM org_memberships m
      WHERE m.org_tenant_id = ? AND m.status IN ('active', 'invited')
      ORDER BY m.created_at ASC
    `,
      )
      .all(orgTenantId) as Array<{
      user_id: string
      role: string
      status: string
      created_at: string
      display_name?: string | null
      phone?: string | null
    }>

    return rows.map((r) => ({
      userId: r.user_id,
      role: r.role,
      status: r.status,
      createdAt: r.created_at,
      displayName: r.display_name || undefined,
      phone: r.phone || undefined,
    }))
  }

  listDepartments(orgTenantId: string): DepartmentRecord[] {
    const db = DatabaseManager.getDatabase()
    const org = this.ensurePlatformOrganizationRecord(orgTenantId, getTenantById(orgTenantId)?.label)
    try {
      ensureDefaultDepartment(org.id)
    } catch (error: any) {
      logger.warn({ error: error?.message, orgTenantId }, 'Could not create the default department')
    }

    const rows = db
      .prepare(
        `
        SELECT d.id, d.name, COALESCE(d.code, '') as code, d.created_at,
               COUNT(om.person_id) as memberCount
        FROM departments d
        LEFT JOIN organization_memberships om
          ON om.department_id = d.id AND om.membership_status = 'active'
        WHERE d.organization_id = ? AND d.status = 'active'
        GROUP BY d.id, d.name, d.code, d.created_at
        ORDER BY d.created_at ASC
      `,
      )
      .all(org.id) as Array<{
      id: string
      name: string
      code: string
      created_at: string
      memberCount: number
    }>

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      createdAt: row.created_at,
      memberCount: row.memberCount,
    }))
  }

  createDepartment(
    orgTenantId: string,
    createdBy: string,
    input: { name: string; code?: string; description?: string },
  ): DepartmentRecord {
    this.assertOrgAdmin(createdBy, orgTenantId)

    const db = DatabaseManager.getDatabase()
    const org = this.ensurePlatformOrganizationRecord(orgTenantId, getTenantById(orgTenantId)?.label)
    const id = crypto.randomUUID()
    const createdAt = new Date().toISOString()

    db.prepare(
      `
      INSERT INTO departments (id, organization_id, name, code, status, created_at)
      VALUES (?, ?, ?, ?, 'active', ?)
    `,
    ).run(id, org.id, input.name.trim(), input.code?.trim() || null, createdAt)

    return {
      id,
      name: input.name.trim(),
      code: input.code?.trim() || '',
      description: input.description?.trim() || undefined,
      memberCount: 0,
      createdAt,
    }
  }

  deleteDepartment(orgTenantId: string, departmentId: string, removedBy: string): void {
    this.assertOrgAdmin(removedBy, orgTenantId)

    const db = DatabaseManager.getDatabase()
    const org = this.ensurePlatformOrganizationRecord(orgTenantId, getTenantById(orgTenantId)?.label)

    db.prepare(`UPDATE departments SET status = 'archived' WHERE id = ? AND organization_id = ?`).run(
      departmentId,
      org.id,
    )
  }

  listAuthorities(orgTenantId: string): AuthorityGrantRecord[] {
    const db = DatabaseManager.getDatabase()
    const org = this.ensurePlatformOrganizationRecord(orgTenantId, getTenantById(orgTenantId)?.label)

    const rows = db
      .prepare(
        `
        SELECT ag.id, p.subject_ref as userId, ag.authority_type as role, ag.scope_json, ag.status, ag.created_at
        FROM authority_grants ag
        JOIN people p ON p.id = ag.person_id
        WHERE ag.organization_id = ? AND ag.status = 'active'
        ORDER BY ag.created_at ASC
      `,
      )
      .all(org.id) as Array<{
      id: string
      userId: string
      role: string
      scope_json: string
      status: string
      created_at: string
    }>

    return rows.map((row) => {
      const scope = safeJsonParse(row.scope_json)
      return {
        id: row.id,
        userId: row.userId,
        role: row.role,
        domain: typeof scope.domain === 'string' ? scope.domain : 'general',
        thresholdAmount: typeof scope.thresholdAmount === 'number' ? scope.thresholdAmount : undefined,
        currency: typeof scope.currency === 'string' ? scope.currency : undefined,
        status: row.status,
        createdAt: row.created_at,
      }
    })
  }

  grantAuthority(
    orgTenantId: string,
    grantedBy: string,
    input: { userId: string; role: string; domain: string; thresholdAmount?: number; currency?: string },
  ): AuthorityGrantRecord {
    this.assertOrgAdmin(grantedBy, orgTenantId)

    const db = DatabaseManager.getDatabase()
    const org = this.ensurePlatformOrganizationRecord(orgTenantId, getTenantById(orgTenantId)?.label)
    const personId = this.getOrCreatePersonIdForUser(org.id, input.userId)
    const id = crypto.randomUUID()
    const createdAt = new Date().toISOString()
    const scope = JSON.stringify({
      domain: input.domain,
      thresholdAmount: input.thresholdAmount,
      currency: input.currency,
    })

    db.prepare(
      `
      INSERT INTO authority_grants (id, organization_id, person_id, authority_type, scope_json, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'active', ?)
    `,
    ).run(id, org.id, personId, input.role.trim(), scope, createdAt)

    return {
      id,
      userId: input.userId,
      role: input.role.trim(),
      domain: input.domain,
      thresholdAmount: input.thresholdAmount,
      currency: input.currency,
      status: 'active',
      createdAt,
    }
  }

  revokeAuthority(orgTenantId: string, authorityId: string, revokedBy: string): void {
    this.assertOrgAdmin(revokedBy, orgTenantId)

    const db = DatabaseManager.getDatabase()
    const org = this.ensurePlatformOrganizationRecord(orgTenantId, getTenantById(orgTenantId)?.label)

    db.prepare(`UPDATE authority_grants SET status = 'revoked' WHERE id = ? AND organization_id = ?`).run(
      authorityId,
      org.id,
    )
  }

  listRoles(orgTenantId: string): RoleRecord[] {
    const db = DatabaseManager.getDatabase()
    const org = this.ensurePlatformOrganizationRecord(orgTenantId, getTenantById(orgTenantId)?.label)

    try {
      ensureStarterRoles(orgTenantId, org.id)
    } catch (error: any) {
      logger.warn({ error: error?.message, orgTenantId }, 'Could not fill starter roles from the setup answers')
    }

    const rows = db
      .prepare(
        `
        SELECT id, name, description_ref, permissions, membership_role, created_at
        FROM roles
        WHERE organization_id = ?
        ORDER BY created_at ASC
      `,
      )
      .all(org.id) as Array<{
      id: string
      name: string
      description_ref?: string | null
      permissions: string
      membership_role?: string | null
      created_at: string
    }>

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description_ref || undefined,
      permissions: parseJsonColumn<string[]>(row.permissions, []),
      membershipRole: row.membership_role || undefined,
      createdAt: row.created_at,
    }))
  }

  createRole(
    orgTenantId: string,
    createdBy: string,
    input: { name: string; description?: string; permissions?: string[]; membershipRole?: string },
  ): RoleRecord {
    this.assertOrgAdmin(createdBy, orgTenantId)

    const db = DatabaseManager.getDatabase()
    const org = this.ensurePlatformOrganizationRecord(orgTenantId, getTenantById(orgTenantId)?.label)
    const id = crypto.randomUUID()
    const createdAt = new Date().toISOString()
    const permissions = Array.from(new Set((input.permissions || []).map((value) => value.trim()).filter(Boolean)))

    const membershipRole = OrganizationService.normalizeMembershipRole(input.membershipRole || input.name)
    db.prepare(
      `
      INSERT INTO roles (id, organization_id, name, description_ref, permissions, membership_role, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      id,
      org.id,
      input.name.trim(),
      input.description?.trim() || null,
      JSON.stringify(permissions),
      membershipRole === 'member' && !input.membershipRole ? null : membershipRole,
      createdAt,
    )

    return {
      id,
      name: input.name.trim(),
      description: input.description?.trim() || undefined,
      permissions,
      membershipRole: membershipRole === 'member' && !input.membershipRole ? undefined : membershipRole,
      createdAt,
    }
  }

  deleteRole(orgTenantId: string, roleId: string, removedBy: string): void {
    this.assertOrgAdmin(removedBy, orgTenantId)

    const db = DatabaseManager.getDatabase()
    const org = this.ensurePlatformOrganizationRecord(orgTenantId, getTenantById(orgTenantId)?.label)
    db.prepare('DELETE FROM roles WHERE id = ? AND organization_id = ?').run(roleId, org.id)
  }

  listDelegations(orgTenantId: string): DelegationRecord[] {
    const db = DatabaseManager.getDatabase()
    const org = this.ensurePlatformOrganizationRecord(orgTenantId, getTenantById(orgTenantId)?.label)

    const rows = db
      .prepare(
        `
        SELECT
          d.id,
          delegator.subject_ref AS delegatorUserId,
          delegate.subject_ref AS delegateUserId,
          d.scope_json,
          d.valid_from,
          d.valid_until,
          d.status,
          d.created_at
        FROM delegations d
        JOIN people delegator ON delegator.id = d.delegator_person_id
        JOIN people delegate ON delegate.id = d.delegate_person_id
        WHERE d.organization_id = ? AND d.status = 'active'
        ORDER BY d.created_at ASC
      `,
      )
      .all(org.id) as Array<{
      id: string
      delegatorUserId: string
      delegateUserId: string
      scope_json: string
      valid_from: string
      valid_until?: string | null
      status: string
      created_at: string
    }>

    return rows.map((row) => {
      const scope = safeJsonParse(row.scope_json)
      return {
        id: row.id,
        delegatorUserId: row.delegatorUserId,
        delegateUserId: row.delegateUserId,
        permissions: Array.isArray(scope.permissions)
          ? scope.permissions.filter((value): value is string => typeof value === 'string')
          : [],
        maxAmount: typeof scope.maxAmount === 'number' ? scope.maxAmount : undefined,
        currency: typeof scope.currency === 'string' ? scope.currency : undefined,
        validFrom: row.valid_from,
        validUntil: row.valid_until || undefined,
        status: row.status,
        createdAt: row.created_at,
      }
    })
  }

  createDelegation(
    orgTenantId: string,
    createdBy: string,
    input: {
      delegatorUserId: string
      delegateUserId: string
      permissions: string[]
      maxAmount?: number
      currency?: string
      validFrom: string
      validUntil?: string
    },
  ): DelegationRecord {
    this.assertOrgAdmin(createdBy, orgTenantId)

    const db = DatabaseManager.getDatabase()
    const org = this.ensurePlatformOrganizationRecord(orgTenantId, getTenantById(orgTenantId)?.label)
    const id = crypto.randomUUID()
    const createdAt = new Date().toISOString()
    const delegatorPersonId = this.getOrCreatePersonIdForUser(org.id, input.delegatorUserId)
    const delegatePersonId = this.getOrCreatePersonIdForUser(org.id, input.delegateUserId)
    const permissions = Array.from(new Set((input.permissions || []).map((value) => value.trim()).filter(Boolean)))
    const scope = JSON.stringify({ permissions, maxAmount: input.maxAmount, currency: input.currency })

    db.prepare(
      `
      INSERT INTO delegations (
        id, organization_id, delegator_person_id, delegate_person_id,
        scope_json, valid_from, valid_until, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)
    `,
    ).run(id, org.id, delegatorPersonId, delegatePersonId, scope, input.validFrom, input.validUntil || null, createdAt)

    void import('./OrgMembershipCredentialService')
      .then(({ orgMembershipCredentialService }) => {
        orgMembershipCredentialService.ensureDelegationCredentialInBackground({
          orgTenantId,
          delegationId: id,
          delegatorUserId: input.delegatorUserId,
          delegateUserId: input.delegateUserId,
          permissions,
          maxAmount: input.maxAmount,
          currency: input.currency,
          validFrom: input.validFrom,
          validUntil: input.validUntil,
        })
      })
      .catch(() => undefined)

    return {
      id,
      delegatorUserId: input.delegatorUserId,
      delegateUserId: input.delegateUserId,
      permissions,
      maxAmount: input.maxAmount,
      currency: input.currency,
      validFrom: input.validFrom,
      validUntil: input.validUntil,
      status: 'active',
      createdAt,
    }
  }

  revokeDelegation(orgTenantId: string, delegationId: string, revokedBy: string): void {
    this.assertOrgAdmin(revokedBy, orgTenantId)

    const db = DatabaseManager.getDatabase()
    const org = this.ensurePlatformOrganizationRecord(orgTenantId, getTenantById(orgTenantId)?.label)
    db.prepare(`UPDATE delegations SET status = 'revoked' WHERE id = ? AND organization_id = ?`).run(
      delegationId,
      org.id,
    )
    void import('./OrgMembershipCredentialService')
      .then(({ orgMembershipCredentialService }) => {
        orgMembershipCredentialService.resolveDelegationOffers(delegationId, 'revoked: delegation withdrawn')
      })
      .catch(() => undefined)
  }

  /**
   * Someone already in the app, whether or not they are on this team.
   * Used when an outside contact is sent a job: they are not added to the team.
   */
  lookupUserByPhone(orgTenantId: string, phone: string): { userId?: string; inTeam: boolean; role?: string } {
    const db = DatabaseManager.getDatabase()
    const phoneHash = this.hashData(this.normalizePhone(phone))
    const user = db.prepare('SELECT id FROM ssi_users WHERE phone_hash = ?').get(phoneHash) as
      | { id: string }
      | undefined
    if (!user?.id) return { inTeam: false }
    const membership = db
      .prepare(`SELECT role FROM org_memberships WHERE user_id = ? AND org_tenant_id = ? AND status = 'active'`)
      .get(user.id, orgTenantId) as { role: string } | undefined
    return { userId: user.id, inTeam: Boolean(membership), role: membership?.role }
  }

  async inviteMemberByPhone(
    orgTenantId: string,
    phone: string,
    role: string,
    invitedBy: string,
  ): Promise<{ membershipId: string; targetUserId: string; role: string; accountCreated: boolean; alerted: boolean }> {
    const normalizedPhone = this.normalizePhone(phone)
    const knownName = this.contactNameForPhone(orgTenantId, normalizedPhone)
    const holder = await container
      .resolve(SSIAuthService)
      .provisionInvitedHolder(normalizedPhone, knownName || 'Team member')
    const membershipRole = OrganizationService.normalizeMembershipRole(role)
    const result = await this.inviteMember(orgTenantId, holder.userId, membershipRole, invitedBy)
    this.rememberMemberPhone(orgTenantId, holder.userId, normalizedPhone)
    const alerted =
      result.alreadyMember && !holder.created
        ? false
        : await this.alertInvitedMember(orgTenantId, normalizedPhone, membershipRole, holder.created)
    return { ...result, targetUserId: holder.userId, role: membershipRole, accountCreated: holder.created, alerted }
  }

  /** Use a name the organisation already saved for this phone, when there is one. */
  private contactNameForPhone(orgTenantId: string, phone: string): string | undefined {
    const db = DatabaseManager.getDatabase()
    const rows = db
      .prepare('SELECT name, phone FROM org_contacts WHERE org_tenant_id = ? AND phone IS NOT NULL')
      .all(orgTenantId) as { name: string; phone: string }[]
    const hit = rows.find((row) => this.normalizePhone(row.phone) === phone)
    const name = hit?.name?.trim()
    if (!name || /^(organization owner|team member)$/i.test(name)) return undefined
    return name
  }

  /** Keep the phone on the team contact so the list can tell they have an account. */
  private rememberMemberPhone(orgTenantId: string, userId: string, phone: string): void {
    const existing = getContactById(`${orgTenantId}:member:${userId}`, orgTenantId)
    if (!existing) return
    upsertContact({
      id: existing.id,
      orgTenantId,
      contactScope: 'internal',
      name: existing.name,
      phone,
      email: existing.email,
      did: existing.did,
      notes: existing.notes,
      walletTenantId: existing.walletTenantId,
      linkedAt: existing.linkedAt,
    })
  }

  /** Tell the person they were added. Their PIN is still theirs to choose. */
  private async alertInvitedMember(
    orgTenantId: string,
    phone: string,
    role: string,
    accountCreated: boolean,
  ): Promise<boolean> {
    const orgName = getTenantById(orgTenantId)?.label || 'the organisation'
    const roleWords = role.replace(/_/g, ' ')
    const message = accountCreated
      ? `You have been added to ${orgName} as ${roleWords}. Open the app and sign in with this phone number. The first PIN you choose is yours. Your staff card will be waiting.`
      : `You have been added to ${orgName} as ${roleWords}. Open the app to accept your staff card.`
    // WhatsApp is queued from the staff inbox card, with the recipient's recorded opt-in.
    const sms = await notificationService.sendSms(phone, message)
    return sms.success
  }

  /**
   * Invite a user to an organization by their ssi_users.id.
   */
  /**
   * Membership roles carry the member's function (field_worker, approver, finance_manager, ...),
   * because workflow stage actors are matched by that role. Only `owner` is never granted by invite.
   */
  static normalizeMembershipRole(role: unknown): string {
    const slug = String(role || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40)
    if (!slug || slug === 'owner') return 'member'
    return /^[a-z][a-z0-9_]*$/.test(slug) ? slug : 'member'
  }

  async inviteMember(
    orgTenantId: string,
    targetUserId: string,
    role: string,
    invitedBy: string,
  ): Promise<{ membershipId: string; alreadyMember?: boolean }> {
    const db = DatabaseManager.getDatabase()
    role = OrganizationService.normalizeMembershipRole(role)

    // Check the inviter is owner/admin of this org
    const inviterMembership = db
      .prepare('SELECT role FROM org_memberships WHERE user_id = ? AND org_tenant_id = ? AND status = ?')
      .get(invitedBy, orgTenantId, 'active') as { role: string } | undefined

    if (!inviterMembership || (inviterMembership.role !== 'owner' && inviterMembership.role !== 'admin')) {
      throw new Error('Only org owners/admins can invite members')
    }

    // Check target isn't already a member
    const existing = db
      .prepare('SELECT id, role FROM org_memberships WHERE user_id = ? AND org_tenant_id = ?')
      .get(targetUserId, orgTenantId) as { id: string; role: string } | undefined

    if (existing) {
      return { membershipId: existing.id, alreadyMember: true }
    }

    const membershipId = crypto.randomUUID()
    const now = new Date().toISOString()
    db.prepare(
      `
      INSERT INTO org_memberships (id, user_id, org_tenant_id, role, invited_by, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
    `,
    ).run(membershipId, targetUserId, orgTenantId, role, invitedBy, now, now)

    logger.info({ membershipId, targetUserId, orgTenantId, role, invitedBy }, 'Member added to org')
    this.offerEmployeeCredential(orgTenantId, targetUserId, role, 'membership')
    // Team lists and job histories show the person's name from the start, not "Team member".
    await this.syncMemberContact(orgTenantId, targetUserId, role)

    return { membershipId }
  }

  /**
   * Keep the member's internal contact named after the person (from their own wallet card)
   * and linked to their current wallet. Best effort; never fails the caller.
   */
  private async syncMemberContact(orgTenantId: string, userId: string, role: string): Promise<void> {
    const db = DatabaseManager.getDatabase()
    const user = db.prepare('SELECT tenant_id, did FROM ssi_users WHERE id = ?').get(userId) as
      | { tenant_id?: string; did?: string }
      | undefined
    if (!user?.tenant_id) return
    try {
      const contactId = role === 'owner' ? `${orgTenantId}:owner:${userId}` : `${orgTenantId}:member:${userId}`
      // Older builds stored every member under an owner id. A field worker is not the owner.
      if (role !== 'owner') deleteContact(`${orgTenantId}:owner:${userId}`, orgTenantId)
      const existing = getContactById(contactId, orgTenantId)
      const name = this.memberContactName(
        role,
        await this.resolveIdentityDisplayNameAsync(user.tenant_id),
        existing?.name,
      )
      const roleWords = role.replace(/_/g, ' ')
      upsertContact({
        id: contactId,
        orgTenantId,
        contactScope: 'internal',
        name,
        phone: existing?.phone,
        email: existing?.email,
        did: user.did || existing?.did,
        walletTenantId: user.tenant_id,
        linkedAt: new Date().toISOString(),
        notes: existing?.notes || (role === 'owner' ? 'Runs the organisation' : `On the team as ${roleWords}`),
      })
    } catch (err: any) {
      logger.warn({ error: err.message, orgTenantId, userId }, 'syncMemberContact: failed (non-critical)')
    }
  }

  /**
   * Remove a member from an organization.
   */
  removeMember(orgTenantId: string, targetUserId: string, removedBy: string): void {
    const db = DatabaseManager.getDatabase()

    // Check the remover is owner/admin
    const removerMembership = db
      .prepare('SELECT role FROM org_memberships WHERE user_id = ? AND org_tenant_id = ? AND status = ?')
      .get(removedBy, orgTenantId, 'active') as { role: string } | undefined

    if (!removerMembership || (removerMembership.role !== 'owner' && removerMembership.role !== 'admin')) {
      throw new Error('Only org owners/admins can remove members')
    }

    // Cannot remove the owner
    const target = db
      .prepare('SELECT role FROM org_memberships WHERE user_id = ? AND org_tenant_id = ?')
      .get(targetUserId, orgTenantId) as { role: string } | undefined

    if (target?.role === 'owner' && removedBy !== targetUserId) {
      throw new Error('Cannot remove the org owner')
    }

    db.prepare('UPDATE org_memberships SET status = ?, updated_at = ? WHERE user_id = ? AND org_tenant_id = ?').run(
      'suspended',
      new Date().toISOString(),
      targetUserId,
      orgTenantId,
    )
    this.withdrawEmployeeCredentials(orgTenantId, targetUserId)

    logger.info({ targetUserId, orgTenantId, removedBy }, 'Member removed from org')
  }

  /**
   * Change a member's function (manager, finance officer, director, …).
   * The owner role is fixed. Owner/admin only.
   */
  updateMemberRole(
    orgTenantId: string,
    targetUserId: string,
    role: string,
    updatedBy: string,
  ): { userId: string; role: string } {
    this.assertOrgAdmin(updatedBy, orgTenantId)
    const membershipRole = OrganizationService.normalizeMembershipRole(role)
    const db = DatabaseManager.getDatabase()
    const target = db
      .prepare('SELECT role FROM org_memberships WHERE user_id = ? AND org_tenant_id = ? AND status = ?')
      .get(targetUserId, orgTenantId, 'active') as { role: string } | undefined
    if (!target) {
      throw new Error('Member not found')
    }
    if (target.role === 'owner') {
      throw new Error('Cannot change the owner role')
    }
    db.prepare('UPDATE org_memberships SET role = ?, updated_at = ? WHERE user_id = ? AND org_tenant_id = ?').run(
      membershipRole,
      new Date().toISOString(),
      targetUserId,
      orgTenantId,
    )
    if (target.role !== membershipRole) {
      // A new staff card says the new role. What happens to the card they already hold follows
      // the organisation's staff-card rule (OrgMembershipCredentialService.ensureEmployeeCredential).
      this.offerEmployeeCredential(orgTenantId, targetUserId, membershipRole, 'membership', {
        reason: 'role_changed',
        previousRole: target.role,
      })
    }
    return { userId: targetUserId, role: membershipRole }
  }

  getOrganizationWorkflowConfiguration(userId: string, orgTenantId: string): OrgWorkflowConfiguration {
    const role = this.getUserOrgRole(userId, orgTenantId)
    if (!role) {
      throw new Error('Not a member of this organization')
    }

    const profile = orgSetupProfileService.get(orgTenantId)
    const allowsType = (type: string) => {
      const module = orgSetupProfileService.moduleForOperation(type)
      return (
        profile.access.mode === 'legacy' ||
        !module ||
        profile.access.modules.some((item) => item.id === module && item.available)
      )
    }
    const stored = workflowTemplateRepository
      .listByTenantId(orgTenantId)
      .filter((template) => allowsType(template.workflowType))
    const covered = new Set(
      stored.flatMap((template) => getWorkflowTypeCandidates(String(template.workflowType || ''))),
    )
    const fromAnswers = orgSetupProfileService
      .get(orgTenantId)
      .requestTypes.filter(
        (workflowType) => !getWorkflowTypeCandidates(workflowType).some((candidate) => covered.has(candidate)),
      )
      .map((workflowType) => templateOfferedByAnswers(orgTenantId, workflowType))
    const templates = [...stored, ...fromAnswers]
    const firstTemplate = templates.find((template) => template.sector && template.sector !== 'custom') ?? templates[0]
    const evaluation = workflowReadinessService.evaluateOrganization(orgTenantId)

    return {
      orgTenantId,
      access: profile.access,
      sector: firstTemplate?.sector,
      templates,
      workflowTypes: Array.from(
        new Set(
          evaluation.templates.filter((report) => allowsType(report.workflowType)).map((report) => report.workflowType),
        ),
      ),
      workflows: evaluation.templates
        .filter((report) => allowsType(report.workflowType))
        .map((report) => ({
          templateId: report.templateId,
          workflowType: report.workflowType,
          name: report.templateName,
          ready: report.ready,
          blocking: report.blocking.map((item) => item.key),
        })),
    }
  }

  /**
   * Save which records a workflow in use should issue. Writes only the offer
   * modes and the optional-records switch. Running jobs keep the steps they
   * already started; the next time a record would be issued, the new setting applies.
   */
  saveRecordSettings(
    userId: string,
    orgTenantId: string,
    input: { workflowType?: string; vcOfferModes?: Record<string, string>; sendOptionalOffers?: boolean },
  ): OrgWorkflowConfiguration {
    this.assertOrgAdmin(userId, orgTenantId)
    const workflowType = String(input.workflowType || '').trim()
    if (!workflowType) throw new Error('Choose a workflow')

    const configuration = this.getOrganizationWorkflowConfiguration(userId, orgTenantId)
    const inUse = new Set(
      configuration.workflowTypes.flatMap((type) => getWorkflowTypeCandidates(type).map((item) => item.toLowerCase())),
    )
    if (!getWorkflowTypeCandidates(workflowType).some((candidate) => inUse.has(candidate.toLowerCase()))) {
      throw new Error('That workflow is not in use')
    }

    const wanted = new Set(getWorkflowTypeCandidates(workflowType).map((item) => item.toLowerCase()))
    const template = configuration.templates.find(
      (item) => item.tenantId === orgTenantId && wanted.has(String(item.workflowType || '').toLowerCase()),
    )
    if (!template) throw new Error('No saved copy of that workflow')

    const settings = sanitizeRecordSettings(issuedRecordTypes(template.steps), input)
    workflowTemplateRepository.save({
      ...template,
      credentialPolicy: {
        ...template.credentialPolicy,
        vcOfferModes: settings.vcOfferModes,
        sendOptionalOffers: settings.sendOptionalOffers,
      },
    })
    return this.getOrganizationWorkflowConfiguration(userId, orgTenantId)
  }

  /**
   * Resolved stage actors for every configured workflow.
   *
   * Inbox and finance detail timelines use this so the current stage shows who
   * is expected to act (configured person, configured role, role match, or
   * owner fallback) instead of a generic status badge.
   */
  listWorkflowActors(userId: string, orgTenantId: string): WorkflowActorsView {
    const configuration = this.getOrganizationWorkflowConfiguration(userId, orgTenantId)
    const callerRole = this.getUserOrgRole(userId, orgTenantId)
    const policy = orgWorkflowActorService.getPolicy(orgTenantId)
    const savedDefaults = orgWorkflowActorService.listDefaults(orgTenantId)

    const workflows = configuration.workflows.map((workflow) => {
      const template = configuration.templates.find(
        (item) => item.id === workflow.templateId || item.workflowType === workflow.workflowType,
      )
      const prerequisites = getDeclaredPrerequisites(
        template || { id: workflow.templateId || workflow.workflowType, workflowType: workflow.workflowType },
        [workflow.workflowType, workflow.templateId || ''],
      )
      const typeCandidates = new Set(getWorkflowTypeCandidates(workflow.workflowType).map((type) => type.toLowerCase()))
      const stages: WorkflowStageActorView[] = prerequisites
        .filter((item) => item.key === 'stage_actor' && item.stageAction)
        .map((item) => {
          const stageAction = String(item.stageAction).toLowerCase()
          const actor = resolveBestStageActor(orgTenantId, workflow.workflowType, stageAction)
          const saved = savedDefaults.find(
            (row) =>
              row.stageAction === stageAction && typeCandidates.has(row.workflowType.toLowerCase()) && row.enabled,
          )
          const needsAssignment = OrgWorkflowActorService.needsAssignment(actor)
          const moneyStep = OrgWorkflowActorService.isMoneyStage(stageAction)
          // A role with no person on a borrowed money step is not "only for this request".
          const unnamedRole =
            Boolean(saved?.enabled && saved.defaultRole && !saved.defaultUserId && !saved.defaultWalletTenantId) &&
            OrgWorkflowActorService.borrowedMoneyStep(workflow.workflowType, stageAction)
          return {
            stageAction,
            title: item.title,
            requirement: item.requirement,
            actor,
            actorDescription: describeActorMode(actor.mode),
            needsAssignment,
            moneyStep,
            askedOnFirstUse: !moneyStep && actor.mode === 'owner_fallback',
            default: unnamedRole ? undefined : saved,
            builtInRoles: roleFallbackFor(workflow.workflowType, stageAction),
            stageChain: policy.stageChains[stageAction] || [],
            credential: this.describeStageActorCredential(orgTenantId, workflow.workflowType, actor, needsAssignment),
          }
        })

      return {
        templateId: workflow.templateId,
        workflowType: workflow.workflowType,
        name: workflow.name,
        stages,
      }
    })

    return {
      orgTenantId,
      workflows,
      members: orgWorkflowActorService.listOrgMembers(orgTenantId),
      roles: orgWorkflowActorService.listRoleOptions(orgTenantId),
      policy,
      presets: ACTOR_PRESETS.map((preset) => ({
        id: preset.id,
        title: preset.title,
        detail: preset.detail,
        signMode: preset.signMode,
      })),
      canEdit: callerRole === 'owner' || callerRole === 'admin',
    }
  }

  private describeStageActorCredential(
    orgTenantId: string,
    workflowType: string,
    actor: ResolvedOrgWorkflowActor,
    needsAssignment: boolean,
  ): StageActorCredentialView {
    if (needsAssignment || !actor.userId || !actor.walletTenantId) {
      return { state: 'not_applicable' }
    }
    const covered = orgWorkflowActorCredentialService.coveredStageActions(orgTenantId, workflowType, actor.userId)
    const fingerprint = actorCredentialFingerprint({
      orgTenantId,
      userId: actor.userId,
      workflowType,
      stageActions: covered,
      role: String(actor.role || 'member'),
    })
    const status = orgWorkflowActorCredentialService.getStatus(
      orgTenantId,
      workflowType,
      actor.walletTenantId,
      fingerprint,
    )
    return {
      state: status.state,
      offeredAt: status.offeredAt,
      acceptedAt: status.acceptedAt,
      stageActions: status.stageActions,
      stale: status.stale,
    }
  }

  /**
   * Offer (or re-offer) the OrgWorkflowActorCredential to every resolved stage actor so their
   * wallets can present it for stage actions. Owner/admin only.
   */
  async offerWorkflowActorCredentials(
    userId: string,
    orgTenantId: string,
    input: OfferWorkflowActorCredentialsInput = {},
  ): Promise<OfferWorkflowActorCredentialsResult> {
    this.assertCanConfigureActors(userId, orgTenantId)
    const sweep = await orgWorkflowActorCredentialService.ensureForOrganization(orgTenantId, {
      workflowType: input.workflowType,
      force: input.force,
      reason: 'manual',
    })
    const pick = (row: {
      workflowType: string
      stageActions: string[]
      userId?: string
      role?: string
      reason?: string
      outcome: string
    }) => ({
      workflowType: row.workflowType,
      stageActions: row.stageActions,
      userId: row.userId,
      role: row.role,
      reason: row.reason,
      outcome: row.outcome,
    })
    return {
      offered: sweep.offered.map(pick),
      alreadyCovered: sweep.alreadyCovered.map(pick),
      skipped: sweep.skipped.map(pick),
      failed: sweep.failed.map(pick),
    }
  }

  private assertCanConfigureActors(userId: string, orgTenantId: string): void {
    const role = this.getUserOrgRole(userId, orgTenantId)
    if (!role) {
      throw new Error('Not a member of this organization')
    }
    if (role !== 'owner' && role !== 'admin') {
      throw new Error('Only org owners/admins can configure workflow actors')
    }
  }

  /**
   * Save (or clear with `enabled: false`) who acts at one workflow stage.
   * A person must be an active member; a role must be a known role key.
   */
  saveWorkflowActorDefault(
    userId: string,
    orgTenantId: string,
    input: WorkflowActorDefaultInput,
  ): { saved?: WorkflowActorDefaultRecord; cleared: boolean; actor: ResolvedOrgWorkflowActor } {
    this.assertCanConfigureActors(userId, orgTenantId)
    const workflowType = String(input.workflowType || '').trim()
    const stageAction = String(input.stageAction || '').trim()
    if (!workflowType || !stageAction) {
      throw new Error('workflowType and stageAction are required')
    }

    if (input.enabled === false) {
      const cleared = orgWorkflowActorService.deleteDefault(orgTenantId, workflowType, stageAction)
      return {
        cleared,
        actor: orgWorkflowActorService.resolveActor({ orgTenantId, workflowType, stageAction }),
      }
    }

    let defaultRole = input.defaultRole ? String(input.defaultRole).trim().toLowerCase() : undefined
    const defaultUserId = input.defaultUserId ? String(input.defaultUserId).trim() : undefined
    const defaultWalletTenantId = input.defaultWalletTenantId ? String(input.defaultWalletTenantId).trim() : undefined

    if (!defaultUserId && !defaultRole && !defaultWalletTenantId) {
      throw new Error('Choose a person, a role or a wallet for this stage')
    }
    // Job payment and the other borrowed money steps follow who releases the money.
    // A role with no person is not an override; If nobody is chosen is the backup.
    if (
      !defaultUserId &&
      !defaultWalletTenantId &&
      OrgWorkflowActorService.borrowedMoneyStep(workflowType, stageAction)
    ) {
      throw new Error('Choose a person for this step, or leave it to use who releases the money')
    }
    if (defaultUserId) {
      const member = orgWorkflowActorService.listOrgMembers(orgTenantId).find((row) => row.userId === defaultUserId)
      if (!member) {
        throw new Error('Selected person is not an active member of this organization')
      }
      defaultRole = defaultRole || member.role.toLowerCase()
    }

    const saved = orgWorkflowActorService.upsertDefault({
      orgTenantId,
      workflowType,
      stageAction,
      defaultUserId,
      defaultRole,
      defaultWalletTenantId,
      enabled: true,
    })
    const actor = orgWorkflowActorService.resolveActor({ orgTenantId, workflowType, stageAction })
    // One staff card lists every step this person confirms. Refresh it (non-blocking).
    orgWorkflowActorCredentialService.ensureActorCredentialInBackground({
      orgTenantId,
      workflowType,
      stageAction,
      actor,
      reason: 'stage_assignment',
    })
    return { saved, cleared: false, actor }
  }

  getWorkflowActorPolicy(userId: string, orgTenantId: string): OrgWorkflowActorPolicy {
    const role = this.getUserOrgRole(userId, orgTenantId)
    if (!role) {
      throw new Error('Not a member of this organization')
    }
    return orgWorkflowActorService.getPolicy(orgTenantId)
  }

  saveWorkflowActorPolicy(
    userId: string,
    orgTenantId: string,
    patch: OrgWorkflowActorPolicyPatch,
  ): OrgWorkflowActorPolicy {
    this.assertCanConfigureActors(userId, orgTenantId)
    const saved = orgWorkflowActorService.savePolicy(orgTenantId, patch)
    // Chains may now resolve new people for stages: offer them their actor credentials.
    orgWorkflowActorCredentialService.ensureForOrganizationInBackground(orgTenantId, { reason: 'policy_change' })
    return saved
  }

  /**
   * Apply a ready-made purchase-request setup (who confirms, and whether one
   * confirmation or two separate confirmations are required).
   */
  applyWorkflowActorPreset(userId: string, orgTenantId: string, presetId: string): WorkflowActorsView {
    this.assertCanConfigureActors(userId, orgTenantId)
    orgWorkflowActorService.applyPreset(orgTenantId, presetId)
    orgWorkflowActorCredentialService.ensureForOrganizationInBackground(orgTenantId, { reason: 'preset' })
    return this.listWorkflowActors(userId, orgTenantId)
  }

  /**
   * Setup helper: give every stage that would otherwise fall to the owner (or nobody) an
   * explicit default — a member or a role. Used by "Assign all unassigned stages to me".
   */
  assignUnassignedStages(
    userId: string,
    orgTenantId: string,
    input: AssignUnassignedStagesInput,
  ): AssignUnassignedStagesResult {
    this.assertCanConfigureActors(userId, orgTenantId)
    const targetUserId = input.userId ? String(input.userId).trim() : undefined
    const targetRole = input.role ? String(input.role).trim().toLowerCase() : undefined
    if (!targetUserId && !targetRole) {
      throw new Error('Provide a userId or a role to assign')
    }
    if (targetUserId) {
      const member = orgWorkflowActorService.listOrgMembers(orgTenantId).find((row) => row.userId === targetUserId)
      if (!member) {
        throw new Error('Selected person is not an active member of this organization')
      }
    }

    const view = this.listWorkflowActors(userId, orgTenantId)
    const onlyTypes = input.workflowType
      ? new Set(getWorkflowTypeCandidates(input.workflowType).map((type) => type.toLowerCase()))
      : undefined

    const result: AssignUnassignedStagesResult = { assigned: [], skipped: [] }
    for (const workflow of view.workflows) {
      if (onlyTypes && !onlyTypes.has(workflow.workflowType.toLowerCase())) continue
      for (const stage of workflow.stages) {
        if (!stage.needsAssignment) {
          result.skipped.push({
            workflowType: workflow.workflowType,
            stageAction: stage.stageAction,
            reason: stage.actorDescription,
          })
          continue
        }
        orgWorkflowActorService.upsertDefault({
          orgTenantId,
          workflowType: workflow.workflowType,
          stageAction: stage.stageAction,
          defaultUserId: targetUserId,
          defaultRole: targetRole,
          enabled: true,
        })
        result.assigned.push({ workflowType: workflow.workflowType, stageAction: stage.stageAction })
      }
    }
    if (result.assigned.length > 0) {
      orgWorkflowActorCredentialService.ensureForOrganizationInBackground(orgTenantId, { reason: 'bulk_assignment' })
    }
    return result
  }

  getOrganizationSetupReadiness(userId: string, orgTenantId: string): OrganizationSetupReadiness {
    const role = this.getUserOrgRole(userId, orgTenantId)
    if (!role) {
      throw new Error('Not a member of this organization')
    }

    const tenant = getTenantById(orgTenantId)
    const org = this.ensurePlatformOrganizationRecord(orgTenantId, tenant?.label)

    // Readiness is derived from the prerequisites each configured workflow template
    // declares (services/workflow/prerequisites.ts), not from `enabled` flags or
    // sector regexes. Workflows become operational when these items are ready.
    const evaluation = workflowReadinessService.evaluateOrganization(orgTenantId)

    const items: OrganizationSetupReadinessItem[] = evaluation.items.map((item) => ({
      key: item.key,
      title: item.title,
      domain: item.domain,
      requirement: item.requirement,
      status: item.status,
      reason: item.reason,
      requiredFor: item.requiredFor,
      stageAction: item.stageAction,
      actionPath: item.actionPath,
      askedOnFirstUse: item.askedOnFirstUse,
    }))

    // Operations domain: summarise workflow readiness so the dashboard still shows
    // "which workflows are operational" without an activation flag.
    const workflows: OrganizationWorkflowReadinessSummary[] = evaluation.templates.map((report) => ({
      templateId: report.templateId,
      workflowType: report.workflowType,
      name: report.templateName,
      ready: report.ready,
      blocking: report.blocking.map((item) => item.key),
    }))

    if (!orgSetupProfileService.get(orgTenantId).answeredAt) {
      items.push({
        key: 'workflow_configuration',
        title: 'What your organization does',
        domain: 'operations',
        requirement: 'conditional',
        status: 'needs_attention',
        reason: 'Three short questions. Purchase requests, supplier bills and customer payments work already.',
        actionPath: '/organization/onboarding',
      })
    }
    if (workflows.length > 0) {
      const operational = workflows.filter((workflow) => workflow.ready).length
      items.push({
        key: 'request_types_ready',
        title: 'Kinds of requests ready',
        domain: 'operations',
        requirement: 'conditional',
        status: operational === workflows.length ? 'ready' : 'needs_attention',
        reason:
          operational === workflows.length
            ? undefined
            : `${workflows.length - operational} kind${workflows.length - operational === 1 ? '' : 's'} of request still need${workflows.length - operational === 1 ? 's' : ''} something`,
        requiredFor: workflows.filter((workflow) => !workflow.ready).map((workflow) => workflow.workflowType),
      })
    }

    const assessable = items.filter((item) => item.status !== 'optional')
    const readyAssessable = assessable.filter((item) => item.status === 'ready')
    const readinessPercent =
      assessable.length === 0 ? 100 : Math.round((readyAssessable.length / assessable.length) * 100)

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
      workflows,
    }
  }

  /**
   * The next things visible in the organisation Inbox, never the member's personal wallet.
   * Setup blockers are added only for an owner or admin. At most five.
   */
  nextStepsFor(userId: string, orgTenantId: string): NextStepsResult {
    const role = this.getUserOrgRole(userId, orgTenantId)
    if (!role) {
      throw new Error('Not a member of this organization')
    }

    const db = DatabaseManager.getDatabase()
    const inbox: NextStepItem[] = []

    if (canSeeSetupSteps(role)) {
      const offers = db
        .prepare(
          `SELECT id, title, body
               FROM wallet_pending_offers
              WHERE resolved_at IS NULL
                AND accepted_at IS NULL
                AND tenant_id = ?
                AND COALESCE(source_type, '') NOT IN (
                  'workflow_assignment', 'workflow_request_assignment', 'ap_workflow_assignment',
                  'requisition_stage_action', 'workflow_stage_action'
                )
              ORDER BY created_at ASC
              LIMIT 8`,
        )
        .all(orgTenantId) as Array<{ id: string; title?: string; body?: string }>
      for (const offer of offers) {
        const title = String(offer.title || '').trim()
        if (!title) continue
        inbox.push({
          id: offer.id,
          kind: 'inbox',
          title,
          detail: String(offer.body || '').trim() || 'Open your inbox to do this.',
          href: 'inbox',
          inboxItemId: offer.id,
        })
      }
    }

    if (canSeeUnassignedInbound(role)) {
      const requests = workflowRequestRepository.listInbound(orgTenantId, { status: 'pending', limit: 50 })
        .filter(isWorkflowRequestActionable)
      for (const request of requests) {
        const title = String(request.payload?.title || request.payload?.description || request.payload?.summary || '').trim()
        inbox.push({
          id: request.id,
          kind: 'inbox',
          title: title || 'A request is waiting',
          detail: 'Open your inbox to do this.',
          href: 'inbox',
          requestId: request.id,
        })
      }
    }

    const platformRequests = platformRequestService.list(orgTenantId, userId, undefined, undefined, 100)
    for (const request of platformRequests.items.filter(isPlatformRequestWaiting)) {
      inbox.push({
        id: `platform:${request.id}`,
        kind: 'inbox',
        title: request.title || 'A request is waiting',
        detail: request.description || 'Open your inbox to review this request.',
        href: 'inbox',
        requestId: request.id,
      })
    }

    const setup: NextStepItem[] = []
    if (canSeeSetupSteps(role)) {
      const readiness = this.getOrganizationSetupReadiness(userId, orgTenantId)
      for (const item of readiness.items) {
        if (item.status !== 'needs_attention') continue
        setup.push({
          id: item.key,
          kind: 'setup',
          title: item.title,
          detail: item.reason || 'Open setup to finish this.',
          href: 'setup',
        })
      }
    }

    return { items: rankNextSteps({ inbox, setup, includeSetup: canSeeSetupSteps(role) }) }
  }

  /**
   * Prerequisite report for a single workflow template (Screen 4 in the onboarding
   * spec: "what does this workflow still need?").
   */
  getWorkflowPrerequisites(userId: string, orgTenantId: string, templateRef: string): TemplateReadinessReport {
    const role = this.getUserOrgRole(userId, orgTenantId)
    if (!role) {
      throw new Error('Not a member of this organization')
    }
    return workflowReadinessService.evaluateTemplate(orgTenantId, templateRef)
  }

  async configureOrganizationWorkflows(
    userId: string,
    orgTenantId: string,
    req: ActivateOrgWorkflowRequest,
  ): Promise<OrgWorkflowConfiguration> {
    this.assertOrgAdmin(userId, orgTenantId)

    const tenant = getTenantById(orgTenantId)
    if (!tenant) {
      throw new Error('Organization tenant not found')
    }

    // Org readiness replaces workflow activation:
    // - `workflowTypes` is the primary input (what the org intends to do).
    // - `additionalWorkflowTypes` and `sector` are accepted as deprecated aliases.
    // - Configuring a workflow provisions its template row so its prerequisites
    //   surface in readiness. It never disables sibling templates and `enabled`
    //   is not an operational gate.
    const requested = new Set<string>()
    for (const value of [...(req.workflowTypes ?? []), ...(req.additionalWorkflowTypes ?? [])]) {
      const normalized = String(value || '')
        .trim()
        .toLowerCase()
      if (normalized) requested.add(normalized)
    }
    if (req.sector && SECTOR_DEFAULT_WORKFLOW_TYPE[req.sector]) {
      requested.add(SECTOR_DEFAULT_WORKFLOW_TYPE[req.sector] as string)
    }

    const requestedWorkflowTypes = Array.from(requested)
    this.provisionAdditionalWorkflowTemplates(orgTenantId, requestedWorkflowTypes, req.sector)

    // Apply per-template policy overrides to the templates that were requested.
    if (requestedWorkflowTypes.length > 0) {
      const hasOverrides =
        req.paymentModes !== undefined ||
        req.reconciliationPolicy !== undefined ||
        req.evidencePolicy !== undefined ||
        req.brandingPolicy !== undefined ||
        req.initiation !== undefined ||
        (req.name !== undefined && requestedWorkflowTypes.length === 1)

      if (hasOverrides) {
        const orgTemplates = workflowTemplateRepository.listByTenantId(orgTenantId)
        for (const workflowType of requestedWorkflowTypes) {
          const candidates = getWorkflowTypeCandidates(workflowType)
          const template = orgTemplates.find((entry) =>
            candidates.includes(
              String(entry.workflowType || '')
                .trim()
                .toLowerCase(),
            ),
          )
          if (!template) continue

          workflowTemplateRepository.save({
            ...template,
            name: requestedWorkflowTypes.length === 1 && req.name ? req.name : template.name,
            enabled: true,
            paymentModes: req.paymentModes ?? template.paymentModes,
            reconciliationPolicy: {
              ...template.reconciliationPolicy,
              ...(req.reconciliationPolicy ?? {}),
            } as WorkflowTemplateDefinition['reconciliationPolicy'],
            evidencePolicy: { ...template.evidencePolicy, ...(req.evidencePolicy ?? {}) },
            brandingPolicy: { ...template.brandingPolicy, ...(req.brandingPolicy ?? {}) },
            initiation: req.initiation ?? template.initiation,
          })
        }
      }
    }

    const inferredWorkflowTypes = inferWorkflowTypesForOrg({
      sector: req.sector,
      paymentRails: mapPaymentModesToRails(req.paymentModes),
      category: undefined,
      additionalWorkflowTypes: requestedWorkflowTypes,
    })

    if (inferredWorkflowTypes.length > 0) {
      this.provisionAdditionalWorkflowTemplates(orgTenantId, inferredWorkflowTypes, req.sector)
    }

    await this.ensureDiscoveryProfile({
      orgTenantId,
      name: req.name || tenant?.label || 'Organization',
      issuerDid: tenant?.issuerDid,
      verifierDid: tenant?.verifierDid,
      domain: tenant?.domain,
      paymentRails: mapPaymentModesToRails(req.paymentModes),
      activatedWorkflowTypes: requestedWorkflowTypes,
    })

    return this.getOrganizationWorkflowConfiguration(userId, orgTenantId)
  }

  async activateOrganizationWorkflows(
    userId: string,
    orgTenantId: string,
    req: ActivateOrgWorkflowRequest,
  ): Promise<OrgWorkflowConfiguration> {
    return this.configureOrganizationWorkflows(userId, orgTenantId, req)
  }

  getSetupProfile(userId: string, orgTenantId: string): OrgSetupProfile {
    if (!this.getUserOrgRole(userId, orgTenantId)) {
      throw new Error('Not a member of this organization')
    }
    return orgSetupProfileService.get(orgTenantId)
  }

  /**
   * Save the setup answers. The request types they call for follow on the server;
   * the client never names a workflow.
   */
  async saveSetupProfile(userId: string, orgTenantId: string, input: OrgSetupProfileInput): Promise<OrgSetupProfile> {
    this.assertOrgAdmin(userId, orgTenantId)
    const profile = orgSetupProfileService.save(orgTenantId, input)
    // Answers only. Which requests exist is worked out from these answers and the
    // purchase-request money people. Nothing is written into the workflow catalog here.
    const tenant = getTenantById(orgTenantId)
    try {
      await this.ensureDiscoveryProfile({
        orgTenantId,
        name: tenant?.label || 'Organization',
        issuerDid: tenant?.issuerDid,
        verifierDid: tenant?.verifierDid,
        domain: tenant?.domain,
      })
    } catch (error: any) {
      logger.warn({ error: error.message, orgTenantId }, 'Could not refresh discovery profile after setup answers')
    }
    orgWorkflowActorCredentialService.ensureForOrganizationInBackground(orgTenantId, { reason: 'setup_profile' })
    try {
      const org = this.ensurePlatformOrganizationRecord(orgTenantId, getTenantById(orgTenantId)?.label)
      ensureStarterRoles(orgTenantId, org.id)
    } catch (error: any) {
      logger.warn({ error: error?.message, orgTenantId }, 'Could not fill starter roles after setup answers')
    }
    return profile
  }

  /**
   * Preview (`dryRun`) or apply the whole setup at once: answers, teams, roles, money people
   * and payments. Each part reuses the service that owns it; every part is safe to repeat.
   */
  async bootstrapOrganizationSetup(
    userId: string,
    orgTenantId: string,
    input: OrgSetupBootstrapRequest,
  ): Promise<OrgSetupBootstrapResult> {
    this.assertOrgAdmin(userId, orgTenantId)
    const org = this.ensurePlatformOrganizationRecord(orgTenantId, getTenantById(orgTenantId)?.label)
    return applyOrgSetupBootstrap(orgTenantId, org.id, input, {
      saveProfile: (answers) => this.saveSetupProfile(userId, orgTenantId, answers),
      afterMoneyPeopleChanged: () =>
        orgWorkflowActorCredentialService.ensureForOrganizationInBackground(orgTenantId, { reason: 'preset' }),
    })
  }

  private provisionAdditionalWorkflowTemplates(
    orgTenantId: string,
    requestedWorkflowTypes?: string[],
    fallbackSector?: SectorType,
  ): void {
    const workflowTypes = Array.from(
      new Set(
        (requestedWorkflowTypes ?? [])
          .map((value) =>
            String(value || '')
              .trim()
              .toLowerCase(),
          )
          .filter(Boolean),
      ),
    )

    if (workflowTypes.length === 0) {
      return
    }

    const db = DatabaseManager.getDatabase()
    const existingTemplates = workflowTemplateRepository.listByTenantId(orgTenantId)

    workflowTypes.forEach((workflowType, index) => {
      const workflowTypeCandidates = getWorkflowTypeCandidates(workflowType)
      const existingTemplate = existingTemplates.find((template) => {
        const templateType = String(template.workflowType || '')
          .trim()
          .toLowerCase()
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
            'Requested additional workflow has no global default template',
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
          'Provisioned workflow template from in-memory fallback',
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
        credentialPolicy: parseJsonColumn<WorkflowTemplateDefinition['credentialPolicy']>(
          defaultTemplate.credentialPolicy,
          {
            outputVCs: [],
            autoIssue: false,
          },
        ),
        reconciliationPolicy: parseJsonColumn<WorkflowTemplateDefinition['reconciliationPolicy']>(
          defaultTemplate.reconciliationPolicy,
          {
            mode: 'manual_close',
            events: [],
          },
        ),
        evidencePolicy: parseJsonColumn(defaultTemplate.evidencePolicy, {}),
        brandingPolicy: parseJsonColumn(defaultTemplate.brandingPolicy, {}),
        initiation: parseJsonColumn<WorkflowTemplateDefinition['initiation'] | undefined>(
          defaultTemplate.initiationSchema,
          undefined,
        ),
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
  /** Offer an EmployeeCredential into the member's wallet inbox. Non-blocking. */
  private offerEmployeeCredential(
    orgTenantId: string,
    userId: string,
    role: string,
    source: 'membership' | 'internal_contact' | 'onboarding',
    change?: { reason: string; previousRole?: string },
  ): void {
    void import('./OrgMembershipCredentialService')
      .then(({ orgMembershipCredentialService }) => {
        orgMembershipCredentialService.ensureEmployeeCredentialInBackground({
          orgTenantId,
          userId,
          role,
          source,
          reason: change?.reason,
          previousRole: change?.previousRole,
        })
      })
      .catch(() => undefined)
  }

  /** The person left: every staff card they hold from this organisation stops working. */
  private withdrawEmployeeCredentials(orgTenantId: string, userId: string): void {
    void import('./OrgMembershipCredentialService')
      .then(({ orgMembershipCredentialService }) => orgMembershipCredentialService.memberLeft(orgTenantId, userId))
      .catch(() => undefined)
  }

  private offerEmployeeCredentialForWallet(orgTenantId: string, walletTenantId: string, displayName?: string): void {
    void import('./OrgMembershipCredentialService')
      .then(({ orgMembershipCredentialService }) => {
        orgMembershipCredentialService.ensureEmployeeCredentialForWallet({ orgTenantId, walletTenantId, displayName })
      })
      .catch(() => undefined)
  }

  getUserOrgRole(userId: string, orgTenantId: string): string | null {
    const db = DatabaseManager.getDatabase()
    const row = db
      .prepare('SELECT role FROM org_memberships WHERE user_id = ? AND org_tenant_id = ? AND status = ?')
      .get(userId, orgTenantId, 'active') as { role: string } | undefined
    return row?.role ?? null
  }

  /**
   * Marks an org membership as the user's latest active org context.
   * Used by switch endpoint so other clients can hydrate the freshest org.
   */
  markOrgAsActive(userId: string, orgTenantId: string): void {
    const db = DatabaseManager.getDatabase()
    db.prepare('UPDATE org_memberships SET updated_at = ? WHERE user_id = ? AND org_tenant_id = ? AND status = ?').run(
      new Date().toISOString(),
      userId,
      orgTenantId,
      'active',
    )
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
    if (!roleMayOpenOrgContext(role)) {
      throw new StatusException(ORG_CONTEXT_ADMINS_ONLY_MESSAGE, 403, ORG_CONTEXT_ADMINS_ONLY)
    }

    try {
      await this.ensureOrgTenantRuntime(orgTenantId)
    } catch {
      throw new Error('Organization context is stale')
    }

    const db = DatabaseManager.getDatabase()
    const user = db.prepare('SELECT tenant_id, did FROM ssi_users WHERE id = ?').get(userId) as
      | { tenant_id?: string; did?: string }
      | undefined

    // Always keep the owner/member contact row in sync with their current wallet tenant.
    // This self-heals stale wallet_tenant_id caused by re-registration or wallet migration.
    if (user?.tenant_id) {
      try {
        const contactId = role === 'owner' ? `${orgTenantId}:owner:${userId}` : `${orgTenantId}:member:${userId}`
        if (role !== 'owner') deleteContact(`${orgTenantId}:owner:${userId}`, orgTenantId)
        const existing = getContactById(contactId, orgTenantId)
        const name = this.memberContactName(
          role,
          await this.resolveIdentityDisplayNameAsync(user.tenant_id),
          existing?.name,
        )
        const roleWords = role.replace(/_/g, ' ')
        upsertContact({
          id: contactId,
          orgTenantId,
          contactScope: 'internal',
          name,
          phone: existing?.phone,
          email: existing?.email,
          did: user.did || existing?.did,
          walletTenantId: user.tenant_id,
          linkedAt: new Date().toISOString(),
          notes: existing?.notes || (role === 'owner' ? 'Runs the organisation' : `On the team as ${roleWords}`),
        })
        this.offerEmployeeCredentialForWallet(orgTenantId, user.tenant_id, name)
      } catch (err: any) {
        logger.warn(
          { error: err.message, orgTenantId, userId },
          'generateOrgToken: failed to sync member contact (non-critical)',
        )
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

  /**
   * Opens the organisation for one task from the person's inbox. Owners and admins get the
   * organisation context as usual; every other member gets a short-lived task pass bound to the
   * item(s) they opened (see OrgContextPolicy), never the organisation's full context.
   */
  async generateTaskAccess(
    userId: string,
    orgTenantId: string,
    purpose: unknown,
    refs: unknown,
  ): Promise<{ token: string; orgRole: string; taskPass: boolean; purpose: OrgTaskPurpose; refs: string[]; expiresAt?: string }> {
    if (!isOrgTaskPurpose(purpose)) {
      throw new StatusException('Unknown task type.', 400)
    }
    const boundRefs = this.withLinkedTaskRefs(orgTenantId, normalizeTaskRefs(refs))
    if (boundRefs.length === 0) {
      throw new StatusException('Say which item this task is for.', 400)
    }
    const role = this.getUserOrgRole(userId, orgTenantId)
    if (!role) {
      throw new StatusException('You are not on this organisation’s team.', 403)
    }
    if (roleMayOpenOrgContext(role)) {
      const token = await this.generateOrgToken(userId, orgTenantId)
      return { token, orgRole: role, taskPass: false, purpose, refs: boundRefs }
    }

    try {
      await this.ensureOrgTenantRuntime(orgTenantId)
    } catch {
      throw new Error('Organization context is stale')
    }
    const user = DatabaseManager.getDatabase().prepare('SELECT did FROM ssi_users WHERE id = ?').get(userId) as
      | { did?: string }
      | undefined
    const token = await signToken(
      {
        id: userId,
        tenantId: orgTenantId,
        did: user?.did,
        role: 'RestTenantAgent',
        orgRole: role,
        ctx: ORG_TASK_CONTEXT,
        task: { purpose, refs: boundRefs },
      },
      { expiresIn: ORG_TASK_TTL_SECONDS },
    )
    const expiresAt = new Date(Date.now() + ORG_TASK_TTL_SECONDS * 1000).toISOString()
    return { token, orgRole: role, taskPass: true, purpose, refs: boundRefs, expiresAt }
  }

  /** An inbox card may carry only the workflow request; add the item it points at in this organisation. */
  private withLinkedTaskRefs(orgTenantId: string, refs: string[]): string[] {
    const linked = [...refs]
    const db = DatabaseManager.getDatabase()
    for (const ref of refs) {
      const row = db
        .prepare('SELECT payload FROM workflow_requests WHERE id = ? AND target_org_tenant_id = ?')
        .get(ref, orgTenantId) as { payload?: string } | undefined
      if (!row?.payload) continue
      try {
        const payload = JSON.parse(row.payload)
        for (const key of ['requisitionId', 'transactionId', 'platformRequestId', 'workflowRunId', 'runId']) {
          if (typeof payload?.[key] === 'string') linked.push(payload[key])
        }
      } catch {
        // A payload that does not parse links nothing.
      }
    }
    return normalizeTaskRefs(linked)
  }

  private getOrCreatePersonIdForUser(organizationId: string, userId: string): string {
    const db = DatabaseManager.getDatabase()

    const existing = db
      .prepare('SELECT id FROM people WHERE organization_id = ? AND subject_ref = ?')
      .get(organizationId, userId) as { id: string } | undefined

    if (existing?.id) return existing.id

    const personId = crypto.randomUUID()
    const now = new Date().toISOString()
    db.prepare(
      `
      INSERT INTO people (id, organization_id, subject_ref, status, created_at, updated_at)
      VALUES (?, ?, ?, 'active', ?, ?)
    `,
    ).run(personId, organizationId, userId, now, now)

    return personId
  }

  private normalizePhone(phone: string): string {
    const digits = phone.replace(/\D/g, '')
    if (digits.startsWith('0') && digits.length === 10) {
      return `263${digits.slice(1)}`
    }
    return digits
  }

  private hashData(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex')
  }
}

function safeJsonParse(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}
