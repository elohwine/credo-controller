export type RunningActionType = 'field_run' | 'requisition' | 'payment' | 'proof' | 'workflow'

export interface RunningAction {
  id: string
  type: RunningActionType
  title: string
  description?: string
  route: string
  refId?: string
  orgTenantId?: string
  status?: 'active' | 'completed' | 'blocked'
  createdAt: string
  updatedAt: string
}

const STORAGE_KEY = 'credoRunningActions.v1'
const MAX_ACTIONS = 60

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function sanitizeAction(input: unknown): RunningAction | null {
  if (!isRecord(input)) return null

  const id = typeof input.id === 'string' ? input.id.trim() : ''
  const type = typeof input.type === 'string' ? (input.type.trim() as RunningActionType) : 'workflow'
  const title = typeof input.title === 'string' ? input.title.trim() : ''
  const route = typeof input.route === 'string' ? input.route.trim() : ''
  const createdAt =
    typeof input.createdAt === 'string' && input.createdAt.trim() ? input.createdAt : new Date().toISOString()
  const updatedAt = typeof input.updatedAt === 'string' && input.updatedAt.trim() ? input.updatedAt : createdAt

  if (!id || !title || !route) return null

  return {
    id,
    type,
    title,
    route,
    description: typeof input.description === 'string' ? input.description : undefined,
    refId: typeof input.refId === 'string' ? input.refId : undefined,
    orgTenantId: typeof input.orgTenantId === 'string' ? input.orgTenantId : undefined,
    status: input.status === 'completed' || input.status === 'blocked' ? input.status : 'active',
    createdAt,
    updatedAt,
  }
}

export function getRunningActions(): RunningAction[] {
  if (typeof window === 'undefined') return []

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []

    const parsed = JSON.parse(raw)
    const rows = Array.isArray(parsed) ? parsed : []

    return rows
      .map((row) => sanitizeAction(row))
      .filter((row): row is RunningAction => Boolean(row))
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
  } catch {
    return []
  }
}

function writeActions(actions: RunningAction[]): void {
  if (typeof window === 'undefined') return

  const normalized = actions
    .map((row) => sanitizeAction(row))
    .filter((row): row is RunningAction => Boolean(row))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, MAX_ACTIONS)

  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
}

export function upsertRunningAction(
  input: Omit<RunningAction, 'createdAt' | 'updatedAt'> & { createdAt?: string },
): void {
  const now = new Date().toISOString()
  const next: RunningAction = {
    ...input,
    status: input.status || 'active',
    createdAt: input.createdAt || now,
    updatedAt: now,
  }

  const current = getRunningActions()
  const existingIndex = current.findIndex((item) => item.id === next.id)

  if (existingIndex >= 0) {
    const existing = current[existingIndex]
    current[existingIndex] = {
      ...existing,
      ...next,
      createdAt: existing.createdAt || next.createdAt,
      updatedAt: now,
    }
  } else {
    current.unshift(next)
  }

  writeActions(current)
}

export function removeRunningAction(id: string): void {
  const trimmed = String(id || '').trim()
  if (!trimmed) return

  const next = getRunningActions().filter((row) => row.id !== trimmed)
  writeActions(next)
}

/**
 * Finds an unfinished share-screen attempt for any of the given references (request, requisition,
 * job run, payment). Works the same for every workflow: the inbox shows "Resume" instead of
 * starting a new proof request, which the server would refuse for the first one anyway.
 */
export function findRunningProofResume(refs: Array<string | undefined | null>): RunningAction | undefined {
  const wanted = refs.map((r) => String(r || '').trim()).filter(Boolean)
  if (wanted.length === 0) return undefined
  return getRunningActions().find((row) => {
    if (row.status === 'completed' || !row.route.startsWith('/present')) return false
    return wanted.some((ref) => row.refId === ref || row.route.includes(`=${encodeURIComponent(ref)}`))
  })
}

/**
 * Drops the resume entries for one proof-guarded step (a requisition, a job, a payment), whatever
 * the workflow. Each attempt opens a fresh proof request, so a stored route from a finished or
 * ended attempt must not be resumed.
 */
export function removeRunningProofResume(ref: string): void {
  const trimmed = String(ref || '').trim()
  if (!trimmed) return

  const marker = `=${encodeURIComponent(trimmed)}`
  const next = getRunningActions().filter((row) => !(row.refId === trimmed || row.route.includes(marker)))
  writeActions(next)
}

export function markRunningActionStatus(id: string, status: RunningAction['status']): void {
  const trimmed = String(id || '').trim()
  if (!trimmed) return

  const current = getRunningActions()
  const index = current.findIndex((row) => row.id === trimmed)
  if (index < 0) return

  current[index] = {
    ...current[index],
    status: status || 'active',
    updatedAt: new Date().toISOString(),
  }
  writeActions(current)
}
