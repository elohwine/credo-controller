import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import {
    Box, Stack, Text, Title, Center, ThemeIcon, Button, Alert, Loader,
    Paper, Group, Badge, Checkbox
} from '@mantine/core';
import { IconShieldCheck, IconCheck, IconAlertCircle } from '@tabler/icons-react';
import { StepHelp } from '@/components/help/StepHelp';
import AppShellMobile from '@/components/layout/AppShellMobile';
import ErrorAlert from '@/components/shared/ErrorAlert';
import api from '@/lib/api';
import { openOrganizationForTask, taskRefs, type OrgTaskPurpose } from '@/lib/orgTaskAccess';
import {
    decodeJwtPayload,
    getOrgToken,
    getTaskPass,
    getActiveOrgId,
    getWalletToken,
    getPersonalWalletTenantId,
    getPersonalWalletToken,
    getPreferredToken,
    getContextMode,
    endTaskContext,
} from '@/lib/auth';
import { plainStep } from '@/lib/format';
import { formatTxnTime } from '@/lib/inboxAttention';
import { sharePurposeLine } from '@/lib/uxCopy';
import { removeRunningProofResume } from '@/lib/runningActions';
import { requireSensitiveOrgReauth } from '@/lib/offline/localReauth';
import { confirmWithDevice } from '@/lib/deviceTrust';
import { evaluateOrgActionPolicy, getCachedOrgContextBundle, refreshOrgContextBundle } from '@/lib/offline/orgContextBundle';

function formatType(type: unknown): string {
    if (Array.isArray(type)) {
        const t = type.find(l => l !== 'VerifiableCredential') || type[type.length - 1] || '';
        return t.replace(/VC$/, '').replace(/Credential$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
    }
    if (typeof type === 'string') {
        return type.replace(/VC$/, '').replace(/Credential$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
    }
    return 'Credential';
}

function getOpenId4VpParams(requestUrl: string): URLSearchParams | null {
    try {
        const queryIndex = requestUrl.indexOf('?');
        if (queryIndex === -1) return null;
        const query = requestUrl.slice(queryIndex + 1);
        return new URLSearchParams(query);
    } catch {
        return null;
    }
}

function parsePresentationRequestId(requestUrl: string): string | null {
    try {
        const params = getOpenId4VpParams(requestUrl);
        if (!params) return null;

        const explicitVerificationSessionId = params.get('verification_session_id');
        if (explicitVerificationSessionId) return explicitVerificationSessionId;

        // Prefer explicit request_uri path segment:
        // .../authorization-requests/<requestId>
        const requestUri = params.get('request_uri');
        if (requestUri) {
            try {
                const parsedRequestUri = new URL(requestUri);
                const parts = parsedRequestUri.pathname.split('/').filter(Boolean);
                const lastPart = parts[parts.length - 1];
                if (lastPart) return lastPart;
            } catch {
                const match = requestUri.match(/authorization-requests\/([^/?#]+)/i);
                if (match?.[1]) return match[1];
            }
        }

        // Fallback for older links that only expose state.
        return params.get('state');
    } catch {
        return null;
    }
}

function parseProviderRef(requestUrl: string): string | null {
    try {
        const params = getOpenId4VpParams(requestUrl);
        return params?.get('provider_ref') ?? null;
    } catch {
        return null;
    }
}

function parseVerifierTenantId(requestUrl: string): string | null {
    try {
        const params = getOpenId4VpParams(requestUrl);
        return params?.get('verifier_tenant_id') ?? null;
    } catch {
        return null;
    }
}

function queryValue(value: string | string[] | undefined): string | undefined {
    if (!value) return undefined;
    if (Array.isArray(value)) return value[0];
    return value;
}

function normalizePresentationMode(mode?: string): string | undefined {
    if (!mode) return mode;
    if (mode === 'approve-requisition') return 'requisition-approve';
    if (mode === 'release-funds') return 'requisition-release';
    if (mode === 'acknowledge-requisition') return 'requisition-ack';
    return mode;
}

/**
 * Modes that finish a step on the server after the share. Every one of them can be resumed when
 * the proof was already shared (the server replays the first result on the same request id).
 * Add a new workflow's mode here and it gets the same resume and idempotency behaviour.
 */
const FINISHING_MODES = new Set<string | undefined>([
    'requisition-approve',
    'requisition-release',
    'requisition-ack',
    'field-signoff',
    'field-payout',
    'ap-workflow-transition',
    'ar-collection-consent',
    'request-staff-card',
    // Any step a workflow waits at, named by the step itself (approve_shipment, release_funds, …).
    'workflow-step',
]);

/** Plain words for a step a workflow named itself, for example `approve_shipment`. */
function stageWords(stage?: string): string {
    return String(stage || '').replace(/_/g, ' ').trim();
}

function consentLabelForMode(mode?: string, stage?: string): string {
    const normalizedMode = normalizePresentationMode(mode);

    if (mode === 'workflow-step') {
        const words = stageWords(stage);
        return words
            ? `I agree to share my staff card to ${words}`
            : 'I agree to share my staff card for this step';
    }

    if (mode === 'ar-collection-consent') {
        return 'I agree to share the selected details for this collection step'
    }

    if (mode === 'request-staff-card') {
        return 'I agree to share my staff card for this purchase step'
    }

    if (mode === 'ap-workflow-transition') {
        return 'I agree to share the selected details for this supplier-bill step'
    }

    if (mode === 'field-payout') {
        return 'I agree to share the selected details to release payment for this job'
    }

    if (mode === 'field-signoff') {
        return 'I agree to share the selected details to sign off this job'
    }

    if (normalizedMode === 'requisition-release') {
        return 'I agree to share the selected details to release the money'
    }

    if (normalizedMode === 'requisition-ack') {
        return 'I agree to share the selected details to confirm delivery'
    }

    return normalizedMode === 'requisition-approve'
        ? 'I agree to share the selected details to approve this request'
        : 'I agree to share the selected details for this request'
}

async function ensureRequisitionApprovalAllowed(requisitionId: string): Promise<void> {
    const tenantId = getActiveOrgId();
    const bundle = (tenantId ? getCachedOrgContextBundle(tenantId) : null) || (tenantId ? await refreshOrgContextBundle(tenantId) : null);
    const decision = evaluateOrgActionPolicy(bundle, {
        actionType: 'workflow.approve_requisition',
        // Approval is VP-backed in this flow.
        evidenceProvided: true,
        actionTimestamp: new Date().toISOString(),
    });

    if (!decision.allowed) {
        const escalationHint = decision.suggestedEscalationRole
            ? ` Escalate to ${decision.suggestedEscalationRole}.`
            : '';
        throw new Error(`${decision.reason || 'Approval blocked by org policy.'}${escalationHint}`);
    }
}

function parseRedirectUri(redirectUri: string): {
    vpToken?: string;
    idToken?: string;
    presentationSubmission?: any;
    state?: string;
} {
    try {
        const hash = redirectUri.split('#')[1] || '';
        const params = new URLSearchParams(hash);
        const presentationSubmission = params.get('presentation_submission');

        return {
            vpToken: params.get('vp_token') ?? undefined,
            idToken: params.get('id_token') ?? undefined,
            state: params.get('state') ?? undefined,
            presentationSubmission: presentationSubmission ? JSON.parse(presentationSubmission) : undefined,
        };
    } catch {
        return {};
    }
}

function decodeSignedRecord(token: string): any | null {
    const parts = String(token || '').split('.');
    if (parts.length < 2) return null;
    try {
        const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const json = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), '='));
        return JSON.parse(json);
    } catch {
        return null;
    }
}

/** The record as a plain object, whether it arrived as JSON or as a signed token. */
function credentialDocument(match: any): any | null {
    const raw = match?.document ?? match?.disclosures ?? null;
    if (raw == null || raw === '') {
        if (typeof match?.parsedDocument === 'string' && match.parsedDocument.trim().startsWith('{')) {
            try { return JSON.parse(match.parsedDocument); } catch { return null; }
        }
        return null;
    }
    if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (trimmed.startsWith('{')) {
            try { return JSON.parse(trimmed); } catch { return null; }
        }
        const payload = decodeSignedRecord(trimmed);
        return payload?.vc || payload || null;
    }
    if (typeof raw === 'object') {
        if (typeof raw.compact === 'string') return credentialDocument({ document: raw.compact });
        if (typeof raw.jwt === 'string') return credentialDocument({ document: raw.jwt });
        return raw.vc || raw;
    }
    return null;
}

function issuerLabel(issuer: unknown): string {
    if (!issuer) return 'Your organization';
    if (typeof issuer === 'string') {
        return issuer.startsWith('did:') ? 'Your organization' : issuer;
    }
    if (typeof issuer === 'object') {
        const named = (issuer as any).name || (issuer as any).id;
        if (typeof named === 'string' && named && !named.startsWith('did:')) return named;
    }
    return 'Your organization';
}

function parseCredentialSummary(match: any): { type: unknown; issuer: string } {
    if (match?.type) return { type: match.type, issuer: 'Your organization' };
    const document = credentialDocument(match);
    if (!document) return { type: 'Record', issuer: 'Your organization' };
    return {
        type: document.type || 'Record',
        issuer: issuerLabel(document.issuer || document.issuerDid),
    };
}

async function confirmRequisitionStatus(
    requisitionId: string,
    expectedStatus: string,
    token: string,
): Promise<void> {
    const detailRes = await api.get(
        `/api/finance/requisitions/${encodeURIComponent(requisitionId)}`,
        { headers: { Authorization: `Bearer ${token}` } },
    );

    const actualStatus = String(detailRes.data?.summary?.status || '').toUpperCase();
    if (actualStatus !== expectedStatus.toUpperCase()) {
        throw new Error(
            `Verification succeeded but requisition status is ${actualStatus || 'UNKNOWN'} (expected ${expectedStatus}).`,
        );
    }
}

function claimLabel(key: string): string {
    const named: Record<string, string> = {
        orgName: 'Organisation',
        merchantName: 'Shop',
        schoolName: 'School',
        memberRole: 'Role',
        role: 'Role',
        employmentStatus: 'Status',
        stageActions: 'Steps you confirm',
        source: 'How it was issued',
        issuedAt: 'Issued',
        department: 'Department',
    };
    return named[key] || key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (char) => char.toUpperCase());
}

