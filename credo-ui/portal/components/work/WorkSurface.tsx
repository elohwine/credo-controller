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
import { IconAlertCircle, IconArrowRight, IconCheck, IconChecklist, IconRefresh, IconShieldCheck, IconFileCheck } from '@tabler/icons-react'
import { getOrgScopedToken, getPersonalToken, readActiveOrganization } from '@/utils/organizationContext'
import { openOrgSwitcher } from '@/lib/portalContext'

type WorkSurfaceMode = 'approvals' | 'tasks'

type RequestSummary = {
  id: string
  title?: string
  requestType?: string
  status?: string
  createdAt?: string
}

type ApprovalRow = {
  id: string
  requestId: string
  requestTitle: string
  requestType: string
  requestStatus?: string
  approverPersonId?: string | null
  delegatedFromPersonId?: string | null
  approvalType?: string
  decision?: string
  comment?: string | null
  evidenceRef?: string | null
  policyDecisionId?: string | null
  decidedAt?: string | null
  createdAt?: string | null
}

type TaskRow = {
  id: string
  requestId: string
  requestTitle: string
  requestType: string
  requestStatus?: string
  taskType?: string
  assigneePersonId?: string | null
  delegationAllowed?: number | boolean | null
  status?: string
  dueAt?: string | null
  completedAt?: string | null
  outcomeRef?: string | null
  createdAt?: string | null
}

type RequestListResponse = {
  items?: RequestSummary[]
}

type DetailResponse = {
  id: string
  title?: string
  requestType?: string
  status?: string
  approvals?: Array<{
    id: string
    request_id?: string
    approver_person_id?: string | null
    delegated_from_person_id?: string | null
    approval_type?: string
    decision?: string
    comment?: string | null
    evidence_ref?: string | null
    policy_decision_id?: string | null
    decided_at?: string | null
    created_at?: string | null
  }>
  tasks?: Array<{
    id: string
    request_id?: string
    task_type?: string
    assignee_person_id?: string | null
    delegation_allowed?: number | boolean | null
    status?: string
    due_at?: string | null
    completed_at?: string | null
    outcome_ref?: string | null
    created_at?: string | null
  }>
}

