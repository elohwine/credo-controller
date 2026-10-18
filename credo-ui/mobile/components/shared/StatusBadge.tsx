import React from 'react';
import { Badge } from '@mantine/core';

type StatusValue = 'pending' | 'done' | 'error' | 'expired' | 'valid' | 'archived' | 'withdrawn' | 'replaced';

interface StatusBadgeProps {
  status: StatusValue | string;
  /** Sit on a coloured card. Ignores light and dark theme colours. */
  onColor?: boolean;
}

const STATUS_COLOR: Record<string, string> = {
  pending: 'orange',
  done: 'green',
  error: 'red',
  expired: 'gray',
  valid: 'green',
  archived: 'gray',
  withdrawn: 'red',
  replaced: 'orange',
};

/** Plain words where the key itself would read oddly. */
const STATUS_LABEL: Record<string, string> = {
  withdrawn: 'Withdrawn',
  replaced: 'Replaced',
};

export default function StatusBadge({ status, onColor }: StatusBadgeProps) {
  const normalized = String(status || 'pending').toLowerCase();
  const label = STATUS_LABEL[normalized] || normalized.charAt(0).toUpperCase() + normalized.slice(1);

  if (onColor) {
    const ink = normalized === 'withdrawn' || normalized === 'error'
      ? '#fecaca'
      : normalized === 'replaced' || normalized === 'pending'
        ? '#fde68a'
        : normalized === 'expired' || normalized === 'archived'
          ? '#e5e7eb'
          : '#ffffff';
    return (
      <Badge
        size="sm"
        variant="filled"
        styles={{
          root: {
            background: 'rgba(0,0,0,0.55)',
            color: ink,
            textTransform: 'none',
          },
          label: { color: ink },
        }}
      >
        {label}
      </Badge>
    );
  }

  return (
    <Badge size="xs" variant="light" color={STATUS_COLOR[normalized] || 'gray'}>
      {label}
    </Badge>
  );
}
