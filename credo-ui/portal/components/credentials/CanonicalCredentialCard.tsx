/**
 * Canonical Verifiable Credential Card Templates
 * 
 * Based on the mockup designs provided. These are the ONLY credential card
 * designs used in the portal - consistent, professional, trust-worthy.
 * 
 * Architecture:
 * - Mantine: Paper, Text, Group, Stack for structure
 * - Glass: .glass-credential for trust surface
 * - Credentis branding: Logo, colors, typography
 * 
 * Variants: Identity, Diploma, Invoice, Quote
 */

import React from 'react';
import { Paper, Text, Group, Stack, Badge, Divider, Image, Box } from '@mantine/core';

export type CredentialVariant = 'Identity' | 'Diploma' | 'Invoice' | 'Quote';

export interface VerifiableCredential {
  '@context'?: unknown;
  id?: string;
  type?: string[] | string;
  issuer?: string | { id?: string; name?: string };
  holder?: string | { id?: string; name?: string };
  issuanceDate?: string;
  expirationDate?: string;
  claims?: Record<string, unknown>;
  credentialSubject?: Record<string, unknown> & { id?: string };
  credentialSchema?: unknown;
  credentialStatus?: unknown;
  proof?: unknown;
}

// Base credential card structure matching the mockups
interface BaseCredentialProps {
  holderName: string;
  issuer: string;
  issuedDate: string;
  verified?: boolean;
}

interface IdentityCredentialProps extends BaseCredentialProps {
  variant: 'Identity';
  data: {
    dateOfBirth: string;
    nationality: string;
    credentialId: string;
  };
}

interface DiplomaCredentialProps extends BaseCredentialProps {
  variant: 'Diploma';
  data: {
    degree: string;
    honours: string;
    graduationDate: string;
  };
}

interface InvoiceCredentialProps extends BaseCredentialProps {
  variant: 'Invoice';
  data: {
    items: Array<{ description: string; amount: string }>;
    total: string;
  };
}

interface QuoteCredentialProps extends BaseCredentialProps {
  variant: 'Quote';
  data: {
    items: Array<{ description: string; amount: string }>;
    total: string;
  };
}

type CredentialCardProps =
  | IdentityCredentialProps
  | DiplomaCredentialProps
  | InvoiceCredentialProps
  | QuoteCredentialProps;

export function CanonicalCredentialCard(props: CredentialCardProps) {
  const { holderName, issuer, issuedDate, verified = true } = props;

  // Card badge type based on variant
  const badgeText = props.variant === 'Invoice' ? 'Invoice' :
                    props.variant === 'Quote' ? 'Quote' :
                    props.variant === 'Diploma' ? 'Diploma' :
                    'Identity';

  return (
    <Paper
      className="glass-credential"
      radius="lg"
      p={0}
      style={{
        width: '100%',
        maxWidth: 400,
        overflow: 'hidden',
      }}
    >
      {/* Header with logo and verified badge */}
      <Box p="md" pb="sm">
        <Group justify="space-between" align="center">
          <Group gap="sm">
            <Image
              src="/credentis-logo.png"
              alt="Credentis"
              w={40}
              h={40}
              fit="contain"
            />
            <Text fw={600} size="md" c="dark.7">
              Credentis
            </Text>
          </Group>
          {verified && (
            <Badge
              variant="outline"
              color="blue"
              radius="sm"
              size="sm"
              style={{ color: 'var(--mantine-color-credentis-6)' }}
            >
              Verified
            </Badge>
          )}
        </Group>
      </Box>

      {/* Main content area */}
      <Stack gap="md" p="md" pt={0}>
        {/* Credential type and holder name */}
        <div>
          <Text size="xl" fw={700} c="dark.8" mb={4}>
            {props.variant} Credential
          </Text>
          <Text size="md" fw={600} c="dark.7">
            {holderName}
          </Text>
          <Text size="sm" c="dimmed">
            Issued {issuedDate} · {issuer}
          </Text>
        </div>

        {/* Type badge */}
        <Group>
          <Badge
            variant="light"
            color="blue"
            size="lg"
            radius="sm"
            style={{
              backgroundColor: 'var(--mantine-color-credentis-1)',
              color: 'var(--mantine-color-credentis-7)',
            }}
          >
            {badgeText}
          </Badge>
        </Group>

        <Divider />

        {/* Variant-specific content */}
        {props.variant === 'Identity' && (
          <Stack gap="xs">
            <Group justify="space-between">
              <Text size="sm" c="dimmed">Date of Birth</Text>
              <Text size="sm" fw={500}>{props.data.dateOfBirth}</Text>
            </Group>
            <Group justify="space-between">
              <Text size="sm" c="dimmed">Nationality</Text>
              <Text size="sm" fw={500}>{props.data.nationality}</Text>
            </Group>
            <Group justify="space-between">
              <Text size="sm" c="dimmed">Credential ID</Text>
              <Text size="sm" fw={500} ff="mono" style={{ fontSize: '0.85rem' }}>
                {props.data.credentialId}
              </Text>
            </Group>
          </Stack>
        )}

        {props.variant === 'Diploma' && (
          <Stack gap="xs">
            <Group justify="space-between">
              <Text size="sm" c="dimmed">Degree</Text>
              <Text size="sm" fw={500}>{props.data.degree}</Text>
            </Group>
            <Group justify="space-between">
              <Text size="sm" c="dimmed">Honours</Text>
              <Text size="sm" fw={500}>{props.data.honours}</Text>
            </Group>
            <Group justify="space-between">
              <Text size="sm" c="dimmed">Graduated</Text>
              <Text size="sm" fw={500}>{props.data.graduationDate}</Text>
            </Group>
          </Stack>
        )}

        {(props.variant === 'Invoice' || props.variant === 'Quote') && (
          <Stack gap="xs">
            <Group justify="space-between" mb="xs">
              <Text size="sm" fw={600} c="dimmed">Description</Text>
              <Text size="sm" fw={600} c="dimmed">Amount</Text>
            </Group>
            {props.data.items.map((item, idx) => (
              <Group key={idx} justify="space-between">
                <Text size="sm">{item.description}</Text>
                <Text size="sm" fw={500}>{item.amount}</Text>
              </Group>
            ))}
            <Divider my="xs" />
            <Group justify="space-between">
              <Text size="sm" fw={700}>Total</Text>
              <Text size="lg" fw={700} c="credentis.6">{props.data.total}</Text>
            </Group>
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}

// Export named variant components for convenience
export function IdentityCredentialCard(props: Omit<IdentityCredentialProps, 'variant'>) {
  return <CanonicalCredentialCard {...props} variant="Identity" />;
}

export function DiplomaCredentialCard(props: Omit<DiplomaCredentialProps, 'variant'>) {
  return <CanonicalCredentialCard {...props} variant="Diploma" />;
}

export function InvoiceCredentialCard(props: Omit<InvoiceCredentialProps, 'variant'>) {
  return <CanonicalCredentialCard {...props} variant="Invoice" />;
}

export function QuoteCredentialCard(props: Omit<QuoteCredentialProps, 'variant'>) {
  return <CanonicalCredentialCard {...props} variant="Quote" />;
}

export default CanonicalCredentialCard;
