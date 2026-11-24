import { useEffect, useState, type ReactNode } from 'react'
import {
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Group,
  NumberInput,
  Paper,
  Progress,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  Title,
  Tooltip,
  UnstyledButton,
} from '@mantine/core'

import {
  IconAlertTriangle,
  IconBolt,
  IconBriefcase,
  IconCalendarEvent,
  IconCircleCheck,
  IconRosetteDiscountCheck,
} from '@tabler/icons-react'

import { StatTile, type StatTileIcon } from '../StatTile'
import {
  ATTENTION_WORDS,
  type AttentionKind,
  storeLabel,
  type AttentionItem,
  type JobReport,
  type JobResponseTargets,
  type OperationsApi,
  type ResponsePriority,
} from './operationsApi'
import { TodayJobsMap } from './TodayJobsMap'

/** Where a dashboard click goes. Each app turns it into its own route. */
export type JobsDashboardTarget =
  | { kind: 'jobs'; filter?: 'urgent' | 'pending' | 'assigned' | 'active' | 'on_hold' | 'attention' | 'completed' }
  | { kind: 'job'; runId: string }
  | { kind: 'report' }

const STAGES: Array<{
  label: string
  color: string
  count: (counts: JobReport['counts']) => number
  filter: JobsDashboardTarget
}> = [
  {
    label: 'Unassigned',
    color: 'gray',
    count: (c) => c.pending + c.not_booked,
    filter: { kind: 'jobs', filter: 'pending' },
  },
  { label: 'Assigned', color: 'indigo', count: (c) => c.assigned, filter: { kind: 'jobs', filter: 'assigned' } },
  {
    label: 'In progress',
    color: 'blue',
    count: (c) => c.active + c.arrived,
    filter: { kind: 'jobs', filter: 'active' },
  },
  { label: 'On hold', color: 'orange', count: (c) => c.on_hold, filter: { kind: 'jobs', filter: 'on_hold' } },
  { label: 'Visit failed', color: 'red', count: (c) => c.failed, filter: { kind: 'jobs', filter: 'attention' } },
]

/** Most serious first: a missed or stopped job before one that is only drifting. */
const ATTENTION_ORDER: Record<AttentionKind, number> = {
  response_breached: 0,
  failed: 1,
  response_at_risk: 2,
  overdue: 3,
  unassigned: 4,
  stalled: 5,
  waiting: 6,
}

