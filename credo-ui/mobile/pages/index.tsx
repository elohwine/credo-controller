import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Stack, Text, Title, Group, Skeleton, Divider, Button, Badge, Paper, ThemeIcon, UnstyledButton, useMantineColorScheme, useMantineTheme,
  ScrollArea, Anchor, Alert,
} from '@mantine/core';
import { IconRefresh, IconActivity, IconChevronRight, IconInbox, IconWallet, IconArrowRight } from '@tabler/icons-react';
import CredentialPreviewCard, { WalletCard, credentialTypeName, deriveCardKind } from '@/components/home/CredentialPreviewCard';
import { useRouter } from 'next/router';
import AppShellMobile from '@/components/layout/AppShellMobile';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys, STALE_TIME } from '@/lib/queries/keys';
import { useSessionStore } from '@/lib/state/session';
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
import { friendlyRequestError } from '@/lib/requestError';
import { getRunningActions, RunningAction } from '@/lib/runningActions';
import { formatCredentialType } from '@/lib/format';
import { RECORD_SECTION_LABELS, recordCardTitle, recordSectionOf } from '@/lib/workflowCapabilities';
import { formatTxnTime } from '@/lib/inboxAttention';
import { getFriendlyActivityActionLabel, getFriendlyActivitySummary, offerReplacement, stepRequiredLabel, toFeptStageLabel } from '@/lib/uxCopy';
import { describeHolderActivity, type HolderActivityEntry } from '@/lib/holderActivity';
import { nextStepCard, type NextStepItem } from '@/lib/nextSteps';
import { workflowAttentionPreview } from '@/lib/workflowAttention';
import dayjs from 'dayjs';

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
  /** A row from your own activity log (opens the personal Activity page). */
  personal?: boolean;
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
  if (!(typeof value === 'string' || typeof value === 'number' || value instanceof Date)) return '';
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.toISOString() : '';
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

interface HomeSnapshot {
  nextSteps: NextStepItem[];
  orgAttentionError?: string;
  pendingOfferCount: number;
  inboxCount: number;
  assignedFieldTaskCount: number;
  proofCount: number;
  walletCredentials: WalletCard[];
  expiringCount: number;
  recentTransactions: RecentTransactionRow[];
  unreadInboxRows: UnreadInboxRow[];
  activeWorkflowTypes: string[];
  hasIdentityOffer: boolean;
}

function emptyHomeSnapshot(): HomeSnapshot {
  return {
    nextSteps: [],
    pendingOfferCount: 0,
    inboxCount: 0,
    assignedFieldTaskCount: 0,
    proofCount: 0,
    walletCredentials: [],
    expiringCount: 0,
    recentTransactions: [],
    unreadInboxRows: [],
    activeWorkflowTypes: [],
    hasIdentityOffer: false,
  };
}

const EMPTY_HOME_SNAPSHOT = emptyHomeSnapshot();

