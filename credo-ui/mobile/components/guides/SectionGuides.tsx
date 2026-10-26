import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { useRouter } from 'next/router'
import { LottiePlayer } from '@/components/feedback/LottiePlayer'
import { supportsDeviceLogin } from '@/lib/deviceTrust'
import { guideClient, TIP_KEYS, useAppGuides } from '@/lib/guides'
import { GettingStartedChecklist, GuideTip, type ChecklistAction } from '../../../shared/Guides'
import { loadGettingStarted, type GettingStartedStatus, type GuideKey, type TipKey } from '../../../shared/guides'

/** A one-time tip for a section. Renders nothing until progress is known, so it never flashes. */
export function SectionTip({ tip, when = true, wrap }: { tip: TipKey; when?: boolean; wrap?: CSSProperties }) {
  const guides = useAppGuides()
  if (!when || guides.isDone(tip)) return null
  const content = <GuideTip tip={tip} onDismiss={() => void guides.mark(tip, 'done')} />
  return wrap ? <div style={wrap}>{content}</div> : content
}

/** Clears the getting-started checklist and every section tip so they show again. */
export async function showGuidesAgain(mark: (key: GuideKey, status: 'reset') => Promise<void>) {
  await Promise.all((['getting_started', ...TIP_KEYS] as GuideKey[]).map((key) => mark(key, 'reset')))
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

  const refresh = useCallback(() => {
    void loadGettingStarted(guideClient).then((value) => value && setStatus(value))
  }, [])

  useEffect(() => {
    setDeviceLogin(supportsDeviceLogin())
  }, [])

  useEffect(() => {
    if (open) refresh()
  }, [open, refresh, refreshKey])

  useEffect(() => {
    if (!open) return undefined
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [open, refresh])

  if (!guides.ready) return null
  if (!open) return guides.isDone('tip_inbox') ? null : <GuideTip tip="tip_inbox" onDismiss={() => void guides.mark('tip_inbox', 'done')} />
  if (!status) return null

  const steps: ChecklistAction[] = [
    { step: 'identityCard', onAction: onShowIdentityCard },
    { step: 'records', onAction: () => void router.push('/proofs/') },
    ...(deviceLogin ? [{ step: 'deviceSignIn' as const, onAction: () => void router.push('/settings/security/') }] : []),
    { step: 'organisation', onAction: () => void router.push('/organizations/') },
    { step: 'cardSaving', onAction: () => void router.push('/settings/cards/') },
  ]
  const checklist = { ...status, records: guides.isDone('records_seen') }
  const finished = steps.every((step) => checklist[step.step])

  return (
    <GettingStartedChecklist
      status={checklist}
      steps={steps}
      celebration={<LottiePlayer kind="workflow_complete" size={72} loop={false} />}
      onDismiss={() => void guides.mark('getting_started', finished ? 'done' : 'dismissed')}
    />
  )
}
