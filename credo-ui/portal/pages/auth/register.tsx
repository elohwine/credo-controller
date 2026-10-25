import React, { useState, useContext, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { WalletOnboarding } from '../../../shared/WalletOnboarding';
import onboardingStyles from '../../../shared/WalletOnboarding.module.css';
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
    const [setupStep, setSetupStep] = useState(1);

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
            setError('PINs do not match');
            return;
        }

        if (form.password.length < 4 || form.password.length > 6) {
            setError('PIN must be 4-6 digits');
            return;
        }

        // Require either email or phone
        if (!form.email && !form.phone) {
            setError('Add a phone number or email.');
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

    const guiding = !success && setupStep < 3;

    return (
        <Layout title="Register">
            <Container size="xs" py={guiding ? 0 : 'xl'} px={guiding ? 0 : undefined}>
                <Paper className={guiding ? onboardingStyles.portalGuide : undefined} shadow={guiding ? undefined : 'md'} p={guiding ? 0 : 'xl'} radius="md" withBorder={!guiding}>
                    {!guiding && <Title order={2} ta="center" mb="lg">
                        Create account
                    </Title>}

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
                    ) : setupStep < 3 ? (
                        <WalletOnboarding
                            key={setupStep}
                            step={setupStep === 1 ? 1 : 2}
                            onSkip={() => setSetupStep(3)}
                            onNext={() => setSetupStep(setupStep + 1)}
                            onBack={() => setupStep === 1 ? router.push('/auth/login') : setSetupStep(1)}
                        />
                    ) : (
                        <form onSubmit={handleSubmit}>
                            <Stack gap="sm" className="compact-form">
                                {error && (
                                    <Alert icon={<IconAlertCircle size={16} />} title="Error" color="red">
                                        {error}
                                    </Alert>
                                )}
                                <TextInput
                                    label="Username"
                                    autoComplete="username"
                                    required
                                    value={form.username}
                                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                                />

                                <Text size="xs" c="dimmed">Add a phone number or email.</Text>
                                <TextInput
                                    label="Phone number"
                                    placeholder="263771234567"
                                    type="tel"
                                    autoComplete="tel"
                                    leftSection={<IconPhone size={16} />}
                                    value={form.phone}
                                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                                />

                                <TextInput
                                    label="Email"
                                    placeholder="john@example.com"
                                    type="email"
                                    autoComplete="email"
                                    leftSection={<IconMail size={16} />}
                                    value={form.email}
                                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                                />

                                <PasswordInput
                                    label="PIN"
                                    inputMode="numeric"
                                    autoComplete="new-password"
                                    visibilityToggleButtonProps={{ 'aria-label': 'Show or hide new PIN' }}
                                    required
                                    maxLength={6}
                                    value={form.password}
                                    onChange={(e) => setForm({ ...form, password: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                                />

                                <PasswordInput
                                    label="Confirm PIN"
                                    inputMode="numeric"
                                    autoComplete="new-password"
                                    visibilityToggleButtonProps={{ 'aria-label': 'Show or hide confirmation PIN' }}
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
                                    {loading ? 'Creating account…' : 'Create account'}
                                </Button>

                                <Text ta="center" size="sm" c="dimmed">
                                    Already have an account?{' '}
                                    <Anchor component={Link} href="/auth/login">
                                        Sign in
                                    </Anchor>
                                </Text>
                                <Button variant="subtle" disabled={loading} onClick={() => setSetupStep(2)}>Back to guide</Button>
                            </Stack>
                        </form>
                    )}
                </Paper>
            </Container>
        </Layout>
    );
}
