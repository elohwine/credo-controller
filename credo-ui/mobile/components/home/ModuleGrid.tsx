import React from 'react';
import { useRouter } from 'next/router';
import { Stack, Text, Button, Box, Center, ThemeIcon } from '@mantine/core';
import { IconBuildingStore, IconArrowRight } from '@tabler/icons-react';
import { ModuleConfig } from '@/lib/modules';
import ModuleCard from './ModuleCard';

interface ModuleGridProps {
  modules: ModuleConfig[];
  pendingCounts?: Record<string, number>;
}

export default function ModuleGrid({ modules, pendingCounts = {} }: ModuleGridProps) {
  const router = useRouter();

  if (modules.length === 0) {
    return (
      <Center py="xl">
        <Stack align="center" gap="md" maw={280}>
          <ThemeIcon size={64} radius="xl" color="credentis" variant="light">
            <IconBuildingStore size={32} />
          </ThemeIcon>
          <Text fw={600} ta="center" size="lg">
            No modules active
          </Text>
          <Text size="sm" c="dimmed" ta="center">
            Set up your organisation sector and enable workflow modules in the web portal.
          </Text>
          <Button
            variant="light"
            color="credentis"
            rightSection={<IconArrowRight size={16} />}
            onClick={() => router.push('/settings/org/')}
          >
            Manage in portal
          </Button>
        </Stack>
      </Center>
    );
  }

  return (
    <Stack gap="sm">
      {modules.map((mod) => (
        <ModuleCard
          key={mod.featureKey}
          module={mod}
          pendingCount={pendingCounts[mod.featureKey] ?? 0}
        />
      ))}
    </Stack>
  );
}
