import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Accordion,
  Alert,
  Badge,
  Button,
  Drawer,
  Group,
  Loader,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Tabs,
  TagsInput,
  Text,
  TextInput,
  Textarea,
  UnstyledButton,
} from '@mantine/core'
import { IconBuildingStore, IconPlus, IconSearch, IconTruck } from '@tabler/icons-react'

import { ImportData } from './ImportData'
import { OfficeRates } from './OfficeRates'
import { VanDayCheck } from './VanDayCheck'

import {
  JOB_CATEGORY_WORDS,
  LEAVE_WORDS,
  SERVICE_DAYS,
  jobLine,
  readableDate,
  type AttendantFile,
  type AttendantSummary,
  type BillSummary,
  type JobSummary,
  type LeaveSummary,
  type OperationsApi,
  type PendingIntakeSummary,
  type StoreFile,
  type StoreSummary,
  type VanEvent,
  type VanFile,
  type VanRecord,
} from './operationsApi'

type Surface = 'portal' | 'phone'
type Notify = (message: string, tone: 'success' | 'error' | 'info') => void
type Sheet =
  | { kind: 'store'; storeNumber: string }
  | { kind: 'store-form'; store?: StoreSummary }
  | { kind: 'van'; vanId: string }
  | { kind: 'van-form' }

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Try again.'
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function motTone(motDue?: string): { color: string; label: string } | null {
  if (!motDue) return null
  const days = Math.floor((Date.parse(motDue) - Date.parse(today())) / 86_400_000)
  if (days < 0) return { color: 'red', label: `MOT ran out ${readableDate(motDue)}` }
  if (days <= 30) return { color: 'orange', label: `MOT due ${readableDate(motDue)}` }
  return { color: 'gray', label: `MOT ${readableDate(motDue)}` }
}

/** One row: at least 56dp on the phone, headline, supporting line, trailing status. */
export function Row({ title, detail, trailing, onClick, surface }: { title: ReactNode; detail?: ReactNode; trailing?: ReactNode; onClick?: () => void; surface: Surface }) {
  const body = (
    <Group justify="space-between" wrap="nowrap" gap="sm" style={{ minHeight: surface === 'phone' ? 56 : 44 }}>
      <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
        <Text fw={500} size={surface === 'phone' ? 'md' : 'sm'} truncate>
          {title}
        </Text>
        {detail && (
          <Text size="sm" c="dimmed" lineClamp={2}>
            {detail}
          </Text>
        )}
      </Stack>
      {trailing}
    </Group>
  )
  return (
    <Paper withBorder radius="md" px="md" py="xs">
      {onClick ? (
        <UnstyledButton onClick={onClick} style={{ width: '100%' }}>
          {body}
        </UnstyledButton>
      ) : (
        body
      )}
    </Paper>
  )
}

function JobRows({ jobs, names, onOpenJob, surface }: { jobs: JobSummary[]; names: Record<string, string>; onOpenJob?: (runId: string) => void; surface: Surface }) {
  if (!jobs.length) return <Text size="sm" c="dimmed">None.</Text>
  return (
    <Stack gap="xs">
      {jobs.map((job) => (
        <Row
          key={job.runId}
          surface={surface}
          title={`${job.reference}${job.callOut ? ' · Call-out' : ''}`}
          detail={`${job.description || 'No description'} — ${jobLine(job, names)}`}
          trailing={
            <Badge variant="filled" color={JOB_CATEGORY_WORDS[job.category].color} c="black">
              {JOB_CATEGORY_WORDS[job.category].label}
            </Badge>
          }
          onClick={onOpenJob ? () => onOpenJob(job.runId) : undefined}
        />
      ))}
    </Stack>
  )
}

