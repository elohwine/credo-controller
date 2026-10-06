/* eslint-disable @typescript-eslint/explicit-member-accessibility */
/**
 * Organization Controller — CRUD + membership management for org tenants.
 *
 * Architecture: GitHub/Clerk pattern
 *   - User authenticates as personal account (JWT with personal tenantId)
 *   - Creates/joins orgs → gets org_memberships rows
 *   - Switches context → gets scoped org token
 *
 * All endpoints require JWT auth (personal account).
 */

import 'reflect-metadata'
import type { OrganizationCategory } from '../../persistence/OrganizationRegistryRepository'
import type {
  AssignUnassignedStagesInput,
  AssignUnassignedStagesResult,
  OfferWorkflowActorCredentialsInput,
  OfferWorkflowActorCredentialsResult,
  OrganizationSetupReadiness,
  WorkflowActorDefaultInput,
  WorkflowActorsView,
} from '../../services/OrganizationService'
import type {
  OrgWorkflowActorPolicy,
  OrgWorkflowActorPolicyPatch,
  ResolvedOrgWorkflowActor,
  WorkflowActorDefaultRecord,
} from '../../services/OrgWorkflowActorService'
import type { OrgSetupProfile, OrgSetupProfileInput } from '../../services/OrgSetupProfileService'
import type { TemplateReadinessReport } from '../../services/WorkflowReadinessService'
import type { SectorType, WorkflowTemplateDefinition } from '../../types/WorkflowTemplate'
import type { Request as ExRequest } from 'express'

import { Controller, Post, Get, Patch, Put, Delete, Route, Tags, Body, Request, Security, Path } from 'tsoa'
import { container } from 'tsyringe'

import { AuthContext } from '../../enums'
import { StatusException } from '../../errors'
import { OrganizationService } from '../../services/OrganizationService'
import type { PaymentMethodChoice, PaymentSetupItem, TrustedPartner } from '../../services/OrgSetupProvisioningService'
import { orgSetupProvisioningService } from '../../services/OrgSetupProvisioningService'
import { getOrCreateOrgProofVcPolicy, updateOrgProofVcPolicy } from '../../services/ProofVcPolicyService'
import { workflowHandoffService, type WorkflowHandoffSetting } from '../../services/workflow/WorkflowHandoffService'

// ─── Request/Response interfaces ───

interface WorkflowHandoffPatch {
  /** 'auto' starts by itself when the required stages are done; 'manual' waits for someone to ask. */
  startMode?: 'auto' | 'manual'
  /** Stage ids (from stageOptions) that must be done before this hand-off is available. */
  requiredStages?: string[]
  enabled?: boolean
}

interface SelectPaymentMethodRequest {
  /** clicknpay, ecocash, or simulated — the same choices as the school-fees payment dialog. */
  method: 'clicknpay' | 'ecocash' | 'simulated'
}

interface CreateOrgRequest {
  /** Organization display name */
  name: string
  /** Optional domain (e.g., for did:web) */
  domain?: string
  /** Optional discovery category (defaults to supplier) */
  category?: OrganizationCategory
  /** Optional payment rails for storefront discovery */
  paymentRails?: string[]
  /** Workflow types the organization intends to use; their prerequisites surface in Setup readiness */
  workflowTypes?: string[]
  /** @deprecated use `workflowTypes`. Mapped onto the sector's default workflow. */
  sector?: SectorType
  /** @deprecated use `workflowTypes`. */
  additionalWorkflowTypes?: string[]
}

interface CreateOrgResponse {
  /** Organization tenant ID */
  orgTenantId: string
  /** Display name */
  name: string
  /** Creator's role */
  role: string
  /** Domain if provided */
  domain?: string
  /** Issuer DID for the org */
  issuerDid?: string
  /** Number of members */
  memberCount: number
  /** Primary sector configured for the org */
  sector?: SectorType
  /** Created workflow template id when sector setup runs */
  assignedTemplateId?: string
}

interface OrgListItem {
  /** Organization tenant ID */
  orgTenantId: string
  /** Display name */
  name: string
  /** User's role in this org */
  role: string
  /** Domain */
  domain?: string
  /** Issuer DID */
  issuerDid?: string
  /** Number of members */
  memberCount: number
}

interface InviteMemberRequest {
  /** The ssi_users.id of the person to invite */
  targetUserId: string
  /** Role to assign: admin, member, or a function role such as field_worker, approver, finance_manager, director */
  role: string
}

interface UpdateMemberRoleRequest {
  /** Function role such as manager, finance_manager, director, field_worker */
  role: string
}

interface ApplyActorPresetRequest {
  /** Ready-made setup id from the actors view (`presets`). */
  presetId: string
}

interface SwitchOrgResponse {
  /** JWT scoped to the org tenant */
  token: string
  /** Organization tenant ID */
  orgTenantId: string
  /** Human-readable organization name */
  orgName?: string
  /** User's role in this org */
  orgRole: string
  /** @deprecated Sector of the first configured template; workflows are prerequisite-driven, not sector-driven */
  sector?: string
  /** Configured workflow types for this org (regardless of readiness) */
  workflowTypes?: string[]
  /** Per-workflow operational readiness derived from declared prerequisites */
  workflows?: Array<{ templateId?: string; workflowType: string; name?: string; ready: boolean; blocking: string[] }>
  /** Overall setup readiness state */
  readinessState?: 'ready' | 'in_progress' | 'blocked'
}

interface OrgMemberItem {
  /** User ID */
  userId: string
  /** Role in org */
  role: string
  /** Membership status */
  status: string
  /** When they joined */
  createdAt: string
  /** Name from an internal contact linked to this member, when one exists */
  displayName?: string
  /** Phone from that contact, when one exists */
  phone?: string
}

interface DepartmentItem {
  id: string
  name: string
  code: string
  description?: string
  memberCount?: number
  createdAt: string
}

interface CreateDepartmentRequest {
  name: string
  code?: string
  description?: string
}

interface AuthorityItem {
  id: string
  userId: string
  role: string
  domain: string
  thresholdAmount?: number
  currency?: string
  status: string
  createdAt: string
}

interface GrantAuthorityRequest {
  userId: string
  role: string
  domain: string
  thresholdAmount?: number
  currency?: string
}

interface InviteMemberByPhoneRequest {
  phone: string
  role?: string
}

interface RoleItem {
  id: string
  name: string
  description?: string
  permissions: string[]
  createdAt: string
}

interface CreateRoleRequest {
  name: string
  description?: string
  permissions?: string[]
}

