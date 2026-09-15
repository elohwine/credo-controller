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
import type { OrganizationSetupReadiness } from '../../services/OrganizationService'
import type { SectorType, WorkflowTemplateDefinition } from '../../types/WorkflowTemplate'
import type { Request as ExRequest } from 'express'

import { Controller, Post, Get, Patch, Delete, Route, Tags, Body, Request, Security, Path } from 'tsoa'
import { container } from 'tsyringe'

import { AuthContext } from '../../enums'
import { StatusException } from '../../errors'
import { WorkflowTemplateRepository } from '../../persistence/WorkflowTemplateRepository'
import { OrganizationService } from '../../services/OrganizationService'
import { getOrCreateOrgProofVcPolicy, updateOrgProofVcPolicy } from '../../services/ProofVcPolicyService'

// ─── Request/Response interfaces ───

interface CreateOrgRequest {
  /** Organization display name */
  name: string
  /** Optional domain (e.g., for did:web) */
  domain?: string
  /** Optional discovery category (defaults to supplier) */
  category?: OrganizationCategory
  /** Optional payment rails for storefront discovery */
  paymentRails?: string[]
  /** Optional primary sector for workflow activation */
  sector?: SectorType
  /** Optional cross-sectoral workflow types to activate alongside the sector template */
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
  /** Role to assign */
  role: 'admin' | 'member'
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
  /** Configured sector (education, ecommerce, cash, field_execution, custom) if workflow template exists */
  sector?: string
  /** Active workflow template types for this org (replaces deprecated features[]) */
  workflowTypes?: string[]
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

interface ActivateOrgWorkflowsRequest {
  sector?: SectorType
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
  sector?: SectorType
  templates: WorkflowTemplateDefinition[]
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

      const wtRepo = new WorkflowTemplateRepository()
      const templates = wtRepo.listByTenantId(orgTenantId)
      const activeTemplate = templates.find((t) => t.enabled)
      const sector = activeTemplate?.sector
      const workflowTypes = templates.filter((t) => t.enabled).map((t) => t.workflowType)

      return { token, orgTenantId, orgName: activeOrg?.name, orgRole, sector, workflowTypes }
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

    if (!['admin', 'member'].includes(body.role)) {
      this.setStatus(400)
      throw new StatusException('role must be admin or member', 400)
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
  ): Promise<{ membershipId: string; targetUserId: string; role: 'admin' | 'member'; message: string }> {
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
}
