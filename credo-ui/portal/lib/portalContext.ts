/**
 * Portal context helpers — personal (holder) vs organization (operator) sessions.
 *
 * Mirrors credo-ui/mobile/lib/auth.ts + BottomNav: the shell adapts to the active
 * context and org-only surfaces are not reachable from a personal session
 * (see MVP_USER_ORG_MATRIX: "two separate sessions for the same human").
 */
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { notifications } from '@mantine/notifications'
import { isOrgContextActive, type PortalContextMode } from '@/utils/portalTenant'
import { readActiveOrganization, type OrganizationMembership } from '@/utils/organizationContext'
import {
  isBoundTaskPath,
  readInboxTask,
  TASK_CONTEXT_KEY,
  TASK_CONTEXT_MAX_AGE_MS,
  type InboxTaskContext,
} from '../../shared/taskContext'

export const CONTEXT_UPDATED_EVENT = 'credo:workflow-context-updated'
export const OPEN_ORG_SWITCHER_EVENT = 'credo:open-org-switcher'

export interface PortalContextState {
  /** True once mounted on the client; nav that depends on storage must wait for this. */
  mounted: boolean
  mode: PortalContextMode
  activeOrg: OrganizationMembership | null
  isOrg: boolean
}

export function readPortalContext(): Pick<PortalContextState, 'mode' | 'activeOrg'> {
  if (typeof window === 'undefined') return { mode: 'personal', activeOrg: null }
  const isOrg = isOrgContextActive()
  return { mode: isOrg ? 'org' : 'personal', activeOrg: isOrg ? readActiveOrganization() : null }
}

/** Ask the header account picker to open (used by "No organization selected" prompts). */
export function openOrgSwitcher() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(OPEN_ORG_SWITCHER_EVENT))
}

export function usePortalContext(): PortalContextState {
  const [mounted, setMounted] = useState(false)
  const [state, setState] = useState<Pick<PortalContextState, 'mode' | 'activeOrg'>>({
    mode: 'personal',
    activeOrg: null,
  })

  useEffect(() => {
    const sync = () => setState(readPortalContext())
    sync()
    setMounted(true)
    window.addEventListener('storage', sync)
    window.addEventListener(CONTEXT_UPDATED_EVENT, sync)
    window.addEventListener('credo-role-changed', sync)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener(CONTEXT_UPDATED_EVENT, sync)
      window.removeEventListener('credo-role-changed', sync)
    }
  }, [])

  return { mounted, mode: state.mode, activeOrg: state.activeOrg, isOrg: state.mode === 'org' }
}

/**
 * Org-only page guard. In a personal session the page is not shown at all: the user is
 * sent to `redirectTo` (mobile does the same for /finance → /inbox) and the account
 * picker is opened so they can switch into an organization.
 */
export function useRequireOrgContext(redirectTo = '/inbox'): PortalContextState {
  const router = useRouter()
  const ctx = usePortalContext()
  const hadInboxTask = useRef(false)

  useEffect(() => {
    if (window.localStorage.getItem(TASK_CONTEXT_KEY)) hadInboxTask.current = true
    if (!ctx.mounted || ctx.isOrg) return
    if (hadInboxTask.current) {
      void router.replace(redirectTo)
      return
    }
    notifications.show({
      id: 'org-context-required',
      title: 'Organization context required',
      message: 'This area is for organization operators. Switch into an organization from the account picker.',
      color: 'yellow',
    })
    void router.replace(redirectTo).then(() => openOrgSwitcher())
  }, [ctx.mounted, ctx.isOrg, redirectTo, router])

  return ctx
}

/**
 * An organisation session opened from an inbox item lasts for that one task (least privilege).
 * Leaving the task's pages, or pressing "Back to inbox", restores the personal session on the
 * personal inbox. Same rule as the mobile app (credo-ui/mobile/lib/auth.ts TaskContext).
 */
export type PortalTaskContext = InboxTaskContext

export function beginPortalTask(orgId: string, target?: string) {
  if (typeof window === 'undefined') return
  const task: PortalTaskContext = { orgId, returnTo: '/inbox', target, startedAt: Date.now() }
  window.localStorage.setItem(TASK_CONTEXT_KEY, JSON.stringify(task))
  window.dispatchEvent(new Event(CONTEXT_UPDATED_EVENT))
}