interface DelegationItem {
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

interface CreateDelegationRequest {
  delegatorUserId: string
  delegateUserId: string
  permissions: string[]
  maxAmount?: number
  currency?: string
  validFrom: string
  validUntil?: string
}

interface ActivateOrgWorkflowsRequest {
  /** Workflow types / template ids the organization intends to use */
  workflowTypes?: string[]
  /** @deprecated use `workflowTypes` */
  sector?: SectorType
  /** @deprecated use `workflowTypes` */
  additionalWorkflowTypes?: string[]
  name?: string
  paymentModes?: string[]
  reconciliationPolicy?: Record<string, unknown>
  evidencePolicy?: Record<string, unknown>
  brandingPolicy?: Record<string, unknown>
}

type ConfigureOrgWorkflowsRequest = ActivateOrgWorkflowsRequest

interface UpdateOrgPaymentRailsRequest {
  paymentRails: string[]
}

interface UpdateOrgPaymentRailsResponse {
  orgTenantId: string
  paymentRails: string[]
}

interface UpdateOrgDiscoveryVisibilityRequest {
  isPublic: boolean
}

interface UpdateOrgDiscoveryVisibilityResponse {
  orgTenantId: string
  isPublic: boolean
}

interface UpdateOrgProofVcPolicyRequest {
  defaultAcceptedVcTypes?: string[]
  actionOverrides?: Record<string, string[]>
}

interface OrgProofVcPolicyResponse {
  orgTenantId: string
  defaultAcceptedVcTypes: string[]
  actionOverrides: Record<string, string[]>
  updatedAt?: string
}

interface OrganizationWorkflowFeatureItem {
  id: string
  name: string
  description: string
  recommendedSectors: SectorType[]
}

interface OrganizationWorkflowConfigurationResponse {
  orgTenantId: string
  /** @deprecated */
  sector?: SectorType
  templates: WorkflowTemplateDefinition[]
  /** Configured workflow types (regardless of readiness) */
  workflowTypes: string[]
  /** Per-workflow readiness derived from declared prerequisites */
  workflows: Array<{ templateId?: string; workflowType: string; name?: string; ready: boolean; blocking: string[] }>
  // features: removed (migration 062) - derive from templates
  // availableFeatures: removed - query workflow_templates WHERE tenant_id IS NULL instead
}

@Route('/api/organizations')
@Tags('Organizations')
export class OrganizationController extends Controller {
  private orgService: OrganizationService

  constructor() {
    super()
    this.orgService = container.resolve(OrganizationService)
  }

  /**
   * Create a new organization.
   *
   * Creates a Credo tenant (ORG type) with its own issuer/verifier DIDs.
   * The authenticated user becomes the org owner.
   */
  @Post('/')
  @Security('jwt')
  public async createOrganization(
    @Request() request: ExRequest,
    @Body() body: CreateOrgRequest,
  ): Promise<CreateOrgResponse> {
    const user = (request as any).user
    if (!user?.id) {
      this.setStatus(401)
      throw new StatusException('Unauthorized', 401)
    }

    if (!body.name || body.name.trim().length < 2) {
      this.setStatus(400)
      throw new StatusException('Organization name is required (min 2 chars)', 400)
    }

    try {
      const org = await this.orgService.createOrganization(user.id, {
        name: body.name.trim(),
        domain: body.domain?.trim(),
        category: body.category,
        paymentRails: body.paymentRails,
        sector: body.sector,
        workflowTypes: body.workflowTypes,
        additionalWorkflowTypes: body.additionalWorkflowTypes,
      })

      this.setStatus(201)
      return org
    } catch (error: any) {
      request.logger?.error({ error: error.message }, 'Create organization failed')
      this.setStatus(500)
      throw error
    }
  }

  /**
   * Update payment rails for an organization.
   *
   * Requires an org-scoped token for an owner/admin member.
   */
  private requireSetupAdmin(request: ExRequest, orgTenantId: string): void {
    const user = (request as any).user
    if (!user?.id) {
      this.setStatus(401)
      throw new StatusException('Unauthorized', 401)
    }
    if (user.tenantId !== orgTenantId || !['owner', 'admin'].includes(user.orgRole)) {
      this.setStatus(403)
      throw new StatusException('Only an organization owner or admin can change these settings.', 403)
    }
  }

  /** Payment services the organization can use, plus the three choices from the school-fees dialog. */
  @Get('/{orgTenantId}/setup/payments')
  @Security('jwt')
  public async listPaymentSetup(
    @Request() request: ExRequest,
    @Path() orgTenantId: string,
  ): Promise<{ payments: PaymentSetupItem[]; methods: PaymentMethodChoice[] }> {
    this.requireSetupAdmin(request, orgTenantId)
    return {
      payments: orgSetupProvisioningService.listPaymentSetup(orgTenantId),
      methods: orgSetupProvisioningService.listPaymentMethods(orgTenantId),
    }
  }

  /** Choose Click n Pay, EcoCash, or Simulated pay. */
  @Post('/{orgTenantId}/setup/payments')
  @Security('jwt')
  public async selectPaymentMethod(
    @Request() request: ExRequest,
    @Path() orgTenantId: string,
    @Body() body: SelectPaymentMethodRequest,
  ): Promise<{ payments: PaymentSetupItem[]; methods: PaymentMethodChoice[] }> {
    this.requireSetupAdmin(request, orgTenantId)
    orgSetupProvisioningService.selectPaymentMethod(orgTenantId, body?.method)
    return {
      payments: orgSetupProvisioningService.listPaymentSetup(orgTenantId),
      methods: orgSetupProvisioningService.listPaymentMethods(orgTenantId),
    }
  }

  /** Turn on simulated pay so the organization can run end to end. */
  @Post('/{orgTenantId}/setup/payments/simulated')
  @Security('jwt')
  public async enableSimulatedPayments(
    @Request() request: ExRequest,
    @Path() orgTenantId: string,
  ): Promise<{ created: boolean; payments: PaymentSetupItem[]; methods: PaymentMethodChoice[] }> {
    this.requireSetupAdmin(request, orgTenantId)
    const result = orgSetupProvisioningService.ensureSimulatedPayments(orgTenantId)
    return {
      created: result.created,
      payments: orgSetupProvisioningService.listPaymentSetup(orgTenantId),
      methods: orgSetupProvisioningService.listPaymentMethods(orgTenantId),
    }
  }

  /** Accept documents this organization issues itself. */
  @Post('/{orgTenantId}/setup/trusted-partners/own')
  @Security('jwt')
  public async trustOwnOrganization(
    @Request() request: ExRequest,
    @Path() orgTenantId: string,
  ): Promise<{ created: boolean; partners: TrustedPartner[] }> {
    this.requireSetupAdmin(request, orgTenantId)
    const result = orgSetupProvisioningService.ensureOwnOrganizationTrusted(orgTenantId)
    return { created: result.created, partners: orgSetupProvisioningService.listTrustedPartners(orgTenantId) }
  }

  /** Partners whose proofs and approvals this organization accepts. */
  @Get('/{orgTenantId}/setup/trusted-partners')
  @Security('jwt')
  public async listTrustedPartners(
    @Request() request: ExRequest,
    @Path() orgTenantId: string,
  ): Promise<{ partners: TrustedPartner[] }> {
    this.requireSetupAdmin(request, orgTenantId)
    return { partners: orgSetupProvisioningService.listTrustedPartners(orgTenantId) }
  }