const STATUS_OPTIONS = {
  approvals: [
    { value: 'all', label: 'All approvals' },
    { value: 'pending', label: 'Pending' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
  ],
  tasks: [
    { value: 'all', label: 'All tasks' },
    { value: 'pending', label: 'Pending' },
    { value: 'completed', label: 'Completed' },
    { value: 'blocked', label: 'Blocked' },
  ],
} as const

function statusColor(status?: string) {
  switch (status) {
    case 'pending':
      return 'yellow'
    case 'approved':
    case 'completed':
      return 'teal'
    case 'rejected':
    case 'blocked':
      return 'red'
    case 'delegated':
      return 'blue'
    default:
      return 'gray'
  }
}

function statusLabel(status?: string) {
  return status ? status.replace(/_/g, ' ') : 'pending'
}

export default function WorkSurface({ mode }: { mode: WorkSurfaceMode }) {
  const [orgTenantId, setOrgTenantId] = useState('')
  const [orgName, setOrgName] = useState('')
  const [items, setItems] = useState<Array<ApprovalRow | TaskRow>>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null)

  const backendUrl = process.env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000'
  const title = mode === 'approvals' ? 'Approvals' : 'Tasks'
  const description = mode === 'approvals'
    ? 'Review approval decisions and delegated authority across requests.'
    : 'Track workflow tasks that are waiting on action or completion.'

  useEffect(() => {
    const activeOrg = readActiveOrganization()
    if (activeOrg?.orgTenantId) {
      setOrgTenantId(activeOrg.orgTenantId)
      setOrgName(activeOrg.name)
    }
  }, [])

  const visibleItems = useMemo(() => {
    return items.filter((item) => {
      const itemStatus = 'status' in item
        ? item.status
        : 'decision' in item
          ? item.decision
          : undefined
      if (statusFilter !== 'all' && (itemStatus || 'pending') !== statusFilter) return false
      return true
    })
  }, [items, statusFilter])

  const loadSurface = async () => {
    const token = getOrgScopedToken() || getPersonalToken()
    if (!token || !orgTenantId) {
      setError('Switch to organization context first.')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const listRes = await axios.get<RequestListResponse>(`${backendUrl}/api/platform/requests`, {
        params: { limit: 50 },
        headers: { Authorization: `Bearer ${token}` },
      })

      const summaries = Array.isArray(listRes.data?.items) ? listRes.data.items : []
      const detailResponses = await Promise.all(
        summaries.map(async (summary) => {
          const detail = await axios.get<DetailResponse>(`${backendUrl}/api/platform/requests/${encodeURIComponent(summary.id)}`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          return detail.data
        }),
      )

      if (mode === 'approvals') {
        const approvals = detailResponses.flatMap((request) =>
          (request.approvals || []).map((approval) => ({
            id: approval.id,
            requestId: request.id,
            requestTitle: request.title || request.id,
            requestType: request.requestType || 'request',
            requestStatus: request.status,
            approverPersonId: approval.approver_person_id,
            delegatedFromPersonId: approval.delegated_from_person_id,
            approvalType: approval.approval_type,
            decision: approval.decision,
            comment: approval.comment,
            evidenceRef: approval.evidence_ref,
            policyDecisionId: approval.policy_decision_id,
            decidedAt: approval.decided_at,
            createdAt: approval.created_at,
          })),
        )
        setItems(approvals)
      } else {
        const tasks = detailResponses.flatMap((request) =>
          (request.tasks || []).map((task) => ({
            id: task.id,
            requestId: request.id,
            requestTitle: request.title || request.id,
            requestType: request.requestType || 'request',
            requestStatus: request.status,
            taskType: task.task_type,
            assigneePersonId: task.assignee_person_id,
            delegationAllowed: task.delegation_allowed,
            status: task.status,
            dueAt: task.due_at,
            completedAt: task.completed_at,
            outcomeRef: task.outcome_ref,
            createdAt: task.created_at,
          })),
        )
        setItems(tasks)
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || `Failed to load ${mode}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!orgTenantId) return
    void loadSurface()
  }, [orgTenantId, mode])

  const completeTask = async (task: TaskRow) => {
    const token = getOrgScopedToken() || getPersonalToken()
    if (!token) {
      setError('Switch to organization context first.')
      return
    }

    setCompletingTaskId(task.id)
    try {
      await axios.post(
        `${backendUrl}/api/platform/requests/${encodeURIComponent(task.requestId)}/tasks/${encodeURIComponent(task.id)}/complete`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      )
      await loadSurface()
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to complete task')
    } finally {
      setCompletingTaskId(null)
    }
  }

  return (
    <Stack gap="lg">
      <Paper withBorder radius="md" p="lg">
        <Group justify="space-between" align="start" wrap="wrap">
          <Box>
            <Group gap="xs" mb={4}>
              {mode === 'approvals' ? <IconShieldCheck size={20} /> : <IconChecklist size={20} />}
              <Title order={2}>{title}</Title>
            </Group>
            <Text size="sm" c="dimmed">
              {orgName ? `${description} Active organization: ${orgName}.` : description}
            </Text>
          </Box>
          <Group gap="xs">
            <Button variant="default" component={Link} href="/organization/setup">
              Open Setup Center
            </Button>
            <Button leftSection={<IconRefresh size={16} />} onClick={() => void loadSurface()} loading={loading}>
              Refresh
            </Button>
          </Group>
        </Group>
      </Paper>

      {!orgTenantId && (
        <Alert icon={<IconAlertCircle size={16} />} color="yellow" title="No organization selected">
          <Group justify="space-between" align="center" wrap="wrap">
            <Text size="sm">This area is for organization operators. Switch into an organization, or onboard a new one.</Text>
            <Group gap="xs">
              <Button size="sm" variant="filled" onClick={openOrgSwitcher}>
                Switch organization
              </Button>
              <Button component={Link} href="/organization/setup" size="sm" variant="light">
                Onboard Organization
              </Button>
            </Group>
          </Group>
        </Alert>
      )}

      <Card withBorder radius="md" p="lg">
        <Group align="end" wrap="wrap">
          <Select
            label="Status"
            value={statusFilter}
            onChange={(value) => setStatusFilter(value || 'all')}
            data={STATUS_OPTIONS[mode]}
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
          <Title order={4}>{mode === 'approvals' ? 'Approval Trail' : 'Task Queue'}</Title>
          <Badge variant="light">{visibleItems.length}</Badge>
        </Group>

        {loading ? (
          <Text c="dimmed" size="sm">Loading…</Text>
        ) : visibleItems.length === 0 ? (
          <Stack align="center" py="xl" gap="xs">
            {mode === 'approvals' ? <IconShieldCheck size={40} color="var(--mantine-color-gray-4)" /> : <IconChecklist size={40} color="var(--mantine-color-gray-4)" />}
            <Text c="dimmed">{mode === 'approvals' ? 'No approvals found for the current filters.' : 'No tasks found for the current filters.'}</Text>
            <Anchor component={Link} href="/requests" size="sm" fw={500}>
              Open Requests →
            </Anchor>
          </Stack>
        ) : mode === 'approvals' ? (
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Request</Table.Th>
                <Table.Th>Decision</Table.Th>
                <Table.Th>Approver</Table.Th>
                <Table.Th>Delegated From</Table.Th>
                <Table.Th>Evidence</Table.Th>
                <Table.Th>Decided</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(visibleItems as ApprovalRow[]).map((approval) => (
                <Table.Tr key={approval.id}>
                  <Table.Td>
                    <Box>
                      <Text fw={600} size="sm">{approval.requestTitle}</Text>
                      <Text size="xs" c="dimmed" mt={2}>{(approval.requestType === 'field_execution' || approval.requestType === 'tpl-fept-field-execution') ? 'Job Card' : approval.requestType} · {approval.requestId}</Text>
                    </Box>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={statusColor(approval.decision)}>{statusLabel(approval.decision)}</Badge>
                  </Table.Td>
                  <Table.Td><Text size="sm" ff="monospace">{approval.approverPersonId || '—'}</Text></Table.Td>
                  <Table.Td><Text size="sm" ff="monospace">{approval.delegatedFromPersonId || '—'}</Text></Table.Td>
                  <Table.Td><Text size="sm">{approval.evidenceRef || '—'}</Text></Table.Td>
                  <Table.Td><Text size="xs" c="dimmed">{approval.decidedAt ? new Date(approval.decidedAt).toLocaleString() : 'Pending'}</Text></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        ) : (
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Task</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Assignee</Table.Th>
                <Table.Th>Due</Table.Th>
                <Table.Th>Request</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(visibleItems as TaskRow[]).map((task) => (
                <Table.Tr key={task.id}>
                  <Table.Td>
                    <Box>
                      <Text fw={600} size="sm">{task.taskType || task.id}</Text>
                      <Text size="xs" c="dimmed" mt={2}>{(task.requestType === 'field_execution' || task.requestType === 'tpl-fept-field-execution') ? 'Job Card' : task.requestType} · {task.requestId}</Text>
                    </Box>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={statusColor(task.status)}>{statusLabel(task.status)}</Badge>
                  </Table.Td>
                  <Table.Td><Text size="sm" ff="monospace">{task.assigneePersonId || '—'}</Text></Table.Td>
                  <Table.Td><Text size="xs" c="dimmed">{task.dueAt ? new Date(task.dueAt).toLocaleString() : '—'}</Text></Table.Td>
                  <Table.Td>
                    <Text size="sm">{task.requestTitle}</Text>
                    <Text size="xs" c="dimmed">{task.requestStatus || 'draft'}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs" justify="flex-end">
                      <Button variant="default" size="xs" component={Link} href="/requests">
                        View Requests
                      </Button>
                      <Button
                        size="xs"
                        leftSection={<IconCheck size={12} />}
                        loading={completingTaskId === task.id}
                        disabled={task.status !== 'pending'}
                        onClick={() => void completeTask(task)}
                      >
                        Complete
                      </Button>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Card>
    </Stack>
  )
}