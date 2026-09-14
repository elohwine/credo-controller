import CryptoJS from 'crypto-js'

export type OfflineStorageDomain =
  | 'offline_queue'
  | 'credential_cache'
  | 'org_capability_bundle'
  | 'verifier_bundle'
  | 'consume_pending'
  | 'sync_state'

export interface OfflineStorageAdapter {
  get<T>(domain: OfflineStorageDomain, key: string): T | null
  set<T>(domain: OfflineStorageDomain, key: string, value: T): void
  remove(domain: OfflineStorageDomain, key: string): void
  list<T>(domain: OfflineStorageDomain): Array<{ key: string; value: T }>
}

type SecureOfflineStoragePlugin = {
  isAvailable?: () => Promise<{ available?: boolean }>
  getOrCreateMasterSecret?: () => Promise<{ secret?: string }>
  putRecord?: (input: { key: string; value: string }) => Promise<{ ok?: boolean } | void>
  getRecord?: (input: { key: string }) => Promise<{ value?: string | null }>
  removeRecord?: (input: { key: string }) => Promise<{ ok?: boolean } | void>
  listRecords?: (input?: { prefix?: string }) => Promise<{ records?: Array<{ key?: string; value?: string }> }>
}

const OFFLINE_STORAGE_PREFIX = 'credoOffline.v1'
const OFFLINE_STORAGE_MASTER_KEY = `${OFFLINE_STORAGE_PREFIX}:masterKey`
const OFFLINE_STORAGE_INSTALLATION_ID = `${OFFLINE_STORAGE_PREFIX}:installationId`
const OFFLINE_STORAGE_DOMAINS: OfflineStorageDomain[] = [
  'offline_queue',
  'credential_cache',
  'org_capability_bundle',
  'verifier_bundle',
  'consume_pending',
  'sync_state',
]

let runtimeNativeMasterSecret: string | null = null
let initializationPromise: Promise<void> | null = null

export type OfflineStorageMode = 'local' | 'encrypted'

function domainPrefix(domain: OfflineStorageDomain): string {
  return `${OFFLINE_STORAGE_PREFIX}:${domain}:`
}

function buildStorageKey(domain: OfflineStorageDomain, key: string): string {
  return `${domainPrefix(domain)}${key}`
}

function resolveStorage(storage?: Storage): Storage | undefined {
  return storage || (typeof window !== 'undefined' ? window.localStorage : undefined)
}

function isCapacitorNativeRuntime(): boolean {
  if (typeof window === 'undefined') return false
  return Boolean((window as any).Capacitor)
}

function isAndroidNativeRuntime(): boolean {
  if (typeof window === 'undefined') return false
  const platform = (window as any)?.Capacitor?.getPlatform?.()
  return platform === 'android'
}

function getSecureOfflineStoragePlugin(): SecureOfflineStoragePlugin | null {
  if (typeof window === 'undefined') return null
  const plugins = (window as any)?.Capacitor?.Plugins || {}
  return plugins.SecureOfflineStorage || null
}

function hasNativeRecordApis(
  plugin: SecureOfflineStoragePlugin | null,
): plugin is Required<Pick<SecureOfflineStoragePlugin, 'putRecord' | 'removeRecord' | 'listRecords'>> &
  SecureOfflineStoragePlugin {
  return Boolean(plugin?.putRecord && plugin?.removeRecord && plugin?.listRecords)
}

function getDeviceFingerprint(): string {
  if (typeof window === 'undefined') return 'server'

  const parts = [
    window.navigator.userAgent,
    window.navigator.language,
    window.navigator.platform,
    String(window.screen?.width || ''),
    String(window.screen?.height || ''),
    String(window.devicePixelRatio || ''),
  ]

  return parts.join('|')
}

function getOrCreateInstallationId(storage?: Storage): string | null {
  const resolvedStorage = resolveStorage(storage)
  if (!resolvedStorage) return null

  try {
    const existing = resolvedStorage.getItem(OFFLINE_STORAGE_INSTALLATION_ID)
    if (existing) return existing

    const nextId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `offline-install-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`

    resolvedStorage.setItem(OFFLINE_STORAGE_INSTALLATION_ID, nextId)
    return nextId
  } catch {
    return null
  }
}

function getConfiguredOfflineStorageMode(): OfflineStorageMode {
  const configured = process.env.NEXT_PUBLIC_OFFLINE_STORAGE_MODE?.trim().toLowerCase()
  if (configured === 'local') return 'local'
  if (configured === 'encrypted') return 'encrypted'

  return isCapacitorNativeRuntime() ? 'encrypted' : 'local'
}

