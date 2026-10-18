/**
 * Credential - Mantine-based credential card with Credentis branding
 */

'use client';

import { Paper, Text, Image, Box } from '@mantine/core';

type Props = {
  id: string;
  title: string;
  description?: string;
  selected?: boolean;
  actionLabel?: string;
  onClick: (id: string) => void;
};

export default function Credential({
  id,
  title,
  description,
  selected = false,
  actionLabel,
  onClick,
}: Props) {
  return (
    <Paper
      component="button"
      type="button"
      aria-label={actionLabel || title}
      onClick={() => onClick(id)}
      p="xl"
      radius="lg"
      style={{
        width: '100%',
        maxWidth: 360,
        minHeight: 225,
        height: '100%',
        textAlign: 'left',
        cursor: 'pointer',
        background: selected
          ? 'linear-gradient(135deg, var(--mantine-color-credentis-6) 0%, var(--mantine-color-credentis-8) 100%)'
          : 'linear-gradient(135deg, var(--mantine-color-credentis-5) 0%, var(--mantine-color-credentis-7) 100%)',
        boxShadow: selected
          ? '0 20px 40px rgba(33, 136, 202, 0.3)'
          : '0 4px 12px rgba(0, 0, 0, 0.1)',
        transition: 'all 0.2s ease',
        transform: selected ? 'scale(1.02)' : 'scale(1)',
      }}
    >
      <Box>
        <Image
          src="/credentis-logo.png"
          alt="Credentis"
          h={35}
          w="auto"
          fit="contain"
          style={{ filter: 'brightness(0) invert(1)' }}
        />
      </Box>
      <Box mt="xl">
        <Text size="xl" fw={700} c="white" lineClamp={2}>
          {title}
        </Text>
        {description && (
          <Text size="sm" c="white" opacity={0.8} mt="xs" lineClamp={2}>
            {description}
          </Text>
        )}
      </Box>
    </Paper>
  );
}
