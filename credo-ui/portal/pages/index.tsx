import React, { useEffect, useState } from 'react'
import axios from 'axios'
import Layout from '@/components/Layout'
import { getOrgScopedToken, getPersonalToken, readActiveOrganization } from '@/utils/organizationContext'
import {
    Anchor,
    Badge,
    Box,
    Button,
    Card,
    Container,
    Divider,
    Group,
    Paper,
    Modal,
    SimpleGrid,
    Stack,
    Text,
    Title,
    UnstyledButton,
} from '@mantine/core'
import {
    IconArrowRight,
    IconCircleCheck,
    IconBriefcase,
    IconCalendar,
    IconCash,
    IconCoins,
    IconFileText,
    IconId,
    IconMessage,
    IconMessagePlus,
    IconReceipt,
    IconSearch,
    IconShoppingCart,
    IconTool,
} from '@tabler/icons-react'
import Link from 'next/link'
import { CONTEXT_UPDATED_EVENT } from '@/lib/portalContext'
import { formatTxnTime, openInboxOffers } from '@/lib/inboxAttention'
import { nextStepCard, type NextStepItem } from '@/lib/nextSteps'
import { offerReplacement, stepRequiredLabel } from '@/components/finance/financeStages'
import { describeHolderActivity, type HolderActivityEntry } from '@/lib/holderActivity'
import { jobHeading } from '@/components/finance/jobAuditTrail'
import RequestSheet from '@/components/requests/RequestSheet'
import RecordCheckPanel from '@/components/records/RecordCheckPanel'
import {
    REQUEST_GROUP_WORDS,
    requestGroupsIn,
    requestKindsFor,
    type RequestContext,
    type RequestKind,
    type RequestKindIcon,
    type RequestOptions,
    type RequestRouteKey,
} from '@/lib/requestCatalog'

const BRAND = {
    curious: '#2188CA',
    linkWater: '#D0E6F3',
    viking: '#6FB4DC',
    dark: '#0A3D5C',
}

interface KpiTile {
    label: string
    value: string | number
    sub?: string
    color?: string
}

interface QuickLink {
    label: string
    description: string
    href?: string
    icon: React.ReactNode
    onClick?: () => void
    disabledLine?: string
}

interface AttentionItem {
    id: string
    title: string
    description: string
    action: string
    href: string
}

interface DashTile {
    label: string
    value: string | number
    href: string
}

/** One thing a person can ask for from Home. A link when it opens a screen, a button when it opens the Request sheet. */
const QuickLinkCard = ({ label, description, href, icon, onClick, disabledLine }: QuickLink) => {
    const card = (
        <Card
            withBorder
            radius="md"
            p="md"
            style={{
                cursor: disabledLine ? 'default' : 'pointer',
                opacity: disabledLine ? 0.6 : 1,
                height: '100%',
                transition: 'box-shadow 0.15s ease, transform 0.15s ease',
            }}
            onMouseEnter={(e) => {
                if (disabledLine) return
                ; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 20px rgba(33,136,202,0.15)'
                    ; (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'
            }}
            onMouseLeave={(e) => {
                ; (e.currentTarget as HTMLElement).style.boxShadow = ''
                    ; (e.currentTarget as HTMLElement).style.transform = ''
            }}
        >
            <Group gap="sm" wrap="nowrap" align="flex-start">
                <Box
                    style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        backgroundColor: BRAND.linkWater,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: BRAND.curious,
                        flexShrink: 0,
                    }}
                >
                    {icon}
                </Box>
                <Box style={{ minWidth: 0 }}>
                    <Text size="sm" fw={600}>
                        {label}
                    </Text>
                    <Text size="xs" c="dimmed" mt={2} lineClamp={2}>
                        {disabledLine || description}
                    </Text>
                </Box>
            </Group>
        </Card>
    )
    if (href && !onClick && !disabledLine) {
        return (
            <Anchor component={Link} href={href} underline="never">
                {card}
            </Anchor>
        )
    }
    if (onClick && !disabledLine) {
        return (
            <UnstyledButton onClick={onClick} style={{ width: '100%', display: 'block' }} aria-label={label}>
                {card}
            </UnstyledButton>
        )
    }
    return card
}

