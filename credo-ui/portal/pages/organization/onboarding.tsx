import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Layout from '@/components/Layout'
import axios from 'axios'
import { getOrgScopedToken, readActiveOrganization } from '@/utils/organizationContext'
import {
  ORG_KIND_OPTIONS,
  PAYMENT_CHOICES,
  SETUP_PROFILE_PATH,
  kindsFromRequestTypes,
  persistOrgProfile,
  profileFromServer,
  profileToServer,
  readOrgProfile,
  type OrgKind,
  type OrgProfile,
  type PaymentChoice,
} from '@/utils/orgProfile'
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  Container,
  Group,
  Progress,
  Radio,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core'
import { IconAlertCircle, IconArrowRight, IconBuildingCommunity, IconCheck, IconUsersGroup } from '@tabler/icons-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type ApprovalPreset = { id: string; title: string; detail: string; signMode: 'one' | 'both' }

/** Radio value for "leave the people already chosen under Who does what alone". */
const KEEP_CURRENT = 'keep_current'

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
  { label: 'Organization created', icon: <IconBuildingCommunity size={14} /> },
  { label: 'You are the owner', icon: <IconUsersGroup size={14} /> },
]

/** One question opened on its own from the Setup checklist. */
type SingleStep = 'kinds' | 'money' | 'payments'
const STEP_QUESTION: Record<SingleStep, 1 | 2 | 3> = { kinds: 1, money: 2, payments: 3 }
const STEP_LABEL: Record<SingleStep, string> = {
  kinds: 'What you do',
  money: 'Who handles money',
  payments: 'Payments',
}

function isSingleStep(value: unknown): value is SingleStep {
  return value === 'kinds' || value === 'money' || value === 'payments'
}

