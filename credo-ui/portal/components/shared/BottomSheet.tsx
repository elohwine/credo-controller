import React from 'react';
import { Drawer } from '@mantine/core';

interface BottomSheetProps {
  opened: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export default function BottomSheet({ opened, onClose, title, children }: BottomSheetProps) {
  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="bottom"
      size="auto"
      radius="lg"
      title={title}
      styles={{ content: { borderRadius: '16px 16px 0 0' } }}
    >
      {children}
    </Drawer>
  );
}
