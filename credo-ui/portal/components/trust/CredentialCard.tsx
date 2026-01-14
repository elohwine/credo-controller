/**
 * CredentialCard - Trustworthy credential display
 * 
 * LAYERING:
 * - Mantine: Paper container, Badge, Text typography
 * - Glass: .glass-credential for trust surface
 * - React Bits: TiltCard for 3D interaction
 * 
 * USE FOR: Displaying issued credentials, wallet view items
 */

'use client';

import React from 'react';
import { Paper, Badge, Text, Group, Stack, Box } from '@mantine/core';
import { motion } from 'framer-motion';
import { TiltCard } from '../reactbits';

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
  className = '',
  onClick,
  animated = true,
}) => {
  const statusInfo = statusConfig[status];

  const cardContent = (
    <Paper
      className={`glass-credential ${className}`}
      p="lg"
      radius="md"
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <Stack gap="md">
        {/* Header */}
        <Group justify="space-between" align="flex-start">
          <Group gap="sm">
            <Box
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ backgroundColor: 'rgba(33, 136, 202, 0.15)' }}
            >
              <svg 
                className="w-5 h-5"
                style={{ color: 'var(--mantine-color-brand-5)' }}
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" 
                />
              </svg>
            </Box>
            <div>
              <Text size="md" fw={600} c="gray.9">
                {credentialType}
              </Text>
              <Text size="sm" c="dimmed">
                Issued by {issuer}
              </Text>
            </div>
          </Group>
          
          <Group gap="xs">
            <Badge color={statusInfo.color} variant="light" size="sm">
              {statusInfo.label}
            </Badge>
            {verified && (
              <motion.div
                className="glass-badge flex items-center gap-1"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, delay: 0.2 }}
              >
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path 
                    fillRule="evenodd" 
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" 
                    clipRule="evenodd" 
                  />
                </svg>
                <Text size="xs">Verified</Text>
              </motion.div>
            )}
          </Group>
        </Group>

        {/* Subject */}
        {subject && (
          <Box className="pb-3 border-b border-white/20">
            <Text size="xs" c="dimmed" tt="uppercase" className="tracking-wider mb-1">
              Subject
            </Text>
            <Text size="sm" ff="mono" className="truncate">
              {subject}
            </Text>
          </Box>
        )}

        {/* Claims preview */}
        {claims && Object.keys(claims).length > 0 && (
          <Stack gap="xs">
            {Object.entries(claims).slice(0, 4).map(([key, value]) => (
              <Group key={key} justify="space-between">
                <Text size="sm" c="dimmed" tt="capitalize">
                  {key.replace(/([A-Z])/g, ' $1').trim()}
                </Text>
                <Text size="sm" fw={500}>
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
          Issued {new Date(issuedAt).toLocaleDateString()}
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
