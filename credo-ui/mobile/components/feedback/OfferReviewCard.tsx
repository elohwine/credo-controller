import { Avatar, Box, Group, Paper, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconLock, IconShieldCheck } from '@tabler/icons-react';

type OfferKind = 'credential_offer' | 'receipt_offer' | 'invoice_offer';

type Props = {
  kind: OfferKind;
  title?: string;
  description?: string;
  issuerName?: string;
  issuerLogoUrl?: string;
  savesTo: 'personal' | 'org';
  orgLabel?: string;
};

const WHAT: Record<OfferKind, string> = {
  credential_offer: 'A card for your wallet',
  receipt_offer: 'A receipt for your payment',
  invoice_offer: 'A bill to pay',
};

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join('') || '?';
}

/** Review before accepting: who sent it, what it is, where it is kept, and why it can be trusted. */
export function OfferReviewCard({ kind, title, description, issuerName, issuerLogoUrl, savesTo, orgLabel }: Props) {
  const from = (issuerName || '').trim() || 'An organisation';
  const where = savesTo === 'org' ? `${orgLabel || 'Your organisation'}'s records` : 'Your personal wallet';
  return (
    <Paper withBorder radius="md" p="sm">
      <Group gap="sm" wrap="nowrap" mb="xs">
        <Avatar src={issuerLogoUrl || undefined} radius="xl" color="violet" size={36}>
          {initials(from)}
        </Avatar>
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Text size="xs" c="dimmed">From</Text>
          <Text fw={700} size="sm" lineClamp={1}>{from}</Text>
        </Box>
      </Group>
      <Stack gap={4}>
        <Text size="sm"><Text span c="dimmed">What: </Text>{title ? `${title} (${WHAT[kind].toLowerCase()})` : WHAT[kind]}</Text>
        {description && <Text size="sm"><Text span c="dimmed">Why you received this: </Text>{description}</Text>}
        {kind !== 'invoice_offer' && <Text size="sm"><Text span c="dimmed">Saved to: </Text>{where}</Text>}
        <Group gap={6} wrap="nowrap" mt={4} align="flex-start">
          <ThemeIcon size={18} radius="xl" color="green" variant="light"><IconShieldCheck size={12} /></ThemeIcon>
          <Text size="xs" c="dimmed">The sender is shown above. Card signatures can be checked after acceptance; this preview is not a verification result.</Text>
        </Group>
        {kind !== 'invoice_offer' && (
          <Group gap={6} wrap="nowrap" align="flex-start">
            <ThemeIcon size={18} radius="xl" color="gray" variant="light"><IconLock size={12} /></ThemeIcon>
            <Text size="xs" c="dimmed">Review any request to share details before you agree.</Text>
          </Group>
        )}
      </Stack>
    </Paper>
  );
}
