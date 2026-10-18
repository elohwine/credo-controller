/**
 * Photos taken for a job step are kept on the phone until the server confirms the step.
 *
 * Android may close the app while the camera is open. The camera result then comes back on a
 * fresh start through Capacitor's `appRestoredResult` event, and the page that asked for it is
 * gone. A pending marker written before the camera opens says which step the photo belongs to
 * and where to return, so the shot is added to that step's draft instead of being lost.
 */

export interface PhotoDraftShot {
  id: string
  dataUrl: string
  capturedAt: string
  gps: { lat: number; lng: number; accuracy?: number } | null
}

interface PendingCamera {
  draftKey: string
  returnTo: string
  gps: PhotoDraftShot['gps']
  at: string
}

const DRAFT_PREFIX = 'credentis.photoDraft.'
const PENDING_KEY = 'credentis.photoDraft.pendingCamera'
const MAX_DRAFT_AGE_MS = 3 * 24 * 60 * 60 * 1000

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

export function loadPhotoDraft(draftKey: string): PhotoDraftShot[] {
  const raw = storage()?.getItem(DRAFT_PREFIX + draftKey)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as { savedAt: string; shots: PhotoDraftShot[] }
    if (Date.now() - Date.parse(parsed.savedAt) > MAX_DRAFT_AGE_MS) {
      clearPhotoDraft(draftKey)
      return []
    }
    return Array.isArray(parsed.shots) ? parsed.shots.filter((shot) => shot?.dataUrl) : []
  } catch {
    return []
  }
}

/** Returns false when the phone had no room to keep the draft. */
export function savePhotoDraft(draftKey: string, shots: PhotoDraftShot[]): boolean {
  const store = storage()
  if (!store) return false
  try {
    if (shots.length === 0) store.removeItem(DRAFT_PREFIX + draftKey)
    else store.setItem(DRAFT_PREFIX + draftKey, JSON.stringify({ savedAt: new Date().toISOString(), shots }))
    return true
  } catch {
    return false
  }
}

export function clearPhotoDraft(draftKey: string): void {
  storage()?.removeItem(DRAFT_PREFIX + draftKey)
}

export function markCameraPending(draftKey: string, returnTo: string, gps: PhotoDraftShot['gps']): void {
  try {
    storage()?.setItem(PENDING_KEY, JSON.stringify({ draftKey, returnTo, gps, at: new Date().toISOString() }))
  } catch {
    // Without the marker a restored photo cannot be placed; the normal camera path still works.
  }
}

export function clearCameraPending(): void {
  storage()?.removeItem(PENDING_KEY)
}

/** Where to go back to when the app was closed while the camera was open (recent markers only). */
export function pendingCameraReturn(): string | null {
  const raw = storage()?.getItem(PENDING_KEY)
  if (!raw) return null
  try {
    const pending = JSON.parse(raw) as PendingCamera
    if (Date.now() - Date.parse(pending.at) > 15 * 60 * 1000) {
      clearCameraPending()
      return null
    }
    return pending.returnTo || null
  } catch {
    clearCameraPending()
    return null
  }
}

/**
 * Called once on app start. When the camera result arrives after Android closed the app, the
 * photo is added to the step's draft and the page to return to is given back.
 */
export function adoptRestoredCameraResult(event: {
  pluginId?: string
  methodName?: string
  success?: boolean
  data?: any
}): string | null {
  if (event?.pluginId !== 'Camera') return null
  const raw = storage()?.getItem(PENDING_KEY)
  clearCameraPending()
  if (!raw) return null
  let pending: PendingCamera
  try {
    pending = JSON.parse(raw)
  } catch {
    return null
  }
  const dataUrl = typeof event.data?.dataUrl === 'string' ? event.data.dataUrl : ''
  if (event.success && dataUrl) {
    const shots = loadPhotoDraft(pending.draftKey)
    savePhotoDraft(pending.draftKey, [
      ...shots,
      { id: `${Date.now()}-${shots.length}`, dataUrl, capturedAt: new Date().toISOString(), gps: pending.gps },
    ])
  }
  return pending.returnTo || null
}
