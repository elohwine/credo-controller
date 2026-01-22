import { Controller, Get, Route, Tags, Query, Request, Security } from 'tsoa'
import type { Request as ExRequest } from 'express'
import { auditService } from '../../services/AuditService'
import { AuditLog } from '../../types/trust'

@Route('api/audit')
@Tags('Audit')
export class AuditController extends Controller {
  /**
   * Retrieve audit logs for the tenant (optionally filtered by resourceId).
   */
  @Get('logs')
  @Security('apiKey')
  public async getLogs(
    @Request() request: ExRequest,
    @Query() limit = 100,
    @Query() resourceId?: string
  ): Promise<AuditLog[]> {
    const tenantId = (request as any).user?.tenantId || 'default'
    return auditService.getLogs(tenantId, resourceId, limit)
  }
}
