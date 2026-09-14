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
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { IconAlertCircle, IconCheck, IconPlus, IconTrash, IconUsers } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'

interface OrgMember {
  userId: string
  role: string
  status: string
  createdAt: string
}

interface InviteBody {
  targetUserId: string
  role: 'admin' | 'member'
}

export default function OrganizationPeoplePage() {
  const [orgTenantId, setOrgTenantId] = useState('')
  const [orgName, setOrgName] = useState('')
  const [members, setMembers] = useState<OrgMember[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteUserId, setInviteUserId] = useState('')
  const [inviteRole, setInviteRole] = useState<string>('member')
  const [inviting, setInviting] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)

  const backendUrl = process.env.NEXT_PUBLIC_HOLDER_URL || 'http://localhost:7000'

  useEffect(() => {
    const activeOrg = readActiveOrganization()
    if (activeOrg?.orgTenantId) {
      setOrgTenantId(activeOrg.orgTenantId)
      setOrgName(activeOrg.name)
    }
  }, [])

  useEffect(() => {
    if (orgTenantId) void loadMembers()
  }, [orgTenantId])

  const getToken = () => getOrgScopedToken() || getPersonalToken()

  const loadMembers = async () => {
    const token = getToken()
    if (!token || !orgTenantId) return
    setLoading(true)
    setError(null)
    try {
      const res = await axios.get<OrgMember[]>(
        `${backendUrl}/api/organizations/${encodeURIComponent(orgTenantId)}/members`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      const list = Array.isArray(res.data) ? res.data : Array.isArray((res.data as any).members) ? (res.data as any).members : []
      setMembers(list)
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load members')
    } finally {
      setLoading(false)
    }
  }

  const handleInvite = async () => {
    const token = getToken()
    if (!token || !orgTenantId || !inviteUserId.trim()) return
    setInviting(true)
    try {
      const body: InviteBody = { targetUserId: inviteUserId.trim(), role: inviteRole as 'admin' | 'member' }
      await axios.post(
        `${backendUrl}/api/organizations/${encodeURIComponent(orgTenantId)}/members`,
        body,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      notifications.show({ title: 'Member invited', message: inviteUserId.trim(), color: 'green', icon: <IconCheck size={16} /> })
      setInviteUserId('')
      setInviteOpen(false)
      void loadMembers()
    } catch (err: any) {
      notifications.show({ title: 'Invite failed', message: err?.response?.data?.message || err?.message, color: 'red' })
    } finally {
      setInviting(false)
    }
  }

  const handleRemove = async (userId: string) => {
    const token = getToken()
    if (!token || !orgTenantId) return
    setRemoving(userId)
    try {
      await axios.delete(
        `${backendUrl}/api/organizations/${encodeURIComponent(orgTenantId)}/members/${encodeURIComponent(userId)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      notifications.show({ title: 'Member removed', message: userId, color: 'gray' })
      void loadMembers()
    } catch (err: any) {
      notifications.show({ title: 'Remove failed', message: err?.response?.data?.message || err?.message, color: 'red' })
    } finally {
      setRemoving(null)
    }
  }

  return (
    <Layout title="Organization People">
      <Container size="xl" py="lg">
        <Stack gap="lg">
          <Paper withBorder={false}>
            <Group justify="space-between" align="center" wrap="wrap">
              <Box>
                <Group gap="xs" mb={4}>
                  <IconUsers size={20} />
                  <Title order={2}>People</Title>
                </Group>
                <Text c="dimmed" size="sm">
                  {orgName ? `Members of ${orgName}` : 'Manage organization members, roles, and invitations.'}
                </Text>
              </Box>
              <Group gap="xs">
                <Button variant="default" size="sm" component="a" href="/organization/setup">
                  ← Setup Center
                </Button>
                <Button leftSection={<IconPlus size={16} />} size="sm" onClick={() => setInviteOpen(true)} disabled={!orgTenantId}>
                  Invite Member
                </Button>
              </Group>
            </Group>
          </Paper>

          {!orgTenantId && (
            <Alert icon={<IconAlertCircle size={16} />} color="yellow" title="No organization selected">
              Use the account picker in the header to switch into an organization context first.
            </Alert>
          )}

          {error && (
            <Alert icon={<IconAlertCircle size={16} />} color="red" title="Error">
              {error}
            </Alert>
          )}

          {orgTenantId && (
            <Card withBorder radius="md" p="lg">
              <Group justify="space-between" mb="md">
                <Title order={4}>Team Members</Title>
                <Badge variant="light">{members.length}</Badge>
              </Group>

              <Divider mb="md" />

              {loading ? (
                <Text c="dimmed" size="sm">Loading…</Text>
              ) : members.length === 0 ? (
                <Stack align="center" py="xl" gap="xs">
                  <IconUsers size={40} color="var(--mantine-color-gray-4)" />
                  <Text c="dimmed">No members yet. Invite your first team member.</Text>
                  <Button size="sm" leftSection={<IconPlus size={14} />} onClick={() => setInviteOpen(true)}>
                    Invite Member
                  </Button>
                </Stack>
              ) : (
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>User ID</Table.Th>
                      <Table.Th>Role</Table.Th>
                      <Table.Th>Status</Table.Th>
                      <Table.Th>Joined</Table.Th>
                      <Table.Th />
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {members.map((m) => (
                      <Table.Tr key={m.userId}>
                        <Table.Td>
                          <Text size="sm" fw={500} ff="monospace">
                            {m.userId.length > 20 ? `${m.userId.slice(0, 20)}…` : m.userId}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Badge
                            size="sm"
                            color={m.role === 'owner' || m.role === 'admin' ? 'blue' : 'gray'}
                            variant="light"
                          >
                            {m.role}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Badge
                            size="sm"
                            color={m.status === 'active' ? 'teal' : m.status === 'suspended' ? 'red' : 'orange'}
                          >
                            {m.status}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Text size="xs" c="dimmed">
                            {m.createdAt ? new Date(m.createdAt).toLocaleDateString() : '—'}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          {m.role !== 'owner' && (
                            <Button
                              size="xs"
                              variant="subtle"
                              color="red"
                              leftSection={<IconTrash size={12} />}
                              loading={removing === m.userId}
                              onClick={() => handleRemove(m.userId)}
                            >
                              Remove
                            </Button>
                          )}
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

      <Modal opened={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite Member" centered>
        <Stack gap="md">
          <TextInput
            label="User ID"
            description="The internal user ID of the person to invite"
            placeholder="uuid or ssi_users.id"
            value={inviteUserId}
            onChange={(e) => setInviteUserId(e.currentTarget.value)}
            required
          />
          <Select
            label="Role"
            data={[
              { value: 'member', label: 'Member' },
              { value: 'admin', label: 'Admin' },
            ]}
            value={inviteRole}
            onChange={(v) => setInviteRole(v || 'member')}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button
              loading={inviting}
              disabled={!inviteUserId.trim()}
              onClick={handleInvite}
              leftSection={<IconPlus size={14} />}
            >
              Invite
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Layout>
  )
}
