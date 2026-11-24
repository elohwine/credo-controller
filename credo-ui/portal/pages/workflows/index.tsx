import React, { useContext, useEffect, useState } from 'react';
import axios from 'axios';
import { EnvContext } from '@/pages/_app';
import Layout from '@/components/Layout';
import WorkflowList from '@/components/workflows/WorkflowList';
import DynamicForm from '@/components/workflows/DynamicForm';
import CredentialOfferCard from '@/components/credential/CredentialOfferCard';
import { Alert, Box, Button, Center, Group, Loader, Paper, SimpleGrid, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import {
  IconAlertCircle,
  IconArrowLeft,
  IconCalculator,
  IconCategory,
  IconCircleCheck,
  IconPlayerPlay,
  IconRefresh,
  IconSettings,
} from '@tabler/icons-react';
import { StatTile } from '../../../shared/StatTile';

export default function WorkflowsPage() {
    const env = useContext(EnvContext);
    const [workflows, setWorkflows] = useState<any[]>([]);
    const [selectedWorkflow, setSelectedWorkflow] = useState<any | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isExecuting, setIsExecuting] = useState(false);
    const [result, setResult] = useState<any | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchWorkflows() {
            if (!env.NEXT_PUBLIC_VC_REPO) return;

            try {
                const credoBackend = env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000';
                const apiKey = process.env.NEXT_PUBLIC_CREDO_API_KEY || 'test-api-key-12345';

                let rootToken = '';
                try {
                    // Get root token (simplified auth for demo)
                    const rootTokenRes = await axios.post(
                        `${credoBackend}/agent/token`,
                        {},
                        { headers: { Authorization: apiKey } }
                    );
                    rootToken = rootTokenRes.data.token;
                } catch (e) {
                    console.warn('Failed to get root token for workflows, trying public access...', e);
                }

                // Fetch workflows
                const headers: any = {};
                if (rootToken) {
                    headers.Authorization = `Bearer ${rootToken}`;
                }

                const response = await axios.get(`${credoBackend}/workflows`, {
                    headers
                });

                setWorkflows(response.data || []);
                setIsLoading(false);
            } catch (err: any) {
                console.error('Error fetching workflows:', err);
                setError(err.message || 'Failed to load workflows');
                setIsLoading(false);
            }
        }

        fetchWorkflows();
    }, [env]);

    const handleExecute = async (data: any) => {
        setIsExecuting(true);
        setResult(null);
        setError(null);

        try {
            const credoBackend = env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000';
            const apiKey = process.env.NEXT_PUBLIC_CREDO_API_KEY || 'test-api-key-12345';

            // Re-auth (should be centralized in real app)
            const rootTokenRes = await axios.post(
                `${credoBackend}/agent/token`,
                {},
                { headers: { Authorization: apiKey } }
            );
            const rootToken = rootTokenRes.data.token;

            const response = await axios.post(
                `${credoBackend}/workflows/${selectedWorkflow.id}/execute`,
                data,
                { headers: { Authorization: `Bearer ${rootToken}` } }
            );

            setResult(response.data);
        } catch (err: any) {
            console.error('Error executing workflow:', err);
            setError(err.response?.data?.error || err.message || 'Execution failed');
        } finally {
            setIsExecuting(false);
        }
    };

    return (
        <Layout title="Workflows">
            <Stack gap="lg" p={{ base: 'sm', sm: 'lg' }}>
                {/* Header */}
                <div>
                    <Title order={2}>Workflows</Title>
                    <Text size="sm" c="dimmed" mt={4}>Run automated business processes and share the results</Text>
                </div>

                {/* Stats */}
                <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
                    <StatTile label="Available Workflows" value={workflows.length} icon={IconSettings} />
                    <StatTile label="Active" value={workflows.filter(w => w.status === 'active').length} icon={IconPlayerPlay} />
                    <StatTile label="Categories" value={[...new Set(workflows.map(w => w.category || 'General'))].length} icon={IconCategory} />
                </SimpleGrid>

                {isLoading ? (
                    <Stack align="center" gap="sm" py="xl">
                        <Loader size="md" />
                        <Text c="dimmed">Loading workflows...</Text>
                    </Stack>
                ) : selectedWorkflow ? (
                    <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
                        {/* Workflow Header */}
                        <Group
                            justify="space-between"
                            wrap="wrap"
                            gap="sm"
                            px="lg"
                            py="md"
                            bg="var(--mantine-color-default-hover)"
                            style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
                        >
                            <Group gap="sm" wrap="nowrap">
                                <Box c="dimmed" style={{ display: 'flex' }}><IconSettings size={22} /></Box>
                                <div>
                                    <Title order={3}>{selectedWorkflow.name}</Title>
                                    <Text size="sm" c="dimmed">{selectedWorkflow.description}</Text>
                                </div>
                            </Group>
                            <Button
                                variant="default"
                                leftSection={<IconArrowLeft size={16} />}
                                onClick={() => { setSelectedWorkflow(null); setResult(null); setError(null); }}
                            >
                                Back to List
                            </Button>
                        </Group>

                        <Box p="lg">
                            {!result ? (
                                <DynamicForm
                                    schema={selectedWorkflow.inputSchema}
                                    onSubmit={handleExecute}
                                    isLoading={isExecuting}
                                />
                            ) : (
                                <Stack align="center" gap="md">
                                    <ThemeIcon size={56} radius="xl" variant="light" color="success">
                                        <IconCircleCheck size={30} />
                                    </ThemeIcon>
                                    <Title order={4}>Workflow completed</Title>

                                    {result.offer && (
                                        <CredentialOfferCard
                                            offerUri={result.offer.credential_offer_uri || result.offer.credentialOffer}
                                            deepLink={result.offer.credential_offer_deeplink}
                                            credentialType={result.offer.credentialType || selectedWorkflow.name}
                                            claims={result.offer.claims}
                                            financeResult={result.finance}
                                        />
                                    )}

                                    {/* Finance result without offer (calculation only) */}
                                    {!result.offer && result.finance && (
                                        <Paper withBorder radius="md" maw={448} w="100%" style={{ overflow: 'hidden' }}>
                                            <Group gap="xs" px="md" py="sm" bg="var(--mantine-color-default-hover)">
                                                <Box c="dimmed" style={{ display: 'flex' }}><IconCalculator size={18} /></Box>
                                                <Text fw={600}>Calculation Result</Text>
                                            </Group>
                                            <Stack gap="xs" p="lg">
                                                <Group justify="space-between">
                                                    <Text size="sm" c="dimmed">Subtotal:</Text>
                                                    <Text size="sm" ff="monospace">{result.finance.subtotal}</Text>
                                                </Group>
                                                <Group justify="space-between">
                                                    <Text size="sm" c="dimmed">Tax:</Text>
                                                    <Text size="sm" ff="monospace">{result.finance.taxAmount}</Text>
                                                </Group>
                                                <Group justify="space-between" pt="xs" style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
                                                    <Text size="sm" fw={700}>Total:</Text>
                                                    <Text size="sm" fw={700} ff="monospace">{result.finance.grandTotal}</Text>
                                                </Group>
                                            </Stack>
                                        </Paper>
                                    )}

                                    <Center mt="sm">
                                        <Button leftSection={<IconRefresh size={16} />} onClick={() => setResult(null)}>
                                            Run Again
                                        </Button>
                                    </Center>
                                </Stack>
                            )}

                            {error && (
                                <Alert mt="lg" color="red" variant="light" icon={<IconAlertCircle size={18} />}>
                                    {error}
                                </Alert>
                            )}
                        </Box>
                    </Paper>
                ) : (
                    <WorkflowList workflows={workflows} onSelect={setSelectedWorkflow} />
                )}
            </Stack>
        </Layout>
    );
}
