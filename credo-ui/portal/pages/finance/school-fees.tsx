import React, { useCallback, useEffect, useMemo, useState } from 'react'
import FormCard from '@/components/shared/FormCard'
import { ContactPickerSelect, type PickerContact } from '@/components/finance/ContactPickerSelect'
import axios from 'axios'
import Layout from '@/components/Layout'
import { formatTxnTime } from '@/lib/inboxAttention'
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Center,
  Container,
  CopyButton,
  Divider,
  Drawer,
  Group,
  Loader,
  Modal,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  Tooltip,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconAlertCircle,
  IconCheck,
  IconClock,
  IconCopy,
  IconExternalLink,
  IconFileInvoice,
  IconPlus,
  IconQrcode,
  IconReceipt,
  IconRefresh,
  IconSchool,
  IconSearch,
  IconSend,
} from '@tabler/icons-react'
import QRCode from 'react-qr-code'
import {
  getOrgScopedToken,
  getPersonalToken,
  readActiveOrganization,
} from '@/utils/organizationContext'
import {
  actorsForWorkflow,
  isSchoolFeeRun,
  requestStatusWords,
  schoolFeeProgress,
  schoolFeeStatusWords,
  schoolFeeTitle,
  SCHOOL_FEE_HELP,
  schoolFeeRelated,
  schoolFeeStages,
  schoolFeeWhoDid,
  type StagePerson,
  type WorkflowActorReport,
} from '@/components/finance/financeStages'
import { StageActorTimeline } from '@/components/finance/StageActorTimeline'
import { trailFromSchoolFee } from '@/components/finance/jobAuditTrail'
import JobAuditTrailPanel from '@/components/workflows/JobAuditTrailPanel'
import { useJobBillingNavigation } from '@/components/workflows/JobHandoffsPanel'

import { useRequireOrgContext } from '@/lib/portalContext'

/* ─── Types ─────────────────────────────────────────────────────────── */

interface SchoolFeeRun {
  id: string
  workflowId?: string
  status: string
  input?: Record<string, any>
  output?: Record<string, any>
  actionsSnapshot?: any
  createdAt?: string
}

/** Fee entries saved as requests before school fees ran as their own steps. Shown read-only. */
interface EarlierFeeEntry {
  id: string
  title: string
  amount?: number
  currency?: string
  status: string
  createdAt?: string
}

/* ─── Helpers ─────────────────────────────────────────────────────────*/

const fmt = (n: number, c = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: c }).format(n)

function payLinkOf(run: SchoolFeeRun): string | undefined {
  const url = run.output?.clientBill?.url
  return typeof url === 'string' && url ? url : undefined
}

function amountOf(run: SchoolFeeRun): number {
  return Number(run.input?.amount || run.output?.finance?.grandTotal || 0)
}

function currencyOf(run: SchoolFeeRun): string {
  return String(run.input?.currency || run.output?.clientBill?.currency || 'USD')
}

function instalmentsOf(run: SchoolFeeRun): number {
  return Number(run.output?.clientBill?.instalments || 1)
}

/* ─── Detail Drawer ──────────────────────────────────────────────────*/

