import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { useRouter } from 'next/router'
import { notifications } from '@mantine/notifications'
import { LottiePlayer } from '@/components/feedback/LottiePlayer'
import { TIP_KEYS, useAppGuides } from '@/lib/guides'
import { GettingStartedChecklist, GuideTip, type ChecklistAction } from '../../../shared/Guides'
import { checklistFor, checklistMarkedDone, GUIDE_PATHS, INBOX_CHANGED_EVENT, loadGettingStarted, type ChecklistStep, type GettingStartedStatus, type GuideKey, type TipKey } from '../../../shared/guides'
import { getPersonalToken, readActiveOrganization, switchOrganizationContext } from '@/utils/organizationContext'

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
export function InboxGettingStarted({ wrap }: { wrap?: CSSProperties }) {
  const router = useRouter()
  const guides = useAppGuides()
  const { client } = guides
  const [status, setStatus] = useState<GettingStartedStatus | null>(null)
  const open = guides.ready && !guides.isDone('getting_started')

  const refresh = useCallback(() => {
    void loadGettingStarted(client).then((value) => value && setStatus(value))
  }, [client])

  useEffect(() => {
    if (!open) return undefined
    refresh()
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', refresh)
    window.addEventListener(INBOX_CHANGED_EVENT, refresh)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', refresh)
      window.removeEventListener(INBOX_CHANGED_EVENT, refresh)
    }
  }, [open, refresh])

  const showIdentityCard = async () => {
    try {
      const data = await client.get<any>('/api/wallet/credentials/pending-offers')
      const offers: any[] = Array.isArray(data?.offers) ? data.offers : Array.isArray(data) ? data : []
      const card = offers.find((offer) => offer?.sourceType === 'platform_identity')
      await router.push(card ? `/inbox?item=${encodeURIComponent(card.id || card.offerId)}` : '/inbox')
    } catch {
      await router.push('/inbox')
    }
  }

  const openOrgSetup = async () => {
    const org = status?.setupToFinish
    const personalToken = getPersonalToken()
    if (org && personalToken && readActiveOrganization()?.orgTenantId !== org.orgTenantId) {
      try {
        await switchOrganizationContext({
          backendUrl: process.env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000',
          orgTenantId: org.orgTenantId,
          orgName: org.orgName,
          personalToken,
        })
      } catch {
        /* Setup asks the person to pick the organisation when the switch did not happen */
      }
    }
    await router.push('/organization/setup')
  }

  if (!guides.ready) return null
  let content: JSX.Element | null = null
  if (!open) {
    content = guides.isDone('tip_inbox') ? null : <GuideTip tip="tip_inbox" onDismiss={() => void guides.mark('tip_inbox', 'done')} />
  } else if (status) {
    const plan = checklistFor(status, {
      records: guides.isDone('records_seen'),
      withDevice: false,
      nextUse: guides.isDone('next_use'),
    })
    const choose = async (step: ChecklistStep, choiceId: string) => {
      if (step === 'cardSaving') {
        await client.put(GUIDE_PATHS.holderSettings, { autoSaveCards: choiceId === 'on' })
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
      if (choiceId === 'start') void router.push('/organization/setup')
      if (choiceId === 'find') void router.push('/discover')
    }
    const actions: Record<ChecklistStep, () => void> = {
      identityCard: () => void showIdentityCard(),
      records: () => void router.push('/wallet'),
      deviceSignIn: () => undefined,
      organisation: () => void router.push('/organization/setup'),
      staffCard: () => void router.push(status.staffCardWaiting ? `/inbox?item=${encodeURIComponent(status.staffCardWaiting.offerId)}` : '/inbox'),
      orgSetup: () => void openOrgSetup(),
      cardSaving: () => void router.push('/settings/cards'),
      nextUse: () => void router.push('/discover'),
    }
    const steps: ChecklistAction[] = plan.steps.map((step) => ({
      step,
      onAction: actions[step],
      onChoice: step === 'cardSaving' || step === 'nextUse' ? (choiceId) => void choose(step, choiceId) : undefined,
    }))
    const finished = checklistMarkedDone(plan.steps, plan.status)
    content = (
      <GettingStartedChecklist
        status={plan.status}
        steps={steps}
        copy={plan.copy}
        celebration={<LottiePlayer kind="workflow_complete" size={72} loop={false} />}
        onDismiss={() => void guides.mark('getting_started', finished ? 'done' : 'dismissed')}
      />
    )
  }
  if (!content) return null
  return wrap ? <div style={wrap}>{content}</div> : content
}
