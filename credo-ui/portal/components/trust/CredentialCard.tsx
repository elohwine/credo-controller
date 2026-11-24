/**
 * CredentialCard - Signed record display
 *
 * LAYERING:
 * - Mantine: Paper container, Badge, Text typography (theme tokens, light + dark)
 * - React Bits: TiltCard for 3D interaction
 *
 * USE FOR: Displaying issued records, wallet view items
 */

'use client';

import React from 'react';
import { Paper, Badge, Text, Group, Stack, Box, ThemeIcon } from '@mantine/core';
import { IconCheck, IconShieldCheck } from '@tabler/icons-react';
import { motion } from 'framer-motion';
import { TiltCard } from '../reactbits';
import { formatTxnTime } from '@/lib/inboxAttention';

interface CredentialCardProps {
  credentialType: string;
  issuer: string;
  issuedAt: string;
  subject?: string;
  claims?: Record<string, string>;
  verified?: boolean;
  status?: 'valid' | 'expired' | 'revoked' | 'pending';
  className?: string;
  onClick?: () => void;
  animated?: boolean;
}

const statusConfig = {
  valid: { color: 'green', label: 'Valid' },
  expired: { color: 'orange', label: 'Expired' },
  revoked: { color: 'red', label: 'Revoked' },
  pending: { color: 'blue', label: 'Pending' },
};

export const CredentialCard: React.FC<CredentialCardProps> = ({
  credentialType,
  issuer,
  issuedAt,
  subject,
  claims,
  verified = false,
  status = 'valid',
  className,
  onClick,
  animated = true,
}) => {
  const statusInfo = statusConfig[status];

  const cardContent = (
    <Paper
      withBorder
      className={className || undefined}
      p="lg"
      radius="md"
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <Stack gap="md">
        {/* Header */}
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
            <ThemeIcon variant="light" color="blue" size={40} radius="xl">
              <IconShieldCheck size={20} />
            </ThemeIcon>
            <div style={{ minWidth: 0 }}>
              <Text size="md" fw={600} truncate>
                {credentialType}
              </Text>
              <Text size="sm" c="dimmed" truncate>
                Issued by {issuer}
              </Text>
            </div>
          </Group>

          <Group gap="xs" wrap="nowrap">
            <Badge color={statusInfo.color} variant="light" size="sm">
              {statusInfo.label}
            </Badge>
            {verified && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, delay: 0.2 }}
              >
                <Badge color="green" variant="light" size="sm" leftSection={<IconCheck size={12} />}>
                  Verified
                </Badge>
              </motion.div>
            )}
          </Group>
        </Group>

        {/* Subject */}
        {subject && (
          <Box pb="sm" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
            <Text size="xs" c="dimmed" tt="uppercase" mb={4} style={{ letterSpacing: '0.05em' }}>
              Issued to
            </Text>
            <Text size="sm" ff="monospace" truncate>
              {subject}
            </Text>
          </Box>
        )}

        {/* Claims preview */}
        {claims && Object.keys(claims).length > 0 && (
          <Stack gap="xs">
            {Object.entries(claims).slice(0, 4).map(([key, value]) => (
              <Group key={key} justify="space-between" wrap="nowrap" gap="sm">
                <Text size="sm" c="dimmed" tt="capitalize">
                  {key.replace(/([A-Z])/g, ' $1').trim()}
                </Text>
                <Text size="sm" fw={500} ta="right">
                  {value}
                </Text>
              </Group>
            ))}
            {Object.keys(claims).length > 4 && (
              <Text size="xs" c="dimmed" ta="center">
                +{Object.keys(claims).length - 4} more fields
              </Text>
            )}
          </Stack>
        )}

        {/* Footer */}
        <Text size="xs" c="dimmed" ta="right" mt="xs">
          Issued {formatTxnTime(issuedAt)}
        </Text>
      </Stack>
    </Paper>
  );

  // Wrap in TiltCard only if animated
  if (animated) {
    return (
      <TiltCard tiltAmount={6} scale={1.01} glareEnabled glareMaxOpacity={0.1}>
        {cardContent}
      </TiltCard>
    );
  }

  return cardContent;
};

export default CredentialCard;
