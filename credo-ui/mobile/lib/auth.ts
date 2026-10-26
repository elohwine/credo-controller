/**
 * Auth helpers — mirrors portal localStorage key conventions
 */
import { resolveMobileApiBaseUrl } from './baseUrl'
import { refreshMemberships } from '../../shared/organizationMemberships'
import {
  isBoundTaskPath,
  readInboxTask,
  TASK_CONTEXT_KEY,
  TASK_CONTEXT_MAX_AGE_MS,
  type InboxTaskContext,
} from '../../shared/taskContext'

export interface UserProfile {
  phone: string
  username?: string
  role: 'guest' | 'holder' | 'issuer'
  tenantId?: string
  orgLabel?: string
}

export type ContextMode = 'personal' | 'org'

function decodeJwtBase64UrlSegment(segment: string): string | null {
  if (!segment) return null
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=')

  try {
    if (typeof atob === 'function') {
      return atob(padded)
    }
  } catch {
    // Fallback to Buffer in non-browser runtimes.
  }

  try {
    const bufferCtor = (globalThis as any).Buffer
    if (bufferCtor) {
      return bufferCtor.from(padded, 'base64').toString('utf8')
    }
  } catch {
    return null
  }

  return null
}

export function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const parts = token.split('.')
    if (parts.length < 2) return null
    const decoded = decodeJwtBase64UrlSegment(parts[1])
    if (!decoded) return null
    return JSON.parse(decoded)
  } catch {
    return null
  }
}

export function getWalletToken(): string | null {
  if (typeof window === 'undefined') return null
  return (
    localStorage.getItem('walletToken') ||
    localStorage.getItem('credoTenantToken') ||
    localStorage.getItem('tenantToken')
  )
}

export function getPersonalWalletTenantId(): string | null {
  if (typeof window === 'undefined') return null
  const token = getPersonalWalletToken()
  if (!token) return null
  const payload = decodeJwtPayload(token)
  return payload?.tenantId ?? null
}

export function getOrgToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('credoOrgToken') || null
}

function getStoredActiveOrg(): {
  orgTenantId?: string
  id?: string
  name?: string
  label?: string
  config?: { label?: string }
} | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = localStorage.getItem('credoActiveOrg')
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function getStoredActiveOrgId(): string | null {
  if (typeof window === 'undefined') return null
  const stored = getStoredActiveOrg()
  return stored?.orgTenantId ?? stored?.id ?? localStorage.getItem('credoTenantId') ?? null
}

function hasValidOrgTokenForActiveOrg(activeOrgId: string | null): boolean {
  if (typeof window === 'undefined' || !activeOrgId) return false

  const orgToken = localStorage.getItem('credoOrgToken')
  if (!orgToken) return false

  const payload = decodeJwtPayload(orgToken)
  const tokenTenantId = payload?.tenantId ?? payload?.orgTenantId ?? payload?.sub

  // When no tenant claim is present, treat token as potentially valid and let API enforce auth.
  if (!tokenTenantId || typeof tokenTenantId !== 'string') return true

  return tokenTenantId === activeOrgId
}

export const CREDENTIS_CONTEXT_CHANGED_EVENT = 'credentis-context-changed'

function announceContextChanged(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(CREDENTIS_CONTEXT_CHANGED_EVENT))
}

export function getContextMode(): ContextMode {
  if (typeof window === 'undefined') return 'personal'

  const mode = localStorage.getItem('credoContextMode')
  const activeOrgId = getStoredActiveOrgId()

  // Strict mode: if the user selected org context and an org is active,
  // keep org mode even when token is stale/missing. Do not silently downgrade
  // to personal context, because that mixes user/org data visibility.
  if (mode === 'org' && !!activeOrgId) {
    return 'org'
  }

  return 'personal'
}

/**
 * Strict token resolver: never falls back across contexts.
 * - org mode -> org token only
 * - personal mode -> wallet token only
 */
export function getContextTokenStrict(): string | null {
  if (typeof window === 'undefined') return null

  if (getContextMode() === 'org') {
    const activeOrgId = getStoredActiveOrgId()
    // Never use an org token that does not match the currently active org.
    if (!hasValidOrgTokenForActiveOrg(activeOrgId)) {
      return null
    }
    return getOrgToken()
  }

  return getWalletToken()
}

