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
    Stack,
    Table,
    Text,
    Textarea,
    TextInput,
    Title,
} from '@mantine/core'
import {
    IconAlertCircle,
    IconBuilding,
    IconCheck,
    IconPlus,
    IconTrash,
} from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'

import { useRequireOrgContext } from '@/lib/portalContext'
interface Department {
    id: string
    name: string
    code: string
    description?: string
    memberCount?: number
    createdAt: string
}

interface CreateDepartmentBody {
    name: string
    code: string
    description?: string
}

export default function OrganizationDepartmentsPage() {
  // Org-only surface: personal sessions are redirected (mirrors mobile /finance → /inbox).
  useRequireOrgContext('/organization/setup')

    const [orgTenantId, setOrgTenantId] = useState('')
    const [orgName, setOrgName] = useState('')
    const [departments, setDepartments] = useState<Department[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const [createOpen, setCreateOpen] = useState(false)
    const [deptName, setDeptName] = useState('')
    const [deptCode, setDeptCode] = useState('')
    const [deptDescription, setDeptDescription] = useState('')
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
        if (orgTenantId) void loadDepartments()
    }, [orgTenantId])

    const loadDepartments = async () => {
        const token = getToken()
        if (!token || !orgTenantId) return
        setLoading(true)
        setError(null)
        try {
            const res = await axios.get<Department[]>(
                `${backendUrl}/api/organizations/${encodeURIComponent(orgTenantId)}/departments`,
                { headers: { Authorization: `Bearer ${token}` } },
            )
            const list = Array.isArray(res.data)
                ? res.data
                : Array.isArray((res.data as any).departments)
                    ? (res.data as any).departments
                    : []
            setDepartments(list)
        } catch (err: any) {
            setError(err?.response?.data?.message || err?.message || 'Failed to load departments')
        } finally {
            setLoading(false)
        }
    }

    const handleCreate = async () => {
        const token = getToken()
        if (!token || !orgTenantId || !deptName.trim()) return
        setCreating(true)
        try {
            const body: CreateDepartmentBody = {
                name: deptName.trim(),
                code: deptCode.trim().toUpperCase(),
                description: deptDescription.trim() || undefined,
            }
            await axios.post(
                `${backendUrl}/api/organizations/${encodeURIComponent(orgTenantId)}/departments`,
                body,
                { headers: { Authorization: `Bearer ${token}` } },
            )
            notifications.show({
                title: 'Department created',
                message: deptName.trim(),
                color: 'green',
                icon: <IconCheck size={16} />,
            })
            setDeptName('')
            setDeptCode('')
            setDeptDescription('')
            setCreateOpen(false)
            void loadDepartments()
        } catch (err: any) {
            notifications.show({
                title: 'Create failed',
                message: err?.response?.data?.message || err?.message,
                color: 'red',
            })
        } finally {
            setCreating(false)
        }
    }

    const handleDelete = async (id: string, name: string) => {
        const token = getToken()
        if (!token || !orgTenantId) return
        setDeleting(id)
        try {
            await axios.delete(
                `${backendUrl}/api/organizations/${encodeURIComponent(orgTenantId)}/departments/${encodeURIComponent(id)}`,
                { headers: { Authorization: `Bearer ${token}` } },
            )
            notifications.show({ title: 'Department removed', message: name, color: 'gray' })
            void loadDepartments()
        } catch (err: any) {
            notifications.show({
                title: 'Delete failed',
                message: err?.response?.data?.message || err?.message,
                color: 'red',
            })
        } finally {
            setDeleting(null)
        }
    }

    const handleCodeFromName = (name: string) => {
        // Auto-derive a short code from the name when the user types
        if (!deptCode) {
            setDeptCode(
                name
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, '')
                    .slice(0, 6),
            )
        }
    }

    return (
        <Layout title="Departments">
            <Container size="xl" py="lg">
                <Stack gap="lg">
                    <Paper withBorder={false}>
                        <Group justify="space-between" align="center" wrap="wrap">
                            <Box>
                                <Group gap="xs" mb={4}>
                                    <IconBuilding size={20} />
                                    <Title order={2}>Departments</Title>
                                </Group>
                                <Text c="dimmed" size="sm">
                                    {orgName
                                        ? `Departments in ${orgName}`
                                        : 'Manage organizational departments and cost centres.'}
                                </Text>
                            </Box>
                            <Group gap="xs">
                                <Button variant="default" size="sm" component="a" href="/organization/setup">
                                    ← Setup Center
                                </Button>
                                <Button
                                    leftSection={<IconPlus size={16} />}
                                    size="sm"
                                    onClick={() => setCreateOpen(true)}
                                    disabled={!orgTenantId}
                                >
                                    Add Department
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
                                <Title order={4}>Departments</Title>
                                <Badge variant="light">{departments.length}</Badge>
                            </Group>

                            <Divider mb="md" />

                            {loading ? (
                                <Text c="dimmed" size="sm">
                                    Loading…
                                </Text>
                            ) : departments.length === 0 ? (
                                <Stack align="center" py="xl" gap="xs">
                                    <IconBuilding size={40} color="var(--mantine-color-gray-4)" />
                                    <Text c="dimmed">No departments yet. Add your first department.</Text>
                                    <Button
                                        size="sm"
                                        leftSection={<IconPlus size={14} />}
                                        onClick={() => setCreateOpen(true)}
                                    >
                                        Add Department
                                    </Button>
                                </Stack>
                            ) : (
                                <Table striped highlightOnHover>
                                    <Table.Thead>
                                        <Table.Tr>
                                            <Table.Th>Name</Table.Th>
                                            <Table.Th>Code</Table.Th>
                                            <Table.Th>Description</Table.Th>
                                            <Table.Th>Members</Table.Th>
                                            <Table.Th>Created</Table.Th>
                                            <Table.Th />
                                        </Table.Tr>
                                    </Table.Thead>
                                    <Table.Tbody>
                                        {departments.map((d) => (
                                            <Table.Tr key={d.id}>
                                                <Table.Td>
                                                    <Text size="sm" fw={500}>
                                                        {d.name}
                                                    </Text>
                                                </Table.Td>
                                                <Table.Td>
                                                    <Badge variant="outline" size="sm" ff="monospace">
                                                        {d.code}
                                                    </Badge>
                                                </Table.Td>
                                                <Table.Td>
                                                    <Text size="xs" c="dimmed" lineClamp={1}>
                                                        {d.description || '—'}
                                                    </Text>
                                                </Table.Td>
                                                <Table.Td>
                                                    <Text size="sm">{d.memberCount ?? '—'}</Text>
                                                </Table.Td>
                                                <Table.Td>
                                                    <Text size="xs" c="dimmed">
                                                        {d.createdAt ? new Date(d.createdAt).toLocaleDateString() : '—'}
                                                    </Text>
                                                </Table.Td>
                                                <Table.Td>
                                                    <Button
                                                        size="xs"
                                                        variant="subtle"
                                                        color="red"
                                                        leftSection={<IconTrash size={12} />}
                                                        loading={deleting === d.id}
                                                        onClick={() => handleDelete(d.id, d.name)}
                                                    >
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

            <Modal
                opened={createOpen}
                onClose={() => setCreateOpen(false)}
                title="Add Department"
                centered
            >
                <Stack gap="md">
                    <TextInput
                        label="Department name"
                        placeholder="Finance, Operations, IT…"
                        value={deptName}
                        onChange={(e) => {
                            setDeptName(e.currentTarget.value)
                            handleCodeFromName(e.currentTarget.value)
                        }}
                        required
                    />
                    <TextInput
                        label="Short code"
                        description="Uppercase identifier used in requests and cost centres"
                        placeholder="FIN, OPS, IT"
                        value={deptCode}
                        onChange={(e) => setDeptCode(e.currentTarget.value.toUpperCase())}
                        maxLength={8}
                    />
                    <Textarea
                        label="Description"
                        placeholder="Optional — what does this department handle?"
                        value={deptDescription}
                        onChange={(e) => setDeptDescription(e.currentTarget.value)}
                        rows={3}
                    />
                    <Group justify="flex-end">
                        <Button variant="default" onClick={() => setCreateOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            loading={creating}
                            disabled={!deptName.trim()}
                            onClick={handleCreate}
                            leftSection={<IconPlus size={14} />}
                        >
                            Create
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Layout>
    )
}