function shortDay(day: string): string {
  const date = new Date(`${day}T12:00:00Z`)
  return Number.isNaN(date.getTime()) ? day : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/**
 * The office's view of the work, the same on the portal and the phone: what is open, late or stuck,
 * how much came in and got done, and which stores, people and problems take the most jobs.
 * Everything links into the one Jobs list; there is no second list here.
 */
export function JobsDashboard({
  api,
  surface,
  onOpen,
  refreshKey,
  fallback = null,
  canManage = false,
  between,
}: {
  api: OperationsApi | null
  surface: 'portal' | 'phone'
  onOpen: (target: JobsDashboardTarget) => void
  refreshKey?: number
  /** Shown instead when the figures cannot be read (only managers can). */
  fallback?: ReactNode
  canManage?: boolean
  /** Placed after the figures that need action now and before the longer-term figures. */
  between?: ReactNode
}) {
  const [report, setReport] = useState<JobReport | null>(null)
  const [attention, setAttention] = useState<AttentionItem[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [attentionFailed, setAttentionFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  const phone = surface === 'phone'

  useEffect(() => {
    if (!api) return
    let cancelled = false
    setFailed(false)
    setAttentionFailed(false)
    void Promise.allSettled([api.jobReport(), api.attention()]).then(([reportResult, attentionResult]) => {
      if (cancelled) return
      if (reportResult.status === 'fulfilled') setReport(reportResult.value)
      else setFailed(true)
      setAttention(attentionResult.status === 'fulfilled' ? attentionResult.value : null)
      setAttentionFailed(attentionResult.status === 'rejected')
    })
    return () => {
      cancelled = true
    }
  }, [api, refreshKey, retry])

  if (!api) return <Stack gap="sm">{fallback}{between}</Stack>

  // Only managers can read the report; everyone else keeps the rest of the home page.
  if (failed) return canManage ? (
    <Stack gap="sm">
      <Alert color="orange" title="Jobs overview unavailable">
        <Stack gap="sm">
          <Text size="sm">The latest job figures could not be loaded. Open the jobs list or try again.</Text>
          <Button size="xs" variant="light" onClick={() => setRetry((value) => value + 1)}>Try again</Button>
          {fallback}
        </Stack>
      </Alert>
      {between}
    </Stack>
  ) : <Stack gap="sm">{fallback}{between}</Stack>
  if (!report) {
    return (
      <Stack gap="sm">
        <SimpleGrid cols={phone ? 2 : { base: 2, sm: 3, lg: 6 }} spacing="sm">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} height={76} radius="md" />
          ))}
        </SimpleGrid>
        <Skeleton height={phone ? 140 : 180} radius="md" />
        {between}
      </Stack>
    )
  }

  const counts = report.counts
  const today = report.today
  const open = STAGES.reduce((sum, stage) => sum + stage.count(counts), 0)
  const stuck = new Set((attention || []).map((item) => item.runId || item.intakeId || item.reference)).size
  const firstTimeFix = report.firstTimeFix?.percent !== undefined ? report.firstTimeFix : undefined
  const averageDays =
    report.averageDaysToComplete !== undefined ? `avg ${report.averageDaysToComplete} days to finish` : undefined
  const unassigned = `${today?.unassigned ?? counts.pending + counts.not_booked} unassigned`
  // Six tiles keep the grid even; with a first-time fix figure the timing figures move into the hints.
  const tiles: Array<{
    label: string
    value: number | string
    hint?: string
    color?: string
    icon: StatTileIcon
    alert?: boolean
    target: JobsDashboardTarget
  }> = [
    {
      label: 'Open jobs',
      value: open,
      hint:
        firstTimeFix && today?.oldestOpenDays !== undefined
          ? `${unassigned} · oldest ${today.oldestOpenDays} days`
          : unassigned,
      color: 'blue',
      icon: IconBriefcase,
      target: { kind: 'jobs' },
    },
    {
      label: 'Needs attention',
      value: attentionFailed ? '—' : stuck || counts.failed,
      hint: 'Late, stuck or nobody on it',
      color: stuck || counts.failed ? 'red' : 'gray',
      alert: Boolean(stuck || counts.failed),
      icon: IconAlertTriangle,
      target: { kind: 'jobs', filter: 'attention' },
    },
    ...(today
      ? [
          {
            label: 'Booked for today',
            value: today.scheduled,
            hint: today.overdue ? `${today.overdue} past their day` : 'None past their day',
            color: today.overdue ? 'orange' : 'indigo',
            icon: IconCalendarEvent,
            target: { kind: 'jobs' } as JobsDashboardTarget,
          },
          {
            label: 'Urgent / out of hours',
            value: `${today.urgent} / ${today.outOfHours ?? 0}`,
            hint: 'Urgent call-outs / out-of-hours jobs',
            color: today.urgent ? 'red' : 'gray',
            alert: today.urgent > 0,
            icon: IconBolt,
            target: { kind: 'jobs', filter: 'urgent' } as JobsDashboardTarget,
          },
          {
            label: 'Done in 7 days',
            value: today.completedLast7Days,
            hint: [
              `${today.completedLast30Days} in 30 days`,
              firstTimeFix ? averageDays : `${today.receivedLast7Days} came in`,
            ]
              .filter(Boolean)
              .join(' · '),
            color: 'teal',
            icon: IconCircleCheck,
            target: { kind: 'jobs', filter: 'completed' } as JobsDashboardTarget,
          },
        ]
      : []),
    firstTimeFix
      ? {
          label: 'Fixed first visit',
          value: `${firstTimeFix.percent}%`,
          hint: `${firstTimeFix.returnVisits} needed a return visit`,
          color: firstTimeFix.percent! >= 85 ? 'teal' : firstTimeFix.percent! >= 70 ? 'orange' : 'red',
          icon: IconRosetteDiscountCheck,
          target: { kind: 'report' },
        }
      : {
          label: 'Days to complete',
          value: report.averageDaysToComplete ?? '–',
          hint:
            today?.oldestOpenDays !== undefined
              ? `Oldest open job: ${today.oldestOpenDays} days`
              : 'Average, received to done',
          color: 'gray',
          icon: IconRosetteDiscountCheck,
          target: { kind: 'report' },
        },
  ]

  const weekly = report.weekly || []
  const busiestWeek = Math.max(1, ...weekly.flatMap((week) => [week.received, week.completed]))
  const stores = report.byStore.filter((store) => store.open > 0).slice(0, phone ? 3 : 6)
  const workers = report.byWorker.slice(0, phone ? 3 : 6)
  const problems = (report.byProblemType || []).filter((problem) => problem.open > 0).slice(0, phone ? 3 : 6)
  const branches = (report.byBranch || []).filter((branch) => branch.total > 0).slice(0, phone ? 3 : 6)
  const urgentFirst = [...(attention || [])]
    .sort(
      (a, b) =>
        (ATTENTION_ORDER[a.kind] ?? 9) - (ATTENTION_ORDER[b.kind] ?? 9) ||
        (b.elapsedMinutes ?? b.days * 1440) - (a.elapsedMinutes ?? a.days * 1440),
    )
    .slice(0, phone ? 4 : 6)
  const branchStages = branches.some((branch) => branch.unassigned !== undefined)

  return (
    <Stack gap={phone ? 'sm' : 'md'}>
      <SimpleGrid cols={phone ? 2 : { base: 2, sm: 3, lg: 6 }} spacing="sm">
        {tiles.map((tile) => (
          <StatTile
            key={tile.label}
            label={tile.label}
            value={tile.value}
            hint={tile.hint}
            icon={tile.icon}
            color={tile.color}
            alert={tile.alert}
            compact={phone}
            onClick={() => onOpen(tile.target)}
          />
        ))}
      </SimpleGrid>

      {attentionFailed && (
        <Alert color="orange" title="Attention list unavailable">
          <Group justify="space-between">
            <Text size="sm">Job totals are available, but alerts could not be loaded.</Text>
            <Button size="xs" variant="light" onClick={() => setRetry((value) => value + 1)}>Try again</Button>
          </Group>
        </Alert>
      )}

      {urgentFirst.length > 0 && (
        <Section
          title="Needs attention now"
          action={
            <Anchor component="button" type="button" size="xs" mih={44} onClick={() => onOpen({ kind: 'jobs', filter: 'attention' })}>
              See all
            </Anchor>
          }
        >
          <Stack gap={6}>
            {urgentFirst.map((item) => {
              const words = ATTENTION_WORDS[item.kind]
              return (
                <UnstyledButton
                  key={`${item.kind}:${item.runId || item.intakeId || item.reference}`}
                  onClick={() =>
                    onOpen(item.runId ? { kind: 'job', runId: item.runId } : { kind: 'jobs', filter: 'attention' })
                  }
                  style={{
                    borderRadius: 8,
                    padding: '6px 8px',
                    border: '1px solid var(--mantine-color-default-border)',
                  }}
                >
                  <Group justify="space-between" wrap={phone ? 'wrap' : 'nowrap'} gap="xs">
                    <Box style={{ minWidth: 0 }}>
                      <Text size="sm" fw={600} lineClamp={2}>
                        {item.headline}
                      </Text>
                      <Text size="xs" c="dimmed" lineClamp={phone ? 2 : 1}>
                        {[
                          item.reference && !item.headline.includes(item.reference) ? item.reference : '',
                          item.storeNumber && !item.headline.includes(item.storeNumber) ? `Store ${item.storeNumber}` : '',
                          item.detail,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </Box>
                    <Badge color={words?.color || 'red'} variant="light" style={{ flexShrink: 0 }}>
                      {words?.label || item.label} ·{' '}
                      {item.elapsedMinutes !== undefined
                        ? elapsed(item.elapsedMinutes)
                        : `${item.days} ${item.days === 1 ? 'day' : 'days'}`}
                    </Badge>
                  </Group>
                </UnstyledButton>
              )
            })}
          </Stack>
        </Section>
      )}

      {branchStages && branches.some((branch) => branch.open > 0) && (
        <Section
          title="Branches"
          action={
            <Anchor component="button" type="button" size="xs" mih={44} onClick={() => onOpen({ kind: 'report' })}>
              Full report
            </Anchor>
          }
        >
          <BranchStatus branches={branches.filter((branch) => branch.open > 0)} phone={phone} />
        </Section>
      )}

      {between}
      {between && (
        <Text size="sm" fw={700} mt="xs">
          Job figures
        </Text>
      )}

      <SimpleGrid cols={phone ? 1 : { base: 1, md: 2 }} spacing="md">
        <Section
          title="Where open jobs are"
          action={
            <Anchor component="button" type="button" size="xs" mih={44} onClick={() => onOpen({ kind: 'jobs' })}>
              Jobs list
            </Anchor>
          }
        >
          <Progress.Root size={phone ? 14 : 18} radius="xl">
            {STAGES.map((stage) => {
              const value = stage.count(counts)
              return value > 0 ? (
                <Tooltip key={stage.label} label={`${stage.label}: ${value}`}>
                  <Progress.Section value={(value / Math.max(1, open)) * 100} color={stage.color} />
                </Tooltip>
              ) : null
            })}
          </Progress.Root>
          <SimpleGrid cols={phone ? 2 : 3} spacing="xs" verticalSpacing="xs" mt="md">
            {STAGES.map((stage) => {
              const value = stage.count(counts)
              return (
                <UnstyledButton
                  key={stage.label}
                  mih={44}
                  px="sm"
                  py={6}
                  onClick={() => onOpen(stage.filter)}
                  style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 8, minWidth: 0 }}
                >
                  <Group gap={8} wrap="nowrap">
                    <Box
                      w={10}
                      h={10}
                      style={{ borderRadius: 3, background: `var(--mantine-color-${stage.color}-6)`, flexShrink: 0 }}
                    />
                    <Text size="sm" truncate style={{ flex: 1, minWidth: 0 }}>
                      {stage.label}
                    </Text>
                    <Text size="sm" fw={700} c={value ? undefined : 'dimmed'}>
                      {value}
                    </Text>
                  </Group>
                </UnstyledButton>
              )
            })}
          </SimpleGrid>
        </Section>

        {weekly.length > 0 && (
          <Section
            title="Last 8 weeks"
            action={
              <Group gap="xs">
                <Legend color="var(--mantine-color-blue-4)" label="Came in" />
                <Legend color="var(--mantine-color-teal-6)" label="Done" />
              </Group>
            }
          >
            <Group align="flex-end" gap={phone ? 4 : 8} wrap="nowrap" h={phone ? 96 : 120}>
              {weekly.map((week) => (
                <Tooltip
                  key={week.weekStart}
                  label={`Week of ${shortDay(week.weekStart)}: ${week.received} came in, ${week.completed} done`}
                >
                  <Stack gap={4} align="center" style={{ flex: 1, minWidth: 0 }}>
                    <Group gap={2} align="flex-end" wrap="nowrap" h={phone ? 76 : 96}>
                      <Bar value={week.received} max={busiestWeek} color="var(--mantine-color-blue-4)" />
                      <Bar value={week.completed} max={busiestWeek} color="var(--mantine-color-teal-6)" />
                    </Group>
                    <Text size="10px" c="dimmed" truncate>
                      {shortDay(week.weekStart)}
                    </Text>
                  </Stack>
                </Tooltip>
              ))}
            </Group>
          </Section>
        )}
      </SimpleGrid>

      <SimpleGrid
        cols={phone ? 1 : {
          base: 1,
          sm: 2,
          xl: (branches.length && !branchStages ? 1 : 0) + (problems.length ? 1 : 0) + 2,
        }}
        spacing="md"
      >
        <Section
          title="Busiest stores"
          action={
            <Anchor component="button" type="button" size="xs" mih={44} onClick={() => onOpen({ kind: 'report' })}>
              Full report
            </Anchor>
          }
        >
          {stores.length === 0 && (
            <Text size="sm" c="dimmed">
              No store has an open job.
            </Text>
          )}
          <RankList
            rows={stores.map((store) => ({
              key: store.storeNumber,
              label: storeLabel(store.storeNumber, store.name),
              value: store.open,
              hint: `${store.completed} done`,
            }))}
            color="indigo"
          />
        </Section>
        <Section
          title="Workload"
          action={
            <Anchor component="button" type="button" size="xs" mih={44} onClick={() => onOpen({ kind: 'report' })}>
              Full report
            </Anchor>
          }
        >
          {workers.length === 0 && (
            <Text size="sm" c="dimmed">
              No jobs have a worker yet.
            </Text>
          )}
          <RankList
            rows={workers.map((worker) => {
              // Older APIs counted unassigned imported jobs as an old-system worker's open jobs.
              const toAssign = worker.toAssign ?? (worker.oldSystem ? worker.open : 0)
              const assigned = worker.oldSystem && worker.toAssign === undefined ? 0 : worker.open
              return {
                key: worker.userId || `old:${worker.name}`,
                label: worker.name,
                value: assigned || toAssign,
                unit: assigned ? 'assigned' : 'to assign',
                hint: worker.oldSystem
                  ? `From the old system · not assigned here yet · ${worker.completed} done`
                  : `${worker.completed} done${toAssign ? ` · ${toAssign} to assign` : ''}`,
              }
            })}
            color="blue"
          />
        </Section>
        {branches.length > 0 && !branchStages && (
          <Section
            title="Work by branch"
            action={
              <Anchor component="button" type="button" size="xs" mih={44} onClick={() => onOpen({ kind: 'report' })}>
                Full report
              </Anchor>
            }
          >
            <RankList
              rows={branches.map((branch) => ({
                key: branch.branch,
                label: branch.branch,
                value: branch.open,
                hint: `${branch.completed} done · ${branch.total} total`,
              }))}
              color="teal"
            />
          </Section>
        )}
        {problems.length > 0 && (
          <Section
            title="Common problems"
            action={
              <Anchor component="button" type="button" size="xs" mih={44} onClick={() => onOpen({ kind: 'report' })}>
                Full report
              </Anchor>
            }
          >
            <RankList
              rows={problems.map((problem) => ({
                key: problem.problemType,
                label: problem.problemType,
                value: problem.open,
                hint: `${problem.total} in all`,
              }))}
              color="grape"
            />
          </Section>
        )}
      </SimpleGrid>
      {canManage && (
        <SimpleGrid cols={phone ? 1 : { base: 1, md: 2 }} spacing="md">
          <ResponseTargetsPanel api={api} onSaved={async () => setAttention(await api.attention())} />
          <TodayJobsMap api={api} onOpen={(runId) => onOpen({ kind: 'job', runId })} />
        </SimpleGrid>
      )}
    </Stack>
  )
}