export function getActiveOrgId(): string | null {
  if (typeof window === 'undefined') return null

  const activeOrgId = getStoredActiveOrgId()
  if (!activeOrgId) return null

  return getContextMode() === 'org' ? activeOrgId : null
}

export function getActiveOrgLabel(): string | null {
  if (typeof window === 'undefined') return null
  if (getContextMode() !== 'org') return null

  const stored = getStoredActiveOrg()
  return stored?.name ?? stored?.label ?? stored?.config?.label ?? localStorage.getItem('credoOrgName') ?? null
}

export function getTenantSector(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('credoTenantSector')
}

export function getTenantFeatures(): string[] {
  // DEPRECATED (migration 062): features removed - query workflow_templates instead
  // Return empty array to avoid breaking existing code gracefully
  return []
}

export function getUserRole(): string | null {
  if (typeof window === 'undefined') return null

  if (getContextMode() === 'org') {
    // In org context return the human-facing org role (owner/admin/approver/…),
    // NOT the JWT 'role' field which is always 'RestTenantAgent'.
    return getOrgRoleClaim()
  }

  // A personal wallet token's 'role' is the agent type (RestTenantAgent), not a person's role.
  return 'holder'
}

export function getUserPhone(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('credoUserPhone') ?? localStorage.getItem('holderPhone')
}

export function getUserName(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('credoUserName') ?? localStorage.getItem('holderUsername')
}

export function clearAuth(): void {
  if (typeof window === 'undefined') return
  ;[
    'walletToken',
    'credoOrgToken',
    'credoActiveOrg',
    'credoTenantToken',
    'tenantToken',
    'credoTenantId',
    'tenantId',
    'credoOrgName',
    'credoTenantSector',
    'credoActiveWorkflowTypes',
    'credoActiveTemplateId',
    'credoUserRole',
    'credoUserPhone',
    'credoUserName',
    'holderPhone',
    'holderUsername',
    'credoRunningActions.v1',
    'credoTaskPass',
  ].forEach((key) => localStorage.removeItem(key))
}

interface ApplyOrgContextInput {
  orgId: string
  orgName: string
  orgToken: string
  orgRole?: string | null
  sector?: string | null
  workflowTypes?: string[]
}

/**
 * A task context is an organisation context opened from an inbox card, for that one task.
 *
 * Least privilege for people who act for an organisation from their personal inbox (field
 * workers, approvers): the switch lasts only while they are on the task's own pages. Leaving
 * them, closing the task, or finishing it puts the app back in the personal context, on the
 * personal inbox, so nobody stays inside the organisation's sections by accident.
 */
export type TaskContext = InboxTaskContext

export function beginTaskContext(input: { orgId: string; target?: string }): void {
  if (typeof window === 'undefined') return
  const task: TaskContext = { orgId: input.orgId, returnTo: '/inbox', target: input.target, startedAt: Date.now() }
  localStorage.setItem(TASK_CONTEXT_KEY, JSON.stringify(task))
  announceContextChanged()
}

export function getTaskContext(): TaskContext | null {
  if (typeof window === 'undefined') return null
  const task = readInboxTask(localStorage)
  if (!task) {
    if (localStorage.getItem(TASK_CONTEXT_KEY)) endTaskContext()
    return null
  }
  if (getContextMode() !== 'org' || getStoredActiveOrgId() !== task.orgId) {
    clearTaskContext()
    return null
  }
  if (Date.now() - task.startedAt >= TASK_CONTEXT_MAX_AGE_MS || task.startedAt > Date.now()) {
    endTaskContext()
    return null
  }
  return task
}

export function isTaskPath(url: string): boolean {
  const task = getTaskContext()
  return Boolean(task && isBoundTaskPath(task, url))
}

export function bindTaskPath(url: string): boolean {
  const task = getTaskContext()
  if (!task || !isBoundTaskPath(task, url)) return false
  if (!task.target) localStorage.setItem(TASK_CONTEXT_KEY, JSON.stringify({ ...task, target: url }))
  return true
}

