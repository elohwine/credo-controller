import React, { useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import {
  Alert, Badge, Box, Button, Container, Divider, Drawer, Group, Loader, Paper, Stack, Text, ThemeIcon, Title,
} from '@mantine/core'
import { IconBuilding, IconChevronRight, IconFileText, IconRefresh } from '@tabler/icons-react'
import Link from 'next/link'
import Layout from '@/components/Layout'
import JobAuditTrailPanel from '@/components/workflows/JobAuditTrailPanel'
import { StageActorTimeline } from '@/components/finance/StageActorTimeline'
import { assertRequestDetail, requestExperienceForRow, requestWhoDid, type RequestExperience } from '../../../shared/requestExperience'
import { trailFromRequest } from '@/components/finance/jobAuditTrail'
import { getPersonalToken } from '@/utils/organizationContext'
import { formatTxnTime } from '@/lib/inboxAttention'
import { requestKindLabel, requestKindLine, requestListBucket, requestStatusWords } from '@/lib/requestCatalog'

const backendUrl = process.env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000'

/**
 * One row in "My requests": a request raised to one of my organisations (request engine) or to
 * another organisation (quote, bill, service). Both apps show the same list.
 */
interface MyRequestRow {
  id: string
  source: 'org' | 'business'
  kind: string
  title: string
  line: string
  orgName: string
  orgTenantId?: string
  status: string
  createdAt: string
  declineReason?: string
  experience?: RequestExperience
}

function toOrgRow(request: any): MyRequestRow {
  const context = request?.context || (() => {
    try { return JSON.parse(request?.context_json || '{}') } catch { return {} }
  })()
  return {
    id: String(request.id),
    source: 'org',
    kind: String(request.request_type || ''),
    title: String(request.title || requestKindLabel(request.request_type)),
    line: requestKindLine(request.request_type, context) || requestKindLabel(request.request_type),
    orgName: String(request.org_name || ''),
    orgTenantId: request.org_tenant_id ? String(request.org_tenant_id) : undefined,
    status: String(request.status || 'submitted'),
    experience: request.experience,
    createdAt: String(request.created_at || request.createdAt || new Date().toISOString()),
  }
}

function toBusinessRow(request: any): MyRequestRow {
  const payload = (request?.payload || {}) as Record<string, any>
  const title = String(payload.title || payload.description || payload.serviceName || requestKindLabel(request.requestType))
  return {
    id: String(request.id),
    source: 'business',
    kind: String(request.requestType || ''),
    title,
    line: requestKindLabel(request.requestType),
    orgName: String(request.targetOrgName || request.contactName || 'Organisation'),
    orgTenantId: request.targetOrgTenantId ? String(request.targetOrgTenantId) : undefined,
    status: String(request.status || 'pending'),
    createdAt: String(request.createdAt || new Date().toISOString()),
    declineReason: request.rejectionReason ? String(request.rejectionReason) : undefined,
  }
}

function RequestCard({ row, onClick }: { row: MyRequestRow; onClick: () => void }) {
  const status = requestStatusWords(row.status)
  return (
    <Paper component="button" type="button" p="md" radius="md" withBorder onClick={onClick} style={{ cursor: 'pointer', width: '100%', textAlign: 'left' }}>
      <Group wrap="nowrap">
        <ThemeIcon size="lg" radius="md" variant="light" color={status.color}>
          <IconFileText size={20} />
        </ThemeIcon>
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Group gap="xs" wrap="nowrap">
            <Text size="sm" fw={600} lineClamp={1} style={{ flex: 1 }}>{row.title}</Text>
            <Badge size="sm" variant="light" color={status.color}>{status.label}</Badge>
          </Group>
          {row.line && row.line !== row.title && (
            <Text size="xs" c="dimmed" lineClamp={1} mt={2}>{row.line}</Text>
          )}
          <Group gap="xs" mt={4}>
            <IconBuilding size={12} color="#94a3b8" />
            <Text size="xs" c="dimmed" lineClamp={1}>{row.orgName}</Text>
          </Group>
          <Text size="xs" c="dimmed" mt={4}>Sent {formatTxnTime(row.createdAt) || '—'}</Text>
          {row.declineReason && <Text size="xs" c="red" mt={4}>Declined: {row.declineReason}</Text>}
        </Box>
        <IconChevronRight size={18} color="#94a3b8" />
      </Group>
    </Paper>
  )
}

export default function MyRequestsPage() {
  const [rows, setRows] = useState<MyRequestRow[]>([])
  const [loading, setLoading] = useState(true)
  const [signedOut, setSignedOut] = useState(false)
  const [selected, setSelected] = useState<MyRequestRow | null>(null)
  const [detail, setDetail] = useState<any | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [detailError, setDetailError] = useState('')
  const detailAttempt = useRef(0)

  useEffect(() => {
    void loadRequests()
  }, [])

  const loadRequests = async () => {
    setLoading(true)
    setLoadError('')
    try {
      const token = getPersonalToken()
      if (!token) {
        setSignedOut(true)
        return
      }
      const headers = { Authorization: `Bearer ${token}` }
      const [mineResult, outboundResult] = await Promise.allSettled([
        axios.get(`${backendUrl}/api/platform/requests/mine`, { headers, params: { limit: 100 } }),
        axios.get(`${backendUrl}/workflow-requests/outbound`, { headers }),
      ])
      const mine = mineResult.status === 'fulfilled' ? mineResult.value : null
      const outbound = outboundResult.status === 'fulfilled' ? outboundResult.value : null
      if (!mine || !outbound) setLoadError('Some requests could not be loaded. This list may be incomplete; try again.')
      const orgRows = (Array.isArray(mine?.data?.items) ? mine!.data.items : []).map(toOrgRow)
      const businessList = Array.isArray(outbound?.data) ? outbound!.data : Array.isArray(outbound?.data?.requests) ? outbound!.data.requests : []
      const businessRows = businessList.map(toBusinessRow)
      setRows([...orgRows, ...businessRows].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))
    } catch {
      setLoadError('Could not load your requests. Try again.')
    } finally {
      setLoading(false)
    }
  }

  const openRow = async (row: MyRequestRow) => {
    const attempt = ++detailAttempt.current
    setSelected(row)
    setDetail(null)
    setDetailError('')
    const token = getPersonalToken()
    if (!token) return
    setDetailLoading(true)
    try {
      const path = row.source === 'org' ? `/api/platform/requests/mine/${encodeURIComponent(row.id)}` : `/workflow-requests/${encodeURIComponent(row.id)}`
      const res = await axios.get(`${backendUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } })
      if (detailAttempt.current !== attempt) return
      assertRequestDetail(res.data, row.id)
      setDetail(res.data || null)
    } catch {
      if (detailAttempt.current === attempt) setDetailError('Could not load this request. Close it and try again.')
    } finally {
      if (detailAttempt.current === attempt) setDetailLoading(false)
    }
  }

  const trail = useMemo(() => (detail && selected?.source === 'org' ? trailFromRequest(detail, Array.isArray(detail.people) ? detail.people : []) : null), [detail, selected?.source])
  const progress = selected ? requestExperienceForRow(detail || selected) : null
  const whoDid = selected ? requestWhoDid(detail || selected, Array.isArray(detail?.people) ? detail.people : []) : {}

  const open = rows.filter((row) => requestListBucket(row.kind, row.status) === 'waiting')
  const done = rows.filter((row) => requestListBucket(row.kind, row.status) === 'done')
  const other = rows.filter((row) => requestListBucket(row.kind, row.status) === 'closed')

  const section = (label: string, list: MyRequestRow[], divider: boolean) =>
    list.length > 0 && (
      <Box>
        {divider && <Divider my="md" />}
        <Text size="sm" fw={600} mb="sm" c="dimmed">{label} ({list.length})</Text>
        <Stack gap="sm">
          {list.map((row) => (
            <RequestCard key={`${row.source}:${row.id}`} row={row} onClick={() => void openRow(row)} />
          ))}
        </Stack>
      </Box>
    )

  return (
    <Layout title="My requests">
      <Container size="md" py="xl">
        <Stack gap="lg">
          <Group justify="space-between" align="flex-end">
            <Box>
              <Title order={2}>My requests</Title>
              <Text c="dimmed" size="sm" mt={4}>Everything you asked for, and where it is.</Text>
            </Box>
            <Button variant="subtle" size="xs" leftSection={<IconRefresh size={14} />} onClick={() => void loadRequests()}>
              Refresh
            </Button>
          </Group>

          {loading && <Group justify="center" py="xl"><Loader size="sm" /></Group>}
          {loadError && <Alert color="red">{loadError}</Alert>}

          {!loading && signedOut && (
            <Paper withBorder radius="md" p="lg">
              <Text size="sm">Sign in to see your requests.</Text>
            </Paper>
          )}

          {!loading && !signedOut && rows.length === 0 && (
            <Paper withBorder radius="md" p="lg">
              <Stack gap="sm" align="center">
                <ThemeIcon size={48} radius="xl" variant="light"><IconFileText size={26} /></ThemeIcon>
                <Text fw={600}>Nothing asked for yet</Text>
                <Text size="sm" c="dimmed" ta="center">
                  Use Request on Home to ask for time off, an expense, a payout, a record sent again, or a quote from a business.
                </Text>
                <Button component={Link} href="/">Go to Home</Button>
              </Stack>
            </Paper>
          )}

          {!loading && rows.length > 0 && (
            <Stack gap="md">
              {section('Waiting', open, false)}
              {section('Done', done, open.length > 0)}
              {section('Declined or closed', other, open.length > 0 || done.length > 0)}
            </Stack>
          )}
        </Stack>
      </Container>

      <Drawer
        opened={Boolean(selected)}
        onClose={() => { detailAttempt.current += 1; setSelected(null); setDetailLoading(false) }}
        position="right"
        size="md"
        title={<Text fw={700}>{selected?.title || 'Request'}</Text>}
      >
        {selected && (
          <Stack gap="md">
            <Group gap="xs">
              <Badge variant="light" color={requestStatusWords(selected.status).color}>{requestStatusWords(selected.status).label}</Badge>
              <Text size="sm" c="dimmed">{selected.orgName}</Text>
            </Group>
            {selected.line && <Text size="sm">{selected.line}</Text>}
            {selected.declineReason && <Text size="sm" c="red">Declined: {selected.declineReason}</Text>}
            {detail?.description && <Text size="sm">{detail.description}</Text>}
            {detailLoading && <Group justify="center"><Loader size="sm" /></Group>}
            {detailError && <Alert color="red">{detailError}</Alert>}
            {!detailLoading && !detailError && progress && (
              <StageActorTimeline stages={progress.stages} whoDid={whoDid} title="Request progress"
                help={{ title: 'Request progress', points: [
                  "This shows the request's own review and fulfilment, not every payment or record in related work.",
                  'History below records who acted and when. Skipped steps are not recorded as completed.',
                  'An approval does not mean a credential was issued or accepted.',
                ] }} />
            )}
            {selected.source === 'org' && trail && <JobAuditTrailPanel trail={trail} compact embedded />}
            {selected.source === 'business' && (
              <Text size="sm" c="dimmed">
                {requestListBucket(selected.kind, selected.status) === 'waiting'
                  ? 'The organisation has it. Their answer arrives in your inbox.'
                  : 'Anything they sent back is in your inbox and your records.'}
              </Text>
            )}
          </Stack>
        )}
      </Drawer>
    </Layout>
  )
}