  @Post('/{orgTenantId}/setup/trusted-partners')
  @Security('jwt')
  public async addTrustedPartner(
    @Request() request: ExRequest,
    @Path() orgTenantId: string,
    @Body() body: { reference?: string; name?: string },
  ): Promise<{ partners: TrustedPartner[] }> {
    this.requireSetupAdmin(request, orgTenantId)
    try {
      orgSetupProvisioningService.addTrustedPartner(orgTenantId, {
        reference: String(body?.reference || ''),
        name: body?.name,
      })
    } catch (error: any) {
      this.setStatus(400)
      throw new StatusException(error.message, 400)
    }
    return { partners: orgSetupProvisioningService.listTrustedPartners(orgTenantId) }
  }

  @Delete('/{orgTenantId}/setup/trusted-partners/{partnerId}')
  @Security('jwt')
  public async removeTrustedPartner(
    @Request() request: ExRequest,
    @Path() orgTenantId: string,
    @Path() partnerId: string,
  ): Promise<{ partners: TrustedPartner[] }> {
    this.requireSetupAdmin(request, orgTenantId)
    if (!orgSetupProvisioningService.removeTrustedPartner(orgTenantId, partnerId)) {
      this.setStatus(404)
      throw new StatusException('Partner not found', 404)
    }
    return { partners: orgSetupProvisioningService.listTrustedPartners(orgTenantId) }
  }

  @Patch('/{orgTenantId}/payment-rails')
  @Security('jwt')
  public async updatePaymentRails(
    @Request() request: ExRequest,
    @Path() orgTenantId: string,
    @Body() body: UpdateOrgPaymentRailsRequest,
  ): Promise<UpdateOrgPaymentRailsResponse> {
    const user = (request as any).user
    if (!user?.id) {
      this.setStatus(401)
      throw new StatusException('Unauthorized', 401)
    }

    if (user.tenantId !== orgTenantId || !user.orgRole) {
      this.setStatus(403)
      throw new StatusException('Organization-scoped token required', 403)
    }

    if (!Array.isArray(body.paymentRails)) {
      this.setStatus(400)
      throw new StatusException('paymentRails must be an array', 400)
    }

    try {
      return await this.orgService.updateOrganizationPaymentRails(user.id, orgTenantId, body.paymentRails)
    } catch (error: any) {
      if (error.message.includes('Not a member')) {
        this.setStatus(403)
        throw new StatusException('Not a member of this organization', 403)
      }
      if (error.message.includes('Only org owners/admins')) {
        this.setStatus(403)
        throw new StatusException(error.message, 403)
      }
      if (error.message.includes('Organization not found')) {
        this.setStatus(404)
        throw new StatusException(error.message, 404)
      }
      this.setStatus(500)
      throw error
    }
  }

  /**
   * Update public/private discovery visibility for an organization.
   *
   * Requires an org-scoped token for an owner/admin member.
   */
  @Patch('/{orgTenantId}/discovery-visibility')
  @Security('jwt')
  public async updateDiscoveryVisibility(
    @Request() request: ExRequest,
    @Path() orgTenantId: string,
    @Body() body: UpdateOrgDiscoveryVisibilityRequest,
  ): Promise<UpdateOrgDiscoveryVisibilityResponse> {
    const user = (request as any).user
    if (!user?.id) {
      this.setStatus(401)
      throw new StatusException('Unauthorized', 401)
    }

    if (user.tenantId !== orgTenantId || !user.orgRole) {
      this.setStatus(403)
      throw new StatusException('Organization-scoped token required', 403)
    }

    if (typeof body.isPublic !== 'boolean') {
      this.setStatus(400)
      throw new StatusException('isPublic must be a boolean', 400)
    }

    try {
      return await this.orgService.updateOrganizationDiscoveryVisibility(user.id, orgTenantId, body.isPublic)
    } catch (error: any) {
      if (error.message.includes('Not a member')) {
        this.setStatus(403)
        throw new StatusException('Not a member of this organization', 403)
      }
      if (error.message.includes('Only org owners/admins')) {
        this.setStatus(403)
        throw new StatusException(error.message, 403)
      }
      if (error.message.includes('Organization not found')) {
        this.setStatus(404)
        throw new StatusException(error.message, 404)
      }
      this.setStatus(500)
      throw error
    }
  }

  /**
   * Get org proof VC policy used by VP request builders.
   *
   * Requires an org-scoped token.
   */
  @Get('/{orgTenantId}/proof-vc-policy')
  @Security('jwt')
  public async getProofVcPolicy(
    @Request() request: ExRequest,
    @Path() orgTenantId: string,
  ): Promise<OrgProofVcPolicyResponse> {
    const user = (request as any).user
    if (!user?.id) {
      this.setStatus(401)
      throw new StatusException('Unauthorized', 401)
    }

    if (user.tenantId !== orgTenantId || !user.orgRole) {
      this.setStatus(403)
      throw new StatusException('Organization-scoped token required', 403)
    }

    const policy = getOrCreateOrgProofVcPolicy(orgTenantId)
    return {
      orgTenantId: policy.orgTenantId,
      defaultAcceptedVcTypes: policy.defaultAcceptedVcTypes,
      actionOverrides: policy.actionOverrides,
      updatedAt: policy.updatedAt,
    }
  }

  /**
   * Update org proof VC policy used by VP request builders.
   *
   * Requires an org-scoped token for owner/admin.
   */
  @Patch('/{orgTenantId}/proof-vc-policy')
  @Security('jwt')
  public async updateProofVcPolicy(
    @Request() request: ExRequest,
    @Path() orgTenantId: string,
    @Body() body: UpdateOrgProofVcPolicyRequest,
  ): Promise<OrgProofVcPolicyResponse> {
    const user = (request as any).user
    if (!user?.id) {
      this.setStatus(401)
      throw new StatusException('Unauthorized', 401)
    }

    if (user.tenantId !== orgTenantId || !user.orgRole) {
      this.setStatus(403)
      throw new StatusException('Organization-scoped token required', 403)
    }

    if (!['owner', 'admin'].includes(user.orgRole)) {
      this.setStatus(403)
      throw new StatusException('Only org owners/admins can manage proof VC policy', 403)
    }

    if (body.defaultAcceptedVcTypes !== undefined && !Array.isArray(body.defaultAcceptedVcTypes)) {
      this.setStatus(400)
      throw new StatusException('defaultAcceptedVcTypes must be an array of VC type strings', 400)
    }

    if (
      body.actionOverrides !== undefined &&
      (typeof body.actionOverrides !== 'object' || body.actionOverrides === null || Array.isArray(body.actionOverrides))
    ) {
      this.setStatus(400)
      throw new StatusException('actionOverrides must be an object map of action -> vc type array', 400)
    }

    const policy = updateOrgProofVcPolicy(orgTenantId, {
      defaultAcceptedVcTypes: body.defaultAcceptedVcTypes,
      actionOverrides: body.actionOverrides,
    })

    return {
      orgTenantId: policy.orgTenantId,
      defaultAcceptedVcTypes: policy.defaultAcceptedVcTypes,
      actionOverrides: policy.actionOverrides,
      updatedAt: policy.updatedAt,
    }
  }

