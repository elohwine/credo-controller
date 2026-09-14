/**
 * SyncDialog — mobile wallet backup & recovery modal.
 * Mirrors portal's components/recovery/SyncDialog but uses Mantine only (no Tailwind).
 * Calls the same /api/ssi/auth/sync endpoint as the portal.
 */
import React, { useState } from 'react';
import {
  Modal,
  Stack,
  Text,
  Button,
  Group,
  ThemeIcon,
  Progress,
  rem,
  Box,
  List,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconCloudDownload,
  IconCheck,
  IconRefresh,
  IconWallet,
  IconShieldCheck,
  IconReceipt,
} from '@tabler/icons-react';
import api from '@/lib/api';
import { getPreferredToken } from '@/lib/auth';

interface SyncDialogProps {
  opened: boolean;
  onClose: () => void;
  onSyncComplete?: () => void;
}

export const SyncDialog: React.FC<SyncDialogProps> = ({ opened, onClose, onSyncComplete }) => {
  const [status, setStatus] = useState<'prompt' | 'syncing' | 'complete' | 'error'>('prompt');
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSync = async () => {
    setStatus('syncing');
    setProgress(10);
    const token = getPreferredToken();
    try {
      await api.post('/api/ssi/auth/sync', {}, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      // Animate progress for premium feel
      for (let i = 20; i <= 100; i += 15) {
        setProgress(i);
        await new Promise(r => setTimeout(r, 120));
      }
      setProgress(100);
      setStatus('complete');
      notifications.show({
        title: 'Wallet synced',
        message: 'Your credentials are backed up and recoverable from any device.',
        color: 'green',
        icon: <IconCheck size={18} />,
      });
      setTimeout(() => {
        onSyncComplete?.();
        onClose();
        setStatus('prompt');
        setProgress(0);
      }, 1400);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Sync failed';
      setErrorMsg(msg);
      setStatus('error');
    }
  };

  const handleClose = () => {
    if (status === 'syncing') return;
    setStatus('prompt');
    setProgress(0);
    setErrorMsg('');
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      withCloseButton={status !== 'syncing'}
      centered
      size="sm"
      radius="xl"
      padding="xl"
      title={null}
    >
      <Stack gap="xl" align="center">
        <ThemeIcon
          size={72}
          radius={100}
          variant="gradient"
          gradient={
            status === 'complete'
              ? { from: 'teal', to: 'green' }
              : status === 'error'
              ? { from: 'red', to: 'orange' }
              : { from: 'blue', to: 'cyan' }
          }
        >
          {status === 'complete' ? (
            <IconCheck style={{ width: rem(36), height: rem(36) }} />
          ) : status === 'syncing' ? (
            <IconRefresh style={{ width: rem(36), height: rem(36), animation: 'spin 1s linear infinite' }} />
          ) : (
            <IconCloudDownload style={{ width: rem(36), height: rem(36) }} />
          )}
        </ThemeIcon>

        <Stack gap="xs" align="center">
          <Text fw={700} size="xl" ta="center">
            {status === 'complete'
              ? 'Wallet Backed Up'
              : status === 'syncing'
              ? 'Syncing Wallet…'
              : status === 'error'
              ? 'Sync Failed'
              : 'Backup & Recovery'}
          </Text>
          <Text size="sm" c="dimmed" ta="center" maw={320}>
            {status === 'complete'
              ? 'Your credentials are securely stored and can be recovered on any device using your phone number and PIN.'
              : status === 'syncing'
              ? 'Securely linking your wallet to the Credentis custodial backup…'
              : status === 'error'
              ? errorMsg
              : 'Sync your wallet to the Credentis secure backup. This lets you recover all credentials if you switch devices.'}
          </Text>
        </Stack>

        {status === 'prompt' && (
          <Box w="100%">
            <List spacing="xs" size="sm" icon={<ThemeIcon size={18} radius="xl" color="blue" variant="light"><IconShieldCheck size={12} /></ThemeIcon>}>
              <List.Item>Encrypted backup using your account keys</List.Item>
              <List.Item>Recover credentials on any device</List.Item>
              <List.Item>Web wallet (portal) stays in sync</List.Item>
              <List.Item>No credentials shared with third parties</List.Item>
            </List>
          </Box>
        )}

        {status === 'syncing' && (
          <Stack w="100%" gap="xs">
            <Progress value={progress} color="blue" size="sm" radius="xl" striped animated />
            <Text size="xs" c="dimmed" ta="center">Securely re-issuing credentials…</Text>
          </Stack>
        )}

        <Group w="100%" grow>
          {status === 'prompt' && (
            <>
              <Button variant="subtle" color="gray" onClick={handleClose}>Later</Button>
              <Button
                variant="gradient"
                gradient={{ from: 'blue', to: 'cyan' }}
                leftSection={<IconCloudDownload size={16} />}
                onClick={handleSync}
              >
                Sync now
              </Button>
            </>
          )}
          {status === 'error' && (
            <>
              <Button variant="subtle" color="gray" onClick={handleClose}>Close</Button>
              <Button color="blue" onClick={handleSync}>Retry</Button>
            </>
          )}
        </Group>
      </Stack>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </Modal>
  );
};

export default SyncDialog;
