import React, { useEffect, useRef, useState } from 'react';
import { WelcomeScreen } from '../../shared/Guides';
import { GUIDE_PATHS } from '../../shared/guides';
import { guideClient } from '@/lib/guides';
import { tick } from '@/lib/feedback';
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
import { applyPersonalWalletContext, getPersonalWalletTenantId, syncOrgContextFromServer } from '@/lib/auth';
import { authorizeDevice, deviceLoginWalletId, loginDevices, rememberPhoneWallet, supportsDeviceLogin } from '@/lib/deviceTrust';
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
  const [welcomeName, setWelcomeName] = useState<string | null>(null);
  const submitting = useRef(false);

  useEffect(() => {
    let width = window.innerWidth;
    setLayoutHeight(window.innerHeight);
    const refreshPhoneLogin = () => {
      try {
        setCanUsePhone(supportsDeviceLogin() || loginDevices().length > 0);
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Use your account PIN to sign in.');
      }
    };
    refreshPhoneLogin();
    const resize = () => {
      // Keyboard height changes must not recenter the form underneath a submit tap.
      if (window.innerWidth === width) return;
      width = window.innerWidth;
      setLayoutHeight(window.innerHeight);
    };
    window.addEventListener('resize', resize);
    window.addEventListener('focus', refreshPhoneLogin);
    window.addEventListener('storage', refreshPhoneLogin);
    document.addEventListener('deviceready', refreshPhoneLogin);
    document.addEventListener('visibilitychange', refreshPhoneLogin);
    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('focus', refreshPhoneLogin);
      window.removeEventListener('storage', refreshPhoneLogin);
      document.removeEventListener('deviceready', refreshPhoneLogin);
      document.removeEventListener('visibilitychange', refreshPhoneLogin);
    };
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

  /** Signs in and restores this account's context. Shared by the sign-in form and new accounts. */
  const signIn = async (identifier: string, pin: string) => {
    const email = identifier.includes('@') ? identifier : undefined;
    const phone = email ? undefined : identifier;
    const res = await api.post('/api/wallet/auth/login', { phone, email, pin });
    const { token } = res.data;

    applyPersonalWalletContext(token);
    const tenantId = getPersonalWalletTenantId();
    if (!tenantId) throw new Error('The sign-in did not return a wallet identity.');
    rememberPhoneWallet(tenantId);
    await syncOrgContextFromServer();
    if (phone) localStorage.setItem('credoUserPhone', phone);
    const { rememberCurrentAccount } = await import('@/lib/savedAccounts');
    rememberCurrentAccount(identifier);
    // Read this person's name from their identity card now, so the account switcher shows it.
    void import('@/lib/offline/walletSnapshotSync').then(({ syncWalletSnapshot }) => syncWalletSnapshot()).catch(() => undefined);
    // Org context is NEVER set on login — user must manually switch via the org selector.
  };

  const handleLogin = async (values: typeof loginForm.values) => {
    // One tap signs in once, even if the keyboard closing fires a second submit.
    if (submitting.current) return;
    submitting.current = true;
    setLoading(true);
    setError(null);
    try {
      await signIn(values.identifier.trim(), values.pin);
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
    submitting.current = true;
    setLoading(true);
    setError(null);
    try {
      const walletId = deviceLoginWalletId();
      const verified = await authorizeDevice({ purpose: 'device_login', walletId });
      if (!verified.token || !verified.tenantId) throw new Error('The device sign-in was not completed.');
      applyPersonalWalletContext(verified.token, verified.tenantId);
      rememberPhoneWallet(verified.tenantId);
      await syncOrgContextFromServer();
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
    if (submitting.current) return;
    submitting.current = true;
    setLoading(true);
    setError(null);
    try {
      await api.post('/api/wallet/auth/register', {
        username: values.username,
        phone: values.phone,
        pin: values.pin,
      });
    } catch (err: any) {
      setError(friendlyRequestError(err, 'Could not create your account'));
      submitting.current = false;
      setLoading(false);
      return;
    }
    try {
      // The account exists: sign straight in rather than asking for the same PIN again.
      await signIn(values.phone.trim(), values.pin);
      setWelcomeName(values.username.trim());
    } catch {
      setTab('login');
      loginForm.setValues({ identifier: values.phone, pin: '' });
      setError('Your account is ready. Sign in with your phone number and PIN.');
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  };

  const finishWelcome = () => {
    void guideClient.put(`${GUIDE_PATHS.guides}/welcome`, { status: 'done' }).catch(() => undefined);
    router.replace('/inbox');
  };

  const guiding = tab === 'register' && setupStep < 3;

  if (welcomeName !== null) {
    return <WelcomeScreen name={welcomeName} onContinue={finishWelcome} onCardLanded={tick} />;
  }

  return (
    <Box className={`login-screen${guiding ? ' login-screen-guide' : ''}`} style={{ minHeight: guiding ? '100svh' : layoutHeight ?? '100svh' }}>
      <Stack className="login-content" gap="xl">
        <Box className="login-branding">
          <Box className="login-brand" aria-hidden="true"><BrandMark size={52} /></Box>
          <Text fw={800} size="xl" className="login-brand-name">Credentis</Text>
        </Box>
        <Stack gap="lg" className="login-main">
          {!guiding && <Stack gap={6} ta="center">
            <Title order={1} size="h2">{tab === 'login' ? 'Welcome back' : 'Create your account'}</Title>
            {tab === 'login' && <Text c="dimmed" size="sm">Sign in to your wallet.</Text>}
          </Stack>}
            {error && <ErrorAlert message={error} />}

            {tab === 'login' ? (
              <form onSubmit={loginForm.onSubmit(handleLogin)}>
                <Stack gap="md">
                  <TextInput
                    label="Phone or email"
                    placeholder="263771234567"
                    leftSection={<IconPhone size={16} />}
                    size="md"
                    autoComplete="username"
                    inputMode="text"
                    enterKeyHint="next"
                    {...loginForm.getInputProps('identifier')}
                  />
                  <PasswordInput
                    label="PIN"
                    placeholder="Account PIN"
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
                onSkip={() => setSetupStep(3)}
                onNext={() => setSetupStep(setupStep + 1)}
                onBack={() => setupStep === 1 ? setTab('login') : setSetupStep(1)}
              />
            ) : (
              <form onSubmit={registerForm.onSubmit(handleRegister)}>
                <Stack gap="sm">
                  <TextInput
                    label="Name"
                    placeholder="Full name"
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
                    placeholder="Choose PIN"
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
                  <Button variant="subtle" disabled={loading} onClick={() => setSetupStep(2)}>Back to guide</Button>
                </Stack>
              </form>
            )}
        </Stack>
        {!guiding && <Stack gap={4} align="center">
          <Text size="sm" c="dimmed">{tab === 'login' ? 'New to Credentis?' : 'Already have an account?'}</Text>
          <Button variant="subtle" fullWidth disabled={loading} onClick={() => {
            setTab(tab === 'login' ? 'register' : 'login');
            setSetupStep(1);
            setError(null);
          }}>
            {tab === 'login' ? 'Create account' : 'Back to sign in'}
          </Button>
        </Stack>}
      </Stack>
    </Box>
  );
}
