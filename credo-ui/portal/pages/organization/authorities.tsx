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
    NumberInput,
    Paper,
    Select,
    Stack,
    Table,
    Text,
    TextInput,
    Title,
} from '@mantine/core'
import {
    IconAlertCircle,
    IconCheck,
    IconPlus,
    IconShieldCheck,
    IconTrash,
} from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'

import { useRequireOrgContext } from '@/lib/portalContext'
interface Authority {
    id: string
    userId: string
    role: string
    domain: string
    thresholdAmount?: number
    currency?: string
    status: string
    createdAt: string
}

interface GrantAuthorityBody {
    userId: string
    role: string
    domain: string
    thresholdAmount?: number
    currency?: string
}

const DOMAIN_OPTIONS = [
    { value: 'finance', label: 'Finance' },
    { value: 'procurement', label: 'Procurement' },
    { value: 'hr', label: 'HR' },
    { value: 'operations', label: 'Operations' },
    { value: 'trust', label: 'Trust' },
    { value: 'general', label: 'General' },
]

const CURRENCY_OPTIONS = [
    { value: 'USD', label: 'USD' },
    { value: 'ZWL', label: 'ZWL' },
    { value: 'ZAR', label: 'ZAR' },
    { value: 'GBP', label: 'GBP' },
]

const DOMAIN_COLORS: Record<string, string> = {
    finance: 'blue',
    procurement: 'violet',
    hr: 'pink',
    operations: 'orange',
    trust: 'teal',
    general: 'gray',
}

