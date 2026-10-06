import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import axios from 'axios'
import Layout from '@/components/Layout'
import { getOrgScopedToken, getPersonalToken, readActiveOrganization } from '@/utils/organizationContext'
import { useRequireOrgContext } from '@/lib/portalContext'
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Container,
  Group,
  Loader,
  Paper,
  Progress,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Text,
  Title,
} from '@mantine/core'
import {
  IconAlertCircle,
  IconArrowDown,
  IconArrowRight,
  IconArrowUp,
  IconCheck,
  IconPlus,
  IconTrash,
  IconUsersGroup,
  IconWallet,
} from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'

// ─── Types (mirror OrganizationService.WorkflowActorsView) ───────────────────

type ActorMode =
  | 'configured_user'
  | 'configured_wallet'
  | 'configured_role'
  | 'shared_finance'
  | 'policy_fallback'
  | 'role_fallback'
  | 'owner_fallback'
  | 'unassigned'

type ResolvedActor = {
  userId?: string
  walletTenantId?: string
  role: string
  mode: ActorMode | string
  via?: FallbackEntry
}

type FallbackEntry = { type: 'user' | 'role' | 'wallet'; value: string; label?: string }

type StageDefault = {
  id: string
  workflowType: string
  stageAction: string
  defaultRole?: string
  defaultUserId?: string
  defaultWalletTenantId?: string
  enabled: boolean
}

type StageView = {
  stageAction: string
  title?: string
  requirement: string
  actor: ResolvedActor
  actorDescription: string
  needsAssignment: boolean
  /** Approving, releasing, recording or receipting money. Shares the purchase-request people. */
  moneyStep?: boolean
  /** Not a money step and nobody chosen: picked the first time the request is used. */
  askedOnFirstUse?: boolean
  default?: StageDefault
  builtInRoles: string[]
  stageChain: FallbackEntry[]
}

type WorkflowView = {
  templateId?: string
  workflowType: string
  name?: string
  stages: StageView[]
}

type Member = { userId: string; role: string; walletTenantId?: string; status: string; displayName?: string; phone?: string }

type Policy = {
  orgTenantId: string
  stageChains: Record<string, FallbackEntry[]>
  defaultChain: FallbackEntry[]
  useBuiltInRoleFallbacks: boolean
  ownerFallbackEnabled: boolean
  signGroups?: Record<string, 'one' | 'both'>
  updatedAt?: string
}

type ActorPreset = {
  id: string
  title: string
  detail: string
  signMode: 'one' | 'both'
}

