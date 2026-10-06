import type { WorkflowExecutionResult } from './WorkflowService'

import { DatabaseManager } from '../persistence/DatabaseManager'
import { workflowRepository } from '../persistence/WorkflowRepository'
import { rootLogger } from '../utils/pinoLogger'

import { authorizationService } from './AuthorizationService'
import { platformRequestService } from './PlatformRequestService'
import {
  WorkflowPrerequisitesError,
  workflowReadinessService,
  type TemplateReadinessReport,
} from './WorkflowReadinessService'
import { WorkflowService } from './WorkflowService'

interface WorkflowTemplateRow {
  id: string
  tenantId: string
  workflowType: string
  name: string
  steps: string
  initiationSchema?: string | null
}

const logger = rootLogger.child({ module: 'PlatformWorkflowService' })

/**
 * Application boundary between organizational requests and the existing
 * WorkflowService execution engine.
 *
 * This service deliberately does not implement workflow execution. It only
 * applies tenant/object authorization, resolves the authenticated subject,
 * and correlates an existing workflow run with a platform request.
 */
export class PlatformWorkflowService {
  public constructor(private readonly workflowService = new WorkflowService()) {}

  /**
   * Execution gate: a workflow runs when the organization's configuration satisfies
   * the template's declared prerequisites. There is no `enabled` / activation flag.
   *
   * When prerequisites are missing an organization setup task is opened on the
   * request (inbox/action model) and WorkflowPrerequisitesError is thrown.
   */
  private assertWorkflowOperational(
    tenantId: string,
    requestId: string,
    workflowId: string,
    workflowType: string | undefined,
    actorPersonId?: string,
  ): TemplateReadinessReport {
    const templateRef = workflowType || workflowId
    const report = workflowReadinessService.evaluateTemplate(tenantId, templateRef)
    if (report.ready) {
      return report
    }

    const task = platformRequestService.openSetupTask(
      requestId,
      tenantId,
      report.blocking.map((item) => ({
        key: item.key,
        title: item.title,
        reason: item.reason,
        actionPath: item.actionPath,
        requiredFor: item.requiredFor,
      })),
      actorPersonId,
    )

    logger.warn(
      {
        tenantId,
        workflowId,
        workflowType: workflowType || null,
        taskId: task.taskId,
        missing: report.blocking.map((i) => i.key),
      },
      'Workflow prerequisites missing; setup task opened instead of starting run',
    )

    throw new WorkflowPrerequisitesError(report)
  }

  private ensureExecutableWorkflow(workflowId: string, tenantId: string) {
    const existing = workflowRepository.findById(workflowId)
    if (existing) {
      return existing
    }

    const db = DatabaseManager.getDatabase()
    const template = db
      .prepare(
        `
        SELECT
          id,
          tenant_id AS tenantId,
          workflow_type AS workflowType,
          name,
          steps,
          initiation_schema AS initiationSchema
        FROM workflow_templates
        WHERE id = ?
          AND tenant_id = ?
        LIMIT 1
      `,
      )
      .get(workflowId, tenantId) as WorkflowTemplateRow | undefined

    if (!template) {
      return undefined
    }

    const parsedSteps = JSON.parse(template.steps) as Array<{ action: string; config?: Record<string, unknown> }>
    const actions = parsedSteps.map((step) => ({ action: step.action, config: step.config || {} }))

    const parsedInputSchema = template.initiationSchema ? JSON.parse(template.initiationSchema) : {}

    workflowRepository.save({
      id: template.id,
      tenantId,
      name: template.name || template.workflowType,
      category: template.workflowType,
      provider: 'workflow-template',
      description: `Auto-materialized from template ${template.id}`,
      inputSchema: parsedInputSchema,
      actions,
    })

    return workflowRepository.findById(template.id)
  }

