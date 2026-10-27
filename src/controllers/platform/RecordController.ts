import type { Request as ExRequest } from 'express'

import { Body, Controller, Get, Path, Post, Query, Request, Route, Security, Tags } from 'tsoa'

import { SCOPES } from '../../enums'
import { StatusException } from '../../errors'
import { DatabaseManager } from '../../persistence/DatabaseManager'
import { getTenantById } from '../../persistence/TenantRepository'
import { accountsPayableLedgerService } from '../../services/AccountsPayableLedgerService'
import { platformRequestService } from '../../services/PlatformRequestService'
import { receivablePlanService } from '../../services/ReceivablePlanService'
import {
  workflowAuditService,
  type AuditRecordKind,
  type WorkflowAuditFormat,
  type WorkflowAuditResult,
} from '../../services/WorkflowAuditService'
import { IdempotencyGuard } from '../../utils/IdempotencyGuard'

/** Kinds served here. Jobs keep `/workflows/runs/{id}/audit`, whose access rules include the assigned worker. */
type RecordKind = Exclude<AuditRecordKind, 'job'>
const RECORD_KINDS: RecordKind[] = ['request', 'supplier_bill', 'collection']
const MONEY_ROLES = ['owner', 'admin', 'finance_manager', 'accountant']
const EXPORT_NAMES: Record<RecordKind, string> = {
  request: 'request-history',
  supplier_bill: 'supplier-bill-history',
  collection: 'payment-plan-history',
}

/**
 * One History, export and cancel path for requests, supplier bills and payment plans.
 * History rows and the CSV come from WorkflowAuditService, the same projection a job uses.
 * Cancel calls the service that owns the record.
 */
@Route('api/records')
@Tags('Records')
@Security('jwt', [SCOPES.TENANT_AGENT])
export class RecordController extends Controller {
  @Get('{kind}/{id}/history')
  public async history(
    @Path() kind: string,
    @Path() id: string,
    @Request() request: ExRequest,
    @Query() status?: string,
    @Query() event?: string,
    @Query() from?: string,
    @Query() to?: string,
    @Query() format: WorkflowAuditFormat = 'json',
  ): Promise<WorkflowAuditResult | { error: string }> {
    try {
      const recordKind = this.kindOf(kind)
      const caller = this.caller(request)
      const canRead =
        ['owner', 'admin'].includes(caller.role) ||
        caller.permissions.includes('audit.read') ||
        (recordKind !== 'request' && MONEY_ROLES.includes(caller.role)) ||
        (recordKind === 'request' && this.canReadRequest(id, caller.tenantId, caller.userId))
      if (!canRead) throw new StatusException('You do not have permission to view this history.', 403)
      if (
        format === 'csv' &&
        !['owner', 'admin'].includes(caller.role) &&
        !caller.permissions.includes('report.read')
      ) {
        throw new StatusException('You do not have permission to export reports.', 403)
      }
      const result = workflowAuditService.readRecord(recordKind, id, caller.tenantId, {
        status,
        event,
        from,
        to,
        format,
      })
      if (!result) throw new StatusException('Record not found', 404)
      if (format === 'csv' && request.res) {
        request.res.status(200)
        request.res.setHeader('Content-Type', 'text/csv; charset=utf-8')
        request.res.setHeader(
          'Content-Disposition',
          `attachment; filename="${EXPORT_NAMES[recordKind]}-${id.slice(0, 8)}.csv"`,
        )
        request.res.send(result.csv || '')
      }
      return result
    } catch (error: any) {
      this.setStatus(error instanceof StatusException ? error.status : 500)
      return { error: error.message }
    }
  }

  /** Cancel a request, an unpaid supplier bill or a payment plan. A repeat answers with the first result. */
  @Post('{kind}/{id}/cancel')
  public async cancel(
    @Path() kind: string,
    @Path() id: string,
    @Request() request: ExRequest,
    @Body() body?: { reason?: string },
  ): Promise<{ kind: string; id: string; status: string } | { error: string }> {
    try {
      const recordKind = this.kindOf(kind)
      const caller = this.caller(request)
      const db = DatabaseManager.getDatabase()
      const action = `record-cancel:${recordKind}:${id}`
      const idempotency = IdempotencyGuard.guard(db, request, caller.tenantId, action)
      if (idempotency.duplicate) return idempotency.response
      const naturalKey = `natural:record-cancel:${caller.tenantId}:${recordKind}:${id}`
      const replay = IdempotencyGuard.checkAndReturn(db, naturalKey, caller.tenantId, action)
      if (replay) return replay.response

      const reason = String(body?.reason || '')
        .trim()
        .slice(0, 500)
      if (recordKind === 'request') {
        // Who may cancel a request (the requester, or the person deciding it) is the request service's rule.
        platformRequestService.transitionBySubject(
          id,
          caller.tenantId,
          caller.userId,
          'cancelled',
          reason ? { reason } : {},
        )
      } else {
        if (!MONEY_ROLES.includes(caller.role)) {
          throw new StatusException('Only an owner, admin or finance manager can cancel this.', 403)
        }
        if (recordKind === 'supplier_bill') accountsPayableLedgerService.cancelBill(caller.tenantId, id)
        else receivablePlanService.cancelPlan(caller.tenantId, id)
      }

      const result = { kind: recordKind, id, status: 'cancelled' }
      if (idempotency.key) IdempotencyGuard.record(db, idempotency.key, caller.tenantId, action, result)
      IdempotencyGuard.record(db, naturalKey, caller.tenantId, action, result)
      return result
    } catch (error: any) {
      this.setStatus(error instanceof StatusException ? error.status : error?.status || 500)
      return { error: error.message }
    }
  }

  private kindOf(kind: string): RecordKind {
    if (!RECORD_KINDS.includes(kind as RecordKind)) {
      throw new StatusException('Choose a request, a supplier bill or a payment plan.', 400)
    }
    return kind as RecordKind
  }

  private caller(request: ExRequest) {
    const user = (request as any).user || {}
    const tenantId = String(user.tenantId || '')
    if (!tenantId || getTenantById(tenantId)?.tenantType !== 'ORG') {
      throw new StatusException('Switch into your organisation to open this record.', 403)
    }
    const userId = String(user.sub || user.id || '')
    const membership = DatabaseManager.getDatabase()
      .prepare(
        `SELECT m.role, r.permissions
           FROM org_memberships m
           LEFT JOIN organizations o ON o.tenant_id = m.org_tenant_id
           LEFT JOIN roles r ON r.organization_id = o.id AND r.membership_role = m.role
          WHERE m.org_tenant_id = ? AND m.user_id = ? AND m.status = 'active'
          LIMIT 1`,
      )
      .get(tenantId, userId) as { role?: string; permissions?: string } | undefined
    if (!membership) throw new StatusException('You are not a member of this organisation.', 403)
    let permissions: string[] = []
    try {
      permissions = membership.permissions ? JSON.parse(membership.permissions) : []
    } catch {
      permissions = []
    }
    return { tenantId, userId, role: String(membership.role || '').toLowerCase(), permissions }
  }

  /** Same rule as opening the request: the requester, the person deciding it, or `request.read`. */
  private canReadRequest(requestId: string, tenantId: string, userId: string): boolean {
    try {
      return Boolean(platformRequestService.getForSubject(requestId, tenantId, userId))
    } catch {
      return false
    }
  }
}