/** Forget the task without changing context (the person chose a context themselves). */
export function clearTaskContext(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(TASK_CONTEXT_KEY)
  sessionStorage.removeItem(TASK_CONTEXT_KEY)
}

/** Finish the task: back to the personal context. Returns where to go, or null when no task was open. */
export function endTaskContext(): string | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(TASK_CONTEXT_KEY)
  if (!raw) return null
  clearTaskContext()
  setPersonalContext()
  return '/inbox'
}

const TASK_PASS_KEY = 'credoTaskPass'

/** Organisations the person may open themselves (owners and admins); others are task passes only. */
export const ORG_CONTEXT_ROLES = ['owner', 'admin']

export function mayOpenOrgContext(role: string | null | undefined): boolean {
  return ORG_CONTEXT_ROLES.includes(String(role || '').toLowerCase())
}

export interface TaskPass {
  orgId: string
  purpose: string
  refs: string[]
  expiresAt?: string
}

/** Marks the open organisation session as a task pass (one item only, never the whole organisation). */
export function setTaskPass(pass: TaskPass | null): void {
  if (typeof window === 'undefined') return
  if (pass) localStorage.setItem(TASK_PASS_KEY, JSON.stringify(pass))
  else localStorage.removeItem(TASK_PASS_KEY)
}

export function getTaskPass(): TaskPass | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(TASK_PASS_KEY)
    const pass = raw ? (JSON.parse(raw) as TaskPass) : null
    if (!pass?.orgId || getContextMode() !== 'org' || getStoredActiveOrgId() !== pass.orgId) return null
    return pass
  } catch {
    return null
  }
}

export function setPersonalContext(): void {
  if (typeof window === 'undefined') return

  clearTaskContext()
  localStorage.removeItem(TASK_PASS_KEY)

  localStorage.removeItem('credoOrgToken')
  localStorage.removeItem('credoTenantToken')
  localStorage.removeItem('tenantToken')
  localStorage.removeItem('credoTenantId')
  localStorage.removeItem('tenantId')
  localStorage.removeItem('credoOrgName')
  localStorage.removeItem('credoActiveOrg')
  localStorage.removeItem('credoTenantSector')
  localStorage.removeItem('credoActiveWorkflowTypes')
  localStorage.removeItem('credoActiveTemplateId')
  localStorage.removeItem('credoRunningActions.v1')
  localStorage.setItem('credoContextMode', 'personal')
  localStorage.setItem('credoUserRole', 'holder')
  announceContextChanged()
}

export function applyPersonalWalletContext(token: string, tenantId?: string | null): void {
  if (typeof window === 'undefined') return

  const payload = decodeJwtPayload(token)
  const normalizedTenantId = tenantId?.trim() || (typeof payload?.tenantId === 'string' ? payload.tenantId : null)
  if (!normalizedTenantId || payload?.tenantId !== normalizedTenantId || payload?.orgRole) {
    throw new Error('The sign-in did not return a personal wallet session.')
  }
  setPersonalContext()
  localStorage.removeItem('credoOrganizations')
  localStorage.setItem('walletToken', token)
  // Keep compatibility with API clients still reading tenant token keys.
  localStorage.setItem('credoTenantToken', token)
  localStorage.setItem('tenantToken', token)

  localStorage.setItem('credoTenantId', normalizedTenantId)
  localStorage.setItem('tenantId', normalizedTenantId)
  announceContextChanged()
}

export function applyOrgContext({
  orgId,
  orgName,
  orgToken,
  orgRole,
  sector,
  workflowTypes,
}: ApplyOrgContextInput): void {
  if (typeof window === 'undefined') return

  localStorage.removeItem(TASK_PASS_KEY)
  localStorage.setItem('credoOrgToken', orgToken)
  localStorage.setItem('credoTenantToken', orgToken)
  localStorage.setItem('tenantToken', orgToken)
  localStorage.setItem('credoContextMode', 'org')
  localStorage.setItem('credoTenantId', orgId)
  localStorage.setItem('tenantId', orgId)
  localStorage.setItem('credoOrgName', orgName)
  localStorage.setItem('credoActiveOrg', JSON.stringify({ orgTenantId: orgId, name: orgName }))

  if (sector && String(sector).trim().length > 0) localStorage.setItem('credoTenantSector', sector)
  else localStorage.removeItem('credoTenantSector')

  // features removed (migration 062) - no longer stored in localStorage

  if (orgRole && String(orgRole).trim().length > 0) localStorage.setItem('credoUserRole', orgRole)

  if (workflowTypes && Array.isArray(workflowTypes)) {
    localStorage.setItem('credoActiveWorkflowTypes', JSON.stringify(workflowTypes))
  } else {
    localStorage.removeItem('credoActiveWorkflowTypes')
  }
  announceContextChanged()
}