function prettyClaimValue(key: string, value: string): string {
    if (key === 'stageActions') {
        return value.split(',').map((step) => plainStep(step)).filter(Boolean).join(', ');
    }
    if ((key === 'role' || key === 'memberRole') && value.includes('_')) return value.replace(/_/g, ' ');
    if (key === 'issuedAt' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
        const when = new Date(value);
        if (!Number.isNaN(when.getTime())) return formatTxnTime(value);
    }
    return value;
}

/**
 * The wallet server decides the split: `claims` are the details this request asked for and the
 * record will reveal; `withheld` are the details that stay on the phone (a selective-disclosure
 * card). A whole card (older record, or a request that cannot name claims) has nothing withheld.
 */
function splitShareClaims(match: any): { shared: Array<{ label: string; value: string }>; withheld: Array<{ label: string; value: string }>; basisLine?: string; wholeCard: boolean } {
    const serverRows = (rows: unknown): Array<{ label: string; value: string }> | null =>
        Array.isArray(rows)
            ? rows
                .filter((row: any) => row && typeof row.label === 'string' && typeof row.value === 'string' && row.value.trim())
                .map((row: any) => ({ label: row.label, value: row.value }))
            : null;
    const sharedRows = serverRows(match?.sharedRows);
    if (sharedRows) {
        const withheldRows = serverRows(match?.withheldRows) || [];
        return {
            shared: sharedRows,
            withheld: withheldRows,
            basisLine: typeof match?.basisLine === 'string' && match.basisLine.trim() ? match.basisLine : undefined,
            wholeCard: match?.basis === 'whole_card' || match?.selective === false,
        };
    }
    const toRows = (source: unknown, fallback: Array<[string, string]>, held = false): Array<{ label: string; value: string }> => {
        const entries: Array<[string, unknown]> = source && typeof source === 'object' && !Array.isArray(source)
            ? Object.entries(source as Record<string, unknown>)
            : fallback;
        const rows: Array<{ label: string; value: string }> = [];
        const seen = new Set<string>();
        for (const [key, raw] of entries) {
            if (raw == null || /id$/i.test(String(key)) || /^(fingerprint|offerId|did)$/i.test(String(key))) continue;
            const value = prettyClaimValue(String(key), String(raw)).trim();
            if (!value || value.startsWith('did:')) continue;
            const label = String(key) === 'stageActions'
                ? (held ? 'Other steps on your card' : !value.includes(',') ? 'This step' : claimLabel(String(key)))
                : claimLabel(String(key));
            const stamp = `${label}:${value}`;
            if (seen.has(stamp)) continue;
            seen.add(stamp);
            rows.push({ label, value });
        }
        return rows;
    };
    const shared = toRows(match?.claims, extractCredentialClaims(match).map((row) => [row.label, row.value] as [string, string]));
    const withheld = toRows(match?.withheld, [], true);
    return { shared, withheld, wholeCard: match?.selective === false || withheld.length === 0 };
}

