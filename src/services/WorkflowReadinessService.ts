/* eslint-disable @typescript-eslint/explicit-member-accessibility */
/**
 * WorkflowReadinessService — the single resolver behind "org readiness replaces
 * workflow activation".
 *
 * Given an organization and a workflow template it answers:
 *   - which prerequisites the template declares,
 *   - which are satisfied by the organization's current configuration,
 *   - which are missing, and whether they block execution.
 *
 * The Setup Center readiness API, the execution gate in PlatformWorkflowService /
 * WorkflowRequestController and the `workflow.start` action all use this class so
 * there is exactly one definition of "operational".
 *
 * `workflow_templates.enabled` is NOT consulted here. It remains a soft UI flag.
 */

import type {
  WorkflowPrerequisite,
  WorkflowPrerequisiteRequirement,
  WorkflowTemplateDefinition,
} from '../types/WorkflowTemplate'

import { DatabaseManager } from '../persistence/DatabaseManager'
import { organizationRegistryRepository } from '../persistence/OrganizationRegistryRepository'
import { getTenantById } from '../persistence/TenantRepository'
import { WorkflowTemplateRepository } from '../persistence/WorkflowTemplateRepository'
import { rootLogger } from '../utils/pinoLogger'

import { orgSetupProfileService } from './OrgSetupProfileService'
import { OrgWorkflowActorService, orgWorkflowActorService } from './OrgWorkflowActorService'
import { getWorkflowTypeCandidates, normalizeWorkflowTypeAlias } from './workflow/initiation'
import {
  CORE_PREREQUISITES,
  RECOMMENDED_PREREQUISITES,
  getDeclaredPrerequisites,
  lookupRegistryPrerequisites,
  prerequisiteApplies,
  prerequisiteItemKey,
} from './workflow/prerequisites'
import { getTemplateById } from './workflow/templates'

const logger = rootLogger.child({ module: 'WorkflowReadinessService' })

export type WorkflowReadinessStatus = 'ready' | 'needs_attention' | 'pending_external' | 'optional'
export type WorkflowReadinessDomain = 'core' | 'people' | 'authority' | 'operations' | 'trust' | 'integrations'

export interface WorkflowReadinessItem {
  /** Stable key, e.g. `authorities` or `stage_actor:approve_requisition`. */
  key: string
  title: string
  domain: WorkflowReadinessDomain
  requirement: WorkflowPrerequisiteRequirement
  status: WorkflowReadinessStatus
  reason?: string
  /** Template ids / workflow types that declared this prerequisite. */
  requiredFor?: string[]
  /** Stage action for stage_actor items. */
  stageAction?: string
  /** Who can fix it. */
  configurableBy: 'owner_admin'
  /** Portal route hint for the "Configure" action. */
  actionPath?: string
  /** A non-money step nobody was chosen for yet. It is asked when the request is first used. */
  askedOnFirstUse?: boolean
}

export interface TemplateReadinessReport {
  orgTenantId: string
  templateId?: string
  workflowType: string
  templateName?: string
  /** True when no mandatory/conditional item is missing. */
  ready: boolean
  /** Items that block execution (mandatory or conditional and not ready). */
  blocking: WorkflowReadinessItem[]
  /** Everything evaluated for this template, including core and recommended items. */
  items: WorkflowReadinessItem[]
  /** True when the org has a persisted template row for this workflow. */
  configured: boolean
}

/**
 * Thrown by the execution gate when a workflow's prerequisites are not met.
 * Carries the missing items so callers can turn them into setup tasks.
 */
export class WorkflowPrerequisitesError extends Error {
  public readonly code = 'WORKFLOW_PREREQUISITES_MISSING'
  constructor(
    public readonly report: TemplateReadinessReport,
    message?: string,
  ) {
    super(
      message ||
        `Workflow ${report.workflowType} is not operational for organization ${report.orgTenantId}: ${report.blocking
          .map((item) => item.title)
          .join(', ')}`,
    )
    this.name = 'WorkflowPrerequisitesError'
  }
}

interface OrgFacts {
  organizationId: string
  orgName: string
  hasIssuerVerifier: boolean
  registryVerificationStatus?: string
  adminCount: number
  activeMemberCount: number
  peopleCount: number
  departmentCount: number
  roleCount: number
  authorityGrantCount: number
  delegationCount: number
  trustedIssuerCount: number
  pendingTrustAnchorCount: number
  verifierRegistrationCount: number
  paymentServiceCount: number
}

