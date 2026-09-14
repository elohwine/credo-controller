import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Stack, Text, Title, Group, Skeleton, Divider, Button, Badge, Paper, ThemeIcon, useMantineColorScheme, useMantineTheme,
  ScrollArea, Anchor,
} from '@mantine/core';
import { IconRefresh, IconActivity, IconChevronRight, IconInbox, IconWallet, IconArrowRight } from '@tabler/icons-react';
import CredentialPreviewCard, { WalletCard, deriveCardKind } from '@/components/home/CredentialPreviewCard';
import { useRouter } from 'next/router';
import AppShellMobile from '@/components/layout/AppShellMobile';
import ActionCenter from '@/components/home/ActionCenter';
import HomeActionQueueItem, { HomeActionKind } from '@/components/home/HomeActionQueueItem';
import {
  getContextMode,
  getUserRole,
  getUserName,
  getActiveOrgLabel,
  getActiveOrgId,
  getPreferredToken,
  getWalletToken,
  getOrgToken,
  getPersonalWalletTenantId,
  isAuthenticated,
} from '@/lib/auth';
import api from '@/lib/api';
import { getRunningActions, RunningAction } from '@/lib/runningActions';
import { formatCredentialType } from '@/lib/format';
import { getFriendlyActivityActionLabel, getFriendlyActivitySummary } from '@/lib/uxCopy';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

type AuditContext = 'organization' | 'personal' | 'guest' | 'service';

type RecentTransactionRow = {
  id: string;
  ref: string;
  title: string;
  summary: string;
  context: AuditContext;
  occurredAt: string;
  flowType: 'PAYMENT' | 'WORKFLOW' | 'FIELD_EXECUTION' | 'CREDENTIAL' | 'SYSTEM';
  actionHash?: string;
};

type UnreadInboxRow = {
  id: string;
  title: string;
  summary: string;
  createdAt: string;
  route?: string;
  kind?: HomeActionKind;
};

type HomeQueueRow = {
  id: string;
  title: string;
  summary: string;
  createdAt: string;
  route: string;
  kind: HomeActionKind;
  family?: string;
};

function credentialFamily(typeLabel: string): string {
  const normalized = String(typeLabel || '').toLowerCase();
  if (/(receipt|invoice|payment|transaction|quote)/.test(normalized)) return 'Payments';
  if (/(employment|staff|employee|worker|payroll)/.test(normalized)) return 'Employment';
  if (/(education|student|school|tuition|fees)/.test(normalized)) return 'Education';
  if (/(id|identity|kyc|membership|passport|national)/.test(normalized)) return 'Identity';
  return 'General';
}

function homeQueueUrgencyScore(row: HomeQueueRow): number {
  const title = row.title.toLowerCase();
  if (row.kind === 'request') return 400;
  if (title.includes('payment due')) return 380;
  if (row.kind === 'offer') return 300;
  if (row.kind === 'receipt') return 220;
  if (title.includes('approved') || title.includes('rejected')) return 180;
  return 100;
}

function formatAuditTimestamp(value: unknown): string {
  const parsed = dayjs(typeof value === 'string' || typeof value === 'number' || value instanceof Date ? value : undefined);
  if (!parsed.isValid()) return dayjs().format('YYYY-MM-DD HH:mm:ss Z');
  return parsed.format('YYYY-MM-DD HH:mm:ss Z');
}

const FLOW_COLOR: Record<RecentTransactionRow['flowType'], string> = {
  PAYMENT: 'teal',
  WORKFLOW: 'blue',
  FIELD_EXECUTION: 'grape',
  CREDENTIAL: 'indigo',
  SYSTEM: 'gray',
};

const FLOW_LABEL: Record<RecentTransactionRow['flowType'], string> = {
  PAYMENT: 'Payment',
  WORKFLOW: 'Request',
  FIELD_EXECUTION: 'Field Run',
  CREDENTIAL: 'Credential',
  SYSTEM: 'Activity',
};

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

function isFeptWorkflowType(value: unknown): boolean {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized.includes('field') || normalized.includes('fept');
}

