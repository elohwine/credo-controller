import React, { useState, useContext, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
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
    Code,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
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
    IconShieldCheck,
    IconAlertCircle,
    IconShoppingCart,
    IconUser,
    IconBrandWhatsapp,
} from '@tabler/icons-react';
import axios from 'axios';
import { getPersonalWalletTenantId, getPersonalWalletToken } from '@/utils/portalTenant';
import { clearStoredOrganizationContext, getOrgScopedToken } from '@/utils/organizationContext';

interface WalletCredential {
    id: string;
    type: string;
    issuerDid: string;
    addedOn: string;
    parsedDocument?: {
        credentialSubject?: Record<string, any>;
        issuer?: string | { id: string };
        issuanceDate?: string;
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

const CREDENTIAL_COLORS: Record<string, string> = {
    PaymentReceiptVC: 'green',
    PaymentReceipt: 'green',
    InvoiceVC: 'blue',
    Invoice: 'blue',
    GenericID: 'violet',
    GenericIDCredential: 'violet',
};

function formatCredentialType(type: string): string {
    return type
        .replace(/VC$/, '')
        .replace(/Credential$/, '')
        .replace(/([A-Z])/g, ' $1')
        .trim();
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

function extractRequestedClaims(match: any): Array<{ label: string; value: string }> {
    if (match?.claims && typeof match.claims === 'object' && !Array.isArray(match.claims)) {
        const rows = Object.entries(match.claims)
            .filter(([, value]) => value != null && String(value).trim() !== '' && !String(value).startsWith('did:'))
            .slice(0, 6)
            .map(([key, value]) => ({
                label: key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (char) => char.toUpperCase()),
                value: String(value),
            }));
        if (rows.length > 0) return rows;
    }
    const document = credentialDocument(match);
    if (!document) return [];

    const subject = document.credentialSubject || document.vc?.credentialSubject;
    if (!subject || typeof subject !== 'object') return [];
    const nested = subject.claims && typeof subject.claims === 'object' ? subject.claims : {};
    const flat = { ...subject, ...nested };

    return Object.entries(flat)
        .filter(([key, value]) => key !== 'id' && key !== 'claims' && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') && String(value).trim() !== '')
        .filter(([, value]) => !String(value).startsWith('did:'))
        .slice(0, 6)
        .map(([key, value]) => ({
            label: key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (char) => char.toUpperCase()),
            value: String(value),
        }));
}

function CredentialCard({ credential, onView }: { credential: WalletCredential; onView: () => void }) {
    const displayType = formatCredentialType(credential.type);
    const color = CREDENTIAL_COLORS[credential.type] || 'gray';
    const icon = CREDENTIAL_ICONS[credential.type] || <IconCertificate size={24} />;

    const subject = credential.parsedDocument?.credentialSubject || {};
    const issuer = typeof credential.parsedDocument?.issuer === 'string'
        ? credential.parsedDocument.issuer
        : credential.parsedDocument?.issuer?.id || credential.issuerDid;

    // Extract key display fields based on credential type
    let displayFields: { label: string; value: string }[] = [];

    if (credential.type.includes('Receipt') || credential.type.includes('Payment')) {
        displayFields = [
            { label: 'Amount', value: subject.amount || subject.totalAmount || '-' },
            { label: 'Merchant', value: subject.merchantName || subject.merchant || '-' },
            { label: 'Date', value: subject.paymentDate || subject.timestamp || credential.addedOn?.split('T')[0] || '-' },
        ];
    } else if (credential.type.includes('Invoice')) {
        displayFields = [
            { label: 'Total', value: subject.total || subject.amount || '-' },
            { label: 'Cart ID', value: subject.cartId?.slice(0, 12) || '-' },
            { label: 'Status', value: subject.status || 'issued' },
        ];
    } else {
        displayFields = [
            { label: 'Name', value: subject.name || subject.username || '-' },
            { label: 'Email', value: subject.email || '-' },
        ];
    }

    return (
        <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Card.Section withBorder inheritPadding py="xs">
                <Group justify="space-between">
                    <Group>
                        <Box c={color}>{icon}</Box>
                        <div>
                            <Text fw={600}>{displayType}</Text>
                            <Text size="xs" c="dimmed">
                                {new Date(credential.addedOn).toLocaleDateString()}
                            </Text>
                        </div>
                    </Group>
                    <Badge color={color} variant="light">
                        ✓ Authentic
                    </Badge>
                </Group>
            </Card.Section>

            <Stack gap="xs" mt="md">
                {displayFields.map((field, idx) => (
                    <Group key={idx} justify="space-between">
                        <Text size="sm" c="dimmed">{field.label}</Text>
                        <Text size="sm" fw={500}>{field.value}</Text>
                    </Group>
                ))}
            </Stack>

            <Divider my="sm" />

            <Group justify="space-between">
                <Text size="xs" c="dimmed" style={{ maxWidth: '60%' }} truncate>
                    From: {issuer?.includes('did:') ? 'Verified Merchant' : issuer?.slice(0, 30) + '...'}
                </Text>
                <Group gap="xs">
                    <ActionIcon
                        variant="light"
                        color="green"
                        size="sm"
                        onClick={() => {
                            const msg = encodeURIComponent(
                                `${credential.type.includes('Receipt') ? '🧾 Receipt' : '📝 Invoice'}\n\n` +
                                `${displayFields.map(f => `${f.label}: ${f.value}`).join('\n')}\n\n` +
                                `✅ Verified Authentic`
                            );
                            window.open(`https://wa.me/?text=${msg}`, '_blank');
                        }}
                        title="Share to WhatsApp"
                    >
                        <IconBrandWhatsapp size={14} />
                    </ActionIcon>
                    <Button
                        variant="light"
                        size="xs"
                        leftSection={<IconEye size={14} />}
                        onClick={onView}
                    >
                        View
                    </Button>
                </Group>
            </Group>
        </Card>
    );
}

export default function WalletPage() {
    const router = useRouter();
    const env = useContext(EnvContext);
    const [credentials, setCredentials] = useState<WalletCredential[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [userEmail, setUserEmail] = useState<string>('');
    const [selectedCredential, setSelectedCredential] = useState<WalletCredential | null>(null);
    const [detailsModalOpen, setDetailsModalOpen] = useState(false);
    const [approvalMatches, setApprovalMatches] = useState<any[]>([]);
    const [selectedApprovalCredentialIds, setSelectedApprovalCredentialIds] = useState<string[]>([]);
    const [approvalConsentChecked, setApprovalConsentChecked] = useState(false);
    const [approvalSubmitting, setApprovalSubmitting] = useState(false);

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
    const returnTo = queryValue(router.query.returnTo)
        || fallbackQuery.returnTo
        || '/requests?requestType=requisition';

    const fetchCredentials = useCallback(async () => {
        // Mirror fastlane behavior: holder flows use personal wallet token first.
        const userToken = getPersonalWalletToken() || localStorage.getItem('authToken') || localStorage.getItem('auth.token');
        const guestToken = localStorage.getItem('credoTenantToken');
        
        // Determine mode
        const token = userToken || guestToken;
        const isGuest = !userToken && !!guestToken;
        
        if (!token) {
            router.push('/auth');
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
                const storedEmail = localStorage.getItem('walletEmail') || localStorage.getItem('walletPhone');
                setUserEmail(storedEmail || payload.email || payload.username || 'My Account');
            } else {
                setUserEmail('Guest Session');
            }

            const sessionToken = await axios.post(
                `${holderBackend}/api/ssi/auth/session`,
                { expiresInSeconds: 900 },
                { headers: { Authorization: `Bearer ${token}` } }
            ).then((res) => res.data?.token as string | undefined).catch(() => undefined)

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
        } catch (err: any) {
            console.error('Failed to fetch credentials:', err);
            if (err.response?.status === 401) {
                // Only clear the invalid token
                if (isGuest) localStorage.removeItem('credoTenantToken');
                else localStorage.removeItem('walletToken');
                
                router.push('/auth');
                return;
            }
            setError(err.message || 'Failed to load credentials');
        } finally {
            setLoading(false);
        }
    }, [holderBackend, router]);

    useEffect(() => {
        fetchCredentials();
    }, [fetchCredentials]);

    const handleLogout = () => {
        // Clear User Wallet state
        localStorage.removeItem('walletToken');
        localStorage.removeItem('walletEmail');
        localStorage.removeItem('walletPhone');
        localStorage.removeItem('authToken');
        
        // Clear Guest/Tenant state (Full cleanup)
        localStorage.removeItem('credoTenantId');
        localStorage.removeItem('credoTenantToken');
        localStorage.removeItem('tenantToken');
        clearStoredOrganizationContext();
        
        notifications.show({
            title: 'Logged out',
            message: 'You have been signed out.',
            color: 'blue',
        });
        router.push('/auth');
    };

    const handleViewDetails = (credential: WalletCredential) => {
        setSelectedCredential(credential);
        setDetailsModalOpen(true);
    };

    useEffect(() => {
        const initializeApprovalMode = async () => {
            if (!presentationRequestUrl || presentationMode !== 'approval') return;

            const walletToken = getPersonalWalletToken();
            if (!walletToken) {
                notifications.show({
                    title: 'Personal wallet required',
                    message: 'Switch to your personal holder wallet session to review consent and share claims.',
                    color: 'orange',
                });
                return;
            }

            try {
                const payload = JSON.parse(atob(walletToken.split('.')[1] || ''));
                const walletId = getPersonalWalletTenantId() || payload.walletId || payload.tenantId || payload.sub;
                if (!walletId) return;

                const res = await axios.post(
                    `${holderBackend}/api/wallet/${walletId}/exchange/matchCredentialsForPresentationDefinition`,
                    { presentationRequest: presentationRequestUrl },
                    { headers: { Authorization: `Bearer ${walletToken}` } },
                );

                const matches = Array.isArray(res.data) ? res.data : [];
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
                setApprovalMatches(matches);
                setSelectedApprovalCredentialIds(
                    matches
                        .map((match) => resolveCredentialId(match))
                        .filter((id): id is string => typeof id === 'string' && id.length > 0),
                );
            } catch (err) {
                console.error('Failed to match approval credentials:', err);
            }
        };

        void initializeApprovalMode();
    }, [holderBackend, presentationMode, presentationRequestUrl, router]);

    const handleApprovalSubmit = async () => {
        if (!presentationRequestUrl || presentationMode !== 'approval') return;

        const walletToken = getPersonalWalletToken();
        if (!walletToken) {
            notifications.show({ title: 'Session required', message: 'Please sign in to your wallet before continuing.', color: 'red' });
            return;
        }

        if (!approvalConsentChecked) {
            notifications.show({ title: 'Confirmation needed', message: 'Tick the box to agree to share the selected details.', color: 'yellow' });
            return;
        }

        const credentialsToSubmit = selectedApprovalCredentialIds.length > 0 ? selectedApprovalCredentialIds : approvalMatches
            .map((match) => resolveCredentialId(match))
            .filter((id): id is string => typeof id === 'string' && id.length > 0);

        if (credentialsToSubmit.length === 0) {
            notifications.show({ title: 'No credential selected', message: 'No wallet credential matches the request.', color: 'red' });
            return;
        }

        try {
            setApprovalSubmitting(true);
            const payload = JSON.parse(atob(walletToken.split('.')[1] || ''));
            const walletId = getPersonalWalletTenantId() || payload.walletId || payload.tenantId || payload.sub;
            if (!walletId) throw new Error('Wallet ID is missing from your session.');

            const submissionRes = await axios.post(
                `${holderBackend}/api/wallet/${walletId}/exchange/usePresentationRequest`,
                { presentationRequest: presentationRequestUrl, selectedCredentials: credentialsToSubmit },
                { headers: { Authorization: `Bearer ${walletToken}` } },
            );

            const directPost = Boolean(submissionRes.data?.directPost);
            const redirectUri = submissionRes.data?.redirectUri;
            if (!directPost && !redirectUri) throw new Error('Wallet did not return a verifier submission payload.');

            if (!directPost) {
                const { vpToken, idToken, presentationSubmission, state: redirectState } = parseRedirectUri(redirectUri);
                const effectiveState = redirectState || requestId;
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

            notifications.show({ title: 'Proof shared', message: 'The selected details were shared and this step has continued.', color: 'green' });
            router.push(returnTo || '/finance');
        } catch (err: any) {
            console.error('Embedded approval failed:', err);
            notifications.show({
                title: 'Approval failed',
                message: err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Unable to continue the approval flow.',
                color: 'red',
            });
        } finally {
            setApprovalSubmitting(false);
        }
    };

    // Group credentials by type
    const receipts = credentials.filter(c => c.type.includes('Receipt') || c.type.includes('Payment'));
    const invoices = credentials.filter(c => c.type.includes('Invoice'));
    const others = credentials.filter(c => !c.type.includes('Receipt') && !c.type.includes('Payment') && !c.type.includes('Invoice'));

    const showApprovalConsent = presentationMode === 'approval' && presentationRequestUrl && approvalMatches.length > 0;

    return (
        <Layout title="My Saved Items">
            <Container size="lg" py="xl">
                {showApprovalConsent && (
                    <Paper shadow="sm" p="xl" radius="md" mb="xl" withBorder>
                        <Stack gap="lg">
                            <Group justify="space-between">
                                <div>
                                    <Title order={3}>Review what you are sharing</Title>
                                    <Text c="dimmed" size="sm">Check the details below. Only these are shared, and only for this step.</Text>
                                </div>
                                <Badge color="violet" variant="light">Proof</Badge>
                            </Group>

                            <Stack gap="sm">
                                {approvalMatches.map((match, index) => {
                                    const cred = parseCredentialSummary(match);
                                    const credentialId = resolveCredentialId(match);
                                    const claims = extractRequestedClaims(match);
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
                                                    <Stack gap={4} mt={6}>
                                                        {claims.length > 0 ? claims.map((claim, idx) => (
                                                            <Text key={`${credentialId || index}-${claim.label}-${idx}`} size="xs" c="dimmed">
                                                                {claim.label}: {claim.value}
                                                            </Text>
                                                        )) : (
                                                            <Text size="xs" c="dimmed">No subject claims exposed in this credential summary.</Text>
                                                        )}
                                                    </Stack>
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
                                            ? 'This checks that you are the person chosen to release payment for this job.'
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
                <Paper shadow="sm" p="md" radius="md" mb="xl" withBorder>
                    <Group justify="space-between">
                        <Group>
                            <IconReceipt size={32} color="#2188CA" />
                            <div>
                                <Title order={3}>{userEmail === 'Guest Session' ? 'Guest Receipts' : 'My Saved Items'}</Title>
                                <Text size="sm" c="dimmed">{userEmail}</Text>
                            </div>
                        </Group>
                        <Group>
                            <Button
                                variant="light"
                                leftSection={<IconShoppingCart size={18} />}
                                onClick={() => router.push('/shop')}
                            >
                                Shop
                            </Button>
                            <Button
                                variant="subtle"
                                leftSection={<IconRefresh size={18} />}
                                onClick={fetchCredentials}
                                loading={loading}
                            >
                                Refresh
                            </Button>
                            <Button
                                variant={userEmail === 'Guest Session' ? 'filled' : 'subtle'}
                                color={userEmail === 'Guest Session' ? 'blue' : 'red'}
                                leftSection={userEmail === 'Guest Session' ? <IconUser size={18} /> : <IconLogout size={18} />}
                                onClick={handleLogout}
                            >
                                {userEmail === 'Guest Session' ? 'Log In / Sign Up' : 'Sign Out'}
                            </Button>
                        </Group>
                    </Group>
                </Paper>

                {/* Stats */}
                <SimpleGrid cols={{ base: 1, sm: 3 }} mb="xl">
                    <Paper shadow="sm" p="md" radius="md" withBorder>
                        <Group>
                            <IconReceipt size={24} color="green" />
                            <div>
                                <Text size="xl" fw={700}>{receipts.length}</Text>
                                <Text size="sm" c="dimmed">Receipts</Text>
                            </div>
                        </Group>
                    </Paper>
                    <Paper shadow="sm" p="md" radius="md" withBorder>
                        <Group>
                            <IconFileInvoice size={24} color="blue" />
                            <div>
                                <Text size="xl" fw={700}>{invoices.length}</Text>
                                <Text size="sm" c="dimmed">Invoices</Text>
                            </div>
                        </Group>
                    </Paper>
                    <Paper shadow="sm" p="md" radius="md" withBorder>
                        <Group>
                            <IconCertificate size={24} color="violet" />
                            <div>
                                <Text size="xl" fw={700}>{others.length}</Text>
                                <Text size="sm" c="dimmed">Other Documents</Text>
                            </div>
                        </Group>
                    </Paper>
                </SimpleGrid>

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

                {/* Empty state */}
                {!loading && credentials.length === 0 && (
                    <Paper shadow="sm" p="xl" radius="md" withBorder ta="center">
                        <IconReceipt size={64} color="#ccc" style={{ margin: '0 auto' }} />
                        <Title order={3} mt="md">No Saved Items Yet</Title>
                        <Text c="dimmed" mt="sm">
                            Your receipts and invoices will appear here after you make purchases.
                        </Text>
                        <Button
                            mt="lg"
                            leftSection={<IconShoppingCart size={18} />}
                            onClick={() => router.push('/shop')}
                        >
                            Start Shopping
                        </Button>
                    </Paper>
                )}

                {/* Receipts Section */}
                {!loading && receipts.length > 0 && (
                    <Box mb="xl">
                        <Group mb="md">
                            <IconReceipt size={20} color="green" />
                            <Title order={4}>Payment Receipts</Title>
                        </Group>
                        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
                            {receipts.map((cred) => (
                                <CredentialCard
                                    key={cred.id}
                                    credential={cred}
                                    onView={() => handleViewDetails(cred)}
                                />
                            ))}
                        </SimpleGrid>
                    </Box>
                )}

                {/* Invoices Section */}
                {!loading && invoices.length > 0 && (
                    <Box mb="xl">
                        <Group mb="md">
                            <IconFileInvoice size={20} color="blue" />
                            <Title order={4}>Invoices</Title>
                        </Group>
                        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
                            {invoices.map((cred) => (
                                <CredentialCard
                                    key={cred.id}
                                    credential={cred}
                                    onView={() => handleViewDetails(cred)}
                                />
                            ))}
                        </SimpleGrid>
                    </Box>
                )}

                {/* Other Credentials Section */}
                {!loading && others.length > 0 && (
                    <Box mb="xl">
                        <Group mb="md">
                            <IconCertificate size={20} color="violet" />
                            <Title order={4}>Other Credentials</Title>
                        </Group>
                        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
                            {others.map((cred) => (
                                <CredentialCard
                                    key={cred.id}
                                    credential={cred}
                                    onView={() => handleViewDetails(cred)}
                                />
                            ))}
                        </SimpleGrid>
                    </Box>
                )}

                {/* Credential Details Modal */}
                <Modal
                    opened={detailsModalOpen}
                    onClose={() => setDetailsModalOpen(false)}
                    title={
                        <Group>
                            <IconShieldCheck size={20} color="green" />
                            <Text fw={600}>Credential Details</Text>
                        </Group>
                    }
                    size="lg"
                >
                    {selectedCredential && (
                        <Stack>
                            <Group justify="space-between">
                                <Badge color={CREDENTIAL_COLORS[selectedCredential.type] || 'gray'} size="lg">
                                    {formatCredentialType(selectedCredential.type)}
                                </Badge>
                                <Badge color="green" variant="light" leftSection={<IconShieldCheck size={12} />}>
                                    Verified
                                </Badge>
                            </Group>

                            <Divider />

                            <Text fw={600}>Claims</Text>
                            <ScrollArea h={300}>
                                <Code block>
                                    {JSON.stringify(selectedCredential.parsedDocument?.credentialSubject || {}, null, 2)}
                                </Code>
                            </ScrollArea>

                            <Divider />

                            <Group justify="space-between">
                                <Text size="sm" c="dimmed">Credential ID</Text>
                                <Text size="sm" ff="monospace">{selectedCredential.id.slice(0, 20)}...</Text>
                            </Group>
                            <Group justify="space-between">
                                <Text size="sm" c="dimmed">Issuer</Text>
                                <Text size="sm" ff="monospace">{selectedCredential.issuerDid?.slice(0, 30)}...</Text>
                            </Group>
                            <Group justify="space-between">
                                <Text size="sm" c="dimmed">Issued On</Text>
                                <Text size="sm">{new Date(selectedCredential.addedOn).toLocaleString()}</Text>
                            </Group>
                        </Stack>
                    )}
                </Modal>
            </Container>
        </Layout>
    );
}
