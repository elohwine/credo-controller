import type { Request as ExRequest } from 'express'

import { Body, Get, Path, Post, Put, Query, Request, Route, Security, Tags } from 'tsoa'

import { StatusException } from '../../errors'
import { DatabaseManager } from '../../persistence/DatabaseManager'
import { jobAttentionService } from '../../services/JobAttentionService'
import { operationsRegisterService, type VanStatus } from '../../services/OperationsRegisterService'

const MANAGERS = ['owner', 'admin', 'dispatcher', 'manager']

function principalOf(request: ExRequest, managersOnly: boolean) {
  const user = (request as any).user
  if (!user?.tenantId || !user?.id) throw new StatusException('Organization-scoped login required', 401)
  const membership = DatabaseManager.getDatabase()
    .prepare(`SELECT role FROM org_memberships WHERE org_tenant_id = ? AND user_id = ? AND status = 'active'`)
    .get(String(user.tenantId), String(user.id)) as { role?: string } | undefined
  if (!membership) throw new StatusException('An active organization membership is required.', 403)
  const role = String(membership.role || '').toLowerCase()
  if (managersOnly && !MANAGERS.includes(role)) {
    throw new StatusException('Only an owner, admin, dispatcher or manager can change this.', 403)
  }
  return { tenantId: String(user.tenantId), subjectId: String(user.id), role }
}

/** Service messages written for people become 400s; anything else stays a server error. */
function asBadRequest<T>(work: () => T): T {
  try {
    return work()
  } catch (error) {
    if (error instanceof StatusException) throw error
    if (error instanceof Error && !/SQLITE|no such table/i.test(error.message)) {
      const conflict = /already (in use|on the register|saved)/i.test(error.message)
      throw new StatusException(error.message, conflict ? 409 : /not found/i.test(error.message) ? 404 : 400)
    }
    throw error
  }
}

/**
 * Stores (clients with a store number), attendants (staff with a staff number), the van register,
 * and the schedule check the job forms use to avoid booking a store, a worker or a van twice.
 */
@Route('api/platform/operations')
@Tags('Operations registers')
@Security('jwt', ['tenant'])
export class OperationsRegisterController {
  @Get('/stores')
  public stores(@Request() request: ExRequest) {
    const principal = principalOf(request, false)
    return { items: operationsRegisterService.listStores(principal.tenantId) }
  }

  @Get('/stores/{storeNumber}')
  public storeFile(@Request() request: ExRequest, @Path() storeNumber: string) {
    const principal = principalOf(request, false)
    const file = operationsRegisterService.storeFile(principal.tenantId, storeNumber)
    if (!file) throw new StatusException('No store or job uses that store number yet.', 404)
    return file
  }

  @Get('/attendants')
  public attendants(@Request() request: ExRequest) {
    const principal = principalOf(request, false)
    return { items: operationsRegisterService.listAttendants(principal.tenantId) }
  }

  @Get('/attendants/{userId}')
  public attendantFile(@Request() request: ExRequest, @Path() userId: string) {
    const principal = principalOf(request, false)
    if (!MANAGERS.includes(principal.role) && principal.subjectId !== userId) {
      throw new StatusException('You can open your own file only.', 403)
    }
    const file = operationsRegisterService.attendantFile(principal.tenantId, userId)
    if (!file) throw new StatusException('That person is not on the team.', 404)
    return file
  }

  @Put('/attendants/{userId}')
  public saveAttendant(
    @Request() request: ExRequest,
    @Path() userId: string,
    @Body() body: { staffNumber: string; skills?: string[] },
  ) {
    const principal = principalOf(request, true)
    return asBadRequest(() => operationsRegisterService.saveAttendantProfile(principal.tenantId, userId, body || {}))
  }

  @Get('/vans')
  public vans(@Request() request: ExRequest) {
    const principal = principalOf(request, false)
    return { items: operationsRegisterService.listVans(principal.tenantId) }
  }

  @Post('/vans')
  public addVan(
    @Request() request: ExRequest,
    @Body()
    body: { registration: string; description?: string; serviceDay?: string; motDue?: string; driverUserId?: string },
  ) {
    const principal = principalOf(request, true)
    return asBadRequest(() => operationsRegisterService.saveVan(principal.tenantId, principal.subjectId, { ...body, id: undefined }))
  }

  @Put('/vans/{vanId}')
  public updateVan(
    @Request() request: ExRequest,
    @Path() vanId: string,
    @Body()
    body: {
      registration?: string
      description?: string
      serviceDay?: string
      motDue?: string
      /** null takes the van off its driver */
      driverUserId?: string | null
      status?: VanStatus
    },
  ) {
    const principal = principalOf(request, true)
    return asBadRequest(() => operationsRegisterService.saveVan(principal.tenantId, principal.subjectId, { ...body, id: vanId }))
  }

  @Get('/vans/{vanId}')
  public vanFile(@Request() request: ExRequest, @Path() vanId: string) {
    const principal = principalOf(request, false)
    const file = operationsRegisterService.vanFile(principal.tenantId, vanId)
    if (!file) throw new StatusException('Van not found', 404)
    return file
  }

  /** Record a service, an MOT or an accident in the van's file. */
  @Post('/vans/{vanId}/events')
  public addVanEvent(
    @Request() request: ExRequest,
    @Path() vanId: string,
    @Body() body: { kind: 'service' | 'mot' | 'accident'; eventDate?: string; userId?: string; notes?: string; nextDue?: string },
  ) {
    const principal = principalOf(request, true)
    return asBadRequest(() => operationsRegisterService.addVanEvent(principal.tenantId, principal.subjectId, vanId, body || {}))
  }

  /**
   * Jobs that are stopped, late, have nobody on them or are not moving, and jobs nobody has booked.
   * The office sees them all; anyone else sees only the jobs they are on.
   */
  @Get('/attention')
  public attention(@Request() request: ExRequest) {
    const principal = principalOf(request, false)
    const items = jobAttentionService.attention(principal.tenantId)
    return {
      items: MANAGERS.includes(principal.role)
        ? items
        : items.filter((item) => item.assigneeId === principal.subjectId),
    }
  }

  @Get('/schedule-check')
  public scheduleCheck(
    @Request() request: ExRequest,
    @Query() storeNumber?: string,
    @Query() date?: string,
    @Query() assigneeId?: string,
    @Query() vanId?: string,
    @Query() excludeRunId?: string,
    @Query() excludeIntakeId?: string,
  ) {
    const principal = principalOf(request, false)
    return operationsRegisterService.scheduleCheck(principal.tenantId, {
      storeNumber,
      date,
      assigneeId,
      vanId,
      excludeRunId,
      excludeIntakeId,
    })
  }
}
