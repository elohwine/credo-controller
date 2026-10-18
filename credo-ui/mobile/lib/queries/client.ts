import { QueryClient, focusManager, onlineManager } from '@tanstack/react-query'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { keyBelongsToAccount } from './keys'
import { createQueryCacheStorage } from './persister'

/** Bump when the shape of saved answers changes, so old saved copies are dropped. */
export const QUERY_CACHE_BUSTER = 'credentis-query-v1'
export const QUERY_CACHE_MAX_AGE = 24 * 60 * 60 * 1000

function httpStatus(error: unknown): number {
  return Number((error as any)?.response?.status || 0)
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: QUERY_CACHE_MAX_AGE,
      staleTime: 15_000,
      // Requests already go through the phone's network layer; a wrong answer (4xx) will not fix itself.
      retry: (failureCount, error) => {
        const status = httpStatus(error)
        if (status >= 400 && status < 500) return false
        if ((error as any)?.code === 'OFFLINE') return false
        return failureCount < 2
      },
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      networkMode: 'offlineFirst',
    },
    mutations: {
      retry: false,
      networkMode: 'offlineFirst',
    },
  },
})

export const queryPersister = createAsyncStoragePersister({
  storage: typeof window === 'undefined' ? null : createQueryCacheStorage(),
  key: 'credentis.queries',
  throttleTime: 1500,
})

/** Saved only when a query opts in, so nothing sensitive is written by accident. */
export function shouldPersistQuery(query: { meta?: Record<string, unknown>; state: { status: string } }): boolean {
  return query.state.status === 'success' && query.meta?.persist === true
}

/** Forget every saved answer for one account (on sign-out or "remove from this phone"). */
export function purgeAccountQueries(accountId: string | null | undefined): void {
  if (!accountId) return
  queryClient.removeQueries({ predicate: (query) => keyBelongsToAccount(query.queryKey, accountId) })
}

let bound = false

/** Refetch when the app returns to the front (Capacitor resume / tab visible) and when the network returns. */
export function bindQueryManagers(): () => void {
  if (typeof window === 'undefined' || bound) return () => undefined
  bound = true
  const cleanups: Array<() => void> = []

  focusManager.setEventListener((handleFocus) => {
    const onVisibility = () => handleFocus(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onVisibility)
    let removeResume: (() => void) | null = null
    void import('@capacitor/app')
      .then(({ App }) =>
        App.addListener('appStateChange', ({ isActive }) => handleFocus(isActive)).then((handle) => {
          removeResume = () => void handle.remove()
        }),
      )
      .catch(() => undefined)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      removeResume?.()
    }
  })

  onlineManager.setEventListener((setOnline) => {
    const update = () => setOnline(navigator.onLine !== false)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  })

  cleanups.push(() => {
    bound = false
  })
  return () => cleanups.forEach((fn) => fn())
}
