import { useEffect, useState, type ReactNode } from 'react'
import { Anchor, Badge, Box, Group, Paper, Progress, SimpleGrid, Skeleton, Stack, Text, Title, Tooltip, UnstyledButton } from '@mantine/core'

import { ATTENTION_WORDS, storeLabel, type AttentionItem, type JobReport, type OperationsApi } from './operationsApi'

/** Where a dashboard click goes. Each app turns it into its own route. */
export type JobsDashboardTarget =
  | { kind: 'jobs'; filter?: 'urgent' | 'pending' | 'assigned' | 'active' | 'on_hold' | 'attention' | 'completed' }
  | { kind: 'job'; runId: string }
  | { kind: 'report' }

const STAGES: Array<{ label: string; color: string; count: (counts: JobReport['counts']) => number; filter: JobsDashboardTarget }> = [
  { label: 'Unassigned', color: 'gray', count: (c) => c.pending + c.not_booked, filter: { kind: 'jobs', filter: 'pending' } },
  { label: 'Assigned', color: 'indigo', count: (c) => c.assigned, filter: { kind: 'jobs', filter: 'assigned' } },
  { label: 'In progress', color: 'blue', count: (c) => c.active + c.arrived, filter: { kind: 'jobs', filter: 'active' } },
  { label: 'On hold', color: 'orange', count: (c) => c.on_hold, filter: { kind: 'jobs', filter: 'on_hold' } },
  { label: 'Visit failed', color: 'red', count: (c) => c.failed, filter: { kind: 'jobs', filter: 'attention' } },
]

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
}: {
  api: OperationsApi | null
  surface: 'portal' | 'phone'
  onOpen: (target: JobsDashboardTarget) => void
  refreshKey?: number
  /** Shown instead when the figures cannot be read (only managers can). */
  fallback?: ReactNode
}) {
  const [report, setReport] = useState<JobReport | null>(null)
  const [attention, setAttention] = useState<AttentionItem[] | null>(null)
  const [failed, setFailed] = useState(false)
  const phone = surface === 'phone'

  useEffect(() => {
    if (!api) return
    let cancelled = false
    void Promise.allSettled([api.jobReport(), api.attention()]).then(([reportResult, attentionResult]) => {
      if (cancelled) return
      if (reportResult.status === 'fulfilled') setReport(reportResult.value)
      else setFailed(true)
      setAttention(attentionResult.status === 'fulfilled' ? attentionResult.value : [])
    })
    return () => {
      cancelled = true
    }
  }, [api, refreshKey])

  // Only managers can read the report; everyone else keeps the rest of the home page.
  if (failed) return <>{fallback}</>
  if (!report) {
    return (
      <Stack gap="sm">
        <SimpleGrid cols={phone ? 2 : { base: 2, sm: 3, lg: 6 }} spacing="sm">
          {Array.from({ length: phone ? 4 : 6 }, (_, index) => (
            <Skeleton key={index} height={76} radius="md" />
          ))}
        </SimpleGrid>
        <Skeleton height={phone ? 140 : 180} radius="md" />
      </Stack>
    )
  }

  const counts = report.counts
  const today = report.today
  const open = STAGES.reduce((sum, stage) => sum + stage.count(counts), 0)
  const stuck = new Set((attention || []).map((item) => item.runId || item.intakeId || item.reference)).size
  const tiles: Array<{ label: string; value: number | string; hint?: string; color?: string; target: JobsDashboardTarget }> = [
    { label: 'Open jobs', value: open, hint: `${today?.unassigned ?? counts.pending + counts.not_booked} unassigned`, target: { kind: 'jobs' } },
    { label: 'Needs attention', value: stuck || counts.failed, hint: 'Late, stuck or nobody on it', color: stuck || counts.failed ? 'red' : undefined, target: { kind: 'jobs', filter: 'attention' } },
    ...(today
      ? [
          { label: 'Booked for today', value: today.scheduled, hint: today.overdue ? `${today.overdue} past their day` : 'None past their day', color: today.overdue ? 'orange' : undefined, target: { kind: 'jobs' } as JobsDashboardTarget },
          { label: 'Urgent call-outs', value: today.urgent, hint: 'Open call-outs', color: today.urgent ? 'red' : undefined, target: { kind: 'jobs', filter: 'urgent' } as JobsDashboardTarget },
          { label: 'Done in 7 days', value: today.completedLast7Days, hint: `${today.completedLast30Days} in 30 days · ${today.receivedLast7Days} came in`, color: 'teal', target: { kind: 'jobs', filter: 'completed' } as JobsDashboardTarget },
        ]
      : []),
    ...(report.firstTimeFix && report.firstTimeFix.percent !== undefined
      ? [
          {
            label: 'Fixed first visit',
            value: `${report.firstTimeFix.percent}%`,
            hint: `${report.firstTimeFix.returnVisits} needed a return visit`,
            color: report.firstTimeFix.percent >= 85 ? 'teal' : report.firstTimeFix.percent >= 70 ? 'orange' : 'red',
            target: { kind: 'report' } as JobsDashboardTarget,
          },
        ]
      : []),
    {
      label: 'Days to complete',
      value: report.averageDaysToComplete ?? '–',
      hint: today?.oldestOpenDays !== undefined ? `Oldest open job: ${today.oldestOpenDays} days` : 'Average, received to done',
      target: { kind: 'report' },
    },
  ]

  const weekly = report.weekly || []
  const busiestWeek = Math.max(1, ...weekly.flatMap((week) => [week.received, week.completed]))
  const stores = report.byStore.filter((store) => store.open > 0).slice(0, phone ? 3 : 6)
  const workers = report.byWorker.slice(0, phone ? 3 : 6)
  const problems = (report.byProblemType || []).filter((problem) => problem.open > 0).slice(0, phone ? 3 : 6)
  const urgentFirst = [...(attention || [])].sort((a, b) => b.days - a.days).slice(0, phone ? 3 : 6)

  return (
    <Stack gap={phone ? 'sm' : 'md'}>
      <SimpleGrid cols={phone ? 2 : { base: 2, sm: 3, lg: 6 }} spacing="sm">
        {tiles.map((tile) => (
          <UnstyledButton key={tile.label} onClick={() => onOpen(tile.target)} style={{ display: 'block' }}>
            <Paper withBorder radius="md" p="sm" h="100%">
              <Text size="xs" c="dimmed" fw={600}>
                {tile.label}
              </Text>
              <Text size={phone ? 'xl' : '1.75rem'} fw={700} c={tile.color} lh={1.2}>
                {tile.value}
              </Text>
              {tile.hint && (
                <Text size="xs" c="dimmed" lineClamp={1}>
                  {tile.hint}
                </Text>
              )}
            </Paper>
          </UnstyledButton>
        ))}
      </SimpleGrid>

      <SimpleGrid cols={phone ? 1 : { base: 1, md: 2 }} spacing="md">
        <Section title="Where open jobs are" action={<Anchor size="xs" onClick={() => onOpen({ kind: 'jobs' })}>Jobs list</Anchor>}>
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
          <SimpleGrid cols={phone ? 2 : 3} spacing={6} mt="sm">
            {STAGES.map((stage) => (
              <UnstyledButton key={stage.label} onClick={() => onOpen(stage.filter)}>
                <Group gap={6} wrap="nowrap">
                  <Box w={10} h={10} style={{ borderRadius: 3, background: `var(--mantine-color-${stage.color}-6)`, flexShrink: 0 }} />
                  <Text size="sm" truncate>
                    {stage.label}
                  </Text>
                  <Text size="sm" fw={700} ml="auto">
                    {stage.count(counts)}
                  </Text>
                </Group>
              </UnstyledButton>
            ))}
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
                <Tooltip key={week.weekStart} label={`Week of ${shortDay(week.weekStart)}: ${week.received} came in, ${week.completed} done`}>
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

      {urgentFirst.length > 0 && (
        <Section title="Needs attention now" action={<Anchor size="xs" onClick={() => onOpen({ kind: 'jobs', filter: 'attention' })}>See all</Anchor>}>
          <Stack gap={6}>
            {urgentFirst.map((item) => {
              const words = ATTENTION_WORDS[item.kind]
              return (
                <UnstyledButton
                  key={`${item.kind}:${item.runId || item.intakeId || item.reference}`}
                  onClick={() => onOpen(item.runId ? { kind: 'job', runId: item.runId } : { kind: 'jobs', filter: 'attention' })}
                  style={{ borderRadius: 8, padding: '6px 8px', border: '1px solid var(--mantine-color-default-border)' }}
                >
                  <Group justify="space-between" wrap="nowrap" gap="xs">
                    <Box style={{ minWidth: 0 }}>
                      <Text size="sm" fw={600} truncate>
                        {item.headline}
                      </Text>
                      <Text size="xs" c="dimmed" truncate>
                        {[item.reference, item.storeNumber ? `Store ${item.storeNumber}` : '', item.detail].filter(Boolean).join(' · ')}
                      </Text>
                    </Box>
                    <Badge color={words?.color || 'red'} variant="light" style={{ flexShrink: 0 }}>
                      {words?.label || item.label} · {item.days} {item.days === 1 ? 'day' : 'days'}
                    </Badge>
                  </Group>
                </UnstyledButton>
              )
            })}
          </Stack>
        </Section>
      )}

      <SimpleGrid cols={phone ? 1 : { base: 1, md: problems.length ? 3 : 2 }} spacing="md">
        <Section title="Busiest stores" action={<Anchor size="xs" onClick={() => onOpen({ kind: 'report' })}>Full report</Anchor>}>
          {stores.length === 0 && <Text size="sm" c="dimmed">No store has an open job.</Text>}
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
        <Section title="Workload" action={<Anchor size="xs" onClick={() => onOpen({ kind: 'report' })}>Full report</Anchor>}>
          {workers.length === 0 && <Text size="sm" c="dimmed">No jobs have a worker yet.</Text>}
          <RankList
            rows={workers.map((worker) => ({
              key: worker.userId || `old:${worker.name}`,
              label: worker.name,
              value: worker.open,
              hint: `${worker.completed} done${worker.oldSystem ? ' · old system' : ''}`,
            }))}
            color="blue"
          />
        </Section>
        {problems.length > 0 && (
          <Section title="Common problems" action={<Anchor size="xs" onClick={() => onOpen({ kind: 'report' })}>Full report</Anchor>}>
            <RankList
              rows={problems.map((problem) => ({ key: problem.problemType, label: problem.problemType, value: problem.open, hint: `${problem.total} in all` }))}
              color="grape"
            />
          </Section>
        )}
      </SimpleGrid>
    </Stack>
  )
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Paper withBorder radius="md" p="md">
      <Group justify="space-between" mb="sm" wrap="nowrap">
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
  return <Box w={8} style={{ height: `${Math.max(value ? 4 : 1, (value / max) * 100)}%`, background: color, borderRadius: 2 }} />
}

/** Name, open count with a bar scaled to the busiest row, and a short note. */
function RankList({ rows, color }: { rows: Array<{ key: string; label: string; value: number; hint: string }>; color: string }) {
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
              {row.value} open
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
