import React from 'react';
import { Card, Group, Text, Stack, Box, Badge, Avatar, useMantineColorScheme, useMantineTheme } from '@mantine/core';
import { IconChevronRight } from '@tabler/icons-react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { formatCredentialType } from '@/lib/format';
import { OfferReplacementNote, fieldJobStatusLabel, stepRequiredLabel, toFeptStageLabel } from '@/lib/uxCopy';
import { inboxAttention, inboxWhenLabel, type InboxAttention } from '@/lib/inboxAttention';

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
  authContext?: 'personal' | 'organization' | 'org';
  /** Transaction flow label for quick visual separation */
  flowType?: 'PAYMENT' | 'REQUEST' | 'WORKFLOW' | 'RECEIPT' | 'SYSTEM';
  /** Optional token to ensure acceptance uses the same context that produced the inbox row */
  authToken?: string;
  /** Discriminates between credential offers, receipt offers, and workflow tasks */
  itemType?: 'credential_offer' | 'workflow' | 'receipt_offer' | 'payment_link' | 'invoice_offer' | 'ar_collection';
  /** Where a waiting record came from, e.g. `workflow_vc_offer` for a job record */
  sourceType?: string;
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
  /** For a safety-hold card: the hold the organisation can mark resolved from the inbox. */
  holdId?: string;
  /** Who the worker said must fix the hold: 'organisation' (default) or 'worker' (on site). */
  holdFixBy?: string;
  /** For field execution items — current FEPT stage (ASSIGNED, IN_PROGRESS, etc.) */
  workflowStage?: string;
  /** Why a field job is paused. The step line uses this ahead of the coarse stage. */
  pauseReason?: string;
  /** For delegated approval notifications in personal inbox. */
  workflowRequestId?: string;
  workflowRequestType?: string;
  requisitionId?: string;
  transactionId?: string;
  /** For organization requests (purchases, quotes) the person approves or declines from the phone. */
  platformRequestId?: string;
  /** "Part of job FR-…" when this card belongs to a job or another request. */
  partOfLine?: string;
  holdLine?: string;
  holdsParent?: boolean;
  /** An approved organization request that still has to be marked bought, delivered or paid. */
  platformNextStep?: {
    label: string;
    hint?: string;
    /** `image`: a live photo of the receipt or bill, or a wallet receipt record standing in. */
    fields: Array<{ name: string; label: string; type: 'text' | 'number' | 'image'; required?: boolean; hint?: string }>;
  };
  requiredAction?: string;
  /** The step key stored on the card (sign-off, payment release, approval…); shown as "Your step". */
  stageAction?: string;
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
  /** Set when this card replaces one the person already holds; shown as a badge plus the reason. */
  replaces?: OfferReplacementNote;
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

/** A stored id, not a name a person can read. */
function looksLikeId(value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  if (/^did:/i.test(text)) return true;
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(text)) return true;
  if (/^[0-9a-f]{16,}$/i.test(text)) return true;
  return false;
}

