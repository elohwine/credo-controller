import React from 'react';
import { Paper, Group, Text, Box, ActionIcon } from '@mantine/core';
import { IconCheck, IconChevronRight } from '@tabler/icons-react';
import { ProofCardData } from './ProofCard';

interface WalletProofCardProps {
  proof: ProofCardData;
  onClick: (proof: ProofCardData) => void;
}

function getPrimaryText(claims: Record<string, string>): string {
  const contactKeys = ['email', 'phone', 'phoneNumber', 'msisdn', 'mobile'];
  for (const key of contactKeys) {
    if (claims[key]) return String(claims[key]);
  }

  const nameKeys = ['name', 'fullName', 'displayName', 'username'];
  for (const key of nameKeys) {
    if (claims[key]) return String(claims[key]);
  }

  const first = Object.values(claims)[0];
  return first ? String(first) : 'Credential details available';
}

export default function WalletProofCard({ proof, onClick }: WalletProofCardProps) {
  const primaryText = getPrimaryText(proof.claims ?? {});

  return (
    <Paper
      p="md"
      radius="xl"
      onClick={() => onClick(proof)}
      style={{
        cursor: 'pointer',
        minHeight: 122,
        position: 'relative',
        overflow: 'hidden',
        color: '#ffffff',
        background:
          'radial-gradient(120px 80px at 85% 30%, rgba(255,255,255,0.18), transparent 60%), linear-gradient(135deg, #1ea6a3 0%, #57d38c 100%)',
      }}
    >
      <Group justify="space-between" align="flex-start" mb="md">
        <Text fw={700} size="lg" lh={1.1} lineClamp={1}>
          {proof.type.replace(/VC$/, '').replace(/([a-z])([A-Z])/g, '$1 $2')}
        </Text>
        <ActionIcon size={24} radius="md" variant="white" color="gray">
          <IconCheck size={14} color="#1ea672" />
        </ActionIcon>
      </Group>

      <Box>
        <Text size="sm" fw={500} lineClamp={1}>
          {primaryText}
        </Text>
      </Box>

      <Group justify="space-between" mt="md" align="flex-end">
        <Box>
          <Text size="10px" c="rgba(255,255,255,0.75)">
            Issued on
          </Text>
          <Text size="xs" fw={500}>
            {new Date(proof.issuedAt).toISOString().slice(0, 10)}
          </Text>
        </Box>
        <IconChevronRight size={16} color="rgba(255,255,255,0.85)" />
      </Group>
    </Paper>
  );
}
