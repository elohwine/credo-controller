import React, { useContext, useEffect, useMemo, useState } from 'react';
import { milestone } from '@/components/feedback/Milestone';
import axios from 'axios';
import { useRouter } from 'next/router';
import { Alert, Badge, Box, Button, Card, Center, Group, Loader, Paper, Radio, Stack, Switch, Text, TextInput, Title } from '@mantine/core';
import { IconAlertCircle, IconArrowRight, IconCheck, IconDeviceMobile, IconShieldCheck, IconX } from '@tabler/icons-react';
import { EnvContext } from '@/pages/_app';
import { clientPayCopy } from '@/components/finance/financeStages';
import { getPersonalWalletToken } from '@/utils/portalTenant';

interface PaymentDetails {
  linkId: string;
  description: string;
  amount: number;
  currency: string;
  merchantName?: string;
  status: string;
  kind?: 'quote' | 'invoice';
  providerRef?: string;
  invoiceRef?: string;
  availableMethods: string[];
  availableMethodDetails?: Array<{ providerId: string; providerName: string }>;
}

function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount);
}

/** Client pay page: the link a client gets by text for a job bill or an extra-work quote. Same flow as the phone. */
export default function PortalPayPage() {
  const router = useRouter();
  const env = useContext(EnvContext);
  const backend = env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000';
  const code = String(router.query.code || '');
  const encodedCode = encodeURIComponent(code);

  const [payment, setPayment] = useState<PaymentDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [declined, setDeclined] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState('');
  const [phone, setPhone] = useState('');
  const [saveToWallet, setSaveToWallet] = useState(true);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ providerRef?: string; instructions?: string } | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const copy = useMemo(() => clientPayCopy(payment?.kind), [payment?.kind]);

  useEffect(() => {
    setSignedIn(Boolean(getPersonalWalletToken()));
  }, []);

  useEffect(() => {
    if (!code) return;
    setLoading(true);
    setError(null);
    axios
      .get(`${backend}/api/public/pay/${encodedCode}`)
      .then(({ data }) => {
        if (!data?.found) {
          setError(data?.error || 'Payment link not found');
          return;
        }
        setPayment(data.payment);
        if (data.payment?.availableMethods?.length > 0) setSelectedMethod(data.payment.availableMethods[0]);
      })
      .catch((e) => {
        const message = e.response?.data?.error || e.response?.data?.message || 'Could not load this payment';
        if (e.response?.status === 410 && /declined/i.test(message)) setDeclined(true);
        else setError(message);
      })
      .finally(() => setLoading(false));
  }, [backend, code, encodedCode]);

  const goLogin = () => router.push(`/auth/login?returnUrl=${encodeURIComponent(`/pay/${code}`)}`);

  const scopedToken = async (): Promise<string | null> => {
    const personal = getPersonalWalletToken();
    if (!personal) return null;
    try {
      const { data } = await axios.post(`${backend}/api/ssi/auth/session`, { expiresInSeconds: 900 }, { headers: { Authorization: `Bearer ${personal}` } });
      return data?.token || personal;
    } catch {
      return personal;
    }
  };

  const declineQuote = async () => {
    setDeclining(true);
    setPayError(null);
    try {
      await axios.post(`${backend}/api/public/pay/${encodedCode}/decline`, {});
      setDeclined(true);
    } catch (e: any) {
      setPayError(e.response?.data?.message || e.message || 'Could not decline the quote');
    } finally {
      setDeclining(false);
    }
  };

  const submitPayment = async () => {
    if (!payment || !selectedMethod) return;
    const token = await scopedToken();
    if (!token) {
      goLogin();
      return;
    }
    if (!phone.trim()) {
      setPayError('Enter your mobile number.');
      return;
    }
    setPaying(true);
    setPayError(null);
    try {
      const idempotencyKey = ['portal-public-pay', encodedCode, selectedMethod, phone.trim().replace(/\s+/g, ''), saveToWallet ? 'wallet' : 'nowallet'].join(':');
      const { data } = await axios.post(
        `${backend}/api/public/pay/${encodedCode}/pay`,
        { paymentMethod: selectedMethod, customerMsisdn: phone.trim(), saveToWallet },
        { headers: { Authorization: `Bearer ${token}`, 'x-idempotency-key': idempotencyKey } },
      );
      setSuccess({ providerRef: data?.providerRef, instructions: data?.instructions });
      if (/^(success|paid|completed)$/i.test(String(data?.status || ''))) {
        milestone.show({ kind: 'payment_done', title: 'Payment made', detail: 'Your invoice and receipt are on their way to your records.' });
      }
    } catch (e: any) {
      if (e.response?.status === 401 || e.response?.status === 403) {
        goLogin();
        return;
      }
      setPayError(e.response?.data?.message || e.message || 'Payment failed');
    } finally {
      setPaying(false);
    }
  };

  const shell = (children: React.ReactNode) => (
    <Box maw={480} mx="auto" py="lg" px="md">
      <Stack gap="md">{children}</Stack>
    </Box>
  );

  if (loading) return <Center py="xl"><Loader /></Center>;

  if (declined) {
    return shell(
      <Alert color="gray" icon={<IconX size={16} />} title={copy.declinedTitle}>
        {copy.declinedBody}
      </Alert>,
    );
  }

  if (error || !payment) {
    return shell(
      <Alert color="red" icon={<IconAlertCircle size={16} />} title="This link cannot be used">
        {error || 'Payment not found.'}
      </Alert>,
    );
  }

  if (payment.status === 'paid' || success) {
    const reference = success?.providerRef || payment.providerRef;
    return shell(
      <>
        <Alert color="green" icon={<IconCheck size={16} />} title={success && !success.providerRef ? 'Payment submitted' : copy.paidTitle}>
          {success?.instructions || copy.paidBody}
        </Alert>
        {reference && (
          <Paper withBorder p="sm" radius="md">
            <Text size="xs" c="dimmed">{copy.referenceLabel}</Text>
            <Text fw={600}>{reference}</Text>
          </Paper>
        )}
        {signedIn && <Button variant="light" onClick={() => router.push('/inbox')}>{copy.openRecordsLabel}</Button>}
      </>,
    );
  }

  return shell(
    <>
      <Box>
        <Title order={3}>{copy.title}</Title>
        <Text size="sm" c="dimmed">{payment.merchantName || 'Business'}</Text>
      </Box>

      <Card withBorder radius="md" p="md">
        <Stack gap={6}>
          <Text fw={700} size="xl">{formatAmount(payment.amount, payment.currency)}</Text>
          <Text fw={600}>{payment.description}</Text>
          {payment.invoiceRef && <Badge variant="light">{payment.kind === 'quote' ? 'Job' : 'Invoice'}: {payment.invoiceRef}</Badge>}
        </Stack>
      </Card>

      <Card withBorder radius="md" p="md">
        <Stack gap="sm">
          <Text fw={600}>Payment method</Text>
          <Radio.Group value={selectedMethod} onChange={setSelectedMethod}>
            <Stack gap={8}>
              {payment.availableMethods.map((method) => (
                <Radio key={method} value={method} label={payment.availableMethodDetails?.find((m) => m.providerId === method)?.providerName || method} />
              ))}
            </Stack>
          </Radio.Group>
        </Stack>
      </Card>

      <TextInput
        label={copy.phoneLabel}
        description={copy.phoneHelp}
        required
        placeholder="e.g. 0771234567"
        value={phone}
        onChange={(e) => setPhone(e.currentTarget.value)}
        leftSection={<IconDeviceMobile size={16} />}
      />
      <Switch checked={saveToWallet} onChange={(e) => setSaveToWallet(e.currentTarget.checked)} label={copy.keepLabel} description={copy.keepHelp} color="teal" />

      {!signedIn && (
        <Alert color="blue" icon={<IconShieldCheck size={16} />}>
          Sign in to pay and keep your receipt.
        </Alert>
      )}
      {payError && <Alert color="red" icon={<IconAlertCircle size={16} />}>{payError}</Alert>}

      <Group grow>
        {signedIn ? (
          <Button onClick={submitPayment} loading={paying} disabled={!selectedMethod}>
            {copy.payLabel} {formatAmount(payment.amount, payment.currency)}
          </Button>
        ) : (
          <Button onClick={goLogin} leftSection={<IconArrowRight size={16} />}>Sign in to pay</Button>
        )}
      </Group>
      {copy.canDecline && (
        <Button variant="subtle" color="gray" leftSection={<IconX size={16} />} onClick={declineQuote} loading={declining}>
          {copy.declineLabel}
        </Button>
      )}
    </>,
  );
}
