/**
 * Paging and sorting for long lists, shared by the API and both apps so a page, a sort and a
 * total mean the same thing everywhere. The API pages lists that can grow with imports and the
 * jobs mailbox; the apps use the same helpers to page lists they already hold.
 */

export type SortDirection = 'asc' | 'desc'

export interface ListSort {
  key: string
  dir: SortDirection
}

export interface ListPage<T> {
  items: T[]
  /** Rows matching the filters, before paging. */
  total: number
  offset: number
  limit?: number
}

export const LIST_PAGE_SIZES = [25, 50, 100] as const
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 500

/** How to read a sortable value from a row. Empty values always sort last. */
export type SortValue<T> = (row: T) => string | number | undefined | null

export function isSortDirection(value: unknown): value is SortDirection {
  return value === 'asc' || value === 'desc'
}

/** A page size from a query string: none means everything, anything else is kept between 1 and the maximum. */
export function pageLimit(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const number = Math.floor(Number(value))
  if (!Number.isFinite(number) || number < 1) throw new Error('Page size must be a positive number')
  return Math.min(number, MAX_PAGE_SIZE)
}

export function pageOffset(value: unknown): number {
  if (value === undefined || value === null || value === '') return 0
  const number = Math.floor(Number(value))
  if (!Number.isFinite(number) || number < 0) throw new Error('Page start must be zero or more')
  return number
}

function compare(a: string | number | undefined | null, b: string | number | undefined | null): number {
  const emptyA = a === undefined || a === null || a === ''
  const emptyB = b === undefined || b === null || b === ''
  if (emptyA || emptyB) return emptyA === emptyB ? 0 : emptyA ? 1 : -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}

/**
 * Rows in the asked order. An unknown sort key keeps the order the rows came in. The sort is
 * stable and empty values stay at the end in both directions, so "no date" never tops a list.
 */
export function sortRows<T>(rows: T[], sorters: Record<string, SortValue<T>>, sort?: Partial<ListSort>): T[] {
  const read = sort?.key ? sorters[sort.key] : undefined
  if (!read) return rows
  const sign = sort?.dir === 'asc' ? 1 : -1
  return rows
    .map((row, index) => ({ row, index, value: read(row) }))
    .sort((a, b) => {
      const emptyA = a.value === undefined || a.value === null || a.value === ''
      const emptyB = b.value === undefined || b.value === null || b.value === ''
      if (emptyA !== emptyB) return emptyA ? 1 : -1
      return sign * compare(a.value, b.value) || a.index - b.index
    })
    .map((entry) => entry.row)
}

export function pageRows<T>(rows: T[], offset = 0, limit?: number): ListPage<T> {
  const start = Math.max(0, Math.min(offset, rows.length))
  return {
    items: limit === undefined ? rows.slice(start) : rows.slice(start, start + limit),
    total: rows.length,
    offset: start,
    ...(limit === undefined ? {} : { limit }),
  }
}
