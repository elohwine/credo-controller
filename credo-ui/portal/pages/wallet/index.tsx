import { feedback } from '@/lib/feedback';
import React, { useState, useContext, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import { StepHelp } from '@/components/help/StepHelp';
import { EnvContext } from '@/pages/_app';
import {
    Container,
    Paper,
    Title,
    Text,
    Card,
    Group,
    Stack,
    Badge,
    Button,
    Loader,
    Alert,
    SimpleGrid,
    Box,
    Divider,
    ActionIcon,
    Menu,
    Modal,
    ScrollArea,
    TextInput,
    Tabs,
} from '@mantine/core';
import {
    IconWallet,
    IconReceipt,
    IconFileInvoice,
    IconCertificate,
    IconLogout,
    IconRefresh,
    IconDotsVertical,
    IconEye,
    IconDownload,

    IconAlertCircle,
    IconUser,

    IconTrash,
    IconSearch,
} from '@tabler/icons-react';
import axios from 'axios';
import { getPersonalWalletTenantId, getPersonalWalletToken } from '@/utils/portalTenant';
import { clearCurrentSession } from '@/lib/savedAccounts';
import { cardLife, readArchivedCardIds, setCardArchived } from '@/lib/cardLife';
import { formatTxnTime, openInboxOffers } from '@/lib/inboxAttention';
import { CLAIM_LABELS, HIDDEN_CLAIMS, credentialClaimRows, plainStep } from '@/lib/recordCheck';
import RecordCheckPanel from '@/components/records/RecordCheckPanel';
import { clearStoredOrganizationContext, getOrgScopedToken, readActiveOrganization } from '@/utils/organizationContext';
import { sharePurposeLine } from '@/components/finance/financeStages';
import {
    RECORD_SECTION_LABELS, RECORD_SECTION_ORDER, recordCardTitle, recordSectionOf, type RecordSectionKey,
} from '@/lib/workflowCapabilities';

interface WalletCredential {
    id: string;
    type: string;
    issuerDid: string;
    /** The organisation behind the issuer key, when the card's claims do not name it. */
    issuerName?: string;
    addedOn: string;
    /** The issuer withdrew this card (role changed, left the organisation, or a newer card replaced it). */
    withdrawn?: boolean;
    revocationReason?: string;
    /** The person filed a still-valid card themselves. */
    archived?: boolean;
    issuedId?: string;
    parsedDocument?: {
        credentialSubject?: Record<string, any>;
        issuer?: string | { id: string };
        issuanceDate?: string;
        expirationDate?: string;
        type?: string[];
    };
}

const CREDENTIAL_ICONS: Record<string, React.ReactNode> = {
    PaymentReceiptVC: <IconReceipt size={24} />,
    PaymentReceipt: <IconReceipt size={24} />,
    InvoiceVC: <IconFileInvoice size={24} />,
    Invoice: <IconFileInvoice size={24} />,
    GenericID: <IconCertificate size={24} />,
    GenericIDCredential: <IconCertificate size={24} />,
    VerifiableCredential: <IconCertificate size={24} />,
};


/** Cards the team list already names in plain words. Same labels on portal and phone. */
const CARD_LABELS: Record<string, string> = {
    EmployeeCredential: 'Staff card',
    PlatformIdentityCredential: 'Identity card',
    PlatformIdentityVC: 'Identity card',
    OrgWorkflowActorCredential: 'Role card (older)',
    LeaveApprovalVC: 'Leave approved',
    ExpenseApprovalVC: 'Expense approved',
};

function formatCredentialType(type: string): string {
    if (CARD_LABELS[type]) return CARD_LABELS[type];
    return type
        .replace(/VC$/, '')
        .replace(/Credential$/, '')
        .replace(/([A-Z])/g, ' $1')
        .trim();
}

/** Who gave the person this record: the organisation, school or shop named on the card. */
function credentialIssuerLabel(subject: Record<string, any> | undefined, issuer?: string | null): string {
    const named = subject?.orgName || subject?.merchantName || subject?.schoolName || subject?.organizationName || subject?.platformName;
    if (typeof named === 'string' && named.trim()) return named.trim();
    if (issuer && !issuer.startsWith('did:')) return issuer;
    return 'Issuer not named';
}

function queryValue(value: string | string[] | undefined): string | undefined {
    if (Array.isArray(value)) return value[0];
    return value || undefined;
}

function normalizePresentationMode(mode?: string): string {
    return (mode || '').toLowerCase().trim();
}

function parseWalletQueryParams(asPath: string): Record<string, string> {
    const queryPart = asPath.split('?')[1] || '';
    if (!queryPart) return {};

    const normalizedQuery = queryPart.includes('=') ? queryPart : decodeURIComponent(queryPart);

    try {
        const params = new URLSearchParams(normalizedQuery);
        const output: Record<string, string> = {};

        for (const [key, value] of params.entries()) {
            output[key] = value;
        }

        return output;
    } catch {
        return {};
    }
}

function parseRedirectUri(redirectUri: string): { vpToken?: string; idToken?: string; presentationSubmission?: any; state?: string } {
    try {
        const parsed = new URL(redirectUri, 'http://localhost');
        const searchParams = new URLSearchParams(parsed.search || '');
        const hashParams = new URLSearchParams(parsed.hash.startsWith('#') ? parsed.hash.slice(1) : parsed.hash || '');
        const params = new URLSearchParams();
        for (const [key, value] of searchParams.entries()) params.append(key, value);
        for (const [key, value] of hashParams.entries()) params.append(key, value);

        const presentationSubmission = params.get('presentation_submission');
        const rawPresentationSubmission = params.get('presentation_submission');
        return {
            vpToken: params.get('vp_token') || undefined,
            idToken: params.get('id_token') || undefined,
            state: params.get('state') || undefined,
            presentationSubmission: rawPresentationSubmission ? (() => {
                try { return JSON.parse(rawPresentationSubmission); } catch { return undefined; }
            })() : undefined,
        };
    } catch {
        return {};
    }
}

function decodeJwtPayloadLoose(token: string): any | null {
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

function credentialDocument(match: any): any | null {
    const raw = match?.document ?? match?.disclosures ?? null;
    if (raw == null || raw === '') return null;
    if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (trimmed.startsWith('{')) {
            try { return JSON.parse(trimmed); } catch { return null; }
        }
        const payload = decodeJwtPayloadLoose(trimmed);
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
    if (typeof issuer === 'string') return issuer.startsWith('did:') ? 'Your organization' : issuer;
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
    return { type: document.type || 'Record', issuer: issuerLabel(document.issuer || document.issuerDid) };
}

function resolveCredentialId(match: any): string | undefined {
    if (!match) return undefined;
    if (typeof match.id === 'string' && match.id.length > 0) return match.id;
    if (typeof match.submissionCredential === 'string' && match.submissionCredential.length > 0) return match.submissionCredential;
    if (typeof match.credentialRecord?.id === 'string' && match.credentialRecord.id.length > 0) return match.credentialRecord.id;
    if (typeof match.credential?.id === 'string' && match.credential.id.length > 0) return match.credential.id;
    return undefined;
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
 * record will reveal; `withheld` are the details that stay with the person (a selective-disclosure
 * card). A whole card (older record, or a request that cannot name claims) has nothing withheld.
 */
function splitShareClaims(match: any): { shared: Array<{ label: string; value: string }>; withheld: Array<{ label: string; value: string }> } {
    const toRows = (source: unknown, held = false): Array<{ label: string; value: string }> => {
        const entries: Array<[string, unknown]> = source && typeof source === 'object' && !Array.isArray(source)
            ? Object.entries(source as Record<string, unknown>)
            : [];
        const rows: Array<{ label: string; value: string }> = [];
        const seen = new Set<string>();
        for (const [key, raw] of entries) {
            if (raw == null || HIDDEN_CLAIMS.test(key)) continue;
            const value = prettyClaimValue(String(key), String(raw)).trim();
            if (!value || value.startsWith('did:')) continue;
            const label = key === 'stageActions' && held
                ? 'Other steps on your card'
                : key === 'stageActions' && !value.includes(',')
                ? 'This step'
                : CLAIM_LABELS[key] || key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (char) => char.toUpperCase());
            const stamp = `${label}:${value}`;
            if (seen.has(stamp)) continue;
            seen.add(stamp);
            rows.push({ label, value });
        }
        return rows;
    };
    return { shared: toRows(match?.claims), withheld: toRows(match?.withheld, true) };
}

function CredentialCard({ credential, onView, detail = false }: { credential: WalletCredential; onView?: () => void; detail?: boolean }) {
    const subject = credential.parsedDocument?.credentialSubject || {};
    // Older job records were issued as a generic card; name them by what they are.
    const displayType = recordCardTitle(credential.type, subject) || formatCredentialType(credential.type);

    const icon = CREDENTIAL_ICONS[credential.type] || <IconCertificate size={24} />;

    const issuer = typeof credential.parsedDocument?.issuer === 'string'
        ? credential.parsedDocument.issuer
        : credential.parsedDocument?.issuer?.id || credential.issuerDid;


    const issuerName = credential.issuerName || credentialIssuerLabel(subject, issuer);
    const life = cardLife({
        withdrawn: credential.withdrawn,
        revocationReason: credential.revocationReason,
        expiresAt: credential.parsedDocument?.expirationDate,
    });
    const filedByYou = Boolean(credential.archived) && life.life === 'active';
    const tone = filedByYou
        ? { border: '#868e96', wash: '#f1f3f5', badge: 'gray', label: 'Archived' }
        : life.life === 'replaced'
        ? { border: '#e8a317', wash: '#fff8eb', badge: 'orange', label: life.label }
        : life.life === 'withdrawn'
            ? { border: '#e03131', wash: '#fff5f5', badge: 'red', label: life.label }
            : life.life === 'expired'
                ? { border: '#868e96', wash: '#f1f3f5', badge: 'gray', label: life.label }
                : undefined;

    const content = (
        <Stack gap="lg" justify="space-between" style={{ minHeight: detail ? 190 : 205 }}>
            <Group justify="space-between" align="flex-start" wrap="nowrap">
                <Box p="sm" style={{ borderRadius: 14, background: 'rgba(255,255,255,0.15)' }}>{icon}</Box>
                <Badge variant="outline" color="white" size="sm">{tone?.label || life.label}</Badge>
            </Group>
            <Box>
                <Text size={detail ? 'xl' : 'lg'} fw={700} c="white" lineClamp={2}>{displayType}</Text>
                <Text size="sm" c="white" opacity={0.85} mt={4} lineClamp={2}>{issuerName}</Text>
            </Box>
            <Group justify="space-between" wrap="nowrap">
                <Text size="xs" c="white" opacity={0.8}>Saved {formatTxnTime(credential.addedOn)}</Text>
                {!detail && <IconEye size={18} aria-hidden />}
            </Group>
        </Stack>
    );
    const style = {
        width: '100%',
        textAlign: 'left' as const,
        color: 'white',
        background: tone
            ? 'linear-gradient(135deg, #66788a, #394b5c)'
            : 'linear-gradient(135deg, #2188CA, #0F3F5E)',
        border: 0,
    };
    return detail ? (
        <Paper radius="xl" p="xl" style={style}>{content}</Paper>
    ) : (
        <Paper component="button" type="button" onClick={onView} aria-label={`View ${displayType} from ${issuerName}`}
            radius="xl" p="xl" shadow="md" style={{ ...style, cursor: 'pointer' }}>
            {content}
        </Paper>
    );
}

type OrgPendingRecord = { id: string; credentialType: string; offerUri: string; title?: string; issuerName?: string; createdAt?: string };

export default function WalletPage() {
    const router = useRouter();
    const env = useContext(EnvContext);
    const [credentials, setCredentials] = useState<WalletCredential[]>([]);
    const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [userEmail, setUserEmail] = useState<string>('');
    const [selectedCredential, setSelectedCredential] = useState<WalletCredential | null>(null);
    const [detailsModalOpen, setDetailsModalOpen] = useState(false);
    const [removingCredential, setRemovingCredential] = useState(false);
    const [approvalMatches, setApprovalMatches] = useState<any[]>([]);
    const [selectedApprovalCredentialIds, setSelectedApprovalCredentialIds] = useState<string[]>([]);
    const [approvalConsentChecked, setApprovalConsentChecked] = useState(false);
    const [approvalSubmitting, setApprovalSubmitting] = useState(false);
    const [approvalLoading, setApprovalLoading] = useState(true);
    const [approvalError, setApprovalError] = useState<string | null>(null);
    const [approvalAttempt, setApprovalAttempt] = useState(0);
    const [walletReady, setWalletReady] = useState(false);
    const [category, setCategory] = useState('all');
    const [walletTab, setWalletTab] = useState<string | null>('saved');
    const [search, setSearch] = useState('');
    const [orgPending, setOrgPending] = useState<OrgPendingRecord[]>([]);
    const [addingOfferId, setAddingOfferId] = useState<string | null>(null);
    const requestedHolder = walletReady && router.isReady
        ? (queryValue(router.query.holder) || parseWalletQueryParams(router.asPath || '').holder)
        : undefined;
    const orgRecords = requestedHolder === 'organization';
    const activeOrg = orgRecords ? readActiveOrganization() : null;

    useEffect(() => {
        setWalletReady(true);
    }, []);

    const holderBackend = env?.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000';
    const fallbackQuery = parseWalletQueryParams(router.asPath || '');
    const presentationMode = normalizePresentationMode(queryValue(router.query.mode) || fallbackQuery.mode);
    const presentationRequestRef = queryValue(router.query.presentationRequestRef)
        || fallbackQuery.presentationRequestRef
        || '';
    const presentationRequestUrlFromRef =
        typeof window !== 'undefined' && presentationRequestRef
            ? window.sessionStorage.getItem(presentationRequestRef) || undefined
            : undefined;
    const presentationRequestUrl = presentationRequestUrlFromRef
        || queryValue(router.query.presentationRequestUrl)
        || queryValue(router.query.request_uri)
        || fallbackQuery.presentationRequestUrl
        || fallbackQuery.request_uri
        || '';
    const requisitionId = queryValue(router.query.requisitionId) || fallbackQuery.requisitionId;
    const requisitionAction = queryValue(router.query.requisitionAction) || fallbackQuery.requisitionAction;
    const workflowRunId = queryValue(router.query.workflowRunId) || fallbackQuery.workflowRunId;
    const proofStage = queryValue(router.query.proofStage) || fallbackQuery.proofStage;
    const requestId = queryValue(router.query.requestId) || fallbackQuery.requestId;
    // The organisation whose request this is. Only its records are offered and sent.
    const shareOrgTenantId = queryValue(router.query.orgTenantId)
        || fallbackQuery.orgTenantId
        || readActiveOrganization()?.orgTenantId
        || '';
    const returnTo = queryValue(router.query.returnTo)
        || fallbackQuery.returnTo
        || '/requests?requestType=requisition';

    /** The organisation's own records: what it holds and what is waiting to be added. */
    const fetchOrganisationRecords = useCallback(async () => {
        const org = readActiveOrganization();
        const token = window.localStorage.getItem('credoOrgToken');
        if (!org?.orgTenantId || !token) {
            setError('Switch to an organisation to see its records.');
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(null);
        setUserEmail(org.name || 'Organisation');
        const headers = { Authorization: `Bearer ${token}` };
        try {
            const [listResponse, pendingResponse] = await Promise.all([
                axios.get(`${holderBackend}/api/wallet/${encodeURIComponent(org.orgTenantId)}/credentials/list?limit=100`, { headers }),
                axios.get(`${holderBackend}/api/wallet/credentials/pending-offers?holder=organization&status=open`, { headers })
                    .catch(() => ({ data: { offers: [] } })),
            ]);
            const items = listResponse.data?.items || [];
            setCredentials(Array.isArray(items) ? items.map((item: any) => ({
                id: item.vc_id || item.id,
                type: item.vc_type || item.type,
                parsedDocument: item.parsedDocument || item.parsed_document,
                issuerDid: item.issuerDid,
                addedOn: item.issued_at || item.addedOn,
                ...item,
            })) : []);
            setArchivedIds(readArchivedCardIds());
            const offers: any[] = openInboxOffers(pendingResponse.data);
            setOrgPending(offers.filter((offer: any) => /^openid-credential-offer:/i.test(String(offer?.offerUri || ''))));
        } catch (err: any) {
            setCredentials([]);
            setOrgPending([]);
            setError(err?.response?.status === 403
                ? 'Only an owner or admin can open the organisation records.'
                : err?.response?.data?.message || err.message || 'Could not load the organisation records');
        } finally {
            setLoading(false);
        }
    }, [holderBackend]);

    const addOrganisationRecord = async (offer: OrgPendingRecord) => {
        const token = window.localStorage.getItem('credoOrgToken');
        if (!token) return;
        setAddingOfferId(offer.id);
        try {
            await axios.post(`${holderBackend}/api/wallet/credentials/accept-offer`, { offerUri: offer.offerUri }, {
                headers: { Authorization: `Bearer ${token}` },
            });
            feedback.success(`${formatCredentialType(offer.credentialType)} is now kept by the organisation.`, { title: 'Added to records' });
            await fetchOrganisationRecords();
        } catch (err: any) {
            feedback.fromError(err, { title: 'Could not add it' });
        } finally {
            setAddingOfferId(null);
        }
    };

    const fetchCredentials = useCallback(async () => {
        // Mirror fastlane behavior: holder flows use personal wallet token first.
        const userToken = getPersonalWalletToken() || localStorage.getItem('authToken') || localStorage.getItem('auth.token');
        const guestToken = localStorage.getItem('credoTenantToken');
        
        // Determine mode
        const token = userToken || guestToken;
        const isGuest = !userToken && !!guestToken;
        
        if (!token) {
            router.replace('/auth/login');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            // Decode token to get walletId
            const payload = JSON.parse(atob(token.split('.')[1]));
            const walletId = getPersonalWalletTenantId() || payload.walletId || payload.tenantId;

            if (!walletId) {
                throw new Error('Invalid token: missing wallet ID');
            }

            // For logged in users, try to get email from storage or token
            if (!isGuest) {
                const storedEmail = localStorage.getItem('credoUserName') || localStorage.getItem('walletEmail') || localStorage.getItem('walletPhone');
                setUserEmail(storedEmail || payload.email || payload.username || 'My Account');
            } else {
                setUserEmail('Guest Session');
            }

            const sessionToken = await axios.post(
                `${holderBackend}/api/ssi/auth/session`,
                { expiresInSeconds: 900 },
                { headers: { Authorization: `Bearer ${token}` } }
            ).then((res) => res.data?.token as string | undefined)

            const authToken = sessionToken || token

            const listResponse = await axios.get(
                `${holderBackend}/api/wallet/${walletId}/credentials/list?limit=50`,
                { headers: { Authorization: `Bearer ${authToken}` } }
            );

            const items = listResponse.data?.items || listResponse.data || []
            const normalized = Array.isArray(items)
                ? items.map((item: any) => ({
                    id: item.vc_id || item.id,
                    type: item.vc_type || item.type,
                    parsedDocument: item.parsedDocument || item.parsed_document,
                    issuerDid: item.issuerDid,
                    addedOn: item.issued_at || item.addedOn,
                    ...item
                }))
                : []

            setCredentials(normalized)
            setArchivedIds(readArchivedCardIds())
            const counts = { active: 0, expired: 0, replaced: 0, withdrawn: 0 }
            for (const cred of normalized) {
                counts[cardLife({
                    withdrawn: cred.withdrawn,
                    revocationReason: cred.revocationReason,
                    expiresAt: cred.parsedDocument?.expirationDate,
                }).life] += 1
            }
        } catch (err: any) {
            console.error('Failed to fetch credentials:', err);
            if (err.response?.status === 401) {
                clearCurrentSession();
                clearStoredOrganizationContext();
                router.replace('/auth/login?sessionExpired=1');
                return;
            }
            setError(err.message || 'Failed to load credentials');
        } finally {
            setLoading(false);
        }
    }, [holderBackend, router]);

    useEffect(() => {
        if (!router.isReady) return;
        if (orgRecords) void fetchOrganisationRecords();
        else void fetchCredentials();
    }, [router.isReady, orgRecords, fetchCredentials, fetchOrganisationRecords]);
    const refreshRecords = orgRecords ? fetchOrganisationRecords : fetchCredentials;

    const handleLogout = () => {
        clearCurrentSession();
        clearStoredOrganizationContext();
        
        feedback.info('You have been signed out.', { title: 'Logged out' });
        router.replace('/auth/login');
    };

    const handleViewDetails = (credential: WalletCredential) => {
        setSelectedCredential(credential);
        setDetailsModalOpen(true);
    };

    /** Delete the card from this wallet. The organisation's record of what it issued is untouched. */
    const handleRemoveCredential = async (credential: WalletCredential) => {
        if (!window.confirm('Remove this card from this device? You cannot undo this.')) return;
        const token = getPersonalWalletToken() || localStorage.getItem('authToken') || localStorage.getItem('auth.token') || localStorage.getItem('credoTenantToken');
        if (!token) return;
        setRemovingCredential(true);
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            const walletId = getPersonalWalletTenantId() || payload.walletId || payload.tenantId;
            const sessionToken = await axios.post(
                `${holderBackend}/api/ssi/auth/session`,
                { expiresInSeconds: 900 },
                { headers: { Authorization: `Bearer ${token}` } }
            ).then((res) => res.data?.token as string | undefined).catch(() => undefined);
            await axios.delete(
                `${holderBackend}/api/wallet/${walletId}/credentials/${encodeURIComponent(credential.id)}`,
                { headers: { Authorization: `Bearer ${sessionToken || token}` } }
            );
            setCredentials((prev) => prev.filter((item) => item.id !== credential.id));
            setDetailsModalOpen(false);
            setSelectedCredential(null);
            feedback.info('The card is no longer on this device.', { title: 'Removed' });
        } catch (err: any) {
            feedback.fromError(err, { title: 'Could not remove' });
        } finally {
            setRemovingCredential(false);
        }
    };

    useEffect(() => {
        if (!router.isReady || presentationMode !== 'approval') return;
        let cancelled = false;
        const controller = new AbortController();
        const initializeApprovalMode = async () => {
            setApprovalLoading(true);
            setApprovalError(null);
            setApprovalMatches([]);
            setSelectedApprovalCredentialIds([]);
            setApprovalConsentChecked(false);
            if (!presentationRequestUrl) {
                setApprovalError('This sharing request is no longer available on this device. Go back to the step and open it again.');
                setApprovalLoading(false);
                return;
            }

            const walletToken = getPersonalWalletToken();
            if (!walletToken) {
                setApprovalError('Sign in to your personal wallet to review and share records for this step.');
                setApprovalLoading(false);
                return;
            }

            try {
                const payload = JSON.parse(atob(walletToken.split('.')[1] || ''));
                const walletId = getPersonalWalletTenantId() || payload.walletId || payload.tenantId || payload.sub;
                if (!walletId) throw new Error('Personal wallet identity is missing');

                const res = await axios.post(
                    `${holderBackend}/api/wallet/${walletId}/exchange/matchCredentialsForPresentationDefinition`,
                    {
                        presentationRequest: presentationRequestUrl,
                        ...(shareOrgTenantId && { orgTenantId: shareOrgTenantId }),
                        ...((proofStage || presentationMode) && { stage: proofStage || presentationMode }),
                    },
                    { headers: { Authorization: `Bearer ${walletToken}` }, signal: controller.signal },
                );

                if (!Array.isArray(res.data)) throw new Error('Invalid wallet matching response');
                const matches = res.data;
                const missingDetails = matches.some((match: any) => !match?.claims || Object.keys(match.claims).length === 0);
                if (missingDetails && matches.length > 0) {
                    try {
                        const listRes = await axios.get(
                            `${holderBackend}/api/wallet/${walletId}/credentials`,
                            { headers: { Authorization: `Bearer ${walletToken}` } },
                        );
                        const rows = Array.isArray(listRes.data) ? listRes.data : [];
                        const byId = new Map(rows.map((row: any) => [String(row.id), row]));
                        for (const match of matches) {
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
                if (cancelled) return;
                setApprovalMatches(matches);
                setSelectedApprovalCredentialIds(
                    matches
                        .map((match) => resolveCredentialId(match))
                        .filter((id): id is string => typeof id === 'string' && id.length > 0),
                );
            } catch (err) {
                if (cancelled) return;
                console.error('Failed to match approval credentials:', err);
                setApprovalError('Could not check your wallet records. Try again, or sign in again if your session has expired.');
            } finally {
                if (!cancelled) setApprovalLoading(false);
            }
        };

        void initializeApprovalMode();
        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [holderBackend, presentationMode, presentationRequestUrl, proofStage, router.isReady, shareOrgTenantId, approvalAttempt]);

    const handleApprovalSubmit = async () => {
        if (!presentationRequestUrl || presentationMode !== 'approval') return;

        const walletToken = getPersonalWalletToken();
        if (!walletToken) {
            feedback.error('Please sign in to your wallet before continuing.', { title: 'Session required' });
            return;
        }

        if (!approvalConsentChecked) {
            feedback.warn('Tick the box to agree to share the selected details.', { title: 'Confirmation needed' });
            return;
        }

        const credentialsToSubmit = selectedApprovalCredentialIds.length > 0 ? selectedApprovalCredentialIds : approvalMatches
            .map((match) => resolveCredentialId(match))
            .filter((id): id is string => typeof id === 'string' && id.length > 0);

        if (credentialsToSubmit.length === 0) {
            feedback.error('No wallet credential matches the request.', { title: 'No credential selected' });
            return;
        }

        try {
            setApprovalSubmitting(true);
            const payload = JSON.parse(atob(walletToken.split('.')[1] || ''));
            const walletId = getPersonalWalletTenantId() || payload.walletId || payload.tenantId || payload.sub;
            if (!walletId) throw new Error('Wallet ID is missing from your session.');

            const submissionRes = await axios.post(
                `${holderBackend}/api/wallet/${walletId}/exchange/usePresentationRequest`,
                {
                    presentationRequest: presentationRequestUrl,
                    selectedCredentials: credentialsToSubmit,
                    ...(shareOrgTenantId && { orgTenantId: shareOrgTenantId }),
                    ...((proofStage || presentationMode) && { stage: proofStage || presentationMode }),
                },
                { headers: { Authorization: `Bearer ${walletToken}` } },
            );

            const directPost = Boolean(submissionRes.data?.directPost);
            const redirectUri = submissionRes.data?.redirectUri;
            if (!directPost && !redirectUri) throw new Error('Wallet did not return a verifier submission payload.');

            // Shared with the requisition approve call below (direct-post submissions leave them empty).
            let vpToken: string | undefined;
            let idToken: string | undefined;
            let presentationSubmission: any;
            let effectiveState: string | undefined = requestId;
            if (!directPost) {
                const parsedRedirect = parseRedirectUri(redirectUri);
                vpToken = parsedRedirect.vpToken;
                idToken = parsedRedirect.idToken;
                presentationSubmission = parsedRedirect.presentationSubmission;
                effectiveState = parsedRedirect.state || requestId;
                if ((!vpToken && !idToken) || !effectiveState) {
                    throw new Error('Wallet submission is missing vp_token/id_token or verification state.');
                }

                const verifierToken = localStorage.getItem('credoTenantToken') || walletToken;
                const verifyRes = await axios.post(
                    `${holderBackend}/oidc/verifier/verify`,
                    {
                        requestId,
                        state: effectiveState,
                        verifiablePresentation: vpToken,
                        idToken,
                        presentationSubmission,
                    },
                    { headers: { Authorization: `Bearer ${verifierToken}` } },
                );

                if (!verifyRes?.data?.verified) {
                    throw new Error(verifyRes?.data?.error || 'Presentation verification failed on verifier.');
                }
            }

            const orgToken = getOrgScopedToken() || localStorage.getItem('credoTenantToken') || walletToken;
            if (workflowRunId && (proofStage === 'acknowledgement' || proofStage === 'payout')) {
                const done = await axios.post(
                    `${holderBackend}/workflows/runs/${encodeURIComponent(workflowRunId)}/proof/complete`,
                    { stage: proofStage, requestId },
                    { headers: { Authorization: `Bearer ${orgToken}` } },
                );
                if (done.data?.status === 'failed' || done.data?.error) {
                    throw new Error(String(done.data?.error || 'This step was not accepted.'));
                }
            } else if (requisitionId && requisitionAction === 'release') {
                const amountRaw = queryValue(router.query.amount) || fallbackQuery.amount;
                const currency = queryValue(router.query.currency) || fallbackQuery.currency;
                const releasePayload: Record<string, unknown> = {};
                const parsedAmount = amountRaw !== undefined ? Number(amountRaw) : undefined;
                if (typeof parsedAmount === 'number' && Number.isFinite(parsedAmount)) releasePayload.amount = parsedAmount;
                if (currency) releasePayload.currency = currency;
                const released = await axios.post(
                    `${holderBackend}/api/finance/requisitions/${encodeURIComponent(requisitionId)}/release`,
                    releasePayload,
                    { headers: { Authorization: `Bearer ${orgToken}`, 'x-idempotency-key': `wallet-release:${requisitionId}:${requestId}` } },
                );
                if (released.data?.error) throw new Error(String(released.data.error));
            } else if (requisitionId && requisitionAction === 'ack') {
                const notes = queryValue(router.query.notes) || fallbackQuery.notes || 'Goods or services received.';
                const acked = await axios.post(
                    `${holderBackend}/api/finance/requisitions/${encodeURIComponent(requisitionId)}/ack`,
                    { notes },
                    { headers: { Authorization: `Bearer ${orgToken}`, 'x-idempotency-key': `wallet-ack:${requisitionId}:${requestId}` } },
                );
                if (acked.data?.error) throw new Error(String(acked.data.error));
            } else if (requisitionId) {
                await axios.post(
                    `${holderBackend}/api/finance/requisitions/${encodeURIComponent(requisitionId)}/approve`,
                    { requestId, state: effectiveState, vpToken, idToken, presentationSubmission },
                    { headers: { Authorization: `Bearer ${orgToken}`, 'x-idempotency-key': `wallet-approve:${requisitionId}:${requestId}` } },
                );
            }

            feedback.success('The selected details were shared and this step has continued.', { title: 'Proof shared' });
            router.push(returnTo || '/finance');
        } catch (err: any) {
            console.error('Embedded approval failed:', err);
            feedback.fromError(err, { title: 'Approval failed', fallback: 'Unable to continue the approval flow.' });
        } finally {
            setApprovalSubmitting(false);
        }
    };

    // Group credentials by type
    const filed = (c: WalletCredential) => archivedIds.has(c.id) || cardLife({
        withdrawn: c.withdrawn,
        revocationReason: c.revocationReason,
        expiresAt: c.parsedDocument?.expirationDate,
    }).fileAway
    const live = credentials.filter((c) => !filed(c))
    const archivedCards = credentials.filter(filed)
    const expiredInView = live.filter((c) => cardLife({
        withdrawn: c.withdrawn,
        revocationReason: c.revocationReason,
        expiresAt: c.parsedDocument?.expirationDate,
    }).life === 'expired').length
    // Filed under the same words as the inbox tabs (shared with the phone); only sections that hold a card are shown.
    const sections = RECORD_SECTION_ORDER.map((key: RecordSectionKey) => ({
        key,
        title: RECORD_SECTION_LABELS[key],
        rows: live.filter((c) => recordSectionOf(c.type, c.parsedDocument?.credentialSubject) === key),
    })).filter((section) => section.rows.length > 0);
    const matchesSearch = (credential: WalletCredential) => {
        const subject = credential.parsedDocument?.credentialSubject;
        const words = [
            recordCardTitle(credential.type, subject) || formatCredentialType(credential.type),
            credential.issuerName || credentialIssuerLabel(subject, credential.issuerDid),
        ].join(' ').toLowerCase();
        return words.includes(search.trim().toLowerCase());
    };
    useEffect(() => {
        if (category !== 'all' && !sections.some((section) => section.key === category)) {
            setCategory('all');
        }
    }, [category, sections]);

    const displayedSections = sections
        .filter((section) => category === 'all' || category === section.key)
        .map((section) => ({ ...section, rows: section.rows.filter(matchesSearch) }))
        .filter((section) => section.rows.length > 0);
    const displayedArchived = archivedCards.filter(matchesSearch);
    const sectionIcon = (key: RecordSectionKey) =>
        key === 'payments' || key === 'school_fees' || key === 'counter_sales'
            ? <IconReceipt size={20} color="green" />
            : key === 'jobs' || key === 'requisitions' || key === 'people'
                ? <IconFileInvoice size={20} color="blue" />
                : <IconCertificate size={20} color="violet" />;

    const showApprovalConsent = walletReady && presentationMode === 'approval' && !approvalLoading && !approvalError && approvalMatches.length > 0;

    return (
        <Layout title="My wallet">
            <Container size="lg" py="xl">
                {walletReady && presentationMode === 'approval' && !showApprovalConsent && (
                    <Paper shadow="sm" p="xl" radius="md" mb="xl" withBorder>
                        <Stack gap="sm">
                            <Title order={3}>Review what you are sharing</Title>
                            {approvalLoading ? (
                                <Group role="status">
                                    <Loader size="sm" />
                                    <Text>Checking your wallet records…</Text>
                                </Group>
                            ) : (
                                <>
                                    <Alert color={approvalError ? 'red' : 'orange'} title={approvalError ? 'Could not prepare sharing' : 'No matching records'}>
                                        {approvalError || 'Your wallet has no matching record for this step. Keep the required staff or role card from your personal inbox, or ask the organization to send it again. Nothing has been shared and the step is still waiting.'}
                                    </Alert>
                                    <Button variant="light" onClick={() => setApprovalAttempt((attempt) => attempt + 1)}>
                                        Check again
                                    </Button>
                                </>
                            )}
                        </Stack>
                    </Paper>
                )}
                {showApprovalConsent && (
                    <Paper shadow="sm" p="xl" radius="md" mb="xl" withBorder>
                        <Stack gap="lg">
                            <Group justify="space-between" align="flex-start" wrap="nowrap">
                                <div>
                                    <Title order={3}>Review what you are sharing</Title>
                                    <Text c="dimmed" size="sm">Check the details below. Only these are shared, and only for this step.</Text>
                                </div>
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
                                {(() => {
                                    const fromMatch = approvalMatches.map((match) => String((match as { purpose?: string })?.purpose || '').trim()).find(Boolean);
                                    const line = fromMatch || sharePurposeLine({
                                        mode: queryValue(router.query.mode) || presentationMode,
                                        purpose: queryValue(router.query.purpose),
                                        reference: queryValue(router.query.reference),
                                        amount: queryValue(router.query.amount),
                                        currency: queryValue(router.query.currency),
                                    });
                                    return line ? <Text fw={600}>{line}</Text> : null;
                                })()}
                                {approvalMatches.map((match, index) => {
                                    const cred = parseCredentialSummary(match);
                                    const credentialId = resolveCredentialId(match);
                                    const { shared, withheld } = splitShareClaims(match);
                                    const checked = !!credentialId && selectedApprovalCredentialIds.includes(credentialId);

                                    return (
                                        <Paper key={credentialId || index} p="md" radius="md" withBorder>
                                            <Group gap="sm" wrap="nowrap">
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={(event) => {
                                                        if (!credentialId) return;
                                                        setSelectedApprovalCredentialIds((prev) =>
                                                            event.target.checked ? Array.from(new Set([...prev, credentialId])) : prev.filter((id) => id !== credentialId),
                                                        );
                                                    }}
                                                    aria-label="Select credential for proof"
                                                />
                                                <Box style={{ flex: 1 }}>
                                                    <Text fw={600}>{formatCredentialType(String(cred.type || 'Credential'))}</Text>
                                                    <Text size="xs" c="dimmed">Issuer: {cred.issuer}</Text>
                                                    <Text size="xs" fw={700} mt={8}>Shared</Text>
                                                    <Stack gap={2} mt={2}>
                                                        {shared.length > 0 ? shared.map((claim) => (
                                                            <Text key={`${credentialId || index}-shared-${claim.label}`} size="xs">
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
                                                                    <Text key={`${credentialId || index}-held-${claim.label}`} size="xs" c="dimmed">
                                                                        {claim.label}: {claim.value}
                                                                    </Text>
                                                                ))}
                                                            </Stack>
                                                        </>
                                                    ) : shared.length > 0 ? (
                                                        <Text size="xs" c="dimmed" mt={6}>The whole record is shared.</Text>
                                                    ) : null}
                                                </Box>
                                            </Group>
                                        </Paper>
                                    );
                                })}
                            </Stack>

                            <Paper p="sm" radius="md" withBorder>
                                <Text fw={600} size="sm">Why this is needed</Text>
                                <Text size="sm" c="dimmed" mt={4}>
                                    {workflowRunId
                                        ? (proofStage === 'payout'
                                            ? 'This checks that you are the person chosen to release the worker payout for this job.'
                                            : 'This checks that you are the person chosen to sign off this job.')
                                        : requisitionAction === 'release'
                                            ? 'This checks that you are the person chosen to release the money.'
                                            : requisitionAction === 'ack'
                                                ? 'This checks that you received the goods or services.'
                                                : 'This checks that you are the person chosen to approve this request.'}
                                </Text>
                            </Paper>

                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={approvalConsentChecked}
                                    onChange={(event) => setApprovalConsentChecked(event.target.checked)}
                                />
                                <Text size="sm">I agree to share the selected details and continue.</Text>
                            </label>

                            <Button
                                fullWidth
                                size="lg"
                                color="violet"
                                loading={approvalSubmitting}
                                disabled={selectedApprovalCredentialIds.length === 0 || !approvalConsentChecked}
                                onClick={handleApprovalSubmit}
                            >
                                Share and continue
                            </Button>
                        </Stack>
                    </Paper>
                )}

                {/* Header */}
                <Box mb="xl">
                    <Group justify="space-between">
                        <Group>
                            <IconWallet size={32} color="#2188CA" />
                            <div>
                                <Title order={1} c="#0F3F5E">{orgRecords ? 'Organisation records' : userEmail === 'Guest Session' ? 'Guest wallet' : 'My wallet'}</Title>
                                <Text size="sm" c="dimmed">{orgRecords
                                    ? `Records ${activeOrg?.name || 'the organisation'} keeps: site checks, completions and receipts.`
                                    : 'Your personal credentials, kept together.'}</Text>
                            </div>
                        </Group>
                        <Group>
                            <Button
                                variant="subtle"
                                leftSection={<IconRefresh size={18} />}
                                onClick={refreshRecords}
                                loading={loading}
                            >
                                Refresh
                            </Button>
                            {!orgRecords && <Button
                                variant={userEmail === 'Guest Session' ? 'filled' : 'subtle'}
                                color={userEmail === 'Guest Session' ? 'blue' : 'red'}
                                leftSection={userEmail === 'Guest Session' ? <IconUser size={18} /> : <IconLogout size={18} />}
                                onClick={handleLogout}
                            >
                                {userEmail === 'Guest Session' ? 'Log In / Sign Up' : 'Sign Out'}
                            </Button>}
                        </Group>
                    </Group>
                </Box>

                <Tabs value={walletTab} onChange={setWalletTab} mb="lg">
                    <Tabs.List>
                        <Tabs.Tab value="saved">Saved ({live.length})</Tabs.Tab>
                        <Tabs.Tab value="archived">Archived ({archivedCards.length})</Tabs.Tab>
                    </Tabs.List>
                </Tabs>
                <TextInput aria-label="Search wallet" placeholder="Search by credential or issuer" leftSection={<IconSearch size={18} />}
                    value={search} onChange={(event) => setSearch(event.currentTarget.value)} radius="xl" mb="lg" />
                {walletTab === 'saved' && sections.length > 0 && (
                    <Group gap="xs" mb="xl" role="group" aria-label="Credential categories">
                        <Button radius="xl" size="xs" variant={category === 'all' ? 'filled' : 'light'} aria-pressed={category === 'all'} onClick={() => setCategory('all')}>All ({live.length})</Button>
                        {sections.map((section) => (
                            <Button key={section.key} radius="xl" size="xs" variant={category === section.key ? 'filled' : 'light'}
                                aria-pressed={category === section.key} onClick={() => setCategory(section.key)}>
                                {section.title} ({section.rows.length})
                            </Button>
                        ))}
                    </Group>
                )}

                {orgRecords && !loading && orgPending.length > 0 && (
                    <Paper withBorder radius="md" p="md" mb="xl">
                        <Group justify="space-between" mb="sm">
                            <Title order={4}>Waiting to be added ({orgPending.length})</Title>
                            <Text size="xs" c="dimmed">Add each one so the organisation can show it later.</Text>
                        </Group>
                        <Stack gap="xs">
                            {orgPending.map((offer) => (
                                <Group key={offer.id} justify="space-between" wrap="nowrap" gap="sm">
                                    <Box style={{ minWidth: 0 }}>
                                        <Text fw={600} size="sm" truncate>{offer.title || formatCredentialType(offer.credentialType)}</Text>
                                        <Text size="xs" c="dimmed" truncate>
                                            {[offer.issuerName, offer.createdAt ? formatTxnTime(offer.createdAt) : ''].filter(Boolean).join(' · ')}
                                        </Text>
                                    </Box>
                                    <Button size="xs" loading={addingOfferId === offer.id} disabled={Boolean(addingOfferId) && addingOfferId !== offer.id}
                                        onClick={() => void addOrganisationRecord(offer)}>
                                        Add to records
                                    </Button>
                                </Group>
                            ))}
                        </Stack>
                    </Paper>
                )}

                {/* Error state */}
                {error && (
                    <Alert icon={<IconAlertCircle size={16} />} title="Error" color="red" mb="xl">
                        {error}
                    </Alert>
                )}

                {/* Loading state */}
                {loading && (
                    <Box ta="center" py="xl">
                        <Loader size="lg" />
                        <Text mt="md" c="dimmed">Loading your saved items...</Text>
                    </Box>
                )}

                {!loading && expiredInView > 0 && (
                    <Alert color="gray" title="Some cards have expired" mb="xl">
                        They are shown in grey. Open one and archive it so your live cards stay easy to find.
                    </Alert>
                )}

                {/* Empty state */}
                {!loading && live.length === 0 && archivedCards.length === 0 && (
                    <Paper shadow="sm" p="xl" radius="md" withBorder ta="center">
                        <IconReceipt size={64} color="#ccc" style={{ margin: '0 auto' }} />
                        <Title order={3} mt="md">No Saved Items Yet</Title>
                        <Text c="dimmed" mt="sm">
                            Receipts, job sign-offs and other documents you are given will appear here.
                        </Text>
                    </Paper>
                )}

                {!loading && walletTab === 'saved' && displayedSections.map((section) => (
                    <Box mb="xl" key={section.key}>
                        <Group mb="md">
                            {sectionIcon(section.key)}
                            <Title order={4}>{section.title}</Title>
                        </Group>
                        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
                            {section.rows.map((cred) => (
                                <CredentialCard
                                    key={cred.id}
                                    credential={cred}
                                    onView={() => handleViewDetails(cred)}
                                />
                            ))}
                        </SimpleGrid>
                    </Box>
                ))}

                {!loading && walletTab === 'archived' && (
                    <Box mb="xl">
                        <Group mb="md">
                            <Title order={4}>Archived</Title>
                        </Group>
                        <Text size="sm" c="dimmed" mb="md">
                            Replaced and withdrawn cards cannot be used. Cards you archived yourself can be restored if they are still current.
                        </Text>
                        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
                            {displayedArchived.map((cred) => (
                                <CredentialCard
                                    key={cred.id}
                                    credential={{ ...cred, archived: archivedIds.has(cred.id) }}
                                    onView={() => handleViewDetails(cred)}
                                />
                            ))}
                        </SimpleGrid>
                    </Box>
                )}
                {!loading && !error && (walletTab === 'archived' ? displayedArchived.length === 0 : live.length > 0 && displayedSections.length === 0) && (
                    <Text c="dimmed" ta="center" py="xl">{search ? 'No credentials match your search.' : 'No archived credentials.'}</Text>
                )}

                {/* Credential Details Modal */}
                <Modal
                    opened={detailsModalOpen}
                    onClose={() => setDetailsModalOpen(false)}
                    title="Credential details"
                    size="lg"
                    radius="xl"
                    centered
                >
                    {selectedCredential && (
                        <Stack>
                            <CredentialCard credential={{ ...selectedCredential, archived: archivedIds.has(selectedCredential.id) }} detail />
                            {(() => {
                                const life = cardLife({
                                    withdrawn: selectedCredential.withdrawn,
                                    revocationReason: selectedCredential.revocationReason,
                                    expiresAt: selectedCredential.parsedDocument?.expirationDate,
                                })
                                const canRestore = archivedIds.has(selectedCredential.id) && !life.fileAway
                                if (!life.note && !canRestore) return null
                                return (
                                    <>
                                        {life.note && (
                                        <Alert color={life.life === 'replaced' ? 'orange' : life.life === 'withdrawn' ? 'red' : 'gray'} variant="light">
                                            {life.note}
                                        </Alert>
                                        )}
                                        {life.life === 'expired' && !archivedIds.has(selectedCredential.id) && (
                                            <Button
                                                color="gray"
                                                onClick={() => {
                                                    setCardArchived(selectedCredential.id, true)
                                                    setArchivedIds(readArchivedCardIds())
                                                    setDetailsModalOpen(false)
                                                }}
                                            >
                                                Archive this card
                                            </Button>
                                        )}
                                        {archivedIds.has(selectedCredential.id) && !life.fileAway && (
                                            <Button
                                                variant="light"
                                                onClick={() => {
                                                    setCardArchived(selectedCredential.id, false)
                                                    setArchivedIds(readArchivedCardIds())
                                                    setDetailsModalOpen(false)
                                                }}
                                            >
                                                Restore
                                            </Button>
                                        )}
                                    </>
                                )
                            })()}

                            <Divider />

                            <Text fw={600}>What this record says</Text>
                            <ScrollArea.Autosize mah={300}>
                                <Stack gap={6}>
                                    {credentialClaimRows(selectedCredential.parsedDocument?.credentialSubject).map((row) => (
                                        <Group key={row.label} justify="space-between" align="flex-start" wrap="nowrap" gap="md">
                                            <Text size="sm" c="dimmed" style={{ flexShrink: 0 }}>{row.label}</Text>
                                            <Text size="sm" fw={500} ta="right" style={{ overflowWrap: 'anywhere', minWidth: 0 }} tt={row.label === 'Role' ? 'capitalize' : undefined}>{row.value}</Text>
                                        </Group>
                                    ))}
                                    {credentialClaimRows(selectedCredential.parsedDocument?.credentialSubject).length === 0 && (
                                        <Text size="sm" c="dimmed">No details on this record.</Text>
                                    )}
                                </Stack>
                            </ScrollArea.Autosize>

                            <Divider />

                            <Group justify="space-between">
                                <Text size="sm" c="dimmed">From</Text>
                                <Text size="sm">{selectedCredential.issuerName || credentialIssuerLabel(selectedCredential.parsedDocument?.credentialSubject, selectedCredential.issuerDid)}</Text>
                            </Group>
                            <Group justify="space-between">
                                <Text size="sm" c="dimmed">Issued On</Text>
                                <Text size="sm">{formatTxnTime(selectedCredential.addedOn)}</Text>
                            </Group>

                            <Divider />
                            {!selectedCredential.withdrawn && (
                                <RecordCheckPanel
                                    presetReference={selectedCredential.issuedId || selectedCredential.id}
                                    onRevoked={() => {
                                        setCredentials((prev) => prev.map((c) => c.id === selectedCredential.id ? { ...c, withdrawn: true } : c))
                                        setSelectedCredential(null)
                                    }}
                                />
                            )}
                            {!orgRecords && <Group justify="flex-end">
                                <Button
                                    variant="subtle"
                                    color="red"
                                    size="xs"
                                    leftSection={<IconTrash size={14} />}
                                    loading={removingCredential}
                                    onClick={() => void handleRemoveCredential(selectedCredential)}
                                >
                                    Remove from this device
                                </Button>
                            </Group>}
                        </Stack>
                    )}
                </Modal>
            </Container>
        </Layout>
    );
}