  /**
   * List organizations the current user belongs to.
   */
  @Get('/')
  @Security('jwt')
  public async listMyOrganizations(@Request() request: ExRequest): Promise<OrgListItem[]> {
    const user = (request as any).user
    if (!user?.id) {
      this.setStatus(401)
      throw new StatusException('Unauthorized', 401)
    }

    return this.orgService.listUserOrganizations(user.id)
  }

  /**
   * Get configured workflow capabilities for an organization.
   */
  @Get('/{orgTenantId}/workflows')
  @Security('jwt')
  public async getOrganizationWorkflows(
    @Request() request: ExRequest,
    @Path() orgTenantId: string,
  ): Promise<OrganizationWorkflowConfigurationResponse> {
    const user = (request as any).user
    if (!user?.id) {
      this.setStatus(401)
      throw new StatusException('Unauthorized', 401)
    }

    try {
      return this.orgService.getOrganizationWorkflowConfiguration(user.id, orgTenantId)
    } catch (error: any) {
      if (error.message.includes('Not a member')) {
        this.setStatus(403)
        throw new StatusException('Not a member of this organization', 403)
      }
      this.setStatus(500)
      throw error
    }
  }

  /**
   * Configure or extend workflow capabilities for an organization.
   */
  @Post('/{orgTenantId}/workflows/configure')
  @Security('jwt')
  public async configureOrganizationWorkflows(
    @Request() request: ExRequest,
    @Path() orgTenantId: string,
    @Body() body: ConfigureOrgWorkflowsRequest,
  ): Promise<OrganizationWorkflowConfigurationResponse> {
    const user = (request as any).user
    if (!user?.id) {
      this.setStatus(401)
      throw new StatusException('Unauthorized', 401)
    }

    try {
      return this.orgService.configureOrganizationWorkflows(user.id, orgTenantId, body)
    } catch (error: any) {
      if (error.message.includes('Not a member')) {
        this.setStatus(403)
        throw new StatusException('Not a member of this organization', 403)
      }
      if (error.message.includes('Only org owners/admins')) {
        this.setStatus(403)
        throw new StatusException('Only org owners/admins can manage workflows', 403)
      }
      if (error.message.includes('No default template')) {
        this.setStatus(404)
        throw new StatusException(error.message, 404)
      }
      this.setStatus(500)
      throw error
    }
  }

  /**
   * Backward-compatible alias for workflow configuration.
   *
   * Deprecated: use /workflows/configure for capability-driven setup.
   */
  @Post('/{orgTenantId}/workflows/activate')
  @Security('jwt')
  public async activateOrganizationWorkflows(
    @Request() request: ExRequest,
    @Path() orgTenantId: string,
    @Body() body: ActivateOrgWorkflowsRequest,
  ): Promise<OrganizationWorkflowConfigurationResponse> {
    const user = (request as any).user
    if (!user?.id) {
      this.setStatus(401)
      throw new StatusException('Unauthorized', 401)
    }

    try {
      return this.orgService.configureOrganizationWorkflows(user.id, orgTenantId, body)
    } catch (error: any) {
      if (error.message.includes('Not a member')) {
        this.setStatus(403)
        throw new StatusException('Not a member of this organization', 403)
      }
      if (error.message.includes('Only org owners/admins')) {
        this.setStatus(403)
        throw new StatusException('Only org owners/admins can manage workflows', 403)
      }
      if (error.message.includes('No default template')) {
        this.setStatus(404)
        throw new StatusException(error.message, 404)
      }
      this.setStatus(500)
      throw error
    }
  }

  /**
   * The setup answers: what the organization does, who handles money, how it takes payment.
   */
  @Get('/{orgTenantId}/setup/profile')
  @Security('jwt')
  public async getSetupProfile(@Request() request: ExRequest, @Path() orgTenantId: string): Promise<OrgSetupProfile> {
    const user = (request as any).user
    if (!user?.id) {
      this.setStatus(401)
      throw new StatusException('Unauthorized', 401)
    }
    try {
      return this.orgService.getSetupProfile(user.id, orgTenantId)
    } catch (error: any) {
      if (error.message.includes('Not a member')) {
        this.setStatus(403)
        throw new StatusException('Not a member of this organization', 403)
      }
      throw error
    }
  }

  /**
   * Save the setup answers. Request types follow from them; no workflow is named or switched on.
   */
  @Put('/{orgTenantId}/setup/profile')
  @Security('jwt')
  public async saveSetupProfile(
    @Request() request: ExRequest,
    @Path() orgTenantId: string,
    @Body() body: OrgSetupProfileInput,
  ): Promise<OrgSetupProfile> {
    const user = (request as any).user
    if (!user?.id) {
      this.setStatus(401)
      throw new StatusException('Unauthorized', 401)
    }
    try {
      return await this.orgService.saveSetupProfile(user.id, orgTenantId, body)
    } catch (error: any) {
      if (error.message.includes('Not a member')) {
        this.setStatus(403)
        throw new StatusException('Not a member of this organization', 403)
      }
      if (error.message.includes('Only org owners/admins')) {
        this.setStatus(403)
        throw new StatusException('Only the owner or an admin can change these answers', 403)
      }
      throw error
    }
  }

  /**
   * Readiness summary for progressive organization setup.
   */
  @Get('/{orgTenantId}/setup/readiness')
  @Security('jwt')
  public async getOrganizationSetupReadiness(
    @Request() request: ExRequest,
    @Path() orgTenantId: string,
  ): Promise<OrganizationSetupReadiness> {
    const user = (request as any).user
    if (!user?.id) {
      this.setStatus(401)
      throw new StatusException('Unauthorized', 401)
    }

    try {
      return this.orgService.getOrganizationSetupReadiness(user.id, orgTenantId)
    } catch (error: any) {
      if (error.message.includes('Not a member')) {
        this.setStatus(403)
        throw new StatusException('Not a member of this organization', 403)
      }
      this.setStatus(500)
      throw error
    }
  }

