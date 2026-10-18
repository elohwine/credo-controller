import React, { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import {
  ActionIcon, Alert, Badge, Box, Button, Drawer, Group, Loader, NumberInput, Select, Stack, Text,
  Textarea, TextInput, ThemeIcon, UnstyledButton,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconArrowLeft, IconBriefcase, IconCalendar, IconCash, IconChevronRight, IconCoins, IconFileText,
  IconId, IconMessage, IconReceipt, IconSearch, IconShoppingCart, IconTool,
} from '@tabler/icons-react'
import { useRouter } from 'next/router'
import { getPersonalToken } from '@/utils/organizationContext'
import {
  EXPENSE_CATEGORIES, LEAVE_TYPES, REQUEST_GROUP_WORDS, requestGroupsIn, requestKindsFor, resendStatusWords,
  type RequestContext, type RequestKind, type RequestKindIcon, type RequestOptions, type RequestRouteKey,
} from '@/lib/requestCatalog'

const backendUrl = process.env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000'

/** Where each "open a screen" row goes on the website. `discover` is handled inside the sheet. */
const ROUTES: Record<RequestRouteKey, string> = {
  discover: '',
  purchase_request: '/finance/requisitions/new',
  new_job: '/finance/job-cards',
  collect_payment: '/finance?tab=ar',
  my_requests: '/requests/mine',
}

const ICONS: Record<RequestKindIcon, React.ReactNode> = {
  calendar: <IconCalendar size={20} />,
  receipt: <IconReceipt size={20} />,
  cash: <IconCash size={20} />,
  message: <IconMessage size={20} />,
  id: <IconId size={20} />,
  file: <IconFileText size={20} />,
  briefcase: <IconBriefcase size={20} />,
  search: <IconSearch size={20} />,
  cart: <IconShoppingCart size={20} />,
  tool: <IconTool size={20} />,
  coins: <IconCoins size={20} />,
}

const GROUP_COLORS: Record<RequestKind['group'], string> = {
  my_orgs: 'blue',
  my_records: 'teal',
  businesses: 'indigo',
  org_ops: 'grape',
}

interface PublicOrgSummary {
  id: string
  tenantId: string
  name: string
  description?: string
  category?: string
  availableServices?: number
}

interface RequestSheetProps {
  opened: boolean
  onClose: () => void
  context: RequestContext
  /** Open straight on one row (from the Home catalogue grid). */
  initialKindId?: string
}

function daysBetween(start: string, end: string): number {
  const a = new Date(start).getTime()
  const b = new Date(end).getTime()
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0
  return Math.round((b - a) / 86_400_000) + 1
}

function errorMessage(error: any, fallback: string): string {
  return String(error?.response?.data?.message || error?.response?.data?.error || error?.message || fallback)
}

/**
 * The Request sheet behind the Home "Request" button. One entry, three groups (four in
 * organisation context), context-aware. The same sheet exists on the phone; there the
 * "other businesses" rows open Network → Discover, here they search inside the sheet.
 */
export default function RequestSheet({ opened, onClose, context, initialKindId }: RequestSheetProps) {
  const router = useRouter()
  const [options, setOptions] = useState<RequestOptions | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [active, setActive] = useState<RequestKind | null>(null)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({})
  const [askOrgFor, setAskOrgFor] = useState<RequestKind | null>(null)
  const [businessQuery, setBusinessQuery] = useState('')
  const [businesses, setBusinesses] = useState<PublicOrgSummary[]>([])
  const [businessLoading, setBusinessLoading] = useState(false)
  const [business, setBusiness] = useState<PublicOrgSummary | null>(null)

  const walletToken = () => getPersonalToken()

  useEffect(() => {
    if (!opened) return
    setActive(null)
    setAskOrgFor(null)
    setForm({})
    setBusiness(null)
    setBusinessQuery('')
    const token = walletToken()
    if (!token) {
      setOptions(null)
      setLoadError('Sign in to see what you can ask for.')
      return
    }
    setLoading(true)
    setLoadError('')
    axios
      .get(`${backendUrl}/api/platform/requests/options`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => setOptions(res.data || null))
      .catch((error) => {
        setOptions(null)
        setLoadError(errorMessage(error, 'Could not load your options.'))
      })
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened])

  const rows = useMemo(() => requestKindsFor(options, context), [options, context])
  const groups = useMemo(() => requestGroupsIn(rows), [rows])

  // From the Home grid: land on the chosen row once the options are in.
  useEffect(() => {
    if (!opened || !initialKindId || loading || active) return
    const row = rows.find((entry) => entry.id === initialKindId)
    if (row) void openRow(row)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, initialKindId, loading, rows])

  const finish = (message: string, go?: string) => {
    notifications.show({ title: 'Sent', message, color: 'green' })
    onClose()
    if (go) void router.push(go)
  }

  const raise = async (kind: RequestKind, body: Record<string, unknown>) => {
    const token = walletToken()
    if (!token || !kind.orgTenantId) throw new Error('Sign in again to send this.')
    const idempotencyKey = `raise:${kind.id}:${kind.orgTenantId}:${JSON.stringify(body).length}:${Date.now().toString(36).slice(0, 6)}`
    return axios.post(
      `${backendUrl}/api/platform/requests/raise`,
      { orgTenantId: kind.orgTenantId, requestType: kind.id, ...body },
      { headers: { Authorization: `Bearer ${token}`, 'x-idempotency-key': idempotencyKey } },
    )
  }

  const searchBusinesses = async (query: string) => {
    setBusinessLoading(true)
    try {
      const res = query.trim()
        ? await axios.get(`${backendUrl}/api/discovery/search`, { params: { q: query.trim() } })
        : await axios.get(`${backendUrl}/api/discovery/organizations`, { params: { limit: 20 } })
      const list = Array.isArray(res.data) ? res.data : Array.isArray(res.data?.items) ? res.data.items : []
      setBusinesses(list)
    } catch {
      setBusinesses([])
    } finally {
      setBusinessLoading(false)
    }
  }

  const openRow = async (kind: RequestKind) => {
    if (kind.disabledLine) return
    if (kind.routeKey === 'discover') {
      setForm({})
      setBusiness(null)
      setActive(kind)
      void searchBusinesses('')
      return
    }
    if (kind.routeKey) {
      onClose()
      void router.push(ROUTES[kind.routeKey])
      return
    }
    if (kind.recordItem) {
      await resend(kind)
      return
    }
    setForm({})
    setActive(kind)
  }

  const resend = async (kind: RequestKind) => {
    const token = walletToken()
    if (!token || !kind.recordItem) return
    setBusy(true)
    try {
      const res = await axios.post(
        `${backendUrl}/api/wallet/credentials/resend-mine`,
        { item: kind.recordItem, orgTenantId: kind.orgTenantId },
        { headers: { Authorization: `Bearer ${token}` } },
      )
      const words = resendStatusWords(res.data?.status, kind.recordItem, res.data?.count)
      if (res.data?.status === 'ask_org' && kind.orgTenantId) {
        setAskOrgFor(kind)
        notifications.show({ title: words.title, message: res.data?.detail || words.message, color: words.color })
        return
      }
      notifications.show({ title: words.title, message: words.message, color: words.color })
      if (res.data?.status === 'queued') {
        onClose()
        void router.push('/inbox')
      }
    } catch (error: any) {
      notifications.show({ title: 'Could not send', message: errorMessage(error, 'Try again in a moment.'), color: 'red' })
    } finally {
      setBusy(false)
    }
  }

  const askOrgForRecord = async () => {
    if (!askOrgFor?.recordItem) return
    setBusy(true)
    try {
      await raise(
        { ...askOrgFor, id: 'platform.general' },
        {
          title: `Please send my ${askOrgFor.label.split(' · ')[0].toLowerCase()} again`,
          description: 'I no longer have this record.',
          context: { purposeCode: 'resend_record', referenceCode: askOrgFor.recordItem },
        },
      )
      finish(`${askOrgFor.orgName || 'The organisation'} has your request.`, ROUTES.my_requests)
    } catch (error: any) {
      notifications.show({ title: 'Could not send', message: errorMessage(error, 'Try again in a moment.'), color: 'red' })
    } finally {
      setBusy(false)
    }
  }

  const submitBusinessAsk = async () => {
    if (!active || !business) return
    const token = walletToken()
    if (!token) throw new Error('Sign in again to send this.')
    if (!form.text?.trim()) throw new Error('Say what you need in a sentence or two.')
    const kind = active.id.replace('business.', '') // quote | invoice | service
    await axios.post(
      `${backendUrl}/workflow-requests`,
      {
        targetOrgTenantId: business.tenantId || business.id,
        requesterName: form.name?.trim() || undefined,
        requestType: kind,
        payload: { title: `${active.label} · ${business.name}`, description: form.text.trim() },
      },
      { headers: { Authorization: `Bearer ${token}` } },
    )
    finish(`${business.name} has your request. Their answer arrives in your inbox.`, ROUTES.my_requests)
  }

  const submitForm = async () => {
    if (!active) return
    setBusy(true)
    try {
      if (active.routeKey === 'discover') {
        await submitBusinessAsk()
        return
      }
      if (active.id === 'hr.leave') {
        if (!form.leaveType || !form.startDate || !form.endDate) throw new Error('Pick the kind of leave and the dates.')
        const days = daysBetween(form.startDate, form.endDate)
        if (days <= 0) throw new Error('The last day must be on or after the first day.')
        const typeLabel = LEAVE_TYPES.find((entry) => entry.value === form.leaveType)?.label || 'Leave'
        await raise(active, {
          title: `${typeLabel} · ${days} day${days === 1 ? '' : 's'}`,
          description: form.reason?.trim() || undefined,
          context: { leaveType: form.leaveType, startDate: form.startDate, endDate: form.endDate, days, coverRef: form.cover?.trim() || undefined },
        })
        finish('Your manager has your leave request.', ROUTES.my_requests)
        return
      }
      if (active.id === 'finance.expense_claim') {
        const amount = Number(form.amount)
        if (!form.description?.trim()) throw new Error('Say what the money was for.')
        if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter the amount you spent.')
        await raise(active, {
          title: form.description.trim().slice(0, 80),
          description: form.description.trim(),
          amount,
          currency: form.currency || 'USD',
          context: { categoryCode: form.category || 'other', receiptRef: form.receiptRef?.trim() || undefined, merchantRef: form.merchant?.trim() || undefined },
        })
        finish('Your manager has your expense claim.', ROUTES.my_requests)
        return
      }
      if (active.id === 'finance.payout_request') {
        const job = active.payoutJob
        if (!job) throw new Error('This job is no longer waiting for a payout.')
        await raise(active, {
          title: `Payout for job ${job.reference}`,
          description: form.note?.trim() || undefined,
          amount: job.amount,
          currency: job.currency,
          context: { workflowRunId: job.workflowRunId },
        })
        finish('The payout person has your request.', ROUTES.my_requests)
        return
      }
      if (!form.title?.trim()) throw new Error('Give your request a short title.')
      const purchase = active.id === 'procurement.requisition'
      const estimatedAmount = Number(form.amount)
      if (purchase && (!Number.isFinite(estimatedAmount) || estimatedAmount <= 0)) throw new Error('Enter a positive estimated amount.')
      await raise(active, {
        title: form.title.trim().slice(0, 120),
        description: form.description?.trim() || undefined,
        ...(purchase && { amount: estimatedAmount, currency: form.currency || 'USD' }),
        context: purchase ? {} : { purposeCode: 'general' },
      })
      finish(`${active.orgName || 'The organisation'} has your request.`, ROUTES.my_requests)
    } catch (error: any) {
      notifications.show({ title: 'Not sent', message: errorMessage(error, 'Try again in a moment.'), color: 'red' })
    } finally {
      setBusy(false)
    }
  }

  const renderBusinessStep = () => (
    <Stack gap="sm">
      {!business ? (
        <>
          <TextInput
            leftSection={<IconSearch size={16} />}
            placeholder="Search by name or what they do"
            value={businessQuery}
            onChange={(e) => setBusinessQuery(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void searchBusinesses(businessQuery) }}
            rightSection={businessLoading ? <Loader size="xs" /> : undefined}
          />
          <Button variant="light" size="xs" onClick={() => void searchBusinesses(businessQuery)} loading={businessLoading}>Search</Button>
          {!businessLoading && businesses.length === 0 && (
            <Text size="sm" c="dimmed">No organisations are listed yet. Ask them to publish their page.</Text>
          )}
          <Stack gap={6}>
            {businesses.map((org) => (
              <UnstyledButton key={org.id} onClick={() => setBusiness(org)}>
                <Group wrap="nowrap" gap="sm" p="xs" style={{ borderRadius: 12, border: '1px solid var(--mantine-color-default-border)' }}>
                  <ThemeIcon size={38} radius="md" variant="light" color="indigo"><IconBriefcase size={20} /></ThemeIcon>
                  <Box style={{ flex: 1, minWidth: 0 }}>
                    <Text size="sm" fw={600} truncate>{org.name}</Text>
                    <Text size="xs" c="dimmed" lineClamp={1}>{org.description || org.category || 'Organisation'}</Text>
                  </Box>
                  <IconChevronRight size={16} color="var(--mantine-color-dimmed)" />
                </Group>
              </UnstyledButton>
            ))}
          </Stack>
        </>
      ) : (
        <>
          <Group justify="space-between">
            <Text size="sm" c="dimmed">To {business.name}</Text>
            <Button size="compact-xs" variant="subtle" onClick={() => setBusiness(null)}>Change</Button>
          </Group>
          <Textarea
            label="What you need"
            placeholder="A sentence or two: what, how many, by when."
            minRows={3}
            value={form.text || ''}
            onChange={(e) => setForm({ ...form, text: e.currentTarget.value })}
            required
          />
          <TextInput label="Your name, as they should see it" value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.currentTarget.value })} />
          <Text size="xs" c="dimmed">{business.name} sees your name and what you wrote, nothing else. Their answer arrives in your inbox.</Text>
        </>
      )}
    </Stack>
  )

  const renderForm = () => {
    if (!active) return null
    if (active.routeKey === 'discover') return renderBusinessStep()
    const to = active.orgName ? `To ${active.orgName}` : ''
    if (active.id === 'hr.leave') {
      const days = form.startDate && form.endDate ? daysBetween(form.startDate, form.endDate) : 0
      return (
        <Stack gap="sm">
          {to && <Text size="sm" c="dimmed">{to}. Your manager decides.</Text>}
          <Select label="Kind of leave" data={LEAVE_TYPES} value={form.leaveType || null} onChange={(value) => setForm({ ...form, leaveType: value || '' })} required />
          <Group grow>
            <TextInput type="date" label="First day" value={form.startDate || ''} onChange={(e) => setForm({ ...form, startDate: e.currentTarget.value })} required />
            <TextInput type="date" label="Last day" value={form.endDate || ''} onChange={(e) => setForm({ ...form, endDate: e.currentTarget.value })} required />
          </Group>
          {days > 0 && <Text size="sm">{days} day{days === 1 ? '' : 's'}</Text>}
          <TextInput label="Who covers for you (optional)" value={form.cover || ''} onChange={(e) => setForm({ ...form, cover: e.currentTarget.value })} />
          <Textarea label="Reason (optional)" minRows={2} value={form.reason || ''} onChange={(e) => setForm({ ...form, reason: e.currentTarget.value })} />
        </Stack>
      )
    }
    if (active.id === 'finance.expense_claim') {
      return (
        <Stack gap="sm">
          {to && <Text size="sm" c="dimmed">{to}. Your manager decides; finance pays you back.</Text>}
          <Textarea label="What was it for" minRows={2} value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.currentTarget.value })} required />
          <Group grow>
            <NumberInput label="Amount" min={0} decimalScale={2} value={form.amount ? Number(form.amount) : ''} onChange={(value) => setForm({ ...form, amount: String(value ?? '') })} required />
            <Select label="Currency" data={['USD', 'ZWG', 'ZAR']} value={form.currency || 'USD'} onChange={(value) => setForm({ ...form, currency: value || 'USD' })} />
          </Group>
          <Select label="Category" data={EXPENSE_CATEGORIES} value={form.category || null} onChange={(value) => setForm({ ...form, category: value || '' })} />
          <TextInput label="Where you paid (optional)" value={form.merchant || ''} onChange={(e) => setForm({ ...form, merchant: e.currentTarget.value })} />
          <TextInput label="Receipt number (optional)" value={form.receiptRef || ''} onChange={(e) => setForm({ ...form, receiptRef: e.currentTarget.value })} />
        </Stack>
      )
    }
    if (active.id === 'finance.payout_request') {
      const job = active.payoutJob
      return (
        <Stack gap="sm">
          <Alert color="blue" variant="light">
            Job {job?.reference} is signed off and waiting for its payment{job?.amount ? ` of ${job.currency || ''} ${job.amount}` : ''}.
            This sends a reminder to the person who releases it.
          </Alert>
          <Textarea label="Add a note (optional)" minRows={2} value={form.note || ''} onChange={(e) => setForm({ ...form, note: e.currentTarget.value })} />
        </Stack>
      )
    }
    return (
      <Stack gap="sm">
        {to && <Text size="sm" c="dimmed">{to}.</Text>}
        <TextInput label="What do you need" value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.currentTarget.value })} required />
        {active.id === 'procurement.requisition' && (
          <Group grow>
            <NumberInput label="Estimated amount" min={0} decimalScale={2} value={form.amount ? Number(form.amount) : ''} onChange={(value) => setForm({ ...form, amount: String(value ?? '') })} required />
            <Select label="Currency" data={['USD', 'ZWG', 'ZAR']} value={form.currency || 'USD'} onChange={(value) => setForm({ ...form, currency: value || 'USD' })} />
          </Group>
        )}
        <Textarea label="Details (optional)" minRows={3} value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.currentTarget.value })} />
      </Stack>
    )
  }

  const canSend = !active || active.routeKey !== 'discover' || Boolean(business)

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size="md"
      padding="md"
      title={
        active ? (
          <Group gap="xs">
            <ActionIcon variant="subtle" onClick={() => { setActive(null); setBusiness(null) }} aria-label="Back">
              <IconArrowLeft size={18} />
            </ActionIcon>
            <Text fw={700}>{active.label}</Text>
          </Group>
        ) : (
          <Text fw={700}>Request</Text>
        )
      }
    >
      {active ? (
        <Stack gap="md">
          {renderForm()}
          {canSend && <Button onClick={() => void submitForm()} loading={busy} fullWidth>Send</Button>}
        </Stack>
      ) : (
        <Stack gap="lg">
          {loading && (
            <Group justify="center" py="md"><Loader size="sm" /></Group>
          )}
          {!loading && loadError && (
            <Alert color="orange" variant="light">{loadError}</Alert>
          )}
          {askOrgFor && (
            <Alert color="blue" variant="light" title="Ask the organisation" withCloseButton onClose={() => setAskOrgFor(null)}>
              <Stack gap="xs">
                <Text size="sm">{askOrgFor.orgName || 'The organisation'} sends this record from its side. Send them a request now.</Text>
                <Button size="xs" onClick={() => void askOrgForRecord()} loading={busy}>Ask {askOrgFor.orgName || 'them'}</Button>
              </Stack>
            </Alert>
          )}
          {!loading && !loadError && groups.length === 0 && (
            <Text size="sm" c="dimmed">Nothing to ask for right now.</Text>
          )}
          {groups.map((group) => (
            <Box key={group}>
              <Text size="xs" fw={700} tt="uppercase" c="dimmed" style={{ letterSpacing: '0.05em' }}>{REQUEST_GROUP_WORDS[group].title}</Text>
              <Text size="xs" c="dimmed" mb="xs">{REQUEST_GROUP_WORDS[group].line}</Text>
              <Stack gap={6}>
                {rows.filter((row) => row.group === group).map((row) => (
                  <UnstyledButton
                    key={`${row.id}:${row.orgTenantId || ''}:${row.payoutJob?.workflowRunId || ''}`}
                    onClick={() => void openRow(row)}
                    disabled={busy || Boolean(row.disabledLine)}
                    style={{ opacity: row.disabledLine ? 0.6 : 1 }}
                  >
                    <Group wrap="nowrap" gap="sm" p="xs" style={{ borderRadius: 12, border: '1px solid var(--mantine-color-default-border)' }}>
                      <ThemeIcon size={38} radius="md" variant="light" color={GROUP_COLORS[row.group]}>
                        {ICONS[row.icon]}
                      </ThemeIcon>
                      <Box style={{ flex: 1, minWidth: 0 }}>
                        <Text size="sm" fw={600} truncate>{row.label}</Text>
                        <Text size="xs" c="dimmed" lineClamp={2}>{row.line}</Text>
                      </Box>
                      {row.disabledLine ? (
                        <Badge size="xs" variant="light" color="gray">{row.disabledLine}</Badge>
                      ) : (
                        <IconChevronRight size={16} color="var(--mantine-color-dimmed)" />
                      )}
                    </Group>
                  </UnstyledButton>
                ))}
              </Stack>
            </Box>
          ))}
          <Button variant="light" fullWidth onClick={() => { onClose(); void router.push(ROUTES.my_requests) }}>
            See my requests
          </Button>
        </Stack>
      )}
    </Drawer>
  )
}
