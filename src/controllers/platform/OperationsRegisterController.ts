import type { Request as ExRequest } from 'express'

import { Body, Get, Path, Post, Put, Query, Request, Route, Security, Tags } from 'tsoa'

import { StatusException } from '../../errors'
import { DatabaseManager } from '../../persistence/DatabaseManager'
import { FIELD_IMPORT_KINDS, isFieldImportKind } from '../../config/fieldDataImport'
import type { JobSheetItem } from '../../config/jobSheet'
import { fieldDataImportService } from '../../services/FieldDataImportService'
import { fieldJobSheetService } from '../../services/FieldJobSheetService'
import { jobAttentionService } from '../../services/JobAttentionService'
import { jobDashboardSettingsService, type JobResponseTargets } from '../../services/JobDashboardSettingsService'
import { jobHistoryPromotionService } from '../../services/JobHistoryPromotionService'
import { jobIntakeOpeningService } from '../../services/JobIntakeOpeningService'
import { jobRegisterService } from '../../services/JobRegisterService'
import {
  VAN_DAILY_CHECKS,
  operationsRegisterService,
  type VanPhotoInput,
  type VanStatus,
} from '../../services/OperationsRegisterService'

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

  /**
   * Check a file exported from the old job system (stores, staff, vans, tools, rates, jobs or job
   * check results) and say
   * what would be added, what is already here and which rows have a problem. Saves nothing.
   */
  @Post('/import/preview')
  public previewImport(
    @Request() request: ExRequest,
    @Body()
    body: {
      kind: 'stores' | 'people' | 'vans' | 'equipment' | 'rates' | 'jobs' | 'checks'
      content: string
      format?: 'csv' | 'json'
      /** Where local phone numbers in the file are from. Zimbabwe when not given. */
      country?: 'ZW' | 'GB' | 'ZA'
      /** Amounts without a currency column are in this currency. USD when not given. */
      currency?: string
    },
  ) {
    const principal = principalOf(request, true)
    return asBadRequest(() => {
      if (!isFieldImportKind(body?.kind)) {
        throw new Error(`Choose what the file holds: ${FIELD_IMPORT_KINDS.join(', ')}`)
      }
      return fieldDataImportService.preview(principal.tenantId, body.kind, body.content, body.format, body)
    })
  }

  /** Save the rows of a checked file. The same file again adds nothing. Open jobs go onto the Jobs list. */
  @Post('/import')
  public async runImport(
    @Request() request: ExRequest,
    @Body()
    body: {
      kind: 'stores' | 'people' | 'vans' | 'equipment' | 'rates' | 'jobs' | 'checks'
      content: string
      format?: 'csv' | 'json'
      /** Where local phone numbers in the file are from. Zimbabwe when not given. */
      country?: 'ZW' | 'GB' | 'ZA'
      /** Amounts without a currency column are in this currency. USD when not given. */
      currency?: string
    },
  ) {
    const principal = principalOf(request, true)
    const result = asBadRequest(() => {
      if (!isFieldImportKind(body?.kind)) {
        throw new Error(`Choose what the file holds: ${FIELD_IMPORT_KINDS.join(', ')}`)
      }
      return fieldDataImportService.commit(
        principal.tenantId,
        principal.subjectId,
        body.kind,
        body.content,
        body.format,
        body,
      )
    })
    if (body.kind === 'jobs' && result.waiting) await jobIntakeOpeningService.openPending(principal.tenantId)
    return result
  }

  /**
   * Turn finished jobs already brought in from the old system into ordinary closed jobs on the Jobs list,
   * and link every imported job to its store and client. Safe to run again.
   */
  @Post('/import/convert-history')
  public convertImportedHistory(@Request() request: ExRequest) {
    const principal = principalOf(request, true)
    return asBadRequest(() => {
      const relinked = fieldDataImportService.relinkImportedJobs(principal.tenantId).updated
      return { ...jobHistoryPromotionService.promote(principal.tenantId), relinked }
    })
  }

  /** Tools and devices the organisation has issued to its staff. */
  @Get('/equipment')
  public equipment(@Request() request: ExRequest) {
    const principal = principalOf(request, false)
    return { items: operationsRegisterService.listEquipment(principal.tenantId) }
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
    body: {
      registration: string
      description?: string
      serviceDay?: string
      motDue?: string
      taxDue?: string
      branch?: string
      mileage?: number
      driverUserId?: string
    },
  ) {
    const principal = principalOf(request, true)
    return asBadRequest(() =>
      operationsRegisterService.saveVan(principal.tenantId, principal.subjectId, { ...body, id: undefined }),
    )
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
      taxDue?: string
      branch?: string
      mileage?: number | null
      /** null takes the van off its driver */
      driverUserId?: string | null
      status?: VanStatus
    },
  ) {
    const principal = principalOf(request, true)
    return asBadRequest(() =>
      operationsRegisterService.saveVan(principal.tenantId, principal.subjectId, { ...body, id: vanId }),
    )
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
    @Body()
    body: {
      kind: 'service' | 'mot' | 'accident'
      eventDate?: string
      userId?: string
      notes?: string
      nextDue?: string
    },
  ) {
    const principal = principalOf(request, true)
    return asBadRequest(() =>
      operationsRegisterService.addVanEvent(principal.tenantId, principal.subjectId, vanId, body || {}),
    )
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

  @Get('/response-targets')
  public responseTargets(@Request() request: ExRequest) {
    const principal = principalOf(request, true)
    return { targets: jobDashboardSettingsService.responseTargets(principal.tenantId) }
  }

  @Put('/response-targets')
  public saveResponseTargets(@Request() request: ExRequest, @Body() body: { targets: Partial<JobResponseTargets> }) {
    const principal = principalOf(request, true)
    return asBadRequest(() => ({
      targets: jobDashboardSettingsService.saveResponseTargets(principal.tenantId, body?.targets || {}),
    }))
  }

  @Get('/map/today')
  public todayJobsMap(@Request() request: ExRequest) {
    const principal = principalOf(request, true)
    return jobDashboardSettingsService.todayJobsMap(principal.tenantId)
  }

  @Post('/map/today/geocode')
  public async geocodeTodayJobs(@Request() request: ExRequest, @Body() body: { confirmed: boolean; limit?: number }) {
    const principal = principalOf(request, true)
    try {
      return await jobDashboardSettingsService.geocodeTodayJobs(
        principal.tenantId,
        body?.confirmed === true,
        body?.limit,
      )
    } catch (error) {
      return asBadRequest(() => {
        throw error
      })
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

  /**
   * Every job in one list: booked jobs and jobs waiting in intake (from the mailbox or added by
   * the office), with the same filters on both apps. Anyone who is not office sees their own jobs.
   * `limit` and `offset` page the list (`total` is every match); `sort` is one of received, date,
   * reference, store, client, status or amount, with `dir` asc or desc.
   */
  @Get('/jobs')
  public jobs(
    @Request() request: ExRequest,
    @Query() source?: string,
    @Query() category?: string,
    @Query() storeNumber?: string,
    @Query() assigneeId?: string,
    @Query() from?: string,
    @Query() to?: string,
    @Query() q?: string,
    @Query() branch?: string,
    @Query() sort?: string,
    @Query() dir?: string,
    @Query() limit?: number,
    @Query() offset?: number,
  ) {
    const principal = principalOf(request, false)
    const manager = MANAGERS.includes(principal.role)
    return asBadRequest(() =>
      jobRegisterService.page(
        principal.tenantId,
        { source, category, storeNumber, assigneeId: manager ? assigneeId : principal.subjectId, branch, from, to, q },
        { sort, dir, limit, offset },
      ),
    )
  }

  /** The same list as a spreadsheet (CSV), with the same filters. */
  @Get('/jobs/export')
  public exportJobs(
    @Request() request: ExRequest,
    @Query() source?: string,
    @Query() category?: string,
    @Query() storeNumber?: string,
    @Query() assigneeId?: string,
    @Query() from?: string,
    @Query() to?: string,
    @Query() q?: string,
    @Query() branch?: string,
  ) {
    const principal = principalOf(request, true)
    const csv = asBadRequest(() =>
      jobRegisterService.csv(principal.tenantId, { source, category, storeNumber, assigneeId, from, to, q, branch }),
    )
    const res = (request as any).res
    if (res) {
      res.status(200)
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="jobs-${new Date().toISOString().slice(0, 10)}.csv"`)
      res.send(csv)
    }
    return csv
  }

  /** Active, completed, waiting and on-hold jobs, by source, store and worker. */
  @Get('/reports')
  public reports(
    @Request() request: ExRequest,
    @Query() from?: string,
    @Query() to?: string,
    @Query() source?: string,
  ) {
    const principal = principalOf(request, true)
    return asBadRequest(() => jobRegisterService.report(principal.tenantId, { from, to, source }))
  }

  /** The items a driver checks every day before the van goes out. */
  @Get('/van-checks')
  public vanCheckItems(@Request() request: ExRequest) {
    principalOf(request, false)
    return { items: [...VAN_DAILY_CHECKS] }
  }

  /** The driver's daily check: anyone on the team may record one for a van they take out. */
  @Post('/vans/{vanId}/checks')
  public addDailyCheck(
    @Request() request: ExRequest,
    @Path() vanId: string,
    @Body()
    body: {
      checks: Array<{ item: string; ok: boolean; note?: string }>
      mileage?: number
      notes?: string
      photos?: VanPhotoInput[]
    },
  ) {
    const principal = principalOf(request, false)
    return asBadRequest(() =>
      operationsRegisterService.recordDailyCheck(principal.tenantId, principal.subjectId, vanId, body || {}),
    )
  }

  /** A driver reports an accident with photos. */
  @Post('/vans/{vanId}/accidents')
  public reportAccident(
    @Request() request: ExRequest,
    @Path() vanId: string,
    @Body() body: { eventDate?: string; notes: string; photos?: VanPhotoInput[] },
  ) {
    const principal = principalOf(request, false)
    return asBadRequest(() =>
      operationsRegisterService.reportAccident(principal.tenantId, principal.subjectId, vanId, body || ({} as any)),
    )
  }

  @Get('/vans/{vanId}/events/{eventId}/photos/{photoId}')
  public vanEventPhoto(
    @Request() request: ExRequest,
    @Path() vanId: string,
    @Path() eventId: string,
    @Path() photoId: string,
  ) {
    const principal = principalOf(request, false)
    const photo = operationsRegisterService.vanEventPhoto(principal.tenantId, vanId, eventId, photoId)
    if (!photo) throw new StatusException('Photo not found', 404)
    return { filename: photo.filename, mediaType: photo.mediaType, dataBase64: photo.content.toString('base64') }
  }

  @Get('/rate-cards')
  public rateCards(@Request() request: ExRequest, @Query() archived?: boolean) {
    const principal = principalOf(request, false)
    return { items: fieldJobSheetService.listRateCards(principal.tenantId, archived === true) }
  }

  @Post('/rate-cards')
  public addRateCard(
    @Request() request: ExRequest,
    @Body() body: { name: string; unit?: string; unitPrice: number; currency?: string; problemType?: string },
  ) {
    const principal = principalOf(request, true)
    return asBadRequest(() => fieldJobSheetService.saveRateCard(principal.tenantId, { ...body, id: undefined }))
  }

  @Put('/rate-cards/{rateCardId}')
  public updateRateCard(
    @Request() request: ExRequest,
    @Path() rateCardId: string,
    @Body()
    body: {
      name?: string
      unit?: string
      unitPrice?: number
      currency?: string
      problemType?: string
      active?: boolean
    },
  ) {
    const principal = principalOf(request, true)
    return asBadRequest(() => fieldJobSheetService.saveRateCard(principal.tenantId, { ...body, id: rateCardId }))
  }

  /** Job sheets per problem type; a job with no matching sheet uses the general one. */
  @Get('/job-sheets')
  public jobSheets(@Request() request: ExRequest) {
    const principal = principalOf(request, false)
    return {
      items: fieldJobSheetService.listSheets(principal.tenantId),
      general: fieldJobSheetService.sheetFor(principal.tenantId).items,
    }
  }

  @Put('/job-sheets')
  public saveJobSheet(@Request() request: ExRequest, @Body() body: { problemType: string; items: JobSheetItem[] }) {
    const principal = principalOf(request, true)
    return asBadRequest(() => fieldJobSheetService.saveSheet(principal.tenantId, body?.problemType, body?.items))
  }
}
