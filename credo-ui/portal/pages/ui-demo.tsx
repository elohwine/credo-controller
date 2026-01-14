/**
 * UI Components Demo
 * 
 * Showcases canonical Credentis credential cards matching the mockup designs
 * and demonstrates the 4-layer architecture:
 * 1. Mantine Theme (tokens, colors)
 * 2. Mantine Components (structure)
 * 3. Glassmorphism CSS (trust surfaces)
 * 4. React Bits (animations - optional)
 */

import React from 'react';
import {
  Container,
  Title,
  Text,
  SimpleGrid,
  Divider,
  Box,
  Stack,
  Code,
  Paper,
} from '@mantine/core';
import {
  CanonicalCredentialCard,
  IdentityCredentialCard,
  DiplomaCredentialCard,
  InvoiceCredentialCard,
  QuoteCredentialCard,
} from '@/components/credentials/CanonicalCredentialCard';

export default function UIDemo() {
  // Sample credential data matching the mockups
  const identityCredential = {
    holderName: 'Jane Doe',
    issuer: 'City Registry',
    issuedDate: '2025-11-01',
    verified: true,
    data: {
      dateOfBirth: '1990-01-01',
      nationality: 'Zimbabwe',
      credentialId: 'vc:1234',
    },
  };

  const diplomaCredential = {
    holderName: 'Jane Doe',
    issuer: 'State University',
    issuedDate: '2024-07-15',
    verified: true,
    data: {
      degree: 'B.Sc. Computer Science',
      honours: 'First Class',
      graduationDate: '2024-07-15',
    },
  };

  const invoiceCredential = {
    holderName: 'Jane Doe',
    issuer: 'Acme Supplies Ltd',
    issuedDate: '2026-01-02',
    verified: true,
    data: {
      items: [
        { description: 'Widget A', amount: '$50.00' },
        { description: 'Widget B', amount: '$30.00' },
      ],
      total: '$80.00',
    },
  };

  const quoteCredential = {
    holderName: 'Jane Doe',
    issuer: 'Acme Builders',
    issuedDate: '2026-01-02',
    verified: true,
    data: {
      items: [
        { description: 'Site survey', amount: '$200.00' },
        { description: 'Mobilization', amount: '$350.00' },
      ],
      total: '$550.00',
    },
  };

  return (
    <div className="min-h-screen bg-white">
      <Container size="xl" py="xl">
        <Stack gap="xl">
          {/* Header */}
          <Box ta="center" py="xl">
            <img
              src="/credentis-logo.png"
              alt="Credentis"
              style={{ height: 64, width: 'auto', margin: '0 auto 16px' }}
            />
            <Title order={1} c="dark.8" mb="sm">
              Credentis Credential Cards
            </Title>
            <Text size="lg" c="dimmed" maw={700} mx="auto">
              Canonical credential display components using Mantine structure with glassmorphism
              trust surfaces and Credentis branding. These match the official mockup designs.
            </Text>
          </Box>

          <Divider label="Canonical Credential Cards" labelPosition="center" />

          {/* Credential cards grid - matching your mockups */}
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="lg">
            <IdentityCredentialCard {...identityCredential} />
            <DiplomaCredentialCard {...diplomaCredential} />
            <InvoiceCredentialCard {...invoiceCredential} />
            <QuoteCredentialCard {...quoteCredential} />
          </SimpleGrid>

          <Divider my="xl" />

          {/* Usage documentation */}
          <Box>
            <Title order={3} mb="md">
              Usage
            </Title>
            <Paper p="lg" radius="md" withBorder>
              <Stack gap="md">
                <div>
                  <Text size="sm" fw={600} mb="xs">
                    Import the components:
                  </Text>
                  <Code block style={{ fontSize: '0.85rem' }}>
                    {`import {
  IdentityCredentialCard,
  DiplomaCredentialCard,
  InvoiceCredentialCard,
  QuoteCredentialCard,
} from '@/components/credentials/CanonicalCredentialCard';`}
                  </Code>
                </div>

                <div>
                  <Text size="sm" fw={600} mb="xs">
                    Use in your pages:
                  </Text>
                  <Code block style={{ fontSize: '0.85rem' }}>
                    {`<IdentityCredentialCard
  holderName="Jane Doe"
  issuer="City Registry"
  issuedDate="2025-11-01"
  verified={true}
  data={{
    dateOfBirth: "1990-01-01",
    nationality: "Zimbabwe",
    credentialId: "vc:1234"
  }}
/>`}
                  </Code>
                </div>

                <Divider />

                <div>
                  <Title order={4} mb="xs">
                    Architecture Layers
                  </Title>
                  <Stack gap="xs">
                    <Text size="sm">
                      <strong>1. Mantine Theme:</strong> Credentis colors (#2188CA, #D0E6F3,
                      #6FB4DC, #88C4E3), typography, spacing
                    </Text>
                    <Text size="sm">
                      <strong>2. Mantine Components:</strong> Paper, Text, Group, Stack, Badge,
                      Divider provide structure
                    </Text>
                    <Text size="sm">
                      <strong>3. Glassmorphism:</strong> <Code>.glass-credential</Code> CSS class
                      for trust surface effect
                    </Text>
                    <Text size="sm">
                      <strong>4. Branding:</strong> Credentis logo ({' '}
                      <Code>/credentis-logo.png</Code>) in header
                    </Text>
                  </Stack>
                </div>

                <Divider />

                <div>
                  <Title order={4} mb="xs">
                    PDF Generation
                  </Title>
                  <Text size="sm" mb="xs">
                    For Invoice and Quote credentials, use the PDF template mappers in{' '}
                    <Code>lib/vcToPdfTemplates.ts</Code>:
                  </Text>
                  <Code block style={{ fontSize: '0.85rem' }}>
                    {`import { renderInvoiceHtml } from '@/lib/vcToPdfTemplates';
import puppeteer from 'puppeteer';

// Server-side only (issuer backend)
const html = renderInvoiceHtml(vcJson);
const browser = await puppeteer.launch();
const page = await browser.newPage();
await page.setContent(html);
const pdf = await page.pdf({ format: 'A4' });
await browser.close();`}
                  </Code>
                </div>
              </Stack>
            </Paper>
          </Box>

          <Divider my="xl" />

          {/* Design rules */}
          <Paper
            p="lg"
            radius="md"
            style={{
              backgroundColor: 'var(--mantine-color-credentis-0)',
              borderLeft: '4px solid var(--mantine-color-credentis-6)',
            }}
          >
            <Title order={4} mb="md">
              Design Rules
            </Title>
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
              <Box>
                <Text size="sm" fw={600} c="green.7" mb="xs">
                  ✓ DO
                </Text>
                <Stack gap={4}>
                  <Text size="sm">Use these canonical cards for all credential displays</Text>
                  <Text size="sm">Apply glass effect only on trust surfaces (credentials)</Text>
                  <Text size="sm">Use Mantine components for all structural UI</Text>
                  <Text size="sm">Keep Credentis colors consistent (#2188CA primary)</Text>
                </Stack>
              </Box>
              <Box>
                <Text size="sm" fw={600} c="red.7" mb="xs">
                  ✗ DON'T
                </Text>
                <Stack gap={4}>
                  <Text size="sm">Create custom credential card designs</Text>
                  <Text size="sm">Use glass effect on forms, inputs, or data tables</Text>
                  <Text size="sm">Mix Tailwind classes with Mantine components</Text>
                  <Text size="sm">Use colors outside the Credentis palette</Text>
                </Stack>
              </Box>
            </SimpleGrid>
          </Paper>
        </Stack>
      </Container>
    </div>
  );
}
