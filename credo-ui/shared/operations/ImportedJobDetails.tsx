import { Group, Paper, Stack, Text } from '@mantine/core'
import { IMPORTED_JOB_DETAIL_LABELS, type ImportedJobDetails as Details } from '../../../src/config/fieldDataImport'

/** Everything the old system (MyMobileWorkers) held about a job, in its own words. Nothing shows for other jobs. */
export function ImportedJobDetails({ details, workerName }: { details?: Details | null; workerName?: string }) {
  if (!details || typeof details !== 'object') return null
  const facts = [
    ['Assigned to', workerName || ''] as [string, string],
    ...IMPORTED_JOB_DETAIL_LABELS.map(([key, label]): [string, string] => [label, String(details[key] || '')]),
  ].filter(([, value]) => value.trim() !== '')
  const checks = Array.isArray(details.checks) ? details.checks : []
  if (!facts.length && !checks.length) return null
  return (
    <Stack gap="sm">
      {facts.map(([label, value]) => (
        <div key={label}>
          <Text size="xs" c="dimmed">
            {label}
          </Text>
          <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
            {value}
          </Text>
        </div>
      ))}
      {checks.length > 0 && (
        <Paper withBorder radius="md" p="sm">
          <Text fw={600} size="sm" mb={6}>
            Checks
          </Text>
          <Stack gap={4}>
            {checks.map((check, index) => (
              <Group key={`${check.name}-${index}`} justify="space-between" wrap="nowrap" gap="sm">
                <Text size="sm">{check.name}</Text>
                <Text size="sm" c="dimmed" ta="right">
                  {check.result}
                </Text>
              </Group>
            ))}
          </Stack>
        </Paper>
      )}
    </Stack>
  )
}
