import React from 'react';
import { Badge, Box, Card, Code, Group, Paper, SimpleGrid, Stack, Text, ThemeIcon, Title } from '@mantine/core';

export interface CredentialDefinition {
  credentialDefinitionId: string;
  name: string;
  version: string;
  schemaId: string;
  issuerDid: string;
  credentialType: string[];
  format: string;
  claimsTemplate: Record<string, any>;
  createdAt: string;
}

interface CredentialDefinitionListProps {
  definitions: CredentialDefinition[];
}

// Group definitions by primary credential type
const groupByType = (defs: CredentialDefinition[]) => {
  const groups: Record<string, CredentialDefinition[]> = {};
  
  // Safety check: ensure defs is an array
  if (!Array.isArray(defs)) {
    console.warn('Expected definitions to be an array, received:', typeof defs);
    return groups;
  }
  
  defs.forEach(def => {
    // Use the last credentialType (most specific) as the group key
    const typeKey = def.credentialType[def.credentialType.length - 1] || 'Unknown';
    if (!groups[typeKey]) {
      groups[typeKey] = [];
    }
    groups[typeKey].push(def);
  });
  
  return groups;
};

// Map credential types to display names and theme colours
const typeMetadata: Record<string, { label: string; color: string }> = {
  PaymentReceipt: { label: '💳 Payment & Transaction', color: 'green' },
  GenericIDCredential: { label: '🆔 Identity Documents', color: 'blue' },
  OpenBadge: { label: '🏅 Educational Badges', color: 'yellow' },
  MdocHealthSummary: { label: '🏥 mDoc Health Records', color: 'red' },
  EHRSummary: { label: '⚕️ EHR Clinical Data', color: 'orange' },
};

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Group gap="xs" align="flex-start" wrap="nowrap">
      <Text size="sm" fw={600} miw={80}>
        {label}
      </Text>
      {children}
    </Group>
  );
}

const CredentialDefinitionList: React.FC<CredentialDefinitionListProps> = ({ definitions = [] }) => {
  const grouped = groupByType(definitions || []);

  if (!definitions || definitions.length === 0) {
    return (
      <Paper
        radius="md"
        py={48}
        ta="center"
        bg="var(--mantine-color-default-hover)"
        style={{ border: '2px dashed var(--mantine-color-default-border)' }}
      >
        <Text size="lg" c="dimmed">No record templates available.</Text>
        <Text size="sm" c="dimmed" mt="xs">
          Add templates with: <Code>yarn seed:models</Code>
        </Text>
      </Paper>
    );
  }

  return (
    <Stack gap="xl">
      {Object.entries(grouped).map(([type, defs]) => {
        const meta = typeMetadata[type] || { label: type, color: 'gray' };

        return (
          <Stack key={type} gap="md">
            {/* Group Header */}
            <Group gap="sm" pb="xs" style={{ borderBottom: '2px solid var(--mantine-color-default-border)' }}>
              <ThemeIcon variant="light" color={meta.color} size={40} radius="xl" fw={700}>
                {defs.length}
              </ThemeIcon>
              <Title order={2} size="h3">
                {meta.label}
              </Title>
            </Group>

            {/* Template Cards */}
            <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="md">
              {defs.map(def => (
                <Card
                  key={def.credentialDefinitionId}
                  withBorder
                  radius="md"
                  padding="lg"
                  shadow="sm"
                  style={{ borderColor: `var(--mantine-color-${meta.color}-outline)`, borderWidth: 2 }}
                >
                  {/* Card Header */}
                  <Group justify="space-between" align="flex-start" wrap="nowrap" mb="sm">
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <Title order={3} size="h4" lineClamp={1} title={def.name}>
                        {def.name}
                      </Title>
                      <Text size="sm" c="dimmed">v{def.version}</Text>
                    </div>
                    <Badge variant="default" size="sm">
                      {def.format}
                    </Badge>
                  </Group>

                  {/* Metadata */}
                  <Stack gap="xs">
                    <MetaRow label="Template:">
                      <Text size="xs" ff="monospace" c="dimmed" style={{ wordBreak: 'break-all' }} title={def.schemaId}>
                        {def.schemaId.substring(0, 20)}...
                      </Text>
                    </MetaRow>

                    <MetaRow label="Issued by:">
                      <Text size="xs" ff="monospace" c="dimmed" style={{ wordBreak: 'break-all' }} title={def.issuerDid}>
                        {def.issuerDid.substring(0, 25)}...
                      </Text>
                    </MetaRow>

                    <MetaRow label="Types:">
                      <Group gap={4}>
                        {def.credentialType.map((t, idx) => (
                          <Badge key={idx} variant="default" size="xs" radius="sm" tt="none">
                            {t}
                          </Badge>
                        ))}
                      </Group>
                    </MetaRow>

                    {/* Fields Preview */}
                    <Box component="details" mt="xs">
                      <Text component="summary" size="xs" fw={600} c="blue" style={{ cursor: 'pointer' }}>
                        View fields ({Object.keys(def.claimsTemplate || {}).length} fields)
                      </Text>
                      <Code block mt="xs" style={{ overflowX: 'auto' }}>
                        {JSON.stringify(def.claimsTemplate, null, 2)}
                      </Code>
                    </Box>
                  </Stack>

                  {/* Footer Timestamp */}
                  <Text
                    size="xs"
                    c="dimmed"
                    mt="md"
                    pt="sm"
                    style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}
                  >
                    Created: {new Date(def.createdAt).toLocaleString()}
                  </Text>
                </Card>
              ))}
            </SimpleGrid>
          </Stack>
        );
      })}
    </Stack>
  );
};

export default CredentialDefinitionList;
