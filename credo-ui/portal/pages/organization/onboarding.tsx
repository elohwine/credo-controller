import React, { useEffect, useRef, useState } from 'react'
import { LottiePlayer } from '@/components/feedback/LottiePlayer'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Layout from '@/components/Layout'
import axios from 'axios'
import { getOrgScopedToken, readActiveOrganization } from '@/utils/organizationContext'
import {
  KEEP_CURRENT_MONEY,
  MONEY_CHOICES,
  ORG_KIND_OPTIONS,
  ORG_MODULE_OPTIONS,
  PAYMENT_CHOICES,
  SETUP_BOOTSTRAP_PATH,
  SETUP_PROFILE_PATH,
  SETUP_QUESTION_HELP,
  bootstrapRequest,
  mainPeopleLine,
  staffCardLimitFor,
  cleanDepartmentNames,
  suggestedDepartmentsFor,
  suggestedOrgModules,
  kindsFromRequestTypes,
  modulePlanNote,
  OPERATING_MODEL_NOTE,
  startingModules,
  isLockedModule,
  withLockedModules,
  LOCKED_MODULE_NOTE,
  openedWorkAreas,
  persistOrgProfile,
  clearOrgSetupDraft,
  readOrgSetupDraft,
  saveOrgSetupDraft,
  type OrgSetupDraft,
  profileFromServer,
  profileToServer,
  readOrgProfile,
  editionHasPresetSetup,
  type OrgKind,
  type OrgModule,
  type OrgProfile,
  type OrgOperatingModel,
  type OrgSetupPlan,
  type PaymentChoice,
} from '@/utils/orgProfile'
import { PRODUCT_NAME } from '../../../../src/config/productEdition'
import { reveal } from '../../../shared/reveal'
import {
  Alert,
  Accordion,
  Box,
  Button,
  Card,
  Chip,
  Container,
  Group,
  Progress,
  Radio,
  NumberInput,
  Stack,
  Switch,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core'
import { IconAlertCircle, IconArrowRight, IconBuildingCommunity, IconCheck, IconUsersGroup } from '@tabler/icons-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type ApprovalPreset = { id: string; title: string; detail: string; signMode: 'one' | 'both' }

/** Radio value for "leave the people already chosen under Who does what alone". */
const KEEP_CURRENT = KEEP_CURRENT_MONEY

/** Shown until the server list loads, and if it cannot be loaded. Ids match the server presets. */
const FALLBACK_PRESETS: ApprovalPreset[] = [
  {
    id: 'owner_handles_money',
    title: 'Owner handles money',
    detail: 'One confirmation from the owner approves a request. The owner also releases the money.',
    signMode: 'one',
  },
  {
    id: 'finance_team',
    title: 'Manager, then finance',
    detail: 'The manager confirms, then the finance officer confirms separately. A director releases the money.',
    signMode: 'both',
  },
  {
    id: 'director_signs_once',
    title: 'Director confirms once',
    detail: 'One confirmation from a director approves a request. A finance officer releases the money.',
    signMode: 'one',
  },
]

// ─── What was set up for you (display-only) ───────────────────────────────────

const PROVISIONING_ITEMS = [
  { label: 'Organisation created', icon: <IconBuildingCommunity size={14} /> },
  { label: 'You are the owner', icon: <IconUsersGroup size={14} /> },
]

/** One question opened on its own from the Setup checklist. */
type SingleStep = 'kinds' | 'people' | 'teams' | 'money' | 'payments'
type QuestionNumber = 1 | 2 | 3 | 4 | 5
const QUESTION_COUNT = 5
const STEP_QUESTION: Record<SingleStep, QuestionNumber> = { kinds: 1, people: 2, teams: 3, money: 4, payments: 5 }
const STEP_LABEL: Record<SingleStep, string> = {
  kinds: 'What you do',
  people: 'Work areas',
  teams: 'Teams',
  money: 'Who handles money',
  payments: 'Payments',
}

function isSingleStep(value: unknown): value is SingleStep {
  return value === 'kinds' || value === 'people' || value === 'teams' || value === 'money' || value === 'payments'
}

// ─── Main page ────────────────────────────────────────────────────────────────

/** A preset edition is never asked the setup questions; its owners go straight to Organisation setup. */
export default function OnboardingPage() {
  const router = useRouter()
  const preset = editionHasPresetSetup()
  useEffect(() => {
    if (preset) void router.replace('/organization/setup')
  }, [preset, router])
  if (preset) return null
  return <SetupQuestions />
}

function SetupQuestions() {
  const router = useRouter()
  const [orgName, setOrgName] = useState('')
  const [orgTenantId, setOrgTenantId] = useState('')
  const [step, setStep] = useState<'welcome' | 'questions' | 'review' | 'done'>('welcome')
  const single = isSingleStep(router.query.step) ? router.query.step : null
  /** Checklist steps still to do after this one, in order (from Setup). */
  const thenSteps = String(router.query.then || '')
    .split(',')
    .filter(isSingleStep)
  const [question, setQuestion] = useState<QuestionNumber>(1)
  const [presets, setPresets] = useState<ApprovalPreset[]>(FALLBACK_PRESETS)
  /** True when the organization already chose people for its money steps. */
  const [hasMoneySetup, setHasMoneySetup] = useState(false)
  const [kinds, setKinds] = useState<OrgKind[]>(['office'])
  const [modules, setModules] = useState<OrgModule[]>(() => startingModules(null, ['office']))
  const [operatingModel, setOperatingModel] = useState<OrgOperatingModel>('internal')
  const [presetId, setPresetId] = useState('owner_handles_money')
  const [paymentChoice, setPaymentChoice] = useState<PaymentChoice>('simulated')
  /** Teams already on the organisation (active departments). */
  const [existingTeams, setExistingTeams] = useState<string[]>([])
  /** The owner's own pick; until they touch it, suggestions follow the other answers. */
  const [pickedTeams, setPickedTeams] = useState<string[] | null>(null)
  const [newTeam, setNewTeam] = useState('')
  const [review, setReview] = useState<OrgSetupPlan | null>(null)
  /** Staff card limit picked on the review screen. undefined: not touched yet (keep current or suggest). */
  const [cardLimit, setCardLimit] = useState<number | null | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const backendUrl = process.env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000'

  const [brandConfigured, setBrandConfigured] = useState<boolean | undefined>(undefined)
  /** Set when unconfirmed answers from an earlier visit were restored. */
  const [resumedDraft, setResumedDraft] = useState<OrgSetupDraft | null>(null)
  /** True once the owner has answered or moved through the full guide; answers then autosave on this device. */
  const [drafting, setDrafting] = useState(false)
  /** A restored draft wins over answers that load later from the server. */
  const draftRestored = useRef(false)
  const discarding = useRef(false)

  const restoreDraft = (draft: OrgSetupDraft) => {
    draftRestored.current = true
    if (draft.kinds.length > 0) setKinds(draft.kinds)
    setModules(draft.modules)
    if (draft.operatingModel) setOperatingModel(draft.operatingModel)
    if (draft.presetId) setPresetId(draft.presetId)
    setPaymentChoice(draft.paymentChoice)
    setPickedTeams(draft.teams)
    setQuestion(draft.question)
    setResumedDraft(draft)
    setDrafting(true)
    setStep('questions')
  }

  /** Throw away the restored answers and begin again from the owner's saved (or suggested) answers. */
  const startAgain = () => {
    discarding.current = true
    if (orgTenantId) clearOrgSetupDraft(orgTenantId)
    window.location.assign('/organization/onboarding')
  }

  useEffect(() => {
    if (!orgTenantId || single) return
    const draft = readOrgSetupDraft(orgTenantId)
    if (draft) restoreDraft(draft)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgTenantId, single])

  useEffect(() => {
    if (!drafting || discarding.current || single || !orgTenantId || step !== 'questions') return
    saveOrgSetupDraft(orgTenantId, { question, kinds, modules, operatingModel, presetId, paymentChoice, teams: pickedTeams })
  }, [drafting, single, orgTenantId, step, question, kinds, modules, operatingModel, presetId, paymentChoice, pickedTeams])

  useEffect(() => {
    if (!orgTenantId) return
    let live = true
    axios
      .get(`${backendUrl}/api/public/orgs/${encodeURIComponent(orgTenantId)}/brand`)
      .then((res) => { if (live) setBrandConfigured(Boolean(res.data?.configured)) })
      .catch(() => { if (live) setBrandConfigured(false) })
    return () => { live = false }
  }, [orgTenantId])

  useEffect(() => {
    if (!single) return
    setQuestion(STEP_QUESTION[single])
    setStep('questions')
  }, [single])

  useEffect(() => {
    const activeOrg = readActiveOrganization()
    if (activeOrg?.orgTenantId) {
      setOrgName(activeOrg.name)
      setOrgTenantId(activeOrg.orgTenantId)
    }
    const saved = readOrgProfile()
    if (saved && !draftRestored.current) {
      if (saved.kinds.length > 0) setKinds(saved.kinds)
      setModules(startingModules(saved, saved.kinds, saved.operatingModel))
      setOperatingModel(saved.operatingModel || 'internal')
      if (saved.approvalPresetId) setPresetId(saved.approvalPresetId)
      setPaymentChoice(saved.paymentChoice)
      // Coming back to change an answer: skip the welcome screen.
      if (saved.completedAt) setStep('questions')
    }
  }, [])

  /** Answers saved on the server, so another device or browser opens where the owner left off. */
  const [savedProfile, setSavedProfile] = useState<OrgProfile | null>(null)

  useEffect(() => {
    if (!orgTenantId) return
    const token = getOrgScopedToken()
    if (!token) return
    axios
      .get(`${backendUrl}/api/organizations/${encodeURIComponent(orgTenantId)}${SETUP_PROFILE_PATH}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        const server = profileFromServer(res.data)
        if (!server) return
        setSavedProfile(server)
        persistOrgProfile(server)
        if (draftRestored.current) return
        if (server.kinds.length > 0) setKinds(server.kinds)
        setModules(startingModules(server, server.kinds, server.operatingModel))
        setOperatingModel(server.operatingModel || 'internal')
        if (server.approvalPresetId) setPresetId(server.approvalPresetId)
        setPaymentChoice(server.paymentChoice)
        if (server.completedAt) setStep('questions')
      })
      .catch(() => {
        /* local answers stay */
      })
  }, [backendUrl, orgTenantId])

  useEffect(() => {
    if (!orgTenantId) return
    const token = getOrgScopedToken()
    if (!token) return
    axios
      .get<{
        presets?: ApprovalPreset[]
        workflows?: Array<{ workflowType: string; stages?: Array<{ stageAction: string; default?: unknown }> }>
      }>(`${backendUrl}/api/organizations/${encodeURIComponent(orgTenantId)}/workflows/actors`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        if (res.data?.presets?.length) setPresets(res.data.presets)
        const moneyStages = new Set([
          'approve_requisition',
          'finance_approve_requisition',
          'release_funds',
          'trigger_payout',
          'record_payment',
          'issue_receipt_vc',
          'present_payment_proof',
          'acknowledge_remittance',
        ])
        const workflows = res.data?.workflows || []
        const alreadySet = workflows.some((workflow) =>
          (workflow.stages || []).some((stage) => stage.default && moneyStages.has(stage.stageAction)),
        )
        if (alreadySet) {
          setHasMoneySetup(true)
          if (!draftRestored.current) setPresetId((current) => (readOrgProfile()?.approvalPresetId ? current : KEEP_CURRENT))
        }
        if (!draftRestored.current && !readOrgProfile()?.kinds?.length) {
          const derived = kindsFromRequestTypes(workflows.map((workflow) => workflow.workflowType))
          if (derived.length > 0) setKinds(derived)
        }
      })
      .catch(() => {
        /* fallback list stays */
      })
  }, [backendUrl, orgTenantId])

  useEffect(() => {
    if (!orgTenantId) return
    const token = getOrgScopedToken()
    if (!token) return
    axios
      .get<Array<{ name: string }>>(`${backendUrl}/api/organizations/${encodeURIComponent(orgTenantId)}/departments`, {
        headers: { Authorization: 'Bearer ' + token },
      })
      .then((res) => setExistingTeams(cleanDepartmentNames((res.data || []).map((item) => item.name))))
      .catch(() => {
        /* suggestions still show */
      })
  }, [backendUrl, orgTenantId])

  const suggestedTeams = suggestedDepartmentsFor({
    kinds,
    modules,
    approvalPresetId: presetId === KEEP_CURRENT ? savedProfile?.approvalPresetId : presetId,
  })
  const selectedTeams = pickedTeams ?? cleanDepartmentNames([...existingTeams, ...suggestedTeams])
  const teamOptions = cleanDepartmentNames([...existingTeams, ...suggestedTeams, ...selectedTeams])
  const addTeam = () => {
    const name = newTeam.trim()
    if (!name) return
    setPickedTeams(cleanDepartmentNames([...selectedTeams, name]))
    setNewTeam('')
  }

  const authHeaders = () => {
    const token = getOrgScopedToken()
    return token ? { headers: { Authorization: `Bearer ${token}` } } : null
  }

  const orgUrl = (path: string) => `${backendUrl}/api/organizations/${encodeURIComponent(orgTenantId)}${path}`

  const currentProfile = (): OrgProfile => {
    const previous = savedProfile || readOrgProfile()
    return {
      orgTenantId,
      operatingModel,
      access: previous?.access,
      kinds,
      modules,
      approvalPresetId: presetId === KEEP_CURRENT ? previous?.approvalPresetId || '' : presetId,
      approvalTitle:
        presetId === KEEP_CURRENT
          ? previous?.approvalTitle || 'People chosen under Who does what'
          : presets.find((preset) => preset.id === presetId)?.title || '',
      paymentChoice,
      completedAt: new Date().toISOString(),
      plan: previous?.plan,
    }
  }

  /** Answers, teams, roles, money people and payments go up together; the server does the rest. */
  const sendBootstrap = async (dryRun: boolean) => {
    if (!orgTenantId) throw new Error('No organisation context. Please return to setup and try again.')
    const auth = authHeaders()
    if (!auth) throw new Error('Organisation session missing. Switch to the organisation and try again.')
    const body = bootstrapRequest(currentProfile(), {
      departments: selectedTeams,
      moneyPresetId: presetId,
      dryRun,
      ...(dryRun ? {} : { cardRequiredAbove: staffCardLimitFor(review, cardLimit) }),
    })
    return (await axios.post(orgUrl(SETUP_BOOTSTRAP_PATH), body, auth)).data as OrgSetupPlan & { profile?: unknown }
  }

  /** Show what will be set up before anything is saved. */
  const preview = async () => {
    setError(null)
    setSaving(true)
    try {
      setReview(await sendBootstrap(true))
      setStep('review')
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Could not prepare your setup')
    } finally {
      setSaving(false)
    }
  }

  const finish = async () => {
    setError(null)
    setSaving(true)
    try {
      const result = await sendBootstrap(false)
      const saved = profileFromServer(result.profile)
      if (saved) {
        setSavedProfile(saved)
        persistOrgProfile(saved)
      }
      setExistingTeams(result.departments.map((item) => item.name))
      setPickedTeams(null)
      setDrafting(false)
      clearOrgSetupDraft(orgTenantId)
      setStep('done')
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Could not save your answers')
    } finally {
      setSaving(false)
    }
  }

  /** Save just the one question opened from Setup, then show what is next. */
  const saveSingle = async () => {
    if (!single) return
    setError(null)
    const auth = authHeaders()
    if (!auth || !orgTenantId) {
      setError('Organisation session missing. Switch to the organisation and try again.')
      return
    }
    setSaving(true)
    try {
      if (single === 'kinds') {
        await axios.put(orgUrl(SETUP_PROFILE_PATH), { kinds }, auth)
      }
      if (single === 'people') {
        await axios.put(orgUrl(SETUP_PROFILE_PATH), { modules }, auth)
      }
      if (single === 'teams') {
        const result = await axios.post(orgUrl(SETUP_BOOTSTRAP_PATH), { departments: selectedTeams }, auth)
        setExistingTeams((result.data?.departments || []).map((item: { name: string }) => item.name))
        setPickedTeams(null)
      }
      if (single === 'money') {
        if (presetId !== KEEP_CURRENT) {
          await axios.post(orgUrl('/workflows/actors/presets'), { presetId }, auth)
        }
        const title =
          presetId === KEEP_CURRENT
            ? savedProfile?.approvalTitle || 'People chosen under Who does what'
            : presets.find((preset) => preset.id === presetId)?.title || ''
        await axios.put(
          orgUrl(SETUP_PROFILE_PATH),
          { approvalPresetId: presetId === KEEP_CURRENT ? savedProfile?.approvalPresetId : presetId, approvalTitle: title },
          auth,
        )
      }
      if (single === 'payments') {
        if (paymentChoice !== 'none') {
          await axios.post(orgUrl('/setup/payments'), { method: paymentChoice }, auth)
        }
        await axios.put(orgUrl(SETUP_PROFILE_PATH), { paymentChoice }, auth)
      }
      setStep('done')
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  const goToStep = (next: SingleStep, rest: SingleStep[]) => {
    setStep('questions')
    void router.push({ pathname: '/organization/onboarding', query: { step: next, then: rest.join(',') } })
  }

  /** Purchase requests, supplier bills and customer payments work without any answers. */
  const skip = async () => {
    setError(null)
    await router.push('/organization/setup')
  }

  // ── Screen 1: Welcome ──────────────────────────────────────────────────────

  if (step === 'welcome') {
    return (
      <Layout title={`Welcome to ${PRODUCT_NAME}`}>
        <Container size="sm" py={60}>
          <Stack className={reveal.stagger} gap="xl" align="center">
            <Box ta="center">
              <ThemeIcon color="teal" variant="light" radius="xl" size={56} mb="md">
                <IconCheck size={28} />
              </ThemeIcon>
              <Title order={2} mb={4}>
                {orgName ? `${orgName} is ready` : 'Your organisation is ready'}
              </Title>
              <Text c="dimmed" size="sm">
                Tell us what you do. We will suggest the rest, and you choose what to keep.
              </Text>
            </Box>

            <Card withBorder radius="md" p="lg" w="100%">
              <Stack gap="sm">
                {PROVISIONING_ITEMS.map((item) => (
                  <Group key={item.label} gap="sm">
                    <ThemeIcon color="teal" variant="light" radius="xl" size="md">
                      <IconCheck size={12} />
                    </ThemeIcon>
                    <Text size="sm" fw={500}>
                      {item.label}
                    </Text>
                  </Group>
                ))}
              </Stack>
            </Card>

            <Text size="sm" c="dimmed" ta="center" maw={440}>
              {QUESTION_COUNT} short questions, then a review. Team invites, branding and advanced settings can wait.
            </Text>

            <Group gap="md">
              <Button size="md" rightSection={<IconArrowRight size={16} />} onClick={() => setStep('questions')}>
                Get started
              </Button>
              <Button size="md" variant="subtle" component={Link} href="/organization/setup">
                Explore first
              </Button>
            </Group>
          </Stack>
        </Container>
      </Layout>
    )
  }

  // ── Done: a small win, then the next step ─────────────────────────────────

  if (step === 'done') {
    const nextStep = thenSteps[0]
    // Same list as the phone app's done card (customer payments are hidden on this branch).
    const open = openedWorkAreas(kinds, modules)
    return (
      <Layout title="Saved">
        <Container size="sm" py={60}>
          <Stack key={`done-${single || "all"}`} className={reveal.stagger} gap="xl" align="center">
            {single ? (
              <ThemeIcon color="teal" variant="light" radius="xl" size={56}>
                <IconCheck size={28} />
              </ThemeIcon>
            ) : (
              <LottiePlayer kind="org_setup" size={140} />
            )}
            <Box ta="center">
              <Title order={2} mb={4}>
                {single ? `${STEP_LABEL[single]} saved` : `${orgName || 'Your organisation'} is set up`}
              </Title>
              {!single && (
                <Text c="dimmed" size="sm">
                  What you can do now: {open.join(', ')}.
                </Text>
              )}
              {!single && kinds.includes('field') && (
                <Text c="dimmed" size="sm" mt={4}>
                  You pick who goes out on the first job.
                </Text>
              )}
            </Box>
            <Group gap="md">
              {nextStep ? (
                <Button
                  size="md"
                  rightSection={<IconArrowRight size={16} />}
                  onClick={() => goToStep(nextStep, thenSteps.slice(1))}
                >
                  Next: {STEP_LABEL[nextStep]}
                </Button>
              ) : !single ? (
                <>
                  {brandConfigured === false && (
                    <Button size="md" rightSection={<IconArrowRight size={16} />} component={Link} href="/organization/brand">
                      Next: add your logo and document details
                    </Button>
                  )}
                  <Button
                    size="md"
                    variant={brandConfigured === false ? 'light' : 'filled'}
                    rightSection={<IconArrowRight size={16} />}
                    component={Link}
                    href="/hr?tab=team"
                  >
                    Add your people
                  </Button>
                </>
              ) : null}
              <Button size="md" variant={nextStep || !single ? 'subtle' : 'filled'} component={Link} href="/organization/setup">
                {nextStep ? 'Finish later' : 'Back to setup'}
              </Button>
            </Group>
          </Stack>
        </Container>
      </Layout>
    )
  }

  // ── Review: everything the answers will set up, before saving ─────────────

  if (step === 'review' && review) {
    const newCount = (items: Array<{ status: string }>) => items.filter((item) => item.status !== 'existing').length
    return (
      <Layout title="Review your setup">
        <Container size="sm" py={60}>
          <Stack key="review" className={reveal.stagger} gap="lg">
            <Box>
              <Title order={2} mb={4}>
                Here is what we will set up
              </Title>
              <Text c="dimmed" size="sm">
                Nothing is saved until you confirm. You can change any of this later.
              </Text>
            </Box>

            {error && (
              <Alert icon={<IconAlertCircle size={16} />} color="red" radius="md">
                {error}
              </Alert>
            )}

            <Card withBorder radius="md" p="md">
              <Text fw={600} size="sm" mb={6}>
                Work areas
              </Text>
              {review.workAreas.length === 0 ? (
                <Text size="sm" c="dimmed">
                  {operatingModel === 'integration'
                    ? 'None here. Connect your own systems after setup.'
                    : 'Purchase requests and supplier bills. Add more any time.'}
                </Text>
              ) : (
                <Group gap={6}>
                  {review.workAreas.map((area) => (
                    <Chip key={area.id} checked={area.included} readOnly size="sm" variant="light">
                      {area.label}
                    </Chip>
                  ))}
                </Group>
              )}
            </Card>

            <Card withBorder radius="md" p="md">
              <Text fw={600} size="sm" mb={6}>
                Teams {newCount(review.departments) > 0 ? `(${newCount(review.departments)} new)` : ''}
              </Text>
              <Text size="sm">
                {review.departments
                  .map((item) => (item.status === 'existing' ? item.name : `${item.name} (${item.status})`))
                  .join(', ')}
              </Text>
            </Card>

            <Card withBorder radius="md" p="md">
              <Text fw={600} size="sm" mb={6}>
                Roles {newCount(review.roles) > 0 ? `(${newCount(review.roles)} new)` : ''}
              </Text>
              <Text size="sm">
                {review.roles.map((role) => (role.status === 'new' ? `${role.name} (new)` : role.name)).join(', ')}
              </Text>
              <Text size="xs" c="dimmed" mt={4}>
                Add people into these roles under HR operations.
              </Text>
            </Card>

            {(review.mainPeople?.length ?? 0) > 0 && (
              <Card withBorder radius="md" p="md">
                <Text fw={600} size="sm" mb={6}>
                  Who does what
                </Text>
                <Text size="sm">{mainPeopleLine(review)}</Text>
                <Text size="xs" c="dimmed" mt={4}>
                  Every step of that kind, in every request and workflow, goes here. Until someone holds the role, you
                  stand in. Change it under Organisation → Who does what.
                </Text>
              </Card>
            )}

            <Card withBorder radius="md" p="md">
              <Text fw={600} size="sm" mb={6}>
                Money
              </Text>
              {review.money.keepCurrent ? (
                <Text size="sm">Keeps the people already chosen under Who does what.</Text>
              ) : (
                <Stack gap={2}>
                  <Text size="sm">Approves: {review.money.approves}</Text>
                  {review.money.financeConfirms && <Text size="sm">Finance confirms: {review.money.financeConfirms}</Text>}
                  <Text size="sm">Releases the money: {review.money.releases}</Text>
                </Stack>
              )}
              <Text size="sm" mt={6}>
                Payments: {review.payment.name || 'Not yet'}
              </Text>
            </Card>

            {review.staffCard && (() => {
              const limit = staffCardLimitFor(review, cardLimit)
              return (
                <Card withBorder radius="md" p="md">
                  <Switch
                    checked={limit !== null && limit !== undefined}
                    onChange={(event) =>
                      setCardLimit(event.currentTarget.checked ? review.staffCard!.suggested : null)
                    }
                    label="Ask for the staff card on large amounts"
                    description="Approving a purchase, payment, expense claim or salary advance above this amount needs the approver's staff card from their wallet. Everyone who approves is sent their card now."
                  />
                  {limit !== null && limit !== undefined && (
                    <NumberInput
                      mt="sm"
                      label="Above this amount"
                      min={0}
                      value={limit}
                      onChange={(value) => setCardLimit(typeof value === 'number' ? value : Number(value) || 0)}
                      maw={220}
                    />
                  )}
                </Card>
              )
            })()}

            <Alert color="teal" variant="light" radius="md" title="Nothing has to be set up first">
              {review.askedOnFirstUse.length > 0 && <Text size="sm">{review.askedOnFirstUse.join(' ')}</Text>}
              <Text size="sm">
                If nobody is chosen for a step, the usual role order is used, then the owner stands in.
              </Text>
            </Alert>

            <Group justify="space-between">
              <Button variant="subtle" color="gray" onClick={() => setStep('questions')} disabled={saving}>
                Back
              </Button>
              <Button size="md" loading={saving} rightSection={<IconArrowRight size={16} />} onClick={finish}>
                Set it up
              </Button>
            </Group>
          </Stack>
        </Container>
      </Layout>
    )
  }

  // ── Screen 2: Questions about the organization ─────────────────────────────

  const questionTitle =
    question === 1
      ? `What does ${orgName || 'your organisation'} do?`
      : question === 2
        ? 'Which of these would be useful for your organisation?'
        : question === 3
          ? 'Which teams do you have?'
          : question === 4
            ? 'Who approves and releases money?'
            : 'How do you take payments?'
  const plan = savedProfile?.plan || readOrgProfile()?.plan

  return (
    <Layout title="About your organization">
      <Container size="sm" py={60}>
        <Stack
          key={`question-${question}`}
          className={reveal.stagger}
          gap="xl"
          onChangeCapture={() => setDrafting(true)}
          onClickCapture={() => setDrafting(true)}
        >
          <Box>
            <Progress value={(question / QUESTION_COUNT) * 100} size="sm" radius="xl" mb={8} aria-label="Progress" />
            <Text size="sm" c="dimmed" mb={6}>
              Question {question} of {QUESTION_COUNT}
            </Text>
            <Title order={2}>{questionTitle}</Title>
            {question === 1 && (
              <Text c="dimmed" size="sm" mt={4}>{SETUP_QUESTION_HELP[1]}</Text>
            )}
          </Box>

          {resumedDraft && !single && question === resumedDraft.question && (
            <Alert color="blue" radius="md" title="Picked up where you left off">
              <Text size="sm">Your earlier answers were kept on this device.</Text>
              <Button variant="subtle" size="compact-sm" px={0} mt={4} onClick={startAgain}>
                Start again
              </Button>
            </Alert>
          )}

          {error && (
            <Alert icon={<IconAlertCircle size={16} />} color="red" radius="md">
              {error}
            </Alert>
          )}

          {question === 1 && (
            <Stack>
            <Accordion variant="separated" radius="md">
              <Accordion.Item value="systems">
                <Accordion.Control>
                  <Text size="sm" fw={500}>Using existing business software?</Text>
                  <Text size="xs" c="dimmed">
                    {operatingModel === 'internal' ? 'Work is handled here. Only change this if you need to connect another system.' : operatingModel === 'integration' ? 'Selected: connect an existing business system.' : 'Selected: handle work here and connect another system.'}
                  </Text>
                </Accordion.Control>
                <Accordion.Panel>
            <Radio.Group label="Where will you handle your work?" value={operatingModel} onChange={(value) => {
              const model = value as OrgOperatingModel
              setOperatingModel(model)
              if (model === 'integration') setModules([])
            }}>
              <Stack gap="xs">
                <Radio value="internal" label="Handle our work here" />
                <Radio value="integration" label="Connect an existing business system" />
                <Radio value="hybrid" label="Both" />
              </Stack>
            </Radio.Group>
            <Text size="xs" c="dimmed" mt="sm">{OPERATING_MODEL_NOTE}</Text>
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>
            {operatingModel !== 'integration' && <Chip.Group multiple value={kinds} onChange={(value) => {
              const answers = value as OrgKind[]
              setKinds(answers)
              setModules(suggestedOrgModules(answers, operatingModel))
            }}>
              <Stack gap="sm">
                {ORG_KIND_OPTIONS.map((option) => (
                  <Box key={option.id}>
                    <Chip
                      value={option.id}
                      size="md"
                      radius="md"
                      variant="outline"
                      styles={{ root: { maxWidth: '100%' }, label: { maxWidth: '100%', whiteSpace: 'normal', height: 'auto', minHeight: 44 } }}
                    >
                      {option.label}
                    </Chip>
                    <Text size="xs" c="dimmed" mt={4} ml={4}>{option.detail}</Text>
                  </Box>
                ))}
              </Stack>
            </Chip.Group>}
            </Stack>
          )}

          {question === 2 && (
            <Stack gap="sm">
            <Text size="sm" c="dimmed">{operatingModel === 'integration' ? 'No internal work areas are needed for a connected system.' : SETUP_QUESTION_HELP[2]}</Text>
            <Chip.Group multiple value={modules} onChange={(value) => setModules(withLockedModules(value as OrgModule[], operatingModel))}>
              <Stack gap="sm">
                {ORG_MODULE_OPTIONS.filter((option) => suggestedOrgModules(kinds, operatingModel).includes(option.id) || isLockedModule(option.id, operatingModel)).map((option) => (
                  <Box key={option.id}>
                    <Chip value={option.id} size="md" radius="md" variant="outline" disabled={isLockedModule(option.id, operatingModel)}>
                      {option.label}
                    </Chip>
                    <Text size="xs" c="dimmed" mt={4} ml={4}>{option.detail}</Text>
                    <Text size="xs" c="dimmed" ml={4}>{isLockedModule(option.id, operatingModel) ? LOCKED_MODULE_NOTE : modulePlanNote(option.id, plan)}</Text>
                  </Box>
                ))}
                <Text size="xs" c="dimmed">{operatingModel === 'integration' ? 'No internal work areas are needed. Your organisation keeps its SSI identity. After setup, connect your own software under Connected systems to sign people in or send your records to their wallets.' : 'Jobs and HR operations are always on. Untick anything else that is handled elsewhere.'}</Text>
              </Stack>
            </Chip.Group>
            </Stack>
          )}

          {question === 3 && (
            <Stack gap="sm">
              <Text size="sm" c="dimmed">
                {SETUP_QUESTION_HELP[3]} Anything without a team goes to General.
              </Text>
              <Chip.Group multiple value={selectedTeams} onChange={(value) => setPickedTeams(value as string[])}>
                <Group gap="xs">
                  {teamOptions.map((name) => (
                    <Chip key={name} value={name} radius="md" variant="outline">
                      {name}
                      {existingTeams.some((team) => team.toLowerCase() === name.toLowerCase()) ? '' : ' (new)'}
                    </Chip>
                  ))}
                </Group>
              </Chip.Group>
              <Group gap="xs" align="flex-end">
                <TextInput
                  style={{ flex: 1 }}
                  label="Add a team"
                  placeholder="e.g. Workshop"
                  maxLength={60}
                  value={newTeam}
                  onChange={(event) => setNewTeam(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      addTeam()
                    }
                  }}
                />
                <Button variant="light" onClick={addTeam} disabled={!newTeam.trim()}>
                  Add
                </Button>
              </Group>
              <Text size="xs" c="dimmed">
                Unticked teams that already exist are kept. Rename or archive them later under Organisation → Departments.
              </Text>
            </Stack>
          )}

          {question === 4 && (
            <Text size="sm" c="dimmed">
              {SETUP_QUESTION_HELP[4]}
            </Text>
          )}

          {question === 4 && (
            <Radio.Group value={presetId} onChange={setPresetId}>
              <Stack gap="xs">
                {hasMoneySetup && (
                  <Radio.Card value={KEEP_CURRENT} radius="md" p="md" withBorder>
                    <Group wrap="nowrap" align="flex-start" gap="sm">
                      <Radio.Indicator mt={2} />
                      <Stack gap={2}>
                        <Text size="sm" fw={600}>Keep what is set now</Text>
                        <Text size="xs" c="dimmed">Leave the people already chosen under Who does what.</Text>
                      </Stack>
                      {presetId === KEEP_CURRENT && (
                        <ThemeIcon color="teal" variant="light" radius="xl" size="sm"><IconCheck size={12} /></ThemeIcon>
                      )}
                    </Group>
                  </Radio.Card>
                )}
                {presets.map((preset) => {
                  const choice = MONEY_CHOICES.find((item) => item.id === preset.id)
                  const selected = presetId === preset.id
                  return (
                    <Radio.Card key={preset.id} value={preset.id} radius="md" p="md" withBorder>
                      <Group wrap="nowrap" align="flex-start" gap="sm">
                        <Radio.Indicator mt={2} />
                        <Stack gap={2} style={{ flex: 1 }}>
                          <Text size="sm" fw={600}>{choice?.title || preset.title}</Text>
                          <Text size="xs" c="dimmed">{choice?.detail || preset.detail}</Text>
                          {choice && selected && (
                            <>
                              <Text size="xs">Confirms: {choice.confirms}</Text>
                              <Text size="xs">Releases the money: {choice.releases}</Text>
                            </>
                          )}
                        </Stack>
                        {selected && (
                          <ThemeIcon color="teal" variant="light" radius="xl" size="sm"><IconCheck size={12} /></ThemeIcon>
                        )}
                      </Group>
                    </Radio.Card>
                  )
                })}
              </Stack>
            </Radio.Group>
          )}

          {question === 5 && (
            <Stack gap="sm">
            <Text size="sm" c="dimmed">{SETUP_QUESTION_HELP[5]}</Text>
            <Radio.Group value={paymentChoice} onChange={(value) => setPaymentChoice(value as PaymentChoice)}>
              <Stack gap="xs">
                {PAYMENT_CHOICES.map((choice) => (
                  <Radio.Card key={choice.id} value={choice.id} radius="md" p="md" withBorder>
                    <Group wrap="nowrap" align="flex-start" gap="sm">
                      <Radio.Indicator mt={2} />
                      <Stack gap={2} style={{ flex: 1 }}>
                        <Text size="sm" fw={600}>{choice.label}</Text>
                        <Text size="xs" c="dimmed">{choice.detail}</Text>
                      </Stack>
                      {paymentChoice === choice.id && (
                        <ThemeIcon color="teal" variant="light" radius="xl" size="sm"><IconCheck size={12} /></ThemeIcon>
                      )}
                    </Group>
                  </Radio.Card>
                ))}
              </Stack>
            </Radio.Group>
            </Stack>
          )}

          {single ? (
            <Group justify="space-between">
              <Button variant="subtle" color="gray" component={Link} href="/organization/setup" disabled={saving}>
                Cancel
              </Button>
              <Button
                size="md"
                loading={saving}
                disabled={single === 'kinds' && kinds.length === 0}
                rightSection={<IconArrowRight size={16} />}
                onClick={saveSingle}
              >
                Save
              </Button>
            </Group>
          ) : (
          <Group justify="space-between">
            <Button
              variant="subtle"
              color="gray"
              onClick={() => (question === 1 ? skip() : setQuestion((current) => (current - 1) as QuestionNumber))}
              disabled={saving}
            >
              {question === 1 ? "I'll answer later" : 'Back'}
            </Button>
            {question < QUESTION_COUNT ? (
              <Button
                size="md"
                disabled={question === 1 && kinds.length === 0}
                rightSection={<IconArrowRight size={16} />}
                onClick={() => setQuestion((current) => (current + 1) as QuestionNumber)}
              >
                Continue
              </Button>
            ) : (
              <Button size="md" loading={saving} rightSection={<IconArrowRight size={16} />} onClick={preview}>
                Review
              </Button>
            )}
          </Group>
          )}
          {!single && question > 1 && (
            <Button variant="subtle" color="gray" size="sm" onClick={skip} disabled={saving}>
              I'll answer later
            </Button>
          )}
          <Text size="xs" c="dimmed">
            {single
              ? 'Nothing changes until you save. Leaving now discards this change.'
              : 'Nothing changes for your organisation until you confirm the review. Your answers are kept on this device, so you can leave and resume from Setup.'}
          </Text>
        </Stack>
      </Container>
    </Layout>
  )
}
