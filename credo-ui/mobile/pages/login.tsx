import React, { useState } from 'react';
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
import ErrorAlert from '@/components/shared/ErrorAlert';

interface LoginValues {
  phone: string;
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

  const loginForm = useForm<LoginValues>({
    initialValues: { phone: '', pin: '' },
    validate: {
      phone: (v) => (v.trim().length < 9 ? 'Enter a valid phone number' : null),
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

  const handleLogin = async (values: typeof loginForm.values) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post('/api/wallet/auth/login', {
        phone: values.phone,
        pin: values.pin,
      });
      const { token, tenantId, organizations } = res.data;

      applyPersonalWalletContext(token, tenantId);
      localStorage.setItem('credoUserPhone', values.phone);

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
      setLoading(false);
    }
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
      notifications.show({ title: 'Account created', message: 'You can now log in', color: 'green' });
      setTab('login');
      loginForm.setValues({ phone: values.phone, pin: '' });
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
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
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
            Verifiable Commerce Platform
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
                    label="Phone number"
                    placeholder="263771234567"
                    leftSection={<IconPhone size={16} />}
                    size="md"
                    inputMode="tel"
                    {...loginForm.getInputProps('phone')}
                  />
                  <PasswordInput
                    label="PIN"
                    placeholder="Enter your PIN"
                    leftSection={<IconLock size={16} />}
                    size="md"
                    inputMode="numeric"
                    {...loginForm.getInputProps('pin')}
                  />
                  <Button type="submit" size="lg" fullWidth loading={loading} mt="xs">
                    Sign in
                  </Button>
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
          Manage your org and workflows at{' '}
          <Anchor size="xs" href="#" c="credentis.6">
            credentis.app
          </Anchor>
        </Text>
      </Box>
    </Box>
  );
}
