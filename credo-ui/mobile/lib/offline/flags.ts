function envFlag(value: string | undefined, defaultValue = true): boolean {
  if (typeof value !== 'string' || value.trim() === '') return defaultValue
  const normalized = value.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

export interface MobileOfflineFlags {
  offlineSyncEnabled: boolean
}

export function getMobileOfflineFlags(): MobileOfflineFlags {
  const nextPublic = process.env.NEXT_PUBLIC_OFFLINE_SYNC_ENABLED
  return {
    offlineSyncEnabled: envFlag(nextPublic, true),
  }
}
