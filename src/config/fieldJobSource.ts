/**
 * Where a field job came from, read from the job's own input (or an intake payload), so the
 * Jobs list on both apps, the export and the reports all name it the same way.
 */

export const FIELD_JOB_SOURCES = ['email', 'office', 'booking', 'import'] as const
export type FieldJobSource = (typeof FIELD_JOB_SOURCES)[number]

const LABELS: Record<FieldJobSource, string> = {
  email: 'From email',
  office: 'Added by office',
  booking: 'Client booking',
  import: 'Imported from a file',
}

export function isFieldJobSource(value: unknown): value is FieldJobSource {
  return typeof value === 'string' && (FIELD_JOB_SOURCES as readonly string[]).includes(value)
}

export function fieldJobSourceOf(input: Record<string, any> | null | undefined): FieldJobSource {
  const value = input || {}
  if (value.sourceType === 'email' || value.sourceMessageId) return 'email'
  if (value.sourceType === 'import') return 'import'
  if (value.bookedVia || (value.serviceId && value.awaitAssignment)) return 'booking'
  return 'office'
}

export function fieldJobSourceLabel(source: FieldJobSource): string {
  return LABELS[source]
}

export const FIELD_JOB_SOURCE_OPTIONS = [
  { value: 'all', label: 'All sources' },
  ...FIELD_JOB_SOURCES.map((source) => ({ value: source, label: LABELS[source] })),
]
