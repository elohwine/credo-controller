import React from 'react';
import { Card, Group, Text, Stack, Box, Badge, Avatar, useMantineColorScheme, useMantineTheme } from '@mantine/core';
import { IconChevronRight, IconAlertTriangle } from '@tabler/icons-react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { formatCredentialType } from '@/lib/format';

dayjs.extend(relativeTime);

export interface InboxItemData {
  id: string;
  title: string;
  description: string;
  module: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  priority: 'high' | 'medium' | 'low';
  createdAt: string;
  /** ISO string — if present and in the past, item is considered expired */
  expiresAt?: string;
  actionLabel?: string;
  /** Present for credential offer items — used by accept-offer endpoint */
  offerUri?: string;
  /** Optional auth context for offer acceptance routing */
  authContext?: 'personal' | 'organization';
  /** Transaction flow label for quick visual separation */
  flowType?: 'PAYMENT' | 'REQUEST' | 'WORKFLOW' | 'RECEIPT' | 'SYSTEM';
  /** Optional token to ensure acceptance uses the same context that produced the inbox row */
  authToken?: string;
  /** Discriminates between credential offers, receipt offers, and workflow tasks */
  itemType?: 'credential_offer' | 'workflow' | 'receipt_offer' | 'payment_link' | 'invoice_offer' | 'ar_collection';
  /** Shared invoice correlation key used for de-duplicating invoice + payment cards */
  invoiceRef?: string;
  /** Optional quote correlation key for commerce trails */
  quoteId?: string;
  /** Optional payment URL/code used by unified invoice actions */
  paymentUrl?: string;
  paymentCode?: string;
  paymentLinkId?: string;
  amount?: number;
  currency?: string;
  /** For field execution items — the underlying workflow run id */
  workflowRunId?: string;
  /** For field execution items — current FEPT stage (ASSIGNED, IN_PROGRESS, etc.) */
  workflowStage?: string;
  /** For delegated approval notifications in personal inbox. */
  workflowRequestId?: string;
  workflowRequestType?: string;
  requisitionId?: string;
  transactionId?: string;
  /** For organization requests (purchases, quotes) the person approves or declines from the phone. */
  platformRequestId?: string;
  requiredAction?: string;
  proofRequestId?: string;
  proofResponseId?: string;
  trustStatus?: 'pending' | 'proof_presented' | 'settled' | 'disputed' | 'revoked';
  counterpartyOrgName?: string;
  actingOrgTenantId?: string;
  ownerOrgTenantId?: string;
  ownerDisplayName?: string;
  ownerLogoUrl?: string;
  assignmentRole?: string;
  isRead?: boolean;
}

export function isExpiredItem(item: InboxItemData): boolean {
  if (item.itemType === 'workflow') return false;
  if (item.itemType === 'payment_link' || item.itemType === 'invoice_offer') {
    return item.expiresAt ? dayjs(item.expiresAt).isBefore(dayjs()) : false;
  }
  if (item.expiresAt) return dayjs(item.expiresAt).isBefore(dayjs());
  // Treat credential/receipt offers with no explicit expiry as expired after 48 h
  if (item.itemType === 'credential_offer' || item.itemType === 'receipt_offer') {
    return dayjs(item.createdAt).isBefore(dayjs().subtract(48, 'hour'));
  }
  return false;
}

const PRIORITY_COLOR: Record<string, string> = {
  high: 'red',
  medium: 'orange',
  low: 'gray',
};

const FLOW_COLOR: Record<string, string> = {
  PAYMENT: 'teal',
  REQUEST: 'indigo',
  WORKFLOW: 'blue',
  RECEIPT: 'green',
  SYSTEM: 'gray',
};

const FEPT_STAGE_COLOR: Record<string, string> = {
  REQUEST_CREATED: 'blue',
  ASSIGNED: 'indigo',
  IN_PROGRESS: 'orange',
  EVIDENCE_CAPTURED: 'violet',
  ACKNOWLEDGED: 'teal',
  PAYMENT_TRIGGERED: 'yellow',
  RECEIPT_ISSUED: 'green',
  RECONCILED: 'cyan',
  COMPLETED: 'dark',
  DISPUTED: 'red',
  CANCELLED: 'gray',
};