/**
 * Decodes the org JWT and returns the `role` claim.
 * Returns null when there is no org token or the token cannot be decoded.
 * Possible values from the backend: 'owner', 'admin', 'approver', 'field_worker', 'holder'
 */
export function getOrgRoleClaim(): string | null {
  if (typeof window === 'undefined') return null
  // The organisation session carries the role the server gave it (orgRole, NOT 'role', which is
  // always 'RestTenantAgent'). syncOrgContextFromServer replaces that session when the role changes.
  const orgToken = localStorage.getItem('credoOrgToken')
  const claim = orgToken ? decodeJwtPayload(orgToken)?.orgRole : null
  if (claim) return claim
  // Without a session claim, use the role saved at the last switch ('holder' means none yet).
  const persisted = localStorage.getItem('credoUserRole')
  if (persisted && persisted !== 'holder' && persisted !== 'RestTenantAgent') return persisted
  return null
}

/**
 * Returns true when the user has an org-role that allows approve / reject / issue actions.
 * Does NOT return true for field_worker or holder roles.
 */
export function isOrgActionRole(): boolean {
  const role = getOrgRoleClaim()
  return ['owner', 'admin', 'approver'].includes(role ?? '')
}

/**
 * Returns true when the user has an org-role that allows release / payout actions.
 * Stricter than isOrgActionRole — approver alone is not sufficient.
 */
export function isReleaseRole(): boolean {
  const role = getOrgRoleClaim()
  return ['owner', 'admin'].includes(role ?? '')
}

/**
 * Returns true for internal org employee/operator roles.
 * External org-interacting users (e.g. holder/member/guest) must not see FEPT ops UI.
 */
export function isEmployeeOrgRole(): boolean {
  const role = String(getOrgRoleClaim() || '')
    .toLowerCase()
    .trim()
  if (!role) return false
  // Every membership role the organization hands out (built-in or added under Roles, e.g.
  // supervisor, finance officer) is an internal role. Only clearly external parties are not.
  return !['holder', 'guest', 'external', 'customer', 'supplier', 'contact'].includes(role)
}

export function isAuthenticated(): boolean {
  if (typeof window === 'undefined') return false
  // Authenticated if either personal wallet token OR org token exists.
  return !!(localStorage.getItem('walletToken') || localStorage.getItem('credoOrgToken'))
}

/**
 * Backward-compatible alias for strict context token selection.
 * Never falls back across personal/org boundaries.
 */
export function getPreferredToken(): string | null {
  return getContextTokenStrict()
}

/**
 * Always returns the personal wallet token regardless of current context mode.
 * Use this when making calls to holder-scoped endpoints from any context
 * (e.g., inbox sync, credential fetching, personal offer endpoints).
 */
export function getPersonalWalletToken(): string | null {
  if (typeof window === 'undefined') return null

  const strictWalletToken = localStorage.getItem('walletToken')
  if (strictWalletToken) return strictWalletToken

  // Compatibility fallback for older sessions where only tenantToken keys were stored.
  // Never use this fallback in org context to avoid leaking org tokens into holder calls.
  if (getContextMode() === 'personal') {
    return localStorage.getItem('credoTenantToken') || localStorage.getItem('tenantToken')
  }

  return null
}

function allowBrowserCustomHeadersForApi(apiBase: string): boolean {
  if (typeof window === 'undefined') return true

  try {
    return new URL(apiBase).origin === window.location.origin
  } catch {
    return false
  }
}

/**
 * Align mobile org context with the backend's most recently active org membership.
 * Returns true when local org context changed.
 */
