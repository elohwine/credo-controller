export type OfflineSyncReason = 'manual' | 'online' | 'visibility' | 'focus'

export interface OfflineSyncState {
  isRunning: boolean
  isSyncing: boolean
  lastSyncAt?: string
  lastReason?: OfflineSyncReason
  lastError?: string
}

export interface OfflineSyncEngineOptions {
  onSync?: (reason: OfflineSyncReason) => Promise<void> | void
  cooldownMs?: number
}

type Listener = (state: OfflineSyncState) => void

export class MobileOfflineSyncEngine {
  private state: OfflineSyncState = {
    isRunning: false,
    isSyncing: false,
  }

  private listeners = new Set<Listener>()
  private options: OfflineSyncEngineOptions = {}
  private lastTriggerMs = 0

  private onlineHandler = () => {
    this.triggerSync('online')
  }

  private visibilityHandler = () => {
    if (typeof document === 'undefined') return
    if (document.visibilityState === 'visible') {
      this.triggerSync('visibility')
    }
  }

  private focusHandler = () => {
    this.triggerSync('focus')
  }

  start(options?: OfflineSyncEngineOptions): void {
    this.options = {
      cooldownMs: options?.cooldownMs ?? 15000,
      onSync: options?.onSync,
    }

    if (this.state.isRunning) return

    this.state = {
      ...this.state,
      isRunning: true,
      lastError: undefined,
    }
    this.notify()

    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.onlineHandler)
      window.addEventListener('focus', this.focusHandler)
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.visibilityHandler)
    }
  }

  stop(): void {
    if (!this.state.isRunning) return

    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.onlineHandler)
      window.removeEventListener('focus', this.focusHandler)
    }

    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityHandler)
    }

    this.state = {
      ...this.state,
      isRunning: false,
      isSyncing: false,
    }
    this.notify()
  }

  async triggerSync(reason: OfflineSyncReason = 'manual'): Promise<void> {
    if (!this.state.isRunning) return

    const now = Date.now()
    const cooldownMs = this.options.cooldownMs ?? 15000
    if (reason !== 'manual' && now - this.lastTriggerMs < cooldownMs) {
      return
    }

    this.lastTriggerMs = now

    if (this.state.isSyncing) return

    this.state = {
      ...this.state,
      isSyncing: true,
      lastReason: reason,
      lastError: undefined,
    }
    this.notify()

    try {
      await this.options.onSync?.(reason)
      this.state = {
        ...this.state,
        isSyncing: false,
        lastSyncAt: new Date().toISOString(),
      }
      this.notify()
    } catch (error) {
      this.state = {
        ...this.state,
        isSyncing: false,
        lastError: error instanceof Error ? error.message : String(error),
      }
      this.notify()
    }
  }

  getState(): OfflineSyncState {
    return { ...this.state }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.getState())
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notify(): void {
    const snapshot = this.getState()
    for (const listener of Array.from(this.listeners)) {
      listener(snapshot)
    }
  }
}

let defaultEngine: MobileOfflineSyncEngine | null = null

export function getOfflineSyncEngine(): MobileOfflineSyncEngine {
  if (!defaultEngine) {
    defaultEngine = new MobileOfflineSyncEngine()
  }
  return defaultEngine
}
