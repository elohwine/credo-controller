import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import {
  Box, Stack, Text, Title, Center, ThemeIcon, Button, Alert, Loader,
  Paper, Group, Badge, Divider, TextInput, Switch
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconScan, IconCheck, IconX, IconAlertCircle, IconShieldCheck, IconQrcode, IconTruck, IconCamera
} from '@tabler/icons-react';
import AppShellMobile from '@/components/layout/AppShellMobile';
import ScanModeSheet, { ScanMode } from '@/components/scan/ScanModeSheet';
import QrScanner from '@/components/scan/QrScanner';
import EvidenceCapture, { EvidencePayload } from '@/components/scan/EvidenceCapture';
import api from '@/lib/api';
import { getOrgToken, getActiveOrgId } from '@/lib/auth';
import { getCachedOrgContextBundle, refreshOrgContextBundle, type OrgContextBundleCacheEntry } from '@/lib/offline/orgContextBundle';
import { evaluateScanModePolicy } from '@/lib/offline/scanPolicy';
import { getCachedVerifierBundle, refreshVerifierBundle, type VerifierBundleCacheEntry } from '@/lib/offline/verifierBundle';

type ScanState = 'idle' | 'scanning' | 'capture-evidence' | 'processing' | 'result' | 'verify-delivery-confirm';

interface ScanResult {
  success: boolean;
  title: string;
  detail: string;
  verificationLevel?: 'verified' | 'provisionally_valid' | 'invalid';
}

type ScannedPayloadKind = 'credential-offer' | 'presentation-request' | 'unknown';

interface WorkflowScanContext {
  workflowRunId?: string;
  workflowId?: string;
  providerRef?: string;
  sourceType?: string;
  requisitionId?: string;
  requestId?: string;
}

interface ParsedScanPayload {
  kind: ScannedPayloadKind;
  raw: string;
  offerUri?: string;
  presentationRequestUri?: string;
  workflowContext: WorkflowScanContext;
}

interface OfflineVerifierCheckSummary {
  statusListFresh?: boolean;
  statusListWithinGrace?: boolean;
}

interface OfflineVerifierResponse {
  verified: boolean;
  verificationLevel?: 'verified' | 'provisionally_valid' | 'invalid';
  reason?: string;
  checks?: OfflineVerifierCheckSummary;
}

function normalizeCredentialOfferUri(rawValue: string): string {
  const trimmed = rawValue.trim();

  const unwrapOfferWrapper = (candidate: string): string | null => {
    if (!candidate.startsWith('openid-credential-offer://') && !candidate.startsWith('openid-initiate-issuance://')) {
      return null;
    }

    try {
      const parsed = new URL(candidate);
      const offerParams = parsed.searchParams;
      const preferredKeys = ['credential_offer_uri', 'credential_offer_url', 'offerUri', 'offerUrl', 'request_uri', 'request'];

      for (const key of preferredKeys) {
        const value = offerParams.get(key);
        if (!value) continue;

        try {
          return decodeURIComponent(value);
        } catch {
          return value;
        }
      }
    } catch {
      // Fall through to the original value.
    }

    return candidate;
  };

  const unwrapped = unwrapOfferWrapper(trimmed);
  if (unwrapped) {
    return unwrapped;
  }

  if (trimmed.includes('credential_offer_uri=')) {
    try {
      const parsed = new URL(trimmed);
      const offerUri = parsed.searchParams.get('credential_offer_uri');
      if (offerUri) {
        return decodeURIComponent(offerUri);
      }
    } catch {
      const encoded = trimmed.split('credential_offer_uri=')[1];
      if (encoded) {
        try {
          return decodeURIComponent(encoded);
        } catch {
          return encoded;
        }
      }
    }
  }

  return trimmed;
}

