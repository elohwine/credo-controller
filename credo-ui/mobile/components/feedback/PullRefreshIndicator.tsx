import { useSyncStore } from '@/lib/state/sync'

/** How far (after resistance) the finger must pull before letting go refreshes. */
export const PULL_TRIGGER_PX = 72

/**
 * The round indicator that follows a swipe down from the top of a page (Material 3 pull to
 * refresh). The arc fills as the pull approaches the trigger, then spins while refreshing.
 */
export function PullRefreshIndicator() {
  const pull = useSyncStore((state) => state.pull)
  const distance = useSyncStore((state) => state.pullDistance)
  if (pull === 'idle') return null

  const refreshing = pull === 'refreshing'
  const progress = refreshing ? 0.75 : Math.min(1, distance / PULL_TRIGGER_PX)
  const offset = refreshing ? PULL_TRIGGER_PX : distance
  const radius = 9
  const circumference = 2 * Math.PI * radius
  const ready = pull === 'armed' || refreshing

  return (
    <div
      role="status"
      aria-label={refreshing ? 'Updating' : ready ? 'Release to update' : 'Pull to update'}
      style={{
        position: 'fixed',
        top: 'calc(var(--app-safe-top) + 12px)',
        left: '50%',
        zIndex: 1300,
        width: 40,
        height: 40,
        marginLeft: -20,
        borderRadius: 20,
        background: 'var(--mantine-color-body)',
        boxShadow: '0 2px 8px rgba(15, 23, 42, 0.22)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transform: `translateY(${offset}px)`,
        opacity: refreshing ? 1 : Math.max(0.35, progress),
        transition: refreshing ? 'transform 160ms ease-out' : 'none',
        pointerEvents: 'none',
      }}
    >
      <svg
        width={24}
        height={24}
        viewBox="0 0 24 24"
        style={{
          transform: refreshing ? undefined : `rotate(${progress * 270}deg)`,
          animation: refreshing ? 'credentis-spin 0.9s linear infinite' : undefined,
        }}
      >
        <circle
          cx={12}
          cy={12}
          r={radius}
          fill="none"
          stroke={ready ? '#2563eb' : '#94a3b8'}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeDasharray={`${circumference * progress * 0.8} ${circumference}`}
        />
      </svg>
    </div>
  )
}
