import { useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import axios from 'axios'
import {
  Badge,
  Button,
  Center,
  Container,
  Drawer,
  Group,
  Loader,
  Paper,
  Stack,
  Tabs,
  Text,
  Title,
} from '@mantine/core'
import {
  IconCash,
  IconChartBar,
  IconReceipt,
  IconRefresh,
  IconSchool,
  IconUsers,
} from '@tabler/icons-react'

import Layout from '@/components/Layout'
import { FinanceListCard } from '@/components/finance/FinanceListCard'
import { StageActorTimeline } from '@/components/finance/StageActorTimeline'
import {
  actorsForWorkflow,
  AP_STAGES,
  AR_STAGES,
  feptStages,
  INVOICE_STAGES,
  jobStatusLabel,
  requisitionStages,
  requestStages,
  stagePersonName,
  type FinanceStageView,
  type StagePerson,
  type WorkflowActorReport,
} from '@/components/finance/financeStages'
import { DetailStatusCard, WorkflowDetailBody } from '@/components/finance/WorkflowDetailBody'
import { EnvContext } from '@/pages/_app'
import { getOrgScopedToken, readActiveOrganization } from '@/utils/organizationContext'

import { useRequireOrgContext } from '@/lib/portalContext'
type FinanceTab = 'ar' | 'invoices' | 'requisitions' | 'field' | 'ap'

const TAB_ORDER: FinanceTab[] = ['ar', 'invoices', 'requisitions', 'field', 'ap']

const fmt = (n: number, c = 'USD') => {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: c || 'USD' }).format(n || 0)
  } catch {
    return `${c} ${n || 0}`
  }
}

function includesAny(value: string, hints: string[]): boolean {
  const normalized = value.toLowerCase()
  return hints.some((hint) => normalized.includes(hint))
}

