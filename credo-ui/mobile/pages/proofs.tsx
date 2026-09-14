import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Stack, Title, Text, Box, Divider, Center, ThemeIcon, Loader, Alert, Group,
  ActionIcon, Button, Tabs, Badge
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconWallet, IconRefresh, IconAlertCircle, IconShare
} from '@tabler/icons-react';
import AppShellMobile from '@/components/layout/AppShellMobile';
import BottomSheet from '@/components/shared/BottomSheet';
import StatusBadge from '@/components/shared/StatusBadge';
import EmptyState from '@/components/shared/EmptyState';
import ErrorAlert from '@/components/shared/ErrorAlert';
import type { ProofCardData } from '@/components/proofs/ProofCard';
import CredentialCard from '@/components/shared/CredentialCard';
import api, { safeArray } from '@/lib/api';
import { decodeJwtPayload, getPersonalWalletTenantId, getWalletToken } from '@/lib/auth';
import { formatCredentialType, formatDate, formatIssuerName } from '@/lib/format';
import { getOfflineStorageAdapter } from '@/lib/offline/storage';

interface WalletCredential {
  id: string;
  type: string | string[];
  issuerDid?: string;
  addedOn?: string;
  revoked?: boolean;
  archived?: boolean;
  revocationReason?: string;
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

function classifyCategory(type: unknown): 'Identity' | 'Payments' | 'Employment' | 'Education' | 'Healthcare' | 'Government' | 'Other' {
  const t = primaryType(type).toLowerCase();

  if (/(receipt|invoice|quote|payment|transaction)/i.test(t)) return 'Payments';
  if (/(employment|payroll|salary|staff|worker|job)/i.test(t)) return 'Employment';
  if (/(education|student|school|fees|tuition)/i.test(t)) return 'Education';
  if (/(health|medical|vaccine|prescription|clinic|hospital)/i.test(t)) return 'Healthcare';
  if (/(government|national|civic|voter|licence|license|permit|tax|passport)/i.test(t)) return 'Government';
  if (/(id|identity|kyc|membership|national)/i.test(t)) return 'Identity';
  return 'Other';
}

function toProofCard(cred: WalletCredential): ProofCardData {
  const issuer = typeof cred.parsedDocument?.issuer === 'string'
    ? cred.parsedDocument?.issuer
    : cred.parsedDocument?.issuer?.id || cred.issuerDid || '';

  return {
    id: cred.id,
    type: primaryType(cred.type),
    issuer,
    issuedAt: cred.addedOn || cred.parsedDocument?.issuanceDate || new Date().toISOString(),
    expiresAt: cred.parsedDocument?.expirationDate,
    claims: {},
    status: cred.archived ? 'archived' : cred.revoked ? 'expired' : 'valid',
  };
}

export default function ProofsPage() {
  const [credentials, setCredentials] = useState<WalletCredential[]>([]);
  const [pendingOffers, setPendingOffers] = useState<PendingOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<WalletCredential | null>(null);
  const [tab, setTab] = useState<string>('active');
  const hintedPendingRef = useRef(false);
  const offlineNoticeShownRef = useRef(false);
  const offlineStorage = getOfflineStorageAdapter();

  const active = credentials.filter((c) => !c.archived && !c.revoked);
  const archived = credentials.filter((c) => !!c.archived);

  const grouped = {
    Identity: active.filter((c) => classifyCategory(c.type) === 'Identity'),
    Payments: active.filter((c) => classifyCategory(c.type) === 'Payments'),
    Employment: active.filter((c) => classifyCategory(c.type) === 'Employment'),
    Education: active.filter((c) => classifyCategory(c.type) === 'Education'),
    Healthcare: active.filter((c) => classifyCategory(c.type) === 'Healthcare'),
    Government: active.filter((c) => classifyCategory(c.type) === 'Government'),
    Other: active.filter((c) => classifyCategory(c.type) === 'Other'),
  };

  const fetchWallet = useCallback(async () => {
    setLoading(true);
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

          const dedupedMap = new Map<string, any>();
          items.forEach((item) => {
            const subject = item.parsedDocument?.credentialSubject || item.credentialSubject || {};
            const baseKey = subject.transactionId || subject.invoiceHash || subject.invoiceId || subject.cartId || item.id;
            const isReceipt = toTypeList(item.type).some((t) => t.includes('Receipt'));
            const key = isReceipt ? `receipt-${item.id}` : `${baseKey}-${primaryType(item.type)}`;
            if (!dedupedMap.has(key) || new Date(item.addedOn) > new Date(dedupedMap.get(key)?.addedOn)) {
              dedupedMap.set(key, item);
            }
          });

          return Array.from(dedupedMap.values()).map((item) => ({
            id: item.vc_id || item.id,
            type: item.vc_type || item.type || 'VerifiableCredential',
            issuerDid: item.issuerDid,
            addedOn: item.issued_at || item.addedOn,
            revoked: !!item.revoked || item.status === 'REVOKED',
            archived: !!item.archived,
            revocationReason: item.revocation_reason,
            parsedDocument: item.parsedDocument || item.parsed_document,
          } as WalletCredential));
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

          const mappedOffers = offerRows.map((o: any) => ({
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
        notifications.show({
          title: 'Offline wallet mode',
          message: 'Showing last synced credentials and offers from local cache.',
          color: 'blue',
        });
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
        setError(`Offline mode: showing cached credentials (last sync ${formatDate(cached.cachedAt)}).`);
        if (!offlineNoticeShownRef.current) {
          notifications.show({
            title: 'Offline wallet mode',
            message: 'Network unavailable. Loaded credentials from local cache.',
            color: 'blue',
          });
          offlineNoticeShownRef.current = true;
        }
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
      setLoading(false);
    }
  }, [offlineStorage]);

  useEffect(() => { fetchWallet(); }, [fetchWallet]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      fetchWallet();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [fetchWallet]);

  useEffect(() => {
    const handleFocus = () => { fetchWallet(); };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [fetchWallet]);

  const handleArchive = async (cred: WalletCredential, archive: boolean) => {
    try {
      const token = getWalletToken();
      if (!token) throw new Error('Missing holder wallet token');
      await api.post(`/api/wallet/credentials/${cred.id}/archive`, { archived: archive }, { headers: { Authorization: `Bearer ${token}` } });
    } catch { }
    setCredentials((prev) => prev.map((c) => c.id === cred.id ? { ...c, archived: archive } : c));
    setSelected(null);
  };

  const handleShare = (cred: WalletCredential) => {
    const typeName = formatCredentialType(primaryType(cred.type));
    const msg = encodeURIComponent(`Authentic ${typeName} - Credentis`);
    window.open(`https://wa.me/?text=${msg}`, '_blank');
  };

  const renderSection = (title: string, rows: WalletCredential[]) => (
    <Box key={title}>
      <Text fw={700} size="lg">{title}</Text>
      {rows.length > 0 ? (
        <Stack gap="sm" mt="sm">
          {rows.map((cred) => (
            <CredentialCard
              key={cred.id}
              {...toProofCard(cred)}
              onClick={() => setSelected(cred)}
            />
          ))}
        </Stack>
      ) : (
        <Text size="xs" c="dimmed" mt="xs">No records</Text>
      )}
    </Box>
  );

  return (
    <AppShellMobile minimalHeader>
      <Stack gap={0} pb={80}>
        <Box px="md" pt="md" pb="xs">
          <Group justify="space-between" align="center">
            <Box style={{ flex: 1 }}>
              <Title order={1} fw={700} style={{ fontSize: 36, lineHeight: 1.05 }}>My Records</Title>
              <Text size="sm" c="dimmed" mt={4}>Your verified documents, receipts, and credentials — organised by category.</Text>
            </Box>
            <ActionIcon variant="subtle" color="gray" size="lg" onClick={fetchWallet} loading={loading}><IconRefresh size={18} /></ActionIcon>
          </Group>
        </Box>

        <Tabs value={tab} onChange={(v) => setTab(v ?? 'active')} px="md">
          <Tabs.List grow>
            <Tabs.Tab value="active">Active {active.length > 0 ? `(${active.length})` : ''}</Tabs.Tab>
            <Tabs.Tab value="archived">Archived {archived.length > 0 ? `(${archived.length})` : ''}</Tabs.Tab>
          </Tabs.List>
        </Tabs>

        <Box px="md" pt="md">
          {error && <ErrorAlert message={error} mb="md" />}
          {pendingOffers.length > 0 && (
            <Alert color="blue" radius="sm" mb="md" title="Pending items moved to Today">
              <Group justify="space-between" align="center">
                <Text size="sm">{pendingOffers.length} offer{pendingOffers.length !== 1 ? 's' : ''} await action.</Text>
                <Button size="xs" variant="light" onClick={() => window.location.assign('/inbox')}>Open Inbox</Button>
              </Group>
            </Alert>
          )}

          {loading ? (
            <Center py="xl"><Loader color="credentis" /></Center>
          ) : tab === 'active' ? (
            <Stack gap="xl">
              {renderSection('Identity', grouped.Identity)}
              {renderSection('Payments', grouped.Payments)}
              {renderSection('Employment', grouped.Employment)}
              {renderSection('Education', grouped.Education)}
              {renderSection('Healthcare', grouped.Healthcare)}
              {renderSection('Government', grouped.Government)}
              {renderSection('Other', grouped.Other)}
            </Stack>
          ) : archived.length === 0 ? (
            <EmptyState icon={<IconWallet size={28} />} title="No archived credentials" />
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
        </Box>
      </Stack>

      <BottomSheet opened={!!selected} onClose={() => setSelected(null)} title={selected ? formatCredentialType(primaryType(selected.type)) : ''}>
        {selected && (
          <Stack gap="md" pb="lg">
            <Group gap="xs">
              {selected.revoked ? <StatusBadge status="expired" /> : <StatusBadge status={selected.archived ? 'archived' : 'valid'} />}
              {selected.parsedDocument?.expirationDate && !selected.revoked && (
                <Badge size="xs" color={new Date(selected.parsedDocument.expirationDate) < new Date() ? 'red' : 'gray'} variant="light">
                  {new Date(selected.parsedDocument.expirationDate) < new Date() ? 'Expired' : `Expires ${new Date(selected.parsedDocument.expirationDate).toLocaleDateString()}`}
                </Badge>
              )}
            </Group>
            <Text size="sm" c="dimmed">Issued by {formatIssuerName(typeof selected.parsedDocument?.issuer === 'string' ? selected.parsedDocument?.issuer : selected.issuerDid || '')}</Text>
            <Text size="sm" c="dimmed">Issued on {formatDate(selected.addedOn)}</Text>
            <Divider />
            <Group grow>
              <Button variant="light" color="green" size="sm" leftSection={<IconShare size={14} />} onClick={() => handleShare(selected)}>Share</Button>
              <Button
                variant="light"
                color={selected.archived ? 'blue' : 'gray'}
                size="sm"
                onClick={() => handleArchive(selected, !selected.archived)}
              >
                {selected.archived ? 'Restore' : 'Archive'}
              </Button>
            </Group>
            {!selected.revoked && (
              <Button
                variant="subtle"
                size="xs"
                color="orange"
                onClick={async () => {
                  try {
                    const token = getWalletToken();
                    const res = await api.get(`/api/wallet/credentials/${selected.id}/revocation-status`, {
                      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
                    });
                    const isRevoked = res.data?.revoked === true || res.data?.status === 'revoked';
                    if (isRevoked) {
                      notifications.show({ title: 'Credential Revoked', message: 'This credential has been revoked by the issuer.', color: 'red' });
                      setCredentials((prev) => prev.map((c) => c.id === selected.id ? { ...c, revoked: true } : c));
                      setSelected(null);
                    } else {
                      notifications.show({ title: 'Credential Valid', message: 'Live revocation check passed — this credential is active.', color: 'teal' });
                    }
                  } catch {
                    notifications.show({ title: 'Revocation Check', message: 'Could not reach issuer. Try again when online.', color: 'yellow' });
                  }
                }}
              >
                Check Revocation Status (Live)
              </Button>
            )}
          </Stack>
        )}
      </BottomSheet>
    </AppShellMobile>
  );
}
