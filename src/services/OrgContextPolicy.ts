import { DatabaseManager } from '../persistence/DatabaseManager'

/**
 * Who may open an organisation's own context (act as the organisation, with its DID and wallet).
 *
 * Only the people who control the organisation: owners and admins. Everyone else on the team
 * stays in their personal wallet and proves what they may do with their staff or role card
 * (the role-credential pattern, as with vLEI role credentials), so a worker never holds the
 * organisation's agent.
 */
export const ORG_CONTEXT_ROLES: ReadonlySet<string> = new Set(['owner', 'admin'])

export const ORG_CONTEXT_ADMINS_ONLY = 'org_context_admins_only'
export const ORG_CONTEXT_REVOKED = 'org_context_revoked'

export const ORG_CONTEXT_ADMINS_ONLY_MESSAGE =
  'Only owners and admins can open the organisation. Your jobs and approvals come to your personal inbox.'

export function roleMayOpenOrgContext(role: string | null | undefined): boolean {
  return ORG_CONTEXT_ROLES.has(String(role || '').toLowerCase())
}

/** The person's current role in the organisation, read live (an active membership only). */
export function liveOrgRole(userId: string, orgTenantId: string): string | null {
  if (!userId || !orgTenantId) return null
  const row = DatabaseManager.getDatabase()
    .prepare('SELECT role FROM org_memberships WHERE user_id = ? AND org_tenant_id = ? AND status = ?')
    .get(userId, orgTenantId, 'active') as { role: string } | undefined
  return row?.role ?? null
}

export function mayOpenOrgContext(userId: string, orgTenantId: string): boolean {
  return roleMayOpenOrgContext(liveOrgRole(userId, orgTenantId))
}

/**
 * An organisation token is only honoured while its holder still runs the organisation: a role
 * change or removal takes effect on the next request, not when the token expires.
 * Returns the live role when the token may be used, otherwise null.
 */
export function liveOrgContextRole(token: { id?: string; tenantId?: string; orgRole?: unknown }): string | null {
  const userId = String(token.id || '')
  const orgTenantId = String(token.tenantId || '')
  const role = liveOrgRole(userId, orgTenantId)
  return roleMayOpenOrgContext(role) ? role : null
}

/**
 * Task pass: how a team member who may not open the organisation still does one piece of the
 * organisation's work (a job, an approval, a payment) from their personal inbox.
 *
 * It is a short-lived, purpose-bound capability (least privilege, as in OAuth token exchange with
 * an actor): it carries the member's own id, is bound to the item(s) they opened, and is honoured
 * only on that item's own routes. It never unlocks the organisation's wallet, contacts, team
 * management or settings. Each route still checks that this person is the actor on the item.
 */
export const ORG_TASK_PURPOSES = ['job', 'request', 'requisition', 'payable', 'collection'] as const
export type OrgTaskPurpose = (typeof ORG_TASK_PURPOSES)[number]

export const ORG_TASK_CONTEXT = 'task'
export const ORG_TASK_SCOPE = 'org_task_scope'
export const ORG_TASK_SCOPE_MESSAGE = 'This step was opened for one task only. Open it again from your inbox.'
export const ORG_TASK_TTL_SECONDS = 30 * 60
export const ORG_TASK_MAX_REFS = 6

export function isOrgTaskPurpose(value: unknown): value is OrgTaskPurpose {
  return typeof value === 'string' && (ORG_TASK_PURPOSES as readonly string[]).includes(value)
}

/** Item identifiers the pass is bound to: trimmed, unique, path-safe, at most ORG_TASK_MAX_REFS. */
export function normalizeTaskRefs(refs: unknown): string[] {
  const list = Array.isArray(refs) ? refs : [refs]
  const out: string[] = []
  for (const value of list) {
    const ref = typeof value === 'string' ? value.trim() : ''
    if (!ref || ref.length > 200 || !/^[A-Za-z0-9._:@-]+$/.test(ref) || out.includes(ref)) continue
    out.push(ref)
    if (out.length >= ORG_TASK_MAX_REFS) break
  }
  return out
}

type TaskRoute = { methods: readonly string[] | '*'; pattern: string; bodyRef?: string }

const READ = ['GET'] as const
const ANY = '*' as const

