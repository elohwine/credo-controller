import React from 'react'
import { Badge, Box, Card, Group, Text } from '@mantine/core'
import { IconChevronRight } from '@tabler/icons-react'

/**
 * List row used by every finance tab on both apps. Same file on the website
 * (`credo-ui/portal/components/finance/FinanceListCard.tsx`) and the phone
 * (`credo-ui/mobile/components/shared/FinanceListCard.tsx`): flow badge, status, date,
 * optional note, amount. `FinanceListRow` is the shape `FinanceListTable` renders too, so one
 * array of rows feeds both the Cards and the Table view and a row opens the same detail.
 */
export interface FinanceListRow {
  id: string
  title: string
  flowLabel: string
  flowColor: string
  status: string
  statusColor?: string
  dateLabel?: string
  note?: string
  /** Transaction/obligation/settlement line shared by card, table and CSV views. */
  financeLine?: string
  amountLabel?: string
  /** Shown on the right in card view, next to the amount (small badge, action icon). */
  trailing?: React.ReactNode
  /** Card-only content under the main line (trust strips, instalment badges). */
  extra?: React.ReactNode
  onClick?: () => void
}

export function FinanceListCard({
  title,
  flowLabel,
  flowColor,
  status,
  statusColor = 'gray',
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
