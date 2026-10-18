import type { ConnectedRecordActivity } from '../../services/connected/ConnectedRecordService'
import type { OrgRecordType, OrgRecordTypeInput } from '../../services/connected/OrgRecordTypeService'
import type { RecordFileInput, RecordFilePreview, RecordFileResult } from '../../services/connected/RecordFileImport'
import type { Request as ExRequest } from 'express'

import { Body, Controller, Get, Path, Post, Put, Query, Request, Route, Security, Tags } from 'tsoa'

import { SCOPES } from '../../enums'
import { StatusException } from '../../errors'
import { DatabaseManager } from '../../persistence/DatabaseManager'
import { auditService } from '../../services/AuditService'
import { connectedRecordService } from '../../services/connected/ConnectedRecordService'
import { orgRecordTypeService } from '../../services/connected/OrgRecordTypeService'
import { recordFileImportService } from '../../services/connected/RecordFileImport'

/** Record types an organisation defines for its own software, and what its systems have sent. */
@Route('api/organizations/connected-systems')
@Tags('Organization Connected Systems')
export class ConnectedSystemsController extends Controller {
  @Get('/record-types')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async listOrgRecordTypes(
    @Request() request: ExRequest,
    @Query() includeRetired?: boolean,
  ): Promise<{ types: OrgRecordType[] }> {
    const orgTenantId = this.requireAdmin(request)
    return { types: orgRecordTypeService.list(orgTenantId, Boolean(includeRetired)) }
  }

  @Post('/record-types')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async createOrgRecordType(
    @Request() request: ExRequest,
    @Body() body: OrgRecordTypeInput,
  ): Promise<OrgRecordType> {
    const orgTenantId = this.requireAdmin(request)
    const created = await orgRecordTypeService.create(orgTenantId, this.actorId(request), body)
    this.audit(orgTenantId, request, 'org_record_type_created', created.credentialType, { version: created.version })
    return created
  }

  /** Publish a new version. Records already sent keep their version. */
  @Put('/record-types/{credentialType}')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async updateOrgRecordType(
    @Request() request: ExRequest,
    @Path() credentialType: string,
    @Body() body: Partial<OrgRecordTypeInput>,
  ): Promise<OrgRecordType> {
    const orgTenantId = this.requireAdmin(request)
    const updated = await orgRecordTypeService.update(orgTenantId, this.actorId(request), credentialType, body)
    this.audit(orgTenantId, request, 'org_record_type_versioned', credentialType, { version: updated.version })
    return updated
  }

  /** Stop sending this type. Records already sent stay valid. */
  @Post('/record-types/{credentialType}/retire')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async retireOrgRecordType(
    @Request() request: ExRequest,
    @Path() credentialType: string,
  ): Promise<OrgRecordType> {
    const orgTenantId = this.requireAdmin(request)
    const retired = orgRecordTypeService.retire(orgTenantId, credentialType)
    this.audit(orgTenantId, request, 'org_record_type_retired', credentialType, { version: retired.version })
    return retired
  }

  /**
   * Check a file your existing software exported (CSV with a header row, or a JSON list) against a
   * record type. Nothing is sent.
   */
  @Post('/record-types/{credentialType}/import/preview')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async previewRecordFile(
    @Request() request: ExRequest,
    @Path() credentialType: string,
    @Body() body: RecordFileInput,
  ): Promise<RecordFilePreview> {
    const orgTenantId = this.requireAdmin(request)
    return recordFileImportService.preview(orgTenantId, credentialType, body)
  }

  /** Send every valid row of the file. Uploading the same file again sends nothing twice. */
  @Post('/record-types/{credentialType}/import')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async importRecordFile(
    @Request() request: ExRequest,
    @Path() credentialType: string,
    @Body() body: RecordFileInput,
  ): Promise<RecordFileResult> {
    const orgTenantId = this.requireAdmin(request)
    const result = await recordFileImportService.send(orgTenantId, credentialType, body)
    this.audit(orgTenantId, request, 'connected_records_file_imported', credentialType, {
      sent: result.sent,
      alreadySent: result.alreadySent,
      failed: result.failed,
    })
    return result
  }

  @Get('/records')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async listConnectedRecords(
    @Request() request: ExRequest,
    @Query() limit?: number,
  ): Promise<{ records: ConnectedRecordActivity[] }> {
    const orgTenantId = this.requireAdmin(request)
    return { records: connectedRecordService.activity(orgTenantId, Number(limit) || 50) }
  }

  private requireAdmin(request: ExRequest): string {
    const orgTenantId = String((request as any)?.user?.tenantId || '').trim()
    if (!orgTenantId) throw new StatusException('Organization context required', 401)
    const db = DatabaseManager.getDatabase()
    if (!db.prepare(`SELECT 1 FROM organizations WHERE tenant_id = ? AND status = 'active' LIMIT 1`).get(orgTenantId)) {
      throw new StatusException('Organization context required', 403)
    }
    const userId = this.actorId(request)
    if (!userId) throw new StatusException('Authenticated organization member required', 401)
    const membership = db
      .prepare(`SELECT role FROM org_memberships WHERE user_id = ? AND org_tenant_id = ? AND status = 'active' LIMIT 1`)
      .get(userId, orgTenantId) as { role?: string } | undefined
    if (!['owner', 'admin'].includes(String(membership?.role || '').toLowerCase())) {
      throw new StatusException('Only owners or admins can manage connected systems', 403)
    }
    return orgTenantId
  }

  private actorId(request: ExRequest): string {
    return String((request as any)?.user?.id || '').trim()
  }

  private audit(orgTenantId: string, request: ExRequest, actionType: string, resourceId: string, details: object) {
    void auditService.logAction({
      tenantId: orgTenantId,
      actionType,
      resourceId,
      details: { actorId: this.actorId(request), ...details },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    })
  }
}
