import { ThemeIcon } from '@mantine/core'
import { IconChecks, IconCircleCheck, IconConfetti, IconCreditCard, IconInbox, IconUserCheck } from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import {
  MILESTONE_ANIMATION,
  MILESTONE_LOOPS,
  loadMilestoneAnimation,
  prefersReducedMotion,
  type MilestoneKind,
} from '../../../shared/lottie'

const STILL_ICON = {
  success: IconCircleCheck,
  payment: IconCreditCard,
  celebration: IconConfetti,
  welcome: IconUserCheck,
  completion: IconChecks,
  empty: IconInbox,
  onboarding_receive: IconCreditCard,
  onboarding_share: IconUserCheck,
}

/**
 * Plays one milestone animation. The player and the JSON load on first use, so screens
 * without a milestone never pay for them. Reduced motion or a load failure shows a still icon.
 */
export function LottiePlayer({ kind, size = 140, loop }: { kind: MilestoneKind; size?: number; loop?: boolean }) {
  const container = useRef<HTMLDivElement>(null)
  const [still, setStill] = useState(false)
  const shouldLoop = loop ?? !!MILESTONE_LOOPS[kind]

  useEffect(() => {
    setStill(false)
    if (prefersReducedMotion()) {
      setStill(true)
      return
    }
    let cancelled = false
    let animation: { destroy: () => void } | undefined
    Promise.all([import('lottie-web/build/player/lottie_light'), loadMilestoneAnimation(kind)])
      .then(([player, animationData]) => {
        if (cancelled || !container.current) return
        animation = player.default.loadAnimation({
          container: container.current,
          renderer: 'svg',
          loop: shouldLoop,
          autoplay: true,
          animationData,
          rendererSettings: { preserveAspectRatio: 'xMidYMid meet', progressiveLoad: false },
        })
      })
      .catch((error) => {
        console.warn('Milestone animation could not load; showing its still illustration.', error)
        if (!cancelled) setStill(true)
      })
    return () => {
      cancelled = true
      animation?.destroy()
    }
  }, [kind, shouldLoop])

  const Icon = STILL_ICON[MILESTONE_ANIMATION[kind]]
  const tone = kind === 'account_created' || kind === 'empty_inbox' || kind.startsWith('onboarding_') ? 'blue' : 'teal'
  return (
    <div aria-hidden style={{ width: size, maxWidth: '100%', aspectRatio: '1', flexShrink: 0, position: 'relative', display: 'grid', placeItems: 'center' }}>
      <div ref={container} style={{ width: '100%', height: '100%', display: still ? 'none' : 'block' }} />
      {still && <ThemeIcon size={Math.round(size * 0.64)} radius="xl" variant="light" color={tone} style={{ position: 'absolute' }}>
        <Icon size={Math.round(size * 0.36)} stroke={1.6} />
      </ThemeIcon>}
    </div>
  )
}