/** Where the catalogue rows that open a screen go on the website. */
const CATALOGUE_ROUTES: Record<RequestRouteKey, string> = {
    discover: '',
    purchase_request: '/finance/requisitions/new',
    new_job: '/finance/job-cards',
    collect_payment: '/finance?tab=ar',
    my_requests: '/requests/mine',
}

const CATALOGUE_ICONS: Record<RequestKindIcon, React.ReactNode> = {
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

const SectionTitle = ({
    label,
    emoji,
}: {
    label: string
    emoji?: string
}) => (
    <Box mb="sm">
        <Text
            size="xs"
            fw={700}
            tt="uppercase"
            c="dimmed"
            style={{ letterSpacing: '0.06em' }}
        >
            {emoji && `${emoji}  `}
            {label}
        </Text>
        <Divider mt={4} />
    </Box>
)

export default function DashboardPage() {
    const [orgName, setOrgName] = useState<string | null>(null)
    const [readinessPercent, setReadinessPercent] = useState<number | null>(null)
    const [readinessState, setReadinessState] = useState<string | null>(null)
    const [attentionItems, setAttentionItems] = useState<AttentionItem[]>([])
    const [nextSteps, setNextSteps] = useState<NextStepItem[]>([])
    const [tiles, setTiles] = useState<DashTile[]>([])
    const [activity, setActivity] = useState<Array<{ id: string; title: string; at?: string; href?: string }>>([])
    const [records, setRecords] = useState<Array<{ id: string; title: string }>>([])
    const [dashboardLoading, setDashboardLoading] = useState(true)
    const [contextVersion, setContextVersion] = useState(0)
    const [requestOptions, setRequestOptions] = useState<RequestOptions | null>(null)
    const [requestContext, setRequestContext] = useState<RequestContext>({ contextMode: 'personal' })
    const [requestOpen, setRequestOpen] = useState(false)
    const [checkOpen, setCheckOpen] = useState(false)
    const [requestKindId, setRequestKindId] = useState<string | undefined>(undefined)

    const backendUrl = process.env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000'

    const openRequest = (kindId?: string) => {
        setRequestKindId(kindId)
        setRequestOpen(true)
    }

    /** The same catalogue the Request sheet shows, laid out as cards on Home. */
    const catalogueRows = requestKindsFor(requestOptions, requestContext)
    const catalogueGroups = requestGroupsIn(catalogueRows)
    const catalogueCard = (row: RequestKind) => {
        const key = `${row.id}:${row.orgTenantId || ''}:${row.payoutJob?.workflowRunId || ''}`
        const href = row.routeKey && row.routeKey !== 'discover' ? CATALOGUE_ROUTES[row.routeKey] : undefined
        return (
            <QuickLinkCard
                key={key}
                label={row.label}
                description={row.line}
                icon={CATALOGUE_ICONS[row.icon]}
                href={href}
                onClick={href ? undefined : () => openRequest(row.payoutJob ? undefined : row.id)}
                disabledLine={row.disabledLine}
            />
        )
    }

    useEffect(() => {
        const refreshContext = () => setContextVersion((version) => version + 1)
        window.addEventListener(CONTEXT_UPDATED_EVENT, refreshContext)
        return () => window.removeEventListener(CONTEXT_UPDATED_EVENT, refreshContext)
    }, [])

    useEffect(() => {
        setDashboardLoading(true)
        setReadinessPercent(null)
        setReadinessState(null)
        setAttentionItems([])
        setNextSteps([])
        setTiles([])
        setActivity([])
        setRecords([])
        const activeOrg = readActiveOrganization()
        const orgToken = activeOrg?.orgTenantId ? getOrgScopedToken() : null
        const personalToken = getPersonalToken()
        setOrgName(activeOrg?.name || null)

        // What this person can ask for, from the same payload the Request sheet uses.
        const loadRequestCatalogue = async () => {
            setRequestOptions(null)
            const baseContext: RequestContext = activeOrg?.orgTenantId
                ? { contextMode: 'org', activeOrgTenantId: activeOrg.orgTenantId, activeOrgName: activeOrg.name, orgRole: activeOrg.role }
                : { contextMode: 'personal' }
            setRequestContext(baseContext)
            if (!personalToken) return
            try {
                const res = await axios.get(`${backendUrl}/api/platform/requests/options`, {
                    headers: { Authorization: `Bearer ${personalToken}` },
                })
                setRequestOptions(res.data || null)
            } catch {
                setRequestOptions(null)
            }
            if (activeOrg?.orgTenantId && orgToken) {
                try {
                    const workflows = await axios.get(
                        `${backendUrl}/api/organizations/${encodeURIComponent(activeOrg.orgTenantId)}/workflows`,
                        { headers: { Authorization: `Bearer ${orgToken}` } },
                    )
                    const types = Array.isArray(workflows.data?.workflowTypes) ? workflows.data.workflowTypes.map(String) : []
                    setRequestContext({ ...baseContext, activeWorkflowTypes: types })
                } catch {
                    // The grid shows every organisation action when the workflow list is unavailable.
                }
            }
        }
        void loadRequestCatalogue()

        const load = async () => {
            try {
                const headers = orgToken
                    ? { Authorization: `Bearer ${orgToken}` }
                    : personalToken
                        ? { Authorization: `Bearer ${personalToken}` }
                        : undefined
                if (!headers) {
                    setTiles([
                        { label: 'Waiting for you', value: 0, href: '/inbox' },
                        { label: 'My records', value: 'Open', href: '/wallet' },
                        { label: 'Organisations', value: 'Open', href: '/' },
                        { label: 'Your shares', value: 0, href: '/activity' },
                    ])
                    return
                }

                const requests: Array<Promise<any>> = []
                if (activeOrg?.orgTenantId && orgToken) {
                    requests.push(
                        axios.get(
                            `${backendUrl}/api/organizations/${encodeURIComponent(activeOrg.orgTenantId)}/setup/readiness`,
                            { headers },
                        ),
                        axios.get(`${backendUrl}/api/wallet/credentials/pending-offers`, {
                            params: { holder: 'organization', status: 'open' },
                            headers,
                        }),
                        axios.get(`${backendUrl}/workflow-requests/inbound`, {
                            params: { status: 'pending', limit: 6 },
                            headers,
                        }),
                    )
                    const [readiness, offers, inbound] = await Promise.all(requests)
                    try {
                        const steps = await axios.get(
                            `${backendUrl}/api/organizations/${encodeURIComponent(activeOrg.orgTenantId)}/next-steps`,
                            { headers },
                        )
                        setNextSteps(Array.isArray(steps.data?.items) ? steps.data.items : [])
                    } catch {
                        setNextSteps([])
                    }
                    setReadinessPercent(readiness.data?.readinessPercent ?? null)
                    setReadinessState(readiness.data?.readinessState ?? null)
                    const offerRows: any[] = openInboxOffers(offers.data)
                    const inboundRows = Array.isArray(inbound.data) ? inbound.data : []
                    let memberCount = 0
                    let openJobs = 0
                    try {
                        const [members, runs] = await Promise.all([
                            axios.get(`${backendUrl}/api/organizations/${encodeURIComponent(activeOrg.orgTenantId)}/members`, { headers }),
                            axios.get(`${backendUrl}/workflows/runs`, { headers, params: { limit: 8 } }),
                        ])
                        memberCount = Array.isArray(members.data) ? members.data.length : 0
                        const runRows = Array.isArray(runs.data) ? runs.data : []
                        openJobs = runRows.filter((run: any) => !['completed', 'cancelled', 'reconciled'].includes(String(run?.status || '').toLowerCase())).length
                        setActivity(runRows.slice(0, 5).map((run: any) => {
                            const input = run.output?.workflowInput || run.input || {}
                            const at = run.updatedAt || run.updated_at || run.completedAt || run.createdAt || run.created_at
                            return { id: String(run.id), title: jobHeading(input).title, at: at ? String(at) : '' }
                        }))
                    } catch {
                        setActivity([])
                    }
                    setTiles([
                        { label: 'Waiting for you', value: offerRows.length + inboundRows.length, href: '/inbox' },
                        { label: 'Jobs in progress', value: openJobs, href: '/finance/job-cards' },
                        { label: 'Records to keep', value: offerRows.length, href: '/inbox' },
                        { label: 'Members', value: memberCount, href: '/organization/people' },
                    ])
                    setRecords(offerRows.slice(0, 4).map((row: any) => ({
                        id: String(row.id || row.offerId || row.title),
                        title: String(row.title || 'Record'),
                    })))
                    setAttentionItems([
                        ...offerRows.map((row: any) => ({
                            id: String(row.id || row.offerId || row.title),
                            title: String(row.title || 'Record waiting'),
                            description: offerReplacement(row.claims)?.note || 'Sent to this organisation',
                            action: 'Keep',
                            href: '/inbox',
                        })),
                        ...inboundRows.map((row: any) => ({
                            id: String(row.id || row.requestId || row.title),
                            title: String(row.title || 'Request waiting'),
                            description: String(row.description || 'This request needs a decision.'),
                            action: 'Open',
                            href: '/requests',
                        })),
                    ].slice(0, 6))
                } else {
                    const [offers, receiptsRes, activityRes, sharesRes] = await Promise.all([
                        axios.get(`${backendUrl}/api/wallet/credentials/pending-offers`, { headers, params: { status: 'open' } }),
                        axios.get(`${backendUrl}/api/wallet/credentials/pending-receipts`, { headers }).catch(() => ({ data: [] })),
                        // Your own activity: cards you were given, what you shared and with whom.
                        axios.get(`${backendUrl}/api/wallet/activity`, { headers, params: { limit: 5 } }).catch(() => ({ data: {} })),
                        axios.get(`${backendUrl}/api/wallet/activity`, { headers, params: { limit: 1, kind: 'shared' } }).catch(() => ({ data: {} })),
                    ])
                    const offerRows: any[] = openInboxOffers(offers.data)
                    const receiptRows = (Array.isArray(receiptsRes.data) ? receiptsRes.data : []).filter(
                        (row: any) => String(row?.sourceType || '').toLowerCase() === 'payment',
                    )
                    const combinedAttention = [...offerRows, ...receiptRows]
                    const activityItems: HolderActivityEntry[] = Array.isArray(activityRes.data?.items) ? activityRes.data.items : []
                    setActivity(activityItems.map((entry) => {
                        const line = describeHolderActivity(entry, { labelStep: (step) => stepRequiredLabel({ stageAction: step }) })
                        return { id: entry.id, title: line.title, at: entry.occurredAt, href: `/activity?entry=${encodeURIComponent(entry.id)}` }
                    }))
                    setTiles([
                        { label: 'Waiting for you', value: combinedAttention.length, href: '/inbox' },
                        { label: 'My records', value: 'Open', href: '/wallet' },
                        { label: 'Organisations', value: 'Open', href: '/' },
                        { label: 'Your shares', value: Number(sharesRes.data?.total) || 0, href: '/activity' },
                    ])
                    setRecords(offerRows.slice(0, 4).map((row: any) => ({
                        id: String(row.id || row.offerId || row.title),
                        title: String(row.title || 'Record'),
                    })))
                    setNextSteps([])
                    setAttentionItems(combinedAttention.slice(0, 6).map((row: any) => ({
                        id: String(row.id || row.offerId || row.title),
                        title: String(row.title || 'Record waiting'),
                        description: offerReplacement(row.claims)?.note || 'Open your inbox to keep it.',
                        action: 'Keep',
                        href: '/inbox',
                    })))
                }
            } catch {
                // The dashboard stays useful when one summary endpoint is unavailable.
                setAttentionItems([])
                setNextSteps([])
            } finally {
                setDashboardLoading(false)
            }
        }
        void load()
    }, [backendUrl, contextVersion])

    const readinessBadgeColor =
        readinessState === 'ready' ? 'teal' : readinessState === 'in_progress' ? 'yellow' : 'red'
    const step = nextStepCard(nextSteps, 'portal')

    return (
        <Layout title="Dashboard">
            <Container size="xl" py="xl">
                <Stack gap="xl">
                    <Group justify="space-between" align="flex-end" wrap="wrap">
                        <Box>
                            <Title order={2}>{orgName ? `Hello, ${orgName}` : 'Hello'}</Title>
                            <Text c="dimmed" size="sm" mt={4}>
                                {orgName ? 'Here is what needs you in this organisation.' : 'Here is what needs you.'}
                            </Text>
                        </Box>
                        <Button.Group>
                            <Button
                                component={Link}
                                href={orgName ? '/finance/job-cards' : '/wallet'}
                                rightSection={<IconArrowRight size={16} />}
                            >
                                {orgName ? 'Start a job' : 'Share a record'}
                            </Button>
                            <Button
                                variant="light"
                                leftSection={<IconMessagePlus size={16} />}
                                onClick={() => openRequest()}
                            >
                                Request
                            </Button>
                            <Button
                                variant="light"
                                leftSection={<IconCircleCheck size={16} />}
                                onClick={() => setCheckOpen(true)}
                            >
                                Check a record
                            </Button>
                        </Button.Group>
                        <Modal opened={checkOpen} onClose={() => setCheckOpen(false)} title="Check a record" centered>
                            <Text size="sm" c="dimmed" mb="sm">
                                Paste the reference from a record issued here. Anyone can check one.
                            </Text>
                            {checkOpen && <RecordCheckPanel />}
                        </Modal>
                    </Group>

                    {readinessPercent != null && orgName && (
                        <Group gap="xs">
                            <Badge color={readinessBadgeColor} size="lg">
                                {readinessState === 'ready' ? 'Ready' : readinessState === 'in_progress' ? 'Setup in progress' : 'Setup needed'}
                            </Badge>
                            <Anchor component={Link} href="/organization/setup" size="sm">Open setup</Anchor>
                        </Group>
                    )}

                    {orgName && (
                        <Paper withBorder radius="lg" p="lg">
                            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Next step</Text>
                            {dashboardLoading && <Text size="sm" c="dimmed" mt="xs">Checking what is waiting…</Text>}
                            {!dashboardLoading && !step && (
                                <Text fw={600} mt="xs">You're up to date</Text>
                            )}
                            {!dashboardLoading && step && (
                                <Stack gap={4} mt="xs">
                                    <Anchor component={Link} href={step.href} fw={600}>
                                        {step.sentence}
                                    </Anchor>
                                    <Text size="sm" c="dimmed" lineClamp={2}>{step.detail}</Text>
                                    {step.moreLabel && (
                                        <Anchor component={Link} href={step.moreHref} size="sm">
                                            {step.moreLabel}
                                        </Anchor>
                                    )}
                                </Stack>
                            )}
                        </Paper>
                    )}

                    <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md">
                        {(tiles.length ? tiles : [
                            { label: 'Waiting for you', value: dashboardLoading ? '…' : 0, href: '/inbox' },
                            { label: orgName ? 'Jobs in progress' : 'My records', value: dashboardLoading ? '…' : 'Open', href: orgName ? '/finance/job-cards' : '/wallet' },
                            { label: orgName ? 'Records to keep' : 'Organisations', value: dashboardLoading ? '…' : 'Open', href: orgName ? '/inbox' : '/' },
                            { label: orgName ? 'Members' : 'Your shares', value: dashboardLoading ? '…' : 0, href: orgName ? '/organization/people' : '/activity' },
                        ]).map((tile) => (
                            <Paper key={tile.label} component={Link} href={tile.href} withBorder radius="md" p="md" style={{ textDecoration: 'none', color: 'inherit' }}>
                                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>{tile.label}</Text>
                                <Title order={3} mt={6}>{tile.value}</Title>
                            </Paper>
                        ))}
                    </SimpleGrid>

                    <Paper withBorder radius="lg" p="lg">
                        <Title order={3} mb="sm">Needs you</Title>
                        {dashboardLoading && <Text size="sm" c="dimmed">Checking what is waiting…</Text>}
                        {!dashboardLoading && attentionItems.length === 0 && (
                            <Text size="sm">You are all caught up.</Text>
                        )}
                        <Stack gap="sm">
                            {attentionItems.map((item) => (
                                <Group key={item.id} justify="space-between" wrap="nowrap">
                                    <Box style={{ minWidth: 0 }}>
                                        <Text fw={600} truncate>{item.title}</Text>
                                        <Text size="sm" c="dimmed" lineClamp={1}>{item.description}</Text>
                                    </Box>
                                    <Button component={Link} href={item.href} size="sm" variant="light">{item.action}</Button>
                                </Group>
                            ))}
                        </Stack>
                    </Paper>

                    {catalogueGroups.length > 0 && (
                        <Paper withBorder radius="lg" p="lg">
                            <Group justify="space-between" align="flex-end" mb="sm">
                                <Box>
                                    <Title order={3}>Ask for something</Title>
                                    <Text size="sm" c="dimmed">
                                        {orgName ? 'What this organisation can start from here.' : 'Time off, an expense, a payout, a record sent again, or a quote from a business.'}
                                    </Text>
                                </Box>
                                <Anchor component={Link} href="/requests/mine" size="sm">My requests</Anchor>
                            </Group>
                            <Stack gap="md">
                                {catalogueGroups.map((group) => (
                                    <Box key={group}>
                                        <SectionTitle label={REQUEST_GROUP_WORDS[group].title} />
                                        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
                                            {catalogueRows.filter((row) => row.group === group).map(catalogueCard)}
                                        </SimpleGrid>
                                    </Box>
                                ))}
                            </Stack>
                        </Paper>
                    )}

                    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                        <Paper withBorder radius="md" p="md">
                            <Group justify="space-between" align="center" mb="sm">
                                <Title order={4}>Recent activity</Title>
                                {!orgName && <Anchor component={Link} href="/activity" size="sm">View all</Anchor>}
                            </Group>
                            {activity.length === 0 && <Text size="sm" c="dimmed">Nothing new yet.</Text>}
                            <Stack gap={6}>
                                {activity.map((item) => (
                                    <Group key={item.id} justify="space-between" wrap="nowrap" gap="sm">
                                        {item.href ? (
                                            <Anchor component={Link} href={item.href} size="sm" truncate style={{ minWidth: 0 }} c="inherit">{item.title}</Anchor>
                                        ) : (
                                            <Text size="sm" truncate style={{ minWidth: 0 }}>{item.title}</Text>
                                        )}
                                        {item.at && <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>{formatTxnTime(item.at)}</Text>}
                                    </Group>
                                ))}
                            </Stack>
                        </Paper>
                        <Paper withBorder radius="md" p="md">
                            <Title order={4} mb="sm">Recent records</Title>
                            {records.length === 0 && <Text size="sm" c="dimmed">No records waiting.</Text>}
                            <Stack gap={6}>
                                {records.map((item) => (
                                    <Anchor key={item.id} component={Link} href="/wallet" size="sm">{item.title}</Anchor>
                                ))}
                            </Stack>
                        </Paper>
                    </SimpleGrid>
                </Stack>
            </Container>
            <RequestSheet
                opened={requestOpen}
                onClose={() => setRequestOpen(false)}
                context={requestContext}
                initialKindId={requestKindId}
            />
        </Layout>
    )
}
