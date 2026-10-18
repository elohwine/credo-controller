import { Button, Paper, Stack, Text } from '@mantine/core'

/**
 * Empty or failed list. A failure with saved data is shown as a toast instead; this is only
 * for when there is nothing to show at all.
 */
export function EmptyOrError({
  error,
  emptyTitle,
  emptyDetail,
  onRetry,
}: {
  error?: string | null
  emptyTitle: string
  emptyDetail?: string
  onRetry?: () => void
}) {
  return (
    <Paper p="lg" radius="md" withBorder role={error ? 'alert' : 'status'}>
      <Stack gap={6} align="center">
        <Text fw={700} ta="center">
          {error ? 'Could not load this' : emptyTitle}
        </Text>
        <Text size="sm" c="dimmed" ta="center">
          {error || emptyDetail}
        </Text>
        {error && onRetry ? (
          <Button size="xs" variant="light" mt={4} onClick={onRetry}>
            Try again
          </Button>
        ) : null}
      </Stack>
    </Paper>
  )
}
