import type {
  PartnerClient,
  PartnerClientInput,
  PartnerClientWithSecret,
} from '../../services/partner/PartnerClientService'
import type { Request as ExRequest } from 'express'

import { Body, Controller, Get, Patch, Path, Post, Request, Route, Security, Tags } from 'tsoa'

import { SCOPES } from '../../enums'
import { StatusException } from '../../errors'
import { DatabaseManager } from '../../persistence/DatabaseManager'
import { auditService } from '../../services/AuditService'
import { RELEASABLE_IDENTITY_CLAIMS, partnerClientService } from '../../services/partner/PartnerClientService'

interface PartnerClientSettings {
  releasableClaims: string[]
  bridgeConfigured: boolean
  /** Public OpenID Provider (hosted bridge) issuer partners configure, when deployed. */
  issuerUrl: string | null
}

/** Partner platforms an organisation lets its people sign in to with their Credentis wallet. */
@Route('api/organizations/partner-clients')
@Tags('Organization Partner Clients')
export class PartnerClientsController extends Controller {
  @Get('/')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async listPartnerClients(
    @Request() request: ExRequest,
  ): Promise<{ clients: PartnerClient[]; settings: PartnerClientSettings }> {
    const orgTenantId = this.requireOrgTenant(request)
    this.requireAdmin(request, orgTenantId)
    return {
      clients: partnerClientService.list(orgTenantId),
      settings: {
        releasableClaims: [...RELEASABLE_IDENTITY_CLAIMS],
        bridgeConfigured: Boolean(process.env.HYDRA_ADMIN_URL),
        issuerUrl: process.env.PARTNER_OIDC_ISSUER_URL?.trim() || null,
      },
    }
  }

  /** Register a partner client. The secret is returned once. */
  @Post('/')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async createPartnerClient(
    @Request() request: ExRequest,
    @Body() body: PartnerClientInput,
  ): Promise<PartnerClientWithSecret> {
    const orgTenantId = this.requireOrgTenant(request)
    this.requireAdmin(request, orgTenantId)
    const created = await partnerClientService.create(orgTenantId, this.actorId(request), body)
    this.audit(orgTenantId, request, 'partner_client_created', created.clientId, {
      redirectUris: created.redirectUris,
      policy: created.policy,
    })
    return created
  }

  @Patch('/{clientId}')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async updatePartnerClient(
    @Request() request: ExRequest,
    @Path() clientId: string,
    @Body() body: Partial<PartnerClientInput>,
  ): Promise<PartnerClient> {
    const orgTenantId = this.requireOrgTenant(request)
    this.requireAdmin(request, orgTenantId)
    const updated = await partnerClientService.update(orgTenantId, clientId, body)
    this.audit(orgTenantId, request, 'partner_client_updated', clientId, {
      redirectUris: updated.redirectUris,
      policy: updated.policy,
    })
    return updated
  }

  /** Issue a new secret. The old one stops working at once. */
  @Post('/{clientId}/rotate-secret')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async rotatePartnerClientSecret(
    @Request() request: ExRequest,
    @Path() clientId: string,
  ): Promise<PartnerClientWithSecret> {
    const orgTenantId = this.requireOrgTenant(request)
    this.requireAdmin(request, orgTenantId)
    const rotated = await partnerClientService.rotateSecret(orgTenantId, clientId)
    this.audit(orgTenantId, request, 'partner_client_secret_rotated', clientId, {})
    return rotated
  }

  /** Stop this partner from verifying anyone. Cannot be undone; register a new client instead. */
  @Post('/{clientId}/revoke')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async revokePartnerClient(
    @Request() request: ExRequest,
    @Path() clientId: string,
  ): Promise<{ client: PartnerClient; hydraRemoved: boolean }> {
    const orgTenantId = this.requireOrgTenant(request)
    this.requireAdmin(request, orgTenantId)
    const result = await partnerClientService.revoke(orgTenantId, clientId, this.actorId(request))
    this.audit(orgTenantId, request, 'partner_client_revoked', clientId, { hydraRemoved: result.hydraRemoved })
    return result
  }

  private requireOrgTenant(request: ExRequest): string {
    const tenantId = String((request as any)?.user?.tenantId || '').trim()
    if (!tenantId) throw new StatusException('Organization context required', 401)
    const row = DatabaseManager.getDatabase()
      .prepare(`SELECT 1 FROM organizations WHERE tenant_id = ? AND status = 'active' LIMIT 1`)
      .get(tenantId)
    if (!row) throw new StatusException('Organization context required', 403)
    return tenantId
  }

  private requireAdmin(request: ExRequest, orgTenantId: string): void {
    const userId = this.actorId(request)
    if (!userId) throw new StatusException('Authenticated organization member required', 401)
    const membership = DatabaseManager.getDatabase()
      .prepare(`SELECT role FROM org_memberships WHERE user_id = ? AND org_tenant_id = ? AND status = 'active' LIMIT 1`)
      .get(userId, orgTenantId) as { role?: string } | undefined
    if (!['owner', 'admin'].includes(String(membership?.role || '').toLowerCase())) {
      throw new StatusException('Only owners or admins can manage partner sign-in', 403)
    }
  }

  private actorId(request: ExRequest): string {
    return String((request as any)?.user?.id || '').trim()
  }

  private audit(orgTenantId: string, request: ExRequest, actionType: string, clientId: string, details: object) {
    void auditService.logAction({
      tenantId: orgTenantId,
      actionType,
      resourceId: clientId,
      details: { actorId: this.actorId(request), ...details },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    })
  }
}
