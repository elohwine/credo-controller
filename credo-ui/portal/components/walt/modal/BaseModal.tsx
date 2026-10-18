/**
 * BaseModal - Mantine-based modal with Credentis branding
 */

import { ReactNode } from 'react';
import { Modal, Group, ActionIcon, Text, Image, Box } from '@mantine/core';
import { IconChevronLeft } from '@tabler/icons-react';

type ModalProps = {
  show: boolean;
  onClose?: () => void;
  children: ReactNode;
  showBack?: boolean;
  onBackPress?: () => void;
  securedByWalt?: boolean;
  showClose?: boolean;
  title?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
};

export default function BaseModal({
  show,
  onClose = () => {},
  children,
  showBack = false,
  onBackPress,
  securedByWalt = true,
  showClose = true,
  title,
  size = 'md',
}: ModalProps) {
  return (
    <Modal
      title={title}
      opened={show}
      onClose={onClose}
      size={size}
      radius="lg"
      padding="lg"
      centered
      withCloseButton={showClose}
      closeButtonProps={{ 'aria-label': 'Close' }}
      overlayProps={{
        backgroundOpacity: 0.55,
        blur: 3,
      }}
    >
      {showBack && (
        <Group mb="md">
          <ActionIcon
            variant="subtle"
            color="gray"
            onClick={onBackPress}
            aria-label="Back"
            radius="xl"
          >
            <IconChevronLeft size={20} />
          </ActionIcon>
        </Group>
      )}

      {/* Content */}
      <Box>{children}</Box>

      {/* Footer - Secured by Credentis */}
      {securedByWalt && (
        <Group justify="center" mt="lg" gap="xs">
          <Image
            src="/credentis-logo.png"
            alt="Credentis"
            h={20}
            w="auto"
            fit="contain"
          />
          <Text size="xs" c="dimmed">
            Secured by Credentis
          </Text>
        </Group>
      )}
    </Modal>
  );
}
