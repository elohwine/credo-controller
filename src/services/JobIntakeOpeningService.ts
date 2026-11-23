import { DatabaseManager } from '../persistence/DatabaseManager'
import { jobIntakeRepository, type JobIntakeRecord } from '../persistence/JobIntakeRepository'
import { rootLogger } from '../utils/pinoLogger'

import { sqliteTime } from './JobHistoryPromotionService'
import { operationsRegisterService } from './OperationsRegisterService'
import { workflowService } from './WorkflowService'

const logger = rootLogger.child({ module: 'JobIntakeOpeningService' })

const FIELD_JOB_WORKFLOW = 'field_execution_fept'
const FIELD_ROLES = new Set(['field_worker', 'technician', 'driver', 'inspector', 'dispatcher', 'supervisor'])

export interface IntakeOpenResult {
  opened: number
  assigned: number
  /** Possible repeats of a job already booked: they wait for someone to check them. */
  skipped: number
  failed: number
}

const nameKey = (name: string) => name.toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * A job that came in from the old system, from the jobs mailbox or was typed in becomes an ordinary
 * field job straight away: the same run, stages and job view as one made with "New job". When the
 * old system already had a worker on it who is on the team, it goes to them; otherwise it waits on
 * the Jobs list as unassigned until an owner or admin gives it out from the job view.
 */
export class JobIntakeOpeningService {
  public async open(intake: JobIntakeRecord): Promise<'opened' | 'assigned' | 'skipped'> {
    if (intake.status !== 'pending' || intake.duplicateOf) return 'skipped'
    const payload = intake.payload
    const assigneeId = this.teamMemberNamed(intake.tenantId, payload.importedWorkerName)
    const attempt = jobIntakeRepository.beginAssignment(intake.id, intake.tenantId, assigneeId || null)
    if (!attempt) return 'skipped'
    try {
      const result = await workflowService.executeWorkflow(
        FIELD_JOB_WORKFLOW,
        {
          ...payload,
          reference: payload.reference || intake.id,
          requestId: intake.id,
          jobIntakeId: intake.id,
          sourceAttachments: intake.attachments,
          ...(payload.clientPhone ? { customerMsisdn: payload.clientPhone } : {}),
          ...(assigneeId ? { assigneeId, assigneeUserId: assigneeId } : { awaitAssignment: true }),
        },
        intake.tenantId,
        { triggerType: 'manual', triggerRef: `job-intake:${intake.id}:attempt:${attempt}` },
      )
      if (result.status === 'failed' || !result.runId) throw new Error(result.error || 'The field job could not be started')
      if (!jobIntakeRepository.markAssigned(intake.id, intake.tenantId, result.runId)) {
        throw new Error('The job started but its intake record could not be updated')
      }
      this.keepOriginalDate(result.runId, intake)
      return assigneeId ? 'assigned' : 'opened'
    } catch (error) {
      jobIntakeRepository.resetAssignment(intake.id, intake.tenantId)
      throw error
    }
  }

  /** Every job still waiting in intake for this organisation. Safe to run again. */
  public async openPending(orgTenantId: string): Promise<IntakeOpenResult> {
    const result: IntakeOpenResult = { opened: 0, assigned: 0, skipped: 0, failed: 0 }
    const ids = DatabaseManager.getDatabase()
      .prepare(`SELECT id FROM job_intakes WHERE tenant_id = ? AND status = 'pending' ORDER BY created_at ASC`)
      .all(orgTenantId) as Array<{ id: string }>
    for (const { id } of ids) {
      const intake = jobIntakeRepository.getForTenant(id, orgTenantId)
      if (!intake) continue
      try {
        result[await this.open(intake)] += 1
      } catch (error: any) {
        result.failed += 1
        logger.warn({ orgTenantId, intakeId: id, error: error?.message }, 'Job intake could not be opened as a job')
      }
    }
    return result
  }

  /** Opens one intake and never throws: a job that cannot start yet stays in intake to be booked by hand. */
  public async openQuietly(intake: JobIntakeRecord | undefined): Promise<void> {
    if (!intake) return
    try {
      await this.open(intake)
    } catch (error: any) {
      logger.warn({ intakeId: intake.id, error: error?.message }, 'Job intake stays waiting to be booked')
    }
  }

  private teamMemberNamed(orgTenantId: string, workerName?: string): string | undefined {
    if (!workerName?.trim()) return undefined
    const wanted = nameKey(workerName)
    const db = DatabaseManager.getDatabase()
    for (const [userId, name] of operationsRegisterService.memberNamesSafe(orgTenantId)) {
      if (nameKey(name) !== wanted) continue
      const member = db
        .prepare(`SELECT role FROM org_memberships WHERE org_tenant_id = ? AND user_id = ? AND status = 'active'`)
        .get(orgTenantId, userId) as { role?: string } | undefined
      if (member && FIELD_ROLES.has(String(member.role || '').toLowerCase())) return userId
    }
    return undefined
  }

  /** An old-system job keeps the date it came in, so the Jobs list reads in the order it happened. */
  private keepOriginalDate(runId: string, intake: JobIntakeRecord): void {
    if (intake.payload.sourceType !== 'import') return
    const received = sqliteTime((intake.payload.importedDetails as any)?.receivedAt) || sqliteTime(intake.payload.scheduledDate)
    if (!received) return
    try {
      DatabaseManager.getDatabase().prepare('UPDATE workflow_runs SET created_at = ? WHERE id = ?').run(received, runId)
    } catch (error: any) {
      logger.warn({ runId, error: error?.message }, 'Imported job keeps today as its date')
    }
  }
}

export const jobIntakeOpeningService = new JobIntakeOpeningService()
