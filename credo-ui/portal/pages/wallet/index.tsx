import React, { useState, useContext, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import { EnvContext } from '@/pages/_app';
import {
    Container,
    Paper,
    Title,
    Text,
    Card,
    Group,
    Stack,
    Badge,
    Button,
    Loader,
    Alert,
    SimpleGrid,
    Box,
    Divider,
    ActionIcon,
    Menu,
    Modal,
    ScrollArea,
    Code,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
    IconWallet,
    IconReceipt,
    IconFileInvoice,
    IconCertificate,
    IconLogout,
    IconRefresh,
    IconDotsVertical,
    IconEye,
    IconDownload,
    IconShieldCheck,
    IconAlertCircle,
    IconShoppingCart,
    IconUser,
    IconBrandWhatsapp,
} from '@tabler/icons-react';
import axios from 'axios';

interface WalletCredential {
    id: string;
    type: string;
    issuerDid: string;
    addedOn: string;
    parsedDocument?: {
        credentialSubject?: Record<string, any>;
        issuer?: string | { id: string };
        issuanceDate?: string;
        type?: string[];
    };
}

const CREDENTIAL_ICONS: Record<string, React.ReactNode> = {
    PaymentReceiptVC: <IconReceipt size={24} />,
    PaymentReceipt: <IconReceipt size={24} />,
    InvoiceVC: <IconFileInvoice size={24} />,
    Invoice: <IconFileInvoice size={24} />,
    GenericID: <IconCertificate size={24} />,
    GenericIDCredential: <IconCertificate size={24} />,
    VerifiableCredential: <IconCertificate size={24} />,
};

const CREDENTIAL_COLORS: Record<string, string> = {
    PaymentReceiptVC: 'green',
    PaymentReceipt: 'green',
    InvoiceVC: 'blue',
    Invoice: 'blue',
    GenericID: 'violet',
    GenericIDCredential: 'violet',
};

function formatCredentialType(type: string): string {
    return type
        .replace(/VC$/, '')
        .replace(/Credential$/, '')
        .replace(/([A-Z])/g, ' $1')
        .trim();
}

function CredentialCard({ credential, onView }: { credential: WalletCredential; onView: () => void }) {
    const displayType = formatCredentialType(credential.type);
    const color = CREDENTIAL_COLORS[credential.type] || 'gray';
    const icon = CREDENTIAL_ICONS[credential.type] || <IconCertificate size={24} />;

    const subject = credential.parsedDocument?.credentialSubject || {};
    const issuer = typeof credential.parsedDocument?.issuer === 'string'
        ? credential.parsedDocument.issuer
        : credential.parsedDocument?.issuer?.id || credential.issuerDid;

    // Extract key display fields based on credential type
    let displayFields: { label: string; value: string }[] = [];

    if (credential.type.includes('Receipt') || credential.type.includes('Payment')) {
        displayFields = [
            { label: 'Amount', value: subject.amount || subject.totalAmount || '-' },
            { label: 'Merchant', value: subject.merchantName || subject.merchant || '-' },
            { label: 'Date', value: subject.paymentDate || subject.timestamp || credential.addedOn?.split('T')[0] || '-' },
        ];
    } else if (credential.type.includes('Invoice')) {
        displayFields = [
            { label: 'Total', value: subject.total || subject.amount || '-' },
            { label: 'Cart ID', value: subject.cartId?.slice(0, 12) || '-' },
            { label: 'Status', value: subject.status || 'issued' },
        ];
    } else {
        displayFields = [
            { label: 'Name', value: subject.name || subject.username || '-' },
            { label: 'Email', value: subject.email || '-' },
        ];
    }

    return (
        <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Card.Section withBorder inheritPadding py="xs">
                <Group justify="space-between">
                    <Group>
                        <Box c={color}>{icon}</Box>
                        <div>
                            <Text fw={600}>{displayType}</Text>
                            <Text size="xs" c="dimmed">
                                {new Date(credential.addedOn).toLocaleDateString()}
                            </Text>
                        </div>
                    </Group>
                    <Badge color={color} variant="light">
                        ✓ Authentic
                    </Badge>
                </Group>
            </Card.Section>

            <Stack gap="xs" mt="md">
                {displayFields.map((field, idx) => (
                    <Group key={idx} justify="space-between">
                        <Text size="sm" c="dimmed">{field.label}</Text>
                        <Text size="sm" fw={500}>{field.value}</Text>
                    </Group>
                ))}
            </Stack>

            <Divider my="sm" />

            <Group justify="space-between">
                <Text size="xs" c="dimmed" style={{ maxWidth: '60%' }} truncate>
                    From: {issuer?.includes('did:') ? 'Verified Merchant' : issuer?.slice(0, 30) + '...'}
                </Text>
                <Group gap="xs">
                    <ActionIcon
                        variant="light"
                        color="green"
                        size="sm"
                        onClick={() => {
                            const msg = encodeURIComponent(
                                `${credential.type.includes('Receipt') ? '🧾 Receipt' : '📝 Invoice'}\n\n` +
                                `${displayFields.map(f => `${f.label}: ${f.value}`).join('\n')}\n\n` +
                                `✅ Verified Authentic`
                            );
                            window.open(`https://wa.me/?text=${msg}`, '_blank');
                        }}
                        title="Share to WhatsApp"
                    >
                        <IconBrandWhatsapp size={14} />
                    </ActionIcon>
                    <Button
                        variant="light"
                        size="xs"
                        leftSection={<IconEye size={14} />}
                        onClick={onView}
                    >
                        View
                    </Button>
                </Group>
            </Group>
        </Card>
    );
}

export default function WalletPage() {
    const router = useRouter();
    const env = useContext(EnvContext);
    const [credentials, setCredentials] = useState<WalletCredential[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [userEmail, setUserEmail] = useState<string>('');
    const [selectedCredential, setSelectedCredential] = useState<WalletCredential | null>(null);
    const [detailsModalOpen, setDetailsModalOpen] = useState(false);

    const holderBackend = env?.NEXT_PUBLIC_HOLDER_URL || 'http://localhost:7000';

    const fetchCredentials = useCallback(async () => {
        // PRIORITY: Check walletToken first (logged in), then credoTenantToken (just registered/logged in)
        const userToken = localStorage.getItem('walletToken');
        const guestToken = localStorage.getItem('credoTenantToken');
        
        // Determine mode
        const token = userToken || guestToken;
        const isGuest = !userToken && !!guestToken;
        
        if (!token) {
            router.push('/auth');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            // Decode token to get walletId
            const payload = JSON.parse(atob(token.split('.')[1]));
            const walletId = payload.walletId || payload.tenantId;

            if (!walletId) {
                throw new Error('Invalid token: missing wallet ID');
            }

            // For logged in users, try to get email from storage or token
            if (!isGuest) {
                const storedEmail = localStorage.getItem('walletEmail') || localStorage.getItem('walletPhone');
                setUserEmail(storedEmail || payload.email || payload.username || 'My Account');
            } else {
                setUserEmail('Guest Session');
            }

            const response = await axios.get(
                `${holderBackend}/api/wallet/${walletId}/credentials`,
                { headers: { Authorization: `Bearer ${token}` } }
            );

            setCredentials(response.data || []);
        } catch (err: any) {
            console.error('Failed to fetch credentials:', err);
            if (err.response?.status === 401) {
                // Only clear the invalid token
                if (isGuest) localStorage.removeItem('credoTenantToken');
                else localStorage.removeItem('walletToken');
                
                router.push('/auth');
                return;
            }
            setError(err.message || 'Failed to load credentials');
        } finally {
            setLoading(false);
        }
    }, [holderBackend, router]);

    useEffect(() => {
        fetchCredentials();
    }, [fetchCredentials]);

    const handleLogout = () => {
        // Clear User Wallet state
        localStorage.removeItem('walletToken');
        localStorage.removeItem('walletEmail');
        
        // Clear Guest/Tenant state (Full cleanup)
        localStorage.removeItem('credoTenantId');
        localStorage.removeItem('credoTenantToken');
        
        notifications.show({
            title: 'Logged out',
            message: 'You have been signed out.',
            color: 'blue',
        });
        router.push('/auth');
    };

    const handleViewDetails = (credential: WalletCredential) => {
        setSelectedCredential(credential);
        setDetailsModalOpen(true);
    };

    // Group credentials by type
    const receipts = credentials.filter(c => c.type.includes('Receipt') || c.type.includes('Payment'));
    const invoices = credentials.filter(c => c.type.includes('Invoice'));
    const others = credentials.filter(c => !c.type.includes('Receipt') && !c.type.includes('Payment') && !c.type.includes('Invoice'));

    return (
        <Layout title="My Saved Items">
            <Container size="lg" py="xl">
                {/* Header */}
                <Paper shadow="sm" p="md" radius="md" mb="xl" withBorder>
                    <Group justify="space-between">
                        <Group>
                            <IconReceipt size={32} color="#2188CA" />
                            <div>
                                <Title order={3}>{userEmail === 'Guest Session' ? 'Guest Receipts' : 'My Saved Items'}</Title>
                                <Text size="sm" c="dimmed">{userEmail}</Text>
                            </div>
                        </Group>
                        <Group>
                            <Button
                                variant="light"
                                leftSection={<IconShoppingCart size={18} />}
                                onClick={() => router.push('/shop')}
                            >
                                Shop
                            </Button>
                            <Button
                                variant="subtle"
                                leftSection={<IconRefresh size={18} />}
                                onClick={fetchCredentials}
                                loading={loading}
                            >
                                Refresh
                            </Button>
                            <Button
                                variant={userEmail === 'Guest Session' ? 'filled' : 'subtle'}
                                color={userEmail === 'Guest Session' ? 'blue' : 'red'}
                                leftSection={userEmail === 'Guest Session' ? <IconUser size={18} /> : <IconLogout size={18} />}
                                onClick={handleLogout}
                            >
                                {userEmail === 'Guest Session' ? 'Log In / Sign Up' : 'Sign Out'}
                            </Button>
                        </Group>
                    </Group>
                </Paper>

                {/* Stats */}
                <SimpleGrid cols={{ base: 1, sm: 3 }} mb="xl">
                    <Paper shadow="sm" p="md" radius="md" withBorder>
                        <Group>
                            <IconReceipt size={24} color="green" />
                            <div>
                                <Text size="xl" fw={700}>{receipts.length}</Text>
                                <Text size="sm" c="dimmed">Receipts</Text>
                            </div>
                        </Group>
                    </Paper>
                    <Paper shadow="sm" p="md" radius="md" withBorder>
                        <Group>
                            <IconFileInvoice size={24} color="blue" />
                            <div>
                                <Text size="xl" fw={700}>{invoices.length}</Text>
                                <Text size="sm" c="dimmed">Invoices</Text>
                            </div>
                        </Group>
                    </Paper>
                    <Paper shadow="sm" p="md" radius="md" withBorder>
                        <Group>
                            <IconCertificate size={24} color="violet" />
                            <div>
                                <Text size="xl" fw={700}>{others.length}</Text>
                                <Text size="sm" c="dimmed">Other Documents</Text>
                            </div>
                        </Group>
                    </Paper>
                </SimpleGrid>

                {/* Error state */}
                {error && (
                    <Alert icon={<IconAlertCircle size={16} />} title="Error" color="red" mb="xl">
                        {error}
                    </Alert>
                )}

                {/* Loading state */}
                {loading && (
                    <Box ta="center" py="xl">
                        <Loader size="lg" />
                        <Text mt="md" c="dimmed">Loading your saved items...</Text>
                    </Box>
                )}

                {/* Empty state */}
                {!loading && credentials.length === 0 && (
                    <Paper shadow="sm" p="xl" radius="md" withBorder ta="center">
                        <IconReceipt size={64} color="#ccc" style={{ margin: '0 auto' }} />
                        <Title order={3} mt="md">No Saved Items Yet</Title>
                        <Text c="dimmed" mt="sm">
                            Your receipts and invoices will appear here after you make purchases.
                        </Text>
                        <Button
                            mt="lg"
                            leftSection={<IconShoppingCart size={18} />}
                            onClick={() => router.push('/shop')}
                        >
                            Start Shopping
                        </Button>
                    </Paper>
                )}

                {/* Receipts Section */}
                {!loading && receipts.length > 0 && (
                    <Box mb="xl">
                        <Group mb="md">
                            <IconReceipt size={20} color="green" />
                            <Title order={4}>Payment Receipts</Title>
                        </Group>
                        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
                            {receipts.map((cred) => (
                                <CredentialCard
                                    key={cred.id}
                                    credential={cred}
                                    onView={() => handleViewDetails(cred)}
                                />
                            ))}
                        </SimpleGrid>
                    </Box>
                )}

                {/* Invoices Section */}
                {!loading && invoices.length > 0 && (
                    <Box mb="xl">
                        <Group mb="md">
                            <IconFileInvoice size={20} color="blue" />
                            <Title order={4}>Invoices</Title>
                        </Group>
                        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
                            {invoices.map((cred) => (
                                <CredentialCard
                                    key={cred.id}
                                    credential={cred}
                                    onView={() => handleViewDetails(cred)}
                                />
                            ))}
                        </SimpleGrid>
                    </Box>
                )}

                {/* Other Credentials Section */}
                {!loading && others.length > 0 && (
                    <Box mb="xl">
                        <Group mb="md">
                            <IconCertificate size={20} color="violet" />
                            <Title order={4}>Other Credentials</Title>
                        </Group>
                        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
                            {others.map((cred) => (
                                <CredentialCard
                                    key={cred.id}
                                    credential={cred}
                                    onView={() => handleViewDetails(cred)}
                                />
                            ))}
                        </SimpleGrid>
                    </Box>
                )}

                {/* Credential Details Modal */}
                <Modal
                    opened={detailsModalOpen}
                    onClose={() => setDetailsModalOpen(false)}
                    title={
                        <Group>
                            <IconShieldCheck size={20} color="green" />
                            <Text fw={600}>Credential Details</Text>
                        </Group>
                    }
                    size="lg"
                >
                    {selectedCredential && (
                        <Stack>
                            <Group justify="space-between">
                                <Badge color={CREDENTIAL_COLORS[selectedCredential.type] || 'gray'} size="lg">
                                    {formatCredentialType(selectedCredential.type)}
                                </Badge>
                                <Badge color="green" variant="light" leftSection={<IconShieldCheck size={12} />}>
                                    Verified
                                </Badge>
                            </Group>

                            <Divider />

                            <Text fw={600}>Claims</Text>
                            <ScrollArea h={300}>
                                <Code block>
                                    {JSON.stringify(selectedCredential.parsedDocument?.credentialSubject || {}, null, 2)}
                                </Code>
                            </ScrollArea>

                            <Divider />

                            <Group justify="space-between">
                                <Text size="sm" c="dimmed">Credential ID</Text>
                                <Text size="sm" ff="monospace">{selectedCredential.id.slice(0, 20)}...</Text>
                            </Group>
                            <Group justify="space-between">
                                <Text size="sm" c="dimmed">Issuer</Text>
                                <Text size="sm" ff="monospace">{selectedCredential.issuerDid?.slice(0, 30)}...</Text>
                            </Group>
                            <Group justify="space-between">
                                <Text size="sm" c="dimmed">Issued On</Text>
                                <Text size="sm">{new Date(selectedCredential.addedOn).toLocaleString()}</Text>
                            </Group>
                        </Stack>
                    )}
                </Modal>
            </Container>
        </Layout>
    );
}
