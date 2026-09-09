import React, { useCallback, useEffect, useState } from 'react'
import { Box, Badge, Divider, Group, Loader, Menu, ScrollArea, Text, UnstyledButton } from '@mantine/core'
import { IconBuilding, IconCheck, IconChevronDown, IconPlus, IconWallet } from '@tabler/icons-react'
import { useRouter } from 'next/router'
import axios from 'axios'

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

function getPersonalToken(): string | null {
  if (typeof window === 'undefined') return null
  return (
    window.localStorage.getItem('authToken') ||
    window.localStorage.getItem('auth.token') ||
    window.localStorage.getItem('walletToken') ||
    window.localStorage.getItem('credoTenantToken') ||
    window.localStorage.getItem('tenantToken') ||
    null
  )
}

export function getActiveOrg(): OrgInfo | null {
  if (typeof window === 'undefined') return null
  try {
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

  const holderBackend = process.env.NEXT_PUBLIC_HOLDER_URL || 'http://localhost:7000'

  useEffect(() => {
    if (typeof window === 'undefined') return
    setMounted(true)
    setActiveOrg(getActiveOrg())
    const token = getPersonalToken()
    if (!token) return

    setActiveOrg(getActiveOrg())

    setLoading(true)
    axios
      .get(`${holderBackend}/api/organizations`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        const orgs = Array.isArray(res.data) ? res.data : Array.isArray(res.data?.organizations) ? res.data.organizations : []
        setOrganizations(orgs)

        const current = getActiveOrg()
        if (current && !orgs.some((org: OrgInfo) => org.orgTenantId === current.orgTenantId)) {
          clearActiveOrg()
          localStorage.removeItem('credoOrgName')
          localStorage.removeItem('credoTenantSector')
          localStorage.removeItem('credoTenantFeatures')
        }
      })
      .catch(() => {
        // no-op: user may not belong to any orgs yet
      })
      .finally(() => setLoading(false))
  }, [holderBackend])

  const switchToOrg = useCallback(async (org: OrgInfo) => {
    setSwitching(true)
    try {
      const personalToken = getPersonalToken()
      if (!personalToken) return

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

      window.dispatchEvent(new Event('credo:workflow-context-updated'))

      setActiveOrg(org)
      router.reload()
    } catch {
      // keep silent for now; current task is shell wiring, not notification polish
    } finally {
      setSwitching(false)
    }
  }, [holderBackend, router])

  const switchToPersonal = useCallback(() => {
    const personalToken = localStorage.getItem('walletToken')
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
    router.reload()
  }, [router])

  if (!mounted || (organizations.length === 0 && !loading && !activeOrg)) return null

  const currentLabel = activeOrg ? activeOrg.name : 'Personal Wallet'
  const currentIcon = activeOrg ? <IconBuilding size={16} /> : <IconWallet size={16} />

  return (
    <Menu shadow="md" width={300} position="bottom-end">
      <Menu.Target>
        <UnstyledButton
          style={{
            borderRadius: 8,
            border: '1px solid var(--mantine-color-default-border)',
            padding: '8px 12px',
            backgroundColor: activeOrg ? 'var(--mantine-color-default-hover)' : 'transparent',
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
            {switching ? <Loader size={14} /> : <IconChevronDown size={14} style={{ opacity: 0.5 }} />}
          </Group>
        </UnstyledButton>
      </Menu.Target>

      <Menu.Dropdown>
        <ScrollArea.Autosize mah={320} type="scroll" scrollbarSize={8}>
          <Menu.Label>Switch context</Menu.Label>

          <Menu.Item onClick={switchToPersonal} leftSection={<IconWallet size={16} />}>
            <Text size="sm" fw={500}>Personal Wallet</Text>
            <Text size="xs" c="dimmed">Back to your personal account</Text>
          </Menu.Item>

          <Divider my="xs" />

          <Menu.Label>Organizations</Menu.Label>
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

          <Menu.Item leftSection={<IconPlus size={16} />} component="a" href="/auth?tab=register&tenantType=ORG">
            Create Organization
          </Menu.Item>
        </ScrollArea.Autosize>
      </Menu.Dropdown>
    </Menu>
  )
}