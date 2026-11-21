/**
 * The job sheet a worker fills in on site (checks, measurements, items used), the store
 * person's signature, and quote lines priced from the rate card. Read by the server, both apps
 * and the client's job page, so every screen shows the same thing.
 */

export type JobSheetItemKind = 'check' | 'measure' | 'text'

export interface JobSheetItem {
  id: string
  label: string
  kind: JobSheetItemKind
  /** For a measurement: m, mm, m², kg, … */
  unit?: string
  required?: boolean
}

export interface JobSheetAnswer {
  /** A check: done or not. */
  ok?: boolean
  /** A measurement or a note. */
  value?: string
}

export interface JobSheetMaterial {
  name: string
  quantity: number
  unit?: string
}

export interface JobSheetRecord {
  problemType?: string
  items: JobSheetItem[]
  answers: Record<string, JobSheetAnswer>
  materials: JobSheetMaterial[]
  savedAt: string
  savedBy?: string
}

export interface StoreSignature {
  signerName: string
  signerRole?: string
  /** A PNG drawn on the worker's phone, as a data URL. */
  imageDataUrl: string
  signedAt: string
  by?: string
}

export interface RateCard {
  id: string
  name: string
  unit: string
  unitPrice: number
  currency: string
  problemType?: string
  active: boolean
}

export interface QuoteLine {
  rateCardId?: string
  description: string
  quantity: number
  unit?: string
  unitPrice: number
}

/** Used when the office has not set a sheet for the job's problem type. */
export const DEFAULT_JOB_SHEET: JobSheetItem[] = [
  { id: 'site_safe', label: 'Site made safe before work', kind: 'check', required: true },
  { id: 'fault_found', label: 'What was wrong', kind: 'text', required: true },
  { id: 'work_done', label: 'What was done', kind: 'text', required: true },
  { id: 'area_clean', label: 'Area left clean', kind: 'check', required: true },
  { id: 'tested', label: 'Tested and working', kind: 'check' },
]

export const MAX_SIGNATURE_DATA_URL = 300_000

export function jobSheetItemsError(items: unknown): string | undefined {
  if (!Array.isArray(items) || items.length === 0) return 'Add at least one line to the job sheet.'
  if (items.length > 40) return 'A job sheet can have at most 40 lines.'
  const ids = new Set<string>()
  for (const item of items as JobSheetItem[]) {
    if (!item || typeof item.label !== 'string' || !item.label.trim() || item.label.length > 160) {
      return 'Each line needs a name of up to 160 characters.'
    }
    if (!['check', 'measure', 'text'].includes(item.kind)) return `Choose what "${item.label}" asks for.`
    if (!/^[a-z0-9_]{1,40}$/.test(String(item.id || ''))) return `"${item.label}" needs a short id.`
    if (ids.has(item.id)) return `"${item.label}" is on the sheet twice.`
    ids.add(item.id)
  }
  return undefined
}

/** What is still missing before the sheet counts as filled in. */
export function jobSheetMissing(items: JobSheetItem[], answers: Record<string, JobSheetAnswer>): string[] {
  return items
    .filter((item) => item.required)
    .filter((item) => {
      const answer = answers[item.id]
      if (!answer) return true
      if (item.kind === 'check') return answer.ok !== true
      return !String(answer.value || '').trim()
    })
    .map((item) => item.label)
}

export function quoteTotal(lines: QuoteLine[]): number {
  return Math.round(lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0) * 100) / 100
}

/** Turns a label into a sheet line id ("Pipe length" → "pipe_length"). */
export function jobSheetItemId(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'line'
  )
}
