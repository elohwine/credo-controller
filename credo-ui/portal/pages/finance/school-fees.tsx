import React, { useCallback, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import Layout from '@/components/Layout'
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Card,
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
  Textarea,
  ThemeIcon,
  Title,
  Timeline,
  Tooltip,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconAlertCircle,
  IconCheck,
  IconCheckbox,
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
  IconShieldCheck,
  IconX,
} from '@tabler/icons-react'
import QRCode from 'react-qr-code'
import {
  getOrgScopedToken,
  getPersonalToken,
  readActiveOrganization,
} from '@/utils/organizationContext'
import { actorDisplay, actorForStage, actorsForWorkflow, type WorkflowActorReport } from '@/components/finance/financeStages'

import { useRequireOrgContext } from '@/lib/portalContext'
/* ─── Types ─────────────────────────────────────────────────────────── */

interface SchoolFeeRequest {
  id: string
  requestType: string
  title: string
  description?: string
  amount?: number
  currency?: string
  status: string
  priority?: string
  createdAt?: string
  updatedAt?: string
  context_json?: string
  /* workflow-request specific */
  workflowRequestId?: string
  workflowType?: string
  payload?: Record<string, unknown>
}

interface PaymentLink {
  id: string
  description: string
  amount: number
  currency: string
  invoiceRef?: string
  status: 'active' | 'paid' | 'expired' | 'cancelled'
  paidAt?: string
  shortlinkUrl?: string
  createdAt: string
  payerPhone?: string
}

interface WorkflowStep {
  label: string
  vcType: string
  protocol: string
  done: boolean
  active: boolean
  stageAction?: string
}

interface AuditEvent {
  id?: string
  action: string
  actor?: string
  timestamp: string
  note?: string
}

/* ─── Helpers ─────────────────────────────────────────────────────────*/

const fmt = (n: number, c = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: c }).format(n)

const STATUS_COLOR: Record<string, string> = {
  active: 'blue',
  paid: 'green',
  expired: 'orange',
  cancelled: 'red',
  pending: 'blue',
  submitted: 'blue',
  in_review: 'yellow',
  approved: 'teal',
  in_fulfilment: 'violet',
  completed: 'green',
  rejected: 'red',
  draft: 'gray',
}

const SCHOOL_FEE_STAGES: WorkflowStep[] = [
  { label: 'Invoice Created', vcType: 'InvoiceVC', protocol: 'OID4VCI', done: false, active: false },
  { label: 'EcoCash Payment', vcType: 'PaymentProofVC', protocol: 'EcoCash', done: false, active: false, stageAction: 'record_payment' },
  { label: 'Payment Confirmed', vcType: 'PaymentReceiptVC', protocol: 'Webhook', done: false, active: false, stageAction: 'present_payment_proof' },
  { label: 'Receipt VC Issued', vcType: 'SchoolFeeReceiptVC', protocol: 'OID4VCI', done: false, active: false, stageAction: 'issue_receipt_vc' },
]

function deriveStages(status: string): WorkflowStep[] {
  const s = status.toLowerCase()
  const isDone = (threshold: string) => {
    const order = ['draft', 'submitted', 'in_review', 'approved', 'in_fulfilment', 'completed']
    return order.indexOf(s) >= order.indexOf(threshold)
  }
  return [
    { ...SCHOOL_FEE_STAGES[0], done: isDone('submitted'), active: s === 'submitted' || s === 'in_review' },
    { ...SCHOOL_FEE_STAGES[1], done: isDone('approved'), active: s === 'approved' },
    { ...SCHOOL_FEE_STAGES[2], done: isDone('in_fulfilment'), active: s === 'in_fulfilment' },
    { ...SCHOOL_FEE_STAGES[3], done: isDone('completed'), active: s === 'completed' },
  ]
}

function parsePayload(row: SchoolFeeRequest): Record<string, unknown> {
  if (row.payload && typeof row.payload === 'object') return row.payload
  // API returns context_json as string, or context as object
  const ctxJson = (row as any).context_json || row.context_json
  if (ctxJson) {
    try { return JSON.parse(ctxJson) } catch { /* ignore */ }
  }
  const ctx = (row as any).context
  if (ctx && typeof ctx === 'object') return ctx
  return {}
}

