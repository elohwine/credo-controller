import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Stack, Title, Text, Box, Divider, Center, ThemeIcon, Loader, Alert, Group,
  ActionIcon, Button, Tabs, Badge
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { usePullRefresh } from '@/lib/pullRefresh';
import {
  IconWallet, IconRefresh, IconAlertCircle, IconShare
} from '@tabler/icons-react';
import AppShellMobile from '@/components/layout/AppShellMobile';
import { SectionTip } from '@/components/guides/SectionGuides';
import { useAppGuides } from '@/lib/guides';
import BottomSheet from '@/components/shared/BottomSheet';
import StatusBadge from '@/components/shared/StatusBadge';
import EmptyState from '@/components/shared/EmptyState';
import ErrorAlert from '@/components/shared/ErrorAlert';
import type { ProofCardData } from '@/components/proofs/ProofCard';
import CredentialCard from '@/components/shared/CredentialCard';
import api, { safeArray } from '@/lib/api';
import {
  CREDENTIS_CONTEXT_CHANGED_EVENT, decodeJwtPayload, getActiveOrgLabel, getContextMode, getOrgRoleClaim, getOrgToken,
  getPersonalWalletTenantId, getWalletToken,
} from '@/lib/auth';
import { credentialClaimRows, credentialIssuerLabel, formatCredentialType, formatDate } from '@/lib/format';
import { formatTxnTime, isOpenInboxOffer } from '@/lib/inboxAttention';
import {
  RECORD_SECTION_LABELS, RECORD_SECTION_ORDER, recordCardTitle, recordSectionOf, type RecordSectionKey,
} from '@/lib/workflowCapabilities';
import { cardLife, readArchivedCardIds, setCardArchived, type CardLifeInfo } from '@/lib/cardLife';
import { getOfflineStorageAdapter } from '@/lib/offline/storage';
import { normalizeWalletCredentialRows } from '@/lib/offline/walletSnapshotSync';
import RecordCheckPanel from '@/components/records/RecordCheckPanel';
import BrandedDocumentView from '@/components/records/BrandedDocumentView';
import { DOCUMENT_TITLES, documentFromClaims, documentKindOf } from '@/lib/brandedDocument';
import { appHref } from '@/lib/appPath';

interface WalletCredential {
  id: string;
  type: string | string[];
  issuerDid?: string;
  /** The organisation behind the issuer key, when the card's claims do not name it. */
  issuerName?: string;
  issuerOrgTenantId?: string;
  addedOn?: string;
  revoked?: boolean;
  /** The issuer withdrew this card (role changed, left the organisation). It no longer works. */
  withdrawn?: boolean;
  archived?: boolean;
  revocationReason?: string;
  /** Id the organisation registered when it issued this card. */
  issuedId?: string;
  parsedDocument?: {
    credentialSubject?: Record<string, any>;
    issuer?: string | { id: string };
    issuanceDate?: string;
    expirationDate?: string;
  };
}

interface PendingOffer {
  id: string;
  credentialType: string;
  issuerName?: string;
  offerUri?: string;
  createdAt?: string;
  authContext?: 'personal' | 'organization';
  authToken?: string;
}

interface CachedWalletSnapshot {
  credentials: WalletCredential[];
  pendingOffers: PendingOffer[];
  cachedAt: string;
}

const WALLET_CACHE_KEY = 'wallet-proofs-current';

function toTypeList(type: unknown): string[] {
  if (Array.isArray(type)) return type.map(String);
  if (typeof type === 'string') {
    const t = type.trim();
    if (t.startsWith('[')) {
      try { const p = JSON.parse(t); if (Array.isArray(p)) return p.map(String); } catch { }
    }
    return t ? [t] : [];
  }
  return [];
}

function primaryType(type: unknown): string {
  const labels = toTypeList(type);
  return labels.find((l) => l !== 'VerifiableCredential') || labels[labels.length - 1] || 'Credential';
}

function issuerOf(cred: WalletCredential): string {
  const issuer = typeof cred.parsedDocument?.issuer === 'string'
    ? cred.parsedDocument?.issuer
    : cred.parsedDocument?.issuer?.id || cred.issuerDid || '';
  // The organisation named on the card, not the key behind it.
  return cred.issuerName || credentialIssuerLabel(cred.parsedDocument?.credentialSubject, issuer);
}