function getOrCreateMasterKey(storage?: Storage): string | null {
  if (runtimeNativeMasterSecret) {
    return runtimeNativeMasterSecret
  }

  const resolvedStorage = resolveStorage(storage)
  if (!resolvedStorage) return null

  const configuredSecret = process.env.NEXT_PUBLIC_OFFLINE_STORAGE_SECRET?.trim()
  if (configuredSecret) return configuredSecret

  try {
    const existing = resolvedStorage.getItem(OFFLINE_STORAGE_MASTER_KEY)
    if (existing) return existing

    const installationId = getOrCreateInstallationId(resolvedStorage)
    const seed = installationId || `offline-key-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
    resolvedStorage.setItem(OFFLINE_STORAGE_MASTER_KEY, seed)
    return seed
  } catch {
    return null
  }
}

function deriveEncryptionKey(masterKey: string | null): string | null {
  if (!masterKey) return null

  try {
    const fingerprint = getDeviceFingerprint()
    return CryptoJS.SHA256(`${masterKey}|${fingerprint}`).toString(CryptoJS.enc.Hex)
  } catch {
    return masterKey
  }
}

function isOfflineStorageRecordKey(fullKey: string): boolean {
  if (!fullKey.startsWith(`${OFFLINE_STORAGE_PREFIX}:`)) return false
  return fullKey !== OFFLINE_STORAGE_MASTER_KEY && fullKey !== OFFLINE_STORAGE_INSTALLATION_ID
}

function decryptWithKey(raw: string, key: string): string | null {
  try {
    const bytes = CryptoJS.AES.decrypt(raw, key)
    const decoded = bytes.toString(CryptoJS.enc.Utf8)
    return decoded || null
  } catch {
    return null
  }
}

function encryptWithKey(raw: string, key: string): string | null {
  try {
    return CryptoJS.AES.encrypt(raw, key).toString()
  } catch {
    return null
  }
}

function migrateOfflineStorageToNativeSecret(storage?: Storage): void {
  const resolvedStorage = resolveStorage(storage)
  if (!resolvedStorage || !runtimeNativeMasterSecret) return

  const legacyMasterKey = resolvedStorage.getItem(OFFLINE_STORAGE_MASTER_KEY)
  if (!legacyMasterKey || legacyMasterKey === runtimeNativeMasterSecret) {
    try {
      resolvedStorage.removeItem(OFFLINE_STORAGE_MASTER_KEY)
    } catch {
      // ignore
    }
    return
  }

  const oldDerivedKey = deriveEncryptionKey(legacyMasterKey)
  const newDerivedKey = deriveEncryptionKey(runtimeNativeMasterSecret)
  if (!oldDerivedKey || !newDerivedKey || oldDerivedKey === newDerivedKey) {
    return
  }

  try {
    const updates: Array<{ key: string; value: string }> = []
    for (let index = 0; index < resolvedStorage.length; index += 1) {
      const fullKey = resolvedStorage.key(index)
      if (!fullKey || !isOfflineStorageRecordKey(fullKey)) continue
      const raw = resolvedStorage.getItem(fullKey)
      if (!raw) continue

      const decrypted = decryptWithKey(raw, oldDerivedKey)
      if (!decrypted) continue
      const reencrypted = encryptWithKey(decrypted, newDerivedKey)
      if (!reencrypted) continue
      updates.push({ key: fullKey, value: reencrypted })
    }

    for (const update of updates) {
      resolvedStorage.setItem(update.key, update.value)
    }

    resolvedStorage.removeItem(OFFLINE_STORAGE_MASTER_KEY)
  } catch {
    // Keep legacy state if migration fails.
  }
}

function clearLegacyOfflineRecords(storage?: Storage): void {
  const resolvedStorage = resolveStorage(storage)
  if (!resolvedStorage) return

  try {
    const keysToRemove: string[] = []
    for (let index = 0; index < resolvedStorage.length; index += 1) {
      const fullKey = resolvedStorage.key(index)
      if (!fullKey) continue
      if (isOfflineStorageRecordKey(fullKey) || fullKey === OFFLINE_STORAGE_MASTER_KEY) {
        keysToRemove.push(fullKey)
      }
    }

    for (const key of keysToRemove) {
      resolvedStorage.removeItem(key)
    }
  } catch {
    // Best effort cleanup only.
  }
}

function collectLegacyOfflineRecords(storage?: Storage): Array<{ key: string; value: string }> {
  const records = new Map<string, string>()
  const localAdapter = createLocalStorageOfflineAdapter(storage)
  const encryptedAdapter = createEncryptedOfflineAdapter(storage)

  for (const domain of OFFLINE_STORAGE_DOMAINS) {
    for (const item of localAdapter.list<unknown>(domain)) {
      records.set(buildStorageKey(domain, item.key), JSON.stringify(item.value))
    }
  }

  for (const domain of OFFLINE_STORAGE_DOMAINS) {
    for (const item of encryptedAdapter.list<unknown>(domain)) {
      const fullKey = buildStorageKey(domain, item.key)
      if (!records.has(fullKey)) {
        records.set(fullKey, JSON.stringify(item.value))
      }
    }
  }

  return Array.from(records.entries()).map(([key, value]) => ({ key, value }))
}

class NativeSecureOfflineAdapter implements OfflineStorageAdapter {
  private readonly cache = new Map<string, string>()

  public constructor(
    private readonly plugin: SecureOfflineStoragePlugin,
    seed: Array<{ key: string; value: string }> = [],
  ) {
    for (const row of seed) {
      if (!row.key) continue
      this.cache.set(row.key, row.value)
    }
  }

  public get<T>(domain: OfflineStorageDomain, key: string): T | null {
    if (!key) return null
    const raw = this.cache.get(buildStorageKey(domain, key))
    if (!raw) return null

    try {
      return JSON.parse(raw) as T
    } catch {
      return null
    }
  }

  public set<T>(domain: OfflineStorageDomain, key: string, value: T): void {
    if (!key) return
    const fullKey = buildStorageKey(domain, key)
    let raw = ''

    try {
      raw = JSON.stringify(value)
    } catch {
      return
    }

    this.cache.set(fullKey, raw)
    void this.plugin.putRecord?.({ key: fullKey, value: raw }).catch(() => undefined)
  }

  public remove(domain: OfflineStorageDomain, key: string): void {
    if (!key) return
    const fullKey = buildStorageKey(domain, key)
    this.cache.delete(fullKey)
    void this.plugin.removeRecord?.({ key: fullKey }).catch(() => undefined)
  }

  public list<T>(domain: OfflineStorageDomain): Array<{ key: string; value: T }> {
    const prefix = domainPrefix(domain)
    const rows: Array<{ key: string; value: T }> = []

    for (const [fullKey, raw] of Array.from(this.cache.entries())) {
      if (!fullKey.startsWith(prefix)) continue
      const domainKey = fullKey.slice(prefix.length)
      try {
        rows.push({ key: domainKey, value: JSON.parse(raw) as T })
      } catch {
        // Ignore malformed values.
      }
    }

    return rows
  }
}

export async function initializeOfflineStorage(storage?: Storage): Promise<void> {
  if (initializationPromise) {
    return initializationPromise
  }

  initializationPromise = (async () => {
    if (!isAndroidNativeRuntime()) return

    const plugin = getSecureOfflineStoragePlugin()
    if (!plugin?.getOrCreateMasterSecret) return

    try {
      const availability = await plugin.isAvailable?.()
      if (availability && availability.available === false) {
        return
      }

      const result = await plugin.getOrCreateMasterSecret()
      const secret = result?.secret?.trim()
      if (!secret) return

      runtimeNativeMasterSecret = secret
      migrateOfflineStorageToNativeSecret(storage)

      if (hasNativeRecordApis(plugin)) {
        const nativeRows = await plugin.listRecords({ prefix: `${OFFLINE_STORAGE_PREFIX}:` })
        const existingRows = (nativeRows?.records || [])
          .map((row) => ({ key: row.key || '', value: row.value || '' }))
          .filter((row) => row.key.length > 0)

        const seedRows = existingRows.length > 0 ? existingRows : collectLegacyOfflineRecords(storage)
        const adapter = new NativeSecureOfflineAdapter(plugin, seedRows)
        defaultAdapter = adapter

        if (existingRows.length === 0 && seedRows.length > 0) {
          await Promise.all(seedRows.map((row) => plugin.putRecord?.({ key: row.key, value: row.value })))
        }

        clearLegacyOfflineRecords(storage)
      } else {
        defaultAdapter = null
      }
    } catch {
      // Fallback to legacy storage path on plugin failures.
    }
  })()

  return initializationPromise
}

export function createLocalStorageOfflineAdapter(storage?: Storage): OfflineStorageAdapter {
  const resolvedStorage = resolveStorage(storage)

  const safeGet = <T>(domain: OfflineStorageDomain, key: string): T | null => {
    if (!resolvedStorage || !key) return null
    try {
      const raw = resolvedStorage.getItem(buildStorageKey(domain, key))
      if (!raw) return null
      return JSON.parse(raw) as T
    } catch {
      return null
    }
  }

  const safeSet = <T>(domain: OfflineStorageDomain, key: string, value: T): void => {
    if (!resolvedStorage || !key) return
    try {
      resolvedStorage.setItem(buildStorageKey(domain, key), JSON.stringify(value))
    } catch {
      // Best-effort cache only.
    }
  }

  const safeRemove = (domain: OfflineStorageDomain, key: string): void => {
    if (!resolvedStorage || !key) return
    try {
      resolvedStorage.removeItem(buildStorageKey(domain, key))
    } catch {
      // Best-effort cache only.
    }
  }

  const safeList = <T>(domain: OfflineStorageDomain): Array<{ key: string; value: T }> => {
    if (!resolvedStorage) return []

    const prefix = domainPrefix(domain)
    const items: Array<{ key: string; value: T }> = []

    try {
      for (let index = 0; index < resolvedStorage.length; index += 1) {
        const fullKey = resolvedStorage.key(index)
        if (!fullKey || !fullKey.startsWith(prefix)) continue

        const domainKey = fullKey.slice(prefix.length)
        const raw = resolvedStorage.getItem(fullKey)
        if (!raw) continue

        try {
          items.push({ key: domainKey, value: JSON.parse(raw) as T })
        } catch {
          // Ignore malformed rows and continue.
        }
      }
    } catch {
      return []
    }

    return items
  }

  return {
    get: safeGet,
    set: safeSet,
    remove: safeRemove,
    list: safeList,
  }
}

export function createEncryptedOfflineAdapter(storage?: Storage): OfflineStorageAdapter {
  const resolvedStorage = resolveStorage(storage)
  const masterKey = deriveEncryptionKey(getOrCreateMasterKey(resolvedStorage))

  const decrypt = (raw: string): string | null => {
    if (!masterKey) return null
    try {
      const bytes = CryptoJS.AES.decrypt(raw, masterKey)
      const decoded = bytes.toString(CryptoJS.enc.Utf8)
      return decoded || null
    } catch {
      return null
    }
  }

  const encrypt = (raw: string): string | null => {
    if (!masterKey) return null
    try {
      return CryptoJS.AES.encrypt(raw, masterKey).toString()
    } catch {
      return null
    }
  }

  const safeGet = <T>(domain: OfflineStorageDomain, key: string): T | null => {
    if (!resolvedStorage || !key) return null
    try {
      const raw = resolvedStorage.getItem(buildStorageKey(domain, key))
      if (!raw) return null
      const decrypted = decrypt(raw)
      if (!decrypted) return null
      return JSON.parse(decrypted) as T
    } catch {
      return null
    }
  }

  const safeSet = <T>(domain: OfflineStorageDomain, key: string, value: T): void => {
    if (!resolvedStorage || !key) return
    try {
      const encrypted = encrypt(JSON.stringify(value))
      if (!encrypted) return
      resolvedStorage.setItem(buildStorageKey(domain, key), encrypted)
    } catch {
      // Best-effort encrypted cache only.
    }
  }

  const safeRemove = (domain: OfflineStorageDomain, key: string): void => {
    if (!resolvedStorage || !key) return
    try {
      resolvedStorage.removeItem(buildStorageKey(domain, key))
    } catch {
      // Best-effort encrypted cache only.
    }
  }

  const safeList = <T>(domain: OfflineStorageDomain): Array<{ key: string; value: T }> => {
    if (!resolvedStorage) return []

    const prefix = domainPrefix(domain)
    const items: Array<{ key: string; value: T }> = []

    try {
      for (let index = 0; index < resolvedStorage.length; index += 1) {
        const fullKey = resolvedStorage.key(index)
        if (!fullKey || !fullKey.startsWith(prefix)) continue

        const domainKey = fullKey.slice(prefix.length)
        const raw = resolvedStorage.getItem(fullKey)
        if (!raw) continue

        const decrypted = decrypt(raw)
        if (!decrypted) continue

        try {
          items.push({ key: domainKey, value: JSON.parse(decrypted) as T })
        } catch {
          // Ignore malformed rows and continue.
        }
      }
    } catch {
      return []
    }

    return items
  }

  return {
    get: safeGet,
    set: safeSet,
    remove: safeRemove,
    list: safeList,
  }
}

let defaultAdapter: OfflineStorageAdapter | null = null

export function getOfflineStorageAdapter(): OfflineStorageAdapter {
  if (!defaultAdapter) {
    defaultAdapter =
      getConfiguredOfflineStorageMode() === 'encrypted'
        ? createEncryptedOfflineAdapter()
        : createLocalStorageOfflineAdapter()
  }
  return defaultAdapter
}

export function setOfflineStorageAdapter(adapter: OfflineStorageAdapter): void {
  defaultAdapter = adapter
}
