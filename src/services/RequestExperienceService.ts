import type { RequestExperienceDefinition, RequestExperienceEvent } from '../config/requestExperience'

import { projectRequestExperience, requestFamily } from '../config/requestExperience'
import { validateRequestExperience } from '../config/requestExperience'
import { StatusException } from '../errors'
import { DatabaseManager } from '../persistence/DatabaseManager'
import { WorkflowTemplateRepository } from '../persistence/WorkflowTemplateRepository'
import { rootLogger } from '../utils/pinoLogger'

const templates = new WorkflowTemplateRepository()

export function requestExperienceDefinition(
  tenantId: string,
  requestType: string,
  workflowType?: string,
): {
  workflowType: string
  definition: RequestExperienceDefinition
} {
  const declared = requestFamily(requestType, workflowType)
  const template = templates
    .listByTenantId(tenantId)
    .find(
      (candidate) =>
        candidate.experience &&
        [requestType, workflowType].some(
          (value) => value && (candidate.workflowType === value || candidate.id === value),
        ),
    )
  if (!template && !declared) {
    rootLogger.warn({ tenantId, requestType, workflowType }, 'No request experience declared; using generic review')
  }
  return {
    workflowType: template?.workflowType || workflowType || declared?.workflowType || requestType,
    definition: template?.experience ||
      declared?.experience || {
        version: 1,
        family: 'requests',
        reviewAction: 'approve_request',
      },
  }
}

export function saveRequestExperience(
  tenantId: string,
  templateId: string,
  expectedVersion: number,
  experience: RequestExperienceDefinition,
) {
  try {
    validateRequestExperience(experience)
  } catch (error) {
    throw new StatusException(error instanceof Error ? error.message : 'Invalid request experience', 400)
  }
  return DatabaseManager.getDatabase()
    .transaction(() => {
      const template = templates.findById(templateId)
      if (!template || template.tenantId !== tenantId) throw new StatusException('Workflow template not found', 404)
      if (!Number.isInteger(expectedVersion) || template.version !== expectedVersion) {
        throw new StatusException('Workflow template changed. Reload before saving.', 409)
      }
      const updated = { ...template, experience, version: template.version + 1 }
      templates.save(updated)
      return updated
    })
    .immediate()
}

export function experienceForRequest(
  tenantId: string,
  request: { id: string; request_type?: string; status?: string },
  events?: RequestExperienceEvent[],
) {
  const resolved = requestExperienceDefinition(tenantId, request.request_type || 'general')
  return projectRequestExperience({
    id: request.id,
    requestType: request.request_type || 'general',
    status: request.status || 'draft',
    workflowType: resolved.workflowType,
    definition: resolved.definition,
    events: events || requestExperienceEvents(request.id),
  })
}

export function requestExperienceEvents(requestId: string): RequestExperienceEvent[] {
  return DatabaseManager.getDatabase()
    .prepare(
      `SELECT e.*, p.subject_ref AS actor_user_id
         FROM request_events e
         LEFT JOIN people p ON p.id = e.actor_person_id
        WHERE e.request_id = ?
        ORDER BY e.created_at, e.rowid`,
    )
    .all(requestId) as RequestExperienceEvent[]
}
