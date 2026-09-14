import React from 'react';
import { Alert } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';

interface ErrorAlertProps {
  message: string | null;
  title?: string;
  mb?: string | number;
}

export default function ErrorAlert({ message, title, mb }: ErrorAlertProps) {
  return (
    <Alert icon={<IconAlertCircle size={16} />} color="red" radius="sm" title={title} mb={mb}>
      {message ?? ''}
    </Alert>
  );
}