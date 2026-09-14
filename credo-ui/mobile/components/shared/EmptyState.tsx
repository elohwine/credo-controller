import React from 'react';
import { Center, Stack, Text, ThemeIcon } from '@mantine/core';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  py?: string | number;
}

export default function EmptyState({ icon, title, description, py = 'xl' }: EmptyStateProps) {
  return (
    <Center py={py}>
      <Stack align="center" gap="md">
        <ThemeIcon size={56} radius="xl" color="credentis" variant="light">
          {icon}
        </ThemeIcon>
        <Text fw={600}>{title}</Text>
        {description && (
          <Text size="sm" c="dimmed" ta="center">
            {description}
          </Text>
        )}
      </Stack>
    </Center>
  );
}