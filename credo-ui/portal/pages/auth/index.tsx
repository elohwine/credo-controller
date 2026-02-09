import React, { useState, useContext, useEffect } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import { EnvContext } from '@/pages/_app';
import {
    Container,
    Paper,
    Title,
    TextInput,
    PasswordInput,
    Button,
    Group,
    Tabs,
    Text,
    Alert,
    Stack,
    Divider,
    Badge,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
    IconUser,
    IconMail,
    IconLock,
    IconLogin,
    IconUserPlus,
    IconWallet,
    IconCheck,
    IconAlertCircle,
    IconPhone,
} from '@tabler/icons-react';
import axios from 'axios';

export default function AuthPage() {
    const router = useRouter();
    const env = useContext(EnvContext);
    const [activeTab, setActiveTab] = useState<string | null>('login');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Login form
    const [loginPhone, setLoginPhone] = useState('');
    const [loginPassword, setLoginPassword] = useState('');

    // Register form
    const [regUsername, setRegUsername] = useState('');
    const [regPhone, setRegPhone] = useState('');
    const [regEmail, setRegEmail] = useState('');
    const [regPassword, setRegPassword] = useState('');
    const [regConfirmPassword, setRegConfirmPassword] = useState('');

    // Check if already logged in
    useEffect(() => {
        const token = localStorage.getItem('walletToken');
        if (token) {
            router.push('/wallet');
        }
    }, []);

    const holderBackend = env?.NEXT_PUBLIC_HOLDER_URL || 'http://localhost:7000';

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            const response = await axios.post(`${holderBackend}/api/ssi/auth/login/pin`, {
                phone: loginPhone,
                pin: loginPassword,
            });

            const { token } = response.data;
            localStorage.setItem('walletToken', token);
            localStorage.setItem('walletPhone', loginPhone);

            notifications.show({
                title: 'Welcome back!',
                message: 'You have successfully logged in.',
                color: 'green',
                icon: <IconCheck size={18} />,
            });

            router.push('/wallet');
        } catch (err: any) {
            const message = err.response?.data?.message || err.message || 'Login failed';
            setError(message);
            notifications.show({
                title: 'Login Failed',
                message,
                color: 'red',
            });
        } finally {
            setLoading(false);
        }
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (regPassword !== regConfirmPassword) {
            setError('PINs do not match');
            return;
        }

        if (regPassword.length < 4 || regPassword.length > 6) {
            setError('PIN must be 4-6 digits');
            return;
        }

        setLoading(true);

        try {
            const response = await axios.post(`${holderBackend}/api/ssi/auth/register`, {
                username: regUsername,
                phone: regPhone,
                email: regEmail || undefined,
                pin: regPassword,
            });

            const { walletId } = response.data;

            notifications.show({
                title: 'Account Created!',
                message: `Your wallet (${walletId.slice(0, 8)}...) has been created. Please log in.`,
                color: 'green',
                icon: <IconCheck size={18} />,
            });

            // Switch to login tab
            setActiveTab('login');
            setLoginPhone(regPhone);
            setRegPassword('');
            setRegConfirmPassword('');
        } catch (err: any) {
            const message = err.response?.data?.message || err.message || 'Registration failed';
            setError(message);
            notifications.show({
                title: 'Registration Failed',
                message,
                color: 'red',
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Layout title="Sign In">
            <Container size="xs" py="xl">
                <Paper shadow="md" p="xl" radius="md" withBorder>
                    <Stack align="center" mb="lg">
                        <IconWallet size={48} color="#2188CA" />
                        <Title order={2}>Credentis Wallet</Title>
                        <Text size="sm" c="dimmed">
                            Your embedded verifiable credentials wallet
                        </Text>
                    </Stack>

                    {error && (
                        <Alert
                            icon={<IconAlertCircle size={16} />}
                            title="Error"
                            color="red"
                            mb="md"
                            withCloseButton
                            onClose={() => setError(null)}
                        >
                            {error}
                        </Alert>
                    )}

                    <Tabs value={activeTab} onChange={setActiveTab}>
                        <Tabs.List grow mb="md">
                            <Tabs.Tab value="login" leftSection={<IconLogin size={16} />}>
                                Sign In
                            </Tabs.Tab>
                            <Tabs.Tab value="register" leftSection={<IconUserPlus size={16} />}>
                                Register
                            </Tabs.Tab>
                        </Tabs.List>

                        <Tabs.Panel value="login">
                            <form onSubmit={handleLogin}>
                                <Stack>
                                    <TextInput
                                        label="Phone Number"
                                        placeholder="0774 123 456 or +263774123456"
                                        description="Use the phone number you registered with"
                                        required
                                        leftSection={<IconPhone size={16} />}
                                        value={loginPhone}
                                        onChange={(e) => setLoginPhone(e.target.value)}
                                    />
                                    <PasswordInput
                                        label="PIN"
                                        placeholder="4-6 digit PIN"
                                        required
                                        leftSection={<IconLock size={16} />}
                                        value={loginPassword}
                                        onChange={(e) => setLoginPassword(e.target.value)}
                                    />
                                    <Button
                                        type="submit"
                                        fullWidth
                                        loading={loading}
                                        leftSection={<IconLogin size={18} />}
                                    >
                                        Sign In
                                    </Button>
                                </Stack>
                            </form>
                        </Tabs.Panel>

                        <Tabs.Panel value="register">
                            <form onSubmit={handleRegister}>
                                <Stack>
                                    <TextInput
                                        label="Username"
                                        placeholder="johndoe"
                                        required
                                        leftSection={<IconUser size={16} />}
                                        value={regUsername}
                                        onChange={(e) => setRegUsername(e.target.value)}
                                    />
                                    <TextInput
                                        label="Phone Number"
                                        placeholder="0774 123 456 or +263774123456"
                                        description="📱 Required to link VCs from EcoCash payments"
                                        required
                                        leftSection={<IconPhone size={16} />}
                                        value={regPhone}
                                        onChange={(e) => setRegPhone(e.target.value)}
                                    />
                                    <TextInput
                                        label="Email (optional)"
                                        placeholder="your@email.com"
                                        type="email"
                                        leftSection={<IconMail size={16} />}
                                        value={regEmail}
                                        onChange={(e) => setRegEmail(e.target.value)}
                                    />
                                    <PasswordInput
                                        label="PIN"
                                        placeholder="4-6 digit PIN"
                                        required
                                        leftSection={<IconLock size={16} />}
                                        value={regPassword}
                                        onChange={(e) => setRegPassword(e.target.value)}
                                    />
                                    <PasswordInput
                                        label="Confirm PIN"
                                        placeholder="Repeat PIN"
                                        required
                                        leftSection={<IconLock size={16} />}
                                        value={regConfirmPassword}
                                        onChange={(e) => setRegConfirmPassword(e.target.value)}
                                    />

                                    <Alert color="blue" variant="light" icon={<IconWallet size={16} />}>
                                        <Text size="sm">
                                            Registration creates a secure embedded wallet for storing your verifiable credentials.
                                            No app install required!
                                        </Text>
                                    </Alert>

                                    <Button
                                        type="submit"
                                        fullWidth
                                        loading={loading}
                                        leftSection={<IconUserPlus size={18} />}
                                    >
                                        Create Account
                                    </Button>
                                </Stack>
                            </form>
                        </Tabs.Panel>
                    </Tabs>

                    <Divider my="lg" label="Or continue as guest" labelPosition="center" />

                    <Button
                        variant="light"
                        fullWidth
                        onClick={() => router.push('/shop')}
                    >
                        Browse Shop (Guest)
                    </Button>
                </Paper>
            </Container>
        </Layout>
    );
}
