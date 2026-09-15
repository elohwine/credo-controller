import React, { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import Link from 'next/link'
import {
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  Group,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core'
import { IconAlertCircle, IconArrowRight, IconInbox, IconListDetails, IconRefresh } from '@tabler/icons-react'
import { getOrgScopedToken, readActiveOrganization } from '@/utils/organizationContext'

export type PortalRequestStatus =
  | 'draft'
  | 'submitted'
  | 'in_review'
  | 'approved'
  | 'rejected'
  | 'in_fulfilment'
  | 'completed'
  | 'cancelled'

interface RequestRow {
  id: string
  request_type?: string
  requestType?: string
  title?: string
  description?: string
  amount?: number
  currency?: string
  priority?: 'low' | 'normal' | 'high' | 'urgent' | string
  status?: PortalRequestStatus | string
  created_at?: string
  createdAt?: string
  updated_at?: string
  updatedAt?: string
  submitted_at?: string
  submittedAt?: string
}

interface RequestListResponse {
  items: RequestRow[]
  nextCursor: string | null
}

interface RequestWorkspaceProps {
  mode: 'inbox' | 'requests'
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'in_review', label: 'Under review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'in_fulfilment', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

const REQUEST_TYPE_OPTIONS = [
  { value: 'all', label: 'All request types' },
  { value: 'payment', label: 'Payment' },
  { value: 'requisition', label: 'Requisition' },
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'supplier_verification', label: 'Supplier verification' },
]

function normalizeStatus(value?: string): PortalRequestStatus | string {
  return value || 'draft'
}

function normalizeRequestType(row: RequestRow): string {
  return row.requestType || row.request_type || 'request'
}

function normalizeCreatedAt(row: RequestRow): string | undefined {
  return row.createdAt || row.created_at || row.submittedAt || row.submitted_at
}

function isActionableStatus(status?: string) {
  return ['submitted', 'in_review', 'approved', 'in_fulfilment'].includes(status || '')
}

function statusLabel(status?: string) {
  switch (status) {
    case 'in_review':
      return 'Under review'
    case 'in_fulfilment':
      return 'In progress'
    default:
      return status ? status.replace(/_/g, ' ') : 'Draft'
  }
}

function statusColor(status?: string) {
  switch (status) {
    case 'draft':
      return 'gray'
    case 'submitted':
      return 'blue'
    case 'in_review':
      return 'yellow'
    case 'approved':
      return 'teal'
    case 'rejected':
      return 'red'
    case 'in_fulfilment':
      return 'violet'
    case 'completed':
      return 'green'
    case 'cancelled':
      return 'gray'
    default:
      return 'gray'
  }
}

export default function RequestWorkspace({ mode }: RequestWorkspaceProps) {
  const [orgTenantId, setOrgTenantId] = useState('')
  const [orgName, setOrgName] = useState('')
  const [items, setItems] = useState<RequestRow[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [requestTypeFilter, setRequestTypeFilter] = useState<string>('all')

  const backendUrl = process.env.NEXT_PUBLIC_HOLDER_URL || 'http://localhost:7000'

  useEffect(() => {
    const activeOrg = readActiveOrganization()
    if (activeOrg?.orgTenantId) {
      setOrgTenantId(activeOrg.orgTenantId)
      setOrgName(activeOrg.name)
    }
  }, [])

  const visibleItems = useMemo(() => {
    const filtered = items.filter((row) => {
      const status = normalizeStatus(row.status)
      const requestType = normalizeRequestType(row)

      if (mode === 'inbox' && !isActionableStatus(status)) return false
      if (statusFilter !== 'all' && status !== statusFilter) return false
      if (requestTypeFilter !== 'all' && requestType !== requestTypeFilter) return false
      return true
    })

    return filtered
  }, [items, mode, requestTypeFilter, statusFilter])

  const loadRequests = async (cursor?: string | null, append = false) => {
    if (!orgTenantId) return
    const token = getOrgScopedToken()
    if (!token) {
      setError('Switch to organization context first.')
      return
    }

    if (append) setLoadingMore(true)
    else setLoading(true)
    setError(null)

    try {
      const params: Record<string, string | number> = { limit: 25 }
      if (cursor) params.cursor = cursor
      if (statusFilter !== 'all' && mode !== 'inbox') params.status = statusFilter
      if (requestTypeFilter !== 'all') params.requestType = requestTypeFilter

      const res = await axios.get<RequestListResponse>(`${backendUrl}/api/platform/requests`, {
        params,
        headers: { Authorization: `Bearer ${token}` },
      })

      const responseItems = Array.isArray(res.data?.items) ? res.data.items : []
      setItems((prev) => (append ? [...prev, ...responseItems] : responseItems))
      setNextCursor(res.data?.nextCursor || null)
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load requests')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    if (!orgTenantId) return
    void loadRequests(null, false)
  }, [orgTenantId])

  useEffect(() => {
    if (!orgTenantId) return
    void loadRequests(null, false)
  }, [statusFilter, requestTypeFilter])

  const title = mode === 'inbox' ? 'Inbox' : 'Requests'
  const description =
    mode === 'inbox'
      ? 'Action-oriented work items in your current organization context.'
      : 'All organizational requests visible in your current context.'

  return (
    <Stack gap="lg">
      <Paper withBorder radius="md" p="lg">
        <Group justify="space-between" align="start" wrap="wrap">
          <Box>
            <Group gap="xs" mb={4}>
              {mode === 'inbox' ? <IconInbox size={20} /> : <IconListDetails size={20} />}
              <Title order={2}>{title}</Title>
            </Group>
            <Text size="sm" c="dimmed">
              {orgName ? `${description} Active organization: ${orgName}.` : description}
            </Text>
          </Box>
          <Button leftSection={<IconRefresh size={16} />} onClick={() => void loadRequests(null, false)} loading={loading}>
            Refresh
          </Button>
        </Group>
      </Paper>

      {!orgTenantId && (
        <Alert icon={<IconAlertCircle size={16} />} color="yellow" title="No organization selected">
          Use the account picker to switch into an organization context first.
        </Alert>
      )}

      <Card withBorder radius="md" p="lg">
        <Group align="end" wrap="wrap">
          <Select
            label="Status"
            value={statusFilter}
            onChange={(value) => setStatusFilter(value || 'all')}
            data={STATUS_OPTIONS}
            style={{ minWidth: 220 }}
          />
          <Select
            label="Request type"
            value={requestTypeFilter}
            onChange={(value) => setRequestTypeFilter(value || 'all')}
            data={REQUEST_TYPE_OPTIONS}
            style={{ minWidth: 220 }}
          />
        </Group>
      </Card>

      {error && (
        <Alert icon={<IconAlertCircle size={16} />} color="red" title="Load error">
          {error}
        </Alert>
      )}

      <Card withBorder radius="md" p="lg">
        <Group justify="space-between" mb="md">
          <Title order={4}>{mode === 'inbox' ? 'Actionable Work' : 'Request List'}</Title>
          <Badge variant="light">{visibleItems.length}</Badge>
        </Group>

        {loading ? (
          <Text c="dimmed" size="sm">Loading…</Text>
        ) : visibleItems.length === 0 ? (
          <Stack align="center" py="xl" gap="xs">
            {mode === 'inbox' ? <IconInbox size={40} color="var(--mantine-color-gray-4)" /> : <IconListDetails size={40} color="var(--mantine-color-gray-4)" />}
            <Text c="dimmed">{mode === 'inbox' ? 'No actionable items right now.' : 'No requests found for the current filters.'}</Text>
            <Anchor component={Link} href="/organization/setup" size="sm" fw={500}>
              Open Setup Center →
            </Anchor>
          </Stack>
        ) : (
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Title</Table.Th>
                <Table.Th>Type</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Priority</Table.Th>
                <Table.Th>Amount</Table.Th>
                <Table.Th>Created</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {visibleItems.map((row) => {
                const status = normalizeStatus(row.status)
                const createdAt = normalizeCreatedAt(row)
                return (
                  <Table.Tr key={row.id}>
                    <Table.Td>
                      <Box>
                        <Text fw={600} size="sm">{row.title || row.id}</Text>
                        {row.description && (
                          <Text size="xs" c="dimmed" mt={2}>{row.description}</Text>
                        )}
                      </Box>
                    </Table.Td>
                    <Table.Td>
                      <Badge variant="light">{normalizeRequestType(row)}</Badge>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={statusColor(status)}>{statusLabel(status)}</Badge>
                    </Table.Td>
                    <Table.Td>
                      <Badge variant="outline">{row.priority || 'normal'}</Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">
                        {typeof row.amount === 'number' ? `${row.currency || ''} ${row.amount.toLocaleString()}` : '—'}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" c="dimmed">{createdAt ? new Date(createdAt).toLocaleString() : '—'}</Text>
                    </Table.Td>
                  </Table.Tr>
                )
              })}
            </Table.Tbody>
          </Table>
        )}

        {nextCursor && mode !== 'inbox' && (
          <Group justify="flex-end" mt="md">
            <Button variant="default" rightSection={<IconArrowRight size={14} />} onClick={() => void loadRequests(nextCursor, true)} loading={loadingMore}>
              Load more
            </Button>
          </Group>
        )}
      </Card>
    </Stack>
  )
}