export default function HomePage() {
  const theme = useMantineTheme();
  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();
  const [userName, setUserName] = useState<string | null>(null);
  const [userAccountId, setUserAccountId] = useState<string | null>(null);
  const [orgLabel, setOrgLabel] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [runningActions, setRunningActions] = useState<RunningAction[]>([]);
  // The home summary lives in the shared cache per account + context: it shows at once on
  // return and is checked again in the background (on return to the app, on pull, when stale).
  const queryClient = useQueryClient();
  const scope = useSessionStore((state) => state.scope);
  const homeKey = useMemo(() => queryKeys.home(scope), [scope]);
  const fetchHomeRef = useRef<(expectedScope: string) => Promise<HomeSnapshot>>(async () => emptyHomeSnapshot());
  const homeQuery = useQuery<HomeSnapshot>({
    queryKey: homeKey,
    queryFn: () => fetchHomeRef.current(scope),
    enabled: mounted && isAuthenticated(),
    staleTime: STALE_TIME.home,
    meta: { persist: true },
  });
  const home = homeQuery.data ?? EMPTY_HOME_SNAPSHOT;
  const {
    nextSteps,
    pendingOfferCount,
    inboxCount,
    assignedFieldTaskCount,
    proofCount,
    walletCredentials,
    expiringCount,
    recentTransactions,
    unreadInboxRows,
    activeWorkflowTypes,
    hasIdentityOffer,
  } = home;
  // Only the very first load (nothing saved for this account yet) hides the lists.
  const loading = !homeQuery.data && homeQuery.isFetching;
  const loadHomeData = useCallback(async () => {
    readLocalHome();
    await queryClient.refetchQueries({ queryKey: homeKey, exact: true }).catch(() => undefined);
  }, [queryClient, homeKey]);

  // What is actually waiting. Recent activity has its own list below, so it is not
  // previewed here — that mix made the card say "All caught up" while listing items.
  // An organisation home does not load wallet offers; the next-step read is what is waiting.
  const waitingInbox = useMemo(
    () => nextSteps.filter((item) => item.kind === 'inbox'),
    [nextSteps],
  );
  const homeQueueRows = useMemo<HomeQueueRow[]>(() => {
    const unreadRows: HomeQueueRow[] = unreadInboxRows.map((row) => ({
      id: `inbox-${row.id}`,
      title: row.title,
      summary: row.summary,
      createdAt: row.createdAt,
      route: row.route || '/inbox',
      kind: row.kind === 'receipt' ? 'receipt' : row.kind === 'request' ? 'request' : 'offer',
      family: row.kind === 'receipt' || row.kind === 'request' ? 'Payments' : undefined,
    }));
    if (unreadRows.length > 0) {
      return unreadRows
        .sort((a, b) => {
          const scoreDelta = homeQueueUrgencyScore(b) - homeQueueUrgencyScore(a);
          if (scoreDelta !== 0) return scoreDelta;
          return dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf();
        })
        .slice(0, 3);
    }
    return waitingInbox.slice(0, 3).map((item) => ({
      id: item.id,
      title: item.title,
      summary: item.detail,
      createdAt: '',
      route: item.requestId
        ? `/inbox?filter=requests&request=${encodeURIComponent(item.requestId)}`
        : item.inboxItemId ? `/inbox?item=${encodeURIComponent(item.inboxItemId)}` : '/inbox',
      kind: 'request' as const,
    }));
  }, [unreadInboxRows, waitingInbox]);
  // The recommendations are capped, not an authoritative inbox total.
  const waitingCount = getContextMode() === 'org' ? null : inboxCount;


  const readLocalHome = () => {
    setRunningActions(getRunningActions().filter((entry) => entry.status !== 'completed').slice(0, 4));
    setUserName(getUserName());
    setUserAccountId(getPersonalWalletTenantId());
    setOrgLabel(getActiveOrgLabel());
    setUserRole(getUserRole());
  };

  useEffect(() => {
    setMounted(true);
    readLocalHome();
  }, []);


  fetchHomeRef.current = async (expectedScope): Promise<HomeSnapshot> => {
    const requestedScope = useSessionStore.getState().scope;
    if (requestedScope !== expectedScope) throw new Error('Home context changed before loading.');
    const snap: HomeSnapshot = emptyHomeSnapshot();
    readLocalHome();
    const contextMode = getContextMode();
    try {
      const storedWorkflows = localStorage.getItem('credoActiveWorkflowTypes');
      const workflows = storedWorkflows ? JSON.parse(storedWorkflows) : [];
      snap.activeWorkflowTypes = (workflows);

      // Proactive sync: refresh org workflow state so portal-side activation appears quickly.
      const activeOrgId = getActiveOrgId();
      if (contextMode === 'org' && activeOrgId) {
        const { syncOrgContextFromServer } = await import('@/lib/auth');
        const contextChanged = await syncOrgContextFromServer();
        if (contextChanged || !workflows || workflows.length === 0) {
          const updatedWorkflows = localStorage.getItem('credoActiveWorkflowTypes');
          snap.activeWorkflowTypes = (updatedWorkflows ? JSON.parse(updatedWorkflows) : []);
        }
      }
    } catch {
      snap.activeWorkflowTypes = ([]);
    }

    const preferredToken = getPreferredToken();
    const walletToken = getWalletToken();
    const activeOrgId = getActiveOrgId();
    const personalTenantId = getPersonalWalletTenantId();
    const credentialTenantId = contextMode === 'org' ? activeOrgId : personalTenantId;
    const orgToken = getOrgToken();

    if (contextMode === 'org' && activeOrgId && getOrgToken()) {
      try {
        const stepsRes = await api.get(`/api/organizations/${encodeURIComponent(activeOrgId)}/next-steps`, {
          headers: { Authorization: `Bearer ${orgToken}` },
        });
        snap.nextSteps = (Array.isArray(stepsRes.data?.items) ? stepsRes.data.items : []);
      } catch (error) {
        snap.nextSteps = ([]);
        snap.orgAttentionError = friendlyRequestError(error, 'Could not load organisation attention items.');
      }
    } else {
      snap.nextSteps = ([]);
    }

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
          snap.hasIdentityOffer = (offers.some((o: any) => String(o?.credentialType || '').toLowerCase().includes('platformidentity')))
          const assignedFieldCount = offers.filter((o: any) => {
            const sourceType = String(o?.sourceType || '').toLowerCase();
            const credType = String(o?.credentialType || '').toLowerCase();
            return sourceType === 'workflow_assignment' || credType === 'fieldtask';
          }).length;

          const unreadRows: UnreadInboxRow[] = [
            ...offers.map((o: any) => {
              const sourceType = String(o?.sourceType || '').toLowerCase();
              const workflowPreview = sourceType.includes('workflow') ? workflowAttentionPreview(o) : null;
              const invoiceRef = String(o?.claims?.invoiceRef || o?.claims?.invoiceId || '').trim();
              const issuerName = String(o?.issuerName || o?.issuer || 'Unknown issuer').trim();
              const rawType = String(
                o?.credentialType
                || o?.claims?.credentialType
                || o?.claims?.type
                || 'Credential offer'
              );
              const connectedTitle = sourceType === 'connected_system_record' ? String(o?.title || '').trim() : '';
              const credentialLabel = recordCardTitle(rawType, o?.claims) || connectedTitle || formatCredentialType(rawType);
              // Same section words as My Records and the inbox tabs.
              const family = RECORD_SECTION_LABELS[recordSectionOf(rawType, o?.claims)];

              let title = `${credentialLabel} offer`;
              let summary = `From ${issuerName}`;
              if (sourceType === 'payment_link') title = invoiceRef ? `Payment due · ${invoiceRef}` : 'Payment link';
              else if (sourceType === 'invoice_offer') title = invoiceRef ? `Invoice · ${invoiceRef}` : 'Invoice offer';
              else if (sourceType === 'proof_request') title = 'Proof request';
              else if (workflowPreview) title = workflowPreview.title;

              const replaces = offerReplacement(o?.claims);
              if (replaces) {
                title = replaces.label;
                summary = replaces.note;
              } else if (sourceType === 'payment_link') {
                summary = issuerName ? `From ${issuerName} · Tap to pay` : 'Tap to pay';
              } else if (sourceType === 'invoice_offer') {
                summary = issuerName ? `Issued by ${issuerName}` : 'Invoice ready';
              } else if (sourceType === 'proof_request') {
                summary = issuerName ? `Requested by ${issuerName}` : 'Proof needed';
              } else if (workflowPreview) {
                summary = workflowPreview.summary;
              }

              return {
                id: String(o?.id || o?.offerId || o?.offerUri || Math.random()),
                title,
                summary,
                createdAt: String(o?.createdAt || new Date().toISOString()),
                route: workflowPreview?.route || '/inbox',
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

          snap.unreadInboxRows = (unreadRows);

          snap.pendingOfferCount = (offers.length);
          snap.inboxCount = (offers.length + receiptCount);
          snap.assignedFieldTaskCount = (assignedFieldCount);
        } else {
          snap.pendingOfferCount = (0);
          snap.inboxCount = (0);
          snap.assignedFieldTaskCount = (0);
          snap.unreadInboxRows = ([]);
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
            snap.proofCount = (rawCreds.length);

            // Build wallet card previews for Zone 3
            const now = new Date();
            let expiring = 0;
            const cards: WalletCard[] = rawCreds.slice(0, 6).map((c: any): WalletCard => {
              const typeValue = c?.type ?? c?.parsedDocument?.type ?? c?.credentialType;
              const rawType = Array.isArray(typeValue) ? typeValue.join(' ') : String(typeValue || 'Document');
              const kind = deriveCardKind(rawType);
              const label = credentialTypeName(typeValue);
              const expiryRaw = c?.expirationDate || c?.parsedDocument?.expirationDate;
              const expiryDate = expiryRaw ? new Date(expiryRaw) : null;
              const isExpiring = expiryDate && expiryDate > now && (expiryDate.getTime() - now.getTime()) < 30 * 24 * 60 * 60 * 1000;
              const isExpired = expiryDate && expiryDate <= now;
              if (isExpiring) expiring++;
              const issuedRaw = c?.issuanceDate || c?.parsedDocument?.issuanceDate || c?.addedOn;
              const issueStr = issuedRaw ? new Date(issuedRaw).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : undefined;
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
            snap.walletCredentials = (cards);
            snap.expiringCount = (expiring);
          } catch {
            snap.proofCount = (0);
            snap.walletCredentials = ([]);
            snap.expiringCount = (0);
          }
        }

        if (contextMode !== 'org' && walletToken) {
          // Your own activity: cards you were given, what you shared and with whom. The
          // organisation audit feed is not yours to read in a personal account.
          try {
            const res = await api.get('/api/wallet/activity', {
              params: { limit: 3, ts: Date.now() },
              headers: { Authorization: `Bearer ${walletToken}` },
              skipAuthRedirect: true as any,
            } as any);
            const items: HolderActivityEntry[] = Array.isArray(res.data?.items) ? res.data.items : [];
            snap.recentTransactions = (
              items.map((entry): RecentTransactionRow => {
                const line = describeHolderActivity(entry, { labelStep: (step) => stepRequiredLabel({ stageAction: step }) });
                return {
                  id: entry.id,
                  ref: entry.id,
                  title: line.title,
                  summary: line.summary,
                  context: 'personal',
                  occurredAt: entry.occurredAt,
                  flowType: entry.kind.startsWith('card') ? 'CREDENTIAL' : 'WORKFLOW',
                  personal: true,
                };
              })
            );
          } catch {
            snap.recentTransactions = ([]);
          }
        } else {
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

          snap.recentTransactions = (mapped);
        } catch {
          snap.recentTransactions = ([]);
        }
        }
      }
    } finally {
      // Partial answers are still the latest picture; each part above already fell back on its own.
    }
    if (useSessionStore.getState().scope !== requestedScope) throw new Error('Home context changed while loading.');
    return snap;
  };


  const today = dayjs().format('ddd, D MMM');
  const isOrgContext = getContextMode() === 'org' && !!getActiveOrgId();
  const setupStep = isOrgContext ? nextStepCard(nextSteps.filter((item) => item.kind === 'setup'), 'phone') : null;
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
                  Account verified
                </Badge>
                {orgLabel && <Badge color="credentis" variant="light" size="sm">{orgLabel}</Badge>}
                {userRole && userRole !== 'holder' && !orgLabel && <Badge color="gray" variant="light" size="sm" tt="capitalize">{userRole}</Badge>}
              </Group>
            </Box>
            <Button variant="subtle" color="gray" size="xs" leftSection={<IconRefresh size={14} />} onClick={() => void loadHomeData()} loading={homeQuery.isFetching}>
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
            <Group justify="space-between" align="flex-start" mb={homeQueueRows.length > 0 || setupStep ? 10 : 0} wrap="nowrap">
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
                    {waitingCount === null
                      ? homeQueueRows.length > 0 ? 'Organisation items to review' : 'Review your organisation inbox'
                      : waitingCount > 0 ? `${waitingCount} waiting for you` : setupStep ? 'Setup is not finished' : 'All caught up'}
                  </Text>
                </Box>
              </Group>
              {waitingCount !== null && waitingCount > 0 && (
                <Badge
                  size="lg"
                  circle
                  color="orange"
                  variant={isDark ? 'filled' : 'light'}
                  style={{ flexShrink: 0 }}
                >
                  {waitingCount > 99 ? '99+' : waitingCount}
                </Badge>
              )}
            </Group>

            {/* Setup steps are not inbox items, so the org home shows them here instead of a separate card. */}
            {home.orgAttentionError && <Alert color="red" mb="sm">{home.orgAttentionError}</Alert>}
            {isOrgContext && setupStep && (
              <Text
                size="xs"
                fw={600}
                c="credentis"
                mb={10}
                truncate
                onClick={(e) => { e.stopPropagation(); router.push(setupStep.href); }}
              >
                {setupStep.sentence}
              </Text>
            )}

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
                    <UnstyledButton type="button" key={row.id}
                      style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%', minHeight: 48 }}
                      onClick={event => { event.stopPropagation(); void router.push(row.route); }}>
                      <Box
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: '50%',
                          background: dotColor,
                          flexShrink: 0,
                        }}
                      />
                      <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                        <Text size="sm" fw={600} lineClamp={2}>{row.title}</Text>
                        <Text size="xs" c="dimmed" lineClamp={2}>{row.summary}</Text>
                      </Stack>
                    </UnstyledButton>
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
            {isOrgContext && <Button fullWidth variant="subtle" mt="xs"
              onClick={event => { event.stopPropagation(); void router.push('/requests'); }}>
              Requests & history
            </Button>}
          </Paper>
        )}

        {/* ── Recent activity (compact, 2 rows) ───────────────────── */}
        {!loading && recentTransactions.length > 0 && (
          <Box>
            <Group justify="space-between" mb={8} align="center">
              <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Recent activity</Text>
              <Anchor
                size="xs"
                c="credentis"
                onClick={() => router.push(isOrgContext ? '/activity' : '/activity?lens=personal')}
                style={{ cursor: 'pointer' }}
              >
                View all →
              </Anchor>
            </Group>
            <Stack gap={6}>
              {recentTransactions.slice(0, isOrgContext ? 2 : 3).map((row) => (
                <Paper
                  key={row.id}
                  p="xs"
                  radius="md"
                  withBorder
                  style={{ cursor: 'pointer' }}
                  onClick={() =>
                    router.push(
                      row.personal
                        ? `/activity?lens=personal&entry=${encodeURIComponent(row.id)}`
                        : `/activity?ref=${encodeURIComponent(row.ref)}`,
                    )
                  }
                >
                  <Group justify="space-between" align="flex-start" wrap="nowrap">
                    <Box style={{ minWidth: 0, flex: 1 }}>
                      <Text fw={600} size="sm" truncate>{row.title}</Text>
                      <Text size="xs" c="dimmed" lineClamp={1}>{row.summary}</Text>
                    </Box>
                    <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                      {formatTxnTime(row.occurredAt)}
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
