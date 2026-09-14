import React from 'react';
import { Card, Group, Text, Stack, ActionIcon, ThemeIcon } from '@mantine/core';
import { IconChevronRight, IconShieldCheck, IconCalendar, IconUser } from '@tabler/icons-react';
import dayjs from 'dayjs';
import StatusBadge from '@/components/shared/StatusBadge';
import { formatCredentialType, formatIssuerName } from '@/lib/format';

export interface ProofCardData {
  id: string;
  type: string;
  issuer: string;
  issuedAt: string;
  expiresAt?: string;
  claims: Record<string, string>;
  status?: 'valid' | 'archived' | 'expired';
}

interface ProofCardProps {
  proof: ProofCardData;
  onClick: (proof: ProofCardData) => void;
}

export default function ProofCard({ proof, onClick }: ProofCardProps) {
  const label = formatCredentialType(proof.type);
  const expired = proof.expiresAt ? dayjs(proof.expiresAt).isBefore(dayjs()) : false;
  const status = expired ? 'expired' : (proof.status ?? 'valid');

  return (
    <Card
      p="md"
      radius="md"
      shadow="xs"
      style={{
        cursor: 'pointer',
        border: '1px solid #e2e8f0',
        background: '#ffffff',
        opacity: expired ? 0.7 : 1,
      }}
      onClick={() => onClick(proof)}
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Group gap="sm" align="flex-start" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
          <ThemeIcon
            size={40}
            radius="md"
            color={status === 'valid' ? 'credentis' : 'gray'}
            variant="light"
            style={{ flexShrink: 0 }}
          >
            <IconShieldCheck size={20} />
          </ThemeIcon>
          <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
            <Text fw={600} size="sm" truncate>
              {label}
            </Text>
            <Group gap={4} align="center">
              <IconUser size={10} color="#94a3b8" />
              <Text size="xs" c="dimmed" truncate>
                {formatIssuerName(proof.issuer)}
              </Text>
            </Group>
            <Group gap="xs" mt={4}>
              <StatusBadge status={status} />
              <Group gap={4} align="center">
                <IconCalendar size={10} color="#94a3b8" />
                <Text size="xs" c="dimmed">
                  {dayjs(proof.issuedAt).format('D MMM YYYY')}
                </Text>
              </Group>
            </Group>
          </Stack>
        </Group>
        <ActionIcon variant="transparent" color="gray" size="sm" mt={2} style={{ flexShrink: 0 }}>
          <IconChevronRight size={16} />
        </ActionIcon>
      </Group>
    </Card>
  );
}