function isLikelyCredentialOffer(rawValue: string): boolean {
  const trimmed = rawValue.trim();
  if (!trimmed) return false;

  return (
    trimmed.startsWith('openid-credential-offer://') ||
    trimmed.startsWith('openid-initiate-issuance://') ||
    trimmed.includes('credential_offer_uri=') ||
    trimmed.includes('credential_offer_url=')
  );
}

function isLikelyPresentationRequest(rawValue: string): boolean {
  const trimmed = rawValue.trim();
  if (!trimmed) return false;

  return (
    trimmed.startsWith('openid4vp://') ||
    trimmed.startsWith('openid-vc://') ||
    trimmed.includes('presentation_request_url') ||
    trimmed.includes('request_uri=')
  );
}

function safeDecodeUriComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function safeParseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function readFirstParam(params: URLSearchParams, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = params.get(key);
    if (value && value.trim().length > 0) {
      return safeDecodeUriComponent(value.trim());
    }
  }

  return undefined;
}

function extractWorkflowContext(rawValue: string): WorkflowScanContext {
  const context: WorkflowScanContext = {};
  const parsed = safeParseUrl(rawValue);
  if (!parsed) return context;

  const top = parsed.searchParams;
  const requestUriCandidate = readFirstParam(top, ['request_uri', 'presentation_request_url']);
  const nested = requestUriCandidate ? safeParseUrl(requestUriCandidate)?.searchParams : null;

  const pick = (keys: string[]): string | undefined => {
    const nestedValue = nested ? readFirstParam(nested, keys) : undefined;
    return nestedValue || readFirstParam(top, keys);
  };

  context.workflowRunId = pick(['workflowRunId', 'workflow_run_id', 'runId', 'workflow_run']);
  context.workflowId = pick(['workflowId', 'workflow_id']);
  context.providerRef = pick(['providerRef', 'provider_ref', 'sourceReference']);
  context.sourceType = pick(['sourceType', 'source_type']);
  context.requisitionId = pick(['requisitionId', 'requisition_id']);
  context.requestId = pick(['requestId', 'request_id', 'verification_session_id', 'state']);

  return context;
}

function parseScannedPayload(rawValue: string): ParsedScanPayload {
  const raw = rawValue.trim();
  const workflowContext = extractWorkflowContext(raw);

  if (isLikelyCredentialOffer(raw)) {
    return {
      kind: 'credential-offer',
      raw,
      offerUri: normalizeCredentialOfferUri(raw),
      workflowContext,
    };
  }

  if (isLikelyPresentationRequest(raw)) {
    return {
      kind: 'presentation-request',
      raw,
      presentationRequestUri: raw,
      workflowContext,
    };
  }

  return { kind: 'unknown', raw, workflowContext };
}

