import React, { useState, useContext, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { EnvContext } from '@/pages/_app';
import { clearStoredOrganizationContext } from '@/utils/organizationContext';
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
    Badge,
    Loader,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconUserPlus, IconAlertCircle, IconCheck, IconReceipt, IconPhone, IconMail } from '@tabler/icons-react';

export default function RegisterPage() {
    const router = useRouter();
    const env = useContext(EnvContext);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [claimedCredentials, setClaimedCredentials] = useState<number>(0);
    const [authChecked, setAuthChecked] = useState(false);

    const [form, setForm] = useState({
        username: '',
        email: '',
        phone: '',
        password: '',
        confirmPassword: '',
    });

    const holderBackend = env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000';

    useEffect(() => {
        if (!router.isReady || typeof window === 'undefined') return;

        const hasPersonalSession = Boolean(
            localStorage.getItem('authToken') ||
            localStorage.getItem('walletToken')
        );

        if (hasPersonalSession) {
            router.replace('/wallet');
            return;
        }

        setAuthChecked(true);
    }, [router]);

    // Pre-fill phone from localStorage if available (from checkout flow)
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const savedPhone = localStorage.getItem('checkoutPhone');
            if (savedPhone) {
                setForm(prev => ({ ...prev, phone: savedPhone }));
            }
        }
    }, []);

    useEffect(() => {
        if (!router.isReady) return;

        const requestedTenantType = router.query.tenantType;
        if (requestedTenantType === 'ORG') {
            router.replace('/organization/onboard');
        }
    }, [router, router.isReady, router.query.tenantType]);

    if (!authChecked) {
        return null;
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (form.password !== form.confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        if (form.password.length < 4 || form.password.length > 6) {
            setError('PIN must be 4-6 digits');
            return;
        }

        // Require either email or phone
        if (!form.email && !form.phone) {
            setError('Please provide either email or phone number');
            return;
        }

        setLoading(true);
        try {
            console.log('[Register] Payload:', {
                username: form.username,
                phone: form.phone,
                email: form.email,
                pin: '****',
                claimExistingTenantId: localStorage.getItem('credoTenantId')
            });

            // Use SSI Auth - NO PII stored in database, only in wallet VC
            const response = await axios.post(`${holderBackend}/api/ssi/auth/register`, {
                username: form.username,
                email: form.email || undefined,
                phone: form.phone || undefined,
                pin: form.password, // PIN for Web2 fallback login
                claimExistingTenantId: localStorage.getItem('credoTenantId') || undefined, // Claim checkout VCs
            });

            const sessionToken = response.data.token as string | undefined;
            const walletId = response.data.walletId as string | undefined;

            clearStoredOrganizationContext();
            localStorage.removeItem('walletPhone');
            localStorage.removeItem('walletEmail');
            if (walletId) {
                localStorage.setItem('credoTenantId', walletId);
                localStorage.setItem('tenantId', walletId);
            }
            if (sessionToken) {
                localStorage.setItem('credoTenantToken', sessionToken);
                localStorage.setItem('walletToken', sessionToken);
                localStorage.setItem('tenantToken', sessionToken);
            }

            console.log('[Register] Success:', response.data);
            setSuccess(true);

            // Check if we claimed existing credentials
            const claimedCount = response.data.existingCredentialsCount || 0;
            if (response.data.claimedExisting && claimedCount > 0) {
                setClaimedCredentials(claimedCount);
                notifications.show({
                    title: 'Welcome back!',
                    message: `Found ${claimedCount} saved item(s) from your previous purchases`,
                    color: 'green',
                    icon: <IconReceipt size={18} />,
                    autoClose: 5000,
                });
            } else {
                notifications.show({
                    title: 'Account Created!',
                    message: response.data.message || 'Your wallet is ready',
                    color: 'green',
                    icon: <IconCheck size={18} />,
                    autoClose: 4000,
                });
            }

            // Redirect after showing success
            setTimeout(() => {
                if (response.data.claimedExisting) {
                    router.push('/wallet'); // Go to wallet to see claimed VCs
                } else {
                    router.push('/auth/login');
                }
            }, 2500);
        } catch (err: any) {
            console.error('[Register] Error:', err);
            const errorMsg = err.response?.data?.message || err.message || 'Registration failed';
            setError(errorMsg);
            notifications.show({
                title: 'Registration Failed',
                message: errorMsg,
                color: 'red',
                icon: <IconAlertCircle size={18} />,
                autoClose: 6000,
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Layout title="Register">
            <Container size="xs" py="xl">
                <Paper shadow="md" p="xl" radius="md" withBorder>
                    <Title order={2} ta="center" mb="lg">
                        <IconUserPlus size={28} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                        Create Personal Account
                    </Title>

                    {success ? (
                        <Alert icon={<IconCheck size={16} />} title="Registration Successful!" color="green">
                            {claimedCredentials > 0 ? (
                                <>
                                    <Text>Your account has been created!</Text>
                                    <Badge color="blue" leftSection={<IconReceipt size={14} />} mt="xs">
                                        {claimedCredentials} saved item(s) found from your purchases
                                    </Badge>
                                    <Text size="sm" mt="xs">Redirecting to your saved items...</Text>
                                </>
                            ) : (
                                <Text>Your personal account has been created. Redirecting to login...</Text>
                            )}
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
                                    label="Username"
                                    placeholder="johndoe"
                                    required
                                    value={form.username}
                                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                                />

                                <TextInput
                                    label="Phone Number"
                                    placeholder="+263 77 123 4567 or 0774 123 456"
                                    description="📱 Required to link VCs from your EcoCash payments. Use the MSISDN you pay with."
                                    leftSection={<IconPhone size={16} />}
                                    value={form.phone}
                                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                                />

                                <TextInput
                                    label="Email (optional)"
                                    placeholder="john@example.com"
                                    description="Optional if phone is provided"
                                    type="email"
                                    leftSection={<IconMail size={16} />}
                                    value={form.email}
                                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                                />

                                <PasswordInput
                                    label="PIN (4-6 digits)"
                                    placeholder="••••••"
                                    description="Quick login PIN - your identity is stored securely in your wallet"
                                    required
                                    maxLength={6}
                                    value={form.password}
                                    onChange={(e) => setForm({ ...form, password: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                                />

                                <PasswordInput
                                    label="Confirm PIN"
                                    placeholder="••••••"
                                    required
                                    maxLength={6}
                                    value={form.confirmPassword}
                                    onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                                />

                                <Button 
                                    type="submit" 
                                    fullWidth 
                                    loading={loading} 
                                    mt="md"
                                    leftSection={loading ? <Loader size="xs" /> : <IconUserPlus size={18} />}
                                >
                                    {loading ? 'Creating Account...' : 'Create Account'}
                                </Button>

                                <Text ta="center" size="sm" c="dimmed">
                                    Already have an account?{' '}
                                    <Anchor component={Link} href="/auth/login">
                                        Sign in
                                    </Anchor>
                                </Text>
                            </Stack>
                        </form>
                    )}
                </Paper>
            </Container>
        </Layout>
    );
}