function BillRows({ bills, surface }: { bills: BillSummary[]; surface: Surface }) {
  if (!bills.length) return <Text size="sm" c="dimmed">None.</Text>
  return (
    <Stack gap="xs">
      {bills.map((bill) => (
        <Row
          key={bill.id}
          surface={surface}
          title={`${bill.reference || bill.description} · ${bill.amount.toFixed(2)} ${bill.currency}`}
          detail={`${bill.description} — ${readableDate(bill.createdAt)}`}
          trailing={
            <Badge variant="light" color={bill.status === 'paid' ? 'teal' : bill.status === 'cancelled' ? 'dark' : 'blue'}>
              {bill.status === 'paid' ? 'Paid' : bill.status === 'cancelled' ? 'Cancelled' : 'Not paid yet'}
            </Badge>
          }
        />
      ))}
    </Stack>
  )
}

function WaitingRows({ items, surface }: { items: PendingIntakeSummary[]; surface: Surface }) {
  if (!items.length) return <Text size="sm" c="dimmed">None.</Text>
  return (
    <Stack gap="xs">
      {items.map((item) => (
        <Row
          key={item.id}
          surface={surface}
          title={item.reference}
          detail={`${item.description} — ${item.source === 'email' ? 'from email' : 'added by hand'}, ${readableDate(item.createdAt)}`}
          trailing={item.duplicateOf ? <Badge variant="light" color="red">Possible repeat</Badge> : undefined}
        />
      ))}
    </Stack>
  )
}

function LeaveRows({ items, surface }: { items: LeaveSummary[]; surface: Surface }) {
  if (!items.length) return <Text size="sm" c="dimmed">None.</Text>
  return (
    <Stack gap="xs">
      {items.map((item) => (
        <Row
          key={item.requestId}
          surface={surface}
          title={LEAVE_WORDS[item.leaveType] || 'Leave'}
          detail={`${readableDate(item.startDate)} to ${readableDate(item.endDate)}`}
          trailing={<Badge variant="light" color={/approved|completed/i.test(item.status) ? 'teal' : 'gray'}>{/approved|completed/i.test(item.status) ? 'Approved' : 'Asked'}</Badge>}
        />
      ))}
    </Stack>
  )
}

function EventRows({ events, surface, showVan }: { events: VanEvent[]; surface: Surface; showVan?: boolean }) {
  if (!events.length) return <Text size="sm" c="dimmed">None.</Text>
  return (
    <Stack gap="xs">
      {events.map((event) => (
        <Row
          key={event.id}
          surface={surface}
          title={`${readableDate(event.eventDate)}${showVan && event.registration ? ` · ${event.registration}` : ''}${event.userName ? ` · ${event.userName}` : ''}`}
          detail={[event.outcome === 'defect' ? 'Defect' : event.outcome === 'ok' ? 'All ok' : '', event.notes].filter(Boolean).join(' · ') || undefined}
        />
      ))}
    </Stack>
  )
}

function Section({ value, label, count, children }: { value: string; label: string; count: number; children: ReactNode }) {
  return (
    <Accordion.Item value={value}>
      <Accordion.Control>
        <Group justify="space-between" pr="sm">
          <Text fw={500}>{label}</Text>
          <Badge variant="light" color={count ? 'blue' : 'gray'}>
            {count}
          </Badge>
        </Group>
      </Accordion.Control>
      <Accordion.Panel>{children}</Accordion.Panel>
    </Accordion.Item>
  )
}

/**
 * Stores and vans, each with its file. People stay on the payroll employee. Phone: list items and bottom sheets.
 * Portal: the same lists with a side panel.
 */