  /**
   * Resolved stage actors for the organization's configured workflows.
   *
   * Finance detail timelines and the inbox use this to show who acts at the
   * current stage: a configured person, a configured role, a role match, or
   * the owner fallback.
   */
  @Get('/{orgTenantId}/workflows/actors')
  @Security('jwt')
  public async getWorkflowActors(
    @Request() request: ExRequest,
    @Path() orgTenantId: string,
  ): Promise<WorkflowActorsView> {
    const user = (request as any).user
    if (!user?.id) {
      this.setStatus(401)
      throw new StatusException('Unauthorized', 401)
    }

    try {
      await this.orgService.refreshMemberNames(orgTenantId)
      return this.orgService.listWorkflowActors(user.id, orgTenantId)
    } catch (error: any) {
      if (error.message.includes('Not a member')) {
        this.setStatus(403)
        throw new StatusException('Not a member of this organization', 403)
      }
      this.setStatus(500)
      throw error
    }
  }

  private rethrowActorConfigError(error: any): never {
    const message = String(error?.message || '')
    if (message.includes('Not a member')) {
      this.setStatus(403)
      throw new StatusException('Not a member of this organization', 403)
    }
    if (message.includes('Only org owners/admins')) {
      this.setStatus(403)
      throw new StatusException(message, 403)
    }
    if (
      message.includes('required') ||
      message.includes('Choose a person') ||
      message.includes('not an active member') ||
      message.includes('Provide a userId') ||
      message.includes('Unknown setup')
    ) {
      this.setStatus(400)
      throw new StatusException(message, 400)
    }
    this.setStatus(500)
    throw error
  }

  /**
   * Save who acts at one workflow stage (a member, a role, or a wallet), or clear it with
   * `enabled: false` so the organization's fallback policy applies again. Owner/admin only.
   *
   * This is the Setup Center "Approval setup" primitive: stage actors are configured per
   * organization instead of being hard-wired to the owner.
   */
  @Put('/{orgTenantId}/workflows/actors/defaults')
  @Security('jwt')
  public async saveWorkflowActorDefault(
    @Request() request: ExRequest,
    @Path() orgTenantId: string,
    @Body() body: WorkflowActorDefaultInput,
  ): Promise<{ saved?: WorkflowActorDefaultRecord; cleared: boolean; actor: ResolvedOrgWorkflowActor }> {
    const user = (request as any).user
    if (!user?.id) {
      this.setStatus(401)
      throw new StatusException('Unauthorized', 401)
    }
    try {
      return this.orgService.saveWorkflowActorDefault(user.id, orgTenantId, body)
    } catch (error: any) {
      return this.rethrowActorConfigError(error)
    }
  }

  /**
   * The organization's stage-actor fallback policy: ordered user/role/wallet chains
   * (per stage and org-wide), whether built-in role order applies, and whether the
   * owner/admin is used as the last resort.
   */
  @Get('/{orgTenantId}/workflows/actors/policy')
  @Security('jwt')
  public async getWorkflowActorPolicy(
    @Request() request: ExRequest,
    @Path() orgTenantId: string,
  ): Promise<OrgWorkflowActorPolicy> {
    const user = (request as any).user
    if (!user?.id) {
      this.setStatus(401)
      throw new StatusException('Unauthorized', 401)
    }
    try {
      return this.orgService.getWorkflowActorPolicy(user.id, orgTenantId)
    } catch (error: any) {
      return this.rethrowActorConfigError(error)
    }
  }

  /**
   * Update the fallback policy. Chains passed are replaced; omitted fields keep their value.
   * Setting a stage chain to an empty array removes it. Owner/admin only.
   */
  @Patch('/{orgTenantId}/workflows/actors/policy')
  @Security('jwt')
  public async updateWorkflowActorPolicy(
    @Request() request: ExRequest,
    @Path() orgTenantId: string,
    @Body() body: OrgWorkflowActorPolicyPatch,
  ): Promise<OrgWorkflowActorPolicy> {
    const user = (request as any).user
    if (!user?.id) {
      this.setStatus(401)
      throw new StatusException('Unauthorized', 401)
    }
    try {
      return this.orgService.saveWorkflowActorPolicy(user.id, orgTenantId, body || {})
    } catch (error: any) {
      return this.rethrowActorConfigError(error)
    }
  }

  /**
   * Apply a ready-made purchase-request setup: who confirms each step, and whether
   * one confirmation covers the approval or the manager and finance each confirm.
   */
  @Post('/{orgTenantId}/workflows/actors/presets')
  @Security('jwt')
  public async applyWorkflowActorPreset(
    @Request() request: ExRequest,
    @Path() orgTenantId: string,
    @Body() body: ApplyActorPresetRequest,
  ): Promise<WorkflowActorsView> {
    const user = (request as any).user
    if (!user?.id) {
      this.setStatus(401)
      throw new StatusException('Unauthorized', 401)
    }
    if (!body?.presetId?.trim()) {
      this.setStatus(400)
      throw new StatusException('presetId is required', 400)
    }
    try {
      return this.orgService.applyWorkflowActorPreset(user.id, orgTenantId, body.presetId)
    } catch (error: any) {
      return this.rethrowActorConfigError(error)
    }
  }

  // ── What happens next (hand-offs between jobs and requests) ─────────────────

  private assertHandoffAccess(request: ExRequest, orgTenantId: string, write: boolean): string {
    const user = (request as any).user
    if (!user?.id) {
      this.setStatus(401)
      throw new StatusException('Unauthorized', 401)
    }
    const role = String(this.orgService.getUserOrgRole(user.id, orgTenantId) || '').toLowerCase()
    if (!role) {
      this.setStatus(403)
      throw new StatusException('Not a member of this organization', 403)
    }
    if (write && !['owner', 'admin'].includes(role)) {
      this.setStatus(403)
      throw new StatusException('Only org owners/admins can manage organization settings', 403)
    }
    return String(user.id)
  }

  /**
   * How each follow-on procedure starts for this organization: by itself when the required
   * stages are done, or when someone on the job asks. Covers job hand-offs (field job → quote,
   * field job → buy materials) and request chains (requisition → purchase order → payment).
   */
  @Get('/{orgTenantId}/workflows/handoffs')
  @Security('jwt')
  public async getWorkflowHandoffs(
    @Request() request: ExRequest,
    @Path() orgTenantId: string,
  ): Promise<{ handoffs: WorkflowHandoffSetting[] }> {
    this.assertHandoffAccess(request, orgTenantId, false)
    return { handoffs: workflowHandoffService.settingsFor(orgTenantId) }
  }

  /**
   * Save one hand-off choice. Owner/admin only. Only start mode, required stages and on/off
   * can change; what moves across and whether the job waits is fixed by the platform.
   */
  @Put('/{orgTenantId}/workflows/handoffs/{handoffKey}')
  @Security('jwt')
  public async saveWorkflowHandoff(
    @Request() request: ExRequest,
    @Path() orgTenantId: string,
    @Path() handoffKey: string,
    @Body() body: WorkflowHandoffPatch,
  ): Promise<WorkflowHandoffSetting> {
    this.assertHandoffAccess(request, orgTenantId, true)
    try {
      return workflowHandoffService.saveSetting(orgTenantId, decodeURIComponent(handoffKey), body || {})
    } catch (error: any) {
      this.setStatus(400)
      throw new StatusException(error.message, 400)
    }
  }

