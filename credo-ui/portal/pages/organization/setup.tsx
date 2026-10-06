import React, { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import axios from 'axios'
import Link from 'next/link'
import Layout from '@/components/Layout'
import {
  getOrgScopedToken,
  getPersonalToken,
  readActiveOrganization,
  readOrganizationsFromCache,
  persistOrganizationsToCache,
  switchOrganizationContext,
} from '@/utils/organizationContext'
import {
  SETUP_PROFILE_PATH,
  describeOrgProfile,
  persistOrgProfile,
  profileFromServer,
  readOrgProfile,
  setupChecklist,
  type OrgProfile,
  type SetupStep,
} from '@/utils/orgProfile'
import {
  Alert,
  Anchor,
  Box,
  Button,
  Card,
  Container,
  Group,
  Progress,
  Stack,
  ThemeIcon,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { IconAlertCircle, IconBuildingPlus, IconCheck, IconRefresh } from '@tabler/icons-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type ReadinessRequirement = 'mandatory' | 'conditional' | 'recommended'
type ReadinessStatus = 'ready' | 'needs_attention' | 'optional' | 'pending_external'
type ReadinessDomain = 'core' | 'people' | 'authority' | 'operations' | 'trust' | 'integrations'

type ReadinessItem = {
  key: string
  title: string
  domain: ReadinessDomain
  requirement: ReadinessRequirement
  status: ReadinessStatus
  reason?: string
  requiredFor?: string[]
  stageAction?: string
  actionPath?: string
  /** Not a money step and nobody chosen yet: asked the first time the request is used. */
  askedOnFirstUse?: boolean
}

type WorkflowReadinessSummary = {
  templateId?: string
  workflowType: string
  name?: string
  ready: boolean
  blocking: string[]
}

type DomainProgress = {
  domain: ReadinessDomain
  ready: number
  total: number
  percent: number
}

type ReadinessResponse = {
  orgTenantId: string
  orgName: string
  organizationId: string
  readinessPercent: number
  readinessState: 'ready' | 'in_progress' | 'blocked'
  items: ReadinessItem[]
  domains: DomainProgress[]
  nextActions: string[]
  workflows?: WorkflowReadinessSummary[]
}

// ─── Domain config ────────────────────────────────────────────────────────────

const DOMAIN_CONFIG: Record<ReadinessDomain, { label: string }> = {
  core: { label: 'Basics' },
  people: { label: 'People' },
  authority: { label: 'Approvals' },
  operations: { label: 'Requests' },
  trust: { label: 'Partners' },
  integrations: { label: 'Payments' },
}

function plainRequestName(workflow: { name?: string; workflowType: string }): string {
  const type = workflow.workflowType.toLowerCase()
  const name = workflow.name || ''
  if (type.includes('field') || /fept/i.test(name)) return 'Jobs'
  if (type.includes('requisition')) return 'Purchase requests'
  if (type.includes('payable') || type.includes('ap_')) return 'Supplier bills'
  if (/payment[_-]collection|collect_payments|accounts_receivable|ar_collections/.test(type)) return 'Customer payments'
  if (type.includes('education') || type.includes('fee')) return 'School fees'
  if (type.includes('cash')) return 'Counter sales'
  return name || 'Requests'
}

const ACTION_LINKS: Record<string, { href: string; label: string }> = {
  active_members: { href: '/organization/people', label: 'Invite members' },
  primary_admin: { href: '/organization/people', label: 'Manage team' },
  roles: { href: '/organization/roles', label: 'Roles' },
  workflow_configuration: { href: '/organization/onboarding', label: 'Answer setup questions' },
  request_types_ready: { href: '/organization/actors', label: 'Choose people' },
  ssi_identity: { href: '/organization/setup', label: 'Set up' },
  verifier_registration: { href: '/organization/authorities', label: 'Partners' },
  people_records: { href: '/organization/people', label: 'Add people' },
  authorities: { href: '/organization/authorities', label: 'Approvals' },
  departments: { href: '/organization/departments', label: 'Add departments' },
  delegations: { href: '/organization/delegations', label: 'Set up stand-ins' },
  trusted_issuers: { href: '/organization/trusted-partners', label: 'Add trusted partners' },
  payment_provider: { href: '/organization/integrations', label: 'Connect payment' },
}

/** Stage-actor items are keyed `stage_actor:<stageAction>`; they all resolve to the actors screen. */
function actionLinkFor(item: { key: string; actionPath?: string }): { href: string; label: string } | undefined {
  if (item.key.startsWith('stage_actor:')) {
    return { href: item.actionPath || '/organization/actors', label: 'Choose a person' }
  }
  if (item.actionPath) {
    return { href: item.actionPath, label: ACTION_LINKS[item.key]?.label || 'Configure' }
  }
  return ACTION_LINKS[item.key]
}

/** Where each checklist step opens. Question steps chain to the next unfinished one. */
function stepHref(step: SetupStep, steps: SetupStep[]): string {
  if (step.id === 'team') return '/organization/people'
  const rest = steps
    .filter((other) => !other.done && other.id !== step.id && other.id !== 'team')
    .map((other) => other.id)
  const query = new URLSearchParams({ step: step.id })
  if (rest.length > 0) query.set('then', rest.join(','))
  return `/organization/onboarding?${query.toString()}`
}

/** Items the checklist already covers, so they are not listed twice. */
function coveredByChecklist(item: ReadinessItem): boolean {
  return (
    item.key === 'workflow_configuration' ||
    item.key === 'payment_provider' ||
    item.key === 'active_members' ||
    item.key === 'request_types_ready' ||
    item.key.startsWith('stage_actor:')
  )
}

function MissingGroup({ domain, items }: { domain: ReadinessDomain; items: ReadinessItem[] }) {
  const gaps = items.filter(
    (item) => (item.status === 'needs_attention' || item.status === 'pending_external') && !coveredByChecklist(item),
  )
  if (gaps.length === 0) return null
  return (
    <Stack gap={6}>
      <Text fw={600} size="sm">
        {DOMAIN_CONFIG[domain].label}
      </Text>
      {gaps.map((item) => {
        const actionLink = item.status === 'needs_attention' ? actionLinkFor(item) : undefined
        return (
          <Group key={item.key} justify="space-between" align="center" wrap="nowrap">
            <Text size="sm">{item.title}</Text>
            {actionLink ? (
              <Anchor component={Link} href={actionLink.href} size="sm">
                {actionLink.label}
              </Anchor>
            ) : (
              <Text size="xs" c="dimmed">
                Waiting
              </Text>
            )}
          </Group>
        )
      })}
    </Stack>
  )
}

function requestGaps(workflow: WorkflowReadinessSummary, items: ReadinessItem[]): string[] {
  const related = items.filter(
    (item) =>
      item.status !== 'ready' &&
      item.status !== 'optional' &&
      item.key !== 'request_types_ready' &&
      ((item.requiredFor ?? []).includes(workflow.workflowType) || workflow.blocking.includes(item.key)),
  )
  if (related.length > 0) return related.map((item) => item.title)
  return []
}

/** Open, with a note when some people are only picked the first time the request is used. */
function openNote(workflow: WorkflowReadinessSummary, items: ReadinessItem[]): string {
  const later = items.some(
    (item) => item.askedOnFirstUse && (item.requiredFor ?? []).includes(workflow.workflowType),
  )
  if (!later) return ' · Open'
  return plainRequestName(workflow) === 'Jobs'
    ? ' · Open · you pick who goes out on the first job'
    : ' · Open · the rest is asked the first time'
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function OrganizationSetupPage() {
  const router = useRouter()
  const [orgTenantId, setOrgTenantId] = useState('')
  const [readiness, setReadiness] = useState<ReadinessResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [newOrgName, setNewOrgName] = useState('')
  const [creatingOrg, setCreatingOrg] = useState(false)
  const [orgProfile, setOrgProfile] = useState<OrgProfile | null>(null)
  const [memberCount, setMemberCount] = useState(0)

  const groupedItems = useMemo(() => {
    if (!readiness) return [] as Array<{ domain: ReadinessDomain; items: ReadinessItem[]; percent: number }>
    return readiness.domains.map((domainProgress) => ({
      domain: domainProgress.domain,
      percent: domainProgress.percent,
      items: readiness.items.filter((item) => item.domain === domainProgress.domain),
    }))
  }, [readiness])

  const backendUrl = process.env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000'

  useEffect(() => {
    const activeOrg = readActiveOrganization()
    if (activeOrg?.orgTenantId) {
      setOrgTenantId(activeOrg.orgTenantId)
    }
    setOrgProfile(readOrgProfile())
  }, [])

  useEffect(() => {
    if (!orgTenantId) return
    void loadReadiness()
  }, [orgTenantId])

  const createOrganization = async () => {
    const name = newOrgName.trim()
    if (!name) return

    const personalToken = getPersonalToken()
    if (!personalToken) {
      setError('Sign in with your personal wallet first, then create an organization here.')
      return
    }

    setCreatingOrg(true)
    setError(null)
    try {
      const createRes = await axios.post(
        `${backendUrl}/api/organizations`,
        { name },
        { headers: { Authorization: `Bearer ${personalToken}` } },
      )

      const orgTenantId = createRes.data?.orgTenantId as string | undefined
      if (!orgTenantId) throw new Error('Organization creation did not return an organization ID')

      const switchRes = await switchOrganizationContext({
        backendUrl,
        orgTenantId,
        orgName: name,
        personalToken,
      })

      const cachedOrgs = readOrganizationsFromCache()
      const role = createRes.data?.role || 'owner'
      persistOrganizationsToCache([
        ...cachedOrgs.filter((org) => org.orgTenantId !== orgTenantId),
        { orgTenantId, name, role },
      ])

      setOrgTenantId(orgTenantId)
      setNewOrgName('')
      setReadiness(null)
      setError(null)

      // Redirect to first-run onboarding screen after org creation
      void router.push('/organization/onboarding')
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to create organization')
    } finally {
      setCreatingOrg(false)
    }
  }

  const loadReadiness = async () => {
    setError(null)
    const activeOrg = readActiveOrganization()
    const selectedOrgId = (orgTenantId || activeOrg?.orgTenantId || '').trim()
    if (!selectedOrgId) {
      setError('Use the account picker in the header to select an organization first.')
      return
    }
    setOrgTenantId(selectedOrgId)
    const token = getOrgScopedToken()
    if (!token) {
      setError('No tenant token found. Login and switch to organization context first.')
      return
    }
    setLoading(true)
    try {
      const res = await axios.get<ReadinessResponse>(
        `${backendUrl}/api/organizations/${encodeURIComponent(selectedOrgId)}/setup/readiness`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      setReadiness(res.data)
      axios
        .get(`${backendUrl}/api/organizations/${encodeURIComponent(selectedOrgId)}/members`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        .then((membersRes) => {
          const list = Array.isArray(membersRes.data) ? membersRes.data : membersRes.data?.members || []
          setMemberCount(list.filter((member: any) => member?.status !== 'removed').length)
        })
        .catch(() => setMemberCount(0))
      axios
        .get(`${backendUrl}/api/organizations/${encodeURIComponent(selectedOrgId)}${SETUP_PROFILE_PATH}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        .then((profileRes) => {
          const server = profileFromServer(profileRes.data)
          setOrgProfile(server)
          if (server) persistOrgProfile(server)
        })
        .catch(() => {
          /* the local copy stays */
        })
    } catch (err: any) {
      setReadiness(null)
      setError(err?.response?.data?.message || err?.message || 'Failed to load readiness')
    } finally {
      setLoading(false)
    }
  }

  const steps = useMemo(
    () => setupChecklist({ profile: orgProfile, items: readiness?.items ?? [], memberCount }),
    [orgProfile, readiness, memberCount],
  )
  const doneCount = steps.filter((step) => step.done).length
  const firstOpen = steps.find((step) => !step.done)

  const missingGroups = groupedItems.filter((group) =>
    group.items.some(
      (item) => (item.status === 'needs_attention' || item.status === 'pending_external') && !coveredByChecklist(item),
    ),
  )

  return (
    <Layout title="Setup">
      <Container size="md" py="xl">
        <Stack gap="lg">
          <Group justify="space-between" align="flex-end">
            <Box>
              <Title order={2}>Setup</Title>
              {readiness && (
                <Text c="dimmed" size="sm" mt={4}>
                  {firstOpen ? `${doneCount} of ${steps.length} done` : 'You are set. Everything is in place.'}
                </Text>
              )}
            </Box>
            {orgTenantId && (
              <Button variant="subtle" size="xs" leftSection={<IconRefresh size={14} />} onClick={loadReadiness} loading={loading}>
                Refresh
              </Button>
            )}
          </Group>

          {orgProfile && describeOrgProfile(orgProfile).length > 0 && (
            <Text size="sm">{describeOrgProfile(orgProfile).join(' · ')}</Text>
          )}

          {/* ── Create Organization ───────────────────── */}
          {!orgTenantId && (
            <Card withBorder radius="md" p="lg">
              <Stack gap="md">
                <Box>
                  <Group gap="xs" mb={4}>
                    <IconBuildingPlus size={18} />
                    <Title order={4}>Create Organization</Title>
                  </Group>
                  <Text size="sm" c="dimmed">
                    Give it a name. A few questions come next.
                  </Text>
                </Box>
                <Group align="end" wrap="wrap">
                  <TextInput
                    label="Organization name"
                    placeholder="Acme Holdings"
                    value={newOrgName}
                    onChange={(e) => setNewOrgName(e.currentTarget.value)}
                    style={{ minWidth: 300 }}
                  />
                  <Button
                    leftSection={<IconBuildingPlus size={16} />}
                    loading={creatingOrg}
                    onClick={createOrganization}
                    disabled={!newOrgName.trim()}
                  >
                    Create Organization
                  </Button>
                  <Button variant="default" component={Link} href="/inbox">
                    Go to Inbox
                  </Button>
                </Group>
              </Stack>
            </Card>
          )}

          {/* ── Error ─────────────────────────────────── */}
          {error && (
            <Alert icon={<IconAlertCircle size={16} />} color="red" title="Setup error" radius="md">
              {error}
            </Alert>
          )}

          {/* ── Readiness ─────────────────────────────── */}
          {readiness && (
            <Stack gap="md">
              <Card withBorder radius="md" p="lg">
                <Stack gap="sm">
                  <Progress value={(doneCount / steps.length) * 100} size="sm" radius="xl" aria-label="Setup progress" />
                  {steps.map((step) => {
                    const isNext = firstOpen?.id === step.id
                    return (
                      <Group key={step.id} justify="space-between" wrap="nowrap">
                        <Group gap="sm" wrap="nowrap">
                          <ThemeIcon
                            radius="xl"
                            size="sm"
                            color={step.done ? 'teal' : 'gray'}
                            variant={step.done ? 'filled' : 'light'}
                          >
                            {step.done ? <IconCheck size={12} /> : null}
                          </ThemeIcon>
                          <Text size="sm" fw={isNext ? 600 : 400} c={step.done ? 'dimmed' : undefined}>
                            {step.label}
                          </Text>
                        </Group>
                        <Button
                          size="xs"
                          variant={isNext ? 'filled' : 'subtle'}
                          component={Link}
                          href={stepHref(step, steps)}
                        >
                          {isNext ? 'Start' : step.done ? 'Change' : 'Open'}
                        </Button>
                      </Group>
                    )
                  })}
                </Stack>
              </Card>

              <Text fw={600} size="sm">
                Kinds of requests
              </Text>
              <Stack gap={4}>
                {(readiness.workflows ?? []).map((workflow) => {
                  const gaps = requestGaps(workflow, readiness.items)
                  return (
                    <Text key={workflow.templateId || workflow.workflowType} size="sm">
                      {plainRequestName(workflow)}
                      {workflow.ready
                        ? openNote(workflow, readiness.items)
                        : gaps.length > 0
                          ? ` · ${gaps.join(', ')}`
                          : ' · Still to do'}
                    </Text>
                  )
                })}
              </Stack>

              {(readiness.workflows?.length ?? 0) > 0 && (
                <Group gap="sm">
                  <Button variant="light" size="sm" component={Link} href="/organization/actors">
                    Who does what
                  </Button>
                  <Button variant="light" size="sm" component={Link} href="/organization/handoffs">
                    What happens next
                  </Button>
                </Group>
              )}

              {missingGroups.length > 0 && (
                <Stack gap="md">
                  {missingGroups.map((group) => (
                    <MissingGroup key={group.domain} domain={group.domain} items={group.items} />
                  ))}
                </Stack>
              )}
            </Stack>
          )}
        </Stack>
      </Container>
    </Layout>
  )
}
