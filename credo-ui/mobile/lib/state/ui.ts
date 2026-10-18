import { create } from 'zustand'

/**
 * The one blocking screen: shown only when the person must wait for something to open
 * (a job, an organisation). Everything else loads in the background behind content.
 */
export interface BlockingState {
  key: string
  title: string
  detail?: string
  startedAt: number
}

interface UiState {
  blocking: BlockingState | null
  block: (input: { key: string; title: string; detail?: string }) => void
  /** Clears the screen when `key` is given only if it is still the one showing. */
  unblock: (key?: string) => void
}

export const useUiStore = create<UiState>((set, get) => ({
  blocking: null,
  block: ({ key, title, detail }) => set({ blocking: { key, title, detail, startedAt: Date.now() } }),
  unblock: (key) => {
    const current = get().blocking
    if (!current) return
    if (key && current.key !== key) return
    set({ blocking: null })
  },
}))
