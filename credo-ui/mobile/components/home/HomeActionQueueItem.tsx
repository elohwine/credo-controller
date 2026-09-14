import React from 'react';
import { Badge, Box, Card, Group, Text, ThemeIcon, useMantineColorScheme, useMantineTheme } from '@mantine/core';
import { IconChevronRight, IconInbox, IconReceipt, IconBolt } from '@tabler/icons-react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

export type HomeActionKind = 'offer' | 'receipt' | 'request' | 'transaction';

export interface HomeActionQueueItemData {
  id: string;
  title: string;
  summary: string;
  createdAt: string;
  kind: HomeActionKind;
  route: string;
  family?: string;
}

interface HomeActionQueueItemProps {
  item: HomeActionQueueItemData;
  onClick: (item: HomeActionQueueItemData) => void;
}

function kindMeta(kind: HomeActionKind): { label: string; color: string; icon: React.ReactNode } {
  if (kind === 'request') return { label: 'Pay now', color: 'teal', icon: <IconBolt size={16} /> };
  if (kind === 'receipt') return { label: 'Receipt', color: 'green', icon: <IconReceipt size={16} /> };
  if (kind === 'offer') return { label: 'Offer', color: 'credentis', icon: <IconInbox size={16} /> };
  return { label: 'Update', color: 'indigo', icon: <IconBolt size={16} /> };
}

export default function HomeActionQueueItem({ item, onClick }: HomeActionQueueItemProps) {
  const theme = useMantineTheme();
  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === 'dark';
  const meta = kindMeta(item.kind);

  return (
    <Card
      p="sm"
      radius="md"
      withBorder
      style={{
        cursor: 'pointer',
        borderColor: isDark ? theme.colors.dark[4] : theme.colors.gray[2],
        background: isDark
          ? 'linear-gradient(145deg, rgba(26, 27, 30, 0.92), rgba(20, 21, 24, 0.9))'
          : 'linear-gradient(145deg, rgba(255, 255, 255, 1), rgba(246, 248, 252, 0.95))',
      }}
      onClick={() => onClick(item)}
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Group gap="sm" align="flex-start" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
          <ThemeIcon size={30} radius="md" variant="light" color={meta.color}>
            {meta.icon}
          </ThemeIcon>

          <Box style={{ minWidth: 0, flex: 1 }}>
            <Group justify="space-between" align="center" wrap="nowrap" mb={2}>
              <Group gap={6} wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
                <Badge size="xs" color={meta.color} variant="light">{meta.label}</Badge>
                <Text fw={700} size="sm" lineClamp={1} style={{ minWidth: 0, flex: 1 }}>{item.title}</Text>
              </Group>
              <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>{dayjs(item.createdAt).fromNow()}</Text>
            </Group>
            <Text size="xs" c="dimmed" lineClamp={1} mt={1}>{item.summary || 'Open to continue'}</Text>
            {item.family && (
              <Group mt={4} gap={6}>
                <Badge size="xs" variant="dot" color={meta.color}>{item.family}</Badge>
              </Group>
            )}
          </Box>
        </Group>

        <IconChevronRight size={16} color={isDark ? theme.colors.gray[4] : theme.colors.gray[5]} />
      </Group>
    </Card>
  );
}
