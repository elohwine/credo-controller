import React, { useState, useEffect, useCallback, useContext, useRef } from 'react'
import axios from 'axios'
import { notifications } from '@mantine/notifications'
import { useRouter } from 'next/router'
import {
  Title,
  Text,
  Group,
  Paper,
  Badge,
  Button,
  Stack,
  Select,
  Grid,
  SimpleGrid,
  Card,
  ActionIcon,
  Alert,
  Box,
  Divider,
  SegmentedControl,
  Table,
  Modal,
  Tooltip,
} from '@mantine/core'
import {
  IconBriefcase,
  IconMapPin,
  IconCalendar,
  IconUser,
  IconEye,
  IconRefresh,
  IconPlus,
  IconCalendarStats,
  IconUserQuestion,
  IconUserCheck,
  IconProgress,
  IconPlayerPause,
  IconAlertTriangle,
  IconCircleCheck,
  IconArchive,
} from '@tabler/icons-react'
import { StatTile } from '../../../shared/StatTile'
import JobCardDetail from './JobCardDetail'
import NewJobModal from './NewJobModal'
import { EnvContext } from '@/pages/_app'
import { getPreferredTenantToken } from '@/utils/portalTenant'
import { readActiveOrganization } from '@/utils/organizationContext'
import { jobStatusColor as getStatusColor, jobStatusLabel as getStatusLabel } from '../finance/financeStages'
import { jobHeading } from '../finance/jobAuditTrail'
import { endPortalTask, getPortalTask } from '@/lib/portalContext'
import { usePortalOperations } from '@/lib/operations'
import {
  OPEN_FIELD_JOB_CATEGORIES,
  fieldJobAssigneeId,
  fieldJobCategory,
  fieldJobInput,
  fieldJobPriority,
  fieldJobUrgent,
  isFieldJobRun,
  type FieldJobCategory as JobCategory,
} from '../../../../src/config/fieldJobCategory'
import { IncomingJobs } from '../../../shared/operations/IncomingJobs'
import { ATTENTION_WORDS, JOB_CATEGORY_WORDS, type AttentionItem, type JobReport } from '../../../shared/operations/operationsApi'
import { JobBoard } from '../../../shared/operations/JobBoard'
import { jobClientWait } from '../../../shared/fieldJobOutcomes'
import { DataTable, useClientList, useListState, type DataColumn } from '../../../shared/DataTable'
import type { SortValue } from '../../../../src/config/listPage'

const PAGE = 50

const JOB_SORTS: Record<string, SortValue<JobCard>> = {
    job: (job) => String(fieldJobInput(job).reference || job.id),
    customer: (job) => fieldJobInput(job).clientName,
    address: (job) => fieldJobInput(job).location,
    assigned: (job) => fieldJobAssigneeId(job),
    scheduled: (job) => fieldJobInput(job).scheduledDate || job.created_at,
    status: (job) => fieldJobCategory(job),
}

