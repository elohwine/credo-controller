/**
 * useUserRole — role detection hook for the three-role portal experience.
 *
 * Roles:
 *   'issuer'  — SME / school / merchant (ORG tenant type)
 *   'holder'  — buyer / student / individual (USER tenant type)
 *   'guest'   — not logged in
 *
 * Role is stored in localStorage('credoUserRole') and set at registration.
 * Existing users who have no role stored default to 'holder' when a token exists.
 *
 * IMPORTANT: State is initialised synchronously from localStorage so that the
 * very first client-side render already carries the correct role.  The useEffect
 * fallback only fires when no stored role exists but a token does (legacy sessions).
 */
import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { getPreferredTenantToken } from '@/utils/portalTenant'

export type UserRole = 'issuer' | 'holder' | 'guest'

const STORAGE_KEY = 'credoUserRole'

/** Read role from localStorage synchronously.  Safe to call on the server (returns defaults). */
function readStoredRole(): { role: UserRole; ready: boolean } {
  if (typeof window === 'undefined') return { role: 'guest', ready: false }

  const activeOrg = localStorage.getItem('credoActiveOrg')
  const orgToken = localStorage.getItem('credoOrgToken')
  const contextMode = localStorage.getItem('credoContextMode')
  const orgTenantId = localStorage.getItem('credoTenantId') || localStorage.getItem('tenantId')

  if ((activeOrg && orgToken) || (contextMode === 'org' && orgToken && orgTenantId)) {
    return { role: 'issuer', ready: true }
  }

  // Org context should take precedence when both tokens exist.
  const token = getPreferredTenantToken()
  if (!token) return { role: 'guest', ready: true }

  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'holder') return { role: 'holder', ready: true }

  // Never trust a persisted issuer role without active org context.
  // Force a backend /me re-check so we do not issue org-only requests with a stale token.
  if (stored === 'issuer') return { role: 'guest', ready: false }

  // Token exists but no stored role — will be resolved by useEffect (/me call)
  return { role: 'guest', ready: false }
}

export interface UseUserRoleReturn {
  role: UserRole
  ready: boolean
  /** True once the component has mounted on the client (safe to render auth-dependent UI). */
  mounted: boolean
  isIssuer: boolean
  isHolder: boolean
  isGuest: boolean
  setRole: (role: UserRole) => void
}

export function useUserRole(): UseUserRoleReturn {
  // Keep SSR/client first render consistent to avoid hydration mismatches.
  const [role, _setRole] = useState<UserRole>('guest')
  const [ready, setReady] = useState<boolean>(false)
  const [mounted, setMounted] = useState(false)

  // Mark as mounted after first client render — Layout uses this to avoid
  // rendering auth-dependent nav during SSR/hydration.
  useEffect(() => {
    setMounted(true)
  }, [])

  // Resolve role from storage on mount (client only).
  useEffect(() => {
    if (typeof window === 'undefined') return
    const { role: resolvedRole, ready: resolvedReady } = readStoredRole()
    _setRole(resolvedRole)
    setReady(resolvedReady)
  }, [])

  // Fallback: if we have a token but no stored role, recover via /me endpoint
  useEffect(() => {
    if (typeof window === 'undefined') return
    // If already resolved synchronously, skip
    if (ready) return

    // Both mount effects run in the same commit, so `ready` above can still be stale.
    // Re-read storage here: an active organization session must never be downgraded to
    // guest/holder by the /me fallback below (it was making org-only buttons go dead).
    const fresh = readStoredRole()
    if (fresh.ready) {
      _setRole(fresh.role)
      setReady(true)
      return
    }

    const tenantToken = getPreferredTenantToken()
    const walletToken = localStorage.getItem('walletToken')
    const token = tenantToken || walletToken

    if (!token) {
      _setRole('guest')
      localStorage.removeItem(STORAGE_KEY)
      setReady(true)
      return
    }

    // Double-check in case storage was written between useState init and effect
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'issuer' || stored === 'holder') {
      _setRole(stored)
      setReady(true)
      return
    }

    // No stored role but have token — recover from backend /me endpoint.
    axios
      .get('/api/credo/ssi/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        const tenantType = res.data?.tenantType
        const resolved: UserRole = tenantType === 'ORG' ? 'issuer' : 'holder'
        _setRole(resolved)
        try {
          if (!walletToken) localStorage.setItem('walletToken', token)
          if (res.data?.tenantId) {
            localStorage.setItem('credoTenantId', res.data.tenantId)
            localStorage.setItem('tenantId', res.data.tenantId)
          }
          localStorage.setItem('tenantToken', token)
          localStorage.setItem(STORAGE_KEY, resolved)
        } catch {
          /* quota */
        }
      })
      .catch(() => {
        _setRole('guest')
        try {
          localStorage.removeItem(STORAGE_KEY)
        } catch {
          /* quota */
        }
      })
      .finally(() => {
        setReady(true)
      })
  }, [ready])

  // Listen for cross-tab and same-tab storage changes
  useEffect(() => {
    const sync = () => {
      const { role: r, ready: rd } = readStoredRole()
      _setRole(r)
      if (rd) setReady(true)
    }
    window.addEventListener('storage', sync)
    window.addEventListener('credo-role-changed', sync)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener('credo-role-changed', sync)
    }
  }, [])

  const setRole = useCallback((newRole: UserRole) => {
    _setRole(newRole)
    try {
      localStorage.setItem(STORAGE_KEY, newRole)
      window.dispatchEvent(new Event('credo-role-changed'))
    } catch {
      /* quota */
    }
  }, [])

  return {
    role,
    ready,
    mounted,
    isIssuer: role === 'issuer',
    isHolder: role === 'holder',
    isGuest: role === 'guest',
    setRole,
  }
}
