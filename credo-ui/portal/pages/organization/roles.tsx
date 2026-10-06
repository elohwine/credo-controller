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
  Checkbox,
  Group,
  Modal,
  Paper,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { IconAlertCircle, IconCheck, IconPlus, IconTrash, IconUserShield } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'

import { useRequireOrgContext } from '@/lib/portalContext'
import { PERMISSION_CHOICES, permissionLabel } from '@/lib/orgPeople'

const PERMISSION_GROUPS = Array.from(new Set(PERMISSION_CHOICES.map((choice) => choice.group)))
const DEFAULT_PERMISSIONS = ['request.read', 'request.submit']
interface RoleRecord {
  id: string
  name: string
  description?: string
  permissions: string[]
  createdAt: string
}

export default function OrganizationRolesPage() {
  // Org-only surface: personal sessions are redirected (mirrors mobile /finance → /inbox).
  useRequireOrgContext('/organization/setup')

  const [orgTenantId, setOrgTenantId] = useState('')
  const [orgName, setOrgName] = useState('')
  const [roles, setRoles] = useState<RoleRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [permissions, setPermissions] = useState<string[]>(DEFAULT_PERMISSIONS)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

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
    if (orgTenantId) void loadRoles()
  }, [orgTenantId])

  const loadRoles = async () => {
    const token = getToken()
    if (!token || !orgTenantId) return
    setLoading(true)
    setError(null)
    try {
      const res = await axios.get<RoleRecord[]>(`${backendUrl}/api/organizations/${encodeURIComponent(orgTenantId)}/roles`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const list = Array.isArray(res.data) ? res.data : Array.isArray((res.data as any).roles) ? (res.data as any).roles : []
      setRoles(list)
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load roles')
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    const token = getToken()
    if (!token || !orgTenantId || !name.trim()) return
    setCreating(true)
    try {
      await axios.post(
        `${backendUrl}/api/organizations/${encodeURIComponent(orgTenantId)}/roles`,
        { name: name.trim(), description: description.trim() || undefined, permissions },
        { headers: { Authorization: `Bearer ${token}` } },
      )
      notifications.show({ title: 'Role created', message: name.trim(), color: 'green', icon: <IconCheck size={16} /> })
      setName('')
      setDescription('')
      setPermissions(DEFAULT_PERMISSIONS)
      setCreateOpen(false)
      void loadRoles()
    } catch (err: any) {
      notifications.show({ title: 'Create failed', message: err?.response?.data?.message || err?.message, color: 'red' })
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string, roleName: string) => {
    const token = getToken()
    if (!token || !orgTenantId) return
    if (!window.confirm(`Remove the "${roleName}" role?`)) return
    setDeleting(id)
    try {
      await axios.delete(`${backendUrl}/api/organizations/${encodeURIComponent(orgTenantId)}/roles/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      notifications.show({ title: 'Role deleted', message: roleName, color: 'gray' })
      void loadRoles()
    } catch (err: any) {
      notifications.show({ title: 'Delete failed', message: err?.response?.data?.message || err?.message, color: 'red' })
    } finally {
      setDeleting(null)
    }
  }

  return (
    <Layout title="Roles">
      <Container size="xl" py="lg">
        <Stack gap="lg">
          <Paper withBorder={false}>
            <Group justify="space-between" align="center" wrap="wrap">
              <Box>
                <Group gap="xs" mb={4}>
                  <IconUserShield size={20} />
                  <Title order={2}>Roles</Title>
                </Group>
                <Text c="dimmed" size="sm">
                  {orgName ? `What each kind of person at ${orgName} can do` : 'Decide what each kind of person can do.'}
                </Text>
              </Box>
              <Group gap="xs">
                <Button variant="default" size="sm" component="a" href="/organization/setup">← Setup Center</Button>
                <Button leftSection={<IconPlus size={16} />} size="sm" onClick={() => setCreateOpen(true)} disabled={!orgTenantId}>Add Role</Button>
              </Group>
            </Group>
          </Paper>

          {!orgTenantId && <Alert icon={<IconAlertCircle size={16} />} color="yellow" title="No organization selected">Use the account picker in the header to switch into an organization context first.</Alert>}
          {error && <Alert icon={<IconAlertCircle size={16} />} color="red" title="Error">{error}</Alert>}

          {orgTenantId && (
            <Card withBorder radius="md" p="lg">
              <Group justify="space-between" mb="md">
                <Title order={4}>Roles</Title>
                <Badge variant="light">{roles.length}</Badge>
              </Group>
              <Divider mb="md" />
              {loading ? (
                <Text c="dimmed" size="sm">Loading…</Text>
              ) : roles.length === 0 ? (
                <Stack align="center" py="xl" gap="xs">
                  <IconUserShield size={40} color="var(--mantine-color-gray-4)" />
                  <Text c="dimmed">No roles yet. Add one, for example "Finance officer".</Text>
                  <Button size="sm" leftSection={<IconPlus size={14} />} onClick={() => setCreateOpen(true)}>Add Role</Button>
                </Stack>
              ) : (
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Name</Table.Th>
                      <Table.Th>Description</Table.Th>
                      <Table.Th>Can do</Table.Th>
                      <Table.Th>Created</Table.Th>
                      <Table.Th />
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {roles.map((role) => (
                      <Table.Tr key={role.id}>
                        <Table.Td><Text fw={600} size="sm">{role.name}</Text></Table.Td>
                        <Table.Td><Text size="xs" c="dimmed">{role.description || '—'}</Text></Table.Td>
                        <Table.Td>
                          <Group gap={4}>
                            {role.permissions.slice(0, 3).map((permission) => (
                              <Badge key={permission} size="xs" variant="outline">{permissionLabel(permission)}</Badge>
                            ))}
                            {role.permissions.length > 3 && <Badge size="xs">+{role.permissions.length - 3}</Badge>}
                          </Group>
                        </Table.Td>
                        <Table.Td><Text size="xs" c="dimmed">{role.createdAt ? new Date(role.createdAt).toLocaleDateString() : '—'}</Text></Table.Td>
                        <Table.Td>
                          <Button size="xs" variant="subtle" color="red" leftSection={<IconTrash size={12} />} loading={deleting === role.id} onClick={() => handleDelete(role.id, role.name)}>
                            Remove
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

      <Modal opened={createOpen} onClose={() => setCreateOpen(false)} title="Add Role" centered>
        <Stack gap="md">
          <TextInput label="Role name" placeholder="Finance officer" value={name} onChange={(e) => setName(e.currentTarget.value)} required />
          <TextInput label="Short description" placeholder="Approves and pays requests" value={description} onChange={(e) => setDescription(e.currentTarget.value)} />
          <Checkbox.Group label="What can this person do?" value={permissions} onChange={setPermissions}>
            <Stack gap="sm" mt="xs">
              {PERMISSION_GROUPS.map((group) => (
                <Box key={group}>
                  <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb={4}>{group}</Text>
                  <Stack gap={6}>
                    {PERMISSION_CHOICES.filter((choice) => choice.group === group).map((choice) => (
                      <Checkbox key={choice.value} value={choice.value} label={choice.label} />
                    ))}
                  </Stack>
                </Box>
              ))}
            </Stack>
          </Checkbox.Group>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button loading={creating} disabled={!name.trim() || permissions.length === 0} onClick={handleCreate} leftSection={<IconPlus size={14} />}>Create</Button>
          </Group>
        </Stack>
      </Modal>
    </Layout>
  )
}
