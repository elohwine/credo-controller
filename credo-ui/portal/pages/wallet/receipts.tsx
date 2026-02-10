import React, { useState, useEffect, useContext } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import { EnvContext } from '@/pages/_app';
import axios from 'axios';
import {
    Container,
    Paper,
    Title,
    Text,
    Card,
    Group,
    Badge,
    Stack,
    Loader,
    Alert,
    Button,
    Accordion,
    ThemeIcon,
    Box,
    Divider,
} from '@mantine/core';
import {
    IconReceipt,
    IconFileInvoice,
    IconAlertCircle,
    IconRefresh,
    IconShieldCheck,
    IconCalendar,
    IconUser,
    IconCurrencyDollar,
} from '@tabler/icons-react';
import dayjs from 'dayjs';

interface Credential {
    id: string;
    type: string;
    issuerDid: string;
    addedOn: string;
    parsedDocument?: {
        credentialSubject?: Record<string, any>;
        issuer?: string | { id: string };
        issuanceDate?: string;
        expirationDate?: string;
        type?: string[];
    };
}

const BRAND = {
    curious: '#2188CA',
    dark: '#0A3D5C',
};

const getCredentialIcon = (type: string) => {
    if (type.toLowerCase().includes('receipt')) return IconReceipt;
    if (type.toLowerCase().includes('invoice')) return IconFileInvoice;
    return IconShieldCheck;
};

const getCredentialColor = (type: string) => {
    if (type.toLowerCase().includes('receipt')) return 'green';
    if (type.toLowerCase().includes('invoice')) return 'blue';
    return 'gray';
};