type ActorsView = {
  orgTenantId: string
  workflows: WorkflowView[]
  members: Member[]
  roles: string[]
  policy: Policy
  presets?: ActorPreset[]
  canEdit: boolean
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const USER_PREFIX = 'user:'
const ROLE_PREFIX = 'role:'

function humanize(value?: string): string {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function shortStepTitle(stageAction: string, title?: string): string {
  const action = stageAction.toLowerCase()
  if (action.includes('assign_field')) return 'Who does the job'
  if (action.includes('inspect')) return 'Site check'
  if (action.includes('review')) return 'Work review'
  if (action.includes('remittance')) return 'Money received'
  if (action.includes('acknowledge')) return 'Customer sign-off'
  if (action.includes('payout') || action.includes('release_funds')) return 'Payment release'
  if (action.includes('record_payment')) return 'Recording the payment'
  if (action.includes('receipt')) return 'Receipt'
  if (action.includes('payment_proof')) return 'Proof of payment'
  if (action.includes('finance_approve')) return 'Finance approval'
  if (action.includes('approve')) return 'Approval'
  return (title || '').replace(/\s*\([^)]*\)/g, '').trim() || 'Step'
}

function isPurchaseRequests(workflow: { workflowType: string }): boolean {
  return workflow.workflowType.toLowerCase().includes('requisition')
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

/** Show a person by name; only fall back to a short ID when no name or phone is known. */
function personName(members: Member[], userId?: string, meUserId?: string): string {
  const id = String(userId || '')
  if (meUserId && id === meUserId) return 'You'
  const member = members.find((m) => m.userId === id)
  const name = String(member?.displayName || '').trim()
  if (name && !/^(organization owner|team member)$/i.test(name)) return name
  if (member?.phone) return member.phone
  if (member?.role === 'owner') return 'Owner'
  if (member?.role === 'field_worker') return 'Field worker'
  if (member?.role === 'supervisor') return 'Supervisor'
  if (member?.role === 'finance_manager') return 'Finance officer'
  return id.length > 14 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id || 'Team member'
}

function decodeUserId(token: string | null): string {
  if (!token) return ''
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return String(payload?.id || payload?.userId || '')
  } catch {
    return ''
  }
}

/** Encode the saved stage default as a Select value. */
function defaultToValue(def?: StageDefault): string | null {
  if (!def || !def.enabled) return null
  if (def.defaultUserId) return `${USER_PREFIX}${def.defaultUserId}`
  if (def.defaultRole) return `${ROLE_PREFIX}${def.defaultRole}`
  return null
}

// ─── Fallback chain editor ───────────────────────────────────────────────────

function ChainEditor({
  chain,
  members,
  roles,
  meUserId,
  disabled,
  emptyHint,
  onChange,
}: {
  chain: FallbackEntry[]
  members: Member[]
  roles: string[]
  meUserId: string
  disabled?: boolean
  emptyHint: string
  onChange: (next: FallbackEntry[]) => void
}) {
  const [picker, setPicker] = useState<string | null>(null)

  const options = useMemo(
    () => [
      {
        group: 'People',
        items: members.map((m) => ({
          value: `${USER_PREFIX}${m.userId}`,
          label: `${personName(members, m.userId, meUserId)} · ${humanize(m.role)}${m.walletTenantId ? '' : ' (no wallet)'}`,
          disabled: !m.walletTenantId,
        })),
      },
      { group: 'Roles', items: roles.map((r) => ({ value: `${ROLE_PREFIX}${r}`, label: humanize(r) })) },
    ],
    [members, roles, meUserId],
  )

  const add = () => {
    if (!picker) return
    const entry: FallbackEntry = picker.startsWith(USER_PREFIX)
      ? { type: 'user', value: picker.slice(USER_PREFIX.length) }
      : { type: 'role', value: picker.slice(ROLE_PREFIX.length) }
    if (chain.some((e) => e.type === entry.type && e.value === entry.value)) return
    onChange([...chain, entry])
    setPicker(null)
  }

  const move = (index: number, delta: number) => {
    const next = [...chain]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  return (
    <Stack gap="xs">
      {chain.length === 0 ? (
        <Text size="xs" c="dimmed" fs="italic">
          {emptyHint}
        </Text>
      ) : (
        chain.map((entry, index) => (
          <Paper key={`${entry.type}:${entry.value}`} withBorder p="xs" radius="sm">
            <Group justify="space-between" wrap="nowrap">
              <Group gap="xs" wrap="nowrap">
                <Badge size="sm" variant="light" color="gray">
                  {index + 1}
                </Badge>
                <Badge size="sm" variant="outline" color={entry.type === 'user' ? 'teal' : 'indigo'}>
                  {entry.type === 'user' ? 'Person' : entry.type === 'role' ? 'Role' : 'Wallet'}
                </Badge>
                <Text size="sm">
                  {entry.type === 'user'
                    ? personName(members, entry.value, meUserId)
                    : humanize(entry.value)}
                </Text>
              </Group>
              <Group gap={4} wrap="nowrap">
                <ActionIcon variant="subtle" size="sm" disabled={disabled || index === 0} onClick={() => move(index, -1)}>
                  <IconArrowUp size={14} />
                </ActionIcon>
                <ActionIcon
                  variant="subtle"
                  size="sm"
                  disabled={disabled || index === chain.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <IconArrowDown size={14} />
                </ActionIcon>
                <ActionIcon
                  variant="subtle"
                  color="red"
                  size="sm"
                  disabled={disabled}
                  onClick={() => onChange(chain.filter((_, i) => i !== index))}
                >
                  <IconTrash size={14} />
                </ActionIcon>
              </Group>
            </Group>
          </Paper>
        ))
      )}
      <Group gap="xs" align="end" wrap="wrap">
        <Select
          size="xs"
          style={{ flex: 1, minWidth: 220 }}
          placeholder="Add a backup"
          data={options}
          value={picker}
          onChange={setPicker}
          searchable
          disabled={disabled}
        />
        <Button size="xs" variant="light" leftSection={<IconPlus size={14} />} onClick={add} disabled={disabled || !picker}>
          Add
        </Button>
      </Group>
    </Stack>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function OrganizationActorsPage() {
  // Org-only surface: personal sessions are redirected (mirrors mobile /finance → /inbox).
  useRequireOrgContext('/organization/setup')
  const router = useRouter()
  const fromOnboarding = router.query.from === 'onboarding'

  const [orgTenantId, setOrgTenantId] = useState('')
  const [orgName, setOrgName] = useState('')
  const [view, setView] = useState<ActorsView | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savingStage, setSavingStage] = useState<string | null>(null)
  const [savingPolicy, setSavingPolicy] = useState(false)
  const [applyingPreset, setApplyingPreset] = useState<string | null>(null)
  /** Request types where the owner opened "Use someone else" for the money steps. */
  const [moneyOverrideOpen, setMoneyOverrideOpen] = useState<Record<string, boolean>>({})
  /** One category per screen: money, each kind of request, backups, role cards. */
  const [section, setSection] = useState('money')
  const [offering, setOffering] = useState(false)
  const [offerSummary, setOfferSummary] = useState<{ offered: number; covered: number; skipped: number; failed: number } | null>(null)
  const [meUserId, setMeUserId] = useState('')
  // The signed-in admin's own role card waiting in their wallet inbox (so they can add it here
  // instead of switching to the app). Mirrors the mobile inbox "Accept" card.
  const [myPendingRoleCards, setMyPendingRoleCards] = useState<Array<{ id: string; offerUri: string; title: string; body: string }>>([])
  const [acceptingRoleCard, setAcceptingRoleCard] = useState<string | null>(null)

  const backendUrl = process.env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000'
  const getToken = () => getOrgScopedToken() || getPersonalToken()

  const loadMyPendingRoleCards = useCallback(async () => {
    const walletToken = getPersonalToken()
    if (!walletToken || !orgTenantId) {
      setMyPendingRoleCards([])
      return
    }
    try {
      const res = await axios.get(`${backendUrl}/api/wallet/credentials/pending-offers`, {
        headers: { Authorization: `Bearer ${walletToken}` },
      })
      const rows: any[] = Array.isArray(res.data?.offers) ? res.data.offers : Array.isArray(res.data) ? res.data : []
      setMyPendingRoleCards(
        rows
          .filter((o) => String(o?.sourceType || '') === 'org_workflow_actor' && o?.offerUri)
          .filter((o) => !o?.issuerTenantId || String(o.issuerTenantId) === orgTenantId || String(o?.claims?.orgTenantId || '') === orgTenantId)
          .map((o) => ({
            id: String(o.id || o.offerId || o.offerUri),
            offerUri: String(o.offerUri),
            title: String(o.title || 'Your role card'),
            body: String(o.body || ''),
          })),
      )
    } catch {
      setMyPendingRoleCards([])
    }
  }, [backendUrl, orgTenantId])

  const acceptMyRoleCard = async (card: { id: string; offerUri: string }) => {
    const walletToken = getPersonalToken()
    if (!walletToken) return
    setAcceptingRoleCard(card.id)
    try {
      await axios.post(
        `${backendUrl}/api/wallet/credentials/accept-offer`,
        { offerUri: card.offerUri },
        { headers: { Authorization: `Bearer ${walletToken}` } },
      )
      notifications.show({
        title: 'Role card added',
        message: 'It is now in your wallet. You can use it to sign off and release payments.',
        color: 'green',
        icon: <IconCheck size={16} />,
      })
      await Promise.all([loadMyPendingRoleCards(), load()])
    } catch (err: any) {
      notifications.show({
        title: 'Could not add the role card',
        message: err?.response?.data?.message || err?.response?.data?.error || err?.message || 'Please try again.',
        color: 'red',
      })
    } finally {
      setAcceptingRoleCard(null)
    }
  }

  useEffect(() => {
    const activeOrg = readActiveOrganization()
    if (activeOrg?.orgTenantId) {
      setOrgTenantId(activeOrg.orgTenantId)
      setOrgName(activeOrg.name)
    }
    setMeUserId(decodeUserId(getPersonalToken() || getOrgScopedToken()))
  }, [])

  const load = useCallback(async () => {
    const token = getToken()
    if (!token || !orgTenantId) return
    setLoading(true)
    setError(null)
    try {
      const res = await axios.get<ActorsView>(
        `${backendUrl}/api/organizations/${encodeURIComponent(orgTenantId)}/workflows/actors`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      setView(res.data)
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load workflow actors')
    } finally {
      setLoading(false)
    }
  }, [backendUrl, orgTenantId])

  useEffect(() => {
    if (orgTenantId) {
      void load()
      void loadMyPendingRoleCards()
    }
  }, [orgTenantId, load, loadMyPendingRoleCards])

  const saveStage = async (workflow: WorkflowView, stage: StageView, value: string | null) => {
    const token = getToken()
    if (!token || !orgTenantId) return
    const key = `${workflow.workflowType}:${stage.stageAction}`
    setSavingStage(key)
    try {
      const body: Record<string, unknown> = { workflowType: workflow.workflowType, stageAction: stage.stageAction }
      if (!value) {
        body.enabled = false
      } else if (value.startsWith(USER_PREFIX)) {
        body.defaultUserId = value.slice(USER_PREFIX.length)
      } else if (value.startsWith(ROLE_PREFIX)) {
        body.defaultRole = value.slice(ROLE_PREFIX.length)
      }
      await axios.put(
        `${backendUrl}/api/organizations/${encodeURIComponent(orgTenantId)}/workflows/actors/defaults`,
        body,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      notifications.show({
        title: value ? 'Stage actor saved' : 'Stage actor cleared',
        message: `${humanize(stage.stageAction)} · ${workflow.name || humanize(workflow.workflowType)}`,
        color: 'green',
        icon: <IconCheck size={16} />,
      })
      await load()
    } catch (err: any) {
      notifications.show({
        title: 'Save failed',
        message: err?.response?.data?.message || err?.message || 'Could not save stage actor',
        color: 'red',
      })
    } finally {
      setSavingStage(null)
    }
  }

  const savePolicy = async (patch: Partial<Policy>) => {
    const token = getToken()
    if (!token || !orgTenantId) return
    setSavingPolicy(true)
    try {
      await axios.patch(
        `${backendUrl}/api/organizations/${encodeURIComponent(orgTenantId)}/workflows/actors/policy`,
        patch,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      await load()
    } catch (err: any) {
      notifications.show({
        title: 'Policy update failed',
        message: err?.response?.data?.message || err?.message || 'Could not update fallback policy',
        color: 'red',
      })
    } finally {
      setSavingPolicy(false)
    }
  }

  const applyPreset = async (presetId: string) => {
    const token = getToken()
    if (!token || !orgTenantId) return
    setApplyingPreset(presetId)
    try {
      const res = await axios.post<ActorsView>(
        `${backendUrl}/api/organizations/${encodeURIComponent(orgTenantId)}/workflows/actors/presets`,
        { presetId },
        { headers: { Authorization: `Bearer ${token}` } },
      )
      setView(res.data)
      notifications.show({ title: 'Setup applied', message: 'Purchase-request steps now follow this setup.', color: 'green', icon: <IconCheck size={16} /> })
    } catch (err: any) {
      notifications.show({
        title: 'Could not apply setup',
        message: err?.response?.data?.message || err?.message || 'Try again',
        color: 'red',
      })
    } finally {
      setApplyingPreset(null)
    }
  }

  /** Send each chosen person the role credential their wallet presents at sign-off / payout / approval. */
  const sendRoleCredentials = async (force = false) => {
    const token = getToken()
    if (!token || !orgTenantId) return
    setOffering(true)
    try {
      const res = await axios.post<{ offered: unknown[]; alreadyCovered: unknown[]; skipped: unknown[]; failed: unknown[] }>(
        `${backendUrl}/api/organizations/${encodeURIComponent(orgTenantId)}/workflows/actors/offer-credentials`,
        force ? { force: true } : {},
        { headers: { Authorization: `Bearer ${token}` } },
      )
      const summary = {
        offered: res.data.offered?.length || 0,
        covered: res.data.alreadyCovered?.length || 0,
        skipped: res.data.skipped?.length || 0,
        failed: res.data.failed?.length || 0,
      }
      setOfferSummary(summary)
      void loadMyPendingRoleCards()
      notifications.show({
        title: 'Role cards',
        message:
          summary.offered > 0
            ? `${summary.offered} role card${summary.offered === 1 ? '' : 's'} sent. Each person accepts it from their app inbox.`
            : `Everyone already has their role card (${summary.covered} covered).`,
        color: summary.failed > 0 ? 'orange' : 'green',
        icon: <IconCheck size={16} />,
      })
      await load()
    } catch (err: any) {
      notifications.show({
        title: 'Could not send role cards',
        message: err?.response?.data?.message || err?.message || 'Please try again.',
        color: 'red',
      })
    } finally {
      setOffering(false)
    }
  }

  const members = view?.members || []
  const roles = view?.roles || []
  const canEdit = view?.canEdit ?? false
  const purchaseRequests = useMemo(() => (view?.workflows || []).find(isPurchaseRequests), [view])
  const moneyGapTitles = useMemo(() => {
    const titles = new Set<string>()
    for (const wf of view?.workflows || []) {
      for (const s of wf.stages) {
        if (s.moneyStep && s.needsAssignment) titles.add(shortStepTitle(s.stageAction, s.title))
      }
    }
    return [...titles]
  }, [view])
  const moneyGaps = moneyGapTitles.length > 0
  const pickerOptions = useMemo(
    () => [
      {
        group: 'People',
        items: members.map((m) => ({
          value: `${USER_PREFIX}${m.userId}`,
          label: `${personName(members, m.userId, meUserId)} · ${humanize(m.role)}${m.walletTenantId ? '' : ' (no wallet)'}`,
          disabled: !m.walletTenantId,
        })),
      },
      { group: 'Roles', items: roles.map((r) => ({ value: `${ROLE_PREFIX}${r}`, label: humanize(r) })) },
    ],
    [members, roles, meUserId],
  )

  const sections = useMemo(() => {
    const requestSections = (view?.workflows || [])
      .filter((workflow) => !isPurchaseRequests(workflow) || workflow.stages.some((stage) => !stage.moneyStep))
      .map((workflow) => ({ id: workflow.workflowType, label: plainRequestName(workflow) }))
    return [
      { id: 'money', label: 'Money' },
      ...requestSections,
      { id: 'backups', label: 'If nobody is chosen' },
      { id: 'cards', label: 'Role cards' },
    ]
  }, [view])
  const sectionIndex = Math.max(0, sections.findIndex((item) => item.id === section))

  const renderStage = (workflow: WorkflowView, stage: StageView) => {
    const key = `${workflow.workflowType}:${stage.stageAction}`
    const value = defaultToValue(stage.default)
    const who = stage.actor.userId || stage.actor.walletTenantId
    const firstUse = plainRequestName(workflow) === 'Jobs' ? 'Picked on the first job' : 'Picked the first time'
    const person = stage.askedOnFirstUse
      ? firstUse
      : stage.actor.mode === 'shared_finance'
        ? `Same as purchase requests${who ? ` · ${personName(members, who, meUserId)}` : ''}`
        : stage.needsAssignment
          ? who
            ? `Needs a person · ${personName(members, who, meUserId)} for now`
            : 'Needs a person'
          : who
            ? personName(members, who, meUserId)
            : 'Owner is standing in'
    const onlyHere = stage.moneyStep && !isPurchaseRequests(workflow) && stage.default?.enabled
    return (
      <Box key={key}>
        <Text fw={500} size="sm">
          {shortStepTitle(stage.stageAction, stage.title)}
          {onlyHere ? ` · only for ${plainRequestName(workflow).toLowerCase()}` : ''}
        </Text>
        <Text size="xs" c="dimmed" mb={4}>
          {person}
        </Text>
        <Select
          size="sm"
          placeholder={stage.askedOnFirstUse ? 'Choose now (optional)' : 'Person or role'}
          data={pickerOptions}
          value={value}
          clearable
          searchable
          disabled={!canEdit || savingStage === key}
          onChange={(next) => void saveStage(workflow, stage, next)}
        />
      </Box>
    )
  }

  return (
    <Layout title="Who does what">
      <Container size="lg" py="xl">
        <Stack gap="xl">
          <Box>
            <Group gap="xs" mb={4}>
              <IconUsersGroup size={22} />
              <Title order={2}>Who does what</Title>
            </Group>
            <Text c="dimmed" size="sm">
              {orgName ? `${orgName}. ` : ''}Who handles each step.
            </Text>
          </Box>

          {view && (
            <Stack gap={8}>
              <Progress value={((sectionIndex + 1) / sections.length) * 100} size="sm" radius="xl" aria-label="Progress" />
              <Group gap="xs" wrap="wrap">
                {sections.map((item) => (
                  <Button
                    key={item.id}
                    size="xs"
                    radius="xl"
                    variant={item.id === sections[sectionIndex]?.id ? 'filled' : 'light'}
                    onClick={() => setSection(item.id)}
                  >
                    {item.label}
                  </Button>
                ))}
              </Group>
            </Stack>
          )}

          {view && sections[sectionIndex]?.id === 'money' && (
            <Card withBorder radius="md" p="lg">
              <Stack gap="sm">
                <Text fw={600}>Who approves and who releases money</Text>
                <Group gap="xs" wrap="wrap">
                  {(view.presets || []).map((preset) => (
                    <Button
                      key={preset.id}
                      size="xs"
                      variant="light"
                      loading={applyingPreset === preset.id}
                      disabled={!view.canEdit || (applyingPreset !== null && applyingPreset !== preset.id)}
                      onClick={() => void applyPreset(preset.id)}
                    >
                      {preset.title}
                    </Button>
                  ))}
                </Group>
                <SegmentedControl
                  fullWidth
                  disabled={!view.canEdit || savingPolicy}
                  value={view.policy.signGroups?.requisition_approval === 'one' ? 'one' : 'both'}
                  onChange={(value) => void savePolicy({ signGroups: { requisition_approval: value === 'one' ? 'one' : 'both' } })}
                  data={[
                    { value: 'one', label: 'One person confirms' },
                    { value: 'both', label: 'Manager and finance each confirm' },
                  ]}
                />
                {purchaseRequests &&
                  purchaseRequests.stages
                    .filter((stage) => stage.moneyStep)
                    .map((stage) => renderStage(purchaseRequests, stage))}
                <Text size="xs" c={moneyGaps ? 'orange' : 'dimmed'}>
                  {moneyGaps
                    ? `Still needs a person: ${moneyGapTitles.join(', ')}.`
                    : 'Every request uses these people unless you change one on its own screen.'}
                </Text>
              </Stack>
            </Card>
          )}

          {fromOnboarding && (
            <Card withBorder radius="md" p="lg" style={{ background: 'var(--mantine-color-blue-0)' }}>
              <Group justify="space-between" align="flex-start" wrap="wrap">
                <Box style={{ flex: 1, minWidth: 260 }}>
                  <Text fw={600} size="sm" mb={2}>
                    Setup step · Who does what
                  </Text>
                  <Text size="sm" c="dimmed">
                    Choose who approves and who releases money.
                  </Text>
                </Box>
                <Button
                  variant="light"
                  size="sm"
                  component={Link}
                  href="/organization/setup"
                  rightSection={<IconArrowRight size={14} />}
                >
                  Continue to setup
                </Button>
              </Group>
            </Card>
          )}

          {error && (
            <Alert icon={<IconAlertCircle size={16} />} color="red" title="Could not load" radius="md">
              {error}
            </Alert>
          )}

          {!view && loading && (
            <Group justify="center" py="xl">
              <Loader />
            </Group>
          )}

          {view && (
            <>
              {!canEdit && (
                <Alert color="yellow" radius="md" icon={<IconAlertCircle size={16} />}>
                  Only an owner can change who does what.
                </Alert>
              )}

              {/* ── Role credentials to wallets ───────────────── */}
              {sections[sectionIndex]?.id === 'cards' && (
              <Card withBorder radius="md" p="lg">
                <Group justify="space-between" align="flex-start" wrap="wrap">
                  <Box style={{ flex: 1, minWidth: 260 }}>
                    <Group gap="xs" mb={2}>
                      <IconWallet size={18} />
                      <Text fw={600} size="sm">
                        Role cards
                      </Text>
                      {offerSummary && (
                        <Badge color={offerSummary.failed > 0 ? 'orange' : 'teal'} variant="light">
                          {offerSummary.offered} sent · {offerSummary.covered} already held
                          {offerSummary.failed > 0 ? ` · ${offerSummary.failed} failed` : ''}
                        </Badge>
                      )}
                    </Group>
                    <Text size="xs" c="dimmed">
                      Each person accepts a role card in the app.
                    </Text>
                  </Box>
                  <Group gap="xs" wrap="wrap">
                    <Button
                      size="sm"
                      leftSection={<IconWallet size={14} />}
                      onClick={() => sendRoleCredentials(false)}
                      loading={offering}
                      disabled={!canEdit}
                    >
                      Send role cards
                    </Button>
                    <Button size="sm" variant="subtle" onClick={() => sendRoleCredentials(true)} loading={offering} disabled={!canEdit}>
                      Resend to everyone
                    </Button>
                  </Group>
                </Group>
                {myPendingRoleCards.length > 0 && (
                  <Stack gap="xs" mt="md">
                    {myPendingRoleCards.map((card) => (
                      <Alert key={card.id} color="blue" variant="light" icon={<IconWallet size={16} />} title="Your role card is waiting">
                        <Group justify="space-between" align="center" wrap="wrap" gap="sm">
                          <Text size="xs" style={{ flex: 1, minWidth: 220 }}>
                            Add it so you can sign off and release payments from here.
                          </Text>
                          <Button size="xs" onClick={() => acceptMyRoleCard(card)} loading={acceptingRoleCard === card.id}>
                            Add to my wallet
                          </Button>
                        </Group>
                      </Alert>
                    ))}
                  </Stack>
                )}
              </Card>
              )}

              {/* ── Each kind of request: its own steps, money folded into one line ── */}
              {view.workflows.filter((workflow) => workflow.workflowType === sections[sectionIndex]?.id).map((workflow) => {
                const own = workflow.stages.filter((stage) => !stage.moneyStep)
                const money = workflow.stages.filter((stage) => stage.moneyStep)
                const onTheJob = plainRequestName(workflow) === 'Jobs'
                const assignHere = onTheJob ? [] : own.filter((stage) => !stage.askedOnFirstUse)
                if (isPurchaseRequests(workflow) && assignHere.length === 0) return null
                const namedOnTheJob = onTheJob
                  ? own
                      .filter((stage) => stage.actor.userId || stage.actor.walletTenantId)
                      .map((stage) => `${shortStepTitle(stage.stageAction, stage.title)}: ${personName(members, stage.actor.userId || stage.actor.walletTenantId || '', meUserId)}`)
                  : []
                const overridden = money.filter((stage) => stage.default?.enabled)
                const open = Boolean(moneyOverrideOpen[workflow.workflowType]) || overridden.length > 0
                const showMoney = !isPurchaseRequests(workflow) && money.length > 0
                return (
                  <Card key={workflow.templateId || workflow.workflowType} withBorder radius="md" p="lg">
                    <Text fw={600} mb="sm">
                      {plainRequestName(workflow)}
                    </Text>
                    <Stack gap="md">
                      {onTheJob && (
                        <Text size="sm" c="dimmed">
                          Who goes out and who checks the work is asked when you create a job.
                          {namedOnTheJob.length > 0 ? ` Right now, ${namedOnTheJob.join('. ')}.` : ''}
                        </Text>
                      )}
                      {!onTheJob && own.some((stage) => stage.askedOnFirstUse) && (
                        <Text size="sm" c="dimmed">
                          The other people are asked the first time you use this.
                        </Text>
                      )}
                      {assignHere.map((stage) => renderStage(workflow, stage))}
                      {showMoney && !open && (
                        <Group justify="space-between" align="center" wrap="wrap">
                          <Text size="sm" c="dimmed">
                            Money steps · same as purchase requests
                          </Text>
                          {canEdit && (
                            <Button
                              size="xs"
                              variant="subtle"
                              onClick={() => setMoneyOverrideOpen((current) => ({ ...current, [workflow.workflowType]: true }))}
                            >
                              Use someone else here
                            </Button>
                          )}
                        </Group>
                      )}
                      {showMoney && open && money.map((stage) => renderStage(workflow, stage))}
                    </Stack>
                  </Card>
                )
              })}

              {/* ── Fallback policy ───────────────────────────── */}
              {sections[sectionIndex]?.id === 'backups' && (
              <Card withBorder radius="md" p="lg">
                <Group justify="space-between" mb="sm">
                  <Text fw={600}>If nobody is chosen</Text>
                  {savingPolicy && <Loader size="xs" />}
                </Group>
                <Stack gap="md">
                  <ChainEditor
                    chain={view.policy.defaultChain}
                    members={members}
                    roles={roles}
                    meUserId={meUserId}
                    disabled={!canEdit || savingPolicy}
                    emptyHint="No backup list yet."
                    onChange={(next) => void savePolicy({ defaultChain: next })}
                  />
                  <Switch
                    label="Use the usual role order"
                    checked={view.policy.useBuiltInRoleFallbacks}
                    disabled={!canEdit || savingPolicy}
                    onChange={(e) => void savePolicy({ useBuiltInRoleFallbacks: e.currentTarget.checked })}
                  />
                  <Switch
                    label="Owner can stand in"
                    checked={view.policy.ownerFallbackEnabled}
                    disabled={!canEdit || savingPolicy}
                    onChange={(e) => void savePolicy({ ownerFallbackEnabled: e.currentTarget.checked })}
                  />
                </Stack>
              </Card>
              )}

              <Group justify="space-between">
                <Button
                  variant="subtle"
                  color="gray"
                  disabled={sectionIndex === 0}
                  onClick={() => setSection(sections[sectionIndex - 1]?.id || 'money')}
                >
                  Back
                </Button>
                {sectionIndex < sections.length - 1 ? (
                  <Button rightSection={<IconArrowRight size={14} />} onClick={() => setSection(sections[sectionIndex + 1].id)}>
                    Next: {sections[sectionIndex + 1].label}
                  </Button>
                ) : (
                  <Button component={Link} href="/organization/setup" rightSection={<IconArrowRight size={14} />}>
                    Done
                  </Button>
                )}
              </Group>
            </>
          )}
        </Stack>
      </Container>
    </Layout>
  )
}
