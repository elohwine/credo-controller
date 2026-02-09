import React, { useState, useContext } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { EnvContext } from '@/pages/_app';
import axios from 'axios';
import {
    Container,
    Paper,
    Title,
    TextInput,
    PasswordInput,
    Button,
    Text,
    Anchor,
    Stack,
    Alert,
    Checkbox,
    Divider,
    Group,
    Modal,
    Code,
    CopyButton,
    ActionIcon,
    Tooltip,
} from '@mantine/core';
import { IconLogin, IconAlertCircle, IconCheck, IconWallet, IconCopy, IconQrcode } from '@tabler/icons-react';
import QRCode from 'react-qr-code';

export default function LoginPage() {
    const router = useRouter();
    const env = useContext(EnvContext);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    // SSI Login state
    const [ssiLoading, setSsiLoading] = useState(false);
    const [ssiModalOpen, setSsiModalOpen] = useState(false);
    const [authRequest, setAuthRequest] = useState<string | null>(null);
    const [ssiState, setSsiState] = useState<string | null>(null);

    const [form, setForm] = useState({
        phone: '',
        email: '',
        pin: '',
        rememberMe: false,
    });

    const holderBackend = env.NEXT_PUBLIC_HOLDER_URL || 'http://localhost:7000';

    // PIN-based login (Web2 fallback)
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        if (!form.phone && !form.email) {
            setError('Please enter phone or email');
            setLoading(false);
            return;
        }

        try {
            // Use SSI Auth PIN login - no PII stored, just hash lookup
            const response = await axios.post(`${holderBackend}/api/ssi/auth/login/pin`, {
                phone: form.phone || undefined,
                email: form.email || undefined,
                pin: form.pin,
            });

            console.log('[Login] Success:', response.data);
            setSuccess(true);

            // Store auth token and wallet info
            const { token, tenantId } = response.data;
            if (token) {
                localStorage.setItem('credoTenantToken', token);
                // Also set walletToken for WalletPage compatibility
                localStorage.setItem('walletToken', token);
                localStorage.setItem('tenantToken', token);
            }
            if (tenantId) {
                localStorage.setItem('credoTenantId', tenantId);
                localStorage.setItem('tenantId', tenantId);
            }

            // Redirect to shop or dashboard
            const returnUrl = router.query.returnUrl as string || '/shop';
            setTimeout(() => {
                router.push(returnUrl);
            }, 1000);
        } catch (err: any) {
            console.error('[Login] Error:', err);
            setError(err.response?.data?.message || err.message || 'Login failed');
        } finally {
            setLoading(false);
        }
    };

    // SSI Login - Step 1: Get authorization request
    const handleWalletLogin = async () => {
        setSsiLoading(true);
        setError(null);
        try {
            const response = await axios.post(`${holderBackend}/api/wallet/auth/login-wallet`);
            setAuthRequest(response.data.authorizationRequest);
            setSsiState(response.data.state);
            setSsiModalOpen(true);
            
            // Start polling for verification result
            pollForVerification(response.data.state);
        } catch (err: any) {
            console.error('[SSI Login] Error:', err);
            setError(err.response?.data?.message || 'Failed to initiate wallet login');
        } finally {
            setSsiLoading(false);
        }
    };

    // Poll for SSI login verification
    const pollForVerification = async (state: string) => {
        const maxAttempts = 60; // 2 minutes at 2s intervals
        let attempts = 0;

        const poll = async () => {
            if (attempts >= maxAttempts) {
                setError('Login timed out. Please try again.');
                setSsiModalOpen(false);
                return;
            }

            try {
                const response = await axios.get(`${holderBackend}/api/wallet/auth/login-challenge?state=${state}`);
                
                if (response.data.verified) {
                    // Login successful
                    const { token, tenantId } = response.data;
                    localStorage.setItem('credoTenantToken', token);
                    localStorage.setItem('tenantToken', token);
                    localStorage.setItem('credoTenantId', tenantId);
                    localStorage.setItem('tenantId', tenantId);
                    
                    setSuccess(true);
                    setSsiModalOpen(false);
                    
                    const returnUrl = router.query.returnUrl as string || '/shop';
                    setTimeout(() => router.push(returnUrl), 1000);
                    return;
                }
            } catch (err) {
                // Still pending - continue polling
            }

            attempts++;
            setTimeout(poll, 2000);
        };

        poll();
    };

    return (
        <Layout title="Login">
            <Container size="xs" py="xl">
                <Paper shadow="md" p="xl" radius="md" withBorder>
                    <Title order={2} ta="center" mb="lg">
                        <IconLogin size={28} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                        Sign In
                    </Title>

                    {success ? (
                        <Alert icon={<IconCheck size={16} />} title="Login Successful!" color="green">
                            Redirecting...
                        </Alert>
                    ) : (
                        <form onSubmit={handleSubmit}>
                            <Stack gap="md">
                                {error && (
                                    <Alert icon={<IconAlertCircle size={16} />} title="Error" color="red">
                                        {error}
                                    </Alert>
                                )}

                                <TextInput
                                    label="Phone Number"
                                    placeholder="0774 123 456"
                                    description="Enter the phone you registered with"
                                    value={form.phone}
                                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                                />

                                <TextInput
                                    label="Or Email"
                                    placeholder="john@example.com"
                                    type="email"
                                    value={form.email}
                                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                                />

                                <PasswordInput
                                    label="PIN"
                                    placeholder="••••••"
                                    required
                                    maxLength={6}
                                    value={form.pin}
                                    onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                                />

                                <Checkbox
                                    label="Remember me"
                                    checked={form.rememberMe}
                                    onChange={(e) => setForm({ ...form, rememberMe: e.currentTarget.checked })}
                                />

                                <Button type="submit" fullWidth loading={loading} mt="md">
                                    Sign In
                                </Button>

                                <Divider label="or" labelPosition="center" my="md" />

                                {/* SSI Login - Present your Identity VC */}
                                <Button
                                    variant="outline"
                                    fullWidth
                                    leftSection={<IconWallet size={18} />}
                                    loading={ssiLoading}
                                    onClick={handleWalletLogin}
                                >
                                    Sign in with Identity Credential
                                </Button>

                                <Text ta="center" size="sm" c="dimmed">
                                    Don&apos;t have an account?{' '}
                                    <Anchor component={Link} href="/auth/register">
                                        Register
                                    </Anchor>
                                </Text>
                            </Stack>
                        </form>
                    )}
                </Paper>
            </Container>

            {/* SSI Login Modal - Show QR code for wallet scan */}
            <Modal
                opened={ssiModalOpen}
                onClose={() => setSsiModalOpen(false)}
                title={
                    <Group gap="xs">
                        <IconWallet size={24} />
                        <Text fw={600}>Sign in with Wallet</Text>
                    </Group>
                }
                centered
                size="md"
            >
                <Stack align="center" gap="lg">
                    <Text ta="center" size="sm" c="dimmed">
                        Scan this QR code with your wallet app to sign in
                    </Text>
                    
                    {authRequest && (
                        <>
                            <Paper withBorder p="md" radius="md" bg="white">
                                <QRCode value={authRequest} size={200} />
                            </Paper>
                            
                            <Text ta="center" size="xs" c="dimmed">
                                Or copy the link to open in your wallet
                            </Text>
                            
                            <Group gap="xs" wrap="nowrap" style={{ maxWidth: '100%' }}>
                                <Code 
                                    block 
                                    style={{ 
                                        fontSize: '10px', 
                                        maxWidth: '280px', 
                                        overflow: 'hidden', 
                                        textOverflow: 'ellipsis' 
                                    }}
                                >
                                    {authRequest.slice(0, 60)}...
                                </Code>
                                <CopyButton value={authRequest}>
                                    {({ copied, copy }) => (
                                        <Tooltip label={copied ? 'Copied!' : 'Copy'}>
                                            <ActionIcon color={copied ? 'teal' : 'gray'} onClick={copy}>
                                                <IconCopy size={16} />
                                            </ActionIcon>
                                        </Tooltip>
                                    )}
                                </CopyButton>
                            </Group>
                        </>
                    )}
                    
                    <Text ta="center" size="sm" c="blue">
                        Waiting for wallet response...
                    </Text>
                </Stack>
            </Modal>
        </Layout>
    );
}