function prettifyStage(stage: string): string {
  const normalized = String(stage || '').trim();
  if (!normalized) return 'Pending';
  return normalized
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getFlowBadge(item: InboxItemData): { label: string; color: string } {
  if (item.itemType === 'ar_collection') return { label: 'AR COLLECTION', color: 'blue' };
  if (item.itemType === 'payment_link' || item.itemType === 'invoice_offer') return { label: 'PAYMENT FLOW', color: 'teal' };
  if (item.itemType === 'receipt_offer') return { label: 'RECEIPT FLOW', color: 'green' };
  if (item.module === 'field' || item.workflowRunId) return { label: 'FEPT', color: 'teal' };
  if (item.module === 'approvals' && item.workflowRequestId) {
    const requestType = String(item.workflowRequestType || '').toLowerCase();
    if (requestType === 'ap_workflow' || item.transactionId) {
      return { label: 'AP WORKFLOW', color: 'blue' };
    }
    return { label: 'REQUISITION FLOW', color: 'indigo' };
  }
  if (item.module === 'present') return { label: 'PROOF REQUEST', color: 'indigo' };
  return { label: item.flowType || 'INBOX', color: FLOW_COLOR[item.flowType || 'SYSTEM'] || 'gray' };
}

function getStageBadge(item: InboxItemData): { label: string; color: string } {
  if (item.itemType === 'ar_collection') {
    const trust = String(item.trustStatus || 'pending').toLowerCase();
    if (trust === 'settled') return { label: 'Settled', color: 'green' };
    if (trust === 'proof_presented') return { label: 'Proof Presented', color: 'indigo' };
    if (trust === 'disputed') return { label: 'Disputed', color: 'red' };
    if (trust === 'revoked') return { label: 'Revoked', color: 'orange' };
    return { label: 'Consent Pending', color: 'blue' };
  }

  if (item.workflowStage) {
    const stage = String(item.workflowStage).toUpperCase();
    return {
      label: prettifyStage(stage),
      color: FEPT_STAGE_COLOR[stage] || 'gray',
    };
  }

  if (item.itemType === 'payment_link') return { label: 'Awaiting Payment', color: 'teal' };
  if (item.itemType === 'invoice_offer') return { label: 'Invoice Issued', color: 'indigo' };
  if (item.itemType === 'receipt_offer') return { label: 'Receipt Available', color: 'green' };

  const status = String(item.status || '').toLowerCase();
  const colorByStatus: Record<string, string> = {
    pending: 'orange',
    approved: 'green',
    rejected: 'red',
    completed: 'teal',
  };
  return {
    label: prettifyStage(status || 'pending'),
    color: colorByStatus[status] || 'gray',
  };
}

function formatMoney(amount: number | undefined, currency = 'USD'): string | null {
  if (typeof amount !== 'number' || Number.isNaN(amount)) return null;
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency || 'USD'} ${amount.toFixed(2)}`;
  }
}

function getSenderName(item: InboxItemData): string {
  const counterparty = String(item.counterpartyOrgName || '').trim();
  if (counterparty) return counterparty;
  const owner = String(item.ownerDisplayName || '').trim();
  if (owner) return owner;
  const actingOrg = String(item.actingOrgTenantId || '').trim();
  if (actingOrg) return actingOrg;
  const ownerOrg = String(item.ownerOrgTenantId || '').trim();
  if (ownerOrg) return ownerOrg;
  return 'Inbox';
}

function getSenderPrefix(item: InboxItemData): string {
  if (item.itemType === 'ar_collection') return 'Supplier';
  if (item.module === 'approvals' || item.workflowRequestId) return 'Organization';
  if (item.itemType === 'payment_link' || item.itemType === 'invoice_offer') return 'Merchant';
  return 'From';
}

function getInitials(value: string): string {
  const parts = value.split(/\s+/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return 'IN';
  return parts.map((part) => part.charAt(0).toUpperCase()).join('');
}

interface InboxItemProps {
  item: InboxItemData;
  onClick: (item: InboxItemData) => void;
}

export default function InboxItem({ item, onClick }: InboxItemProps) {
  const theme = useMantineTheme();
  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === 'dark';
  const expired = isExpiredItem(item);
  const isUnread = item.isRead === false;
  const displayTitle = item.itemType === 'credential_offer' || item.itemType === 'receipt_offer'
    ? formatCredentialType(item.title)
    : item.title;
  const flowBadge = getFlowBadge(item);
  const stageBadge = getStageBadge(item);
  const senderName = getSenderName(item);
  const senderPrefix = getSenderPrefix(item);
  const metaLabel = item.ownerDisplayName || item.assignmentRole || item.module;
  const rightLabel = item.actionLabel || (item.itemType === 'payment_link' ? 'Pay now' : 'Open');
  const rightTone = expired
    ? 'red'
    : item.itemType === 'payment_link' || item.itemType === 'invoice_offer'
      ? 'teal'
      : item.module === 'field'
        ? 'teal'
        : item.module === 'approvals'
          ? 'indigo'
          : 'gray';
  const moneyValue = formatMoney(item.amount, item.currency || 'USD');
  const valueHint = item.invoiceRef
    ? `INV ${item.invoiceRef}`
    : item.paymentCode
      ? `PAY ${item.paymentCode}`
      : item.workflowRunId
        ? item.workflowRunId
        : item.workflowRequestId
          ? item.workflowRequestId
          : null;
  const surface = expired
    ? isDark
      ? theme.colors.red[9]
      : theme.colors.red[0]
    : isDark
      ? theme.colors.dark[6]
      : theme.white;
  const borderColor = expired
    ? theme.colors.red[isDark ? 6 : 3]
    : isDark
      ? theme.colors.dark[4]
      : theme.colors.gray[2];
  return (
    <Card
      p="sm"
      radius="md"
      withBorder
      style={{
        cursor: 'pointer',
        width: '100%',
        border: `1px solid ${borderColor}`,
        background: surface,
        opacity: expired ? 0.85 : 1,
      }}
      onClick={() => onClick(item)}
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Avatar radius="xl" size="sm" color="teal" variant="light">
          {getInitials(senderName)}
        </Avatar>
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Text size="xs" c="dimmed" lineClamp={1}>
            {senderPrefix}: {senderName}
          </Text>
          <Group gap={6} wrap="nowrap" align="center">
            {isUnread && (
              <Box
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: isDark ? theme.colors.teal[4] : theme.colors.teal[6],
                  flexShrink: 0,
                }}
              />
            )}
            <Text fw={isUnread ? 700 : 600} size="sm" truncate>
              {displayTitle}
            </Text>
          </Group>
          <Group gap={6} mt={4} wrap="wrap">
            <Badge size="xs" color={flowBadge.color} variant="light">{flowBadge.label}</Badge>
            <Badge size="sm" color={stageBadge.color} variant="light">{stageBadge.label}</Badge>
            {expired && <Badge size="xs" color="red" variant="light">Expired</Badge>}
            {!expired && item.priority === 'high' && (
              <Badge size="xs" color={PRIORITY_COLOR[item.priority] || 'gray'} variant="dot">Priority</Badge>
            )}
            <Text size="xs" c="dimmed">{dayjs(item.createdAt).format('D MMM YYYY')}</Text>
          </Group>

          <Text size="xs" c="dimmed" mt={3} lineClamp={2}>
            {item.description}
          </Text>

          <Group gap={6} mt={4} wrap="wrap">
            {metaLabel && <Badge size="xs" color="gray" variant="dot">{metaLabel}</Badge>}
            {item.assignmentRole && <Badge size="xs" color="indigo" variant="light">Role: {item.assignmentRole}</Badge>}
          </Group>
        </Box>

        <Box ta="right" style={{ flexShrink: 0, minWidth: 72 }}>
          {moneyValue ? (
            <Text fw={700} size="sm" c={item.itemType === 'payment_link' || item.itemType === 'invoice_offer' ? 'teal' : item.module === 'approvals' ? 'indigo' : 'gray.8'}>
              {moneyValue}
            </Text>
          ) : (
            <Badge size="xs" color={rightTone} variant="dot">{rightLabel}</Badge>
          )}
          {moneyValue && (
            <Badge size="xs" color={rightTone} variant="dot" mt={4}>{rightLabel}</Badge>
          )}
          {valueHint && (
            <Text size="xs" c="dimmed" mt={moneyValue ? 2 : 0} truncate maw={120}>
              {valueHint}
            </Text>
          )}
          <Box mt={6}>
            {expired ? <IconAlertTriangle size={14} color={theme.colors.red[5]} /> : <IconChevronRight size={14} color={theme.colors.gray[5]} />}
          </Box>
        </Box>
      </Group>
    </Card>
  );
}
