import React, { useCallback, useEffect, useState } from 'react'
import { Box, Badge, Divider, Group, Loader, Menu, ScrollArea, Text, UnstyledButton } from '@mantine/core'
import { IconBuilding, IconCheck, IconChevronDown, IconPlus, IconWallet } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import { useRouter } from 'next/router'
import axios from 'axios'
import { CONTEXT_UPDATED_EVENT, OPEN_ORG_SWITCHER_EVENT } from '@/lib/portalContext'
import { isOrgContextActive } from '@/utils/portalTenant'

export interface OrgInfo {
  orgTenantId: string
  name: string
  role: string
}

interface OrgSwitcherProps {
  compact?: boolean
}

const ORG_TOKEN_KEY = 'credoOrgToken'
const ACTIVE_ORG_KEY = 'credoActiveOrg'
const ORGS_CACHE_KEY = 'credoOrganizations'

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    return JSON.parse(atob(parts[1]))
  } catch {
    return null
  }
}

function normalizeRole(role: unknown): string {
  if (Array.isArray(role)) return String(role[0] || '').trim()
  return String(role || '').trim()
}

function getOrgScopedToken(): string | null {
  if (typeof window === 'undefined') return null
  return (
    window.localStorage.getItem(ORG_TOKEN_KEY) ||
    window.localStorage.getItem('credoTenantToken') ||
    window.localStorage.getItem('tenantToken') ||
    null
  )
}

function getPersonalToken(): string | null {
  if (typeof window === 'undefined') return null
  const authToken =
    window.localStorage.getItem('authToken') ||
    window.localStorage.getItem('auth.token') ||
    window.localStorage.getItem('walletToken')

  // `walletToken` is always the holder session (every JWT the API mints carries role
  // "RestTenantAgent", so the role claim cannot be used to tell personal from org).
  if (authToken) return authToken

  // Legacy sessions only stored tenantToken. Accept it unless it is an org-scoped token
  // (org tokens carry an `orgRole` claim from /api/organizations/{id}/switch).
  const candidate =
    window.localStorage.getItem('tenantToken') || window.localStorage.getItem('credoTenantToken')
  if (!candidate) return null
  const payload = decodeJwtPayload(candidate)
  if (payload?.orgRole) return null
  if (normalizeRole(payload?.role) === 'RestTenantAgent' && payload?.orgTenantId) return null
  return candidate
}

function readOrganizationsFromCache(): OrgInfo[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(ORGS_CACHE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((entry: any) => ({
        orgTenantId: entry?.orgTenantId || entry?.id || entry?.orgTenantID,
        name: entry?.name || entry?.label || 'Organization',
        role: entry?.role || 'member',
      }))
      .filter((entry: OrgInfo) => !!entry.orgTenantId)
  } catch {
    return []
  }
}

function persistOrganizationsToCache(orgs: OrgInfo[]) {
  if (typeof window === 'undefined') return
  if (!Array.isArray(orgs) || orgs.length === 0) return
  window.localStorage.setItem(ORGS_CACHE_KEY, JSON.stringify(orgs))
}

export function getActiveOrg(): OrgInfo | null {
  if (typeof window === 'undefined') return null
  try {
    // A remembered organization only counts as "active" while the session is actually in
    // org mode with a usable org token. Otherwise the picker would show the organization as
    // current (and disable re-selecting it) while every org page refuses to open.
    if (!isOrgContextActive()) return null
    const raw = localStorage.getItem(ACTIVE_ORG_KEY)
    if (raw) return JSON.parse(raw)

    const orgToken = localStorage.getItem(ORG_TOKEN_KEY) || localStorage.getItem('credoTenantToken')
    const orgTenantId = localStorage.getItem('credoTenantId')
    const orgName = localStorage.getItem('credoOrgName')
    if (orgToken && orgTenantId && orgName) {
      const fallback: OrgInfo = { orgTenantId, name: orgName, role: 'owner' }
      localStorage.setItem(ACTIVE_ORG_KEY, JSON.stringify(fallback))
      return fallback
    }

    return null
  } catch {
    return null
  }
}

