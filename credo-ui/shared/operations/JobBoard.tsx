import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge, Button, ColorSwatch, Drawer, Group, Paper, SegmentedControl, Select, SimpleGrid, Stack, Text, TextInput } from '@mantine/core'
import { IconCalendar, IconDownload, IconMail, IconSearch } from '@tabler/icons-react'

import { IMPORTED_JOB_DETAIL_LABELS } from '../../../src/config/fieldDataImport'
import { FIELD_JOB_CATEGORY_LABELS } from '../../../src/config/fieldJobCategory'
import { FIELD_JOB_SOURCE_OPTIONS, fieldJobSourceLabel } from '../../../src/config/fieldJobSource'
import type { ListSort } from '../../../src/config/listPage'
import { DataTable, useClientList, useListState, type DataColumn } from '../DataTable'

import { IncomingJobs, type IncomingJobsMember } from './IncomingJobs'
import {
  JOB_CATEGORY_WORDS,
  JOB_WAITING_FLAG_DAYS,
  jobWaitingDays,
  readableDate,
  type JobRegisterCategory,
  type JobRegisterRow,
  type JobReport,
  type OperationsApi,
} from './operationsApi'


const STATUSES = [
  { value: 'all', label: 'All jobs' },
  { value: 'not_booked', label: 'Not booked yet' },
  ...Object.entries(FIELD_JOB_CATEGORY_LABELS).map(([value, label]) => ({ value, label })),
]

function localDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function mondayOf(date: Date): Date {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12)
  next.setDate(next.getDate() - ((next.getDay() + 6) % 7))
  return next
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function dayOf(row: JobRegisterRow): string {
  const scheduled = String(row.scheduledDate || '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(scheduled) ? scheduled : ''
}

function statusWord(row: JobRegisterRow): { label: string; color: string } {
  return JOB_CATEGORY_WORDS[row.category]
}

/** The status colour as a CSS colour, for the edge of a row or card. */
function statusEdge(row: JobRegisterRow): string {
  return `var(--mantine-color-${statusWord(row).color}-6)`
}

function StatusOption({ value, label }: { value: string; label: string }) {
  const color = JOB_CATEGORY_WORDS[value as JobRegisterCategory]?.color
  return (
    <Group gap="xs" wrap="nowrap">
      {color ? <ColorSwatch color={`var(--mantine-color-${color}-6)`} size={12} withShadow={false} /> : null}
      <span>{label}</span>
    </Group>
  )
}

/** The API's sort keys (`JOB_REGISTER_SORTS`), in words. */
const SORTS: Array<{ value: string; label: string; sort: ListSort }> = [
  { value: 'received:desc', label: 'Newest first', sort: { key: 'received', dir: 'desc' } },
  { value: 'received:asc', label: 'Oldest first', sort: { key: 'received', dir: 'asc' } },
  { value: 'date:asc', label: 'Booked date, soonest', sort: { key: 'date', dir: 'asc' } },
  { value: 'date:desc', label: 'Booked date, latest', sort: { key: 'date', dir: 'desc' } },
  { value: 'reference:asc', label: 'Job number', sort: { key: 'reference', dir: 'asc' } },
  { value: 'store:asc', label: 'Store', sort: { key: 'store', dir: 'asc' } },
  { value: 'status:asc', label: 'Status', sort: { key: 'status', dir: 'asc' } },
]

function sortValue(sort: ListSort | null): string {
  return sort ? `${sort.key}:${sort.dir}` : 'received:desc'
}

function workerLine(row: JobRegisterRow, names: Record<string, string>): string {
  if (row.assigneeId) return names[row.assigneeId] || 'Assigned'
  if (row.workerName) return row.workerName
  return row.kind === 'job' ? 'Nobody yet' : ''
}

/**
 * Booked jobs and jobs still waiting (from the mailbox or written down by the office) in one
 * list, with the same filters, calendar and report on both apps.
 */
export function JobBoard({
  api,
  surface,
  names,
  members,
  canBook,
  canExport,
  notify,
  onOpenJob,
  refreshKey,
}: {
  api: OperationsApi | null
  surface: 'portal' | 'phone'
  names: Record<string, string>
  members: IncomingJobsMember[]
  canBook: boolean
  canExport: boolean
  notify: (message: string, tone: 'success' | 'error' | 'info') => void
  onOpenJob: (runId: string) => void
  refreshKey?: number
}) {
  const [rows, setRows] = useState<JobRegisterRow[]>([])
  const [total, setTotal] = useState(0)
  const [calendarRows, setCalendarRows] = useState<JobRegisterRow[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [view, setView] = useState('list')
  const [layout, setLayout] = useState<'table' | 'cards'>(surface === 'phone' ? 'cards' : 'table')
  const [source, setSource] = useState<string | null>('all')
  const [category, setCategory] = useState<string | null>('all')
  const [storeNumber, setStoreNumber] = useState<string | null>('all')
  const [workerId, setWorkerId] = useState<string | null>('all')
  const [stores, setStores] = useState<Array<{ value: string; label: string }>>([])
  const [query, setQuery] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [week, setWeek] = useState(() => mondayOf(new Date()))
  const [span, setSpan] = useState<'day' | 'week'>('week')
  const [focusDay, setFocusDay] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12)
  })
  const [report, setReport] = useState<JobReport | null>(null)
  const [booking, setBooking] = useState<string | null>(null)
  const [viewing, setViewing] = useState<JobRegisterRow | null>(null)
  const size = surface === 'phone' ? 'md' : 'sm'
  const layoutKey = `jobBoardLayout:${surface}`

  useEffect(() => {
    const saved = typeof window === 'undefined' ? null : window.localStorage.getItem(layoutKey)
    if (saved === 'table' || saved === 'cards') setLayout(saved)
  }, [layoutKey])

  const pickLayout = (next: string) => {
    const value = next === 'cards' ? 'cards' : 'table'
    setLayout(value)
    try {
      window.localStorage.setItem(layoutKey, value)
    } catch {
      /* private browsing: the choice lasts until the page closes */
    }
  }

  const filter = useMemo(
    () => ({
      source: source && source !== 'all' ? source : undefined,
      category: category && category !== 'all' ? category : undefined,
      storeNumber: storeNumber && storeNumber !== 'all' ? storeNumber : undefined,
      assigneeId: canBook && workerId && workerId !== 'all' ? workerId : undefined,
      q: query.trim() || undefined,
      from: from || undefined,
      to: to || undefined,
    }),
    [source, category, storeNumber, workerId, canBook, query, from, to],
  )
  const list = useListState({ initialSort: { key: 'received', dir: 'desc' }, resetKey: JSON.stringify(filter) })

  useEffect(() => {
    if (!api) return
    api
      .stores()
      .then((items) =>
        setStores(
          items
            .filter((store) => store.storeNumber)
            .map((store) => ({
              value: store.storeNumber,
              label: store.name ? `${store.storeNumber} · ${store.name}` : `Store ${store.storeNumber}`,
            })),
        ),
      )
      .catch(() => setStores([]))
  }, [api])

  // Only one page of the list is fetched: an imported or mailed-in backlog can run to thousands.
  const load = useCallback(async () => {
    if (!api || view !== 'list') return
    setLoading(true)
    try {
      const page = await api.jobs({
        ...filter,
        sort: list.sort?.key,
        dir: list.sort?.dir,
        limit: String(list.limit),
        offset: String(list.offset),
      })
      setRows(page.items)
      setTotal(page.total)
      setLoaded(true)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not load jobs', 'error')
    } finally {
      setLoading(false)
    }
  }, [api, view, filter, list.sort?.key, list.sort?.dir, list.limit, list.offset, notify])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  useEffect(() => {
    if (view !== 'reports' || !api) return
    api
      .jobReport({ source: filter.source, from: filter.from, to: filter.to })
      .then(setReport)
      .catch((error) => notify(error instanceof Error ? error.message : 'Could not load the report', 'error'))
  }, [view, api, filter.source, filter.from, filter.to, notify, refreshKey])

  const download = async () => {
    if (!api) return
    try {
      const csv = await api.exportJobs(filter)
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `jobs-${localDay(new Date())}.csv`
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not export the jobs', 'error')
    }
  }

  const days = Array.from({ length: 7 }, (_, index) => addDays(week, index))
  const shownDays = span === 'day' ? [focusDay] : days
  const firstShown = localDay(shownDays[0])
  const lastShown = localDay(shownDays[shownDays.length - 1])

  // The calendar asks for the days on screen only (within any From/To chosen), whatever page the list is on.
  const loadCalendar = useCallback(async () => {
    if (!api || view !== 'calendar') return
    const rangeFrom = filter.from && filter.from > firstShown ? filter.from : firstShown
    const rangeTo = filter.to && filter.to < lastShown ? filter.to : lastShown
    if (rangeFrom > rangeTo) {
      setCalendarRows([])
      return
    }
    try {
      setCalendarRows((await api.jobs({ ...filter, from: rangeFrom, to: rangeTo })).items)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not load jobs', 'error')
    }
  }, [api, view, filter, firstShown, lastShown, notify])

  useEffect(() => {
    void loadCalendar()
  }, [loadCalendar, refreshKey])

  const byDay = new Map<string, JobRegisterRow[]>()
  for (const row of calendarRows) {
    const day = dayOf(row)
    if (!day) continue
    byDay.set(day, [...(byDay.get(day) || []), row])
  }
  // Jobs received in these days with no booked date cannot sit on a day; say how many so nobody thinks they are lost.
  const undated = calendarRows.filter((row) => !dayOf(row))

  const action = (row: JobRegisterRow) =>
    row.kind === 'job' ? (
      <Button size={size} variant="light" radius="xl" style={{ minHeight: surface === 'phone' ? 48 : 36 }} onClick={(event) => { event.stopPropagation(); onOpenJob(row.id) }}>
        Open
      </Button>
    ) : row.kind === 'history' ? (
      <Button size={size} variant="default" radius="xl" style={{ minHeight: surface === 'phone' ? 48 : 36 }} onClick={(event) => { event.stopPropagation(); setViewing(row) }}>
        Details
      </Button>
    ) : (
      canBook && (
        <Button size={size} radius="xl" style={{ minHeight: surface === 'phone' ? 48 : 36 }} onClick={(event) => { event.stopPropagation(); setBooking(booking === row.id ? null : row.id) }}>
          Book
        </Button>
      )
    )

  const badges = (row: JobRegisterRow) => {
    const status = statusWord(row)
    const waiting = jobWaitingDays(row)
    return (
      <Group gap={6}>
        <Badge variant="filled" color={status.color} c="black">
          {status.label}
        </Badge>
        {waiting >= JOB_WAITING_FLAG_DAYS && (
          <Badge variant="outline" color="red">
            Waiting {waiting} days
          </Badge>
        )}
        <Badge variant="default" leftSection={row.source === 'email' ? <IconMail size={12} /> : undefined}>
          {fieldJobSourceLabel(row.source)}
        </Badge>
        {row.callOut && (
          <Badge variant="light" color="orange">
            Call-out
          </Badge>
        )}
        {row.possibleRepeat && (
          <Badge variant="light" color="red">
            Possible repeat
          </Badge>
        )}
      </Group>
    )
  }

  const columns: Array<DataColumn<JobRegisterRow>> = [
    {
      key: 'reference',
      title: 'Job',
      sortable: true,
      sticky: true,
      maxWidth: 260,
      render: (row) => (
        <Stack gap={0}>
          <Text size="sm" fw={600} truncate>
            {row.reference}
          </Text>
          <Text size="xs" c="dimmed" lineClamp={2}>
            {row.description || 'No description'}
          </Text>
        </Stack>
      ),
    },
    { key: 'status', title: 'Status', sortable: true, minWidth: 180, render: badges },
    { key: 'store', title: 'Store', sortable: true, nowrap: true, render: (row) => row.storeNumber || '—' },
    { key: 'client', title: 'Client', sortable: true, minWidth: 140, render: (row) => <Text size="sm" lineClamp={2}>{row.clientName || row.location || '—'}</Text> },
    { key: 'date', title: 'Booked for', sortable: true, nowrap: true, render: (row) => (row.scheduledDate ? readableDate(row.scheduledDate) : 'No date') },
    { key: 'worker', title: 'Worker', nowrap: true, render: (row) => workerLine(row, names) || '—' },
    { key: 'received', title: 'Received', sortable: true, firstDir: 'desc', nowrap: true, render: (row) => readableDate(String(row.createdAt).slice(0, 10)) },
    { key: 'action', title: '', align: 'right', render: action },
  ]

  const card = (row: JobRegisterRow) => (
    <Paper withBorder radius="md" p="sm" h="100%" style={{ borderLeft: `4px solid ${statusEdge(row)}` }}>
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
          {badges(row)}
          <Text fw={500} lineClamp={2}>
            {row.reference} · {row.description || 'No description'}
          </Text>
          <Text size="sm" c="dimmed" lineClamp={2}>
            {[
              row.storeNumber ? `Store ${row.storeNumber}` : '',
              row.clientName,
              row.location,
              row.scheduledDate ? readableDate(row.scheduledDate) : 'No date',
              workerLine(row, names),
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </Stack>
        {action(row)}
      </Group>
      {surface === 'phone' && booking === row.id && canBook && (
        <IncomingJobs
          api={api}
          surface={surface}
          members={members}
          notify={notify}
          focusId={row.id}
          onStarted={(runId) => {
            setBooking(null)
            void load()
            onOpenJob(runId)
          }}
        />
      )}
    </Paper>
  )

  return (
    <Stack gap="sm">
      <Group gap="sm" align="flex-end" grow={surface === 'phone'}>
        <Select<string> size={size} label="Source" data={FIELD_JOB_SOURCE_OPTIONS} value={source} onChange={setSource} style={{ flex: 1, minWidth: 140 }} />
        <Select<string>
          size={size}
          label="Status"
          data={STATUSES}
          value={category}
          onChange={setCategory}
          renderOption={({ option }) => <StatusOption value={option.value} label={option.label} />}
          style={{ flex: 1, minWidth: 140 }}
        />
        <Select<string>
          size={size}
          label="Store"
          data={[{ value: 'all', label: 'All stores' }, ...stores]}
          value={storeNumber}
          onChange={setStoreNumber}
          searchable
          style={{ flex: 1, minWidth: 140 }}
        />
        {canBook && (
          <Select<string>
            size={size}
            label="Worker"
            data={[
              { value: 'all', label: 'Everyone' },
              ...members
                .filter((member) => member.userId)
                .map((member) => ({
                  value: member.userId,
                  label: member.displayName || names[member.userId] || 'Team member',
                })),
            ]}
            value={workerId}
            onChange={setWorkerId}
            searchable
            style={{ flex: 1, minWidth: 140 }}
          />
        )}
      </Group>
      {canExport && (
        <Button size={size} variant="light" leftSection={<IconDownload size={18} />} onClick={() => void download()} style={{ minHeight: 48, alignSelf: 'flex-start' }}>
          Export
        </Button>
      )}
      <TextInput
        size={size}
        leftSection={<IconSearch size={18} />}
        placeholder="Job, store, client or place"
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
      />
      <Group gap="sm" grow>
        <TextInput size={size} type="date" label="From" value={from} onChange={(event) => setFrom(event.currentTarget.value)} />
        <TextInput size={size} type="date" label="To" value={to} onChange={(event) => setTo(event.currentTarget.value)} />
      </Group>
      <SegmentedControl<string>
        fullWidth={surface === 'phone'}
        value={view}
        onChange={setView}
        data={[
          { label: 'List', value: 'list' },
          { label: 'Calendar', value: 'calendar' },
          { label: 'Report', value: 'reports' },
        ]}
      />

      {view === 'list' && (
        <Stack gap="xs">
          <Group gap="sm" align="flex-end" justify="space-between" wrap={surface === 'phone' ? 'wrap' : 'nowrap'}>
            <Select
              size={size}
              label="Sort by"
              allowDeselect={false}
              data={SORTS.map(({ value, label }) => ({ value, label }))}
              value={SORTS.some((entry) => entry.value === sortValue(list.sort)) ? sortValue(list.sort) : null}
              placeholder="Column order"
              onChange={(value) => {
                const picked = SORTS.find((entry) => entry.value === value)
                if (picked) list.setSort(picked.sort)
              }}
              style={{ flex: surface === 'phone' ? 1 : undefined, maxWidth: surface === 'phone' ? undefined : 260 }}
            />
            <SegmentedControl<string>
              size={size}
              aria-label="Show jobs as"
              value={layout}
              onChange={pickLayout}
              data={[
                { label: 'Table', value: 'table' },
                { label: 'Cards', value: 'cards' },
              ]}
            />
          </Group>
          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(row) => `${row.kind}-${row.id}`}
            rowAccent={statusEdge}
            view={layout}
            cardColumns={surface === 'phone' ? undefined : { base: 1, md: 2, xl: 3 }}
            renderCard={card}
            onRowClick={(row) => (row.kind === 'job' ? onOpenJob(row.id) : setViewing(row))}
            rowLabel={(row) => `${row.reference} ${row.description || ''}`.trim()}
            sort={list.sort}
            onSortChange={list.setSort}
            paging={{ offset: list.offset, limit: list.limit, total, onChange: list.setPage }}
            loading={loading || !loaded}
            itemWord="job"
            minWidth={980}
            compact={surface === 'phone'}
            empty={
              <Paper withBorder radius="md" p="lg" ta="center">
                <Text c="dimmed">No jobs match these filters.</Text>
              </Paper>
            }
          />
          {surface !== 'phone' && booking && canBook && (
            <IncomingJobs
              api={api}
              surface={surface}
              members={members}
              notify={notify}
              focusId={booking}
              onStarted={(runId) => {
                setBooking(null)
                void load()
                onOpenJob(runId)
              }}
            />
          )}
        </Stack>
      )}

      {view === 'calendar' && (
        <Stack gap="sm">
          <SegmentedControl
            fullWidth={surface === 'phone'}
            value={span}
            onChange={(value) => setSpan(value as 'day' | 'week')}
            data={[
              { label: 'Day', value: 'day' },
              { label: 'Week', value: 'week' },
            ]}
          />
          <Stack gap="xs">
            <Text fw={500} ta="center">
              {span === 'day' ? readableDate(localDay(focusDay)) : `${readableDate(localDay(days[0]))} – ${readableDate(localDay(days[6]))}`}
            </Text>
            <Group grow={surface === 'phone'} justify="space-between">
              <Button
                size={size}
                variant="default"
                radius="xl"
                leftSection={<IconCalendar size={18} />}
                onClick={() => (span === 'day' ? setFocusDay(addDays(focusDay, -1)) : setWeek(addDays(week, -7)))}
              >
                {span === 'day' ? 'Previous day' : 'Previous week'}
              </Button>
              <Button
                size={size}
                variant="default"
                radius="xl"
                onClick={() => (span === 'day' ? setFocusDay(addDays(focusDay, 1)) : setWeek(addDays(week, 7)))}
              >
                {span === 'day' ? 'Next day' : 'Next week'}
              </Button>
            </Group>
          </Stack>
          <SimpleGrid cols={span === 'day' || surface === 'phone' ? 1 : 7} spacing="xs">
            {shownDays.map((date) => {
              const key = localDay(date)
              const items = byDay.get(key) || []
              return (
                <Paper key={key} withBorder radius="md" p="xs" mih={surface === 'phone' ? undefined : 120}>
                  <Text size="sm" fw={500} mb={4}>
                    {date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
                  </Text>
                  <Stack gap={4}>
                    {items.map((row) => (
                      <Button
                        key={`${row.kind}-${row.id}`}
                        size="compact-sm"
                        variant="light"
                        color={row.source === 'email' ? 'blue' : 'gray'}
                        justify="flex-start"
                        onClick={() => (row.kind === 'job' ? onOpenJob(row.id) : setViewing(row))}
                        style={{ minHeight: 48 }}
                      >
                        <Text size="xs" lineClamp={2} ta="left">
                          {row.reference}
                          {row.assigneeId ? ` · ${names[row.assigneeId] || 'Assigned'}` : ''}
                        </Text>
                      </Button>
                    ))}
                    {items.length === 0 && (
                      <Text size="xs" c="dimmed">
                        Nobody out
                      </Text>
                    )}
                  </Stack>
                </Paper>
              )
            })}
          </SimpleGrid>
          {undated.length > 0 && (
            <Text size="sm" c="dimmed">
              {undated.length} job{undated.length === 1 ? '' : 's'} received in these days {undated.length === 1 ? 'has' : 'have'} no date and {undated.length === 1 ? 'is' : 'are'} not on the calendar. Set a date to place {undated.length === 1 ? 'it' : 'them'}.
            </Text>
          )}
          {booking && canBook && (
            <IncomingJobs
              api={api}
              surface={surface}
              members={members}
              notify={notify}
              focusId={booking}
              onStarted={(runId) => {
                setBooking(null)
                void loadCalendar()
                onOpenJob(runId)
              }}
            />
          )}
        </Stack>
      )}

      {view === 'reports' && report && (
        <Stack gap="sm">
          <SimpleGrid cols={surface === 'phone' ? 2 : 4}>
            {(
              [
                ['Jobs', report.total],
                ['Not booked', report.counts.not_booked],
                ['Unassigned', report.counts.pending],
                ['In progress', report.counts.active + report.counts.assigned],
                ['Arrived', report.counts.arrived],
                ['On hold', report.counts.on_hold],
                ['Needs attention', report.counts.failed],
                ['Completed', report.counts.completed + report.counts.reconciled],
              ] as Array<[string, number]>
            ).map(([label, count]) => (
              <Paper key={label} withBorder radius="md" p="sm">
                <Text size="xs" c="dimmed">
                  {label}
                </Text>
                <Text size="xl" fw={500}>
                  {count}
                </Text>
              </Paper>
            ))}
          </SimpleGrid>
          {report.averageDaysToComplete !== undefined && (
            <Text size="sm">Completed jobs took {report.averageDaysToComplete} days on average from the day they were received.</Text>
          )}
          <Text fw={500}>Where jobs came from</Text>
          {report.bySource.map((entry) => (
            <Text key={entry.source} size="sm">
              {entry.label}: {entry.count}
            </Text>
          ))}
          {report.byStore.length > 0 && (
            <SummaryTable rows={report.byStore} rowKey={(store) => store.storeNumber} name={{ key: 'storeNumber', title: 'Store' }} counts={STORE_COUNTS} itemWord="store" />
          )}
          {report.byWorker.length > 0 && (
            <SummaryTable rows={report.byWorker} rowKey={(worker) => worker.userId} name={{ key: 'name', title: 'Worker' }} counts={WORKER_COUNTS} itemWord="worker" />
          )}
        </Stack>
      )}
      <Drawer
        opened={viewing !== null}
        onClose={() => setViewing(null)}
        position={surface === 'phone' ? 'bottom' : 'right'}
        size={surface === 'phone' ? 'auto' : 'lg'}
        radius={surface === 'phone' ? 'lg' : 0}
        styles={surface === 'phone' ? { content: { borderRadius: '16px 16px 0 0', maxHeight: '92dvh' } } : undefined}
        title={viewing ? `Job ${viewing.reference}` : 'Job'}
      >
        {viewing && (
          <ImportedJobSheet
            row={viewing}
            workerName={viewing.assigneeId ? names[viewing.assigneeId] : viewing.workerName}
            canBook={canBook && viewing.kind === 'intake'}
            onBook={() => {
              setBooking(viewing.id)
              setViewing(null)
            }}
          />
        )}
      </Drawer>
    </Stack>
  )
}

type StoreSummary = JobReport['byStore'][number]
type WorkerSummary = JobReport['byWorker'][number]

const STORE_COUNTS: Array<{ key: keyof StoreSummary & string; title: string }> = [
  { key: 'open', title: 'Open' },
  { key: 'completed', title: 'Completed' },
]
const WORKER_COUNTS: Array<{ key: keyof WorkerSummary & string; title: string }> = [
  { key: 'open', title: 'Open' },
  { key: 'completed', title: 'Completed' },
  { key: 'failed', title: 'Failed visits' },
]

/** A report breakdown (by store, by worker): a name column and counts, sortable, busiest first. */
function SummaryTable<T extends Record<string, string | number>>({
  rows,
  rowKey,
  name,
  counts,
  itemWord,
}: {
  rows: T[]
  rowKey: (row: T) => string
  name: { key: keyof T & string; title: string }
  counts: Array<{ key: keyof T & string; title: string }>
  itemWord: string
}) {
  const list = useListState({ initialSort: { key: counts[0].key, dir: 'desc' } })
  const sorters = useMemo(() => {
    const byKey: Record<string, (row: T) => string | number> = { [name.key]: (row) => String(row[name.key]).toLowerCase() }
    for (const count of counts) byKey[count.key] = (row) => Number(row[count.key])
    return byKey
  }, [name.key, counts])
  const { items, paging } = useClientList(rows, sorters, list)
  const columns: Array<DataColumn<T>> = [
    { key: name.key, title: name.title, sortable: true, render: (row) => String(row[name.key]) },
    ...counts.map((count) => ({
      key: count.key,
      title: count.title,
      sortable: true,
      firstDir: 'desc' as const,
      align: 'right' as const,
      render: (row: T) => Number(row[count.key]).toLocaleString(),
    })),
  ]
  return (
    <DataTable rows={items} columns={columns} rowKey={rowKey} sort={list.sort} onSortChange={list.setSort} paging={paging} itemWord={itemWord} minWidth={360} />
  )
}

/** Everything known about a job that came from the old system or is waiting to be booked. */
function ImportedJobSheet({ row, workerName, canBook, onBook }: { row: JobRegisterRow; workerName?: string; canBook: boolean; onBook: () => void }) {
  const details = row.details || {}
  const facts = [
    ['Description', row.description || ''] as [string, string],
    ['Store', row.storeNumber || ''] as [string, string],
    ['Done by', workerName || ''] as [string, string],
    ...IMPORTED_JOB_DETAIL_LABELS.map(([key, label]): [string, string] => [label, details[key] || '']),
  ].filter(([, value]) => value.trim() !== '')
  const checks = details.checks || []
  return (
    <Stack gap="sm">
      {facts.map(([label, value]) => (
        <div key={label}>
          <Text size="xs" c="dimmed">
            {label}
          </Text>
          <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
            {value}
          </Text>
        </div>
      ))}
      {checks.length > 0 && (
        <Paper withBorder radius="md" p="sm">
          <Text fw={600} size="sm" mb={6}>
            Checks
          </Text>
          <Stack gap={4}>
            {checks.map((check, index) => (
              <Group key={`${check.name}-${index}`} justify="space-between" wrap="nowrap" gap="sm">
                <Text size="sm">{check.name}</Text>
                <Text size="sm" c="dimmed" ta="right">
                  {check.result}
                </Text>
              </Group>
            ))}
          </Stack>
        </Paper>
      )}
      {facts.length === 0 && checks.length === 0 && <Text c="dimmed">Nothing more is known about this job.</Text>}
      {canBook && (
        <Button radius="xl" onClick={onBook} style={{ minHeight: 48 }}>
          Book this job
        </Button>
      )}
    </Stack>
  )
}