export function OperationsRegisters({
  api,
  surface,
  canEdit,
  notify,
  onOpenJob,
  initialTab = 'stores',
  initialStore,
}: {
  api: OperationsApi | null
  surface: Surface
  canEdit: boolean
  notify: Notify
  onOpenJob?: (runId: string) => void
  initialTab?: 'stores' | 'vans'
  /** Opens that store's file straight away (links from a job). */
  initialStore?: string
}) {
  const [tab, setTab] = useState<string>(initialTab)
  const [stores, setStores] = useState<StoreSummary[]>([])
  const [attendants, setAttendants] = useState<AttendantSummary[]>([])
  const [vans, setVans] = useState<VanRecord[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [sheet, setSheet] = useState<Sheet | null>(initialStore ? { kind: 'store', storeNumber: initialStore } : null)
  const size = surface === 'phone' ? 'md' : 'sm'

  const names = useMemo(() => Object.fromEntries(attendants.map((person) => [person.userId, person.name])), [attendants])
  const people = useMemo(() => attendants.map((person) => ({ value: person.userId, label: person.staffNumber ? `${person.name} (${person.staffNumber})` : person.name })), [attendants])

  const load = useCallback(async () => {
    if (!api) return
    setLoading(true)
    try {
      const [storeRows, attendantRows, vanRows] = await Promise.all([api.stores(), api.attendants(), api.vans()])
      setStores(storeRows)
      setAttendants(attendantRows)
      setVans(vanRows)
      setLoaded(true)
    } catch (error) {
      notify(message(error), 'error')
    } finally {
      setLoading(false)
    }
  }, [api, notify])

  useEffect(() => {
    void load()
  }, [load])

  const needle = search.trim().toLowerCase()
  const match = (...values: Array<string | undefined>) => !needle || values.some((value) => value?.toLowerCase().includes(needle))

  const closeSheet = (changed?: boolean) => {
    setSheet(null)
    if (changed) void load()
  }

  return (
    <Stack gap="md">
      <Tabs value={tab} onChange={(value) => setTab(value || 'stores')}>
        <Tabs.List grow={surface === 'phone'}>
          <Tabs.Tab value="stores" leftSection={<IconBuildingStore size={18} />}>
            Stores
          </Tabs.Tab>
          <Tabs.Tab value="vans" leftSection={<IconTruck size={18} />}>
            Vans
          </Tabs.Tab>
          <Tabs.Tab value="rates">Rates</Tabs.Tab>
          {canEdit && <Tabs.Tab value="import">Import</Tabs.Tab>}
        </Tabs.List>
      </Tabs>
      {(tab === 'stores' || tab === 'vans') && <Group gap="sm" wrap="nowrap">
        <TextInput
          size={size}
          style={{ flex: 1 }}
          leftSection={<IconSearch size={18} />}
          placeholder={tab === 'stores' ? 'Store number or name' : 'Registration or driver'}
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
        />
        {canEdit && (
          <Button size={size} radius="xl" leftSection={<IconPlus size={18} />} onClick={() => setSheet(tab === 'stores' ? { kind: 'store-form' } : { kind: 'van-form' })}>
            {tab === 'stores' ? 'Add store' : 'Add van'}
          </Button>
        )}
      </Group>}
      {tab === 'rates' && <OfficeRates api={api} surface={surface} canEdit={canEdit} notify={notify} />}
      {tab === 'import' && canEdit && <ImportData api={api} surface={surface} notify={notify} onDone={() => void load()} />}
      {loading && <Loader size="sm" />}

      {tab === 'stores' && (
        <Stack gap="xs">
          {stores
            .filter((store) => match(store.storeNumber, store.name))
            .map((store) => (
              <Row
                key={store.storeNumber}
                surface={surface}
                title={`${store.storeNumber} · ${store.name}`}
                detail={`${store.totalJobs} job${store.totalJobs === 1 ? '' : 's'}${store.phone ? ` · ${store.phone}` : ''}`}
                trailing={store.openJobs ? <Badge variant="light" color="orange">{store.openJobs} open</Badge> : <Badge variant="light" color="gray">No open jobs</Badge>}
                onClick={() => setSheet({ kind: 'store', storeNumber: store.storeNumber })}
              />
            ))}
          {loaded && !loading && stores.length === 0 && <Text c="dimmed">No stores yet. Add a store, or give a job a store number.</Text>}
        </Stack>
      )}

      {tab === 'vans' && (
        <Stack gap="xs">
          {vans
            .filter((van) => match(van.registration, van.driverName, van.description))
            .map((van) => {
              const mot = motTone(van.motDue)
              return (
                <Row
                  key={van.id}
                  surface={surface}
                  title={`${van.registration}${van.description ? ` · ${van.description}` : ''}`}
                  detail={[van.driverName ? `Driver: ${van.driverName}` : 'No driver', van.serviceDay ? `service on ${van.serviceDay}s` : ''].filter(Boolean).join(' · ')}
                  trailing={
                    van.status !== 'active' ? (
                      <Badge variant="light" color="red">{van.status === 'off_road' ? 'Off the road' : 'Retired'}</Badge>
                    ) : mot ? (
                      <Badge variant="light" color={mot.color}>{mot.label}</Badge>
                    ) : undefined
                  }
                  onClick={() => setSheet({ kind: 'van', vanId: van.id })}
                />
              )
            })}
          {loaded && !loading && vans.length === 0 && <Text c="dimmed">No vans on the register yet.</Text>}
        </Stack>
      )}

      <Drawer
        opened={sheet !== null}
        onClose={() => closeSheet()}
        position={surface === 'phone' ? 'bottom' : 'right'}
        size={surface === 'phone' ? 'auto' : 'lg'}
        radius={surface === 'phone' ? 'lg' : 0}
        styles={surface === 'phone' ? { content: { borderRadius: '16px 16px 0 0', maxHeight: '92dvh' } } : undefined}
        title={
          sheet?.kind === 'store'
            ? `Store ${sheet.storeNumber}`
            : sheet?.kind === 'store-form'
              ? sheet.store
                ? 'Edit store'
                : 'Add a store'
              : sheet?.kind === 'van'
                  ? vans.find((van) => van.id === sheet.vanId)?.registration || 'Van'
                  : 'Add a van'
        }
      >
        {surface === 'phone' && <div className="sheet-handle" aria-hidden />}
        {sheet?.kind === 'store' && (
          <StoreFileView api={api} storeNumber={sheet.storeNumber} names={names} surface={surface} canEdit={canEdit} notify={notify} onOpenJob={onOpenJob} onEdit={(store) => setSheet({ kind: 'store-form', store })} />
        )}
        {sheet?.kind === 'store-form' && <StoreForm api={api} store={sheet.store} surface={surface} notify={notify} onDone={closeSheet} />}
        {sheet?.kind === 'van' && (
          <VanFileView api={api} vanId={sheet.vanId} names={names} people={people} surface={surface} canEdit={canEdit} notify={notify} onOpenJob={onOpenJob} onSaved={() => void load()} />
        )}
        {sheet?.kind === 'van-form' && <VanForm api={api} people={people} surface={surface} notify={notify} onDone={closeSheet} />}
      </Drawer>
    </Stack>
  )
}

function StoreFileView({
  api,
  storeNumber,
  names,
  surface,
  canEdit,
  notify,
  onOpenJob,
  onEdit,
}: {
  api: OperationsApi | null
  storeNumber: string
  names: Record<string, string>
  surface: Surface
  canEdit: boolean
  notify: Notify
  onOpenJob?: (runId: string) => void
  onEdit: (store: StoreSummary) => void
}) {
  const [file, setFile] = useState<StoreFile | null>(null)
  useEffect(() => {
    api?.storeFile(storeNumber).then(setFile).catch((error) => notify(message(error), 'error'))
  }, [api, storeNumber, notify])
  if (!file) return <Loader size="sm" />
  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Stack gap={0}>
          <Text fw={500} size="lg">
            {file.store.name}
          </Text>
          <Text size="sm" c="dimmed">
            {[file.store.phone, file.store.email].filter(Boolean).join(' · ') || 'No contact details yet'}
          </Text>
        </Stack>
        {canEdit && (
          <Button size={surface === 'phone' ? 'md' : 'sm'} variant="light" radius="xl" onClick={() => onEdit(file.store)}>
            {file.store.contactId ? 'Edit' : 'Save as contact'}
          </Button>
        )}
      </Group>
      <Accordion multiple defaultValue={['outstanding']} variant="separated">
        <Section value="outstanding" label="Outstanding jobs" count={file.outstanding.length}>
          <JobRows jobs={file.outstanding} names={names} onOpenJob={onOpenJob} surface={surface} />
        </Section>
        <Section value="jobCards" label="Job cards" count={file.jobCards.length}>
          <JobRows jobs={file.jobCards} names={names} onOpenJob={onOpenJob} surface={surface} />
        </Section>
        <Section value="callOuts" label="Call-outs" count={file.callOuts.length}>
          <JobRows jobs={file.callOuts} names={names} onOpenJob={onOpenJob} surface={surface} />
        </Section>
        <Section value="quotes" label="Quotes" count={file.quotes.length}>
          <BillRows bills={file.quotes} surface={surface} />
        </Section>
        <Section value="invoices" label="Invoices" count={file.invoices.length}>
          <BillRows bills={file.invoices} surface={surface} />
        </Section>
        <Section value="cancelled" label="Cancelled jobs" count={file.cancelled.length}>
          <JobRows jobs={file.cancelled} names={names} onOpenJob={onOpenJob} surface={surface} />
        </Section>
        <Section value="waiting" label="Waiting to be booked" count={file.waitingToBook.length}>
          <WaitingRows items={file.waitingToBook} surface={surface} />
        </Section>
      </Accordion>
    </Stack>
  )
}

