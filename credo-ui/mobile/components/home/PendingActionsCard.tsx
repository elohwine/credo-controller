import React from 'react';
import { Badge, Group, Paper, SimpleGrid, Stack, Text, ThemeIcon, UnstyledButton, useMantineColorScheme, useMantineTheme } from '@mantine/core';

interface PendingAction {
  label: string;
  count: number;
  icon: React.ReactNode;
  onClick: () => void;
}

interface PendingActionsCardProps {
  actions: PendingAction[];
  title?: string;
}

export default function PendingActionsCard({ actions, title = 'Quick Action Panel' }: PendingActionsCardProps) {
  const theme = useMantineTheme();
  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <Paper p="md" radius="md" withBorder>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600} mb="sm">
        {title}
      </Text>
      <SimpleGrid cols={2} spacing="sm" verticalSpacing="sm">
        {actions.slice(0, 4).map((action) => (
          <UnstyledButton
            key={action.label}
            onClick={action.onClick}
            style={{
              cursor: 'pointer',
              border: `1px solid ${isDark ? theme.colors.dark[4] : theme.colors.gray[2]}`,
              background: isDark
                ? `linear-gradient(145deg, ${theme.colors.dark[6]}, ${theme.colors.dark[7]})`
                : `linear-gradient(145deg, ${theme.white}, ${theme.colors.gray[0]})`,
              borderRadius: theme.radius.md,
              padding: '10px 12px',
              minHeight: 100,
              width: '100%',
              textAlign: 'left',
              boxShadow: isDark ? 'none' : theme.shadows.xs,
              transition: 'transform 120ms ease, box-shadow 120ms ease',
            }}
          >
            <Stack gap={8}>
              <Group justify="space-between" align="flex-start" wrap="nowrap">
                <ThemeIcon size={30} radius="md" variant="light" color="blue">
                  {action.icon}
                </ThemeIcon>
                <Badge size="sm" color={action.count > 0 ? 'orange' : 'gray'} variant="light">{action.count}</Badge>
              </Group>
              <Text size="sm" fw={600} lh={1.25} lineClamp={2}>{action.label}</Text>
            </Stack>
          </UnstyledButton>
        ))}
      </SimpleGrid>
    </Paper>
  );
}