/** Drop a trailing id so "Invoice e7173…" reads as "Invoice". Keep the words. */
function readableTitle(title: string): string {
  const text = String(title || '').trim();
  if (!text) return 'Update';
  const withoutId = text
    .replace(/\s+[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '')
    .replace(/\s+did:[^\s]+/gi, '')
    .trim();
  if (withoutId && !looksLikeId(withoutId)) return withoutId;
  return text;
}

function getStageBadge(item: InboxItemData): { label: string; color: string } {
  if (item.itemType === 'ar_collection') {
    const trust = String(item.trustStatus || 'pending').toLowerCase();
    if (trust === 'settled') return { label: 'Settled', color: 'green' };
    if (trust === 'proof_presented') return { label: 'Proof shared', color: 'indigo' };
    if (trust === 'disputed') return { label: 'Disputed', color: 'red' };
    if (trust === 'revoked') return { label: 'Cancelled', color: 'orange' };
    return { label: 'Waiting to confirm', color: 'blue' };
  }

  if (item.workflowStage) {
    const stage = String(item.workflowStage).toUpperCase();
    const pause = String(item.pauseReason || '').trim();
    if (pause) {
      return { label: fieldJobStatusLabel('paused', stage, pause), color: 'orange' };
    }
    return {
      label: toFeptStageLabel(stage),
      color: FEPT_STAGE_COLOR[stage] || 'gray',
    };
  }

  if (item.itemType === 'payment_link') return { label: 'Waiting for payment', color: 'teal' };
  if (item.itemType === 'invoice_offer') return { label: 'Invoice sent', color: 'indigo' };
  if (item.itemType === 'receipt_offer') return { label: 'Receipt ready', color: 'green' };

  const status = String(item.status || '').toLowerCase();
  const colorByStatus: Record<string, string> = {
    pending: 'orange',
    approved: 'green',
    rejected: 'red',
    completed: 'teal',
  };
  const statusWords: Record<string, string> = {
    pending: 'Waiting',
    approved: 'Approved',
    rejected: 'Declined',
    completed: 'Done',
  };
  return {
    label: statusWords[status] || 'Waiting',
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
  const named = [item.counterpartyOrgName, item.ownerDisplayName]
    .map((value) => String(value || '').trim())
    .find((value) => value && !looksLikeId(value));
  return named || 'Your organisation';
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
  /** Filed-away cards count as done even when the status is still waiting. */
  attention?: InboxAttention;
}

export default function InboxItem({ item, onClick, attention }: InboxItemProps) {
  const theme = useMantineTheme();
  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === 'dark';
  const expired = isExpiredItem(item);
  const attentionState = attention || inboxAttention({ status: item.status, isRead: item.isRead === true });
  const isNew = attentionState === 'new';
  // A title the server already wrote in words ("Site inspection · FR-…") is shown as it is;
  // only a bare type name ("SiteInspectionVC") is turned into words.
  const titleIsTypeName = !/\s/.test(String(item.title || '').trim()) || /VerifiableCredential/.test(String(item.title || ''));
  const displayTitle = (item.itemType === 'credential_offer' || item.itemType === 'receipt_offer') && titleIsTypeName
    ? formatCredentialType(item.title)
    : readableTitle(item.title);
  const stageBadge = getStageBadge(item);
  const senderName = getSenderName(item);
  const senderPrefix = getSenderPrefix(item);
  const stepRequired = stepRequiredLabel(item);
  const rawRightLabel = item.actionLabel || (item.itemType === 'payment_link' ? 'Pay now' : 'Open');
  // The step badge already says what to do; do not repeat the same words on the right.
  const rightLabel = stepRequired && rawRightLabel.toLowerCase() === stepRequired.toLowerCase() ? 'Open' : rawRightLabel;
  const rightTone = item.itemType === 'payment_link' || item.itemType === 'invoice_offer'
      ? 'teal'
      : item.module === 'field'
        ? 'teal'
        : item.module === 'approvals'
          ? 'indigo'
          : 'gray';
  const moneyValue = formatMoney(item.amount, item.currency || 'USD');
  const hintSource = [item.invoiceRef, item.paymentCode]
    .map((value) => String(value || '').trim())
    .find((value) => value && !looksLikeId(value));
  const valueHint = hintSource ? hintSource : null;
  const surface = isDark ? theme.colors.dark[6] : theme.white;
  const borderColor = isDark ? theme.colors.dark[4] : theme.colors.gray[2];
  return (
    <Card
      p="md"
      radius="md"
      withBorder
      style={{
        cursor: 'pointer',
        minHeight: 104,
        width: '100%',
        border: `1px solid ${borderColor}`,
        background: surface,
        opacity: expired ? 0.72 : 1,
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
          <Group gap={6} wrap="nowrap" align="baseline" justify="space-between">
            <Group gap={6} wrap="nowrap" align="center" style={{ minWidth: 0, flex: 1 }}>
              {isNew && (
                <Box
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: isDark ? theme.colors.blue[4] : theme.colors.blue[6],
                    flexShrink: 0,
                  }}
                />
              )}
              <Text fw={isNew ? 700 : 600} size="sm" truncate c={attentionState === 'done' ? 'dimmed' : undefined}>
                {displayTitle}
              </Text>
            </Group>
            <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>{inboxWhenLabel(item.createdAt)}</Text>
          </Group>

          {item.replaces ? (
            <Text size="xs" c="orange.8" fw={600} mt={6} lineClamp={2}>
              {item.replaces.note}
            </Text>
          ) : (
            <Text size="xs" c="dimmed" mt={6} lineClamp={2}>
              {item.description}
            </Text>
          )}

          <Group gap={6} mt={8} wrap="wrap">
            {item.replaces && (
              <Badge size="xs" color="orange" variant="filled">{item.replaces.label}</Badge>
            )}
            <Badge size="xs" color={stageBadge.color} variant="light">{stageBadge.label}</Badge>
            {stepRequired && !expired && item.status === 'pending' && (
              <Badge size="xs" color="teal" variant="outline">Your step: {stepRequired}</Badge>
            )}
            {expired && <Badge size="xs" color="gray" variant="light">Expired</Badge>}
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
            <IconChevronRight size={14} color={theme.colors.gray[5]} />
          </Box>
        </Box>
      </Group>
    </Card>
  );
}
