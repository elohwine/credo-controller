import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { useRouter } from 'next/router'
import { notifications } from '@mantine/notifications'
import { LottiePlayer } from '@/components/feedback/LottiePlayer'
import { supportsDeviceLogin } from '@/lib/deviceTrust'
import { guideClient, TIP_KEYS, useAppGuides } from '@/lib/guides'
import { GettingStartedChecklist, GuideTip, type ChecklistAction } from '../../../shared/Guides'
import { checklistFor, checklistMarkedDone, GUIDE_PATHS, loadGettingStarted, phoneDeviceStepStillOpen, type ChecklistStep, type GettingStartedStatus, type GuideKey, type TipKey } from '../../../shared/guides'
import { captureOrganizationSwitchContext } from '../../../shared/taskContext'
import { applyOrgContext, clearTaskContext, getActiveOrgId, getPersonalWalletToken } from '@/lib/auth'
import api from '@/lib/api'

/** A one-time tip for a section. Renders nothing until progress is known, so it never flashes. */
export function SectionTip({ tip, when = true, wrap, role }: { tip: TipKey; when?: boolean; wrap?: CSSProperties; role?: string | null }) {
  const guides = useAppGuides()
  if (!when || guides.isDone(tip)) return null
  const content = <GuideTip tip={tip} role={role} onDismiss={() => void guides.mark(tip, 'done')} />
  return wrap ? <div style={wrap}>{content}</div> : content
}

/** Clears the getting-started checklist and every section tip so they show again. */
export async function showGuidesAgain(mark: (key: GuideKey, status: 'reset') => Promise<void>) {
  await Promise.all((['getting_started', 'device_signin', 'next_use', ...TIP_KEYS] as GuideKey[]).map((key) => mark(key, 'reset')))
}

/** Getting-started checklist for the personal inbox; the inbox tip takes its place once it is closed. */
export function InboxGettingStarted({
  refreshKey,
  onShowIdentityCard,
}: {
  refreshKey: unknown
  onShowIdentityCard: () => void
}) {
  const router = useRouter()
  const guides = useAppGuides()
  const [status, setStatus] = useState<GettingStartedStatus | null>(null)
  const [deviceLogin, setDeviceLogin] = useState(false)
  const open = guides.ready && !guides.isDone('getting_started')
  const devicePromptDone = guides.isDone('device_signin')

  const refresh = useCallback(() => {
    void loadGettingStarted(guideClient).then((value) => value && setStatus(value))
  }, [])

  useEffect(() => {
    setDeviceLogin(supportsDeviceLogin())
  }, [])

  useEffect(() => {
    if (open || (guides.ready && deviceLogin && !devicePromptDone)) refresh()
  }, [open, refresh, refreshKey, guides.ready, deviceLogin, devicePromptDone])

  useEffect(() => {
    if (!open && !(deviceLogin && !devicePromptDone)) return undefined
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [open, refresh, deviceLogin, devicePromptDone])

  const openOrgSetup = async (org: GettingStartedStatus['setupToFinish']) => {
    const personalToken = getPersonalWalletToken()
    if (org && personalToken && getActiveOrgId() !== org.orgTenantId) {
      try {
        const assertContextUnchanged = captureOrganizationSwitchContext(localStorage)
        const response = await api.post(`/api/organizations/${encodeURIComponent(org.orgTenantId)}/switch`, {}, {
          headers: { Authorization: 'Bearer ' + personalToken },
        })
        assertContextUnchanged()
        if (typeof response.data?.token === 'string' && response.data.token) {
          clearTaskContext()
          applyOrgContext({
            orgId: org.orgTenantId, orgName: org.orgName, orgToken: response.data.token,
            orgRole: response.data.orgRole, sector: response.data.sector, workflowTypes: response.data.workflowTypes,
          })
        }
      } catch {
        /* Setup asks the person to pick the organisation when the switch did not happen */
      }
    }
    await router.push('/settings/org/')
  }

  if (!guides.ready) return null
  if (!open) {
    if (phoneDeviceStepStillOpen({
      deviceLogin,
      deviceSignIn: Boolean(status?.deviceSignIn),
      devicePromptDone,
    }) && status) {
      return (
        <GettingStartedChecklist
          status={{ ...status, records: true, identityCard: true, organisation: true, cardSaving: true, orgSetup: true, staffCard: true, nextUse: true }}
          steps={[{ step: 'deviceSignIn', onAction: () => void router.push('/settings/security/') }]}
          onDismiss={() => void guides.mark('device_signin', 'dismissed')}
        />
      )
    }
    return guides.isDone('tip_inbox') ? null : <GuideTip tip="tip_inbox" onDismiss={() => void guides.mark('tip_inbox', 'done')} />
  }
  if (!status) return null

  const plan = checklistFor(status, {
    records: guides.isDone('records_seen'),
    withDevice: deviceLogin,
    nextUse: guides.isDone('next_use'),
  })
  const choose = async (step: ChecklistStep, choiceId: string) => {
    if (step === 'cardSaving') {
      await guideClient.put(GUIDE_PATHS.holderSettings, { autoSaveCards: choiceId === 'on' })
      notifications.show({
        position: 'bottom-center',
        message: choiceId === 'on' ? 'Receipts, staff cards and records will be saved for you' : 'You will accept each card yourself',
        autoClose: 4000,
      })
      refresh()
      return
    }
    if (choiceId === 'keep') {
      await guides.mark('next_use', 'done')
      return
    }
    if (choiceId === 'start') void router.push('/settings/org/')
    if (choiceId === 'find') void router.push('/organizations/?tab=discover')
  }
  const actions: Record<ChecklistStep, () => void> = {
    identityCard: onShowIdentityCard,
    records: () => void router.push('/proofs/'),
    deviceSignIn: () => void router.push('/settings/security/'),
    organisation: () => void router.push('/settings/org/'),
    staffCard: () => void router.push(status.staffCardWaiting ? `/inbox?item=${encodeURIComponent(status.staffCardWaiting.offerId)}` : '/inbox'),
    orgSetup: () => void openOrgSetup(status.setupToFinish),
    cardSaving: () => void router.push('/settings/cards/'),
    nextUse: () => void router.push('/organizations/?tab=discover'),
  }
  const steps: ChecklistAction[] = plan.steps.map((step) => ({
    step,
    onAction: actions[step],
    onChoice: step === 'cardSaving' || step === 'nextUse' ? (choiceId) => void choose(step, choiceId) : undefined,
  }))
  const finished = checklistMarkedDone(plan.steps, plan.status)

  return (
    <GettingStartedChecklist
      status={plan.status}
      steps={steps}
      copy={plan.copy}
      celebration={<LottiePlayer kind="workflow_complete" size={72} loop={false} />}
      onDismiss={() => void guides.mark('getting_started', finished ? 'done' : 'dismissed')}
    />
  )
}
