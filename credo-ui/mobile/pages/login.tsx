import React, { useEffect, useRef, useState } from 'react';
import { milestone } from '@/components/feedback/Milestone';
import { GuidedSteps } from '@/components/feedback/GuidedSteps';
import { LottiePlayer } from '@/components/feedback/LottiePlayer';
import { WalletOnboarding } from '../../shared/WalletOnboarding';
import { BrandMark } from '../../shared/BrandMark';
import { useRouter } from 'next/router';
import {
  Box,
  Stack,
  Title,
  Text,
  TextInput,
  PasswordInput,
  Button,
  Divider,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconPhone, IconLock, IconFingerprint } from '@tabler/icons-react';
import api from '@/lib/api';
import { applyPersonalWalletContext } from '@/lib/auth';
import { authorizeDevice, loginDeviceAvailable, rememberPhoneWallet, rememberedWalletId } from '@/lib/deviceTrust';
import { friendlyRequestError } from '@/lib/requestError';
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
  const [setupStep, setSetupStep] = useState(1);
  const [layoutHeight, setLayoutHeight] = useState<number>();
  const [canUsePhone, setCanUsePhone] = useState(false);
  const submitting = useRef(false);

  useEffect(() => {
    let width = window.innerWidth;
    setLayoutHeight(window.innerHeight);
    try {
      setCanUsePhone(loginDeviceAvailable(rememberedWalletId() || undefined));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Use your account PIN to sign in.');
    }
    const resize = () => {
      // Keyboard height changes must not recenter the form underneath a submit tap.
      if (window.innerWidth === width) return;
      width = window.innerWidth;
      setLayoutHeight(window.innerHeight);
    };
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

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
      const msg = friendlyRequestError(err, 'Could not sign in');
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
      setError('Sign in with your account PIN, then enroll this phone under Account security.');
      return;
    }
    submitting.current = true;
    setLoading(true);
    setError(null);
    try {
      const verified = await authorizeDevice({ purpose: 'device_login', walletId });
      if (!verified.token || !verified.tenantId) throw new Error('The device sign-in was not completed.');
      applyPersonalWalletContext(verified.token, verified.tenantId);
      rememberPhoneWallet(verified.tenantId);
      const { rememberCurrentAccount } = await import('@/lib/savedAccounts');
      rememberCurrentAccount();
      const returnTo = router.query.returnTo as string | undefined;
      router.replace(returnTo ?? '/inbox');
    } catch (err: any) {
      const message = friendlyRequestError(err, 'Could not sign in with this phone');
      setError(/does not hold|identity card/i.test(message)
        ? 'Accept your identity card in Inbox, then try again.'
        : message);
    } finally {
      submitting.current = false;
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
      const msg = friendlyRequestError(err, 'Could not create your account');
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box className="login-screen" style={{ minHeight: layoutHeight ?? '100svh' }}>
      <Stack className="login-content" gap="xl">
        <Stack align="center" gap="xs">
          <Box className="login-brand" aria-hidden="true"><BrandMark size={52} /></Box>
          <Text fw={800} size="xl" className="login-brand-name">Credentis</Text>
        </Stack>
        <Stack gap="lg">
          <Stack gap={6}>
            <Title order={1} size="h2">{tab === 'login' ? 'Welcome back' : 'Your wallet starts here'}</Title>
            <Text c="dimmed" size="sm">
              {tab === 'login' ? 'Sign in to your cards, payments and work.' : 'A few simple steps, then you are ready.'}
            </Text>
          </Stack>
            {error && <ErrorAlert message={error} />}

            {tab === 'login' ? (
              <form onSubmit={loginForm.onSubmit(handleLogin)}>
                <Stack gap="md">
                  <TextInput
                    label="Phone or email"
                    placeholder="263771234567 or john@example.com"
                    leftSection={<IconPhone size={16} />}
                    size="md"
                    autoComplete="username"
                    inputMode="text"
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
                    visibilityToggleButtonProps={{ 'aria-label': 'Show or hide PIN' }}
                    {...loginForm.getInputProps('pin')}
                  />
                  <Button type="submit" size="lg" fullWidth loading={loading} mt="xs">
                    Sign in
                  </Button>
                  {canUsePhone && <>
                    <Divider label="or" />
                    <Button variant="light" size="lg" fullWidth leftSection={<IconFingerprint size={22} />} loading={loading} onClick={() => void handlePhoneLogin()}>
                      Sign in with this phone
                    </Button>
                    <Text size="xs" c="dimmed" ta="center">Confirm with strong biometrics or your phone screen lock.</Text>
                  </>}
                </Stack>
              </form>
            ) : setupStep < 3 ? (
              <WalletOnboarding
                key={setupStep}
                step={setupStep === 1 ? 1 : 2}
                illustration={<LottiePlayer kind={setupStep === 1 ? 'onboarding_receive' : 'onboarding_share'} size={176} />}
                onNext={() => setSetupStep(setupStep + 1)}
                onBack={() => setupStep === 1 ? setTab('login') : setSetupStep(1)}
              />
            ) : (
              <form onSubmit={registerForm.onSubmit(handleRegister)}>
                <Stack gap="sm">
                  <GuidedSteps current={3} total={3} />
                  <TextInput
                    label="Name"
                    placeholder="Your name"
                    size="md"
                    autoComplete="name"
                    {...registerForm.getInputProps('username')}
                  />
                  <TextInput
                    label="Phone number"
                    placeholder="263771234567"
                    leftSection={<IconPhone size={16} />}
                    size="md"
                    inputMode="tel"
                    autoComplete="tel"
                    {...registerForm.getInputProps('phone')}
                  />
                  <PasswordInput
                    label="PIN"
                    placeholder="Choose a PIN"
                    leftSection={<IconLock size={16} />}
                    size="md"
                    inputMode="numeric"
                    autoComplete="new-password"
                    visibilityToggleButtonProps={{ 'aria-label': 'Show or hide new PIN' }}
                    {...registerForm.getInputProps('pin')}
                  />
                  <PasswordInput
                    label="Confirm PIN"
                    placeholder="Repeat PIN"
                    leftSection={<IconLock size={16} />}
                    size="md"
                    inputMode="numeric"
                    autoComplete="new-password"
                    visibilityToggleButtonProps={{ 'aria-label': 'Show or hide confirmation PIN' }}
                    {...registerForm.getInputProps('confirmPin')}
                  />
                  <Button type="submit" size="lg" fullWidth loading={loading} mt="xs">
                    Create account
                  </Button>
                  <Button variant="subtle" disabled={loading} onClick={() => setSetupStep(2)}>Back</Button>
                </Stack>
              </form>
            )}
        </Stack>
        <Stack gap={4} align="center">
          <Text size="sm" c="dimmed">{tab === 'login' ? 'New to Credentis?' : 'Already have an account?'}</Text>
          <Button variant="subtle" fullWidth disabled={loading} onClick={() => {
            setTab(tab === 'login' ? 'register' : 'login');
            setSetupStep(1);
            setError(null);
          }}>
            {tab === 'login' ? 'Create account' : 'Back to sign in'}
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
