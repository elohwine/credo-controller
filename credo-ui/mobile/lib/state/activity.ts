import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

/**
 * Counts shown outside the screen that produced them (the Activity badge on every tab).
 * Saved per account + context, so the badge is right straight away after a restart or a switch.
 */
interface ActivityState {
  inboxNewByScope: Record<string, number>
  setInboxNew: (scope: string, count: number) => void
  forgetScopePrefix: (prefix: string) => void
}

export const useActivityStore = create<ActivityState>()(
  persist(
    (set) => ({
      inboxNewByScope: {},
      setInboxNew: (scope, count) =>
        set((state) => {
          const value = Math.max(0, Math.floor(Number(count) || 0))
          if (state.inboxNewByScope[scope] === value) return state
          return { inboxNewByScope: { ...state.inboxNewByScope, [scope]: value } }
        }),
      forgetScopePrefix: (prefix) =>
        set((state) => ({
          inboxNewByScope: Object.fromEntries(
            Object.entries(state.inboxNewByScope).filter(([scope]) => !scope.startsWith(prefix)),
          ),
        })),
    }),
    {
      name: 'credentis.activity.v1',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ inboxNewByScope: state.inboxNewByScope }),
    },
  ),
)
