export type EvidencePhase = 'before' | 'concealed' | 'after' | 'receipt' | 'acknowledgement'

export interface EvidenceAttachment {
  imageBase64?: string
  mimeType?: string
  gpsLat?: number | null
  gpsLng?: number | null
  timestamp: string
  sha256?: string
  notes?: string
  label?: string
}

export interface FieldEvidencePayload extends EvidenceAttachment {
  notes: string
  performanceVc?: unknown
  receiptVc?: unknown
  attachments?: EvidenceAttachment[]
}

export async function sha256Hex(dataUrl: string): Promise<string> {
  const binary = atob(dataUrl.split(',')[1] ?? dataUrl)
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** The same sealed-photo payload for native and browser cameras. */
export function fieldEvidenceResumePayload(
  payload: FieldEvidencePayload,
  phase: EvidencePhase,
): Record<string, unknown> {
  if (
    (phase === 'before' || phase === 'concealed' || phase === 'after') &&
    (payload.gpsLat == null || payload.gpsLng == null)
  ) {
    throw new Error("This photo needs this device's location. Allow location and take it again.")
  }
  return {
    evidenceHash: payload.sha256,
    photoUri: payload.imageBase64
      ? `data:${payload.mimeType || 'image/jpeg'};base64,${payload.imageBase64}`
      : undefined,
    gps: payload.gpsLat != null && payload.gpsLng != null ? { lat: payload.gpsLat, lng: payload.gpsLng } : undefined,
    notes: payload.notes,
    deviceCapturedAt: payload.timestamp,
    attachments: (payload.attachments || [])
      .filter((item) => item.imageBase64)
      .map((item) => ({
        photoUri: `data:${item.mimeType || 'image/jpeg'};base64,${item.imageBase64}`,
        evidenceHash: item.sha256,
        gps: item.gpsLat != null && item.gpsLng != null ? { lat: item.gpsLat, lng: item.gpsLng } : undefined,
        deviceCapturedAt: item.timestamp,
        notes: item.notes,
        kind: 'photo',
      })),
    phase,
    performanceVc: payload.performanceVc,
    receiptVc: payload.receiptVc,
  }
}

export function assertFieldStepSucceeded(result: { status?: string; error?: string }): void {
  if (result.error || result.status === 'failed')
    throw new Error(result.error || 'This job step could not be recorded.')
}