function StoreForm({ api, store, surface, notify, onDone }: { api: OperationsApi | null; store?: StoreSummary; surface: Surface; notify: Notify; onDone: (changed?: boolean) => void }) {
  const [form, setForm] = useState({ name: store?.contactId ? store.name : '', storeNumber: store?.storeNumber || '', phone: store?.phone || '', email: store?.email || '' })
  const [saving, setSaving] = useState(false)
  const size = surface === 'phone' ? 'md' : 'sm'
  const save = async () => {
    if (!api || !form.name.trim() || !form.storeNumber.trim()) {
      notify('Add the store name and store number.', 'info')
      return
    }
    setSaving(true)
    try {
      await api.saveStore({ contactId: store?.contactId, ...form })
      notify('Store saved', 'success')
      onDone(true)
    } catch (error) {
      notify(message(error), 'error')
    } finally {
      setSaving(false)
    }
  }
  return (
    <Stack gap="sm">
      <TextInput size={size} label="Store number" required value={form.storeNumber} onChange={(event) => setForm({ ...form, storeNumber: event.currentTarget.value })} />
      <TextInput size={size} label="Store name" placeholder="e.g. Spar Borrowdale" required value={form.name} onChange={(event) => setForm({ ...form, name: event.currentTarget.value })} />
      <TextInput size={size} label="Phone" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.currentTarget.value })} />
      <TextInput
        size={size}
        label="Email"
        description="Job emails from this address are filed under this store."
        value={form.email}
        onChange={(event) => setForm({ ...form, email: event.currentTarget.value })}
      />
      <Group justify="flex-end">
        <Button size={size} variant="default" radius="xl" onClick={() => onDone()}>
          Cancel
        </Button>
        <Button size={size} radius="xl" loading={saving} onClick={() => void save()}>
          Save store
        </Button>
      </Group>
    </Stack>
  )
}

