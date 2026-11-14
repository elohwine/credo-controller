import React, { useEffect, useMemo, useState } from 'react'
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Collapse,
  Drawer,
  Group,
  Loader,
  Paper,
  Select,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Textarea,
  Timeline,
  Title,
  Box,
  UnstyledButton,
} from '@mantine/core'
import { IconArrowRight, IconCheck, IconChevronDown, IconChevronRight, IconFileText, IconHistory, IconId, IconRefresh, IconSearch, IconX } from '@tabler/icons-react'
import { useMediaQuery } from '@mantine/hooks'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/router'
import AppShellMobile from '@/components/layout/AppShellMobile'
import JobDepositPanel from '@/components/requests/JobDepositPanel'
import JobAuditTrailPanel from '@/components/shared/JobAuditTrailPanel'
import RecordActions from '@/components/shared/RecordActions'
import { StageActorTimeline, StageNowCard } from '@/components/shared/StageActorTimeline'
import api from '@/lib/api'
import { getOrgRoleClaim, getOrgToken } from '@/lib/auth'
import { friendlyRequestError } from '@/lib/requestError'
import { useSessionStore } from '@/lib/state/session'
import { trailFromRequest } from '@/lib/jobAuditTrail'
import { requestKindLabel, requestStatusWords } from '@/lib/requestCatalog'
import { assertRequestDetail, requestExperienceForRow, requestStageNames } from '../../shared/requestExperience'
import { actorsForWorkflow, type WorkflowActorReport } from '@/lib/uxCopy'
import type { AuditPerson } from '@/lib/jobAuditTrail'
import { detailTabsFor } from '../../shared/detailTabs'
import { requestDecisionBlockText, STAFF_CARD_APPROVE_LABEL, type RequestDecisionView } from '../../shared/requestDecision'
import { decidePlatformRequest, staffCardApprovalRoute } from '@/lib/platformRequestDecision'
import { feedback } from '@/lib/feedback'
import { milestone } from '@/components/feedback/Milestone'
import { useUiStore } from '@/lib/state/ui'

interface RequestRow {
  id: string
  source: 'platform' | 'contact'
  title?: string
  request_type?: string
  requestType?: string
  status: string
  created_at?: string
  createdAt?: string
  updatedAt?: string
  assignedAt?: string
  approvedAt?: string
  rejectedAt?: string
  fulfilledAt?: string
  rejectionReason?: string
  description?: string
  workflowId?: string
  assigneeRole?: string
  assigneeUserId?: string
  payload?: Record<string, unknown>
  events?: unknown[]
  people?: AuditPerson[]
  decision?: RequestDecisionView & { version?: string }
  nextStep?: { label?: string }
  parties?: { requesterName?: string; reviewName?: string; fulfilmentName?: string }
}

interface PagePosition {
  platformCursor: string | null | undefined
  contactOffset: number | null
}
interface RequestPage {
  rows: RequestRow[]
  platformCursor: string | null
  contactOffset: number | null
}

