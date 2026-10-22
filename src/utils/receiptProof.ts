import { createHash } from 'crypto'

/**
 * Proof of a receipt or bill: a live photo (data URL) or a receipt record from the person's
 * wallet that stands in for it. Used by request follow-ups, expense claims and supplier payments,
 * the same two ways as the job's receipt step.
 */

export const MAX_RECEIPT_IMAGE_CHARS = 12_000_000
export const DATA_IMAGE_URL = /^data:image\/(jpeg|jpg|png|webp|heic|heif);base64,[A-Za-z0-9+/]+=*$/

export interface ReceiptRecordRef {
  id: string
  type: string
  label: string
}

export interface ReceiptProofInput {
  receiptImage?: unknown
  receiptRecord?: unknown
}

export interface ReceiptProof {
  image?: string
  imageSha256?: string
  record?: ReceiptRecordRef
}

/** The wallet record kept as id, type and label only (never the credential itself). */
export function compactReceiptRecord(raw: unknown): ReceiptRecordRef | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const record = raw as Record<string, unknown>
  const id = String(record.id ?? '')
    .trim()
    .slice(0, 200)
  if (!id) return undefined
  const type =
    String(record.type ?? record.vc_type ?? 'ReceiptVC')
      .trim()
      .slice(0, 80) || 'ReceiptVC'
  const label =
    String(record.label ?? '')
      .trim()
      .slice(0, 160) ||
    `${type.replace(/VC$/, '').replace(/([a-z])([A-Z])/g, '$1 $2')}${record.issuer_name ? ` from ${String(record.issuer_name).slice(0, 80)}` : ''}`
  return { id, type, label }
}

/**
 * Check a photo and/or wallet record. A photo wins over a record (as on the follow-up card).
 * Throws with `label` in the message when the photo is not a photo or is too large.
 */
export function readReceiptProof(input: ReceiptProofInput, label = 'Receipt photo'): ReceiptProof {
  const image = typeof input.receiptImage === 'string' ? input.receiptImage.trim() : ''
  if (image) {
    if (image.length > MAX_RECEIPT_IMAGE_CHARS) throw new Error(`${label} is too large. Take a smaller photo.`)
    if (!DATA_IMAGE_URL.test(image)) throw new Error(`${label} must be a photo.`)
    return { image, imageSha256: createHash('sha256').update(image).digest('hex') }
  }
  const record = compactReceiptRecord(input.receiptRecord)
  return record ? { record } : {}
}

export function hasReceiptProof(proof: ReceiptProof): boolean {
  return Boolean(proof.image || proof.record)
}
