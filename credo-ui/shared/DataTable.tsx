import React, { useEffect, useMemo, useState } from 'react'
import { Box, Center, Group, Loader, Pagination, Select, Stack, Text } from '@mantine/core'
import { DataTable as MantineDataTable, type DataTableSortStatus } from 'mantine-datatable'

import {
  DEFAULT_PAGE_SIZE,
  LIST_PAGE_SIZES,
  pageRows,
  sortRows,
  type ListSort,
  type SortDirection,
  type SortValue,
} from '../../src/config/listPage'

/**
 * One list component for both apps, built on mantine-datatable: a table on a wide screen, cards on a phone, with sorting,
 * pages and a count of everything that matched. Long lists (imports, the jobs mailbox) are paged
 * by the API and only one page is on screen; short lists already loaded are paged here with
 * `useClientList`, through the same helpers the API uses.
 */

export interface DataColumn<T> {
  key: string
  title: React.ReactNode
  render: (row: T) => React.ReactNode
  /** Clicking the header sorts by `key`. */
  sortable?: boolean
  /** The first direction when this column is chosen (dates and amounts start with the largest). */
  firstDir?: SortDirection
  align?: 'left' | 'right' | 'center'
  /** Stays in place while the rest of the row scrolls sideways (one column, the first). */
  sticky?: boolean
  minWidth?: number
  maxWidth?: number
  nowrap?: boolean
}

export interface DataPaging {
  offset: number
  limit: number
  total: number
  onChange: (offset: number, limit: number) => void
}

export interface ListState {
  sort: ListSort | null
  setSort: (sort: ListSort | null) => void
  offset: number
  limit: number
  setPage: (offset: number, limit: number) => void
}

/**
 * Sort and page state for a list. Changing `resetKey` (the filters, the tab) goes back to the
 * first page, so a new search never opens on an empty page 7.
 */
export function useListState({
  initialSort = null,
  pageSize = DEFAULT_PAGE_SIZE,
  resetKey,
}: { initialSort?: ListSort | null; pageSize?: number; resetKey?: unknown } = {}): ListState {
  const [sort, setSortState] = useState<ListSort | null>(initialSort)
  const [offset, setOffset] = useState(0)
  const [limit, setLimit] = useState(pageSize)
  useEffect(() => {
    setOffset(0)
  }, [resetKey])
  return {
    sort,
    setSort: (next) => {
      setSortState(next)
      setOffset(0)
    },
    offset,
    limit,
    setPage: (nextOffset, nextLimit) => {
      setOffset(nextLimit === limit ? nextOffset : 0)
      setLimit(nextLimit)
    },
  }
}

/** A list already loaded on the device, sorted and paged the same way the API does it. */
export function useClientList<T>(rows: T[], sorters: Record<string, SortValue<T>>, state: ListState) {
  const sorted = useMemo(() => (state.sort ? sortRows(rows, sorters, state.sort) : rows), [rows, sorters, state.sort])
  // A shorter list (after a filter or a refresh) never leaves the screen past its last page.
  const offset = state.offset >= sorted.length ? Math.max(0, Math.floor((sorted.length - 1) / state.limit) * state.limit) : state.offset
  const page = pageRows(sorted, offset, state.limit)
  return {
    items: page.items,
    paging: { offset: page.offset, limit: state.limit, total: page.total, onChange: state.setPage } as DataPaging,
  }
}

