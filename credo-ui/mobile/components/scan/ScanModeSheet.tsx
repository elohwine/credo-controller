import React from 'react';
import { Drawer, Stack, Text, Button, Group, Box, ThemeIcon, Tooltip } from '@mantine/core';
import {
  IconQrcode,
  IconShieldCheck,
  IconCamera,
  IconLock,
} from '@tabler/icons-react';

export type ScanMode =
  | 'save-credential'
  | 'verify-presentation'
  | 'capture-evidence'
  | 'verify-delivery'
  | 'approve-requisition'
  | 'release-funds'
  | 'acknowledge-requisition';

interface ScanModeSheetProps {
  opened: boolean;
  onClose: () => void;
  onSelect: ( mode: ScanMode) => void;
  /** Pass false when no org token is active — org-only modes will be hidden */
  hasOrgSession?: boolean;
}

const MODES: Array<{
  id: ScanMode;
  icon: React.ElementType;
  color: string;
  label: string;
  description: string;
  orgOnly: boolean;
}> = [
    {
      id: 'save-credential',
      icon: IconQrcode,
      color: '#2188ca',
      label: 'Save Credential',
      description: 'Scan a QR code to accept and save a verifiable credential to your wallet',
      orgOnly: false,
    },
    {
      id: 'verify-presentation',
      icon: IconShieldCheck,
      color: '#16a34a',
      label: 'Verify Presentation',
      description: 'Scan a presented credential QR to verify its authenticity and approve or reject',
      orgOnly: true,
    },
    {
      id: 'approve-requisition',
      icon: IconShieldCheck,
      color: '#4f46e5',
      label: 'Scan To Approve',
      description: 'Scan the QR shown on the portal to prove authority and approve a requisition',
      orgOnly: true,
    },
    {
      id: 'capture-evidence',
      icon: IconCamera,
      color: '#ea580c',
      label: 'Capture Evidence',
      description: 'Take a photo with GPS stamp and attach it to the current workflow as proof',
      orgOnly: true,
    },
    {
      id: 'verify-delivery',
      icon: IconQrcode,
      color: '#8b5cf6',
      label: 'Verify Delivery',
      description: 'Scan an order shortlink QR code to verify details and confirm delivery',
      orgOnly: true,
    },
  ];

export default function ScanModeSheet({ opened, onClose, onSelect, hasOrgSession = false }: ScanModeSheetProps) {
  // Filter out org-only modes entirely when there is no org session (matrix §20.3)
  const visibleModes = MODES.filter((m) => !m.orgOnly || hasOrgSession);

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="bottom"
      size="auto"
      radius="lg"
      title="What do you want to do?"
      styles={{ content: { borderRadius: '16px 16px 0 0' } }}
    >
      <Stack gap="sm" pb="lg">
        {visibleModes.map((mode) => {
          const Icon = mode.icon;
          return (
            <Button
              key={mode.id}
              variant="light"
              radius="md"
              size="lg"
              color="gray"
              onClick={() => { onClose(); onSelect(mode.id); }}
              styles={{ inner: { justifyContent: 'flex-start' } }}
              style={{ height: 'auto', padding: '12px 16px' }}
            >
              <Group gap="md" align="flex-start" wrap="nowrap">
                <ThemeIcon
                  size={44}
                  radius="md"
                  style={{ background: `${mode.color}18`, flexShrink: 0 }}
                >
                  <Icon size={22} color={mode.color} />
                </ThemeIcon>
                <Box style={{ textAlign: 'left' }}>
                  <Text fw={600} size="sm" c="dark">
                    {mode.label}
                  </Text>
                  <Text size="xs" c="dimmed" mt={2} style={{ whiteSpace: 'normal' }}>
                    {mode.description}
                  </Text>
                </Box>
              </Group>
            </Button>
          );
        })}

        {/* Inform holder-only users that org modes exist but require an org context */}
        {!hasOrgSession && (
          <Tooltip label="Switch to an org context in Settings to unlock these modes" withArrow position="top">
            <Box
              px="md"
              py="xs"
              style={{
                borderRadius: 8,
                background: '#f3f4f6',
                cursor: 'default',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <IconLock size={14} color="#9ca3af" />
              <Text size="xs" c="dimmed">
                Scan To Approve, Verify Presentation, Capture Evidence, and Verify Delivery require an active org context.
              </Text>
            </Box>
          </Tooltip>
        )}
      </Stack>
    </Drawer>
  );
}
