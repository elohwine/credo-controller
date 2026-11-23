import React, { useContext, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import { Alert, Box, Button, Center, Checkbox, Loader, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { IconAlertCircle, IconUserCheck } from '@tabler/icons-react';
import { EnvContext } from '@/pages/_app';
import { applyPersonalLogin } from '@/lib/personalSession';
import { roleLabel } from '../../../shared/orgPeople';
import { PhoneField } from '../../../shared/PhoneField';
import { BrandMark } from '../../../shared/BrandMark';

interface InviteSummary {
  orgName: string;
  role: string;
  proposedName?: string;
  phoneHint?: string;
}

/**
 * Opened from the invite link an organisation emailed or texted. Same steps as the phone app's
 * join page: confirm the name and invited number, choose a PIN only this person knows.
 */
export default function JoinPage() {
  const router = useRouter();
  const env = useContext(EnvContext);
  const backend = env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000';
  const code = typeof router.query.code === 'string' ? router.query.code : '';
  const [invite, setInvite] = useState<InviteSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [whatsappAlerts, setWhatsappAlerts] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);

  useEffect(() => {
    if (!router.isReady) return;
    if (!code) {
      setLoadError('This invite link is incomplete. Ask the person who invited you to send it again.');
      return;
    }
    axios
      .get(`${backend}/api/wallet/auth/invite/${encodeURIComponent(code)}`)
      .then((res) => {
        setInvite(res.data);
        setName(res.data?.proposedName || '');
      })
      .catch((err) =>
        setLoadError(err.response?.data?.message || 'This invite link has expired or was replaced by a newer one.'),
      );
  }, [router.isReady, code, backend]);

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
      const res = await axios.post(`${backend}/api/wallet/auth/invite/accept`, {
        code,
        name: name.trim(),
        phone: phone.trim(),
        pin,
        whatsappAlerts,
      });
      applyPersonalLogin(
        { token: res.data.token, tenantId: res.data.tenantId, claims: { displayName: res.data.name || name.trim(), phone: phone.trim() } },
        phone.trim(),
      );
      router.replace('/');
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
            <Button variant="light" onClick={() => router.replace('/auth/login')}>Go to sign in</Button>
          </Stack>
        ) : (
          <Stack gap="sm">
            <BrandMark size={36} />
            <Stack gap={2}>
              <IconUserCheck size={28} />
              <Title order={4}>Join {invite.orgName}</Title>
              <Text size="sm" c="dimmed">
                You were added as {roleLabel(invite.role)}. Confirm your name and choose your own PIN. Only you will know it.
              </Text>
            </Stack>
            <TextInput label="Your name" description="This is how your team sees you." value={name} onChange={(e) => setName(e.target.value)} required />
            <PhoneField
              surface="portal"
              label="Your phone number"
              description={invite.phoneHint ? `The number you were invited with (ends ${invite.phoneHint.replace(/\D/g, '')})` : 'The number you were invited with'}
              value={phone}
              onChange={setPhone}
              required
            />
            <PasswordInput label="Choose a PIN" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value)} error={pinError} required />
            <PasswordInput label="Repeat PIN" inputMode="numeric" maxLength={6} value={confirmPin} onChange={(e) => setConfirmPin(e.target.value)} error={confirmError} required />
            <Checkbox
              label={`Send me WhatsApp alerts from ${invite.orgName}`}
              description="New jobs, approvals and payments. Turn them off any time in Settings."
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