// {org} is the pass's organisation; {ref} is one of the items the pass is bound to.
const COMMON_TASK_ROUTES: TaskRoute[] = [
  { methods: READ, pattern: '/api/organizations' },
  { methods: READ, pattern: '/api/organizations/{org}' },
  { methods: READ, pattern: '/api/organizations/{org}/workflows' },
  { methods: READ, pattern: '/api/organizations/{org}/workflows/actors' },
  { methods: READ, pattern: '/api/organizations/{org}/workflows/handoffs' },
  { methods: READ, pattern: '/api/organizations/{org}/members' },
  { methods: READ, pattern: '/api/organizations/{org}/setup/profile' },
  { methods: ['POST'], pattern: '/oidc/verifier/verify' },
  { methods: ['POST'], pattern: '/api/audit/client-events' },
  { methods: READ, pattern: '/api/audit/activity/{ref}' },
  { methods: READ, pattern: '/api/audit/activity/{ref}/paged' },
]

const TASK_ROUTES: Record<OrgTaskPurpose, TaskRoute[]> = {
  job: [
    { methods: READ, pattern: '/workflows/runs' },
    { methods: ANY, pattern: '/workflows/runs/{ref}' },
    { methods: ANY, pattern: '/workflows/runs/{ref}/**' },
  ],
  request: [
    { methods: ANY, pattern: '/api/platform/requests/{ref}' },
    { methods: ANY, pattern: '/api/platform/requests/{ref}/**' },
    { methods: ['POST'], pattern: '/api/platform/requests/transition', bodyRef: 'requestId' },
    { methods: ANY, pattern: '/workflow-requests/{ref}' },
    { methods: ANY, pattern: '/workflow-requests/{ref}/**' },
  ],
  requisition: [
    { methods: ANY, pattern: '/api/finance/requisitions/{ref}' },
    { methods: ANY, pattern: '/api/finance/requisitions/{ref}/**' },
    { methods: READ, pattern: '/workflow-requests/{ref}' },
  ],
  payable: [
    { methods: ANY, pattern: '/api/finance/ap/workflow-actions/{ref}' },
    { methods: ANY, pattern: '/api/finance/ap/workflow-actions/{ref}/**' },
    { methods: READ, pattern: '/api/finance/ap/my-remittances' },
  ],
  collection: [
    { methods: ANY, pattern: '/api/finance/ap/workflow-actions/{ref}/**' },
    { methods: READ, pattern: '/api/finance/ar/plans/{ref}' },
    { methods: READ, pattern: '/api/finance/ar/plans/{ref}/**' },
    { methods: READ, pattern: '/api/finance/ar/my-obligations' },
    { methods: READ, pattern: '/api/finance/ap/my-remittances' },
  ],
}

function decodeSegment(segment: string): string | null {
  try {
    return decodeURIComponent(segment)
  } catch {
    return null
  }
}

function matchTaskRoute(route: TaskRoute, segments: string[], orgTenantId: string, refs: string[]): boolean {
  const pattern = route.pattern.split('/').filter(Boolean)
  const tail = pattern[pattern.length - 1] === '**'
  const fixed = tail ? pattern.slice(0, -1) : pattern
  if (tail ? segments.length <= fixed.length : segments.length !== fixed.length) return false
  return fixed.every((part, index) => {
    const actual = segments[index]
    if (part === '{org}') return actual === orgTenantId
    if (part === '{ref}') return refs.includes(actual)
    return actual === part
  })
}

export interface OrgTaskRouteInput {
  purpose: unknown
  refs: unknown
  orgTenantId: string
  method: string
  /** Request path (query string is ignored). */
  path: string
  body?: unknown
}

/** Whether a task pass may be used on this request. */
export function taskRouteAllowed(input: OrgTaskRouteInput): boolean {
  if (!isOrgTaskPurpose(input.purpose) || !input.orgTenantId) return false
  const refs = normalizeTaskRefs(input.refs)
  if (refs.length === 0) return false
  const rawPath = String(input.path || '').split('?')[0].replace(/\/+$/, '')
  const segments: string[] = []
  for (const raw of rawPath.split('/').filter(Boolean)) {
    const segment = decodeSegment(raw)
    if (segment === null || segment === '.' || segment === '..') return false
    segments.push(segment)
  }
  const method = String(input.method || '').toUpperCase()
  const routes = [...COMMON_TASK_ROUTES, ...TASK_ROUTES[input.purpose]]
  return routes.some((route) => {
    if (route.methods !== ANY && !route.methods.includes(method)) return false
    if (!matchTaskRoute(route, segments, input.orgTenantId, refs)) return false
    if (!route.bodyRef) return true
    const value = (input.body as Record<string, unknown> | undefined)?.[route.bodyRef]
    return typeof value === 'string' && refs.includes(value.trim())
  })
}

/** A pass is honoured while the person is still an active member (any role). */
export function liveOrgTaskRole(token: { id?: string; tenantId?: string }): string | null {
  return liveOrgRole(String(token.id || ''), String(token.tenantId || ''))
}
