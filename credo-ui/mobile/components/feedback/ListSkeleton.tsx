import { Box, Group, Stack } from '@mantine/core'

/**
 * Shown only the first time a list loads and nothing is saved yet. When there is saved data,
 * the screen shows it and the header bar shows the refresh instead.
 */
export function ListSkeleton({ rows = 5, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <Stack gap="sm" aria-busy="true" aria-label={label} role="status">
      {Array.from({ length: rows }).map((_, index) => (
        <Group
          key={index}
          gap="sm"
          wrap="nowrap"
          align="flex-start"
          p="sm"
          style={{ borderRadius: 12, background: '#fff' }}
        >
          <Box className="credentis-skeleton" style={{ width: 40, height: 40, borderRadius: 20, flexShrink: 0 }} />
          <Stack gap={8} style={{ flex: 1 }}>
            <Box className="credentis-skeleton" style={{ height: 12, width: `${70 - (index % 3) * 12}%` }} />
            <Box className="credentis-skeleton" style={{ height: 10, width: `${45 + (index % 2) * 20}%` }} />
          </Stack>
        </Group>
      ))}
    </Stack>
  )
}
