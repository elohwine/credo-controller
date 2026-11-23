import React, { useEffect, useState } from 'react'
import { Badge, Box, Button, Card, Group, SegmentedControl, Text } from '@mantine/core'
import { IconChevronRight, IconDownload, IconLayoutGrid, IconTable } from '@tabler/icons-react'

import type { SortValue } from '../../src/config/listPage'
import { DataTable, useClientList, useListState, type DataColumn } from './DataTable'

/**
 * The finance lists on both apps: one row array feeds the Cards and the Table view, both paged
 * and the table sortable, and a row opens the same detail either way.
 */

export interface FinanceListRow {
  id: string
  title: string
  flowLabel: string
  flowColor: string
  status: string
  statusColor?: string
  /** A loud marker next to the status, e.g. an urgent job, in both views. */
  flag?: { label: string; color: string }
  dateLabel?: string
  /** Sorts the Date column; read from `dateLabel` when not given. */
  dateValue?: string
  note?: string
  /** Transaction/obligation/settlement line shared by card, table and CSV views. */
  financeLine?: string
  amountLabel?: string
  /** Sorts the Amount column; read from `amountLabel` when not given. */
  amountValue?: number
  /** Shown on the right in card view, next to the amount (small badge, action icon). */
  trailing?: React.ReactNode
  /** Card-only content under the main line (trust strips, instalment badges). */
  extra?: React.ReactNode
  onClick?: () => void
}

export type FinanceListView = 'cards' | 'table'

export const FINANCE_TABLE_HEADERS = (noteLabel: string) => ['Item', 'Type', 'Status', 'Date', noteLabel, 'Amount']

