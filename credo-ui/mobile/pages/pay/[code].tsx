import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Center,
  Group,
  Loader,
  Paper,
  Radio,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconAlertCircle,
  IconArrowRight,
  IconCheck,
  IconCreditCard,
  IconDeviceMobile,
  IconExternalLink,
  IconFlask,
  IconMoneybag,
  IconRefresh,
  IconShieldCheck,
} from '@tabler/icons-react';
import AppShellMobile from '@/components/layout/AppShellMobile';
import api from '@/lib/api';
import { getPersonalWalletTenantId, getPersonalWalletToken } from '@/lib/auth';

interface PaymentDetails {
  linkId: string;
  description: string;
  amount: number;
  currency: string;
  merchantName?: string;
  status: string;
  providerRef?: string;
  paidAt?: string;
  invoiceRef?: string;
  availableMethods: string[];
  availableMethodDetails?: Array<{
    providerId: string;
    providerName: string;
    type: 'ussd' | 'redirect' | 'other';
    logo?: string;
  }>;
  branding?: {
    logo?: string;
    primaryColor?: string;
    receiptFooter?: string;
    supportContact?: string;
  };
}
const PLATFORM_LOGO = '/icon.png';

interface RefreshedPaymentLink {
  refreshed: true;
  linkId: string;
  invoiceRef?: string;
  code: string;
  url: string;
  expiresAt: string;
}

const METHOD_LABELS: Record<string, string> = {
  ecocash: 'EcoCash',
  clicknpay: 'ClicknPay',
  simulated: 'Demo Payment (instant)',
};

const METHOD_DESCRIPTIONS: Record<string, string> = {
  ecocash: 'Pay via EcoCash mobile money',
  clicknpay: 'Pay with card via ClicknPay',
  simulated: 'Simulated payment for testing - instant confirmation',
};

function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

