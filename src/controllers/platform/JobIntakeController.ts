import type { Request as ExRequest } from 'express'
import { randomUUID } from 'crypto'

import { Body, Get, Path, Post, Query, Request, Route, Security, Tags } from 'tsoa'

import { StatusException } from '../../errors'
import { jobIntakeRepository, type JobIntakeInput, type JobIntakeStatus } from '../../persistence/JobIntakeRepository'
import { workflowRunRepository } from '../../persistence/WorkflowRunRepository'
import { workflowService } from '../../services/WorkflowService'
import { DatabaseManager } from '../../persistence/DatabaseManager'
import { IdempotencyGuard } from '../../utils/IdempotencyGuard'

interface Principal {
  tenantId: string
  subjectId: string
  role: string
}

function principalOf(request: ExRequest, dispatcherOnly = true): Principal {
  const user = (request as any).user
  if (!user?.tenantId || !user?.id) throw new StatusException('Organization-scoped login required', 401)
  const membership = DatabaseManager.getDatabase()
    .prepare(
      `SELECT role FROM org_memberships
       WHERE org_tenant_id = ? AND user_id = ? AND status = 'active'`,
    )
    .get(String(user.tenantId), String(user.id)) as { role?: string } | undefined
  if (!membership) throw new StatusException('An active organization membership is required.', 403)
  const role = String(membership.role || '').toLowerCase()
  if (
    dispatcherOnly &&
    (!['owner', 'admin', 'dispatcher', 'manager'].includes(role) ||
      String(user.orgRole || '').toLowerCase() !== role)
  ) {
    throw new StatusException('Only an owner, admin, dispatcher, or manager can manage job intake.', 403)
  }
  return { tenantId: String(user.tenantId), subjectId: String(user.id), role }
}

function validateInput(body: JobIntakeInput): void {
  if (!body || typeof body !== 'object') throw new StatusException('Job details are required', 400)
  if (typeof body.description !== 'string' || !body.description.trim() || body.description.length > 4000) {
    throw new StatusException('Description must be between 1 and 4000 characters', 400)
  }
  if (!Number.isFinite(body.amount) || body.amount <= 0) throw new StatusException('A positive job amount is required', 400)
  if (body.payoutAmount !== undefined && (!Number.isFinite(body.payoutAmount) || body.payoutAmount <= 0)) {
    throw new StatusException('Worker payout must be a positive amount when provided', 400)
  }
  if (typeof body.currency !== 'string' || !/^[A-Z]{3}$/.test(body.currency)) {
    throw new StatusException('Currency must be a three-letter uppercase code', 400)
  }
  if (body.requireConcealedWorkPhoto !== undefined && typeof body.requireConcealedWorkPhoto !== 'boolean') {
    throw new StatusException('requireConcealedWorkPhoto must be a boolean', 400)
  }
  for (const [field, max] of [
    ['poNumber', 120],
    ['problemType', 120],
    ['clientName', 240],
    ['clientPhone', 80],
    ['location', 500],
    ['scheduledDate', 40],
    ['vehicleReference', 120],
    ['sourceSender', 320],
    ['sourceSubject', 500],
  ] as const) {
    const value = body[field]
    if (value !== undefined && (typeof value !== 'string' || value.length > max)) {
      throw new StatusException(`${field} must be a string no longer than ${max} characters`, 400)
    }
  }
  if (body.attachments !== undefined) {
    if (!Array.isArray(body.attachments) || body.attachments.length > 6) {
      throw new StatusException('A job can have at most 6 source attachments', 400)
    }
    for (const attachment of body.attachments) {
      if (
        !attachment ||
        typeof attachment.filename !== 'string' ||
        typeof attachment.mediaType !== 'string' ||
        typeof attachment.contentBase64 !== 'string' ||
        attachment.contentBase64.length > 7_000_000
      ) {
        throw new StatusException('Each attachment needs a filename, supported type, and file content under 5 MB.', 400)
      }
    }
  }
}

@Route('api/platform/job-intake')
@Tags('Job Intake')
@Security('jwt', ['tenant'])
export class JobIntakeController {
  @Get('/')
  public list(@Request() request: ExRequest, @Query() status?: JobIntakeStatus) {
    const principal = principalOf(request)
    if (status && !['pending', 'assigning', 'assigned'].includes(status)) {
      throw new StatusException('Invalid job intake status', 400)
    }
    return { items: jobIntakeRepository.listForTenant(principal.tenantId, status) }
  }

  @Post('/')
  public create(
    @Request() request: ExRequest,
    @Body() body: JobIntakeInput,
  ) {
    const principal = principalOf(request)
    validateInput(body)
    if (body.sourceType === 'email' || body.sourceMessageId) {
      throw new StatusException('Email intake is not enabled on this endpoint.', 400)
    }
    const input = { ...body, reference: `FR-${Date.now()}-${randomUUID().slice(0, 8)}` }
    const db = DatabaseManager.getDatabase()
    const action = 'job-intake:create'
    const idempotency = IdempotencyGuard.guard(db, request, principal.tenantId, action)
    if (idempotency.duplicate) return idempotency.response
    try {
      const created = jobIntakeRepository.create(
        principal.tenantId,
        principal.subjectId,
        { ...input, sourceType: 'manual' },
        idempotency.key || undefined,
      )
      if (idempotency.key) IdempotencyGuard.record(db, idempotency.key, principal.tenantId, action, created)
      return created
    } catch (error) {
      if (error instanceof Error && /Attachment|filename|base64|file type/i.test(error.message)) {
        throw new StatusException(error.message, 400)
      }
      throw error
    }
  }

