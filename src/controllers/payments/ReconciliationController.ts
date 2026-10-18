/**
 * Reconciliation read API for the organisation's money views (mobile Activity, inbox exceptions).
 *
 * Every route reads the caller's own organisation from the signed token. A `tenantId` in the
 * query is ignored unless it matches, so one organisation can never read another's payments.
 * Totals and exceptions are office data: field roles get 403, the same set as AR.
 */
import type { Request as ExRequest } from 'express'

import { Controller, Get, Path, Query, Request, Route, Security, Tags } from 'tsoa'

import { SCOPES } from '../../enums'
import { StatusException } from '../../errors'
import { getTenantById } from '../../persistence/TenantRepository'
import {
  reconciliationService,
  type AuditTimelineResult,
  type ReconciliationEvent,
  type ReconciliationStatusRecord,
  type ReconciliationSummary,
} from '../../services/ReconciliationService'
import { managesWork, membershipFor } from '../../services/RunAccessPolicy'

function callerTenant(request: ExRequest, requestedTenantId?: string): string {
  const user = (request as any).user as Record<string, any> | undefined
  const tenantId = user?.tenantId as string | undefined
  if (!tenantId) throw new StatusException('Unauthorized', 401)
  if (requestedTenantId && requestedTenantId !== tenantId) {
    throw new StatusException('You can only read your own organisation', 403)
  }
  return tenantId
}

function assertOfficeRole(request: ExRequest): void {
  const user = (request as any).user as Record<string, any> | undefined
  const tenant = user?.tenantId ? getTenantById(user.tenantId) : undefined
  if (tenant?.tenantType !== 'ORG') return
  // The live membership decides, not the role copied into the token when it was issued.
  const userId = String(user?.id || '')
  if (userId && userId === user?.tenantId) return
  if (!managesWork(membershipFor(String(user?.tenantId), userId))) {
    throw new StatusException('Only office roles can see payment reconciliation', 403)
  }
}

@Route('api/reconciliation')
@Tags('Reconciliation')
@Security('jwt', [SCOPES.TENANT_AGENT])
export class ReconciliationController extends Controller {
  /** Totals by state (reconciled, waiting, exceptions) for the caller's organisation. */
  @Get('summary')
  public async getSummary(@Request() request: ExRequest, @Query() tenantId?: string): Promise<ReconciliationSummary> {
    const scoped = callerTenant(request, tenantId)
    assertOfficeRole(request)
    return reconciliationService.getSummary(scoped)
  }

  /** Payments that need a person: payout failed, paid with no receipt, disputed. */
  @Get('exceptions')
  public async getExceptions(
    @Request() request: ExRequest,
    @Query() tenantId?: string,
    @Query() limit?: number,
  ): Promise<{ exceptions: ReconciliationStatusRecord[] }> {
    const scoped = callerTenant(request, tenantId)
    assertOfficeRole(request)
    return { exceptions: reconciliationService.getExceptions(scoped, Math.min(limit || 50, 200)) }
  }

  /** Fully matched payments, for the ledger view. */
  @Get('reconciled')
  public async getReconciled(
    @Request() request: ExRequest,
    @Query() tenantId?: string,
    @Query() limit?: number,
  ): Promise<{ reconciled: ReconciliationStatusRecord[] }> {
    const scoped = callerTenant(request, tenantId)
    assertOfficeRole(request)
    return { reconciled: reconciliationService.getReconciled(scoped, Math.min(limit || 50, 200)) }
  }

  /** One payment's current state, when it belongs to the caller's organisation. */
  @Get('status/{providerRef}')
  public async getTransactionStatus(
    @Request() request: ExRequest,
    @Path() providerRef: string,
  ): Promise<{ found: boolean; status?: ReconciliationStatusRecord }> {
    const scoped = callerTenant(request)
    const status = reconciliationService.getStatus(providerRef)
    if (!status || (status.tenantId && status.tenantId !== scoped)) {
      this.setStatus(404)
      return { found: false }
    }
    return { found: true, status }
  }

  /** Every event for one payment, in order, when it belongs to the caller's organisation. */
  @Get('events/{providerRef}')
  public async getEvents(
    @Request() request: ExRequest,
    @Path() providerRef: string,
  ): Promise<{ events: ReconciliationEvent[] }> {
    const scoped = callerTenant(request)
    const status = reconciliationService.getStatus(providerRef)
    if (status?.tenantId && status.tenantId !== scoped) return { events: [] }
    return { events: reconciliationService.getEvents(providerRef) }
  }

  /** Payment events + job steps + evidence refs for one reference; office roles see the detail. */
  @Get('audit/{providerRef}')
  public async getAuditTimeline(
    @Request() request: ExRequest,
    @Path() providerRef: string,
    @Query() includeWorkflow?: boolean,
  ): Promise<AuditTimelineResult> {
    const scoped = callerTenant(request)
    const orgRole = String(((request as any).user as Record<string, any> | undefined)?.orgRole || '')
    return reconciliationService.getAuditTimeline(providerRef, {
      viewerTenantId: scoped,
      includeWorkflow: includeWorkflow !== false,
      includeSensitiveDetails: orgRole === 'owner' || orgRole === 'admin' || orgRole === 'issuer',
    })
  }
}