const DOMAIN_BY_KEY: Record<string, WorkflowReadinessDomain> = {
  organization_profile: 'core',
  primary_admin: 'core',
  active_members: 'people',
  people_records: 'people',
  departments: 'people',
  roles: 'authority',
  authorities: 'authority',
  delegations: 'authority',
  stage_actor: 'authority',
  ssi_identity: 'trust',
  trusted_issuers: 'trust',
  verifier_registration: 'trust',
  payment_provider: 'integrations',
}

const ACTION_PATH_BY_KEY: Record<string, string> = {
  primary_admin: '/organization/people',
  active_members: '/organization/people',
  people_records: '/organization/people',
  departments: '/organization/departments',
  roles: '/organization/roles',
  authorities: '/organization/authorities',
  delegations: '/organization/delegations',
  stage_actor: '/organization/actors',
  trusted_issuers: '/organization/trusted-partners',
  verifier_registration: '/trust',
  payment_provider: '/organization/integrations',
}

function normalize(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
}

export class WorkflowReadinessService {
  private readonly templates = new WorkflowTemplateRepository()

  // ---------------------------------------------------------------------------
  // Facts
  // ---------------------------------------------------------------------------

  private ensureOrganizationRecord(orgTenantId: string): { id: string; name: string } | undefined {
    const db = DatabaseManager.getDatabase()
    return db.prepare('SELECT id, name FROM organizations WHERE tenant_id = ? LIMIT 1').get(orgTenantId) as
      | { id: string; name: string }
      | undefined
  }

  public collectFacts(orgTenantId: string): OrgFacts {
    const db = DatabaseManager.getDatabase()
    const nowIso = new Date().toISOString()
    const tenant = getTenantById(orgTenantId)
    const org = this.ensureOrganizationRecord(orgTenantId)
    const organizationId = org?.id || ''
    const registry = organizationRegistryRepository.findOrganizationByTenantId(orgTenantId)

    const count = (sql: string, ...params: unknown[]): number => {
      try {
        const row = db.prepare(sql).get(...params) as { cnt?: number } | undefined
        return Number(row?.cnt ?? 0)
      } catch (error) {
        logger.debug({ error, sql }, 'Readiness fact query failed; treating as zero')
        return 0
      }
    }

    const membership = db
      .prepare(
        `SELECT
            SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as activeCount,
            SUM(CASE WHEN status = 'active' AND role IN ('owner', 'admin') THEN 1 ELSE 0 END) as adminCount
         FROM org_memberships
         WHERE org_tenant_id = ?`,
      )
      .get(orgTenantId) as { activeCount?: number; adminCount?: number } | undefined

    return {
      organizationId,
      orgName: org?.name || tenant?.label || 'Organization',
      hasIssuerVerifier: Boolean(tenant?.issuerDid && tenant?.verifierDid),
      registryVerificationStatus: registry?.verificationStatus,
      adminCount: Number(membership?.adminCount ?? 0),
      activeMemberCount: Number(membership?.activeCount ?? 0),
      peopleCount: count(
        `SELECT COUNT(*) as cnt FROM people WHERE organization_id = ? AND status = 'active'`,
        organizationId,
      ),
      departmentCount: count(
        `SELECT COUNT(*) as cnt FROM departments WHERE organization_id = ? AND status = 'active'`,
        organizationId,
      ),
      roleCount: count(`SELECT COUNT(*) as cnt FROM roles WHERE organization_id = ?`, organizationId),
      authorityGrantCount: count(
        `SELECT COUNT(*) as cnt FROM authority_grants
         WHERE organization_id = ? AND status = 'active'
           AND (valid_from IS NULL OR valid_from <= ?)
           AND (valid_until IS NULL OR valid_until >= ?)`,
        organizationId,
        nowIso,
        nowIso,
      ),
      delegationCount: count(
        `SELECT COUNT(*) as cnt FROM delegations
         WHERE organization_id = ? AND status = 'active'
           AND valid_from <= ? AND (valid_until IS NULL OR valid_until >= ?)`,
        organizationId,
        nowIso,
        nowIso,
      ),
      trustedIssuerCount: count(
        `SELECT COUNT(*) as cnt FROM trust_anchors WHERE organization_id = ? AND status = 'active'`,
        organizationId,
      ),
      pendingTrustAnchorCount: count(
        `SELECT COUNT(*) as cnt FROM trust_anchors WHERE organization_id = ? AND status = 'pending'`,
        organizationId,
      ),
      verifierRegistrationCount: count(
        `SELECT COUNT(*) as cnt FROM verifier_registrations WHERE organization_id = ? AND status = 'active'`,
        organizationId,
      ),
      paymentServiceCount: count(
        `SELECT COUNT(*) as cnt
         FROM service_catalog sc
         JOIN organization_registry o ON o.id = sc.org_id
         WHERE o.tenant_id = ? AND sc.service_type = 'payment' AND sc.is_active = 1`,
        orgTenantId,
      ) +
        count(
          `SELECT COUNT(*) as cnt
           FROM provider_configs pc
           JOIN service_providers sp ON sp.id = pc.provider_id
           WHERE pc.tenant_id = ? AND pc.status = 'active' AND sp.type = 'payment'`,
          orgTenantId,
        ),
    }
  }

