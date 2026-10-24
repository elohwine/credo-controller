/**
 * Job photo downloads and the evidence pack (.zip of every photo + the audit table).
 * Same file on both surfaces (`credo-ui/portal/lib/evidencePack.ts` ↔ `credo-ui/mobile/lib/evidencePack.ts`).
 * No dependencies: photos are already in the job the person was allowed to open, so the pack is
 * built on the device and nothing new is requested from the server for data: photos.
 */

export interface EvidencePhoto {
  src: string
  /** File name inside the pack, without extension. */
  name: string
  step: string
  takenBy?: string
  at?: string
}

export interface PhotoFile {
  bytes: Uint8Array
  mime: string
  extension: string
}

interface TrailLike {
  reference?: string
  steps: Array<{ id: string; title: string; photos: string[]; by?: string; at?: string }>
  holds?: Array<{ id?: string; label: string; photo?: string; by?: string; at?: string }>
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
}

function slug(value: string): string {
  return (
    String(value || '')
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'photo'
  )
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64.replace(/\s+/g, ''))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + chunk)))
  }
  return btoa(binary)
}

/** Bytes of one job photo: decoded from a data: URI, otherwise fetched (same URL the preview shows). */
export async function photoFile(src: string, fetcher: typeof fetch = fetch): Promise<PhotoFile> {
  const data = /^data:([^;,]+)?((?:;[^;,]+)*?)(;base64)?,(.*)$/s.exec(src)
  if (data) {
    const mime = (data[1] || 'application/octet-stream').toLowerCase()
    const bytes = data[3] ? base64ToBytes(data[4]) : new TextEncoder().encode(decodeURIComponent(data[4]))
    return { bytes, mime, extension: EXTENSIONS[mime] || 'bin' }
  }
  const response = await fetcher(src)
  if (!response.ok) throw new Error(`Photo could not be loaded (${response.status})`)
  const mime = String(response.headers.get('content-type') || 'image/jpeg')
    .split(';')[0]
    .toLowerCase()
  return { bytes: new Uint8Array(await response.arrayBuffer()), mime, extension: EXTENSIONS[mime] || 'jpg' }
}

/** Every photo on the job's timeline and safety holds, once each, with a readable name. */
export function evidencePhotos(trail: TrailLike): EvidencePhoto[] {
  const seen = new Set<string>()
  const out: EvidencePhoto[] = []
  const add = (src: string | undefined, base: string, step: string, takenBy?: string, at?: string) => {
    if (!src || seen.has(src)) return
    seen.add(src)
    out.push({ src, name: `${String(out.length + 1).padStart(2, '0')}-${slug(base)}`, step, takenBy, at })
  }
  for (const step of trail.steps) {
    step.photos.forEach((src, index) =>
      add(src, step.photos.length > 1 ? `${step.title}-${index + 1}` : step.title, step.title, step.by, step.at),
    )
  }
  for (const hold of trail.holds || []) add(hold.photo, `safety-hold-${hold.label}`, `Safety hold: ${hold.label}`, hold.by, hold.at)
  return out
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/** A plain (stored, uncompressed) .zip. Photos are already compressed, so storing loses nothing. */
export function zipFiles(files: Array<{ name: string; data: Uint8Array }>, when = new Date()): Uint8Array {
  const encoder = new TextEncoder()
  const dosTime = (when.getHours() << 11) | (when.getMinutes() << 5) | Math.floor(when.getSeconds() / 2)
  const dosDate = ((Math.max(when.getFullYear(), 1980) - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0
  for (const file of files) {
    const name = encoder.encode(file.name)
    const crc = crc32(file.data)
    const local = new Uint8Array(30 + name.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true)
    lv.setUint16(6, 0x0800, true)
    lv.setUint16(10, dosTime, true)
    lv.setUint16(12, dosDate, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, file.data.length, true)
    lv.setUint32(22, file.data.length, true)
    lv.setUint16(26, name.length, true)
    local.set(name, 30)
    const central = new Uint8Array(46 + name.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(8, 0x0800, true)
    cv.setUint16(12, dosTime, true)
    cv.setUint16(14, dosDate, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, file.data.length, true)
    cv.setUint32(24, file.data.length, true)
    cv.setUint16(28, name.length, true)
    cv.setUint32(42, offset, true)
    central.set(name, 46)
    locals.push(local, file.data)
    centrals.push(central)
    offset += local.length + file.data.length
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, files.length, true)
  ev.setUint16(10, files.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)
  const out = new Uint8Array(offset + centralSize + end.length)
  let at = 0
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, at)
    at += part.length
  }
  return out
}

/**
 * The evidence pack: `photos/…`, `audit.csv`, and `manifest.csv` naming each photo's step,
 * person and time. A photo that cannot be read is listed as missing rather than failing the pack.
 */
export async function buildEvidencePack(
  trail: TrailLike,
  auditCsv: string,
  fetcher: typeof fetch = fetch,
): Promise<{ bytes: Uint8Array; photoCount: number; missing: string[] }> {
  const encoder = new TextEncoder()
  const files: Array<{ name: string; data: Uint8Array }> = []
  const manifest: string[][] = [['file', 'step', 'by', 'at', 'status']]
  const missing: string[] = []
  for (const photo of evidencePhotos(trail)) {
    try {
      const file = await photoFile(photo.src, fetcher)
      const name = `photos/${photo.name}.${file.extension}`
      files.push({ name, data: file.bytes })
      manifest.push([name, photo.step, photo.takenBy || '', photo.at || '', 'included'])
    } catch {
      missing.push(photo.step)
      manifest.push(['', photo.step, photo.takenBy || '', photo.at || '', 'could not be loaded'])
    }
  }
  const cell = (value: string) => `"${value.replace(/"/g, '""')}"`
  files.push({ name: 'audit.csv', data: encoder.encode(auditCsv) })
  files.push({ name: 'manifest.csv', data: encoder.encode(manifest.map((row) => row.map(cell).join(',')).join('\n')) })
  return { bytes: zipFiles(files), photoCount: files.length - 2, missing }
}
