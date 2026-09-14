import React from 'react';
import { useRouter } from 'next/router';
import { Card, Group, Text, Stack, Box, ActionIcon, Badge } from '@mantine/core';
import { IconChevronRight } from '@tabler/icons-react';
import { ModuleConfig } from '@/lib/modules';

interface ModuleCardProps {
  module: ModuleConfig;
  pendingCount?: number;
}

export default function ModuleCard({ module, pendingCount = 0 }: ModuleCardProps) {
  const router = useRouter();
  const Icon = module.icon;

  return (
    <Card
      p="md"
      radius="md"
      shadow="sm"
      style={{ cursor: 'pointer', border: '1px solid #e2e8f0', background: '#ffffff' }}
      onClick={() => router.push(`/inbox/?filter=${module.inboxFilter}`)}
    >
      <Group justify="space-between" align="flex-start">
        <Group gap="sm" align="flex-start" style={{ flex: 1, minWidth: 0 }}>
          {/* Icon badge */}
          <Box
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: `${module.accentColor}18`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Icon size={22} color={module.accentColor} stroke={1.8} />
          </Box>

          <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
            <Group gap="xs" align="center">
              <Text fw={600} size="sm" truncate>
                {module.label}
              </Text>
              {pendingCount > 0 && (
                <Badge size="sm" color="red" radius="xl" variant="filled">
                  {pendingCount}
                </Badge>
              )}
            </Group>
            <Text size="xs" c="dimmed" lineClamp={1}>
              {module.description}
            </Text>
          </Stack>
        </Group>

        <ActionIcon variant="transparent" color="gray" size="sm" mt={2}>
          <IconChevronRight size={16} />
        </ActionIcon>
      </Group>
    </Card>
  );
}