  /**
   * Setup shortcut: assign every stage that would otherwise fall to the owner (or to nobody)
   * to one member or role. Stages that already resolve to a configured or eligible actor are
   * left untouched. Owner/admin only.
   */
  @Post('/{orgTenantId}/workflows/actors/assign-unassigned')
  @Security('jwt')
  public async assignUnassignedWorkflowStages(
    @Request() request: ExRequest,
    @Path() orgTenantId: string,
    @Body() body: AssignUnassignedStagesInput,
  ): Promise<AssignUnassignedStagesResult> {
    const user = (request as any).user
    if (!user?.id) {
      this.setStatus(401)
      throw new StatusException('Unauthorized', 401)
    }
    try {
      return this.orgService.assignUnassignedStages(user.id, orgTenantId, body || {})
    } catch (error: any) {
      return this.rethrowActorConfigError(error)
    }
  }

  /**
   * Offer every resolved stage actor their `OrgWorkflowActorCredential` (the actor VC accepted
   * by the stage's OIDC4VP presentation). Idempotent unless `force` is set; owner/admin only.
   */
  @Post('/{orgTenantId}/workflows/actors/offer-credentials')
  @Security('jwt')
  public async offerWorkflowActorCredentials(
    @Request() request: ExRequest,
    @Path() orgTenantId: string,
    @Body() body: OfferWorkflowActorCredentialsInput,
  ): Promise<OfferWorkflowActorCredentialsResult> {
    const user = (request as any).user
    if (!user?.id) {
      this.setStatus(401)
      throw new StatusException('Unauthorized', 401)
    }
    try {
      return await this.orgService.offerWorkflowActorCredentials(user.id, orgTenantId, body || {})
    } catch (error: any) {
      return this.rethrowActorConfigError(error)
    }
  }

  /**
   * Prerequisite report for one workflow template.
   *
   * Answers "what does this workflow still need before it is operational?" using
   * the template's declared prerequisites. `templateRef` may be a tenant template
   * id, a canonical template id (e.g. `tpl-fept-field-execution`) or a workflow
   * type alias (e.g. `field_execution_fept`).
   */
  @Get('/{orgTenantId}/workflows/{templateRef}/prerequisites')
  @Security('jwt')
  public async getWorkflowPrerequisites(
    @Request() request: ExRequest,
    @Path() orgTenantId: string,
    @Path() templateRef: string,
  ): Promise<TemplateReadinessReport> {
    const user = (request as any).user
    if (!user?.id) {
      this.setStatus(401)
      throw new StatusException('Unauthorized', 401)
    }

    try {
      return this.orgService.getWorkflowPrerequisites(user.id, orgTenantId, templateRef)
    } catch (error: any) {
      if (error.message.includes('Not a member')) {
        this.setStatus(403)
        throw new StatusException('Not a member of this organization', 403)
      }
      this.setStatus(500)
      throw error
    }
  }

  /**
   * Switch active context to an organization.
   *
   * Returns a JWT scoped to the org tenant. The frontend should store this
   * as the active token when operating in org context.
   */
  @Post('/{orgTenantId}/switch')
  @Security('jwt')
  public async switchToOrganization(
    @Request() request: ExRequest,
    @Path() orgTenantId: string,
  ): Promise<SwitchOrgResponse> {
    const authContext = (request as any).authContext as string | undefined
    if (authContext === AuthContext.Org) {
      this.setStatus(409)
      throw new StatusException('Switch organization requires personal context. Switch to personal wallet first.', 409)
    }

    const user = (request as any).user
    if (!user?.id) {
      this.setStatus(401)
      throw new StatusException('Unauthorized', 401)
    }

    try {
      const token = await this.orgService.generateOrgToken(user.id, orgTenantId)
      const orgRole = this.orgService.getUserOrgRole(user.id, orgTenantId) || 'member'
      this.orgService.markOrgAsActive(user.id, orgTenantId)
      const memberships = await this.orgService.listUserOrganizations(user.id)
      const activeOrg = memberships.find((org) => org.orgTenantId === orgTenantId)

      // Workflows are prerequisite-driven: report what is configured and what is
      // operational, not an `enabled` flag. `sector` is kept for one release for
      // older clients.
      const configuration = this.orgService.getOrganizationWorkflowConfiguration(user.id, orgTenantId)
      let readinessState: SwitchOrgResponse['readinessState']
      try {
        readinessState = this.orgService.getOrganizationSetupReadiness(user.id, orgTenantId).readinessState
      } catch (readinessError: any) {
        request.logger?.warn({ error: readinessError?.message }, 'Readiness unavailable during org switch')
      }

      return {
        token,
        orgTenantId,
        orgName: activeOrg?.name,
        orgRole,
        sector: configuration.sector,
        workflowTypes: configuration.workflowTypes,
        workflows: configuration.workflows,
        readinessState,
      }
    } catch (error: any) {
      if (error.message.includes('Not a member')) {
        throw new StatusException('Not a member of this organization', 403)
      } else if (error.message.includes('context is stale')) {
        throw new StatusException('Organization context is stale. Refresh organizations and try again.', 409)
      } else {
        throw new StatusException(error.message || 'Failed to switch organization', 500)
      }
    }
  }

  /**
   * List members of an organization.
   * Requires the caller to be a member.
   */
  @Get('/{orgTenantId}/members')
  @Security('jwt')
  public async listMembers(@Request() request: ExRequest, @Path() orgTenantId: string): Promise<OrgMemberItem[]> {
    const user = (request as any).user
    if (!user?.id) {
      this.setStatus(401)
      throw new StatusException('Unauthorized', 401)
    }

    // Token's tenantId must match the requested org — prevents cross-org access
    if (user.tenantId !== orgTenantId) {
      this.setStatus(403)
      throw new StatusException('Token scope does not match organization', 403)
    }

    const role = this.orgService.getUserOrgRole(user.id, orgTenantId)
    if (!role) {
      this.setStatus(403)
      throw new StatusException('Not a member of this organization', 403)
    }

    await this.orgService.refreshMemberNames(orgTenantId)
    return this.orgService.listOrgMembers(orgTenantId)
  }