  // ---------------------------------------------------------------------------
  // Template resolution
  // ---------------------------------------------------------------------------

  /**
   * Find the org's persisted template for a template id or workflow type (alias aware).
   * Falls back to the in-memory template definition when the org has not configured one yet.
   */
  public resolveTemplate(
    orgTenantId: string,
    templateRef: string,
  ): { definition: Partial<WorkflowTemplateDefinition>; configured: boolean; candidates: string[] } {
    const candidates = getWorkflowTypeCandidates(templateRef)
    const orgTemplates = this.templates.listByTenantId(orgTenantId)

    const byId = orgTemplates.find((template) => template.id === templateRef)
    if (byId) {
      return {
        definition: byId,
        configured: true,
        candidates: [...candidates, ...getWorkflowTypeCandidates(byId.workflowType)],
      }
    }

    const byType = orgTemplates.find((template) => candidates.includes(normalize(template.workflowType)))
    if (byType) {
      return { definition: byType, configured: true, candidates }
    }

    const canonical = normalizeWorkflowTypeAlias(templateRef)
    const inMemory = getTemplateById(canonical) || getTemplateById(templateRef)
    if (inMemory) {
      return {
        definition: {
          id: inMemory.id,
          workflowType: canonical,
          name: inMemory.name,
          paymentModes: [],
          evidencePolicy: {},
          prerequisites: inMemory.prerequisites,
        },
        configured: false,
        candidates,
      }
    }

    return {
      definition: { id: templateRef, workflowType: canonical || templateRef, paymentModes: [], evidencePolicy: {} },
      configured: false,
      candidates,
    }
  }

  // ---------------------------------------------------------------------------
  // Evaluation
  // ---------------------------------------------------------------------------

