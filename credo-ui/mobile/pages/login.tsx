import React, { useEffect, useRef, useState } from 'react';
import { milestone } from '@/components/feedback/Milestone';
import { useRouter } from 'next/router';
import {
  Box,
  Paper,
  Stack,
  Title,
  Text,
  TextInput,
  PasswordInput,
  Button,
  Alert,
  Divider,
  Anchor,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconPhone, IconLock, IconAlertCircle, IconShieldCheck } from '@tabler/icons-react';
import api from '@/lib/api';
import { applyPersonalWalletContext } from '@/lib/auth';
import { confirmWithDevice, deviceTrustAvailable, rememberedWalletId, rememberPhoneWallet } from '@/lib/deviceTrust';
import ErrorAlert from '@/components/shared/ErrorAlert';

interface LoginValues {
  identifier: string;
  pin: string;
}

interface RegisterValues {
  username: string;
  phone: string;
  pin: string;
  confirmPin: string;
}

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const submitting = useRef(false);

  const loginForm = useForm<LoginValues>({
    initialValues: { identifier: '', pin: '' },
    validate: {
      identifier: (v) => (
        v.includes('@')
          ? (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? null : 'Enter a valid email address')
          : (v.trim().length < 9 ? 'Enter a valid phone number' : null)
      ),
      pin: (v) => (v.length < 4 ? 'PIN must be at least 4 digits' : null),
    },
  });

  const registerForm = useForm<RegisterValues>({
    initialValues: { username: '', phone: '', pin: '', confirmPin: '' },
    validate: {
      username: (v) => (v.trim().length < 2 ? 'Username too short' : null),
      phone: (v) => (v.trim().length < 9 ? 'Enter a valid phone number' : null),
      pin: (v) => (v.length < 4 ? 'PIN must be at least 4 digits' : null),
      confirmPin: (v, vals) => (v !== vals.pin ? 'PINs do not match' : null),
    },
  });

  useEffect(() => {
    const phone = typeof router.query.phone === 'string' ? router.query.phone : '';
    if (phone && !loginForm.values.identifier) loginForm.setFieldValue('identifier', phone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.query.phone]);

  const handleLogin = async (values: typeof loginForm.values) => {
    // One tap signs in once, even if the keyboard closing fires a second submit.
    if (submitting.current) return;
    submitting.current = true;
    setLoading(true);
    setError(null);
    try {
      const identifier = values.identifier.trim();
      const email = identifier.includes('@') ? identifier : undefined;
      const phone = email ? undefined : identifier;
      const res = await api.post('/api/wallet/auth/login', {
        phone,
        email,
        pin: values.pin,
      });
      const { token, tenantId, organizations } = res.data;

      applyPersonalWalletContext(token, tenantId);
      rememberPhoneWallet(tenantId);
      if (phone) localStorage.setItem('credoUserPhone', phone);
      const { rememberCurrentAccount } = await import('@/lib/savedAccounts');
      rememberCurrentAccount(identifier);
      // Read this person's name from their identity card now, so the account switcher shows it.
      void import('@/lib/offline/walletSnapshotSync').then(({ syncWalletSnapshot }) => syncWalletSnapshot()).catch(() => undefined);

      // Cache orgs from login response so the user can manually switch later.
      const orgs: Array<{ orgTenantId: string; name: string; role: string }> = organizations ?? [];
      if (orgs.length > 0) {
        localStorage.setItem('credoOrganizations', JSON.stringify(orgs));
      }

      // Org context is NEVER set on login — user must manually switch via the org selector.

      const returnTo = router.query.returnTo as string | undefined;
      router.replace(returnTo ?? '/inbox');
    } catch (err: any) {
      const msg = err.response?.data?.message ?? err.message ?? 'Login failed';
      setError(msg);
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  };

  const handlePhoneLogin = async () => {
    if (submitting.current) return;
    const walletId = rememberedWalletId();
    if (!walletId) {
      setError('Sign in with your PIN once on this phone. After that you can use fingerprint or face.');
      return;
    }
    submitting.current = true;
    setLoading(true);
    setError(null);
    try {
      const started = await api.post('/api/wallet/auth/login-wallet');
      const deviceAssertion = deviceTrustAvailable()
        ? await confirmWithDevice({ purpose: 'vc_login', required: true })
        : undefined;
      await api.post('/api/wallet/auth/login-wallet/present', {
        walletId,
        authorizationRequest: started.data.authorizationRequest,
        ...(deviceAssertion ? { deviceAssertion } : {}),
      });
      const verified = await pollWalletLogin(started.data.loginId, started.data.pollToken);
      applyPersonalWalletContext(verified.token, verified.tenantId);
      rememberPhoneWallet(verified.tenantId);
      const { rememberCurrentAccount } = await import('@/lib/savedAccounts');
      rememberCurrentAccount();
      const returnTo = router.query.returnTo as string | undefined;
      router.replace(returnTo ?? '/inbox');
    } catch (err: any) {
      const message = err.response?.data?.message ?? err.message ?? 'Could not sign in with this phone';
      setError(/does not hold|identity card/i.test(message)
        ? 'Accept your identity card in Inbox, then try again.'
        : message);
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  };

  const pollWalletLogin = async (loginId: string, pollToken: string) => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const response = await api.get(`/api/wallet/auth/login-wallet/${encodeURIComponent(loginId)}`, {
        headers: { 'x-login-poll-token': pollToken },
      });
      if (response.data?.status === 'verified') return response.data;
      await new Promise((resolve) => window.setTimeout(resolve, 400));
    }
    throw new Error('The identity card was not accepted. Accept it in Inbox, then try again.');
  };

  const handleRegister = async (values: typeof registerForm.values) => {
    setLoading(true);
    setError(null);
    try {
      await api.post('/api/wallet/auth/register', {
        username: values.username,
        phone: values.phone,
        pin: values.pin,
      });
      milestone.show({
        kind: 'account_created',
        title: 'Your account is ready',
        detail: 'Sign in with your phone number and PIN.',
        next: [
          'Accept your identity card in Inbox',
          'Keep receipts and cards in your records',
          'Set up or join an organisation',
        ],
        action: { label: 'Sign in', onClick: () => undefined },
      });
      setTab('login');
      loginForm.setValues({ identifier: values.phone, pin: '' });
    } catch (err: any) {
      const msg = err.response?.data?.message ?? err.message ?? 'Registration failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      style={{
        minHeight: '100svh',
        background: 'light-dark(linear-gradient(135deg, var(--mantine-color-blue-0) 0%, var(--mantine-color-gray-0) 100%), var(--mantine-color-dark-8))',
        display: 'flex',
        // Top-aligned so the Sign in button stays put when the keyboard closes; a centred form
        // moved under the finger and the first tap only closed the keyboard.
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: 'max(32px, env(safe-area-inset-top)) 16px 24px',
      }}
    >
      <Box style={{ width: '100%', maxWidth: 400 }}>
        {/* Logo / Brand */}
        <Stack align="center" gap="xs" mb="xl">
          <Box
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: 'var(--mantine-color-blue-6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <IconShieldCheck size={36} color="var(--mantine-color-white)" />
          </Box>
          <Title order={2} c="credentis.7">
            Credentis
          </Title>
          <Text size="sm" c="dimmed" ta="center">
            Sign in with your phone or email and PIN
          </Text>
        </Stack>

        <Paper p="xl" radius="lg" shadow="md">
          <Stack gap="md">
            {/* Tab switch */}
            <Box
              style={{
                display: 'flex',
                background: 'light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-6))',
                borderRadius: 8,
                padding: 4,
                gap: 4,
              }}
            >
              {(['login', 'register'] as const).map((t) => (
                <Box
                  key={t}
                  onClick={() => { setTab(t); setError(null); }}
                  style={{
                    flex: 1,
                    textAlign: 'center',
                    padding: '8px 0',
                    borderRadius: 6,
                    background: tab === t
                      ? 'light-dark(var(--mantine-color-white), var(--mantine-color-dark-4))'
                      : 'transparent',
                    boxShadow: tab === t
                      ? 'light-dark(0 1px 3px color-mix(in srgb, var(--mantine-color-black) 10%, transparent), 0 1px 3px color-mix(in srgb, var(--mantine-color-black) 35%, transparent))'
                      : 'none',
                    cursor: 'pointer',
                    fontWeight: tab === t ? 600 : 400,
                    fontSize: 14,
                    color: tab === t
                      ? 'light-dark(var(--mantine-color-blue-6), var(--mantine-color-white))'
                      : 'light-dark(var(--mantine-color-gray-6), var(--mantine-color-dark-2))',
                    transition: 'all 150ms',
                  }}
                >
                  {t === 'login' ? 'Sign in' : 'Register'}
                </Box>
              ))}
            </Box>

            {error && <ErrorAlert message={error} />}

            {tab === 'login' ? (
              <form onSubmit={loginForm.onSubmit(handleLogin)}>
                <Stack gap="sm">
                  <TextInput
                    label="Phone or email"
                    placeholder="263771234567 or john@example.com"
                    leftSection={<IconPhone size={16} />}
                    size="md"
                    autoComplete="username"
                    inputMode="tel"
                    enterKeyHint="next"
                    {...loginForm.getInputProps('identifier')}
                  />
                  <PasswordInput
                    label="PIN"
                    placeholder="Enter your PIN"
                    leftSection={<IconLock size={16} />}
                    size="md"
                    inputMode="numeric"
                    enterKeyHint="go"
                    autoComplete="current-password"
                    {...loginForm.getInputProps('pin')}
                  />
                  <Button type="submit" size="lg" fullWidth loading={loading} mt="xs">
                    Sign in
                  </Button>
                  <Divider label="or" />
                  <Button variant="default" size="lg" fullWidth loading={loading} onClick={() => void handlePhoneLogin()}>
                    Sign in with this phone
                  </Button>
                  <Text size="xs" c="dimmed" ta="center">
                    Uses the identity card already on this phone. Fingerprint or face confirms it. No QR.
                  </Text>
                </Stack>
              </form>
            ) : (
              <form onSubmit={registerForm.onSubmit(handleRegister)}>
                <Stack gap="sm">
                  <TextInput
                    label="Name"
                    placeholder="Your name"
                    size="md"
                    {...registerForm.getInputProps('username')}
                  />
                  <TextInput
                    label="Phone number"
                    placeholder="263771234567"
                    leftSection={<IconPhone size={16} />}
                    size="md"
                    inputMode="tel"
                    {...registerForm.getInputProps('phone')}
                  />
                  <PasswordInput
                    label="PIN"
                    placeholder="Choose a PIN"
                    leftSection={<IconLock size={16} />}
                    size="md"
                    inputMode="numeric"
                    {...registerForm.getInputProps('pin')}
                  />
                  <PasswordInput
                    label="Confirm PIN"
                    placeholder="Repeat PIN"
                    leftSection={<IconLock size={16} />}
                    size="md"
                    inputMode="numeric"
                    {...registerForm.getInputProps('confirmPin')}
                  />
                  <Button type="submit" size="lg" fullWidth loading={loading} mt="xs">
                    Create account
                  </Button>
                </Stack>
              </form>
            )}
          </Stack>
        </Paper>

        <Text size="xs" c="dimmed" ta="center" mt="md">
          Organization setup is also on the website at{' '}
          <Anchor size="xs" href="#" c="credentis.6">
            credentis.app
          </Anchor>
        </Text>
      </Box>
    </Box>
  );
}
