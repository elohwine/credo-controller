import React, { useState, useContext, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { WalletOnboarding } from '../../../shared/WalletOnboarding';
import onboardingStyles from '../../../shared/WalletOnboarding.module.css';
import { EnvContext } from '@/pages/_app';
import { clearStoredOrganizationContext } from '@/utils/organizationContext';
import { applyPersonalLogin } from '@/lib/personalSession';
import { useGuideClient } from '@/lib/guides';
import { WelcomeScreen } from '../../../shared/Guides';
import { GUIDE_PATHS } from '../../../shared/guides';
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
    const [welcome, setWelcome] = useState<{ name: string; next: string } | null>(null);
    const guideClient = useGuideClient();
    // Set before the new session is stored, so the signed-in redirect below does not skip the welcome.
    const welcoming = useRef(false);

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

        if (welcoming.current) return;
        if (hasPersonalSession) {
            router.replace('/inbox');
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
            const identifier = (form.phone || form.email || '').trim();
            const claimedCount = response.data.claimedExisting ? Number(response.data.existingCredentialsCount || 0) : 0;
            setClaimedCredentials(claimedCount);

            if (sessionToken && walletId) {
                // The account exists and is signed in: welcome the person instead of asking for the PIN again.
                welcoming.current = true;
                applyPersonalLogin(
                    { token: sessionToken, tenantId: walletId, claims: { displayName: form.username.trim() } },
                    identifier,
                );
                setWelcome({ name: form.username.trim(), next: '/inbox' });
                return;
            }

            clearStoredOrganizationContext();
            setSuccess(true);
            notifications.show({
                title: 'Account created',
                message: 'Sign in with your phone number or email and PIN.',
                color: 'green',
                icon: <IconCheck size={18} />,
                autoClose: 4000,
            });
            setTimeout(() => router.push('/auth/login'), 2500);
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

    if (welcome) {
        return (
            <WelcomeScreen
                name={welcome.name}
                flyToInbox={welcome.next === '/inbox'}
                continueLabel="Go to Inbox"
                onContinue={() => {
                    void guideClient.put(`${GUIDE_PATHS.guides}/welcome`, { status: 'done' }).catch(() => undefined);
                    void router.replace(welcome.next);
                }}
            />
        );
    }

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
                                    label="Your name"
                                    placeholder="e.g. Tendai"
                                    autoComplete="username"
                                    required
                                    value={form.username}
                                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                                />

                                <Text size="xs" c="dimmed">Add a phone number or email.</Text>
                                <TextInput
                                    label="Phone number"
                                    placeholder="e.g. 0771234567"
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
                                    placeholder="Choose PIN"
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
                                    placeholder="Repeat PIN"
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
