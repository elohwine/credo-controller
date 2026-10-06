import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import {
    Box, Stack, Text, Title, Center, ThemeIcon, Button, Alert, Loader,
    Paper, Group, Badge, Checkbox
} from '@mantine/core';
import { IconShieldCheck, IconCheck, IconAlertCircle } from '@tabler/icons-react';
import AppShellMobile from '@/components/layout/AppShellMobile';
import ErrorAlert from '@/components/shared/ErrorAlert';
import api from '@/lib/api';
import {
    decodeJwtPayload,
    applyOrgContext,
    getOrgToken,
    getActiveOrgId,
    getWalletToken,
    getPersonalWalletTenantId,
    getPersonalWalletToken,
    getPreferredToken,
} from '@/lib/auth';
import { requireSensitiveOrgReauth } from '@/lib/offline/localReauth';
import { evaluateOrgActionPolicy, getCachedOrgContextBundle, refreshOrgContextBundle } from '@/lib/offline/orgContextBundle';

type RequestedField = {
    descriptorId?: string;
    descriptorName?: string;
    descriptorPurpose?: string;
    id?: string;
    name?: string;
    purpose?: string;
    optional?: boolean;
    path?: string[];
};

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

function consentLabelForMode(mode?: string): string {
    const normalizedMode = normalizePresentationMode(mode);

    if (mode === 'ar-collection-consent') {
        return 'I agree to share the selected details for this collection step'
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

    return 'I agree to share the selected details to approve this request'
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
    return key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (char) => char.toUpperCase());
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

function extractRequestedFields(matches: any[]): RequestedField[] {
    const seen = new Set<string>();
    const output: RequestedField[] = [];

    for (const match of matches) {
        const fields = Array.isArray(match?.requestedFields) ? match.requestedFields : [];
        for (const field of fields) {
            const pathKey = Array.isArray(field?.path) ? field.path.join('|') : '';
            const key = `${String(field?.descriptorId || '')}:${String(field?.id || '')}:${pathKey}`;
            if (seen.has(key)) continue;
            seen.add(key);
            output.push(field as RequestedField);
        }
    }

    return output;
}

function firstPathLeaf(field: RequestedField): string | undefined {
    const firstPath = Array.isArray(field.path) ? field.path.find((entry) => typeof entry === 'string' && entry.trim().length > 0) : undefined;
    if (!firstPath) return undefined;

    const normalized = firstPath
        .replace(/^\$\.vc\./, '$.')
        .replace(/^\$\./, '')
        .replace(/\[\*\]/g, '')
        .replace(/\[\d+\]/g, '');

    const parts = normalized.split('.').filter(Boolean);
    const leaf = parts[parts.length - 1];
    return leaf && leaf !== 'type' ? leaf : undefined;
}

function extractAllCredentialClaimKeys(match: any): string[] {
    const document = match?.document
    if (!document || typeof document !== 'object') return []
    const subject = (document as any).credentialSubject || (document as any).vc?.credentialSubject
    if (!subject || typeof subject !== 'object') return []
    return Object.keys(subject).filter((k) => k !== 'id')
}

function extractRequestedClaims(match: any, requestedFields: RequestedField[]): Array<{ label: string; value: string }> {
    const genericClaims = extractCredentialClaims(match);
    if (!Array.isArray(requestedFields) || requestedFields.length === 0) {
        return genericClaims;
    }

    const document = match?.document;
    if (!document || typeof document !== 'object') {
        return genericClaims;
    }

    const subject = (document as any).credentialSubject || (document as any).vc?.credentialSubject;
    if (!subject || typeof subject !== 'object') {
        return genericClaims;
    }

    const requestedKeys = requestedFields
        .map((field) => firstPathLeaf(field))
        .filter((key): key is string => typeof key === 'string' && key.length > 0);

    if (requestedKeys.length === 0) {
        return genericClaims;
    }

    const summaries = requestedKeys
        .map((key) => {
            const value = (subject as Record<string, any>)[key];
            if (value == null || value === '') return undefined;
            return {
                label: key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (char) => char.toUpperCase()),
                value: typeof value === 'string' ? value : JSON.stringify(value),
            };
        })
        .filter((entry): entry is { label: string; value: string } => !!entry)
        .slice(0, 6);

    return summaries.length > 0 ? summaries : genericClaims;
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
    const requestedFields = extractRequestedFields(matches);
    const currentMode = queryValue(router.query.mode);

    const ensureOrgContextForRequisitionFlow = useCallback(async (targetOrgTenantId?: string) => {
        const normalizedOrgId = typeof targetOrgTenantId === 'string' ? targetOrgTenantId.trim() : '';
        if (!normalizedOrgId) return;

        const currentOrgId = (getActiveOrgId() || '').trim();
        const existingOrgToken = getOrgToken();
        const existingOrgPayload = existingOrgToken ? decodeJwtPayload(existingOrgToken) : null;
        const existingOrgTokenTenantId = (existingOrgPayload?.tenantId || existingOrgPayload?.orgTenantId || existingOrgPayload?.sub || '').trim();

        if (currentOrgId === normalizedOrgId && existingOrgToken && (!existingOrgTokenTenantId || existingOrgTokenTenantId === normalizedOrgId)) {
            return;
        }

        const holderToken = getPersonalWalletToken() || getWalletToken();
        if (!holderToken) {
            throw new Error('Personal wallet session is required to switch organization context.');
        }

        const switchRes = await api.post(
            `/api/organizations/${encodeURIComponent(normalizedOrgId)}/switch`,
            {},
            {
                headers: { Authorization: `Bearer ${holderToken}` },
                skipAuthRedirect: true as any,
            } as any,
        );

        const orgToken = switchRes.data?.token as string | undefined;
        if (!orgToken) {
            throw new Error('Failed to switch organization context for requisition approval.');
        }

        const orgName = switchRes.data?.name || switchRes.data?.label || switchRes.data?.orgName || normalizedOrgId;
        applyOrgContext({
            orgId: normalizedOrgId,
            orgName,
            orgToken,
            orgRole: switchRes.data?.orgRole,
            sector: switchRes.data?.sector,
            workflowTypes: switchRes.data?.workflowTypes,
        });
    }, []);

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
            const res = await api.post(`/api/wallet/${wId}/exchange/matchCredentialsForPresentationDefinition`, {
                presentationRequest: reqUrlStr
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
                        const row = byId.get(String(match.id));
                        if (!row) continue;
                        if (!match.type && row.type) match.type = row.type;
                        const subject = row.parsedDocument?.credentialSubject || {};
                        const nested = subject.claims && typeof subject.claims === 'object' ? subject.claims : {};
                        const claims: Record<string, string> = {};
                        for (const [key, value] of Object.entries({ ...subject, ...nested })) {
                            // Internal references (ids, tenant keys) mean nothing to the person reviewing; keep readable facts.
                            if (key === 'claims' || /id$/i.test(key) || /^(workflowType|assignmentMode|requestType|stageAction|templateId)$/i.test(key) || value == null || typeof value === 'object') continue;
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

            const submissionRes = await api.post(`/api/wallet/${walletId}/exchange/usePresentationRequest`, {
                presentationRequest: presentationRequestUrl,
                selectedCredentials: credentialsToSubmit
            }, { headers: { Authorization: `Bearer ${walletToken}` } });

            const directPost = Boolean(submissionRes.data?.directPost);
            const redirectUri = submissionRes.data?.redirectUri;
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

            const personalTenantIdForSubmit = getPersonalWalletTenantId();
            const isOrgProofMode =
                mode === 'requisition-approve'
                || mode === 'requisition-release'
                || mode === 'requisition-ack'
                || mode === 'field-signoff'
                || mode === 'field-payout';
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

            // Handle requisition approval context return flow
            if (mode === 'requisition-approve' && requisitionId) {
                await ensureRequisitionApprovalAllowed(requisitionId);

                const orgToken = getOrgToken();
                if (!orgToken) {
                    throw new Error('Organization session is required to finalize requisition approval.');
                }

                const idempotencyKey = `mobile-approve:${requisitionId}:${requestId}:${walletId}`;
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

                const idempotencyKey = `mobile-release:${requisitionId}:${requestId}:${walletId}`;
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
            }

            if (mode === 'requisition-ack' && requisitionId) {
                const orgToken = getOrgToken();
                if (!orgToken) {
                    throw new Error('Organization session is required to finalize requisition acknowledgment.');
                }

                const notes = queryValue(router.query.notes) || 'Goods/services received and confirmed.';
                const idempotencyKey = `mobile-ack:${requisitionId}:${requestId}:${walletId}`;
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
            }

            if ((mode === 'field-signoff' || mode === 'field-payout') && workflowRunId) {
                const orgToken = getOrgToken();
                if (!orgToken) {
                    throw new Error('Switch to the organization before finishing this step.');
                }
                const stage = queryValue(router.query.stage) || (mode === 'field-payout' ? 'payout' : 'acknowledgement');
                const done = await api.post(
                    `/workflows/runs/${encodeURIComponent(workflowRunId)}/proof/complete`,
                    { stage, requestId },
                    { headers: { Authorization: `Bearer ${orgToken}` } },
                );
                if (done.data?.status === 'failed' || done.data?.error) {
                    throw new Error(String(done.data?.error || 'This step was not accepted.'));
                }
            }

            if (mode === 'ap-workflow-transition' && transactionId && transition) {
                const orgToken = getOrgToken();
                if (!orgToken) {
                    throw new Error('Organization session is required to finalize AP workflow proof.');
                }

                await api.post(
                    `/api/finance/ap/workflow-actions/${encodeURIComponent(transactionId)}/transition`,
                    {
                        transition,
                        proofResponseId: requestId,
                        consentTimestamp: new Date().toISOString(),
                        notes: 'Wallet proof verified via mobile presentation flow',
                    },
                    { headers: { Authorization: `Bearer ${orgToken}` } },
                );
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
            }

            setSubmitStage('success');

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
            setErrorText(err.response?.data?.message ?? err.message ?? 'Failed to share proof.');
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
                                        <Title order={3}>Release payment</Title>
                                        <Text c="dimmed" size="sm">Review the details below, then share them to confirm you are the person chosen to release payment.</Text>
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
                                        <Title order={3}>AP Workflow Proof</Title>
                                        <Text c="dimmed" size="sm">Verify your authority and continue AP workflow transaction {transactionId.slice(0, 10)}...</Text>
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
                                        <Title order={3}>AR Collection Proof</Title>
                                        <Text c="dimmed" size="sm">Present wallet proof for AR collection transaction {transactionId.slice(0, 10)} and continue the debtor workflow.</Text>
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
                                        <Title order={3}>Workflow Verification</Title>
                                        <Text c="dimmed" size="sm">Submit proof for an ongoing workflow action.</Text>
                                        <Group gap="xs" mt="xs">
                                            {workflowRunId && <Badge color="violet" variant="light">Run: {workflowRunId.slice(0, 12)}</Badge>}
                                            {providerRef && <Badge color="blue" variant="light">Ref: {providerRef}</Badge>}
                                        </Group>
                                    </>
                                );
                            }

                            return (
                                <>
                                    <Title order={3}>Verification Request</Title>
                                    <Text c="dimmed" size="sm">An organization has requested proof from your wallet.</Text>
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

                    {initStage === 'error' && <ErrorAlert title="Request Failed" message={errorText} />}

                    {initStage === 'ready' && submitStage === 'idle' && (
                        <Stack gap="lg">
                            {matches.length === 0 ? (
                                <Stack gap="sm">
                                    <Alert icon={<IconAlertCircle size={16} />} color="orange" title="No Matches Found">
                                        You do not have any valid credentials in this wallet that satisfy the request requirements.
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
                                    <Text fw={600} size="sm">These records will be shared:</Text>
                                    {(() => {
                                        if (requestedFields.length === 0) return null;

                                        return (
                                            <Paper p="md" radius="md" withBorder>
                                                <Text fw={600} size="sm">Details being shared</Text>
                                                <Stack gap={4} mt={6}>
                                                    {requestedFields.slice(0, 8).map((field, index) => {
                                                        const label = field.name || firstPathLeaf(field) || `Field ${index + 1}`;
                                                        const purpose = field.purpose || field.descriptorPurpose;
                                                        return (
                                                            <Box key={`${field.descriptorId || 'descriptor'}-${field.id || index}-${(field.path || []).join('|')}`}>
                                                                <Group gap={6} wrap="nowrap">
                                                                    <Badge size="xs" color={field.optional ? 'gray' : 'red'} variant="light">
                                                                        {field.optional ? 'Optional' : 'Required'}
                                                                    </Badge>
                                                                    <Text size="xs" fw={600}>{label}</Text>
                                                                </Group>
                                                                {purpose && (
                                                                    <Text size="xs" c="dimmed" mt={2}>{purpose}</Text>
                                                                )}
                                                            </Box>
                                                        );
                                                    })}
                                                </Stack>
                                            </Paper>
                                        );
                                    })()}
                                    <Stack gap="sm">
                                        {matches.map((match, idx) => {
                                            const cred = parseCredentialSummary(match);
                                            const selectionRef = resolveCredentialId(match);
                                            const checked = !!selectionRef && selectedCredentials.includes(selectionRef);
                                            const claims = extractRequestedClaims(match, requestedFields);
                                            return (
                                                <Paper key={idx} p="md" radius="md" withBorder>
                                                    <Group gap="sm" wrap="nowrap">
                                                        <Checkbox
                                                            checked={checked}
                                                            onChange={(event) => {
                                                                if (!selectionRef) return;
                                                                setSelectedCredentials((prev) => {
                                                                    if (event.currentTarget.checked) {
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
                                                            <Stack gap={2} mt={6}>
                                                                {claims.length > 0 ? claims.map((claim) => (
                                                                    <Text key={`${selectionRef || idx}-${claim.label}`} size="xs" c="dimmed" lineClamp={1}>
                                                                        {claim.label}: {String(claim.value).length > 28 ? `${String(claim.value).substring(0, 12)}…${String(claim.value).slice(-6)}` : claim.value}
                                                                    </Text>
                                                                )) : (
                                                                    <Text size="xs" c="dimmed">No extra details on this record.</Text>
                                                                )}
                                                            </Stack>
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
                                        label={consentLabelForMode(currentMode)}
                                    />
                                    {/* Withheld claims — show fields in wallet that are NOT being requested */}
                                    {requestedFields.length > 0 && matches.length > 0 && (() => {
                                        const requestedKeys = new Set(requestedFields.map((f) => firstPathLeaf(f)).filter(Boolean))
                                        const withheld = extractAllCredentialClaimKeys(matches[0]).filter((k) => !requestedKeys.has(k))
                                        if (withheld.length === 0) return null
                                        return (
                                            <Paper p="sm" radius="md" withBorder style={{ borderLeft: '3px solid #22c55e' }}>
                                                <Text size="xs" fw={700} mb={4}>Not being shared</Text>
                                                <Group gap={4} wrap="wrap">
                                                    {withheld.map((key) => (
                                                        <Badge key={key} size="xs" variant="light" color="gray">
                                                            {key.replace(/([a-z])([A-Z])/g, '$1 $2')}
                                                        </Badge>
                                                    ))}
                                                </Group>
                                            </Paper>
                                        )
                                    })()}
                                    <Button
                                        fullWidth
                                        size="lg"
                                        color="violet"
                                        radius="md"
                                        mt="xl"
                                        disabled={selectedCredentials.length === 0 || !consentChecked}
                                        onClick={handleSubmit}
                                    >
                                        Share and continue
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
                                The selected details were shared. You can go back to the job.
                            </Text>
                            <Button fullWidth variant="light" color="green" mt="xl" radius="md" onClick={() => router.push('/proofs')}>
                                Return to Wallet
                            </Button>
                        </Paper>
                    )}

                    {submitStage === 'error' && (
                        <Stack gap="sm">
                            <ErrorAlert title="Submission Failed" message={errorText} />
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
