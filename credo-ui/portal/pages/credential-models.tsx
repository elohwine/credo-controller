import { PRODUCT_NAME } from '@/utils/orgProfile'
import React, { useContext, useEffect, useState } from 'react';
import axios from 'axios';
import Head from 'next/head';
import { CredentialsContext, EnvContext } from '@/pages/_app';
import CredentialDefinitionList from '@/components/credentials/CredentialDefinitionList';
import { Alert, Badge, Button, Code, Divider, Group, Loader, Paper, Stack, Text, Title } from '@mantine/core';
import { IconAlertCircle, IconInfoCircle, IconRefresh } from '@tabler/icons-react';

interface CredentialDefinition {
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

export default function CredentialModelsPage() {
  const env = useContext(EnvContext);
  const [availableCredentials] = useContext(CredentialsContext);
  const [definitions, setDefinitions] = useState<CredentialDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDefinitions() {
      if (!env.NEXT_PUBLIC_VC_REPO) {
        console.log('Waiting for env to load...');
        return;
      }

      try {
        const credoBackend = env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000';
        const apiKey = process.env.NEXT_PUBLIC_CREDO_API_KEY || 'test-api-key-12345';

        // Get root token
        const rootTokenRes = await axios.post(
          `${credoBackend}/agent/token`,
          {},
          { headers: { Authorization: apiKey } }
        );
        const rootToken = rootTokenRes.data.token;

        // Get or create tenant
        let tenantId = localStorage.getItem('credoTenantId') || undefined;
        let tenantToken: string;

        if (!tenantId) {
          const createRes = await axios.post(
            `${credoBackend}/multi-tenancy/create-tenant`,
            {
              config: {
                label: 'Portal Tenant',
                connectionImageUrl: `${window.location.origin}/favicon.ico`,
              },
            },
            { headers: { Authorization: `Bearer ${rootToken}` } }
          );
          tenantId = createRes.data.tenantId;
          tenantToken = createRes.data.token;
          if (tenantId) localStorage.setItem('credoTenantId', tenantId);
        } else {
          const tokenRes = await axios.post(
            `${credoBackend}/multi-tenancy/get-token/${tenantId}`,
            {},
            { headers: { Authorization: `Bearer ${rootToken}` } }
          );
          tenantToken = tokenRes.data.token;
        }

        // Fetch credential definitions
        const response = await axios.get(`${credoBackend}/oidc/credential-definitions`, {
          headers: { Authorization: `Bearer ${tenantToken}` },
        });

        setDefinitions(response.data || []);
        setIsLoading(false);
      } catch (err: any) {
        console.error('Error fetching credential definitions:', err);
        setError(err.message || 'Failed to load credential definitions');
        setIsLoading(false);
      }
    }

    fetchDefinitions();
  }, [env]);

  return (
    <>
      <Head>
        <title>{`Record templates - ${PRODUCT_NAME} Portal`}</title>
        <meta name="description" content="Browse and manage record templates" />
      </Head>

      <Stack gap="lg" p={{ base: 'sm', sm: 'lg' }}>
        <Paper withBorder radius="md" p="lg">
          <Group justify="space-between" align="flex-start" gap="md">
            <div>
              <Title order={2}>Record templates</Title>
              <Text size="sm" c="dimmed" mt={4}>
                Browse and manage the templates used to create signed records, grouped by category
              </Text>
            </div>
            <Group gap="sm">
              <Badge variant="light" size="lg">
                {definitions.length} {definitions.length === 1 ? 'Template' : 'Templates'}
              </Badge>
              <Button
                variant="default"
                radius="xl"
                leftSection={<IconRefresh size={18} />}
                onClick={() => window.location.reload()}
              >
                Refresh
              </Button>
            </Group>
          </Group>
        </Paper>

        {isLoading && (
          <Group justify="center" py="xl" gap="md">
            <Loader size="lg" />
            <Text c="dimmed" size="lg">
              Loading record templates...
            </Text>
          </Group>
        )}

        {error && (
          <Alert color="red" variant="light" icon={<IconAlertCircle size={20} />} title="Error loading templates">
            {error}
          </Alert>
        )}

        {!isLoading && !error && <CredentialDefinitionList definitions={definitions || []} />}

        <Divider mt="xl" />
        <Alert color="blue" variant="light" icon={<IconInfoCircle size={20} />} title="Managing templates">
          <Stack gap="xs">
            <Text size="sm">
              To add more templates, run: <Code>yarn seed:models --apiKey test-api-key-12345</Code>
            </Text>
            <Text size="sm">
              Templates are kept separate for each organization and stored in SQLite. Supported types: Payment,
              Identity, Educational Badges, Health Records (mDoc &amp; EHR).
            </Text>
          </Stack>
        </Alert>
      </Stack>
    </>
  );
}