export default function MobilePayPage() {
  const router = useRouter();
  const code = String(router.query.code || '');
  const encodedCode = encodeURIComponent(code);
  const resumeOrgTenantId = typeof router.query.orgTenantId === 'string' ? router.query.orgTenantId.trim() : '';

  const [payment, setPayment] = useState<PaymentDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMethod, setSelectedMethod] = useState('');
  const [phone, setPhone] = useState('');
  const [saveToWallet, setSaveToWallet] = useState(true);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ providerRef?: string; instructions?: string; checkoutUrl?: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const authToken = useMemo(() => getPersonalWalletToken(), []);
  const isAuthenticated = Boolean(authToken);

  const getScopedWalletToken = async (): Promise<string | null> => {
    const personalToken = getPersonalWalletToken();
    if (!personalToken) return null;

    try {
      const { data } = await api.post(
        '/api/ssi/auth/session',
        { expiresInSeconds: 900 },
        {
          headers: { Authorization: `Bearer ${personalToken}` },
          skipAuthRedirect: true as any,
        } as any,
      );

      return data?.token || personalToken;
    } catch {
      return personalToken;
    }
  };

  const getProviderIcon = (providerId: string) => {
    const normalized = providerId.toLowerCase();
    if (normalized.includes('ecocash')) return <IconMoneybag size={18} />;
    if (normalized.includes('click')) return <IconCreditCard size={18} />;
    if (normalized.includes('simulated')) return <IconFlask size={18} />;
    return <IconCreditCard size={18} />;
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const savedPhone = localStorage.getItem('walletPhone') || localStorage.getItem('credoUserPhone') || '';
    if (savedPhone) setPhone(savedPhone);
  }, []);

  useEffect(() => {
    if (!code) return;
    setLoading(true);
    setError(null);

    api
      .get(`/api/public/pay/${encodedCode}`, {
        // Public checkout details endpoint; prevent auth interceptor from redirecting.
        skipAuthRedirect: true as any,
      } as any)
      .then(({ data }) => {
        if (!data?.found) {
          setError(data?.error || 'Payment link not found');
          return;
        }

        const details = data.payment as PaymentDetails;
        setPayment(details);
        if (details.availableMethods?.length > 0) {
          setSelectedMethod(details.availableMethods[0]);
        }
      })
      .catch((e) => {
        setError(e.response?.data?.error || e.response?.data?.message || 'Failed to load payment details');
      })
      .finally(() => setLoading(false));
  }, [code, encodedCode]);

  const goLogin = () => {
    const target = code ? `/pay/${encodeURIComponent(code)}` : '/';
    router.push(`/login?returnTo=${encodeURIComponent(target)}`);
  };

  const openFinanceResume = () => {
    const invoiceRef = String(payment?.invoiceRef || '').trim();
    const params = new URLSearchParams();
    params.set('tab', 'invoices');
    if (invoiceRef) params.set('invoiceRef', invoiceRef);
    if (code) params.set('code', code);
    if (resumeOrgTenantId) params.set('orgTenantId', resumeOrgTenantId);
    router.push(`/finance?${params.toString()}`);
  };

  const refreshExpiredLink = async () => {
    if (!code) return;
    const scopedToken = await getScopedWalletToken();
    if (!scopedToken) {
      goLogin();
      return;
    }

    setRefreshing(true);
    setRefreshError(null);
    try {
      const { data } = await api.post<RefreshedPaymentLink>(
        `/api/public/pay/${encodedCode}/refresh`,
        {},
        {
          headers: { Authorization: `Bearer ${scopedToken}` },
          skipAuthRedirect: true as any,
        } as any,
      );

      if (!data?.code) {
        throw new Error('Refresh completed but no new code was returned');
      }

      router.replace(`/pay/${encodeURIComponent(data.code)}`);
    } catch (e: any) {
      const status = e.response?.status;
      const message = e.response?.data?.message || e.message || 'Failed to refresh payment link';
      if (status === 401 || status === 403) {
        goLogin();
        return;
      }
      setRefreshError(message);
    } finally {
      setRefreshing(false);
    }
  };

  const submitPayment = async () => {
    if (!code || !payment || !selectedMethod) return;
    const scopedToken = await getScopedWalletToken();
    if (!scopedToken) {
      goLogin();
      return;
    }

    if (!phone.trim()) {
      setPayError('Mobile number is required to link InvoiceVC and ReceiptVC to your wallet.');
      return;
    }

    setPaying(true);
    setPayError(null);

    try {
      const idempotencyKey = [
        'mobile-public-pay',
        encodedCode,
        selectedMethod,
        phone.trim().replace(/\s+/g, ''),
        saveToWallet ? 'wallet' : 'nowallet',
      ].join(':');

      const { data } = await api.post(
        `/api/public/pay/${encodedCode}/pay`,
        {
          paymentMethod: selectedMethod,
          customerMsisdn: phone.trim(),
          saveToWallet,
        },
        {
          headers: {
            Authorization: `Bearer ${scopedToken}`,
            'x-idempotency-key': idempotencyKey,
          },
          skipAuthRedirect: true as any,
        } as any,
      );

      setSuccess({ providerRef: data?.providerRef, instructions: data?.instructions, checkoutUrl: data?.checkoutUrl });

      try {
        const walletTenantId = getPersonalWalletTenantId();
        await api.post(
          '/api/wallet/credentials/sync-receipts',
          {},
          ({
            headers: {
              Authorization: `Bearer ${scopedToken}`,
              'x-context-mode': 'personal',
              ...(walletTenantId ? { 'x-context-tenant-id': walletTenantId } : {}),
            },
            skipAuthRedirect: true,
          } as any)
        );
      } catch {
        // Non-fatal; inbox/wallet can sync later.
      }

      notifications.show({
        title: 'Payment submitted',
        message: 'Your invoice and receipt credentials will appear in Inbox/Wallet after confirmation.',
        color: 'green',
      });
    } catch (e: any) {
      const status = e.response?.status;
      const message = e.response?.data?.message || e.message || 'Payment failed';
      if (status === 401 || status === 403) {
        goLogin();
        return;
      }
      setPayError(message);
    } finally {
      setPaying(false);
    }
  };

  const isExpiredError = (error || '').toLowerCase().includes('expired');

  if (loading) {
    return (
      <AppShellMobile>
        <Center py="xl">
          <Loader />
        </Center>
      </AppShellMobile>
    );
  }

  if (error) {
    return (
      <AppShellMobile>
        <Stack gap="md" px="md" pt="md">
          <Alert color="red" icon={<IconAlertCircle size={16} />} title={isExpiredError ? 'Link expired' : 'Payment link unavailable'}>
            {error}
          </Alert>

          {isExpiredError && (
            <Card withBorder radius="md" p="md">
              <Stack gap="sm">
                <Text size="sm" c="dimmed">Refresh this invoice link to continue with the same invoice reference.</Text>
                <Button leftSection={<IconRefresh size={16} />} onClick={refreshExpiredLink} loading={refreshing}>
                  Refresh payment link
                </Button>
                {refreshError && <Text size="sm" c="red">{refreshError}</Text>}
              </Stack>
            </Card>
          )}
        </Stack>
      </AppShellMobile>
    );
  }

  if (!payment) {
    return (
      <AppShellMobile>
        <Center py="xl">
          <Text c="dimmed">Payment not found.</Text>
        </Center>
      </AppShellMobile>
    );
  }

  if (payment.status === 'paid') {
    return (
      <AppShellMobile>
        <Stack gap="md" px="md" pt="md">
          <Alert color="green" icon={<IconCheck size={16} />} title="Payment already completed">
            This payment link has already been paid.
          </Alert>
          {payment.providerRef && (
            <Paper withBorder p="sm" radius="md">
              <Text size="xs" c="dimmed">Provider Ref</Text>
              <Text fw={600}>{payment.providerRef}</Text>
            </Paper>
          )}
          <Group grow>
            <Button variant="light" onClick={() => router.push('/inbox?filter=receipts')}>Open Inbox</Button>
            {(payment.invoiceRef || resumeOrgTenantId) ? (
              <Button variant="default" onClick={openFinanceResume}>Resume In Finance</Button>
            ) : null}
          </Group>
        </Stack>
      </AppShellMobile>
    );
  }

  if (success) {
    return (
      <AppShellMobile>
        <Stack gap="md" px="md" pt="md">
          <Alert color="green" icon={<IconCheck size={16} />} title="Payment submitted">
            {success.instructions || 'Payment has been submitted successfully.'}
          </Alert>

          {success.providerRef && (
            <Paper withBorder p="sm" radius="md">
              <Text size="xs" c="dimmed">Provider Ref</Text>
              <Text fw={600}>{success.providerRef}</Text>
            </Paper>
          )}

          <Group grow>
            <Button variant="light" onClick={() => router.push('/inbox?filter=receipts')}>Open Inbox</Button>
            {(payment.invoiceRef || resumeOrgTenantId) ? (
              <Button variant="default" onClick={openFinanceResume}>Resume In Finance</Button>
            ) : null}
            {!isAuthenticated ? (
              <Button onClick={() => router.push('/login?returnTo=/proofs')}>Sign in to Wallet</Button>
            ) : null}
          </Group>

          {success.checkoutUrl && (
            <Button
              variant="default"
              leftSection={<IconExternalLink size={16} />}
              onClick={() => window.location.assign(success.checkoutUrl as string)}
            >
              Continue on Provider Page
            </Button>
          )}
        </Stack>
      </AppShellMobile>
    );
  }

  return (
    <AppShellMobile>
      <Stack gap="md" px="md" pt="md">
        <Box>
          <Title order={3}>Complete Payment</Title>
          <Text size="sm" c="dimmed">{payment.merchantName || 'Credentis Merchant'}</Text>
        </Box>

        <Card withBorder radius="md" p="md">
          <Stack gap={6}>
            <Group justify="space-between" align="flex-start">
              <Box>
                <Text fw={700} size="xl">{formatAmount(payment.amount, payment.currency)}</Text>
                <Text fw={600}>{payment.description}</Text>
              </Box>
              <img
                src={payment.branding?.logo || PLATFORM_LOGO}
                alt={`${payment.merchantName || 'Merchant'} logo`}
                style={{ width: 42, height: 42, objectFit: 'contain', borderRadius: 8 }}
              />
            </Group>
            {payment.invoiceRef && <Badge variant="light">Invoice: {payment.invoiceRef}</Badge>}
          </Stack>
        </Card>

        <Card withBorder radius="md" p="md">
          <Stack gap="sm">
            <Text fw={600}>Payment method</Text>
            {payment.availableMethods.length === 0 && (
              <Alert color="yellow" icon={<IconAlertCircle size={16} />}>
                No payment methods are currently available for this invoice. Pull to refresh or try again shortly.
              </Alert>
            )}
            <Radio.Group value={selectedMethod} onChange={setSelectedMethod}>
              <Stack gap={8}>
                {payment.availableMethods.map((method) => (
                  <Radio
                    key={method}
                    value={method}
                    label={
                      <Group gap={8}>
                        {payment.availableMethodDetails?.find((m) => m.providerId === method)?.logo ? (
                          <img
                            src={payment.availableMethodDetails.find((m) => m.providerId === method)?.logo}
                            alt={`${method} logo`}
                            style={{ width: 18, height: 18, objectFit: 'contain' }}
                          />
                        ) : getProviderIcon(method)}
                        <Text size="sm">{METHOD_LABELS[method] || payment.availableMethodDetails?.find((m) => m.providerId === method)?.providerName || method}</Text>
                      </Group>
                    }
                    description={METHOD_DESCRIPTIONS[method] || undefined}
                  />
                ))}
              </Stack>
            </Radio.Group>
          </Stack>
        </Card>

        <TextInput
          label="Mobile Number"
          required
          placeholder="e.g. 0771234567 or +263771234567"
          value={phone}
          onChange={(e) => setPhone(e.currentTarget.value)}
          leftSection={<IconDeviceMobile size={16} />}
        />

        <Switch
          checked={saveToWallet}
          onChange={(e) => setSaveToWallet(e.currentTarget.checked)}
          label="Save invoice and receipt to my records"
          description="When enabled, InvoiceVC and ReceiptVC are issued to this wallet after payment confirmation."
          color="teal"
        />

        {!isAuthenticated ? (
          <Alert color="blue" icon={<IconShieldCheck size={16} />}>
            Sign in to complete payment and anchor receipts to your wallet identity.
          </Alert>
        ) : null}

        {payError && (
          <Alert color="red" icon={<IconAlertCircle size={16} />}>
            {payError}
          </Alert>
        )}

        {!isAuthenticated ? (
          <Button onClick={goLogin} leftSection={<IconArrowRight size={16} />}>
            Sign In to Pay
          </Button>
        ) : (
          <Button onClick={submitPayment} loading={paying} disabled={!selectedMethod || payment.availableMethods.length === 0}>
            Pay {formatAmount(payment.amount, payment.currency)}
          </Button>
        )}
      </Stack>
    </AppShellMobile>
  );
}