function SchoolFeeDetail({
  run,
  onClose,
  onShowQr,
  actors,
  people,
}: {
  run: SchoolFeeRun
  onClose: () => void
  onShowQr: (url: string, title: string, amount: number, currency: string) => void
  actors?: WorkflowActorReport[]
  people?: StagePerson[]
}) {
  const openBilling = useJobBillingNavigation()
  const related = schoolFeeRelated(run)
  const input = run.input || {}
  const steps = schoolFeeProgress(run)
  const doneCount = steps.filter((s) => s.status === 'done').length
  const status = schoolFeeStatusWords(run)
  const link = payLinkOf(run)
  const feeActors = actorsForWorkflow(actors, ['education', 'school', 'fee', 'collect'])
  const details: Array<[string, unknown]> = [
    ['Student', input.studentName],
    ['Student ID', input.studentId],
    ['Class', input.grade],
    ['Term', input.term],
    ['Fee type', input.feeType],
    ['Parent / guardian', input.payerName],
    ['Parent phone', input.payerPhone],
  ]

  return (
    <Stack gap="md">
      <Group gap="xs" wrap="wrap">
        <Badge color={status.color}>{status.label}</Badge>
        {instalmentsOf(run) > 1 && <Badge variant="light">{instalmentsOf(run)} instalments</Badge>}
      </Group>

      <Paper withBorder radius="md" p="sm">
        <Text fw={600} size="sm" mb="xs">Fee details</Text>
        <SimpleGrid cols={2} spacing="xs">
          {details.filter(([, value]) => Boolean(value)).map(([label, value]) => (
            <React.Fragment key={label}>
              <Text size="xs" c="dimmed">{label}</Text>
              <Text size="xs" fw={500}>{String(value)}</Text>
            </React.Fragment>
          ))}
          <Text size="xs" c="dimmed">Amount</Text>
          <Text size="xs" fw={600} c="teal">{fmt(amountOf(run), currencyOf(run))}</Text>
        </SimpleGrid>
      </Paper>

      <Paper withBorder radius="md" p="sm">
        <StageActorTimeline
          stages={schoolFeeStages(run)}
          actors={feeActors}
          people={people}
          whoDid={schoolFeeWhoDid(run)}
          title={`Progress (${doneCount} of ${steps.length} steps done)`}
          help={SCHOOL_FEE_HELP}
        />
      </Paper>

      {related.length > 0 && (
        <Paper withBorder radius="md" p="sm">
          <Text fw={600} size="sm" mb={4}>Related work</Text>
          <Group gap="xs" wrap="wrap">
            {related.map((item) => (
              <Button key={item.id} size="xs" variant="light" onClick={() => openBilling(run.id, item.kind === 'pay_link' ? item.id : undefined)}>
                Open {item.label.toLowerCase()} in Money in
              </Button>
            ))}
          </Group>
        </Paper>
      )}

      <JobAuditTrailPanel trail={trailFromSchoolFee(run, steps)} compact embedded />

      {link && (
        <Group grow>
          <CopyButton value={link}>
            {({ copied, copy }) => (
              <Button variant="light" leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />} onClick={copy}>
                {copied ? 'Copied' : 'Copy pay link'}
              </Button>
            )}
          </CopyButton>
          <Button
            variant="light"
            leftSection={<IconQrcode size={14} />}
            onClick={() => onShowQr(link, schoolFeeTitle(run), amountOf(run), currencyOf(run))}
          >
            Show QR
          </Button>
        </Group>
      )}
      <Button variant="default" onClick={onClose}>Close</Button>
    </Stack>
  )
}

/* ─── New Fee Modal ──────────────────────────────────────────────────*/

interface CreateFeeForm {
  studentName: string
  studentId: string
  grade: string
  term: string
  feeType: string
  amount: number | string
  currency: string
  payerName: string
  payerPhone: string
  paymentTerms: string
  instalments: number | string
  paymentCadence: string
  firstDueDate: string
  firstPaymentAmount: number | string
}

const BLANK_FORM: CreateFeeForm = {
  studentName: '',
  studentId: '',
  grade: '',
  term: 'Term 3 2026',
  feeType: 'Tuition',
  amount: '',
  currency: 'USD',
  payerName: '',
  payerPhone: '',
  paymentTerms: 'one_time',
  instalments: 3,
  paymentCadence: 'monthly',
  firstDueDate: new Date().toISOString().slice(0, 10),
  firstPaymentAmount: '',
}

