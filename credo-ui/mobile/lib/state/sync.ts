import { create } from 'zustand'

/**
 * What the app is doing in the background, for the one progress bar under the header.
 *
 * `inflight` counts server calls through lib/api.ts (every screen, migrated or not);
 * `pull` is the swipe-down refresh; `online` follows the network.
 */
export type PullState = 'idle' | 'pulling' | 'armed' | 'refreshing'

interface SyncState {
  inflight: number
  online: boolean
  pull: PullState
  pullDistance: number
  requestStarted: () => void
  requestEnded: () => void
  setOnline: (online: boolean) => void
  setPull: (pull: PullState, distance?: number) => void
}

export const useSyncStore = create<SyncState>((set) => ({
  inflight: 0,
  online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
  pull: 'idle',
  pullDistance: 0,
  requestStarted: () => set((state) => ({ inflight: state.inflight + 1 })),
  requestEnded: () => set((state) => ({ inflight: Math.max(0, state.inflight - 1) })),
  setOnline: (online) => set({ online }),
  setPull: (pull, distance = 0) => set({ pull, pullDistance: distance }),
}))

let bound = false

export function bindSyncStore(): () => void {
  if (typeof window === 'undefined' || bound) return () => undefined
  bound = true
  const update = () => useSyncStore.getState().setOnline(navigator.onLine !== false)
  update()
  window.addEventListener('online', update)
  window.addEventListener('offline', update)
  return () => {
    bound = false
    window.removeEventListener('online', update)
    window.removeEventListener('offline', update)
  }
}

/** Resolves once no server call has been running for a moment (or after `maxMs`). */
export function waitForIdle(maxMs = 15000): Promise<void> {
  return new Promise((resolve) => {
    const started = Date.now()
    let quietSince = 0
    const tick = () => {
      const { inflight } = useSyncStore.getState()
      const now = Date.now()
      if (inflight === 0) {
        if (!quietSince) quietSince = now
        if (now - quietSince >= 250) return resolve()
      } else {
        quietSince = 0
      }
      if (now - started >= maxMs) return resolve()
      window.setTimeout(tick, 100)
    }
    window.setTimeout(tick, 150)
  })
}
