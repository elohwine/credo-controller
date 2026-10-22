export interface PlatformInboxRequest {
  id: string
  title?: string
  description?: string
  request_type?: string
  status: string
  created_at?: string
  updated_at?: string
  nextStep?: {
    label: string
    hint?: string
    fields: Array<{ name: string; label: string; type: 'text' | 'number' | 'image'; required?: boolean; hint?: string }>
  }
  decision?: {
    version: string
    stageAction: string
    stageLabel: string
    actorLabel: string
    actorMode: string
    canAct: boolean
    canApprove: boolean
    canReject: boolean
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

/** Decided requests that no longer wait on anyone, kept under Done for the given window. */
export function isPlatformRequestDecided(request: unknown, sinceMs: number): request is PlatformInboxRequest {
  if (!request || typeof request !== 'object' || isPlatformRequestWaiting(request)) return false
  const row = request as Partial<PlatformInboxRequest>
  if (typeof row.id !== 'string' || typeof row.status !== 'string') return false
  if (!['approved', 'rejected', 'completed', 'cancelled', 'in_fulfilment'].includes(row.status)) return false
  const decidedAt = Date.parse(platformRequestDecidedAt(row))
  return Number.isFinite(decidedAt) && decidedAt >= sinceMs
}

/** ISO time of the last change. SQLite stores UTC as "YYYY-MM-DD HH:MM:SS" with no zone. */
export function platformRequestDecidedAt(request: Partial<PlatformInboxRequest>): string {
  const raw = String(request.updated_at || request.created_at || '').trim()
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(raw)) return `${raw.replace(' ', 'T')}Z`
  return raw
}