  private evaluatePrerequisite(
    prerequisite: WorkflowPrerequisite,
    facts: OrgFacts,
    orgTenantId: string,
    template: Partial<WorkflowTemplateDefinition>,
  ): WorkflowReadinessItem {
    const key = prerequisiteItemKey(prerequisite)
    const base: WorkflowReadinessItem = {
      key,
      title: prerequisite.title || key,
      domain: DOMAIN_BY_KEY[prerequisite.key] || 'operations',
      requirement: prerequisite.requirement,
      status: 'ready',
      stageAction: prerequisite.stageAction,
      configurableBy: 'owner_admin',
      actionPath: ACTION_PATH_BY_KEY[prerequisite.key],
    }

    const notReady = (reason: string, status: WorkflowReadinessStatus = 'needs_attention'): WorkflowReadinessItem => ({
      ...base,
      status: prerequisite.requirement === 'recommended' && status === 'needs_attention' ? 'optional' : status,
      reason,
    })

    switch (prerequisite.key) {
      case 'organization_profile':
        return facts.orgName ? base : notReady('Organization profile name is missing')
      case 'primary_admin':
        return facts.adminCount > 0 ? base : notReady('No active owner/admin membership found')
      case 'active_members':
        return facts.activeMemberCount > 0 ? base : notReady('Invite or activate at least one member')
      case 'people_records':
        return facts.peopleCount > 0
          ? base
          : notReady('Map member identities into people records for richer policy decisions')
      case 'departments':
        return facts.departmentCount > 0
          ? base
          : notReady('Create at least one active department for structured request routing')
      case 'roles':
        return facts.roleCount > 0
          ? base
          : notReady('Create starter roles (for example: Approver, Finance Manager, Employee)')
      case 'authorities':
        return facts.authorityGrantCount > 0 ? base : notReady('No active authority grants found for this workflow')
      case 'delegations':
        return facts.delegationCount > 0
          ? base
          : notReady('Delegations are optional but recommended for leave/backup approval scenarios')
      case 'ssi_identity':
        if (facts.hasIssuerVerifier) return base
        if (facts.registryVerificationStatus === 'pending') {
          return notReady('Organization identity is still being provisioned', 'pending_external')
        }
        return notReady('Organization identity has not been set up yet')
      case 'trusted_issuers':
        if (facts.trustedIssuerCount > 0) return base
        if (facts.pendingTrustAnchorCount > 0) {
          return notReady('Trust anchor registration is pending confirmation', 'pending_external')
        }
        return notReady('Add at least one trusted partner so the proofs this job relies on can be accepted')
      case 'verifier_registration':
        return facts.verifierRegistrationCount > 0
          ? base
          : notReady('Register this organization as a verifier before requesting presentations')
      case 'payment_provider':
        return facts.paymentServiceCount > 0
          ? base
          : notReady('Set up a payment service (practice mode works for now) before this workflow can take or release money')
      case 'stage_actor': {
        const stageAction = normalize(prerequisite.stageAction)
        if (!stageAction) return base
        const resolved = orgWorkflowActorService.resolveActor({
          orgTenantId,
          workflowType: String(template.workflowType || template.id || ''),
          stageAction,
        })
        if (!OrgWorkflowActorService.needsAssignment(resolved)) return base
        if (OrgWorkflowActorService.isMoneyStage(stageAction)) {
          return notReady(
            resolved.mode === 'unassigned'
              ? 'Nobody handles money yet. Choose who approves and releases money once; every request uses them.'
              : 'Choose who approves and releases money once; every request uses them. The owner stands in until then.',
          )
        }
        // Anyone who is not the money person is asked the first time that request is used.
        // That does not keep the request off the setup checklist.
        return {
          ...base,
          status: 'optional',
          askedOnFirstUse: true,
          reason: 'Asked the first time this is used.',
        }
      }
      default:
        return base
    }
  }

  /**
   * Evaluate a single template for an organization.
   */
  public evaluateTemplate(orgTenantId: string, templateRef: string): TemplateReadinessReport {
    const facts = this.collectFacts(orgTenantId)
    return this.evaluateTemplateWithFacts(orgTenantId, templateRef, facts)
  }

  public evaluateTemplateWithFacts(orgTenantId: string, templateRef: string, facts: OrgFacts): TemplateReadinessReport {
    const { definition, configured, candidates } = this.resolveTemplate(orgTenantId, templateRef)

    const declared = getDeclaredPrerequisites(
      {
        id: String(definition.id || templateRef),
        workflowType: String(definition.workflowType || templateRef),
        prerequisites: definition.prerequisites,
      },
      candidates,
    )

    const applicable = declared.filter((prerequisite) => prerequisiteApplies(prerequisite, definition))
    const merged = this.mergePrerequisites([...CORE_PREREQUISITES, ...applicable])

    const items = merged.map((prerequisite) => this.evaluatePrerequisite(prerequisite, facts, orgTenantId, definition))
    const blocking = items.filter(
      (item) =>
        (item.requirement === 'mandatory' || item.requirement === 'conditional') &&
        (item.status === 'needs_attention' || item.status === 'pending_external'),
    )

    return {
      orgTenantId,
      templateId: definition.id ? String(definition.id) : undefined,
      workflowType: String(definition.workflowType || normalizeWorkflowTypeAlias(templateRef) || templateRef),
      templateName: definition.name ? String(definition.name) : undefined,
      ready: blocking.length === 0,
      blocking,
      items,
      configured,
    }
  }