interface JobCard {
  id: string
  status: string
  workflowId: string
  input?: any
  output?: any
  created_at: string
  updated_at: string
  authToken?: string
  authContext?: 'personal' | 'org'
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

const jobInput = (job: JobCard) => fieldJobInput(job)
const jobAssigneeId = (job: JobCard) => fieldJobAssigneeId(job)
type BoardCategory = Exclude<JobCategory, 'arrived'>
// The board counts an arrived job as in progress; its badge still says "Arrived on site".
const jobCategory = (job: JobCard): BoardCategory => {
    const category = fieldJobCategory(job)
    return category === 'arrived' ? 'active' : category
}

function isWaitingOverWeek(job: JobCard, now = Date.now()): boolean {
    if (jobCategory(job) !== 'pending') return false
    const createdAt = Date.parse(String(job.created_at || (job as any).createdAt || ''))
    return Number.isFinite(createdAt) && now - createdAt >= WEEK_MS
}

export default function JobCardsBoard() {
  const env = useContext(EnvContext)
  const [jobs, setJobs] = useState<JobCard[]>([])
  const [loading, setLoading] = useState(true)
  const [jobsLoadError, setJobsLoadError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string | null>('all')
  const [viewMode, setViewMode] = useState<'list' | 'cards'>('list')
  const [selectedJob, setSelectedJob] = useState<JobCard | null>(null)
  const [showNewJob, setShowNewJob] = useState(false)
  const [showBoard, setShowBoard] = useState(false)
  const [boardView, setBoardView] = useState<'list' | 'reports'>('list')
  const [limit, setLimit] = useState(PAGE)
  const [hasMore, setHasMore] = useState(false)
  const [canCreate, setCanCreate] = useState(false)
  const [memberNames, setMemberNames] = useState<Record<string, string>>({})
  const [teamMembers, setTeamMembers] = useState<
    Array<{ userId: string; role: string; displayName?: string; phone?: string; status?: string }>
  >([])
  const { api: operations, notify } = usePortalOperations()
    // Stuck jobs are rows in the list with a flag, not a second list of the same jobs.
  const [attention, setAttention] = useState<Map<string, AttentionItem>>(new Map())
    // Counts for every job, not only the newest ones loaded into the list.
  const [totals, setTotals] = useState<JobReport['counts'] | null>(null)

    useEffect(() => {
    const role = String(readActiveOrganization()?.role || '').toLowerCase()
    setCanCreate(['owner', 'admin', 'dispatcher', 'manager'].includes(role))
  }, [])

    // People are shown by name, never by id.
    useEffect(() => {
    const org = readActiveOrganization()
    const token = localStorage.getItem('credoOrgToken') || getPreferredTenantToken()
    if (!org?.orgTenantId || !token) return
    const credoBackend = env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000'
    axios
      .get(`${credoBackend}/api/organizations/${encodeURIComponent(org.orgTenantId)}/members`, {
            headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        const rows = Array.isArray(res.data) ? res.data : []
        setTeamMembers(
          rows
            .filter((m: any) => m?.userId)
            .map((m: any) => ({
                userId: String(m.userId),
                role: String(m.role || 'member'),
                displayName: m.displayName ? String(m.displayName) : undefined,
                phone: m.phone ? String(m.phone) : undefined,
                status: m.status ? String(m.status) : undefined,
            })),
        )
        const names: Record<string, string> = {}
            for (const m of rows) {
          if (!m?.userId) continue
          const name = String(m.displayName || '').trim()
          const generic = !name || /^(organization owner|team member)$/i.test(name)
          const userId = String(m.userId)
          const role = String(m.role || '').toLowerCase()
                names[userId] = !generic
                    ? name
                    : m.phone
                        ? String(m.phone)
                        : role === 'owner'
                            ? 'Organization owner'
                            : role === 'field_worker'
                                ? 'Field worker'
                  : `Team member · ${userId.slice(0, 6)}`
            }
        setMemberNames(names)
      })
      .catch(() => {
        /* names stay as fallbacks */
      })
  }, [env.NEXT_PUBLIC_VC_REPO])

    // The backend address can change while a load is still running; only the newest load may fill the list.
  const fetchSeq = useRef(0)
    const fetchJobs = useCallback(async () => {
    const seq = ++fetchSeq.current
    const stale = () => seq !== fetchSeq.current
    setLoading(true)
    setJobsLoadError(null)
        try {
      const credoBackend = env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000'

      const contextMode = localStorage.getItem('credoContextMode') === 'org' ? 'org' : 'personal'
      const preferredToken = getPreferredTenantToken()
      const walletToken = localStorage.getItem('walletToken')
      const orgToken = localStorage.getItem('credoOrgToken')
      const task = getPortalTask()
      const taskRunId = task ? new URL(window.location.href).searchParams.get('runId') : null

            const orderedCandidates = taskRunId
                ? [{ token: orgToken, context: 'org' as const }]
                : contextMode === 'org'
                ? [
                    { token: orgToken, context: 'org' as const },
                    { token: preferredToken, context: 'org' as const },
                    { token: walletToken, context: 'personal' as const },
                ]
                : [
                    { token: walletToken, context: 'personal' as const },
                    { token: preferredToken, context: 'personal' as const },
                    { token: orgToken, context: 'org' as const },
            ]

            const candidates = orderedCandidates.filter((entry, index, list) => {
        if (!entry.token) return false
        return list.findIndex((candidate) => candidate.token === entry.token) === index
      })

            if (candidates.length === 0) {
        if (!stale()) setJobs([])
        return
            }

      const responses = await Promise.all(
        candidates.map(async ({ token, context }) => {
                try {
            const res = await axios.get(
              taskRunId
                        ? `${credoBackend}/workflows/runs/${encodeURIComponent(taskRunId)}`
                : `${credoBackend}/workflows/runs?limit=${limit}`,
              {
                        headers: { Authorization: `Bearer ${token}` },
              },
            )
            const rows = taskRunId ? [res.data] : Array.isArray(res.data) ? res.data : []
                    return { rows: rows.map((row: any) => ({
                        ...row,
                        authToken: token,
                        authContext: context,
                    })), context, error: undefined }
                } catch (error) {
            if (taskRunId) throw error
            return { rows: [], context, error }
                }
        }),
      )

      const contextFailed = responses.find((response) => response.context === contextMode && response.error)
      if (contextFailed && !responses.some((response) => response.context === contextMode && !response.error)) {
        throw contextFailed.error
      }
      const mergedRows = responses.flatMap((response) => response.rows)
      const byRunId = new Map<string, any>()
            for (const row of mergedRows) {
        const runId = String(row.id || '').trim()
        if (!runId || byRunId.has(runId)) continue
        byRunId.set(runId, row)
            }

      if (stale()) return
      const dedupedRows = Array.from(byRunId.values())
      setHasMore(!taskRunId && responses.some(({ rows }) => rows.length >= limit))
      const feJobs = dedupedRows.filter((job: any) => isFieldJobRun(job))

      setJobs(feJobs)
            // Keep the open drawer in step with the refreshed list so actions show their result immediately.
            setSelectedJob((current) => {
        if (!current) return current
        const fresh = feJobs.find((job: any) => String(job.id) === String(current.id))
        return fresh || current
      })
        } catch (err) {
      if (stale()) return
      console.error('Failed to fetch job cards:', err)
      const message = axios.isAxiosError(err)
        ? String(err.response?.data?.error || err.response?.data?.message || err.message)
        : 'The job list could not be loaded. Try again.'
      setJobsLoadError(message)
      notifications.show({
        title: 'Could not load jobs',
        message,
        color: 'red',
      })
        } finally {
      if (!stale()) setLoading(false)
        }
  }, [env.NEXT_PUBLIC_VC_REPO, limit])

    useEffect(() => {
    fetchJobs()
  }, [fetchJobs])

  const router = useRouter()
  const openedFromQuery = useRef<string | null>(null)

    // Home links straight to a filtered list, e.g. `/finance/job-cards?status=urgent`.
    useEffect(() => {
    if (!router.isReady) return
    const status = String(router.query.status || '').trim()
    if (status) setStatusFilter(status)
        if (router.query.report === '1') {
      setBoardView('reports')
      setShowBoard(true)
        }
  }, [router.isReady, router.query.status, router.query.report])

    // A stuck job may be older than the 50 runs on the board: load it by itself when it is not there.
    const openJobById = async (runId: string) => {
    const loaded = jobs.find((job) => String(job.id) === runId)
        if (loaded) {
      setSelectedJob(loaded)
      return
        }
    const token = localStorage.getItem('credoOrgToken') || getPreferredTenantToken()
    if (!token) return
        try {
      const credoBackend = env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000'
            const res = await axios.get(`${credoBackend}/workflows/runs/${encodeURIComponent(runId)}`, {
                headers: { Authorization: `Bearer ${token}` },
      })
      setSelectedJob({ ...res.data, authToken: token, authContext: 'org' })
        } catch {
      notify('That job could not be opened. Refresh the list and try again.', 'error')
    }
        }

    // `/finance/job-cards?runId=…` opens that job. If it is older than the loaded board, fetch it.
    useEffect(() => {
    if (!router.isReady || loading) return
    const runId = String(router.query.runId || '').trim()
    if (!runId) return
    const match = jobs.find((job) => String(job.id) === runId)
        if (match) {
      setSelectedJob((current) => (current && String(current.id) === runId ? current : match))
      return
        }
    if (openedFromQuery.current === runId) return
    openedFromQuery.current = runId
    void openJobById(runId)
  }, [router.isReady, router.query.runId, jobs, loading])

    useEffect(() => {
    if (!operations) return
    let cancelled = false
    operations
      .attention()
      .then((items) => {
        if (!cancelled)
          setAttention(new Map(items.filter((item) => item.runId).map((item) => [String(item.runId), item])))
      })
      .catch(() => {
        /* rows just show no flag */
      })
        if (canCreate) {
      operations
        .jobReport()
        .then((report) => {
          if (!cancelled) setTotals(report.counts)
        })
        .catch(() => {
          /* the tiles count the loaded jobs */
        })
    }
    return () => {
      cancelled = true
        }
  }, [operations, canCreate, jobs])

  const attentionOf = (job: JobCard) => attention.get(String(job.id))
  const needsAttention = (job: JobCard) => Boolean(attentionOf(job)) || jobCategory(job) === 'failed'
    const filteredJobs = jobs.filter((job) => {
        if (statusFilter === 'all') return true
        if (statusFilter === 'urgent') return fieldJobUrgent(job) && OPEN_FIELD_JOB_CATEGORIES.has(fieldJobCategory(job))
        if (statusFilter === 'waiting') return isWaitingOverWeek(job)
        if (statusFilter === 'pending') return jobCategory(job) === 'pending'
        if (statusFilter === 'failed') return needsAttention(job)
        return jobCategory(job) === statusFilter
    })
  const categoryCounts = jobs.reduce<Record<BoardCategory, number>>(
    (counts, job) => {
        counts[jobCategory(job)] += 1
        return counts
    },
    { pending: 0, assigned: 0, active: 0, on_hold: 0, failed: 0, completed: 0, reconciled: 0, cancelled: 0 },
  )
    const teamWorkload = jobs
        .filter((job) => job.authContext === 'org')
        .reduce<Record<string, { active: number; completed: number }>>((workload, job) => {
            const assigneeId = jobAssigneeId(job)
            if (!assigneeId) return workload
            const category = jobCategory(job)
            const memberWorkload = workload[assigneeId] || { active: 0, completed: 0 }
            if (['assigned', 'active', 'on_hold'].includes(category)) memberWorkload.active += 1
            if (['completed', 'reconciled'].includes(category)) memberWorkload.completed += 1
            workload[assigneeId] = memberWorkload
            return workload
        }, {})
  const attentionCount = new Set([
    ...attention.keys(),
    ...jobs.filter((job) => jobCategory(job) === 'failed').map((job) => String(job.id)),
  ]).size
    const tileCount = (category: BoardCategory) =>
        totals ? (category === 'active' ? totals.active + totals.arrived : totals[category]) : categoryCounts[category]
  const workloadRows = Object.entries(teamWorkload).sort(
    (a, b) => b[1].active - a[1].active || a[0].localeCompare(b[0]),
  )
  const listState = useListState({ resetKey: statusFilter })
  const { items: listItems, paging: listPaging } = useClientList(filteredJobs, JOB_SORTS, listState)
    const assigneeName = (job: JobCard) => {
        const assigneeId = jobAssigneeId(job)
    return assigneeId
      ? memberNames[assigneeId] || `Team member · ${assigneeId.slice(0, 6)}`
      : jobInput(job).workerName || 'Nobody yet'
    }
    const statusBadge = (job: JobCard) => {
        const state = job.output || {}
        const overdue = isWaitingOverWeek(job)
        const words = JOB_CATEGORY_WORDS[fieldJobCategory(job)]
        const wait = jobClientWait(state)
        const stuck = attentionOf(job)
        const stuckWords = stuck && stuck.kind !== 'failed' ? ATTENTION_WORDS[stuck.kind] : null
    const priority = fieldJobPriority(job)
        return (
            <Group gap={4} wrap="wrap">
        {priority === 'urgent' || (!priority && fieldJobUrgent(job)) ? (
          <Badge color="red" variant="filled">
            Urgent
          </Badge>
        ) : null}
        {priority === 'out_of_hours' && (
          <Badge color="violet" variant="light">
            Out of hours
          </Badge>
        )}
                {stuck && stuckWords && (
                    <Tooltip label={stuck.detail || stuck.headline} withArrow multiline maw={280}>
                        <Badge color={stuckWords.color} variant="outline">
              {stuckWords.label}
              {stuck.days >= 1 ? ` · ${stuck.days} day${stuck.days === 1 ? '' : 's'}` : ''}
                        </Badge>
                    </Tooltip>
                )}
        <Tooltip
          label={getStatusLabel(job.status, state.workflowStage, String(state.pauseReason || '').toLowerCase(), state)}
          withArrow
          multiline
          maw={280}
        >
          <Badge color={wait ? getStatusColor(job.status, state.workflowStage, state) : overdue ? 'grape' : words.color} variant="light">
            {wait ? wait.label : overdue ? 'Waiting over a week' : words.label}
          </Badge>
        </Tooltip>
            </Group>
        )
    }
    const jobColumns: Array<DataColumn<JobCard>> = [
        {
      key: 'job',
      title: 'Job / PO',
      sortable: true,
      render: (job) => {
                const input = jobInput(job)
                return (
                    <>
            <Text size="sm" fw={600}>
              {input.reference || job.id}
            </Text>
            <Text size="xs" c="dimmed">
              {[
                input.storeNumber ? `Store ${input.storeNumber}` : '',
                input.poNumber ? `PO ${input.poNumber}` : '',
                input.callOut ? 'Call-out' : '',
              ]
                .filter(Boolean)
                .join(' · ') || 'No store or PO'}
            </Text>
                    </>
                )
            },
        },
        { key: 'customer', title: 'Client', sortable: true, render: (job) => jobInput(job).clientName || 'Unknown client' },
        {
          key: 'description',
          title: 'Description',
          render: (job) => {
            const description = jobInput(job).description
            return description ? (
              <Text size="sm" lineClamp={2} title={description}>
                {description}
              </Text>
            ) : (
              '—'
            )
          },
        },
        {
          key: 'address',
          title: 'Location',
          sortable: true,
          render: (job) => {
            const location = jobInput(job).location
            return location ? (
              <Text size="sm" lineClamp={2} title={location}>
                {location}
              </Text>
            ) : (
              '—'
            )
          },
        },
        { key: 'assigned', title: 'Assigned to', sortable: true, render: (job) => assigneeName(job) },
    {
      key: 'scheduled',
      title: 'Scheduled',
      sortable: true,
      firstDir: 'desc',
      nowrap: true,
      render: (job) => jobInput(job).scheduledDate || '—',
    },
        { key: 'status', title: 'Status', sortable: true, nowrap: true, render: (job) => statusBadge(job) },
        {
      key: 'action',
      title: 'Action',
      render: (job) => (
        <Button
          size="xs"
          variant="light"
          onClick={(event) => {
            event.stopPropagation()
            setSelectedJob(job)
          }}
        >
          View details
        </Button>
            ),
        },
  ]
  const [inboxTask, setInboxTask] = useState(false)
  useEffect(() => {
    setInboxTask(Boolean(getPortalTask()))
  }, [router.asPath])

    return (
        <Box>
            <Box style={inboxTask ? { display: 'none' } : undefined}>
            <Group justify="space-between" mb="lg">
                <div>
            <Title order={2}>
              Jobs
            </Title>
            <Text size="sm" c="dimmed">
              Create field jobs, follow progress, sign off and release payment
            </Text>
                </div>
                <Group>
                    <Select
                        placeholder="Filter by status"
                        value={statusFilter}
                        onChange={setStatusFilter}
                        data={[
                            { value: 'all', label: 'All jobs' },
                            { value: 'urgent', label: 'Urgent (open)' },
                            { value: 'pending', label: 'Pending / unassigned' },
                            { value: 'waiting', label: 'Waiting over a week' },
                            { value: 'assigned', label: 'Assigned' },
                            { value: 'active', label: 'In progress' },
                            { value: 'on_hold', label: 'On hold' },
                            { value: 'failed', label: 'Needs attention' },
                            { value: 'completed', label: 'Completed' },
                            { value: 'reconciled', label: 'Closed' },
                        ]}
                    />
                    <SegmentedControl
                        aria-label="Job list display"
                        value={viewMode}
                        onChange={(value) => setViewMode(value as 'list' | 'cards')}
                        data={[
                            { label: 'List', value: 'list' },
                            { label: 'Cards', value: 'cards' },
                        ]}
                    />
            <Button
              variant="light"
              leftSection={<IconCalendarStats size={16} />}
              onClick={() => {
                setBoardView('list')
                setShowBoard(true)
              }}
            >
                        Calendar & report
                    </Button>
                    <ActionIcon aria-label="Refresh jobs" variant="light" size="lg" onClick={fetchJobs} loading={loading}>
                        <IconRefresh size={18} />
                    </ActionIcon>
                    {canCreate && (
              <Button
                leftSection={<IconPlus size={16} />}
                onClick={() => setShowNewJob(true)}
              >
                            New job
                        </Button>
                    )}
                </Group>
            </Group>

            <NewJobModal
                opened={showNewJob}
                onClose={() => setShowNewJob(false)}
                onCreated={() => setTimeout(fetchJobs, 800)}
            />

            {canCreate && (
                <Paper withBorder radius="md" px="md" py="sm" mb="md">
            <Text size="sm" fw={600} mb={4}>
              Jobs mailbox and possible repeats
            </Text>
                    <IncomingJobs
                        api={operations}
                        surface="portal"
                        members={teamMembers}
                        notify={notify}
                        onStarted={() => setTimeout(fetchJobs, 800)}
                    />
                </Paper>
            )}

            <SimpleGrid cols={{ base: 2, sm: 4, lg: 7 }} spacing="sm" mb="md">
                {[
                    { label: 'Pending / unassigned', count: tileCount('pending'), icon: IconUserQuestion, filter: 'pending' },
                    { label: 'Assigned', count: tileCount('assigned'), icon: IconUserCheck, filter: 'assigned' },
                    { label: 'In progress', count: tileCount('active'), icon: IconProgress, filter: 'active' },
                    { label: 'On hold', count: tileCount('on_hold'), icon: IconPlayerPause, filter: 'on_hold' },
                    { label: 'Needs attention', count: attentionCount, icon: IconAlertTriangle, filter: 'failed', alert: true },
                    { label: 'Completed', count: tileCount('completed'), icon: IconCircleCheck, filter: 'completed' },
                    { label: 'Closed', count: tileCount('reconciled'), icon: IconArchive, filter: 'reconciled' },
                ].map((item) => (
                    <StatTile
                        key={item.filter}
                        compact
                        label={item.label}
                        value={item.count}
                        icon={item.icon}
                        alert={Boolean(item.alert && Number(item.count) > 0)}
                        onClick={() => setStatusFilter(item.filter)}
                    />
                ))}
            </SimpleGrid>
            {totals && hasMore && (
                <Text size="xs" c="dimmed" mt={-8} mb="md">
            The counts cover every job. The list has the newest {jobs.length}; Show more jobs at the bottom loads older
            ones.
                </Text>
            )}

            {workloadRows.length > 0 && (
                <Paper p="md" mb="md" withBorder>
                    <Group justify="space-between" mb="sm">
                        <Text fw={600}>Team workload</Text>
              <Text size="xs" c="dimmed">
                Based on jobs currently loaded on this board
              </Text>
                    </Group>
                    <Table.ScrollContainer minWidth={420}>
                        <Table striped>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>Team member</Table.Th>
                                    <Table.Th>Active jobs</Table.Th>
                                    <Table.Th>Completed</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {workloadRows.map(([userId, workload]) => (
                                    <Table.Tr key={userId}>
                                        <Table.Td>{memberNames[userId] || `Team member · ${userId.slice(0, 6)}`}</Table.Td>
                                        <Table.Td>{workload.active}</Table.Td>
                                        <Table.Td>{workload.completed}</Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    </Table.ScrollContainer>
                </Paper>
            )}

            {jobsLoadError && (
              <Alert color="red" title="Jobs could not be loaded" mb="md">
                <Stack gap="sm">
                  <Text size="sm">{jobsLoadError}</Text>
                  {jobs.length > 0 && <Text size="sm">The previously loaded jobs are still shown below.</Text>}
                  <Button variant="light" size="sm" onClick={fetchJobs} loading={loading}>Try again</Button>
                </Stack>
              </Alert>
            )}
            {loading && jobs.length === 0 && <Text role="status" c="dimmed" mb="md">Loading jobs…</Text>}
            {viewMode === 'list' ? (
                <DataTable
                    rows={listItems}
                    columns={jobColumns}
                    rowKey={(job) => String(job.id)}
                    rowAccent={(job) => {
                        if (isWaitingOverWeek(job)) return 'var(--mantine-color-grape-6)'
                        const stuck = attentionOf(job)
                        return stuck ? `var(--mantine-color-${ATTENTION_WORDS[stuck.kind].color}-6)` : undefined
                    }}
                    onRowClick={(job) => setSelectedJob(job)}
                    rowLabel={(job) => String(jobInput(job).reference || job.id)}
                    sort={listState.sort}
                    onSortChange={listState.setSort}
                    paging={listPaging}
                    itemWord="job"
                    minWidth={900}
                    empty=""
                />
            ) : (
            <Grid>
            {filteredJobs.map((job) => {
              const state = job.output || {}
              const input = jobInput(job)
              const heading = jobHeading(input)
              const client = input.clientName || 'Unknown Client'
              const location = input.location || 'Pending Location'
              const assigneeId = jobAssigneeId(job)
                    const assignee = assigneeId
                        ? memberNames[assigneeId] || `Team member · ${assigneeId.slice(0, 6)}`
                : 'Nobody yet'
              const overdue = isWaitingOverWeek(job)

                    return (
                        <Grid.Col key={job.id} span={{ base: 12, md: 6, lg: 4 }}>
                            <Card
                                shadow="sm"
                                padding="lg"
                                radius="md"
                                withBorder
                    style={
                      overdue
                        ? {
                            backgroundColor: 'light-dark(var(--mantine-color-grape-0), var(--mantine-color-dark-6))',
                            borderLeft: '4px solid var(--mantine-color-grape-6)',
                          }
                        : undefined
                    }
                            >
                                <Group justify="space-between" mb="xs">
                                    <Group gap="xs">
                        <div
                          style={{
                            backgroundColor: 'var(--mantine-primary-color-light)',
                            color: 'var(--mantine-primary-color-light-color)',
                            padding: '6px',
                            borderRadius: '50%',
                          }}
                        >
                                            <IconBriefcase size={16} />
                                        </div>
                                        <div>
                          <Text fw={600} size="md" lineClamp={2}>
                            {heading.title}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {[
                              client,
                              input.storeNumber ? `Store ${input.storeNumber}` : '',
                              input.poNumber,
                              input.reference,
                              input.callOut ? 'Call-out' : '',
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </Text>
                                        </div>
                                    </Group>
                                    {statusBadge(job)}
                                </Group>

                                <Divider my="sm" />

                                <Stack gap="xs" mb="lg">
                                    <Group gap={6} mt="xs">
                                        <IconMapPin size={14} color="var(--mantine-color-dimmed)" />
                        <Text size="xs" c="dimmed">
                          {location}
                        </Text>
                                    </Group>

                                    <Group gap={6}>
                                        <IconUser size={14} color="var(--mantine-color-dimmed)" />
                        <Text size="xs" c="dimmed">
                          Assigned to: {assignee}
                        </Text>
                                    </Group>

                                    <Group gap={6}>
                                        <IconCalendar size={14} color="var(--mantine-color-dimmed)" />
                        <Text size="xs" c="dimmed">
                          Scheduled:{' '}
                          {input.scheduledDate ||
                            new Date(job.created_at || (job as any).createdAt || Date.now()).toLocaleDateString()}
                        </Text>
                                    </Group>
                                </Stack>

                                <Group grow>
                                    <Button
                                        variant="outline"
                                        leftSection={<IconEye size={16} />}
                                        onClick={() => setSelectedJob(job)}
                                    >
                                        View details
                                    </Button>
                                </Group>
                            </Card>
                        </Grid.Col>
              )
                })}
            </Grid>
            )}
            {hasMore && (
                <Group justify="center" mt="md">
                    <Button variant="default" loading={loading} onClick={() => setLimit((current) => current + PAGE)}>
                        Show more jobs
                    </Button>
                </Group>
            )}
            {!loading && !jobsLoadError && filteredJobs.length === 0 && (
                <Paper p="xl" mt="md" radius="md" withBorder ta="center" style={{ backgroundColor: 'var(--mantine-color-default-hover)' }}>
                    <Text c="dimmed">
                      {statusFilter !== 'all'
                        ? 'No jobs match this filter. Choose another status to see more jobs.'
                        : `No jobs here yet.${canCreate ? ' Use “New job” to create one.' : ''}`}
                    </Text>
                </Paper>
            )}
            </Box>

            <Modal opened={showBoard} onClose={() => setShowBoard(false)} title="Calendar & report" size="90%">
                {showBoard && (
                    <JobBoard
                        api={operations}
                        surface="portal"
                        names={memberNames}
                        members={teamMembers}
                        canBook={canCreate}
                        canExport={canCreate}
                        notify={notify}
                        refreshKey={jobs.length}
                        initialView={boardView}
                        onOpenJob={(runId) => {
              setShowBoard(false)
              void openJobById(runId)
                        }}
                    />
                )}
            </Modal>

            {selectedJob && (
                <JobCardDetail
                    job={selectedJob}
                    opened={!!selectedJob}
                    onClose={() => {
                        if (getPortalTask()) {
              endPortalTask()
              void router.replace('/inbox')
            } else setSelectedJob(null)
                    }}
                    onRefresh={fetchJobs}
                    initialTab={String(router.query.stage || '') === 'receipts' ? 'receipts' : 'details'}
                />
            )}
        </Box>
  )
}
