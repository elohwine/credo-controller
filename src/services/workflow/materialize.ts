/**
 * Materialize an executable `workflows` record from an organization's configured
 * workflow template (or from the in-memory template registry when the org has not
 * persisted one yet).
 *
 * Shared by PlatformWorkflowService (request → workflow) and the `workflow.start`
 * action (workflow → workflow). Neither consults the legacy `enabled` flag; the
 * readiness resolver decides whether a workflow may run.
 */

import type { WorkflowTemplateDefinition } from '../../types/WorkflowTemplate'

import { workflowRepository, type WorkflowRecord } from '../../persistence/WorkflowRepository'
import { WorkflowTemplateRepository } from '../../persistence/WorkflowTemplateRepository'

import { getWorkflowTypeCandidates, normalizeWorkflowTypeAlias } from './initiation'
import { getTemplateById, instantiateTemplate } from './templates'

const templateRepository = new WorkflowTemplateRepository()

function normalize(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
}

/**
 * Find the organization's persisted template for a template id or workflow type.
 */
export function findOrgTemplate(tenantId: string, templateRef: string): WorkflowTemplateDefinition | undefined {
  const orgTemplates = templateRepository.listByTenantId(tenantId)
  const byId = orgTemplates.find((template) => template.id === templateRef)
  if (byId) return byId

  const candidates = getWorkflowTypeCandidates(templateRef)
  return orgTemplates.find((template) => candidates.includes(normalize(template.workflowType)))
}

function saveFromDefinition(tenantId: string, template: WorkflowTemplateDefinition): WorkflowRecord | undefined {
  const actions = (template.steps || []).map((step) => ({ action: step.action, config: step.config || {} }))
  workflowRepository.save({
    id: template.id,
    tenantId,
    name: template.name || template.workflowType,
    category: template.workflowType,
    provider: 'workflow-template',
    description: `Auto-materialized from template ${template.id}`,
    inputSchema: template.initiation?.inputSchema ?? {},
    actions,
  })
  return workflowRepository.findById(template.id)
}

/**
 * Ensure an executable workflow exists for `templateRef` in this tenant and return it.
 *
 * Resolution order:
 *   1. existing `workflows` row with that id belonging to the tenant
 *   2. org's persisted template (by id or workflow type alias) → materialized
 *   3. in-memory template registry (canonical id) → instantiated for the tenant
 */
function sameActions(a: Array<{ action: string; config?: unknown }>, b: Array<{ action: string; config?: unknown }>) {
  const shape = (list: Array<{ action: string; config?: unknown }>) =>
    JSON.stringify((list || []).map((step) => [step.action, step.config || {}]))
  return shape(a) === shape(b)
}

/**
 * A materialized row is a cache of the org template. When the template's steps change
 * (for example FEPT gaining inspection / risk checkpoints) refresh the row so new jobs use
 * the current steps. Runs already started keep their own snapshot.
 */
function refreshIfStale(
  record: WorkflowRecord,
  tenantId: string,
  template: WorkflowTemplateDefinition,
): WorkflowRecord | undefined {
  if (record.provider !== 'workflow-template') return record
  const current = (template.steps || []).map((step) => ({ action: step.action, config: step.config || {} }))
  if (sameActions(record.actions as any, current)) return record
  return saveFromDefinition(tenantId, template) || record
}

export function ensureExecutableWorkflow(tenantId: string, templateRef: string): WorkflowRecord | undefined {
  const existing = workflowRepository.findById(templateRef)
  if (existing && existing.tenantId === tenantId) {
    const own = findOrgTemplate(tenantId, templateRef)
    return own && own.id === existing.id ? refreshIfStale(existing, tenantId, own) : existing
  }

  const orgTemplate = findOrgTemplate(tenantId, templateRef)
  if (orgTemplate) {
    const byTemplateId = workflowRepository.findById(orgTemplate.id)
    if (byTemplateId && byTemplateId.tenantId === tenantId) {
      return refreshIfStale(byTemplateId, tenantId, orgTemplate)
    }
    return saveFromDefinition(tenantId, orgTemplate)
  }

  const canonical = normalizeWorkflowTypeAlias(templateRef)
  const inMemory = getTemplateById(canonical) || getTemplateById(templateRef)
  if (inMemory) {
    const id = `${inMemory.id}-${tenantId}`
    const record = instantiateTemplate(inMemory, tenantId)
    const requestType = getWorkflowTypeCandidates(inMemory.id).find((candidate) => candidate !== inMemory.id) || canonical
    const already = workflowRepository.findById(id)
    if (already && already.tenantId === tenantId) {
      // Built-in templates evolve (new pauses / checkpoints); refresh the cached row so new jobs use them.
      if (sameActions(already.actions as any, record.actions as any)) return already
      workflowRepository.save({ ...record, id, category: requestType })
      return workflowRepository.findById(id) || already
    }
    workflowRepository.save({ ...record, id, category: requestType })
    return workflowRepository.findById(id)
  }

  for (const candidate of getWorkflowTypeCandidates(templateRef)) {
    const builtin = templateRepository.findBuiltinByWorkflowType(candidate)
    if (!builtin) continue
    return saveFromDefinition(tenantId, { ...builtin, id: `${builtin.id}-${tenantId}`, workflowType: candidate })
  }

  return undefined
}
