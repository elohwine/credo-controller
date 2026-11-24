import type { ComponentType, ReactNode } from 'react'
import { Box, Group, Paper, Text, UnstyledButton, useComputedColorScheme } from '@mantine/core'

export type StatTileIcon = ComponentType<{ size?: number | string; stroke?: number }>

const HOVER_BORDER = 'var(--mantine-color-default-border-hover, var(--mantine-color-gray-4))'

/**
 * One headline figure: what it counts, the number, and a short line of context.
 * Cards stay neutral; only a figure that needs someone to act (`alert`) shows colour,
 * on the number and a small status dot, so problems stand out without a busy grid.
 */
export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  color = 'red',
  alert = false,
  compact = false,
  onClick,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon?: StatTileIcon
  /** Colour used only when `alert` is set. */
  color?: string
  alert?: boolean
  compact?: boolean
  onClick?: () => void
}) {
  const scheme = useComputedColorScheme('light')
  const tone = alert ? (color === 'gray' ? 'red' : color) : null
  // Deeper shade on light cards, lighter shade on dark cards, so the figure stays readable in both.
  const figureColor = tone ? `var(--mantine-color-${tone}-${scheme === 'dark' ? 4 : 8})` : 'var(--mantine-color-text)'
  const body = (
    <Paper
      withBorder
      radius="md"
      p={compact ? 'sm' : 'md'}
      h="100%"
      style={{ transition: 'border-color 120ms ease, box-shadow 120ms ease' }}
      onMouseEnter={
        onClick
          ? (event) => {
              event.currentTarget.style.borderColor = HOVER_BORDER
              event.currentTarget.style.boxShadow = 'var(--mantine-shadow-xs)'
            }
          : undefined
      }
      onMouseLeave={
        onClick
          ? (event) => {
              event.currentTarget.style.borderColor = ''
              event.currentTarget.style.boxShadow = ''
            }
          : undefined
      }
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="xs">
        <Group gap={6} wrap="nowrap" align="flex-start" style={{ minWidth: 0 }}>
          {tone && (
            <Box
              aria-hidden
              w={6}
              h={6}
              mt={compact ? 6 : 8}
              style={{ borderRadius: '50%', flexShrink: 0, background: `var(--mantine-color-${tone}-filled)` }}
            />
          )}
          <Text size={compact ? 'xs' : 'sm'} c="dimmed" fw={500} lineClamp={2}>
            {label}
          </Text>
        </Group>
        {Icon && (
          <Box c="dimmed" style={{ flexShrink: 0, display: 'flex', opacity: 0.7 }}>
            <Icon size={compact ? 16 : 18} stroke={1.6} />
          </Box>
        )}
      </Group>
      <Text
        fw={650}
        lh={1.15}
        mt={compact ? 6 : 8}
        c={figureColor}
        style={{ fontSize: compact ? 22 : 28, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}
      >
        {value}
      </Text>
      {hint && (
        <Text size="xs" c="dimmed" mt={4} lineClamp={2}>
          {hint}
        </Text>
      )}
    </Paper>
  )
  if (!onClick) return body
  return (
    <UnstyledButton
      onClick={onClick}
      style={{ display: 'block', height: '100%', width: '100%', borderRadius: 'var(--mantine-radius-md)' }}
    >
      {body}
    </UnstyledButton>
  )
}
