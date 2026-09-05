import { DatabaseManager } from '../persistence/DatabaseManager'
import { workflowRepository } from '../persistence/WorkflowRepository'
import { WorkflowService, WorkflowExecutionResult } from './WorkflowService'
import { authorizationService } from './AuthorizationService'
import { platformRequestService } from './PlatformRequestService'

/**
 * Application boundary between organizational requests and the existing
 * WorkflowService execution engine.
 *
 * This service deliberately does not implement workflow execution. It only
 * applies tenant/object authorization, resolves the authenticated subject,
 * and correlates an existing workflow run with a platform request.
 */
export class PlatformWorkflowService {
  constructor(private readonly workflowService = new WorkflowService()) {}

  async startForRequest(
    requestId: string,
    workflowId: string,
    tenantId: string,
    subjectRef: string,
    input: Record<string, unknown> = {}
  ): Promise<WorkflowExecutionResult> {
    const principal = platformRequestService.resolvePrincipal(tenantId, subjectRef)
    const db = DatabaseManager.getDatabase()

    const request = db.prepare(`
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
    `).get(requestId, tenantId) as {
      id?: string
      organizationId?: string
      requesterPersonId?: string
      requestType?: string
      status?: string
    } | undefined

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

    const workflow = workflowRepository.findById(workflowId)
    if (!workflow) throw new Error('Workflow not found')
    if (workflow.tenantId !== tenantId) throw new Error('Workflow does not belong to authenticated tenant')

    const workflowInput = {
      requestId,
      requestType: request.requestType,
      ...input,
    }

    const result = await this.workflowService.executeWorkflow(
      workflowId,
      workflowInput,
      tenantId,
      { triggerType: 'manual', triggerRef: requestId, async: true }
    )

    db.prepare(`
      UPDATE requests
      SET workflow_id = ?, workflow_run_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND organization_id = ?
    `).run(workflowId, result.runId, requestId, request.organizationId)

    db.prepare(`
      INSERT INTO request_events (
        id, request_id, event_type, actor_person_id,
        from_status, to_status, payload_json
      ) VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?)
    `).run(
      requestId,
      'workflow.started',
      principal.personId,
      request.status ?? null,
      request.status ?? null,
      JSON.stringify({ workflowId, runId: result.runId })
    )

    return result
  }

  async getRunStatus(requestId: string, tenantId: string, subjectRef: string) {
    const request = platformRequestService.getForSubject(requestId, tenantId, subjectRef)
    if (!request) throw new Error('Request not found')
    if (!request.workflow_run_id) return undefined

    return this.workflowService.getRunStatus(request.workflow_run_id)
  }
}

export const platformWorkflowService = new PlatformWorkflowService()