export default function FinanceModulesPage() {
  // Org-only surface: personal sessions are redirected (mirrors mobile /finance → /inbox).
  useRequireOrgContext('/inbox')

  const env = useContext(EnvContext)
  const router = useRouter()
  const backendUrl = env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000'

  const [orgTenantId, setOrgTenantId] = useState('')
  const [tab, setTab] = useState<FinanceTab>('requisitions')
  const [loading, setLoading] = useState(true)
  const [workflowTypes, setWorkflowTypes] = useState<string[]>([])
  const [actorReports, setActorReports] = useState<WorkflowActorReport[]>([])
  const [people, setPeople] = useState<StagePerson[]>([])
  const [requisitions, setRequisitions] = useState<any[]>([])
  const [runs, setRuns] = useState<any[]>([])
  const [requests, setRequests] = useState<any[]>([])
  const [selected, setSelected] = useState<null | { kind: FinanceTab; row: any }>(null)

  const authHeaders = () => {
    const token = getOrgScopedToken() || (typeof window !== 'undefined' ? localStorage.getItem('walletToken') : null)
    return token ? { Authorization: `Bearer ${token}` } : undefined
  }

  const load = useCallback(async () => {
    const org = readActiveOrganization()
    const orgId = org?.orgTenantId || ''
    setOrgTenantId(orgId)
    const headers = authHeaders()
    if (!headers) {
      setLoading(false)
      return
    }
    setLoading(true)
    const safeGet = async (url: string, params?: Record<string, unknown>) => {
      try {
        const res = await axios.get(url, { headers, params })
        return res.data
      } catch {
        return null
      }
    }

    const [workflows, actors, requisitionRows, runRows, requestRows] = await Promise.all([
      orgId ? safeGet(`${backendUrl}/api/organizations/${encodeURIComponent(orgId)}/workflows`) : null,
      orgId ? safeGet(`${backendUrl}/api/organizations/${encodeURIComponent(orgId)}/workflows/actors`) : null,
      safeGet(`${backendUrl}/api/finance/requisitions`),
      safeGet(`${backendUrl}/workflows/runs`, { limit: 50 }),
      safeGet(`${backendUrl}/api/platform/requests`, { limit: 80 }),
    ])

    setWorkflowTypes(Array.isArray(workflows?.workflowTypes) ? workflows.workflowTypes : [])
    setActorReports(Array.isArray(actors?.workflows) ? actors.workflows : [])
    setPeople(Array.isArray(actors?.members) ? actors.members.filter((m: any) => m?.userId) : [])
    setRequisitions(Array.isArray(requisitionRows) ? requisitionRows : [])
    setRuns(Array.isArray(runRows) ? runRows : Array.isArray(runRows?.runs) ? runRows.runs : [])
    setRequests(Array.isArray(requestRows?.items) ? requestRows.items : Array.isArray(requestRows) ? requestRows : [])
    setLoading(false)
  }, [backendUrl])

  useEffect(() => { void load() }, [load])

  const enabled = useMemo(() => {
    const joined = workflowTypes.join(' ').toLowerCase()
    const has = (hints: string[]) => !joined || includesAny(joined, hints)
    return {
      ar: has(['receivable', 'collect', 'payment', 'cash']),
      invoices: has(['education', 'school', 'fee']),
      requisitions: has(['requisition']),
      field: has(['field', 'fept']),
      ap: has(['payable', 'ap_']),
    }
  }, [workflowTypes])

  const fieldRuns = useMemo(() => runs.filter((run) => {
    const workflowId = String(run.workflowId || run.workflow_id || '').toLowerCase()
    const stage = String(run.output?.workflowStage || run.output?.stage || '').toUpperCase()
    return workflowId.includes('field') || workflowId.includes('fept') || ['ASSIGNED', 'IN_PROGRESS', 'EVIDENCE_CAPTURED', 'ACKNOWLEDGED', 'PAYMENT_TRIGGERED', 'RECONCILED'].includes(stage)
  }), [runs])

  const invoiceRows = useMemo(() => requests.filter((row) => {
    const type = String(row.requestType || row.request_type || row.workflowType || '').toLowerCase()
    return includesAny(type, ['education', 'school', 'fee', 'invoice'])
  }), [requests])

  const arRows = useMemo(() => requests.filter((row) => {
    const type = String(row.requestType || row.request_type || row.workflowType || '').toLowerCase()
    return includesAny(type, ['receivable', 'collect', 'ar_', 'payment_collection'])
  }), [requests])

  const apRows = useMemo(() => requests.filter((row) => {
    const type = String(row.requestType || row.request_type || row.workflowType || '').toLowerCase()
    return includesAny(type, ['payable', 'ap_', 'remittance'])
  }), [requests])

  useEffect(() => {
    if (!router.isReady) return
    const queryTab = String(router.query.tab || '').toLowerCase() as FinanceTab
    if (TAB_ORDER.includes(queryTab)) setTab(queryTab)

    const requisitionId = String(router.query.requisitionId || '')
    const runId = String(router.query.runId || '')
    const transactionId = String(router.query.transactionId || '')
    if (queryTab === 'requisitions' && requisitionId) {
      const row = requisitions.find((item) => item.id === requisitionId)
      if (row) setSelected({ kind: 'requisitions', row })
    }
    if (queryTab === 'field' && runId) {
      const row = fieldRuns.find((item) => item.id === runId)
      if (row) setSelected({ kind: 'field', row })
    }
    if ((queryTab === 'ar' || queryTab === 'ap' || queryTab === 'invoices') && transactionId) {
      const pool = queryTab === 'ar' ? arRows : queryTab === 'ap' ? apRows : invoiceRows
      const row = pool.find((item) => String(item.id) === transactionId || String(item.transactionId || '') === transactionId)
      if (row) setSelected({ kind: queryTab, row })
    }
  }, [router.isReady, router.query, requisitions, fieldRuns, arRows, apRows, invoiceRows])

  const detail = useMemo(() => {
    if (!selected) return null
    if (selected.kind === 'requisitions') {
      const row = selected.row
      const amount = Number(row.metadata?.amount || 0)
      const currency = row.metadata?.currency || 'USD'
      return {
        title: `Requisition ${row.id}`,
        status: String(row.status || 'UNKNOWN'),
        amount,
        currency,
        lines: [
          { text: `Department: ${row.metadata?.department || '—'}` },
          { text: `Reference: ${row.id}` },
        ],
        stages: requisitionStages(row.status),
        actors: actorsForWorkflow(actorReports, ['requisition']),
        href: `/finance/requisitions/${encodeURIComponent(row.id)}`,
        hrefLabel: 'Open requisition actions',
      }
    }
    if (selected.kind === 'field') {
      const run = selected.row
      const input = run.output?.workflowInput || run.input || {}
      const stage = String(run.output?.workflowStage || run.output?.stage || run.status || '')
      return {
        title: `Job ${input.reference || input.poNumber || run.id}`,
        status: jobStatusLabel(String(run.status || ''), stage, String(run.output?.pauseReason || '')),
        amount: Number(input.amount || input.budget || 0),
        currency: input.currency || 'USD',
        lines: [
          { text: `Run: ${run.id}` },
          ...(input.location ? [{ text: `Location: ${input.location}` }] : []),
        ],
        stages: feptStages(stage, run.output || {}),
        actors: actorsForWorkflow(actorReports, ['field', 'fept']),
        assigneeName: stagePersonName(String(run.output?.assignment?.assigneeId || input.assigneeId || ''), people),
        // The job card holds the step actions (site check, review, sign-off, payment) and the full history.
        href: `/finance/job-cards?runId=${encodeURIComponent(String(run.id || ''))}`,
        hrefLabel: 'Open job card',
      }
    }
    const row = selected.row
    const typeHints = selected.kind === 'ap' ? ['payable', 'ap'] : selected.kind === 'invoices' ? ['education', 'school', 'fee'] : ['receivable', 'collect', 'ar']
    const catalog = selected.kind === 'ap' ? AP_STAGES : selected.kind === 'invoices' ? INVOICE_STAGES : AR_STAGES
    const stages: FinanceStageView[] = requestStages(catalog, row.status)
    return {
      title: row.title || row.id,
      status: String(row.status || 'pending'),
      amount: Number(row.amount || 0),
      currency: row.currency || 'USD',
      lines: [
        { text: `Type: ${row.requestType || row.request_type || row.workflowType || selected.kind}` },
        { text: `Request: ${row.id}` },
      ],
      stages,
      actors: actorsForWorkflow(actorReports, typeHints),
      href: selected.kind === 'invoices' ? '/finance/school-fees' : '/inbox',
      hrefLabel: selected.kind === 'invoices' ? 'Open school fees' : 'Open in inbox',
    }
  }, [selected, actorReports, people])

  const visibleTabs = TAB_ORDER.filter((key) => enabled[key] || key === tab)

  return (
    <Layout title="Finance">
      <Container size="xl" py="md">
        <Group justify="space-between" mb="md">
          <div>
            <Title order={3}>Finance Modules</Title>
            <Text size="sm" c="dimmed">
              Same workflows as the mobile finance tabs. Each item shows its SSI stage, proof, and the actor configured for that stage.
            </Text>
          </div>
          <Group>
            <Button variant="light" leftSection={<IconChartBar size={16} />} component={Link} href="/finance/reports">
              Reports
            </Button>
            <Button variant="light" leftSection={<IconRefresh size={16} />} onClick={() => void load()} loading={loading}>
              Refresh
            </Button>
          </Group>
        </Group>

        {!orgTenantId && (
          <Paper withBorder p="md" mb="md">
            <Text size="sm">Switch to an organization to see its payments, requisitions, jobs and supplier bills.</Text>
          </Paper>
        )}

        <Tabs value={tab} onChange={(value) => setTab((value as FinanceTab) || 'requisitions')}>
          <Tabs.List>
            {visibleTabs.includes('ar') && <Tabs.Tab value="ar" leftSection={<IconReceipt size={14} />}>Payments</Tabs.Tab>}
            {visibleTabs.includes('invoices') && <Tabs.Tab value="invoices" leftSection={<IconSchool size={14} />}>Invoices</Tabs.Tab>}
            {visibleTabs.includes('requisitions') && <Tabs.Tab value="requisitions" leftSection={<IconUsers size={14} />}>Requisitions</Tabs.Tab>}
            {visibleTabs.includes('field') && <Tabs.Tab value="field" leftSection={<IconReceipt size={14} />}>Jobs</Tabs.Tab>}
            {visibleTabs.includes('ap') && <Tabs.Tab value="ap" leftSection={<IconCash size={14} />}>Supplier bills</Tabs.Tab>}
          </Tabs.List>

          <Tabs.Panel value="requisitions" pt="md">
            <ListPanel
              loading={loading}
              empty="No requisitions yet."
              action={<Button component={Link} href="/finance/requisitions/new">New requisition</Button>}
            >
              {requisitions.map((row) => (
                <FinanceListCard
                  key={row.id}
                  title={row.metadata?.department ? `Requisition · ${row.metadata.department}` : `Requisition · ${row.id}`}
                  flowLabel="REQUISITION FLOW"
                  flowColor="indigo"
                  status={String(row.status || 'UNKNOWN')}
                  statusColor="indigo"
                  dateLabel={row.updatedAt ? new Date(row.updatedAt).toLocaleDateString() : undefined}
                  note={row.metadata?.notes}
                  amountLabel={fmt(Number(row.metadata?.amount || 0), row.metadata?.currency || 'USD')}
                  onClick={() => setSelected({ kind: 'requisitions', row })}
                />
              ))}
            </ListPanel>
          </Tabs.Panel>

          <Tabs.Panel value="field" pt="md">
            <ListPanel loading={loading} empty="No field runs yet." action={<Button component={Link} href="/finance/job-cards">Open job cards</Button>}>
              {fieldRuns.map((run) => {
                const input = run.output?.workflowInput || run.input || {}
                const stage = String(run.output?.workflowStage || run.output?.stage || run.status || 'RUNNING')
                return (
                  <FinanceListCard
                    key={run.id}
                    title={`Field run · ${input.reference || input.poNumber || run.id}`}
                    flowLabel="FEPT"
                    flowColor="teal"
                    status={stage}
                    statusColor="teal"
                    note={input.location}
                    amountLabel={input.amount ? fmt(Number(input.amount), input.currency || 'USD') : undefined}
                    onClick={() => setSelected({ kind: 'field', row: run })}
                  />
                )
              })}
            </ListPanel>
          </Tabs.Panel>

          <Tabs.Panel value="invoices" pt="md">
            <RequestList loading={loading} rows={invoiceRows} flowLabel="INVOICE FLOW" flowColor="teal" empty="No invoices yet." onOpen={(row) => setSelected({ kind: 'invoices', row })} />
          </Tabs.Panel>
          <Tabs.Panel value="ar" pt="md">
            <RequestList loading={loading} rows={arRows} flowLabel="AR COLLECTION" flowColor="grape" empty="No AR collections in the request inbox yet." onOpen={(row) => setSelected({ kind: 'ar', row })} />
          </Tabs.Panel>
          <Tabs.Panel value="ap" pt="md">
            <RequestList loading={loading} rows={apRows} flowLabel="AP PAYABLE" flowColor="orange" empty="No AP payables in the request inbox yet." onOpen={(row) => setSelected({ kind: 'ap', row })} />
          </Tabs.Panel>
        </Tabs>
      </Container>

      <Drawer opened={Boolean(detail)} onClose={() => setSelected(null)} position="right" size="lg" title={detail?.title || 'Workflow'}>
        {detail && (
          <WorkflowDetailBody
            statusCard={(
              <DetailStatusCard
                status={detail.status}
                amount={detail.amount}
                currency={detail.currency}
                lines={detail.lines}
              />
            )}
            sections={[{
              title: 'STAGE · ACTOR · STATUS',
              content: <StageActorTimeline stages={detail.stages} actors={detail.actors} people={people} assigneeName={detail.assigneeName} />,
            }]}
            auditItems={[]}
            auditEmptyText="Who did each step, when and with what proof is under the job card's History tab."
          />
        )}
        {detail && (
          <Button mt="md" component={Link} href={detail.href} fullWidth>
            {detail.hrefLabel}
          </Button>
        )}
      </Drawer>
    </Layout>
  )
}