function formatStatusAge(issuedAt?: string): string {
  if (!issuedAt) return 'unknown age';

  const issuedAtMs = Date.parse(issuedAt);
  if (!Number.isFinite(issuedAtMs)) return 'unknown age';

  const elapsedMs = Date.now() - issuedAtMs;
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return 'unknown age';

  const minutes = Math.round(elapsedMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function describeOfflineLevel(level?: 'verified' | 'provisionally_valid' | 'invalid'): string {
  if (level === 'verified') return 'Verified';
  if (level === 'provisionally_valid') return 'Provisionally Valid';
  return 'Invalid';
}

function describeOfflineOutcome(response?: OfflineVerifierResponse): string {
  if (!response) return 'This credential could not be verified.';

  if (response.verificationLevel === 'provisionally_valid') {
    return 'Provisionally valid: status snapshot is stale but still within the configured offline grace window.';
  }

  if (response.verificationLevel === 'invalid' && response.checks?.statusListFresh === false && response.checks?.statusListWithinGrace === true) {
    return 'Rejected by strict policy: status snapshot is stale. Refresh verifier bundle for final verification.';
  }

  return response.reason || (response.verified ? 'Credential verified using offline verifier checks.' : 'This credential could not be verified.');
}

export default function ScanPage() {
  const router = useRouter();
  const [state, setState] = useState<ScanState>('idle');
  const [mode, setMode] = useState<ScanMode | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modeSheetOpen, setModeSheetOpen] = useState(false);
  const deeplinkHandledRef = useRef<string | null>(null);
  const [detectedPayloadKind, setDetectedPayloadKind] = useState<ScannedPayloadKind | null>(null);
  const [verifierBundle, setVerifierBundle] = useState<VerifierBundleCacheEntry | null>(null);
  const [orgContextBundle, setOrgContextBundle] = useState<OrgContextBundleCacheEntry | null>(null);
  const [verifierBundleLoading, setVerifierBundleLoading] = useState(false);
  const [verifierBundleError, setVerifierBundleError] = useState<string | null>(null);
  const [strictStatusFreshness, setStrictStatusFreshness] = useState(false);

  // Hydration-safe org-session flag: keep SSR/client initial render identical,
  // then derive localStorage-backed session state after mount.
  const [hasOrgSession, setHasOrgSession] = useState(false);

  useEffect(() => {
    setHasOrgSession(!!getOrgToken() && !!getActiveOrgId());
  }, []);

  useEffect(() => {
    if (!hasOrgSession) {
      setVerifierBundle(null);
      setOrgContextBundle(null);
      setVerifierBundleError(null);
      setVerifierBundleLoading(false);
      return;
    }

    const tenantId = getActiveOrgId();
    if (!tenantId) return;

    setVerifierBundleLoading(true);
    setVerifierBundle(getCachedVerifierBundle(tenantId));

    let cancelled = false;
    void refreshVerifierBundle(tenantId)
      .then((entry) => {
        if (cancelled) return;
        setVerifierBundle(entry || getCachedVerifierBundle(tenantId));
        setVerifierBundleError(entry ? null : 'Using cached verifier bundle.');
      })
      .catch((error: any) => {
        if (cancelled) return;
        setVerifierBundleError(error?.message || 'Unable to load verifier bundle.');
        setVerifierBundle(getCachedVerifierBundle(tenantId));
      })
      .finally(() => {
        if (!cancelled) {
          setVerifierBundleLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [hasOrgSession]);

  useEffect(() => {
    if (!hasOrgSession) {
      setOrgContextBundle(null);
      return;
    }

    const tenantId = getActiveOrgId();
    if (!tenantId) return;

    const cached = getCachedOrgContextBundle(tenantId);
    setOrgContextBundle(cached);

    let cancelled = false;
    void refreshOrgContextBundle(tenantId)
      .then((entry) => {
        if (cancelled) return;
        setOrgContextBundle(entry || getCachedOrgContextBundle(tenantId));
      })
      .catch(() => {
        if (cancelled) return;
        setOrgContextBundle(getCachedOrgContextBundle(tenantId));
      });

    return () => {
      cancelled = true;
    };
  }, [hasOrgSession]);

  useEffect(() => {
    if (!router.isReady) return;

    const requestedMode = router.query.mode;
    const nextMode = Array.isArray(requestedMode) ? requestedMode[0] : requestedMode;
    if (nextMode === 'approve-requisition' || nextMode === 'release-funds' || nextMode === 'acknowledge-requisition') {
      void handleModeSelect(nextMode as ScanMode);
      setModeSheetOpen(false);
      setResult(null);
      setError(null);
    }
  }, [router.isReady, router.query.mode]);

  useEffect(() => {
    if (!router.isReady) return;

    const scanValueParam = router.query.scanValue;
    const scanValue = Array.isArray(scanValueParam) ? scanValueParam[0] : scanValueParam;
    if (!scanValue || scanValue.trim().length === 0) return;
    if (deeplinkHandledRef.current === scanValue) return;

    deeplinkHandledRef.current = scanValue;
    setModeSheetOpen(false);
    setResult(null);
    setError(null);

    void handleQrResult(scanValue);
  }, [router.isReady, router.query.scanValue]);

  // Delivery state
  const [deliveryInfo, setDeliveryInfo] = useState<any>(null);
  const [deliveryPin, setDeliveryPin] = useState('');
  const [shortlinkCode, setShortlinkCode] = useState('');

  const resolveRunContextId = (): string | null => {
    const runIdValue = router.query.runId;
    const workflowRunIdValue = router.query.workflowRunId;
    const refValue = router.query.ref;

    const raw =
      (Array.isArray(runIdValue) ? runIdValue[0] : runIdValue)
      || (Array.isArray(workflowRunIdValue) ? workflowRunIdValue[0] : workflowRunIdValue)
      || (Array.isArray(refValue) ? refValue[0] : refValue);

    const normalized = typeof raw === 'string' ? raw.trim() : '';
    return normalized.length > 0 ? normalized : null;
  };

  const buildInFlowEvidenceRoute = (runRef: string): string => {
    const phaseValue = Array.isArray(router.query.phase) ? router.query.phase[0] : router.query.phase;
    const phase = typeof phaseValue === 'string' && phaseValue.trim().toLowerCase() === 'after' ? 'after' : 'before';
    return `/activity?ref=${encodeURIComponent(runRef)}&capture=1&phase=${encodeURIComponent(phase)}`;
  };

  const handleScanButton = () => {
    setResult(null); setError(null); setModeSheetOpen(true);
    setDetectedPayloadKind(null);
  };

  const ensureModeAllowedByOrgPolicy = async (selected: ScanMode): Promise<boolean> => {
    if (!hasOrgSession) return true;

    const tenantId = getActiveOrgId();
    const bundle = orgContextBundle || (tenantId ? await refreshOrgContextBundle(tenantId) : null);
    const decision = evaluateScanModePolicy(bundle, selected);

    if (!decision.allowed) {
      const escalationHint = decision.suggestedEscalationRole
        ? ` Escalate to ${decision.suggestedEscalationRole}.`
        : '';
      notifications.show({
        title: 'Policy Check Failed',
        message: `${decision.reason || 'Selected scan mode is not allowed by org policy.'}${escalationHint}`,
        color: 'red',
      });
      return false;
    }

    return true;
  };

  const handleModeSelect = async (selected: ScanMode) => {
    const allowed = await ensureModeAllowedByOrgPolicy(selected);
    if (!allowed) return;

    if (selected === 'capture-evidence') {
      const runRef = resolveRunContextId();
      if (runRef) {
        void router.push(buildInFlowEvidenceRoute(runRef));
        return;
      }
    }

    setMode(selected);
    setState(selected === 'capture-evidence' ? 'capture-evidence' : 'scanning');
  };

  const handleQrResult = async (value: string) => {
    setState('processing');
    setError(null);
    try {
      const parsedPayload = parseScannedPayload(value);
      const { workflowContext } = parsedPayload;
      setDetectedPayloadKind(parsedPayload.kind);

      // Always prioritize credential-offer intake so holder flows can accept offers in-app,
      // even when wrappers include request_uri-like query parameters.
      if (mode === 'save-credential' || parsedPayload.kind === 'credential-offer') {
        const offerUri = parsedPayload.offerUri || normalizeCredentialOfferUri(parsedPayload.raw);
        await api.post('/api/wallet/credentials/accept-offer', { offerUri });
        setResult({ success: true, title: 'Credential saved!', detail: 'Added to your wallet.' });
        setState('result');
        return;
      }

      // SSI VP request routing for approval and verification flows.
      if (parsedPayload.kind === 'presentation-request') {
        const requisitionId = Array.isArray(router.query.requisitionId) ? router.query.requisitionId[0] : router.query.requisitionId;
        const orgTenantId = Array.isArray(router.query.orgTenantId) ? router.query.orgTenantId[0] : router.query.orgTenantId;
        const params = new URLSearchParams({ request_uri: parsedPayload.presentationRequestUri || parsedPayload.raw });

        const effectiveRequisitionId = (typeof requisitionId === 'string' && requisitionId.length > 0)
          ? requisitionId
          : workflowContext.requisitionId;

        if (workflowContext.workflowRunId) params.set('workflowRunId', workflowContext.workflowRunId);
        if (workflowContext.workflowId) params.set('workflowId', workflowContext.workflowId);
        if (workflowContext.providerRef) params.set('providerRef', workflowContext.providerRef);
        if (workflowContext.sourceType) params.set('sourceType', workflowContext.sourceType);
        if (workflowContext.requestId) params.set('requestId', workflowContext.requestId);

        if (mode === 'approve-requisition' && effectiveRequisitionId) {
          params.set('mode', 'requisition-approve');
          params.set('requisitionId', effectiveRequisitionId);
          if (typeof orgTenantId === 'string' && orgTenantId.length > 0) {
            params.set('orgTenantId', orgTenantId);
          }
        } else if (mode === 'release-funds' && effectiveRequisitionId) {
          params.set('mode', 'requisition-release');
          params.set('requisitionId', effectiveRequisitionId);
          const amount = Array.isArray(router.query.amount) ? router.query.amount[0] : router.query.amount;
          const currency = Array.isArray(router.query.currency) ? router.query.currency[0] : router.query.currency;
          if (typeof amount === 'string' && amount.trim().length > 0) {
            params.set('amount', amount.trim());
          }
          if (typeof currency === 'string' && currency.trim().length > 0) {
            params.set('currency', currency.trim());
          }
          if (typeof orgTenantId === 'string' && orgTenantId.length > 0) {
            params.set('orgTenantId', orgTenantId);
          }
        } else if (mode === 'acknowledge-requisition' && effectiveRequisitionId) {
          params.set('mode', 'requisition-ack');
          params.set('requisitionId', effectiveRequisitionId);
          if (typeof orgTenantId === 'string' && orgTenantId.length > 0) {
            params.set('orgTenantId', orgTenantId);
          }
        } else if (workflowContext.workflowRunId || workflowContext.workflowId || workflowContext.providerRef) {
          params.set('mode', 'workflow-action');
        }

        router.push(`/present?${params.toString()}`);
        return;
      }

      if (mode === 'verify-presentation') {
        if (hasOrgSession && verifierBundle?.bundle?.verificationModes?.includes('offline-verifier')) {
          try {
            const offlineVerifyRes = await api.post('/offline/verifier/verify', {
              credential: value,
              requireFreshStatusList: strictStatusFreshness,
            });

            const offlineData = offlineVerifyRes.data as OfflineVerifierResponse;
            const level = offlineData?.verificationLevel || (offlineData?.verified ? 'verified' : 'invalid');
            const title = level === 'verified'
              ? 'Credential verified'
              : level === 'provisionally_valid'
                ? 'Credential provisionally valid'
                : 'Credential invalid';

            setResult({
              success: Boolean(offlineData?.verified),
              title,
              detail: describeOfflineOutcome(offlineData),
              verificationLevel: level,
            });
            setState('result');
            return;
          } catch {
            // Fallback to existing online verifier path when offline verifier endpoint fails.
          }
        }

        const res = await api.post('/oidc/verifier/verify', { requestId: 'stateless-scan', verifiablePresentation: value });
        const { verified, credentialCount } = res.data ?? {};
        setResult({
          success: verified,
          title: verified ? 'Presentation valid' : 'Presentation invalid',
          detail: verified
            ? `Verified ${credentialCount} credentials.${strictStatusFreshness ? ' Strict freshness policy applies to offline verification.' : ''}`
            : 'This credential could not be verified.',
          verificationLevel: verified ? 'verified' : 'invalid',
        });
        setState('result');
      } else if (mode === 'verify-delivery') {
        // Extract code from URL if full URL is scanned
        let code = value.trim();
        if (code.includes('/s/')) {
          code = code.split('/s/')[1].split('/')[0];
        }
        const res = await api.get(`/api/shortlinks/${code}`);
        setDeliveryInfo(res.data);
        setShortlinkCode(code);
        setState('verify-delivery-confirm');
      } else {
        setError('Unsupported scan payload for this action. Scan a credential offer QR or an OIDC presentation request link.');
        setState('idle');
      }
    } catch (err: any) {
      setError(err.response?.data?.message ?? err.message ?? 'Processing failed');
      setState('idle');
    }
  };

  const confirmDelivery = async () => {
    if (!deliveryPin) return;
    setState('processing');
    try {
      await api.post(`/v/${shortlinkCode}/confirm`, { pin: deliveryPin });
      setResult({ success: true, title: 'Delivery Confirmed', detail: 'The order delivery has been verified successfully.' });
      setDeliveryPin('');
      setState('result');
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Incorrect PIN or confirmation failed');
      setState('verify-delivery-confirm');
    }
  };

  const handleEvidenceCapture = async (payload: EvidencePayload) => {
    setState('processing');
    try {
      const response = await api.post('/api/workflows/evidence', payload);
      setResult({
        success: true,
        title: 'Evidence attached',
        detail: response.data?.providerRef
          ? `Evidence attached to workflow run (${response.data.providerRef}).`
          : 'Photo uploaded.',
      });
      setState('result');
    } catch (err: any) {
      setError(err.response?.data?.message ?? err.message ?? 'Upload failed');
      setState('idle');
    }
  };

  const reset = () => {
    setState('idle'); setMode(null); setResult(null); setError(null); setDetectedPayloadKind(null);
  };

  return (
    <AppShellMobile>
      <Stack gap="lg" px="md" pt="lg" pb="xl">
        <Box>
          <Title order={3}>
            {mode === 'approve-requisition'
              ? 'Scan To Approve'
              : mode === 'release-funds'
                ? 'Scan To Release Funds'
                : mode === 'acknowledge-requisition'
                  ? 'Scan To Acknowledge'
                  : 'Scan / Capture'}
          </Title>
          <Text size="sm" c="dimmed" mt={2}>
            {mode === 'approve-requisition'
              ? 'Scan the QR shown on the portal to prove authority and approve this requisition.'
              : mode === 'release-funds'
                ? 'Scan the QR shown on the portal to prove authority and release funds for this requisition.'
                : mode === 'acknowledge-requisition'
                  ? 'Scan the QR shown on the portal to prove authority and acknowledge this requisition.'
              : 'Save credentials, verify presentations, or capture field evidence.'}
          </Text>
        </Box>
        {hasOrgSession && (
          <Paper p="sm" radius="md" withBorder>
            <Group justify="space-between" align="flex-start" gap="xs" wrap="nowrap">
              <Box>
                <Text size="sm" fw={600}>Offline verifier bundle</Text>
                <Text size="xs" c="dimmed">
                  {verifierBundle?.snapshot
                    ? `v${verifierBundle.snapshot.version} · ${verifierBundle.bundle.statusList ? `status ${formatStatusAge(verifierBundle.bundle.statusList.issuedAt)}` : 'no status snapshot'}`
                    : 'Bundle not cached yet'}
                </Text>
              </Box>
              <Badge color={verifierBundle?.snapshot ? 'green' : 'gray'} variant="light" size="sm">
                {verifierBundleLoading ? 'Refreshing' : verifierBundle?.snapshot ? 'Cached' : 'Pending'}
              </Badge>
            </Group>
            {verifierBundleError && (
              <Text size="xs" c="dimmed" mt={4}>{verifierBundleError}</Text>
            )}
          </Paper>
        )}
        <Divider />

        {(state === 'idle' || state === 'result') && (
          <Stack gap="lg">
            {result && (
              <Paper p="lg" radius="md" style={{ borderLeft: `4px solid ${result.success ? '#16a34a' : '#dc2626'}`, background: result.success ? '#f0fdf4' : '#fef2f2' }}>
                <Group gap="sm" mb="xs">
                  <ThemeIcon color={result.success ? 'green' : 'red'} size={28} radius="xl">
                    {result.success ? <IconCheck size={16} /> : <IconX size={16} />}
                  </ThemeIcon>
                  <Text fw={700}>{result.title}</Text>
                </Group>
                {detectedPayloadKind && detectedPayloadKind !== 'unknown' && (
                  <Group mb="xs">
                    <Badge color="blue" variant="light" size="sm">
                      Detected: {detectedPayloadKind === 'credential-offer' ? 'Credential Offer' : 'Presentation Request'}
                    </Badge>
                  </Group>
                )}
                {result.verificationLevel && (
                  <Group mb="xs">
                    <Badge
                      color={result.verificationLevel === 'verified' ? 'green' : result.verificationLevel === 'provisionally_valid' ? 'yellow' : 'red'}
                      variant="light"
                      size="sm"
                    >
                      {describeOfflineLevel(result.verificationLevel)}
                    </Badge>
                  </Group>
                )}
                <Text size="sm" c="dimmed">{result.detail}</Text>
              </Paper>
            )}

            {error && <Alert icon={<IconAlertCircle size={16} />} color="red" radius="sm">{error}</Alert>}

            <Center py="xl">
              <Stack align="center" gap="lg">
                <Box onClick={handleScanButton} style={{ width: 120, height: 120, borderRadius: '50%', background: '#2188ca', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 8px 24px rgba(33,136,202,0.35)' }}>
                  <IconScan size={52} color="#ffffff" />
                </Box>
                <Text fw={600} size="lg">Tap to Scan</Text>
                <Text size="sm" c="dimmed" ta="center">
                  {mode === 'approve-requisition'
                    ? 'Point your camera at the portal approval QR'
                    : mode === 'release-funds'
                      ? 'Point your camera at the portal release QR'
                      : mode === 'acknowledge-requisition'
                        ? 'Point your camera at the portal acknowledge QR'
                    : 'Select an action to launch the camera'}
                </Text>
              </Stack>
            </Center>

            <Stack gap="xs">
              <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Quick actions</Text>
              {/* Org-only scan modes — hidden in holder-only sessions (matrix §20.3) */}
              {hasOrgSession && (
                <>
                  <Button variant="light" color="indigo" leftSection={<IconShieldCheck size={16} />} fullWidth radius="md" onClick={() => void handleModeSelect('approve-requisition')}>
                    Scan To Approve
                  </Button>
                  <Button variant="light" color="violet" leftSection={<IconTruck size={16} />} fullWidth radius="md" onClick={() => void handleModeSelect('verify-delivery')}>
                    Verify Delivery
                  </Button>
                  <Button variant="light" color="green" leftSection={<IconShieldCheck size={16} />} fullWidth radius="md" onClick={() => void handleModeSelect('verify-presentation')}>
                    Verify Presentation
                  </Button>
                  <Button
                    variant="light"
                    color="orange"
                    leftSection={<IconCamera size={16} />}
                    fullWidth
                    radius="md"
                    onClick={() => void handleModeSelect('capture-evidence')}
                  >
                    Capture Evidence
                  </Button>
                </>
              )}
              {/* Save Credential is always available — holder domain action */}
              <Button variant="light" color="credentis" leftSection={<IconQrcode size={16} />} fullWidth radius="md" onClick={() => { setMode('save-credential'); setState('scanning'); }}>
                Save Credential
              </Button>
            </Stack>
          </Stack>
        )}

        {state === 'scanning' && (
          <Paper p={0} radius="lg" style={{ overflow: 'hidden' }}>
            <Box px="md" pt="md" pb="sm"><Badge color="blue" size="sm">{mode}</Badge></Box>
            {hasOrgSession && mode === 'verify-presentation' && (
              <Box px="md" pb="sm">
                <Paper p="sm" radius="md" withBorder>
                  <Group justify="space-between" align="center" wrap="nowrap">
                    <Box>
                      <Text size="sm" fw={600}>Strict Status Freshness</Text>
                      <Text size="xs" c="dimmed">Reject stale status snapshots even within grace.</Text>
                    </Box>
                    <Switch
                      checked={strictStatusFreshness}
                      onChange={(event) => setStrictStatusFreshness(event.currentTarget.checked)}
                      size="md"
                      onLabel="ON"
                      offLabel="OFF"
                    />
                  </Group>
                </Paper>
              </Box>
            )}
            <QrScanner onResult={handleQrResult} onCancel={reset} hint="Point camera at QR code" />

            {/* Fallback for delivery code entry */}
            {mode === 'verify-delivery' && (
              <Box p="md">
                <Divider label="OR ENTER CODE" labelPosition="center" mb="sm" />
                <Group>
                  <TextInput
                    placeholder="e.g. AB12CD34" style={{ flex: 1 }}
                    value={shortlinkCode} onChange={e => setShortlinkCode(e.currentTarget.value)}
                  />
                  <Button onClick={() => handleQrResult(shortlinkCode)} disabled={!shortlinkCode.trim()}>Look up</Button>
                </Group>
              </Box>
            )}
          </Paper>
        )}

        {state === 'verify-delivery-confirm' && deliveryInfo && (
          <Paper p="md" radius="md" withBorder>
            <Stack gap="md">
              <Group justify="space-between">
                <Text fw={600} size="lg">Order Delivery</Text>
                <Badge color="violet">{shortlinkCode}</Badge>
              </Group>
              <Box>
                {deliveryInfo.metadata?.items && (
                  <Text size="sm" mb="xs"><strong>Items:</strong> {deliveryInfo.metadata.items}</Text>
                )}
                {deliveryInfo.targetResource?.amount && (
                  <Text size="sm" mb="xs"><strong>Amount:</strong> {deliveryInfo.targetResource.currency} {deliveryInfo.targetResource.amount}</Text>
                )}
                <Text size="sm" c="dimmed">Ask the buyer for their verification PIN to confirm delivery.</Text>
              </Box>

              {error && <Alert icon={<IconAlertCircle size={16} />} color="red" radius="sm">{error}</Alert>}

              <TextInput
                label="Delivery PIN"
                placeholder="4-digit PIN"
                maxLength={4}
                value={deliveryPin}
                onChange={e => setDeliveryPin(e.currentTarget.value.replace(/\D/g, ''))}
                type="number"
                size="lg"
                style={{ textAlign: 'center' }}
              />
              <Group grow mt="sm">
                <Button variant="light" color="gray" onClick={reset}>Cancel</Button>
                <Button color="violet" onClick={confirmDelivery} disabled={deliveryPin.length < 4}>Confirm</Button>
              </Group>
            </Stack>
          </Paper>
        )}

        {state === 'capture-evidence' && (
          <Paper radius="lg" style={{ overflow: 'hidden' }}>
            <EvidenceCapture onCapture={handleEvidenceCapture} onCancel={reset} workflowLabel="Current workflow" />
          </Paper>
        )}

        {state === 'processing' && (
          <Center py="xl">
            <Stack align="center" gap="md"><Loader size="lg" color="credentis" /><Text c="dimmed">Processing…</Text></Stack>
          </Center>
        )}
      </Stack>
      <ScanModeSheet opened={modeSheetOpen} onClose={() => setModeSheetOpen(false)} onSelect={handleModeSelect} hasOrgSession={hasOrgSession} />

    </AppShellMobile>
  );
}
