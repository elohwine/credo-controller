import React from 'react';
import { Badge } from '@mantine/core';

type StatusValue = 'pending' | 'done' | 'error' | 'expired' | 'valid' | 'archived';

interface StatusBadgeProps {
  status: StatusValue | string;
}

const STATUS_COLOR: Record<string, string> = {
  pending: 'orange',
  done: 'green',
  error: 'red',
  expired: 'red',
  valid: 'green',
  archived: 'gray',
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const normalized = String(status || 'pending').toLowerCase();
  const label = normalized.charAt(0).toUpperCase() + normalized.slice(1);

  return (
    <Badge size="xs" variant="light" color={STATUS_COLOR[normalized] || 'gray'}>
      {label}
    </Badge>
  );
}
