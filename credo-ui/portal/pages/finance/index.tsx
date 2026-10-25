import { feedback } from '@/lib/feedback';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import axios from 'axios'
import { notifications } from '@mantine/notifications'
import {
  Badge,
  Button,
  Container,
  Drawer,
  Group,
  NumberInput,
  Paper,
  Select,
  Stack,
  Tabs,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { IconCash, IconChartBar, IconReceipt, IconRefresh, IconUsers } from '@tabler/icons-react'

import Layout from '@/components/Layout'
import { ClientBillingDetails } from '@/components/finance/ClientBillingDetails'
import { ContactPickerSelect, type PickerContact } from '@/components/finance/ContactPickerSelect'
import { fieldJobBillingExceptions } from '../../../shared/fieldJobOutcomes'
import { captureOrganizationSwitchContext, isBoundTaskPath, registerLinkedTaskPath, TASK_CONTEXT_KEY } from '../../../shared/taskContext'
import type { FinanceListRow } from '@/components/finance/FinanceListCard'
import { FINANCE_TABLE_HEADERS, FinanceListRows, financeRowsToCells } from '@/components/finance/FinanceListTable'
import { FinanceViewToggle, useFinanceListView } from '@/components/finance/FinanceViewToggle'
import { csvFrom, EXPORT_MIME, exportFileName, saveExport } from '@/lib/exportFile'
import { formatTxnTime } from '@/lib/inboxAttention'
import { StageActorTimeline } from '@/components/finance/StageActorTimeline'
import {
  buildJobAuditTrail,
  jobHeading,
  stageMedia,
  stageTimes,
  whoDidStages,
} from '@/components/finance/jobAuditTrail'
import {
  actorsForWorkflow,
  AP_STAGES,
  AR_STAGES,
  feptStages,
  INVOICE_STAGES,
  jobStatusLabel,
  moneyInKindWord,
  relatedWorkLine,
  requestKindLabel,
  requisitionStages,
  requestStages,
  stagePersonName,
  type FinanceStageView,
  type StagePerson,
  type WorkflowActorReport,
} from '@/components/finance/financeStages'
import { DetailStatusCard, WorkflowDetailBody } from '@/components/finance/WorkflowDetailBody'
import JobAuditTrailPanel from '@/components/workflows/JobAuditTrailPanel'
import {
  chainHistoryTitle,
  trailFromPaymentLink,
  trailFromRequest,
  trailFromSupplierBill,
} from '@/components/finance/jobAuditTrail'
import { EnvContext } from '@/pages/_app'
import { getOrgScopedToken, readActiveOrganization } from '@/utils/organizationContext'
import { readOrgProfile } from '@/utils/orgProfile'

import { endPortalTask, getPortalTask, useRequireOrgContext } from '@/lib/portalContext'
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

function billSentMessage(contact: { payerName: string }, notification: any, renew: boolean) {
  const queued = notification?.channels?.some((channel: any) => channel.status === 'queued')
  if (notification?.accepted || queued)
    return { color: 'teal', message: `${renew ? 'New link sent' : 'Bill sent'} to ${contact.payerName}. It is also in their Credentis inbox if they use the app.` }
  return { color: 'orange', message: `Saved, but no message went out to ${contact.payerName} (${(notification?.channels || []).map((channel: any) => `${channel.channel}: ${channel.status}`).join(', ') || 'no channel'}). Copy the payment link and share it directly.` }
}

export default function FinanceModulesPage() {
  // Org-only surface: personal sessions are redirected (mirrors mobile /finance → /inbox).
  useRequireOrgContext('/inbox')

  const env = useContext(EnvContext)
  const router = useRouter()
  const [inboxTask, setInboxTask] = useState(false)
  useEffect(() => {
    setInboxTask(Boolean(getPortalTask()))
  }, [router.asPath])
  const returnToInbox = () => {
    if (!getPortalTask()) return false
    endPortalTask()
    void router.replace('/inbox')
    return true
  }
  const backendUrl = env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000'

  const [orgTenantId, setOrgTenantId] = useState('')
  const [tab, setTab] = useState<FinanceTab>('ar')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [workflowTypes, setWorkflowTypes] = useState<string[]>([])
  const [actorReports, setActorReports] = useState<WorkflowActorReport[]>([])
  const [people, setPeople] = useState<StagePerson[]>([])
  const [requisitions, setRequisitions] = useState<any[]>([])
  const [runs, setRuns] = useState<any[]>([])
  const [requests, setRequests] = useState<any[]>([])
  const [selected, setSelected] = useState<null | { kind: FinanceTab; row: any }>(null)
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [bills, setBills] = useState<any[]>([])
  const [paymentLinks, setPaymentLinks] = useState<any[]>([])
  const [arPlans, setArPlans] = useState<any[]>([])
  const [arForm, setArForm] = useState({
    description: '',
    payerName: '',
    payerPhone: '',
    totalAmount: 0 as number | string,
    collectionType: 'one_time',
    instalments: 2 as number | string,
    cadence: 'monthly',
    firstDueDate: new Date().toISOString().slice(0, 10),
  })
  const [chainRequest, setChainRequest] = useState<any>(null)
  const [moneyItem, setMoneyItem] = useState<null | { title: string; trail: ReturnType<typeof trailFromPaymentLink> }>(
    null,
  )
  const [bill, setBill] = useState({ supplierName: '', invoiceRef: '', amount: '' })
  const [savingBill, setSavingBill] = useState(false)
  const [listView, setListView] = useFinanceListView()

  const authHeaders = () => {
    const token = getOrgScopedToken() || (typeof window !== 'undefined' ? localStorage.getItem('walletToken') : null)
    return token ? { Authorization: `Bearer ${token}` } : undefined
  }

  const load = useCallback(async () => {
    if (!router.isReady) return
    const org = readActiveOrganization()
    const orgId = org?.orgTenantId || ''
    setOrgTenantId(orgId)
    if (!orgId || !getOrgScopedToken() || (localStorage.getItem(TASK_CONTEXT_KEY) && !getPortalTask())) {
      setLoading(false)
      return
    }
    const headers = authHeaders()
    if (!headers) {
      setLoading(false)
      return
    }
    setLoading(true)
    setLoadError(null)
    const task = getPortalTask()
    if (task) {
      setRuns([])
      setPaymentLinks([])
      setBillingItem(null)
      setRequisitions([])
      setRequests([])
      setSuppliers([])
      setBills([])
      setArPlans([])
      const runId = typeof router.query.runId === 'string' ? router.query.runId : ''
      const linkId = typeof router.query.linkId === 'string' ? router.query.linkId : ''
      const assertContext = captureOrganizationSwitchContext(localStorage)
      const path = router.asPath
      try {
        if (!isBoundTaskPath(task, path) || router.query.tab !== 'ar' || !runId) {
          throw new Error('Open client billing from its linked job.')
        }
        const run = (await axios.get(`${backendUrl}/workflows/runs/${encodeURIComponent(runId)}`, { headers })).data
        assertContext()
        if (`${window.location.pathname}${window.location.search}` !== path) return
        const recordedId = run.output?.clientBill?.linkId
        if (linkId && recordedId !== linkId) throw new Error('This payment link does not belong to the selected job.')
        const link = recordedId
          ? (await axios.get(`${backendUrl}/api/payment-links/${encodeURIComponent(recordedId)}`, { headers })).data?.link
          : undefined
        assertContext()
        if (`${window.location.pathname}${window.location.search}` !== path) return
        if (recordedId && (!link || link.id !== recordedId || link.sourceRunId !== runId)) {
          throw new Error('The linked client billing record is unavailable or belongs to another job.')
        }
        setRuns([run])
        setPaymentLinks(link ? [link] : [])
        setBillingItem({ run, link })
      } catch (error) {
        if (`${window.location.pathname}${window.location.search}` !== path || getPortalTask()?.startedAt !== task.startedAt) return
        if (!assertContext.isCurrent()) return
        const message = axios.isAxiosError(error)
          ? error.response?.data?.message || error.message
          : error instanceof Error ? error.message : 'Could not open client billing'
        setLoadError(message)
        feedback.error(message)
      } finally {
        if (assertContext.isCurrent() && `${window.location.pathname}${window.location.search}` === path) {
          setLoading(false)
        }
      }
      return
    }
    const safeGet = async (url: string, params?: Record<string, unknown>) => {
      try {
        const res = await axios.get(url, { headers, params })
        return res.data
      } catch {
        return null
      }
    }

    const [workflows, actors, requisitionRows, runRows, requestRows, supplierRows, billRows, linkRows, planRows] =
      await Promise.all([
        orgId ? safeGet(`${backendUrl}/api/organizations/${encodeURIComponent(orgId)}/workflows`) : null,
        orgId ? safeGet(`${backendUrl}/api/organizations/${encodeURIComponent(orgId)}/workflows/actors`) : null,
        safeGet(`${backendUrl}/api/finance/requisitions`),
        safeGet(`${backendUrl}/workflows/runs`, { limit: 50 }),
        safeGet(`${backendUrl}/api/platform/requests`, { limit: 80 }),
        safeGet(`${backendUrl}/api/finance/ap/suppliers`),
        safeGet(`${backendUrl}/api/finance/ap/invoices`),
        safeGet(`${backendUrl}/api/payment-links`),
        safeGet(`${backendUrl}/api/finance/ar/plans`),
      ])

    setWorkflowTypes(Array.isArray(workflows?.workflowTypes) ? workflows.workflowTypes : [])
    setActorReports(Array.isArray(actors?.workflows) ? actors.workflows : [])
    setPeople(Array.isArray(actors?.members) ? actors.members.filter((m: any) => m?.userId) : [])
    setRequisitions(Array.isArray(requisitionRows) ? requisitionRows : [])
    setRuns(Array.isArray(runRows) ? runRows : Array.isArray(runRows?.runs) ? runRows.runs : [])
    setRequests(Array.isArray(requestRows?.items) ? requestRows.items : Array.isArray(requestRows) ? requestRows : [])
    setSuppliers(Array.isArray(supplierRows) ? supplierRows : [])
    setBills(Array.isArray(billRows) ? billRows : [])
    setPaymentLinks(Array.isArray(linkRows) ? linkRows : linkRows?.links || [])
    setArPlans(Array.isArray(planRows) ? planRows : [])
    setLoading(false)
  }, [backendUrl, router.isReady, router.asPath])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!router.isReady) return
    const requested = String(router.query.tab || '').toLowerCase()
    if (requested === 'field') {
      const runId = typeof router.query.runId === 'string' ? `?runId=${encodeURIComponent(router.query.runId)}` : ''
      void router.replace(`/finance/job-cards${runId}`)
    } else if (requested === 'requisitions') {
      // Purchases no longer live on this page. A platform request (a child opened from a job's
      // "Where this fits", `financePathForChainMember`) opens as the request sheet on the Purchases
      // tab of All requests; a legacy requisition opens its own page; anything else lists purchases.
      const requestId = typeof router.query.requestId === 'string' ? router.query.requestId : ''
      const requisitionId = typeof router.query.requisitionId === 'string' ? router.query.requisitionId : ''
      if (requestId && router.query.source === 'platform') {
        void router.replace(`/requests?tab=requisitions&request=${encodeURIComponent(requestId)}`)
      } else if (requisitionId) {
        void router.replace(`/finance/requisitions/${encodeURIComponent(requisitionId)}`)
      } else {
        void router.replace(
          requestId ? `/finance/requisitions/${encodeURIComponent(requestId)}` : '/finance/requisitions',
        )
      }
    } else if (requested === 'invoices') {
      const invoiceRef =
        typeof router.query.invoiceRef === 'string' ? `?invoiceRef=${encodeURIComponent(router.query.invoiceRef)}` : ''
      void router.replace(`/finance/school-fees${invoiceRef}`)
    } else if (requested === 'ap' || requested === 'ar') {
      setTab(requested)
    }
  }, [router.isReady, router.query.tab])

  const createArPlan = async () => {
    const headers = authHeaders()
    if (!headers || !arForm.description.trim() || Number(arForm.totalAmount) <= 0) return
    await axios.post(
      `${backendUrl}/api/finance/ar/plans`,
      {
        ...arForm,
        totalAmount: Number(arForm.totalAmount),
        instalments: Number(arForm.instalments) || 1,
        currency: 'USD',
      },
      { headers: { ...headers, 'x-idempotency-key': `portal-ar-${Date.now()}` } },
    )
    setArForm((current) => ({ ...current, description: '', payerName: '', payerPhone: '', totalAmount: 0 }))
    await load()
  }

  const cancelArPlan = async (planId: string) => {
    const headers = authHeaders()
    if (!headers) return
    await axios.patch(
      `${backendUrl}/api/finance/ar/plans/${encodeURIComponent(planId)}/cancel`,
      {},
      {
        headers: { ...headers, 'x-idempotency-key': `portal-ar-cancel-${planId}` },
      },
    )
    await load()
  }

  const remindArPlan = async (planId: string) => {
    const headers = authHeaders()
    if (!headers) return
    const detail = await axios.get(`${backendUrl}/api/finance/ar/plans/${encodeURIComponent(planId)}`, { headers })
    const installments = detail.data?.instalments || detail.data?.installments || []
    const next = installments.find((item: any) => ['pending', 'overdue'].includes(String(item.status)))
    if (!next) return
    await axios.post(
      `${backendUrl}/api/finance/ar/plans/${encodeURIComponent(planId)}/installments/${encodeURIComponent(next.id)}/remind`,
      {},
      { headers },
    )
    await load()
  }

  const enabled = useMemo(() => {
    const joined = workflowTypes.join(' ').toLowerCase()
    const has = (hints: string[]) => !joined || includesAny(joined, hints)
    return {
      ar: has(['receivable', 'collect', 'payment', 'cash']),
      invoices:
        (readOrgProfile()?.kinds || []).includes('school') ||
        (joined.length > 0 && includesAny(joined, ['education', 'school'])),
      requisitions: has(['requisition']),
      field: has(['field', 'fept']),
      ap: has(['payable', 'ap_']),
    }
  }, [workflowTypes])

  const fieldRuns = useMemo(
    () =>
      runs.filter((run) => {
        const workflowId = String(run.workflowId || run.workflow_id || '').toLowerCase()
        const stage = String(run.output?.workflowStage || run.output?.stage || '').toUpperCase()
        return (
          workflowId.includes('field') ||
          workflowId.includes('fept') ||
          ['ASSIGNED', 'IN_PROGRESS', 'EVIDENCE_CAPTURED', 'ACKNOWLEDGED', 'PAYMENT_TRIGGERED', 'RECONCILED'].includes(
            stage,
          )
        )
      }),
    [runs],
  )

  const invoiceRows = useMemo(
    () =>
      requests.filter((row) => {
        const type = String(row.requestType || row.request_type || row.workflowType || '').toLowerCase()
        return includesAny(type, ['education', 'school', 'fee', 'invoice'])
      }),
    [requests],
  )

  const arRows = useMemo(
    () =>
      requests.filter((row) => {
        const type = String(row.requestType || row.request_type || row.workflowType || '').toLowerCase()
        return includesAny(type, ['receivable', 'collect', 'ar_', 'payment_collection'])
      }),
    [requests],
  )

  const [billingItem, setBillingItem] = useState<{ link?: any; run?: any } | null>(null)
  const [contacts, setContacts] = useState<PickerContact[]>([])
  const [contactsLoadedFor, setContactsLoadedFor] = useState('')

  // Saved contacts and team members, so client fields can be picked instead of typed.
  useEffect(() => {
    if (!orgTenantId || contactsLoadedFor === orgTenantId) return
    setContactsLoadedFor(orgTenantId)
    const headers = authHeaders()
    void Promise.allSettled(
      (['external', 'internal'] as const).map((contactScope) =>
        axios.get(`${backendUrl}/api/contacts`, { headers, params: { contactScope } }).then((res) => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgTenantId])
  const [billingBusy, setBillingBusy] = useState(false)
  useEffect(() => {
    if (localStorage.getItem(TASK_CONTEXT_KEY)) return
    if (router.query.tab !== 'ar') return
    const link = paymentLinks.find((item) => item.id === router.query.linkId)
    const run = fieldRuns.find((item) => item.id === router.query.runId)
    if (link) setBillingItem({ run, link })
    else if (run) setBillingItem({ run, link: paymentLinks.find((item) => item.id === run.output?.clientBill?.linkId) })
  }, [router.query.tab, router.query.linkId, router.query.runId, paymentLinks, fieldRuns])
  const sendBilling = async (contact: { payerName: string; payerPhone: string }, renew: boolean) => {
    if (!billingItem) return
    const headers = authHeaders()
    if (!headers) return
    setBillingBusy(true)
    const assertContext = captureOrganizationSwitchContext(localStorage)
    try {
      const linkId = billingItem.link?.id || billingItem.run?.output?.clientBill?.linkId
      const path = linkId
        ? `/api/payment-links/${encodeURIComponent(linkId)}/send`
        : `/workflows/runs/${encodeURIComponent(billingItem.run.id)}/billing/retry`
      const sent = await axios.post(
        `${backendUrl}${path}`,
        linkId ? { ...contact, renew } : { clientName: contact.payerName, clientPhone: contact.payerPhone },
        {
          headers: { ...headers, 'x-idempotency-key': crypto.randomUUID() },
        },
      )
      assertContext()
      if (linkId) notifications.show(billSentMessage(contact, sent.data?.notification, renew))
      const fresh = await axios.get(
        `${backendUrl}${linkId ? `/api/payment-links/${encodeURIComponent(linkId)}` : `/workflows/runs/${encodeURIComponent(billingItem.run.id)}`}`,
        { headers },
      )
      assertContext()
      const createdLinkId = fresh.data?.output?.clientBill?.linkId
      const createdLink =
        !linkId && createdLinkId
          ? (await axios.get(`${backendUrl}/api/payment-links/${encodeURIComponent(createdLinkId)}`, { headers })).data?.link
          : undefined
      assertContext()
      setBillingItem(linkId ? { ...billingItem, link: fresh.data.link } : { run: fresh.data, link: createdLink })
      await load()
    } catch (error) {
      if (!assertContext.isCurrent()) return
      feedback.error(axios.isAxiosError(error)
          ? error.response?.data?.message || error.message
          : error instanceof Error ? error.message : 'Could not send the client invoice')
    } finally {
      setBillingBusy(false)
    }
  }

  const saveBillingPayer = async (contact: { payerName: string; payerPhone: string }) => {
    const linkId = billingItem?.link?.id
    const headers = authHeaders()
    if (!linkId || !headers) return undefined
    setBillingBusy(true)
    const assertContext = captureOrganizationSwitchContext(localStorage)
    try {
      const saved = await axios.patch(`${backendUrl}/api/payment-links/${encodeURIComponent(linkId)}/payer`, contact, { headers })
      assertContext()
      const fresh = await axios.get(`${backendUrl}/api/payment-links/${encodeURIComponent(linkId)}`, { headers })
      assertContext()
      setBillingItem((current) => (current ? { ...current, link: fresh.data.link } : current))
      return saved.data as { changed: boolean; needsRenewal: boolean }
    } catch (error) {
      if (!assertContext.isCurrent()) return undefined
      feedback.error(axios.isAxiosError(error)
          ? error.response?.data?.message || error.message
          : error instanceof Error ? error.message : 'Could not save the client details')
      return undefined
    } finally {
      setBillingBusy(false)
    }
  }

  const apRows = useMemo(
    () =>
      requests.filter((row) => {
        const type = String(row.requestType || row.request_type || row.workflowType || '').toLowerCase()
        return includesAny(type, ['payable', 'ap_', 'remittance'])
      }),
    [requests],
  )

  useEffect(() => {
    if (!router.isReady) return
    const queryTab = String(router.query.tab || '').toLowerCase() as FinanceTab
    if (TAB_ORDER.includes(queryTab) && queryTab !== 'invoices') setTab(queryTab)

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
      const row = pool.find(
        (item) => String(item.id) === transactionId || String(item.transactionId || '') === transactionId,
      )
      if (row) setSelected({ kind: queryTab, row })
    }
  }, [router.isReady, router.query, requisitions, fieldRuns, arRows, apRows, invoiceRows])

  const requestIdQuery = String(router.query.requestId || '')
  const openChain = router.query.source === 'platform' || String(router.query.tab || '') === 'ap'
  useEffect(() => {
    if (!router.isReady || !requestIdQuery || !openChain) return
    const headers = authHeaders()
    if (!headers) return
    void axios
      .get(`${backendUrl}/api/platform/requests/${encodeURIComponent(requestIdQuery)}`, { headers })
      .then((res) => setChainRequest(res.data))
      .catch(() => setChainRequest(null))
  }, [router.isReady, requestIdQuery, openChain, backendUrl])

  const purchaseRequests = useMemo(
    () =>
      requests.filter((row) => {
        const type = String(row.requestType || row.request_type || '').toLowerCase()
        return type.includes('requisition')
      }),
    [requests],
  )

  /** Platform requests (payables, collections, school fees) as list rows that open the detail drawer. */
  const requestListRows = useCallback(
    (rows: any[], kind: FinanceTab, flowLabel: string, flowColor: string): FinanceListRow[] =>
      rows.map((row) => ({
        id: String(row.id),
        title: row.title || row.id,
        flowLabel,
        flowColor,
        status: String(row.status || 'pending').toUpperCase(),
        dateLabel: formatTxnTime(row.updatedAt || row.createdAt) || undefined,
        note: relatedWorkLine(row.family) || row.description,
        amountLabel: row.amount != null ? fmt(Number(row.amount), row.currency || 'USD') : undefined,
        trailing: row.family?.fromLabel ? (
          <Badge size="xs" variant="outline">
            {row.family.fromLabel}
          </Badge>
        ) : undefined,
        onClick: () => setSelected({ kind, row }),
      })),
    [],
  )

  // One row array per tab feeds both the Cards and the Table view, so a row opens the same drawer either way.
  const requisitionListRows = useMemo<FinanceListRow[]>(
    () => [
      ...requisitions.map((row) => ({
        id: String(row.id),
        title: row.metadata?.department ? `Requisition · ${row.metadata.department}` : `Requisition · ${row.id}`,
        flowLabel: 'REQUISITION',
        flowColor: 'indigo',
        status: String(row.status || 'UNKNOWN'),
        statusColor: 'indigo',
        dateLabel: formatTxnTime(row.updatedAt) || undefined,
        note: row.metadata?.notes,
        amountLabel: fmt(Number(row.metadata?.amount || 0), row.metadata?.currency || 'USD'),
        onClick: () => setSelected({ kind: 'requisitions', row }),
      })),
      ...purchaseRequests.map((row) => ({
        id: String(row.id),
        title: row.title || 'Purchase request',
        flowLabel: 'PURCHASE',
        flowColor: 'indigo',
        status: String(row.status || '').toUpperCase(),
        dateLabel: formatTxnTime(row.updated_at || row.updatedAt || row.created_at || row.createdAt) || undefined,
        note: relatedWorkLine(row.family),
        amountLabel: row.amount != null ? fmt(Number(row.amount), row.currency || 'USD') : undefined,
        onClick: () => void router.push(`/requests?tab=requisitions&request=${encodeURIComponent(row.id)}`),
      })),
    ],
    [requisitions, purchaseRequests, router],
  )

  const fieldListRows = useMemo<FinanceListRow[]>(
    () =>
      fieldRuns.map((run) => {
        const input = run.output?.workflowInput || run.input || {}
        const stage = String(run.output?.workflowStage || run.output?.stage || run.status || 'RUNNING')
        return {
          id: String(run.id),
          title: jobHeading(input).title,
          flowLabel: 'JOB',
          flowColor: 'teal',
          status: jobStatusLabel(String(run.status || ''), stage, String(run.output?.pauseReason || '')),
          statusColor: 'teal',
          note: input.location,
          dateLabel: formatTxnTime(run.updatedAt || run.updated_at || run.createdAt || run.created_at) || undefined,
          amountLabel: input.amount ? fmt(Number(input.amount), input.currency || 'USD') : undefined,
          onClick: () => setSelected({ kind: 'field', row: run }),
        }
      }),
    [fieldRuns],
  )

  const invoiceListRows = useMemo(
    () => requestListRows(invoiceRows, 'invoices', 'INVOICE FLOW', 'teal'),
    [invoiceRows, requestListRows],
  )

  const arListRows = useMemo<FinanceListRow[]>(
    () => [
      ...paymentLinks.map((row) => ({
        id: String(row.id),
        title: row.description || 'Client payment',
        flowLabel: 'MONEY IN',
        flowColor: 'grape',
        status: String(row.status || '').toUpperCase(),
        statusColor: row.status === 'paid' ? 'green' : 'grape',
        dateLabel: formatTxnTime(row.paidAt || row.paid_at || row.createdAt || row.created_at) || undefined,
        note: row.invoiceRef || row.invoice_ref ? `Reference ${row.invoiceRef || row.invoice_ref}` : undefined,
        amountLabel: fmt(Number(row.amount || 0), row.currency || 'USD'),
        financeLine: row.obligationId
          ? `${moneyInKindWord(row)} · Owed ${fmt(Number(row.balanceDue ?? row.amount ?? 0), row.currency || 'USD')} · Received ${fmt(Number(row.settledAmount || 0), row.currency || 'USD')}`
          : undefined,
        onClick: () => setBillingItem({ link: row }),
      })),
      ...fieldJobBillingExceptions(fieldRuns, paymentLinks).map((item) => ({
        id: `billing-${item.runId}`,
        title: item.reference,
        flowLabel: 'CLIENT BILLING',
        flowColor: 'orange',
        status: item.status,
        note: item.note,
        onClick: () => setBillingItem({ run: fieldRuns.find((run) => run.id === item.runId) }),
      })),
      ...requestListRows(arRows, 'ar', 'MONEY IN', 'grape'),
    ],
    [paymentLinks, fieldRuns, arRows, requestListRows],
  )

  const apListRows = useMemo<FinanceListRow[]>(
    () => [
      ...bills.map((row) => {
        const supplier = suppliers.find((item) => item.id === row.supplier_id)
        return {
          id: String(row.id),
          title: `${row.invoice_ref || 'Bill'} · ${supplier?.supplier_name || 'Supplier'}`,
          flowLabel: 'MONEY OUT',
          flowColor: 'orange',
          status: String(row.status || '').toUpperCase(),
          statusColor: row.status === 'paid' ? 'green' : 'orange',
          dateLabel: formatTxnTime(row.updated_at || row.created_at) || undefined,
          note: row.project_ref ? `Job ${row.project_ref}` : row.description,
          amountLabel: fmt(
            Number(row.status === 'paid' ? (row.amount ?? 0) : (row.balance_due ?? row.amount ?? 0)),
            row.currency || 'USD',
          ),
          financeLine: row.obligation_id
            ? `Purchase · ${row.match_status === 'matched' ? 'Order, receipt and bill match' : row.match_status === 'disputed' ? 'Amounts do not match' : 'Direct supplier bill'} · Owed ${fmt(Number(row.obligation_balance_due ?? row.balance_due ?? 0), row.currency || 'USD')} · Paid ${fmt(Number(row.obligation_original_amount || row.amount || 0) - Number(row.obligation_balance_due ?? row.balance_due ?? 0), row.currency || 'USD')}`
            : undefined,
          trailing:
            row.match_status === 'disputed' ? (
              <Button
                size="compact-xs"
                color="red"
                variant="light"
                onClick={(event) => {
                  event.stopPropagation()
                  const headers = authHeaders()
                  if (!headers) return
                  void axios
                    .post(
                      `${backendUrl}/api/finance/ap/invoices/${encodeURIComponent(row.id)}/resolve-match`,
                      {
                        decision: 'accept_variance',
                        note: 'Accepted by finance after reviewing the order, receipt and supplier bill.',
                      },
                      { headers },
                    )
                    .then(() => load())
                }}
              >
                Accept difference
              </Button>
            ) : undefined,
          onClick: () => {
            if (row.source_request_id) {
              void router.push(`/finance?tab=ap&requestId=${encodeURIComponent(row.source_request_id)}`)
              return
            }
            setMoneyItem({
              title: `Supplier bill ${row.invoice_ref || ''}`.trim(),
              trail: trailFromSupplierBill({ ...row, supplierName: supplier?.supplier_name }),
            })
          },
        }
      }),
      ...suppliers.map((row) => ({
        id: `supplier-${row.id}`,
        title: row.supplier_name || 'Supplier',
        flowLabel: 'SUPPLIER',
        flowColor: 'orange',
        status: Number(row.total_outstanding) > 0 ? 'OUTSTANDING' : 'SETTLED',
        statusColor: Number(row.total_outstanding) > 0 ? 'orange' : 'green',
        amountLabel: fmt(Number(row.total_outstanding || 0), 'USD'),
      })),
      ...requestListRows(apRows, 'ap', 'AP PAYABLE', 'orange'),
    ],
    [bills, suppliers, apRows, requestListRows, router, backendUrl],
  )

  const listForTab: Record<FinanceTab, { rows: FinanceListRow[]; noteLabel: string; empty: string }> = {
    requisitions: { rows: requisitionListRows, noteLabel: 'Note', empty: 'No purchase requests yet.' },
    field: { rows: fieldListRows, noteLabel: 'Location', empty: 'No jobs yet.' },
    invoices: { rows: invoiceListRows, noteLabel: 'Note', empty: 'No invoices yet.' },
    ar: { rows: arListRows, noteLabel: 'Reference', empty: 'No client balances or payments yet.' },
    ap: { rows: apListRows, noteLabel: 'Job', empty: 'No supplier balances or payments yet.' },
  }

  /** CSV of the rows on screen for the active tab: same columns, same order as the table. */
  const exportVisible = () => {
    const current = listForTab[tab]
    const body = csvFrom(FINANCE_TABLE_HEADERS(current.noteLabel), financeRowsToCells(current.rows))
    void saveExport(
      exportFileName(`finance-${tab}-${new Date().toISOString().slice(0, 10)}`, 'csv'),
      EXPORT_MIME.csv,
      body,
    )
  }

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
        lines: [{ text: `Department: ${row.metadata?.department || '—'}` }, { text: `Reference: ${row.id}` }],
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
      const trail = buildJobAuditTrail(run, people)
      const heading = jobHeading(input)
      return {
        title: heading.title,
        status: jobStatusLabel(String(run.status || ''), stage, String(run.output?.pauseReason || '')),
        amount: Number(input.amount || input.budget || 0),
        currency: input.currency || 'USD',
        lines: [
          ...(input.clientName ? [{ text: `Client: ${input.clientName}` }] : []),
          ...(input.reference || input.poNumber ? [{ text: `Reference: ${input.reference || input.poNumber}` }] : []),
          ...(input.location ? [{ text: `Location: ${input.location}` }] : []),
        ],
        stages: feptStages(stage, run.output || {}).map((item) => ({
          ...item,
          at: stageTimes(trail)[item.key],
        })),
        actors: actorsForWorkflow(actorReports, ['field', 'fept']),
        assigneeName: stagePersonName(String(run.output?.assignment?.assigneeId || input.assigneeId || ''), people),
        whoDid: whoDidStages(trail),
        media: stageMedia(trail),
        // The job card holds the step actions (site check, review, sign-off, payment) and the full history.
        href: `/finance/job-cards?runId=${encodeURIComponent(String(run.id || ''))}`,
        hrefLabel: 'Open job card',
      }
    }
    const row = selected.row
    const typeHints =
      selected.kind === 'ap'
        ? ['payable', 'ap']
        : selected.kind === 'invoices'
          ? ['education', 'school', 'fee']
          : ['receivable', 'collect', 'ar']
    const catalog = selected.kind === 'ap' ? AP_STAGES : selected.kind === 'invoices' ? INVOICE_STAGES : AR_STAGES
    const stages: FinanceStageView[] = requestStages(catalog, row.status)
    return {
      title: row.title || row.id,
      status: String(row.status || 'pending'),
      amount: Number(row.amount || 0),
      currency: row.currency || 'USD',
      lines: [
        {
          text: `Type: ${requestKindLabel(row.requestType || row.request_type || row.workflowType || (selected.kind === 'ap' ? 'Money out' : selected.kind === 'invoices' ? 'School fees' : 'Money in'))}`,
        },
      ],
      stages,
      actors: actorsForWorkflow(actorReports, typeHints),
      href: selected.kind === 'invoices' ? '/finance/school-fees' : '/inbox',
      hrefLabel: selected.kind === 'invoices' ? 'Open school fees' : 'Open in inbox',
    }
  }, [selected, actorReports, people])

  const visibleTabs = TAB_ORDER.filter((key) => (key === 'ar' || key === 'ap') && (enabled[key] || key === tab))

  return (
    <Layout title="Money">
      {inboxTask && loadError && <Paper p="md"><Text c="red">{loadError}</Text><Button onClick={() => void load()}>Try again</Button></Paper>}
      <Container size="xl" py="md" style={inboxTask ? { display: 'none' } : undefined}>
        <Group justify="space-between" mb="md">
          <div>
            <Title order={3}>Money</Title>
            <Text size="sm" c="dimmed">
              Money in is what clients owe and pay. Money out is what the organisation owes and pays. Jobs, purchases
              and fees keep their own operational history.
            </Text>
          </div>
          <Group>
            <FinanceViewToggle view={listView} onChange={setListView} onExport={exportVisible} />
            <Button variant="light" leftSection={<IconChartBar size={16} />} component={Link} href="/finance/reports">
              Reports
            </Button>
            <Button
              variant="light"
              leftSection={<IconRefresh size={16} />}
              onClick={() => void load()}
              loading={loading}
            >
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
            {visibleTabs.includes('ar') && (
              <Tabs.Tab value="ar" leftSection={<IconReceipt size={14} />}>
                Money in
              </Tabs.Tab>
            )}
            {visibleTabs.includes('ap') && (
              <Tabs.Tab value="ap" leftSection={<IconCash size={14} />}>
                Money out
              </Tabs.Tab>
            )}
          </Tabs.List>

          <Tabs.Panel value="requisitions" pt="md">
            <Stack gap="sm">
              <Button component={Link} href="/finance/requisitions/new">
                New requisition
              </Button>
              <FinanceListRows
                rows={requisitionListRows}
                view={listView}
                noteLabel="Note"
                loading={loading}
                empty="No purchase requests yet."
              />
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="field" pt="md">
            <Stack gap="sm">
              <Button component={Link} href="/finance/job-cards">
                Open job cards
              </Button>
              <FinanceListRows
                rows={fieldListRows}
                view={listView}
                noteLabel="Location"
                loading={loading}
                empty="No jobs yet."
              />
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="invoices" pt="md">
            <FinanceListRows
              rows={invoiceListRows}
              view={listView}
              noteLabel="Note"
              loading={loading}
              empty="No invoices yet."
            />
          </Tabs.Panel>
          <Tabs.Panel value="ar" pt="md">
            <Paper withBorder radius="md" p="md" mb="md">
              <Stack gap="sm">
                <Text fw={600}>Collect a client payment</Text>
                <ContactPickerSelect
                  contacts={contacts}
                  requirePhone={false}
                  label="Pick the client from contacts"
                  onPick={(picked) => {
                    if (picked)
                      setArForm({
                        ...arForm,
                        payerName: picked.name || arForm.payerName,
                        payerPhone: picked.phone || arForm.payerPhone,
                      })
                  }}
                />
                <Group grow align="end">
                  <TextInput
                    label="What is this for?"
                    value={arForm.description}
                    onChange={(e) => setArForm({ ...arForm, description: e.currentTarget.value })}
                  />
                  <TextInput
                    label="Client"
                    value={arForm.payerName}
                    onChange={(e) => setArForm({ ...arForm, payerName: e.currentTarget.value })}
                  />
                  <TextInput
                    label="Client mobile"
                    value={arForm.payerPhone}
                    onChange={(e) => setArForm({ ...arForm, payerPhone: e.currentTarget.value })}
                  />
                  <NumberInput
                    label="Amount"
                    min={0}
                    value={arForm.totalAmount}
                    onChange={(value) => setArForm({ ...arForm, totalAmount: value })}
                  />
                </Group>
                <Group grow align="end">
                  <Select
                    label="Payment terms"
                    data={[
                      { value: 'one_time', label: 'One payment' },
                      { value: 'instalment', label: 'Instalments' },
                      { value: 'recurring', label: 'Recurring' },
                    ]}
                    value={arForm.collectionType}
                    onChange={(value) => setArForm({ ...arForm, collectionType: value || 'one_time' })}
                  />
                  {arForm.collectionType !== 'one_time' && (
                    <NumberInput
                      label="Payments"
                      min={2}
                      max={60}
                      value={arForm.instalments}
                      onChange={(value) => setArForm({ ...arForm, instalments: value })}
                    />
                  )}
                  {arForm.collectionType !== 'one_time' && (
                    <Select
                      label="How often"
                      data={['weekly', 'monthly', 'quarterly']}
                      value={arForm.cadence}
                      onChange={(value) => setArForm({ ...arForm, cadence: value || 'monthly' })}
                    />
                  )}
                  {arForm.collectionType !== 'one_time' && (
                    <TextInput
                      type="date"
                      label="First due"
                      value={arForm.firstDueDate}
                      onChange={(e) => setArForm({ ...arForm, firstDueDate: e.currentTarget.value })}
                    />
                  )}
                  <Button onClick={() => void createArPlan()}>Create payment plan</Button>
                </Group>
                {arPlans.map((plan) => (
                  <Group key={plan.id} justify="space-between">
                    <Text size="sm">
                      {plan.description} · {fmt(Number(plan.total_amount || 0), plan.currency)} ·{' '}
                      {String(plan.status || '').replace(/_/g, ' ')}
                    </Text>
                    <Group gap="xs">
                      {plan.status === 'active' && (
                        <Button size="compact-xs" variant="light" onClick={() => void remindArPlan(String(plan.id))}>
                          Send reminder
                        </Button>
                      )}
                      {plan.status === 'active' && (
                        <Button
                          size="compact-xs"
                          color="red"
                          variant="subtle"
                          onClick={() => void cancelArPlan(String(plan.id))}
                        >
                          Cancel plan
                        </Button>
                      )}
                    </Group>
                  </Group>
                ))}
              </Stack>
            </Paper>
            <Text size="sm" c="dimmed" mb="xs">
              Money coming in. These are amounts clients owe, or have paid, the organisation.
            </Text>
            <FinanceListRows
              rows={arListRows}
              view={listView}
              noteLabel="Reference"
              loading={loading}
              empty="No client balances or payments yet."
            />
          </Tabs.Panel>
          <Tabs.Panel value="ap" pt="md">
            <Stack gap="sm" mb="md">
              <TextInput
                label="Supplier"
                placeholder="Supplier name"
                value={bill.supplierName}
                onChange={(e) => setBill({ ...bill, supplierName: e.currentTarget.value })}
              />
              <TextInput
                label="Invoice reference"
                placeholder="INV-1001"
                value={bill.invoiceRef}
                onChange={(e) => setBill({ ...bill, invoiceRef: e.currentTarget.value })}
              />
              <TextInput
                label="Amount"
                placeholder="150.00"
                value={bill.amount}
                onChange={(e) => setBill({ ...bill, amount: e.currentTarget.value })}
              />
              <Button
                loading={savingBill}
                onClick={() => {
                  const supplierName = bill.supplierName.trim()
                  const invoiceRef = bill.invoiceRef.trim()
                  const amount = Number(bill.amount)
                  if (!supplierName || !invoiceRef || !amount) return
                  const headers = authHeaders()
                  if (!headers) return
                  setSavingBill(true)
                  void axios
                    .post(`${backendUrl}/api/finance/ap/suppliers`, { supplierName }, { headers })
                    .then((created) =>
                      axios.post(
                        `${backendUrl}/api/finance/ap/invoices`,
                        {
                          supplierId: created.data?.id,
                          invoiceRef,
                          amount,
                          currency: 'USD',
                        },
                        { headers },
                      ),
                    )
                    .then(() => {
                      setBill({ supplierName: '', invoiceRef: '', amount: '' })
                      return load()
                    })
                    .finally(() => setSavingBill(false))
                }}
              >
                Record supplier bill
              </Button>
            </Stack>
            <Text size="sm" c="dimmed" mb="xs">
              Money going out. These are amounts the organisation owes suppliers.
            </Text>
            <FinanceListRows
              rows={apListRows}
              view={listView}
              noteLabel="Job"
              loading={loading}
              empty="No supplier balances or payments yet."
            />
          </Tabs.Panel>
        </Tabs>
      </Container>

      <Drawer
        opened={Boolean(detail)}
        onClose={() => {
          if (!returnToInbox()) setSelected(null)
        }}
        position="right"
        size="lg"
        title={detail?.title || 'Workflow'}
      >
        {detail && (
          <WorkflowDetailBody
            statusCard={
              <DetailStatusCard
                status={detail.status}
                amount={detail.amount}
                currency={detail.currency}
                lines={detail.lines}
              />
            }
            sections={[
              {
                title: '',
                content: (
                  <StageActorTimeline
                    stages={detail.stages}
                    actors={detail.actors}
                    people={people}
                    assigneeName={detail.assigneeName}
                    whoDid={detail.whoDid}
                    media={detail.media}
                  />
                ),
              },
            ]}
            auditItems={[]}
            auditEmptyText="Who did each step, when and with what proof is under the job card's History tab."
            showHistory={selected?.kind !== 'field'}
          />
        )}
        {detail && (
          <Button mt="md" component={Link} href={detail.href} fullWidth>
            {detail.hrefLabel}
          </Button>
        )}
      </Drawer>

      <Drawer
        opened={Boolean(billingItem)}
        onClose={() => {
          if (!returnToInbox()) setBillingItem(null)
        }}
        position="right"
        size="lg"
        title="Client billing"
      >
        {billingItem && (
          <ClientBillingDetails
            contacts={contacts}
            link={billingItem.link}
            run={billingItem.run}
            busy={billingBusy}
            canManage={['owner', 'admin', 'issuer', 'manager', 'approver'].includes(
              String(readActiveOrganization()?.role || ''),
            )}
            onSend={sendBilling}
            onSavePayer={saveBillingPayer}
            onOpenJob={
              billingItem.run?.id || billingItem.link?.sourceRunId
                ? () => {
                    const id = billingItem.run?.id || billingItem.link?.sourceRunId
                    const path = `/finance/job-cards?runId=${encodeURIComponent(id)}`
                    try {
                      if (getPortalTask()) registerLinkedTaskPath(localStorage, router.asPath, path, [path])
                    } catch (error) {
                      feedback.error(error instanceof Error ? error.message : 'Could not open linked job')
                      return
                    }
                    setBillingItem(null)
                    void router.push(path)
                  }
                : undefined
            }
          />
        )}
      </Drawer>
      <Drawer
        opened={Boolean(chainRequest || moneyItem)}
        onClose={() => {
          if (returnToInbox()) return
          setChainRequest(null)
          setMoneyItem(null)
        }}
        position="right"
        size="lg"
        title={moneyItem?.title || chainHistoryTitle(chainRequest)}
      >
        {(chainRequest || moneyItem) && (
          <JobAuditTrailPanel trail={moneyItem?.trail || trailFromRequest(chainRequest, people)} embedded />
        )}
      </Drawer>
    </Layout>
  )
}