function logCardLives(list: WalletCredential[]): void {
  const counts = { active: 0, expired: 0, replaced: 0, withdrawn: 0 };
  for (const cred of list) counts[lifeOf(cred).life] += 1;
}

function lifeOf(cred: WalletCredential): CardLifeInfo {
  return cardLife({
    withdrawn: cred.withdrawn,
    revoked: cred.revoked,
    revocationReason: cred.revocationReason,
    expiresAt: cred.parsedDocument?.expirationDate,
  });
}

function toProofCard(cred: WalletCredential): ProofCardData & { title?: string } {
  const life = lifeOf(cred);
  const type = primaryType(cred.type);
  return {
    id: cred.id,
    type,
    // Older job records were issued as a generic card; name them by what they are.
    title: recordCardTitle(type, cred.parsedDocument?.credentialSubject),
    issuer: issuerOf(cred),
    issuedAt: cred.addedOn || cred.parsedDocument?.issuanceDate || new Date().toISOString(),
    expiresAt: cred.parsedDocument?.expirationDate,
    claims: {},
    status: cred.archived && life.life === 'active' ? 'archived' : life.life === 'active' ? 'valid' : life.life,
  };
}

/** Who runs the organisation may open the records it holds; the server applies the same rule. */
const ORG_RECORD_ROLES = ['owner', 'admin'];

