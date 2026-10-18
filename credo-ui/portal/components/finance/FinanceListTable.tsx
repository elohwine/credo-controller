import React from 'react'
import { Badge, Box, Center, Loader, Stack, Table, Text } from '@mantine/core'
import { FinanceListCard, type FinanceListRow } from './FinanceListCard'

/**
 * Table view of a finance list. Same file on the website and the phone
 * (`credo-ui/portal/components/finance/FinanceListTable.tsx` ↔
 * `credo-ui/mobile/components/shared/FinanceListTable.tsx`).
 *
 * Phone-first rules: the table scrolls inside its own container so the page never scrolls
 * sideways; the header and the first column stay put; amounts line up on the right; every
 * row is one tap or Enter away from the same detail the card opens.
 */

export type FinanceListView = 'cards' | 'table'

export const FINANCE_TABLE_HEADERS = (noteLabel: string) => ['Item', 'Type', 'Status', 'Date', noteLabel, 'Amount']

/** Plain cells for a CSV export of the visible rows: same columns, same order as the table. */
export function financeRowsToCells(rows: FinanceListRow[]): unknown[][] {
  return rows.map((row) => [row.title, row.flowLabel, row.status, row.dateLabel || '', [row.note, row.financeLine].filter(Boolean).join(' · '), row.amountLabel || ''])
}

const stickyCell: React.CSSProperties = {
  position: 'sticky',
  left: 0,
  zIndex: 1,
  background: 'var(--mantine-color-body)',
  maxWidth: 180,
  boxShadow: '1px 0 0 var(--mantine-color-default-border)',
}

/** Badges must not be squeezed to "M…" on a narrow phone, so badge columns keep a floor width. */
const badgeCell: React.CSSProperties = { whiteSpace: 'nowrap', minWidth: 112 }
/**
 * Mantine caps a badge at 100% of its cell and hides label overflow, so an auto-layout table
 * treats the badge as shrinkable and collapses long labels to "WAITING: RECEI…". Let the label
 * report its real width so the column grows to fit instead.
 */
const badgeStyles = { root: { maxWidth: 'none' }, label: { overflow: 'visible' } } as const

export function FinanceListTable({ rows, noteLabel = 'Note', caption }: { rows: FinanceListRow[]; noteLabel?: string; caption?: string }) {
  const onKey = (row: FinanceListRow) => (event: React.KeyboardEvent) => {
    if (!row.onClick) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      row.onClick()
    }
  }
  return (
    <Table.ScrollContainer minWidth={680} type="native">
      <Table striped highlightOnHover withTableBorder stickyHeader verticalSpacing="xs" horizontalSpacing="sm" fz="sm" captionSide="bottom">
        <Table.Thead>
          <Table.Tr>
            <Table.Th style={{ ...stickyCell, zIndex: 2 }}>Item</Table.Th>
            <Table.Th style={badgeCell}>Type</Table.Th>
            <Table.Th style={badgeCell}>Status</Table.Th>
            <Table.Th>Date</Table.Th>
            <Table.Th>{noteLabel}</Table.Th>
            <Table.Th ta="right">Amount</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((row) => (
            <Table.Tr
              key={row.id}
              role={row.onClick ? 'button' : undefined}
              tabIndex={row.onClick ? 0 : undefined}
              aria-label={row.title}
              onClick={row.onClick}
              onKeyDown={onKey(row)}
              style={{ cursor: row.onClick ? 'pointer' : 'default' }}
            >
              <Table.Td fw={600} style={stickyCell}>
                <Text size="sm" fw={600} truncate>{row.title}</Text>
              </Table.Td>
              <Table.Td style={badgeCell}><Badge size="xs" color={row.flowColor} variant="light" styles={badgeStyles}>{row.flowLabel}</Badge></Table.Td>
              <Table.Td style={badgeCell}><Badge size="xs" color={row.statusColor || 'gray'} variant="light" styles={badgeStyles}>{row.status}</Badge></Table.Td>
              <Table.Td><Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>{row.dateLabel || '—'}</Text></Table.Td>
              <Table.Td style={{ minWidth: 120 }}>
                <Text size="xs" c="dimmed" lineClamp={2}>{row.note || (!row.financeLine ? '—' : '')}</Text>
                {row.financeLine && <Text size="xs" c="dimmed" lineClamp={2}>{row.financeLine}</Text>}
              </Table.Td>
              <Table.Td ta="right" style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                <Text size="sm" fw={700} c={row.amountLabel ? row.flowColor : 'dimmed'}>{row.amountLabel || '—'}</Text>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
        <Table.Caption>{caption || `${rows.length} ${rows.length === 1 ? 'item' : 'items'}`}</Table.Caption>
      </Table>
    </Table.ScrollContainer>
  )
}

/** Cards or table from one row array, with the same loading and empty states either way. */
export function FinanceListRows({
  rows,
  view,
  noteLabel,
  loading = false,
  empty,
}: {
  rows: FinanceListRow[]
  view: FinanceListView
  noteLabel?: string
  loading?: boolean
  empty: React.ReactNode
}) {
  if (loading) return <Center py="xl"><Loader /></Center>
  if (rows.length === 0) return typeof empty === 'string' ? <Text c="dimmed" size="sm">{empty}</Text> : <Box>{empty}</Box>
  if (view === 'table') return <FinanceListTable rows={rows} noteLabel={noteLabel} />
  return (
    <Stack gap="sm">
      {rows.map(({ id, ...row }) => <FinanceListCard key={id} {...row} />)}
    </Stack>
  )
}