  public async startForRequest(
    requestId: string,
    workflowId: string,
    tenantId: string,
    subjectRef: string,
    input: Record<string, unknown> = {},
  ): Promise<WorkflowExecutionResult> {
    const principal = platformRequestService.resolvePrincipal(tenantId, subjectRef)
    const db = DatabaseManager.getDatabase()

    const request = db
      .prepare(
        `
      SELECT
        r.id,
        r.organization_id AS organizationId,
        r.requester_person_id AS requesterPersonId,
        r.request_type AS requestType,
        r.status
      FROM requests r
      JOIN organizations o ON o.id = r.organization_id
      WHERE r.id = ?
        AND o.tenant_id = ?
        AND o.status = 'active'
      LIMIT 1
    `,
      )
      .get(requestId, tenantId) as
      | {
          id?: string
          organizationId?: string
          requesterPersonId?: string
          requestType?: string
          status?: string
        }
      | undefined

    if (!request?.organizationId || !request.requesterPersonId) {
      throw new Error('Request not found')
    }

    const decision = authorizationService.decide({
      tenantId,
      personId: principal.personId,
      action: 'request.execute',
      requiredPermission: 'request.execute',
      resourceType: 'request',
      resourceId: requestId,
    })

    if (decision.decision !== 'allow') {
      throw new Error(`Insufficient authority: ${decision.reasonCode}`)
    }

    const workflow = this.ensureExecutableWorkflow(workflowId, tenantId)
    if (!workflow) throw new Error('Workflow not found')
    if (workflow.tenantId !== tenantId) throw new Error('Workflow does not belong to authenticated tenant')
    this.assertWorkflowOperational(tenantId, requestId, workflowId, workflow.category, principal.personId)

    const workflowInput = {
      requestId,
      requestType: request.requestType,
      ...input,
    }

    const result = await this.workflowService.executeWorkflow(workflowId, workflowInput, tenantId, {
      triggerType: 'manual',
      triggerRef: requestId,
      async: true,
    })

    db.prepare(
      `
      UPDATE requests
      SET workflow_id = ?, workflow_run_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND organization_id = ?
    `,
    ).run(workflowId, result.runId, requestId, request.organizationId)

    db.prepare(
      `
      INSERT INTO request_events (
        id, request_id, event_type, actor_person_id,
        from_status, to_status, payload_json
      ) VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      requestId,
      'workflow.started',
      principal.personId,
      request.status ?? null,
      request.status ?? null,
      JSON.stringify({ workflowId, runId: result.runId }),
    )

    return result
  }

  public async getRunStatus(requestId: string, tenantId: string, subjectRef: string) {
    const request = platformRequestService.getForSubject(requestId, tenantId, subjectRef)
    if (!request) throw new Error('Request not found')
    if (!request.workflow_run_id) return undefined

    return this.workflowService.getRunStatus(request.workflow_run_id)
  }

  public async completeTask(
    requestId: string,
    taskId: string,
    tenantId: string,
    subjectRef: string,
    outcomeRef?: string,
  ): Promise<WorkflowExecutionResult | undefined> {
    const principal = platformRequestService.resolvePrincipal(tenantId, subjectRef)
    const db = DatabaseManager.getDatabase()

    const task = db
      .prepare(
        `SELECT t.id, t.status, t.assignee_person_id AS assigneePersonId
         FROM request_tasks t
         JOIN requests r ON r.id = t.request_id
         JOIN organizations o ON o.id = r.organization_id
         WHERE t.id = ? AND t.request_id = ? AND o.tenant_id = ?
         LIMIT 1`,
      )
      .get(taskId, requestId, tenantId) as
      | {
          id?: string
          status?: string
          assigneePersonId?: string | null
        }
      | undefined

    if (!task?.id) throw new Error('Task not found')
    if (task.status !== 'pending') throw new Error(`Task is already ${task.status}`)

    if (task.assigneePersonId && task.assigneePersonId !== principal.personId) {
      const decision = authorizationService.decide({
        tenantId,
        personId: principal.personId,
        action: 'request.task.complete',
        requiredPermission: 'request.task.complete',
        resourceType: 'request_task',
        resourceId: taskId,
      })
      if (decision.decision !== 'allow') {
        throw new Error(`Insufficient authority: ${decision.reasonCode}`)
      }
    }

    db.prepare(
      `
      UPDATE request_tasks
      SET status = 'completed', completed_at = CURRENT_TIMESTAMP, outcome_ref = ?
      WHERE id = ? AND status = 'pending'
    `,
    ).run(outcomeRef ?? null, taskId)

    const request = db
      .prepare(
        `SELECT r.workflow_run_id AS workflowRunId
         FROM requests r
         JOIN organizations o ON o.id = r.organization_id
         WHERE r.id = ? AND o.tenant_id = ?
         LIMIT 1`,
      )
      .get(requestId, tenantId) as { workflowRunId?: string | null } | undefined

    if (request?.workflowRunId) {
      return this.workflowService.resumeWorkflow(request.workflowRunId, { taskId, outcomeRef })
    }

    return undefined
  }
}

export const platformWorkflowService = new PlatformWorkflowService()