  /**
   * Invite a user to an organization.
   * Requires owner or admin role.
   */
  @Post('/{orgTenantId}/members')
  @Security('jwt')
  public async inviteMember(
    @Request() request: ExRequest,
    @Path() orgTenantId: string,
    @Body() body: InviteMemberRequest,
  ): Promise<{ membershipId: string; message: string }> {
    const user = (request as any).user
    if (!user?.id) {
      this.setStatus(401)
      throw new StatusException('Unauthorized', 401)
    }

    if (user.tenantId !== orgTenantId) {
      this.setStatus(403)
      throw new StatusException('Token scope does not match organization', 403)
    }

    if (!body.targetUserId || !body.role) {
      this.setStatus(400)
      throw new StatusException('targetUserId and role are required', 400)
    }

    if (!/^[A-Za-z][A-Za-z0-9 _-]{0,39}$/.test(body.role) || body.role.trim().toLowerCase() === 'owner') {
      this.setStatus(400)
      throw new StatusException('role must be admin, member or a function role such as field_worker', 400)
    }

    try {
      const result = await this.orgService.inviteMember(orgTenantId, body.targetUserId, body.role, user.id)
      this.setStatus(201)
      return { ...result, message: 'Member added successfully' }
    } catch (error: any) {
      if (error.message.includes('Only org owners')) {
        this.setStatus(403)
      } else if (error.message.includes('already a member')) {
        this.setStatus(409)
      } else {
        this.setStatus(500)
      }
      throw error
    }
  }

  /**
   * Remove a member from an organization.
   * Requires owner or admin role.
   */
  /**
   * Change a member's role. Owner/admin only. The owner's role cannot be changed.
   */
  @Patch('/{orgTenantId}/members/{targetUserId}')
  @Security('jwt')
  public async updateMemberRole(
    @Request() request: ExRequest,
    @Path() orgTenantId: string,
    @Path() targetUserId: string,
    @Body() body: UpdateMemberRoleRequest,
  ): Promise<{ userId: string; role: string }> {
    const user = (request as any).user
    if (!user?.id) {
      this.setStatus(401)
      throw new StatusException('Unauthorized', 401)
    }
    if (user.tenantId !== orgTenantId) {
      this.setStatus(403)
      throw new StatusException('Token scope does not match organization', 403)
    }
    if (!body?.role?.trim()) {
      this.setStatus(400)
      throw new StatusException('role is required', 400)
    }
    try {
      return this.orgService.updateMemberRole(orgTenantId, targetUserId, body.role, user.id)
    } catch (error: any) {
      const message = String(error?.message || '')
      if (message.includes('Only org owners') || message.includes('Cannot change the owner')) {
        this.setStatus(403)
      } else if (message.includes('not found')) {
        this.setStatus(404)
      } else {
        this.setStatus(400)
      }
      throw error
    }
  }

  @Delete('/{orgTenantId}/members/{targetUserId}')
  @Security('jwt')
  public async removeMember(
    @Request() request: ExRequest,
    @Path() orgTenantId: string,
    @Path() targetUserId: string,
  ): Promise<{ message: string }> {
    const user = (request as any).user
    if (!user?.id) {
      this.setStatus(401)
      throw new StatusException('Unauthorized', 401)
    }

    if (user.tenantId !== orgTenantId) {
      this.setStatus(403)
      throw new StatusException('Token scope does not match organization', 403)
    }

    try {
      this.orgService.removeMember(orgTenantId, targetUserId, user.id)
      return { message: 'Member removed' }
    } catch (error: any) {
      if (error.message.includes('Only org owners')) {
        this.setStatus(403)
      } else if (error.message.includes('Cannot remove the org owner')) {
        this.setStatus(400)
      } else {
        this.setStatus(500)
      }
      throw error
    }
  }

  @Post('/{orgTenantId}/members/invite')
  @Security('jwt')
  public async inviteMemberByPhone(
    @Request() request: ExRequest,
    @Path() orgTenantId: string,
    @Body() body: InviteMemberByPhoneRequest,
  ): Promise<{ membershipId: string; targetUserId: string; role: string; message: string }> {
    const user = (request as any).user
    if (!user?.id) {
      this.setStatus(401)
      throw new StatusException('Unauthorized', 401)
    }

    if (user.tenantId !== orgTenantId) {
      this.setStatus(403)
      throw new StatusException('Token scope does not match organization', 403)
    }

    if (!body.phone) {
      this.setStatus(400)
      throw new StatusException('phone is required', 400)
    }

    try {
      const result = await this.orgService.inviteMemberByPhone(orgTenantId, body.phone, body.role || 'member', user.id)
      this.setStatus(201)
      return { ...result, message: 'Member added successfully' }
    } catch (error: any) {
      if (error.message.includes('Only org owners')) {
        this.setStatus(403)
      } else if (error.message.includes('No registered user found')) {
        this.setStatus(404)
      } else if (error.message.includes('already a member')) {
        this.setStatus(409)
      } else {
        this.setStatus(500)
      }
      throw error
    }
  }

  @Get('/{orgTenantId}/departments')
  @Security('jwt')
  public async listDepartments(@Request() request: ExRequest, @Path() orgTenantId: string): Promise<DepartmentItem[]> {
    const user = (request as any).user
    if (!user?.id) {
      this.setStatus(401)
      throw new StatusException('Unauthorized', 401)
    }

    if (user.tenantId !== orgTenantId) {
      this.setStatus(403)
      throw new StatusException('Token scope does not match organization', 403)
    }

    return this.orgService.listDepartments(orgTenantId)
  }

  @Post('/{orgTenantId}/departments')
  @Security('jwt')
  public async createDepartment(
    @Request() request: ExRequest,
    @Path() orgTenantId: string,
    @Body() body: CreateDepartmentRequest,
  ): Promise<DepartmentItem> {
    const user = (request as any).user
    if (!user?.id) {
      this.setStatus(401)
      throw new StatusException('Unauthorized', 401)
    }

    if (user.tenantId !== orgTenantId) {
      this.setStatus(403)
      throw new StatusException('Token scope does not match organization', 403)
    }

    if (!body.name?.trim()) {
      this.setStatus(400)
      throw new StatusException('name is required', 400)
    }

    try {
      this.setStatus(201)
      return this.orgService.createDepartment(orgTenantId, user.id, body)
    } catch (error: any) {
      if (error.message.includes('Only org owners')) this.setStatus(403)
      else this.setStatus(500)
      throw error
    }
  }

  @Delete('/{orgTenantId}/departments/{departmentId}')
  @Security('jwt')
  public async deleteDepartment(
    @Request() request: ExRequest,
    @Path() orgTenantId: string,
    @Path() departmentId: string,
  ): Promise<{ message: string }> {
    const user = (request as any).user
    if (!user?.id) {
      this.setStatus(401)
      throw new StatusException('Unauthorized', 401)
    }

    if (user.tenantId !== orgTenantId) {
      this.setStatus(403)
      throw new StatusException('Token scope does not match organization', 403)
    }

    try {
      this.orgService.deleteDepartment(orgTenantId, departmentId, user.id)
      return { message: 'Department removed' }
    } catch (error: any) {
      if (error.message.includes('Only org owners')) this.setStatus(403)
      else this.setStatus(500)
      throw error
    }
  }