function ListPanel({
  loading,
  empty,
  action,
  children,
}: {
  loading: boolean
  empty: string
  action?: ReactNode
  children: ReactNode
}) {
  const items = Array.isArray(children) ? children : [children]
  const hasItems = items.some(Boolean) && items.length > 0 && !(items.length === 1 && items[0] == null)
  return (
    <Stack gap="sm">
      {action}
      {loading ? <Center py="xl"><Loader /></Center> : !hasItems ? <Text c="dimmed" size="sm">{empty}</Text> : children}
    </Stack>
  )
}

function RequestList({
  loading,
  rows,
  flowLabel,
  flowColor,
  empty,
  onOpen,
}: {
  loading: boolean
  rows: any[]
  flowLabel: string
  flowColor: string
  empty: string
  onOpen: (row: any) => void
}) {
  return (
    <ListPanel loading={loading} empty={empty}>
      {rows.map((row) => (
        <FinanceListCard
          key={row.id}
          title={row.title || row.id}
          flowLabel={flowLabel}
          flowColor={flowColor}
          status={String(row.status || 'pending').toUpperCase()}
          dateLabel={row.updatedAt || row.createdAt ? new Date(row.updatedAt || row.createdAt).toLocaleDateString() : undefined}
          note={row.description}
          amountLabel={row.amount != null ? fmt(Number(row.amount), row.currency || 'USD') : undefined}
          trailing={<Badge size="xs" variant="outline">SSI</Badge>}
          onClick={() => onOpen(row)}
        />
      ))}
    </ListPanel>
  )
}
