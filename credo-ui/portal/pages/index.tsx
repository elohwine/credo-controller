import React, { useEffect, useState } from 'react'
import axios from 'axios'
import Layout from '@/components/Layout'
import { getOrgScopedToken, readActiveOrganization } from '@/utils/organizationContext'
import {
    Anchor,
    Badge,
    Box,
    Card,
    Container,
    Divider,
    Group,
    SimpleGrid,
    Stack,
    Text,
    Title,
} from '@mantine/core'
import {
    IconBuildingStore,
    IconCertificate,
    IconFileCheck,
    IconInbox,
    IconReceipt,
    IconShieldCheck,
    IconBuilding,
    IconUsers,
    IconChecklist,
    IconGitBranch,
    IconUserShield,
    IconUsersGroup,
} from '@tabler/icons-react'
import Link from 'next/link'

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
    href: string
    icon: React.ReactNode
}

const QuickLinkCard = ({ label, description, href, icon }: QuickLink) => (
    <Anchor component={Link} href={href} underline="never">
        <Card
            withBorder
            radius="md"
            p="md"
            style={{
                cursor: 'pointer',
                transition: 'box-shadow 0.15s ease, transform 0.15s ease',
            }}
            onMouseEnter={(e) => {
                ; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 20px rgba(33,136,202,0.15)'
                    ; (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'
            }}
            onMouseLeave={(e) => {
                ; (e.currentTarget as HTMLElement).style.boxShadow = ''
                    ; (e.currentTarget as HTMLElement).style.transform = ''
            }}
        >
            <Group gap="sm" wrap="nowrap">
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
                <Box>
                    <Text size="sm" fw={600}>
                        {label}
                    </Text>
                    <Text size="xs" c="dimmed" mt={2}>
                        {description}
                    </Text>
                </Box>
            </Group>
        </Card>
    </Anchor>
)

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

    const backendUrl = process.env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000'

    useEffect(() => {
        const activeOrg = readActiveOrganization()
        if (!activeOrg?.orgTenantId) return
        setOrgName(activeOrg.name)

        const token = getOrgScopedToken()
        if (!token) return

        axios
            .get(`${backendUrl}/api/organizations/${encodeURIComponent(activeOrg.orgTenantId)}/setup/readiness`, {
                headers: { Authorization: `Bearer ${token}` },
            })
            .then((res) => {
                setReadinessPercent(res.data.readinessPercent ?? null)
                setReadinessState(res.data.readinessState ?? null)
            })
            .catch(() => {
                /* silently ignore — dashboard is non-blocking */
            })
    }, [])

    const readinessBadgeColor =
        readinessState === 'ready' ? 'teal' : readinessState === 'in_progress' ? 'yellow' : 'red'

    return (
        <Layout title="Dashboard">
            <Container size="xl" py="xl">
                <Stack gap="xl">
                    {/* ── Org context header ── */}
                    {orgName ? (
                        <Box>
                            <Group justify="space-between" align="flex-end" wrap="wrap">
                                <Box>
                                    <Text size="xs" c="dimmed" tt="uppercase" fw={700} mb={2}>
                                        Active organization
                                    </Text>
                                    <Title order={2} size="h1" fw={900}>
                                        {orgName}
                                    </Title>
                                </Box>
                                {readinessPercent != null && (
                                    <Group gap="xs">
                                        <Badge color={readinessBadgeColor} size="lg">
                                            {readinessState === 'ready'
                                                ? 'Operational'
                                                : readinessState === 'in_progress'
                                                    ? 'Setup in progress'
                                                    : 'Setup required'}
                                        </Badge>
                                        <Badge variant="outline" size="lg">
                                            {readinessPercent}% ready
                                        </Badge>
                                        <Anchor
                                            component={Link}
                                            href="/organization/setup"
                                            size="sm"
                                            fw={500}
                                        >
                                            Setup Center →
                                        </Anchor>
                                    </Group>
                                )}
                            </Group>
                        </Box>
                    ) : (
                        <Box>
                            <Title order={2} size="h1" fw={900} mb="xs">
                                Welcome to Credentis
                            </Title>
                            <Text c="dimmed" size="lg">
                                A verifiable organizational workflow platform
                            </Text>
                        </Box>
                    )}

                    {/* ── WORK ── */}
                    <Box>
                        <SectionTitle label="Work" emoji="📥" />
                        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
                            <QuickLinkCard
                                label="Inbox"
                                description="Tasks and actions awaiting your attention"
                                href="/inbox"
                                icon={<IconInbox size={20} />}
                            />
                            <QuickLinkCard
                                label="My Wallet"
                                description="View your credentials and receipts"
                                href="/wallet"
                                icon={<IconReceipt size={20} />}
                            />
                            <QuickLinkCard
                                label="Requests"
                                description="Browse organizational requests in your current context"
                                href="/requests"
                                icon={<IconGitBranch size={20} />}
                            />
                            <QuickLinkCard
                                label="Approvals"
                                description="Approval trails and decisions"
                                href="/approvals"
                                icon={<IconShieldCheck size={20} />}
                            />
                            <QuickLinkCard
                                label="Tasks"
                                description="Open workflow tasks"
                                href="/tasks"
                                icon={<IconChecklist size={20} />}
                            />
                            <QuickLinkCard
                                label="Verify"
                                description="Verify a credential or presentation"
                                href="/verify"
                                icon={<IconFileCheck size={20} />}
                            />
                        </SimpleGrid>
                    </Box>

                    {/* ── ORGANIZATION ── */}
                    <Box>
                        <SectionTitle label="Organization" emoji="🏢" />
                        <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md">
                            <QuickLinkCard
                                label="Setup & Readiness"
                                description="Onboarding and capability readiness"
                                href="/organization/setup"
                                icon={<IconChecklist size={20} />}
                            />
                            <QuickLinkCard
                                label="People"
                                description="Members, roles, and invitations"
                                href="/organization/people"
                                icon={<IconUsers size={20} />}
                            />
                            <QuickLinkCard
                                label="Roles"
                                description="Starter permissions and access groups"
                                href="/organization/roles"
                                icon={<IconUserShield size={20} />}
                            />
                            <QuickLinkCard
                                label="Departments"
                                description="Departments and cost centres"
                                href="/organization/departments"
                                icon={<IconBuilding size={20} />}
                            />
                            <QuickLinkCard
                                label="Authorities"
                                description="Approval authorities and thresholds"
                                href="/organization/authorities"
                                icon={<IconShieldCheck size={20} />}
                            />
                            <QuickLinkCard
                                label="Delegations"
                                description="Backup approvals and delegated power"
                                href="/organization/delegations"
                                icon={<IconUsersGroup size={20} />}
                            />
                        </SimpleGrid>
                    </Box>

                    {/* ── CREDENTIALS ── */}
                    <Box>
                        <SectionTitle label="Credentials" emoji="🪪" />
                        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
                            <QuickLinkCard
                                label="Credential Models"
                                description="Define and manage VC schemas"
                                href="/credential-models"
                                icon={<IconCertificate size={20} />}
                            />
                            <QuickLinkCard
                                label="Issue / Verify"
                                description="Manual credential operations"
                                href="/select-credentials"
                                icon={<IconFileCheck size={20} />}
                            />
                        </SimpleGrid>
                    </Box>

                    {/* ── DEFERRED (Phase 2+) ────────────────────────────────────────
          <Box>
            <SectionTitle label="Operations" emoji="⚙️" />
            <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
              <QuickLinkCard label="Finance"    description="Financial reports and approvals" href="/finance"  icon={<IconCoin size={20} />} />
              <QuickLinkCard label="Workflows"  description="Automated workflow management"  href="/workflows" icon={<IconGitBranch size={20} />} />
              <QuickLinkCard label="Inventory"  description="Stock and asset management"      href="/inventory/dashboard" icon={<IconPackage size={20} />} />
            </SimpleGrid>
          </Box>
          ─────────────────────────────────────────────────────────────── */}
                </Stack>
            </Container>
        </Layout>
    )
}