/** "1–50 of 1,234 jobs" with page buttons and a page size. Hidden when everything fits on one page. */
export function DataPager({ paging, itemWord = 'item', compact = false }: { paging: DataPaging; itemWord?: string; compact?: boolean }) {
  const { offset, limit, total, onChange } = paging
  const pages = Math.max(1, Math.ceil(total / limit))
  const page = Math.min(pages, Math.floor(offset / limit) + 1)
  const first = total === 0 ? 0 : offset + 1
  const last = Math.min(total, offset + limit)
  const word = total === 1 ? itemWord : `${itemWord}s`
  return (
    <Group justify="space-between" gap="xs" wrap="wrap" mt="xs">
      <Text size="sm" c="dimmed" aria-live="polite">
        {total <= limit ? `${total.toLocaleString()} ${word}` : `${first.toLocaleString()}–${last.toLocaleString()} of ${total.toLocaleString()} ${word}`}
      </Text>
      {total > LIST_PAGE_SIZES[0] && (
        <Group gap="xs" wrap="nowrap">
          {pages > 1 && (
            <Pagination
              total={pages}
              value={page}
              onChange={(next) => onChange((next - 1) * limit, limit)}
              size={compact ? 'md' : 'sm'}
              siblings={compact ? 0 : 1}
              boundaries={1}
              getControlProps={() => ({ style: compact ? { minWidth: 40, minHeight: 40 } : undefined })}
            />
          )}
          <Select
            size={compact ? 'md' : 'xs'}
            w={compact ? 96 : 84}
            aria-label="Rows per page"
            allowDeselect={false}
            data={LIST_PAGE_SIZES.map((size) => ({ value: String(size), label: `${size} / page` }))}
            value={String(limit)}
            onChange={(value) => value && onChange(0, Number(value))}
            comboboxProps={{ withinPortal: true }}
          />
        </Group>
      )}
    </Group>
  )
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  rowAccent,
  view = 'table',
  renderCard,
  onRowClick,
  rowLabel,
  sort,
  onSortChange,
  paging,
  loading = false,
  empty = 'Nothing to show.',
  itemWord,
  minWidth = 680,
  compact = false,
}: {
  rows: T[]
  columns: Array<DataColumn<T>>
  rowKey: (row: T) => string
  /** A CSS colour drawn as a bar on the row's left edge (for example the status colour). */
  rowAccent?: (row: T) => string | undefined
  /** Cards suit a phone and short lists; the table suits a wide screen and many rows. */
  view?: 'table' | 'cards'
  renderCard?: (row: T) => React.ReactNode
  onRowClick?: (row: T) => void
  rowLabel?: (row: T) => string
  sort?: ListSort | null
  onSortChange?: (sort: ListSort) => void
  /** The page on screen and how many rows matched in all. Without it every row is shown. */
  paging?: DataPaging
  loading?: boolean
  empty?: React.ReactNode
  itemWord?: string
  minWidth?: number
  /** Bigger touch targets for the phone. */
  compact?: boolean
}) {
  const total = paging ? paging.total : rows.length
  // Rows already on screen stay usable while a refresh runs; the spinner is only for a first load.
  if (loading && rows.length === 0) return <Center py="xl"><Loader /></Center>
  if (total === 0 && rows.length === 0) return typeof empty === 'string' ? <Text c="dimmed" size="sm">{empty}</Text> : <Box>{empty}</Box>

  if (view === 'cards' && renderCard) {
    return (
      <Stack gap="sm">
        {rows.map((row) => (
          <React.Fragment key={rowKey(row)}>{renderCard(row)}</React.Fragment>
        ))}
        {paging ? <DataPager paging={paging} itemWord={itemWord} compact={compact} /> : null}
      </Stack>
    )
  }

  const word = (count: number) => (itemWord ? ` ${count === 1 ? itemWord : `${itemWord}s`}` : '')
  const sortProps = onSortChange
    ? {
        sortStatus: { columnAccessor: sort?.key ?? '', direction: sort?.dir ?? 'asc' } as DataTableSortStatus<T>,
        onSortStatusChange: (status: DataTableSortStatus<T>) => {
          const key = String(status.columnAccessor)
          const column = columns.find((c) => c.key === key)
          // A newly chosen column opens in its own first direction (dates and amounts newest first).
          onSortChange({ key, dir: key === sort?.key ? status.direction : column?.firstDir || 'asc' })
        },
      }
    : {}
  const pagingProps = paging
    ? {
        page: Math.floor(paging.offset / paging.limit) + 1,
        onPageChange: (page: number) => paging.onChange((page - 1) * paging.limit, paging.limit),
        totalRecords: paging.total,
        recordsPerPage: paging.limit,
        recordsPerPageOptions: [...LIST_PAGE_SIZES],
        onRecordsPerPageChange: (size: number) => paging.onChange(0, size),
        recordsPerPageLabel: 'Rows per page',
        paginationText: ({ from, to, totalRecords }: { from: number; to: number; totalRecords: number }) =>
          totalRecords <= paging.limit
            ? `${totalRecords.toLocaleString()}${word(totalRecords)}`
            : `${from.toLocaleString()}–${to.toLocaleString()} of ${totalRecords.toLocaleString()}${word(totalRecords)}`,
        paginationSize: (compact ? 'md' : 'sm') as 'md' | 'sm',
      }
    : {}

  return (
    <MantineDataTable<T>
      records={rows}
      idAccessor={(row: T) => rowKey(row)}
      columns={columns.map((column, index) => ({
        accessor: column.key,
        title: column.title,
        render: (row: T) => column.render(row),
        sortable: Boolean(column.sortable && onSortChange),
        textAlign: column.align,
        // mantine-datatable's noWrap clips with an ellipsis; nowrap here keeps the whole value and widens the column.
        titleStyle: { minWidth: column.minWidth, whiteSpace: column.nowrap ? 'nowrap' : undefined },
        cellsStyle: (row: T) => {
          // An inset shadow on the first cell stays put when that column is pinned; a row border would not.
          const accent = index === 0 ? rowAccent?.(row) : undefined
          return {
            minWidth: column.minWidth,
            whiteSpace: column.nowrap ? 'nowrap' : undefined,
            maxWidth: column.maxWidth ?? (column.sticky ? 200 : undefined),
            fontVariantNumeric: column.align === 'right' ? 'tabular-nums' : undefined,
            boxShadow: accent ? `inset 4px 0 0 ${accent}` : undefined,
          }
        },
      }))}
      pinFirstColumn={Boolean(columns[0]?.sticky)}
      fetching={loading}
      striped
      highlightOnHover
      withTableBorder
      borderRadius="sm"
      verticalSpacing="xs"
      horizontalSpacing="sm"
      fz="sm"
      minHeight={rows.length ? undefined : 120}
      styles={{ table: { minWidth } }}
      onRowClick={onRowClick ? ({ record }) => onRowClick(record) : undefined}
      customRowAttributes={
        onRowClick
          ? (row: T) => ({
              role: 'button',
              tabIndex: 0,
              'aria-label': rowLabel?.(row),
              onKeyDown: (event: React.KeyboardEvent) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onRowClick(row)
                }
              },
            })
          : undefined
      }
      {...(sortProps as Record<string, unknown>)}
      {...(pagingProps as Record<string, unknown>)}
    />
  )
}