const OPEN_FOR_KIND: Record<OrgKind, string> = {
  office: '',
  field: 'Jobs',
  school: 'School fees',
  shop: 'Counter sales',
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter()
  const [orgName, setOrgName] = useState('')
  const [orgTenantId, setOrgTenantId] = useState('')
  const [step, setStep] = useState<'welcome' | 'questions' | 'done'>('welcome')
  const single = isSingleStep(router.query.step) ? router.query.step : null
  /** Checklist steps still to do after this one, in order (from Setup). */
  const thenSteps = String(router.query.then || '')
    .split(',')
    .filter(isSingleStep)
  const [question, setQuestion] = useState<1 | 2 | 3>(1)
  const [presets, setPresets] = useState<ApprovalPreset[]>(FALLBACK_PRESETS)
  /** True when the organization already chose people for its money steps. */
  const [hasMoneySetup, setHasMoneySetup] = useState(false)
  const [kinds, setKinds] = useState<OrgKind[]>(['office'])
  const [presetId, setPresetId] = useState('owner_handles_money')
  const [paymentChoice, setPaymentChoice] = useState<PaymentChoice>('simulated')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const backendUrl = process.env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000'

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
    if (saved) {
      if (saved.kinds.length > 0) setKinds(saved.kinds)
      if (saved.approvalPresetId) setPresetId(saved.approvalPresetId)
      setPaymentChoice(saved.paymentChoice)
      // Coming back to change an answer: skip the welcome screen.
      setStep('questions')
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
        if (server.kinds.length > 0) setKinds(server.kinds)
        if (server.approvalPresetId) setPresetId(server.approvalPresetId)
        setPaymentChoice(server.paymentChoice)
        setStep('questions')
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
          setPresetId((current) => (readOrgProfile()?.approvalPresetId ? current : KEEP_CURRENT))
        }
        if (!readOrgProfile()?.kinds?.length) {
          const derived = kindsFromRequestTypes(workflows.map((workflow) => workflow.workflowType))
          if (derived.length > 0) setKinds(derived)
        }
      })
      .catch(() => {
        /* fallback list stays */
      })
  }, [backendUrl, orgTenantId])

  const authHeaders = () => {
    const token = getOrgScopedToken()
    return token ? { headers: { Authorization: `Bearer ${token}` } } : null
  }

  const orgUrl = (path: string) => `${backendUrl}/api/organizations/${encodeURIComponent(orgTenantId)}${path}`

  const finish = async () => {
    setError(null)
    if (!orgTenantId) {
      setError('No organization context. Please return to setup and try again.')
      return
    }
    const auth = authHeaders()
    if (!auth) {
      setError('Organization session missing. Switch to the organization and try again.')
      return
    }
    setSaving(true)
    try {
      const previous = savedProfile || readOrgProfile()
      const profile: OrgProfile = {
        kinds,
        approvalPresetId: presetId === KEEP_CURRENT ? previous?.approvalPresetId || '' : presetId,
        approvalTitle:
          presetId === KEEP_CURRENT
            ? previous?.approvalTitle || 'People chosen under Who does what'
            : presets.find((preset) => preset.id === presetId)?.title || '',
        paymentChoice,
        completedAt: new Date().toISOString(),
      }
      // Only the answers go up. The server works out which kinds of request follow.
      await axios.put(orgUrl(SETUP_PROFILE_PATH), profileToServer(profile), auth)
      // One money setup for the whole organization. Every money step borrows it unless changed.
      if (presetId !== KEEP_CURRENT) {
        await axios.post(orgUrl('/workflows/actors/presets'), { presetId }, auth)
      }
      if (paymentChoice !== 'none') {
        await axios.post(orgUrl('/setup/payments'), { method: paymentChoice }, auth)
      }
      persistOrgProfile(profile)
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
      setError('Organization session missing. Switch to the organization and try again.')
      return
    }
    setSaving(true)
    try {
      if (single === 'kinds') {
        await axios.put(orgUrl(SETUP_PROFILE_PATH), { kinds }, auth)
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
      <Layout title="Welcome to Credentis">
        <Container size="sm" py={60}>
          <Stack gap="xl" align="center">
            <Box ta="center">
              <ThemeIcon color="teal" variant="light" radius="xl" size={56} mb="md">
                <IconCheck size={28} />
              </ThemeIcon>
              <Title order={2} mb={4}>
                {orgName ? `${orgName} is ready` : 'Your organization is ready'}
              </Title>
              <Text c="dimmed" size="sm">
                A few short questions, then you can start.
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
              3 questions, about a minute. You can stop and finish later.
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
    const open = [
      'Purchase requests',
      'Supplier bills',
      'Customer payments',
      ...kinds.map((kind) => OPEN_FOR_KIND[kind]).filter(Boolean),
    ]
    return (
      <Layout title="Saved">
        <Container size="sm" py={60}>
          <Stack gap="xl" align="center">
            <ThemeIcon color="teal" variant="light" radius="xl" size={56}>
              <IconCheck size={28} />
            </ThemeIcon>
            <Box ta="center">
              <Title order={2} mb={4}>
                {single ? `${STEP_LABEL[single]} saved` : `${orgName || 'Your organization'} is set up`}
              </Title>
              {!single && (
                <Text c="dimmed" size="sm">
                  Open now: {open.join(', ')}.
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
                <Button size="md" rightSection={<IconArrowRight size={16} />} component={Link} href="/organization/people">
                  Invite your team
                </Button>
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

  // ── Screen 2: Three questions about the organization ───────────────────────

  const questionTitle =
    question === 1
      ? `What does ${orgName || 'your organization'} do?`
      : question === 2
        ? 'Who approves and releases money?'
        : 'How do you take payments?'

  return (
    <Layout title="About your organization">
      <Container size="sm" py={60}>
        <Stack gap="xl">
          <Box>
            <Progress value={(question / 3) * 100} size="sm" radius="xl" mb={8} aria-label="Progress" />
            <Text size="sm" c="dimmed" mb={6}>
              Question {question} of 3
            </Text>
            <Title order={2}>{questionTitle}</Title>
            {question === 1 && (
              <Text c="dimmed" size="sm" mt={4}>
                Pick everything that applies.
              </Text>
            )}
          </Box>

          {error && (
            <Alert icon={<IconAlertCircle size={16} />} color="red" radius="md">
              {error}
            </Alert>
          )}

          {question === 1 && (
            <Chip.Group multiple value={kinds} onChange={(value) => setKinds(value as OrgKind[])}>
              <Stack gap="sm">
                {ORG_KIND_OPTIONS.map((option) => (
                  <Chip key={option.id} value={option.id} size="md" radius="md" variant="outline">
                    {option.label}
                  </Chip>
                ))}
              </Stack>
            </Chip.Group>
          )}

          {question === 2 && (
            <Radio.Group value={presetId} onChange={setPresetId}>
              <Stack gap="xs">
                {hasMoneySetup && (
                  <Radio.Card value={KEEP_CURRENT} radius="md" p="md" withBorder>
                    <Group wrap="nowrap" gap="sm">
                      <Radio.Indicator />
                      <Text size="sm" fw={600}>
                        Keep what is set now
                      </Text>
                    </Group>
                  </Radio.Card>
                )}
                {presets.map((preset) => (
                  <Radio.Card key={preset.id} value={preset.id} radius="md" p="md" withBorder>
                    <Group wrap="nowrap" gap="sm">
                      <Radio.Indicator />
                      <Text size="sm" fw={600}>
                        {preset.title}
                      </Text>
                    </Group>
                  </Radio.Card>
                ))}
              </Stack>
            </Radio.Group>
          )}

          {question === 3 && (
            <Radio.Group value={paymentChoice} onChange={(value) => setPaymentChoice(value as PaymentChoice)}>
              <Stack gap="xs">
                {PAYMENT_CHOICES.map((choice) => (
                  <Radio.Card key={choice.id} value={choice.id} radius="md" p="md" withBorder>
                    <Group wrap="nowrap" gap="sm">
                      <Radio.Indicator />
                      <Text size="sm" fw={600}>
                        {choice.label}
                      </Text>
                    </Group>
                  </Radio.Card>
                ))}
              </Stack>
            </Radio.Group>
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
              onClick={() => (question === 1 ? skip() : setQuestion((current) => (current - 1) as 1 | 2 | 3))}
              disabled={saving}
            >
              {question === 1 ? "I'll answer later" : 'Back'}
            </Button>
            {question < 3 ? (
              <Button
                size="md"
                disabled={question === 1 && kinds.length === 0}
                rightSection={<IconArrowRight size={16} />}
                onClick={() => setQuestion((current) => (current + 1) as 1 | 2 | 3)}
              >
                Continue
              </Button>
            ) : (
              <Button size="md" loading={saving} rightSection={<IconArrowRight size={16} />} onClick={finish}>
                Finish
              </Button>
            )}
          </Group>
          )}
          {!single && question > 1 && (
            <Button variant="subtle" color="gray" size="sm" onClick={skip} disabled={saving}>
              I'll answer later
            </Button>
          )}
        </Stack>
      </Container>
    </Layout>
  )
}