const RESPONSE_PRIORITY_LABELS: Record<ResponsePriority, string> = {
  urgent: 'Urgent',
  out_of_hours: 'Out of hours',
  normal: 'Normal',
}

function ResponseTargetsPanel({ api, onSaved }: { api: OperationsApi; onSaved: () => Promise<void> }) {
  const [values, setValues] = useState<Record<ResponsePriority, number | string | ''>>({
    urgent: '',
    out_of_hours: '',
    normal: '',
  })
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [retry, setRetry] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoaded(false)
    setError('')
    void api
      .responseTargets()
      .then((targets) => {
        if (cancelled) return
        setValues({
          urgent: targets.urgent ?? '',
          out_of_hours: targets.out_of_hours ?? '',
          normal: targets.normal ?? '',
        })
        setLoading(false)
        setLoaded(true)
      })
      .catch((reason) => {
        if (cancelled) return
        setError(`Response targets could not be loaded. ${reason instanceof Error ? reason.message : 'Please try again.'}`)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [api, retry])

  const save = async () => {
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const targets: JobResponseTargets = {
        urgent: values.urgent === '' ? null : Number(values.urgent),
        out_of_hours: values.out_of_hours === '' ? null : Number(values.out_of_hours),
        normal: values.normal === '' ? null : Number(values.normal),
      }
      const savedTargets = await api.saveResponseTargets(targets)
      setValues({
        urgent: savedTargets.urgent ?? '',
        out_of_hours: savedTargets.out_of_hours ?? '',
        normal: savedTargets.normal ?? '',
      })
      setSaved(true)
      try {
        await onSaved()
      } catch {
        setError('Targets were saved, but the attention list could not be refreshed.')
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Response targets could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Section title="First-response targets">
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          Time from a job arriving to a worker being assigned, measured in elapsed minutes. Leave a target blank to keep
          alerts off for that priority.
        </Text>
        {(Object.keys(RESPONSE_PRIORITY_LABELS) as ResponsePriority[]).map((priority) => (
          <NumberInput
            key={priority}
            label={RESPONSE_PRIORITY_LABELS[priority]}
            placeholder="No target"
            min={1}
            max={10080}
            step={15}
            suffix=" min"
            value={values[priority]}
            onChange={(value) => setValues((current) => ({ ...current, [priority]: value }))}
            disabled={loading || !loaded}
          />
        ))}
        {error && (
          <Text size="sm" c="red">
            {error}
          </Text>
        )}
        {saved && (
          <Text size="sm" c="teal">
            Targets saved.
          </Text>
        )}
        {!loading && !loaded && (
          <Button variant="light" onClick={() => setRetry((value) => value + 1)}>Try again</Button>
        )}
        <Button onClick={() => void save()} loading={saving} disabled={loading || !loaded}>
          Save targets
        </Button>
      </Stack>
    </Section>
  )
}

function elapsed(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remaining = minutes % 60
  return `${hours}h${remaining ? ` ${remaining}m` : ''}`
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Paper withBorder radius="md" p="md" style={{ minWidth: 0 }}>
      <Group justify="space-between" mb="sm" wrap="wrap" gap="xs">
        <Title order={5}>{title}</Title>
        {action}
      </Group>
      {children}
    </Paper>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <Group gap={4} wrap="nowrap">
      <Box w={8} h={8} style={{ borderRadius: 2, background: color }} />
      <Text size="xs" c="dimmed">
        {label}
      </Text>
    </Group>
  )
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <Box
      w={8}
      style={{ height: `${Math.max(value ? 4 : 1, (value / max) * 100)}%`, background: color, borderRadius: 2 }}
    />
  )
}