  @Post('/{intakeId}/assign')
  public async assign(
    @Request() request: ExRequest,
    @Path() intakeId: string,
    @Body() body: { assigneeId: string; receiverId?: string },
  ) {
    const principal = principalOf(request)
    const assigneeId = String(body?.assigneeId || '').trim()
    const receiverId = String(body?.receiverId || '').trim()
    if (!assigneeId || assigneeId.length > 160) throw new StatusException('Choose a field worker', 400)
    const db = DatabaseManager.getDatabase()
    const member = db
      .prepare(
        `SELECT role FROM org_memberships
         WHERE org_tenant_id = ? AND user_id = ? AND status = 'active'`,
      )
      .get(principal.tenantId, assigneeId) as { role?: string } | undefined
    const allowedRoles = new Set(['field_worker', 'technician', 'driver', 'inspector', 'dispatcher', 'supervisor'])
    if (!member || !allowedRoles.has(String(member.role || '').toLowerCase())) {
      throw new StatusException('The selected person is not an active field worker in this organization.', 403)
    }
    if (receiverId) {
      const receiver = db
        .prepare(
          `SELECT role FROM org_memberships
           WHERE org_tenant_id = ? AND user_id = ? AND status = 'active'`,
        )
        .get(principal.tenantId, receiverId) as { role?: string } | undefined
      if (!receiver) throw new StatusException('The sign-off person must be an active organization member.', 400)
    }

    const intake = jobIntakeRepository.getForTenant(intakeId, principal.tenantId)
    if (!intake) throw new StatusException('Job intake not found', 404)
    if (intake.status === 'assigned' && intake.workflowRunId) {
      return { intake, runId: intake.workflowRunId, status: 'assigned' }
    }
    if (intake.status === 'assigning') {
      const triggerRef = `job-intake:${intakeId}:attempt:${intake.assignmentAttempt}`
      const existingRun = workflowRunRepository.findRunByTriggerRef(principal.tenantId, triggerRef)
      if (existingRun && existingRun.status !== 'failed') {
        jobIntakeRepository.markAssigned(intakeId, principal.tenantId, existingRun.id)
        return {
          intake: jobIntakeRepository.getForTenant(intakeId, principal.tenantId),
          runId: existingRun.id,
          status: 'assigned',
        }
      }
      if (existingRun?.status === 'failed') jobIntakeRepository.resetAssignment(intakeId, principal.tenantId)
      else jobIntakeRepository.resetStaleAssignment(intakeId, principal.tenantId)
      const recovered = jobIntakeRepository.getForTenant(intakeId, principal.tenantId)
      if (recovered?.status === 'pending') {
        throw new StatusException('The prior assignment attempt did not finish. You can retry assigning this job.', 409)
      }
      throw new StatusException('This job is already being assigned. Refresh the intake list before retrying.', 409)
    }
    const attempt = jobIntakeRepository.beginAssignment(intakeId, principal.tenantId, assigneeId)
    if (!attempt) {
      throw new StatusException('This job intake changed. Refresh and try again.', 409)
    }

    try {
      const triggerRef = `job-intake:${intakeId}:attempt:${attempt}`
      const recoveredRun = workflowRunRepository.findRunByTriggerRef(principal.tenantId, triggerRef)
      if (recoveredRun) {
        if (recoveredRun.status === 'failed') {
          throw new StatusException('The previous assignment attempt failed. Retry the assignment from intake.', 409)
        }
        jobIntakeRepository.markAssigned(intakeId, principal.tenantId, recoveredRun.id)
        return {
          intake: jobIntakeRepository.getForTenant(intakeId, principal.tenantId),
          runId: recoveredRun.id,
          status: 'assigned',
        }
      }
      const payload = intake.payload
      const result = await workflowService.executeWorkflow(
        'field_execution_fept',
        {
          ...payload,
          requestId: intake.id,
          jobIntakeId: intake.id,
          sourceAttachments: intake.attachments,
          assigneeId,
          assigneeUserId: assigneeId,
          customerMsisdn: payload.clientPhone,
          ...(receiverId ? { receiverId } : {}),
        },
        principal.tenantId,
        { triggerType: 'manual', triggerRef },
      )
      if (result.status === 'failed' || !result.runId) {
        throw new Error(result.error || 'The field job could not be started')
      }
      if (!jobIntakeRepository.markAssigned(intakeId, principal.tenantId, result.runId)) {
        throw new StatusException('The assignment started but the intake record could not be updated. Refresh before retrying.', 500)
      }
      return {
        intake: jobIntakeRepository.getForTenant(intakeId, principal.tenantId),
        runId: result.runId,
        status: 'assigned',
      }
    } catch (error) {
      if (!(error instanceof StatusException && error.status === 500)) {
        jobIntakeRepository.resetAssignment(intakeId, principal.tenantId)
      }
      throw error
    }
  }

  @Get('/{intakeId}/attachments/{attachmentId}')
  public attachment(
    @Request() request: ExRequest,
    @Path() intakeId: string,
    @Path() attachmentId: string,
  ) {
    const principal = principalOf(request, false)
    const intake = jobIntakeRepository.getForTenant(intakeId, principal.tenantId)
    if (!intake) throw new StatusException('Job intake not found', 404)
    if (!['owner', 'admin', 'dispatcher', 'manager'].includes(principal.role) && intake.assignedTo !== principal.subjectId) {
      throw new StatusException('Only the assigned field worker or an intake manager can access these documents.', 403)
    }
    const attachment = jobIntakeRepository.getAttachmentForTenant(intakeId, attachmentId, principal.tenantId)
    if (!attachment) throw new StatusException('Attachment not found', 404)
    return {
      filename: attachment.filename,
      mediaType: attachment.mediaType,
      sizeBytes: attachment.sizeBytes,
      sha256: attachment.sha256,
      dataBase64: attachment.content.toString('base64'),
    }
  }
}