function toFeptStageLabel(stage: string): string {
  const labels: Record<string, string> = {
    DRAFT: 'Draft',
    REQUEST_CREATED: 'Request created',
    APPROVAL_PENDING: 'Approval pending',
    APPROVED: 'Approved',
    RELEASE_AUTHORIZED: 'Release authorized',
    ASSIGNED: 'Task assigned',
    IN_PROGRESS: 'Work in progress',
    EVIDENCE_CAPTURED: 'Evidence captured',
    ACKNOWLEDGED: 'Execution acknowledged',
    PAYMENT_TRIGGERED: 'Payment triggered',
    RECEIPT_ISSUED: 'Receipt issued',
    RECONCILED: 'Reconciled',
    COMPLETED: 'Completed',
    DISPUTED: 'Disputed',
    CANCELLED: 'Cancelled',
    REVOKED: 'Revoked',
  };
  return labels[stage] || stage.toLowerCase().replace(/_/g, ' ');
}

function extractFeptStage(entry: any, all?: Record<string, any>): string {
  const merged = all || {
    ...(entry?.details || {}),
    ...(entry?.details?.requestSummary && typeof entry.details.requestSummary === 'object' ? entry.details.requestSummary : {}),
  };

  const candidates = [
    merged.workflowStage,
    merged.stage,
    merged.state,
    entry?.workflowStage,
    entry?.status,
    entry?.eventType,
    entry?.workflowStep,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeStage(candidate);
    if (normalized && FEPT_STAGES.has(normalized)) return normalized;
  }

  return '';
}

function inferDomainTarget(entry: any): string {
  const details = entry?.details || {};
  const requestSummary = details.requestSummary && typeof details.requestSummary === 'object' ? details.requestSummary : {};
  const all = { ...requestSummary, ...details };
  const path = String(all.path || all.route || '').toLowerCase();
  const workflowType = String(all.workflowType || all.templateId || all.workflowId || '').toLowerCase();
  const workflowStage = extractFeptStage(entry, all);
  const ref = String(all.providerRef || all.sourceReference || all.reference || '').toLowerCase();

  if (
    isFeptWorkflowType(workflowType)
    || FEPT_STAGES.has(workflowStage)
    || path.includes('/workflows/runs')
  ) return 'field_execution';
  if (path.includes('/requis') || String(all.requisitionId || '').trim()) return 'requisition';
  if (path.includes('/payment-link') || ref.startsWith('paylink-')) return 'payment request';
  if (String(all.invoiceId || all.invoiceRef || '').trim()) return 'invoice';
  if (String(all.transactionId || all.paymentId || all.paymentReference || '').trim()) return 'payment';
  if (path.includes('/credential') || String(all.credentialType || '').trim()) return 'credential';
  return 'activity';
}

function getFriendlyActionLabel(entry: any): string {
  return getFriendlyActivityActionLabel(entry?.actionType, entry?.workflowStep, entry?.details)
}

function getFriendlySummary(entry: any, actionLabel: string): string {
  const details = entry?.details || {};
  const requestSummary = details.requestSummary && typeof details.requestSummary === 'object' ? details.requestSummary : {};
  const all = { ...requestSummary, ...details };
  const delegated = Boolean(entry?.onBehalfOf || entry?.onBehalfOfName || inferAuditContext(entry) === 'organization');
  const role = String(all.orgRole || all.approverRole || '').trim();
  const contextText = delegated
    ? `For your organization${role ? ` (${role})` : ''}`
    : 'For you';

  const amount = all.amount;
  const currency = typeof all.currency === 'string' ? all.currency.toUpperCase() : '';
  const amountText =
    typeof amount === 'number' || (typeof amount === 'string' && String(amount).trim().length > 0)
      ? `${currency ? `${currency} ` : ''}${amount}`
      : '';

  return getFriendlyActivitySummary(actionLabel, contextText, amountText || undefined);
}

