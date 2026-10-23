import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { Alert, Box, Button, Center, Checkbox, Loader, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { IconAlertCircle, IconUserCheck } from '@tabler/icons-react';
import api from '@/lib/api';
import { applyPersonalWalletContext } from '@/lib/auth';
import { rememberPhoneWallet } from '@/lib/deviceTrust';
import { roleLabel } from '../../../shared/orgPeople';

interface InviteSummary {
  orgName: string;
  role: string;
  proposedName?: string;
  phoneHint?: string;
}

/**
 * Opened from the invite link an organisation sent to this phone. The person confirms their
 * name and the invited number, and chooses their own PIN. Nobody else ever knows it.
 */
export default function JoinPage() {
  const router = useRouter();
  const code = typeof router.query.code === 'string' ? router.query.code : '';
  const [invite, setInvite] = useState<InviteSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [whatsappAlerts, setWhatsappAlerts] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);

  useEffect(() => {
    if (!router.isReady) return;
    if (!code) {
      setLoadError('This invite link is incomplete. Ask the person who invited you to send it again.');
      return;
    }
    api
      .get(`/api/wallet/auth/invite/${encodeURIComponent(code)}`)
      .then((res) => {
        setInvite(res.data);
        setName(res.data?.proposedName || '');
      })
      .catch((err) =>
        setLoadError(err.response?.data?.message || 'This invite link has expired or was replaced by a newer one.'),
      );
  }, [router.isReady, code]);

  const pinError = pin && !/^\d{4,6}$/.test(pin) ? 'Use 4 to 6 digits' : null;
  const confirmError = confirmPin && confirmPin !== pin ? 'PINs do not match' : null;
  const ready =
    name.trim().length >= 2 && phone.trim().length >= 9 && !pinError && !confirmError && Boolean(pin) && Boolean(confirmPin);

  const accept = async () => {
    if (!ready || submitting.current) return;
    submitting.current = true;
    setSaving(true);
    setError(null);
    try {
      const res = await api.post('/api/wallet/auth/invite/accept', {
        code,
        name: name.trim(),
        phone: phone.trim(),
        pin,
        whatsappAlerts,
      });
      applyPersonalWalletContext(res.data.token, res.data.tenantId);
      rememberPhoneWallet(res.data.tenantId);
      localStorage.setItem('credoUserPhone', phone.trim());
      const { rememberCurrentAccount } = await import('@/lib/savedAccounts');
      rememberCurrentAccount(phone.trim());
      void import('@/lib/offline/walletSnapshotSync').then(({ syncWalletSnapshot }) => syncWalletSnapshot()).catch(() => undefined);
      router.replace('/inbox');
    } catch (err: any) {
      setError(err.response?.data?.message ?? err.message ?? 'Could not accept the invite');
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };

  return (
    <Box p="md" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Paper withBorder radius="md" p="lg" w="100%" maw={420}>
        {!invite && !loadError ? (
          <Center py="xl"><Loader size="sm" /></Center>
        ) : loadError || !invite ? (
          <Stack gap="sm">
            <Alert color="red" icon={<IconAlertCircle size={16} />}>{loadError}</Alert>
            <Button variant="light" onClick={() => router.replace('/login')}>Go to sign in</Button>
          </Stack>
        ) : (
          <Stack gap="sm">
            <Stack gap={2}>
              <IconUserCheck size={28} />
              <Title order={4}>Join {invite.orgName}</Title>
              <Text size="sm" c="dimmed">
                You were added as {roleLabel(invite.role)}. Confirm your name and choose your own PIN. Only you will know it.
              </Text>
            </Stack>
            <TextInput label="Your name" description="This is how your team sees you." value={name} onChange={(e) => setName(e.target.value)} required />
            <TextInput
              label="Your phone number"
              description={invite.phoneHint ? `The number this invite was sent to (ends ${invite.phoneHint.replace(/\D/g, '')})` : 'The number this invite was sent to'}
              placeholder="+263..."
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
            <PasswordInput label="Choose a PIN" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value)} error={pinError} required />
            <PasswordInput label="Repeat PIN" inputMode="numeric" maxLength={6} value={confirmPin} onChange={(e) => setConfirmPin(e.target.value)} error={confirmError} required />
            <Checkbox
              label={`Send me WhatsApp alerts from ${invite.orgName}`}
              description="New tasks, staff cards, requests and payments. Turn them off any time in Settings → Alerts."
              checked={whatsappAlerts}
              onChange={(e) => setWhatsappAlerts(e.currentTarget.checked)}
            />
            {error && <Alert color="red" icon={<IconAlertCircle size={16} />}>{error}</Alert>}
            <Button onClick={() => void accept()} loading={saving} disabled={!ready}>Join and sign in</Button>
          </Stack>
        )}
      </Paper>
    </Box>
  );
}