export async function syncOrgContextFromServer(): Promise<boolean> {
  if (typeof window === 'undefined') return false

  const walletToken = getPersonalWalletToken()
  if (!walletToken) return false

  const apiBase = resolveMobileApiBaseUrl()
  const walletTenantId = getPersonalWalletTenantId()
  const allowCustomHeaders = allowBrowserCustomHeadersForApi(apiBase)
  const personalGuardHeaders = {
    Authorization: `Bearer ${walletToken}`,
    ...(allowCustomHeaders ? { 'x-context-mode': 'personal' } : {}),
    ...(allowCustomHeaders && walletTenantId ? { 'x-context-tenant-id': walletTenantId } : {}),
    ...(allowCustomHeaders ? { 'x-context-guard-version': 'v1' } : {}),
  }

  try {
    const orgsRes = await fetch(`${apiBase}/api/organizations`, {
      headers: personalGuardHeaders,
    })
    if (!orgsRes.ok) throw new Error(`Could not refresh organisations (${orgsRes.status}).`)
    const organizations = await refreshMemberships(
      localStorage, walletToken, () => orgsRes.json(), getPersonalWalletToken,
    )

    // Refresh even in personal mode, but never auto-promote into an organisation.
    if (getContextMode() === 'personal') return false

    const orgById = new Map(organizations.map((org) => [org.orgTenantId, org]))

    const currentOrgId = getActiveOrgId()

    // Never auto-promote personal users into org context.
    if (!currentOrgId) return false

    const currentOrg = orgById.get(currentOrgId)
    if (!currentOrg) {
      setPersonalContext()
      return true
    }

    // Only owners and admins keep an organisation open; a member's org session is a task pass.
    const openable = currentOrg.canOpenOrgContext ?? mayOpenOrgContext(currentOrg.role)
    if (!openable && !getTaskPass()) {
      setPersonalContext()
      return true
    }
    if (getTaskPass()) return false

    const existingOrgToken = localStorage.getItem('credoOrgToken')
    const existingPayload = existingOrgToken ? decodeJwtPayload(existingOrgToken) : null
    const tokenTenantId = existingPayload?.tenantId ?? existingPayload?.orgTenantId ?? existingPayload?.sub

    // The membership on the server decides the role, not the saved session.
    const liveRole = String(currentOrg.role || '').trim()
    const liveName = currentOrg.name.trim()
    const tokenRole = String(existingPayload?.orgRole || '').trim()
    const sessionMatches = Boolean(existingOrgToken) && (!tokenTenantId || tokenTenantId === currentOrgId)
    if (sessionMatches && (!liveRole || !tokenRole || tokenRole === liveRole)) {
      let corrected = false
      if (liveRole && localStorage.getItem('credoUserRole') !== liveRole) {
        localStorage.setItem('credoUserRole', liveRole)
        corrected = true
      }
      if (liveName && localStorage.getItem('credoOrgName') !== liveName) {
        localStorage.setItem('credoOrgName', liveName)
        localStorage.setItem('credoActiveOrg', JSON.stringify({ orgTenantId: currentOrgId, name: liveName }))
        corrected = true
      }
      if (corrected) announceContextChanged()
      return false
    }

    const switchRes = await fetch(`${apiBase}/api/organizations/${currentOrgId}/switch`, {
      method: 'POST',
      headers: {
        ...personalGuardHeaders,
        ...(allowCustomHeaders
          ? { 'x-idempotency-key': `mobile:personal:${walletTenantId || 'unknown'}:switch-org:${currentOrgId}:${liveRole || 'role'}` }
          : {}),
      },
    })
    if (!switchRes.ok) return false

    const switched = await switchRes.json()
    const orgToken = switched?.token
    if (!orgToken) return false

    const currentOrgName = currentOrg.name
    applyOrgContext({
      orgId: currentOrgId,
      orgName: currentOrgName,
      orgToken,
      orgRole: switched?.orgRole,
      sector: switched?.sector,
      workflowTypes: switched?.workflowTypes,
    })

    return true
  } catch (error) {
    console.warn('Could not reconcile organisation context with the server', error)
    return false
  }
}