  /** Strongest requirement wins when the same key is declared more than once. */
  private mergePrerequisites(prerequisites: WorkflowPrerequisite[]): WorkflowPrerequisite[] {
    const rank: Record<WorkflowPrerequisiteRequirement, number> = { mandatory: 3, conditional: 2, recommended: 1 }
    const byKey = new Map<string, WorkflowPrerequisite>()
    for (const prerequisite of prerequisites) {
      const key = prerequisiteItemKey(prerequisite)
      const existing = byKey.get(key)
      if (!existing || rank[prerequisite.requirement] > rank[existing.requirement]) {
        byKey.set(key, prerequisite)
      }
    }
    return Array.from(byKey.values())
  }

  /**
   * Evaluate every template the organization has configured and return the union
   * of readiness items with `requiredFor` populated. Core and recommended items are
   * always included so a brand new org still sees its setup path.
   */
  public evaluateOrganization(orgTenantId: string): {
    facts: OrgFacts
    items: WorkflowReadinessItem[]
    templates: TemplateReadinessReport[]
  } {
    const facts = this.collectFacts(orgTenantId)
    const orgTemplates = this.templates.listByTenantId(orgTenantId)

    const reports = orgTemplates.map((template) => this.evaluateTemplateWithFacts(orgTenantId, template.id, facts))

    // Request types follow from the setup answers; a saved template row is not required.
    const covered = new Set(
      orgTemplates.flatMap((template) => getWorkflowTypeCandidates(String(template.workflowType || ''))),
    )
    for (const workflowType of orgSetupProfileService.get(orgTenantId).requestTypes) {
      if (getWorkflowTypeCandidates(workflowType).some((candidate) => covered.has(candidate))) continue
      reports.push(this.evaluateTemplateWithFacts(orgTenantId, workflowType, facts))
      getWorkflowTypeCandidates(workflowType).forEach((candidate) => covered.add(candidate))
    }

    const union = new Map<string, WorkflowReadinessItem>()
    const rank: Record<WorkflowPrerequisiteRequirement, number> = { mandatory: 3, conditional: 2, recommended: 1 }

    const absorb = (item: WorkflowReadinessItem, requiredFor?: string) => {
      const existing = union.get(item.key)
      if (!existing) {
        union.set(item.key, { ...item, requiredFor: requiredFor ? [requiredFor] : undefined })
        return
      }
      const stronger = rank[item.requirement] > rank[existing.requirement] ? item : existing
      const requiredForSet = new Set([...(existing.requiredFor || []), ...(requiredFor ? [requiredFor] : [])])
      union.set(item.key, {
        ...stronger,
        status: stronger === item ? item.status : existing.status,
        requiredFor: requiredForSet.size > 0 ? Array.from(requiredForSet) : undefined,
      })
    }

    // Core + recommended for every org.
    const baseline = [...CORE_PREREQUISITES, ...RECOMMENDED_PREREQUISITES]
    for (const prerequisite of baseline) {
      absorb(this.evaluatePrerequisite(prerequisite, facts, orgTenantId, {}))
    }

    for (const report of reports) {
      const label = report.workflowType || report.templateId || 'workflow'
      for (const item of report.items) {
        if (baseline.some((core) => prerequisiteItemKey(core) === item.key)) {
          // Core items are org-wide; still record which workflows depend on them for conditional ones.
          continue
        }
        absorb(item, label)
      }
    }

    return { facts, items: Array.from(union.values()), templates: reports }
  }

  // ---------------------------------------------------------------------------
  // Execution gate
  // ---------------------------------------------------------------------------

  /**
   * Throw WorkflowPrerequisitesError when the template is not operational for the org.
   * Returns the report when ready so callers can log / attach it.
   */
  public assertExecutable(orgTenantId: string, templateRef: string): TemplateReadinessReport {
    const report = this.evaluateTemplate(orgTenantId, templateRef)
    if (!report.ready) {
      throw new WorkflowPrerequisitesError(report)
    }
    return report
  }

  /** True when a registry or persisted declaration exists for this reference. */
  public hasDeclaration(templateRef: string): boolean {
    return Boolean(lookupRegistryPrerequisites(getWorkflowTypeCandidates(templateRef)))
  }
}

export const workflowReadinessService = new WorkflowReadinessService()
