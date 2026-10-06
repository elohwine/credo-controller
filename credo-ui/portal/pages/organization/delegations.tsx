import React, { useEffect, useState } from 'react'
import axios from 'axios'
import Layout from '@/components/Layout'
import { getOrgScopedToken, readActiveOrganization, getPersonalToken } from '@/utils/organizationContext'
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Container,
  Divider,
  Group,
  Modal,
  MultiSelect,
  NumberInput,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { IconAlertCircle, IconArrowRight, IconCheck, IconPlus, IconTrash, IconUsersGroup } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'

import { useRequireOrgContext } from '@/lib/portalContext'
import { OrgPerson, PERMISSION_CHOICES, permissionLabel, personLabel, personLabelById, roleLabel } from '@/lib/orgPeople'

const DEFAULT_PERMISSIONS = ['request.approve']
const PERMISSION_GROUPS = Array.from(new Set(PERMISSION_CHOICES.map((choice) => choice.group)))
interface DelegationRecord {
  id: string
  delegatorUserId: string
  delegateUserId: string
  permissions: string[]
  maxAmount?: number
  currency?: string
  validFrom: string
  validUntil?: string
  status: string
  createdAt: string
}

export default function OrganizationDelegationsPage() {
  // Org-only surface: personal sessions are redirected (mirrors mobile /finance → /inbox).
  useRequireOrgContext('/organization/setup')

  const [orgTenantId, setOrgTenantId] = useState('')
  const [orgName, setOrgName] = useState('')
  const [delegations, setDelegations] = useState<DelegationRecord[]>([])
  const [members, setMembers] = useState<OrgPerson[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [delegatorUserId, setDelegatorUserId] = useState('')
  const [delegateUserId, setDelegateUserId] = useState('')
  const [permissions, setPermissions] = useState<string[]>(DEFAULT_PERMISSIONS)
  const [maxAmount, setMaxAmount] = useState<number | string>('')
  const [currency, setCurrency] = useState('USD')
  const [validFrom, setValidFrom] = useState(new Date().toISOString().slice(0, 10))
  const [validUntil, setValidUntil] = useState('')
  const [creating, setCreating] = useState(false)
  const [revoking, setRevoking] = useState<string | null>(null)

  const backendUrl = process.env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000'
  const getToken = () => getOrgScopedToken() || getPersonalToken()

  useEffect(() => {
    const activeOrg = readActiveOrganization()
    if (activeOrg?.orgTenantId) {
      setOrgTenantId(activeOrg.orgTenantId)
      setOrgName(activeOrg.name)
    }
  }, [])

  useEffect(() => {
    if (orgTenantId) {
      void loadDelegations()
      void loadMembers()
    }
  }, [orgTenantId])

  const loadMembers = async () => {
    const token = getToken()
    if (!token || !orgTenantId) return
    try {
      const res = await axios.get(`${backendUrl}/api/organizations/${encodeURIComponent(orgTenantId)}/members`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const list = Array.isArray(res.data) ? res.data : Array.isArray((res.data as any).members) ? (res.data as any).members : []
      setMembers(list.filter((m: OrgPerson) => !m.status || m.status === 'active'))
    } catch {
      setMembers([])
    }
  }

  const personOptions = members.map((m) => ({ value: m.userId, label: `${personLabel(m)} · ${roleLabel(m.role)}` }))

  const loadDelegations = async () => {
    const token = getToken()
    if (!token || !orgTenantId) return
    setLoading(true)
    setError(null)
    try {
      const res = await axios.get<DelegationRecord[]>(`${backendUrl}/api/organizations/${encodeURIComponent(orgTenantId)}/delegations`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const list = Array.isArray(res.data) ? res.data : Array.isArray((res.data as any).delegations) ? (res.data as any).delegations : []
      setDelegations(list)
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load delegations')
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    const token = getToken()
    if (!token || !orgTenantId || !delegatorUserId.trim() || !delegateUserId.trim()) return
    setCreating(true)
    try {
      await axios.post(
        `${backendUrl}/api/organizations/${encodeURIComponent(orgTenantId)}/delegations`,
        {
          delegatorUserId: delegatorUserId.trim(),
          delegateUserId: delegateUserId.trim(),
          permissions,
          maxAmount: maxAmount === '' ? undefined : Number(maxAmount),
          currency: maxAmount === '' ? undefined : currency,
          validFrom: new Date(validFrom).toISOString(),
          validUntil: validUntil ? new Date(validUntil).toISOString() : undefined,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      )
      notifications.show({
        title: 'Stand-in saved',
        message: `${personLabelById(members, delegatorUserId)} → ${personLabelById(members, delegateUserId)}`,
        color: 'green',
        icon: <IconCheck size={16} />,
      })
      setDelegatorUserId('')
      setDelegateUserId('')
      setPermissions(DEFAULT_PERMISSIONS)
      setMaxAmount('')
      setCurrency('USD')
      setValidFrom(new Date().toISOString().slice(0, 10))
      setValidUntil('')
      setCreateOpen(false)
      void loadDelegations()
    } catch (err: any) {
      notifications.show({ title: 'Create failed', message: err?.response?.data?.message || err?.message, color: 'red' })
    } finally {
      setCreating(false)
    }
  }

  const handleRevoke = async (id: string) => {
    const token = getToken()
    if (!token || !orgTenantId) return
    if (!window.confirm('End this stand-in arrangement?')) return
    setRevoking(id)
    try {
      await axios.delete(`${backendUrl}/api/organizations/${encodeURIComponent(orgTenantId)}/delegations/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      notifications.show({ title: 'Stand-in ended', message: 'The arrangement no longer applies.', color: 'gray' })
      void loadDelegations()
    } catch (err: any) {
      notifications.show({ title: 'Revoke failed', message: err?.response?.data?.message || err?.message, color: 'red' })
    } finally {
      setRevoking(null)
    }
  }

  return (
    <Layout title="Stand-ins">
      <Container size="xl" py="lg">
        <Stack gap="lg">
          <Paper withBorder={false}>
            <Group justify="space-between" align="center" wrap="wrap">
              <Box>
                <Group gap="xs" mb={4}>
                  <IconUsersGroup size={20} />
                  <Title order={2}>Stand-ins</Title>
                </Group>
                <Text c="dimmed" size="sm">
                  {orgName ? `Who can act for someone else at ${orgName}, for example while they are away` : 'Let one person act for another while they are away.'}
                </Text>
              </Box>
              <Group gap="xs">
                <Button variant="default" size="sm" component="a" href="/organization/setup">← Setup Center</Button>
                <Button leftSection={<IconPlus size={16} />} size="sm" onClick={() => setCreateOpen(true)} disabled={!orgTenantId}>Add stand-in</Button>
              </Group>
            </Group>
          </Paper>

          {!orgTenantId && <Alert icon={<IconAlertCircle size={16} />} color="yellow" title="No organization selected">Use the account picker in the header to switch into an organization context first.</Alert>}
          {error && <Alert icon={<IconAlertCircle size={16} />} color="red" title="Error">{error}</Alert>}

          {orgTenantId && (
            <Card withBorder radius="md" p="lg">
              <Group justify="space-between" mb="md">
                <Title order={4}>Current stand-ins</Title>
                <Badge variant="light">{delegations.length}</Badge>
              </Group>
              <Divider mb="md" />
              {loading ? (
                <Text c="dimmed" size="sm">Loading…</Text>
              ) : delegations.length === 0 ? (
                <Stack align="center" py="xl" gap="xs">
                  <IconUsersGroup size={40} color="var(--mantine-color-gray-4)" />
                  <Text c="dimmed">No stand-ins yet. Add one so approvals do not wait when someone is away.</Text>
                  <Button size="sm" leftSection={<IconPlus size={14} />} onClick={() => setCreateOpen(true)}>Add stand-in</Button>
                </Stack>
              ) : (
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Away</Table.Th>
                      <Table.Th />
                      <Table.Th>Stands in</Table.Th>
                      <Table.Th>Can do</Table.Th>
                      <Table.Th>Limit</Table.Th>
                      <Table.Th>Validity</Table.Th>
                      <Table.Th />
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {delegations.map((row) => (
                      <Table.Tr key={row.id}>
                        <Table.Td><Text size="sm" fw={500}>{personLabelById(members, row.delegatorUserId)}</Text></Table.Td>
                        <Table.Td><IconArrowRight size={14} /></Table.Td>
                        <Table.Td><Text size="sm" fw={500}>{personLabelById(members, row.delegateUserId)}</Text></Table.Td>
                        <Table.Td>
                          <Group gap={4}>
                            {row.permissions.slice(0, 2).map((permission) => <Badge key={permission} size="xs" variant="outline">{permissionLabel(permission)}</Badge>)}
                            {row.permissions.length > 2 && <Badge size="xs">+{row.permissions.length - 2}</Badge>}
                          </Group>
                        </Table.Td>
                        <Table.Td><Text size="sm">{typeof row.maxAmount === 'number' ? `${row.currency || ''} ${row.maxAmount.toLocaleString()}` : '—'}</Text></Table.Td>
                        <Table.Td><Text size="xs" c="dimmed">{new Date(row.validFrom).toLocaleDateString()}{row.validUntil ? ` → ${new Date(row.validUntil).toLocaleDateString()}` : ''}</Text></Table.Td>
                        <Table.Td>
                          <Button size="xs" variant="subtle" color="red" leftSection={<IconTrash size={12} />} loading={revoking === row.id} onClick={() => handleRevoke(row.id)}>
                            End
                          </Button>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              )}
            </Card>
          )}
        </Stack>
      </Container>

      <Modal opened={createOpen} onClose={() => setCreateOpen(false)} title="Add stand-in" centered>
        <Stack gap="md">
          <Select
            label="Who is away?"
            placeholder="Pick a person"
            data={personOptions}
            value={delegatorUserId || null}
            onChange={(v) => setDelegatorUserId(v || '')}
            searchable
            required
            nothingFoundMessage="No team members yet. Invite them under People first."
          />
          <Select
            label="Who stands in for them?"
            placeholder="Pick a person"
            data={personOptions.filter((o) => o.value !== delegatorUserId)}
            value={delegateUserId || null}
            onChange={(v) => setDelegateUserId(v || '')}
            searchable
            required
            nothingFoundMessage="No team members yet. Invite them under People first."
          />
          <MultiSelect
            label="What can they do on their behalf?"
            data={PERMISSION_GROUPS.map((group) => ({
              group,
              items: PERMISSION_CHOICES.filter((c) => c.group === group).map((c) => ({ value: c.value, label: c.label })),
            }))}
            value={permissions}
            onChange={setPermissions}
            required
          />
          <Group grow>
            <NumberInput label="Up to this amount (optional)" value={maxAmount} onChange={setMaxAmount} min={0} allowDecimal />
            <TextInput label="Currency" value={currency} onChange={(e) => setCurrency(e.currentTarget.value.toUpperCase())} maxLength={3} />
          </Group>
          <Group grow>
            <TextInput label="From" type="date" value={validFrom} onChange={(e) => setValidFrom(e.currentTarget.value)} />
            <TextInput label="Until (leave empty for no end)" type="date" value={validUntil} onChange={(e) => setValidUntil(e.currentTarget.value)} />
          </Group>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button loading={creating} disabled={!delegatorUserId || !delegateUserId || permissions.length === 0} onClick={handleCreate} leftSection={<IconPlus size={14} />}>Save</Button>
          </Group>
        </Stack>
      </Modal>
    </Layout>
  )
}
