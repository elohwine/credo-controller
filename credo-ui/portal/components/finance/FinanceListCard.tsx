import React from 'react'
import { Badge, Box, Card, Group, Text } from '@mantine/core'
import { IconChevronRight } from '@tabler/icons-react'

/**
 * List row used by every portal finance tab. Matches the mobile finance card:
 * flow badge, status, date, optional note, and amount.
 */
export function FinanceListCard({
  title,
  flowLabel,
  flowColor,
  status,
  statusColor = 'gray',
  dateLabel,
  note,
  amountLabel,
  trailing,
  onClick,
}: {
  title: string
  flowLabel: string
  flowColor: string
  status: string
  statusColor?: string
  dateLabel?: string
  note?: string
  amountLabel?: string
  trailing?: React.ReactNode
  onClick?: () => void
}) {
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
