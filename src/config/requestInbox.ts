export interface PlatformInboxRequest {
  id: string
  title?: string
  description?: string
  request_type?: string
  status: string
  created_at?: string
  nextStep?: {
    label: string
    hint?: string
    fields: Array<{ name: string; label: string; type: 'text' | 'number' | 'image'; required?: boolean; hint?: string }>
  }
}

export function isPlatformRequestWaiting(request: unknown): request is PlatformInboxRequest {
  if (
    !request ||
    typeof request !== 'object' ||
    !('id' in request) ||
    typeof request.id !== 'string' ||
    !('status' in request) ||
    typeof request.status !== 'string'
  )
    return false
  return (
    ['submitted', 'in_review'].includes(request.status) ||
    (['approved', 'in_fulfilment'].includes(request.status) && 'nextStep' in request && Boolean(request.nextStep))
  )
}