function extractCredentialClaims(match: any): Array<{ label: string; value: string }> {
    if (match?.claims && typeof match.claims === 'object' && !Array.isArray(match.claims)) {
        const rows = Object.entries(match.claims)
            .filter(([key, value]) => !/^(workflowType|assignmentMode|requestType|stageAction|templateId)$/i.test(String(key)) && value != null && String(value).trim() !== '' && !String(value).startsWith('did:'))
            .slice(0, 6)
            .map(([key, value]) => ({ label: claimLabel(key), value: String(value) }));
        if (rows.length > 0) return rows;
    }
    const document = credentialDocument(match);
    if (!document) return [];

    const subject = document.credentialSubject || document.vc?.credentialSubject;
    if (!subject || typeof subject !== 'object') return [];
    const nested = subject.claims && typeof subject.claims === 'object' ? subject.claims : {};
    const flat = { ...subject, ...nested };

    return Object.entries(flat)
        .filter(([key, value]) => key !== 'id' && key !== 'claims' && !/id$/i.test(key) && !/^(workflowType|assignmentMode|requestType|stageAction|templateId)$/i.test(key) && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') && String(value).trim() !== '')
        .filter(([, value]) => !String(value).startsWith('did:'))
        .slice(0, 6)
        .map(([key, value]) => ({ label: claimLabel(key), value: String(value) }));
}

function resolveCredentialId(match: any): string | undefined {
    if (!match) return undefined;

    // Always prefer the stable record UUID so the backend can look up the full
    // W3cCredentialRecord / SdJwtVcRecord and pass it to Credo as required.
    if (typeof match.id === 'string' && match.id.length > 0) {
        return match.id;
    }

    if (typeof match.submissionCredential === 'string' && match.submissionCredential.length > 0) {
        return match.submissionCredential;
    }

    if (Array.isArray(match.credentials)) {
        const cred = match.credentials.find((c: any) => typeof c?.id === 'string' && c.id.length > 0);
        if (cred?.id) return cred.id;
    }

    if (typeof match.credentialRecord?.id === 'string' && match.credentialRecord.id.length > 0) {
        return match.credentialRecord.id;
    }

    if (typeof match.credential?.id === 'string' && match.credential.id.length > 0) {
        return match.credential.id;
    }

    return undefined;
}

/** The organisation asking for the details: named in the link, else the verifier's web address. */
function requesterName(orgName: string | undefined, requestUrl: string): string {
    if (orgName && orgName.trim()) return orgName.trim();
    try {
        const params = new URL(requestUrl.replace(/^(openid4vp|openid-vc|openid):\/\//, 'https://x/')).searchParams;
        const target = params.get('client_id') || params.get('response_uri') || params.get('request_uri') || '';
        const host = target.startsWith('http') ? new URL(target).hostname : '';
        return host.replace(/^www\./, '');
    } catch {
        return '';
    }
}

export default function PresentPage() {
    const router = useRouter();
    const [initStage, setInitStage] = useState<'loading' | 'ready' | 'error'>('loading');
    const [submitStage, setSubmitStage] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
    const [errorText, setErrorText] = useState<string | null>(null);

    const [matches, setMatches] = useState<any[]>([]);
    const [selectedCredentials, setSelectedCredentials] = useState<string[]>([]);
    const [consentChecked, setConsentChecked] = useState(false);
    const [presentationRequestUrl, setPresentationRequestUrl] = useState<string>('');
    const [walletId, setWalletId] = useState<string>('');
    const [embeddedFallbackLoading, setEmbeddedFallbackLoading] = useState(false);
    const currentMode = queryValue(router.query.mode);

    const ensureOrgContextForRequisitionFlow = useCallback(async (targetOrgTenantId?: string) => {
        const normalizedOrgId = typeof targetOrgTenantId === 'string' ? targetOrgTenantId.trim() : '';
        if (!normalizedOrgId) return;

        // The item this proof is for: a member opens it with a task pass bound to it.
        const mode = normalizePresentationMode(queryValue(router.query.mode));
        const purpose: OrgTaskPurpose = mode === 'request-staff-card'
            ? 'request'
            : mode?.startsWith('requisition-')
                ? 'requisition'
                : mode?.startsWith('field-')
                    ? 'job'
                    : 'collection';
        const refs = purpose === 'request'
            ? [queryValue(router.query.platformRequestId)]
            : purpose === 'requisition'
                ? [queryValue(router.query.requisitionId)]
                : purpose === 'job'
                    ? [queryValue(router.query.workflowRunId)]
                    : [queryValue(router.query.transactionId)];

        const currentOrgId = (getActiveOrgId() || '').trim();
        const existingOrgToken = getOrgToken();
        const existingOrgPayload = existingOrgToken ? decodeJwtPayload(existingOrgToken) : null;
        const existingOrgTokenTenantId = (existingOrgPayload?.tenantId || existingOrgPayload?.orgTenantId || existingOrgPayload?.sub || '').trim();
        const pass = getTaskPass();
        const passCoversItem = !pass || taskRefs(...refs).some((ref) => pass.refs.includes(ref));

        if (currentOrgId === normalizedOrgId && existingOrgToken && passCoversItem && (!existingOrgTokenTenantId || existingOrgTokenTenantId === normalizedOrgId)) {
            return;
        }

        await openOrganizationForTask({ orgId: normalizedOrgId, purpose, refs });
    }, [router.query.mode, router.query.requisitionId, router.query.platformRequestId, router.query.workflowRunId, router.query.transactionId]);

    const initializeRequest = useCallback(async () => {
        if (!router.isReady) return;

        // Support multiple standards for passing the presentation request
        const reqUriRaw = router.query.request_uri || router.query.request;
        const reqUrlStr = Array.isArray(reqUriRaw) ? reqUriRaw[0] : reqUriRaw as string;

        if (!reqUrlStr) {
            setErrorText('No presentation request provided in the link.');
            setInitStage('error');
            return;
        }

        setPresentationRequestUrl(reqUrlStr);

        try {
            const mode = normalizePresentationMode(queryValue(router.query.mode));
            const queryOrgTenantId = queryValue(router.query.orgTenantId);
            const personalTenantId = getPersonalWalletTenantId();
            const shouldSwitchOrgContext =
                mode === 'requisition-approve'
                || mode === 'requisition-release'
                || mode === 'requisition-ack'
                || mode === 'field-signoff'
                || mode === 'field-payout'
                || mode === 'workflow-step'
                || mode === 'request-staff-card'
                || (mode === 'ar-collection-consent' && !!queryOrgTenantId && queryOrgTenantId !== personalTenantId);

            if (shouldSwitchOrgContext && queryOrgTenantId) {
                await ensureOrgContextForRequisitionFlow(queryOrgTenantId);
            }

            // Presentation matching/submission must always run against the holder wallet,
            // even when the UI is currently in org context.
            const walletToken = getPersonalWalletToken();
            if (!walletToken) throw new Error('Personal wallet session is required. Please log in to your wallet first.');

            const walletTenantId = getPersonalWalletTenantId();
            const payload = decodeJwtPayload(walletToken);
            if (!payload && !walletTenantId) throw new Error('Invalid personal wallet token');
            const wId = walletTenantId ?? payload?.tenantId ?? payload?.walletId ?? payload?.sub;
            if (!wId) throw new Error('Could not determine wallet ID');

            setWalletId(wId);

            // Fetch Matching Credentials
            // The request belongs to one organisation; only that organisation's records are offered.
            const shareStage = queryValue(router.query.stage) || queryValue(router.query.mode);
            // The job id lets the server accept the card of the person this job names for the step.
            const shareRunId = queryValue(router.query.workflowRunId);
            const res = await api.post(`/api/wallet/${wId}/exchange/matchCredentialsForPresentationDefinition`, {
                presentationRequest: reqUrlStr,
                ...(queryOrgTenantId && { orgTenantId: queryOrgTenantId }),
                ...(shareStage && { stage: shareStage }),
                ...(shareRunId && { workflowRunId: shareRunId }),
            }, { headers: { Authorization: `Bearer ${walletToken}` } });

            const matchedCredentials = Array.isArray(res.data) ? res.data : [];
            const missingDetails = matchedCredentials.some((match: any) => !match?.claims || Object.keys(match.claims).length === 0);
            if (missingDetails && matchedCredentials.length > 0) {
                try {
                    const listRes = await api.get(`/api/wallet/${wId}/credentials`, {
                        headers: { Authorization: `Bearer ${walletToken}` },
                    });
                    const rows = Array.isArray(listRes.data) ? listRes.data : [];
                    const byId = new Map(rows.map((row: any) => [String(row.id), row]));
                    for (const match of matchedCredentials) {
                        // A record the server already split (shared vs not shared) keeps that split.
                        if ((match?.claims && Object.keys(match.claims).length > 0) || match?.withheld) continue;
                        const row = byId.get(String(match.id));
                        if (!row) continue;
                        if (!match.type && row.type) match.type = row.type;
                        const subject = row.parsedDocument?.credentialSubject || {};
                        const nested = subject.claims && typeof subject.claims === 'object' ? subject.claims : {};
                        const claims: Record<string, string> = {};
                        for (const [key, value] of Object.entries({ ...subject, ...nested })) {
                            // Internal references (ids, tenant keys) mean nothing to the person reviewing; keep readable facts.
                            if (key === 'claims' || /id$/i.test(key) || /^(workflowType|assignmentMode|requestType|stageAction|templateId)$/i.test(key) || value == null) continue;
                            if (Array.isArray(value)) {
                                const joined = value.map((item) => String(item).trim()).filter(Boolean).join(', ');
                                if (joined) claims[key] = joined;
                                continue;
                            }
                            if (typeof value === 'object') continue;
                            const text = String(value).trim();
                            if (!text || text.startsWith('did:')) continue;
                            claims[key] = text;
                        }
                        if (Object.keys(claims).length > 0) match.claims = claims;
                    }
                } catch {
                    // The review still lists the records if the extra details cannot be loaded.
                }
            }
            setMatches(matchedCredentials);
            const initialSelection = matchedCredentials
                .map((match: any) => resolveCredentialId(match))
                .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0);
            setSelectedCredentials(initialSelection);
            setConsentChecked(false);
            setInitStage('ready');

        } catch (err: any) {
            console.error(err);
            setErrorText(err.response?.data?.message ?? err.message ?? 'Failed to load presentation requirements.');
            setInitStage('error');
        }
    }, [ensureOrgContextForRequisitionFlow, router.isReady, router.query]);

    useEffect(() => {
        initializeRequest();
    }, [initializeRequest]);

    const handleSubmit = async () => {
        setSubmitStage('processing');
        try {
            if (matches.length === 0) {
                throw new Error('No matching credentials found in your wallet to fulfill this request.');
            }

            const fallbackCredentials = matches
                .map((match) => resolveCredentialId(match))
                .filter((id): id is string => typeof id === 'string' && id.length > 0);

            const credentialsToSubmit = selectedCredentials.length > 0 ? selectedCredentials : fallbackCredentials;

            if (credentialsToSubmit.length === 0) {
                throw new Error('Could not resolve selected credentials from matches.');
            }

            if (!consentChecked) {
                throw new Error('Please confirm consent before sharing proof.');
            }

            const walletToken = getPersonalWalletToken();
            if (!walletToken) {
                throw new Error('Personal wallet session is required to share proof.');
            }

            const shareOrgTenantId = queryValue(router.query.orgTenantId);
            const shareStage = queryValue(router.query.stage) || queryValue(router.query.mode);
            const shareRunId = queryValue(router.query.workflowRunId);
            let submissionData: any;
            try {
                const submissionRes = await api.post(`/api/wallet/${walletId}/exchange/usePresentationRequest`, {
                    presentationRequest: presentationRequestUrl,
                    selectedCredentials: credentialsToSubmit,
                    ...(shareOrgTenantId && { orgTenantId: shareOrgTenantId }),
                    ...(shareStage && { stage: shareStage }),
                    ...(shareRunId && { workflowRunId: shareRunId }),
                }, { headers: { Authorization: `Bearer ${walletToken}` } });
                submissionData = submissionRes.data;
            } catch (shareErr: any) {
                // Resume after a failed finish, on any step: the proof was already shared on this
                // request, so go straight to finishing it. Every finish call is idempotent on the
                // request id, so a repeat returns the first result.
                const shareMessage = String(shareErr?.response?.data?.message ?? shareErr?.message ?? '');
                const resumable = FINISHING_MODES.has(normalizePresentationMode(queryValue(router.query.mode)))
                    && /invalid session|already (used|verified|submitted|completed)/i.test(shareMessage);
                if (!resumable) throw shareErr;
                submissionData = { directPost: true, resumedAfterShare: true };
            }

            const directPost = Boolean(submissionData?.directPost);
            const redirectUri = submissionData?.redirectUri;
            if (!directPost && !redirectUri) {
                throw new Error('Wallet did not return a verifier submission payload.');
            }

            const parsed = directPost
                ? { vpToken: undefined, idToken: undefined, presentationSubmission: undefined, state: undefined }
                : parseRedirectUri(redirectUri);
            const { vpToken, idToken, presentationSubmission, state } = parsed;
            const mode = normalizePresentationMode(queryValue(router.query.mode));
            const requisitionId = queryValue(router.query.requisitionId);
            const orgTenantId = queryValue(router.query.orgTenantId);
            const workflowRunId = queryValue(router.query.workflowRunId);
            const workflowId = queryValue(router.query.workflowId);
            const transactionId = queryValue(router.query.transactionId);
            const transition = queryValue(router.query.transition);
            const platformRequestId = queryValue(router.query.platformRequestId);

            const personalTenantIdForSubmit = getPersonalWalletTenantId();
            const isOrgProofMode =
                mode === 'requisition-approve'
                || mode === 'requisition-release'
                || mode === 'requisition-ack'
                || mode === 'field-signoff'
                || mode === 'field-payout'
                || mode === 'workflow-step'
                || mode === 'request-staff-card';
            const shouldSwitchOrgContextForSubmit =
                isOrgProofMode
                || (mode === 'ar-collection-consent' && !!orgTenantId && orgTenantId !== personalTenantIdForSubmit);

            if (shouldSwitchOrgContextForSubmit && orgTenantId) {
                await ensureOrgContextForRequisitionFlow(orgTenantId);
            }

            const requestId = queryValue(router.query.requestId) || parsePresentationRequestId(presentationRequestUrl) || state;
            const providerRef = queryValue(router.query.providerRef) || parseProviderRef(presentationRequestUrl) || undefined;
            const verifierTenantId = isOrgProofMode
                ? (orgTenantId || undefined)
                : (parseVerifierTenantId(presentationRequestUrl) || undefined);

            if (!directPost && ((!vpToken && !idToken) || !requestId)) {
                throw new Error('Wallet submission is missing vp_token/id_token or request state.');
            }

            const verifierToken = isOrgProofMode
                ? (getOrgToken() ?? walletToken)
                : mode === 'ar-collection-consent'
                    ? walletToken
                    : (getPreferredToken() ?? walletToken);
            if (!directPost) {
                const verifyRes = await api.post('/oidc/verifier/verify', {
                    requestId,
                    state: state || requestId,
                    verifiablePresentation: vpToken,
                    idToken,
                    presentationSubmission,
                    providerRef,
                    verifierTenantId,
                }, { headers: { Authorization: `Bearer ${verifierToken}` } });

                if (!verifyRes?.data?.verified) {
                    const backendError = typeof verifyRes?.data?.error === 'string'
                        ? verifyRes.data.error
                        : 'Presentation verification failed on verifier.';
                    throw new Error(backendError);
                }
            }

            // The step this proof finishes (a requisition, a job, a payment). One guard for all of
            // them: a resumed attempt whose request has ended drops its resume entry and says so.
            const finishRef = requisitionId || platformRequestId || workflowRunId || transactionId || '';
            const resumedAfterShare = Boolean(submissionData?.resumedAfterShare);
            const finishStep = async (run: () => Promise<void>) => {
                try {
                    await run();
                } catch (finalizeErr: any) {
                    if (resumedAfterShare) {
                        if (finishRef) removeRunningProofResume(finishRef);
                        throw new Error('This step has ended. Close this screen and open it again from your inbox to start fresh.');
                    }
                    throw finalizeErr;
                }
            };

            // Handle requisition approval context return flow
            if (mode === 'requisition-approve' && requisitionId) {
                await ensureRequisitionApprovalAllowed(requisitionId);

                const orgToken = getOrgToken();
                if (!orgToken) {
                    throw new Error('Organization session is required to finalize requisition approval.');
                }

                const idempotencyKey = `mobile-approve:${requisitionId}:${requestId}:${walletId}`;
                await finishStep(async () => {
                    await api.post(
                        `/api/finance/requisitions/${encodeURIComponent(requisitionId)}/approve`,
                        {
                            requestId,
                            vpToken,
                            idToken,
                            presentationSubmission,
                        },
                        {
                            headers: {
                                Authorization: `Bearer ${orgToken}`,
                                'x-idempotency-key': idempotencyKey,
                            },
                        },
                    );
                });
            }

            if (mode === 'requisition-release' && requisitionId) {
                const orgToken = getOrgToken();
                if (!orgToken) {
                    throw new Error('Organization session is required to finalize requisition release.');
                }

                const amountRaw = queryValue(router.query.amount);
                const parsedAmount = amountRaw !== undefined ? Number(amountRaw) : undefined;
                const releasePayload: Record<string, unknown> = {};

                if (typeof parsedAmount === 'number' && Number.isFinite(parsedAmount)) {
                    releasePayload.amount = parsedAmount;
                }

                const currency = queryValue(router.query.currency);
                if (currency) {
                    releasePayload.currency = currency;
                }
                const deviceAssertion = await confirmWithDevice({
                    purpose: 'release_funds',
                    transaction: { requisitionId, amount: releasePayload.amount || 0, currency: currency || 'USD' },
                });
                if (deviceAssertion) releasePayload.deviceAssertion = deviceAssertion;

                const idempotencyKey = `mobile-release:${requisitionId}:${requestId}:${walletId}`;
                await finishStep(async () => {
                    const releaseRes = await api.post(
                        `/api/finance/requisitions/${encodeURIComponent(requisitionId)}/release`,
                        releasePayload,
                        {
                            headers: {
                                Authorization: `Bearer ${orgToken}`,
                                'x-idempotency-key': idempotencyKey,
                            },
                        },
                    );

                    if (releaseRes.data?.error) {
                        throw new Error(releaseRes.data.error);
                    }

                    const releaseStatus = String(releaseRes.data?.status || '').toUpperCase();
                    if (releaseStatus !== 'RELEASED') {
                        await confirmRequisitionStatus(requisitionId, 'RELEASED', orgToken);
                    }
                });
            }

            if (mode === 'requisition-ack' && requisitionId) {
                const orgToken = getOrgToken();
                if (!orgToken) {
                    throw new Error('Organization session is required to finalize requisition acknowledgment.');
                }

                const notes = queryValue(router.query.notes) || 'Goods/services received and confirmed.';
                const idempotencyKey = `mobile-ack:${requisitionId}:${requestId}:${walletId}`;
                await finishStep(async () => {
                    const ackRes = await api.post(
                        `/api/finance/requisitions/${encodeURIComponent(requisitionId)}/ack`,
                        {
                            notes,
                        },
                        {
                            headers: {
                                Authorization: `Bearer ${orgToken}`,
                                'x-idempotency-key': idempotencyKey,
                            },
                        },
                    );

                    if (ackRes.data?.error) {
                        throw new Error(ackRes.data.error);
                    }
                });
            }

            if ((mode === 'field-signoff' || mode === 'field-payout' || mode === 'workflow-step') && workflowRunId) {
                const orgToken = getOrgToken();
                if (!orgToken) {
                    throw new Error('Switch to the organization before finishing this step.');
                }
                // A job's sign-off and payout have their own names; any other workflow sends the
                // step it is waiting at, so a new workflow finishes here without a new branch.
                const stage = queryValue(router.query.stage) || (mode === 'field-payout' ? 'payout' : 'acknowledgement');
                if (mode === 'workflow-step' && !queryValue(router.query.stage)) {
                    throw new Error('This step is missing its name. Open it again from your inbox.');
                }
                const idempotencyKey = `mobile-step:${workflowRunId}:${stage}:${requestId}:${walletId}`;
                await finishStep(async () => {
                    const done = await api.post(
                        `/workflows/runs/${encodeURIComponent(workflowRunId)}/proof/complete`,
                        { stage, requestId },
                        { headers: { Authorization: `Bearer ${orgToken}`, 'x-idempotency-key': idempotencyKey } },
                    );
                    if (done.data?.status === 'failed' || done.data?.error) {
                        throw new Error(String(done.data?.error || 'This step was not accepted.'));
                    }
                });
            }

            if (mode === 'request-staff-card' && platformRequestId) {
                const orgToken = getOrgToken();
                if (!orgToken) {
                    throw new Error('Switch to the organization before finishing this step.');
                }
                const toStatus = queryValue(router.query.toStatus) || 'approved';
                let stepPayload: Record<string, unknown> | undefined;
                try {
                    const rawPayload = queryValue(router.query.payload);
                    stepPayload = rawPayload ? JSON.parse(rawPayload) : undefined;
                } catch {
                    stepPayload = undefined;
                }
                const idempotencyKey = `mobile-request-card:${platformRequestId}:${toStatus}:${requestId}:${walletId}`;
                await finishStep(async () => {
                    await api.post(
                        `/api/platform/requests/${encodeURIComponent(platformRequestId)}/proof/complete`,
                        { toStatus, requestId, payload: stepPayload, vpToken, idToken, presentationSubmission },
                        { headers: { Authorization: `Bearer ${orgToken}`, 'x-idempotency-key': idempotencyKey } },
                    );
                });
            }

            if (mode === 'ap-workflow-transition' && transactionId && transition) {
                const orgToken = getOrgToken();
                if (!orgToken) {
                    throw new Error('Organization session is required to finalize AP workflow proof.');
                }

                const idempotencyKey = `mobile-ap-proof:${transactionId}:${transition}:${requestId}:${walletId}`;
                await finishStep(async () => {
                    await api.post(
                        `/api/finance/ap/workflow-actions/${encodeURIComponent(transactionId)}/transition`,
                        {
                            transition,
                            proofResponseId: requestId,
                            consentTimestamp: new Date().toISOString(),
                            notes: 'Wallet proof verified via mobile presentation flow',
                        },
                        { headers: { Authorization: `Bearer ${orgToken}`, 'x-idempotency-key': idempotencyKey } },
                    );
                });
            }

            if (mode === 'ar-collection-consent' && transactionId) {
                const targetTenantId = orgTenantId || parseVerifierTenantId(presentationRequestUrl) || undefined;
                const orgToken = getOrgToken();
                const orgTokenTenantId = orgToken
                    ? (decodeJwtPayload(orgToken)?.tenantId || decodeJwtPayload(orgToken)?.orgTenantId || '').trim()
                    : '';

                // Use org token only when it matches the required actor tenant.
                // Otherwise fall back to the personal wallet token for personal-tenant AR steps.
                const transitionToken = (targetTenantId && orgToken && orgTokenTenantId === targetTenantId)
                    ? orgToken
                    : walletToken;

                if (!transitionToken) {
                    throw new Error('A valid session token is required to finalize AR collection proof.');
                }

                const idempotencyKey = `mobile-ar-proof:${transactionId}:${requestId}:${walletId}`;
                await finishStep(async () => {
                    await api.post(
                        `/api/finance/ap/workflow-actions/${encodeURIComponent(transactionId)}/transition`,
                        {
                            transition: transition || 'present_payment_proof',
                            proofResponseId: requestId,
                            consentTimestamp: new Date().toISOString(),
                            notes: 'Wallet proof verified via mobile AR collection consent flow',
                        },
                        {
                            headers: {
                                Authorization: `Bearer ${transitionToken}`,
                                'x-idempotency-key': idempotencyKey,
                            },
                        },
                    );
                });
            }

            setSubmitStage('success');
            // The step is done, so nothing is left to resume for it, whatever the workflow.
            if (finishRef) removeRunningProofResume(finishRef);

            const returnTo = endTaskContext();
            if (returnTo) {
                void router.replace(returnTo);
                return;
            }

            if (mode === 'requisition-approve' && requisitionId) {
                // Return to requisitions list and let users reopen only if they need another action.
                setTimeout(() => {
                    const params = new URLSearchParams({
                        tab: 'requisitions',
                        ...(orgTenantId && { orgTenantId }),
                    });
                    router.push(`/finance?${params.toString()}`);
                }, 2000); // 2s delay to show success state
            } else if ((mode === 'field-signoff' || mode === 'field-payout') && workflowRunId) {
                setTimeout(() => {
                    const params = new URLSearchParams({
                        tab: 'field',
                        runId: workflowRunId,
                        ...(orgTenantId && { orgTenantId }),
                    });
                    router.push(`/finance?${params.toString()}`);
                }, 1500);
            } else if (mode === 'workflow-step') {
                // Back to the inbox: the person came from a card and may have more waiting.
                setTimeout(() => router.push('/inbox'), 1500);
            } else if ((mode === 'requisition-release' || mode === 'requisition-ack') && requisitionId) {
                setTimeout(() => {
                    const params = new URLSearchParams({
                        tab: 'requisitions',
                        ...(orgTenantId && { orgTenantId }),
                    });
                    router.push(`/finance?${params.toString()}`);
                }, 2000);
            } else if (mode === 'workflow-action') {
                setTimeout(() => {
                    if (workflowRunId) {
                        router.push(`/activity?ref=${encodeURIComponent(workflowRunId)}`);
                        return;
                    }

                    if (workflowId) {
                        router.push('/workflows');
                        return;
                    }

                    if (providerRef) {
                        router.push(`/activity?ref=${encodeURIComponent(providerRef)}`);
                        return;
                    }

                    router.push('/activity');
                }, 2000);
            } else if (mode === 'request-staff-card') {
                setTimeout(() => {
                    router.push('/inbox');
                }, 1500);
            } else if (mode === 'ap-workflow-transition') {
                setTimeout(() => {
                    const params = new URLSearchParams({
                        tab: 'ap',
                        ...(orgTenantId && { orgTenantId }),
                    });
                    router.push(`/finance?${params.toString()}`);
                }, 1500);
            } else if (mode === 'ar-collection-consent') {
                setTimeout(() => {
                    const planId = queryValue(router.query.planId);
                    const personalTenantId = getPersonalWalletTenantId();
                    const normalizedOrgTenantId = (orgTenantId || '').trim();
                    const redirectOrgTenantId = normalizedOrgTenantId && normalizedOrgTenantId !== personalTenantId
                        ? normalizedOrgTenantId
                        : undefined;

                    if (planId) {
                        const params = new URLSearchParams({
                            tab: 'ar',
                            planId,
                            ...(redirectOrgTenantId && { orgTenantId: redirectOrgTenantId }),
                        });
                        router.push(`/finance?${params.toString()}`);
                        return;
                    }

                    if (redirectOrgTenantId) {
                        const params = new URLSearchParams({ orgTenantId: redirectOrgTenantId });
                        router.push(`/finance/my-ar-obligations?${params.toString()}`);
                        return;
                    }

                    router.push('/finance?tab=ar');
                }, 1500);
            }
        } catch (err: any) {
            console.error(err);
            const rawMessage = err.response?.data?.message ?? err.message ?? 'Failed to share proof.';
            const message = /invalid session/i.test(String(rawMessage))
                ? 'This sign-off was already used. Close this screen and open the step again.'
                : String(rawMessage);
            setErrorText(message);
            setSubmitStage('error');
        }
    };

    const handleEmbeddedFallbackApproval = async () => {
        const mode = normalizePresentationMode(queryValue(router.query.mode));
        const requisitionId = queryValue(router.query.requisitionId);
        if (mode !== 'requisition-approve' || !requisitionId) {
            setErrorText('Embedded fallback is only available for requisition approval flows.');
            setSubmitStage('error');
            return;
        }

        const requestId = queryValue(router.query.requestId) || parsePresentationRequestId(presentationRequestUrl || '');
        if (!requestId) {
            setErrorText('Missing approval request ID for embedded fallback.');
            setSubmitStage('error');
            return;
        }

        const personalWalletId = getPersonalWalletTenantId();
        if (!personalWalletId) {
            setErrorText('Personal wallet session is required for embedded fallback approval.');
            setSubmitStage('error');
            return;
        }

        const orgToken = getOrgToken() || getPreferredToken();
        if (!orgToken) {
            setErrorText('Organization session is required for embedded fallback approval.');
            setSubmitStage('error');
            return;
        }

        try {
            await ensureRequisitionApprovalAllowed(requisitionId);
        } catch (err: any) {
            setErrorText(err.message || 'Approval blocked by org policy.');
            setSubmitStage('error');
            return;
        }

        const reauthOk = await requireSensitiveOrgReauth('approve this requisition with embedded wallet fallback');
        if (!reauthOk) {
            setErrorText('Approval was cancelled during re-authentication.');
            setSubmitStage('error');
            return;
        }

        setEmbeddedFallbackLoading(true);
        setSubmitStage('processing');
        setErrorText(null);

        try {
            await api.post(
                `/api/finance/requisitions/${encodeURIComponent(requisitionId)}/approve/embedded-wallet`,
                {
                    requestId,
                    presentationRequestUrl,
                    walletId: personalWalletId,
                },
                { headers: { Authorization: `Bearer ${orgToken}` } },
            );

            setSubmitStage('success');

            const returnTo = endTaskContext();
            if (returnTo) {
                void router.replace(returnTo);
                return;
            }

            const orgTenantId = queryValue(router.query.orgTenantId);
            setTimeout(() => {
                const params = new URLSearchParams({
                    tab: 'requisitions',
                    ...(orgTenantId && { orgTenantId }),
                });
                router.push(`/finance?${params.toString()}`);
            }, 1500);
        } catch (err: any) {
            console.error(err);
            setErrorText(err.response?.data?.error ?? err.response?.data?.message ?? err.message ?? 'Embedded fallback approval failed.');
            setSubmitStage('error');
        } finally {
            setEmbeddedFallbackLoading(false);
        }
    };

    return (
        <AppShellMobile>
            <Box p="md" pb={80}>
                <Stack gap="xl">
                    <Box>
                        {(() => {
                            const mode = normalizePresentationMode(queryValue(router.query.mode));
                            const requisitionId = router.query.requisitionId as string | undefined;
                            const workflowRunId = queryValue(router.query.workflowRunId);
                            const providerRef = queryValue(router.query.providerRef);
                            const transactionId = queryValue(router.query.transactionId);
                            const transition = queryValue(router.query.transition);

                            if (mode === 'workflow-step') {
                                const words = stageWords(queryValue(router.query.stage));
                                return (
                                    <>
                                        <Title order={3}>{words ? `Confirm: ${words}` : 'Confirm this step'}</Title>
                                        <Text c="dimmed" size="sm">Review the details below, then share them to confirm you are the person chosen for this step.</Text>
                                    </>
                                );
                            }

                            if (mode === 'field-signoff') {
                                return (
                                    <>
                                        <Title order={3}>Sign off this job</Title>
                                        <Text c="dimmed" size="sm">Review the details below, then share them to confirm you are the person chosen to sign off.</Text>
                                    </>
                                );
                            }

                            if (mode === 'field-payout') {
                                return (
                                    <>
                                        <Title order={3}>Release worker payout</Title>
                                        <Text c="dimmed" size="sm">Review the details below, then share them to confirm you are the person chosen to release the worker payout.</Text>
                                    </>
                                );
                            }

                            if (mode === 'requisition-approve' && requisitionId) {
                                return (
                                    <>
                                        <Title order={3}>Approve this request</Title>
                                        <Text c="dimmed" size="sm">Review the details below, then share them to confirm you are the person chosen to approve.</Text>
                                    </>
                                );
                            }

                            if (mode === 'ap-workflow-transition' && transactionId) {
                                return (
                                    <>
                                        <Title order={3}>Confirm this payment step</Title>
                                        <Text c="dimmed" size="sm">Share the card that shows you may approve this supplier payment, then the payment continues.</Text>
                                        <Group gap="xs" mt="xs">
                                            {transition && <Badge color="blue" variant="light">Action: {transition}</Badge>}
                                            {providerRef && <Badge color="indigo" variant="light">Ref: {providerRef}</Badge>}
                                        </Group>
                                    </>
                                );
                            }

                            if (mode === 'ar-collection-consent' && transactionId) {
                                return (
                                    <>
                                        <Title order={3}>Confirm this collection</Title>
                                        <Text c="dimmed" size="sm">Share your payment record so the organisation can mark this bill as paid.</Text>
                                        <Group gap="xs" mt="xs">
                                            {transition && <Badge color="indigo" variant="light">Action: {transition}</Badge>}
                                            {providerRef && <Badge color="blue" variant="light">Ref: {providerRef}</Badge>}
                                        </Group>
                                    </>
                                );
                            }

                            if (mode === 'workflow-action') {
                                return (
                                    <>
                                        <Title order={3}>Confirm this step</Title>
                                        <Text c="dimmed" size="sm">Share the card this step asks for, then the work continues.</Text>
                                        <Group gap="xs" mt="xs">
                                            {workflowRunId && <Badge color="violet" variant="light">Run: {workflowRunId.slice(0, 12)}</Badge>}
                                            {providerRef && <Badge color="blue" variant="light">Ref: {providerRef}</Badge>}
                                        </Group>
                                    </>
                                );
                            }

                            return (
                                <>
                                    <Title order={3}>Share details</Title>
                                    <Text c="dimmed" size="sm">An organisation asks to see details from your cards. Check what is shared before you agree.</Text>
                                </>
                            );
                        })()}
                    </Box>

                    {initStage === 'loading' && (
                        <Center py="xl">
                            <Stack align="center">
                                <Loader color="violet" />
                                <Text size="sm" c="dimmed">Analyzing request requirements...</Text>
                            </Stack>
                        </Center>
                    )}

                    {initStage === 'error' && <ErrorAlert title="This request could not be opened" message={errorText} />}

                    {initStage === 'ready' && submitStage === 'idle' && (
                        <Stack gap="lg">
                            {matches.length === 0 ? (
                                <Stack gap="sm">
                                    <Alert icon={<IconAlertCircle size={16} />} color="orange" title="No card for this step">
                                        None of the cards in this wallet can be used here. A withdrawn card, an expired card, or a card for a different step is not offered.
                                    </Alert>
                                    {(router.query.mode as string | undefined) === 'requisition-approve' && (
                                        <Button
                                            fullWidth
                                            size="md"
                                            color="indigo"
                                            loading={embeddedFallbackLoading}
                                            onClick={handleEmbeddedFallbackApproval}
                                        >
                                            Use Embedded Fallback Approval
                                        </Button>
                                    )}
                                </Stack>
                            ) : (
                                <>
                                    {(() => {
                                        const fromMatch = matches.map((match) => String(match?.purpose || '').trim()).find(Boolean);
                                        const line = fromMatch || sharePurposeLine({
                                            mode: currentMode,
                                            purpose: queryValue(router.query.purpose),
                                            reference: queryValue(router.query.reference),
                                            amount: queryValue(router.query.amount),
                                            currency: queryValue(router.query.currency),
                                        });
                                        return line ? <Text fw={600}>{line}</Text> : null;
                                    })()}
                                    {(() => {
                                        const asker = requesterName(queryValue(router.query.orgName), presentationRequestUrl);
                                        if (!asker) return null;
                                        return (
                                            <Paper withBorder radius="md" p="sm">
                                                <Group gap="sm" wrap="nowrap">
                                                    <ThemeIcon size={36} radius="xl" color="violet" variant="light">
                                                        <IconShieldCheck size={20} />
                                                    </ThemeIcon>
                                                    <Box style={{ flex: 1, minWidth: 0 }}>
                                                        <Text size="xs" c="dimmed">Who is asking</Text>
                                                        <Text fw={700} size="sm" lineClamp={1}>{asker}</Text>
                                                    </Box>
                                                </Group>
                                                <Text size="xs" c="dimmed" mt={6}>Nothing is sent until you tap Share.</Text>
                                            </Paper>
                                        );
                                    })()}
                                    <Group justify="space-between" align="center" wrap="nowrap">
                                        <Text fw={600} size="sm">These records will be shared:</Text>
                                        <StepHelp
                                            title="Sharing"
                                            points={[
                                                'Shared is what the other organisation will see.',
                                                'Not shared stays on your phone.',
                                                'You can decline. Nothing is sent until you confirm.',
                                                'Once you share, the other organisation can keep a copy.',
                                            ]}
                                        />
                                    </Group>
                                    <Stack gap="sm">
                                        {matches.map((match, idx) => {
                                            const cred = parseCredentialSummary(match);
                                            const selectionRef = resolveCredentialId(match);
                                            const checked = !!selectionRef && selectedCredentials.includes(selectionRef);
                                            const { shared, withheld, basisLine, wholeCard } = splitShareClaims(match);
                                            return (
                                                <Paper key={idx} p="md" radius="md" withBorder>
                                                    <Group gap="sm" wrap="nowrap" align="flex-start">
                                                        <Checkbox
                                                            mt={4}
                                                            checked={checked}
                                                            onChange={(event) => {
                                                                if (!selectionRef) return;
                                                                // Read the box now: React clears `currentTarget` once the handler
                                                                // returns, and a queued updater (second quick tap) would crash on null.
                                                                const isChecked = event.currentTarget.checked;
                                                                setSelectedCredentials((prev) => {
                                                                    if (isChecked) {
                                                                        return Array.from(new Set([...prev, selectionRef]));
                                                                    }
                                                                    return prev.filter((id) => id !== selectionRef);
                                                                });
                                                            }}
                                                            aria-label="Select credential"
                                                        />
                                                        <ThemeIcon size={40} radius="md" color="violet" variant="light">
                                                            <IconShieldCheck size={24} />
                                                        </ThemeIcon>
                                                        <Box style={{ flex: 1 }}>
                                                            <Text fw={600} size="sm" lineClamp={1}>{formatType(cred.type) || 'Record'}</Text>
                                                            <Text size="xs" c="dimmed">From: {cred.issuer}</Text>
                                                            {basisLine ? (
                                                                <Text size="xs" mt={6}>{basisLine}</Text>
                                                            ) : null}
                                                            {wholeCard && shared.length > 0 ? (
                                                                <Badge color="orange" variant="light" size="xs" mt={6}>Whole card is shared</Badge>
                                                            ) : null}
                                                            <Text size="xs" fw={700} mt={8}>Shared</Text>
                                                            <Stack gap={2} mt={2}>
                                                                {shared.length > 0 ? shared.map((claim) => (
                                                                    <Text key={`${selectionRef || idx}-shared-${claim.label}`} size="xs" style={{ overflowWrap: 'anywhere' }}>
                                                                        {claim.label}: {claim.value}
                                                                    </Text>
                                                                )) : (
                                                                    <Text size="xs" c="dimmed">No details from this record are needed for this step.</Text>
                                                                )}
                                                            </Stack>
                                                            {withheld.length > 0 ? (
                                                                <>
                                                                    <Text size="xs" fw={700} c="dimmed" mt={8}>Not shared</Text>
                                                                    <Stack gap={2} mt={2}>
                                                                        {withheld.map((claim) => (
                                                                            <Text key={`${selectionRef || idx}-held-${claim.label}`} size="xs" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
                                                                                {claim.label}: {claim.value}
                                                                            </Text>
                                                                        ))}
                                                                    </Stack>
                                                                </>
                                                            ) : shared.length > 0 && wholeCard && !basisLine ? (
                                                                <Text size="xs" c="dimmed" mt={6}>This card cannot share part of itself, so every detail above is sent.</Text>
                                                            ) : null}
                                                        </Box>
                                                        <Badge color="green" size="xs">Ready</Badge>
                                                    </Group>
                                                </Paper>
                                            );
                                        })}
                                    </Stack>
                                    <Checkbox
                                        mt="sm"
                                        checked={consentChecked}
                                        onChange={(event) => setConsentChecked(event.currentTarget.checked)}
                                        label={consentLabelForMode(currentMode, queryValue(router.query.stage))}
                                    />
                                    <Button
                                        fullWidth
                                        size="lg"
                                        color="violet"
                                        radius="md"
                                        mt="xl"
                                        disabled={selectedCredentials.length === 0 || !consentChecked}
                                        onClick={handleSubmit}
                                    >
                                        Share
                                    </Button>
                                    <Button
                                        fullWidth
                                        variant="subtle"
                                        color="gray"
                                        radius="md"
                                        onClick={async () => {
                                            // Turned down: nothing leaves the phone, but your activity list shows the request.
                                            try {
                                                const walletToken = getPersonalWalletToken();
                                                const fromMatch = matches.map((match) => String(match?.purpose || '').trim()).find(Boolean);
                                                const requestedTypes = Array.from(new Set(matches.map((match) => String(match?.type || '').trim()).filter(Boolean)));
                                                const requestedClaims = Array.from(new Set(matches.flatMap((match) => Object.keys(match?.claims || {}))));
                                                if (walletToken) {
                                                    await api.post('/api/wallet/activity/declined', {
                                                        presentationRequestUrl,
                                                        orgTenantId: queryValue(router.query.orgTenantId) || undefined,
                                                        orgName: queryValue(router.query.orgName) || undefined,
                                                        stage: queryValue(router.query.stage) || currentMode || undefined,
                                                        workflowRunId: queryValue(router.query.workflowRunId) || undefined,
                                                        reference: queryValue(router.query.reference) || undefined,
                                                        purpose: fromMatch || undefined,
                                                        requestedTypes,
                                                        requestedClaims,
                                                    }, { headers: { Authorization: `Bearer ${walletToken}` } });
                                                }
                                            } catch {
                                                // The log is a courtesy; leaving the screen must still work.
                                            }
                                            if (window.history.length > 1) router.back();
                                            else router.push('/');
                                        }}
                                    >
                                        Not now
                                    </Button>
                                </>
                            )}
                        </Stack>
                    )}

                    {submitStage === 'processing' && (
                        <Center py="xl">
                            <Stack align="center">
                                <Loader color="violet" />
                                <Text size="sm" c="dimmed">Sharing the selected details...</Text>
                            </Stack>
                        </Center>
                    )}

                    {submitStage === 'success' && (
                        <Paper p="xl" radius="md" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                            <Center mb="md">
                                <ThemeIcon size={64} radius="50%" color="green" variant="filled">
                                    <IconCheck size={32} />
                                </ThemeIcon>
                            </Center>
                            <Title order={4} ta="center" mb="xs">Shared</Title>
                            <Text ta="center" size="sm" c="dimmed">
                                The selected details were shared. You can return to the page that requested them.
                            </Text>
                            <Button fullWidth variant="light" color="green" mt="xl" radius="md" onClick={() => router.push('/proofs')}>
                                Return to Wallet
                            </Button>
                        </Paper>
                    )}

                    {submitStage === 'error' && (
                        <Stack gap="sm">
                            <ErrorAlert title="Not shared" message={errorText} />
                            <Button fullWidth variant="light" color="red" size="xs" onClick={() => setSubmitStage('idle')}>
                                Try Again
                            </Button>
                        </Stack>
                    )}

                </Stack>
            </Box>
        </AppShellMobile>
    );
}