export default function OrganisationRequests() {
  const router = useRouter()
  const scope = useSessionStore((state) => state.scope)
  const orgId = useSessionStore((state) => state.orgId)
  const [status, setStatus] = useState('all')
  const [search, setSearch] = useState('')
  const [kind, setKind] = useState<string | null>(null)
  const [assignee, setAssignee] = useState<string | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const narrow = useMediaQuery('(max-width: 600px)')
  const [selected, setSelected] = useState<RequestRow | null>(null)
  // Scope selection as well as data: a drawer from another organisation never survives a switch.
  const [selectionScope, setSelectionScope] = useState(scope)
  const activeSelection = selectionScope === scope ? selected : null
  const queryClient = useQueryClient()
  const unblockScreen = useUiStore((state) => state.unblock)
  const [declineReason, setDeclineReason] = useState('')
  const [deciding, setDeciding] = useState<'approve' | 'reject' | 'card' | null>(null)
  // Opened from an inbox card after the switch: show that request with its steps and decision.
  const linkedRequestId = typeof router.query.request === 'string' ? router.query.request : ''
  useEffect(() => {
    if (!linkedRequestId || !orgId) return
    setSelectionScope(scope)
    setSelected({ id: linkedRequestId, source: 'platform', status: '' })
  }, [linkedRequestId, orgId, scope])
  useEffect(() => setDeclineReason(''), [activeSelection?.id])
  const canReadInbound = ['owner', 'admin', 'manager', 'approver'].includes(getOrgRoleClaim() || '')
  const list = useInfiniteQuery({
    queryKey: [scope, 'org-requests', canReadInbound],
    enabled: Boolean(orgId),
    initialPageParam: { platformCursor: undefined, contactOffset: 0 } as PagePosition,
    getNextPageParam: (page: RequestPage): PagePosition | undefined =>
      page.platformCursor || page.contactOffset !== null
        ? { platformCursor: page.platformCursor, contactOffset: page.contactOffset }
        : undefined,
    queryFn: async ({ pageParam }): Promise<RequestPage> => {
      const token = getOrgToken()
      if (!token || useSessionStore.getState().scope !== scope) throw new Error('Organisation context changed.')
      const headers = { Authorization: `Bearer ${token}` }
      const [platform, contacts] = await Promise.all([
        pageParam.platformCursor !== null
          ? api.get<{ items: Omit<RequestRow, 'source'>[]; nextCursor?: string | null }>('/api/platform/requests', {
              headers,
              params: { limit: 50, cursor: pageParam.platformCursor },
            })
          : Promise.resolve({ data: { items: [], nextCursor: null } }),
        canReadInbound && pageParam.contactOffset !== null
          ? api.get<Omit<RequestRow, 'source'>[]>('/workflow-requests/inbound', {
              headers,
              params: { includeHistory: true, limit: 50, offset: pageParam.contactOffset },
            })
          : Promise.resolve({ data: [] }),
      ])
      if (useSessionStore.getState().scope !== scope) throw new Error('Organisation context changed.')
      return {
        rows: [
          ...platform.data.items.map((row) => ({ ...row, source: 'platform' as const })),
          ...contacts.data.map((row) => ({
            ...row,
            source: 'contact' as const,
            title: row.title || (typeof row.payload?.title === 'string' ? row.payload.title : undefined),
          })),
        ],
        platformCursor: platform.data.nextCursor || null,
        contactOffset:
          contacts.data.length === 50 && pageParam.contactOffset !== null ? pageParam.contactOffset + 50 : null,
      }
    },
  })
  const detail = useQuery({
    queryKey: [scope, 'org-request', activeSelection?.source, activeSelection?.id],
    enabled: Boolean(orgId && activeSelection),
    queryFn: async () => {
      if (!activeSelection || useSessionStore.getState().scope !== scope)
        throw new Error('Organisation context changed.')
      const token = getOrgToken()
      if (!token) throw new Error('Open the organisation again to view this request.')
      const path = activeSelection.source === 'platform' ? '/api/platform/requests' : '/workflow-requests'
      const response = await api.get<RequestRow>(`${path}/${encodeURIComponent(activeSelection.id)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      assertRequestDetail(response.data, activeSelection.id)
      if (useSessionStore.getState().scope !== scope) throw new Error('Organisation context changed.')
      return response.data
    },
  })
  useEffect(() => {
    if (!detail.isPending || !activeSelection) unblockScreen('open-request')
  }, [detail.isPending, activeSelection, unblockScreen])

  const closeDetail = () => {
    setSelected(null)
    if (linkedRequestId) void router.replace('/requests', undefined, { shallow: true })
  }

  const decide = async (action: 'approve' | 'reject') => {
    if (!activeSelection) return
    const orgToken = getOrgToken()
    if (!orgToken) {
      feedback.warn('Open the organisation again, then try again.', { title: 'Organisation needed' })
      return
    }
    setDeciding(action)
    try {
      await decidePlatformRequest({ requestId: activeSelection.id, action, reason: declineReason, orgToken })
      if (action === 'approve') milestone.show({ kind: 'request_approved', title: 'Approved', detail: detail.data?.title || undefined })
      else feedback.info('The request was declined.', { title: 'Declined' })
      setDeclineReason('')
      // The steps redraw with this decision; the inbox card closes on its next refresh.
      await Promise.all([detail.refetch(), list.refetch()])
      void queryClient.invalidateQueries({ predicate: (query) => query.queryKey.includes('inbox') })
    } catch (error) {
      feedback.fromError(error, { title: action === 'approve' ? 'Could not approve' : 'Could not decline' })
    } finally {
      setDeciding(null)
    }
  }

  const approveWithStaffCard = async () => {
    if (!activeSelection) return
    const orgToken = getOrgToken()
    if (!orgToken) {
      feedback.warn('Open the organisation again, then try again.', { title: 'Organisation needed' })
      return
    }
    setDeciding('card')
    try {
      const route = await staffCardApprovalRoute({
        requestId: activeSelection.id,
        orgToken,
        orgTenantId: orgId || undefined,
        title: detail.data?.title,
        description: detail.data?.description,
      })
      await router.push(route)
    } catch (error) {
      feedback.fromError(error, { title: 'Could not open the approval' })
    } finally {
      setDeciding(null)
    }
  }

  const allRows = useMemo(
    () =>
      Array.from(
        new Map(
          (list.data?.pages.flatMap((page) => page.rows) || []).map((row) => [`${row.source}:${row.id}`, row]),
        ).values(),
      ),
    [list.data],
  )
  const rows = useMemo(
    () =>
      allRows
        .filter(
          (row) =>
            (status === 'all' || row.status === status) &&
            (!kind || (row.request_type || row.requestType) === kind) &&
            (!assignee || row.assigneeRole === assignee) &&
            `${row.title || ''} ${row.request_type || row.requestType || ''}`
              .toLowerCase()
              .includes(search.toLowerCase()),
        )
        .sort((a, b) => (b.created_at || b.createdAt || '').localeCompare(a.created_at || a.createdAt || '')),
    [allRows, status, search, kind, assignee],
  )
  const statuses = Array.from(new Set(allRows.map((row) => row.status)))
  const kinds = Array.from(
    new Set(allRows.map((row) => row.request_type || row.requestType).filter((value): value is string => !!value)),
  )
  const assignees = Array.from(
    new Set(allRows.map((row) => row.assigneeRole).filter((value): value is string => !!value)),
  )
  const actors = useQuery({
    queryKey: [scope, 'workflow-actors', orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const token = getOrgToken()
      if (!token) return { workflows: [] as WorkflowActorReport[], members: [] as Array<{ userId: string; displayName?: string }> }
      const response = await api.get<{ workflows?: WorkflowActorReport[]; members?: Array<{ userId: string; displayName?: string }> }>(
        `/api/organizations/${encodeURIComponent(orgId || '')}/workflows/actors`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      return { workflows: response.data.workflows || [], members: response.data.members || [] }
    },
  })
  const progress = detail.data ? requestExperienceForRow(detail.data) : null
  const people = detail.data?.people?.length ? detail.data.people : actors.data?.members || []
  const who = detail.data
    ? requestStageNames(detail.data, people, {
        ...(detail.data.parties || {}),
        reviewName: detail.data.parties?.reviewName || detail.data.decision?.actorLabel,
      })
    : {}
  const trail =
    detail.data && activeSelection?.source === 'platform' ? trailFromRequest(detail.data, detail.data.people) : null
  const contactTimeline = detail.data
    ? [
        { at: detail.data.createdAt, label: 'Received' },
        {
          at: detail.data.assignedAt,
          label: `Assigned${detail.data.assigneeRole ? ` to ${detail.data.assigneeRole.replace(/_/g, ' ')}` : ''}`,
        },
        { at: detail.data.approvedAt, label: 'Approved' },
        { at: detail.data.rejectedAt, label: 'Declined' },
        { at: detail.data.fulfilledAt, label: 'Fulfilled' },
      ]
        .filter((event): event is { at: string; label: string } => Boolean(event.at))
        .sort((a, b) => a.at.localeCompare(b.at))
    : []

  return (
    <AppShellMobile>
      <Stack p="md">
        <Group justify="space-between" wrap="nowrap">
          <Box>
            <Title order={3}>Requests</Title>
            <Text size="sm" c="dimmed">
              Incoming requests and their history.
            </Text>
          </Box>
          <ActionIcon
            size={48}
            variant="subtle"
            aria-label="Refresh requests"
            loading={list.isFetching}
            onClick={() => void list.refetch()}
          >
            <IconRefresh size={20} />
          </ActionIcon>
        </Group>
        <Button
          variant="light"
          rightSection={<IconArrowRight size={16} />}
          onClick={() => router.push('/inbox')}
        >
          Inbox
        </Button>
        {!canReadInbound && (
          <Alert>
            Showing requests your role may read. Contact requests require an owner, admin, manager or approver.
          </Alert>
        )}
        <TextInput
          aria-label="Search requests"
          placeholder="Search requests"
          leftSection={<IconSearch size={16} />}
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
        />
        <Group align="end" wrap="nowrap">
          <Select
            label="Status"
            value={status}
            onChange={(value) => setStatus(value || 'all')}
            style={{ flex: 1 }}
            data={[
              { value: 'all', label: 'All statuses' },
              ...statuses.map((value) => ({ value, label: requestStatusWords(value).label })),
            ]}
          />
          <Button
            variant="subtle"
            rightSection={<IconChevronDown size={16} />}
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
          >
            Filters{kind || assignee ? ` (${Number(!!kind) + Number(!!assignee)})` : ''}
          </Button>
        </Group>
        <Collapse in={filtersOpen}>
          <Stack gap="sm">
            <Select
              clearable
              label="Request type"
              value={kind}
              onChange={setKind}
              data={kinds.map((value) => ({ value, label: requestKindLabel(value) }))}
            />
            <Select
              clearable
              label="Assigned role"
              value={assignee}
              onChange={setAssignee}
              data={assignees.map((value) => ({ value, label: value.replace(/_/g, ' ') }))}
            />
          </Stack>
        </Collapse>
        {list.isPending && <Loader size="sm" />}
        {list.error && (
          <Alert color="red">{friendlyRequestError(list.error, 'Could not load organisation requests.')}</Alert>
        )}
        {!list.isPending && !list.error && rows.length === 0 && <Text c="dimmed">No requests match this view.</Text>}
        {narrow ? (
          rows.map((row) => (
            <Paper key={`${row.source}:${row.id}`} withBorder radius="md">
              <UnstyledButton
                p="sm"
                w="100%"
                onClick={() => {
                  setSelectionScope(scope)
                  setSelected(row)
                }}
              >
                <Group justify="space-between" wrap="nowrap">
                  <Text size="sm" fw={600}>
                    {row.title || requestKindLabel(row.request_type || row.requestType)}
                  </Text>
                  <IconChevronRight size={18} style={{ flexShrink: 0 }} />
                </Group>
                <Text size="xs" c="dimmed" lineClamp={1}>
                  {row.decision?.actorLabel
                    ? `${['rejected', 'cancelled', 'completed', 'fulfilled'].includes(String(row.status)) ? 'Decided by' : 'With'} ${row.decision.actorLabel}`
                    : requestKindLabel(row.request_type || row.requestType)}
                </Text>
                <Group>
                  <Badge color={requestStatusWords(row.status).color}>{requestStatusWords(row.status).label}</Badge>
                  <Text size="xs" c="dimmed">
                    {new Date(row.created_at || row.createdAt || '').toLocaleDateString(undefined, {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </Text>
                </Group>
              </UnstyledButton>
            </Paper>
          ))
        ) : (
          <Table.ScrollContainer minWidth={450}>
            <Table highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Request</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Received</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((row) => (
                  <Table.Tr key={`${row.source}:${row.id}`}>
                    <Table.Td>
                      <Button
                        variant="subtle"
                        size="compact-sm"
                        onClick={() => {
                          setSelectionScope(scope)
                          setSelected(row)
                        }}
                      >
                        {row.title || requestKindLabel(row.request_type || row.requestType)}
                      </Button>
                      <Text size="xs" c="dimmed">
                        {row.source === 'contact' ? 'Contact request' : 'Organisation request'}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={requestStatusWords(row.status).color}>{requestStatusWords(row.status).label}</Badge>
                    </Table.Td>
                    <Table.Td>{new Date(row.created_at || row.createdAt || '').toLocaleString()}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
        {list.hasNextPage && (
          <Box>
            <Text size="xs" c="dimmed">
              Filters apply to loaded history. Load more to search earlier requests.
            </Text>
            <Button variant="light" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
              Load earlier requests
            </Button>
          </Box>
        )}
        <Drawer
          opened={Boolean(activeSelection)}
          onClose={closeDetail}
          position="bottom"
          size="85%"
          title="Request details"
          zIndex={2000}
        >
          <Stack>
            {detail.isPending && <Loader />}
            {detail.error && (
              <Alert color="red">{friendlyRequestError(detail.error, 'Could not load request history.')}</Alert>
            )}
            {detail.data && (
              <>
                <Text fw={700}>
                  {detail.data.title || requestKindLabel(detail.data.request_type || detail.data.requestType)}
                </Text>
                <Badge>{requestStatusWords(detail.data.status).label}</Badge>
                {detail.data.rejectionReason && <Alert color="red">{detail.data.rejectionReason}</Alert>}
                {activeSelection && activeSelection.source !== 'platform' && getOrgToken() ? (
                  <JobDepositPanel requestId={activeSelection.id} token={getOrgToken()!} audience="business" />
                ) : null}
                {/* Same order as a job: the step waiting now, who acts and their buttons, then the tabs. */}
                <StageNowCard
                  stages={progress?.stages || []}
                  actors={progress ? actorsForWorkflow(actors.data?.workflows, [progress.workflowType, String(detail.data?.request_type || detail.data?.requestType || '')]) : undefined}
                  people={people}
                  whoDid={who}
                  actorsLoading={actors.isLoading}
                  idleText="Nothing to do on this request right now."
                >
                  {activeSelection?.source === 'platform' && (() => {
                    const decision = detail.data.decision
                    const waiting = ['submitted', 'in_review'].includes(String(detail.data.status))
                    if (!waiting || !decision) return null
                    if (!decision.canApprove && !decision.canReject) {
                      return <Alert color="blue" variant="light">{requestDecisionBlockText(decision)}</Alert>
                    }
                    return (
                      <Stack gap="xs">
                        {decision.stageLabel && <Text size="sm" fw={500}>{decision.stageLabel}</Text>}
                        {decision.canApprove && !decision.cardRequired && (
                          <Button
                            fullWidth
                            size="lg"
                            radius="xl"
                            color="teal"
                            leftSection={<IconCheck size={20} />}
                            loading={deciding === 'approve'}
                            disabled={Boolean(deciding)}
                            onClick={() => void decide('approve')}
                          >
                            Approve
                          </Button>
                        )}
                        {decision.canApprove && decision.staffCard && (
                          <Button
                            fullWidth
                            size="lg"
                            radius="xl"
                            variant={decision.cardRequired ? 'filled' : 'outline'}
                            leftSection={<IconId size={20} />}
                            loading={deciding === 'card'}
                            disabled={Boolean(deciding)}
                            onClick={() => void approveWithStaffCard()}
                          >
                            {STAFF_CARD_APPROVE_LABEL}
                          </Button>
                        )}
                        {decision.canReject && (
                          <>
                            <Textarea
                              label="Reason for declining"
                              placeholder="Say why, so the person who asked knows what to change"
                              minRows={2}
                              autosize
                              value={declineReason}
                              onChange={(event) => setDeclineReason(event.currentTarget.value)}
                            />
                            <Button
                              fullWidth
                              size="lg"
                              radius="xl"
                              color="red"
                              variant="light"
                              leftSection={<IconX size={20} />}
                              loading={deciding === 'reject'}
                              disabled={Boolean(deciding) || !declineReason.trim()}
                              onClick={() => void decide('reject')}
                            >
                              Decline
                            </Button>
                          </>
                        )}
                      </Stack>
                    )
                  })()}
                  {detail.data.nextStep?.label && (
                    <Button
                      variant="light"
                      radius="xl"
                      onClick={() =>
                        router.push(`/inbox?filter=requests&request=${encodeURIComponent(activeSelection!.id)}`)
                      }
                    >
                      {detail.data.nextStep.label} in Inbox
                    </Button>
                  )}
                  {activeSelection?.source === 'platform' && (
                    <RecordActions
                      kind="request"
                      id={activeSelection.id}
                      canCancel={['draft', 'submitted', 'in_review'].includes(String(detail.data.status || ''))}
                      onCancelled={() => {
                        setSelected(null)
                        void list.refetch()
                      }}
                    />
                  )}
                </StageNowCard>
                <Tabs key={`${activeSelection?.source}:${activeSelection?.id}`} defaultValue="details">
                  <Tabs.List mb="sm" style={{ flexWrap: 'nowrap', overflowX: 'auto' }}>
                    {detailTabsFor({ panels: ['details', 'history'] }).map((item) => (
                      <Tabs.Tab key={item.key} value={item.key} leftSection={item.key === 'history' ? <IconHistory size={14} /> : <IconFileText size={14} />}>
                        {item.label}
                      </Tabs.Tab>
                    ))}
                  </Tabs.List>
                  <Tabs.Panel value="details" pt="xs">
                    <Stack gap="sm">
                      {detail.data?.parties?.requesterName && (
                        <Text size="sm">Asked by {detail.data.parties.requesterName}</Text>
                      )}
                      {detail.data.description && <Text size="sm">{detail.data.description}</Text>}
                      {progress && (
                        <Paper withBorder radius="md" p="sm">
                          <StageActorTimeline
                            stages={progress.stages}
                            actors={actorsForWorkflow(actors.data?.workflows, [progress.workflowType, String(detail.data?.request_type || detail.data?.requestType || '')])}
                            people={people}
                            whoDid={who}
                            actorsLoading={actors.isLoading}
                            title="Request progress"
                            help={{
                              title: 'Request progress',
                              points: [
                                'These are the steps of this request, the same kind of list a job uses.',
                                'A short request may only be asked, then decided. A longer one continues to fulfilment.',
                                'The person named for a step gets it in their inbox.',
                              ],
                            }}
                          />
                        </Paper>
                      )}
                    </Stack>
                  </Tabs.Panel>
                  <Tabs.Panel value="history" pt="xs">
                    {trail && <JobAuditTrailPanel trail={trail} compact embedded />}
                    {activeSelection?.source === 'contact' && (
                      <Paper withBorder p="sm">
                        <Text fw={600} mb="sm">
                          Recorded milestones
                        </Text>
                        <Timeline active={contactTimeline.length - 1}>
                          {contactTimeline.map((event) => (
                            <Timeline.Item key={`${event.label}:${event.at}`} title={event.label}>
                              <Text size="xs" c="dimmed">
                                {new Date(event.at).toLocaleString()}
                              </Text>
                            </Timeline.Item>
                          ))}
                        </Timeline>
                        <Text size="xs" c="dimmed" mt="sm">
                          Milestones are recorded timestamps, not a complete audit log.
                        </Text>
                      </Paper>
                    )}
                  </Tabs.Panel>
                </Tabs>
              </>
            )}
          </Stack>
        </Drawer>
      </Stack>
    </AppShellMobile>
  )
}