export default function MyReceiptsPage() {
    const router = useRouter();
    const env = useContext(EnvContext);
    const [credentials, setCredentials] = useState<Credential[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const holderBackend = env.NEXT_PUBLIC_HOLDER_URL || 'http://localhost:7000';

    const fetchCredentials = async () => {
        setLoading(true);
        setError(null);

        try {
            const tenantToken = localStorage.getItem('credoTenantToken') || localStorage.getItem('tenantToken');
            const walletId = localStorage.getItem('credoTenantId') || localStorage.getItem('tenantId');

            if (!tenantToken || !walletId) {
                setError('Please login to view your receipts');
                router.push('/auth/login?returnUrl=/wallet/receipts');
                return;
            }

            let sessionToken = tenantToken;
            try {
                const sessionRes = await axios.post(
                    `${holderBackend}/api/ssi/auth/session`,
                    { expiresInSeconds: 900 },
                    { headers: { Authorization: `Bearer ${tenantToken}` } }
                );
                if (sessionRes.data?.token) sessionToken = sessionRes.data.token;
            } catch (e) {
                // Fallback to long-lived tenant token
            }

            const response = await axios.get(`${holderBackend}/api/wallet/${walletId}/credentials/list?limit=50`, {
                headers: { Authorization: `Bearer ${sessionToken}` },
            });

            const items = response.data?.items || response.data || [];
            const normalized = Array.isArray(items)
                ? items.map((item: any) => ({
                    id: item.vc_id || item.id,
                    type: item.vc_type || item.type,
                    parsedDocument: item.parsedDocument || item.parsed_document,
                    issuerDid: item.issuerDid,
                    addedOn: item.issued_at || item.addedOn,
                    ...item
                }))
                : [];

            console.log('[Receipts] Fetched credentials:', normalized);
            setCredentials(normalized);
        } catch (err: any) {
            console.error('[Receipts] Error:', err);
            if (err.response?.status === 401) {
                setError('Session expired. Please login again.');
                router.push('/auth/login?returnUrl=/wallet/receipts');
            } else {
                setError(err.response?.data?.message || err.message || 'Failed to load credentials');
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (env.NEXT_PUBLIC_HOLDER_URL || env.NEXT_PUBLIC_VC_REPO) {
            fetchCredentials();
        }
    }, [env]);

    const receipts = credentials.filter((c) =>
        c.type?.toLowerCase().includes('receipt') ||
        c.parsedDocument?.type?.some((t: string) => t.toLowerCase().includes('receipt'))
    );

    const invoices = credentials.filter((c) =>
        c.type?.toLowerCase().includes('invoice') ||
        c.parsedDocument?.type?.some((t: string) => t.toLowerCase().includes('invoice'))
    );

    const otherCredentials = credentials.filter(
        (c) => !receipts.includes(c) && !invoices.includes(c)
    );

    const renderCredentialCard = (cred: Credential) => {
        const Icon = getCredentialIcon(cred.type);
        const color = getCredentialColor(cred.type);
        const subject = cred.parsedDocument?.credentialSubject || {};
        const issuer = typeof cred.parsedDocument?.issuer === 'string'
            ? cred.parsedDocument.issuer
            : cred.parsedDocument?.issuer?.id || cred.issuerDid;

        return (
            <Card key={cred.id} shadow="sm" p="lg" radius="md" withBorder mb="md">
                <Group justify="space-between" mb="xs">
                    <Group>
                        <ThemeIcon color={color} size="lg" radius="md">
                            <Icon size={20} />
                        </ThemeIcon>
                        <div>
                            <Text fw={600}>{cred.type}</Text>
                            <Text size="xs" c="dimmed">
                                {dayjs(cred.addedOn).format('MMM D, YYYY h:mm A')}
                            </Text>
                        </div>
                    </Group>
                    <Badge color={color} variant="light">
                        Verified
                    </Badge>
                </Group>

                <Divider my="sm" />

                <Stack gap="xs">
                    {subject.amount && (
                        <Group gap="xs">
                            <IconCurrencyDollar size={16} color={BRAND.curious} />
                            <Text size="sm">
                                <strong>Amount:</strong> {subject.currency || '$'}{subject.amount}
                            </Text>
                        </Group>
                    )}

                    {subject.transactionId && (
                        <Group gap="xs">
                            <IconReceipt size={16} color={BRAND.curious} />
                            <Text size="sm">
                                <strong>Transaction:</strong> {subject.transactionId}
                            </Text>
                        </Group>
                    )}

                    {subject.merchant && (
                        <Group gap="xs">
                            <IconUser size={16} color={BRAND.curious} />
                            <Text size="sm">
                                <strong>Merchant:</strong> {subject.merchant}
                            </Text>
                        </Group>
                    )}

                    {cred.parsedDocument?.issuanceDate && (
                        <Group gap="xs">
                            <IconCalendar size={16} color={BRAND.curious} />
                            <Text size="sm">
                                <strong>Issued:</strong> {dayjs(cred.parsedDocument.issuanceDate).format('MMM D, YYYY')}
                            </Text>
                        </Group>
                    )}
                </Stack>

                <Accordion mt="md" variant="contained">
                    <Accordion.Item value="details">
                        <Accordion.Control>View Full Details</Accordion.Control>
                        <Accordion.Panel>
                            <Box
                                style={{
                                    backgroundColor: '#f8f9fa',
                                    padding: '12px',
                                    borderRadius: '8px',
                                    fontSize: '12px',
                                    fontFamily: 'monospace',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-all',
                                }}
                            >
                                {JSON.stringify(subject, null, 2)}
                            </Box>
                            <Text size="xs" c="dimmed" mt="sm">
                                Issuer: {issuer}
                            </Text>
                        </Accordion.Panel>
                    </Accordion.Item>
                </Accordion>
            </Card>
        );
    };

    return (
        <Layout title="My Receipts">
            <Container size="md" py="xl">
                <Group justify="space-between" mb="xl">
                    <div>
                        <Title order={2} style={{ color: BRAND.dark }}>
                            <IconReceipt size={28} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                            My Receipts &amp; Credentials
                        </Title>
                        <Text c="dimmed" size="sm">
                            View your verified receipts and invoices
                        </Text>
                    </div>
                    <Button
                        leftSection={<IconRefresh size={16} />}
                        variant="light"
                        onClick={fetchCredentials}
                        loading={loading}
                    >
                        Refresh
                    </Button>
                </Group>

                {loading && (
                    <Paper p="xl" ta="center">
                        <Loader size="lg" />
                        <Text mt="md" c="dimmed">Loading your credentials...</Text>
                    </Paper>
                )}

                {error && (
                    <Alert icon={<IconAlertCircle size={16} />} title="Error" color="red" mb="lg">
                        {error}
                    </Alert>
                )}

                {!loading && !error && credentials.length === 0 && (
                    <Paper p="xl" ta="center" withBorder>
                        <IconReceipt size={48} color="#adb5bd" />
                        <Text mt="md" c="dimmed">No credentials yet</Text>
                        <Text size="sm" c="dimmed" mb="lg">
                            Make a purchase to receive your first receipt
                        </Text>
                        <Button onClick={() => router.push('/shop')}>Go to Shop</Button>
                    </Paper>
                )}

                {!loading && receipts.length > 0 && (
                    <Box mb="xl">
                        <Title order={4} mb="md" c="dimmed" tt="uppercase" size="sm" fw={700}>
                            🧾 Payment Receipts ({receipts.length})
                        </Title>
                        {receipts.map(renderCredentialCard)}
                    </Box>
                )}

                {!loading && invoices.length > 0 && (
                    <Box mb="xl">
                        <Title order={4} mb="md" c="dimmed" tt="uppercase" size="sm" fw={700}>
                            📄 Invoices ({invoices.length})
                        </Title>
                        {invoices.map(renderCredentialCard)}
                    </Box>
                )}

                {!loading && otherCredentials.length > 0 && (
                    <Box mb="xl">
                        <Title order={4} mb="md" c="dimmed" tt="uppercase" size="sm" fw={700}>
                            🔐 Other Credentials ({otherCredentials.length})
                        </Title>
                        {otherCredentials.map(renderCredentialCard)}
                    </Box>
                )}
            </Container>
        </Layout>
    );
}