  @Get('/{orgTenantId}/authorities')
  @Security('jwt')
  public async listAuthorities(@Request() request: ExRequest, @Path() orgTenantId: string): Promise<AuthorityItem[]> {
    const user = (request as any).user
    if (!user?.id) {
      this.setStatus(401)
      throw new StatusException('Unauthorized', 401)
    }

    if (user.tenantId !== orgTenantId) {
      this.setStatus(403)
      throw new StatusException('Token scope does not match organization', 403)
    }

    return this.orgService.listAuthorities(orgTenantId)
  }

  @Post('/{orgTenantId}/authorities')
  @Security('jwt')
  public async grantAuthority(
    @Request() request: ExRequest,
    @Path() orgTenantId: string,
    @Body() body: GrantAuthorityRequest,
  ): Promise<AuthorityItem> {
    const user = (request as any).user
    if (!user?.id) {
      this.setStatus(401)
      throw new StatusException('Unauthorized', 401)
    }

    if (user.tenantId !== orgTenantId) {
      this.setStatus(403)
      throw new StatusException('Token scope does not match organization', 403)
    }

    if (!body.userId?.trim() || !body.role?.trim() || !body.domain?.trim()) {
      this.setStatus(400)
      throw new StatusException('userId, role, and domain are required', 400)
    }

    try {
      this.setStatus(201)
      return this.orgService.grantAuthority(orgTenantId, user.id, body)
    } catch (error: any) {
      if (error.message.includes('Only org owners')) this.setStatus(403)
      else this.setStatus(500)
      throw error
    }
  }

  @Delete('/{orgTenantId}/authorities/{authorityId}')
  @Security('jwt')
  public async revokeAuthority(
    @Request() request: ExRequest,
    @Path() orgTenantId: string,
    @Path() authorityId: string,
  ): Promise<{ message: string }> {
    const user = (request as any).user
    if (!user?.id) {
      this.setStatus(401)
      throw new StatusException('Unauthorized', 401)
    }

    if (user.tenantId !== orgTenantId) {
      this.setStatus(403)
      throw new StatusException('Token scope does not match organization', 403)
    }

    try {
      this.orgService.revokeAuthority(orgTenantId, authorityId, user.id)
      return { message: 'Authority revoked' }
    } catch (error: any) {
      if (error.message.includes('Only org owners')) this.setStatus(403)
      else this.setStatus(500)
      throw error
    }
  }

  @Get('/{orgTenantId}/roles')
  @Security('jwt')
  public async listRoles(@Request() request: ExRequest, @Path() orgTenantId: string): Promise<RoleItem[]> {
    const user = (request as any).user
    if (!user?.id) {
      this.setStatus(401)
      throw new StatusException('Unauthorized', 401)
    }

    if (user.tenantId !== orgTenantId) {
      this.setStatus(403)
      throw new StatusException('Token scope does not match organization', 403)
    }

    return this.orgService.listRoles(orgTenantId)
  }

  @Post('/{orgTenantId}/roles')
  @Security('jwt')
  public async createRole(
    @Request() request: ExRequest,
    @Path() orgTenantId: string,
    @Body() body: CreateRoleRequest,
  ): Promise<RoleItem> {
    const user = (request as any).user
    if (!user?.id) {
      this.setStatus(401)
      throw new StatusException('Unauthorized', 401)
    }
    if (user.tenantId !== orgTenantId) {
      this.setStatus(403)
      throw new StatusException('Token scope does not match organization', 403)
    }
    if (!body.name?.trim()) {
      this.setStatus(400)
      throw new StatusException('name is required', 400)
    }

    try {
      this.setStatus(201)
      return this.orgService.createRole(orgTenantId, user.id, body)
    } catch (error: any) {
      if (error.message.includes('Only org owners')) this.setStatus(403)
      else this.setStatus(500)
      throw error
    }
  }

  @Delete('/{orgTenantId}/roles/{roleId}')
  @Security('jwt')
  public async deleteRole(
    @Request() request: ExRequest,
    @Path() orgTenantId: string,
    @Path() roleId: string,
  ): Promise<{ message: string }> {
    const user = (request as any).user
    if (!user?.id) {
      this.setStatus(401)
      throw new StatusException('Unauthorized', 401)
    }
    if (user.tenantId !== orgTenantId) {
      this.setStatus(403)
      throw new StatusException('Token scope does not match organization', 403)
    }

    try {
      this.orgService.deleteRole(orgTenantId, roleId, user.id)
      return { message: 'Role deleted' }
    } catch (error: any) {
      if (error.message.includes('Only org owners')) this.setStatus(403)
      else this.setStatus(500)
      throw error
    }
  }

  @Get('/{orgTenantId}/delegations')
  @Security('jwt')
  public async listDelegations(@Request() request: ExRequest, @Path() orgTenantId: string): Promise<DelegationItem[]> {
    const user = (request as any).user
    if (!user?.id) {
      this.setStatus(401)
      throw new StatusException('Unauthorized', 401)
    }
    if (user.tenantId !== orgTenantId) {
      this.setStatus(403)
      throw new StatusException('Token scope does not match organization', 403)
    }

    return this.orgService.listDelegations(orgTenantId)
  }

  @Post('/{orgTenantId}/delegations')
  @Security('jwt')
  public async createDelegation(
    @Request() request: ExRequest,
    @Path() orgTenantId: string,
    @Body() body: CreateDelegationRequest,
  ): Promise<DelegationItem> {
    const user = (request as any).user
    if (!user?.id) {
      this.setStatus(401)
      throw new StatusException('Unauthorized', 401)
    }
    if (user.tenantId !== orgTenantId) {
      this.setStatus(403)
      throw new StatusException('Token scope does not match organization', 403)
    }
    if (
      !body.delegatorUserId?.trim() ||
      !body.delegateUserId?.trim() ||
      !body.validFrom ||
      !Array.isArray(body.permissions)
    ) {
      this.setStatus(400)
      throw new StatusException('delegatorUserId, delegateUserId, validFrom, and permissions are required', 400)
    }

    try {
      this.setStatus(201)
      return this.orgService.createDelegation(orgTenantId, user.id, body)
    } catch (error: any) {
      if (error.message.includes('Only org owners')) this.setStatus(403)
      else this.setStatus(500)
      throw error
    }
  }

  @Delete('/{orgTenantId}/delegations/{delegationId}')
  @Security('jwt')
  public async revokeDelegation(
    @Request() request: ExRequest,
    @Path() orgTenantId: string,
    @Path() delegationId: string,
  ): Promise<{ message: string }> {
    const user = (request as any).user
    if (!user?.id) {
      this.setStatus(401)
      throw new StatusException('Unauthorized', 401)
    }
    if (user.tenantId !== orgTenantId) {
      this.setStatus(403)
      throw new StatusException('Token scope does not match organization', 403)
    }

    try {
      this.orgService.revokeDelegation(orgTenantId, delegationId, user.id)
      return { message: 'Delegation revoked' }
    } catch (error: any) {
      if (error.message.includes('Only org owners')) this.setStatus(403)
      else this.setStatus(500)
      throw error
    }
  }
}
