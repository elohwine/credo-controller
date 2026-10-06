/**
 * Portal context helpers — personal (holder) vs organization (operator) sessions.
 *
 * Mirrors credo-ui/mobile/lib/auth.ts + BottomNav: the shell adapts to the active
 * context and org-only surfaces are not reachable from a personal session
 * (see MVP_USER_ORG_MATRIX: "two separate sessions for the same human").
 */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { notifications } from '@mantine/notifications'
import { isOrgContextActive, type PortalContextMode } from '@/utils/portalTenant'
import { readActiveOrganization, type OrganizationMembership } from '@/utils/organizationContext'

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

  useEffect(() => {
    if (!ctx.mounted || ctx.isOrg) return
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
