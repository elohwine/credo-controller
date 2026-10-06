import React from 'react'
import { Badge, Divider, Loader, Paper, Stack, Text, Group, Box } from '@mantine/core'

export type DetailStatusLine = {
  text: string
}

export type DetailTimelineItem = {
  id: string
  title: string
  source: string
  description?: string
  note?: string
  timestamp?: string
  badge?: {
    label: string
    color?: string
  }
}

export type WorkflowDetailSection = {
  title: string
  content: React.ReactNode
}

export function DetailSectionCard({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <Paper p="md" radius="md" withBorder>
      <Stack gap="sm">
        <Text size="xs" c="dimmed" fw={600}>{title}</Text>
        {children}
      </Stack>
    </Paper>
  )
}

export function DetailStatusCard({
  status,
  amount,
  currency,
  lines,
  amountColor = 'indigo',
  footer,
}: {
  status: string
  amount: number | string | undefined
  currency?: string
  lines: DetailStatusLine[]
  amountColor?: string
  footer?: React.ReactNode
}) {
  const formattedAmount =
    amount == null || amount === ''
      ? '—'
      : `${currency ? `${currency} ` : ''}${typeof amount === 'number' ? amount.toLocaleString() : amount}`

  return (
    <Paper p="md" radius="md" withBorder>
      <Group justify="space-between" align="center">
        <Box>
          <Text size="xs" c="dimmed" fw={600}>CURRENT STATUS</Text>
          <Text fw={700}>{status}</Text>
        </Box>
        <Text fw={700} c={amountColor}>{formattedAmount}</Text>
      </Group>
      <Stack gap={2} mt="sm">
        {lines.map((line, index) => (
          <Text key={`${line.text}-${index}`} size="xs" c="dimmed">{line.text}</Text>
        ))}
      </Stack>
      {footer}
    </Paper>
  )
}

export function DetailTimelineList({
  items,
  emptyText,
  loading = false,
}: {
  items: DetailTimelineItem[]
  emptyText: string
  loading?: boolean
}) {
  if (loading) return <Loader size="xs" />
  if (items.length === 0) return <Text size="sm" c="dimmed">{emptyText}</Text>

  return (
    <Stack gap="xs">
      {items.map((item) => (
        <Paper key={item.id} p="sm" withBorder radius="md">
          <Group justify="space-between" align="flex-start">
            <Box>
              <Text size="sm" fw={600}>{item.title}</Text>
              <Text size="xs" c="dimmed">Source: {item.source}</Text>
              {item.description && (
                <Text size="xs" c="dimmed" mt={4}>{item.description}</Text>
              )}
              {item.note && (
                <Text size="xs" c="dimmed" mt={4}>{item.note}</Text>
              )}
              {item.badge && (
                <Badge size="xs" mt={6} color={item.badge.color || 'gray'} variant="light">
                  {item.badge.label}
                </Badge>
              )}
            </Box>
            <Text size="xs" c="dimmed">{item.timestamp || '—'}</Text>
          </Group>
        </Paper>
      ))}
    </Stack>
  )
}

export function WorkflowDetailBody({
  statusCard,
  sections,
  auditItems,
  auditEmptyText,
  auditLoading = false,
}: {
  statusCard: React.ReactNode
  sections: WorkflowDetailSection[]
  auditItems: DetailTimelineItem[]
  auditEmptyText: string
  auditLoading?: boolean
}) {
  return (
    <Stack gap="md" pb="lg">
      {statusCard}
      {sections.map((section) => (
        <DetailSectionCard key={section.title} title={section.title}>
          {section.content}
        </DetailSectionCard>
      ))}
      <Divider label="History" labelPosition="left" />
      <DetailTimelineList
        items={auditItems}
        emptyText={auditEmptyText}
        loading={auditLoading}
      />
    </Stack>
  )
}