export default function ProofsPage() {
  const [orgName, setOrgName] = useState<string | null>(null);
  const [orgRole, setOrgRole] = useState<string | null>(null);
  const [orgCredentials, setOrgCredentials] = useState<WalletCredential[]>([]);
  const [orgWaiting, setOrgWaiting] = useState(0);
  const [orgLoading, setOrgLoading] = useState(false);
  const [orgError, setOrgError] = useState<string | null>(null);
  const orgInFlightRef = useRef(false);
  const [credentials, setCredentials] = useState<WalletCredential[]>([]);
  const [pendingOffers, setPendingOffers] = useState<PendingOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<WalletCredential | null>(null);
  const [documentOpen, setDocumentOpen] = useState(false);
  useEffect(() => setDocumentOpen(false), [selected?.id]);
  const [tab, setTab] = useState<string>('active');
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set());
  const [removing, setRemoving] = useState(false);
  const hintedPendingRef = useRef(false);
  const offlineNoticeShownRef = useRef(false);
  const inFlightRef = useRef(false);
  const hasShownRef = useRef(false);
  const offlineStorage = getOfflineStorageAdapter();

  // An organisation sign-in shows only what the organisation holds; the person's own cards stay
  // under their personal account, so the two never mix on one screen.
  const viewingOrg = !!orgName;
  const canOpenOrgRecords = ORG_RECORD_ROLES.includes(orgRole || '');
  const rows = (viewingOrg ? orgCredentials : credentials).map((c) => ({ ...c, archived: archivedIds.has(c.id) }));
  // Replaced and withdrawn cards are filed on their own. Expired cards stay with the live ones
  // until the person archives them.
  const active = rows.filter((c) => !c.archived && !lifeOf(c).fileAway);
  const archived = rows.filter((c) => c.archived || lifeOf(c).fileAway);
  const expiredInView = active.filter((c) => lifeOf(c).life === 'expired').length;

  // Filed under the same words as the inbox tabs; only sections that hold a card are shown.
  const grouped = RECORD_SECTION_ORDER.map((key: RecordSectionKey) => ({
    key,
    title: RECORD_SECTION_LABELS[key],
    rows: active.filter((c) => recordSectionOf(primaryType(c.type), c.parsedDocument?.credentialSubject) === key),
  })).filter((section) => section.rows.length > 0);

  // The getting-started step "Find it in Records" ticks once a saved card is actually on screen.
  const guides = useAppGuides();
  const seenPersonalCard = !viewingOrg && !loading && credentials.length > 0;
  useEffect(() => {
    if (seenPersonalCard && guides.ready && !guides.isDone('records_seen')) void guides.mark('records_seen', 'done');
  }, [seenPersonalCard, guides]);

  /**
   * Load the wallet. A background refresh (`silent`: app came back to the front, connection came
   * back) keeps the cards on screen and swaps in the new list when it arrives; only the first
   * load and an explicit Refresh / pull show the spinner. One request at a time.
   */
  const fetchWallet = useCallback(async (trigger?: unknown) => {
    const reason = typeof trigger === 'string' ? trigger : 'refresh';
    const silent = reason !== 'mount' && reason !== 'pull' && reason !== 'refresh';
    // An organisation sign-in reads the organisation's records (fetchOrgRecords), not the person's.
    if (getContextMode() === 'org') { setLoading(false); return; }
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    const showSpinner = !silent || !hasShownRef.current;
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
      const token = getWalletToken();
      if (!token) throw new Error('Not authenticated');

      const payload = decodeJwtPayload(token);
      if (!payload) throw new Error('Invalid authentication token');
      const walletId = payload.tenantId ?? payload.walletId ?? payload.sub;
      if (!walletId) throw new Error('Could not determine wallet ID');
      const cached = offlineStorage.get<CachedWalletSnapshot>('credential_cache', `${WALLET_CACHE_KEY}:${walletId}`);
      // Last known cards first, so the screen is never blank while the network answers.
      if (!hasShownRef.current && cached?.credentials?.length) {
        setCredentials(cached.credentials);
        setPendingOffers(cached.pendingOffers || []);
        hasShownRef.current = true;
        setLoading(false);
      }

      const [credentialsResult, pendingResult] = await Promise.allSettled([
        (async () => {
          let authToken = token;
          try {
            const sessionRes = await api.post(
              '/api/ssi/auth/session',
              { expiresInSeconds: 900 },
              {
                headers: { Authorization: `Bearer ${token}` },
                skipAuthRedirect: true as any,
              } as any,
            );
            if (sessionRes.data?.token) authToken = sessionRes.data.token;
          } catch { }

          const res = await api.get(`/api/wallet/${walletId}/credentials/list?limit=500`, {
            headers: { Authorization: `Bearer ${authToken}` },
            skipAuthRedirect: true as any,
          } as any);
          const items: any[] = safeArray(res.data?.items ?? res.data);
          // One normaliser for the screen and the offline copy (`walletSnapshotSync`).
          return normalizeWalletCredentialRows(items) as WalletCredential[];
        })(),
        (async () => {
          const personalToken = getWalletToken() || token;
          try {
            const walletTenantId = getPersonalWalletTenantId();
            await api.post('/api/wallet/credentials/sync-receipts', {}, {
              headers: {
                Authorization: `Bearer ${personalToken}`,
                'x-context-mode': 'personal',
                ...(walletTenantId ? { 'x-context-tenant-id': walletTenantId } : {}),
              },
              skipAuthRedirect: true as any,
            } as any);
          } catch { }

          const [resOffers, resReceipts] = await Promise.all([
            api.get('/api/wallet/credentials/pending-offers', {
              params: { status: 'open' },
              headers: { Authorization: `Bearer ${personalToken}` },
              skipAuthRedirect: true as any,
            } as any),
            api.get('/api/wallet/credentials/pending-receipts', {
              headers: { Authorization: `Bearer ${personalToken}` },
              skipAuthRedirect: true as any,
            } as any),
          ]);

          const offerRows = safeArray(resOffers.data?.offers ?? resOffers.data);
          const receiptRows = safeArray(resReceipts.data?.pendingReceipts ?? resReceipts.data?.receipts ?? resReceipts.data);

          // A job step or an assignment is inbox work, not a record waiting to be kept.
          const recordOffers = offerRows.filter((o: any) => {
            // Finished items ride along for the inbox Done tab; they are not waiting.
            if (!isOpenInboxOffer(o)) return false;
            const source = String(o.sourceType || '');
            const type = String(o.credentialType || '');
            return source !== 'workflow_stage_action' && source !== 'workflow_assignment' && type !== 'WorkflowStageAction' && type !== 'FieldTask';
          });
          const mappedOffers = recordOffers.map((o: any) => ({
            id: o.id ?? o.offerId,
            credentialType: o.credentialType ?? 'Credential Offer',
            issuerName: o.issuerName,
            offerUri: o.offerUri,
            createdAt: o.createdAt,
            authContext: 'personal',
            authToken: personalToken,
          }));

          const mappedReceipts = receiptRows
            .filter((r: any) => !!r.offerUri)
            .map((r: any) => ({
              id: r.receiptRowId ?? r.id ?? r.paymentId,
              credentialType: r.credentialType ?? 'PaymentReceiptVC',
              issuerName: r.merchant,
              offerUri: r.offerUri,
              createdAt: r.issuedAt ?? r.createdAt,
              authContext: 'personal',
              authToken: personalToken,
            }));

          const mergedOffers = [...mappedReceipts, ...mappedOffers];
          return Array.from(new Map(mergedOffers.map((o: any) => [o.offerUri || o.id, o])).values());
        })(),
      ]);

      let usedCachedCredentials = false;
      let usedCachedOffers = false;

      if (credentialsResult.status === 'fulfilled') {
        setCredentials(credentialsResult.value);
        logCardLives(credentialsResult.value);
      } else {
        const msg = (credentialsResult.reason as any)?.response?.data?.message
          ?? (credentialsResult.reason as any)?.message
          ?? 'Unable to load credentials';
        const fallbackCredentials = cached?.credentials || [];
        if (fallbackCredentials.length > 0) {
          usedCachedCredentials = true;
          setCredentials(fallbackCredentials);
          setError(`Offline mode: showing cached credentials (last sync ${formatDate(cached?.cachedAt)}).`);
        } else {
          setError(msg);
          if (!isOffline) {
            notifications.show({ title: 'Wallet Load Failed', message: msg, color: 'red' });
          }
        }
      }

      if (pendingResult.status === 'fulfilled') {
        setPendingOffers(pendingResult.value as PendingOffer[]);
      } else {
        const fallbackOffers = cached?.pendingOffers || [];
        if (fallbackOffers.length > 0) {
          usedCachedOffers = true;
          setPendingOffers(fallbackOffers);
        } else {
          setPendingOffers([]);
          if (!isOffline) {
            notifications.show({
              title: 'Offer Sync Warning',
              message: 'Unable to load pending offers',
              color: 'yellow',
            });
          }
        }
      }

      const latestCredentials = credentialsResult.status === 'fulfilled'
        ? credentialsResult.value
        : (cached?.credentials || []);
      const latestOffers = pendingResult.status === 'fulfilled'
        ? (pendingResult.value as PendingOffer[])
        : (cached?.pendingOffers || []);

      if (latestCredentials.length > 0 || latestOffers.length > 0) {
        offlineStorage.set<CachedWalletSnapshot>('credential_cache', `${WALLET_CACHE_KEY}:${walletId}`, {
          credentials: latestCredentials,
          pendingOffers: latestOffers,
          cachedAt: new Date().toISOString(),
        });
      }

      if (usedCachedCredentials || usedCachedOffers) {
        offlineNoticeShownRef.current = true;
      } else if (credentialsResult.status === 'fulfilled' || pendingResult.status === 'fulfilled') {
        offlineNoticeShownRef.current = false;
      }

      if (credentialsResult.status === 'fulfilled' && (credentialsResult.value?.length ?? 0) === 0 && pendingResult.status === 'fulfilled' && (pendingResult.value?.length ?? 0) > 0 && !hintedPendingRef.current) {
        hintedPendingRef.current = true;
        notifications.show({
          title: 'Pending offers are in Inbox',
          message: 'Open Inbox to review and accept pending credential offers.',
          color: 'blue',
        });
      }
    } catch (err: any) {
      const token = getWalletToken();
      const payload = token ? decodeJwtPayload(token) : null;
      const walletId = payload?.tenantId ?? payload?.walletId ?? payload?.sub;
      const cached = walletId
        ? offlineStorage.get<CachedWalletSnapshot>('credential_cache', `${WALLET_CACHE_KEY}:${walletId}`)
        : null;

      if (cached?.credentials?.length) {
        setCredentials(cached.credentials);
        setPendingOffers(cached.pendingOffers || []);
        setError('');
        offlineNoticeShownRef.current = true;
      } else {
        setError(err.response?.data?.message ?? err.message ?? 'Failed to load credentials');
        const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
        if (!isOffline) {
          notifications.show({
            title: 'Wallet Load Failed',
            message: err.response?.data?.message ?? err.message ?? 'Failed to load credentials',
            color: 'red',
          });
        }
      }
    } finally {
      hasShownRef.current = true;
      inFlightRef.current = false;
      setLoading(false);
    }
  }, [offlineStorage]);

  /**
   * Records the organisation holds: issued to it and kept in its name by an owner or admin from the
   * organisation inbox. Read with the organisation sign-in, never the person's.
   */
  const fetchOrgRecords = useCallback(async () => {
    if (getContextMode() !== 'org' || !ORG_RECORD_ROLES.includes(getOrgRoleClaim() || '')) return;
    const orgToken = getOrgToken();
    const orgTenantId = orgToken ? decodeJwtPayload(orgToken)?.tenantId : null;
    if (!orgToken || !orgTenantId) {
      setOrgError('Open the organisation again from the account switcher to see its records.');
      return;
    }
    if (orgInFlightRef.current) return;
    orgInFlightRef.current = true;
    setOrgLoading(true);
    setOrgError(null);
    const headers = { Authorization: `Bearer ${orgToken}` };
    try {
      const [listRes, waitingRes] = await Promise.allSettled([
        api.get(`/api/wallet/${encodeURIComponent(orgTenantId)}/credentials/list?limit=100`, { headers, skipAuthRedirect: true as any } as any),
        api.get('/api/wallet/credentials/pending-offers?holder=organization&status=open', { headers, skipAuthRedirect: true as any } as any),
      ]);
      if (listRes.status === 'fulfilled') {
        setOrgCredentials(normalizeWalletCredentialRows(safeArray(listRes.value.data?.items ?? listRes.value.data)) as WalletCredential[]);
      } else {
        const reason: any = listRes.reason;
        setOrgError(reason?.response?.data?.message ?? reason?.message ?? 'Could not load the organisation records');
      }
      if (waitingRes.status === 'fulfilled') {
        const offers = safeArray(waitingRes.value.data?.offers ?? waitingRes.value.data);
        setOrgWaiting(offers.filter((o: any) => isOpenInboxOffer(o)).length);
      }
    } finally {
      orgInFlightRef.current = false;
      setOrgLoading(false);
    }
  }, []);

  const readOrgContext = useCallback(() => {
    const label = getContextMode() === 'org' ? (getActiveOrgLabel() || 'Organisation') : null;
    setOrgName(label);
    setOrgRole(label ? getOrgRoleClaim() : null);
    setOrgCredentials([]);
    setOrgWaiting(0);
    setOrgError(null);
    setTab('active');
    if (label) void fetchOrgRecords();
    else void fetchWallet('refresh');
  }, [fetchOrgRecords, fetchWallet]);

  useEffect(() => {
    readOrgContext();
    window.addEventListener(CREDENTIS_CONTEXT_CHANGED_EVENT, readOrgContext);
    return () => window.removeEventListener(CREDENTIS_CONTEXT_CHANGED_EVENT, readOrgContext);
  }, [readOrgContext]);

  useEffect(() => {
    setArchivedIds(readArchivedCardIds());
    fetchWallet('mount');
  }, [fetchWallet]);
  usePullRefresh(() => { void fetchWallet('pull'); void fetchOrgRecords(); });

  // Refresh quietly when the app comes back to the front or the connection returns. No timer:
  // cards change when the person accepts one in the inbox, not on a clock.
  useEffect(() => {
    const onResume = (event: Event) => {
      if (document.visibilityState !== 'visible') return;
      fetchWallet(event.type);
      void fetchOrgRecords();
    };
    window.addEventListener('focus', onResume);
    window.addEventListener('online', onResume);
    document.addEventListener('visibilitychange', onResume);
    return () => {
      window.removeEventListener('focus', onResume);
      window.removeEventListener('online', onResume);
      document.removeEventListener('visibilitychange', onResume);
    };
  }, [fetchWallet, fetchOrgRecords]);

  /** Delete the card from this device. The organisation's record of what it issued is untouched. */
  const handleRemove = async (cred: WalletCredential) => {
    if (!window.confirm('Remove this card from this device? You cannot undo this.')) return;
    const token = getWalletToken();
    if (!token) return;
    const payload = decodeJwtPayload(token);
    const walletId = payload?.tenantId ?? payload?.walletId ?? payload?.sub;
    if (!walletId) return;
    setRemoving(true);
    try {
      let authToken = token;
      try {
        const sessionRes = await api.post('/api/ssi/auth/session', { expiresInSeconds: 900 }, {
          headers: { Authorization: `Bearer ${token}` },
          skipAuthRedirect: true as any,
        } as any);
        if (sessionRes.data?.token) authToken = sessionRes.data.token;
      } catch { }
      await api.delete(`/api/wallet/${walletId}/credentials/${encodeURIComponent(cred.id)}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      setCredentials((prev) => prev.filter((c) => c.id !== cred.id));
      setSelected(null);
      notifications.show({ title: 'Removed', message: 'The card is no longer on this device.', color: 'gray' });
    } catch (err: any) {
      notifications.show({ title: 'Could not remove', message: err?.response?.data?.message || err?.message, color: 'red' });
    } finally {
      setRemoving(false);
    }
  };

  const handleArchive = (cred: WalletCredential, archive: boolean) => {
    setCardArchived(cred.id, archive);
    setArchivedIds(readArchivedCardIds());
    setSelected(null);
  };

  const handleShare = (cred: WalletCredential) => {
    const typeName = recordCardTitle(primaryType(cred.type), cred.parsedDocument?.credentialSubject) || formatCredentialType(primaryType(cred.type));
    const msg = encodeURIComponent(`Authentic ${typeName} - Credentis`);
    window.open(`https://wa.me/?text=${msg}`, '_blank');
  };

  const renderSection = (title: string, rows: WalletCredential[]) => (
    <Box key={title}>
      <Text fw={700} size="lg">{title}</Text>
      <Stack gap="sm" mt="sm">
        {rows.map((cred) => (
          <CredentialCard
            key={cred.id}
            {...toProofCard(cred)}
            onClick={() => setSelected(cred)}
          />
        ))}
      </Stack>
    </Box>
  );

  return (
    <AppShellMobile minimalHeader>
      <Stack gap={0} pb={80}>
        <Box px="md" pt="md" pb="xs">
          <Group justify="space-between" align="center">
            <Box style={{ flex: 1 }}>
              <Title order={1} fw={700} style={{ fontSize: 36, lineHeight: 1.05 }}>{viewingOrg ? 'Organisation Records' : 'My Records'}</Title>
              <Text size="sm" c="dimmed" mt={4}>
                {viewingOrg
                  ? `Records issued to ${orgName} and kept in its name, sorted by kind.`
                  : 'Your documents, receipts and cards, sorted by kind.'}
              </Text>
            </Box>
            <ActionIcon
              variant="subtle" color="gray" size={48} aria-label="Refresh"
              onClick={() => (viewingOrg ? void fetchOrgRecords() : void fetchWallet('refresh'))}
              loading={viewingOrg ? orgLoading : loading}
            ><IconRefresh size={18} /></ActionIcon>
          </Group>
        </Box>

        <SectionTip tip="tip_records" when={!viewingOrg} wrap={{ padding: '4px 16px 8px' }} />
        {!(viewingOrg && !canOpenOrgRecords) && (
        <Tabs value={tab} onChange={(v) => setTab(v ?? 'active')} px="md">
          <Tabs.List grow>
            <Tabs.Tab value="active">Active {active.length > 0 ? `(${active.length})` : ''}</Tabs.Tab>
            <Tabs.Tab value="archived">Archived {archived.length > 0 ? `(${archived.length})` : ''}</Tabs.Tab>
          </Tabs.List>
        </Tabs>
        )}

        <Box px="md" pt="md">
          {viewingOrg && !canOpenOrgRecords ? (
            <EmptyState
              icon={<IconWallet size={28} />}
              title="Only owners and admins open these"
              description={`Records held in ${orgName}'s name are opened by its owner or an admin. Your own cards are under your personal account.`}
            />
          ) : viewingOrg ? (
            <>
              {orgError && <ErrorAlert message={orgError} mb="md" />}
              {orgWaiting > 0 && (
                <Alert color="blue" radius="sm" mb="md" title="Waiting for the organisation">
                  <Group justify="space-between" align="center">
                    <Text size="sm">
                      {orgWaiting === 1
                        ? `1 record sent to ${orgName} is waiting to be kept.`
                        : `${orgWaiting} records sent to ${orgName} are waiting to be kept.`}
                    </Text>
                    <Button size="xs" variant="light" onClick={() => window.location.assign(appHref('/inbox'))}>Open Inbox</Button>
                  </Group>
                </Alert>
              )}
              {orgLoading && orgCredentials.length === 0 ? (
                <Center py="xl"><Loader color="credentis" /></Center>
              ) : tab === 'active' ? (
                grouped.length === 0 ? (
                  <EmptyState
                    icon={<IconWallet size={28} />}
                    title="No organisation records yet"
                    description={`Records sent to ${orgName} appear here once an owner or admin keeps them from the organisation inbox.`}
                  />
                ) : (
                  <Stack gap="xl">
                    {grouped.map((section) => renderSection(section.title, section.rows))}
                  </Stack>
                )
              ) : archived.length === 0 ? (
                <EmptyState icon={<IconWallet size={28} />} title="No archived records" />
              ) : (
                <Stack gap="sm">
                  {archived.map((cred) => (
                    <CredentialCard key={cred.id} {...toProofCard(cred)} onClick={() => setSelected(cred)} />
                  ))}
                </Stack>
              )}
            </>
          ) : (
          <>
          {error && <ErrorAlert message={error} mb="md" />}
          {expiredInView > 0 && tab === 'active' && (
            <Alert color="gray" radius="sm" mb="md" title="Some cards have expired">
              They are shown in grey. Open one and archive it so your live cards stay easy to find.
            </Alert>
          )}
          {pendingOffers.length > 0 && (
            <Alert color="blue" radius="sm" mb="md" title="Waiting in your inbox">
              <Group justify="space-between" align="center">
                <Text size="sm">
                  {pendingOffers.length === 1
                    ? `${formatCredentialType(pendingOffers[0].credentialType)}${pendingOffers[0].issuerName ? ` from ${pendingOffers[0].issuerName}` : ''} is waiting for you to keep.`
                    : `${pendingOffers.length} records are waiting for you to keep.`}
                </Text>
                <Button size="xs" variant="light" onClick={() => window.location.assign(appHref('/inbox'))}>Open Inbox</Button>
              </Group>
            </Alert>
          )}

          {loading ? (
            <Center py="xl"><Loader color="credentis" /></Center>
          ) : tab === 'active' ? (
            grouped.length === 0 ? (
              <EmptyState icon={<IconWallet size={28} />} title="No records yet" description="Cards and records you keep from your inbox appear here." />
            ) : (
              <Stack gap="xl">
                {grouped.map((section) => renderSection(section.title, section.rows))}
              </Stack>
            )
          ) : archived.length === 0 ? (
            <EmptyState icon={<IconWallet size={28} />} title="No archived cards" />
          ) : (
            <Stack gap="sm">
              {archived.map((cred) => (
                <CredentialCard
                  key={cred.id}
                  {...toProofCard(cred)}
                  onClick={() => setSelected(cred)}
                />
              ))}
            </Stack>
          )}
          </>
          )}
        </Box>
      </Stack>

      <BottomSheet opened={!!selected} onClose={() => setSelected(null)} title={selected ? (recordCardTitle(primaryType(selected.type), selected.parsedDocument?.credentialSubject) || formatCredentialType(primaryType(selected.type))) : ''}>
        {selected && (
          <Stack gap="md" pb="lg">
            {(() => {
              const life = lifeOf(selected);
              const standing = selected.archived && life.life === 'active' ? 'archived' : life.life === 'active' ? 'valid' : life.life;
              return (
                <>
                  <Group gap="xs">
                    <StatusBadge status={standing} />
                    {life.life === 'active' && selected.parsedDocument?.expirationDate && (
                      <Badge size="xs" color="gray" variant="light">
                        Expires {new Date(selected.parsedDocument.expirationDate).toLocaleDateString()}
                      </Badge>
                    )}
                  </Group>
                  {life.note && (
                    <Alert color={life.life === 'replaced' ? 'orange' : life.life === 'withdrawn' ? 'red' : 'gray'} variant="light">
                      {life.note}
                    </Alert>
                  )}
                  {life.life === 'expired' && !selected.archived && (
                    <Button color="gray" onClick={() => handleArchive(selected, true)}>Archive this card</Button>
                  )}
                </>
              );
            })()}
            <Text size="sm" c="dimmed">From {issuerOf(selected)}</Text>
            <Text size="sm" c="dimmed">Issued on {formatTxnTime(selected.addedOn)}</Text>
            {credentialClaimRows(selected.parsedDocument?.credentialSubject).length > 0 && (
              <>
                <Divider />
                <Text size="sm" fw={600}>What this record says</Text>
                <Stack gap={6}>
                  {credentialClaimRows(selected.parsedDocument?.credentialSubject).map((row) => (
                    <Group key={row.label} justify="space-between" align="flex-start" wrap="nowrap" gap="md">
                      <Text size="sm" c="dimmed" style={{ flexShrink: 0 }}>{row.label}</Text>
                      <Text size="sm" fw={500} ta="right" style={{ textTransform: row.label === 'Role' ? 'capitalize' : undefined }}>{row.value}</Text>
                    </Group>
                  ))}
                </Stack>
              </>
            )}
            {(() => {
              const subject = selected.parsedDocument?.credentialSubject || {};
              const kind = documentKindOf(toTypeList(selected.type), subject);
              if (!kind) return null;
              const title = DOCUMENT_TITLES[kind].toLowerCase();
              return (
                <>
                  <Divider />
                  <Button variant={documentOpen ? 'subtle' : 'light'} onClick={() => setDocumentOpen((open) => !open)}>
                    {documentOpen ? `Hide ${title}` : `View ${title}`}
                  </Button>
                  {documentOpen && (
                    <BrandedDocumentView
                      orgTenantId={selected.issuerOrgTenantId}
                      fallbackName={issuerOf(selected)}
                      model={documentFromClaims({
                        kind,
                        claims: subject,
                        issuedAt: selected.parsedDocument?.issuanceDate || selected.addedOn,
                        credentialId: selected.issuedId || selected.id,
                        issuerDid: selected.issuerDid,
                        withdrawn: lifeOf(selected).life === 'withdrawn',
                        signed: true,
                      })}
                    />
                  )}
                </>
              );
            })()}
            <Divider />
            <Group grow>
              {lifeOf(selected).life === 'active' && !selected.archived && (
                <Button variant="light" color="green" size="sm" leftSection={<IconShare size={14} />} onClick={() => handleShare(selected)}>Share</Button>
              )}
              {!lifeOf(selected).fileAway && (
                <Button
                  variant="light"
                  color={selected.archived ? 'blue' : 'gray'}
                  size="sm"
                  onClick={() => handleArchive(selected, !selected.archived)}
                >
                  {selected.archived ? 'Restore' : 'Archive'}
                </Button>
              )}
            </Group>
            {lifeOf(selected).life === 'active' && (
              <RecordCheckPanel
                presetReference={selected.issuedId || selected.id}
                onRevoked={() => {
                  const markRevoked = (prev: WalletCredential[]) => prev.map((c) => c.id === selected.id ? { ...c, revoked: true } : c);
                  if (viewingOrg) setOrgCredentials(markRevoked); else setCredentials(markRevoked);
                  setSelected(null);
                }}
              />
            )}
            {!viewingOrg && (
              <Button variant="subtle" size="xs" color="red" loading={removing} onClick={() => void handleRemove(selected)}>
                Remove from this device
              </Button>
            )}
          </Stack>
        )}
      </BottomSheet>
    </AppShellMobile>
  );
}
