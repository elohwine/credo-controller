import api from '@/lib/api'
import { upsertRunningAction } from '@/lib/runningActions'
import { requestDecisionBlockText, type RequestDecisionView } from '../../shared/requestDecision'

/**
 * Deciding an organisation request, from the organisation's Requests screen. The inbox card only
 * asks to switch and opens that screen, the same way a job step opens the job.
 */
export async function decidePlatformRequest(input: {
  requestId: string
  action: 'approve' | 'reject'
  reason?: string
  orgToken: string
}): Promise<void> {
  const headers = { Authorization: `Bearer ${input.orgToken}` }
  const { data: request } = await api.get(`/api/platform/requests/${encodeURIComponent(input.requestId)}`, { headers })
  if (request?.id !== input.requestId) throw new Error('The request details did not match. Close it and open it again.')
  const decision = request?.decision as (RequestDecisionView & { version?: string }) | undefined
  if (!decision?.[input.action === 'approve' ? 'canApprove' : 'canReject']) {
    throw new Error(requestDecisionBlockText(decision))
  }
  if (input.action === 'reject' && !String(input.reason || '').trim()) throw new Error('Please say why you are declining.')
  await api.post(
    `/api/platform/requests/${encodeURIComponent(input.requestId)}/decision`,
    { decision: input.action, reason: input.action === 'reject' ? String(input.reason).trim() : undefined },
    {
      headers: {
        ...headers,
        'x-idempotency-key': `request-decision:${input.requestId}:${input.action}:${decision.version || request.updated_at || request.status}`,
      },
    },
  )
}

/** Prepares the staff-card share for an approval and returns the share screen to open. */
export async function staffCardApprovalRoute(input: {
  requestId: string
  orgToken: string
  orgTenantId?: string
  title?: string
  description?: string
}): Promise<string> {
  const { data } = await api.post(
    `/api/platform/requests/${encodeURIComponent(input.requestId)}/proof/request`,
    { toStatus: 'approved' },
    { headers: { Authorization: `Bearer ${input.orgToken}` } },
  )
  const requestUrl = data?.presentationRequestUrl as string | undefined
  if (!requestUrl) throw new Error('This approval could not be prepared. Try again.')
  const params = new URLSearchParams({
    request_uri: requestUrl,
    mode: 'request-staff-card',
    platformRequestId: input.requestId,
    toStatus: 'approved',
  })
  if (input.orgTenantId) params.set('orgTenantId', input.orgTenantId)
  if (data?.requestId) params.set('requestId', String(data.requestId))
  if (data?.purposeLine) params.set('purpose', String(data.purposeLine))
  if (input.title) params.set('title', input.title)
  const route = `/present?${params.toString()}`
  upsertRunningAction({
    id: `request:${input.requestId}`,
    type: 'proof',
    title: input.title || 'Request approval',
    description: input.description,
    route,
    refId: input.requestId,
    orgTenantId: input.orgTenantId,
    status: 'active',
  })
  return route
}
