import { create } from 'zustand'
import {
  CREDENTIS_CONTEXT_CHANGED_EVENT,
  getActiveOrgId,
  getActiveOrgLabel,
  getContextMode,
  getTaskContext,
  getUserName,
  getUserPhone,
  getUserRole,
  type ContextMode,
} from '@/lib/auth'
import { currentAccountId } from '@/lib/savedAccounts'
import { sessionScope } from '@/lib/queries/keys'

/**
 * Who is signed in and which context is open, as one reactive value for every screen.
 *
 * localStorage (written by lib/auth.ts) stays the saved copy; this store mirrors it so
 * components re-render when it changes instead of each listening for window events.
 */
export interface SessionState {
  accountId: string | null
  mode: ContextMode
  orgId: string | null
  orgLabel: string | null
  userName: string | null
  userPhone: string | null
  role: string | null
  taskActive: boolean
  /** Account + context; every cached server answer is filed under it. */
  scope: string
  refresh: () => void
}

export { sessionScope }

function readSession(): Omit<SessionState, 'refresh'> {
  if (typeof window === 'undefined') {
    return {
      accountId: null,
      mode: 'personal',
      orgId: null,
      orgLabel: null,
      userName: null,
      userPhone: null,
      role: null,
      taskActive: false,
      scope: sessionScope(null, 'personal', null),
    }
  }
  const accountId = currentAccountId()
  const mode = getContextMode()
  const orgId = mode === 'org' ? getActiveOrgId() : null
  return {
    accountId,
    mode,
    orgId,
    orgLabel: mode === 'org' ? getActiveOrgLabel() : null,
    userName: getUserName(),
    userPhone: getUserPhone(),
    role: getUserRole(),
    taskActive: Boolean(getTaskContext()),
    scope: sessionScope(accountId, mode, orgId),
  }
}

function sameSession(a: Omit<SessionState, 'refresh'>, b: Omit<SessionState, 'refresh'>): boolean {
  return (
    a.accountId === b.accountId &&
    a.mode === b.mode &&
    a.orgId === b.orgId &&
    a.orgLabel === b.orgLabel &&
    a.userName === b.userName &&
    a.userPhone === b.userPhone &&
    a.role === b.role &&
    a.taskActive === b.taskActive
  )
}

export const useSessionStore = create<SessionState>((set, get) => ({
  ...readSession(),
  refresh: () => {
    const next = readSession()
    const { refresh: _ignored, ...current } = get()
    if (!sameSession(current, next)) set(next)
  },
}))

let bound = false

/** Keep the store in step with lib/auth.ts, other tabs and the app coming back to the front. */
export function bindSessionStore(): () => void {
  if (typeof window === 'undefined' || bound) return () => undefined
  bound = true
  const refresh = () => useSessionStore.getState().refresh()
  refresh()
  window.addEventListener(CREDENTIS_CONTEXT_CHANGED_EVENT, refresh)
  window.addEventListener('storage', refresh)
  window.addEventListener('focus', refresh)
  document.addEventListener('visibilitychange', refresh)
  return () => {
    bound = false
    window.removeEventListener(CREDENTIS_CONTEXT_CHANGED_EVENT, refresh)
    window.removeEventListener('storage', refresh)
    window.removeEventListener('focus', refresh)
    document.removeEventListener('visibilitychange', refresh)
  }
}

export function currentScope(): string {
  return useSessionStore.getState().scope
}
