import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { useRouter } from 'next/router'
import { LottiePlayer } from '@/components/feedback/LottiePlayer'
import { TIP_KEYS, useAppGuides } from '@/lib/guides'
import { GettingStartedChecklist, GuideTip, type ChecklistAction } from '../../../shared/Guides'
import { INBOX_CHANGED_EVENT, loadGettingStarted, type GettingStartedStatus, type GuideKey, type TipKey } from '../../../shared/guides'

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

  if (!guides.ready) return null
  let content: JSX.Element | null = null
  if (!open) {
    content = guides.isDone('tip_inbox') ? null : <GuideTip tip="tip_inbox" onDismiss={() => void guides.mark('tip_inbox', 'done')} />
  } else if (status) {
    const steps: ChecklistAction[] = [
      { step: 'identityCard', onAction: () => void showIdentityCard() },
      { step: 'records', onAction: () => void router.push('/wallet') },
      { step: 'organisation', onAction: () => void router.push('/organization/setup') },
      { step: 'cardSaving', onAction: () => void router.push('/settings/cards') },
    ]
    const checklist = { ...status, records: guides.isDone('records_seen') }
    const finished = steps.every((step) => checklist[step.step])
    content = (
      <GettingStartedChecklist
        status={checklist}
        steps={steps}
        celebration={<LottiePlayer kind="workflow_complete" size={72} loop={false} />}
        onDismiss={() => void guides.mark('getting_started', finished ? 'done' : 'dismissed')}
      />
    )
  }
  if (!content) return null
  return wrap ? <div style={wrap}>{content}</div> : content
}