function deriveAuditEvents(row: SchoolFeeRequest): AuditEvent[] {
  const events: AuditEvent[] = []
  const ts = row.createdAt || new Date().toISOString()
  const payload = parsePayload(row)
  events.push({ action: 'Request created', timestamp: ts, note: row.title })
  if (['in_review', 'approved', 'in_fulfilment', 'completed'].includes(row.status))
    events.push({ action: 'Invoice issued', timestamp: ts, note: String(payload.studentName || '') })
  if (['approved', 'in_fulfilment', 'completed'].includes(row.status))
    events.push({ action: 'EcoCash payment initiated', timestamp: row.updatedAt || ts, note: String(payload.payerPhone || payload.parentPhone || '') })
  if (['in_fulfilment', 'completed'].includes(row.status))
    events.push({ action: 'Payment confirmed via webhook', timestamp: row.updatedAt || ts })
  if (row.status === 'completed')
    events.push({ action: 'SchoolFeeReceiptVC issued', timestamp: row.updatedAt || ts, note: 'OID4VCI offer dispatched' })
  return events
}

function isSchoolFeesRow(row: SchoolFeeRequest): boolean {
  const rt = String(row.requestType || (row as any).request_type || row.workflowType || '').toLowerCase()
  return (
    rt.includes('education_fee') ||
    rt.includes('education-fee') ||
    rt.includes('school_fee') ||
    rt.includes('school-fee') ||
    rt.includes('tpl-education') ||
    rt.includes('invoice')
  )
}

/* ─── Detail Drawer ──────────────────────────────────────────────────*/