/** Name, open count with a bar scaled to the busiest row, and a short note. */
function RankList({
  rows,
  color,
}: {
  rows: Array<{ key: string; label: string; value: number; hint: string; unit?: string }>
  color: string
}) {
  const top = Math.max(1, ...rows.map((row) => row.value))
  return (
    <Stack gap={8}>
      {rows.map((row) => (
        <Box key={row.key}>
          <Group justify="space-between" wrap="nowrap" gap="xs">
            <Text size="sm" truncate style={{ minWidth: 0 }}>
              {row.label}
            </Text>
            <Text size="sm" fw={700} style={{ flexShrink: 0 }}>
              {row.value} {row.unit || 'open'}
            </Text>
          </Group>
          <Progress value={(row.value / top) * 100} color={color} size="sm" radius="xl" mt={2} />
          <Text size="xs" c="dimmed">
            {row.hint}
          </Text>
        </Box>
      ))}
    </Stack>
  )
}

const BRANCH_STAGES = [
  { key: 'unassigned', label: 'Unassigned', color: 'gray' },
  { key: 'assigned', label: 'Assigned', color: 'indigo' },
  { key: 'inProgress', label: 'In progress', color: 'blue' },
  { key: 'onHold', label: 'On hold', color: 'orange' },
  { key: 'failed', label: 'Visit failed', color: 'red' },
] as const