export default function OrganizationAuthoritiesPage() {
  // Org-only surface: personal sessions are redirected (mirrors mobile /finance → /inbox).
  useRequireOrgContext('/organization/setup')

    const [orgTenantId, setOrgTenantId] = useState('')
    const [orgName, setOrgName] = useState('')
    const [authorities, setAuthorities] = useState<Authority[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const [grantOpen, setGrantOpen] = useState(false)
    const [grantUserId, setGrantUserId] = useState('')
    const [grantRole, setGrantRole] = useState('')
    const [grantDomain, setGrantDomain] = useState<string>('finance')
    const [grantThreshold, setGrantThreshold] = useState<number | string>('')
    const [grantCurrency, setGrantCurrency] = useState<string>('USD')
    const [granting, setGranting] = useState(false)
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
        if (orgTenantId) void loadAuthorities()
    }, [orgTenantId])

    const loadAuthorities = async () => {
        const token = getToken()
        if (!token || !orgTenantId) return
        setLoading(true)
        setError(null)
        try {
            const res = await axios.get<Authority[]>(
                `${backendUrl}/api/organizations/${encodeURIComponent(orgTenantId)}/authorities`,
                { headers: { Authorization: `Bearer ${token}` } },
            )
            const list = Array.isArray(res.data)
                ? res.data
                : Array.isArray((res.data as any).authorities)
                    ? (res.data as any).authorities
                    : []
            setAuthorities(list)
        } catch (err: any) {
            setError(err?.response?.data?.message || err?.message || 'Failed to load authorities')
        } finally {
            setLoading(false)
        }
    }

    const handleGrant = async () => {
        const token = getToken()
        if (!token || !orgTenantId || !grantUserId.trim() || !grantRole.trim()) return
        setGranting(true)
        try {
            const body: GrantAuthorityBody = {
                userId: grantUserId.trim(),
                role: grantRole.trim(),
                domain: grantDomain,
                thresholdAmount: grantThreshold !== '' ? Number(grantThreshold) : undefined,
                currency: grantThreshold !== '' ? grantCurrency : undefined,
            }
            await axios.post(
                `${backendUrl}/api/organizations/${encodeURIComponent(orgTenantId)}/authorities`,
                body,
                { headers: { Authorization: `Bearer ${token}` } },
            )
            notifications.show({
                title: 'Authority granted',
                message: `${grantRole} · ${grantDomain}`,
                color: 'green',
                icon: <IconCheck size={16} />,
            })
            setGrantUserId('')
            setGrantRole('')
            setGrantDomain('finance')
            setGrantThreshold('')
            setGrantCurrency('USD')
            setGrantOpen(false)
            void loadAuthorities()
        } catch (err: any) {
            notifications.show({
                title: 'Grant failed',
                message: err?.response?.data?.message || err?.message,
                color: 'red',
            })
        } finally {
            setGranting(false)
        }
    }

    const handleRevoke = async (id: string) => {
        const token = getToken()
        if (!token || !orgTenantId) return
        setRevoking(id)
        try {
            await axios.delete(
                `${backendUrl}/api/organizations/${encodeURIComponent(orgTenantId)}/authorities/${encodeURIComponent(id)}`,
                { headers: { Authorization: `Bearer ${token}` } },
            )
            notifications.show({ title: 'Authority revoked', message: id, color: 'gray' })
            void loadAuthorities()
        } catch (err: any) {
            notifications.show({
                title: 'Revoke failed',
                message: err?.response?.data?.message || err?.message,
                color: 'red',
            })
        } finally {
            setRevoking(null)
        }
    }

    return (
        <Layout title="Authorities">
            <Container size="xl" py="lg">
                <Stack gap="lg">
                    <Paper withBorder={false}>
                        <Group justify="space-between" align="center" wrap="wrap">
                            <Box>
                                <Group gap="xs" mb={4}>
                                    <IconShieldCheck size={20} />
                                    <Title order={2}>Authorities</Title>
                                </Group>
                                <Text c="dimmed" size="sm">
                                    {orgName
                                        ? `Approval authorities in ${orgName}`
                                        : 'Configure who can approve requests and up to what amount.'}
                                </Text>
                            </Box>
                            <Group gap="xs">
                                <Button variant="default" size="sm" component="a" href="/organization/setup">
                                    ← Setup Center
                                </Button>
                                <Button
                                    leftSection={<IconPlus size={16} />}
                                    size="sm"
                                    onClick={() => setGrantOpen(true)}
                                    disabled={!orgTenantId}
                                >
                                    Grant Authority
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
                                <Title order={4}>Authority Grants</Title>
                                <Badge variant="light">{authorities.length}</Badge>
                            </Group>

                            <Divider mb="md" />

                            {loading ? (
                                <Text c="dimmed" size="sm">
                                    Loading…
                                </Text>
                            ) : authorities.length === 0 ? (
                                <Stack align="center" py="xl" gap="xs">
                                    <IconShieldCheck size={40} color="var(--mantine-color-gray-4)" />
                                    <Text c="dimmed">
                                        No authority grants yet. Grant authority to enable workflow approvals.
                                    </Text>
                                    <Button
                                        size="sm"
                                        leftSection={<IconPlus size={14} />}
                                        onClick={() => setGrantOpen(true)}
                                    >
                                        Grant Authority
                                    </Button>
                                </Stack>
                            ) : (
                                <Table striped highlightOnHover>
                                    <Table.Thead>
                                        <Table.Tr>
                                            <Table.Th>Member</Table.Th>
                                            <Table.Th>Role</Table.Th>
                                            <Table.Th>Domain</Table.Th>
                                            <Table.Th>Threshold</Table.Th>
                                            <Table.Th>Status</Table.Th>
                                            <Table.Th>Granted</Table.Th>
                                            <Table.Th />
                                        </Table.Tr>
                                    </Table.Thead>
                                    <Table.Tbody>
                                        {authorities.map((a) => (
                                            <Table.Tr key={a.id}>
                                                <Table.Td>
                                                    <Text size="sm" fw={500} ff="monospace">
                                                        {a.userId.length > 20 ? `${a.userId.slice(0, 20)}…` : a.userId}
                                                    </Text>
                                                </Table.Td>
                                                <Table.Td>
                                                    <Badge size="sm" variant="light" color="blue">
                                                        {a.role}
                                                    </Badge>
                                                </Table.Td>
                                                <Table.Td>
                                                    <Badge
                                                        size="sm"
                                                        variant="dot"
                                                        color={DOMAIN_COLORS[a.domain] || 'gray'}
                                                    >
                                                        {a.domain}
                                                    </Badge>
                                                </Table.Td>
                                                <Table.Td>
                                                    <Text size="sm">
                                                        {a.thresholdAmount != null
                                                            ? `${a.currency ?? ''} ${a.thresholdAmount.toLocaleString()}`
                                                            : <Text size="sm" c="dimmed">Unlimited</Text>}
                                                    </Text>
                                                </Table.Td>
                                                <Table.Td>
                                                    <Badge
                                                        size="sm"
                                                        color={a.status === 'active' ? 'teal' : a.status === 'suspended' ? 'red' : 'gray'}
                                                    >
                                                        {a.status}
                                                    </Badge>
                                                </Table.Td>
                                                <Table.Td>
                                                    <Text size="xs" c="dimmed">
                                                        {a.createdAt ? new Date(a.createdAt).toLocaleDateString() : '—'}
                                                    </Text>
                                                </Table.Td>
                                                <Table.Td>
                                                    <Button
                                                        size="xs"
                                                        variant="subtle"
                                                        color="red"
                                                        leftSection={<IconTrash size={12} />}
                                                        loading={revoking === a.id}
                                                        onClick={() => handleRevoke(a.id)}
                                                    >
                                                        Revoke
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

            <Modal opened={grantOpen} onClose={() => setGrantOpen(false)} title="Grant Authority" centered>
                <Stack gap="md">
                    <TextInput
                        label="User ID"
                        description="Internal user ID of the member receiving this authority"
                        placeholder="uuid or ssi_users.id"
                        value={grantUserId}
                        onChange={(e) => setGrantUserId(e.currentTarget.value)}
                        required
                    />
                    <TextInput
                        label="Role / title"
                        description="e.g. Finance Manager, Procurement Officer"
                        placeholder="Finance Approver"
                        value={grantRole}
                        onChange={(e) => setGrantRole(e.currentTarget.value)}
                        required
                    />
                    <Select
                        label="Domain"
                        description="Area of responsibility this authority covers"
                        data={DOMAIN_OPTIONS}
                        value={grantDomain}
                        onChange={(v) => setGrantDomain(v || 'finance')}
                    />
                    <Group align="end" grow>
                        <NumberInput
                            label="Approval threshold"
                            description="Maximum amount this authority can approve (leave blank for unlimited)"
                            placeholder="5000"
                            value={grantThreshold}
                            onChange={(v) => setGrantThreshold(v)}
                            min={0}
                            allowDecimal
                        />
                        <Select
                            label="Currency"
                            data={CURRENCY_OPTIONS}
                            value={grantCurrency}
                            onChange={(v) => setGrantCurrency(v || 'USD')}
                            disabled={grantThreshold === ''}
                        />
                    </Group>
                    <Group justify="flex-end">
                        <Button variant="default" onClick={() => setGrantOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            loading={granting}
                            disabled={!grantUserId.trim() || !grantRole.trim()}
                            onClick={handleGrant}
                            leftSection={<IconShieldCheck size={14} />}
                        >
                            Grant
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Layout>
    )
}