export function getPortalTask(): PortalTaskContext | null {
  if (typeof window === 'undefined') return null
  const task = readInboxTask(window.localStorage)
  if (!task) {
    if (window.localStorage.getItem(TASK_CONTEXT_KEY)) endPortalTask()
    return null
  }
  if (!isOrgContextActive() || readActiveOrganization()?.orgTenantId !== task.orgId) {
    clearPortalTask()
    return null
  }
  if (Date.now() - task.startedAt >= TASK_CONTEXT_MAX_AGE_MS || task.startedAt > Date.now()) {
    endPortalTask()
    return null
  }
  return task
}

export function clearPortalTask() {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(TASK_CONTEXT_KEY)
  window.localStorage.removeItem(TASK_CONTEXT_KEY)
}

export function isPortalTaskPath(url: string): boolean {
  const task = getPortalTask()
  return Boolean(task && isBoundTaskPath(task, url))
}

/** Restore the personal session (same storage writes as the account picker's "personal"). */
export function endPortalTask(): string | null {
  if (typeof window === 'undefined') return null
  const existed = window.localStorage.getItem(TASK_CONTEXT_KEY)
  clearPortalTask()
  if (!existed) return null
  for (const key of ['credoTenantToken', 'tenantToken', 'credoTenantId', 'tenantId']) {
    window.localStorage.removeItem(key)
  }
  const personalToken = window.localStorage.getItem('walletToken')
  if (personalToken) {
    window.localStorage.setItem('credoTenantToken', personalToken)
    window.localStorage.setItem('tenantToken', personalToken)
    try {
      const payload = JSON.parse(atob(personalToken.split('.')[1]))
      if (payload.tenantId) {
        window.localStorage.setItem('credoTenantId', payload.tenantId)
        window.localStorage.setItem('tenantId', payload.tenantId)
      }
    } catch {
      // ignore invalid jwt payloads
    }
  }
  window.localStorage.removeItem('credoOrgToken')
  window.localStorage.removeItem('credoActiveOrg')
  window.localStorage.setItem('credoContextMode', 'personal')
  window.localStorage.removeItem('credoOrgName')
  window.localStorage.removeItem('credoTenantSector')
  window.localStorage.removeItem('credoTenantFeatures')
  window.localStorage.removeItem('credoActiveWorkflowTypes')
  window.localStorage.removeItem('credoActiveTemplateId')
  window.dispatchEvent(new Event(CONTEXT_UPDATED_EVENT))
  return '/inbox'
}

/** Ends the task when the person leaves its pages. Mount once in the layout. */
export function usePortalTaskGuard(enabled = true): PortalTaskContext | null {
  const router = useRouter()
  const [task, setTask] = useState<PortalTaskContext | null>(null)
  useEffect(() => {
    if (!enabled) return
    let hadTask = Boolean(window.localStorage.getItem(TASK_CONTEXT_KEY))
    let returning = false
    const sync = () => setTask(getPortalTask())
    const settle = (url: string) => {
      const current = getPortalTask()
      if (current) {
        hadTask = true
        if (isBoundTaskPath(current, url)) {
          if (!current.target)
            window.localStorage.setItem(TASK_CONTEXT_KEY, JSON.stringify({ ...current, target: url }))
        } else {
          endPortalTask()
          returning = true
        }
      } else if (hadTask && !isOrgContextActive()) {
        returning = true
      } else if (!current) {
        hadTask = false
      }
      sync()
    }
    const finish = () => {
      if (!returning) return
      returning = false
      hadTask = false
      if (router.pathname !== '/inbox') void router.replace('/inbox')
    }
    const check = () => {
      settle(router.asPath)
      finish()
    }
    const expire = () => {
      const current = getPortalTask()
      if (current) hadTask = true
      if (!current && hadTask) check()
    }
    const onContextChange = () => {
      // An inline decision has no destination until navigation starts.
      if (getPortalTask()) {
        hadTask = true
        sync()
      } else check()
    }
    if (router.pathname !== '/inbox' || getPortalTask()?.target) check()
    router.events.on('routeChangeStart', settle)
    router.events.on('routeChangeComplete', finish)
    router.events.on('routeChangeError', finish)
    window.addEventListener(CONTEXT_UPDATED_EVENT, onContextChange)
    window.addEventListener('focus', check)
    window.addEventListener('storage', check)
    const timer = window.setInterval(expire, 1000)
    return () => {
      router.events.off('routeChangeStart', settle)
      router.events.off('routeChangeComplete', finish)
      router.events.off('routeChangeError', finish)
      window.removeEventListener(CONTEXT_UPDATED_EVENT, onContextChange)
      window.removeEventListener('focus', check)
      window.removeEventListener('storage', check)
      window.clearInterval(timer)
    }
  }, [router, enabled])
  return task
}