type BranchRow = NonNullable<JobReport['byBranch']>[number]

/** Each branch's open jobs as one bar split by stage, with its urgent and finished counts beside it. */
function BranchStatus({ branches, phone }: { branches: BranchRow[]; phone: boolean }) {
  return (
    <Stack gap="sm">
      <SimpleGrid cols={phone ? 1 : { base: 1, sm: 2, xl: 3 }} spacing="md" verticalSpacing="sm">
        {branches.map((branch) => (
          <Box key={branch.branch} style={{ minWidth: 0 }}>
            <Group justify="space-between" wrap="nowrap" gap="xs" mb={4}>
              <Text size="sm" fw={600} truncate style={{ minWidth: 0 }}>
                {branch.branch}
              </Text>
              <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
                {Boolean(branch.urgent) && (
                  <Badge size="sm" color="red" variant="light">
                    {branch.urgent} urgent
                  </Badge>
                )}
                <Text size="sm" fw={700}>
                  {branch.open} open
                </Text>
              </Group>
            </Group>
            <Progress.Root size="md" radius="xl">
              {BRANCH_STAGES.map((stage) => {
                const value = branch[stage.key] || 0
                return value > 0 ? (
                  <Tooltip key={stage.key} label={`${stage.label}: ${value}`}>
                    <Progress.Section value={(value / Math.max(1, branch.open)) * 100} color={stage.color} />
                  </Tooltip>
                ) : null
              })}
            </Progress.Root>
            <Text size="xs" c="dimmed" mt={4} lineClamp={2}>
              {[
                ...BRANCH_STAGES.filter((stage) => branch[stage.key]).map(
                  (stage) => `${branch[stage.key]} ${stage.label.toLowerCase()}`,
                ),
                `${branch.completed} done`,
              ].join(' · ')}
            </Text>
          </Box>
        ))}
      </SimpleGrid>
      <Group gap="sm">
        {BRANCH_STAGES.map((stage) => (
          <Legend key={stage.key} color={`var(--mantine-color-${stage.color}-6)`} label={stage.label} />
        ))}
      </Group>
    </Stack>
  )
}