/** Jobs, leave, van and accidents for one payroll employee, opened from Payroll → Employees. */
export function MemberWorkFile(props: {
  api: OperationsApi | null
  userId: string
  names: Record<string, string>
  surface: Surface
  canEdit: boolean
  notify: Notify
  onOpenJob?: (runId: string) => void
  onSaved?: () => void
}) {
  return <AttendantFileView {...props} onSaved={props.onSaved || (() => undefined)} />
}

function AttendantFileView({
  api,
  userId,
  names,
  surface,
  canEdit,
  notify,
  onOpenJob,
  onSaved,
}: {
  api: OperationsApi | null
  userId: string
  names: Record<string, string>
  surface: Surface
  canEdit: boolean
  notify: Notify
  onOpenJob?: (runId: string) => void
  onSaved: () => void
}) {
  const [file, setFile] = useState<AttendantFile | null>(null)
  const [staffNumber, setStaffNumber] = useState('')
  const [skills, setSkills] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const size = surface === 'phone' ? 'md' : 'sm'
  useEffect(() => {
    api
      ?.attendantFile(userId)
      .then((data) => {
        setFile(data)
        setStaffNumber(data.attendant.staffNumber || '')
        setSkills(data.attendant.skills)
      })
      .catch((error) => notify(message(error), 'error'))
  }, [api, userId, notify])
  if (!file) return <Loader size="sm" />
  const save = async () => {
    if (!api) return
    setSaving(true)
    try {
      await api.saveAttendant(userId, { staffNumber, skills })
      notify('Staff details saved', 'success')
      onSaved()
    } catch (error) {
      notify(message(error), 'error')
    } finally {
      setSaving(false)
    }
  }
  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {[file.attendant.role.replace(/_/g, ' '), file.attendant.phone].filter(Boolean).join(' · ')}
      </Text>
      {canEdit ? (
        <Paper withBorder radius="md" p="md">
          <Stack gap="sm">
            <TextInput size={size} label="Staff number" placeholder="e.g. SGK-014" value={staffNumber} onChange={(event) => setStaffNumber(event.currentTarget.value)} />
            <TagsInput size={size} label="Skills" placeholder="Type a skill and press Enter" data={['Plumbing', 'Electrical', 'Painting', 'HVAC', 'Carpentry', 'Roofing', 'Tiling', 'Welding']} value={skills} onChange={setSkills} />
            <Group justify="flex-end">
              <Button size={size} radius="xl" loading={saving} onClick={() => void save()}>
                Save
              </Button>
            </Group>
          </Stack>
        </Paper>
      ) : (
        <Text>
          Staff number {file.attendant.staffNumber || 'not set'} · {file.attendant.skills.join(', ') || 'no skills listed'}
        </Text>
      )}
      <Row surface={surface} title="Van" detail={file.attendant.van ? `Drives ${file.attendant.van.registration}` : 'No van allocated'} />
      <Accordion multiple defaultValue={['jobCards']} variant="separated">
        <Section value="jobCards" label="Job cards" count={file.jobCards.length}>
          <JobRows jobs={file.jobCards} names={names} onOpenJob={onOpenJob} surface={surface} />
        </Section>
        <Section value="failed" label="Failed jobs" count={file.failed.length}>
          <JobRows jobs={file.failed} names={names} onOpenJob={onOpenJob} surface={surface} />
        </Section>
        <Section value="completed" label="Completed" count={file.completed.length}>
          <JobRows jobs={file.completed} names={names} onOpenJob={onOpenJob} surface={surface} />
        </Section>
        <Section value="holidays" label="Holidays" count={file.holidays.length}>
          <LeaveRows items={file.holidays} surface={surface} />
        </Section>
        <Section value="offSick" label="Off sick" count={file.offSick.length}>
          <LeaveRows items={file.offSick} surface={surface} />
        </Section>
        <Section value="accidents" label="Accidents" count={file.accidents.length}>
          <EventRows events={file.accidents} surface={surface} showVan />
        </Section>
      </Accordion>
      <Text size="xs" c="dimmed">
        Holidays and sick days come from leave asked for under Staff requests.
      </Text>
    </Stack>
  )
}

