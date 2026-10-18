import React, { useCallback, useEffect, useState } from 'react'
import { Alert, Badge, Button, Group, Loader, Paper, Select, Stack, Text, TextInput, Textarea, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconRefresh, IconShieldCheck } from '@tabler/icons-react'
import { useRouter } from 'next/router'
import AppShellMobile from '@/components/layout/AppShellMobile'
import api from '@/lib/api'
import {
  CREDENTIS_CONTEXT_CHANGED_EVENT,
  getActiveOrgId,
  getContextMode,
  getContextTokenStrict,
  getTaskContext,
  getOrgRoleClaim,
} from '@/lib/auth'

type Offer = {
  rowId: string
  walletTenantId: string
  credentialType: string
  createdAt: string
  lastError: string | null
  lifecycleStatus: 'pending' | 'accepted' | 'withdrawn' | 'resolved' | 'expired'
}

type IssuedCredential = {
  credentialId: string
  credentialDefinitionId: string
  issuedAt: string | null
  revoked: boolean
  allocationStatus: 'valid' | 'revoked' | 'suspended' | null
}

type Lifecycle = { offers: Offer[]; issued: IssuedCredential[] }

function errorMessage(error: any): string {
  return error?.response?.data?.message || error?.message || 'Request failed'
}

export default function CredentialOperationsPage() {
  const router = useRouter()
  const [orgId, setOrgId] = useState<string | null>(null)
  const [manager, setManager] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [lifecycle, setLifecycle] = useState<Lifecycle>({ offers: [], issued: [] })
  const [directTypes, setDirectTypes] = useState<string[]>([])
  const [walletTenantId, setWalletTenantId] = useState('')
  const [credentialType, setCredentialType] = useState<string | null>(null)
  const [claims, setClaims] = useState('{\n  "reference": "MANUAL-001"\n}')
  const [reason, setReason] = useState('')

  const currentAuth = () => {
    if (getContextMode() !== 'org' || getTaskContext()) return null
    const currentOrgId = getActiveOrgId()
    const token = getContextTokenStrict()
    return currentOrgId && token ? { orgId: currentOrgId, headers: { Authorization: `Bearer ${token}` } } : null
  }

  const load = useCallback(async () => {
    const auth = currentAuth()
    setOrgId(auth?.orgId || null)
    setManager(['owner', 'admin'].includes(String(getOrgRoleClaim() || '').toLowerCase()))
    if (!auth) {
      setLifecycle({ offers: [], issued: [] })
      setDirectTypes([])
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const [lifecycleRes, typesRes] = await Promise.all([
        api.get('/api/organizations/credential-operations/lifecycle', { headers: auth.headers }),
        api.get('/api/organizations/credential-operations/direct-types', { headers: auth.headers }),
      ])
      if (currentAuth()?.orgId !== auth.orgId) return
      setLifecycle(lifecycleRes.data || { offers: [], issued: [] })
      const types = Array.isArray(typesRes.data?.credentialTypes) ? typesRes.data.credentialTypes : []
      setDirectTypes(types)
      setCredentialType((selected) => (selected && types.includes(selected) ? selected : types[0] || null))
    } catch (error: any) {
      if (currentAuth()?.orgId === auth.orgId) {
        notifications.show({ color: 'red', title: 'Could not load credential operations', message: errorMessage(error) })
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (getTaskContext()) {
      void router.replace('/inbox')
      return
    }
    void load()
    window.addEventListener(CREDENTIS_CONTEXT_CHANGED_EVENT, load)
    return () => window.removeEventListener(CREDENTIS_CONTEXT_CHANGED_EVENT, load)
  }, [load, router])

  const offerAction = async (rowId: string, action: 'reoffer' | 'replace') => {
    const auth = currentAuth()
    if (!auth || !reason.trim()) return
    setSubmitting(true)
    try {
      await api.post(
        `/api/organizations/credential-operations/offers/${encodeURIComponent(rowId)}/${action}`,
        { reason: reason.trim() },
        { headers: auth.headers },
      )
      if (currentAuth()?.orgId !== auth.orgId) return
      notifications.show({
        color: 'green',
        title: action === 'replace' ? 'Replacement offered' : 'Offer re-sent',
        message: 'The holder must accept the record from their personal inbox.',
      })
      await load()
    } catch (error: any) {
      if (currentAuth()?.orgId === auth.orgId) {
        notifications.show({ color: 'red', title: 'Credential action failed', message: errorMessage(error) })
      }
    } finally {
      setSubmitting(false)
    }
  }

  const revoke = async (credentialId: string) => {
    const auth = currentAuth()
    if (!auth || !reason.trim()) return
    setSubmitting(true)
    try {
      await api.post(
        `/api/organizations/credential-operations/credentials/${encodeURIComponent(credentialId)}/status`,
        { action: 'revoke', reason: reason.trim() },
        { headers: auth.headers },
      )
      if (currentAuth()?.orgId !== auth.orgId) return
      notifications.show({ color: 'green', title: 'Credential revoked', message: 'Revocation was recorded.' })
      await load()
    } catch (error: any) {
      if (currentAuth()?.orgId === auth.orgId) {
        notifications.show({ color: 'red', title: 'Could not revoke credential', message: errorMessage(error) })
      }
    } finally {
      setSubmitting(false)
    }
  }

  const issueDirect = async () => {
    const auth = currentAuth()
    if (!auth || !walletTenantId.trim() || !credentialType) return
    let claimsObject: Record<string, unknown>
    try {
      claimsObject = JSON.parse(claims)
      if (!claimsObject || Array.isArray(claimsObject) || typeof claimsObject !== 'object') throw new Error()
    } catch {
      notifications.show({ color: 'yellow', title: 'Invalid claims', message: 'Enter claims as a JSON object.' })
      return
    }

    setSubmitting(true)
    try {
      await api.post(
        '/api/organizations/credential-operations/direct-offers',
        { walletTenantId: walletTenantId.trim(), credentialType, claims: claimsObject },
        { headers: auth.headers },
      )
      if (currentAuth()?.orgId !== auth.orgId) return
      notifications.show({
        color: 'green',
        title: 'Offer queued',
        message: 'The holder must accept it from their personal inbox.',
      })
      await load()
    } catch (error: any) {
      if (currentAuth()?.orgId === auth.orgId) {
        notifications.show({ color: 'red', title: 'Could not queue offer', message: errorMessage(error) })
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AppShellMobile>
      <Stack p="md" gap="md">
        <Group justify="space-between" align="center">
          <Title order={3}>Credential operations</Title>
          <Button size="xs" variant="light" leftSection={<IconRefresh size={15} />} onClick={() => void load()} loading={loading}>
            Refresh
          </Button>
        </Group>

        {(!orgId || !manager) ? (
          <Alert color="yellow">Switch to an organisation as an owner or admin to manage credentials.</Alert>
        ) : (
          <>
            <Alert color="blue" icon={<IconShieldCheck size={16} />}>
              Issuer actions never accept a credential for its holder. Acceptance stays in the holder&apos;s personal inbox.
            </Alert>

            <TextInput
              label="Reason for lifecycle action"
              placeholder="Explain the business reason"
              value={reason}
              onChange={(event) => setReason(event.currentTarget.value)}
              maxLength={240}
            />

            <Paper withBorder p="md" radius="md">
              <Stack gap="sm">
                <Text fw={700}>Issue a supported standalone credential</Text>
                {directTypes.length === 0 ? (
                  <Text size="sm" c="dimmed">No standalone credential types are configured for this organisation.</Text>
                ) : (
                  <>
                    <TextInput
                      label="Recipient wallet tenant ID"
                      value={walletTenantId}
                      onChange={(event) => setWalletTenantId(event.currentTarget.value)}
                    />
                    <Select label="Credential type" data={directTypes} value={credentialType} onChange={setCredentialType} />
                    <Textarea label="Claims JSON" minRows={5} value={claims} onChange={(event) => setClaims(event.currentTarget.value)} />
                    <Button onClick={() => void issueDirect()} loading={submitting} disabled={!walletTenantId.trim() || !credentialType}>
                      Queue offer
                    </Button>
                  </>
                )}
              </Stack>
            </Paper>

            <Stack gap="sm">
              <Text fw={700}>Offers</Text>
              {loading && lifecycle.offers.length === 0 ? <Loader size="sm" /> : lifecycle.offers.length === 0 ? (
                <Text size="sm" c="dimmed">No offers for this organisation.</Text>
              ) : lifecycle.offers.map((offer) => (
                <Paper key={offer.rowId} withBorder p="sm" radius="md">
                  <Stack gap="xs">
                    <Group justify="space-between" wrap="nowrap">
                      <Text fw={600} size="sm">{offer.credentialType}</Text>
                      <Badge>{offer.lifecycleStatus}</Badge>
                    </Group>
                    <Text size="xs" c="dimmed">Recipient: {offer.walletTenantId}</Text>
                    {offer.lastError && <Text size="xs" c="red">{offer.lastError}</Text>}
                    <Group grow>
                      <Button
                        size="xs"
                        variant="light"
                        disabled={offer.lifecycleStatus !== 'pending' || reason.trim().length < 3}
                        loading={submitting}
                        onClick={() => void offerAction(offer.rowId, 'reoffer')}
                      >
                        Reoffer
                      </Button>
                      <Button
                        size="xs"
                        variant="light"
                        disabled={!['pending', 'expired'].includes(offer.lifecycleStatus) || reason.trim().length < 3}
                        loading={submitting}
                        onClick={() => void offerAction(offer.rowId, 'replace')}
                      >
                        Replace
                      </Button>
                    </Group>
                  </Stack>
                </Paper>
              ))}
            </Stack>

            <Stack gap="sm">
              <Text fw={700}>Issued credentials</Text>
              {loading && lifecycle.issued.length === 0 ? <Loader size="sm" /> : lifecycle.issued.length === 0 ? (
                <Text size="sm" c="dimmed">No issued credentials for this organisation.</Text>
              ) : lifecycle.issued.map((credential) => (
                <Paper key={credential.credentialId} withBorder p="sm" radius="md">
                  <Stack gap="xs">
                    <Text fw={600} size="sm">{credential.credentialDefinitionId}</Text>
                    <Text size="xs" c="dimmed">Credential ID: {credential.credentialId}</Text>
                    <Group justify="space-between">
                      <Badge
                        color={credential.allocationStatus === 'revoked' || credential.revoked
                          ? 'red'
                          : credential.allocationStatus === 'valid' ? 'green' : 'gray'}
                      >
                        {credential.allocationStatus || (credential.revoked ? 'revoked' : 'untracked')}
                      </Badge>
                      <Button
                        size="xs"
                        color="red"
                        variant="light"
                        disabled={credential.allocationStatus !== 'valid' || reason.trim().length < 3}
                        loading={submitting}
                        onClick={() => void revoke(credential.credentialId)}
                      >
                        Revoke
                      </Button>
                    </Group>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          </>
        )}
      </Stack>
    </AppShellMobile>
  )
}
