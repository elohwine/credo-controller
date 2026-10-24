/**
 * Who may export, and how an export leaves the app. Same file on both surfaces
 * (`credo-ui/portal/lib/exportFile.ts` ↔ `credo-ui/mobile/lib/exportFile.ts`); only
 * `saveExport` differs: the phone hands the file to the share sheet inside the Android app.
 */

/** Roles that may download history tables and finance lists. */
export const EXPORT_ROLES = ['owner', 'admin', 'auditor', 'finance_manager']

export function exportRole(): string {
  if (typeof window === 'undefined') return ''
  const stored = String(window.localStorage.getItem('credoUserRole') || '').toLowerCase()
  if (stored && stored !== 'holder' && stored !== 'resttenantagent') return stored
  try {
    const token = window.localStorage.getItem('credoOrgToken') || ''
    const payload = JSON.parse(atob(token.split('.')[1] || ''))
    return String(payload?.orgRole || '').toLowerCase()
  } catch {
    return ''
  }
}

export function canExportReports(): boolean {
  return EXPORT_ROLES.includes(exportRole())
}

export function csvCell(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

/** CSV text from a header row and data rows, quoted so commas and quotes in values survive. */
export function csvFrom(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((cells) => cells.map(csvCell).join(',')).join('\n')
}

/** A file name that is safe on every OS: letters, digits, dots and dashes. */
export function exportFileName(base: string, extension: string): string {
  const safe =
    String(base || 'export')
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'export'
  return `${safe}.${extension}`
}

export const EXPORT_MIME = {
  csv: 'text/csv;charset=utf-8',
  json: 'application/json',
  zip: 'application/zip',
} as const

function browserDownload(name: string, mime: string, body: BlobPart) {
  const blob = new Blob([body], { type: mime })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

/** Save a text export. Resolves once the file has been handed to the browser. */
export async function saveExport(name: string, mime: string, body: string): Promise<void> {
  browserDownload(name, mime, body)
}

/** Save a photo or .zip the same way as a text export. */
export async function saveBinaryExport(name: string, mime: string, bytes: Uint8Array, _base64?: () => string): Promise<void> {
  browserDownload(name, mime, bytes as BlobPart)
}