function classifyHomeFlow(entry: any): RecentTransactionRow['flowType'] {
  const details = entry?.details || {};
  const requestSummary = details.requestSummary && typeof details.requestSummary === 'object' ? details.requestSummary : {};
  const all = { ...requestSummary, ...details };
  const feptStage = extractFeptStage(entry, all);
  const workflowType = String(all.workflowType || all.templateId || all.workflowId || '').toLowerCase();
  const joined = String(entry?.actionType ?? entry?.workflowStep ?? entry?.resourceId ?? '').toLowerCase();
  if (isFeptWorkflowType(workflowType) || FEPT_STAGES.has(feptStage) || joined.includes('fept') || joined.includes('field')) return 'FIELD_EXECUTION';
  if (joined.includes('payment') || joined.includes('invoice') || joined.includes('receipt')) return 'PAYMENT';
  if (joined.includes('workflow') || joined.includes('requis') || joined.includes('approve') || joined.includes('assign')) return 'WORKFLOW';
  if (joined.includes('credential') || joined.includes('proof') || joined.includes('did') || joined.includes('verify') || joined.includes('vc')) return 'CREDENTIAL';
  return 'SYSTEM';
}

function getGreeting(): string {
  if (typeof window === 'undefined') return 'Good morning';
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function inferAuditContext(entry: any, fallback: AuditContext = 'service'): AuditContext {
  const context = String(entry?.actorContext ?? entry?.contextType ?? entry?.details?.actorContext ?? '').toLowerCase();
  if (context === 'organization' || context === 'personal' || context === 'guest' || context === 'service') return context;
  return fallback;
}

function getTransactionRef(entry: any): string {
  const requestSummary = entry?.details?.requestSummary || {};
  const candidate = String(
    requestSummary?.providerRef
    ?? requestSummary?.sourceReference
    ?? requestSummary?.invoiceId
    ?? requestSummary?.invoiceRef
    ?? requestSummary?.transactionId
    ?? requestSummary?.paymentId
    ?? requestSummary?.requestId
    ?? entry?.resourceId
    ?? entry?.workflowId
    ?? entry?.details?.providerRef
    ?? entry?.details?.transactionId
    ?? entry?.details?.reference
    ?? entry?.id
    ?? ''
  ).trim();

  const invalidRefs = new Set([
    'approve-from-inbox', 'reject-from-inbox', 'approve', 'reject',
    'request', 'status', 'logs', 'audit',
  ]);

  return invalidRefs.has(candidate) ? '' : candidate;
}

function isActionNoise(entry: any): boolean {
  const action = String(entry?.actionType || '').toLowerCase();
  const path = String(entry?.details?.path || '').toLowerCase();
  const ref = getTransactionRef(entry).toLowerCase();

  if (action === 'api.post' && ref === 'session') return true;
  if (action === 'credential.stored' && (ref === 'sync-receipts' || path.includes('/sync-receipts'))) return true;
  if (path === '/api/ssi/auth/session') return true;
  return false;
}

export default function HomePage() {
  const theme = useMantineTheme();
  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();
  const [inboxCount, setInboxCount] = useState(0);
  const [pendingOfferCount, setPendingOfferCount] = useState(0);
  const [assignedFieldTaskCount, setAssignedFieldTaskCount] = useState(0);
  const [proofCount, setProofCount] = useState(0);
  const [walletCredentials, setWalletCredentials] = useState<WalletCard[]>([]);
  const [expiringCount, setExpiringCount] = useState(0);
  const [userName, setUserName] = useState<string | null>(null);
  const [userAccountId, setUserAccountId] = useState<string | null>(null);
  const [orgLabel, setOrgLabel] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [recentTransactions, setRecentTransactions] = useState<RecentTransactionRow[]>([]);
  const [unreadInboxRows, setUnreadInboxRows] = useState<UnreadInboxRow[]>([]);
  const [activeWorkflowTypes, setActiveWorkflowTypes] = useState<string[]>([]);
  const [runningActions, setRunningActions] = useState<RunningAction[]>([]);
  const [hasIdentityOffer, setHasIdentityOffer] = useState(false);
  const autoRefreshLockRef = useRef(false);

  const homeQueueRows = useMemo<HomeQueueRow[]>(() => {
    const unreadRows: HomeQueueRow[] = unreadInboxRows.map((row) => ({
      id: `inbox-${row.id}`,
      title: row.title,
      summary: row.summary,
      createdAt: row.createdAt,
      route: row.route || '/inbox',
      kind: row.kind === 'receipt' ? 'receipt' : 'offer',
      family: row.kind === 'receipt' || row.kind === 'request' ? 'Payments' : undefined,
    }));

    const txnRows: HomeQueueRow[] = recentTransactions.map((row) => ({
      id: `txn-${row.id}`,
      title: row.title,
      summary: row.summary,
      createdAt: row.occurredAt,
      route: `/activity?ref=${encodeURIComponent(row.ref)}`,
      kind: 'transaction',
      family: FLOW_LABEL[row.flowType],
    }));

    const sortedUnread = unreadRows
      .sort((a, b) => {
        const scoreDelta = homeQueueUrgencyScore(b) - homeQueueUrgencyScore(a);
        if (scoreDelta !== 0) return scoreDelta;
        return dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf();
      })
      .slice(0, 4);

    const sortedTxn = txnRows
      .sort((a, b) => dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf())
      .slice(0, 4);

    const dedupedTxn = sortedTxn.filter((row, index, rows) => {
      const signature = `${row.title}|${row.summary}`.toLowerCase();
      return rows.findIndex((entry) => `${entry.title}|${entry.summary}`.toLowerCase() === signature) === index;
    }).slice(0, 2);

    return [...sortedUnread, ...dedupedTxn].slice(0, 6);
  }, [recentTransactions, unreadInboxRows]);

  useEffect(() => {
    setMounted(true);
    if (!isAuthenticated()) return;
    void loadHomeData();
  }, []);

  useEffect(() => {
    const handleAutoRefresh = () => {
      if (!isAuthenticated()) return;
      if (autoRefreshLockRef.current) return;
      autoRefreshLockRef.current = true;
      void loadHomeData({ silent: true }).finally(() => {
        window.setTimeout(() => {
          autoRefreshLockRef.current = false;
        }, 900);
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      handleAutoRefresh();
    };

    window.addEventListener('focus', handleAutoRefresh);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('focus', handleAutoRefresh);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const loadHomeData = async (options?: { silent?: boolean }) => {
    const silent = Boolean(options?.silent);
    if (!silent) setLoading(true);
    setRunningActions(getRunningActions().filter((entry) => entry.status !== 'completed').slice(0, 4));
    setUserName(getUserName());
    setUserAccountId(getPersonalWalletTenantId());
    setOrgLabel(getActiveOrgLabel());
    setUserRole(getUserRole());
    const contextMode = getContextMode();
    try {
      const storedWorkflows = localStorage.getItem('credoActiveWorkflowTypes');
      const workflows = storedWorkflows ? JSON.parse(storedWorkflows) : [];
      setActiveWorkflowTypes(workflows);

      // Proactive sync: refresh org workflow state so portal-side activation appears quickly.
      const activeOrgId = getActiveOrgId();
      if (contextMode === 'org' && activeOrgId) {
        const { syncOrgContextFromServer } = await import('@/lib/auth');
        const contextChanged = await syncOrgContextFromServer();
        if (contextChanged || !workflows || workflows.length === 0) {
          const updatedWorkflows = localStorage.getItem('credoActiveWorkflowTypes');
          setActiveWorkflowTypes(updatedWorkflows ? JSON.parse(updatedWorkflows) : []);
        }
      }
    } catch {
      setActiveWorkflowTypes([]);
    }

    const preferredToken = getPreferredToken();
    const walletToken = getWalletToken();
    const activeOrgId = getActiveOrgId();
    const personalTenantId = getPersonalWalletTenantId();
    const credentialTenantId = contextMode === 'org' ? activeOrgId : personalTenantId;

    try {
      if (preferredToken) {
        // Fetch pending counts from existing wallet endpoints.
        if (contextMode === 'personal' && walletToken) {
          const [offersRes, receiptsRes] = await Promise.allSettled([
            api.get('/api/wallet/credentials/pending-offers', { headers: { Authorization: `Bearer ${walletToken}` } }),
            api.get('/api/wallet/credentials/pending-receipts', { headers: { Authorization: `Bearer ${walletToken}` } }),
          ]);

          const offers = offersRes.status === 'fulfilled'
            ? (Array.isArray(offersRes.value.data?.offers) ? offersRes.value.data.offers : (Array.isArray(offersRes.value.data) ? offersRes.value.data : []))
            : [];
          const receipts = receiptsRes.status === 'fulfilled'
            ? (Array.isArray(receiptsRes.value.data?.pendingReceipts) ? receiptsRes.value.data.pendingReceipts :
              Array.isArray(receiptsRes.value.data?.receipts) ? receiptsRes.value.data.receipts : [])
            : [];

          const offerUris = new Set(offers.map((o: any) => o?.offerUri).filter(Boolean));
          const receiptCount = receipts.filter((r: any) => /receipt/i.test(String(r?.credentialType ?? '')) && !(r?.offerUri && offerUris.has(r.offerUri))).length;
          setHasIdentityOffer(offers.some((o: any) => String(o?.credentialType || '').toLowerCase().includes('platformidentity')))
          const assignedFieldCount = offers.filter((o: any) => {
            const sourceType = String(o?.sourceType || '').toLowerCase();
            const credType = String(o?.credentialType || '').toLowerCase();
            return sourceType === 'workflow_assignment' || credType === 'fieldtask';
          }).length;

          const unreadRows: UnreadInboxRow[] = [
            ...offers.map((o: any) => {
              const sourceType = String(o?.sourceType || '').toLowerCase();
              const invoiceRef = String(o?.claims?.invoiceRef || o?.claims?.invoiceId || '').trim();
              const issuerName = String(o?.issuerName || o?.issuer || 'Unknown issuer').trim();
              const rawType = String(
                o?.credentialType
                || o?.claims?.credentialType
                || o?.claims?.type
                || 'Credential offer'
              );
              const credentialLabel = formatCredentialType(rawType);
              const family = credentialFamily(credentialLabel);

              let title = `${credentialLabel} offer`;
              let summary = `From ${issuerName}`;
              if (sourceType === 'payment_link') title = invoiceRef ? `Payment due · ${invoiceRef}` : 'Payment link';
              else if (sourceType === 'invoice_offer') title = invoiceRef ? `Invoice · ${invoiceRef}` : 'Invoice offer';
              else if (sourceType === 'proof_request') title = 'Proof request';
              else if (sourceType.includes('workflow')) title = 'Workflow action';

              if (sourceType === 'payment_link') {
                summary = issuerName ? `From ${issuerName} · Tap to pay` : 'Tap to pay';
              } else if (sourceType === 'invoice_offer') {
                summary = issuerName ? `Issued by ${issuerName}` : 'Invoice ready';
              } else if (sourceType === 'proof_request') {
                summary = issuerName ? `Requested by ${issuerName}` : 'Proof needed';
              } else if (sourceType.includes('workflow')) {
                summary = issuerName ? `Action from ${issuerName}` : 'Needs your action';
              }

              return {
                id: String(o?.id || o?.offerId || o?.offerUri || Math.random()),
                title,
                summary,
                createdAt: String(o?.createdAt || new Date().toISOString()),
                route: '/inbox',
                kind: sourceType === 'payment_link' ? 'request' : 'offer',
                family: sourceType === 'payment_link' ? 'Payments' : family,
              };
            }),
            ...receipts
              .filter((r: any) => /receipt/i.test(String(r?.credentialType ?? '')))
              .map((r: any) => ({
                id: String(r?.id || r?.receiptRowId || r?.offerId || Math.random()),
                title: `Receipt · ${r?.description || r?.paymentId || 'Payment'}`,
                summary: r?.merchant ? `From ${r.merchant} · Save to wallet` : 'Save to wallet',
                createdAt: String(r?.createdAt || r?.issuedAt || new Date().toISOString()),
                route: '/inbox',
                kind: 'receipt' as const,
                family: 'Payments',
              })),
          ]
            .sort((a, b) => dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf())
            .slice(0, 5);

          setUnreadInboxRows(unreadRows);

          setPendingOfferCount(offers.length);
          setInboxCount(offers.length + receiptCount);
          setAssignedFieldTaskCount(assignedFieldCount);
        } else {
          setPendingOfferCount(0);
          setInboxCount(0);
          setAssignedFieldTaskCount(0);
          setUnreadInboxRows([]);
        }

        if (credentialTenantId) {
          try {
            const credsRes = await api.get(`/api/wallet/${credentialTenantId}/credentials`, {
              headers: { Authorization: `Bearer ${preferredToken}` },
            });
            const rawCreds = Array.isArray(credsRes.data)
              ? credsRes.data
              : Array.isArray(credsRes.data?.credentials)
                ? credsRes.data.credentials
                : [];
            setProofCount(rawCreds.length);

            // Build wallet card previews for Zone 3
            const now = new Date();
            let expiring = 0;
            const cards: WalletCard[] = rawCreds.slice(0, 6).map((c: any): WalletCard => {
              const rawType = String(
                c?.type?.[c.type.length - 1] ?? c?.credentialSubject?.type ?? c?.credentialType ?? 'Document'
              );
              const kind = deriveCardKind(rawType);
              const label = rawType
                .replace(/VC$|Credential$/i, '')
                .replace(/([a-z])([A-Z])/g, '$1 $2')
                .trim() || 'Document';
              const expiryDate = c?.expirationDate ? new Date(c.expirationDate) : null;
              const isExpiring = expiryDate && expiryDate > now && (expiryDate.getTime() - now.getTime()) < 30 * 24 * 60 * 60 * 1000;
              const isExpired = expiryDate && expiryDate <= now;
              if (isExpiring) expiring++;
              const issueStr = c?.issuanceDate ? new Date(c.issuanceDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : undefined;
              return {
                id: String(c?.id ?? c?.credentialId ?? Math.random()),
                label,
                ref: undefined,
                status: isExpired ? 'expired' : 'valid',
                kind,
                issueDate: issueStr,
                meta: isExpiring ? 'Expiring soon' : issueStr ? `Issued ${issueStr}` : undefined,
              };
            });
            setWalletCredentials(cards);
            setExpiringCount(expiring);
          } catch {
            setProofCount(0);
            setWalletCredentials([]);
            setExpiringCount(0);
          }
        }

        try {
          const tokenCandidates = [
            contextMode === 'org' ? getOrgToken() : getWalletToken(),
            preferredToken,
          ]
            .filter((token): token is string => typeof token === 'string' && token.length > 0)
            .filter((token, index, list) => list.indexOf(token) === index);

          const resultSets = await Promise.all(tokenCandidates.map(async (token) => {
            try {
              const res = await api.get('/api/audit/logs', {
                params: { limit: 20, ts: Date.now() },
                headers: { Authorization: `Bearer ${token}` },
                skipAuthRedirect: true as any,
              } as any);
              const raw = Array.isArray(res.data) ? res.data : [];
              return raw.map((entry) => ({ ...entry, contextType: inferAuditContext(entry) }));
            } catch {
              return [] as any[];
            }
          }));

          const rows = resultSets.flat();
          const deduped = Array.from(new Map(rows.map((entry: any) => [entry.id, entry])).values());

          const mapped = deduped
            .sort((a: any, b: any) => dayjs(b?.createdAt || b?.occurredAt || 0).valueOf() - dayjs(a?.createdAt || a?.occurredAt || 0).valueOf())
            .map((entry: any): RecentTransactionRow | null => {
              if (isActionNoise(entry)) return null;
              const ref = getTransactionRef(entry);
              if (!ref) return null;
              const actionLabel = getFriendlyActionLabel(entry);
              return {
                id: String(entry?.id ?? ref),
                ref,
                title: actionLabel,
                summary: getFriendlySummary(entry, actionLabel),
                context: inferAuditContext(entry),
                occurredAt: formatAuditTimestamp(entry?.createdAt || entry?.occurredAt),
                flowType: classifyHomeFlow(entry),
                actionHash: entry?.actionHash,
              };
            })
            .filter((row): row is RecentTransactionRow => !!row)
            .slice(0, 4);

          setRecentTransactions(mapped);
        } catch {
          setRecentTransactions([]);
        }
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const today = dayjs().format('ddd, D MMM');
  const isOrgContext = getContextMode() === 'org' && !!getActiveOrgId();
  const isIssuer = ['owner', 'admin', 'issuer'].includes(userRole ?? '');

  if (!mounted) {
    return (
      <AppShellMobile>
        <Stack gap="lg" px="md" pt="md">
          <Skeleton height={40} width="60%" />
          <Skeleton height={160} radius="md" />
          <Skeleton height={160} radius="md" />
        </Stack>
      </AppShellMobile>
    );
  }

  return (
    <AppShellMobile inboxCount={inboxCount}>
      <Stack
        gap="lg"
        px="md"
        pt="md"
        pb={40}
        style={{
          minHeight: '100%',
          background: isDark
            ? `radial-gradient(circle at top right, ${isOrgContext ? 'rgba(20, 80, 80, 0.15)' : 'rgba(80, 20, 100, 0.15)'}, transparent 400px)`
            : `radial-gradient(circle at top right, ${isOrgContext ? 'rgba(20, 184, 166, 0.05)' : 'rgba(99, 102, 241, 0.05)'}, transparent 400px)`,
        }}
      >
        <Box>
          <Group justify="space-between" align="flex-start">
            <Box style={{ flex: 1 }}>
              <Text size="sm" c="dimmed">{today}</Text>
              <Title order={3} mt={2}>{getGreeting()}{userName ? `, ${userName.split(' ')[0]}` : ''}</Title>
              <Group gap={6} mt={4} wrap="wrap">
                <Badge
                  color="teal"
                  variant="light"
                  size="sm"
                  leftSection={<Box style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />}
                >
                  Verified Holder
                </Badge>
                {orgLabel && <Badge color="credentis" variant="light" size="sm">{orgLabel}</Badge>}
                {userRole && !orgLabel && <Badge color="gray" variant="light" size="sm" tt="capitalize">{userRole}</Badge>}
              </Group>
            </Box>
            <Button variant="subtle" color="gray" size="xs" leftSection={<IconRefresh size={14} />} onClick={() => void loadHomeData()} loading={loading}>
              Refresh
            </Button>
          </Group>
        </Box>

        <ActionCenter
          contextMode={isOrgContext ? 'org' : 'personal'}
          inboxCount={inboxCount}
          pendingOfferCount={pendingOfferCount}
          proofCount={proofCount}
          assignedFieldTaskCount={assignedFieldTaskCount}
          orgLabel={orgLabel}
          activeWorkflowTypes={activeWorkflowTypes}
          userName={userName}
          userAccountId={userAccountId}
          expiringCount={expiringCount}
        />

        {/* ── Zone 3: Credential card stack ─────────────────────────── */}
        {!loading && !isOrgContext && (
          <Box>
            <Group justify="space-between" mb={10} align="center">
              <Group gap={6} align="center">
                <IconWallet size={15} color={isDark ? theme.colors.gray[4] : theme.colors.gray[6]} />
                <Text fw={600} size="sm">
                  {proofCount > 0 ? `${proofCount} saved` : 'Documents'}
                </Text>
              </Group>
              <Anchor
                size="xs"
                c="credentis"
                onClick={() => router.push('/proofs')}
                style={{ cursor: 'pointer' }}
              >
                View all →
              </Anchor>
            </Group>

            {walletCredentials.length > 0 ? (
              <ScrollArea type="never" scrollbarSize={0}>
                <Group gap={12} wrap="nowrap" pb={4}>
                  {walletCredentials.map((card) => (
                    <CredentialPreviewCard
                      key={card.id}
                      card={card}
                      onClick={() => router.push('/proofs')}
                    />
                  ))}
                </Group>
              </ScrollArea>
            ) : (
              <Paper
                p="md"
                radius="md"
                withBorder
                style={{ cursor: 'pointer', textAlign: 'center' }}
                onClick={() => router.push('/inbox')}
              >
                <Text size="sm" c="dimmed">No documents yet — check your inbox for new items.</Text>
              </Paper>
            )}
          </Box>
        )}

        {/* ── Zone 4: Unified inbox card ────────────────────────────── */}
        {!loading && (
          <Paper
            p="sm"
            radius="md"
            withBorder
            style={{
              cursor: 'pointer',
              background: isDark
                ? `linear-gradient(135deg, rgba(26, 27, 30, 0.9), rgba(26, 27, 30, 0.7))`
                : theme.white,
            }}
            onClick={() => router.push('/inbox')}
          >
            <Group justify="space-between" align="flex-start" mb={homeQueueRows.length > 0 ? 10 : 0} wrap="nowrap">
              <Group gap={10} align="center" wrap="nowrap">
                <Box
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    background: isDark ? 'rgba(251, 146, 60, 0.18)' : 'rgba(251, 146, 60, 0.12)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <IconInbox size={20} color={theme.colors.orange[isDark ? 4 : 6]} />
                </Box>
                <Box>
                  <Text fw={700} size="sm">Needs your attention</Text>
                  <Text size="xs" c="dimmed">
                    {inboxCount > 0 ? `${inboxCount} waiting for you` : 'All caught up'}
                  </Text>
                </Box>
              </Group>
              {inboxCount > 0 && (
                <Badge
                  size="lg"
                  circle
                  color="orange"
                  variant={isDark ? 'filled' : 'light'}
                  style={{ flexShrink: 0 }}
                >
                  {inboxCount > 99 ? '99+' : inboxCount}
                </Badge>
              )}
            </Group>

            {/* 3-line preview */}
            {homeQueueRows.length > 0 && (
              <Stack gap={6} mb={10}>
                {homeQueueRows.slice(0, 3).map((row) => {
                  const dotColor =
                    row.kind === 'offer' ? theme.colors.green[isDark ? 4 : 6] :
                      row.kind === 'request' ? theme.colors.orange[isDark ? 4 : 6] :
                        row.kind === 'receipt' ? theme.colors.blue[isDark ? 4 : 6] :
                          theme.colors.gray[4];
                  return (
                    <Group key={row.id} gap={8} align="center" wrap="nowrap">
                      <Box
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: '50%',
                          background: dotColor,
                          flexShrink: 0,
                        }}
                      />
                      <Text size="xs" fw={600} style={{ flexShrink: 0, maxWidth: 130 }} truncate>
                        {row.title}
                      </Text>
                      <Text size="xs" c="dimmed" truncate style={{ flex: 1 }}>
                        — {row.summary}
                      </Text>
                    </Group>
                  );
                })}
              </Stack>
            )}

            <Button
              fullWidth
              variant="default"
              size="sm"
              rightSection={<IconArrowRight size={14} />}
              onClick={(e) => { e.stopPropagation(); router.push('/inbox'); }}
            >
              Open inbox
            </Button>
          </Paper>
        )}

        {/* ── Recent activity (compact, 2 rows) ───────────────────── */}
        {!loading && recentTransactions.length > 0 && (
          <Box>
            <Group justify="space-between" mb={8} align="center">
              <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Recent activity</Text>
              <Anchor size="xs" c="credentis" onClick={() => router.push('/activity')} style={{ cursor: 'pointer' }}>
                View all →
              </Anchor>
            </Group>
            <Stack gap={6}>
              {recentTransactions.slice(0, 2).map((row) => (
                <Paper
                  key={row.id}
                  p="xs"
                  radius="md"
                  withBorder
                  style={{ cursor: 'pointer' }}
                  onClick={() => router.push(`/activity?ref=${encodeURIComponent(row.ref)}`)}
                >
                  <Group justify="space-between" align="flex-start" wrap="nowrap">
                    <Box style={{ minWidth: 0, flex: 1 }}>
                      <Text fw={600} size="sm" truncate>{row.title}</Text>
                      <Text size="xs" c="dimmed" lineClamp={1}>{row.summary}</Text>
                    </Box>
                    <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                      {dayjs(row.occurredAt).fromNow()}
                    </Text>
                  </Group>
                </Paper>
              ))}
            </Stack>
          </Box>
        )}



        <Divider />
      </Stack>
    </AppShellMobile>
  );
}

