import { Progress, Stack, Text } from '@mantine/core';

export function GuidedSteps({ current, total, label = 'Step' }: { current: number; total: number; label?: string }) {
  return (
    <Stack gap={4}>
      <Progress value={(current / total) * 100} size="sm" radius="xl" aria-label={`${label} ${current} of ${total}`} />
      <Text size="xs" c="dimmed">{label} {current} of {total}</Text>
    </Stack>
  );
}