export function clearActiveOrg() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(ORG_TOKEN_KEY)
  localStorage.removeItem(ACTIVE_ORG_KEY)
}

export default function OrgSwitcher({ compact }: OrgSwitcherProps) {
  const router = useRouter()
  const [organizations, setOrganizations] = useState<OrgInfo[]>([])
  const [activeOrg, setActiveOrg] = useState<OrgInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [opened, setOpened] = useState(false)

  const holderBackend = process.env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000'

  // "No organization selected" prompts across the portal can open this picker directly.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const open = () => setOpened(true)
    window.addEventListener(OPEN_ORG_SWITCHER_EVENT, open)
    return () => window.removeEventListener(OPEN_ORG_SWITCHER_EVENT, open)
  }, [])

  const loadOrganizations = useCallback(() => {
    if (typeof window === 'undefined') return
    setActiveOrg(getActiveOrg())
    const token = getPersonalToken()
    if (!token) {
      const cachedOrgs = readOrganizationsFromCache()
      const active = getActiveOrg()
      if (active && !cachedOrgs.some((org) => org.orgTenantId === active.orgTenantId)) {
        cachedOrgs.unshift(active)
      }
      setOrganizations(cachedOrgs)
      return
    }

    setLoading(true)
    axios
      .get(`${holderBackend}/api/organizations`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        const orgs = Array.isArray(res.data) ? res.data : Array.isArray(res.data?.organizations) ? res.data.organizations : []
        setOrganizations(orgs)
        persistOrganizationsToCache(orgs)

        const current = getActiveOrg()
        if (current && !orgs.some((org: OrgInfo) => org.orgTenantId === current.orgTenantId)) {
          clearActiveOrg()
          localStorage.removeItem('credoOrgName')
          localStorage.removeItem('credoTenantSector')
          localStorage.removeItem('credoTenantFeatures')
        }
      })
      .catch(() => {
        const cachedOrgs = readOrganizationsFromCache()
        const active = getActiveOrg()
        if (active && !cachedOrgs.some((org) => org.orgTenantId === active.orgTenantId)) {
          cachedOrgs.unshift(active)
        }
        setOrganizations(cachedOrgs)
      })
      .finally(() => setLoading(false))
  }, [holderBackend])

  // The Layout (and this picker) survives client-side navigation, so the org list must be
  // re-read whenever the session changes (login/logout, context switch) and when the menu opens.
  useEffect(() => {
    if (typeof window === 'undefined') return
    setMounted(true)
    loadOrganizations()
    const onContext = () => loadOrganizations()
    window.addEventListener('storage', onContext)
    window.addEventListener(CONTEXT_UPDATED_EVENT, onContext)
    return () => {
      window.removeEventListener('storage', onContext)
      window.removeEventListener(CONTEXT_UPDATED_EVENT, onContext)
    }
  }, [loadOrganizations])

  useEffect(() => {
    if (opened) loadOrganizations()
  }, [opened, loadOrganizations])

  const switchToOrg = useCallback(async (org: OrgInfo) => {
    setSwitching(true)
    try {
      const personalToken = getPersonalToken()
      if (!personalToken) {
        const orgScopedToken = getOrgScopedToken()
        const payload = orgScopedToken ? decodeJwtPayload(orgScopedToken) : null
        const tokenTenantId = String(payload?.tenantId || '')

        if (orgScopedToken && tokenTenantId && tokenTenantId === org.orgTenantId) {
          localStorage.setItem(ORG_TOKEN_KEY, orgScopedToken)
          localStorage.setItem(ACTIVE_ORG_KEY, JSON.stringify(org))
          localStorage.setItem('credoContextMode', 'org')
          localStorage.setItem('credoTenantId', org.orgTenantId)
          localStorage.setItem('tenantId', org.orgTenantId)
          localStorage.setItem('credoOrgName', org.name)
          persistOrganizationsToCache([org, ...organizations.filter((entry) => entry.orgTenantId !== org.orgTenantId)])
          window.dispatchEvent(new Event('credo:workflow-context-updated'))
          setActiveOrg(org)
          router.reload()
          return
        }

        notifications.show({
          title: 'Switch requires personal context',
          message: 'Return to personal wallet first, then switch into organization context.',
          color: 'orange',
        })
        return
      }

      const res = await axios.post(
        `${holderBackend}/api/organizations/${org.orgTenantId}/switch`,
        {},
        { headers: { Authorization: `Bearer ${personalToken}` } },
      )

      const { token: orgToken, sector, workflowTypes } = res.data

      localStorage.setItem(ORG_TOKEN_KEY, orgToken)
      localStorage.setItem(ACTIVE_ORG_KEY, JSON.stringify(org))
      localStorage.setItem('credoTenantToken', orgToken)
      localStorage.setItem('tenantToken', orgToken)
      localStorage.setItem('credoContextMode', 'org')
      localStorage.setItem('credoTenantId', org.orgTenantId)
      localStorage.setItem('tenantId', org.orgTenantId)
      localStorage.setItem('credoOrgName', org.name)

      if (sector) {
        localStorage.setItem('credoTenantSector', sector)
      } else {
        localStorage.removeItem('credoTenantSector')
      }

      if (workflowTypes) {
        localStorage.setItem('credoActiveWorkflowTypes', JSON.stringify(workflowTypes))
      } else {
        localStorage.removeItem('credoActiveWorkflowTypes')
      }

      persistOrganizationsToCache([org, ...organizations.filter((entry) => entry.orgTenantId !== org.orgTenantId)])

      window.dispatchEvent(new Event('credo:workflow-context-updated'))

      setActiveOrg(org)
      router.reload()
    } catch (err: any) {
      const status = err?.response?.status
      const message = err?.response?.data?.message || err?.message || 'Failed to switch organization'

      if (status === 409) {
        setOrganizations((prev) => prev.filter((o) => o.orgTenantId !== org.orgTenantId))
        notifications.show({
          title: 'Organization unavailable',
          message: `${org.name} is currently unavailable in runtime context.`,
          color: 'orange',
        })
      } else {
        notifications.show({
          title: 'Switch failed',
          message,
          color: 'red',
        })
      }
    } finally {
      setSwitching(false)
    }
  }, [holderBackend, organizations, router])

  const switchToPersonal = useCallback(() => {
    const currentOrg = getActiveOrg()
    const personalToken = localStorage.getItem('walletToken')
    if (!personalToken) {
      notifications.show({
        title: 'Personal context unavailable',
        message: 'No personal wallet token is available in this session. Stay in org context or sign in again.',
        color: 'orange',
      })
      return
    }

    if (currentOrg) {
      persistOrganizationsToCache([currentOrg, ...organizations.filter((entry) => entry.orgTenantId !== currentOrg.orgTenantId)])
    }

    if (personalToken) {
      localStorage.setItem('credoTenantToken', personalToken)
      localStorage.setItem('tenantToken', personalToken)
      try {
        const payload = JSON.parse(atob(personalToken.split('.')[1]))
        if (payload.tenantId) {
          localStorage.setItem('credoTenantId', payload.tenantId)
          localStorage.setItem('tenantId', payload.tenantId)
        }
      } catch {
        // ignore invalid jwt payloads
      }
    }

    clearActiveOrg()
    localStorage.setItem('credoContextMode', 'personal')
    localStorage.removeItem('credoOrgName')
    localStorage.removeItem('credoTenantSector')
    localStorage.removeItem('credoTenantFeatures')
    setActiveOrg(null)
    window.dispatchEvent(new Event(CONTEXT_UPDATED_EVENT))
    // Org-only pages are not part of the personal context: land on a personal surface.
    const orgOnlyPath = /^\/(finance|requests|tasks|approvals|organization\/(people|roles|departments|authorities|delegations))/.test(
      router.pathname,
    )
    if (orgOnlyPath) {
      void router.replace('/inbox').then(() => router.reload())
      return
    }
    router.reload()
  }, [organizations, router])

  // Not signed in at all (no personal token, no org, nothing cached): nothing to switch between.
  if (!mounted || (!activeOrg && !getPersonalToken() && organizations.length === 0)) return null

  const currentLabel = activeOrg ? activeOrg.name : 'Personal'
  const currentIcon = activeOrg ? <IconBuilding size={16} /> : <IconWallet size={16} />

  return (
    <Menu
      shadow="md"
      width={300}
      position="bottom-end"
      opened={opened}
      onChange={setOpened}
    >
      <Menu.Target>
        <UnstyledButton
          aria-label="Account picker: switch between personal and organization context"
          style={{
            borderRadius: 8,
            border: `1px solid ${activeOrg ? 'var(--mantine-color-blue-3)' : 'var(--mantine-color-default-border)'}`,
            padding: compact ? '8px 10px' : '8px 12px',
            backgroundColor: activeOrg ? 'var(--mantine-color-blue-0)' : 'transparent',
            width: '100%',
          }}
        >
          <Group gap="xs" wrap="nowrap">
            {currentIcon}
            {!compact && (
              <Text size="sm" fw={500} lineClamp={1} style={{ maxWidth: 170 }}>
                {currentLabel}
              </Text>
            )}
            {activeOrg && (
              <Badge size="xs" variant="light" color="blue">
                {activeOrg.role}
              </Badge>
            )}
            <Box style={{ flexGrow: 1 }} />
            {switching || loading ? <Loader size={14} /> : <IconChevronDown size={14} style={{ opacity: 0.5 }} />}
          </Group>
        </UnstyledButton>
      </Menu.Target>

      <Menu.Dropdown>
        <ScrollArea.Autosize mah={360} type="scroll" scrollbarSize={8}>
          <Menu.Label>{activeOrg ? `Acting as ${activeOrg.role} · ${activeOrg.name}` : 'Personal account'}</Menu.Label>

          <Menu.Item
            onClick={switchToPersonal}
            disabled={!activeOrg}
            leftSection={activeOrg ? <IconWallet size={16} /> : <IconCheck size={16} />}
          >
            <Text size="sm" fw={500}>Personal Wallet</Text>
            <Text size="xs" c="dimmed">
              {activeOrg ? 'Back to your personal account' : 'Current context — receipts, proofs, and your own requests'}
            </Text>
          </Menu.Item>

          <Divider my="xs" />

          <Menu.Label>Organizations</Menu.Label>
          {loading && organizations.length === 0 && (
            <Menu.Item disabled leftSection={<Loader size={14} />}>
              Loading organizations…
            </Menu.Item>
          )}
          {!loading && organizations.length === 0 && (
            <Menu.Item disabled>
              <Text size="sm">No organizations yet</Text>
              <Text size="xs" c="dimmed">Onboard one below to unlock finance, approvals, and org admin.</Text>
            </Menu.Item>
          )}
          {organizations.map((org) => {
            const selected = activeOrg?.orgTenantId === org.orgTenantId
            return (
              <Menu.Item
                key={org.orgTenantId}
                onClick={() => switchToOrg(org)}
                disabled={switching || selected}
                leftSection={selected ? <IconCheck size={16} /> : <IconBuilding size={16} />}
              >
                <Text size="sm" fw={500}>{org.name}</Text>
                <Text size="xs" c="dimmed">
                  {selected ? 'Current active organization' : 'Switch to this organization'}
                </Text>
              </Menu.Item>
            )
          })}

          <Divider my="xs" />

          <Menu.Item leftSection={<IconPlus size={16} />} component="a" href="/organization/setup">
            <Text size="sm" fw={500}>Onboard organization</Text>
            <Text size="xs" c="dimmed">Create a new organization you administer</Text>
          </Menu.Item>
        </ScrollArea.Autosize>
      </Menu.Dropdown>
    </Menu>
  )
}