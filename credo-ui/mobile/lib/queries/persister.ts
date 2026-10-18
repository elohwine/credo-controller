import { getOfflineStorageAdapter, initializeOfflineStorage } from '@/lib/offline/storage'

/**
 * Saves the cached server answers on the phone (the same store the offline wallet uses,
 * encrypted on Android), so opening the app shows the last data even with no network.
 */
export interface QueryCacheStorage {
  getItem: (key: string) => Promise<string | null>
  setItem: (key: string, value: string) => Promise<void>
  removeItem: (key: string) => Promise<void>
}

export function createQueryCacheStorage(): QueryCacheStorage {
  return {
    getItem: async (key) => {
      await initializeOfflineStorage()
      return getOfflineStorageAdapter().get<string>('query_cache', key)
    },
    setItem: async (key, value) => {
      await initializeOfflineStorage()
      getOfflineStorageAdapter().set('query_cache', key, value)
    },
    removeItem: async (key) => {
      await initializeOfflineStorage()
      getOfflineStorageAdapter().remove('query_cache', key)
    },
  }
}
