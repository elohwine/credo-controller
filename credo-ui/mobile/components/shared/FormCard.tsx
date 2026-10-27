import React from 'react';
import { Box, Group, Paper, Stack, Text } from '@mantine/core';

/**
 * A creation form drawn as a branded card: the same Credentis header as the credential tiles,
 * with the inputs on a plain surface underneath. Twin: `credo-ui/portal/components/shared/FormCard.tsx`.
 */
interface FormCardProps {
  title: string;
  subtitle?: string;
  /** Who the form is for or from, e.g. the active organisation. */
  issuer?: string;
  icon?: React.ReactNode;
  /** The submit and cancel buttons, aligned at the bottom of the card. */
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export default function FormCard({ title, subtitle, issuer, icon, actions, children }: FormCardProps) {
  return (
    <Paper radius="lg" withBorder style={{ overflow: 'hidden' }}>
      <Box
        p="lg"
        style={{
          background:
            'linear-gradient(135deg, var(--mantine-color-credentis-5) 0%, var(--mantine-color-credentis-7) 100%)',
          color: 'var(--mantine-color-white)',
        }}
      >
        {(icon || issuer) && (
          <Group gap="xs" mb="sm" wrap="nowrap">
            {icon}
            {issuer && (
              <Text size="sm" fw={500} c="white" opacity={0.9} lineClamp={1}>
                {issuer}
              </Text>
            )}
          </Group>
        )}
        <Text size="lg" fw={500} c="white" lineClamp={2}>
          {title}
        </Text>
        {subtitle && (
          <Text size="sm" c="white" opacity={0.85} mt={4}>
            {subtitle}
          </Text>
        )}
      </Box>
      <Stack gap="sm" p="lg">
        {children}
        {actions && (
          <Group justify="flex-end" gap="sm" mt="xs">
            {actions}
          </Group>
        )}
      </Stack>
    </Paper>
  );
}