function CreateFeeModal({
  opened,
  onClose,
  onCreated,
  backendUrl,
  contacts,
}: {
  opened: boolean
  onClose: () => void
  onCreated: (run: SchoolFeeRun | null) => void
  backendUrl: string
  contacts: PickerContact[]
}) {
  const [form, setForm] = useState<CreateFeeForm>(BLANK_FORM)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const set = <K extends keyof CreateFeeForm>(key: K) => (val: CreateFeeForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: val }))

  const handleCreate = async () => {
    const amount = Number(form.amount)
    if (!form.studentName.trim() || !form.studentId.trim() || !Number.isFinite(amount) || amount <= 0) {
      setErr('Student name, student ID and amount are required.')
      return
    }
    if (!form.payerPhone.trim()) {
      setErr('Add the parent or guardian phone. The pay link goes to this number.')
      return
    }
    const token = getOrgScopedToken()
    if (!token) { setErr('Switch to the organization first.'); return }
    setLoading(true)
    setErr(null)
    try {
      const reference = `FEE-${form.studentId.trim().replace(/\s+/g, '').toUpperCase()}-${Date.now().toString().slice(-5)}`
      const body: Record<string, unknown> = {
        studentName: form.studentName.trim(),
        studentId: form.studentId.trim(),
        grade: form.grade,
        term: form.term,
        feeType: form.feeType,
        amount,
        currency: form.currency,
        payerName: form.payerName.trim() || undefined,
        payerPhone: form.payerPhone.trim(),
        reference,
        paymentTerms: form.paymentTerms,
        triggerRef: `portal-fee-${Date.now()}`,
        ...(form.paymentTerms !== 'one_time'
          ? {
              instalments: Number(form.instalments) || 2,
              paymentCadence: form.paymentCadence,
              firstDueDate: form.firstDueDate,
              ...(Number(form.firstPaymentAmount) > 0 ? { firstPaymentAmount: Number(form.firstPaymentAmount) } : {}),
            }
          : {}),
      }
      const res = await axios.post(`${backendUrl}/workflows/education_fee_payment/execute`, body, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.data?.error) throw new Error(String(res.data.error))
      const bill = res.data?.output?.clientBill
      notifications.show({
        title: bill?.status === 'sent' ? 'Pay link sent to parent' : 'Fee saved',
        message: `${form.studentName} — ${fmt(amount, form.currency)}`,
        color: 'green',
        icon: <IconCheck size={16} />,
      })
      setForm(BLANK_FORM)
      onClose()
      onCreated(res.data?.runId ? { id: String(res.data.runId), status: String(res.data.status || ''), input: body, output: res.data.output } : null)
    } catch (e: any) {
      setErr(e?.response?.data?.error || e?.response?.data?.message || e?.message || 'The fee was not saved')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      withCloseButton={false}
      centered
      padding={0}
      radius="lg"
      size="lg"
    >
      <FormCard
        title="New school fee"
        subtitle="The parent gets a pay link by text."
        issuer={readActiveOrganization()?.name}
        icon={<IconSchool size={24} />}
      >
        <Divider label="Student" labelPosition="left" />
        <Group grow>
          <TextInput label="Student name" placeholder="Tatenda Moyo" required value={form.studentName} onChange={(e) => set('studentName')(e.currentTarget.value)} />
          <TextInput label="Student ID" placeholder="STU-2026-001" required value={form.studentId} onChange={(e) => set('studentId')(e.currentTarget.value)} />
        </Group>
        <Group grow>
          <Select
            label="Class / grade"
            placeholder="Select"
            searchable
            clearable
            data={['ECD A', 'ECD B', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7',
              'Form 1', 'Form 2', 'Form 3', 'Form 4', 'Form 5', 'Form 6']}
            value={form.grade}
            onChange={(v) => set('grade')(v || '')}
          />
          <Select
            label="Term"
            data={['Term 1 2026', 'Term 2 2026', 'Term 3 2026', 'Term 1 2027']}
            value={form.term}
            onChange={(v) => set('term')(v || 'Term 3 2026')}
          />
        </Group>
        <Divider label="Fee" labelPosition="left" />
        <Group grow align="flex-end">
          <Select
            label="Fee type"
            data={['Tuition', 'Boarding', 'Transport', 'Sports Levy', 'Building Fund', 'Exam Fee', 'Other']}
            value={form.feeType}
            onChange={(v) => set('feeType')(v || 'Tuition')}
          />
          <NumberInput label="Amount" placeholder="650.00" required min={0.01} decimalScale={2} value={form.amount} onChange={(v) => set('amount')(v)} />
          <Select label="Currency" data={['USD', 'ZWL', 'ZiG']} value={form.currency} onChange={(v) => set('currency')(v || 'USD')} maw={100} />
        </Group>
        <Group grow>
          <Select
            label="How the parent pays"
            data={[
              { value: 'one_time', label: 'One payment' },
              { value: 'instalment', label: 'Instalments' },
            ]}
            value={form.paymentTerms}
            onChange={(v) => set('paymentTerms')(v || 'one_time')}
          />
          {form.paymentTerms !== 'one_time' && (
            <NumberInput label="Number of instalments" min={2} max={12} value={form.instalments} onChange={(v) => set('instalments')(v)} />
          )}
        </Group>
        {form.paymentTerms !== 'one_time' && (
          <Group grow>
            <Select
              label="Every"
              data={[
                { value: 'weekly', label: 'Week' },
                { value: 'monthly', label: 'Month' },
                { value: 'quarterly', label: 'Quarter' },
              ]}
              value={form.paymentCadence}
              onChange={(v) => set('paymentCadence')(v || 'monthly')}
            />
            <TextInput label="First due date" type="date" value={form.firstDueDate} onChange={(e) => set('firstDueDate')(e.currentTarget.value)} />
            <NumberInput label="First payment (optional)" min={0} decimalScale={2} value={form.firstPaymentAmount} onChange={(v) => set('firstPaymentAmount')(v)} />
          </Group>
        )}
        <Divider label="Parent / guardian" labelPosition="left" />
        <ContactPickerSelect
          contacts={contacts}
          requirePhone={false}
          label="Pick the parent from contacts"
          description="Fills the name and phone. Leave blank to type a new one."
          onPick={(picked) => {
            if (picked) setForm((prev) => ({ ...prev, payerName: picked.name || prev.payerName, payerPhone: picked.phone || prev.payerPhone }))
          }}
        />
        <Group grow>
          <TextInput label="Name" placeholder="Rudo Moyo" value={form.payerName} onChange={(e) => set('payerName')(e.currentTarget.value)} />
          <TextInput
            label="Phone"
            placeholder="+263771234567"
            required
            description="The pay link goes to this number."
            value={form.payerPhone}
            onChange={(e) => set('payerPhone')(e.currentTarget.value)}
          />
        </Group>
        {err && (
          <Alert icon={<IconAlertCircle size={16} />} color="red">
            {err}
          </Alert>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button leftSection={<IconFileInvoice size={16} />} onClick={handleCreate} loading={loading}>
            Send pay link
          </Button>
        </Group>
      </FormCard>
    </Modal>
  )
}

/* ─── Page ────────────────────────────────────────────────────────── */

export default function SchoolFeesPage() {
  // Org-only surface: personal sessions are redirected (mirrors mobile /finance → /inbox).
  useRequireOrgContext('/inbox')

  const [orgTenantId, setOrgTenantId] = useState('')
  const [orgName, setOrgName] = useState('')
  const [runs, setRuns] = useState<SchoolFeeRun[]>([])
  const [earlier, setEarlier] = useState<EarlierFeeEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<string | null>('all')
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [qr, setQr] = useState<{ url: string; title: string; amount: number; currency: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const [actorReports, setActorReports] = useState<WorkflowActorReport[]>([])
  const [people, setPeople] = useState<StagePerson[]>([])
  const [contacts, setContacts] = useState<PickerContact[]>([])

  const backendUrl = process.env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000'

  useEffect(() => {
    setMounted(true)
    const activeOrg = readActiveOrganization()
    if (activeOrg) {
      setOrgTenantId(activeOrg.orgTenantId)
      setOrgName(activeOrg.name)
      const token = getOrgScopedToken()
      if (token) {
        axios.get(`${backendUrl}/api/organizations/${encodeURIComponent(activeOrg.orgTenantId)}/workflows/actors`, {
          headers: { Authorization: `Bearer ${token}` },
        }).then((res) => {
          setActorReports(Array.isArray(res.data?.workflows) ? res.data.workflows : [])
          setPeople(Array.isArray(res.data?.members) ? res.data.members.filter((m: any) => m?.userId) : [])
        }).catch(() => setActorReports([]))
        // Saved contacts, so the parent field can be picked instead of typed.
        void Promise.allSettled(
          (['external', 'internal'] as const).map((contactScope) =>
            axios.get(`${backendUrl}/api/contacts`, { headers: { Authorization: `Bearer ${token}` }, params: { contactScope } }).then((res) => {
              const rows = Array.isArray(res.data?.contacts) ? res.data.contacts : Array.isArray(res.data) ? res.data : []
              return rows.map((c: any) => ({
                id: String(c.id),
                name: String(c.name || 'Unknown'),
                phone: c.phone || undefined,
                email: c.email || undefined,
                contactScope,
              })) as PickerContact[]
            }),
          ),
        ).then((results) => {
          const merged = results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
          setContacts(Array.from(new Map(merged.map((contact) => [contact.id, contact])).values()))
        })
      }
    }
  }, [backendUrl])

  const load = useCallback(async () => {
    const token = getOrgScopedToken() || getPersonalToken()
    if (!token) return
    const headers = { Authorization: `Bearer ${token}` }
    setLoading(true)
    setError(null)
    try {
      const res = await axios.get(`${backendUrl}/workflows/runs`, { params: { limit: 200 }, headers })
      const rows: SchoolFeeRun[] = (Array.isArray(res.data) ? res.data : []).filter((run: any) => isSchoolFeeRun(run))
      setRuns(rows)

      const old = await axios
        .get(`${backendUrl}/api/platform/requests`, { params: { limit: 50, requestType: 'education_fees' }, headers })
        .catch(() => ({ data: { items: [] } }))
      const items = Array.isArray(old.data?.items) ? old.data.items : []
      setEarlier(
        items
          .filter((r: any) => String(r.requestType || r.request_type || '').toLowerCase() === 'education_fees')
          .map((r: any) => ({
            id: String(r.id),
            title: String(r.title || 'School fee'),
            amount: r.amount ?? undefined,
            currency: r.currency || 'USD',
            status: String(r.status || 'draft'),
            createdAt: r.createdAt || r.created_at,
          })),
      )
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'School fees could not be loaded')
    } finally {
      setLoading(false)
    }
  }, [backendUrl])

  useEffect(() => {
    if (!mounted) return
    if (!orgTenantId && !getPersonalToken()) return
    void load()
  }, [orgTenantId, load, mounted])

  const stats = useMemo(() => {
    const waiting = runs.filter((r) => r.status === 'paused').length
    const paidRuns = runs.filter((r) => r.status === 'completed')
    const collected = paidRuns.reduce((sum, r) => sum + Number(r.output?.payment?.amount || 0), 0)
    return { total: runs.length, waiting, paid: paidRuns.length, collected }
  }, [runs])

  const visibleRuns = useMemo(() => {
    return runs.filter((run) => {
      if (tab === 'waiting' && run.status !== 'paused') return false
      if (tab === 'paid' && run.status !== 'completed') return false
      if (tab === 'attention' && run.status !== 'failed' && run.output?.clientBill?.status !== 'not_sent') return false
      if (search) {
        const q = search.toLowerCase()
        const input = run.input || {}
        return [input.studentName, input.studentId, input.payerName, input.term].some((v) => String(v || '').toLowerCase().includes(q))
      }
      return true
    })
  }, [runs, tab, search])

  const selectedRun = runs.find((run) => run.id === selectedId) || null
  const noOrg = mounted && !orgTenantId && !getPersonalToken()

  const showQr = (url: string, title: string, amount: number, currency: string) => setQr({ url, title, amount, currency })

  return (
    <Layout title="School Fees">
      <Container size="xl" py="md">
        <Group justify="space-between" mb="lg" wrap="wrap">
          <Group gap="sm">
            <ThemeIcon size={40} radius="md" variant="light" color="teal">
              <IconSchool size={22} />
            </ThemeIcon>
            <Box>
              <Title order={3}>School fees</Title>
              <Text size="sm" c="dimmed">
                Send parents a pay link, take one payment or instalments, keep the receipt
                {orgName ? ` — ${orgName}` : ''}
              </Text>
            </Box>
          </Group>
          <Group>
            <Button variant="light" leftSection={<IconRefresh size={16} />} onClick={load} loading={loading}>
              Refresh
            </Button>
            <Button leftSection={<IconPlus size={16} />} onClick={() => setCreateOpen(true)} disabled={noOrg}>
              New fee
            </Button>
          </Group>
        </Group>

        {noOrg && (
          <Alert icon={<IconAlertCircle size={16} />} color="yellow" mb="md">
            Use the account picker in the header to switch into an organization first.
          </Alert>
        )}

        {error && (
          <Alert icon={<IconAlertCircle size={16} />} color="red" mb="md">
            {error}
          </Alert>
        )}

        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md" mb="lg">
          <Paper p="md" radius="md" withBorder>
            <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Fees</Text>
            <Title order={2}>{stats.total}</Title>
          </Paper>
          <Paper p="md" radius="md" withBorder>
            <Group gap={6}>
              <ThemeIcon size={20} color="blue" variant="light" radius="xl"><IconClock size={12} /></ThemeIcon>
              <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Waiting to be paid</Text>
            </Group>
            <Title order={2} c="blue">{stats.waiting}</Title>
          </Paper>
          <Paper p="md" radius="md" withBorder>
            <Group gap={6}>
              <ThemeIcon size={20} color="green" variant="light" radius="xl"><IconCheck size={12} /></ThemeIcon>
              <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Paid</Text>
            </Group>
            <Title order={2} c="green">{stats.paid}</Title>
          </Paper>
          <Paper p="md" radius="md" withBorder>
            <Group gap={6}>
              <ThemeIcon size={20} color="teal" variant="light" radius="xl"><IconReceipt size={12} /></ThemeIcon>
              <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Collected</Text>
            </Group>
            <Title order={2} c="teal">{fmt(stats.collected)}</Title>
          </Paper>
        </SimpleGrid>

        <Paper p="sm" radius="md" withBorder mb="md">
          <Group justify="space-between" wrap="wrap" gap="sm">
            <Tabs value={tab} onChange={setTab} variant="pills" radius="xl">
              <Tabs.List>
                <Tabs.Tab value="all">All ({runs.length})</Tabs.Tab>
                <Tabs.Tab value="waiting" color="blue">Waiting ({stats.waiting})</Tabs.Tab>
                <Tabs.Tab value="paid" color="green">Paid ({stats.paid})</Tabs.Tab>
                <Tabs.Tab value="attention" color="red">Needs attention</Tabs.Tab>
              </Tabs.List>
            </Tabs>
            <TextInput
              placeholder="Search student, ID, parent..."
              leftSection={<IconSearch size={14} />}
              size="xs"
              w={240}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
            />
          </Group>
        </Paper>

        {loading ? (
          <Center py="xl"><Loader /></Center>
        ) : visibleRuns.length === 0 ? (
          <Paper p="xl" radius="md" withBorder>
            <Center>
              <Stack align="center" gap="xs">
                <ThemeIcon size={48} color="gray" variant="light" radius="xl">
                  <IconSchool size={24} />
                </ThemeIcon>
                <Text c="dimmed">No school fees yet.</Text>
                <Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => setCreateOpen(true)} disabled={noOrg}>
                  Send the first pay link
                </Button>
              </Stack>
            </Center>
          </Paper>
        ) : (
          <Paper radius="md" withBorder style={{ overflow: 'hidden' }}>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Student</Table.Th>
                  <Table.Th>Term / fee</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>Amount</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Progress</Table.Th>
                  <Table.Th>Date</Table.Th>
                  <Table.Th>Pay link</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {visibleRuns.map((run) => {
                  const input = run.input || {}
                  const steps = schoolFeeProgress(run)
                  const status = schoolFeeStatusWords(run)
                  const link = payLinkOf(run)
                  return (
                    <Table.Tr key={run.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedId(run.id)}>
                      <Table.Td>
                        <Text size="sm" fw={600}>{String(input.studentName || '—')}</Text>
                        {!!input.studentId && <Text size="xs" c="dimmed">{String(input.studentId)}</Text>}
                      </Table.Td>
                      <Table.Td>
                        <Text size="xs">{String(input.term || '—')}</Text>
                        <Text size="xs" c="dimmed">{String(input.feeType || 'Tuition')}</Text>
                      </Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>
                        <Text size="sm" fw={600}>{fmt(amountOf(run), currencyOf(run))}</Text>
                        {instalmentsOf(run) > 1 && <Text size="xs" c="dimmed">{instalmentsOf(run)} instalments</Text>}
                      </Table.Td>
                      <Table.Td>
                        <Badge size="sm" variant="light" color={status.color}>{status.label}</Badge>
                      </Table.Td>
                      <Table.Td>
                        <Group gap={4}>
                          {steps.map((s) => (
                            <Tooltip key={s.key} label={s.label}>
                              <Box
                                style={{
                                  width: 10,
                                  height: 10,
                                  borderRadius: '50%',
                                  backgroundColor: s.status === 'done' ? 'var(--mantine-color-teal-5)' : s.status === 'active' ? 'var(--mantine-color-blue-4)' : 'var(--mantine-color-gray-3)',
                                }}
                              />
                            </Tooltip>
                          ))}
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Text size="xs" c="dimmed">{formatTxnTime(run.createdAt) || '—'}</Text>
                      </Table.Td>
                      <Table.Td onClick={(e) => e.stopPropagation()}>
                        {link && run.status !== 'completed' ? (
                          <Group gap={4}>
                            <CopyButton value={link}>
                              {({ copied, copy }) => (
                                <Tooltip label={copied ? 'Copied' : 'Copy pay link'}>
                                  <ActionIcon size="sm" variant="subtle" color={copied ? 'green' : 'gray'} onClick={copy}>
                                    {copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
                                  </ActionIcon>
                                </Tooltip>
                              )}
                            </CopyButton>
                            <Tooltip label="Show QR">
                              <ActionIcon size="sm" variant="subtle" onClick={() => showQr(link, schoolFeeTitle(run), amountOf(run), currencyOf(run))}>
                                <IconQrcode size={13} />
                              </ActionIcon>
                            </Tooltip>
                            <Tooltip label="Open pay page">
                              <ActionIcon size="sm" variant="subtle" component="a" href={link} target="_blank">
                                <IconExternalLink size={13} />
                              </ActionIcon>
                            </Tooltip>
                          </Group>
                        ) : (
                          <Text size="xs" c="dimmed">—</Text>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  )
                })}
              </Table.Tbody>
            </Table>
          </Paper>
        )}

        {earlier.length > 0 && (
          <Paper radius="md" withBorder mt="lg" p="sm">
            <Text fw={600} size="sm">Earlier entries</Text>
            <Text size="xs" c="dimmed" mb="xs">
              Saved before fees sent their own pay links. Create a new fee to send the parent a pay link.
            </Text>
            <Table>
              <Table.Tbody>
                {earlier.map((entry) => (
                  <Table.Tr key={entry.id}>
                    <Table.Td><Text size="xs">{entry.title}</Text></Table.Td>
                    <Table.Td style={{ textAlign: 'right' }}>
                      <Text size="xs">{entry.amount != null ? fmt(entry.amount, entry.currency || 'USD') : '—'}</Text>
                    </Table.Td>
                    <Table.Td><Badge size="xs" variant="light" color={requestStatusWords(entry.status).color}>{requestStatusWords(entry.status).label}</Badge></Table.Td>
                    <Table.Td><Text size="xs" c="dimmed">{formatTxnTime(entry.createdAt) || '—'}</Text></Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Paper>
        )}

        <CreateFeeModal
          opened={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={(run) => {
            const link = run ? payLinkOf(run) : undefined
            if (run && link) showQr(link, schoolFeeTitle(run), amountOf(run), currencyOf(run))
            void load()
          }}
          backendUrl={backendUrl}
          contacts={contacts}
        />

        <Drawer
          opened={Boolean(selectedRun)}
          onClose={() => setSelectedId(null)}
          title={
            <Group gap="xs">
              <IconSchool size={18} />
              <Text fw={600}>{selectedRun ? schoolFeeTitle(selectedRun) : 'School fee'}</Text>
            </Group>
          }
          position="right"
          size="lg"
          padding="md"
        >
          {selectedRun && (
            <SchoolFeeDetail run={selectedRun} onClose={() => setSelectedId(null)} onShowQr={showQr} actors={actorReports} people={people} />
          )}
        </Drawer>

        <Modal opened={Boolean(qr)} onClose={() => setQr(null)} title="Pay link" size="sm" centered>
          {qr && (
            <Stack align="center" gap="md">
              <Text size="sm" fw={600}>{qr.title} — {fmt(qr.amount, qr.currency)}</Text>
              <QRCode value={qr.url} size={200} />
              <Text size="xs" c="dimmed" ta="center">{qr.url}</Text>
              <Button
                component="a"
                href={`https://wa.me/?text=${encodeURIComponent(`School fees\n${qr.title}\nAmount: ${fmt(qr.amount, qr.currency)}\n\nPay here: ${qr.url}`)}`}
                target="_blank"
                leftSection={<IconSend size={14} />}
                variant="light"
                color="green"
              >
                Share on WhatsApp
              </Button>
            </Stack>
          )}
        </Modal>
      </Container>
    </Layout>
  )
}