function VanForm({ api, people, surface, notify, onDone, van }: { api: OperationsApi | null; people: Array<{ value: string; label: string }>; surface: Surface; notify: Notify; onDone: (changed?: boolean) => void; van?: VanRecord }) {
  const [form, setForm] = useState({
    registration: van?.registration || '',
    description: van?.description || '',
    serviceDay: van?.serviceDay || '',
    motDue: van?.motDue || '',
    driverUserId: van?.driverUserId || '',
    status: van?.status || 'active',
  })
  const [saving, setSaving] = useState(false)
  const size = surface === 'phone' ? 'md' : 'sm'
  const save = async () => {
    if (!api || !form.registration.trim()) {
      notify('Add the registration.', 'info')
      return
    }
    setSaving(true)
    try {
      await api.saveVan({
        id: van?.id,
        registration: form.registration,
        description: form.description,
        serviceDay: form.serviceDay,
        motDue: form.motDue,
        driverUserId: form.driverUserId || undefined,
        status: form.status as VanRecord['status'],
      })
      notify('Van saved', 'success')
      onDone(true)
    } catch (error) {
      notify(message(error), 'error')
    } finally {
      setSaving(false)
    }
  }
  return (
    <Stack gap="sm">
      <TextInput size={size} label="Registration" required value={form.registration} onChange={(event) => setForm({ ...form, registration: event.currentTarget.value })} />
      <TextInput size={size} label="Make and model" placeholder="e.g. Toyota Hiace" value={form.description} onChange={(event) => setForm({ ...form, description: event.currentTarget.value })} />
      <Group grow>
        <Select size={size} label="Service day" clearable data={SERVICE_DAYS} value={form.serviceDay || null} onChange={(value) => setForm({ ...form, serviceDay: value || '' })} />
        <TextInput size={size} type="date" label="MOT due" value={form.motDue} onChange={(event) => setForm({ ...form, motDue: event.currentTarget.value })} />
      </Group>
      <Select size={size} label="Driver" description="One van per driver: giving this van to someone frees the van they had." clearable searchable data={people} value={form.driverUserId || null} onChange={(value) => setForm({ ...form, driverUserId: value || '' })} />
      {van && (
        <SegmentedControl
          fullWidth
          size={size}
          value={form.status}
          onChange={(value) => setForm({ ...form, status: value as VanRecord['status'] })}
          data={[
            { value: 'active', label: 'On the road' },
            { value: 'off_road', label: 'Off the road' },
            { value: 'retired', label: 'Retired' },
          ]}
        />
      )}
      <Group justify="flex-end">
        <Button size={size} variant="default" radius="xl" onClick={() => onDone()}>
          Cancel
        </Button>
        <Button size={size} radius="xl" loading={saving} onClick={() => void save()}>
          Save van
        </Button>
      </Group>
    </Stack>
  )
}

