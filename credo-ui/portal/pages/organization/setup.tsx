import React, { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import axios from 'axios'
import Link from 'next/link'
import Layout from '@/components/Layout'
import { StepHelp } from '@/components/help/StepHelp'
import RecordSettingsCard from '@/components/organization/RecordSettingsCard'
import DeviceTrustSettingsCard from '@/components/organization/DeviceTrustSettingsCard'
import StaffCardStepsCard from '@/components/organization/StaffCardStepsCard'
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
  clearOrgSetupDraft,
  readOrgSetupDraft,
  profileFromServer,
  readOrgProfile,
  setupChecklist,
  type OrgProfile,
  type SetupStep,
} from '@/utils/orgProfile'
import {
  Accordion,
  Alert,
  Anchor,
  Box,
  Skeleton,
  Button,
  Card,
  Container,
  Group,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { IconAlertCircle, IconBuildingPlus, IconRefresh } from '@tabler/icons-react'
import { OrgSetupOverview } from '../../../shared/OrgSetupOverview'
import { orgSettingSummary, orgSettingsStatus, visibleOrgSettings, type OrgSettingsGroup } from '../../../shared/orgSettings'
import { SettingsList } from '../../../shared/Guides'

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
  if (step.id === 'kinds' && !step.done) return '/organization/onboarding'
  if (step.id === 'team') return '/organization/people'
  if (step.id === 'brand') return '/organization/brand'
  const rest = steps
    .filter((other) => !other.done && other.id !== step.id && other.id !== 'team' && other.id !== 'brand')
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
  const [memberRoles, setMemberRoles] = useState<string[]>([])
  const [canEditRecords, setCanEditRecords] = useState(false)
  const [recordSettingsOpen, setRecordSettingsOpen] = useState<string | null>(null)
  const [settingsGroup, setSettingsGroup] = useState<string | null>(null)
  const [draftQuestion, setDraftQuestion] = useState<number | null>(null)

  useEffect(() => {
    if (router.asPath.endsWith('#records')) {
      setSettingsGroup('advanced')
      setRecordSettingsOpen('records')
    }
  }, [router.asPath])

  const groupedItems = useMemo(() => {
    if (!readiness) return [] as Array<{ domain: ReadinessDomain; items: ReadinessItem[]; percent: number }>
    return readiness.domains.map((domainProgress) => ({
      domain: domainProgress.domain,
      percent: domainProgress.percent,
      items: readiness.items.filter((item) => item.domain === domainProgress.domain),
    }))
  }, [readiness])

  const backendUrl = process.env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000'
  const [brandConfigured, setBrandConfigured] = useState<boolean | undefined>(undefined)

  useEffect(() => {
    const activeOrg = readActiveOrganization()
    if (activeOrg?.orgTenantId) {
      setOrgTenantId(activeOrg.orgTenantId)
      setCanEditRecords(['owner', 'admin'].includes(String(activeOrg.role || '').toLowerCase()))
    }
    setOrgProfile(readOrgProfile())
  }, [])

  useEffect(() => {
    if (!orgTenantId) return
    void loadReadiness()
    let live = true
    axios
      .get(`${backendUrl}/api/public/orgs/${encodeURIComponent(orgTenantId)}/brand`)
      .then((res) => { if (live) setBrandConfigured(Boolean(res.data?.configured)) })
      .catch(() => { if (live) setBrandConfigured(false) })
    return () => { live = false }
  }, [orgTenantId])

  const createOrganization = async () => {
    const name = newOrgName.trim()
    if (!name) return

    const personalToken = getPersonalToken()
    if (!personalToken) {
      setError('Sign in with your personal wallet first, then create an organisation here.')
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
      setError(err?.response?.data?.message || err?.message || 'Failed to create organisation')
    } finally {
      setCreatingOrg(false)
    }
  }

  const loadReadiness = async () => {
    setError(null)
    const activeOrg = readActiveOrganization()
    const selectedOrgId = (orgTenantId || activeOrg?.orgTenantId || '').trim()
    if (!selectedOrgId) {
      setError('Use the account picker in the header to select an organisation first.')
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
          const active = list.filter((member: any) => member?.status !== 'removed' && member?.status !== 'inactive')
          setMemberCount(active.length)
          setMemberRoles(active.map((member: any) => String(member?.role || '').toLowerCase()))
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
    () => setupChecklist({ profile: orgProfile, items: readiness?.items ?? [], memberCount, roles: memberRoles, brandConfigured }),
    [orgProfile, readiness, memberCount, memberRoles, brandConfigured],
  )

  useEffect(() => {
    if (!orgTenantId) return
    setDraftQuestion(readOrgSetupDraft(orgTenantId)?.question ?? null)
  }, [orgTenantId])

  const settingsStatus = orgSettingsStatus({ profile: orgProfile, memberCount, brandConfigured })
  // Record settings open in place below; the list row would only scroll to them.
  const visibleSettings = visibleOrgSettings(canEditRecords, (item) => item.id !== 'records')
  const advancedSettings = canEditRecords ? visibleSettings.find((group) => group.id === 'advanced') : undefined
  const settingsRows = (group: OrgSettingsGroup) => ({
    title: group.label,
    rows: group.items.map((item) => ({
      key: item.id,
      title: item.label,
      summary: orgSettingSummary(item, settingsStatus),
      onSelect: () => void router.push(item.href),
    })),
  })
  const firstOpen = steps.find((step) => !step.done)

  const missingGroups = groupedItems.filter((group) =>
    group.items.some(
      (item) => (item.status === 'needs_attention' || item.status === 'pending_external') && !coveredByChecklist(item),
    ),
  )

  return (
    <Layout title="Organisation setup">
      <Container size="md" py="xl">
        <Stack gap="lg">
          <Group justify="space-between" align="flex-end">
            <Box>
              <Title order={2}>Organisation setup</Title>
              {readiness && (
                <Text c="dimmed" size="sm" mt={4}>
                  {firstOpen ? 'Your next step, then every organisation setting.' : 'You are set. Everything is in place.'}
                </Text>
              )}
            </Box>
            <Group gap="sm">
              <StepHelp
                title="Setup"
                points={[
                  'These answers decide which work this organisation runs.',
                  'Jobs, purchases and school fees follow from what you do.',
                  'Who handles money is asked here. Other steps are asked the first time they are used.',
                  'You can change an answer later.',
                ]}
              />
              {orgTenantId && (
                <Button variant="subtle" size="xs" leftSection={<IconRefresh size={14} />} onClick={loadReadiness} loading={loading}>
                  Refresh
                </Button>
              )}
            </Group>
          </Group>

          {orgProfile && describeOrgProfile(orgProfile).length > 0 && (
            <Text size="sm">{describeOrgProfile(orgProfile).join(' · ')}</Text>
          )}

          {orgProfile?.access?.drainingWork?.length ? (
            <Alert color="blue" title="Existing work is continuing">
              {orgProfile.access.drainingWork.map((item) => {
                const parts = [
                  item.activeRequests ? `${item.activeRequests} request${item.activeRequests === 1 ? '' : 's'}` : '',
                  item.activeWorkflowRuns ? `${item.activeWorkflowRuns} workflow run${item.activeWorkflowRuns === 1 ? '' : 's'}` : '',
                ].filter(Boolean)
                return `${item.label}: ${parts.join(' and ')}`
              }).join('. ')}. New work in these areas is unavailable; existing work and its history are retained.
            </Alert>
          ) : null}


          {orgTenantId && loading && !readiness && (
            <Stack gap="sm" aria-label="Loading setup">
              <Skeleton height={20} width="40%" radius="xl" />
              <Skeleton height={160} radius="md" />
            </Stack>
          )}

          {/* ── Create Organization ───────────────────── */}
          {!orgTenantId && (
            <Card withBorder radius="md" p="lg">
              <Stack gap="md">
                <Box>
                  <Group gap="xs" mb={4}>
                    <IconBuildingPlus size={18} />
                    <Title order={4}>Create organisation</Title>
                  </Group>
                  <Text size="sm" c="dimmed">
                    Give it a name. A few questions come next.
                  </Text>
                </Box>
                <Group align="end" wrap="wrap">
                  <TextInput
                    label="Organisation name"
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
                    Create organisation
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
              <OrgSetupOverview
                steps={steps}
                canEdit={canEditRecords}
                onOpen={(step) => { void router.push(stepHref(step, steps)) }}
                onExplore={() => { void router.push('/requests') }}
                resume={
                  draftQuestion
                    ? {
                        question: draftQuestion,
                        total: 5,
                        onResume: () => { void router.push('/organization/onboarding') },
                        onDiscard: () => {
                          clearOrgSetupDraft(orgTenantId)
                          setDraftQuestion(null)
                        },
                      }
                    : null
                }
              />
              <Accordion variant="separated" radius="md">
                <Accordion.Item value="availability">
                  <Accordion.Control>
                    <Text fw={500} size="sm">Request availability</Text>
                    <Text size="xs" c="dimmed">
                      {(readiness.workflows ?? []).filter((workflow) => workflow.ready).length} of {readiness.workflows?.length ?? 0} request types ready. See what is available and what needs attention.
                    </Text>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <Stack gap="sm">
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
                  </Accordion.Panel>
                </Accordion.Item>
              </Accordion>
            </Stack>
          )}

          {orgTenantId && (
            <Stack gap="sm">
              <Box>
                <Title order={3}>Organisation settings</Title>
                <Text size="sm" c="dimmed">Change only what you need. These settings are always available here.</Text>
              </Box>
              <SettingsList groups={visibleSettings.filter((group) => group.id !== 'advanced').map(settingsRows)} />
              {advancedSettings && (
                <Accordion variant="separated" radius="md" value={settingsGroup} onChange={setSettingsGroup}>
                  <Accordion.Item value="advanced">
                    <Accordion.Control>
                      <Text size="sm" fw={500}>{advancedSettings.label}</Text>
                      <Text size="xs" c="dimmed">{advancedSettings.detail}</Text>
                    </Accordion.Control>
                    <Accordion.Panel>
                      <SettingsList groups={[{ ...settingsRows(advancedSettings), showTitle: false }]} />
                      <Accordion
                        mt="sm"
                        variant="separated"
                        radius="md"
                        chevronPosition="right"
                        value={recordSettingsOpen}
                        onChange={setRecordSettingsOpen}
                      >
                        <Accordion.Item value="records" id="records">
                          <Accordion.Control>
                            <Text fw={500} size="sm">Record settings</Text>
                            <Text size="xs" c="dimmed">
                              Which records each workflow issues, and which steps need the staff card or the enrolled phone.
                            </Text>
                          </Accordion.Control>
                          <Accordion.Panel>
                            <Stack gap="md">
                              <RecordSettingsCard orgTenantId={orgTenantId} canEdit={canEditRecords} />
                              <StaffCardStepsCard orgTenantId={orgTenantId} canEdit={canEditRecords} />
                              <DeviceTrustSettingsCard orgTenantId={orgTenantId} canEdit={canEditRecords} />
                            </Stack>
                          </Accordion.Panel>
                        </Accordion.Item>
                      </Accordion>
                    </Accordion.Panel>
                  </Accordion.Item>
                </Accordion>
              )}
              <SettingsList
                groups={[
                  {
                    title: 'Support',
                    rows: [{ key: 'help', title: 'Help & Feedback', summary: 'Common questions and how to reach us', onSelect: () => void router.push('/help?from=setup') }],
                  },
                ]}
              />
            </Stack>
          )}
        </Stack>
      </Container>
    </Layout>
  )
}
