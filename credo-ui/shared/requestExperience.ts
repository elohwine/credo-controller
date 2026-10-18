import {
  projectRequestExperience,
  type RequestExperience,
  type RequestExperienceEvent,
} from '../../src/config/requestExperience'

export type { RequestExperience } from '../../src/config/requestExperience'

export function assertRequestDetail(value: unknown, requestId: string): asserts value is { id: string } {
  if (!value || typeof value !== 'object' || !('id' in value) || value.id !== requestId) {
    throw new Error('The request details were not returned. Close this request and try again.')
  }
}

/** Explicit server identity wins over request-name heuristics; delegated cards keep the same resource. */
export function requestIdFromStageCard(sourceId: unknown, claims: Record<string, unknown>): string | undefined {
  const source = typeof sourceId === 'string' ? sourceId.replace(/:delegation:.*$/, '') : ''
  return claims.resourceType === 'request' &&
    typeof claims.resourceId === 'string' &&
    claims.resourceId.length > 0 &&
    claims.resourceId === source
    ? source
    : undefined
}

export function requestExperienceForRow(
  row: {
    id: string
    request_type?: string
    requestType?: string
    kind?: string
    status?: string
    events?: unknown[]
    experience?: RequestExperience
  },
  workflowType?: string,
): RequestExperience {
  if (
    row.experience?.version === 1 &&
    row.experience.resourceType === 'request' &&
    row.experience.resourceId === row.id
  ) {
    return row.experience
  }
  const events = row.events?.filter(
    (event): event is RequestExperienceEvent =>
      event !== null &&
      typeof event === 'object' &&
      (!('to_status' in event) || typeof event.to_status === 'string' || event.to_status === null),
  )
  const aliases: Record<string, string> = { pending: 'submitted', fulfilled: 'completed' }
  return projectRequestExperience({
    id: row.id,
    requestType: row.request_type || row.requestType || row.kind || 'general',
    workflowType,
    status: aliases[row.status || ''] || row.status || 'draft',
    events,
  })
}