function VanFileView({
  api,
  vanId,
  names,
  people,
  surface,
  canEdit,
  notify,
  onOpenJob,
  onSaved,
}: {
  api: OperationsApi | null
  vanId: string
  names: Record<string, string>
  people: Array<{ value: string; label: string }>
  surface: Surface
  canEdit: boolean
  notify: Notify
  onOpenJob?: (runId: string) => void
  onSaved: () => void
}) {
  const [file, setFile] = useState<VanFile | null>(null)
  const [editing, setEditing] = useState(false)
  const [record, setRecord] = useState({ kind: 'service' as 'service' | 'mot' | 'accident', eventDate: today(), notes: '', nextDue: '', userId: '' })
  const [saving, setSaving] = useState(false)
  const size = surface === 'phone' ? 'md' : 'sm'
  const load = useCallback(() => {
    api?.vanFile(vanId).then(setFile).catch((error) => notify(message(error), 'error'))
  }, [api, vanId, notify])
  useEffect(load, [load])
  if (!file) return <Loader size="sm" />
  if (editing) {
    return (
      <VanForm
        api={api}
        van={file.van}
        people={people}
        surface={surface}
        notify={notify}
        onDone={(changed) => {
          setEditing(false)
          if (changed) {
            load()
            onSaved()
          }
        }}
      />
    )
  }
  const mot = motTone(file.van.motDue)
  const addRecord = async () => {
    if (!api) return
    setSaving(true)
    try {
      await api.addVanEvent(vanId, {
        kind: record.kind,
        eventDate: record.eventDate,
        notes: record.notes || undefined,
        ...(record.kind === 'mot' && record.nextDue ? { nextDue: record.nextDue } : {}),
        ...(record.kind === 'accident' && record.userId ? { userId: record.userId } : {}),
      })
      notify('Saved to the van file', 'success')
      setRecord({ ...record, notes: '', nextDue: '' })
      load()
      onSaved()
    } catch (error) {
      notify(message(error), 'error')
    } finally {
      setSaving(false)
    }
  }
  return (
    <Stack gap="sm">
      <Group justify="space-between" align="flex-start">
        <Stack gap={2}>
          <Text fw={500} size="lg">
            {file.van.description || file.van.registration}
          </Text>
          <Text size="sm" c="dimmed">
            {file.van.driverName ? `Driver: ${file.van.driverName}` : 'No driver'} · {file.van.serviceDay ? `Service day: ${file.van.serviceDay}` : 'No service day'}
          </Text>
          {mot && (
            <Badge variant="light" color={mot.color} w="fit-content">
              {mot.label}
            </Badge>
          )}
        </Stack>
        {canEdit && (
          <Button size={size} variant="light" radius="xl" onClick={() => setEditing(true)}>
            Edit
          </Button>
        )}
      </Group>
      {canEdit && (
        <Paper withBorder radius="md" p="md">
          <Stack gap="sm">
            <SegmentedControl
              fullWidth
              size={size}
              value={record.kind}
              onChange={(value) => setRecord({ ...record, kind: value as typeof record.kind })}
              data={[
                { value: 'service', label: 'Service' },
                { value: 'mot', label: 'MOT' },
                { value: 'accident', label: 'Accident' },
              ]}
            />
            <TextInput size={size} type="date" label="Date" value={record.eventDate} onChange={(event) => setRecord({ ...record, eventDate: event.currentTarget.value })} />
            {record.kind === 'mot' && (
              <TextInput size={size} type="date" label="Next MOT due" value={record.nextDue} onChange={(event) => setRecord({ ...record, nextDue: event.currentTarget.value })} />
            )}
            {record.kind === 'accident' && (
              <Select size={size} label="Who was driving" placeholder={file.van.driverName || 'Choose'} clearable searchable data={people} value={record.userId || null} onChange={(value) => setRecord({ ...record, userId: value || '' })} />
            )}
            <Textarea
              size={size}
              label={record.kind === 'accident' ? 'What happened' : 'Notes'}
              required={record.kind === 'accident'}
              minRows={2}
              value={record.notes}
              onChange={(event) => setRecord({ ...record, notes: event.currentTarget.value })}
            />
            <Group justify="flex-end">
              <Button size={size} radius="xl" loading={saving} onClick={() => void addRecord()}>
                {record.kind === 'service' ? 'Record service' : record.kind === 'mot' ? 'Record MOT' : 'Record accident'}
              </Button>
            </Group>
          </Stack>
        </Paper>
      )}
      {file.van.status !== 'active' && (
        <Alert color="red" variant="light">
          {file.van.status === 'off_road' ? 'This van is off the road and cannot be given a job.' : 'This van is retired.'}
        </Alert>
      )}
      <Accordion multiple defaultValue={['drivers']} variant="separated">
        <Section value="drivers" label="Drivers" count={file.drivers.length}>
          <EventRows events={file.drivers} surface={surface} />
        </Section>
        <Section value="services" label="Services" count={file.services.length}>
          <EventRows events={file.services} surface={surface} />
        </Section>
        <Section value="mots" label="MOTs" count={file.mots.length}>
          <EventRows events={file.mots} surface={surface} />
        </Section>
        <Section value="accidents" label="Accidents" count={file.accidents.length}>
          <EventRows events={file.accidents} surface={surface} />
        </Section>
        <Section value="checks" label="Daily checks" count={file.dailyChecks?.length || 0}>
          <EventRows events={file.dailyChecks || []} surface={surface} />
        </Section>
        <Section value="jobs" label="Jobs" count={file.jobs.length}>
          <JobRows jobs={file.jobs} names={names} onOpenJob={onOpenJob} surface={surface} />
        </Section>
      </Accordion>
      <Paper withBorder radius="md" p="md">
        <VanDayCheck api={api} vanId={vanId} surface={surface} notify={notify} onSaved={load} />
      </Paper>
    </Stack>
  )
}
