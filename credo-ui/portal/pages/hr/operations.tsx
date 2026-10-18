import { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import axios from 'axios'
import { Alert, Badge, Button, Card, Group, Loader, Stack, Tabs, Text, Title } from '@mantine/core'
import { IconCalendar, IconChevronRight, IconPlus, IconReceipt } from '@tabler/icons-react'
import Layout from '@/components/Layout'
import RequestSheet from '@/components/requests/RequestSheet'
import { StepHelp } from '@/components/help/StepHelp'
import { requestKindLine, requestStatusWords, type RequestContext } from '@/lib/requestCatalog'
import { EnvContext } from '@/pages/_app'
import { getOrgScopedToken, getPersonalToken, readActiveOrganization } from '@/utils/organizationContext'

type HrKind = 'hr.leave' | 'finance.expense_claim'

interface RequestRow {
  id: string
  title?: string
  description?: string
  amount?: number | null
  currency?: string | null
  status?: string
  created_at?: string
  context_json?: string
}

const KINDS: Record<HrKind, { tab: string; empty: string; newLabel: string }> = {
  'hr.leave': { tab: 'Time off', empty: 'No time-off requests yet.', newLabel: 'Ask for time off' },
  'finance.expense_claim': { tab: 'Expense claims', empty: 'No expense claims yet.', newLabel: 'Claim an expense' },
}

const HELP = {
  title: 'Time off and expenses',
  points: [
    'Each request goes to the person your setup answers chose to decide it.',
    'Open a request to approve or decline it. The decision is signed and kept on the request.',
    'Approved expense claims move on to payment in Money.',
  ],
}

function contextOf(row: RequestRow): Record<string, unknown> {
  try {
    return JSON.parse(row.context_json || '{}')
  } catch {
    return {}
  }
}

const HrOperations = () => {
  const env = useContext(EnvContext)
  const backendUrl = env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000'
  const [kind, setKind] = useState<HrKind>('hr.leave')
  const [rows, setRows] = useState<RequestRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [context, setContext] = useState<RequestContext>({ contextMode: 'personal' })

  useEffect(() => {
    const org = readActiveOrganization()
    setContext(
      org?.orgTenantId
        ? { contextMode: 'org', activeOrgTenantId: org.orgTenantId, activeOrgName: org.name, orgRole: org.role }
        : { contextMode: 'personal' },
    )
  }, [])

  const load = useCallback(async () => {
    const org = readActiveOrganization()
    const token = (org?.orgTenantId ? getOrgScopedToken() : null) || getPersonalToken()
    if (!token) {
      setRows([])
      setError('Sign in and pick your organization to see requests.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await axios.get(`${backendUrl}/api/platform/requests`, {
        params: { requestType: kind, limit: 50 },
        headers: { Authorization: `Bearer ${token}` },
      })
      setRows(Array.isArray(res.data?.items) ? res.data.items : [])
    } catch (err: any) {
      setRows([])
      setError(err?.response?.data?.message || 'Could not load requests.')
    } finally {
      setLoading(false)
    }
  }, [backendUrl, kind])

  useEffect(() => {
    void load()
  }, [load])

  const words = KINDS[kind]
  const list = useMemo(() => rows, [rows])

  return (
    <Layout>
      <Head>
        <title>Time off and expenses | Credentis Portal</title>
      </Head>
      <Stack p="lg" gap="md">
        <Group justify="space-between" align="center">
          <Group gap="xs">
            <Title order={2}>Time off and expenses</Title>
            <StepHelp {...HELP} />
          </Group>
          <Button leftSection={<IconPlus size={16} />} onClick={() => setSheetOpen(true)}>
            {words.newLabel}
          </Button>
        </Group>

        <Tabs value={kind} onChange={(value) => value && setKind(value as HrKind)}>
          <Tabs.List>
            <Tabs.Tab value="hr.leave" leftSection={<IconCalendar size={16} />}>{KINDS['hr.leave'].tab}</Tabs.Tab>
            <Tabs.Tab value="finance.expense_claim" leftSection={<IconReceipt size={16} />}>{KINDS['finance.expense_claim'].tab}</Tabs.Tab>
          </Tabs.List>
        </Tabs>

        {error && <Alert color="red">{error}</Alert>}
        {loading ? (
          <Group justify="center" p="xl"><Loader size="sm" /></Group>
        ) : list.length === 0 && !error ? (
          <Text c="dimmed" ta="center" p="xl">{words.empty}</Text>
        ) : (
          <Stack gap="xs">
            {list.map((row) => {
              const status = requestStatusWords(row.status)
              const line = requestKindLine(kind, contextOf(row))
              const money = kind === 'finance.expense_claim' && row.amount ? `${row.currency || ''} ${row.amount}`.trim() : ''
              return (
                <Card key={row.id} withBorder padding="sm" component={Link} href={`/requests?request=${encodeURIComponent(row.id)}`}>
                  <Group justify="space-between" wrap="nowrap">
                    <Stack gap={2} style={{ minWidth: 0 }}>
                      <Text fw={600} truncate>{row.title || words.tab}</Text>
                      <Text size="sm" c="dimmed" truncate>
                        {[line, money, row.created_at ? new Date(row.created_at).toLocaleDateString() : ''].filter(Boolean).join(' · ')}
                      </Text>
                    </Stack>
                    <Group gap="xs" wrap="nowrap">
                      <Badge color={status.color} variant="light">{status.label}</Badge>
                      <IconChevronRight size={16} />
                    </Group>
                  </Group>
                </Card>
              )
            })}
          </Stack>
        )}
      </Stack>
      <RequestSheet
        opened={sheetOpen}
        onClose={() => {
          setSheetOpen(false)
          void load()
        }}
        context={context}
        initialKindId={kind}
      />
    </Layout>
  )
}

export default HrOperations