function SchoolFeeDetail({
  row,
  onClose,
  onAction,
  actors,
}: {
  row: SchoolFeeRequest
  onClose: () => void
  onAction: (id: string, action: 'approve' | 'reject') => void
  actors?: WorkflowActorReport[]
}) {
  const payload = parsePayload(row)
  const stages = deriveStages(row.status)
  const auditEvents = deriveAuditEvents(row)
  const completedCount = stages.filter((s) => s.done).length
  const isActionable = ['submitted', 'in_review'].includes(row.status)

  return (
    <Stack gap="md">
      {/* Header badges */}
      <Group gap="xs" wrap="wrap">
        <Badge variant="light" color="blue">
          {row.workflowType || row.requestType || 'education_fees'}
        </Badge>
        <Badge color={STATUS_COLOR[row.status] || 'gray'}>
          {row.status.replace(/_/g, ' ')}
        </Badge>
        <Badge variant="outline">{row.priority || 'normal'}</Badge>
        <Badge variant="light" color="indigo">
          SSI {completedCount}/{stages.length}
        </Badge>
      </Group>

      {/* Student details */}
      <Paper withBorder radius="md" p="sm">
        <Text fw={600} size="sm" mb="xs">Fee Details</Text>
        <SimpleGrid cols={2} spacing="xs">
          {!!payload.studentName && (
            <>
              <Text size="xs" c="dimmed">Student</Text>
              <Text size="xs" fw={500}>{String(payload.studentName)}</Text>
            </>
          )}
          {!!payload.studentId && (
            <>
              <Text size="xs" c="dimmed">Student ID</Text>
              <Text size="xs" fw={500}>{String(payload.studentId)}</Text>
            </>
          )}
          {!!payload.term && (
            <>
              <Text size="xs" c="dimmed">Term</Text>
              <Text size="xs" fw={500}>{String(payload.term)}</Text>
            </>
          )}
          {!!payload.feeType && (
            <>
              <Text size="xs" c="dimmed">Fee Type</Text>
              <Text size="xs" fw={500}>{String(payload.feeType)}</Text>
            </>
          )}
          {!!payload.schoolName && (
            <>
              <Text size="xs" c="dimmed">School</Text>
              <Text size="xs" fw={500}>{String(payload.schoolName)}</Text>
            </>
          )}
          {row.amount != null && (
            <>
              <Text size="xs" c="dimmed">Amount</Text>
              <Text size="xs" fw={600} c="teal">{fmt(row.amount, row.currency || 'USD')}</Text>
            </>
          )}
          {!!payload.payerPhone && (
            <>
              <Text size="xs" c="dimmed">Payer Phone</Text>
              <Text size="xs" fw={500}>{String(payload.payerPhone)}</Text>
            </>
          )}
        </SimpleGrid>
      </Paper>

      {/* Stage-based workflow */}
      <Paper withBorder radius="md" p="sm">
        <Group justify="space-between" mb="sm">
          <Group gap="xs">
            <IconShieldCheck size={16} />
            <Text fw={600} size="sm">Workflow Stages</Text>
          </Group>
          <Badge variant="light" color="teal">{completedCount}/{stages.length} completed</Badge>
        </Group>
        <Timeline active={completedCount} bulletSize={24} lineWidth={2}>
          {stages.map((stage, i) => (
            <Timeline.Item
              key={stage.label}
              bullet={stage.done ? <IconCheck size={12} /> : stage.active ? <IconClock size={12} /> : undefined}
              color={stage.done ? 'teal' : stage.active ? 'blue' : 'gray'}
              title={
                <Group gap="xs">
                  <Text size="sm" fw={stage.active ? 700 : 500}>{stage.label}</Text>
                  {stage.active && <Badge size="xs" color="blue">In progress</Badge>}
                </Group>
              }
            >
              <Group gap="xs" mt={4}>
                <Badge size="xs" variant="outline" color={stage.done ? 'teal' : 'gray'}>
                  {stage.vcType}
                </Badge>
                <Badge size="xs" variant="light" color="indigo">
                  {stage.protocol}
                </Badge>
                <Badge size="xs" color={stage.done ? 'green' : stage.active ? 'yellow' : 'gray'}>
                  {stage.done ? 'done' : stage.active ? 'pending' : 'waiting'}
                </Badge>
              </Group>
              {stage.stageAction && (
                <Text size="xs" c="dimmed" mt={4}>
                  Who: {actorDisplay(actorForStage(actorsForWorkflow(actors, ['education', 'school', 'fee', 'collect']), stage.stageAction), { stageAction: stage.stageAction })}
                </Text>
              )}
            </Timeline.Item>
          ))}
        </Timeline>
      </Paper>

      {/* Audit trail */}
      <Paper withBorder radius="md" p="sm">
        <Text fw={600} size="sm" mb="xs">Audit Trail</Text>
        <Table striped withTableBorder withColumnBorders>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Event</Table.Th>
              <Table.Th>When</Table.Th>
              <Table.Th>Detail</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {auditEvents.map((evt, i) => (
              <Table.Tr key={i}>
                <Table.Td>
                  <Group gap="xs">
                    <IconCheckbox size={12} color="teal" />
                    <Text size="xs">{evt.action}</Text>
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Text size="xs" c="dimmed">
                    {new Date(evt.timestamp).toLocaleString()}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="xs" c="dimmed">{evt.note || '—'}</Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>

      {/* Actions */}
      {isActionable && row.workflowRequestId && (
        <Group grow>
          <Button
            color="teal"
            leftSection={<IconCheck size={16} />}
            onClick={() => { onAction(row.workflowRequestId!, 'approve'); onClose() }}
          >
            Approve Payment
          </Button>
          <Button
            variant="light"
            color="red"
            leftSection={<IconX size={16} />}
            onClick={() => { onAction(row.workflowRequestId!, 'reject'); onClose() }}
          >
            Reject
          </Button>
        </Group>
      )}
      <Button variant="default" onClick={onClose}>Close</Button>
    </Stack>
  )
}

/* ─── Create Invoice Modal ───────────────────────────────────────────*/

interface CreateFeeForm {
  studentName: string
  studentId: string
  grade: string
  term: string
  feeType: string
  amount: string
  currency: string
  schoolName: string
  payerPhone: string
  description: string
}

const BLANK_FORM: CreateFeeForm = {
  studentName: '',
  studentId: '',
  grade: '',
  term: 'Term 3 2026',
  feeType: 'Tuition',
  amount: '',
  currency: 'USD',
  schoolName: '',
  payerPhone: '',
  description: '',
}

function CreateFeeModal({
  opened,
  onClose,
  onCreated,
  backendUrl,
  orgTenantId,
}: {
  opened: boolean
  onClose: () => void
  onCreated: () => void
  backendUrl: string
  orgTenantId: string
}) {
  const [form, setForm] = useState<CreateFeeForm>(BLANK_FORM)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const set = (key: keyof CreateFeeForm) => (val: string) =>
    setForm((prev) => ({ ...prev, [key]: val }))

  const handleCreate = async () => {
    if (!form.studentName || !form.amount || !form.studentId) {
      setErr('Student name, ID and amount are required.')
      return
    }
    setLoading(true)
    setErr(null)
    const token = getOrgScopedToken()
    if (!token) { setErr('No org token — switch to org context first.'); setLoading(false); return }

    try {
      await axios.post(
        `${backendUrl}/api/platform/requests`,
        {
          requestType: 'education_fees',
          title: `School Fees — ${form.studentName} (${form.term})`,
          description: form.description || `${form.feeType} — ${form.studentName}, ${form.grade}, ${form.term}`,
          amount: parseFloat(form.amount),
          currency: form.currency,
          priority: 'normal',
          context: {
            workflowType: 'education_fee_payment',
            studentName: form.studentName,
            studentId: form.studentId,
            grade: form.grade,
            term: form.term,
            feeType: form.feeType,
            schoolName: form.schoolName,
            payerPhone: form.payerPhone,
          },
        },
        { headers: { Authorization: `Bearer ${token}` } },
      )
      notifications.show({
        title: 'Fee request created',
        message: `${form.studentName} — ${fmt(parseFloat(form.amount), form.currency)}`,
        color: 'green',
        icon: <IconCheck size={16} />,
      })
      setForm(BLANK_FORM)
      onClose()
      onCreated()
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || 'Failed to create request')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs">
          <IconSchool size={20} />
          <Text fw={600}>New School Fee Invoice</Text>
        </Group>
      }
      size="lg"
    >
      <Stack gap="md">
        <Divider label="Student Details" labelPosition="left" />
        <Group grow>
          <TextInput
            label="Student Name"
            placeholder="Tatenda Moyo"
            required
            value={form.studentName}
            onChange={(e) => set('studentName')(e.currentTarget.value)}
          />
          <TextInput
            label="Student ID"
            placeholder="STU-2026-001"
            required
            value={form.studentId}
            onChange={(e) => set('studentId')(e.currentTarget.value)}
          />
        </Group>
        <Group grow>
          <Select
            label="Class / Grade"
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
        <TextInput
          label="School Name"
          placeholder="Springfield High School"
          value={form.schoolName}
          onChange={(e) => set('schoolName')(e.currentTarget.value)}
        />
        <Divider label="Fee Details" labelPosition="left" />
        <Group grow>
          <Select
            label="Fee Type"
            data={['Tuition', 'Boarding', 'Transport', 'Sports Levy', 'Building Fund', 'Exam Fee', 'Other']}
            value={form.feeType}
            onChange={(v) => set('feeType')(v || 'Tuition')}
          />
          <Group grow>
            <NumberInput
              label="Amount"
              placeholder="650.00"
              required
              min={0.01}
              decimalScale={2}
              value={form.amount ? parseFloat(form.amount) : ''}
              onChange={(v) => set('amount')(String(v ?? ''))}
            />
            <Select
              label="Currency"
              data={['USD', 'ZWL', 'ZiG']}
              value={form.currency}
              onChange={(v) => set('currency')(v || 'USD')}
              w={90}
            />
          </Group>
        </Group>
        <TextInput
          label="Parent / Guardian Phone"
          placeholder="+263771234567"
          value={form.payerPhone}
          onChange={(e) => set('payerPhone')(e.currentTarget.value)}
        />
        <Textarea
          label="Description (optional)"
          placeholder="Term 3 2026 tuition fees"
          value={form.description}
          onChange={(e) => set('description')(e.currentTarget.value)}
          rows={2}
        />
        {err && (
          <Alert icon={<IconAlertCircle size={16} />} color="red">
            {err}
          </Alert>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button
            leftSection={<IconFileInvoice size={16} />}
            onClick={handleCreate}
            loading={loading}
          >
            Create Invoice
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

/* ─── Page ────────────────────────────────────────────────────────── */

export default function SchoolFeesPage() {
  // Org-only surface: personal sessions are redirected (mirrors mobile /finance → /inbox).
  useRequireOrgContext('/inbox')

  const [orgTenantId, setOrgTenantId] = useState('')
  const [orgName, setOrgName] = useState('')
  const [rows, setRows] = useState<SchoolFeeRequest[]>([])
  const [paymentLinks, setPaymentLinks] = useState<PaymentLink[]>([])
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<string | null>('all')
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedRow, setSelectedRow] = useState<SchoolFeeRequest | null>(null)
  const [qrLink, setQrLink] = useState<PaymentLink | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const [actorReports, setActorReports] = useState<WorkflowActorReport[]>([])

  const backendUrl = process.env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000'

  useEffect(() => {
    setMounted(true)
    const activeOrg = readActiveOrganization()
    if (activeOrg) {
      setOrgTenantId(activeOrg.orgTenantId)
      setOrgName(activeOrg.name)
      const token = getOrgScopedToken()
      if (token) {
        axios.get(`${process.env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000'}/api/organizations/${encodeURIComponent(activeOrg.orgTenantId)}/workflows/actors`, {
          headers: { Authorization: `Bearer ${token}` },
        }).then((res) => {
          setActorReports(Array.isArray(res.data?.workflows) ? res.data.workflows : [])
        }).catch(() => setActorReports([]))
      }
    }
  }, [])

  const load = useCallback(async () => {
    const orgToken = getOrgScopedToken()
    const personalToken = getPersonalToken()
    const token = orgToken || personalToken
    if (!token) return
    setLoading(true)
    setError(null)

    try {
      // Platform requests — education_fees type
      const res = await axios.get(`${backendUrl}/api/platform/requests`, {
        params: { limit: 50, requestType: 'education_fees' },
        headers: { Authorization: `Bearer ${token}` },
      })
      const items: SchoolFeeRequest[] = (Array.isArray(res.data?.items) ? res.data.items : [])
        .filter((r: any) => isSchoolFeesRow(r))
        .map((r: any) => ({
          ...r,
          requestType: r.requestType || r.request_type || 'education_fees',
          status: r.status || 'draft',
          amount: r.amount ?? undefined,
          currency: r.currency ?? 'USD',
          createdAt: r.createdAt || r.created_at,
          updatedAt: r.updatedAt || r.updated_at,
          context_json: r.context_json || r.contextJson,
        }))

      // Also load workflow requests
      try {
        const wrRes = await axios.get(`${backendUrl}/workflow-requests/inbound`, {
          params: { limit: 50 },
          headers: { Authorization: `Bearer ${token}` },
        })
        const wrs = Array.isArray(wrRes.data) ? wrRes.data : []
        const educationWrs: SchoolFeeRequest[] = wrs
          .filter((r: any) => {
            const wt = String(r.workflowType || '').toLowerCase()
            return wt.includes('education') || wt.includes('school') || wt.includes('tpl-education')
          })
          .map((r: any) => ({
            id: r.id,
            requestType: r.requestType || 'education_fees',
            workflowType: r.workflowType,
            workflowRequestId: r.id,
            title: `School Fees — ${String(r.payload?.studentName || r.id)}`,
            description: `${r.workflowType || 'education_fee_payment'} • ${r.status}`,
            amount: r.payload?.amount as number | undefined,
            currency: r.payload?.currency as string | undefined,
            status: r.status === 'pending' ? 'submitted' : r.status,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
            payload: r.payload,
          }))
        // Merge, deduplicate by id
        const allIds = new Set(items.map((i) => i.id))
        educationWrs.forEach((r) => { if (!allIds.has(r.id)) items.push(r) })
      } catch { /* workflow-requests endpoint optional */ }

      setRows(items)

      // Payment links with invoiceRef (school fee invoices from legacy API)
      try {
        const plRes = await axios.get(`${backendUrl}/api/payment-links`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const allLinks: PaymentLink[] = plRes.data?.links || plRes.data || []
        setPaymentLinks(allLinks.filter((l) => Boolean(l.invoiceRef)))
      } catch { /* payment links optional */ }
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load school fee requests')
    } finally {
      setLoading(false)
    }
  }, [backendUrl])

  useEffect(() => {
    if (!mounted) return
    if (!orgTenantId && !getPersonalToken()) return
    void load()
  }, [orgTenantId, load, mounted])

  const handleDecision = async (workflowRequestId: string, action: 'approve' | 'reject') => {
    const token = getOrgScopedToken() || getPersonalToken()
    if (!token) return
    try {
      await axios.put(
        `${backendUrl}/workflow-requests/${encodeURIComponent(workflowRequestId)}/${action}`,
        action === 'reject' ? { reason: 'Rejected from portal' } : { executeWorkflow: true },
        { headers: { Authorization: `Bearer ${token}` } },
      )
      notifications.show({ title: `Request ${action}d`, message: '', color: action === 'approve' ? 'green' : 'red' })
      void load()
    } catch (e: any) {
      notifications.show({ title: 'Action failed', message: e?.response?.data?.message || e?.message, color: 'red' })
    }
  }

  /* Stats */
  const stats = useMemo(() => {
    const all = [...rows, ...paymentLinks.map((l) => ({ id: l.id, status: l.status === 'paid' ? 'completed' : l.status === 'active' ? 'submitted' : l.status, amount: l.amount, currency: l.currency }))]
    return {
      total: all.length,
      pending: all.filter((r) => ['submitted', 'active', 'in_review'].includes(r.status)).length,
      completed: all.filter((r) => ['completed', 'paid'].includes(r.status)).length,
      revenue: [...rows, ...paymentLinks]
        .filter((r: any) => ['completed', 'paid'].includes(r.status))
        .reduce((s, r: any) => s + (r.amount || 0), 0),
    }
  }, [rows, paymentLinks])

  /* Filtered rows */
  const visibleRows = useMemo(() => {
    const combined: SchoolFeeRequest[] = [
      ...rows,
      ...paymentLinks
        .filter((l) => !rows.some((r) => r.id === l.id))
        .map((l) => ({
          id: l.id,
          requestType: 'education_fees',
          title: l.description,
          amount: l.amount,
          currency: l.currency,
          status: l.status === 'paid' ? 'completed' : l.status === 'active' ? 'submitted' : l.status,
          createdAt: l.createdAt,
        })),
    ]
    return combined.filter((r) => {
      if (tab === 'pending' && !['submitted', 'active', 'in_review', 'approved', 'in_fulfilment'].includes(r.status)) return false
      if (tab === 'completed' && !['completed', 'paid'].includes(r.status)) return false
      if (tab === 'rejected' && r.status !== 'rejected') return false
      if (search) {
        const q = search.toLowerCase()
        const p = parsePayload(r)
        return (
          (r.title || '').toLowerCase().includes(q) ||
          String(p.studentName || '').toLowerCase().includes(q) ||
          String(p.studentId || '').toLowerCase().includes(q) ||
          (r.id || '').toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [rows, paymentLinks, tab, search])

  const noOrg = mounted && !orgTenantId && !getPersonalToken()

  return (
    <Layout title="School Fees">
      <Container size="xl" py="md">
        {/* Header */}
        <Group justify="space-between" mb="lg" wrap="wrap">
          <Group gap="sm">
            <ThemeIcon size={40} radius="md" variant="light" color="teal">
              <IconSchool size={22} />
            </ThemeIcon>
            <Box>
              <Title order={3}>School Fees</Title>
              <Text size="sm" c="dimmed">
                Fee invoices, EcoCash payments and SchoolFeeReceiptVC issuance
                {orgName ? ` — ${orgName}` : ''}
              </Text>
            </Box>
          </Group>
          <Group>
            <Button variant="light" leftSection={<IconRefresh size={16} />} onClick={load} loading={loading}>
              Refresh
            </Button>
            <Button leftSection={<IconPlus size={16} />} onClick={() => setCreateOpen(true)} disabled={noOrg}>
              New Invoice
            </Button>
          </Group>
        </Group>

        {noOrg && (
          <Alert icon={<IconAlertCircle size={16} />} color="yellow" mb="md">
            Use the account picker in the header to switch into an organization context first.
          </Alert>
        )}

        {error && (
          <Alert icon={<IconAlertCircle size={16} />} color="red" mb="md">
            {error}
          </Alert>
        )}

        {/* Stats */}
        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md" mb="lg">
          <Paper p="md" radius="md" withBorder>
            <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Total</Text>
            <Title order={2}>{stats.total}</Title>
          </Paper>
          <Paper p="md" radius="md" withBorder>
            <Group gap={6}>
              <ThemeIcon size={20} color="blue" variant="light" radius="xl"><IconClock size={12} /></ThemeIcon>
              <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Pending</Text>
            </Group>
            <Title order={2} c="blue">{stats.pending}</Title>
          </Paper>
          <Paper p="md" radius="md" withBorder>
            <Group gap={6}>
              <ThemeIcon size={20} color="green" variant="light" radius="xl"><IconCheck size={12} /></ThemeIcon>
              <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Paid / Issued</Text>
            </Group>
            <Title order={2} c="green">{stats.completed}</Title>
          </Paper>
          <Paper p="md" radius="md" withBorder>
            <Group gap={6}>
              <ThemeIcon size={20} color="teal" variant="light" radius="xl"><IconReceipt size={12} /></ThemeIcon>
              <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Revenue</Text>
            </Group>
            <Title order={2} c="teal">{fmt(stats.revenue)}</Title>
          </Paper>
        </SimpleGrid>

        {/* Filters */}
        <Paper p="sm" radius="md" withBorder mb="md">
          <Group justify="space-between" wrap="wrap" gap="sm">
            <Tabs value={tab} onChange={setTab} variant="pills" radius="xl">
              <Tabs.List>
                <Tabs.Tab value="all">All ({visibleRows.length})</Tabs.Tab>
                <Tabs.Tab value="pending" color="blue">Pending ({stats.pending})</Tabs.Tab>
                <Tabs.Tab value="completed" color="green">Paid / Issued ({stats.completed})</Tabs.Tab>
                <Tabs.Tab value="rejected" color="red">Rejected</Tabs.Tab>
              </Tabs.List>
            </Tabs>
            <TextInput
              placeholder="Search student, ID..."
              leftSection={<IconSearch size={14} />}
              size="xs"
              w={220}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
            />
          </Group>
        </Paper>

        {/* List */}
        {loading ? (
          <Center py="xl"><Loader /></Center>
        ) : visibleRows.length === 0 ? (
          <Paper p="xl" radius="md" withBorder>
            <Center>
              <Stack align="center" gap="xs">
                <ThemeIcon size={48} color="gray" variant="light" radius="xl">
                  <IconSchool size={24} />
                </ThemeIcon>
                <Text c="dimmed">No school fee requests found.</Text>
                <Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => setCreateOpen(true)} disabled={noOrg}>
                  Create your first invoice
                </Button>
              </Stack>
            </Center>
          </Paper>
        ) : (
          <Paper radius="md" withBorder style={{ overflow: 'hidden' }}>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Student / Description</Table.Th>
                  <Table.Th>Term / Type</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>Amount</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Workflow</Table.Th>
                  <Table.Th>Date</Table.Th>
                  <Table.Th>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {visibleRows.map((row) => {
                  const payload = parsePayload(row)
                  const stages = deriveStages(row.status)
                  const completedStages = stages.filter((s) => s.done).length
                  const isActionable = ['submitted', 'in_review'].includes(row.status)
                  const pl = paymentLinks.find((l) => l.id === row.id)

                  return (
                    <Table.Tr
                      key={row.id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelectedRow(row)}
                    >
                      <Table.Td>
                        <Text size="sm" fw={600}>
                          {String(payload.studentName || row.title || '—')}
                        </Text>
                        {!!payload.studentId && (
                          <Text size="xs" c="dimmed">{String(payload.studentId)}</Text>
                        )}
                        <Group gap={4} mt={2}>
                          <Badge size="xs" variant="light" color="indigo">INVOICE FLOW</Badge>
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Text size="xs">{String(payload.term || '—')}</Text>
                        <Text size="xs" c="dimmed">{String(payload.feeType || 'Tuition')}</Text>
                      </Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>
                        <Text size="sm" fw={600}>
                          {row.amount != null ? fmt(row.amount, row.currency || 'USD') : '—'}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge
                          size="sm"
                          variant="light"
                          color={STATUS_COLOR[row.status] || 'gray'}
                        >
                          {row.status.replace(/_/g, ' ')}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Group gap={4}>
                          {stages.map((s, i) => (
                            <Tooltip key={i} label={`${s.label}: ${s.done ? 'done' : 'pending'}`}>
                              <Box
                                style={{
                                  width: 10,
                                  height: 10,
                                  borderRadius: '50%',
                                  backgroundColor: s.done ? 'var(--mantine-color-teal-5)' : s.active ? 'var(--mantine-color-blue-4)' : 'var(--mantine-color-gray-3)',
                                }}
                              />
                            </Tooltip>
                          ))}
                          <Text size="xs" c="dimmed">{completedStages}/{stages.length}</Text>
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Text size="xs" c="dimmed">
                          {row.createdAt ? new Date(row.createdAt).toLocaleDateString() : '—'}
                        </Text>
                      </Table.Td>
                      <Table.Td onClick={(e) => e.stopPropagation()}>
                        <Group gap={4}>
                          {pl?.shortlinkUrl && (
                            <>
                              <CopyButton value={pl.shortlinkUrl}>
                                {({ copied, copy }) => (
                                  <Tooltip label={copied ? 'Copied!' : 'Copy payment link'}>
                                    <ActionIcon size="sm" variant="subtle" color={copied ? 'green' : 'gray'} onClick={copy}>
                                      {copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
                                    </ActionIcon>
                                  </Tooltip>
                                )}
                              </CopyButton>
                              <Tooltip label="QR Code">
                                <ActionIcon size="sm" variant="subtle" onClick={() => setQrLink(pl)}>
                                  <IconQrcode size={13} />
                                </ActionIcon>
                              </Tooltip>
                              <Tooltip label="Open payment page">
                                <ActionIcon size="sm" variant="subtle" component="a" href={pl.shortlinkUrl} target="_blank">
                                  <IconExternalLink size={13} />
                                </ActionIcon>
                              </Tooltip>
                            </>
                          )}
                          {isActionable && row.workflowRequestId && (
                            <>
                              <Button
                                size="xs"
                                variant="light"
                                color="teal"
                                onClick={() => handleDecision(row.workflowRequestId!, 'approve')}
                              >
                                Approve
                              </Button>
                              <Button
                                size="xs"
                                variant="light"
                                color="red"
                                onClick={() => handleDecision(row.workflowRequestId!, 'reject')}
                              >
                                Reject
                              </Button>
                            </>
                          )}
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  )
                })}
              </Table.Tbody>
            </Table>
          </Paper>
        )}

        {/* Create modal */}
        <CreateFeeModal
          opened={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={load}
          backendUrl={backendUrl}
          orgTenantId={orgTenantId}
        />

        {/* Detail drawer */}
        <Drawer
          opened={Boolean(selectedRow)}
          onClose={() => setSelectedRow(null)}
          title={
            <Group gap="xs">
              <IconSchool size={18} />
              <Text fw={600}>{selectedRow?.title || 'Fee Request Detail'}</Text>
            </Group>
          }
          position="right"
          size="lg"
          padding="md"
        >
          {selectedRow && (
            <SchoolFeeDetail
              row={selectedRow}
              onClose={() => setSelectedRow(null)}
              onAction={handleDecision}
              actors={actorReports}
            />
          )}
        </Drawer>

        {/* QR modal */}
        <Modal
          opened={Boolean(qrLink)}
          onClose={() => setQrLink(null)}
          title="Payment QR Code"
          size="sm"
          centered
        >
          {qrLink && (
            <Stack align="center" gap="md">
              <QRCode value={qrLink.shortlinkUrl || ''} size={200} />
              <Text size="xs" c="dimmed" ta="center">{qrLink.shortlinkUrl}</Text>
              <Button
                component="a"
                href={`https://wa.me/?text=${encodeURIComponent(`Fee Invoice\n${qrLink.description}\nAmount: ${fmt(qrLink.amount, qrLink.currency)}\n\nPay here: ${qrLink.shortlinkUrl}`)}`}
                target="_blank"
                leftSection={<IconSend size={14} />}
                variant="light"
                color="green"
              >
                Share via WhatsApp
              </Button>
            </Stack>
          )}
        </Modal>
      </Container>
    </Layout>
  )
}
