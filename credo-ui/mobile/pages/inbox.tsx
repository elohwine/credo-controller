import React, { useState, useEffect, useCallback, useRef } from 'react';
import dayjs from 'dayjs';
import {
  Stack, Title, Text, Box, Divider, Button, Center, ThemeIcon, Paper,
  Loader, Alert, Group, Badge, ActionIcon, Tabs, Textarea, Modal,
  useMantineColorScheme, useMantineTheme,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconInbox, IconRefresh, IconCheck, IconX, IconAlertCircle, IconReceipt, IconTrash, IconShieldCheck, IconPlayerPlay, IconActivity, IconChevronRight, IconChevronDown } from '@tabler/icons-react';
import { useRouter } from 'next/router';
import AppShellMobile from '@/components/layout/AppShellMobile';
import InboxItem, { InboxItemData, isExpiredItem } from '@/components/inbox/InboxItem';
import BottomSheet from '@/components/shared/BottomSheet';
import StatusBadge from '@/components/shared/StatusBadge';
import EmptyState from '@/components/shared/EmptyState';
import ErrorAlert from '@/components/shared/ErrorAlert';
import api, { safeArray } from '@/lib/api';
import { formatCredentialType } from '@/lib/format';
import { getInboxDisplayDescription, getInboxDisplayTitle, getInboxPrimaryActionLabel } from '@/lib/uxCopy';
import { applyOrgContext, getActiveOrgId, getWalletToken, getActiveOrgLabel, getOrgRoleClaim, isEmployeeOrgRole, isOrgActionRole, getContextMode, getOrgToken, getPersonalWalletTenantId, getPersonalWalletToken } from '@/lib/auth';
import { getRunningActions, removeRunningAction, RunningAction, upsertRunningAction } from '@/lib/runningActions';
import { getOfflineStorageAdapter } from '@/lib/offline/storage';
import { getOfflineSyncEngine, OfflineSyncState } from '@/lib/offline/syncEngine';
import { getMobileOfflineFlags } from '@/lib/offline/flags';
import { flushOfflineQueueToServer } from '@/lib/offline/queueSync';
import { getCachedWalletSnapshot } from '@/lib/offline/walletSnapshotSync';
import { resolveCanonicalWorkflowType } from '@/lib/workflowCapabilities';

const MODULE_BY_FEATURE: Record<string, string> = {
  ECOMMERCE: 'ecommerce',
  INTERNAL_REQUISITIONS: 'requisitions',
  EDUCATION_FEES: 'education',
  CASH_COUNTER: 'cash',
  FIELD_EXECUTION: 'field',
};

const INBOX_META_KEY = 'credoInboxMeta.v1';
const INBOX_ITEM_CACHE_KEY = 'credoInboxItems.v1';
const INBOX_CACHE_TTL_DAYS = 21;
const INBOX_CACHE_MAX_ITEMS = 500;
const INBOX_SYNC_META_KEY = 'inbox';

type CachedInboxEntry = {
  key: string;
  item: InboxItemData;
  lastSeenAt: string;
};

type InboxSyncMeta = {
  lastSyncAt?: string;
  lastAttemptAt?: string;
  lastError?: string;
};

type InboxWorkflowSections = {
  finance: boolean;
  ops: boolean;
};

function inboxScopeId(): string {
  return getPersonalWalletTenantId() || 'signed-out';
}

function inboxItemCacheKey(): string {
  return `${INBOX_ITEM_CACHE_KEY}:${inboxScopeId()}`;
}

function inboxMetaKey(): string {
  return `${INBOX_META_KEY}:${inboxScopeId()}`;
}

function inboxSyncMetaKey(): string {
  return `${INBOX_SYNC_META_KEY}:${inboxScopeId()}`;
}

function readInboxSyncMeta(): InboxSyncMeta {
  if (typeof window === 'undefined') return {};
  return getOfflineStorageAdapter().get<InboxSyncMeta>('sync_state', inboxSyncMetaKey()) || {};
}

function writeInboxSyncMeta(meta: InboxSyncMeta): void {
  if (typeof window === 'undefined') return;
  getOfflineStorageAdapter().set('sync_state', inboxSyncMetaKey(), meta);
}