/** Plain cells for a CSV export: same columns, same order as the table. */
export function financeRowsToCells(rows: FinanceListRow[]): unknown[][] {
  return rows.map((row) => [row.title, row.flowLabel, row.status, row.dateLabel || '', [row.note, row.financeLine].filter(Boolean).join(' · '), row.amountLabel || ''])
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "3 Mar 2025 14:05" (how both apps write a finance date) as "2025-03-03 14:05", so dates sort in time order. */
export function financeDateKey(label?: string): string | undefined {
  const match = /^(\d{1,2}) ([A-Z][a-z]{2}) (\d{4})(?: (\d{2}):(\d{2}))?$/.exec(String(label || '').trim())
  if (!match) return undefined
  const month = MONTHS.indexOf(match[2])
  if (month < 0) return undefined
  return `${match[3]}-${String(month + 1).padStart(2, '0')}-${match[1].padStart(2, '0')} ${match[4] || '00'}:${match[5] || '00'}`
}

/** "USD 1,234.50" or "$1,234.50" as 1234.5. */
export function financeAmountValue(label?: string): number | undefined {
  const digits = String(label || '').replace(/[^0-9.\-]/g, '')
  if (!/\d/.test(digits)) return undefined
  const value = Number(digits)
  return Number.isFinite(value) ? value : undefined
}

export const FINANCE_SORTS: Record<string, SortValue<FinanceListRow>> = {
  item: (row) => row.title,
  type: (row) => row.flowLabel,
  status: (row) => row.status,
  date: (row) => row.dateValue || financeDateKey(row.dateLabel),
  amount: (row) => row.amountValue ?? financeAmountValue(row.amountLabel),
}

export function FinanceListCard({
  title,
  flowLabel,
  flowColor,
  status,
  statusColor = 'gray',
  flag,
  dateLabel,
  note,
  financeLine,
  amountLabel,
  trailing,
  extra,
  onClick,
}: Omit<FinanceListRow, 'id'>) {
  return (
    <Card radius="md" withBorder padding="sm" onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
      <Group justify="space-between" wrap="nowrap">
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Text fw={600} size="sm" truncate>{title}</Text>
          <Group gap={6} mt={4} wrap="wrap">
            <Badge size="xs" color={flowColor} variant="light">{flowLabel}</Badge>
            {flag && <Badge size="sm" color={flag.color} variant="filled">{flag.label}</Badge>}
            <Badge size="sm" color={statusColor} variant="light">{status}</Badge>
            {dateLabel && <Text size="xs" c="dimmed">{dateLabel}</Text>}
          </Group>
          {note && <Text size="xs" c="dimmed" mt={2} lineClamp={2}>{note}</Text>}
          {financeLine && <Text size="xs" c="dimmed" mt={2} lineClamp={2}>{financeLine}</Text>}
          {extra}
        </Box>
        <Box ta="right" style={{ flexShrink: 0 }}>
          {amountLabel && <Text fw={700} size="sm" c={flowColor}>{amountLabel}</Text>}
          {trailing}
          {onClick && <IconChevronRight size={14} color="#64748b" />}
        </Box>
      </Group>
    </Card>
  )
}

/** Badges must not be squeezed to "M…" on a narrow phone, so badge columns keep a floor width. */
const BADGE_MIN = 112
/**
 * Mantine caps a badge at 100% of its cell and hides label overflow, so an auto-layout table
 * treats the badge as shrinkable and collapses long labels to "WAITING: RECEI…". Let the label
 * report its real width so the column grows to fit instead.
 */
const badgeStyles = { root: { maxWidth: 'none' }, label: { overflow: 'visible' } } as const

function financeColumns(noteLabel: string): Array<DataColumn<FinanceListRow>> {
  return [
    { key: 'item', title: 'Item', sortable: true, sticky: true, maxWidth: 180, render: (row) => <Text size="sm" fw={600} truncate>{row.title}</Text> },
    {
      key: 'type',
      title: 'Type',
      sortable: true,
      nowrap: true,
      minWidth: BADGE_MIN,
      render: (row) => <Badge size="xs" color={row.flowColor} variant="light" styles={badgeStyles}>{row.flowLabel}</Badge>,
    },
    {
      key: 'status',
      title: 'Status',
      sortable: true,
      nowrap: true,
      minWidth: BADGE_MIN,
      render: (row) => (
        <Group gap={4} wrap="nowrap">
          {row.flag && <Badge size="xs" color={row.flag.color} variant="filled" styles={badgeStyles}>{row.flag.label}</Badge>}
          <Badge size="xs" color={row.statusColor || 'gray'} variant="light" styles={badgeStyles}>{row.status}</Badge>
        </Group>
      ),
    },
    { key: 'date', title: 'Date', sortable: true, firstDir: 'desc', nowrap: true, render: (row) => <Text size="xs" c="dimmed">{row.dateLabel || '—'}</Text> },
    {
      key: 'note',
      title: noteLabel,
      minWidth: 120,
      render: (row) => (
        <>
          <Text size="xs" c="dimmed" lineClamp={2}>{row.note || (!row.financeLine ? '—' : '')}</Text>
          {row.financeLine && <Text size="xs" c="dimmed" lineClamp={2}>{row.financeLine}</Text>}
        </>
      ),
    },
    {
      key: 'amount',
      title: 'Amount',
      sortable: true,
      firstDir: 'desc',
      align: 'right',
      nowrap: true,
      render: (row) => <Text size="sm" fw={700} c={row.amountLabel ? row.flowColor : 'dimmed'}>{row.amountLabel || '—'}</Text>,
    },
  ]
}

/** Cards or table from one row array, paged, with the same loading and empty states either way. */
export function FinanceListRows({
  rows,
  view,
  noteLabel = 'Note',
  loading = false,
  empty,
  compact = false,
}: {
  rows: FinanceListRow[]
  view: FinanceListView
  noteLabel?: string
  loading?: boolean
  empty: React.ReactNode
  /** Bigger page buttons for the phone. */
  compact?: boolean
}) {
  const state = useListState({ pageSize: 25 })
  const { items, paging } = useClientList(rows, FINANCE_SORTS, state)
  return (
    <DataTable
      rows={items}
      columns={financeColumns(noteLabel)}
      rowKey={(row) => row.id}
      view={view}
      renderCard={({ id: _id, ...row }) => <FinanceListCard {...row} />}
      onRowClick={(row) => row.onClick?.()}
      rowLabel={(row) => row.title}
      sort={state.sort}
      onSortChange={state.setSort}
      paging={paging}
      loading={loading}
      empty={empty}
      itemWord="item"
      compact={compact}
    />
  )
}

const STORAGE_KEY = 'credoFinanceListView'

/** Cards or Table, remembered on this device. */
export function useFinanceListView(): [FinanceListView, (view: FinanceListView) => void] {
  const [view, setViewState] = useState<FinanceListView>('cards')
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (stored === 'table' || stored === 'cards') setViewState(stored)
    } catch {
      // storage unavailable: keep cards
    }
  }, [])
  const setView = (next: FinanceListView) => {
    setViewState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* ignore */
    }
  }
  return [view, setView]
}

export function FinanceViewToggle({
  view,
  onChange,
  onExport,
  canExport,
  exporting = false,
}: {
  view: FinanceListView
  onChange: (view: FinanceListView) => void
  /** When given and the person may export, an "Export CSV" button downloads the tab's rows. */
  onExport?: () => void
  /** Each app's export rule (`canExportReports`), read in the browser. */
  canExport?: () => boolean
  exporting?: boolean
}) {
  const [allowed, setAllowed] = useState(false)
  useEffect(() => {
    setAllowed(Boolean(canExport?.()))
  }, [canExport])
  return (
    <Group gap="xs" wrap="nowrap">
      {onExport && allowed && view === 'table' && (
        <Button size="xs" variant="default" leftSection={<IconDownload size={14} />} onClick={onExport} loading={exporting}>
          Export CSV
        </Button>
      )}
      <SegmentedControl
        size="xs"
        value={view}
        onChange={(value) => onChange(value as FinanceListView)}
        aria-label="List layout"
        data={[
          { value: 'cards', label: <Group gap={4} wrap="nowrap"><IconLayoutGrid size={14} /><span>Cards</span></Group> },
          { value: 'table', label: <Group gap={4} wrap="nowrap"><IconTable size={14} /><span>Table</span></Group> },
        ]}
      />
    </Group>
  )
}
