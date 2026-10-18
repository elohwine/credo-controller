import { useEffect, useState } from 'react'
import { useIsFetching, useIsMutating } from '@tanstack/react-query'
import { useSyncStore } from '@/lib/state/sync'

/** Wait this long before showing the bar, so quick answers never flash it. */
const SHOW_DELAY_MS = 400
/** Keep it up at least this long once shown, so it never flickers. */
const MIN_VISIBLE_MS = 500

/** True while anything is being fetched from or sent to the server (debounced). */
export function useBackgroundBusy(): boolean {
  const inflight = useSyncStore((state) => state.inflight)
  const pull = useSyncStore((state) => state.pull)
  const fetching = useIsFetching()
  const mutating = useIsMutating()
  const busy = inflight > 0 || fetching > 0 || mutating > 0
  const [visible, setVisible] = useState(false)
  const [shownAt, setShownAt] = useState(0)

  useEffect(() => {
    if (busy && pull !== 'refreshing') {
      if (visible) return
      const timer = window.setTimeout(() => {
        setVisible(true)
        setShownAt(Date.now())
      }, SHOW_DELAY_MS)
      return () => window.clearTimeout(timer)
    }
    if (!visible) return
    const wait = Math.max(0, MIN_VISIBLE_MS - (Date.now() - shownAt))
    const timer = window.setTimeout(() => setVisible(false), wait)
    return () => window.clearTimeout(timer)
  }, [busy, pull, visible, shownAt])

  return visible
}

/**
 * The thin bar under the header. Content stays on screen and usable while it runs
 * (Material 3: linear progress for background work on content already shown).
 */
export function HeaderProgressBar({ active }: { active: boolean }) {
  return (
    <div
      className="credentis-progress-track"
      data-active={active ? 'true' : 'false'}
      role={active ? 'progressbar' : undefined}
      aria-label={active ? 'Updating' : undefined}
      aria-busy={active}
    >
      {active ? <div className="credentis-progress-bar" /> : null}
    </div>
  )
}