function formatFreshnessLabel(lastSyncAt?: string): string {
  if (!lastSyncAt) return 'Never synced';

  const parsedAt = Date.parse(lastSyncAt);
  if (!Number.isFinite(parsedAt)) return 'Sync time unknown';

  const deltaMs = Date.now() - parsedAt;
  if (deltaMs < 0) return 'Sync time unknown';

  const minutes = Math.floor(deltaMs / (60 * 1000));
  if (minutes < 1) return 'Last synced just now';
  if (minutes < 60) return `Last synced ${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Last synced ${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `Last synced ${days}d ago`;
}

function getFreshnessColor(lastSyncAt?: string): 'green' | 'yellow' | 'red' | 'gray' {
  if (!lastSyncAt) return 'gray';

  const parsedAt = Date.parse(lastSyncAt);
  if (!Number.isFinite(parsedAt)) return 'gray';

  const deltaMs = Date.now() - parsedAt;
  if (deltaMs < 0) return 'gray';

  const hours = deltaMs / (60 * 60 * 1000);
  if (hours <= 1) return 'green';
  if (hours <= 12) return 'yellow';
  return 'red';
}

function readInboxItemCache(): CachedInboxEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(inboxItemCacheKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is CachedInboxEntry => Boolean(entry && typeof entry === 'object' && entry.item))
      .map((entry) => ({
        key: String(entry.key || getInboxItemKey(entry.item)),
        item: entry.item,
        lastSeenAt: String(entry.lastSeenAt || entry.item?.createdAt || new Date().toISOString()),
      }));
  } catch {
    return [];
  }
}

function writeInboxItemCache(entries: CachedInboxEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(inboxItemCacheKey(), JSON.stringify(entries.slice(0, INBOX_CACHE_MAX_ITEMS)));
  } catch {
    // Best effort only.
  }
}

function mergeWithInboxCache(liveItems: InboxItemData[], deleted: Record<string, boolean>): InboxItemData[] {
  const now = Date.now();
  const ttlMs = INBOX_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
  const cacheEntries = readInboxItemCache();
  const byKey = new Map<string, InboxItemData>();

  for (const item of liveItems) {
    const key = getInboxItemKey(item);
    if (deleted[key]) continue;
    byKey.set(key, item);
  }

  for (const entry of cacheEntries) {
    const key = entry.key || getInboxItemKey(entry.item);
    if (!key || deleted[key]) continue;
    const seenMs = Date.parse(entry.lastSeenAt || '') || 0;
    if (seenMs && now - seenMs > ttlMs) continue;
    if (!byKey.has(key)) {
      byKey.set(key, entry.item);
    }
  }

  const merged = Array.from(byKey.values()).sort((a, b) => {
    const aTime = Date.parse(a.createdAt || '') || 0;
    const bTime = Date.parse(b.createdAt || '') || 0;
    return bTime - aTime;
  });

  const cacheByKey = new Map(cacheEntries.map((entry) => [entry.key, entry]));
  const persistEntries: CachedInboxEntry[] = merged.map((item) => {
    const key = getInboxItemKey(item);
    const existing = cacheByKey.get(key);
    return {
      key,
      item,
      lastSeenAt: existing?.lastSeenAt || new Date().toISOString(),
    };
  });
  writeInboxItemCache(persistEntries);

  return merged;
}

function removeInboxItemFromCacheByKey(key: string): void {
  if (typeof window === 'undefined') return;
  if (!key) return;
  const cacheEntries = readInboxItemCache();
  const filtered = cacheEntries.filter((entry) => entry.key !== key);
  writeInboxItemCache(filtered);
}

function normalizeWorkflowType(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

const FEPT_STAGES = new Set([
  'DRAFT',
  'REQUEST_CREATED',
  'APPROVAL_PENDING',
  'APPROVED',
  'RELEASE_AUTHORIZED',
  'ASSIGNED',
  'IN_PROGRESS',
  'EVIDENCE_CAPTURED',
  'ACKNOWLEDGED',
  'PAYMENT_TRIGGERED',
  'RECEIPT_ISSUED',
  'RECONCILED',
  'COMPLETED',
  'DISPUTED',
  'CANCELLED',
  'REVOKED',
]);

function normalizeStage(value: unknown): string {
  return String(value ?? '').trim().toUpperCase().replace(/\s+/g, '_');
}

function normalizeRunId(value: unknown): string | null {
  const runId = String(value ?? '').trim();
  if (!runId) return null;

  const lowered = runId.toLowerCase();
  if (lowered === 'undefined' || lowered === 'null' || lowered === 'nan') return null;

  return runId;
}

function getFieldRunActionLabel(stage: string): string {
  const labels: Record<string, string> = {
    ASSIGNED: 'Start job',
    IN_PROGRESS: 'Add photos',
    EVIDENCE_CAPTURED: 'Waiting for sign-off',
    ACKNOWLEDGED: 'Waiting for payment',
    PAYMENT_TRIGGERED: 'Waiting for receipt',
    RECEIPT_ISSUED: 'Closing',
    RECONCILED: 'Closed',
    COMPLETED: 'Closed',
    CANCELLED: 'Cancelled',
    REVOKED: 'Revoked',
    DISPUTED: 'Review Dispute',
  };

  return labels[stage] || 'Open';
}

function toReadableActionLabel(value: string): string {
  return String(value || '')
    .trim()
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (s) => s.toUpperCase());
}

function getRequisitionStageActionUiCopy(stageAction: string): { title: string; description: string; actionLabel: string } {
  const normalized = String(stageAction || '').toLowerCase();
  if (normalized === 'finance_approval') {
    return {
      title: 'Finance Approval Required',
      description: 'Manager approval completed. Finance review is required to proceed.',
      actionLabel: 'Review Approval',
    };
  }

  if (normalized === 'release_funds') {
    return {
      title: 'Release Funds Required',
      description: 'Finance approval completed. Release funds to move to the next stage.',
      actionLabel: 'Release Funds',
    };
  }

  if (normalized === 'acknowledge_execution') {
    return {
      title: 'Acknowledge Completion Required',
      description: 'Funds released. Acknowledge execution to complete this requisition.',
      actionLabel: 'Acknowledge',
    };
  }

  const pretty = toReadableActionLabel(normalized || 'action');
  return {
    title: `${pretty} Required`,
    description: `Next requisition step requires ${pretty.toLowerCase()}.`,
    actionLabel: pretty,
  };
}

function getAssignmentRequestUiCopy(requestTypeRaw: string): { title: string; actionLabel: string } {
  const requestType = String(requestTypeRaw || '').toLowerCase();
  if (requestType.includes('requis')) {
    return { title: 'Requisition Approval Request', actionLabel: 'Open Requisition' };
  }
  if (requestType.includes('fee') || requestType.includes('school') || requestType.includes('tuition')) {
    return { title: 'Fee Collection', actionLabel: 'Open Fees' };
  }
  if (requestType.includes('payable') || requestType.includes('ap_') || requestType.includes('expense') || requestType.includes('purchase')) {
    return { title: 'Accounts Payable', actionLabel: 'Open AP' };
  }
  if (requestType.includes('receivable') || requestType.includes('ar_') || requestType.includes('invoice') || requestType.includes('quote')) {
    return { title: 'Accounts Receivable', actionLabel: 'Open AR' };
  }
  if (requestType.includes('fept') || requestType.includes('field')) {
    return { title: 'Field Assignment', actionLabel: 'Open Field Job' };
  }
  if (requestType.includes('onboarding') || requestType.includes('employee')) {
    return { title: 'Employee Onboarding', actionLabel: 'Open Onboarding' };
  }
  if (requestType.includes('department') || requestType.includes('dept')) {
    return { title: 'Department Request', actionLabel: 'Open Request' };
  }
  if (requestType.includes('invoice')) {
    return { title: 'Invoice Workflow Request', actionLabel: 'Open Invoice' };
  }
  if (requestType.includes('payment')) {
    return { title: 'Payment Workflow Request', actionLabel: 'Open Payment' };
  }
  return { title: 'Workflow Approval Request', actionLabel: 'Open Request' };
}

function getApWorkflowActionUiCopy(requiredActionRaw: string, isArCollection: boolean): { title: string; actionLabel: string } {
  if (isArCollection) {
    return { title: 'AR Collection Assignment', actionLabel: 'Open AR Collection' };
  }

  const requiredAction = String(requiredActionRaw || '').toLowerCase();
  if (requiredAction === 'approve_payment') {
    return { title: 'AP Approval Required', actionLabel: 'Approve Payment' };
  }
  if (requiredAction === 'record_payment') {
    return { title: 'AP Payment Recording Required', actionLabel: 'Record Payment' };
  }
  if (requiredAction === 'release_funds') {
    return { title: 'AP Funds Release Required', actionLabel: 'Release Funds' };
  }
  if (requiredAction === 'acknowledge_remittance') {
    return { title: 'AP Remittance Acknowledgement Required', actionLabel: 'Acknowledge Remittance' };
  }
  if (requiredAction === 'issue_receipt_vc') {
    return { title: 'AP Receipt Issuance Required', actionLabel: 'Issue Receipt' };
  }

  const pretty = toReadableActionLabel(requiredAction || 'review');
  return { title: 'AP Workflow Action Required', actionLabel: pretty };
}

function toOperationalWorkflowType(
  value: unknown
): 'ecommerce' | 'education_fees' | 'cash_counter' | 'field_execution' | 'internal_requisitions' | null {
  const workflowType = normalizeWorkflowType(value);
  if (!workflowType) return null;

  const canonical = resolveCanonicalWorkflowType(workflowType);
  if (
    canonical === 'tpl-internal-requisition'
    || canonical === 'tpl-internal-requisitions'
    || canonical === 'tpl-requisition'
    || canonical === 'tpl-requisitions'
    || canonical === 'internal-requisition'
    || canonical === 'internal-requisitions'
  ) return 'internal_requisitions';

  if (canonical === 'tpl-fept-field-execution') return 'field_execution';
  if (canonical === 'tpl-education-fee') return 'education_fees';
  if (canonical === 'tpl-cash-counter') return 'cash_counter';
  if (canonical === 'ar_collection') return 'ecommerce';
  if (canonical === 'tpl-quote-invoice-receipt' || canonical === 'tpl-delivery-escrow') return 'ecommerce';

  return null;
}

type InboxMetaState = {
  read: Record<string, boolean>;
  archived: Record<string, boolean>;
  deleted: Record<string, boolean>;
};

const emptyMetaState: InboxMetaState = {
  read: {},
  archived: {},
  deleted: {},
};

function getInboxItemKey(item: InboxItemData): string {
  if (item.workflowRequestId) return `wr:${item.workflowRequestId}`;
  if (item.workflowRunId) return `run:${item.workflowRunId}`;
  if (item.offerUri) return `offer:${item.offerUri}`;
  return `${item.itemType || 'item'}:${item.id}`;
}

function extractPaymentCode(offerUri?: string): string | null {
  if (!offerUri) return null;
  try {
    const parsed = new URL(offerUri);
    const parts = parsed.pathname.split('/').filter(Boolean);
    const vIndex = parts.findIndex((part) => part === 'v');
    if (vIndex >= 0 && parts[vIndex + 1]) {
      return decodeURIComponent(parts[vIndex + 1]);
    }
    const payIndex = parts.findIndex((part) => part === 'pay');
    if (payIndex >= 0 && parts[payIndex + 1]) {
      return decodeURIComponent(parts[payIndex + 1]);
    }
  } catch {
    const match = offerUri.match(/\/(?:v|pay)\/([^/?#]+)/i);
    if (match?.[1]) {
      return decodeURIComponent(match[1]);
    }
  }
  return null;
}

function firstNonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length > 0) return trimmed;
    }
  }
  return undefined;
}

function resolvePaymentNavigationTarget(input: {
  paymentCode?: string;
  paymentUrl?: string;
  offerUri?: string;
}): { paymentCode?: string; paymentUrl?: string } {
  const paymentUrl = firstNonEmptyString(input.paymentUrl, input.offerUri);
  const paymentCode = firstNonEmptyString(
    input.paymentCode,
    extractPaymentCode(paymentUrl),
    extractPaymentCode(input.offerUri)
  );

  return {
    paymentCode,
    paymentUrl,
  };
}

function buildPayRoute(input: { paymentCode: string; invoiceRef?: string; orgTenantId?: string }): string {
  const params = new URLSearchParams();
  if (input.invoiceRef) params.set('invoiceRef', input.invoiceRef);
  if (input.orgTenantId) params.set('orgTenantId', input.orgTenantId);
  const query = params.toString();
  return `/pay/${encodeURIComponent(input.paymentCode)}${query ? `?${query}` : ''}`;
}

function buildArCollectionSettlementRoute(item: InboxItemData): string {
  const transactionId = firstNonEmptyString(item.transactionId, item.workflowRequestId, item.id) || item.id;
  const params = new URLSearchParams();
  params.set('tab', 'ar');
  if (item.paymentLinkId) {
    params.set('linkId', item.paymentLinkId);
  }
  if (item.invoiceRef) {
    params.set('invoiceRef', item.invoiceRef);
  }
  if (item.paymentCode) {
    params.set('paymentCode', item.paymentCode);
  }
  params.set('transactionId', transactionId);
  if (item.actingOrgTenantId) params.set('orgTenantId', item.actingOrgTenantId);
  return `/finance?${params.toString()}`;
}

function mergeInvoiceAndPaymentOffers(offers: InboxItemData[]): InboxItemData[] {
  const merged = [...offers];
  const invoiceIndexByRef = new Map<string, number>();

  for (let i = 0; i < merged.length; i += 1) {
    const current = merged[i];
    if (!current) continue;

    const isInvoiceFlow = current.itemType === 'invoice_offer' || current.itemType === 'payment_link';
    const invoiceRef = current.invoiceRef?.trim();
    if (!isInvoiceFlow || !invoiceRef) continue;

    const existingIndex = invoiceIndexByRef.get(invoiceRef);
    if (existingIndex == null) {
      invoiceIndexByRef.set(invoiceRef, i);
      continue;
    }

    const existing = merged[existingIndex];
    if (!existing) {
      invoiceIndexByRef.set(invoiceRef, i);
      continue;
    }

    const existingIsInvoiceOffer = existing.itemType === 'invoice_offer';
    const currentIsInvoiceOffer = current.itemType === 'invoice_offer';

    if (existingIsInvoiceOffer && !currentIsInvoiceOffer) {
      const resolved = resolvePaymentNavigationTarget({
        paymentCode: existing.paymentCode || current.paymentCode,
        paymentUrl: existing.paymentUrl || current.paymentUrl,
        offerUri: current.offerUri || existing.offerUri,
      });
      merged[existingIndex] = {
        ...existing,
        expiresAt: existing.expiresAt || current.expiresAt,
        paymentUrl: resolved.paymentUrl,
        paymentCode: resolved.paymentCode,
        paymentLinkId: existing.paymentLinkId || current.paymentLinkId,
      };
      merged[i] = { ...current, id: `deduped-${current.id}` };
      continue;
    }

    if (!existingIsInvoiceOffer && currentIsInvoiceOffer) {
      const resolved = resolvePaymentNavigationTarget({
        paymentCode: current.paymentCode || existing.paymentCode,
        paymentUrl: current.paymentUrl || existing.paymentUrl,
        offerUri: existing.offerUri || current.offerUri,
      });
      merged[existingIndex] = {
        ...current,
        expiresAt: current.expiresAt || existing.expiresAt,
        paymentUrl: resolved.paymentUrl,
        paymentCode: resolved.paymentCode,
        paymentLinkId: current.paymentLinkId || existing.paymentLinkId,
      };
      merged[i] = { ...current, id: `deduped-${current.id}` };
      continue;
    }

    merged[i] = { ...current, id: `deduped-${current.id}` };
  }

  return merged;
}

function isRequisitionApproval(item: InboxItemData): boolean {
  if (item.itemType !== 'workflow') return false;
  if (String(item.module || '').toLowerCase() !== 'approvals') return false;
  const requestType = String(item.workflowRequestType || '').toLowerCase();
  return requestType === 'requisition' || requestType.includes('requis') || Boolean(item.requisitionId);
}

function isApWorkflowApproval(item: InboxItemData): boolean {
  if (item.itemType !== 'workflow') return false;
  if (String(item.module || '').toLowerCase() !== 'approvals') return false;
  return String(item.workflowRequestType || '').toLowerCase() === 'ap_workflow' || Boolean(item.transactionId);
}

function isArCollectionAssignment(item: InboxItemData): boolean {
  if (item.itemType === 'ar_collection') return true;
  if (String(item.workflowRequestType || '').toLowerCase() === 'ar_collection') return true;
  return String(item.requiredAction || '').toLowerCase() === 'present_payment_proof';
}

function deriveArCollectionFlowStage(item: InboxItemData): 'issued' | 'proof_requested' | 'proof_presented' | 'settled' {
  const trustState = String(item.trustStatus || '').toLowerCase();
  const workflowState = String(item.status || '').toLowerCase();
  if (trustState === 'settled' || workflowState === 'completed') return 'settled';
  if (item.proofResponseId || trustState === 'proof_presented') return 'proof_presented';
  if (item.proofRequestId || String(item.requiredAction || '').toLowerCase() === 'present_payment_proof') return 'proof_requested';
  return 'issued';
}

type RunningActionDraft = Parameters<typeof upsertRunningAction>[0]

function toRunningActionFromItem(item: InboxItemData): RunningActionDraft | null {
  if (item.itemType === 'ar_collection') {
    const transactionId = firstNonEmptyString(item.transactionId, item.workflowRequestId, item.id);
    if (!transactionId) return null;
    const params = new URLSearchParams();
    params.set('tab', 'ar');
    params.set('itemId', item.id);
    params.set('transactionId', transactionId);
    if (item.actingOrgTenantId) params.set('orgTenantId', item.actingOrgTenantId);
    if (item.proofRequestId) params.set('proofRequestId', item.proofRequestId);
    return {
      id: `ar-collection:${transactionId}`,
      type: 'workflow',
      title: getInboxDisplayTitle(item) || item.title || 'AR collection assignment',
      description: getInboxDisplayDescription(item) || item.description,
      route: `/finance?${params.toString()}`,
      refId: transactionId,
      orgTenantId: item.actingOrgTenantId || item.ownerOrgTenantId,
      status: 'active',
    };
  }

  if (item.itemType === 'payment_link') {
    const { paymentCode: code } = resolvePaymentNavigationTarget({
      paymentCode: item.paymentCode,
      paymentUrl: item.paymentUrl,
      offerUri: item.offerUri,
    })
    const paymentToken = firstNonEmptyString(code, item.paymentLinkId)
    if (!paymentToken) return null
    const route = buildPayRoute({
      paymentCode: paymentToken,
      invoiceRef: item.invoiceRef,
      orgTenantId: item.ownerOrgTenantId,
    })
    return {
      id: `payment:${paymentToken}`,
      type: 'payment',
      title: getInboxDisplayTitle(item) || item.title || `Payment ${paymentToken}`,
      description: getInboxDisplayDescription(item) || item.description,
      route,
      refId: paymentToken,
      orgTenantId: item.ownerOrgTenantId,
      status: 'active',
    }
  }

  if (item.module === 'field' && item.workflowRunId) {
    return {
      id: `field:${item.workflowRunId}`,
      type: 'field_run',
      title: getInboxDisplayTitle(item) || item.title || 'Field run in progress',
      description: getInboxDisplayDescription(item) || item.description,
      route: `/finance?tab=field&runId=${encodeURIComponent(item.workflowRunId)}${item.ownerOrgTenantId ? `&orgTenantId=${encodeURIComponent(item.ownerOrgTenantId)}` : ''}`,
      refId: item.workflowRunId,
      orgTenantId: item.ownerOrgTenantId,
      status: 'active',
    }
  }

  if (isRequisitionApproval(item) && (item.workflowRequestId || item.requisitionId)) {
    const requisitionPart = item.requisitionId ? `&requisitionId=${encodeURIComponent(item.requisitionId)}` : ''
    const orgPart = item.actingOrgTenantId ? `&orgTenantId=${encodeURIComponent(item.actingOrgTenantId)}` : ''
    const ref = item.workflowRequestId || item.requisitionId || item.id
    return {
      id: `requisition:${ref}`,
      type: 'requisition',
      title: getInboxDisplayTitle(item) || item.title || 'Requisition approval',
      description: getInboxDisplayDescription(item) || item.description,
      route: `/finance?tab=requisitions${item.workflowRequestId ? `&requestId=${encodeURIComponent(item.workflowRequestId)}` : ''}${requisitionPart}${orgPart}`,
      refId: ref,
      orgTenantId: item.actingOrgTenantId || item.ownerOrgTenantId,
      status: 'active',
    }
  }

  if (isApWorkflowApproval(item)) {
    const transactionId = item.transactionId || item.workflowRequestId || item.id;
    const orgPart = item.actingOrgTenantId ? `&orgTenantId=${encodeURIComponent(item.actingOrgTenantId)}` : '';
    return {
      id: `ap:${transactionId}`,
      type: 'workflow',
      title: getInboxDisplayTitle(item) || item.title || 'AP workflow action',
      description: getInboxDisplayDescription(item) || item.description,
      route: `/finance?tab=ap&transactionId=${encodeURIComponent(transactionId)}${orgPart}`,
      refId: transactionId,
      orgTenantId: item.actingOrgTenantId || item.ownerOrgTenantId,
      status: 'active',
    }
  }

  if (item.module === 'present' && item.offerUri) {
    return {
      id: `proof:${item.id}`,
      type: 'proof',
      title: getInboxDisplayTitle(item) || item.title || 'Proof request',
      description: getInboxDisplayDescription(item) || item.description,
      route: `/present?request_uri=${encodeURIComponent(item.offerUri)}`,
      refId: item.offerUri,
      orgTenantId: item.ownerOrgTenantId,
      status: 'active',
    }
  }

  return null
}

// ── Workflow grouping (NNG progressive disclosure + Carbon: user-initiated) ──

interface InboxGroup {
  key: string
  primaryItem: InboxItemData
  secondaryItems: InboxItemData[]
  orgLabel?: string
  orgLogoUrl?: string
}

type GroupedInboxEntry = { type: 'group'; data: InboxGroup } | { type: 'standalone'; data: InboxItemData }

function getWorkflowGroupKey(item: InboxItemData): string | null {
  if (item.workflowRunId) return `run:${item.workflowRunId}`
  // paymentLinkId groups the full commerce chain: Quote → Invoice → Receipt
  const trailId = firstNonEmptyString(item.paymentLinkId, item.invoiceRef)
  if (trailId && (item.itemType === 'credential_offer' || item.itemType === 'invoice_offer' || item.itemType === 'payment_link' || item.itemType === 'receipt_offer')) return `trail:${trailId}`
  if (item.workflowRequestId) return `wr:${item.workflowRequestId}`
  return null
}

const ITEM_GROUP_PRIORITY: Record<string, number> = {
  receipt_offer: 0,
  invoice_offer: 1,
  payment_link: 2,
  credential_offer: 3,
  workflow: 4,
}

function groupPrimaryPriority(item: InboxItemData): number {
  const typeRank = ITEM_GROUP_PRIORITY[item.itemType || ''] ?? 5
  const statusRank = item.status === 'pending' ? 0 : 1
  const priorityRank = item.priority === 'high' ? 0 : item.priority === 'medium' ? 1 : 2
  return typeRank * 10 + statusRank * 3 + priorityRank
}

function groupInboxItems(items: InboxItemData[]): GroupedInboxEntry[] {
  const groupMap = new Map<string, InboxItemData[]>()
  const standaloneIds = new Set<string>()

  for (const item of items) {
    const key = getWorkflowGroupKey(item)
    if (!key) { standaloneIds.add(item.id); continue }
    if (!groupMap.has(key)) groupMap.set(key, [])
    groupMap.get(key)!.push(item)
  }

  const entries: GroupedInboxEntry[] = []

  for (const [key, groupItems] of groupMap) {
    if (groupItems.length <= 1) {
      // Only 1 item matched this key — show as standalone
      if (groupItems[0]) standaloneIds.add(groupItems[0].id)
      continue
    }
    const sorted = [...groupItems].sort((a, b) => groupPrimaryPriority(a) - groupPrimaryPriority(b))
    const primary = sorted[0]!
    entries.push({
      type: 'group',
      data: {
        key,
        primaryItem: primary,
        secondaryItems: sorted.slice(1),
        orgLabel: primary.ownerDisplayName,
        orgLogoUrl: primary.ownerLogoUrl,
      },
    })
  }

  for (const item of items) {
    if (standaloneIds.has(item.id)) {
      entries.push({ type: 'standalone', data: item })
    }
  }

  return entries.sort((a, b) => {
    const ai = a.type === 'standalone' ? a.data : a.data.primaryItem
    const bi = b.type === 'standalone' ? b.data : b.data.primaryItem
    const unreadDiff = (ai.isRead === false ? 0 : 1) - (bi.isRead === false ? 0 : 1)
    if (unreadDiff !== 0) return unreadDiff
    const pMap: Record<string, number> = { high: 0, medium: 1, low: 2 }
    const pDiff = (pMap[ai.priority] ?? 99) - (pMap[bi.priority] ?? 99)
    if (pDiff !== 0) return pDiff
    return dayjs(bi.createdAt).valueOf() - dayjs(ai.createdAt).valueOf()
  })
}

const GROUP_FLOW_COLORS: Record<string, string> = {
  PAYMENT: 'teal', RECEIPT: 'green', REQUEST: 'indigo', WORKFLOW: 'blue', SYSTEM: 'orange',
}

function fmtMoney(amount?: number, currency = 'USD') {
  if (typeof amount !== 'number' || Number.isNaN(amount)) return null
  try { return new Intl.NumberFormat('en', { style: 'currency', currency: currency || 'USD', minimumFractionDigits: 2 }).format(amount) } catch { return `${currency} ${amount.toFixed(2)}` }
}

interface WorkflowGroupRowProps {
  group: InboxGroup
  isExpanded: boolean
  onToggleExpand: () => void
  onItemClick: (item: InboxItemData) => void
}

function WorkflowGroupRow({ group, isExpanded, onToggleExpand, onItemClick }: WorkflowGroupRowProps) {
  const { colorScheme } = useMantineColorScheme()
  const theme = useMantineTheme()
  const isDark = colorScheme === 'dark'
  const { primaryItem, secondaryItems, orgLabel } = group
  const secondaryCount = secondaryItems.length
  const totalCount = 1 + secondaryCount
  const flowColor = GROUP_FLOW_COLORS[primaryItem.flowType || 'SYSTEM'] || 'gray'
  const borderAccent = theme.colors[flowColor]?.[isDark ? 5 : 6] || theme.colors.gray[4]
  const amountText = fmtMoney(primaryItem.amount, primaryItem.currency)
  const stageLabel = primaryItem.workflowStage
    ? primaryItem.workflowStage.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : null

  return (
    <Paper
      radius="md"
      withBorder
      style={{ borderLeft: `3px solid ${borderAccent}`, overflow: 'hidden', cursor: 'default' }}
    >
      {/* Primary item header — always visible, click to open detail sheet */}
      <Box px="sm" pt="sm" pb={secondaryCount > 0 ? 'xs' : 'sm'} style={{ cursor: 'pointer' }} onClick={() => onItemClick(primaryItem)}>
        <Group gap={6} mb={4} wrap="wrap">
          {orgLabel && (
            <Badge size="xs" variant="light" color="violet">{orgLabel}</Badge>
          )}
          <Badge size="xs" variant="light" color={flowColor}>
            {primaryItem.flowType || 'INBOX'}
          </Badge>
          {stageLabel && (
            <Badge size="xs" variant="dot" color="blue">{stageLabel}</Badge>
          )}
          {primaryItem.isRead === false && (
            <Box style={{ width: 7, height: 7, borderRadius: '50%', background: isDark ? theme.colors.teal[4] : theme.colors.teal[6], flexShrink: 0 }} />
          )}
        </Group>
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Box style={{ flex: 1, minWidth: 0 }}>
            {orgLabel && (
              <Text size="xs" c="dimmed" lineClamp={1}>
                Organization: {orgLabel}
              </Text>
            )}
            <Text fw={700} size="sm" truncate>{primaryItem.title}</Text>
            <Text size="xs" c="dimmed" lineClamp={2} mt={2}>{primaryItem.description}</Text>
            {amountText && <Text fw={700} size="sm" c="teal.7" mt={4}>{amountText}</Text>}
          </Box>
          <Stack gap={4} align="flex-end" style={{ flexShrink: 0 }}>
            <Badge size="sm" color={primaryItem.priority === 'high' ? 'red' : 'gray'} variant={primaryItem.priority === 'high' ? 'filled' : 'light'}>
              {primaryItem.actionLabel || 'Open'}
            </Badge>
            <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>{dayjs(primaryItem.createdAt).fromNow()}</Text>
            <IconChevronRight size={13} color={theme.colors.gray[5]} />
          </Stack>
        </Group>
      </Box>

      {/* Step expander — only when multiple steps share this workflow */}
      {secondaryCount > 0 && (
        <>
          <Divider />
          <Box
            px="sm"
            py={6}
            style={{ cursor: 'pointer', background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)' }}
            onClick={(e) => { e.stopPropagation(); onToggleExpand() }}
          >
            <Group gap={6} align="center">
              {isExpanded ? <IconChevronDown size={12} color={theme.colors.gray[5]} /> : <IconChevronRight size={12} color={theme.colors.gray[5]} />}
              <Text size="xs" c="dimmed" fw={600}>
                {secondaryCount} other step{secondaryCount > 1 ? 's' : ''} in this workflow
              </Text>
              <Badge size="xs" variant="outline" color="gray">{totalCount} total</Badge>
            </Group>
          </Box>
          {isExpanded && (
            <Stack gap={0}>
              {secondaryItems.map((item, idx) => (
                <Box key={item.id}>
                  <Divider />
                  <Box
                    px="sm"
                    py="xs"
                    style={{ cursor: 'pointer', opacity: item.status === 'completed' ? 0.6 : 1 }}
                    onClick={() => onItemClick(item)}
                  >
                    <Group justify="space-between" align="center" wrap="nowrap">
                      <Group gap={6} style={{ flex: 1, minWidth: 0 }}>
                        <Badge size="xs" variant="light" color={GROUP_FLOW_COLORS[item.flowType || 'SYSTEM'] || 'gray'}>
                          {item.flowType || 'SYSTEM'}
                        </Badge>
                        <Text size="xs" fw={500} truncate>{item.title}</Text>
                        {item.amount != null && (
                          <Text size="xs" c="teal.6" fw={600}>{fmtMoney(item.amount, item.currency) || ''}</Text>
                        )}
                      </Group>
                      <Group gap={4} style={{ flexShrink: 0 }}>
                        <Text size="xs" c="dimmed">{dayjs(item.createdAt).fromNow()}</Text>
                        <IconChevronRight size={11} color={theme.colors.gray[5]} />
                      </Group>
                    </Group>
                  </Box>
                </Box>
              ))}
            </Stack>
          )}
        </>
      )}
    </Paper>
  )
}

async function fetchOrganizationBranding(orgTenantId: string): Promise<{ displayName?: string; logoUrl?: string }> {
  try {
    const response = await api.get(`/api/discovery/organizations/${encodeURIComponent(orgTenantId)}`);
    const organization = response.data?.org || response.data || {};
    return {
      displayName: organization.displayName || organization.name || organization.label,
      logoUrl: organization.logoUrl || organization.logo || undefined,
    };
  } catch {
    try {
      const response = await api.get(`/api/organizations/${encodeURIComponent(orgTenantId)}`);
      const organization = Array.isArray(response.data)
        ? response.data.find((entry: any) => (entry.orgTenantId || entry.id) === orgTenantId)
        : response.data;
      return {
        displayName: organization?.displayName || organization?.name || organization?.label,
        logoUrl: organization?.logoUrl || organization?.logo || undefined,
      };
    } catch {
      return {};
    }
  }
}

type OrgSwitchPurpose = 'job' | 'requisition' | 'payable' | 'collection' | 'request';

const ORG_SWITCH_COPY: Record<OrgSwitchPurpose, { banner: string; action: string }> = {
  job: { banner: 'This job belongs to an organization you work with.', action: 'open this job' },
  requisition: { banner: 'This approval is for an organization you work with.', action: 'open this request' },
  payable: { banner: 'This payment is for an organization you work with.', action: 'open this payment' },
  collection: { banner: 'This collection is for an organization you work with.', action: 'open this collection' },
  request: { banner: 'This item is for an organization you work with.', action: 'open it' },
};

export default function InboxPage() {
  const router = useRouter();
  const filterParam = String((router.query.filter as string) ?? 'all').toLowerCase();
  const initialTab = filterParam === 'receipt' || filterParam === 'receipts'
    ? 'receipts'
      : filterParam === 'archived'
        ? 'archived'
      : filterParam === 'running' || filterParam === 'actions' || filterParam === 'requisitions' || filterParam === 'field'
        ? 'ops'
        : filterParam === 'requests' || filterParam === 'ecommerce' || filterParam === 'education' || filterParam === 'cash' || filterParam === 'payments' || filterParam === 'payment'
          ? 'finance'
          : filterParam === 'unread'
            ? 'all'
          : 'all';

  const [items, setItems] = useState<InboxItemData[]>([]);
  const [filter, setFilter] = useState(initialTab);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<InboxItemData | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [decisionReason, setDecisionReason] = useState('');
  const [metaState, setMetaState] = useState<InboxMetaState>(emptyMetaState);
  const [syncMeta, setSyncMeta] = useState<InboxSyncMeta>({});
  const [syncMetaReady, setSyncMetaReady] = useState(false);
  const [workflowSections, setWorkflowSections] = useState<InboxWorkflowSections>({ finance: false, ops: false });
  const [syncEngineState, setSyncEngineState] = useState<OfflineSyncState>({ isRunning: false, isSyncing: false });
  const [online, setOnline] = useState<boolean>(true);
  const [onlineReady, setOnlineReady] = useState(false);
  const [switchConsentOpen, setSwitchConsentOpen] = useState(false);
  const [switchConsentTarget, setSwitchConsentTarget] = useState<{ orgTenantId: string; orgName: string; purpose: OrgSwitchPurpose } | null>(null);
  const [expandedGroupKey, setExpandedGroupKey] = useState<string | null>(null);
  const switchConsentResolverRef = useRef<((approved: boolean) => void) | null>(null);
  const orgBrandingCacheRef = useRef<Record<string, { displayName?: string; logoUrl?: string }>>({});

  // Domain gating — approve/reject/issue require org action role (matrix §20.5)
  const canOrgAction = isOrgActionRole();
  const orgRoleClaim = getOrgRoleClaim();
  const activeOrgLabel = getActiveOrgLabel();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(inboxMetaKey());
      if (!raw) return;
      const parsed = JSON.parse(raw);
      setMetaState({
        read: parsed?.read && typeof parsed.read === 'object' ? parsed.read : {},
        archived: parsed?.archived && typeof parsed.archived === 'object' ? parsed.archived : {},
        deleted: parsed?.deleted && typeof parsed.deleted === 'object' ? parsed.deleted : {},
      });
    } catch {
      setMetaState(emptyMetaState);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(inboxMetaKey(), JSON.stringify(metaState));
  }, [metaState]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    setSyncMeta(readInboxSyncMeta());
    setSyncMetaReady(true);

    const handleStorageRefresh = () => {
      setSyncMeta(readInboxSyncMeta());
    };

    window.addEventListener('focus', handleStorageRefresh);
    window.addEventListener('pageshow', handleStorageRefresh);

    return () => {
      window.removeEventListener('focus', handleStorageRefresh);
      window.removeEventListener('pageshow', handleStorageRefresh);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    setOnline(window.navigator.onLine);
    setOnlineReady(true);

    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const ensureOrgContextForApproval = useCallback(async (orgTenantId?: string, orgNameHint?: string, purpose: OrgSwitchPurpose = 'request') => {
    if (!orgTenantId) return true;

    const currentMode = getContextMode();
    const currentOrgId = getActiveOrgId();
    if (currentMode === 'org' && currentOrgId === orgTenantId) return true;

    const orgName = orgNameHint || orgTenantId;
    const consentGranted = await new Promise<boolean>((resolve) => {
      switchConsentResolverRef.current = resolve;
      setSwitchConsentTarget({ orgTenantId, orgName, purpose });
      setSwitchConsentOpen(true);
    });

    if (!consentGranted) {
      return false;
    }

    const holderToken = getWalletToken();
    if (!holderToken) throw new Error('Missing holder wallet token for org context switch');

    const switchRes = await api.post(`/api/organizations/${encodeURIComponent(orgTenantId)}/switch`, {}, {
      headers: { Authorization: `Bearer ${holderToken}` },
      skipAuthRedirect: true as any,
    } as any);

    const orgToken = switchRes.data?.token as string | undefined;
    if (!orgToken) throw new Error('Failed to switch organization context');

    const resolvedOrgName = switchRes.data?.name
      || switchRes.data?.label
      || switchRes.data?.orgName
      || orgNameHint
      || orgTenantId;

    applyOrgContext({
      orgId: orgTenantId,
      orgName: resolvedOrgName,
      orgToken,
      orgRole: switchRes.data?.orgRole,
      sector: switchRes.data?.sector,
      workflowTypes: switchRes.data?.workflowTypes,
    });

    return true;
  }, []);

  const resolveSwitchConsent = useCallback((approved: boolean) => {
    const resolver = switchConsentResolverRef.current;
    switchConsentResolverRef.current = null;
    setSwitchConsentOpen(false);
    setSwitchConsentTarget(null);
    if (resolver) resolver(approved);
  }, []);

  const syncAndFetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    const startedAt = new Date().toISOString();
    const initialMeta: InboxSyncMeta = {
      ...readInboxSyncMeta(),
      lastAttemptAt: startedAt,
      lastError: undefined,
    };
    writeInboxSyncMeta(initialMeta);
    setSyncMeta(initialMeta);
    let holderOffersFailed = false;
    let holderReceiptsFailed = false;
    try {
      const contextMode = getContextMode();
      const walletToken = getWalletToken();
      const orgToken = contextMode === 'org' ? getOrgToken() : null;
      const walletHeaders = walletToken ? { Authorization: `Bearer ${walletToken}` } : undefined;
      const orgHeaders = orgToken ? { Authorization: `Bearer ${orgToken}` } : undefined;
      const holderToken = walletToken;
      const activeOrgId = getActiveOrgId();

      // Fetch enabled workflow templates — single source of truth replacing deprecated features
      let enabledWorkflowTypes: string[] = [];
      if (activeOrgId && orgHeaders) {
        try {
          const wfRes = await api.get(`/api/organizations/${activeOrgId}/workflows`, { headers: orgHeaders });
          enabledWorkflowTypes = (wfRes.data?.templates ?? [])
            .filter((t: any) => t.enabled)
            .map((t: any) => String(t.workflowType ?? '').toLowerCase());
        } catch (e) {
          console.warn('Workflow templates fetch failed — inbox gating skipped', e);
        }
      }

      const operationalWorkflowTypes = Array.from(new Set(
        enabledWorkflowTypes
          .map((workflowType) => toOperationalWorkflowType(workflowType))
          .filter((workflowType): workflowType is Exclude<ReturnType<typeof toOperationalWorkflowType>, null> => Boolean(workflowType))
      ));

      setWorkflowSections({
        finance: operationalWorkflowTypes.some((workflowType) => ['ecommerce', 'education_fees', 'cash_counter'].includes(workflowType)),
        ops: operationalWorkflowTypes.some((workflowType) => ['internal_requisitions', 'field_execution'].includes(workflowType)),
      });

      // Auto-sync receipts — only when a personal wallet token is available.
      // Calling with an org token (or no token) causes 401 which clears auth and breaks the session.
      if (walletToken) {
        try {
          const walletTenantId = getPersonalWalletTenantId();
          await api.post('/api/wallet/credentials/sync-receipts', {}, {
            headers: {
              ...walletHeaders,
              'x-context-mode': 'personal',
              ...(walletTenantId ? { 'x-context-tenant-id': walletTenantId } : {}),
            },
            skipAuthRedirect: true as any,
          } as any);
        } catch (e) {
          console.warn('Sync failed or timed out', e);
        }
      }

      let offers: any[] = [];
      let receipts: any[] = [];
      let requisitions: any[] = [];
      let assignedApprovals: any[] = [];
      let inboundOrgRequests: any[] = [];
      let exceptions: any[] = [];
      let fieldRuns: any[] = [];

      if (holderToken) {
        // Note: AbortController signals are NOT supported by CapacitorHttp (which
        // patches fetch/XHR natively on Android). Using signals causes silent failures.
        // Use the axios-level timeout (20s) set in api.ts instead.
        try {
          const resOffers = await api.get('/api/wallet/credentials/pending-offers', {
            headers: { Authorization: `Bearer ${holderToken}` },
          });
          const rows = safeArray(resOffers.data?.offers ?? resOffers.data);
          offers = offers.concat(rows.map((row: any) => ({ ...row, _context: 'personal', _token: holderToken })));
        } catch (e) {
          console.warn('Offers fetch failed for holder context', e);
          holderOffersFailed = true;
        }

        try {
          const resReceipts = await api.get('/api/wallet/credentials/pending-receipts', {
            headers: { Authorization: `Bearer ${holderToken}` },
          });
          const rows = safeArray(resReceipts.data?.pendingReceipts ?? resReceipts.data?.receipts ?? resReceipts.data);
          receipts = receipts.concat(rows.map((row: any) => ({ ...row, _context: 'personal', _token: holderToken })));
        } catch (e) {
          console.warn('Receipts fetch failed for holder context', e);
          holderReceiptsFailed = true;
        }

        try {
          const assignedRes = await api.get('/workflow-requests/assigned?status=pending&limit=50', {
            headers: { Authorization: `Bearer ${holderToken}` },
            // Some deployments may still enforce tenant scope here; avoid
            // triggering global logout on that probe and continue with org inbound.
            skipAuthRedirect: true as any,
          } as any);
          assignedApprovals = safeArray(assignedRes.data).map((row: any) => ({
            ...row,
            _context: 'personal',
            _token: holderToken,
          }));
        } catch (e) {
          console.warn('Assigned approvals fetch failed for holder context', e);
        }

      }

      if ((holderOffersFailed || holderReceiptsFailed) && holderToken) {
        const walletId = getPersonalWalletTenantId();
        const cachedSnapshot = walletId ? getCachedWalletSnapshot(walletId) : null;
        if (cachedSnapshot) {
          if (holderOffersFailed && offers.length === 0) {
            offers = offers.concat(
              safeArray(cachedSnapshot.pendingOffers).map((row: any) => ({ ...row, _context: 'personal', _token: holderToken }))
            );
          }

          if (holderReceiptsFailed && receipts.length === 0) {
            receipts = receipts.concat(
              safeArray(cachedSnapshot.pendingReceipts).map((row: any) => ({ ...row, _context: 'personal', _token: holderToken }))
            );
          }
        }
      }

      if (activeOrgId && orgHeaders && operationalWorkflowTypes.includes('internal_requisitions')) {
        try {
          const reqRes = await api.get('/api/finance/requisitions', { headers: orgHeaders });
          requisitions = Array.isArray(reqRes.data) ? reqRes.data : [];
        } catch (e) {
          console.warn('Requisitions fetch failed', e);
        }
      }

      // Fetch inbound workflow requests for org approvers (owner/admin/approver seeing requests
      // submitted by holders that need org action, regardless of specific assignee).
      if (activeOrgId && orgHeaders) {
        try {
          const inboundRes = await api.get('/workflow-requests/inbound?status=pending&limit=50', { headers: orgHeaders });
          inboundOrgRequests = safeArray(inboundRes.data).map((row: any) => ({ ...row, _context: 'org', _token: orgHeaders.Authorization?.slice(7) }));
        } catch (e) {
          console.warn('Inbound org workflow requests fetch failed', e);
        }
      }

      if (activeOrgId && operationalWorkflowTypes.includes('field_execution')) {
        try {
          // Field inbox actions are assignee-driven; prefer wallet context first.
          const runHeaderCandidates = [walletHeaders, orgHeaders].filter(Boolean) as Array<Record<string, string>>;
          for (const headers of runHeaderCandidates) {
            try {
              const runRes = await api.get('/workflows/runs?limit=25', { headers });
              const rows = Array.isArray(runRes.data) ? runRes.data : [];
              fieldRuns = rows.filter((run: any) => {
                const workflowId = String(run.workflowId || run.workflow_id || '');
                const stage = normalizeStage(run.output?.workflowStage || run.output?.stage || run.status || '');
                return workflowId.includes('field') || workflowId.includes('fept') || FEPT_STAGES.has(stage);
              });
              break;
            } catch {
              // Try next auth context.
            }
          }
        } catch (e) {
          console.warn('Field workflow runs fetch failed', e);
        }
      }

      if (activeOrgId && orgHeaders && operationalWorkflowTypes.some((workflowType) => ['ecommerce', 'education_fees', 'cash_counter', 'field_execution'].includes(workflowType))) {
        try {
          const exceptionRes = await api.get(`/api/reconciliation/exceptions?tenantId=${activeOrgId}&limit=20`, { headers: orgHeaders });
          exceptions = exceptionRes.data?.exceptions ?? [];
        } catch (e) {
          console.warn('Reconciliation exceptions fetch failed', e);
        }
      }

      const mappedReceipts: InboxItemData[] = receipts.map((r: any) => {
        const credentialType = String(r.credentialType || r.credential_type || '').toLowerCase();
        const sourceType = String(r.sourceType || r.source_type || '').toLowerCase();
        const paymentLinkId = String(r.paymentLinkId || r.payment_link_id || r.metadata?.paymentLinkId || r.metadata?.payment_link_id || r.claims?.paymentLinkId || r.sourceId || r.source_id || '').trim() || undefined;
        const invoiceRef = String(r.invoiceRef || r.invoice_id || r.invoiceId || r.metadata?.invoiceRef || r.metadata?.invoiceId || r.claims?.invoiceId || '').trim() || undefined;
        const quoteId = String(r.quoteId || r.metadata?.quoteId || r.claims?.quoteId || '').trim() || undefined;
        const merchantName = String(r.merchantName || r.payment_link_merchant_name || r.metadata?.merchantName || r.claims?.merchantName || activeOrgLabel || '').trim() || undefined;
        const paymentUrl = String(r.paymentUrl || r.metadata?.paymentUrl || r.claims?.paymentUrl || '').trim() || undefined;
        const amount = Number.isFinite(Number(r.amount)) ? Number(r.amount) : undefined;
        const currency = String(r.currency || 'USD').trim() || 'USD';

        let itemType: InboxItemData['itemType'] = 'receipt_offer';
        let module = 'Receipt';
        let flowType: NonNullable<InboxItemData['flowType']> = 'RECEIPT';
        let title = `Receipt: ${r.description || r.paymentId || invoiceRef || 'Payment'}`;
        let description = 'Verify and save your transaction receipt to your wallet';
        let actionLabel = 'Save';
        let priority: InboxItemData['priority'] = 'high';

        if (credentialType.includes('quote')) {
          itemType = 'credential_offer';
          module = 'finance';
          flowType = 'PAYMENT';
          title = `Quote from ${merchantName || 'Merchant'}`;
          description = amount != null
            ? `Review the quote (${currency} ${amount}) before accepting the invoice.`
            : 'Review the quote before continuing the purchase.';
          actionLabel = 'View Quote';
          priority = 'medium';
        } else if (credentialType.includes('invoice')) {
          itemType = 'invoice_offer';
          module = 'finance';
          flowType = 'PAYMENT';
          title = invoiceRef ? `Invoice ${invoiceRef}` : `Invoice from ${merchantName || 'Merchant'}`;
          description = amount != null
            ? `Accept the invoice (${currency} ${amount}) and continue payment.`
            : 'Accept the invoice and continue payment.';
          actionLabel = 'Accept & Pay';
          priority = 'high';
        } else if (credentialType.includes('receipt') || sourceType === 'payment') {
          itemType = 'receipt_offer';
          module = 'Receipt';
          flowType = 'RECEIPT';
          title = `Receipt: ${r.description || r.paymentId || invoiceRef || 'Payment'}`;
          description = 'Verify and save your transaction receipt to your wallet';
          actionLabel = 'Save';
          priority = 'high';
        }

        return {
          id: r.id ?? r.receiptRowId ?? r.offerId ?? r.linkId,
          title,
          description,
          module,
          status: 'pending' as const,
          priority,
          createdAt: r.createdAt ?? r.issuedAt ?? new Date().toISOString(),
          actionLabel,
          offerUri: r.offerUri,
          authContext: r._context,
          authToken: r._token,
          itemType,
          amount,
          currency,
          paymentLinkId,
          invoiceRef,
          quoteId,
          paymentUrl,
          ownerOrgTenantId: activeOrgId || undefined,
          ownerDisplayName: merchantName || activeOrgLabel || undefined,
          flowType,
        };
      });

      const runStageById = new Map<string, string>();
      for (const run of fieldRuns) {
        const runId = normalizeRunId(run.id || run.runId);
        if (!runId) continue;
        const runStage = String(run.output?.workflowStage || '').toUpperCase();
        if (runStage) runStageById.set(runId, runStage);
      }

      const runHeaderCandidates = [walletHeaders, orgHeaders].filter(Boolean) as Array<Record<string, string>>;
      if (runHeaderCandidates.length > 0) {
        const workflowRunIds = Array.from(new Set(
          offers
            .map((o: any) => normalizeRunId(o.workflowRunId || o.claims?.workflowRunId))
            .filter((id: any): id is string => typeof id === 'string' && id.length > 0)
        )) as string[];

        if (workflowRunIds.length > 0) {
          await Promise.all(workflowRunIds.map(async (runId) => {
            for (const headers of runHeaderCandidates) {
              try {
                const runRes = await api.get(`/workflows/runs/${runId}`, { headers });
                const stage = String(runRes.data?.output?.workflowStage || '').toUpperCase();
                if (stage) {
                  runStageById.set(runId, stage);
                }
                break;
              } catch {
                // Try next auth context.
              }
            }
          }));
        }
      }

      const mappedOffers: InboxItemData[] = offers.map((o: any) => {
        if (o.sourceType === 'requisition_stage_action' || String(o.credentialType || '').toLowerCase() === 'requisitionstageaction') {
          const claim = o.claims || {};
          const stageAction = String(claim.stageAction || '').toLowerCase();
          const stageCopy = getRequisitionStageActionUiCopy(stageAction);
          const workflowRequestId = String(claim.requestId || '').trim() || undefined;
          const rawRequisitionId = String(claim.requisitionId || '').trim();
          const requisitionId = rawRequisitionId || String(o.sourceId || '').split(':')[0] || undefined;
          const targetOrgTenantId = claim.targetOrgTenantId || undefined;

          return {
            id: o.id ?? o.offerId,
            title: stageCopy.title,
            description: stageCopy.description
              || `Next requisition step is assigned to ${claim.assigneeRole || 'your role'}.`,
            module: 'requisitions',
            flowType: 'WORKFLOW' as const,
            status: 'pending' as const,
            priority: 'high' as const,
            createdAt: o.createdAt ?? new Date().toISOString(),
            actionLabel: stageCopy.actionLabel,
            itemType: 'workflow' as const,
            workflowRequestId,
            workflowRequestType: 'requisition',
            requisitionId,
            actingOrgTenantId: targetOrgTenantId,
            ownerOrgTenantId: targetOrgTenantId,
            ownerDisplayName: claim.targetOrgName || claim.orgName || activeOrgLabel || undefined,
            assignmentRole: claim.assigneeRole,
            authContext: 'personal',
            authToken: o._token || holderToken,
          };
        }

        if (o.sourceType === 'workflow_stage_action' || String(o.credentialType || '').toLowerCase() === 'workflowstageaction') {
          const claim = o.claims || {};
          const requestType = String(claim.requestType || claim.workflowType || 'workflow');
          const requestCopy = getAssignmentRequestUiCopy(requestType);
          const delegated = String(claim.routedVia || '') === 'delegation';
          const targetOrgTenantId = claim.targetOrgTenantId || claim.orgTenantId || undefined;
          const workflowTypeLower = String(claim.workflowType || requestType).toLowerCase();
          const isFieldStage = workflowTypeLower.includes('fept') || workflowTypeLower.includes('field');
          const stageAction = String(claim.stageAction || '').toLowerCase();
          const stageRunId = isFieldStage
            ? normalizeRunId(
              o.workflowRunId
              || claim.workflowRunId
              || String(o.sourceId || '').replace(/:(signoff|payout|review|inspection)(:delegation:.*)?$/i, ''),
            )
            : undefined;
          if (isFieldStage && stageRunId) {
            // Field stage cards open the assigned job instead of the generic approve/reject form.
            const stage = String(runStageById.get(stageRunId) || claim.workflowStage || 'ASSIGNED').toUpperCase();
            const stageActionLabel = stageAction === 'acknowledge_execution'
              ? 'Sign off job'
              : stageAction === 'trigger_payout'
                ? 'Release payment'
                : stageAction === 'review_completion'
                  ? 'Review work'
                  : stageAction === 'inspect_site'
                    ? 'Site check'
                    : null;
            return {
              id: o.id ?? o.offerId,
              title: o.title || requestCopy.title,
              description: delegated
                ? `Passed to you. ${o.body || requestCopy.title}`
                : (o.body || 'This job is assigned to you.'),
              module: 'field',
              flowType: 'WORKFLOW' as const,
              status: 'pending' as const,
              priority: 'high' as const,
              createdAt: o.createdAt ?? new Date().toISOString(),
              actionLabel: stageActionLabel || (stage === 'ASSIGNED' ? 'Start job' : stage === 'IN_PROGRESS' ? 'Add photos' : 'Open'),
              itemType: 'workflow' as const,
              workflowRunId: stageRunId,
              workflowStage: stage,
              workflowRequestType: requestType,
              amount: Number.isFinite(Number(claim.amount)) ? Number(claim.amount) : undefined,
              currency: String(claim.currency || 'USD').trim() || 'USD',
              actingOrgTenantId: targetOrgTenantId,
              ownerOrgTenantId: targetOrgTenantId,
              ownerDisplayName: claim.orgName || activeOrgLabel || undefined,
              assignmentRole: claim.assigneeRole,
              authContext: 'personal',
              authToken: o._token || holderToken,
            };
          }
          // Organization requests (purchases, quotes, general asks) are approved or declined right here.
          const platformRequestId = /^[a-z]+\.[a-z_]+$/i.test(requestType) && !requestType.toLowerCase().startsWith('field.')
            ? String(o.sourceId || '').replace(/:delegation:.*$/, '') || undefined
            : undefined;
          return {
            id: o.id ?? o.offerId,
            title: o.title || requestCopy.title,
            description: delegated
              ? `Passed to you. ${o.body || requestCopy.title}`
              : (o.body || 'Waiting for your decision.'),
            module: 'approvals',
            flowType: 'WORKFLOW' as const,
            status: 'pending' as const,
            priority: 'high' as const,
            createdAt: o.createdAt ?? new Date().toISOString(),
            actionLabel: platformRequestId ? 'Approve' : requestCopy.actionLabel,
            itemType: 'workflow' as const,
            workflowRequestType: requestType,
            platformRequestId,
            amount: Number.isFinite(Number(claim.amount)) ? Number(claim.amount) : undefined,
            currency: String(claim.currency || 'USD').trim() || 'USD',
            actingOrgTenantId: targetOrgTenantId,
            ownerOrgTenantId: targetOrgTenantId,
            ownerDisplayName: claim.targetOrgName || claim.orgName || activeOrgLabel || undefined,
            assignmentRole: claim.assigneeRole,
            authContext: 'personal',
            authToken: o._token || holderToken,
          };
        }

        if (o.sourceType === 'workflow_request_assignment' || String(o.credentialType || '').toLowerCase() === 'workflowrequestapproval') {
          const claim = o.claims || {};
          const requestType = String(claim.requestType || 'workflow').toLowerCase();
          const requestCopy = getAssignmentRequestUiCopy(requestType);
          const isRequisition = requestType === 'requisition' || requestType.includes('requis');
          const workflowRequestId = String(claim.requestId || o.offerUri || '').replace(/^workflow-request:\/\//, '');
          const pendingAssignment = assignedApprovals.find((row: any) => row.id === workflowRequestId)
            || inboundOrgRequests.find((row: any) => row.id === workflowRequestId);
          if (!pendingAssignment) {
            // Skip stale assignment offers that remain in wallet_pending_offers after the
            // underlying workflow request is no longer pending.
            return null as any;
          }
          const targetOrgTenantId = claim.targetOrgTenantId || undefined;
          const requisitionId = pendingAssignment?.payload?.requisitionId || claim.requisitionId || undefined;

          return {
            id: o.id ?? o.offerId,
            title: requestCopy.title,
            description: claim.assigneeRole
              ? `Assigned as ${claim.assigneeRole}. Switch to org context to review and act.`
              : 'You have an org approval request assigned to you.',
            module: 'approvals',
            flowType: 'WORKFLOW' as const,
            status: 'pending' as const,
            priority: 'high' as const,
            createdAt: o.createdAt ?? new Date().toISOString(),
            actionLabel: requestCopy.actionLabel,
            itemType: 'workflow' as const,
            workflowRequestId,
            workflowRequestType: requestType,
            requisitionId,
            actingOrgTenantId: targetOrgTenantId,
            ownerOrgTenantId: targetOrgTenantId,
            ownerDisplayName: claim.targetOrgName || claim.orgName || claim.merchantName || activeOrgLabel || undefined,
            assignmentRole: claim.assigneeRole,
            authContext: 'personal',
            authToken: o._token || holderToken,
          };
        }

        if (o.sourceType === 'ap_workflow_assignment' || String(o.credentialType || '').toLowerCase() === 'workflowactionassignment') {
          const claim = o.claims || {};
          const transactionId = String(claim.transactionId || o.sourceId || '').trim();
          if (!transactionId) return null as any;
          const proofRequestId = String(claim.proofRequestId || '').trim() || undefined;
          const proofResponseId = String(claim.proofResponseId || '').trim() || undefined;
          const requiredActionRaw = String(claim.requiredAction || '').trim();
          const requiredAction = requiredActionRaw || (proofResponseId ? 'record_payment' : 'present_payment_proof');
          const targetOrgTenantId = claim.targetOrgTenantId || undefined;
          const rawStatus = String(claim.txStatus || claim.status || '').toLowerCase();
          const trustStatus: InboxItemData['trustStatus'] = rawStatus === 'proof_presented'
            ? 'proof_presented'
            : rawStatus === 'paid'
              ? 'settled'
              : rawStatus === 'disputed'
                ? 'disputed'
                : 'pending';
          const isArCollection = requiredAction === 'present_payment_proof' || String(claim.workflowType || '').toLowerCase() === 'ap_trust_workflow';
          const apCopy = getApWorkflowActionUiCopy(requiredAction, isArCollection);
          const amountValue = Number.isFinite(Number(claim.amount)) ? Number(claim.amount) : undefined;
          const currency = String(claim.currency || 'USD').trim() || 'USD';
          const invoiceRef = String(claim.invoiceRef || claim.invoiceId || claim.apInvoiceId || '').trim() || undefined;
          const paymentUrl = firstNonEmptyString(claim.paymentUrl, claim.shortlinkUrl, claim.offerUri);
          const { paymentCode } = resolvePaymentNavigationTarget({
            paymentCode: firstNonEmptyString(claim.paymentCode, claim.shortlinkCode),
            paymentUrl,
            offerUri: o.offerUri,
          });
          const sourcePaymentLinkId = String(claim.sourcePaymentLinkId || claim.source_payment_link_id || '').trim() || undefined;
          const counterpartyName = String(claim.collectorOrgName || claim.counterpartyOrgName || claim.ownerOrgName || '').trim();
          const oweCounterpartyText = counterpartyName ? `You owe ${counterpartyName}` : 'You owe a supplier';

          return {
            id: o.id ?? o.offerId,
            title: apCopy.title,
            description: isArCollection
              ? `${oweCounterpartyText}.${amountValue != null ? ` Amount ${currency} ${amountValue}.` : ''} Present consent proof to continue.`
              : `Action required: ${requiredAction}. Switch to org context to continue.`,
            module: isArCollection ? 'finance' : 'approvals',
            flowType: isArCollection ? 'PAYMENT' as const : 'WORKFLOW' as const,
            status: 'pending' as const,
            priority: 'high' as const,
            createdAt: o.createdAt ?? new Date().toISOString(),
            actionLabel: apCopy.actionLabel,
            itemType: isArCollection ? 'ar_collection' as const : 'workflow' as const,
            workflowRequestId: transactionId,
            workflowRequestType: isArCollection ? 'ar_collection' : 'ap_workflow',
            transactionId,
            requiredAction,
            proofRequestId,
            proofResponseId,
            trustStatus,
            invoiceRef,
            amount: amountValue,
            currency,
            paymentUrl,
            paymentCode,
            paymentLinkId: sourcePaymentLinkId,
            actingOrgTenantId: targetOrgTenantId,
            ownerOrgTenantId: targetOrgTenantId,
            ownerDisplayName: claim.targetOrgName || claim.orgName || activeOrgLabel || undefined,
            counterpartyOrgName: claim.collectorOrgName || claim.counterpartyOrgName || claim.ownerOrgName || undefined,
            assignmentRole: claim.assigneeRole,
            authContext: 'personal',
            authToken: o._token || holderToken,
          };
        }

        if (o.sourceType === 'proof_request' || String(o.credentialType || '').toLowerCase() === 'proofrequest') {
          const claim = o.claims || {};
          return {
            id: o.id ?? o.offerId,
            title: 'Proof Request',
            description: claim.providerRef
              ? `Open and present requested proof for ${claim.providerRef}`
              : 'Open and present requested credential proof',
            module: 'present',
            flowType: 'REQUEST' as const,
            status: 'pending' as const,
            priority: 'high' as const,
            createdAt: o.createdAt ?? new Date().toISOString(),
            actionLabel: 'Open request',
            offerUri: o.offerUri,
            authContext: o._context,
            authToken: o._token,
            itemType: 'workflow' as const,
          };
        }

        const isVpRequest = Boolean(o.offerUri?.includes('request_uri=') || o.offerUri?.startsWith('openid-vc:') || o.offerUri?.startsWith('openid4vp:'));
        if (o.sourceType === 'payment_link' || String(o.credentialType || '').toLowerCase() === 'paymentlink' || String(o.credentialType || '').toLowerCase() === 'schoolfeesinvoice') {
          const claim = o.claims || {};
          const amountValue = Number.isFinite(Number(claim.amount)) ? Number(claim.amount) : undefined;
          const amount = claim.amount != null ? `${claim.currency || ''} ${claim.amount}`.trim() : null;
          const invoiceRef = String(claim.invoiceRef || claim.invoiceId || o.sourceId || '').trim() || undefined;

          // Generalized metadata decoding
          const metadata = claim.metadata || {};
          const typeLabel = metadata.type || (String(o.credentialType || '').toLowerCase() === 'schoolfeesinvoice' ? 'School Fees' : 'Invoice');
          const paymentUrl = firstNonEmptyString(
            claim.shortlinkUrl,
            claim.paymentUrl,
            metadata.shortlinkUrl,
            metadata.paymentUrl,
            o.offerUri
          );
          const { paymentCode } = resolvePaymentNavigationTarget({
            paymentCode: firstNonEmptyString(claim.shortlinkCode, claim.paymentCode, metadata.shortlinkCode, metadata.paymentCode),
            paymentUrl,
            offerUri: o.offerUri,
          });

          return {
            id: o.id ?? o.offerId,
            title: isVpRequest ? 'Payment Request' : (invoiceRef ? `${typeLabel} ${invoiceRef}` : `${typeLabel} Details`),
            description: isVpRequest ? 'Verify identity to continue payment' : (amount
              ? `Tap to complete payment (${amount})${claim.schoolName || metadata.customerName ? ` · ${claim.schoolName || metadata.customerName}` : ''}`
              : 'Tap to continue payment in app'),
            module: isVpRequest ? 'present' : 'finance',
            flowType: isVpRequest ? 'REQUEST' as const : 'PAYMENT' as const,
            status: 'pending' as const,
            priority: 'high' as const,
            createdAt: o.createdAt ?? new Date().toISOString(),
            expiresAt: o.expiresAt ?? o.expires_at,
            actionLabel: isVpRequest ? 'Open Request' : 'Pay now',
            offerUri: o.offerUri,
            authContext: o._context,
            authToken: o._token,
            itemType: 'payment_link' as const,
            invoiceRef,
            paymentUrl,
            paymentCode,
            paymentLinkId: String(o.sourceId || claim.paymentLinkId || metadata.paymentLinkId || '').trim() || undefined,
            amount: amountValue,
            currency: String(claim.currency || 'USD').trim() || 'USD',
            ownerOrgTenantId: String(claim.orgTenantId || claim.targetOrgTenantId || activeOrgId || '').trim() || undefined,
            ownerDisplayName: claim.schoolName || claim.orgName || metadata.type || activeOrgLabel || undefined,
          };
        }

        if (o.sourceType === 'quote_offer' || String(o.credentialType || '').toLowerCase() === 'quotevc') {
          const claim = o.claims || {};
          const amountValue = Number.isFinite(Number(claim.amount)) ? Number(claim.amount) : undefined;
          const merchantName = String(claim.merchantName || claim.orgName || activeOrgLabel || 'Merchant').trim();
          return {
            id: o.id ?? o.offerId,
            title: `Quote from ${merchantName}`,
            description: amountValue
              ? `Price confirmed: ${claim.currency || 'USD'} ${amountValue}. Invoice will follow.`
              : 'Price quote issued for your purchase.',
            module: 'finance',
            flowType: 'PAYMENT' as const,
            status: 'pending' as const,
            priority: 'medium' as const,
            createdAt: o.createdAt ?? new Date().toISOString(),
            actionLabel: 'View Quote',
            offerUri: o.offerUri,
            authContext: o._context,
            authToken: o._token,
            itemType: 'credential_offer' as const,
            // paymentLinkId links this quote to its invoice and receipt in the group
            paymentLinkId: String(claim.paymentLinkId || o.sourceId || '').trim() || undefined,
            invoiceRef: String(claim.quoteId || '').trim() || undefined,
            amount: amountValue,
            currency: String(claim.currency || 'USD').trim() || 'USD',
            ownerOrgTenantId: String(claim.orgTenantId || activeOrgId || '').trim() || undefined,
            ownerDisplayName: merchantName,
          };
        }

        if (o.sourceType === 'invoice_offer' || String(o.credentialType || '').toLowerCase() === 'invoicevc') {
          const claim = o.claims || {};
          const invoiceRef = String(claim.invoiceId || claim.invoiceRef || o.sourceId || '').trim() || undefined;
          const amountValue = Number.isFinite(Number(claim.amount)) ? Number(claim.amount) : undefined;
          const amount = claim.amount != null ? `${claim.currency || ''} ${claim.amount}`.trim() : null;

          const metadata = claim.metadata || {};
          const typeLabel = metadata.type || 'Invoice';
          const paymentUrl = firstNonEmptyString(
            claim.paymentUrl,
            claim.shortlinkUrl,
            metadata.paymentUrl,
            metadata.shortlinkUrl,
            o.offerUri
          );
          const { paymentCode } = resolvePaymentNavigationTarget({
            paymentCode: firstNonEmptyString(claim.paymentCode, claim.shortlinkCode, metadata.paymentCode, metadata.shortlinkCode),
            paymentUrl,
            offerUri: o.offerUri,
          });

          return {
            id: o.id ?? o.offerId,
            title: invoiceRef ? `${typeLabel} ${invoiceRef}` : typeLabel,
            description: amount
              ? `Accept ${typeLabel.toLowerCase()} and continue payment (${amount}).`
              : `Accept ${typeLabel.toLowerCase()} and continue payment.`,
            module: 'finance',
            flowType: 'PAYMENT' as const,
            status: 'pending' as const,
            priority: 'high' as const,
            createdAt: o.createdAt ?? new Date().toISOString(),
            expiresAt: o.expiresAt ?? o.expires_at,
            actionLabel: 'Accept & Pay',
            offerUri: o.offerUri,
            authContext: o._context,
            authToken: o._token,
            itemType: 'invoice_offer' as const,
            invoiceRef,
            paymentUrl,
            paymentCode,
            paymentLinkId: String(claim.paymentLinkId || metadata.paymentLinkId || o.sourceId || '').trim() || undefined,
            amount: amountValue,
            currency: String(claim.currency || 'USD').trim() || 'USD',
            ownerOrgTenantId: String(claim.orgTenantId || claim.targetOrgTenantId || activeOrgId || '').trim() || undefined,
            ownerDisplayName: claim.schoolName || claim.orgName || claim.merchantName || metadata.customerName || activeOrgLabel || undefined,
          };
        }

        // Field task assignments come back as credential_type='FieldTask' with no offerUri.
        if (o.sourceType === 'workflow_assignment' || o.credentialType === 'FieldTask') {
          const meta = o.claims || {}
          const workflowRunId = normalizeRunId(o.workflowRunId || meta.workflowRunId)
          const stage = String((workflowRunId ? runStageById.get(workflowRunId) : null) || meta.workflowStage || 'ASSIGNED').toUpperCase()
          const createdAt = o.createdAt || o.created_at || meta.assignedAt || new Date().toISOString()
          return {
            id: o.id ?? o.offerId,
            title: o.title || `Field Job: ${meta.poNumber || o.workflowRunId || 'Unknown'}`,
            description: o.body || `Location: ${meta.location || 'Field site'} — Stage: ${stage}`,
            module: 'field',
            flowType: 'WORKFLOW' as const,
            status: 'pending' as const,
            priority: 'high' as const,
            createdAt,
            actionLabel: stage === 'ASSIGNED' ? 'Start Job' : stage === 'IN_PROGRESS' ? 'Capture Evidence' : 'Open',
            itemType: 'workflow' as const,
            workflowRunId: workflowRunId || undefined,
            workflowStage: stage,
            amount: Number.isFinite(Number(meta.amount)) ? Number(meta.amount) : undefined,
            currency: String(meta.currency || 'USD').trim() || 'USD',
            authContext: o._context,
            authToken: o._token,
            ownerOrgTenantId: String(meta.orgTenantId || meta.targetOrgTenantId || activeOrgId || '').trim() || undefined,
            ownerDisplayName: meta.orgName || meta.targetOrgName || activeOrgLabel || undefined,
          }
        }

        const credentialType = String(o.credentialType || '');
        const claim = o.claims || {};
        const orgLabel = claim.orgName || o.issuerName;
        const credentialTitle =
          o.sourceType === 'org_employee' || credentialType === 'EmployeeCredential'
            ? `Employee credential${orgLabel ? ` · ${orgLabel}` : ''}`
            : o.sourceType === 'org_delegation' || credentialType === 'DelegationCredential'
              ? `Delegation${orgLabel ? ` · ${orgLabel}` : ''}`
              : o.sourceType === 'employment_contract' || credentialType === 'EmploymentContractVC'
                ? `Employment contract${orgLabel ? ` · ${orgLabel}` : ''}`
                : o.sourceType === 'org_workflow_actor' || credentialType === 'OrgWorkflowActorCredential'
                  ? (o.title || `Role credential${orgLabel ? ` · ${orgLabel}` : ''}`)
                  : o.sourceType === 'workflow_vc_offer'
                    ? (o.title || `Job record${orgLabel ? ` · ${orgLabel}` : ''}`)
                  : o.sourceType === 'platform_identity' || credentialType === 'PlatformIdentityCredential'
                    ? 'Platform identity'
                    : formatCredentialType(credentialType || 'Credential Offer');
        const credentialBody =
          o.body
          || (orgLabel ? `From ${orgLabel}` : o.issuerName ? `From ${o.issuerName}` : 'Waiting for you to add it to your wallet');

        return {
          id: o.id ?? o.offerId,
          title: credentialTitle,
          description: credentialBody,
          module: 'Request',
          flowType: 'REQUEST' as const,
          status: 'pending' as const,
          priority: 'medium' as const,
          createdAt: o.createdAt ?? new Date().toISOString(),
          expiresAt: o.expiresAt ?? o.expires_at,
          actionLabel: 'Accept',
          offerUri: o.offerUri,
          authContext: o._context,
          authToken: o._token,
          itemType: 'credential_offer' as const,
          ownerDisplayName: o.issuerName || undefined,
        }
      }).filter(Boolean);

      const mergedMappedOffers = mergeInvoiceAndPaymentOffers(mappedOffers)
        .filter((item) => !item.id.startsWith('deduped-'));

      const offerUriSet = new Set(mergedMappedOffers.filter(item => item.offerUri).map((item) => item.offerUri).filter(Boolean))
      const dedupedReceipts = mappedReceipts.filter((item) => !item.offerUri || !offerUriSet.has(item.offerUri));

      const mappedRequisitions: InboxItemData[] = requisitions.map((r: any) => ({
        id: r.id,
        title: r.metadata?.department ? `Requisition: ${r.metadata.department}` : `Requisition ${r.id}`,
        description: r.metadata?.notes || 'Review approvals, release, and acknowledgement state for this requisition.',
        module: 'requisitions',
        flowType: 'WORKFLOW' as const,
        status: ['APPROVED', 'RELEASED', 'ACKNOWLEDGED', 'COMPLETED', 'RECONCILED'].includes(String(r.status ?? '').toUpperCase()) ? 'completed' : 'pending',
        priority: 'medium' as const,
        createdAt: r.updatedAt ?? new Date().toISOString(),
        actionLabel: 'Open',
        itemType: 'workflow' as const,
        workflowRequestId: r.workflowRequestId,
        workflowRequestType: 'requisition',
        workflowStage: String(r.status || '').toUpperCase(),
        amount: Number.isFinite(Number(r.metadata?.amount)) ? Number(r.metadata?.amount) : Number.isFinite(Number(r.metadata?.totalAmount)) ? Number(r.metadata?.totalAmount) : undefined,
        currency: String(r.metadata?.currency || 'USD').trim() || 'USD',
        ownerOrgTenantId: activeOrgId || undefined,
        ownerDisplayName: activeOrgLabel || undefined,
      }));

      // Merge personal assigned approvals + org inbound requests, deduped by request ID.
      const allApprovalRows = [
        ...assignedApprovals,
        // Include inbound org requests not already covered by personal assignment
        ...inboundOrgRequests.filter(
          (inboundRow: any) => !assignedApprovals.some((a: any) => a.id === inboundRow.id)
        ),
      ];

      const mappedAssignedApprovals: InboxItemData[] = allApprovalRows.map((row: any) => {
        const requestType = String(row.requestType || 'workflow');
        const isRequisition = requestType.toLowerCase() === 'requisition';
        const requisitionCopy = isRequisition ? 'Review requisition and approve' : 'Review request and approve';

        return {
          id: `approval-${row.id}`,
          title: isRequisition
            ? 'Requisition Approval Request'
            : `Approval Request: ${requestType.replace(/_/g, ' ')}`,
          description: row.contactName
            ? `From ${row.contactName}. ${requisitionCopy} as ${row.assigneeRole || 'org approver'} on behalf of your org.`
            : `${requisitionCopy} as ${row.assigneeRole || 'org approver'} on behalf of your organization.`,
          module: 'approvals',
          flowType: 'WORKFLOW' as const,
          status: 'pending' as const,
          priority: 'high' as const,
          createdAt: row.updatedAt ?? row.createdAt ?? new Date().toISOString(),
          actionLabel: 'Approve',
          itemType: 'workflow' as const,
          workflowRequestId: row.id,
          workflowRequestType: row.requestType,
          requisitionId: row.payload?.requisitionId,
          workflowStage: String(row.currentStatus || row.status || '').toUpperCase() || undefined,
          amount: Number.isFinite(Number(row.payload?.amount)) ? Number(row.payload?.amount) : Number.isFinite(Number(row.payload?.totalAmount)) ? Number(row.payload?.totalAmount) : undefined,
          currency: String(row.payload?.currency || 'USD').trim() || 'USD',
          actingOrgTenantId: row.targetOrgTenantId,
          ownerOrgTenantId: row.targetOrgTenantId,
          ownerDisplayName: row.targetOrgName || row.orgName || activeOrgLabel || undefined,
          assignmentRole: row.assigneeRole,
          authContext: row._context,
          authToken: row._token,
        };
      });

      const operationalType = operationalWorkflowTypes.find((workflowType) => ['ecommerce', 'education_fees', 'cash_counter', 'field_execution'].includes(workflowType));
      const operationalModule = operationalType ? (MODULE_BY_FEATURE[operationalType.toUpperCase()] ?? operationalType) : 'ecommerce';
      const mappedExceptions: InboxItemData[] = exceptions.map((entry: any) => ({
        id: entry.providerRef ?? entry.provider_ref ?? entry.id,
        title: entry.status ? `Exception: ${entry.status}` : 'Workflow exception',
        description: 'Needs review in the activity and reconciliation views.',
        module: operationalModule,
        flowType: 'SYSTEM' as const,
        status: 'pending' as const,
        priority: 'high' as const,
        createdAt: entry.updatedAt ?? entry.updated_at ?? new Date().toISOString(),
        actionLabel: 'Open',
        itemType: 'workflow' as const,
        ownerOrgTenantId: activeOrgId || undefined,
        ownerDisplayName: activeOrgLabel || undefined,
      }));

      const mappedFieldRuns: InboxItemData[] = fieldRuns.map((run: any) => {
        const stage = normalizeStage(run.output?.workflowStage || run.output?.stage || run.status || '');
        const workflowInput = run.output?.workflowInput || run.input || {};
        const poRef = workflowInput.poNumber || workflowInput.reference || run.id;
        const location = workflowInput.location || 'Field site';
        const terminalStages = new Set(['RECONCILED', 'COMPLETED', 'CANCELLED', 'REVOKED']);
        const stageLabel = stage ? stage.replace(/_/g, ' ') : String(run.status || '').toUpperCase();

        return {
          id: `field-${run.id}`,
          title: `Field Job: ${poRef}`,
          description: `Stage ${stageLabel} at ${location}`,
          module: 'field',
          flowType: 'WORKFLOW' as const,
          status: terminalStages.has(stage) || String(run.status || '').toLowerCase() === 'completed' ? 'completed' : 'pending',
          priority: stage === 'ASSIGNED' || stage === 'IN_PROGRESS' || stage === 'EVIDENCE_CAPTURED' ? 'high' as const : 'medium' as const,
          createdAt: run.createdAt || run.created_at || new Date().toISOString(),
          actionLabel: getFieldRunActionLabel(stage),
          itemType: 'workflow' as const,
          workflowRunId: run.id,
          workflowStage: stage,
          amount: Number.isFinite(Number(workflowInput.amount)) ? Number(workflowInput.amount) : Number.isFinite(Number(workflowInput.budget)) ? Number(workflowInput.budget) : undefined,
          currency: String(workflowInput.currency || 'USD').trim() || 'USD',
          ownerOrgTenantId: activeOrgId || undefined,
          ownerDisplayName: activeOrgLabel || undefined,
        };
      });

      const storedRunningItems: InboxItemData[] = getRunningActions()
        .filter((entry) => entry.status !== 'completed' && !entry.id.startsWith('ar-collection:'))
        .map((entry) => {
          const flowType = entry.type === 'payment' ? 'PAYMENT' : 'WORKFLOW'
          const module = entry.type === 'payment' ? 'finance' : entry.type === 'field_run' ? 'field' : entry.type === 'requisition' ? 'approvals' : 'Request'
          const workflowRunId = entry.type === 'field_run' ? entry.refId : undefined
          const workflowRequestId = entry.type === 'requisition' ? entry.refId : undefined
          const paymentCode = entry.type === 'payment' ? entry.refId : undefined
          const isArCollection = entry.id.startsWith('ar-collection:')
          return {
            id: `running-${entry.id}`,
            title: entry.title,
            description: entry.description || 'Resume this in-progress flow',
            module: isArCollection ? 'finance' : module,
            flowType: isArCollection ? 'PAYMENT' as const : flowType,
            status: 'pending' as const,
            priority: 'high' as const,
            createdAt: entry.updatedAt || entry.createdAt,
            actionLabel: 'Resume',
            itemType: isArCollection ? 'ar_collection' as const : entry.type === 'payment' ? 'payment_link' as const : 'workflow' as const,
            workflowRunId,
            workflowRequestId,
            requisitionId: entry.type === 'requisition' ? entry.refId : undefined,
            transactionId: isArCollection ? entry.refId : undefined,
            paymentCode,
            ownerOrgTenantId: entry.orgTenantId,
            ownerDisplayName: entry.orgTenantId || undefined,
            offerUri: entry.type === 'proof' ? entry.refId : undefined,
          }
        })

      const dedupeKey = (item: InboxItemData) =>
        item.workflowRequestId && (item.itemType === 'workflow' || item.itemType === 'ar_collection')
          ? `workflow-request:${item.workflowRequestId}`
          : item.workflowRunId && item.itemType === 'workflow'
            ? `workflow:${item.workflowRunId}`
            : item.offerUri || `${item.itemType}:${item.id}`;
      const merged = [...dedupedReceipts, ...mergedMappedOffers, ...mappedFieldRuns, ...mappedAssignedApprovals, ...mappedRequisitions, ...mappedExceptions, ...storedRunningItems];
      const seen = new Set<string>();
      const mapped = merged.filter((item) => {
        const key = dedupeKey(item);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const brandingOrgIds = Array.from(new Set(
        mapped
          .map((item) => item.ownerOrgTenantId || item.actingOrgTenantId)
          .filter((value): value is string => typeof value === 'string' && value.length > 0)
      ));

      const brandingByOrgId = new Map<string, { displayName?: string; logoUrl?: string }>();
      await Promise.all(brandingOrgIds.map(async (orgTenantId) => {
        const cached = orgBrandingCacheRef.current[orgTenantId];
        if (cached) {
          brandingByOrgId.set(orgTenantId, cached);
          return;
        }

        const branding = await fetchOrganizationBranding(orgTenantId);
        orgBrandingCacheRef.current[orgTenantId] = branding;
        brandingByOrgId.set(orgTenantId, branding);
      }));

      const brandedMapped = mapped.map((item) => {
        const orgTenantId = item.ownerOrgTenantId || item.actingOrgTenantId;
        const branding = orgTenantId ? brandingByOrgId.get(orgTenantId) : undefined;
        return {
          ...item,
          ownerDisplayName: item.ownerDisplayName || branding?.displayName,
          ownerLogoUrl: item.ownerLogoUrl || branding?.logoUrl,
        };
      });

      const sorted = [...brandedMapped].sort((a, b) => {
        const aTime = Date.parse(a.createdAt || '') || 0;
        const bTime = Date.parse(b.createdAt || '') || 0;
        return bTime - aTime;
      }).map((item) => {
        const key = getInboxItemKey(item);
        return {
          ...item,
          isRead: Boolean(metaState.read[key]),
        };
      });

      const mergedWithCache = mergeWithInboxCache(sorted, metaState.deleted)
        .map((item) => {
          const key = getInboxItemKey(item);
          return {
            ...item,
            isRead: Boolean(metaState.read[key]),
          };
        });

      setItems(mergedWithCache);

      const completedMeta: InboxSyncMeta = {
        ...initialMeta,
        lastSyncAt: new Date().toISOString(),
        lastError: undefined,
      };
      writeInboxSyncMeta(completedMeta);
      setSyncMeta(completedMeta);

      if (holderOffersFailed && holderReceiptsFailed) {
        const warning = 'Unable to load pending offers and receipts. Pull to refresh or retry after reconnection.';
        setError(warning);
        notifications.show({
          title: 'Inbox Sync Warning',
          message: warning,
          color: 'yellow',
        });
      }
    } catch (err: any) {
      const failedMeta: InboxSyncMeta = {
        ...initialMeta,
        lastError: err?.response?.data?.message ?? err?.message ?? 'Sync failed',
      };
      writeInboxSyncMeta(failedMeta);
      setSyncMeta(failedMeta);

      const message = err.response?.data?.message ?? 'Failed to load inbox';
      setError(message);
      notifications.show({
        title: 'Inbox Load Failed',
        message,
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  }, [metaState.read]);

  useEffect(() => { syncAndFetch(); }, [syncAndFetch]);

  useEffect(() => {
    if (!getMobileOfflineFlags().offlineSyncEnabled) {
      return undefined;
    }

    const engine = getOfflineSyncEngine();
    const unsubscribe = engine.subscribe((state) => setSyncEngineState(state));

    engine.start({
      onSync: async () => {
        await flushOfflineQueueToServer();
        await syncAndFetch();
      },
      cooldownMs: 15000,
    });

    return () => {
      unsubscribe();
      engine.stop();
    };
  }, [syncAndFetch]);

  const dismissItem = useCallback((itemId: string) => {
    const item = items.find((i) => i.id === itemId);
    if (item) {
      const key = getInboxItemKey(item);
      setMetaState((prev) => ({
        ...prev,
        deleted: { ...prev.deleted, [key]: true },
      }));
      removeInboxItemFromCacheByKey(key);
    }
    setItems((prev) => prev.filter((i) => i.id !== itemId));
    // Best-effort server-side dismiss — non-blocking
    const walletToken = getWalletToken();
    api.delete(`/api/wallet/credentials/offers/${itemId}`, {
      headers: walletToken ? { Authorization: `Bearer ${walletToken}` } : undefined,
    }).catch(() => {/* non-fatal */ });
  }, [items]);

  const setReadState = useCallback((item: InboxItemData, isRead: boolean) => {
    const key = getInboxItemKey(item);
    setMetaState((prev) => ({
      ...prev,
      read: { ...prev.read, [key]: isRead },
    }));
    setItems((prev) => prev.map((entry) => (getInboxItemKey(entry) === key ? { ...entry, isRead } : entry)));
  }, []);

  const setArchivedState = useCallback((item: InboxItemData, archived: boolean) => {
    const key = getInboxItemKey(item);
    setMetaState((prev) => ({
      ...prev,
      archived: { ...prev.archived, [key]: archived },
    }));
    if (!archived) return;
    if (selectedItem && getInboxItemKey(selectedItem) === key) {
      setSelectedItem(null);
    }
  }, [selectedItem]);

  const isArchived = useCallback((item: InboxItemData) => {
    const key = getInboxItemKey(item);
    return Boolean(metaState.archived[key]);
  }, [metaState.archived]);

  const isDeleted = useCallback((item: InboxItemData) => {
    const key = getInboxItemKey(item);
    return Boolean(metaState.deleted[key]);
  }, [metaState.deleted]);

  const clearExpired = useCallback(() => {
    setItems((prev) => prev.filter((i) => !isExpiredItem(i)));
  }, []);

  const handleAction = async (action: 'approve' | 'reject' | 'dismiss') => {
    if (!selectedItem) return;
    if (action === 'dismiss') {
      dismissItem(selectedItem.id);
      setSelectedItem(null);
      return;
    }
    setActionLoading(true);
    try {
      if (selectedItem.itemType === 'credential_offer' || selectedItem.itemType === 'receipt_offer') {
        if (action === 'approve') {
          if (!selectedItem.offerUri) throw new Error('Missing offer URI');
          const token = selectedItem.authToken || getWalletToken();
          if (!token) throw new Error('Missing holder wallet token');
          await api.post('/api/wallet/credentials/accept-offer', { offerUri: selectedItem.offerUri }, {
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          });
          dismissItem(selectedItem.id);
          notifications.show({
            title: selectedItem.itemType === 'receipt_offer' ? 'Receipt Saved' : 'Credential Accepted',
            message: 'Item has been added to your wallet',
            color: 'green',
          });
        } else {
          // Reject — remove from local state without a server call
          dismissItem(selectedItem.id);
          setSelectedItem(null);
          setActionLoading(false);
          return;
        }
      } else if (selectedItem.itemType === 'invoice_offer') {
        if (!selectedItem.offerUri) throw new Error('Missing invoice offer URI');
        if (action === 'approve') {
          const token = selectedItem.authToken || getWalletToken();
          if (!token) throw new Error('Missing holder wallet token');
          await api.post('/api/wallet/credentials/accept-offer', { offerUri: selectedItem.offerUri }, {
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          });

          dismissItem(selectedItem.id);

          notifications.show({
            title: 'Invoice Accepted',
            message: 'Invoice VC saved. Redirecting to checkout...',
            color: 'green',
          });

          setSelectedItem(null);
          const { paymentCode, paymentUrl } = resolvePaymentNavigationTarget({
            paymentCode: selectedItem.paymentCode,
            paymentUrl: selectedItem.paymentUrl,
            offerUri: selectedItem.offerUri,
          });
          const paymentToken = firstNonEmptyString(paymentCode, selectedItem.paymentLinkId);
          if (paymentToken) {
            router.push(buildPayRoute({
              paymentCode: paymentToken,
              invoiceRef: selectedItem.invoiceRef,
              orgTenantId: selectedItem.ownerOrgTenantId,
            }));
            return;
          }

          notifications.show({
            title: 'Payment Link Unavailable',
            message: paymentUrl
              ? 'Invoice saved, but checkout token could not be parsed. Refresh inbox to re-sync this payment card.'
              : 'Invoice saved, but no payment link was attached. Refresh inbox to fetch the payment card.',
            color: 'yellow',
          });
          await syncAndFetch();
          return;
        }

        dismissItem(selectedItem.id);
        setSelectedItem(null);
        return;
      } else if (selectedItem.itemType === 'payment_link') {
        const { paymentCode, paymentUrl } = resolvePaymentNavigationTarget({
          paymentCode: selectedItem.paymentCode,
          paymentUrl: selectedItem.paymentUrl,
          offerUri: selectedItem.offerUri,
        });
        const paymentToken = firstNonEmptyString(paymentCode, selectedItem.paymentLinkId);
        if (!paymentCode && !paymentUrl) throw new Error('Missing payment link URL');

        const running = toRunningActionFromItem(selectedItem);
        if (running) upsertRunningAction(running);

        notifications.show({
          title: 'Opening checkout',
          message: 'Opening in-app checkout with payment options.',
          color: 'blue',
        });

        setSelectedItem(null);
        if (paymentToken) {
          router.push(buildPayRoute({
            paymentCode: paymentToken,
            invoiceRef: selectedItem.invoiceRef,
            orgTenantId: selectedItem.ownerOrgTenantId,
          }));
        } else {
          notifications.show({
            title: 'Payment Link Unavailable',
            message: paymentUrl
              ? 'Checkout token could not be parsed from this link. Refresh inbox and try again.'
              : 'Missing payment link URL.',
            color: 'red',
          });
        }
        return;
      } else if (selectedItem.itemType === 'ar_collection') {
        const running = toRunningActionFromItem(selectedItem);
        if (running) upsertRunningAction(running);

        if (selectedItem.requiredAction === 'present_payment_proof' || selectedItem.proofRequestId) {
          await handleOpenArCollectionProof(selectedItem);
          return;
        }

        if (selectedItem.actingOrgTenantId) {
          const switched = await ensureOrgContextForApproval(
            selectedItem.actingOrgTenantId,
            selectedItem.ownerDisplayName || selectedItem.actingOrgTenantId,
            'collection',
          );
          if (!switched) {
            setActionLoading(false);
            return;
          }
        }

        const { paymentCode, paymentUrl } = resolvePaymentNavigationTarget({
          paymentCode: selectedItem.paymentCode,
          paymentUrl: selectedItem.paymentUrl,
          offerUri: selectedItem.offerUri,
        });
        const paymentToken = firstNonEmptyString(paymentCode, selectedItem.paymentLinkId);
        setSelectedItem(null);

        if (paymentToken) {
          await router.push(buildPayRoute({
            paymentCode: paymentToken,
            invoiceRef: selectedItem.invoiceRef,
            orgTenantId: selectedItem.actingOrgTenantId || selectedItem.ownerOrgTenantId,
          }));
          return;
        }

        if (paymentUrl) {
          notifications.show({
            title: 'Checkout Link Parse Failed',
            message: 'Could not derive in-app checkout token. Refresh inbox and retry.',
            color: 'red',
          });
        }

        await router.push(buildArCollectionSettlementRoute(selectedItem));
        return;
      } else {
        if (selectedItem.module === 'approvals' && selectedItem.platformRequestId) {
          // Organization request (for example "Buy materials" raised from a job). Decide as the org.
          if (action === 'reject' && !decisionReason.trim()) {
            throw new Error('Please say why you are declining.');
          }
          if (selectedItem.actingOrgTenantId) {
            const switched = await ensureOrgContextForApproval(selectedItem.actingOrgTenantId, selectedItem.ownerDisplayName, 'request');
            if (!switched) {
              setActionLoading(false);
              return;
            }
          }
          const orgToken = getOrgToken();
          if (!orgToken) throw new Error('Open the organization first, then try again.');
          const headers = { Authorization: `Bearer ${orgToken}` };
          const transition = (toStatus: string, payload?: Record<string, unknown>) =>
            api.post('/api/platform/requests/transition', { requestId: selectedItem.platformRequestId, toStatus, payload }, { headers });
          if (action === 'approve') {
            try {
              await transition('in_review');
            } catch (err: any) {
              // Already under review — carry on to approve.
              const msg = String(err?.response?.data?.message || err?.message || '');
              if (!/Invalid request transition/i.test(msg)) throw err;
            }
            await transition('approved');
            notifications.show({ title: 'Approved', message: 'The request is approved. Anything waiting on it continues now.', color: 'green' });
          } else {
            await transition('rejected', { reason: decisionReason.trim() });
            notifications.show({ title: 'Declined', message: 'The request was declined.', color: 'orange' });
          }
          setSelectedItem(null);
          setDecisionReason('');
          await syncAndFetch();
          return;
        }

        if (selectedItem.module === 'approvals' && selectedItem.workflowRequestId) {
          if (isRequisitionApproval(selectedItem) && action === 'approve') {
            const running = toRunningActionFromItem(selectedItem);
            if (running) upsertRunningAction(running);
            await handleOpenRequisitionApproval(selectedItem);
            return;
          }

          const token = selectedItem.authToken || getWalletToken();
          if (!token) throw new Error('Missing holder wallet token');

          if (action === 'reject' && !decisionReason.trim()) {
            throw new Error('Please provide a reason before rejecting this request');
          }

          if (action === 'approve') {
            await api.put(`/workflow-requests/${selectedItem.workflowRequestId}/approve-from-inbox`, {
              executeWorkflow: true,
            }, {
              headers: { Authorization: `Bearer ${token}` },
            });

            notifications.show({
              title: 'Approved on behalf of org',
              message: 'Request approved using your assigned org authority.',
              color: 'green',
            });
          } else if (action === 'reject') {
            await api.put(`/workflow-requests/${selectedItem.workflowRequestId}/reject-from-inbox`, {
              reason: decisionReason.trim(),
            }, {
              headers: { Authorization: `Bearer ${token}` },
            });

            notifications.show({
              title: 'Rejected on behalf of org',
              message: 'Request rejected using your assigned org authority.',
              color: 'orange',
            });
          }

          setSelectedItem(null);
          setDecisionReason('');
          await syncAndFetch();
          return;
        }

        setSelectedItem(null);
        if (selectedItem.module === 'present' && selectedItem.offerUri) {
          const url = selectedItem.offerUri;
          const isVp = url.includes('request_uri=') || url.startsWith('openid-vc:') || url.startsWith('openid4vp:');
          const running = toRunningActionFromItem(selectedItem);
          if (running) upsertRunningAction(running);
          if (isVp) {
            router.push(`/present?request_uri=${encodeURIComponent(url)}`);
          } else {
            window.location.assign(url);
          }
          return;
        }
        const isRequisitionWorkflow =
          selectedItem.module === 'requisitions'
          || isRequisitionApproval(selectedItem)
          || String(selectedItem.workflowRequestType || '').toLowerCase() === 'requisition';
        const isApWorkflow = isApWorkflowApproval(selectedItem);
        if (selectedItem.module === 'field' || selectedItem.workflowStage) {
          if (isEmployeeOrgRole()) {
            const runId = normalizeRunId(selectedItem.workflowRunId);
            const running = toRunningActionFromItem(selectedItem);
            if (running) upsertRunningAction(running);
            router.push(runId
              ? `/finance?tab=field&runId=${encodeURIComponent(runId)}`
              : '/finance?tab=field');
          } else {
            router.push('/activity');
          }
          return;
        }
        if (isRequisitionWorkflow) {
          if (selectedItem.actingOrgTenantId) {
            const switched = await ensureOrgContextForApproval(selectedItem.actingOrgTenantId, activeOrgLabel || undefined, 'requisition');
            if (!switched) {
              setActionLoading(false);
              return;
            }
          }
          const running = toRunningActionFromItem(selectedItem);
          if (running) upsertRunningAction(running);
          router.push(`/finance?tab=requisitions${selectedItem.workflowRequestId ? `&requestId=${encodeURIComponent(selectedItem.workflowRequestId)}` : ''}${selectedItem.requisitionId ? `&requisitionId=${encodeURIComponent(selectedItem.requisitionId)}` : ''}${selectedItem.actingOrgTenantId ? `&orgTenantId=${encodeURIComponent(selectedItem.actingOrgTenantId)}` : ''}`);
          return;
        }

        if (isApWorkflow) {
          if (selectedItem.actingOrgTenantId) {
            const switched = await ensureOrgContextForApproval(selectedItem.actingOrgTenantId, activeOrgLabel || undefined, 'payable');
            if (!switched) {
              setActionLoading(false);
              return;
            }
          }
          const transactionId = selectedItem.transactionId || selectedItem.workflowRequestId || selectedItem.id;
          const running = toRunningActionFromItem(selectedItem);
          if (running) upsertRunningAction(running);
          router.push(`/finance?tab=ap&transactionId=${encodeURIComponent(transactionId)}${selectedItem.actingOrgTenantId ? `&orgTenantId=${encodeURIComponent(selectedItem.actingOrgTenantId)}` : ''}`);
          return;
        } else {
          if (isArCollectionAssignment(selectedItem)) {
            const running = toRunningActionFromItem(selectedItem);
            if (running) upsertRunningAction(running);
            const txId = selectedItem.transactionId || selectedItem.workflowRequestId || selectedItem.id;
            router.push(`/finance?tab=ar&transactionId=${encodeURIComponent(txId)}${selectedItem.actingOrgTenantId ? `&orgTenantId=${encodeURIComponent(selectedItem.actingOrgTenantId)}` : ''}`);
            return;
          }
          router.push('/activity');
        }
        return;
      }
      setSelectedItem(null);
      setDecisionReason('');
      syncAndFetch();
    } catch (err: any) {
      notifications.show({ title: 'Action failed', message: err.response?.data?.message ?? err.message, color: 'red' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenRequisitionDetails = async (item: InboxItemData) => {
    if (!item.workflowRequestId) return;

    const running = toRunningActionFromItem(item);
    if (running) upsertRunningAction(running);

    if (item.actingOrgTenantId) {
      const switched = await ensureOrgContextForApproval(item.actingOrgTenantId, activeOrgLabel || undefined, 'requisition');
      if (!switched) return;
    }

    setSelectedItem(null);
    setDecisionReason('');
    await router.push(`/finance?tab=requisitions&requestId=${encodeURIComponent(item.workflowRequestId)}${item.requisitionId ? `&requisitionId=${encodeURIComponent(item.requisitionId)}` : ''}${item.actingOrgTenantId ? `&orgTenantId=${encodeURIComponent(item.actingOrgTenantId)}` : ''}`);
  };

  const handleOpenArCollectionProof = async (item: InboxItemData) => {
    const transactionId = item.transactionId || item.workflowRequestId || item.id;
    if (!transactionId) return;

    setActionLoading(true);
    try {
      let resolvedOrgTenantId = item.actingOrgTenantId || undefined;
      if (item.actingOrgTenantId) {
        try {
          const switched = await ensureOrgContextForApproval(item.actingOrgTenantId, item.ownerDisplayName || activeOrgLabel || undefined, 'collection');
          if (!switched) return;
        } catch (switchErr: any) {
          const switchStatus = Number(switchErr?.response?.status || 0);
          if (switchStatus === 403) {
            console.warn('[inbox][ar-collection] org switch rejected, continuing with active org context', {
              requestedOrgTenantId: item.actingOrgTenantId,
              activeOrgTenantId: getActiveOrgId(),
            });
            resolvedOrgTenantId = getActiveOrgId() || undefined;
          } else {
            throw switchErr;
          }
        }
      }

      const personalToken = getPersonalWalletToken() || getWalletToken();
      if (!personalToken) {
        throw new Error('Personal wallet session is required to generate AR proof request');
      }

      let orgTokenForProof = getOrgToken() || undefined;
      if (resolvedOrgTenantId) {
        try {
          const switchRes = await api.post(
            `/api/organizations/${encodeURIComponent(resolvedOrgTenantId)}/switch`,
            {},
            {
              headers: { Authorization: `Bearer ${personalToken}` },
              skipAuthRedirect: true as any,
            } as any,
          );

          const refreshedOrgToken = String(switchRes.data?.token || '').trim();
          if (refreshedOrgToken) {
            applyOrgContext({
              orgId: resolvedOrgTenantId,
              orgName: switchRes.data?.name || switchRes.data?.label || switchRes.data?.orgName || item.ownerDisplayName || resolvedOrgTenantId,
              orgToken: refreshedOrgToken,
              orgRole: switchRes.data?.orgRole,
              sector: switchRes.data?.sector,
              workflowTypes: switchRes.data?.workflowTypes,
            });
            orgTokenForProof = refreshedOrgToken;
          }
        } catch {
          // Best-effort refresh only; continue with existing context token(s).
        }
      }

      let resolvedTransactionId = String(transactionId);
      const lookupToken = orgTokenForProof || getOrgToken() || personalToken;
      if (/^ARAPTX-/i.test(resolvedTransactionId) || /^running-/i.test(resolvedTransactionId) || resolvedTransactionId.length < 24) {
        try {
          const lookupRes = await api.get('/api/finance/ap/workflow-actions', {
            params: { onlyPending: true },
            headers: { Authorization: `Bearer ${lookupToken}` },
          });
          const actions = safeArray<any>(lookupRes.data);
          const proofActions = actions.filter((row) => {
            const requiredAction = String(row?.required_action || row?.requiredAction || '').toLowerCase();
            const workflowType = String(row?.workflow_type || row?.workflowType || '').toLowerCase();
            return requiredAction === 'present_payment_proof' || workflowType.includes('trust');
          });
          const byExactRef = actions.find((row) => {
            const rowId = String(row?.id || '').trim();
            const txRef = String(row?.transaction_id || row?.transactionId || row?.source_reference || '').trim();
            return rowId === resolvedTransactionId || txRef === resolvedTransactionId;
          });

          const byInvoiceRef = !byExactRef && item.invoiceRef
            ? actions.find((row) => String(row?.invoice_ref || row?.invoiceRef || '').trim() === String(item.invoiceRef).trim())
            : null;

          const byAnyProofAction = !byExactRef && !byInvoiceRef ? proofActions[0] : null;
          const candidate = byExactRef || byInvoiceRef || byAnyProofAction;
          const candidateId = String(candidate?.id || '').trim();
          if (candidateId) {
            resolvedTransactionId = candidateId;
          }
        } catch {
          // Keep original transaction reference when lookup is unavailable.
        }
      }

      let requestRes: any = null;
      let lastRequestError: any = null;
      const requestTokens = [orgTokenForProof, getOrgToken(), personalToken]
        .filter((token): token is string => typeof token === 'string' && token.length > 0)
        .filter((token, index, arr) => arr.indexOf(token) === index);
      for (let attempt = 0; attempt < 3; attempt++) {
        for (const requestToken of requestTokens) {
          try {
            requestRes = await api.post(
              `/api/finance/ap/workflow-actions/${encodeURIComponent(resolvedTransactionId)}/proof-request`,
              {},
              { headers: { Authorization: `Bearer ${requestToken}` } },
            );
            lastRequestError = null;
            break;
          } catch (err: any) {
            lastRequestError = err;
          }
        }
        if (requestRes) {
          break;
        }
        const status = Number(lastRequestError?.response?.status || 0) || 0;
        const isRetryable = status === 404 || status >= 500;
        if (!isRetryable || attempt === 2) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
      }

      if (!requestRes) {
        throw lastRequestError || new Error('Failed to create AR proof request');
      }

      const requestUrl = requestRes.data?.presentationRequestUrl as string | undefined;
      const requestId = requestRes.data?.requestId as string | undefined;
      if (!requestUrl) {
        throw new Error('AR proof request URL was not returned by server');
      }

      const params = new URLSearchParams({
        request_uri: requestUrl,
        mode: 'ar-collection-consent',
        transactionId: resolvedTransactionId,
        transition: String(item.requiredAction || 'present_payment_proof'),
      });

      if (resolvedOrgTenantId) {
        params.set('orgTenantId', resolvedOrgTenantId);
      }
      if (requestId) {
        params.set('requestId', requestId);
      }

      const running = toRunningActionFromItem(item);
      if (running) upsertRunningAction(running);

      setSelectedItem(null);
      await router.push(`/present?${params.toString()}`);
    } catch (err: any) {
      const status = Number(err?.response?.status || 0) || undefined;
      console.warn('[inbox][ar-collection] open proof failed', {
        transactionId,
        actingOrgTenantId: item.actingOrgTenantId,
        stage: deriveArCollectionFlowStage(item),
        status,
        hasProofRequestId: Boolean(item.proofRequestId),
        hasProofResponseId: Boolean(item.proofResponseId),
      });

      // If a proof request already exists on the item, navigate directly to the present page
      // instead of staying on inbox.
      if (item.proofRequestId) {
        const fallbackParams = new URLSearchParams({
          request_uri: String(item.proofRequestId),
          mode: 'ar-collection-consent',
          transactionId: String(transactionId),
        });
        if (item.actingOrgTenantId) fallbackParams.set('orgTenantId', item.actingOrgTenantId);
        setSelectedItem(null);
        void router.push(`/present?${fallbackParams.toString()}`);
        return;
      }

      // Fall back to the obligations view so the user can resume from there.
      notifications.show({ title: 'AR Proof', message: (err.response?.data?.message ?? err.message) + ' — redirecting to settlement workflow.', color: 'yellow' });
      setSelectedItem(null);
      void router.push(buildArCollectionSettlementRoute(item));
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenRequisitionApproval = async (item: InboxItemData) => {
    if (!item.workflowRequestId) return;
    if (!item.requisitionId) {
      await handleOpenRequisitionDetails(item);
      return;
    }

    setActionLoading(true);
    try {
      if (item.actingOrgTenantId) {
        const switched = await ensureOrgContextForApproval(item.actingOrgTenantId, activeOrgLabel || undefined, 'requisition');
        if (!switched) {
          return;
        }
      }

      const orgToken = getOrgToken();
      if (!orgToken) {
        throw new Error('Organization session is required to generate requisition approval request');
      }

      const requestRes = await api.post(
        `/api/finance/requisitions/${encodeURIComponent(item.requisitionId)}/approval/request`,
        {},
        { headers: { Authorization: `Bearer ${orgToken}` } },
      );

      const requestUrl = requestRes.data?.presentationRequestUrl as string | undefined;
      const requestId = requestRes.data?.requestId as string | undefined;
      if (!requestUrl) {
        throw new Error('Approval request URL was not returned by server');
      }

      const params = new URLSearchParams({
        request_uri: requestUrl,
        mode: 'requisition-approve',
        requisitionId: item.requisitionId,
      });
      if (item.actingOrgTenantId) {
        params.set('orgTenantId', item.actingOrgTenantId);
      }
      if (requestId) {
        params.set('requestId', requestId);
      }

      upsertRunningAction({
        id: `requisition:${item.workflowRequestId}`,
        type: 'requisition',
        title: item.title || 'Requisition approval',
        description: item.description,
        route: `/present?${params.toString()}`,
        refId: item.workflowRequestId,
        orgTenantId: item.actingOrgTenantId,
        status: 'active',
      });

      setSelectedItem(null);
      setDecisionReason('');
      await router.push(`/present?${params.toString()}`);
    } catch (err: any) {
      // Keep finance requisition view available as fallback when OID4VP request setup fails.
      await handleOpenRequisitionDetails(item);
      notifications.show({ title: 'Open Requisition Approval', message: err.response?.data?.message ?? err.message, color: 'yellow' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenFieldRun = async (item: InboxItemData) => {
    const runId = normalizeRunId(item.workflowRunId);
    if (!runId) {
      notifications.show({
        title: 'Run ID Missing',
        message: 'This job is not ready yet. Refresh and try again.',
        color: 'yellow',
      });
      return;
    }

    setActionLoading(true);
    try {
      if (item.ownerOrgTenantId) {
        const switched = await ensureOrgContextForApproval(item.ownerOrgTenantId, item.ownerDisplayName || activeOrgLabel || undefined, 'job');
        if (!switched) return;
      }

      const running = toRunningActionFromItem(item);
      if (running) upsertRunningAction(running);

      setSelectedItem(null);
      setDecisionReason('');
      await router.push(`/finance?tab=field&runId=${encodeURIComponent(runId)}${item.ownerOrgTenantId ? `&orgTenantId=${encodeURIComponent(item.ownerOrgTenantId)}` : ''}`);
    } catch (err: any) {
      notifications.show({ title: 'Could not open the job', message: err.response?.data?.message ?? err.message, color: 'red' });
    } finally {
      setActionLoading(false);
    }
  };

  const activeItems = items.filter((item) => !isDeleted(item));
  const pendingCount = activeItems.filter((i) => i.status === 'pending' && !isArchived(i)).length;
  const expiredCount = items.filter(isExpiredItem).length;
  const isFinanceFlowItem = (item: InboxItemData) =>
    item.itemType === 'ar_collection'
    || String(item.workflowRequestType || '').toLowerCase() === 'ar_collection'
    ||
    item.itemType === 'payment_link'
    || item.itemType === 'invoice_offer'
    || (item.module === 'finance' && item.itemType !== 'receipt_offer');

  const isOpsFlowItem = (item: InboxItemData) =>
    String(item.id || '').startsWith('running-')
    || item.itemType === 'workflow'
    || item.module === 'approvals'
    || item.module === 'field'
    || item.module === 'present';

  const financeCount = activeItems.filter((item) => !isArchived(item) && isFinanceFlowItem(item)).length;
  const opsCount = activeItems.filter((item) => !isArchived(item) && isOpsFlowItem(item)).length;
  const isCommerceTrailItem = (item: InboxItemData) => item.itemType === 'receipt_offer' || item.itemType === 'invoice_offer' || item.itemType === 'credential_offer' || item.itemType === 'payment_link';
  const receiptsCount = activeItems.filter((item) => !isArchived(item) && isCommerceTrailItem(item)).length;
  const archivedCount = activeItems.filter((item) => isArchived(item)).length;
  const showFinanceTab = workflowSections.finance;
  const showOpsTab = workflowSections.ops;

  const hiddenActiveFilter = (filter === 'finance' && !showFinanceTab) || (filter === 'ops' && !showOpsTab);

  useEffect(() => {
    if (hiddenActiveFilter) {
      setFilter('all');
    }
  }, [hiddenActiveFilter]);

  const priorityRank: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const filteredItems = activeItems.filter((item) => {
    if (filter === 'archived') return isArchived(item);
    if (isArchived(item)) return false;
    if (filter === 'all') return true;
    if (filter === 'finance') return isFinanceFlowItem(item);
    if (filter === 'ops') return isOpsFlowItem(item);
    if (filter === 'receipts') return isCommerceTrailItem(item);
    return true;
  }).sort((a, b) => {
    if (filter === 'finance') {
      const financeRank = (item: InboxItemData) => {
        if (item.itemType === 'invoice_offer') return 0;
        if (item.itemType === 'payment_link') return 1;
        return 2;
      };
      const rankDiff = financeRank(a) - financeRank(b);
      if (rankDiff !== 0) return rankDiff;
    }

    if (filter === 'ops') {
      const opsRank = (item: InboxItemData) => {
        if (item.module === 'field' || item.workflowRunId) return 0;
        if (item.module === 'approvals' || item.workflowRequestId) return 1;
        return 2;
      };
      const rankDiff = opsRank(a) - opsRank(b);
      if (rankDiff !== 0) return rankDiff;
    }

    const unreadWeightA = a.isRead === false ? 0 : 1;
    const unreadWeightB = b.isRead === false ? 0 : 1;
    if (unreadWeightA !== unreadWeightB) return unreadWeightA - unreadWeightB;

    const priorityDiff = (priorityRank[a.priority] ?? 99) - (priorityRank[b.priority] ?? 99);
    if (priorityDiff !== 0) return priorityDiff;

    const createdDiff = dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf();
    if (createdDiff !== 0) return createdDiff;

    return String(a.title).localeCompare(String(b.title));
  });

  const visibleItems = filteredItems.slice(0, 20);

  return (
    <AppShellMobile inboxCount={pendingCount}>
      <Stack gap="md" px="md" pt="md">
        <Group justify="space-between" align="center">
          <Box>
            <Title order={3}>Today’s priorities</Title>
            {pendingCount > 0 && <Text size="sm" c="dimmed">{pendingCount} item{pendingCount !== 1 ? 's' : ''} need your attention</Text>}
            <Group gap="xs" mt={6}>
              <Badge size="sm" color={onlineReady ? (online ? 'green' : 'gray') : 'blue'} variant="light">
                {onlineReady ? (online ? 'Online' : 'Offline') : 'Status'}
              </Badge>
              <Badge size="sm" color={syncMetaReady ? getFreshnessColor(syncMeta.lastSyncAt) : 'gray'} variant="light">
                {syncMetaReady ? formatFreshnessLabel(syncMeta.lastSyncAt) : 'Sync status'}
              </Badge>
              {syncEngineState.isSyncing && (
                <Badge size="sm" color="blue" variant="light">Syncing...</Badge>
              )}
              {!!syncMeta.lastError && (
                <Badge size="sm" color="red" variant="light">Sync pending retry</Badge>
              )}
            </Group>
          </Box>
          <Group gap="xs">
            {expiredCount > 0 && (
              <ActionIcon variant="light" color="red" size="lg" title={`Clear ${expiredCount} expired`} onClick={clearExpired}>
                <IconTrash size={16} />
              </ActionIcon>
            )}
            <ActionIcon variant="subtle" color="gray" size="lg" onClick={syncAndFetch} loading={loading}>
              <IconRefresh size={18} />
            </ActionIcon>
          </Group>
        </Group>

        <Tabs value={filter} onChange={(v) => setFilter(v ?? 'all')}>
          <Tabs.List grow>
            <Tabs.Tab value="all">All</Tabs.Tab>
            {showFinanceTab && (
              <Tabs.Tab value="finance">Finance {financeCount > 0 ? `(${financeCount})` : ''}</Tabs.Tab>
            )}
            {showOpsTab && (
              <Tabs.Tab value="ops">Ops {opsCount > 0 ? `(${opsCount})` : ''}</Tabs.Tab>
            )}
            <Tabs.Tab value="receipts">Receipts {receiptsCount > 0 ? `(${receiptsCount})` : ''}</Tabs.Tab>
            <Tabs.Tab value="archived">Archived {archivedCount > 0 ? `(${archivedCount})` : ''}</Tabs.Tab>
          </Tabs.List>
        </Tabs>
        <Divider />

        {error && <ErrorAlert message={error} />}

        {loading ? (
          <Center py="xl"><Loader color="credentis" /></Center>
        ) : filteredItems.length === 0 ? (
          <EmptyState
            icon={<IconInbox size={28} />}
            title="All caught up"
            description="No items in your inbox right now."
          />
        ) : (
          <Box
            style={{
              maxHeight: '72svh',
              overflowY: 'auto',
              paddingRight: 4,
              WebkitOverflowScrolling: 'touch',
            }}
          >
            <Stack gap="xs">
              {groupInboxItems(visibleItems).map((entry) => {
                if (entry.type === 'standalone') {
                  return (
                    <InboxItem
                      key={entry.data.id}
                      item={entry.data}
                      onClick={setSelectedItem}
                    />
                  )
                }
                return (
                  <WorkflowGroupRow
                    key={entry.data.key}
                    group={entry.data}
                    isExpanded={expandedGroupKey === entry.data.key}
                    onToggleExpand={() =>
                      setExpandedGroupKey((prev) => (prev === entry.data.key ? null : entry.data.key))
                    }
                    onItemClick={setSelectedItem}
                  />
                )
              })}
            </Stack>
          </Box>
        )}

        {filteredItems.length > visibleItems.length && (
          <Paper p="sm" radius="md" withBorder>
            <Group justify="space-between" align="center">
              <Text size="sm" fw={600}>Showing top {visibleItems.length} items</Text>
              <Button size="xs" variant="subtle" color="credentis" onClick={() => setFilter('all')}>
                View all {filteredItems.length}
              </Button>
            </Group>
          </Paper>
        )}
      </Stack>

      <BottomSheet
        opened={!!selectedItem} onClose={() => { setSelectedItem(null); setDecisionReason(''); }}
        title={selectedItem?.title ?? ''}
      >
        {selectedItem && (
          <Stack gap="md" pb="lg">
            <Text size="sm" c="dimmed">{selectedItem.description}</Text>
            <Group gap="xs">
              <Badge color={selectedItem.itemType === 'receipt_offer' ? 'green' : (selectedItem.itemType === 'payment_link' || selectedItem.itemType === 'invoice_offer') ? 'teal' : 'blue'} variant="light" leftSection={selectedItem.itemType === 'receipt_offer' ? <IconReceipt size={12} /> : undefined}>
                {selectedItem.module}
              </Badge>
              <Badge color={selectedItem.isRead ? 'gray' : 'blue'} variant={selectedItem.isRead ? 'light' : 'filled'}>
                {selectedItem.isRead ? 'Read' : 'Unread'}
              </Badge>
              <StatusBadge status={selectedItem.status === 'pending' ? 'pending' : 'done'} />
            </Group>

            {selectedItem.itemType === 'ar_collection' && (
              <Paper withBorder radius="md" p="sm">
                <Stack gap={6}>
                  {(() => {
                    const stage = deriveArCollectionFlowStage(selectedItem);
                    const stageColor = stage === 'settled' ? 'teal' : stage === 'proof_presented' ? 'indigo' : stage === 'proof_requested' ? 'orange' : 'blue';
                    return (
                      <Group justify="space-between" align="center" wrap="nowrap">
                        <Group gap={6}>
                          <IconShieldCheck size={14} />
                          <Text size="sm" fw={700}>SSI Trust Panel</Text>
                        </Group>
                        <Badge size="xs" color={stageColor} variant="light">Flow: {stage}</Badge>
                      </Group>
                    );
                  })()}
                  <Text size="xs" c="dimmed">
                    Counterparty: {selectedItem.counterpartyOrgName || selectedItem.ownerDisplayName || selectedItem.ownerOrgTenantId || 'Unknown org'}
                  </Text>
                  <Text size="xs" c="dimmed">
                    Trust State: {String(selectedItem.trustStatus || 'pending').replace(/_/g, ' ')}
                  </Text>
                  {selectedItem.invoiceRef && <Text size="xs" c="dimmed">Invoice Ref: {selectedItem.invoiceRef}</Text>}
                  {selectedItem.proofRequestId && <Text size="xs" c="dimmed">Proof Request: {selectedItem.proofRequestId}</Text>}
                  {selectedItem.proofResponseId && <Text size="xs" c="dimmed">Proof Response: {selectedItem.proofResponseId}</Text>}
                </Stack>
              </Paper>
            )}

            <Group grow>
              <Button
                size="sm"
                variant="light"
                color={selectedItem.isRead ? 'blue' : 'gray'}
                onClick={() => {
                  setReadState(selectedItem, !selectedItem.isRead);
                  setSelectedItem((prev) => (prev ? { ...prev, isRead: !prev.isRead } : prev));
                }}
              >
                {selectedItem.isRead ? 'Mark Unread' : 'Mark Read'}
              </Button>
              <Button
                size="sm"
                variant="light"
                color={isArchived(selectedItem) ? 'teal' : 'gray'}
                onClick={() => {
                  const nextArchived = !isArchived(selectedItem);
                  setArchivedState(selectedItem, nextArchived);
                }}
              >
                {isArchived(selectedItem) ? 'Unarchive' : 'Archive'}
              </Button>
              <Button
                size="sm"
                variant="light"
                color="red"
                leftSection={<IconTrash size={14} />}
                onClick={() => {
                  dismissItem(selectedItem.id);
                  setSelectedItem(null);
                }}
              >
                Delete
              </Button>
            </Group>

            {isExpiredItem(selectedItem) ? (
              <Stack gap="xs" mt="sm">
                <Text size="sm" c="red.7" fw={500}>This offer has expired and can no longer be accepted.</Text>
                <Button fullWidth size="lg" color="red" variant="light" leftSection={<IconTrash size={18} />} onClick={() => handleAction('dismiss')}>
                  Remove
                </Button>
              </Stack>
            ) : selectedItem.status === 'pending' && (
              <Stack gap="xs" mt="sm">
                {/* Signing context banner for org workflow actions (matrix §20.5) */}
                {selectedItem.itemType === 'workflow' && canOrgAction && activeOrgLabel && orgRoleClaim && (
                  <Alert
                    icon={<IconShieldCheck size={16} />}
                    color="blue"
                    variant="light"
                    radius="md"
                    title={`Signing as ${activeOrgLabel} — ${orgRoleClaim}`}
                  >
                    This approval will be recorded against your org role. Ensure you have authority to act.
                  </Alert>
                )}

                {/* Holder actions: accept offers / save receipts — always visible */}
                {(selectedItem.itemType === 'credential_offer' || selectedItem.itemType === 'receipt_offer' || selectedItem.itemType === 'invoice_offer') && (
                  <>
                    <Button fullWidth size="lg" color="green" leftSection={<IconCheck size={18} />} loading={actionLoading} onClick={() => handleAction('approve')}>
                      {selectedItem.itemType === 'receipt_offer' ? 'Save Receipt' : selectedItem.itemType === 'invoice_offer' ? 'Accept & Pay' : 'Accept'}
                    </Button>
                    {selectedItem.itemType === 'credential_offer' && (
                      <Button fullWidth size="lg" color="red" variant="light" leftSection={<IconX size={18} />} loading={actionLoading} onClick={() => handleAction('reject')}>
                        Reject
                      </Button>
                    )}
                    {selectedItem.itemType === 'invoice_offer' && (
                      <Button fullWidth size="lg" color="red" variant="light" leftSection={<IconX size={18} />} loading={actionLoading} onClick={() => handleAction('reject')}>
                        Dismiss
                      </Button>
                    )}
                  </>
                )}

                {selectedItem.itemType === 'payment_link' && (
                  <Button
                    fullWidth
                    size="lg"
                    color="teal"
                    leftSection={<IconCheck size={18} />}
                    loading={actionLoading}
                    onClick={() => handleAction('approve')}
                  >
                    Pay now
                  </Button>
                )}

                {selectedItem.itemType === 'ar_collection' && (
                  <>
                    {/* Counterparty identity header — replaces raw IDs with friendly org name */}
                    {(selectedItem.counterpartyOrgName || selectedItem.ownerDisplayName) && (
                      <Paper p="sm" radius="md" withBorder>
                        <Group gap="sm" wrap="nowrap">
                          <Box
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: 10,
                              display: 'grid',
                              placeItems: 'center',
                              background: '#e0f2fe',
                              fontWeight: 700,
                              fontSize: 15,
                              color: '#0284c7',
                              flexShrink: 0,
                            }}
                          >
                            {String(selectedItem.counterpartyOrgName || selectedItem.ownerDisplayName || '').charAt(0).toUpperCase()}
                          </Box>
                          <Box>
                            <Text fw={700} size="sm">
                              {selectedItem.counterpartyOrgName || selectedItem.ownerDisplayName}
                            </Text>
                            <Text size="xs" c="dimmed">
                              {selectedItem.amount != null
                                ? `Requesting ${selectedItem.currency || 'USD'} ${selectedItem.amount}`
                                : 'Collection request'}
                            </Text>
                          </Box>
                        </Group>
                      </Paper>
                    )}
                    {selectedItem.proofRequestId ? (
                      <Button
                        fullWidth
                        size="lg"
                        color="indigo"
                        leftSection={<IconShieldCheck size={18} />}
                        loading={actionLoading}
                        onClick={() => handleAction('approve')}
                      >
                        Resume AR Consent Proof
                      </Button>
                    ) : null}
                    <Button
                      fullWidth
                      size="lg"
                      color="teal"
                      leftSection={<IconCheck size={18} />}
                      loading={actionLoading}
                      onClick={() => handleAction('approve')}
                    >
                      {selectedItem.requiredAction === 'present_payment_proof' ? 'Start AR Consent Proof' : 'Continue AR Settlement'}
                    </Button>
                    <Button
                      fullWidth
                      size="lg"
                      color="gray"
                      variant="light"
                      loading={actionLoading}
                      onClick={() => {
                        if (selectedItem.requiredAction === 'present_payment_proof') {
                          const orgQ = selectedItem.actingOrgTenantId
                            ? `?orgTenantId=${encodeURIComponent(selectedItem.actingOrgTenantId)}`
                            : '';
                          router.push(`/finance/my-ar-obligations${orgQ}`);
                          return;
                        }
                        router.push(buildArCollectionSettlementRoute(selectedItem));
                      }}
                    >
                      View What I Owe
                    </Button>
                  </>
                )}

                {/* Workflow actions: field task execution must be available to assignees,
                    while org-role gating still applies to org approval actions. */}
                {selectedItem.itemType === 'workflow' && (
                  <>
                    {selectedItem.module === 'approvals' && !isRequisitionApproval(selectedItem) && (
                      <Textarea
                        label="Decision Reason"
                        placeholder="Explain why you are approving or rejecting this request"
                        minRows={2}
                        autosize
                        value={decisionReason}
                        onChange={(e) => setDecisionReason(e.currentTarget.value)}
                      />
                    )}
                    {selectedItem.module === 'approvals' && isRequisitionApproval(selectedItem) && selectedItem.workflowRequestId && (() => {
                      const runningId = `requisition:${selectedItem.workflowRequestId}`;
                      const alreadyRunning = getRunningActions().some((a: any) => a.id === runningId);
                      return (
                        <>
                          {alreadyRunning && (
                            <Alert color="yellow" variant="light" icon={<IconAlertCircle size={14} />}>
                              Approval already in progress — tap &ldquo;Open Requisition&rdquo; to continue.
                            </Alert>
                          )}
                          <Button
                            fullWidth
                            size="lg"
                            color="indigo"
                            loading={actionLoading}
                            disabled={alreadyRunning}
                            onClick={() => handleAction('approve')}
                          >
                            Approve In App
                          </Button>
                        </>
                      );
                    })()}
                    {selectedItem.module === 'approvals' && isRequisitionApproval(selectedItem) && selectedItem.workflowRequestId && (
                      <Button
                        fullWidth
                        size="lg"
                        color="gray"
                        variant="light"
                        loading={actionLoading}
                        onClick={() => void handleOpenRequisitionDetails(selectedItem)}
                      >
                        Fallback: Open Requisition
                      </Button>
                    )}
                    {String(selectedItem.id || '').startsWith('running-') && (
                      <Button
                        fullWidth
                        size="lg"
                        color="red"
                        variant="light"
                        loading={actionLoading}
                        onClick={() => {
                          const runningId = String(selectedItem.id || '').replace(/^running-/, '');
                          removeRunningAction(runningId);
                          dismissItem(selectedItem.id);
                        }}
                      >
                        Remove From Running
                      </Button>
                    )}
                    {selectedItem.module === 'field' && selectedItem.workflowRunId ? (
                      <Button
                        fullWidth
                        size="lg"
                        color="teal"
                        variant="light"
                        leftSection={<IconActivity size={18} />}
                        loading={actionLoading}
                        onClick={() => void handleOpenFieldRun(selectedItem)}
                      >
                        Open job
                      </Button>
                    ) : null}
                    {selectedItem.module !== 'field' && (!isRequisitionApproval(selectedItem) || selectedItem.module !== 'approvals') && (
                      <Button
                        fullWidth
                        size="lg"
                        color={canOrgAction ? 'green' : 'blue'}
                        variant="light"
                        leftSection={canOrgAction ? <IconCheck size={18} /> : undefined}
                        loading={actionLoading}
                        onClick={() => handleAction('approve')}
                      >
                        {selectedItem.module === 'approvals' ? 'Approve' : 'Open'}
                      </Button>
                    )}
                    {selectedItem.module === 'approvals' && !isRequisitionApproval(selectedItem) && (
                      <Button
                        fullWidth
                        size="lg"
                        color="red"
                        variant="light"
                        leftSection={<IconX size={18} />}
                        loading={actionLoading}
                        onClick={() => handleAction('reject')}
                      >
                        Reject
                      </Button>
                    )}
                  </>
                )}
              </Stack>
            )}
          </Stack>
        )}
      </BottomSheet>

      <Modal
        opened={switchConsentOpen}
        onClose={() => resolveSwitchConsent(false)}
        title="Switch to Organization Context"
        centered
      >
        <Stack gap="sm">
          <Alert color="blue" variant="light" icon={<IconShieldCheck size={16} />}>
            {ORG_SWITCH_COPY[switchConsentTarget?.purpose || 'request'].banner}
          </Alert>
          <Text size="sm" c="dimmed">
            Continue as <Text span fw={700}>{switchConsentTarget?.orgName || switchConsentTarget?.orgTenantId}</Text> to {ORG_SWITCH_COPY[switchConsentTarget?.purpose || 'request'].action}.
          </Text>
          <Group grow mt="sm">
            <Button variant="default" onClick={() => resolveSwitchConsent(false)}>
              Cancel
            </Button>
            <Button color="indigo" onClick={() => resolveSwitchConsent(true)}>
              Continue
            </Button>
          </Group>
        </Stack>
      </Modal>
    </AppShellMobile>
  );
}
