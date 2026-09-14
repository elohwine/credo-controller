import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    Stack, Title, Text, Box, Group, Badge, Card, Center, Loader, Alert,
    ThemeIcon, Drawer, Divider, Button, TextInput, Select, ActionIcon,
    Tabs, Paper, CopyButton, Tooltip, Modal, Code, HoverCard, List,
    Textarea, Grid, Timeline, Progress, SegmentedControl, NumberInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
    IconLink, IconPlus, IconRefresh, IconAlertCircle, IconCheck,
    IconCopy, IconBrandWhatsapp, IconClock, IconCash, IconX,
    IconSchool, IconUsers, IconChevronRight, IconTrash,
    IconExternalLink, IconQrcode, IconShieldCheck, IconWallet, IconReceipt,
    IconPlayerPlay, IconCamera, IconCircleFilled, IconInfoCircle
} from '@tabler/icons-react';
import AppShellMobile from '@/components/layout/AppShellMobile';
import ErrorAlert from '@/components/shared/ErrorAlert';
import api, { safeArray } from '@/lib/api';
import {
    applyOrgContext,
    getActiveOrgId,
    getContextMode,
    getPersonalWalletTenantId,
    getPreferredToken,
    isEmployeeOrgRole,
    getWalletToken,
    isOrgActionRole,
    isReleaseRole,
} from '@/lib/auth';
import {
    findTemplateForCapability,
    getWorkflowCapabilityFlags,
} from '@/lib/workflowCapabilities';
import { requireSensitiveOrgReauth } from '@/lib/offline/localReauth';
import {
    evaluateOrgActionPolicy,
    getCachedOrgContextBundle,
    refreshOrgContextBundle,
    type OrgContextBundleCacheEntry,
    type OrgRoleCapabilities,
} from '@/lib/offline/orgContextBundle';
import dayjs from 'dayjs';
import { useRouter } from 'next/router';
import QRCode from 'react-qr-code';

/* ── Types ── */

interface PaymentLink {
    id: string;
    merchantId: string;
    merchantName?: string;
    description: string;
    amount: number;
    currency: string;
    invoiceRef?: string;
    status: 'active' | 'paid' | 'expired' | 'cancelled';
    expiry?: string;
    shortlinkCode?: string;
    shortlinkUrl?: string;
    plan_type?: string;
    collectionType?: string;
    payer_name?: string;
    plan_id?: string;
    installment_number?: number | string;
    installments_total?: number | string;
    paidAt?: string;
    providerRef?: string;
    payerPhone?: string;
    createdAt: string;
}

interface OrgContact {
    id: string;
    name: string;
    phone?: string;
    email?: string;
}

type AssigneeResolution = {
    assigneeId: string;
    assigneeUserId?: string;
};

interface RequisitionRow {
    id: string;
    status: string;
    workflowRequestId?: string;
    metadata?: {
        department?: string;
        amount?: number;
        totalAmount?: number;
        currency?: string;
        notes?: string;
    };
    updatedAt: string;
}

interface RequisitionDetail {
    status?: string;
    currentStatus?: string;
    timeline?: Array<{
        id?: string;
        eventType?: string;
        source?: string;
        occurredAt?: string;
        amount?: number;
        currency?: string;
        metadata?: Record<string, any>;
    }>;
    summary?: {
        providerRef?: string;
        tenantId?: string;
        status?: string;
        paymentAmount?: number;
        paymentCurrency?: string;
        firstEventAt?: string;
        eventCount?: number;
    };
    events?: Array<{
        id?: string;
        eventType?: string;
        source?: string;
        occurredAt?: string;
        amount?: number;
        currency?: string;
        metadata?: Record<string, any>;
    }>;
    workflowRequestId?: string;
    workflowRequestStatus?: string;
}

interface WorkflowRequestLookup {
    id?: string;
    payload?: {
        requisitionId?: string;
    };
}

interface OrgMemberLite {
    userId: string;
    role: string;
    status: string;
}

interface ApWorkflowActionItem {
    id: string;
    invoice_ref?: string;
    invoice_description?: string;
    workflow_stage?: string;
    status?: string;
    required_action?: string | null;
    required_actor_role?: string | null;
    required_proof_type?: string | null;
    myActionRequired?: boolean;
    updated_at?: string;
    supplier_name?: string;
    amount?: number;
    currency?: string;
    proof_response_id?: string | null;
    consent_timestamp?: string | null;
}

interface ArObligationItem {
    id: string;
    buyer_tenant_id?: string;
    collector_org_name?: string;
    description?: string;
    total_amount?: number;
    amount_due?: number;
    amount_paid?: number;
    currency?: string;
    trust_status?: string;
    status?: string;
    required_action?: string | null;
    required_proof_type?: string | null;
    next_due_date?: string | null;
    overdue_installments?: number;
    proof_request_id?: string | null;
    proof_response_id?: string | null;
}

interface LinkAuditItem {
    id: string;
    actionType?: string;
    actorName?: string;
    resourceId?: string;
    createdAt: string;
    details?: Record<string, any>;
}

interface PaymentFlowStepState {
    key: string;
    label: string;
    description: string;
    status: 'done' | 'active' | 'pending';
    occurredAt?: string;
}

interface PaymentAuditNarrative {
    title: string;
    subtitle: string;
    note?: string;
}

interface DetailStatusLine {
    text: string;
}

interface DetailTimelineItem {
    id: string;
    title: string;
    source: string;
    description?: string;
    note?: string;
    timestamp?: string;
    badge?: {
        label: string;
        color: string;
    };
}

interface WorkflowDetailSection {
    title: string;
    content: React.ReactNode;
}

interface CredentialArtifactDetail {
    title: string;
    credentialId: string;
    credentialType: string;
    status: string;
    issuedAt?: string | null;
    sourceRef?: string | null;
    counterpart?: string | null;
    amount?: number | null;
    currency?: string | null;
    note?: string | null;
}

interface ContactSelectFieldProps {
    label: string;
    placeholder: string;
    contacts: OrgContact[];
    value: string | null;
    onChange: (contact: OrgContact | null) => void;
    description?: string;
    required?: boolean;
    clearable?: boolean;
}

interface FinanceTabGuideProps {
    title: string;
    points: string[];
}

function FinanceTabGuide({ title, points }: FinanceTabGuideProps) {
    return (
        <HoverCard width={320} shadow="md" openDelay={120} closeDelay={120} withinPortal>
            <HoverCard.Target>
                <ActionIcon variant="light" color="blue" radius="xl" aria-label={`Help: ${title}`}>
                    <IconInfoCircle size={16} />
                </ActionIcon>
            </HoverCard.Target>
            <HoverCard.Dropdown>
                <Stack gap={6}>
                    <Text fw={700} size="sm">{title}</Text>
                    <List spacing={4} size="xs" c="dimmed">
                        {points.map((point) => (
                            <List.Item key={point}>{point}</List.Item>
                        ))}
                    </List>
                </Stack>
            </HoverCard.Dropdown>
        </HoverCard>
    );
}

/* ── Helpers ── */

const statusColor: Record<string, string> = {
    active: 'green', paid: 'blue', expired: 'orange', cancelled: 'red',
};

const statusIcon: Record<string, React.ReactNode> = {
    active: <IconCheck size={12} />,
    paid: <IconCash size={12} />,
    expired: <IconClock size={12} />,
    cancelled: <IconX size={12} />,
};

function fmt(n: any, c = 'USD') {
    const num = typeof n === 'number' ? n : Number(n);
    if (isNaN(num)) return '—';
    return new Intl.NumberFormat('en', { style: 'currency', currency: c || 'USD', minimumFractionDigits: 2 }).format(num);
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

function makeIdempotencyKey(scope: string, parts: Array<string | number | undefined>): string {
    const normalized = parts
        .map((part) => String(part ?? '').trim().toLowerCase().replace(/[^a-z0-9:_-]+/g, '-'))
        .join(':')
        .slice(0, 140);
    return `${scope}:${normalized}`;
}

function extractPaymentCode(rawUrl?: string): string | undefined {
    if (!rawUrl) return undefined;
    try {
        const parsed = new URL(rawUrl);
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
        const match = rawUrl.match(/\/(?:v|pay)\/([^/?#]+)/i);
        if (match?.[1]) {
            return decodeURIComponent(match[1]);
        }
    }
    return undefined;
}

function getLinkCheckoutUrl(link: PaymentLink): string | undefined {
    return firstNonEmptyString(
        link.shortlinkUrl,
        (link as any).paymentUrl,
        (link as any).url,
        (link as any).shortUrl,
    );
}

function getLinkRouteToken(link: PaymentLink): string | undefined {
    // Prefer the 6-char shortlink code because link.id may be a plan/collection ID
    // (not a payment link token) when the link comes from the AR collections API.
    return firstNonEmptyString(
        link.shortlinkCode,
        (link as any).paymentCode,
        extractPaymentCode(getLinkCheckoutUrl(link)),
        link.id,
    );
}

function DetailSectionCard({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}) {
    return (
        <Paper p="md" radius="md" withBorder>
            <Stack gap="sm">
                <Text size="xs" c="dimmed" fw={600}>{title}</Text>
                {children}
            </Stack>
        </Paper>
    );
}

function DetailStatusCard({
    status,
    amount,
    currency,
    lines,
    amountColor = 'indigo',
    footer,
}: {
    status: string;
    amount: number | string | undefined;
    currency?: string;
    lines: DetailStatusLine[];
    amountColor?: string;
    footer?: React.ReactNode;
}) {
    return (
        <Paper p="md" radius="md" withBorder>
            <Group justify="space-between" align="center">
                <Box>
                    <Text size="xs" c="dimmed" fw={600}>CURRENT STATUS</Text>
                    <Text fw={700}>{status}</Text>
                </Box>
                <Text fw={700} c={amountColor}>
                    {fmt(amount, currency)}
                </Text>
            </Group>
            <Stack gap={2} mt="sm">
                {lines.map((line, index) => (
                    <Text key={`${line.text}-${index}`} size="xs" c="dimmed">{line.text}</Text>
                ))}
            </Stack>
            {footer}
        </Paper>
    );
}

function DetailTimelineList({
    items,
    emptyText,
    loading = false,
}: {
    items: DetailTimelineItem[];
    emptyText: string;
    loading?: boolean;
}) {
    if (loading) return <Loader size="xs" />;
    if (items.length === 0) return <Text size="sm" c="dimmed">{emptyText}</Text>;

    return (
        <Stack gap="xs">
            {items.map((item) => (
                <Paper key={item.id} p="sm" withBorder radius="md">
                    <Group justify="space-between" align="flex-start">
                        <Box>
                            <Text size="sm" fw={600}>{item.title}</Text>
                            <Text size="xs" c="dimmed">Source: {item.source}</Text>
                            {item.description && (
                                <Text size="xs" c="dimmed" mt={4}>{item.description}</Text>
                            )}
                            {item.note && (
                                <Text size="xs" c="dimmed" mt={4}>{item.note}</Text>
                            )}
                            {item.badge && (
                                <Badge size="xs" mt={6} color={item.badge.color} variant="light">
                                    {item.badge.label}
                                </Badge>
                            )}
                        </Box>
                        <Text size="xs" c="dimmed">{item.timestamp || '—'}</Text>
                    </Group>
                </Paper>
            ))}
        </Stack>
    );
}

function WorkflowDetailBody({
    statusCard,
    sections,
    auditItems,
    auditEmptyText,
    auditLoading = false,
}: {
    statusCard: React.ReactNode;
    sections: WorkflowDetailSection[];
    auditItems: DetailTimelineItem[];
    auditEmptyText: string;
    auditLoading?: boolean;
}) {
    return (
        <Stack gap="md" pb="lg">
            {statusCard}
            {sections.map((section) => (
                <DetailSectionCard key={section.title} title={section.title}>
                    {section.content}
                </DetailSectionCard>
            ))}
            <Divider label="Audit Timeline" labelPosition="left" />
            <DetailTimelineList
                items={auditItems}
                emptyText={auditEmptyText}
                loading={auditLoading}
            />
        </Stack>
    );
}

function formatLedgerLabel(value: unknown, fallback = 'Pending'): string {
    const normalized = String(value || '').trim();
    if (!normalized) return fallback;
    return normalized
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (part) => part.toUpperCase());
}

function trustTone(value: unknown): string {
    const normalized = String(value || '').toLowerCase();
    if (normalized === 'settled' || normalized === 'verified') return 'teal';
    if (normalized === 'proof_presented') return 'indigo';
    if (normalized === 'disputed' || normalized === 'failed') return 'red';
    if (normalized === 'revoked') return 'orange';
    return 'yellow';
}

function workflowTone(value: unknown): string {
    const normalized = String(value || '').toLowerCase();
    if (normalized === 'paid' || normalized === 'completed' || normalized === 'receipt_issued') return 'teal';
    if (normalized === 'proof_presented') return 'indigo';
    if (normalized === 'issued' || normalized === 'pending_payment') return 'blue';
    if (normalized === 'disputed' || normalized === 'failed') return 'red';
    return 'gray';
}

function deriveArProofStage(plan: any, latestWorkflow: any): {
    key: 'issued' | 'proof_requested' | 'proof_presented' | 'settled';
    label: string;
    description: string;
} {
    const trustStatus = String(plan?.trust_status || latestWorkflow?.trust_status || '').toLowerCase();
    const workflowStage = String(latestWorkflow?.workflow_stage || plan?.workflow_stage || plan?.status || '').toLowerCase();
    const hasReceipt = Boolean(plan?.receipt_vc_id || latestWorkflow?.workflow_stage === 'receipt_issued');
    const hasProofResponse = Boolean(plan?.proof_response_id || latestWorkflow?.proof_response_id);
    const hasProofRequest = Boolean(plan?.proof_request_id || latestWorkflow?.proof_request_id);

    if (hasReceipt || trustStatus === 'settled' || workflowStage === 'paid' || workflowStage === 'receipt_issued' || String(plan?.status || '').toLowerCase() === 'completed') {
        return {
            key: 'settled',
            label: 'settled',
            description: 'Wallet proof is complete, payment is settled, and receipt evidence is linked.',
        };
    }

    if (hasProofResponse || trustStatus === 'proof_presented' || workflowStage === 'proof_presented') {
        return {
            key: 'proof_presented',
            label: 'proof_presented',
            description: 'Consent proof was presented. The workflow is ready to continue settlement.',
        };
    }

    if (hasProofRequest) {
        return {
            key: 'proof_requested',
            label: 'proof_requested',
            description: 'A wallet proof request has been issued and is waiting for holder presentation.',
        };
    }

    return {
        key: 'issued',
        label: 'issued',
        description: 'The AR workflow has been issued to the debtor organization and is awaiting proof initiation.',
    };
}

function buildArWorkflowTimelineItems(workflowTransactions: any[]): DetailTimelineItem[] {
    return workflowTransactions.map((tx) => ({
        id: String(tx.id),
        title: `${formatLedgerLabel(tx.workflow_stage, 'Issued')} · ${String(tx.id).slice(0, 12)}`,
        source: 'ar/ap trust workflow',
        description: [
            tx.required_action ? `Action: ${formatLedgerLabel(tx.required_action)}` : null,
            tx.required_proof_type ? `Proof: ${tx.required_proof_type}` : null,
            tx.status ? `Status: ${formatLedgerLabel(tx.status)}` : null,
        ].filter(Boolean).join(' · '),
        note: [
            tx.proof_request_id ? `Request: ${tx.proof_request_id}` : null,
            tx.proof_response_id ? `Response: ${tx.proof_response_id}` : null,
            tx.consent_timestamp ? `Consent: ${dayjs(tx.consent_timestamp).format('D MMM YYYY HH:mm')}` : null,
            tx.source_payment_link_id ? `Link: ${tx.source_payment_link_id}` : null,
        ].filter(Boolean).join(' · ') || undefined,
        timestamp: tx.updated_at ? dayjs(tx.updated_at).format('D MMM YYYY HH:mm') : '—',
        badge: {
            label: formatLedgerLabel(tx.trust_status || tx.status || 'pending'),
            color: trustTone(tx.trust_status || tx.status),
        },
    }));
}

function ContactSelectField({
    label,
    placeholder,
    contacts,
    value,
    onChange,
    description,
    required = false,
    clearable = true,
}: ContactSelectFieldProps) {
    if (contacts.length === 0) {
        return (
            <Alert color="gray" variant="light" icon={<IconUsers size={16} />}>
                No saved contacts yet. Create a contact first if you want to send this workflow directly to someone.
            </Alert>
        );
    }

    return (
        <Select
            label={label}
            required={required}
            placeholder={placeholder}
            description={description}
            data={contacts.map((contact) => ({
                value: contact.id,
                label: `${contact.name}${contact.phone ? ` — ${contact.phone}` : ''}`,
            }))}
            leftSection={<IconUsers size={16} />}
            searchable
            clearable={clearable}
            value={value}
            onChange={(nextValue) => {
                const contact = contacts.find((entry) => entry.id === nextValue) || null;
                onChange(contact);
            }}
        />
    );
}

const FEPT_STAGE_LABEL: Record<string, string> = {
    REQUEST_CREATED: 'Request Created',
    ASSIGNED: 'Assigned to Worker',
    APPROVAL_PENDING: 'Approval Pending',
    APPROVED: 'Approved',
    IN_PROGRESS: 'Work In Progress',
    EVIDENCE_CAPTURED: 'Evidence Captured',
    ACKNOWLEDGED: 'Delivery Acknowledged',
    PAYMENT_TRIGGERED: 'Payment Triggered',
    RECEIPT_ISSUED: 'Receipt Issued',
    RECONCILED: 'Reconciled',
    COMPLETED: 'Completed',
    DISPUTED: 'Disputed',
    CANCELLED: 'Cancelled',
    REVOKED: 'Revoked',
};

const FEPT_STAGE_ORDER = [
    'REQUEST_CREATED',
    'APPROVAL_PENDING',
    'APPROVED',
    'ASSIGNED',
    'IN_PROGRESS',
    'EVIDENCE_CAPTURED',
    'ACKNOWLEDGED',
    'PAYMENT_TRIGGERED',
    'RECEIPT_ISSUED',
    'RECONCILED',
    'COMPLETED',
];

function buildFieldRunAuditItems(run: any): DetailTimelineItem[] {
    const input = run?.output?.workflowInput || run?.input || {};
    const output = run?.output || {};
    const stage = String(output.workflowStage || output.stage || run?.status || '').toUpperCase();
    const runRef = String(input.poNumber || input.reference || run?.id || 'Field Run');
    const assignment = output.assignment || input.assignment || {};
    const items: DetailTimelineItem[] = [];

    if (run?.createdAt || run?.created_at) {
        items.push({
            id: `${run.id}-created`,
            title: 'REQUEST_CREATED',
            source: 'field workflow',
            description: `Run ${runRef} was created for field execution.`,
            note: input.location ? `Location: ${input.location}` : undefined,
            timestamp: dayjs(run.createdAt || run.created_at).format('D MMM YYYY HH:mm'),
        });
    }

    if (assignment?.assignedAt) {
        const assigneeLabel = String(assignment.assigneeId || assignment.assigneeUserId || 'assigned worker');
        items.push({
            id: `${run.id}-assigned`,
            title: 'ASSIGNED',
            source: 'field workflow',
            description: `Assigned to ${assigneeLabel}.`,
            note: assignment.assignmentNote ? `Note: ${assignment.assignmentNote}` : undefined,
            timestamp: dayjs(assignment.assignedAt).format('D MMM YYYY HH:mm'),
        });
    }

    if (stage) {
        items.push({
            id: `${run.id}-stage-${stage}`,
            title: stage,
            source: 'field workflow',
            description: FEPT_STAGE_LABEL[stage] || stage,
            note: input.description ? `Description: ${input.description}` : undefined,
            timestamp: dayjs(run?.updatedAt || run?.updated_at || run?.createdAt || run?.created_at).format('D MMM YYYY HH:mm'),
        });
    }

    return items;
}

function buildFieldRunLifecycleItems(run: any): DetailTimelineItem[] {
    const input = run?.output?.workflowInput || run?.input || {};
    const currentStage = String(run?.output?.workflowStage || run?.output?.stage || run?.status || '').toUpperCase();
    const currentIndex = FEPT_STAGE_ORDER.indexOf(currentStage);

    return FEPT_STAGE_ORDER.map((stage, index) => {
        const status = currentIndex < 0 ? (index === 0 ? 'active' : 'pending') : index < currentIndex ? 'done' : index === currentIndex ? 'active' : 'pending';
        return {
            id: `${run?.id || 'run'}-${stage}`,
            title: FEPT_STAGE_LABEL[stage] || stage,
            source: 'field workflow',
            description: stage === 'REQUEST_CREATED' && input.reference
                ? `Workflow initialized for ${input.reference}.`
                : stage === 'ASSIGNED' && input.assigneeId
                    ? `Assigned to ${input.assigneeId}.`
                    : stage === 'EVIDENCE_CAPTURED'
                        ? 'Before/after proof capture completed for this run.'
                        : stage === 'PAYMENT_TRIGGERED'
                            ? 'Payment release flow was triggered for this run.'
                            : stage === 'RECONCILED'
                                ? 'Workflow outputs and payment trail reconciled.'
                                : `${FEPT_STAGE_LABEL[stage] || stage} stage for this workflow.`,
            timestamp: status === 'done' || status === 'active'
                ? dayjs(run?.updatedAt || run?.updated_at || run?.createdAt || run?.created_at).format('D MMM YYYY HH:mm')
                : '—',
            badge: {
                label: status === 'done' ? 'Done' : status === 'active' ? 'In Progress' : 'Pending',
                color: status === 'done' ? 'green' : status === 'active' ? 'blue' : 'gray',
            },
        };
    });
}

type PaymentFlowKind = 'generic' | 'checkout' | 'invoice' | 'instalment' | 'recurring' | 'one_time';

function getPaymentFlowKind(link: PaymentLink): PaymentFlowKind {
    const planType = String(link.plan_type || link.collectionType || '').trim().toLowerCase();
    if (planType === 'instalment' || planType === 'installment') return 'instalment';
    if (planType === 'recurring') return 'recurring';
    if (planType === 'one_time') return 'one_time';

    const invoiceRef = String(link.invoiceRef || '').trim().toLowerCase();
    const description = String(link.description || '').trim().toLowerCase();

    if (invoiceRef.startsWith('checkout-') || description.startsWith('checkout:')) {
        return 'checkout';
    }

    if (invoiceRef.length > 0) {
        return 'invoice';
    }

    return 'generic';
}

function getPaymentFlowBadge(flow: PaymentFlowKind): { label: string; color: string } {
    if (flow === 'checkout') return { label: 'CHECKOUT FLOW', color: 'cyan' };
    if (flow === 'invoice') return { label: 'INVOICE FLOW', color: 'indigo' };
    if (flow === 'instalment') return { label: 'INSTALMENT PLAN', color: 'orange' };
    if (flow === 'recurring') return { label: 'RECURRING BILL', color: 'pink' };
    if (flow === 'one_time') return { label: 'ONE-TIME COLLECTION', color: 'violet' };
    return { label: 'GENERIC FLOW', color: 'teal' };
}

function getPaymentAuditRefs(link: PaymentLink): string[] {
    const refs = [
        link.id,
        link.shortlinkCode,
        link.invoiceRef,
        link.providerRef,
    ]
        .map((value) => String(value || '').trim())
        .filter(Boolean);

    return Array.from(new Set(refs));
}

function normalizeSignal(raw: unknown): string {
    return String(raw || '')
        .toLowerCase()
        .replace(/[^a-z0-9._:\-\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function eventMatches(entry: LinkAuditItem, tokens: string[]): boolean {
    const bag = [
        entry.actionType,
        entry.resourceId,
        entry.details?.path,
        entry.details?.method,
        entry.details?.error,
        entry.details?.requestSummary?.providerRef,
        entry.details?.requestSummary?.invoiceRef,
    ]
        .map(normalizeSignal)
        .join(' ');

    return tokens.some((token) => bag.includes(token));
}

function firstMatchTime(entries: LinkAuditItem[], tokens: string[]): string | undefined {
    const match = [...entries]
        .sort((a, b) => dayjs(a.createdAt).valueOf() - dayjs(b.createdAt).valueOf())
        .find((entry) => eventMatches(entry, tokens));
    return match?.createdAt;
}

function buildPaymentFlowSteps(link: PaymentLink, audits: LinkAuditItem[]): PaymentFlowStepState[] {
    const isPaid = link.status === 'paid';
    const isStopped = link.status === 'cancelled' || link.status === 'expired';

    const sharedAt = firstMatchTime(audits, ['whatsapp', 'share', 'contact', 'payment-link']);
    const checkoutAt = firstMatchTime(audits, ['public/pay', 'checkout', 'storefront/checkout-link', '/pay/']);
    const initiatedAt = firstMatchTime(audits, ['payment initiated', 'payment request', '/pay', 'ecocash', 'provider']);
    const confirmedAt = isPaid
        ? (link.paidAt || firstMatchTime(audits, ['paid', 'payment completed', 'receipt_issued', 'reconciled']))
        : firstMatchTime(audits, ['paid', 'payment completed', 'receipt_issued', 'reconciled']);
    const receiptAt = firstMatchTime(audits, ['receipt', 'receiptvc', 'sync-receipts', 'reconciled']);

    const progress = {
        created: true,
        shared: Boolean(sharedAt),
        checkout: Boolean(checkoutAt),
        initiated: Boolean(initiatedAt),
        confirmed: Boolean(confirmedAt) || isPaid,
        receipt: Boolean(receiptAt) || (isPaid && Boolean(confirmedAt)),
    };

    const steps: PaymentFlowStepState[] = [
        {
            key: 'created',
            label: 'Link created',
            description: 'Payment reference created and ready for buyer access.',
            status: 'done',
            occurredAt: link.createdAt,
        },
        {
            key: 'shared',
            label: 'Link shared',
            description: 'Buyer received the link from contact/inbox/share channel.',
            status: progress.shared ? 'done' : (isStopped ? 'pending' : 'active'),
            occurredAt: sharedAt,
        },
        {
            key: 'checkout',
            label: 'Checkout opened',
            description: 'Buyer opened in-app checkout or public checkout route.',
            status: progress.checkout ? 'done' : (progress.shared && !isStopped ? 'active' : 'pending'),
            occurredAt: checkoutAt,
        },
        {
            key: 'initiated',
            label: 'Payment initiated',
            description: 'Payment request sent to provider and awaiting confirmation.',
            status: progress.initiated ? 'done' : (progress.checkout && !isStopped ? 'active' : 'pending'),
            occurredAt: initiatedAt,
        },
        {
            key: 'confirmed',
            label: 'Payment confirmed',
            description: 'Provider confirmation received and link marked paid.',
            status: progress.confirmed ? 'done' : (progress.initiated && !isStopped ? 'active' : 'pending'),
            occurredAt: confirmedAt,
        },
        {
            key: 'receipt',
            label: 'Receipt & audit finalized',
            description: 'Receipt credential and traceability entries completed.',
            status: progress.receipt ? 'done' : (progress.confirmed && !isStopped ? 'active' : 'pending'),
            occurredAt: receiptAt,
        },
    ];

    if (isStopped) {
        return steps.map((step, index) => {
            if (index === 0 || step.status === 'done') return step;
            return { ...step, status: 'pending' as const };
        });
    }

    return steps;
}

function toFriendlyPaymentAction(actionType?: string): string {
    const raw = String(actionType || '').trim();
    if (!raw) return 'Payment event';
    const normalized = raw
        .replace(/[_\.]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function describePaymentAuditEvent(entry: LinkAuditItem): PaymentAuditNarrative {
    const action = normalizeSignal(entry.actionType);
    const requestSummary = entry.details?.requestSummary || {};
    const actor = entry.actorName || 'System';
    const source = String(entry.details?.source || entry.details?.path || '').trim();
    const ref = String(
        requestSummary.providerRef
        || requestSummary.invoiceRef
        || requestSummary.paymentId
        || entry.resourceId
        || ''
    ).trim();

    if (action.includes('sync receipts') || action.includes('receipt') || action.includes('reconciled')) {
        return {
            title: 'Receipt reconciled',
            subtitle: `Source: ${source || 'wallet sync'}`,
            note: ref ? `Reference: ${ref}` : undefined,
        };
    }

    if (action.includes('public pay') || action.includes('checkout') || action.includes('payment link')) {
        return {
            title: 'Checkout activity',
            subtitle: `Actor: ${actor}`,
            note: ref ? `Reference: ${ref}` : undefined,
        };
    }

    if (action.includes('wallet auth') || action.includes('auth session')) {
        return {
            title: 'Wallet session established',
            subtitle: `Actor: ${actor}`,
            note: source ? `Source: ${source}` : undefined,
        };
    }

    return {
        title: toFriendlyPaymentAction(entry.actionType),
        subtitle: `Actor: ${actor}`,
        note: ref ? `Reference: ${ref}` : (source ? `Source: ${source}` : undefined),
    };
}

function asNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim().length > 0) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return undefined;
}

function normalizeRunId(value: unknown): string | null {
    const runId = String(value ?? '').trim();
    if (!runId) return null;

    const lowered = runId.toLowerCase();
    if (lowered === 'undefined' || lowered === 'null' || lowered === 'nan') return null;

    return runId;
}

function resolveAssigneeSelection(value: string | null | undefined, ownerUserId: string | null): AssigneeResolution {
    const raw = String(value || 'owner').trim();
    if (!raw || raw === 'owner') {
        return { assigneeId: 'owner', assigneeUserId: ownerUserId || undefined };
    }

    if (raw.startsWith('member:')) {
        const userId = raw.slice('member:'.length).trim();
        return { assigneeId: userId || 'owner', assigneeUserId: userId || ownerUserId || undefined };
    }

    if (raw.startsWith('contact:')) {
        const phone = raw.slice('contact:'.length).trim();
        return { assigneeId: phone || 'owner' };
    }

    return { assigneeId: raw, assigneeUserId: raw };
}

function inferNextEvidencePhase(run: any): 'before' | 'after' {
    const output = run?.output || {};
    const beforeHash = output?.evidenceBefore?.evidenceHash || output?.evidence?.before?.evidenceHash;
    return beforeHash ? 'after' : 'before';
}

function getRequisitionEvents(detail: RequisitionDetail | null): NonNullable<RequisitionDetail['events']> {
    const fromEvents = safeArray(detail?.events);
    if (fromEvents.length > 0) return fromEvents as NonNullable<RequisitionDetail['events']>;
    return safeArray((detail as any)?.timeline) as NonNullable<RequisitionDetail['events']>;
}

function deriveRequestedAmount(detail: RequisitionDetail | null, row?: RequisitionRow | null): { amount: number; currency: string } {
    const events = getRequisitionEvents(detail);
    const createdEvent = events.find((event: any) => String(event?.eventType || '').toUpperCase() === 'REQUISITION_CREATED');
    const releasedEvent = events.find((event: any) => String(event?.eventType || '').toUpperCase() === 'REQUISITION_RELEASED');

    const amount = asNumber(createdEvent?.metadata?.amount)
        ?? asNumber(createdEvent?.metadata?.totalAmount)
        ?? asNumber(createdEvent?.amount)
        ?? asNumber(row?.metadata?.amount)
        ?? asNumber(row?.metadata?.totalAmount)
        ?? asNumber(releasedEvent?.metadata?.amount)
        ?? asNumber(releasedEvent?.metadata?.totalAmount)
        ?? asNumber((detail as any)?.totalAmount)
        ?? asNumber(detail?.summary?.paymentAmount)
        ?? 0;

    const currency = String(
        createdEvent?.metadata?.currency
        || createdEvent?.currency
        || row?.metadata?.currency
        || releasedEvent?.metadata?.currency
        || detail?.summary?.paymentCurrency
        || 'USD'
    );

    return { amount, currency };
}

function describeRequisitionEvent(event: NonNullable<RequisitionDetail['events']>[number]): string | null {
    const metadata = event?.metadata || {};
    const actorName = metadata.actorName || metadata.approverName || metadata.subjectName;
    const role = metadata.approverRole;
    const notes = metadata.notes;
    const amount = asNumber(metadata.amount ?? event?.amount);
    const currency = String(metadata.currency || event?.currency || '').trim();

    const eventType = String(event?.eventType || '').toUpperCase();

    switch (eventType) {
        case 'REQUISITION_CREATED':
            return `Request created for ${fmt(amount, currency || 'USD')}${notes ? ` · Notes: ${notes}` : ''}`;
        case 'AGENT_ASSIGNED':
            return `Field agent assigned: ${metadata.assigneeId || 'unknown'}`;
        case 'JOB_STARTED':
            return 'Field operative has started the job on site.';
        case 'WORK_EVIDENCE_BEFORE':
            return 'Before-execution record captured and uploaded.';
        case 'WORK_EVIDENCE_AFTER':
            return 'Final performance record captured and uploaded.';
        case 'EXECUTION_ACKNOWLEDGED':
            return 'Service delivery acknowledged by the receiver.';
        case 'JOB_CLOSED':
            return 'Job successfully completed and reconciled.';
        default:
            const parts = [
                actorName ? `Actor: ${actorName}` : null,
                role ? `Role: ${role}` : null,
                amount != null ? `Amount: ${fmt(amount, currency || 'USD')}` : null,
                notes ? `Notes: ${notes}` : null,
            ].filter(Boolean);
            return parts.length > 0 ? parts.join(' · ') : null;
    }
}

/* ── Page ── */

export default function FinancePage() {
    const router = useRouter();
    const invoiceResumeRef = useRef<string | null>(null);
    const arPlanResumeRef = useRef<string | null>(null);
    const arTransactionResumeRef = useRef<string | null>(null);
    const [tab, setTab] = useState<string | null>('ar');
    const [links, setLinks] = useState<PaymentLink[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Create form state
    const [showCreate, setShowCreate] = useState(false);
    const [creating, setCreating] = useState(false);
    const [form, setForm] = useState({
        description: '', amount: '', currency: 'USD', invoiceRef: '', merchantName: '', expiryHours: '336',
        collectionType: 'one_time', payerName: '', payerPhone: '', instalments: '3', cadence: 'monthly', firstDueDate: dayjs().format('YYYY-MM-DD'),
    });

    // Contact picker state
    const [contacts, setContacts] = useState<OrgContact[]>([]);
    const [selectedContact, setSelectedContact] = useState<OrgContact | null>(null);
    const [selectedPlanContact, setSelectedPlanContact] = useState<OrgContact | null>(null);
    const [selectedInvoiceContact, setSelectedInvoiceContact] = useState<OrgContact | null>(null);
    const [showCreatePlan, setShowCreatePlan] = useState(false);
    const [creatingPlan, setCreatingPlan] = useState(false);
    const [planForm, setPlanForm] = useState({
        description: '',
        totalAmount: '',
        currency: 'USD',
        payerName: '',
        payerPhone: '',
        payerEmail: '',
        instalments: '3',
        cadence: 'monthly',
        firstDueDate: dayjs().format('YYYY-MM-DD'),
    });
    const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
    const [selectedPlanDetails, setSelectedPlanDetails] = useState<any | null>(null);
    const [loadingPlanDetails, setLoadingPlanDetails] = useState(false);
    const [creatingArProofRequest, setCreatingArProofRequest] = useState(false);
    const [activeTemplates, setActiveTemplates] = useState<any[]>([]);
    const [requisitions, setRequisitions] = useState<RequisitionRow[]>([]);
    const [requisitionsLoading, setRequisitionsLoading] = useState(false);
    const [showRequisition, setShowRequisition] = useState(false);
    const [creatingRequisition, setCreatingRequisition] = useState(false);
    const [selectedRequisitionId, setSelectedRequisitionId] = useState<string | null>(null);
    const [selectedRequisition, setSelectedRequisition] = useState<RequisitionDetail | null>(null);
    const [requisitionDecisionReason, setRequisitionDecisionReason] = useState('');

    // FEPT — completely separate from requisitions
    const [fieldRuns, setFieldRuns] = useState<any[]>([]);
    const [fieldRunsLoading, setFieldRunsLoading] = useState(false);
    const [selectedFieldRun, setSelectedFieldRun] = useState<any | null>(null);
    const [orgMembers, setOrgMembers] = useState<OrgMemberLite[]>([]);
    const [ownerUserId, setOwnerUserId] = useState<string | null>(null);
    const [fieldReassignAssigneeId, setFieldReassignAssigneeId] = useState<string>('owner');
    const [feptPresentationRef, setFeptPresentationRef] = useState('');
    const [feptActionLoading, setFeptActionLoading] = useState(false);
    const [requisitionLifecycleNote, setRequisitionLifecycleNote] = useState('Goods/services received and confirmed.');
    const [orgContextBundle, setOrgContextBundle] = useState<OrgContextBundleCacheEntry | null>(null);
    const [showFieldRun, setShowFieldRun] = useState(false);
    const [creatingFieldRun, setCreatingFieldRun] = useState(false);
    const [fieldRunForm, setFieldRunForm] = useState({
        description: '',
        amount: '',
        currency: 'USD',
        location: '',
        scheduledDate: dayjs().add(1, 'day').format('YYYY-MM-DD'),
        assigneeId: 'owner',
    });
    const [requisitionActionLoading, setRequisitionActionLoading] = useState(false);
    const [contextSwitching, setContextSwitching] = useState(false);
    const [showApprovalModal, setShowApprovalModal] = useState(false);
    const [approvalRequestId, setApprovalRequestId] = useState<string | null>(null);
    const [approvalRequestUrl, setApprovalRequestUrl] = useState<string | null>(null);
    const [creatingApprovalRequest, setCreatingApprovalRequest] = useState(false);
    const [approving, setApproving] = useState(false);
    // Release VP modal state
    const [showReleaseModal, setShowReleaseModal] = useState(false);
    const [releaseRequestId, setReleaseRequestId] = useState<string | null>(null);
    const [releaseRequestUrl, setReleaseRequestUrl] = useState<string | null>(null);
    const [creatingReleaseRequest, setCreatingReleaseRequest] = useState(false);
    const [releasing, setReleasing] = useState(false);
    // Acknowledge VP modal state
    const [showAckModal, setShowAckModal] = useState(false);
    const [ackRequestId, setAckRequestId] = useState<string | null>(null);
    const [ackRequestUrl, setAckRequestUrl] = useState<string | null>(null);
    const [creatingAckRequest, setCreatingAckRequest] = useState(false);
    const [acking, setAcking] = useState(false);
    const [showReleaseConfirm, setShowReleaseConfirm] = useState(false);
    const [showAckConfirm, setShowAckConfirm] = useState(false);
    const [requisitionForm, setRequisitionForm] = useState({
        department: 'Operations',
        vendor: '',
        amount: '',
        currency: 'USD',
        notes: '',
    });

    // Created link result
    const [createdLink, setCreatedLink] = useState<PaymentLink | null>(null);
    const [linkAuditLoading, setLinkAuditLoading] = useState(false);
    const [linkAuditItems, setLinkAuditItems] = useState<LinkAuditItem[]>([]);

    // Invoice form state
    const [showInvoice, setShowInvoice] = useState(false);
    const [creatingInvoice, setCreatingInvoice] = useState(false);
    const [invoiceForm, setInvoiceForm] = useState({
        studentName: '',
        studentId: '',
        className: '',
        term: '',
        feeType: 'Tuition',
        amount: '',
        currency: 'USD',
        description: '',
        parentPhone: '',
    });

    const schoolClassGradeOptions = useMemo(
        () => [
            'ECD A',
            'ECD B',
            'Grade 1',
            'Grade 2',
            'Grade 3',
            'Grade 4',
            'Grade 5',
            'Grade 6',
            'Grade 7',
            'Form 1',
            'Form 2',
            'Form 3',
            'Form 4',
            'Form 5',
            'Form 6',
        ].map((value) => ({ value, label: value })),
        [],
    );

    const schoolTermYearOptions = useMemo(() => {
        const currentYear = dayjs().year();
        const years = [currentYear - 1, currentYear, currentYear + 1];
        const terms = ['Term 1', 'Term 2', 'Term 3'];

        return years.flatMap((year) => terms.map((term) => {
            const value = `${term} - ${year}`;
            return { value, label: value };
        }));
    }, []);

    // Accounts Payable state variables
    const [apSuppliers, setApSuppliers] = useState<any[]>([]);
    const [apWorkflowActions, setApWorkflowActions] = useState<ApWorkflowActionItem[]>([]);
    const [selectedSupplierActions, setSelectedSupplierActions] = useState<ApWorkflowActionItem[]>([]);
    const [apLoading, setApLoading] = useState(false);
    const [apErr, setApErr] = useState<string | null>(null);
    const [selectedApSupplier, setSelectedApSupplier] = useState<any | null>(null);
    const [supplierStatement, setSupplierStatement] = useState<any | null>(null);
    const [statementLoading, setStatementLoading] = useState(false);
    const [selectedCredentialArtifact, setSelectedCredentialArtifact] = useState<CredentialArtifactDetail | null>(null);
    const [showRecordApInvoice, setShowRecordApInvoice] = useState(false);
    const [apInvoiceForm, setApInvoiceForm] = useState({
        invoiceRef: '',
        description: '',
        amount: '',
        currency: 'USD',
        dueDate: dayjs().add(30, 'day').format('YYYY-MM-DD'),
    });
    const [showRecordApPayment, setShowRecordApPayment] = useState(false);
    const [apPaymentForm, setApPaymentForm] = useState({
        apInvoiceId: '',
        amountPaid: '',
        currency: 'USD',
        paymentMethod: 'ecocash',
        reference: '',
        proofImageUrl: '',
    });
    const [submittingApAction, setSubmittingApAction] = useState(false);

    // Holder receivables view state
    const [myRemittances, setMyRemittances] = useState<any[]>([]);
    const [myRemittancesLoading, setMyRemittancesLoading] = useState(false);
    const [arObligations, setArObligations] = useState<ArObligationItem[]>([]);
    const [arObligationsLoading, setArObligationsLoading] = useState(false);

    const capabilityFlags = useMemo(() => getWorkflowCapabilityFlags(activeTemplates), [activeTemplates]);
    const hasPaymentCollection = capabilityFlags.paymentCollection;
    const hasArCollections = capabilityFlags.arCollections;
    const hasEducation = capabilityFlags.educationFees;
    const hasInternalRequisitions = capabilityFlags.internalRequisitions;
    const hasFieldExecutionConfigured = capabilityFlags.fieldExecution;
    const hasFieldExecution = hasFieldExecutionConfigured && isEmployeeOrgRole();
    const hasApPayables = capabilityFlags.apPayables;
    const requisitionRows = requisitions;
    const selectedRequisitionRow = selectedRequisitionId
        ? requisitions.find((row) => row.id === selectedRequisitionId) || null
        : null;
    const requisitionEvents = getRequisitionEvents(selectedRequisition);
    const requestedAmount = deriveRequestedAmount(selectedRequisition, selectedRequisitionRow);
    const requisitionStatus = String(
        selectedRequisition?.summary?.status
        || selectedRequisition?.status
        || selectedRequisition?.currentStatus
        || selectedRequisitionRow?.status
        || 'Unknown'
    ).toUpperCase();
    const contextMode = getContextMode();
    const activeOrgId = getActiveOrgId();

    const approvalCapabilities: OrgRoleCapabilities | null = orgContextBundle?.actor?.capabilities || null;
    const approvalActionAllowed = approvalCapabilities
        ? approvalCapabilities.allowedActions.includes('workflow.approve_requisition')
        : null;

    const approvalLimitLabel = approvalCapabilities?.maxApprovalAmount == null
        ? 'No amount ceiling for your role.'
        : `Offline approval ceiling: ${fmt(approvalCapabilities.maxApprovalAmount, requestedAmount.currency)}.`;

    const evidenceThresholdLabel = typeof approvalCapabilities?.evidenceRequiredAboveAmount === 'number'
        ? `Evidence required above ${fmt(approvalCapabilities.evidenceRequiredAboveAmount, requestedAmount.currency)}.`
        : (approvalCapabilities?.requireEvidenceForActions.includes('workflow.approve_requisition')
            ? 'Evidence required for approval actions.'
            : 'Evidence optional for approval actions.');

    const openPaymentLinkInApp = useCallback((link: PaymentLink) => {
        const routeToken = getLinkRouteToken(link);
        if (!routeToken) {
            notifications.show({
                title: 'Payment link unavailable',
                message: 'This payment link is missing a checkout reference. Refresh and try again.',
                color: 'red',
            });
            return;
        }

        const params = new URLSearchParams();
        if (link.invoiceRef) params.set('invoiceRef', link.invoiceRef);
        params.set('linkId', link.id);
        if (link.shortlinkCode) params.set('paymentCode', link.shortlinkCode);
        const orgId = getActiveOrgId();
        if (orgId) params.set('orgTenantId', orgId);

        void router.push(`/pay/${encodeURIComponent(routeToken)}?${params.toString()}`);
    }, [router]);

    const openPaymentLinkDetails = useCallback((link: PaymentLink) => {
        setCreatedLink(link);
    }, []);

    const openPlanDetails = useCallback(async (planId: string) => {
        const token = getPreferredToken() || getWalletToken();
        if (!token) return;
        setLoadingPlanDetails(true);
        try {
            const res = await api.get(`/api/finance/ar/plans/${planId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setSelectedPlanDetails(res.data);
            setSelectedPlanId(planId);
        } catch (err: any) {
            notifications.show({
                title: 'Failed to load plan',
                message: err.response?.data?.error || err.message,
                color: 'red',
            });
        } finally {
            setLoadingPlanDetails(false);
        }
    }, []);

    const openCredentialArtifact = useCallback((artifact: CredentialArtifactDetail) => {
        setSelectedCredentialArtifact(artifact);
    }, []);

    const loadLinkAudit = useCallback(async (link: PaymentLink) => {
        const token = getPreferredToken() || getWalletToken();
        if (!token) {
            setLinkAuditItems([]);
            return;
        }

        const refs = getPaymentAuditRefs(link);
        if (refs.length === 0) {
            setLinkAuditItems([]);
            return;
        }

        setLinkAuditLoading(true);
        try {
            const responses = await Promise.all(
                refs.map((ref) =>
                    api.get(`/api/audit/activity/${encodeURIComponent(ref)}`, {
                        params: { limit: 25 },
                        headers: { Authorization: `Bearer ${token}` },
                        skipAuthRedirect: true as any,
                    } as any)
                )
            );

            const merged = responses
                .flatMap((response) => safeArray(response.data))
                .map((entry: any) => ({
                    id: String(entry?.id || ''),
                    actionType: String(entry?.actionType || entry?.eventType || '').trim() || undefined,
                    actorName: String(entry?.actorName || entry?.actorDid || '').trim() || undefined,
                    resourceId: String(entry?.resourceId || entry?.workflowId || '').trim() || undefined,
                    createdAt: String(entry?.createdAt || new Date().toISOString()),
                    details: entry?.details && typeof entry.details === 'object' ? entry.details : undefined,
                }))
                .filter((entry: LinkAuditItem) => entry.id.length > 0);

            const deduped = Array.from(new Map(merged.map((entry) => [entry.id, entry])).values())
                .sort((a, b) => dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf())
                .slice(0, 12);

            setLinkAuditItems(deduped);
        } catch {
            setLinkAuditItems([]);
        } finally {
            setLinkAuditLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!createdLink) {
            setLinkAuditItems([]);
            setLinkAuditLoading(false);
            return;
        }

        void loadLinkAudit(createdLink);
    }, [createdLink, loadLinkAudit]);

    /* ── Fetch ── */

    const fetchLinks = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const endpoint = hasArCollections ? '/api/finance/ar/collections' : '/api/payment-links';
            const res = await api.get(endpoint);
            const rawLinks = hasArCollections ? (res.data?.collections || []) : (res.data?.links || []);
            const normalized = safeArray(rawLinks).map((link: any) => {
                const shortlinkUrl = firstNonEmptyString(link?.shortlinkUrl, link?.shortlink_url, link?.paymentUrl, link?.url, link?.shortUrl);
                const shortlinkCode = firstNonEmptyString(link?.shortlinkCode, link?.shortlink_code, link?.paymentCode, extractPaymentCode(shortlinkUrl));
                return {
                    ...link,
                    merchantId: link?.merchantId ?? link?.merchant_id,
                    merchantName: link?.merchantName ?? link?.merchant_name,
                    invoiceRef: link?.invoiceRef ?? link?.invoice_ref,
                    paidAt: link?.paidAt ?? link?.paid_at,
                    createdAt: link?.createdAt ?? link?.created_at,
                    expiry: link?.expiry ?? link?.expiry,
                    shortlinkUrl,
                    shortlinkCode,
                } as PaymentLink;
            });
            setLinks(normalized);
        } catch (err: any) {
            setError(err.response?.data?.message ?? 'Failed to load payment links');
        } finally {
            setLoading(false);
        }
    }, [hasArCollections]);

    const fetchContacts = useCallback(async () => {
        try {
            const token = getPreferredToken();
            const authHeaders = token ? { Authorization: `Bearer ${token}` } : undefined;

            let data: any[] = [];
            if (getContextMode() === 'org') {
                // Org contacts are split by scope. Fetch both so internal owner/member contacts are visible.
                const [externalRes, internalRes] = await Promise.allSettled([
                    api.get('/api/contacts', { params: { contactScope: 'external' }, headers: authHeaders }),
                    api.get('/api/contacts', { params: { contactScope: 'internal' }, headers: authHeaders }),
                ]);

                const externalData = externalRes.status === 'fulfilled'
                    ? safeArray(externalRes.value.data?.contacts ?? externalRes.value.data)
                    : [];
                const internalData = internalRes.status === 'fulfilled'
                    ? safeArray(internalRes.value.data?.contacts ?? internalRes.value.data)
                    : [];

                const merged = [...externalData, ...internalData];
                data = Array.from(new Map(merged.map((entry: any) => [entry.id, entry])).values());
            } else {
                const res = await api.get('/api/contacts', { headers: authHeaders });
                data = safeArray(res.data?.contacts ?? res.data);
            }

            setContacts(data.map((c: any) => ({
                id: c.id, name: c.name ?? 'Unknown', phone: c.phone, email: c.email,
            })));
        } catch { /* optional */ }
    }, []);

    const fetchWorkflowConfig = useCallback(async () => {
        const orgId = getActiveOrgId();
        if (!orgId) {
            return;
        }
        try {
            const res = await api.get(`/api/organizations/${orgId}/workflows`);
            const data = safeArray(res.data?.templates);
            const templates = data.filter((t: any) => t?.enabled);
            setActiveTemplates(templates);
        } catch {
            setActiveTemplates([]);
        }
    }, []);

    const fetchOrgMembers = useCallback(async () => {
        const orgId = getActiveOrgId();
        if (!orgId) {
            setOrgMembers([]);
            setOwnerUserId(null);
            return;
        }
        const token = getPreferredToken();
        if (!token) {
            setOrgMembers([]);
            setOwnerUserId(null);
            return;
        }

        try {
            const res = await api.get(`/api/organizations/${encodeURIComponent(orgId)}/members`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const members = safeArray<OrgMemberLite>(res.data).filter((m: any) => String(m?.status || '').toLowerCase() === 'active');
            setOrgMembers(members);

            const owner = members.find((m) => m.role === 'owner') || members.find((m) => m.role === 'admin') || null;
            setOwnerUserId(owner?.userId || null);
        } catch {
            setOrgMembers([]);
            setOwnerUserId(null);
        }
    }, []);

    const fetchRequisitions = useCallback(async () => {
        if (!hasInternalRequisitions) {
            setRequisitions([]);
            return;
        }

        const token = getPreferredToken();
        if (!token) {
            setRequisitions([]);
            return;
        }

        setRequisitionsLoading(true);
        try {
            const res = await api.get('/api/finance/requisitions', {
                headers: { Authorization: `Bearer ${token}` },
            });
            const rows = safeArray<RequisitionRow>(res.data);
            setRequisitions(rows);
        } catch (err: any) {
            const message = err.response?.data?.message || err.message;
            if (String(message || '').toLowerCase().includes('organization context required')) {
                setRequisitions([]);
            }
        } finally {
            setRequisitionsLoading(false);
        }
    }, [hasInternalRequisitions]);

    // FEPT runs are fetched from /workflows/runs — NOT from /api/finance/requisitions
    const fetchFieldRuns = useCallback(async () => {
        if (!hasFieldExecution) {
            setFieldRuns([]);
            return;
        }
        const token = getPreferredToken();
        if (!token) { setFieldRuns([]); return; }
        setFieldRunsLoading(true);
        try {
            const res = await api.get('/workflows/runs', {
                params: { limit: 50 },
                headers: { Authorization: `Bearer ${token}` },
            });
            const runs = safeArray(res.data).filter((run: any) => {
                const wfId = String(run.workflowId || run.workflow_id || '').toLowerCase();
                const stage = String(run.output?.workflowStage || run.output?.stage || '').toUpperCase();
                const FEPT_STAGES = new Set(['REQUEST_CREATED', 'ASSIGNED', 'IN_PROGRESS', 'EVIDENCE_CAPTURED', 'ACKNOWLEDGED', 'PAYMENT_TRIGGERED', 'RECEIPT_ISSUED', 'RECONCILED', 'COMPLETED', 'DISPUTED', 'CANCELLED']);
                return wfId.includes('field') || wfId.includes('fept') || FEPT_STAGES.has(stage);
            });
            setFieldRuns(runs);
        } catch {
            setFieldRuns([]);
        } finally {
            setFieldRunsLoading(false);
        }
    }, [hasFieldExecution]);

    const fetchApSuppliers = useCallback(async () => {
        if (!hasApPayables) {
            setApSuppliers([]);
            return;
        }
        const token = getPreferredToken();
        if (!token) return;
        setApLoading(true);
        setApErr(null);
        try {
            const res = await api.get('/api/finance/ap/suppliers', {
                headers: { Authorization: `Bearer ${token}` },
            });
            setApSuppliers(safeArray(res.data));
        } catch (err: any) {
            setApErr(err.response?.data?.error || err.response?.data?.message || err.message);
        } finally {
            setApLoading(false);
        }
    }, [hasApPayables]);

    const fetchApWorkflowActions = useCallback(async () => {
        if (!hasApPayables) {
            setApWorkflowActions([]);
            return;
        }
        const token = getPreferredToken();
        if (!token) {
            setApWorkflowActions([]);
            return;
        }
        try {
            const res = await api.get('/api/finance/ap/workflow-actions', {
                params: { onlyPending: true },
                headers: { Authorization: `Bearer ${token}` },
            });
            setApWorkflowActions(safeArray<ApWorkflowActionItem>(res.data));
        } catch {
            setApWorkflowActions([]);
        }
    }, [hasApPayables]);

    const fetchSupplierStatement = useCallback(async (supplierId: string) => {
        const token = getPreferredToken();
        if (!token) return;
        setStatementLoading(true);
        try {
            const res = await api.get(`/api/finance/ap/supplier-statement/${supplierId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setSupplierStatement(res.data);
        } catch (err: any) {
            notifications.show({
                title: 'Error loading statement',
                message: err.response?.data?.error || err.message,
                color: 'red',
            });
        } finally {
            setStatementLoading(false);
        }
    }, []);

    const fetchSupplierWorkflowActions = useCallback(async (supplierId: string) => {
        const token = getPreferredToken();
        if (!token) {
            setSelectedSupplierActions([]);
            return;
        }
        try {
            const res = await api.get('/api/finance/ap/workflow-actions', {
                params: { supplierId },
                headers: { Authorization: `Bearer ${token}` },
            });
            setSelectedSupplierActions(safeArray<ApWorkflowActionItem>(res.data));
        } catch {
            setSelectedSupplierActions([]);
        }
    }, []);

    const runApWorkflowTransition = useCallback(async (item: ApWorkflowActionItem) => {
        const token = getPreferredToken();
        if (!token) return;
        const transition = String(item.required_action || '').trim();
        if (!transition || !item.id) return;

        const supported = new Set([
            'present_payment_proof',
            'record_payment',
            'acknowledge_remittance',
            'issue_receipt_vc',
            'mark_disputed',
            'resolve_dispute',
        ]);
        if (!supported.has(transition)) {
            notifications.show({
                title: 'Action not yet wired',
                message: `Unsupported transition: ${transition}`,
                color: 'yellow',
            });
            return;
        }

        if (item.required_proof_type) {
            try {
                const proofRes = await api.post(`/api/finance/ap/workflow-actions/${item.id}/proof-request`, {}, {
                    headers: { Authorization: `Bearer ${token}` },
                });

                const requestId = String(proofRes.data?.requestId || '').trim();
                const presentationRequestUrl = String(proofRes.data?.presentationRequestUrl || '').trim();
                if (!requestId || !presentationRequestUrl) {
                    throw new Error('AP workflow proof request was not returned by server.');
                }

                const params = new URLSearchParams({
                    request_uri: presentationRequestUrl,
                    requestId,
                    mode: 'ap-workflow-transition',
                    transactionId: item.id,
                    transition,
                    ...(getActiveOrgId() ? { orgTenantId: String(getActiveOrgId()) } : {}),
                });

                await router.push(`/present?${params.toString()}`);
                return;
            } catch (err: any) {
                notifications.show({
                    title: 'Proof request failed',
                    message: err.response?.data?.error || err.message,
                    color: 'red',
                });
                return;
            }
        }

        try {
            await api.post(`/api/finance/ap/workflow-actions/${item.id}/transition`, {
                transition,
                consentTimestamp: new Date().toISOString(),
                notes: 'Mobile AP workflow transition',
            }, {
                headers: { Authorization: `Bearer ${token}` },
            });

            notifications.show({
                title: 'Workflow advanced',
                message: `Moved stage using ${transition}.`,
                color: 'teal',
            });

            fetchApWorkflowActions();
            if (selectedApSupplier?.id) {
                fetchSupplierWorkflowActions(selectedApSupplier.id);
                fetchSupplierStatement(selectedApSupplier.id);
                fetchApSuppliers();
            }
        } catch (err: any) {
            notifications.show({
                title: 'Transition failed',
                message: err.response?.data?.error || err.message,
                color: 'red',
            });
        }
    }, [fetchApSuppliers, fetchApWorkflowActions, fetchSupplierStatement, fetchSupplierWorkflowActions, router, selectedApSupplier?.id]);

    const launchArCollectionProof = useCallback(async (transactionId: string, options?: { planId?: string | null; orgTenantId?: string | null }) => {
        const token = getWalletToken() || getPreferredToken();
        if (!token) {
            notifications.show({
                title: 'Organization session required',
                message: 'Switch into the debtor organization context to launch this wallet proof.',
                color: 'yellow',
            });
            return;
        }

        setCreatingArProofRequest(true);
        try {
            const proofRes = await api.post(
                `/api/finance/ap/workflow-actions/${encodeURIComponent(transactionId)}/proof-request`,
                {},
                { headers: { Authorization: `Bearer ${token}` } },
            );

            const requestUrl = String(proofRes.data?.presentationRequestUrl || '').trim();
            const requestId = String(proofRes.data?.requestId || '').trim();
            const transition = String(proofRes.data?.requiredAction || 'present_payment_proof').trim();
            if (!requestUrl || !requestId) {
                throw new Error('Proof request URL was not returned by server');
            }

            const params = new URLSearchParams({
                request_uri: requestUrl,
                mode: 'ar-collection-consent',
                transactionId,
                requestId,
                transition,
            });

            const orgTenantId = options?.orgTenantId || getActiveOrgId() || undefined;
            if (orgTenantId) params.set('orgTenantId', orgTenantId);
            if (options?.planId) params.set('planId', options.planId);

            await router.push(`/present?${params.toString()}`);
        } catch (err: any) {
            notifications.show({
                title: 'Proof request failed',
                message: err.response?.data?.error || err.response?.data?.message || err.message,
                color: 'red',
            });
        } finally {
            setCreatingArProofRequest(false);
        }
    }, [router]);

    const fetchMyRemittances = useCallback(async () => {
        const token = getPreferredToken();
        if (!token) return;
        setMyRemittancesLoading(true);
        try {
            const res = await api.get('/api/finance/ap/my-remittances', {
                headers: { Authorization: `Bearer ${token}` },
            });
            setMyRemittances(safeArray(res.data));
        } catch (err: any) {
            console.error('Failed to load my remittances:', err);
        } finally {
            setMyRemittancesLoading(false);
        }
    }, []);

    const fetchArObligations = useCallback(async () => {
        const token = getPreferredToken();
        if (!token) {
            setArObligations([]);
            return;
        }

        setArObligationsLoading(true);
        try {
            const res = await api.get('/api/finance/ar/my-obligations', {
                headers: { Authorization: `Bearer ${token}` },
            });
            setArObligations(safeArray<ArObligationItem>(res.data?.obligations));
        } catch {
            setArObligations([]);
        } finally {
            setArObligationsLoading(false);
        }
    }, []);


    const refreshOrgPolicyBundle = useCallback(async (): Promise<OrgContextBundleCacheEntry | null> => {
        const orgId = getActiveOrgId();
        if (!orgId) {
            setOrgContextBundle(null);
            return null;
        }

        const cached = getCachedOrgContextBundle(orgId);
        if (cached) {
            setOrgContextBundle(cached);
        }

        const refreshed = await refreshOrgContextBundle(orgId);
        if (refreshed) {
            setOrgContextBundle(refreshed);
            return refreshed;
        }

        return cached;
    }, []);

    const enforceOrgActionPolicy = useCallback(async (input: {
        actionType: string;
        amount?: number | null;
        evidenceProvided?: boolean;
    }): Promise<boolean> => {
        const bundle = orgContextBundle || await refreshOrgPolicyBundle();
        const decision = evaluateOrgActionPolicy(bundle, {
            actionType: input.actionType,
            amount: typeof input.amount === 'number' ? input.amount : null,
            evidenceProvided: input.evidenceProvided,
            actionTimestamp: new Date().toISOString(),
        });

        if (!decision.allowed) {
            const escalationHint = decision.suggestedEscalationRole
                ? ` Escalate to ${decision.suggestedEscalationRole}.`
                : '';
            notifications.show({
                title: 'Policy Check Failed',
                message: `${decision.reason || 'Action blocked by org policy.'}${escalationHint}`,
                color: 'red',
            });
            return false;
        }

        return true;
    }, [orgContextBundle, refreshOrgPolicyBundle]);

    const ensureOrgContextForRequisition = useCallback(async (orgTenantId?: string | null): Promise<boolean> => {
        if (!orgTenantId) return true;

        const normalizedOrgId = String(orgTenantId).trim();
        if (!normalizedOrgId) return true;

        const currentMode = getContextMode();
        const currentOrg = getActiveOrgId();
        if (currentMode === 'org' && currentOrg === normalizedOrgId) return true;

        const walletToken = getWalletToken();
        if (!walletToken) return false;

        setContextSwitching(true);
        try {
            const switchRes = await api.post(`/api/organizations/${encodeURIComponent(normalizedOrgId)}/switch`, {}, {
                headers: { Authorization: `Bearer ${walletToken}` },
            });
            const orgToken = switchRes.data?.token;
            if (!orgToken) return false;

            const resolvedOrgName = switchRes.data?.name
                || switchRes.data?.label
                || switchRes.data?.orgName
                || normalizedOrgId;

            applyOrgContext({
                orgId: normalizedOrgId,
                orgName: resolvedOrgName,
                orgToken,
                orgRole: switchRes.data?.orgRole,
                sector: switchRes.data?.sector,
            });

            notifications.show({
                title: 'Organization context active',
                message: 'Switched to the organization for this requisition request.',
                color: 'blue',
            });
            return true;
        } catch {
            return false;
        } finally {
            setContextSwitching(false);
        }
    }, []);

    const resolveRequisitionId = useCallback(async (targetId: string): Promise<string> => {
        if (/^REQ-/i.test(targetId)) return targetId;

        const preferredToken = getPreferredToken();
        try {
            const { data } = await api.get<WorkflowRequestLookup>(`/workflow-requests/${encodeURIComponent(targetId)}`, {
                headers: preferredToken ? { Authorization: `Bearer ${preferredToken}` } : undefined,
            });

            const requisitionId = data?.payload?.requisitionId;
            if (requisitionId) return requisitionId;
        } catch {
            // Fall through to local requisition row matching.
        }

        const rowMatch = requisitions.find((row) => row.workflowRequestId === targetId);
        if (rowMatch?.id) return rowMatch.id;

        throw new Error('Workflow request does not resolve to a requisition ID');
    }, [requisitions]);

    const openRequisitionDetails = useCallback(async (targetId: string, orgTenantId?: string | null) => {
        try {
            setSelectedRequisition(null);

            // Ensure we are in the correct org context if an ID is provided.
            if (orgTenantId) {
                const switched = await ensureOrgContextForRequisition(orgTenantId);
                if (!switched) {
                    notifications.show({
                        title: 'Context switch required',
                        message: 'Please switch to the correct organization context to action this requisition.',
                        color: 'yellow',
                    });
                }
            }

            const requisitionId = await resolveRequisitionId(targetId);
            setSelectedRequisitionId(requisitionId);
            const token = getPreferredToken();
            const res = await api.get(`/api/finance/requisitions/${requisitionId}`, {
                headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            });
            setSelectedRequisition(res.data || null);
            setRequisitionDecisionReason('');
        } catch (err: any) {
            notifications.show({
                title: 'Unable to load requisition details',
                message: err.response?.data?.message ?? err.message,
                color: 'red',
            });
            setSelectedRequisition(null);
        }
    }, [resolveRequisitionId, ensureOrgContextForRequisition]);

    const openFieldRunDetails = useCallback(async (targetRunId: string, orgTenantId?: string | null) => {
        const normalizedRunId = normalizeRunId(targetRunId);
        if (!normalizedRunId) return;

        if (orgTenantId) {
            const switched = await ensureOrgContextForRequisition(orgTenantId);
            if (!switched) {
                notifications.show({
                    title: 'Context switch required',
                    message: 'Switch to the target organization context to open this FEPT run.',
                    color: 'yellow',
                });
            }
        }

        const existing = fieldRuns.find((run) => String(run.id || '') === normalizedRunId);
        if (existing) {
            setSelectedFieldRun(existing);
            return;
        }

        const token = getPreferredToken();
        if (!token) return;

        try {
            const res = await api.get(`/workflows/runs/${encodeURIComponent(normalizedRunId)}`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            const run = res.data;
            const workflowId = String(run?.workflowId || run?.workflow_id || '').toLowerCase();
            const stage = String(run?.output?.workflowStage || run?.output?.stage || '').toUpperCase();
            const isFept = workflowId.includes('field') || workflowId.includes('fept') || [
                'REQUEST_CREATED', 'APPROVAL_PENDING', 'APPROVED', 'ASSIGNED', 'IN_PROGRESS', 'EVIDENCE_CAPTURED',
                'ACKNOWLEDGED', 'PAYMENT_TRIGGERED', 'RECEIPT_ISSUED', 'RECONCILED', 'COMPLETED', 'DISPUTED',
                'CANCELLED', 'REVOKED'
            ].includes(stage);

            if (isFept) {
                setSelectedFieldRun(run);
            }
        } catch {
            // Ignore deep-link miss and keep list view.
        }
    }, [ensureOrgContextForRequisition, fieldRuns]);

    useEffect(() => {
        fetchContacts();
        fetchWorkflowConfig();
        fetchOrgMembers();
        void refreshOrgPolicyBundle();
    }, [fetchContacts, fetchWorkflowConfig, fetchOrgMembers, refreshOrgPolicyBundle]);

    useEffect(() => {
        fetchLinks();
    }, [fetchLinks]);

    useEffect(() => {
        if (contextMode !== 'org' || !activeOrgId) {
            setOrgContextBundle(null);
            return;
        }

        void refreshOrgPolicyBundle();
    }, [contextMode, activeOrgId, refreshOrgPolicyBundle]);

    useEffect(() => {
        fetchRequisitions();
    }, [fetchRequisitions]);

    useEffect(() => {
        fetchFieldRuns();
    }, [fetchFieldRuns]);

    useEffect(() => {
        fetchApSuppliers();
    }, [fetchApSuppliers]);

    useEffect(() => {
        fetchApWorkflowActions();
    }, [fetchApWorkflowActions]);

    useEffect(() => {
        if (!hasArCollections) {
            setArObligations([]);
            return;
        }
        void fetchArObligations();
    }, [hasArCollections, fetchArObligations]);

    useEffect(() => {
        let cancelled = false;

        const resolveQueryTarget = async () => {
            const queryTab = String(router.query.tab || '').toLowerCase();
            // Field tab: FEPT runs come from /workflows/runs — never touch requisition resolution
            if (queryTab === 'field') {
                if (hasFieldExecution) setTab('field');
                return;
            }
            if (queryTab === 'requisitions') {
                if (!hasInternalRequisitions) return;
                setTab('requisitions');
            } else {
                return;
            }

            const requestId = typeof router.query.requestId === 'string' ? router.query.requestId : null;
            const requisitionIdFromQuery = typeof router.query.requisitionId === 'string' ? router.query.requisitionId : null;
            const orgTenantId = typeof router.query.orgTenantId === 'string' ? router.query.orgTenantId : null;

            if (orgTenantId) {
                const switched = await ensureOrgContextForRequisition(orgTenantId);
                if (!switched && !cancelled) {
                    notifications.show({
                        title: 'Context switch required',
                        message: 'Sign in to your wallet and organization profile to action this requisition.',
                        color: 'yellow',
                    });
                }
            }

            const targetRequisition = requisitionIdFromQuery || requestId;
            if (!targetRequisition) return;
            if (!cancelled) {
                await openRequisitionDetails(targetRequisition);
            }
        };

        void resolveQueryTarget();

        return () => {
            cancelled = true;
        };
    }, [router.query.tab, router.query.requestId, router.query.requisitionId, router.query.orgTenantId, hasInternalRequisitions, hasFieldExecution, ensureOrgContextForRequisition, openRequisitionDetails]);

    useEffect(() => {
        const queryTab = String(router.query.tab || '').toLowerCase();
        if (queryTab === 'requisitions' && hasInternalRequisitions && !selectedRequisitionId) {
            setTab('requisitions');
        }
        if (queryTab === 'field' && hasFieldExecution && !selectedRequisitionId) {
            setTab('field');
        }
        if (queryTab === 'ap' && hasApPayables) {
            setTab('ap');
        }
    }, [router.query.tab, hasInternalRequisitions, hasFieldExecution, hasApPayables, selectedRequisitionId]);

    useEffect(() => {
        const queryTab = String(router.query.tab || '').toLowerCase();
        if (queryTab !== 'ap' || !hasApPayables) return;

        const orgTenantId = typeof router.query.orgTenantId === 'string' ? router.query.orgTenantId : null;
        if (orgTenantId) {
            void ensureOrgContextForRequisition(orgTenantId);
        }
    }, [router.query.tab, router.query.orgTenantId, hasApPayables, ensureOrgContextForRequisition]);

    useEffect(() => {
        const queryTab = String(router.query.tab || '').toLowerCase();
        if (queryTab !== 'field' || !hasFieldExecution) return;

        const runIdFromQuery = normalizeRunId(
            typeof router.query.runId === 'string'
                ? router.query.runId
                : (typeof router.query.requestId === 'string' ? router.query.requestId : null)
        );
        if (!runIdFromQuery) return;

        const existing = fieldRuns.find((run) => String(run.id || '') === runIdFromQuery);
        if (existing) {
            setSelectedFieldRun(existing);
            return;
        }

        const orgTenantId = typeof router.query.orgTenantId === 'string' ? router.query.orgTenantId : null;
        void openFieldRunDetails(runIdFromQuery, orgTenantId);
    }, [router.query.tab, router.query.runId, router.query.requestId, router.query.orgTenantId, hasFieldExecution, fieldRuns, openFieldRunDetails]);

    useEffect(() => {
        if (!router.isReady) return;

        const queryTab = String(router.query.tab || '').toLowerCase();
        if (queryTab !== 'invoices' && queryTab !== 'ar' && queryTab !== 'links') return;

        const invoiceRef = typeof router.query.invoiceRef === 'string' ? router.query.invoiceRef.trim() : '';
        const linkId = typeof router.query.linkId === 'string' ? router.query.linkId.trim() : '';
        const paymentCode = typeof router.query.paymentCode === 'string'
            ? router.query.paymentCode.trim()
            : (typeof router.query.code === 'string' ? router.query.code.trim() : '');
        const orgTenantId = typeof router.query.orgTenantId === 'string' ? router.query.orgTenantId.trim() : '';

        if (!invoiceRef && !linkId && !paymentCode && !orgTenantId) return;

        const fingerprint = [queryTab, invoiceRef, linkId, paymentCode, orgTenantId].join('|');
        if (invoiceResumeRef.current === fingerprint) return;

        const openFromQuery = async () => {
            if (orgTenantId) {
                await ensureOrgContextForRequisition(orgTenantId);
            }

            setTab('ar');
            if (loading) return;

            const normalizedCode = paymentCode.toLowerCase();
            const normalizedInvoiceRef = invoiceRef.toLowerCase();
            const match = links.find((link) => {
                const checkoutUrl = getLinkCheckoutUrl(link);
                const linkCode = firstNonEmptyString(link.shortlinkCode, extractPaymentCode(checkoutUrl))?.toLowerCase() || '';
                const linkInvoiceRef = String(link.invoiceRef || '').trim().toLowerCase();
                if (linkId && link.id === linkId) return true;
                if (normalizedInvoiceRef && linkInvoiceRef === normalizedInvoiceRef) return true;
                if (normalizedCode && linkCode === normalizedCode) return true;
                return false;
            });

            if (match) {
                const checkoutUrl = getLinkCheckoutUrl(match);
                if (checkoutUrl) {
                    setCreatedLink({ ...match, shortlinkUrl: checkoutUrl });
                }
            }

            invoiceResumeRef.current = fingerprint;
        };

        void openFromQuery();
    }, [
        router.isReady,
        router.query.tab,
        router.query.invoiceRef,
        router.query.linkId,
        router.query.paymentCode,
        router.query.code,
        router.query.orgTenantId,
        hasEducation,
        ensureOrgContextForRequisition,
        links,
        loading,
    ]);

    useEffect(() => {
        if (!router.isReady) return;

        const queryTab = String(router.query.tab || '').toLowerCase();
        if (queryTab !== 'ar') return;

        const planId = typeof router.query.planId === 'string' ? router.query.planId.trim() : '';
        const orgTenantId = typeof router.query.orgTenantId === 'string' ? router.query.orgTenantId.trim() : '';
        if (!planId) return;

        const fingerprint = [queryTab, planId, orgTenantId].join('|');
        if (arPlanResumeRef.current === fingerprint) return;

        const openPlanFromQuery = async () => {
            if (orgTenantId) {
                await ensureOrgContextForRequisition(orgTenantId);
            }
            setTab('ar');
            await openPlanDetails(planId);
            arPlanResumeRef.current = fingerprint;
        };

        void openPlanFromQuery();
    }, [router.isReady, router.query.tab, router.query.planId, router.query.orgTenantId, ensureOrgContextForRequisition, openPlanDetails]);

    useEffect(() => {
        if (!router.isReady) return;

        const queryTab = String(router.query.tab || '').toLowerCase();
        if (queryTab !== 'ar') return;

        const transactionId = typeof router.query.transactionId === 'string' ? router.query.transactionId.trim() : '';
        const orgTenantId = typeof router.query.orgTenantId === 'string' ? router.query.orgTenantId.trim() : '';
        if (!transactionId) return;

        const fingerprint = [queryTab, transactionId, orgTenantId].join('|');
        if (arTransactionResumeRef.current === fingerprint) return;

        const openFromTransactionQuery = async () => {
            if (orgTenantId) {
                await ensureOrgContextForRequisition(orgTenantId);
            }

            setTab('ar');

            const token = getPreferredToken() || getWalletToken();
            if (!token) return;

            let sourcePlanId = '';
            let sourcePaymentLinkId = '';
            let sourceInvoiceRef = '';

            try {
                const workflowRes = await api.get('/api/finance/ap/workflow-actions', {
                    params: { onlyPending: true },
                    headers: { Authorization: `Bearer ${token}` },
                    skipAuthRedirect: true as any,
                } as any);

                const rows = safeArray<any>(workflowRes.data);
                const tx = rows.find((row) => String(row?.id || '').trim() === transactionId);
                if (tx) {
                    sourcePlanId = String(tx?.source_plan_id || tx?.sourcePlanId || '').trim();
                    sourcePaymentLinkId = String(tx?.source_payment_link_id || tx?.sourcePaymentLinkId || '').trim();
                    sourceInvoiceRef = String(tx?.invoice_ref || tx?.invoiceRef || '').trim();
                }
            } catch {
                // Best-effort lookup only.
            }

            if (sourcePlanId) {
                await openPlanDetails(sourcePlanId);
                arTransactionResumeRef.current = fingerprint;
                return;
            }

            if (!loading) {
                const normalizedInvoiceRef = sourceInvoiceRef.toLowerCase();
                const match = links.find((link) => {
                    if (sourcePaymentLinkId && link.id === sourcePaymentLinkId) return true;
                    if (normalizedInvoiceRef && String(link.invoiceRef || '').trim().toLowerCase() === normalizedInvoiceRef) return true;
                    return false;
                });

                if (match) {
                    const checkoutUrl = getLinkCheckoutUrl(match);
                    if (checkoutUrl) {
                        setCreatedLink({ ...match, shortlinkUrl: checkoutUrl });
                    }
                }
            } else if (sourcePaymentLinkId || sourceInvoiceRef) {
                // Wait for AR links to load, then retry this transaction-focused deep link.
                return;
            }

            arTransactionResumeRef.current = fingerprint;
        };

        void openFromTransactionQuery();
    }, [
        router.isReady,
        router.query.tab,
        router.query.transactionId,
        router.query.orgTenantId,
        ensureOrgContextForRequisition,
        openPlanDetails,
        links,
        loading,
    ]);

    useEffect(() => {
        if (!router.isReady) return;
        const queryTab = String(router.query.tab || '').toLowerCase();
        const focusProof = String(router.query.focusProof || '').toLowerCase() === 'true';
        const planId = typeof router.query.planId === 'string' ? router.query.planId.trim() : '';
        if (queryTab !== 'ar' || !focusProof || !planId || selectedPlanId !== planId || !selectedPlanDetails) return;

        const workflowTransactions = safeArray<any>(selectedPlanDetails.workflowTransactions);
        const latestWorkflow = workflowTransactions[0] || null;
        if (!latestWorkflow?.id || !latestWorkflow?.required_proof_type || latestWorkflow?.proof_response_id || creatingArProofRequest) {
            return;
        }

        void launchArCollectionProof(String(latestWorkflow.id), {
            planId,
            orgTenantId: String(selectedPlanDetails.debtor_org_id || getActiveOrgId() || ''),
        });
    }, [
        router.isReady,
        router.query.tab,
        router.query.focusProof,
        router.query.planId,
        selectedPlanId,
        selectedPlanDetails,
        creatingArProofRequest,
        launchArCollectionProof,
    ]);

    useEffect(() => {
        const hasArModule = hasArCollections || links.length > 0;
        const enabledTabs = [];
        if (hasArModule) enabledTabs.push('ar');
        if (hasEducation) enabledTabs.push('invoices');
        if (hasInternalRequisitions) enabledTabs.push('requisitions');
        if (hasFieldExecution) enabledTabs.push('field');
        if (hasApPayables) enabledTabs.push('ap');

        if (tab && !enabledTabs.includes(tab)) {
            setTab(enabledTabs[0] || null);
        } else if (!tab && enabledTabs.length > 0) {
            setTab(enabledTabs[0]);
        }
    }, [hasArCollections, links.length, hasEducation, hasInternalRequisitions, hasFieldExecution, hasApPayables, tab]);

    useEffect(() => {
        if (!selectedFieldRun) return;
        const assigned = String(
            selectedFieldRun?.output?.assignment?.assigneeId
            || selectedFieldRun?.input?.assigneeId
            || 'owner'
        ).trim();
        if (!assigned || assigned === 'owner') {
            setFieldReassignAssigneeId('owner');
            return;
        }

        if (orgMembers.some((m) => m.userId === assigned)) {
            setFieldReassignAssigneeId(`member:${assigned}`);
            return;
        }

        if (contacts.some((c) => c.phone === assigned)) {
            setFieldReassignAssigneeId(`contact:${assigned}`);
            return;
        }

        setFieldReassignAssigneeId(assigned);
    }, [selectedFieldRun, orgMembers, contacts]);

    /* ── Create Payment Link / AR Collection ── */

    const handleCreate = async () => {
        if (!form.description.trim() || !form.amount) return;
        setCreating(true);
        setError(null);
        try {
            const amount = parseFloat(form.amount);

            if (hasArCollections) {
                // Route all AR creation through the plans API so one_time, instalment, and recurring
                // all appear in the AR collections list.
                const token = getPreferredToken();
                const body: Record<string, unknown> = {
                    collectionType: form.collectionType,
                    description: form.description.trim(),
                    totalAmount: amount,
                    currency: form.currency,
                    payerName: form.payerName.trim() || undefined,
                    payerPhone: form.payerPhone.trim() || undefined,
                    contactId: selectedContact?.id || undefined,
                    firstDueDate: form.firstDueDate || undefined,
                };
                if (form.collectionType !== 'one_time') {
                    body.instalments = parseInt(form.instalments);
                    if (form.collectionType === 'recurring') body.cadence = form.cadence;
                }
                await api.post('/api/finance/ar/plans', body, {
                    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
                });
                const typeLabel = form.collectionType === 'one_time' ? 'Payment link' : form.collectionType === 'instalment' ? 'Instalment plan' : 'Recurring billing';
                const apMirrorNote = form.collectionType !== 'one_time' ? ' AP mirror pending until payer is wallet-linked.' : '';
                notifications.show({
                    title: `${typeLabel} created`,
                    message: `${form.description.trim()} — ${fmt(amount, form.currency)}${apMirrorNote}`,
                    color: 'green',
                    icon: <IconCheck size={16} />,
                });
                setShowCreate(false);
                setForm({ description: '', amount: '', currency: 'USD', invoiceRef: '', merchantName: '', expiryHours: '336', collectionType: 'one_time', payerName: '', payerPhone: '', instalments: '3', cadence: 'monthly', firstDueDate: dayjs().format('YYYY-MM-DD') });
                setSelectedContact(null);
                void fetchLinks();
                return;
            }

            // Legacy path (no AR module): post direct payment link
            let link: PaymentLink;
            if (selectedContact?.id) {
                const contactPaymentKey = makeIdempotencyKey('mobile-contact-payment-link', [
                    selectedContact.id,
                    form.description,
                    amount,
                    form.currency,
                    form.invoiceRef,
                ]);
                const { data } = await api.post(
                    `/api/contacts/${selectedContact.id}/payment-link`,
                    {
                        description: form.description.trim(),
                        amount,
                        currency: form.currency,
                        invoiceRef: form.invoiceRef || undefined,
                        expiryHours: parseInt(form.expiryHours),
                    },
                    { headers: { 'x-idempotency-key': contactPaymentKey } },
                );
                link = {
                    id: data.paymentLinkId,
                    merchantId: '',
                    description: form.description.trim(),
                    amount,
                    currency: form.currency,
                    invoiceRef: form.invoiceRef || undefined,
                    status: 'active',
                    expiry: data.expiresAt,
                    shortlinkCode: data.shortlinkCode,
                    shortlinkUrl: data.shortUrl,
                    createdAt: new Date().toISOString(),
                };
            } else {
                const paymentKey = makeIdempotencyKey('mobile-payment-link', [
                    form.description, amount, form.currency, form.invoiceRef, form.merchantName,
                ]);
                const { data } = await api.post(
                    '/api/payment-links',
                    {
                        description: form.description.trim(),
                        amount,
                        currency: form.currency,
                        invoiceRef: form.invoiceRef || undefined,
                        merchantName: form.merchantName || undefined,
                        expiryHours: parseInt(form.expiryHours),
                    },
                    { headers: { 'x-idempotency-key': paymentKey } },
                );
                link = data.link;
            }
            setLinks((prev) => [link, ...prev]);
            setCreatedLink(link);
            setShowCreate(false);
            setForm({ description: '', amount: '', currency: 'USD', invoiceRef: '', merchantName: '', expiryHours: '336', collectionType: 'one_time', payerName: '', payerPhone: '', instalments: '3', cadence: 'monthly', firstDueDate: dayjs().format('YYYY-MM-DD') });
            setSelectedContact(null);
            notifications.show({
                title: selectedContact?.id ? 'Link Sent' : 'Link Created',
                message: selectedContact?.id
                    ? `Sent to ${selectedContact.name}. They can pay from inbox or public link.`
                    : `${link.description} — ${fmt(link.amount, link.currency)}`,
                color: 'green',
                icon: <IconCheck size={16} />,
            });
        } catch (err: any) {
            setError(err.response?.data?.message ?? 'Failed to create payment link');
        } finally {
            setCreating(false);
        }
    };

    const handleCreatePlan = async () => {
        if (!planForm.description.trim() || !planForm.totalAmount || !planForm.payerName.trim()) {
            notifications.show({
                title: 'Error',
                message: 'Description, Total Amount, and Customer Name are required.',
                color: 'red',
            });
            return;
        }

        setCreatingPlan(true);
        setError(null);
        try {
            const body = {
                collectionType: 'instalment' as const,
                description: planForm.description.trim(),
                totalAmount: parseFloat(planForm.totalAmount),
                currency: planForm.currency,
                payerName: planForm.payerName.trim(),
                payerPhone: planForm.payerPhone || undefined,
                payerEmail: planForm.payerEmail || undefined,
                contactId: selectedPlanContact?.id || undefined,
                instalments: parseInt(planForm.instalments),
                cadence: planForm.cadence as 'weekly' | 'monthly',
                firstDueDate: planForm.firstDueDate || undefined,
            };

            const token = getPreferredToken();
            const res = await api.post('/api/finance/ar/plans', body, {
                headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            });

            if (res.status === 200 || res.status === 201) {
                const apMirror = res.data?.apMirror as { mirrored?: boolean; mirroredInvoices?: number } | undefined;
                const apMirrorMsg = apMirror?.mirrored
                    ? ` AP mirror: ${apMirror.mirroredInvoices ?? 0} workflow item(s) visible to payer org.`
                    : ' AP mirror pending until the payer contact is wallet-linked.';
                notifications.show({
                    title: 'Plan Created',
                    message: `Payment Plan for ${body.payerName} created successfully.${apMirrorMsg}`,
                    color: 'green',
                    icon: <IconCheck size={16} />,
                });
                setShowCreatePlan(false);
                setSelectedPlanContact(null);
                setPlanForm({
                    description: '',
                    totalAmount: '',
                    currency: 'USD',
                    payerName: '',
                    payerPhone: '',
                    payerEmail: '',
                    instalments: '3',
                    cadence: 'monthly',
                    firstDueDate: dayjs().format('YYYY-MM-DD'),
                });
                void fetchLinks();
                void fetchApSuppliers();
                void fetchApWorkflowActions();
            }
        } catch (err: any) {
            setError(err.response?.data?.message ?? 'Failed to create payment plan');
        } finally {
            setCreatingPlan(false);
        }
    };

    /* ── Cancel Link ── */

    const handleCancel = async (id: string) => {
        try {
            await api.delete(`/api/payment-links/${id}`);
            setLinks((prev) => prev.map((l) => l.id === id ? { ...l, status: 'cancelled' as const } : l));
            notifications.show({ title: 'Cancelled', message: 'Payment link cancelled', color: 'gray' });
        } catch (err: any) {
            notifications.show({ title: 'Error', message: err.response?.data?.message ?? err.message, color: 'red' });
        }
    };

    /* ── Create Invoice ── */

    const handleCreateInvoice = async () => {
        if (!invoiceForm.amount) return;

        const invoiceAmount = Number.parseFloat(invoiceForm.amount);
        if (!Number.isFinite(invoiceAmount) || invoiceAmount <= 0) {
            notifications.show({
                title: 'Invalid Amount',
                message: 'Provide a valid invoice amount before submitting.',
                color: 'red',
            });
            return;
        }

        const canIssueInvoice = await enforceOrgActionPolicy({
            actionType: 'finance.issue_invoice',
            amount: invoiceAmount,
            // Existing invoice flow has no explicit evidence capture step yet.
            evidenceProvided: false,
        });
        if (!canIssueInvoice) return;

        setCreatingInvoice(true);
        try {
            const amount = invoiceAmount;
            const desc = invoiceForm.description ||
                `${invoiceForm.feeType} – ${invoiceForm.studentName} (${invoiceForm.className}, ${invoiceForm.term})`;

            const normalizedStudentId = invoiceForm.studentId.trim() || `STU-${Date.now().toString().slice(-6)}`;
            const normalizedTerm = invoiceForm.term.trim() || 'current-term';

            const invoiceIssueKey = makeIdempotencyKey('mobile-issue-invoice', [
                normalizedStudentId,
                normalizedTerm,
                amount,
                invoiceForm.currency,
                selectedInvoiceContact?.id,
            ]);
            const { data } = await api.post(
                '/api/finance/invoices/issue',
                {
                    cartRef: `SCHOOL-${normalizedStudentId}-${normalizedTerm}`,
                    amount,
                    currency: invoiceForm.currency,
                    dueDate: new Date(Date.now() + 14 * 86400000).toISOString(),
                    description: desc,
                    contactId: selectedInvoiceContact?.id || undefined,
                    metadata: {
                        type: 'School Fees',
                        studentName: invoiceForm.studentName,
                        studentId: normalizedStudentId,
                        class: invoiceForm.className,
                        term: normalizedTerm,
                        feeType: invoiceForm.feeType,
                        parentPhone: invoiceForm.parentPhone || undefined,
                    },
                },
                {
                    headers: {
                        'x-idempotency-key': invoiceIssueKey,
                    },
                },
            );

            const invoiceLink: PaymentLink = {
                id: String(data?.paymentLinkId || `pl-${Date.now()}`),
                merchantId: String(getActiveOrgId() || ''),
                merchantName: form.merchantName || undefined,
                description: desc,
                amount,
                currency: invoiceForm.currency,
                invoiceRef: String(data?.invoiceId || ''),
                status: 'active',
                expiry: new Date(Date.now() + 336 * 3600_000).toISOString(),
                shortlinkCode: String(data?.shortlinkCode || ''),
                shortlinkUrl: String(data?.paymentUrl || ''),
                createdAt: new Date().toISOString(),
            };

            setLinks((prev) => {
                const exists = prev.some((entry) => entry.id === invoiceLink.id);
                return exists ? prev : [invoiceLink, ...prev];
            });
            setCreatedLink(invoiceLink);
            setTab('invoices');

            notifications.show({
                title: 'School Fee Invoice Issued',
                message: selectedInvoiceContact?.id
                    ? `${desc} — sent to ${selectedInvoiceContact.name}`
                    : `${desc} — ${fmt(amount, invoiceForm.currency)}`,
                color: 'green',
                icon: <IconCheck size={16} />,
            });
            setShowInvoice(false);
            setInvoiceForm({
                studentName: '',
                studentId: '',
                className: '',
                term: '',
                feeType: 'Tuition',
                amount: '',
                currency: 'USD',
                description: '',
                parentPhone: '',
            });
            setSelectedInvoiceContact(null);
            await fetchLinks();
        } catch (err: any) {
            notifications.show({ title: 'Error', message: err.response?.data?.message ?? err.message, color: 'red' });
        } finally {
            setCreatingInvoice(false);
        }
    };

    const handleCreateRequisition = async () => {
        if (!requisitionForm.amount) return;

        setCreatingRequisition(true);
        try {
            const amount = parseFloat(requisitionForm.amount);
            const orgId = getActiveOrgId();

            const body = {
                orgTenantId: orgId || undefined,
                department: requisitionForm.department,
                vendor: requisitionForm.vendor || undefined,
                currency: requisitionForm.currency,
                notes: requisitionForm.notes || undefined,
                items: [
                    {
                        id: `item-${Date.now()}`,
                        name: requisitionForm.notes?.trim() || requisitionForm.vendor?.trim() || 'Requisition item',
                        price: amount,
                        quantity: 1,
                    },
                ],
                totalAmount: amount,
            };

            await api.post('/api/finance/requisitions/request', body);

            notifications.show({
                title: 'Requisition Submitted',
                message: 'Request created and routed into requisition workflow.',
                color: 'green',
                icon: <IconCheck size={16} />,
            });

            setShowRequisition(false);
            setRequisitionForm({
                department: 'Operations',
                vendor: '',
                amount: '',
                currency: 'USD',
                notes: '',
            });
            fetchRequisitions();
        } catch (err: any) {
            notifications.show({
                title: 'Create Requisition Failed',
                message: err.response?.data?.message ?? err.message,
                color: 'red',
            });
        } finally {
            setCreatingRequisition(false);
        }
    };

    const handleCreateFieldRun = async () => {
        if (!fieldRunForm.amount) return;

        setCreatingFieldRun(true);
        try {
            const amount = parseFloat(fieldRunForm.amount);
            const template = findTemplateForCapability(activeTemplates, 'field_execution');

            if (!template) {
                throw new Error('Field execution template not found or not enabled for this organisation.');
            }

            const body = {
                amount,
                currency: fieldRunForm.currency,
                description: fieldRunForm.description,
                location: fieldRunForm.location,
                scheduledDate: fieldRunForm.scheduledDate,
                reference: `FR-${Date.now()}`,
                requestId: `FR-${Date.now()}`, // Required by template
                // FEPT test default: assign to owner/admin fallback.
                ...resolveAssigneeSelection(fieldRunForm.assigneeId, ownerUserId),
                triggerRef: `manual-finance-${Date.now()}`,
            };

            const res = await api.post(`/workflows/${template.id}/execute`, body);

            notifications.show({
                title: 'Field Run Started',
                message: `Workflow ${res.data?.runId || ''} initiated and registered in Finance.`,
                color: 'teal',
                icon: <IconCheck size={16} />,
            });

            setShowFieldRun(false);
            setFieldRunForm({
                description: '',
                amount: '',
                currency: 'USD',
                location: '',
                scheduledDate: dayjs().add(1, 'day').format('YYYY-MM-DD'),
                assigneeId: 'owner',
            });

            // Refresh FEPT runs after a short delay to allow background event processing
            setTimeout(fetchFieldRuns, 1000);
        } catch (err: any) {
            notifications.show({
                title: 'Start Field Run Failed',
                message: err.response?.data?.message ?? err.message,
                color: 'red',
            });
        } finally {
            setCreatingFieldRun(false);
        }
    };

    const handleFeptStageAction = async (runId: string, action: 'approve' | 'ack' | 'trigger_payment' | 'reconcile') => {
        if (!runId) return;

        const policyActionByStage: Record<typeof action, { actionType: string; evidenceProvided: boolean }> = {
            approve: { actionType: 'workflow.approve_requisition', evidenceProvided: true },
            ack: { actionType: 'workflow.acknowledge_completion', evidenceProvided: true },
            trigger_payment: { actionType: 'finance.reconcile_offline', evidenceProvided: true },
            reconcile: { actionType: 'finance.reconcile_offline', evidenceProvided: true },
        };

        const policyConfig = policyActionByStage[action];
        const isAllowedByPolicy = await enforceOrgActionPolicy({
            actionType: policyConfig.actionType,
            evidenceProvided: policyConfig.evidenceProvided,
        });
        if (!isAllowedByPolicy) return;

        if (!feptPresentationRef.trim()) {
            notifications.show({
                title: 'VC Proof Required',
                message: 'Provide a VC presentation reference before advancing this FEPT stage.',
                color: 'red',
            });
            return;
        }

        const token = getPreferredToken();
        if (!token) {
            notifications.show({ title: 'Session Required', message: 'Switch to organization context first.', color: 'red' });
            return;
        }

        setFeptActionLoading(true);
        try {
            const stagePayloadByAction: Record<string, Record<string, unknown>> = {
                approve: {
                    approvalPresentation: { id: feptPresentationRef.trim(), type: 'ApprovalVP' },
                    approvalSignature: feptPresentationRef.trim(),
                },
                ack: {
                    acknowledgementPresentation: { id: feptPresentationRef.trim(), type: 'AcknowledgeVP' },
                    ackNotes: 'VC-verified acknowledgement',
                },
                trigger_payment: {
                    releasePresentation: { id: feptPresentationRef.trim(), type: 'ReleaseVP' },
                },
                reconcile: {
                    reconciliationPresentation: { id: feptPresentationRef.trim(), type: 'ReconciliationVP' },
                },
            };

            await api.post(
                `/workflows/runs/${encodeURIComponent(runId)}/resume`,
                stagePayloadByAction[action],
                { headers: { Authorization: `Bearer ${token}` } },
            );

            notifications.show({ title: 'FEPT Step Updated', message: 'Stage action completed with VC guard payload.', color: 'green' });
            setFeptPresentationRef('');
            await fetchFieldRuns();
            // Refresh the detail drawer in-place so the new stage is immediately visible.
            try {
                const refreshedRun = await api.get(`/workflows/runs/${encodeURIComponent(runId)}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                setSelectedFieldRun(refreshedRun.data);
            } catch {
                // Non-fatal — list is already refreshed via fetchFieldRuns.
            }
        } catch (err: any) {
            notifications.show({
                title: 'FEPT Action Failed',
                message: err.response?.data?.error || err.response?.data?.message || err.message,
                color: 'red',
            });
        } finally {
            setFeptActionLoading(false);
        }
    };

    const handleStartFieldRun = async (runId: string) => {
        const normalizedRunId = normalizeRunId(runId);
        if (!normalizedRunId) return;

        const token = getPreferredToken();
        if (!token) {
            notifications.show({ title: 'Session Required', message: 'Switch to organization context first.', color: 'red' });
            return;
        }

        setFeptActionLoading(true);
        try {
            await api.post(
                `/workflows/runs/${encodeURIComponent(normalizedRunId)}/resume`,
                {},
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'x-idempotency-key': `finance-start-job:${normalizedRunId}`,
                    },
                },
            );

            notifications.show({ title: 'Job Started', message: 'Field run moved to in-progress.', color: 'green' });
            await fetchFieldRuns();

            try {
                const refreshed = await api.get(`/workflows/runs/${encodeURIComponent(normalizedRunId)}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                setSelectedFieldRun(refreshed.data);
            } catch {
                // Non-fatal if refreshed run fetch is unavailable.
            }
        } catch (err: any) {
            notifications.show({
                title: 'Start Job Failed',
                message: err.response?.data?.error || err.response?.data?.message || err.message,
                color: 'red',
            });
        } finally {
            setFeptActionLoading(false);
        }
    };

    const handleCaptureFieldEvidence = (run: any) => {
        const runId = String(run?.id || '');
        const normalizedRunId = normalizeRunId(runId);
        if (!normalizedRunId) return;

        const runPolicyCheck = evaluateOrgActionPolicy(orgContextBundle, {
            actionType: 'workflow.capture_evidence',
            evidenceProvided: true,
            actionTimestamp: new Date().toISOString(),
        });
        if (!runPolicyCheck.allowed) {
            const escalationHint = runPolicyCheck.suggestedEscalationRole
                ? ` Escalate to ${runPolicyCheck.suggestedEscalationRole}.`
                : '';
            notifications.show({
                title: 'Policy Check Failed',
                message: `${runPolicyCheck.reason || 'Capture evidence is blocked by org policy.'}${escalationHint}`,
                color: 'red',
            });
            return;
        }

        const phase = inferNextEvidencePhase(run);
        setSelectedFieldRun(null);
        void router.push(`/activity?ref=${encodeURIComponent(normalizedRunId)}&capture=1&phase=${encodeURIComponent(phase)}`);
    };

    const handleReassignFieldTask = async (runId: string, assigneeId?: string | null) => {
        if (!runId) return;
        const resolved = resolveAssigneeSelection(assigneeId || fieldReassignAssigneeId || 'owner', ownerUserId);
        if (!resolved.assigneeId) {
            notifications.show({ title: 'Assignee Required', message: 'Select a target assignee first.', color: 'red' });
            return;
        }

        const token = getPreferredToken();
        if (!token) {
            notifications.show({ title: 'Session Required', message: 'Switch to organization context first.', color: 'red' });
            return;
        }

        setFeptActionLoading(true);
        try {
            await api.post(
                `/workflows/runs/${encodeURIComponent(runId)}/resume`,
                {
                    assigneeId: resolved.assigneeId,
                    assigneeUserId: resolved.assigneeUserId,
                    assignmentPresentation: {
                        id: feptPresentationRef.trim() || `owner-reassign-${Date.now()}`,
                        type: 'AssignmentVP',
                    },
                },
                { headers: { Authorization: `Bearer ${token}` } },
            );

            notifications.show({ title: 'Reassigned', message: 'Task reassignment applied for this FEPT run.', color: 'teal' });
            await fetchFieldRuns();

            try {
                const refreshed = await api.get(`/workflows/runs/${encodeURIComponent(runId)}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                setSelectedFieldRun(refreshed.data);
            } catch {
                // Keep existing drawer state if refresh fails.
            }
        } catch (err: any) {
            notifications.show({
                title: 'Reassign Failed',
                message: err.response?.data?.error || err.response?.data?.message || err.message,
                color: 'red',
            });
        } finally {
            setFeptActionLoading(false);
        }
    };

    const parseRequestUri = (requestUrl: string): string | null => {
        try {
            const parsed = new URL(requestUrl);
            return parsed.searchParams.get('request_uri');
        } catch {
            return null;
        }
    };

    const buildWalletInteropQrValue = (requestUrl: string): string => {
        try {
            const parsed = new URL(requestUrl);
            const requestUri = parsed.searchParams.get('request_uri');
            if (requestUri) {
                return `openid-vc://?request_uri=${encodeURIComponent(requestUri)}`;
            }
        } catch {
            // fall back to raw URL when deep-link transform fails
        }
        return requestUrl;
    };

    const createExternalWalletLinks = (requestUrl: string) => {
        const requestUri = parseRequestUri(requestUrl);
        if (!requestUri) {
            return {
                openIdVc: requestUrl,
                openId4Vp: requestUrl,
            };
        }

        return {
            openIdVc: `openid-vc://?request_uri=${encodeURIComponent(requestUri)}`,
            openId4Vp: `openid4vp://authorize?request_uri=${encodeURIComponent(requestUri)}`,
        };
    };

    const handleOpenApprovalModal = async () => {
        if (!selectedRequisitionId) return;

        const allowed = await enforceOrgActionPolicy({
            actionType: 'workflow.approve_requisition',
            amount: requestedAmount.amount,
            // Approval modal collects VP-based evidence before final submission.
            evidenceProvided: true,
        });
        if (!allowed) return;

        setShowApprovalModal(true);
        setCreatingApprovalRequest(true);
        setApprovalRequestId(null);
        setApprovalRequestUrl(null);

        const token = getPreferredToken();
        if (!token) {
            notifications.show({
                title: 'Session Required',
                message: 'Ensure you have an active organization session.',
                color: 'red',
            });
            setShowApprovalModal(false);
            setCreatingApprovalRequest(false);
            return;
        }

        try {
            const { data } = await api.post(
                `/api/finance/requisitions/${encodeURIComponent(selectedRequisitionId)}/approval/request`,
                {},
                { headers: { Authorization: `Bearer ${token}` } },
            );
            setApprovalRequestId(data.requestId);
            setApprovalRequestUrl(data.presentationRequestUrl);
        } catch (err: any) {
            notifications.show({
                title: 'Approval Setup Failed',
                message: err.response?.data?.error || err.message || 'Could not generate approval request.',
                color: 'red',
            });
            setShowApprovalModal(false);
        } finally {
            setCreatingApprovalRequest(false);
        }
    };

    const handleApprove = async () => {
        if (!selectedRequisitionId || !approvalRequestId || !approvalRequestUrl) {
            notifications.show({
                title: 'Approval Request Missing',
                message: 'Re-open the approval modal to generate a valid request.',
                color: 'red',
            });
            return;
        }

        const allowed = await enforceOrgActionPolicy({
            actionType: 'workflow.approve_requisition',
            amount: requestedAmount.amount,
            evidenceProvided: Boolean(approvalRequestId && approvalRequestUrl),
        });
        if (!allowed) return;

        const reauthOk = await requireSensitiveOrgReauth('approve this requisition');
        if (!reauthOk) {
            notifications.show({
                title: 'Re-authentication Cancelled',
                message: 'Approval was cancelled before submission.',
                color: 'yellow',
            });
            return;
        }

        setApproving(true);
        try {
            const token = getPreferredToken();
            if (!token) throw new Error('No active organization session.');
            const personalWalletId = getPersonalWalletTenantId();
            if (!personalWalletId) throw new Error('Personal wallet session is required for embedded approval.');

            const res = await api.post(
                `/api/finance/requisitions/${encodeURIComponent(selectedRequisitionId)}/approve/embedded-wallet`,
                {
                    requestId: approvalRequestId,
                    presentationRequestUrl: approvalRequestUrl,
                    walletId: personalWalletId,
                },
                { headers: { Authorization: `Bearer ${token}` } },
            );
            // The embedded-wallet endpoint may return { error } with HTTP 200 when the internal
            // approveRequisition call fails (e.g., wrong org role for the current stage).
            if (res.data?.error) throw new Error(res.data.error);

            notifications.show({
                title: 'Approved',
                message: 'Requisition has been approved.',
                color: 'green',
            });
            setShowApprovalModal(false);
            setApprovalRequestId(null);
            setApprovalRequestUrl(null);
            setSelectedRequisitionId(null);
            setSelectedRequisition(null);
            await fetchRequisitions();
        } catch (err: any) {
            notifications.show({
                title: 'Approval Failed',
                message: err.response?.data?.error || err.message,
                color: 'red',
            });
        } finally {
            setApproving(false);
        }
    };

    const handleCopyRequestUrl = async (requestUrl: string) => {
        try {
            await navigator.clipboard.writeText(requestUrl);
            notifications.show({
                title: 'Copied',
                message: 'Approval request URL copied to clipboard.',
                color: 'green',
            });
        } catch {
            notifications.show({
                title: 'Copy Failed',
                message: 'Unable to copy approval request URL.',
                color: 'red',
            });
        }
    };

    const handleOpenExternalWallet = (url: string) => {
        if (typeof window === 'undefined') return;
        window.location.href = url;
    };

    const handleOpenApprovalInApp = () => {
        if (!selectedRequisitionId || !approvalRequestUrl) {
            notifications.show({
                title: 'Approval Request Missing',
                message: 'Generate the approval request before opening it in the mobile wallet.',
                color: 'red',
            });
            return;
        }

        const params = new URLSearchParams({
            request_uri: approvalRequestUrl,
            mode: 'requisition-approve',
            requisitionId: selectedRequisitionId,
        });
        const activeOrgId = getActiveOrgId();
        if (activeOrgId) {
            params.set('orgTenantId', activeOrgId);
        }

        void router.push(`/present?${params.toString()}`);
    };

    const handleOpenReleaseInApp = () => {
        if (!selectedRequisitionId || !releaseRequestUrl) {
            notifications.show({
                title: 'Release Request Missing',
                message: 'Generate the release request before opening it in the mobile wallet.',
                color: 'red',
            });
            return;
        }

        const params = new URLSearchParams({
            request_uri: releaseRequestUrl,
            mode: 'requisition-release',
            requisitionId: selectedRequisitionId,
            amount: String(requestedAmount.amount),
            currency: requestedAmount.currency,
        });
        const activeOrgId = getActiveOrgId();
        if (activeOrgId) {
            params.set('orgTenantId', activeOrgId);
        }

        void router.push(`/present?${params.toString()}`);
    };

    const handleOpenAckInApp = () => {
        if (!selectedRequisitionId || !ackRequestUrl) {
            notifications.show({
                title: 'Ack Request Missing',
                message: 'Generate the acknowledge request before opening it in the mobile wallet.',
                color: 'red',
            });
            return;
        }

        const params = new URLSearchParams({
            request_uri: ackRequestUrl,
            mode: 'requisition-ack',
            requisitionId: selectedRequisitionId,
        });
        const activeOrgId = getActiveOrgId();
        if (activeOrgId) {
            params.set('orgTenantId', activeOrgId);
        }

        void router.push(`/present?${params.toString()}`);
    };

    const handleScanPortalApproval = () => {
        if (!selectedRequisitionId) {
            notifications.show({
                title: 'Requisition Missing',
                message: 'Open a requisition before scanning a portal approval QR.',
                color: 'red',
            });
            return;
        }

        const params = new URLSearchParams({
            mode: 'approve-requisition',
            requisitionId: selectedRequisitionId,
        });
        const activeOrgId = getActiveOrgId();
        if (activeOrgId) {
            params.set('orgTenantId', activeOrgId);
        }

        void router.push(`/scan?${params.toString()}`);
    };

    const handleScanPortalRelease = () => {
        if (!selectedRequisitionId) {
            notifications.show({
                title: 'Requisition Missing',
                message: 'Open a requisition before scanning a portal release QR.',
                color: 'red',
            });
            return;
        }

        const params = new URLSearchParams({
            mode: 'release-funds',
            requisitionId: selectedRequisitionId,
            amount: String(requestedAmount.amount),
            currency: requestedAmount.currency,
        });
        const activeOrgId = getActiveOrgId();
        if (activeOrgId) {
            params.set('orgTenantId', activeOrgId);
        }

        void router.push(`/scan?${params.toString()}`);
    };

    const handleScanPortalAck = () => {
        if (!selectedRequisitionId) {
            notifications.show({
                title: 'Requisition Missing',
                message: 'Open a requisition before scanning a portal acknowledgment QR.',
                color: 'red',
            });
            return;
        }

        const params = new URLSearchParams({
            mode: 'acknowledge-requisition',
            requisitionId: selectedRequisitionId,
        });
        const activeOrgId = getActiveOrgId();
        if (activeOrgId) {
            params.set('orgTenantId', activeOrgId);
        }

        void router.push(`/scan?${params.toString()}`);
    };

    const handleRequisitionDecision = async (action: 'approve' | 'reject') => {
        // This function is deprecated - approval now uses VP-based flow
        // Kept for backward compatibility
        return;
    };

    const handleOpenReleaseModal = async () => {
        if (!selectedRequisitionId) return;
        setShowReleaseModal(true);
        setCreatingReleaseRequest(true);
        setReleaseRequestId(null);
        setReleaseRequestUrl(null);
        const token = getPreferredToken();
        if (!token) {
            notifications.show({ title: 'Session Required', message: 'Switch to your organization profile to release funds.', color: 'red' });
            setShowReleaseModal(false);
            setCreatingReleaseRequest(false);
            return;
        }
        try {
            const { data } = await api.post(
                `/api/finance/requisitions/${encodeURIComponent(selectedRequisitionId)}/release/request`,
                {},
                { headers: { Authorization: `Bearer ${token}` } },
            );
            setReleaseRequestId(data.requestId);
            setReleaseRequestUrl(data.presentationRequestUrl);
        } catch (err: any) {
            notifications.show({ title: 'Release Setup Failed', message: err.response?.data?.error || err.message || 'Could not generate secure verification request.', color: 'red' });
            setShowReleaseModal(false);
        } finally {
            setCreatingReleaseRequest(false);
        }
    };

    const handleRequisitionRelease = async () => {
        if (!selectedRequisitionId || !releaseRequestId || !releaseRequestUrl) {
            notifications.show({ title: 'Release Request Missing', message: 'Re-open the release modal to generate a valid request.', color: 'red' });
            return;
        }

        const reauthOk = await requireSensitiveOrgReauth('release funds for this requisition');
        if (!reauthOk) {
            notifications.show({
                title: 'Re-authentication Cancelled',
                message: 'Release was cancelled before submission.',
                color: 'yellow',
            });
            return;
        }

        setReleasing(true);
        try {
            const token = getPreferredToken();
            if (!token) throw new Error('No active organization session.');
            const personalWalletId = getPersonalWalletTenantId();
            if (!personalWalletId) throw new Error('Personal wallet session is required for embedded release.');
            const releaseRes = await api.post(
                `/api/finance/requisitions/${encodeURIComponent(selectedRequisitionId)}/release/embedded-wallet`,
                {
                    requestId: releaseRequestId,
                    presentationRequestUrl: releaseRequestUrl,
                    walletId: personalWalletId,
                    amount: requestedAmount.amount,
                    currency: requestedAmount.currency,
                },
                { headers: { Authorization: `Bearer ${token}` } },
            );
            if (releaseRes.data?.error) throw new Error(releaseRes.data.error);
            notifications.show({ title: 'Funds Released', message: 'Payment release was recorded for this requisition.', color: 'green' });
            setShowReleaseModal(false);
            setReleaseRequestId(null);
            setReleaseRequestUrl(null);
            setSelectedRequisitionId(null);
            setSelectedRequisition(null);
            await fetchRequisitions();
        } catch (err: any) {
            notifications.show({ title: 'Release Failed', message: err.response?.data?.error || err.message, color: 'red' });
        } finally {
            setReleasing(false);
        }
    };

    const handleOpenAckModal = async () => {
        if (!selectedRequisitionId) return;
        setShowAckModal(true);
        setCreatingAckRequest(true);
        setAckRequestId(null);
        setAckRequestUrl(null);
        const token = getPreferredToken();
        if (!token) {
            notifications.show({ title: 'Session Required', message: 'Switch to your organization profile to acknowledge execution.', color: 'red' });
            setShowAckModal(false);
            setCreatingAckRequest(false);
            return;
        }
        try {
            const { data } = await api.post(
                `/api/finance/requisitions/${encodeURIComponent(selectedRequisitionId)}/ack/request`,
                {},
                { headers: { Authorization: `Bearer ${token}` } },
            );
            setAckRequestId(data.requestId);
            setAckRequestUrl(data.presentationRequestUrl);
        } catch (err: any) {
            notifications.show({ title: 'Ack Setup Failed', message: err.response?.data?.error || err.message || 'Could not generate secure verification request.', color: 'red' });
            setShowAckModal(false);
        } finally {
            setCreatingAckRequest(false);
        }
    };

    const handleRequisitionAcknowledge = async () => {
        if (!selectedRequisitionId || !ackRequestId || !ackRequestUrl) {
            notifications.show({ title: 'Ack Request Missing', message: 'Re-open the acknowledge modal to generate a valid request.', color: 'red' });
            return;
        }

        const allowed = await enforceOrgActionPolicy({
            actionType: 'workflow.acknowledge_completion',
            evidenceProvided: true,
        });
        if (!allowed) return;

        const reauthOk = await requireSensitiveOrgReauth('acknowledge this requisition');
        if (!reauthOk) {
            notifications.show({
                title: 'Re-authentication Cancelled',
                message: 'Acknowledgement was cancelled before submission.',
                color: 'yellow',
            });
            return;
        }

        setAcking(true);
        try {
            const token = getPreferredToken();
            if (!token) throw new Error('No active organization session.');
            const personalWalletId = getPersonalWalletTenantId();
            if (!personalWalletId) throw new Error('Personal wallet session is required for embedded acknowledge.');
            const ackRes = await api.post(
                `/api/finance/requisitions/${encodeURIComponent(selectedRequisitionId)}/ack/embedded-wallet`,
                {
                    requestId: ackRequestId,
                    presentationRequestUrl: ackRequestUrl,
                    walletId: personalWalletId,
                    notes: requisitionLifecycleNote.trim() || 'Goods/services received and confirmed.',
                },
                { headers: { Authorization: `Bearer ${token}` } },
            );
            if (ackRes.data?.error) throw new Error(ackRes.data.error);
            notifications.show({ title: 'Execution Acknowledged', message: 'Delivery acknowledgment was recorded.', color: 'teal' });
            setShowAckModal(false);
            setAckRequestId(null);
            setAckRequestUrl(null);
            setSelectedRequisitionId(null);
            setSelectedRequisition(null);
            await fetchRequisitions();
        } catch (err: any) {
            notifications.show({ title: 'Acknowledge Failed', message: err.response?.data?.error || err.message, color: 'red' });
        } finally {
            setAcking(false);
        }
    };

    // Auto-open approval modal when returning from external wallet VP flow
    useEffect(() => {
        if (!selectedRequisitionId || !selectedRequisition) return;

        const autoApproveModal = router.query.autoApproveModal === 'true';
        if (autoApproveModal && !showApprovalModal) {
            setTimeout(() => {
                handleOpenApprovalModal();
            }, 500);

            // Consume one-shot query flag so refresh/back does not reopen endlessly.
            const nextQuery = { ...router.query } as Record<string, any>;
            delete nextQuery.autoApproveModal;
            void router.replace({ pathname: router.pathname, query: nextQuery }, undefined, { shallow: true });
        }
    }, [selectedRequisitionId, selectedRequisition, router.query.autoApproveModal, showApprovalModal]);

    useEffect(() => {
        if (!selectedRequisitionId) return;
        void openRequisitionDetails(selectedRequisitionId);
    }, [selectedRequisitionId, openRequisitionDetails]);

    /* ── WhatsApp share helper ── */

    const shareWhatsApp = (link: PaymentLink, phone?: string) => {
        const checkoutUrl = getLinkCheckoutUrl(link);
        if (!checkoutUrl) {
            notifications.show({
                title: 'Missing Payment URL',
                message: 'This link is missing a checkout URL. Refresh and try again.',
                color: 'red',
            });
            return;
        }

        const isSchoolFees = Boolean(link.invoiceRef)
            || /school|fee|fees|tuition/i.test(`${link.description || ''} ${link.merchantName || ''}`);

        const message = isSchoolFees
            ? `School fees payment request: ${fmt(link.amount, link.currency)} for ${link.description}. Complete checkout here: ${checkoutUrl}`
            : `Please pay ${fmt(link.amount, link.currency)} for ${link.description}. Complete checkout here: ${checkoutUrl}`;

        const msg = encodeURIComponent(message);
        const url = phone ? `https://wa.me/${phone.replace(/\D/g, '')}?text=${msg}` : `https://wa.me/?text=${msg}`;
        window.open(url, '_blank');
    };

    /* ── Stats ── */

    const invoiceBackedLinks = links.filter((l) => Boolean(l.invoiceRef));
    const trackedPaymentLinks = links;
    const inboundObligations = arObligations.filter((row) => String(row.status || '').toLowerCase() !== 'completed');
    const pendingProofCount = trackedPaymentLinks.filter((l) => {
        const a = l as any;
        return l.status === 'active' && a.proof_request_id && !a.proof_response_id;
    }).length;
    const verifiedCount = trackedPaymentLinks.filter((l) => (l as any).receipt_vc_id || l.status === 'paid').length;
    const disputedCount = trackedPaymentLinks.filter((l) => String((l as any).status || '').toLowerCase() === 'disputed').length;
    const pendingApProofActions = apWorkflowActions.filter((item) => (
        Boolean(item.required_action)
        && Boolean(item.required_proof_type)
        && !item.proof_response_id
    ));
    const activeCount = trackedPaymentLinks.filter((l) => l.status === 'active').length;
    const paidCount = trackedPaymentLinks.filter((l) => l.status === 'paid').length;
    const revenue = trackedPaymentLinks.filter((l) => l.status === 'paid').reduce((s, l) => s + l.amount, 0);

    return (
        <AppShellMobile>
            <Stack gap="md" px="md" pt="md">
                {/* Header */}
                <Group justify="space-between" align="center">
                    <Box>
                        <Title order={3}>Finance Modules</Title>
                        <Text size="sm" c="dimmed">Distinct AR/AP modules with separate tabs, plus workflow operations for invoices, requisitions, and field execution</Text>
                    </Box>
                    <ActionIcon variant="subtle" color="gray" size="lg" onClick={fetchLinks} loading={loading}>
                        <IconRefresh size={18} />
                    </ActionIcon>
                </Group>

                {/* Stats row */}
                <Group grow>
                    <Paper p="xs" radius="md" withBorder>
                        <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Active</Text>
                        <Text fw={700} size="lg" c="green">{activeCount}</Text>
                    </Paper>
                    <Paper p="xs" radius="md" withBorder>
                        <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Paid</Text>
                        <Text fw={700} size="lg" c="blue">{paidCount}</Text>
                    </Paper>
                    <Paper p="xs" radius="md" withBorder>
                        <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Revenue</Text>
                        <Text fw={700} size="md" c="teal">{fmt(revenue)}</Text>
                    </Paper>
                </Group>

                <Tabs value={tab} onChange={setTab}>
                    <Tabs.List grow>
                        {(hasArCollections || hasPaymentCollection || links.length > 0) && (
                            <Tabs.Tab value="ar" leftSection={<IconReceipt size={14} />}>
                                AR Collections
                            </Tabs.Tab>
                        )}
                        {hasEducation && (
                            <Tabs.Tab value="invoices" leftSection={<IconSchool size={14} />}>Invoices</Tabs.Tab>
                        )}
                        {hasInternalRequisitions && (
                            <Tabs.Tab value="requisitions" leftSection={<IconUsers size={14} />}>Requisitions</Tabs.Tab>
                        )}
                        {hasFieldExecution && (
                            <Tabs.Tab value="field" leftSection={<IconReceipt size={14} />}>Field Ops</Tabs.Tab>
                        )}
                        {hasApPayables && (
                            <Tabs.Tab value="ap" leftSection={<IconCash size={14} />}>AP Payables</Tabs.Tab>
                        )}
                    </Tabs.List>

                    {/* ── AR Collections Tab ── */}
                    <Tabs.Panel value="ar" pt="md">
                        <Group justify="space-between" align="center" mb="md">
                            <Text size="sm" fw={600}>AR Collections Actions</Text>
                            <FinanceTabGuide
                                title="Accounts Receivable"
                                points={[
                                    'Manage one-time links, instalment plans, and recurring billing from this tab.',
                                    'Use New Link for instant payment requests and New Plan for scheduled collections.',
                                    'Track trust proof status on each collection card before settlement.',
                                ]}
                            />
                        </Group>

                        {/* ── AR Summary Strip ── */}
                        {hasArCollections && (
                            <Group grow mb="sm">
                                <Paper p="xs" radius="md" withBorder>
                                    <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Proof Pending</Text>
                                    <Text fw={700} size="lg" c={pendingProofCount > 0 ? 'orange' : 'dimmed'}>{pendingProofCount}</Text>
                                </Paper>
                                <Paper p="xs" radius="md" withBorder>
                                    <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Verified</Text>
                                    <Text fw={700} size="lg" c="teal">{verifiedCount}</Text>
                                </Paper>
                                <Paper p="xs" radius="md" withBorder>
                                    <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Inbound</Text>
                                    <Text fw={700} size="lg" c="grape">{inboundObligations.length}</Text>
                                </Paper>
                                {disputedCount > 0 && (
                                    <Paper p="xs" radius="md" withBorder>
                                        <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Disputed</Text>
                                        <Text fw={700} size="lg" c="red">{disputedCount}</Text>
                                    </Paper>
                                )}
                            </Group>
                        )}

                        {hasArCollections ? (
                            <Group grow mb="md">
                                <Button
                                    size="lg" radius="md"
                                    leftSection={<IconPlus size={18} />}
                                    onClick={() => setShowCreate(true)}
                                >
                                    New AR Collection
                                </Button>
                                <Button
                                    size="lg"
                                    radius="md"
                                    variant="light"
                                    color="indigo"
                                    leftSection={<IconWallet size={18} />}
                                    onClick={() => {
                                        const orgTenantId = getActiveOrgId();
                                        const query = orgTenantId ? `?orgTenantId=${encodeURIComponent(orgTenantId)}` : '';
                                        void router.push(`/finance/my-ar-obligations${query}`);
                                    }}
                                >
                                    What I Owe
                                </Button>
                            </Group>
                        ) : (
                            <Button
                                fullWidth size="lg" radius="md"
                                leftSection={<IconPlus size={18} />}
                                onClick={() => setShowCreate(true)}
                                mb="md"
                            >
                                New Payment Link
                            </Button>
                        )}

                        {error && (
                            <ErrorAlert message={error} mb="md" />
                        )}

                        <Paper p="sm" radius="md" withBorder mb="md">
                            <Group justify="space-between" mb="xs">
                                <Text size="xs" c="dimmed" fw={700}>RECEIVED FROM OTHERS</Text>
                                <Badge size="xs" color="grape" variant="light">{inboundObligations.length}</Badge>
                            </Group>
                            {arObligationsLoading ? (
                                <Group gap={6}>
                                    <Loader size="xs" />
                                    <Text size="xs" c="dimmed">Loading inbound obligations…</Text>
                                </Group>
                            ) : inboundObligations.length === 0 ? (
                                <Text size="xs" c="dimmed">
                                    No inbound AR obligations assigned to this organization.
                                </Text>
                            ) : (
                                <Stack gap={6}>
                                    {inboundObligations.slice(0, 3).map((item) => (
                                        <Paper key={item.id} p="xs" radius="sm" withBorder>
                                            <Group justify="space-between" align="flex-start" wrap="nowrap">
                                                <Box style={{ minWidth: 0 }}>
                                                    <Text size="sm" fw={600} truncate>{item.collector_org_name || 'Counterparty org'}</Text>
                                                    <Text size="xs" c="dimmed" truncate>{item.description || item.id}</Text>
                                                    <Group gap={4} mt={4}>
                                                        <Badge size="xs" color="blue" variant="dot">{String(item.status || 'active').toUpperCase()}</Badge>
                                                        <Badge size="xs" color={item.trust_status === 'settled' ? 'teal' : 'yellow'} variant="light">
                                                            {item.trust_status || 'pending'}
                                                        </Badge>
                                                        {item.required_proof_type && (
                                                            <Badge size="xs" color="orange" variant="light">
                                                                Proof: {item.required_proof_type}
                                                            </Badge>
                                                        )}
                                                    </Group>
                                                </Box>
                                                <Box ta="right" style={{ flexShrink: 0 }}>
                                                    <Text size="sm" fw={700}>{fmt(item.amount_due ?? item.total_amount ?? 0, item.currency || 'USD')}</Text>
                                                    {item.next_due_date && (
                                                        <Text size="xs" c="dimmed">Due {dayjs(item.next_due_date).format('D MMM')}</Text>
                                                    )}
                                                </Box>
                                            </Group>
                                        </Paper>
                                    ))}
                                </Stack>
                            )}
                        </Paper>

                        {loading ? (
                            <Center py="xl"><Loader /></Center>
                        ) : trackedPaymentLinks.length === 0 ? (
                            <Center py="xl">
                                <Stack align="center" gap="sm">
                                    <ThemeIcon size={56} radius="xl" variant="light" color="blue">
                                        <IconLink size={28} />
                                    </ThemeIcon>
                                    <Text fw={600} c="dimmed">No payment links yet</Text>
                                    <Text size="sm" c="dimmed" ta="center">Create a link or publish checkout flows to start tracking payments here</Text>
                                </Stack>
                            </Center>
                        ) : (
                            <Stack gap="sm">
                                {trackedPaymentLinks.map((link) => (
                                    (() => {
                                        const checkoutUrl = getLinkCheckoutUrl(link);
                                        const flow = getPaymentFlowKind(link);
                                        const flowBadge = getPaymentFlowBadge(flow);
                                        const isInstalment = flow === 'instalment';
                                        const isRecurring = flow === 'recurring';
                                        const linkAny = link as any;
                                        const metadata = (linkAny.metadata && typeof linkAny.metadata === 'object') ? linkAny.metadata : {};
                                        const debtorOrgName = String(
                                            linkAny.debtor_org_name
                                            || linkAny.debtorOrgName
                                            || metadata.debtorOrgName
                                            || ''
                                        ).trim();
                                        const debtorOrgId = String(
                                            linkAny.debtor_org_id
                                            || linkAny.debtorOrgId
                                            || metadata.debtorOrgId
                                            || ''
                                        ).trim();
                                        const debtorLabel = debtorOrgName || (debtorOrgId ? `${debtorOrgId.slice(0, 8)}...` : 'Counterparty');
                                        const handleLinkClick = () => {
                                            if (isInstalment && (link as any).plan_id) {
                                                void openPlanDetails((link as any).plan_id);
                                            } else {
                                                openPaymentLinkDetails(link);
                                            }
                                        };
                                        return (
                                            <Card key={link.id} radius="md" withBorder padding="sm"
                                                onClick={handleLinkClick}
                                                style={{ cursor: 'pointer' }}
                                            >
                                                <Group justify="space-between" wrap="nowrap">
                                                    <Box style={{ flex: 1, minWidth: 0 }}>
                                                        <Text fw={600} size="sm" truncate>{link.description}</Text>
                                                        <Group gap={6} mt={4}>
                                                            <Badge size="xs" color={flowBadge.color} variant="light">{flowBadge.label}</Badge>
                                                            <Badge size="sm" color={statusColor[link.status]} variant="light" leftSection={statusIcon[link.status]}>
                                                                {link.status}
                                                            </Badge>
                                                            <Text size="xs" c="dimmed">{dayjs(link.createdAt).format('D MMM YYYY')}</Text>
                                                        </Group>
                                                        {(isInstalment || isRecurring) && (
                                                            <Group gap={4} mt={4}>
                                                                {isInstalment && (
                                                                    <Badge size="xs" variant="dot" color="orange">
                                                                        Instalment {(link as any).installmentNumber || '—'} of {(link as any).installmentsTotal || '—'}
                                                                    </Badge>
                                                                )}
                                                                {isRecurring && (
                                                                    <Badge size="xs" variant="dot" color="pink">
                                                                        {(link as any).cadence || 'recurring'} billing
                                                                        {((link as any).installments_paid != null && (link as any).installments_total != null) &&
                                                                            ` · ${(link as any).installments_paid}/${(link as any).installments_total} cycles`}
                                                                    </Badge>
                                                                )}
                                                                {(link as any).dueDate && (
                                                                    <Badge size="xs" variant="light" color={dayjs((link as any).dueDate).isBefore(dayjs()) ? 'red' : 'gray'}>
                                                                        Due {dayjs((link as any).dueDate).format('D MMM')}
                                                                    </Badge>
                                                                )}
                                                            </Group>
                                                        )}
                                                        {link.invoiceRef && <Text size="xs" c="dimmed" mt={2}>INV: {link.invoiceRef}</Text>}
                                                        {/* ── Compact SSI Trust Strip ── */}
                                                        {(() => {
                                                            const ts = String(linkAny.trust_status || '').toLowerCase();
                                                            const proofStage = (() => {
                                                                if (link.status === 'paid' || linkAny.receipt_vc_id) return 'settled';
                                                                if (linkAny.proof_response_id || ts === 'proof_presented') return 'proof_presented';
                                                                if (linkAny.proof_request_id || ts === 'proof_requested') return 'proof_requested';
                                                                return 'pending';
                                                            })();
                                                            const apMirrored = Boolean(linkAny.ap_mirrored || linkAny.apMirrored);
                                                            const hasDebtorOrg = Boolean(debtorOrgName || debtorOrgId);
                                                            return (
                                                                <Group gap={4} mt={6}>
                                                                    {proofStage === 'settled' && (
                                                                        <Badge size="xs" color="teal" variant="light" leftSection={<IconShieldCheck size={10} />}>Receipt VC Issued</Badge>
                                                                    )}
                                                                    {proofStage === 'proof_presented' && (
                                                                        <Badge size="xs" color="indigo" variant="light" leftSection={<IconShieldCheck size={10} />}>Proof Presented</Badge>
                                                                    )}
                                                                    {proofStage === 'proof_requested' && (
                                                                        <Badge size="xs" color="orange" variant="light" leftSection={<IconClock size={10} />}>Proof Requested</Badge>
                                                                    )}
                                                                    {proofStage === 'pending' && link.status === 'active' && (
                                                                        <Badge size="xs" color="yellow" variant="light" leftSection={<IconClock size={10} />}>Awaiting Proof</Badge>
                                                                    )}
                                                                    {hasDebtorOrg ? (
                                                                        <Badge size="xs" color="indigo" variant="dot" leftSection={<IconUsers size={9} />}>{debtorLabel}</Badge>
                                                                    ) : link.payerPhone ? (
                                                                        <Badge size="xs" color="blue" variant="dot">{link.payerPhone.replace(/^\+?263/, '0').substring(0, 8)}···</Badge>
                                                                    ) : linkAny.payer_name ? (
                                                                        <Badge size="xs" color="gray" variant="dot">{String(linkAny.payer_name).substring(0, 12)}</Badge>
                                                                    ) : null}
                                                                    {hasDebtorOrg && (
                                                                        <Badge size="xs" color={apMirrored ? 'green' : 'gray'} variant="dot">
                                                                            AP {apMirrored ? 'Mirrored' : 'Pending'}
                                                                        </Badge>
                                                                    )}
                                                                </Group>
                                                            );
                                                        })()}
                                                    </Box>
                                                    <Box ta="right" style={{ flexShrink: 0 }}>
                                                        <Text fw={700} size="md" c="credentis">{fmt(link.amount, link.currency)}</Text>
                                                        {link.status === 'active' && (
                                                            <ActionIcon variant="subtle" color="red" size="sm" mt={4}
                                                                onClick={(e) => { e.stopPropagation(); handleCancel(link.id); }}
                                                            >
                                                                <IconTrash size={14} />
                                                            </ActionIcon>
                                                        )}
                                                    </Box>
                                                </Group>
                                            </Card>
                                        );
                                    })()
                                ))}
                            </Stack>
                        )}
                    </Tabs.Panel>

                    {/* ── Invoices Tab ── */}
                    {hasEducation && (
                        <Tabs.Panel value="invoices" pt="md">
                            <Group justify="space-between" align="center" mb="md">
                                <Text size="sm" fw={600}>Education Invoice Actions</Text>
                                <FinanceTabGuide
                                    title="Education Fees"
                                    points={[
                                        'This tab is only shown when an education workflow template is enabled.',
                                        'Create school-fee invoices and monitor invoice-backed payment links.',
                                        'Keep this flow separate from AR generic links and AP supplier remittance.',
                                    ]}
                                />
                            </Group>

                            <Button
                                fullWidth size="lg" radius="md"
                                leftSection={<IconPlus size={18} />}
                                onClick={() => setShowInvoice(true)}
                                mb="md"
                                color="teal"
                            >
                                New School Fee Invoice
                            </Button>

                            {loading ? (
                                <Center py="xl"><Loader /></Center>
                            ) : invoiceBackedLinks.length === 0 ? (
                                <Text size="sm" c="dimmed" ta="center">
                                    No school invoices yet. Create one to generate an invoice-linked payment URL.
                                </Text>
                            ) : (
                                <Stack gap="sm">
                                    {invoiceBackedLinks.map((link) => (
                                        (() => {
                                            const checkoutUrl = getLinkCheckoutUrl(link);
                                            return (
                                                <Card key={link.id} radius="md" withBorder padding="sm"
                                                    onClick={() => openPaymentLinkDetails(link)}
                                                    style={{ cursor: 'pointer' }}
                                                >
                                                    <Group justify="space-between" wrap="nowrap">
                                                        <Box style={{ flex: 1, minWidth: 0 }}>
                                                            <Text fw={600} size="sm" truncate>{link.description}</Text>
                                                            <Group gap={6} mt={4}>
                                                                <Badge size="xs" color="indigo" variant="light">INVOICE FLOW</Badge>
                                                                <Badge size="sm" color={statusColor[link.status]} variant="light" leftSection={statusIcon[link.status]}>
                                                                    {link.status}
                                                                </Badge>
                                                                <Text size="xs" c="dimmed">{dayjs(link.createdAt).format('D MMM YYYY')}</Text>
                                                            </Group>
                                                            {link.invoiceRef && <Text size="xs" c="dimmed" mt={2}>INV: {link.invoiceRef}</Text>}
                                                        </Box>
                                                        <Box ta="right" style={{ flexShrink: 0 }}>
                                                            <Text fw={700} size="md" c="teal">{fmt(link.amount, link.currency)}</Text>
                                                        </Box>
                                                    </Group>
                                                </Card>
                                            );
                                        })()
                                    ))}
                                </Stack>
                            )}
                        </Tabs.Panel>
                    )}

                    {hasInternalRequisitions && (
                        <Tabs.Panel value="requisitions" pt="md">
                            <Group justify="space-between" align="center" mb="md">
                                <Text size="sm" fw={600}>Requisition Actions</Text>
                                <FinanceTabGuide
                                    title="Internal Requisitions"
                                    points={[
                                        'This workflow is independent from payment links and invoice collection.',
                                        'Use requisitions for request, approval stages, and release tracking.',
                                        'Audit and proof evidence are recorded per requisition lifecycle event.',
                                    ]}
                                />
                            </Group>

                            {hasInternalRequisitions && (
                                <Button
                                    fullWidth
                                    size="lg"
                                    radius="md"
                                    leftSection={<IconPlus size={18} />}
                                    onClick={() => setShowRequisition(true)}
                                    mb="sm"
                                    color="indigo"
                                >
                                    New Requisition Request
                                </Button>
                            )}

                            {requisitionsLoading ? (
                                <Center py="xl"><Loader /></Center>
                            ) : requisitionRows.length === 0 ? (
                                <Center py="xl">
                                    <Stack align="center" gap="sm">
                                        <ThemeIcon size={56} radius="xl" variant="light" color="indigo">
                                            <IconUsers size={28} />
                                        </ThemeIcon>
                                        <Text fw={600} c="dimmed">No requisitions yet</Text>
                                        <Text size="sm" c="dimmed" ta="center">
                                            Create a requisition request to start the internal approval workflow.
                                        </Text>
                                    </Stack>
                                </Center>
                            ) : (
                                <Stack gap="sm">
                                    {requisitionRows.map((req) => {
                                        const status = String(req.status || '').toUpperCase();
                                        const statusColorMap: Record<string, string> = {
                                            REQUISITION_CREATED: 'blue',
                                            AGENT_ASSIGNED: 'indigo',
                                            JOB_STARTED: 'orange',
                                            WORK_EVIDENCE_BEFORE: 'violet',
                                            WORK_EVIDENCE_AFTER: 'grape',
                                            MANAGER_APPROVED: 'indigo',
                                            APPROVED: 'green',
                                            RELEASED: 'yellow',
                                            ACKNOWLEDGED: 'teal',
                                            EXECUTION_ACKNOWLEDGED: 'teal',
                                            RECONCILED: 'cyan',
                                            JOB_CLOSED: 'dark',
                                        };
                                        return (
                                            <Card
                                                key={req.id}
                                                radius="md"
                                                withBorder
                                                padding="sm"
                                                onClick={() => void openRequisitionDetails(req.id)}
                                                style={{ cursor: 'pointer' }}
                                            >
                                                <Group justify="space-between" wrap="nowrap">
                                                    <Box style={{ flex: 1, minWidth: 0 }}>
                                                        <Text fw={600} size="sm" truncate>
                                                            {req.metadata?.department ? `Requisition · ${req.metadata.department}` : `Requisition · ${req.id}`}
                                                        </Text>
                                                        <Group gap={6} mt={4}>
                                                            <Badge size="xs" color="indigo" variant="light">REQUISITION FLOW</Badge>
                                                            <Badge size="sm" color={statusColorMap[status] || 'gray'} variant="light">
                                                                {status}
                                                            </Badge>
                                                            <Text size="xs" c="dimmed">{dayjs(req.updatedAt).format('D MMM YYYY')}</Text>
                                                        </Group>
                                                        {req.metadata?.notes && (
                                                            <Text size="xs" c="dimmed" mt={2} lineClamp={2}>{req.metadata.notes}</Text>
                                                        )}
                                                    </Box>
                                                    <Box ta="right" style={{ flexShrink: 0 }}>
                                                        <Text fw={700} size="md" c="indigo">
                                                            {fmt(req.metadata?.amount || 0, req.metadata?.currency || 'USD')}
                                                        </Text>
                                                        <IconChevronRight size={14} color="#64748b" />
                                                    </Box>
                                                </Group>
                                            </Card>
                                        );
                                    })}
                                </Stack>
                            )}
                        </Tabs.Panel>
                    )}

                    {hasFieldExecution && (
                        <Tabs.Panel value="field" pt="md">
                            <Group justify="space-between" align="center" mb="md">
                                <Text size="sm" fw={600}>Field Ops Actions</Text>
                                <FinanceTabGuide
                                    title="Field Execution (FEPT)"
                                    points={[
                                        'Field ops are isolated from AR/AP and requisition modules.',
                                        'Runs move through assignment, evidence capture, acknowledgement, and reconciliation.',
                                        'Only enabled FEPT templates can start new field execution runs.',
                                    ]}
                                />
                            </Group>

                            <Button
                                fullWidth
                                size="lg"
                                radius="md"
                                leftSection={<IconPlus size={18} />}
                                onClick={() => setShowFieldRun(true)}
                                mb="md"
                                color="teal"
                            >
                                New Field Execution Run
                            </Button>

                            {fieldRunsLoading ? (
                                <Center py="xl"><Loader /></Center>
                            ) : fieldRuns.length === 0 ? (
                                <Center py="xl">
                                    <Stack align="center" gap="sm">
                                        <ThemeIcon size={56} radius="xl" variant="light" color="teal">
                                            <IconReceipt size={28} />
                                        </ThemeIcon>
                                        <Text fw={600} c="dimmed">No field runs yet</Text>
                                        <Text size="sm" c="dimmed" ta="center">
                                            Start a field run to track FEPT stages: assignment, evidence capture, acknowledgement, and reconciliation.
                                        </Text>
                                    </Stack>
                                </Center>
                            ) : (
                                <Stack gap="sm">
                                    {fieldRuns.map((run: any) => {
                                        const stage = String(run.output?.workflowStage || run.output?.stage || run.status || '').toUpperCase();
                                        const FEPT_STAGE_COLOR: Record<string, string> = {
                                            REQUEST_CREATED: 'blue',
                                            ASSIGNED: 'indigo',
                                            IN_PROGRESS: 'orange',
                                            EVIDENCE_CAPTURED: 'violet',
                                            ACKNOWLEDGED: 'teal',
                                            PAYMENT_TRIGGERED: 'yellow',
                                            RECEIPT_ISSUED: 'green',
                                            RECONCILED: 'cyan',
                                            COMPLETED: 'dark',
                                            DISPUTED: 'red',
                                            CANCELLED: 'gray',
                                        };
                                        const FEPT_STAGE_LABEL: Record<string, string> = {
                                            REQUEST_CREATED: 'Request created',
                                            ASSIGNED: 'Assigned',
                                            IN_PROGRESS: 'In progress',
                                            EVIDENCE_CAPTURED: 'Evidence captured',
                                            ACKNOWLEDGED: 'Acknowledged',
                                            PAYMENT_TRIGGERED: 'Payment triggered',
                                            RECEIPT_ISSUED: 'Receipt issued',
                                            RECONCILED: 'Reconciled',
                                            COMPLETED: 'Completed',
                                            DISPUTED: 'Disputed',
                                            CANCELLED: 'Cancelled',
                                        };
                                        const input = run.output?.workflowInput || run.input || {};
                                        const runRef = input.poNumber || input.reference || run.id;
                                        return (
                                            <Card
                                                key={run.id}
                                                radius="md"
                                                withBorder
                                                padding="sm"
                                                onClick={() => {
                                                    // Close the current run first so the transition is visible,
                                                    // then open the new selection after the drawer animates out.
                                                    if (selectedFieldRun && selectedFieldRun.id !== run.id) {
                                                        setSelectedFieldRun(null);
                                                        setTimeout(() => setSelectedFieldRun(run), 180);
                                                    } else {
                                                        setSelectedFieldRun(run);
                                                    }
                                                }}
                                                style={{ cursor: 'pointer' }}
                                            >
                                                <Group justify="space-between" wrap="nowrap">
                                                    <Box style={{ flex: 1, minWidth: 0 }}>
                                                        <Text fw={600} size="sm" truncate>
                                                            {`Field Run · ${runRef}`}
                                                        </Text>
                                                        <Group gap={6} mt={4}>
                                                            <Badge size="xs" color="teal" variant="light">FEPT</Badge>
                                                            <Badge size="sm" color={FEPT_STAGE_COLOR[stage] || 'gray'} variant="light">
                                                                {FEPT_STAGE_LABEL[stage] || stage || run.status}
                                                            </Badge>
                                                            <Text size="xs" c="dimmed">{dayjs(run.createdAt || run.created_at).format('D MMM YYYY')}</Text>
                                                        </Group>
                                                        {input.location && (
                                                            <Text size="xs" c="dimmed" mt={2}>📍 {input.location}</Text>
                                                        )}
                                                    </Box>
                                                    <Box ta="right" style={{ flexShrink: 0 }}>
                                                        <Badge size="xs" color={['completed', 'reconciled', 'cancelled'].includes(String(run.status || '').toLowerCase()) ? 'gray' : 'teal'} variant="dot">
                                                            {run.status || 'running'}
                                                        </Badge>
                                                        <Box mt={4}><IconChevronRight size={14} color="#64748b" /></Box>
                                                    </Box>
                                                </Group>
                                            </Card>
                                        );
                                    })}
                                </Stack>
                            )}
                        </Tabs.Panel>
                    )}

                    {hasApPayables && (
                        <Tabs.Panel value="ap" pt="md">
                            <Group justify="space-between" align="center" mb="md">
                                <Text size="sm" fw={600}>AP Payables Actions</Text>
                                <FinanceTabGuide
                                    title="Accounts Payable"
                                    points={[
                                        'Use AP to record supplier invoices, post payments, and issue remittance proofs.',
                                        'AP actions are separate from AR collection and school-fee invoicing flows.',
                                        'Cross-org queue shows pending trust workflow transitions with proof requirements.',
                                    ]}
                                />
                            </Group>

                            <Box mb="md">
                                <Button
                                    fullWidth
                                    size="lg"
                                    radius="md"
                                    leftSection={<IconPlus size={18} />}
                                    onClick={() => {
                                        setApInvoiceForm({
                                            invoiceRef: '',
                                            description: '',
                                            amount: '',
                                            currency: 'USD',
                                            dueDate: dayjs().add(30, 'day').format('YYYY-MM-DD'),
                                        });
                                        setShowRecordApInvoice(true);
                                    }}
                                    color="indigo"
                                >
                                    Record Supplier Invoice
                                </Button>
                            </Box>

                            {pendingApProofActions.length > 0 && (
                                <Alert
                                    color="orange"
                                    variant="light"
                                    title="Proof Consent Required"
                                    mb="md"
                                    icon={<IconAlertCircle size={16} />}
                                >
                                    <Stack gap={6}>
                                        {pendingApProofActions.slice(0, 2).map((item) => (
                                            <Group key={`proof-${item.id}`} justify="space-between" wrap="nowrap">
                                                <Text size="xs" style={{ minWidth: 0 }} truncate>
                                                    {item.invoice_ref || item.invoice_description || item.id} · {item.required_proof_type}
                                                </Text>
                                                {item.myActionRequired && (
                                                    <Button
                                                        size="xs"
                                                        variant="light"
                                                        color="orange"
                                                        onClick={() => runApWorkflowTransition(item)}
                                                    >
                                                        Present Proof
                                                    </Button>
                                                )}
                                            </Group>
                                        ))}
                                    </Stack>
                                </Alert>
                            )}

                            {apWorkflowActions.length > 0 && (
                                <Paper p="sm" radius="md" withBorder mb="md">
                                    <Group justify="space-between" mb="xs">
                                        <Text size="xs" c="dimmed" fw={700}>CROSS-ORG ACTION QUEUE</Text>
                                        <Badge size="xs" color="indigo" variant="light">{apWorkflowActions.length}</Badge>
                                    </Group>
                                    <DetailTimelineList
                                        items={apWorkflowActions.slice(0, 4).map((item) => ({
                                            id: item.id,
                                            title: `${item.invoice_ref || 'AR mirror'} · ${item.supplier_name || 'Counterparty'}`,
                                            source: 'trust workflow',
                                            description: `${item.workflow_stage || 'issued'} → ${item.required_action || 'awaiting update'}`,
                                            note: [
                                                item.required_proof_type ? `Proof required: ${item.required_proof_type}` : null,
                                                item.proof_response_id ? `Proof ref: ${item.proof_response_id}` : null,
                                                item.consent_timestamp ? `Consent: ${dayjs(item.consent_timestamp).format('D MMM YYYY HH:mm')}` : null,
                                            ].filter(Boolean).join(' · ') || undefined,
                                            timestamp: item.updated_at ? dayjs(item.updated_at).format('D MMM YYYY HH:mm') : '—',
                                            badge: {
                                                label: item.myActionRequired ? 'MY ACTION' : (item.status || 'WATCH').toUpperCase(),
                                                color: item.myActionRequired ? 'orange' : 'blue',
                                            },
                                        }))}
                                        emptyText="No pending workflow actions"
                                    />
                                    {apWorkflowActions.some((item) => item.myActionRequired && item.required_action) && (
                                        <Stack gap="xs" mt="sm">
                                            {apWorkflowActions
                                                .filter((item) => item.myActionRequired && item.required_action)
                                                .slice(0, 2)
                                                .map((item) => (
                                                    <Button
                                                        key={`cta-${item.id}`}
                                                        size="xs"
                                                        variant="light"
                                                        color="indigo"
                                                        onClick={() => runApWorkflowTransition(item)}
                                                    >
                                                        {`Action: ${item.required_action}`}
                                                    </Button>
                                                ))}
                                        </Stack>
                                    )}
                                </Paper>
                            )}

                            {apLoading ? (
                                <Center py="xl"><Loader /></Center>
                            ) : apErr ? (
                                <Alert color="red" variant="light" title="Error Loading Payables">
                                    {apErr}
                                </Alert>
                            ) : apSuppliers.length === 0 ? (
                                <Center py="xl">
                                    <Stack align="center" gap="sm">
                                        <ThemeIcon size={56} radius="xl" variant="light" color="indigo">
                                            <IconCash size={28} />
                                        </ThemeIcon>
                                        <Text fw={600} c="dimmed">No suppliers onboarded</Text>
                                        <Text size="sm" c="dimmed" ta="center">
                                            Onboard suppliers and record invoices from the buyer portal
                                        </Text>
                                    </Stack>
                                </Center>
                            ) : (
                                <Stack gap="sm">
                                    {apSuppliers.map((sup) => (
                                        <Card
                                            key={sup.id}
                                            radius="md"
                                            withBorder
                                            padding="sm"
                                            onClick={() => {
                                                setSelectedApSupplier(sup);
                                                fetchSupplierStatement(sup.id);
                                                fetchSupplierWorkflowActions(sup.id);
                                            }}
                                            style={{ cursor: 'pointer' }}
                                        >
                                            <Group justify="space-between" wrap="nowrap">
                                                <Box style={{ flex: 1, minWidth: 0 }}>
                                                    <Text fw={600} size="sm" truncate>{sup.supplier_name}</Text>
                                                    <Group gap={6} mt={4}>
                                                        <Badge size="xs" color="indigo" variant="light">SUPPLIER</Badge>
                                                        {(sup as any).supplier_wallet_tenant_id ? (
                                                            <Badge size="xs" color="green" variant="dot" leftSection={<IconWallet size={9} />}>
                                                                Wallet Linked
                                                            </Badge>
                                                        ) : (
                                                            <Badge size="xs" color="gray" variant="dot">
                                                                No Wallet
                                                            </Badge>
                                                        )}
                                                        {sup.supplier_email && (
                                                            <Text size="xs" c="dimmed" truncate>{sup.supplier_email}</Text>
                                                        )}
                                                    </Group>
                                                    {/* ── Compact AP SSI Trust Strip ── */}
                                                    <Group gap={4} mt={6}>
                                                        {sup.total_outstanding > 0 ? (
                                                            <Badge
                                                                size="xs"
                                                                color="orange"
                                                                variant="light"
                                                                leftSection={<IconReceipt size={10} />}
                                                            >
                                                                Remittance Pending
                                                            </Badge>
                                                        ) : (
                                                            <Badge
                                                                size="xs"
                                                                color="teal"
                                                                variant="light"
                                                                leftSection={<IconShieldCheck size={10} />}
                                                            >
                                                                Settled · VC Issued
                                                            </Badge>
                                                        )}
                                                    </Group>
                                                </Box>
                                                <Box ta="right" style={{ flexShrink: 0 }}>
                                                    <Text fw={700} size="md" c={sup.total_outstanding > 0 ? 'orange' : 'green'}>
                                                        {fmt(sup.total_outstanding ?? 0)}
                                                    </Text>
                                                    <Box mt={4}><IconChevronRight size={14} color="#64748b" /></Box>
                                                </Box>
                                            </Group>
                                        </Card>
                                    ))}
                                </Stack>
                            )}
                        </Tabs.Panel>
                    )}
                </Tabs>
            </Stack>

            {/* ── Created Link Result Drawer ── */}
            <Drawer
                opened={!!createdLink}
                onClose={() => setCreatedLink(null)}
                position="bottom"
                size="auto"
                title={createdLink ? `Payment Flow · ${createdLink.id}` : 'Payment Flow Details'}
                radius="lg"
                styles={{ content: { borderRadius: '16px 16px 0 0' } }}
            >
                {createdLink && (
                    (() => {
                        const flowSteps = buildPaymentFlowSteps(createdLink, linkAuditItems);
                        const stepStatusColor: Record<PaymentFlowStepState['status'], string> = { done: 'green', active: 'blue', pending: 'gray' };
                        const stepStatusLabel: Record<PaymentFlowStepState['status'], string> = { done: 'Done', active: 'In Progress', pending: 'Pending' };
                        const paymentAuditItems: DetailTimelineItem[] = linkAuditItems.map((entry) => {
                            const narrative = describePaymentAuditEvent(entry);
                            return {
                                id: entry.id,
                                title: narrative.title,
                                source: String(entry.details?.source || entry.details?.path || 'payment workflow'),
                                description: narrative.subtitle,
                                note: narrative.note,
                                timestamp: dayjs(entry.createdAt).format('D MMM YYYY HH:mm'),
                            };
                        });
                        const paymentFlowItems: DetailTimelineItem[] = flowSteps.map((step) => ({
                            id: step.key,
                            title: step.label,
                            source: 'payment workflow',
                            description: step.description,
                            timestamp: step.occurredAt ? dayjs(step.occurredAt).format('D MMM YYYY HH:mm') : step.status === 'active' ? 'In progress' : '—',
                            badge: {
                                label: stepStatusLabel[step.status],
                                color: stepStatusColor[step.status],
                            },
                        }));

                        return (
                            <WorkflowDetailBody
                                statusCard={(
                                    <DetailStatusCard
                                        status={String(createdLink.status || 'unknown').toUpperCase()}
                                        amount={createdLink.amount}
                                        currency={createdLink.currency}
                                        lines={[
                                            { text: `Flow: ${getPaymentFlowBadge(getPaymentFlowKind(createdLink)).label}` },
                                            { text: `Link state: ${createdLink.status}` },
                                            ...(createdLink.payer_name ? [{ text: `Customer: ${createdLink.payer_name}` }] : []),
                                            ...(createdLink.plan_id ? [
                                                { text: `Plan: ${createdLink.plan_id}` },
                                                { text: `Instalment: ${createdLink.installment_number} of ${createdLink.installments_total || 'N'}` }
                                            ] : []),
                                            ...(createdLink.invoiceRef ? [{ text: `Invoice reference: ${createdLink.invoiceRef}` }] : []),
                                        ]}
                                    />
                                )}
                                sections={[
                                    {
                                        title: 'PAYMENT ACTIONS',
                                        content: createdLink.shortlinkUrl ? (
                                            <>
                                                {createdLink.status === 'active' ? (
                                                    <Button
                                                        size="md"
                                                        color="teal"
                                                        leftSection={<IconWallet size={16} />}
                                                        onClick={() => openPaymentLinkInApp(createdLink)}
                                                    >
                                                        Open In-App Checkout
                                                    </Button>
                                                ) : (
                                                    <Alert color="gray" variant="light" icon={<IconAlertCircle size={16} />}>
                                                        This link is {createdLink.status}. Checkout action may be restricted, but sharing and audit visibility remain available.
                                                    </Alert>
                                                )}

                                                <Paper p="sm" radius="md" withBorder>
                                                    <Text size="xs" c="dimmed" fw={600} mb={4}>PAYMENT URL</Text>
                                                    <Text size="sm" ff="monospace" style={{ wordBreak: 'break-all' }}>{createdLink.shortlinkUrl}</Text>
                                                </Paper>

                                                <Group grow>
                                                    <CopyButton value={createdLink.shortlinkUrl}>
                                                        {({ copied, copy }) => (
                                                            <Button
                                                                variant={copied ? 'filled' : 'light'}
                                                                color={copied ? 'green' : 'blue'}
                                                                leftSection={copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                                                                onClick={copy}
                                                                size="md"
                                                            >
                                                                {copied ? 'Copied!' : 'Copy Link'}
                                                            </Button>
                                                        )}
                                                    </CopyButton>
                                                    <Button
                                                        variant="light"
                                                        color="green"
                                                        size="md"
                                                        leftSection={<IconBrandWhatsapp size={16} />}
                                                        onClick={() => shareWhatsApp(createdLink)}
                                                    >
                                                        WhatsApp
                                                    </Button>
                                                </Group>

                                                <Text size="xs" c="dimmed">Secured by Credentis Trust Layer · Instant receipt</Text>
                                            </>
                                        ) : (
                                            <Text size="xs" c="dimmed">No checkout URL available for this payment link.</Text>
                                        ),
                                    },
                                    {
                                        title: 'LIFECYCLE ACTIONS',
                                        content: (
                                            <>
                                                <DetailTimelineList items={paymentFlowItems} emptyText="No timeline events available yet." />
                                                {createdLink.status === 'paid' && (
                                                    <Paper p="sm" radius="md" withBorder>
                                                        <Stack gap={6}>
                                                            <Group justify="space-between" gap="xs">
                                                                <Text size="xs" c="dimmed">Paid at</Text>
                                                                <Text size="xs">{createdLink.paidAt ? dayjs(createdLink.paidAt).format('D MMM YYYY HH:mm') : 'Not available'}</Text>
                                                            </Group>
                                                            <Group justify="space-between" gap="xs">
                                                                <Text size="xs" c="dimmed">Provider reference</Text>
                                                                <Text size="xs">{createdLink.providerRef || 'Not available'}</Text>
                                                            </Group>
                                                            <Group justify="space-between" gap="xs">
                                                                <Text size="xs" c="dimmed">Payer phone</Text>
                                                                <Text size="xs">{createdLink.payerPhone || 'Not available'}</Text>
                                                            </Group>
                                                        </Stack>
                                                    </Paper>
                                                )}
                                            </>
                                        ),
                                    },
                                ]}
                                auditItems={paymentAuditItems}
                                auditEmptyText="No timeline events available yet."
                                auditLoading={linkAuditLoading}
                            />
                        );
                    })()
                )}
            </Drawer>

            {/* ── Supplier Detail Drawer / Mutual Ledger ── */}
            <Drawer
                opened={!!selectedApSupplier}
                onClose={() => {
                    setSelectedApSupplier(null);
                    setSupplierStatement(null);
                    setSelectedSupplierActions([]);
                }}
                position="bottom"
                size="90%"
                title={selectedApSupplier ? `Supplier Statement · ${selectedApSupplier.supplier_name}` : 'Supplier'}
                radius="lg"
                styles={{ content: { borderRadius: '16px 16px 0 0', overflowY: 'auto' } }}
            >
                {selectedApSupplier && (
                    <Stack gap="md" p="md">
                        <Paper p="sm" radius="md" withBorder>
                            <Grid>
                                <Grid.Col span={6}>
                                    <Text size="xs" c="dimmed" fw={600}>Supplier ID</Text>
                                    <Text size="sm">{selectedApSupplier.id}</Text>
                                </Grid.Col>
                                <Grid.Col span={6}>
                                    <Text size="xs" c="dimmed" fw={600}>Tax Number</Text>
                                    <Text size="sm">{selectedApSupplier.tax_number || '—'}</Text>
                                </Grid.Col>
                                <Grid.Col span={6}>
                                    <Text size="xs" c="dimmed" fw={600}>Phone</Text>
                                    <Text size="sm">{selectedApSupplier.supplier_phone || '—'}</Text>
                                </Grid.Col>
                                <Grid.Col span={6}>
                                    <Text size="xs" c="dimmed" fw={600}>Email</Text>
                                    <Text size="sm">{selectedApSupplier.supplier_email || '—'}</Text>
                                </Grid.Col>
                            </Grid>
                        </Paper>

                        {statementLoading ? (
                            <Center py="xl"><Loader /></Center>
                        ) : supplierStatement ? (() => {
                            const summary = supplierStatement.summary ?? {};
                            const invoices: any[] = supplierStatement.invoices ?? [];
                            const payments: any[] = supplierStatement.payments ?? [];
                            const hasWallet = !!(selectedApSupplier as any).supplier_wallet_tenant_id;
                            const lastPayment = payments[payments.length - 1];
                            const allAcknowledged = payments.length > 0 && payments.every((p: any) => !!p.supplier_acknowledged_at);
                            const anyVc = payments.some((p: any) => !!p.remittance_vc_id);
                            const paymentVcArtifacts = payments
                                .filter((p: any) => !!p.remittance_vc_id)
                                .map((p: any) => ({
                                    paymentId: String(p.id),
                                    credentialId: String(p.remittance_vc_id),
                                    amount: Number(p.amount_paid || 0),
                                    currency: String(p.currency || 'USD'),
                                    issuedAt: p.paid_at || null,
                                    sourceRef: p.reference || p.id,
                                    acknowledged: Boolean(p.supplier_acknowledged_at),
                                }));

                            const ssLifecycleItems: DetailTimelineItem[] = [
                                ...invoices.map((inv: any) => ({
                                    id: `inv-${inv.id}`,
                                    title: `Invoice · ${inv.invoice_ref}`,
                                    source: 'accounts payable',
                                    description: inv.description || `${fmt(inv.amount, inv.currency)}`,
                                    note: inv.due_date ? `Due: ${dayjs(inv.due_date).format('D MMM YYYY')}` : undefined,
                                    timestamp: dayjs(inv.created_at || inv.createdAt).format('D MMM YYYY HH:mm'),
                                    badge: { label: (inv.status || 'outstanding').toUpperCase(), color: inv.status === 'paid' ? 'green' : inv.status === 'partial' ? 'yellow' : 'orange' },
                                })),
                                ...payments.map((pay: any) => ({
                                    id: `pay-${pay.id}`,
                                    title: `Payment · ${pay.payment_method || 'transfer'}`,
                                    source: 'accounts payable',
                                    description: `Paid ${fmt(pay.amount_paid, pay.currency)}${pay.reference ? ` · Ref: ${pay.reference}` : ''}`,
                                    note: pay.remittance_vc_id ? `RemittanceAdviceVC: ${String(pay.remittance_vc_id).substring(0, 12)}…` : 'VC not yet issued',
                                    timestamp: dayjs(pay.paid_at).format('D MMM YYYY HH:mm'),
                                    badge: pay.supplier_acknowledged_at
                                        ? { label: '✓ ACKNOWLEDGED', color: 'teal' }
                                        : { label: 'PENDING ACK', color: 'gray' },
                                })),
                            ].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

                            return (
                                <WorkflowDetailBody
                                    statusCard={(
                                        <DetailStatusCard
                                            status={(summary as any).totalOutstanding > 0 ? 'OUTSTANDING BALANCE' : 'FULLY SETTLED'}
                                            amount={(summary as any).totalOutstanding ?? 0}
                                            currency="USD"
                                            amountColor={(summary as any).totalOutstanding > 0 ? 'orange' : 'teal'}
                                            lines={[
                                                { text: `Total invoiced: ${fmt((summary as any).totalInvoiced ?? 0)}` },
                                                { text: `Total paid: ${fmt((summary as any).totalPaid ?? 0)}` },
                                                { text: `${invoices.length} invoice(s) · ${payments.length} payment(s)` },
                                            ]}
                                        />
                                    )}
                                    sections={[
                                        {
                                            title: 'CROSS-ORG WORKFLOW ACTIONS',
                                            content: selectedSupplierActions.length === 0 ? (
                                                <Text size="xs" c="dimmed">No staged actions recorded yet for this relationship.</Text>
                                            ) : (
                                                <Stack gap="xs">
                                                    <DetailTimelineList
                                                        items={selectedSupplierActions.slice(0, 8).map((item) => ({
                                                            id: item.id,
                                                            title: `${item.invoice_ref || 'AR mirror'} · ${item.workflow_stage || 'issued'}`,
                                                            source: 'trust workflow',
                                                            description: item.required_action
                                                                ? `Next: ${item.required_action}`
                                                                : `State: ${item.status || 'pending'}`,
                                                            note: [
                                                                item.required_proof_type ? `Proof required: ${item.required_proof_type}` : null,
                                                                item.proof_response_id ? `Proof ref: ${item.proof_response_id}` : null,
                                                                item.consent_timestamp ? `Consent: ${dayjs(item.consent_timestamp).format('D MMM YYYY HH:mm')}` : null,
                                                            ].filter(Boolean).join(' · ') || undefined,
                                                            timestamp: item.updated_at
                                                                ? dayjs(item.updated_at).format('D MMM YYYY HH:mm')
                                                                : '—',
                                                            badge: {
                                                                label: item.myActionRequired
                                                                    ? 'MY ACTION'
                                                                    : (item.status || 'TRACKING').toUpperCase(),
                                                                color: item.myActionRequired ? 'orange' : 'indigo',
                                                            },
                                                        }))}
                                                        emptyText="No workflow actions"
                                                    />
                                                    {selectedSupplierActions
                                                        .filter((item) => item.myActionRequired && item.required_action)
                                                        .slice(0, 1)
                                                        .map((item) => (
                                                            <Button
                                                                key={`supplier-action-${item.id}`}
                                                                size="xs"
                                                                variant="light"
                                                                color="indigo"
                                                                onClick={() => runApWorkflowTransition(item)}
                                                            >
                                                                {`Run: ${item.required_action}`}
                                                            </Button>
                                                        ))}
                                                </Stack>
                                            ),
                                        },
                                        {
                                            title: 'SSI TRUST & CREDENTIAL STATE',
                                            content: (
                                                <Stack gap="xs">
                                                    <Group gap="xs" wrap="wrap">
                                                        <Badge size="sm" color={hasWallet ? 'green' : 'gray'} variant={hasWallet ? 'light' : 'outline'} leftSection={<IconWallet size={11} />}>
                                                            {hasWallet ? 'Wallet Linked' : 'No Wallet – Notify via WhatsApp'}
                                                        </Badge>
                                                        <Badge size="sm" color={anyVc ? 'teal' : 'yellow'} variant="light" leftSection={<IconShieldCheck size={11} />}>
                                                            {anyVc ? 'RemittanceAdviceVC Issued' : 'No VC Yet'}
                                                        </Badge>
                                                        <Badge size="sm" color={allAcknowledged ? 'teal' : 'gray'} variant="light">
                                                            {allAcknowledged ? '✓ All Acknowledged' : 'Pending Supplier Ack'}
                                                        </Badge>
                                                    </Group>
                                                    {lastPayment?.remittance_vc_id && (
                                                        <Group justify="space-between" align="center" wrap="nowrap">
                                                            <Text size="xs" c="dimmed" ff="monospace" style={{ minWidth: 0 }} truncate>
                                                                Latest VC: {lastPayment.remittance_vc_id}
                                                            </Text>
                                                            <Button
                                                                size="xs"
                                                                variant="subtle"
                                                                color="teal"
                                                                onClick={() => openCredentialArtifact({
                                                                    title: 'Latest Remittance Credential',
                                                                    credentialId: String(lastPayment.remittance_vc_id),
                                                                    credentialType: 'RemittanceAdviceVC',
                                                                    status: lastPayment.supplier_acknowledged_at ? 'acknowledged' : 'issued',
                                                                    issuedAt: lastPayment.paid_at || null,
                                                                    sourceRef: lastPayment.reference || lastPayment.id,
                                                                    counterpart: selectedApSupplier?.supplier_name || null,
                                                                    amount: Number(lastPayment.amount_paid || 0),
                                                                    currency: lastPayment.currency || 'USD',
                                                                    note: lastPayment.supplier_acknowledged_at ? 'Supplier acknowledgment recorded.' : 'Waiting for supplier acknowledgment.',
                                                                })}
                                                            >
                                                                View VC
                                                            </Button>
                                                        </Group>
                                                    )}
                                                </Stack>
                                            ),
                                        },
                                        {
                                            title: 'VC ARTIFACT DRILLDOWN',
                                            content: paymentVcArtifacts.length === 0 ? (
                                                <Text size="xs" c="dimmed">No RemittanceAdviceVC artifacts are available yet for this supplier.</Text>
                                            ) : (
                                                <Stack gap="xs">
                                                    {paymentVcArtifacts.map((artifact) => (
                                                        <Paper key={`${artifact.paymentId}-${artifact.credentialId}`} withBorder radius="md" p="xs">
                                                            <Group justify="space-between" align="flex-start" wrap="nowrap">
                                                                <Box style={{ minWidth: 0 }}>
                                                                    <Text size="xs" fw={700}>RemittanceAdviceVC · {artifact.paymentId}</Text>
                                                                    <Text size="10px" c="dimmed" ff="monospace" truncate>{artifact.credentialId}</Text>
                                                                    <Text size="10px" c="dimmed">Amount: {fmt(artifact.amount, artifact.currency)}</Text>
                                                                    <Text size="10px" c="dimmed">Issued: {artifact.issuedAt ? dayjs(artifact.issuedAt).format('D MMM YYYY HH:mm') : '—'}</Text>
                                                                </Box>
                                                                <Stack gap={4} align="flex-end" style={{ flexShrink: 0 }}>
                                                                    <Badge size="xs" color={artifact.acknowledged ? 'teal' : 'gray'} variant="light">
                                                                        {artifact.acknowledged ? 'Acknowledged' : 'Pending Ack'}
                                                                    </Badge>
                                                                    <Button
                                                                        size="xs"
                                                                        variant="subtle"
                                                                        color="teal"
                                                                        onClick={() => openCredentialArtifact({
                                                                            title: `Remittance VC · ${artifact.paymentId}`,
                                                                            credentialId: artifact.credentialId,
                                                                            credentialType: 'RemittanceAdviceVC',
                                                                            status: artifact.acknowledged ? 'acknowledged' : 'issued',
                                                                            issuedAt: artifact.issuedAt,
                                                                            sourceRef: artifact.sourceRef,
                                                                            counterpart: selectedApSupplier?.supplier_name || null,
                                                                            amount: artifact.amount,
                                                                            currency: artifact.currency,
                                                                            note: artifact.acknowledged
                                                                                ? 'Supplier acknowledgment has been captured for this credential.'
                                                                                : 'Supplier acknowledgment is still pending for this credential.',
                                                                        })}
                                                                    >
                                                                        Inspect VC Artifact
                                                                    </Button>
                                                                </Stack>
                                                            </Group>
                                                        </Paper>
                                                    ))}
                                                </Stack>
                                            ),
                                        },
                                        {
                                            title: 'INVOICES',
                                            content: invoices.length === 0 ? (
                                                <Text size="xs" c="dimmed">No recorded invoices</Text>
                                            ) : (
                                                <Stack gap="xs">
                                                    {invoices.map((inv: any) => (
                                                        <Card key={inv.id} radius="md" withBorder padding="xs">
                                                            <Group justify="space-between" wrap="nowrap">
                                                                <Box style={{ flex: 1, minWidth: 0 }}>
                                                                    <Text fw={600} size="xs">{inv.invoice_ref}</Text>
                                                                    {inv.description && <Text size="xs" c="dimmed" truncate>{inv.description}</Text>}
                                                                    <Text size="10px" c="dimmed">Due: {inv.due_date ? dayjs(inv.due_date).format('D MMM YYYY') : '—'}</Text>
                                                                </Box>
                                                                <Box ta="right" style={{ flexShrink: 0 }}>
                                                                    <Text fw={700} size="sm">{fmt(inv.amount)}</Text>
                                                                    {inv.status !== 'paid' ? (
                                                                        <Button size="xs" color="indigo" variant="light" mt={4}
                                                                            onClick={() => {
                                                                                setApPaymentForm({ apInvoiceId: inv.id, amountPaid: String(inv.balance_due), currency: inv.currency, paymentMethod: 'ecocash', reference: '', proofImageUrl: '' });
                                                                                setShowRecordApPayment(true);
                                                                            }}
                                                                        >Pay</Button>
                                                                    ) : (
                                                                        <Badge size="xs" color="green">Paid</Badge>
                                                                    )}
                                                                </Box>
                                                            </Group>
                                                        </Card>
                                                    ))}
                                                </Stack>
                                            ),
                                        },
                                        {
                                            title: 'PAYMENTS & REMITTANCE VCs',
                                            content: payments.length === 0 ? (
                                                <Text size="xs" c="dimmed">No recorded payments</Text>
                                            ) : (
                                                <Stack gap="xs">
                                                    {payments.map((pay: any) => (
                                                        <Card key={pay.id} radius="md" withBorder padding="xs">
                                                            <Group justify="space-between" wrap="nowrap">
                                                                <Box style={{ flex: 1, minWidth: 0 }}>
                                                                    <Text fw={600} size="xs">{pay.id}</Text>
                                                                    <Text size="xs" c="dimmed">Method: {pay.payment_method}</Text>
                                                                    <Text size="10px" c="dimmed">Paid: {dayjs(pay.paid_at).format('D MMM YYYY')}</Text>
                                                                    {pay.remittance_vc_id && (
                                                                        <Group gap={6} mt={4} wrap="wrap">
                                                                            <Badge size="xs" color="teal" variant="light" leftSection={<IconShieldCheck size={9} />}>
                                                                                VC: {String(pay.remittance_vc_id).substring(0, 10)}…
                                                                            </Badge>
                                                                            <Button
                                                                                size="xs"
                                                                                variant="subtle"
                                                                                color="teal"
                                                                                leftSection={<IconExternalLink size={12} />}
                                                                                onClick={() => openCredentialArtifact({
                                                                                    title: `Remittance VC · ${pay.id}`,
                                                                                    credentialId: String(pay.remittance_vc_id),
                                                                                    credentialType: 'RemittanceAdviceVC',
                                                                                    status: pay.supplier_acknowledged_at ? 'acknowledged' : 'issued',
                                                                                    issuedAt: pay.paid_at || null,
                                                                                    sourceRef: pay.reference || pay.id,
                                                                                    counterpart: selectedApSupplier?.supplier_name || null,
                                                                                    amount: Number(pay.amount_paid || 0),
                                                                                    currency: pay.currency || 'USD',
                                                                                    note: pay.supplier_acknowledged_at ? 'Supplier acknowledgment already captured.' : 'Supplier acknowledgment is still pending.',
                                                                                })}
                                                                            >
                                                                                Open VC Details
                                                                            </Button>
                                                                        </Group>
                                                                    )}
                                                                </Box>
                                                                <Box ta="right" style={{ flexShrink: 0 }}>
                                                                    <Text fw={700} size="sm" c="green">{fmt(pay.amount_paid)}</Text>
                                                                    {pay.supplier_acknowledged_at ? (
                                                                        <Badge size="xs" color="teal" variant="light">✓ Acknowledged</Badge>
                                                                    ) : (
                                                                        <Badge size="xs" color="gray" variant="light">Pending Ack</Badge>
                                                                    )}
                                                                </Box>
                                                            </Group>
                                                        </Card>
                                                    ))}
                                                </Stack>
                                            ),
                                        },
                                    ]}
                                    auditItems={ssLifecycleItems}
                                    auditEmptyText="No payment history yet"
                                />
                            );
                        })() : null}
                    </Stack>
                )}
            </Drawer>

            {/* ── Record Supplier Invoice Drawer ── */}
            <Drawer
                opened={showRecordApInvoice}
                onClose={() => setShowRecordApInvoice(false)}
                position="bottom"
                size="auto"
                title="Record Supplier Invoice"
                radius="lg"
                styles={{ content: { borderRadius: '16px 16px 0 0' } }}
            >
                <Stack gap="sm" p="md">
                    <Select
                        label="Supplier"
                        placeholder="Select supplier"
                        data={apSuppliers.map((s) => ({ value: s.id, label: s.supplier_name }))}
                        value={selectedApSupplier?.id || null}
                        onChange={(val) => {
                            if (val) {
                                const found = apSuppliers.find((s) => s.id === val);
                                if (found) setSelectedApSupplier(found);
                            }
                        }}
                    />
                    <TextInput
                        label="Invoice Reference"
                        placeholder="e.g. INV-100234"
                        value={apInvoiceForm.invoiceRef}
                        onChange={(e) => setApInvoiceForm({ ...apInvoiceForm, invoiceRef: e.currentTarget.value })}
                        required
                    />
                    <TextInput
                        label="Amount"
                        placeholder="e.g. 150.00"
                        type="number"
                        value={apInvoiceForm.amount}
                        onChange={(e) => setApInvoiceForm({ ...apInvoiceForm, amount: e.currentTarget.value })}
                        required
                    />
                    <Select
                        label="Currency"
                        data={['USD', 'ZWL', 'ZIG']}
                        value={apInvoiceForm.currency}
                        onChange={(val) => setApInvoiceForm({ ...apInvoiceForm, currency: val || 'USD' })}
                    />
                    <TextInput
                        label="Description"
                        placeholder="e.g. Concrete mix delivery"
                        value={apInvoiceForm.description}
                        onChange={(e) => setApInvoiceForm({ ...apInvoiceForm, description: e.currentTarget.value })}
                    />
                    <TextInput
                        label="Due Date"
                        type="date"
                        value={apInvoiceForm.dueDate}
                        onChange={(e) => setApInvoiceForm({ ...apInvoiceForm, dueDate: e.currentTarget.value })}
                    />

                    <Button
                        color="indigo"
                        size="md"
                        mt="xs"
                        loading={submittingApAction}
                        onClick={async () => {
                            if (!selectedApSupplier?.id) {
                                notifications.show({ title: 'Validation Alert', message: 'Please select a supplier.', color: 'orange' });
                                return;
                            }
                            if (!apInvoiceForm.invoiceRef || !apInvoiceForm.amount) {
                                notifications.show({ title: 'Validation Alert', message: 'Reference and Amount are required.', color: 'orange' });
                                return;
                            }

                            setSubmittingApAction(true);
                            const token = getPreferredToken();
                            try {
                                await api.post('/api/finance/ap/invoices', {
                                    supplierId: selectedApSupplier.id,
                                    invoiceRef: apInvoiceForm.invoiceRef,
                                    amount: parseFloat(apInvoiceForm.amount),
                                    currency: apInvoiceForm.currency,
                                    description: apInvoiceForm.description || undefined,
                                    dueDate: apInvoiceForm.dueDate || undefined,
                                }, {
                                    headers: { Authorization: `Bearer ${token}` },
                                });
                                notifications.show({
                                    title: 'Invoice Recorded',
                                    message: `Invoice ${apInvoiceForm.invoiceRef} registered successfully.`,
                                    color: 'green',
                                });
                                setShowRecordApInvoice(false);
                                fetchApSuppliers();
                                fetchApWorkflowActions();
                                if (selectedApSupplier?.id) fetchSupplierStatement(selectedApSupplier.id);
                            } catch (err: any) {
                                notifications.show({
                                    title: 'Recording failed',
                                    message: err.response?.data?.error || err.message,
                                    color: 'red',
                                });
                            } finally {
                                setSubmittingApAction(false);
                            }
                        }}
                    >
                        Submit Invoice
                    </Button>
                </Stack>
            </Drawer>

            {/* ── Record Payment Drawer ── */}
            <Drawer
                opened={showRecordApPayment}
                onClose={() => setShowRecordApPayment(false)}
                position="bottom"
                size="auto"
                title="Record Supplier Payment"
                radius="lg"
                styles={{ content: { borderRadius: '16px 16px 0 0' } }}
            >
                <Stack gap="sm" p="md">
                    <TextInput
                        label="Amount Paid"
                        placeholder="e.g. 100.00"
                        type="number"
                        value={apPaymentForm.amountPaid}
                        onChange={(e) => setApPaymentForm({ ...apPaymentForm, amountPaid: e.currentTarget.value })}
                        required
                    />
                    <Select
                        label="Payment Method"
                        data={[
                            { value: 'ecocash', label: 'EcoCash' },
                            { value: 'bank_transfer', label: 'Bank Transfer' },
                            { value: 'cash', label: 'Cash' },
                            { value: 'cheque', label: 'Cheque' },
                            { value: 'other', label: 'Other' },
                        ]}
                        value={apPaymentForm.paymentMethod}
                        onChange={(val) => setApPaymentForm({ ...apPaymentForm, paymentMethod: val || 'ecocash' })}
                    />
                    <TextInput
                        label="Reference Number"
                        placeholder="e.g. EcoCash txn id or Bank ref"
                        value={apPaymentForm.reference}
                        onChange={(e) => setApPaymentForm({ ...apPaymentForm, reference: e.currentTarget.value })}
                    />
                    <TextInput
                        label="Proof Image URL (Optional)"
                        placeholder="Image URL or attachment proof"
                        value={apPaymentForm.proofImageUrl}
                        onChange={(e) => setApPaymentForm({ ...apPaymentForm, proofImageUrl: e.currentTarget.value })}
                    />

                    <Button
                        color="indigo"
                        size="md"
                        mt="xs"
                        loading={submittingApAction}
                        onClick={async () => {
                            if (!apPaymentForm.amountPaid || !selectedApSupplier?.id) {
                                notifications.show({ title: 'Validation Alert', message: 'Amount Paid is required.', color: 'orange' });
                                return;
                            }

                            setSubmittingApAction(true);
                            const token = getPreferredToken();
                            try {
                                await api.post('/api/finance/ap/payments', {
                                    supplierId: selectedApSupplier.id,
                                    apInvoiceId: apPaymentForm.apInvoiceId,
                                    amountPaid: parseFloat(apPaymentForm.amountPaid),
                                    currency: apPaymentForm.currency,
                                    paymentMethod: apPaymentForm.paymentMethod,
                                    reference: apPaymentForm.reference || undefined,
                                    proofImageUrl: apPaymentForm.proofImageUrl || undefined,
                                }, {
                                    headers: { Authorization: `Bearer ${token}` },
                                });
                                notifications.show({
                                    title: 'Payment Recorded',
                                    message: 'The payment has been successfully recorded and Remittance VC offered config queued.',
                                    color: 'green',
                                });
                                setShowRecordApPayment(false);
                                fetchApSuppliers();
                                fetchApWorkflowActions();
                                if (selectedApSupplier?.id) fetchSupplierStatement(selectedApSupplier.id);
                            } catch (err: any) {
                                notifications.show({
                                    title: 'Recording failed',
                                    message: err.response?.data?.error || err.message,
                                    color: 'red',
                                });
                            } finally {
                                setSubmittingApAction(false);
                            }
                        }}
                    >
                        Submit Payment & Issue VC
                    </Button>
                </Stack>
            </Drawer>

            {/* ── Create Instalment Plan Drawer ── */}
            <Drawer
                opened={showCreatePlan}
                onClose={() => {
                    setShowCreatePlan(false);
                    setSelectedPlanContact(null);
                }}
                position="bottom"
                size="auto"
                title="New Instalment Plan"
                radius="lg"
                styles={{ content: { borderRadius: '16px 16px 0 0' } }}
            >
                <Stack gap="md" pb="lg">
                    <Alert color="blue" variant="light" icon={<IconAlertCircle size={16} />}>
                        Instalment plans generate scheduled payment links and notify the customer.
                    </Alert>

                    <ContactSelectField
                        label="Link from Contacts (recommended)"
                        placeholder="Select counterparty org/contact"
                        description="Selecting a wallet-linked contact auto-syncs this plan into the payer org AP workflow."
                        contacts={contacts}
                        value={selectedPlanContact?.id || null}
                        onChange={(contact) => {
                            setSelectedPlanContact(contact);
                            if (contact) {
                                setPlanForm((prev) => ({
                                    ...prev,
                                    payerName: contact.name || prev.payerName,
                                    payerPhone: contact.phone || prev.payerPhone,
                                    payerEmail: contact.email || prev.payerEmail,
                                }));
                            }
                        }}
                    />

                    <TextInput
                        label="Customer / Payer Name" required
                        placeholder="e.g. Tendai Hove"
                        value={planForm.payerName}
                        onChange={(e) => setPlanForm({ ...planForm, payerName: e.currentTarget.value })}
                    />

                    <Group grow>
                        <TextInput
                            label="Payer Phone (optional)"
                            placeholder="e.g. +26377123456"
                            value={planForm.payerPhone}
                            onChange={(e) => setPlanForm({ ...planForm, payerPhone: e.currentTarget.value })}
                        />
                        <TextInput
                            label="Payer Email (optional)"
                            placeholder="e.g. tendai@example.com"
                            value={planForm.payerEmail}
                            onChange={(e) => setPlanForm({ ...planForm, payerEmail: e.currentTarget.value })}
                        />
                    </Group>

                    <TextInput
                        label="Plan Description" required
                        placeholder="e.g. Annual Subscription, Solar Kit Plan..."
                        value={planForm.description}
                        onChange={(e) => setPlanForm({ ...planForm, description: e.currentTarget.value })}
                    />

                    <Group grow>
                        <TextInput
                            label="Total Amount" required type="number" min={0.01} step={0.01}
                            placeholder="300.00"
                            value={planForm.totalAmount}
                            onChange={(e) => setPlanForm({ ...planForm, totalAmount: e.currentTarget.value })}
                        />
                        <Select
                            label="Currency"
                            value={planForm.currency}
                            onChange={(v) => setPlanForm({ ...planForm, currency: v ?? 'USD' })}
                            data={[
                                { value: 'USD', label: 'USD' },
                                { value: 'ZWL', label: 'ZWL' },
                                { value: 'ZIG', label: 'ZiG' },
                            ]}
                        />
                    </Group>

                    <Group grow>
                        <Select
                            label="Instalments Count"
                            value={planForm.instalments}
                            onChange={(v) => setPlanForm({ ...planForm, instalments: v ?? '3' })}
                            data={[
                                { value: '2', label: '2 payments' },
                                { value: '3', label: '3 payments (default)' },
                                { value: '4', label: '4 payments' },
                                { value: '6', label: '6 payments' },
                                { value: '12', label: '12 payments' },
                            ]}
                        />
                        <Select
                            label="Billing Cadence"
                            value={planForm.cadence}
                            onChange={(v) => setPlanForm({ ...planForm, cadence: v ?? 'monthly' })}
                            data={[
                                { value: 'weekly', label: 'Weekly' },
                                { value: 'monthly', label: 'Monthly' },
                            ]}
                        />
                    </Group>

                    <TextInput
                        label="First Due Date"
                        type="date"
                        value={planForm.firstDueDate}
                        onChange={(e) => setPlanForm({ ...planForm, firstDueDate: e.currentTarget.value })}
                    />

                    <Button
                        fullWidth size="lg" color="blue"
                        leftSection={<IconPlus size={18} />}
                        onClick={handleCreatePlan}
                        loading={creatingPlan}
                        disabled={!planForm.description.trim() || !planForm.totalAmount || !planForm.payerName.trim()}
                    >
                        Create Plan & Queue Links
                    </Button>
                </Stack>
            </Drawer>

            {/* ── Create Payment Link Drawer ── */}
            <Drawer
                opened={showCreate}
                onClose={() => setShowCreate(false)}
                position="bottom"
                size="auto"
                title={hasArCollections ? 'New AR Collection' : 'New Payment Link'}
                radius="lg"
                styles={{ content: { borderRadius: '16px 16px 0 0' } }}
            >
                <Stack gap="md" pb="lg">
                    <Alert color="blue" variant="light" icon={<IconAlertCircle size={16} />}>
                        {hasArCollections
                            ? 'Create a one-time link, instalment plan, or recurring billing schedule — all tracked in AR Collections.'
                            : 'Active links support in-app checkout, copy, and WhatsApp share actions.'}
                    </Alert>

                    {hasArCollections && (
                        <SegmentedControl
                            fullWidth
                            value={form.collectionType}
                            onChange={(v) => setForm({ ...form, collectionType: v })}
                            data={[
                                { value: 'one_time', label: 'One-Time' },
                                { value: 'instalment', label: 'Instalment' },
                                { value: 'recurring', label: 'Recurring' },
                            ]}
                        />
                    )}

                    <ContactSelectField
                        label="Recipient Contact (optional)"
                        placeholder="Select customer/client"
                        description="Choose a contact to send this payment link directly to their inbox while still generating a public checkout link."
                        contacts={contacts}
                        value={selectedContact?.id || null}
                        onChange={(contact) => {
                            setSelectedContact(contact);
                            if (contact) {
                                setForm((prev) => ({
                                    ...prev,
                                    description: prev.description || `Payment for ${contact.name}`,
                                }));
                            }
                        }}
                    />

                    <TextInput
                        label="Description" required
                        placeholder="e.g. Laptop repair, Invoice #42..."
                        value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.currentTarget.value })}
                    />

                    <Group grow>
                        <TextInput
                            label="Amount" required type="number" min={0.01} step={0.01}
                            placeholder="45.00"
                            value={form.amount}
                            onChange={(e) => setForm({ ...form, amount: e.currentTarget.value })}
                        />
                        <Select
                            label="Currency"
                            value={form.currency}
                            onChange={(v) => setForm({ ...form, currency: v ?? 'USD' })}
                            data={[
                                { value: 'USD', label: 'USD' },
                                { value: 'ZWL', label: 'ZWL' },
                                { value: 'ZIG', label: 'ZiG' },
                            ]}
                        />
                    </Group>

                    {!hasArCollections && (
                        <TextInput
                            label="Business Name (optional)"
                            placeholder="e.g. Chipo Electronics"
                            value={form.merchantName}
                            onChange={(e) => setForm({ ...form, merchantName: e.currentTarget.value })}
                        />
                    )}

                    {!hasArCollections && (
                        <TextInput
                            label="Invoice Ref (optional)"
                            placeholder="INV-2026-042"
                            value={form.invoiceRef}
                            onChange={(e) => setForm({ ...form, invoiceRef: e.currentTarget.value })}
                        />
                    )}

                    {hasArCollections && (
                        <>
                            <TextInput
                                label="Customer Name"
                                placeholder="Full name of payer"
                                value={form.payerName}
                                onChange={(e) => setForm({ ...form, payerName: e.currentTarget.value })}
                            />
                            <TextInput
                                label="Customer Phone (optional)"
                                placeholder="+263..."
                                value={form.payerPhone}
                                onChange={(e) => setForm({ ...form, payerPhone: e.currentTarget.value })}
                            />
                        </>
                    )}

                    {hasArCollections && form.collectionType !== 'one_time' && (
                        <>
                            <Group grow>
                                <NumberInput
                                    label="Number of Instalments"
                                    value={parseInt(form.instalments) || 3}
                                    onChange={(v) => setForm({ ...form, instalments: String(v ?? 3) })}
                                    min={2} max={60}
                                />
                                {form.collectionType === 'recurring' && (
                                    <Select
                                        label="Cadence"
                                        value={form.cadence}
                                        onChange={(v) => setForm({ ...form, cadence: v ?? 'monthly' })}
                                        data={[
                                            { value: 'weekly', label: 'Weekly' },
                                            { value: 'monthly', label: 'Monthly' },
                                        ]}
                                    />
                                )}
                            </Group>
                            <TextInput
                                label="First Due Date"
                                type="date"
                                value={form.firstDueDate}
                                onChange={(e) => setForm({ ...form, firstDueDate: e.currentTarget.value })}
                            />
                        </>
                    )}

                    {!hasArCollections && (
                        <Select
                            label="Expires in"
                            value={form.expiryHours}
                            onChange={(v) => setForm({ ...form, expiryHours: v ?? '336' })}
                            data={[
                                { value: '24', label: '24 hours' },
                                { value: '48', label: '48 hours' },
                                { value: '72', label: '72 hours' },
                                { value: '168', label: '1 week' },
                                { value: '336', label: '2 weeks (default)' },
                            ]}
                        />
                    )}

                    <Button
                        fullWidth size="lg"
                        leftSection={<IconPlus size={18} />}
                        onClick={handleCreate}
                        loading={creating}
                        disabled={!form.description.trim() || !form.amount}
                    >
                        {hasArCollections
                            ? (form.collectionType === 'one_time' ? 'Create Payment Link' : form.collectionType === 'instalment' ? 'Create Instalment Plan' : 'Create Recurring Billing')
                            : 'Create & Get Link'}
                    </Button>
                </Stack>
            </Drawer>

            {/* ── Create Invoice Drawer ── */}
            <Drawer
                opened={showInvoice}
                onClose={() => setShowInvoice(false)}
                position="bottom"
                size="auto"
                title="Issue School Fee Invoice"
                radius="lg"
                styles={{ content: { borderRadius: '16px 16px 0 0' } }}
            >
                <Stack gap="md" pb="lg">
                    <ContactSelectField
                        label="Recipient Contact (optional)"
                        placeholder="Select customer/client"
                        description="Choose a contact to send this school-fees workflow directly to their inbox."
                        contacts={contacts}
                        value={selectedInvoiceContact?.id || null}
                        onChange={(contact) => {
                            setSelectedInvoiceContact(contact);
                            if (contact && !invoiceForm.studentName.trim()) {
                                setInvoiceForm((prev) => ({ ...prev, studentName: contact.name }));
                            }
                        }}
                    />

                    <TextInput label="Student Name" required
                        placeholder="Full student name"
                        value={invoiceForm.studentName}
                        onChange={(e) => setInvoiceForm({ ...invoiceForm, studentName: e.currentTarget.value })}
                    />
                    <TextInput label="Student ID"
                        placeholder="STU-0001"
                        value={invoiceForm.studentId}
                        onChange={(e) => setInvoiceForm({ ...invoiceForm, studentId: e.currentTarget.value })}
                    />

                    <Group grow>
                        <Select label="Class / Grade"
                            searchable
                            placeholder="Select class or grade"
                            value={invoiceForm.className || null}
                            onChange={(v) => setInvoiceForm({ ...invoiceForm, className: v ?? '' })}
                            data={schoolClassGradeOptions}
                        />
                        <Select label="Term / Year"
                            searchable
                            placeholder="Select term and year"
                            value={invoiceForm.term || null}
                            onChange={(v) => setInvoiceForm({ ...invoiceForm, term: v ?? '' })}
                            data={schoolTermYearOptions}
                        />
                    </Group>

                    <Group grow>
                        <Select label="Fee Type"
                            value={invoiceForm.feeType}
                            onChange={(v) => setInvoiceForm({ ...invoiceForm, feeType: v ?? 'Tuition' })}
                            data={['Tuition', 'Transport', 'Uniform', 'Books', 'Boarding', 'Examination', 'Other']}
                        />
                        <TextInput label="Parent Phone (optional)"
                            placeholder="0772 123 456"
                            value={invoiceForm.parentPhone}
                            onChange={(e) => setInvoiceForm({ ...invoiceForm, parentPhone: e.currentTarget.value })}
                        />
                    </Group>

                    <Group grow>
                        <TextInput label="Amount" required type="number" min={0.01} step={0.01}
                            placeholder="0.00"
                            value={invoiceForm.amount}
                            onChange={(e) => setInvoiceForm({ ...invoiceForm, amount: e.currentTarget.value })}
                        />
                        <Select label="Currency"
                            value={invoiceForm.currency}
                            onChange={(v) => setInvoiceForm({ ...invoiceForm, currency: v ?? 'USD' })}
                            data={[{ value: 'USD', label: 'USD' }, { value: 'ZWL', label: 'ZWL' }, { value: 'ZIG', label: 'ZiG' }]}
                        />
                    </Group>

                    <Textarea label="Description (optional)"
                        placeholder="Optional note shown on invoice"
                        value={invoiceForm.description}
                        onChange={(e) => setInvoiceForm({ ...invoiceForm, description: e.currentTarget.value })}
                    />

                    <Button fullWidth size="lg" color="indigo"
                        leftSection={<IconReceipt size={18} />}
                        onClick={handleCreateInvoice}
                        loading={creatingInvoice}
                        disabled={!invoiceForm.amount || !invoiceForm.studentName}
                    >
                        Issue School Fee Invoice
                    </Button>
                </Stack>
            </Drawer>

            <Drawer
                opened={showRequisition}
                onClose={() => setShowRequisition(false)}
                position="bottom"
                size="auto"
                title="New Requisition Request"
                radius="lg"
                styles={{ content: { borderRadius: '16px 16px 0 0' } }}
            >
                <Stack gap="md" pb="lg">
                    <Select
                        label="Department"
                        value={requisitionForm.department}
                        onChange={(v) => setRequisitionForm({ ...requisitionForm, department: v ?? 'Operations' })}
                        data={['HR', 'IT', 'Operations', 'Procurement', 'Finance', 'Marketing'].map((value) => ({ value, label: value }))}
                    />

                    <TextInput
                        label="Vendor (optional)"
                        placeholder="ABC Supplies"
                        value={requisitionForm.vendor}
                        onChange={(e) => setRequisitionForm({ ...requisitionForm, vendor: e.currentTarget.value })}
                    />

                    <Group grow>
                        <TextInput
                            label="Amount"
                            required
                            type="number"
                            min={0.01}
                            step={0.01}
                            value={requisitionForm.amount}
                            onChange={(e) => setRequisitionForm({ ...requisitionForm, amount: e.currentTarget.value })}
                        />
                        <Select
                            label="Currency"
                            value={requisitionForm.currency}
                            onChange={(v) => setRequisitionForm({ ...requisitionForm, currency: v ?? 'USD' })}
                            data={[{ value: 'USD', label: 'USD' }, { value: 'ZWL', label: 'ZWL' }, { value: 'ZIG', label: 'ZiG' }]}
                        />
                    </Group>

                    <TextInput
                        label="Notes"
                        placeholder="Reason and context for this requisition"
                        value={requisitionForm.notes}
                        onChange={(e) => setRequisitionForm({ ...requisitionForm, notes: e.currentTarget.value })}
                    />

                    <Button
                        fullWidth
                        size="lg"
                        color="indigo"
                        leftSection={<IconPlus size={18} />}
                        onClick={handleCreateRequisition}
                        loading={creatingRequisition}
                        disabled={!requisitionForm.amount}
                    >
                        Submit Requisition
                    </Button>
                </Stack>
            </Drawer>

            <Drawer
                opened={showFieldRun}
                onClose={() => setShowFieldRun(false)}
                position="bottom"
                size="auto"
                title="New Field Execution Run"
                radius="lg"
                styles={{ content: { borderRadius: '16px 16px 0 0' } }}
            >
                <Stack gap="md" pb="xl" px="xs">
                    <Text size="sm" c="dimmed">
                        Initiate a new operational run. This will create a job card and notify assigned team members.
                    </Text>

                    <TextInput
                        label="Description / Title"
                        placeholder="e.g. SGK Construction - Site Maintenance"
                        value={fieldRunForm.description}
                        onChange={(e) => setFieldRunForm({ ...fieldRunForm, description: e.currentTarget.value })}
                        required
                    />

                    <Grid gutter="sm">
                        <Grid.Col span={8}>
                            <TextInput
                                label="Estimated Budget"
                                placeholder="0.00"
                                type="number"
                                value={fieldRunForm.amount}
                                onChange={(e) => setFieldRunForm({ ...fieldRunForm, amount: e.currentTarget.value })}
                                leftSection={<Text size="xs" fw={700}>$</Text>}
                                required
                            />
                        </Grid.Col>
                        <Grid.Col span={4}>
                            <Select
                                label="Currency"
                                data={['USD', 'ZiG']}
                                value={fieldRunForm.currency}
                                onChange={(val) => setFieldRunForm({ ...fieldRunForm, currency: val || 'USD' })}
                            />
                        </Grid.Col>
                    </Grid>

                    <TextInput
                        label="Site / Location"
                        placeholder="e.g. 123 Samora Machel Ave"
                        value={fieldRunForm.location}
                        onChange={(e) => setFieldRunForm({ ...fieldRunForm, location: e.currentTarget.value })}
                    />

                    <TextInput
                        label="Scheduled Date"
                        type="date"
                        value={fieldRunForm.scheduledDate}
                        onChange={(e) => setFieldRunForm({ ...fieldRunForm, scheduledDate: e.currentTarget.value })}
                    />

                    <Select
                        label="Assign To"
                        description="Default for tests is owner/admin"
                        value={fieldRunForm.assigneeId}
                        onChange={(val) => setFieldRunForm({ ...fieldRunForm, assigneeId: val || 'owner' })}
                        data={[
                            { value: 'owner', label: 'Owner (default test route)' },
                            ...orgMembers
                                .filter((m) => m.status === 'active')
                                .map((m) => ({ value: m.userId, label: `${m.userId} (${m.role})` })),
                        ]}
                    />

                    <Button
                        fullWidth
                        size="lg"
                        color="teal"
                        mt="md"
                        loading={creatingFieldRun}
                        onClick={handleCreateFieldRun}
                        disabled={!fieldRunForm.amount || !fieldRunForm.description}
                    >
                        Start Field Run
                    </Button>
                </Stack>
            </Drawer>

            {/* ── FEPT Field Run Detail Drawer (independent from requisitions) ── */}
            <Drawer
                opened={Boolean(selectedFieldRun)}
                onClose={() => setSelectedFieldRun(null)}
                position="bottom"
                size="auto"
                title="Field Run Details"
                radius="lg"
                styles={{ content: { borderRadius: '16px 16px 0 0' } }}
            >
                {selectedFieldRun && (() => {
                    const run = selectedFieldRun;
                    const stage = String(run.output?.workflowStage || run.output?.stage || run.status || '').toUpperCase();
                    const input = run.output?.workflowInput || run.input || {};
                    const stageLabel = FEPT_STAGE_LABEL[stage] || stage || run.status;
                    const runRef = input.poNumber || input.reference || run.id;
                    const isTerminal = new Set(['COMPLETED', 'CANCELLED', 'REVOKED', 'DISPUTED']).has(stage);
                    const canReassign = !isTerminal;
                    const amount = Number.isFinite(Number(input.amount))
                        ? Number(input.amount)
                        : Number.isFinite(Number(input.budget))
                            ? Number(input.budget)
                            : 0;
                    const currency = String(input.currency || 'USD').trim() || 'USD';
                    const lifecycleItems = buildFieldRunLifecycleItems(run);
                    const auditItems = buildFieldRunAuditItems(run);
                    const reassignOptions = [
                        { value: 'owner', label: 'Owner (default)' },
                        ...orgMembers
                            .filter((m) => m.status === 'active')
                            .map((m) => ({ value: `member:${m.userId}`, label: `${m.userId} (${m.role})` })),
                        ...contacts
                            .filter((c) => Boolean(c.phone))
                            .map((c) => ({ value: `contact:${c.phone}`, label: `${c.name} (${c.phone})` })),
                    ];
                    return (
                        <WorkflowDetailBody
                            statusCard={(
                                <DetailStatusCard
                                    status={stageLabel}
                                    amount={amount}
                                    currency={currency}
                                    lines={[
                                        { text: `Run reference: ${runRef}` },
                                        ...(input.location ? [{ text: `Location: ${input.location}` }] : []),
                                        { text: `Run ID: ${run.id}` },
                                    ]}
                                />
                            )}
                            sections={[
                                {
                                    title: 'WORKFLOW ACTIONS',
                                    content: (
                                        <>
                                            {!isTerminal && (
                                                <>
                                                    <TextInput
                                                        label="VC Guard Reference"
                                                        placeholder="VP reference / proof id"
                                                        value={feptPresentationRef}
                                                        onChange={(e) => setFeptPresentationRef(e.currentTarget.value)}
                                                    />
                                                    <Text size="xs" c="dimmed">
                                                        FEPT stage actions require VC evidence payloads and use workflow run resume.
                                                    </Text>
                                                </>
                                            )}
                                            {!isTerminal && (
                                                <Group grow>
                                                    {stage === 'ASSIGNED' && (
                                                        <Button
                                                            color="green"
                                                            leftSection={<IconPlayerPlay size={16} />}
                                                            loading={feptActionLoading}
                                                            onClick={() => handleStartFieldRun(run.id)}
                                                        >
                                                            Start Job
                                                        </Button>
                                                    )}
                                                    {stage === 'IN_PROGRESS' && (
                                                        <Button
                                                            color="orange"
                                                            leftSection={<IconCamera size={16} />}
                                                            loading={feptActionLoading}
                                                            onClick={() => handleCaptureFieldEvidence(run)}
                                                        >
                                                            {inferNextEvidencePhase(run) === 'before' ? 'Capture Before Evidence' : 'Capture After Evidence'}
                                                        </Button>
                                                    )}
                                                    {stage === 'APPROVAL_PENDING' && (
                                                        <Button
                                                            color="indigo"
                                                            leftSection={<IconShieldCheck size={16} />}
                                                            loading={feptActionLoading}
                                                            onClick={() => handleFeptStageAction(run.id, 'approve')}
                                                        >
                                                            Approve (VC)
                                                        </Button>
                                                    )}
                                                    {stage === 'EVIDENCE_CAPTURED' && (
                                                        <Button
                                                            color="teal"
                                                            leftSection={<IconShieldCheck size={16} />}
                                                            loading={feptActionLoading}
                                                            onClick={() => handleFeptStageAction(run.id, 'ack')}
                                                        >
                                                            Acknowledge (VC)
                                                        </Button>
                                                    )}
                                                    {stage === 'ACKNOWLEDGED' && (
                                                        <Button
                                                            color="yellow"
                                                            leftSection={<IconWallet size={16} />}
                                                            loading={feptActionLoading}
                                                            onClick={() => handleFeptStageAction(run.id, 'trigger_payment')}
                                                        >
                                                            Trigger Payment (VC)
                                                        </Button>
                                                    )}
                                                    {new Set(['PAYMENT_TRIGGERED', 'RECEIPT_ISSUED']).has(stage) && (
                                                        <Button
                                                            color="cyan"
                                                            leftSection={<IconReceipt size={16} />}
                                                            loading={feptActionLoading}
                                                            onClick={() => handleFeptStageAction(run.id, 'reconcile')}
                                                        >
                                                            Reconcile (VC)
                                                        </Button>
                                                    )}
                                                </Group>
                                            )}
                                            {isTerminal && (
                                                <Alert color="gray" variant="light">
                                                    This field workflow is in a terminal state. No further stage actions are available.
                                                </Alert>
                                            )}
                                        </>
                                    ),
                                },
                                {
                                    title: 'LIFECYCLE ACTIONS',
                                    content: (
                                        <>
                                            <DetailTimelineList items={lifecycleItems} emptyText="No timeline events available yet." />
                                            {canReassign && (
                                                <Paper p="sm" radius="md" withBorder>
                                                    <Stack gap="sm">
                                                        <Select
                                                            label="Reassign Job"
                                                            value={fieldReassignAssigneeId}
                                                            onChange={(val) => setFieldReassignAssigneeId(val || 'owner')}
                                                            data={reassignOptions}
                                                            description="Owner/manager can reassign at any active stage"
                                                        />
                                                        <Button
                                                            fullWidth
                                                            variant="outline"
                                                            color="grape"
                                                            leftSection={<IconUsers size={16} />}
                                                            loading={feptActionLoading}
                                                            onClick={() => handleReassignFieldTask(run.id, fieldReassignAssigneeId)}
                                                        >
                                                            Reassign Job
                                                        </Button>
                                                    </Stack>
                                                </Paper>
                                            )}
                                            <Button
                                                fullWidth
                                                variant="light"
                                                color="teal"
                                                leftSection={<IconExternalLink size={16} />}
                                                onClick={() => {
                                                    setSelectedFieldRun(null);
                                                    router.push(`/activity?ref=${encodeURIComponent(run.id)}`);
                                                }}
                                            >
                                                View Full Timeline in Activity
                                            </Button>
                                        </>
                                    ),
                                },
                            ]}
                            auditItems={auditItems}
                            auditEmptyText="No timeline events available yet."
                        />
                    );
                })()}
            </Drawer>

            <Drawer
                opened={Boolean(selectedRequisitionId)}
                onClose={() => {
                    setSelectedRequisitionId(null);
                    setSelectedRequisition(null);
                    setRequisitionDecisionReason('');
                    setRequisitionLifecycleNote('Goods/services received and confirmed.');
                    setShowApprovalModal(false);
                    setApprovalRequestId(null);
                    setApprovalRequestUrl(null);
                }}
                position="bottom"
                size="auto"
                title={selectedRequisitionId ? `Requisition ${selectedRequisitionId}` : 'Requisition Details'}
                radius="lg"
                styles={{ content: { borderRadius: '16px 16px 0 0' } }}
            >
                <Stack gap="md" pb="lg">
                    {!selectedRequisition ? (
                        <Center py="md"><Loader /></Center>
                    ) : (
                        <>
                            {contextSwitching && (
                                <Alert color="blue" variant="light" icon={<IconRefresh size={14} />}>
                                    Switching to organization context for requisition actions...
                                </Alert>
                            )}
                            {(() => {
                                const targetOrgId = selectedRequisition?.summary?.tenantId;
                                const currentOrgId = getActiveOrgId();
                                const contextMismatch = targetOrgId && currentOrgId !== targetOrgId;

                                if (!contextMismatch) return null;
                                return (
                                    <Alert
                                        color="blue"
                                        variant="filled"
                                        title="Organization Context Required"
                                        icon={<IconShieldCheck size={18} />}
                                        mb="md"
                                    >
                                        <Stack gap="xs">
                                            <Text size="sm">
                                                This requisition belongs to a different organization. Switch context to approve or release funds.
                                            </Text>
                                            <Button
                                                variant="white"
                                                color="blue"
                                                size="xs"
                                                onClick={() => void ensureOrgContextForRequisition(targetOrgId)}
                                                loading={contextSwitching}
                                            >
                                                Switch to Organization
                                            </Button>
                                        </Stack>
                                    </Alert>
                                );
                            })()}

                            {(() => {
                                const requisitionAuditItems: DetailTimelineItem[] = requisitionEvents.map((event: any, index: number) => ({
                                    id: `${event.id || event.eventType || 'event'}-${index}`,
                                    title: event.eventType || 'Event',
                                    source: event.source || 'system',
                                    description: describeRequisitionEvent(event) || undefined,
                                    timestamp: event.occurredAt ? dayjs(event.occurredAt).format('D MMM YYYY HH:mm') : '—',
                                }));

                                return (
                                    <WorkflowDetailBody
                                        statusCard={(
                                            <DetailStatusCard
                                                status={requisitionStatus || 'UNKNOWN'}
                                                amount={requestedAmount.amount}
                                                currency={requestedAmount.currency}
                                                lines={[
                                                    { text: approvalLimitLabel },
                                                    { text: evidenceThresholdLabel },
                                                ]}
                                                footer={approvalActionAllowed === false ? (
                                                    <Alert color="red" variant="light" icon={<IconAlertCircle size={16} />} mt="sm">
                                                        Your current org role cannot approve requisitions in offline policy mode.
                                                    </Alert>
                                                ) : undefined}
                                            />
                                        )}
                                        sections={[
                                            {
                                                title: 'APPROVAL ACTIONS',
                                                content: (() => {
                                                    const currentStatus = requisitionStatus;
                                                    const isManagerApprovalStage = currentStatus === 'REQUISITION_CREATED';
                                                    const isFinanceApprovalStage = currentStatus === 'MANAGER_APPROVED';
                                                    const canApprove = isManagerApprovalStage || isFinanceApprovalStage;
                                                    const approvalLabel = isManagerApprovalStage
                                                        ? 'Manager Approve (Require Wallet VP)'
                                                        : isFinanceApprovalStage
                                                            ? 'Finance Approve (Require Wallet VP)'
                                                            : 'Already Approved';

                                                    return (
                                                        <>
                                                            <Button
                                                                size="md"
                                                                color="indigo"
                                                                loading={creatingApprovalRequest}
                                                                disabled={!canApprove || (selectedRequisition?.summary?.tenantId ? getActiveOrgId() !== selectedRequisition.summary.tenantId : false)}
                                                                onClick={() => void handleOpenApprovalModal()}
                                                            >
                                                                {approvalLabel}
                                                            </Button>
                                                            {!canApprove && currentStatus && (
                                                                <Alert color="gray" variant="light">
                                                                    This requisition has already been approved.
                                                                </Alert>
                                                            )}
                                                        </>
                                                    );
                                                })(),
                                            },
                                            {
                                                title: 'LIFECYCLE ACTIONS',
                                                content: (() => {
                                                    const currentStatus = requisitionStatus;
                                                    const canRelease = currentStatus === 'APPROVED';
                                                    const canAck = ['RELEASED', 'PAID', 'RECEIPT_ISSUED'].includes(currentStatus);
                                                    const canDecide = Boolean(selectedRequisition.workflowRequestId)
                                                        && (selectedRequisition.workflowRequestStatus || 'pending') === 'pending';

                                                    return (
                                                        <>
                                                            {!isOrgActionRole() && canDecide && (
                                                                <Alert color="yellow" variant="light">
                                                                    Use an owner, admin, manager, or approver org profile for approval actions.
                                                                </Alert>
                                                            )}

                                                            <Button
                                                                size="md"
                                                                color="yellow"
                                                                loading={creatingReleaseRequest}
                                                                disabled={!canRelease || !isReleaseRole() || (selectedRequisition?.summary?.tenantId ? getActiveOrgId() !== selectedRequisition.summary.tenantId : false)}
                                                                onClick={() => void handleOpenReleaseModal()}
                                                            >
                                                                Release Funds (Require Wallet VP)
                                                            </Button>

                                                            <Textarea
                                                                label="Acknowledge note"
                                                                placeholder="Add a short confirmation note"
                                                                minRows={2}
                                                                autosize
                                                                value={requisitionLifecycleNote}
                                                                onChange={(e) => setRequisitionLifecycleNote(e.currentTarget.value)}
                                                            />

                                                            <Button
                                                                size="md"
                                                                color="teal"
                                                                variant="light"
                                                                loading={creatingAckRequest}
                                                                disabled={!canAck || !isReleaseRole() || (selectedRequisition?.summary?.tenantId ? getActiveOrgId() !== selectedRequisition.summary.tenantId : false)}
                                                                onClick={() => void handleOpenAckModal()}
                                                            >
                                                                Acknowledge Delivery (Require Wallet VP)
                                                            </Button>
                                                        </>
                                                    );
                                                })(),
                                            },
                                        ]}
                                        auditItems={requisitionAuditItems}
                                        auditEmptyText="No timeline events available yet."
                                    />
                                );
                            })()}
                        </>
                    )}
                </Stack>
            </Drawer>

            {/* ── UI Helpers ── */}
            {
                (() => {
                    const VPActionModal = ({
                        opened, onClose, title, description, requestUrl, creatingRequest,
                        onOpenInApp, onScanPortal, onEmbeddedFallback, fallbackLoading, fallbackLabel
                    }: {
                        opened: boolean, onClose: () => void, title: string, description: string,
                        requestUrl: string | null, creatingRequest: boolean, onOpenInApp: () => void,
                        onScanPortal: () => void, onEmbeddedFallback: () => void,
                        fallbackLoading: boolean, fallbackLabel: string
                    }) => (
                        <Modal opened={opened} onClose={onClose} title={title} size="lg" centered>
                            <Stack align="center" gap="md">
                                <Text size="sm" ta="center">{description}</Text>
                                {requestUrl ? (
                                    <>
                                        <Paper p="md" radius="md" withBorder bg="white">
                                            <QRCode value={buildWalletInteropQrValue(requestUrl)} size={160} />
                                        </Paper>
                                        <Stack w="100%" gap="xs">
                                            <Text size="xs" c="dimmed" ta="center">Request URL (fallback):</Text>
                                            <Code block style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: '200px', overflowY: 'auto' }}>
                                                {requestUrl}
                                            </Code>
                                        </Stack>
                                        <Stack w="100%" gap="sm">
                                            <Button color="indigo" size="sm" leftSection={<IconShieldCheck size={16} />}
                                                onClick={onOpenInApp} disabled={creatingRequest} fullWidth>
                                                Open In This App
                                            </Button>
                                            <Button variant="light" color="violet" size="sm" leftSection={<IconQrcode size={16} />}
                                                onClick={onScanPortal} disabled={creatingRequest} fullWidth>
                                                Scan Portal QR To Continue
                                            </Button>
                                            <Button variant="light" color="blue" size="sm" leftSection={<IconExternalLink size={16} />}
                                                onClick={() => handleOpenExternalWallet(createExternalWalletLinks(requestUrl).openIdVc)} fullWidth>
                                                Open External Wallet (openid-vc)
                                            </Button>
                                            <Button variant="light" color="cyan" size="sm" leftSection={<IconExternalLink size={16} />}
                                                onClick={() => handleOpenExternalWallet(createExternalWalletLinks(requestUrl).openId4Vp)} fullWidth>
                                                Open External Wallet (openid4vp)
                                            </Button>
                                            <Button variant="subtle" color="gray" size="sm" leftSection={<IconCopy size={16} />}
                                                onClick={() => handleCopyRequestUrl(requestUrl)} fullWidth>
                                                Copy Request URL
                                            </Button>
                                            <Button loading={fallbackLoading || creatingRequest} color="grape" size="md"
                                                onClick={onEmbeddedFallback} disabled={creatingRequest} fullWidth>
                                                {fallbackLabel}
                                            </Button>
                                        </Stack>
                                    </>
                                ) : creatingRequest ? <Loader /> : (
                                    <Alert color="red" variant="light">Failed to generate request. Try again.</Alert>
                                )}
                            </Stack>
                        </Modal>
                    );

                    return (
                        <>
                            <VPActionModal
                                opened={showApprovalModal}
                                onClose={() => setShowApprovalModal(false)}
                                title="Approval Request (Wallet VP Required)"
                                description="Use your wallet to provide proof via OIDC4VP, or use the embedded fallback."
                                requestUrl={approvalRequestUrl}
                                creatingRequest={creatingApprovalRequest}
                                onOpenInApp={handleOpenApprovalInApp}
                                onScanPortal={handleScanPortalApproval}
                                onEmbeddedFallback={() => void handleApprove()}
                                fallbackLoading={approving}
                                fallbackLabel="Approve Here (Server Embedded Fallback)"
                            />

                            <VPActionModal
                                opened={showReleaseModal}
                                onClose={() => setShowReleaseModal(false)}
                                title="Release Request (Wallet VP Required)"
                                description="Use your wallet to provide proof via OIDC4VP, or use the embedded fallback."
                                requestUrl={releaseRequestUrl}
                                creatingRequest={creatingReleaseRequest}
                                onOpenInApp={handleOpenReleaseInApp}
                                onScanPortal={handleScanPortalRelease}
                                onEmbeddedFallback={() => void handleRequisitionRelease()}
                                fallbackLoading={releasing}
                                fallbackLabel="Release Here (Server Embedded Fallback)"
                            />

                            <VPActionModal
                                opened={showAckModal}
                                onClose={() => setShowAckModal(false)}
                                title="Acknowledge Delivery (Wallet VP Required)"
                                description="Use your wallet to provide proof via OIDC4VP, or use the embedded fallback."
                                requestUrl={ackRequestUrl}
                                creatingRequest={creatingAckRequest}
                                onOpenInApp={handleOpenAckInApp}
                                onScanPortal={handleScanPortalAck}
                                onEmbeddedFallback={() => void handleRequisitionAcknowledge()}
                                fallbackLoading={acking}
                                fallbackLabel="Acknowledge Here (Server Embedded Fallback)"
                            />
                        </>
                    );
                })()
            }

            {/* ── AR Plan Detail Modal ── */}
            <Drawer
                opened={Boolean(selectedPlanId)}
                onClose={() => {
                    setSelectedPlanId(null);
                    setSelectedPlanDetails(null);
                }}
                position="bottom"
                size="auto"
                title="Instalment Plan"
                radius="lg"
                styles={{ content: { borderRadius: '16px 16px 0 0' } }}
            >
                {loadingPlanDetails ? (
                    <Center py="lg"><Loader /></Center>
                ) : selectedPlanDetails ? (
                    (() => {
                        const workflowTransactions = safeArray<any>(selectedPlanDetails.workflowTransactions)
                        const latestWorkflow = workflowTransactions[0] || null
                        const lifecycleStage = deriveArProofStage(selectedPlanDetails, latestWorkflow)
                        const collectionLinks = safeArray<any>(selectedPlanDetails.collections)
                        const firstCollection = collectionLinks[0] || null
                        const installmentItems = safeArray<any>(selectedPlanDetails.instalments).map((inst: any, idx: number) => ({
                            id: String(inst.id || `${selectedPlanId || 'plan'}-${idx}`),
                            title: `Instalment #${idx + 1}`,
                            source: 'ar payment plan',
                            description: `${fmt(inst.amount, selectedPlanDetails.currency)} · Due ${inst.due_date ? dayjs(inst.due_date).format('D MMM YYYY') : 'Not scheduled'}`,
                            note: inst.paid_at ? `Paid ${dayjs(inst.paid_at).format('D MMM YYYY HH:mm')}` : undefined,
                            timestamp: inst.updated_at ? dayjs(inst.updated_at).format('D MMM YYYY HH:mm') : (inst.paid_at ? dayjs(inst.paid_at).format('D MMM YYYY HH:mm') : '—'),
                            badge: {
                                label: String(inst.status || 'pending').toUpperCase(),
                                color: inst.status === 'paid' ? 'green' : inst.status === 'overdue' ? 'orange' : 'gray',
                            },
                        }))

                        return (
                            <WorkflowDetailBody
                                statusCard={(
                                    <DetailStatusCard
                                        status={`${String(selectedPlanDetails.status || 'active').toUpperCase()} · ${formatLedgerLabel(lifecycleStage.label)}`}
                                        amount={selectedPlanDetails.amount_collected || 0}
                                        currency={selectedPlanDetails.currency}
                                        amountColor="green"
                                        lines={[
                                            { text: `Plan total: ${fmt(selectedPlanDetails.total_amount, selectedPlanDetails.currency)}` },
                                            { text: `Progress: ${selectedPlanDetails.installments_paid || 0} / ${selectedPlanDetails.installments_total || 0} instalments paid` },
                                            { text: `Trust: ${formatLedgerLabel(selectedPlanDetails.trust_status || latestWorkflow?.trust_status || 'pending')}` },
                                            { text: `Debtor org: ${selectedPlanDetails.debtor_org_name || selectedPlanDetails.debtor_org_id || 'Not linked yet'}` },
                                        ]}
                                        footer={(
                                            <Group gap="xs" mt="sm" wrap="wrap">
                                                <Badge color={trustTone(selectedPlanDetails.trust_status || latestWorkflow?.trust_status)} variant="light">
                                                    Trust {formatLedgerLabel(selectedPlanDetails.trust_status || latestWorkflow?.trust_status || 'pending')}
                                                </Badge>
                                                <Badge color={workflowTone(latestWorkflow?.workflow_stage || selectedPlanDetails.workflow_stage || selectedPlanDetails.status)} variant="light">
                                                    Stage {formatLedgerLabel(latestWorkflow?.workflow_stage || selectedPlanDetails.workflow_stage || selectedPlanDetails.status)}
                                                </Badge>
                                                <Badge color={workflowTone(lifecycleStage.key)} variant="outline">
                                                    Flow {lifecycleStage.label}
                                                </Badge>
                                            </Group>
                                        )}
                                    />
                                )}
                                sections={[
                                    {
                                        title: 'COUNTERPARTY IDENTITY',
                                        content: (
                                            <Stack gap="xs">
                                                <Group justify="space-between" align="flex-start" wrap="nowrap">
                                                    <Box style={{ minWidth: 0 }}>
                                                        <Text fw={700} size="sm">{selectedPlanDetails.payer_name || 'Debtor counterparty'}</Text>
                                                        {selectedPlanDetails.payer_phone && <Text size="xs" c="dimmed">{selectedPlanDetails.payer_phone}</Text>}
                                                        {selectedPlanDetails.payer_email && <Text size="xs" c="dimmed">{selectedPlanDetails.payer_email}</Text>}
                                                    </Box>
                                                    <Badge color="blue" variant="light">Debtor View</Badge>
                                                </Group>
                                                <Group gap="xs" wrap="wrap">
                                                    <Badge size="sm" color="indigo" variant="light">Collector {selectedPlanDetails.buyer_tenant_id || 'Unknown'}</Badge>
                                                    <Badge size="sm" color="grape" variant="light">Debtor {selectedPlanDetails.debtor_org_name || selectedPlanDetails.debtor_org_id || 'Pending link'}</Badge>
                                                    {latestWorkflow?.source_payment_link_id && (
                                                        <Badge size="sm" color="cyan" variant="light">Link {String(latestWorkflow.source_payment_link_id).slice(0, 10)}…</Badge>
                                                    )}
                                                </Group>
                                            </Stack>
                                        ),
                                    },
                                    {
                                        title: 'PROOF & CONSENT STATE',
                                        content: (
                                            <Stack gap="xs">
                                                <Text size="sm">{lifecycleStage.description}</Text>
                                                <Group gap="xs" wrap="wrap">
                                                    <Badge color={workflowTone(lifecycleStage.key)} variant="light">{lifecycleStage.label}</Badge>
                                                    {latestWorkflow?.required_proof_type && (
                                                        <Badge color="orange" variant="light">Proof {latestWorkflow.required_proof_type}</Badge>
                                                    )}
                                                    {latestWorkflow?.required_action && (
                                                        <Badge color="blue" variant="outline">Next {formatLedgerLabel(latestWorkflow.required_action)}</Badge>
                                                    )}
                                                </Group>
                                                <Text size="xs" c="dimmed">Request: {selectedPlanDetails.proof_request_id || latestWorkflow?.proof_request_id || 'Not issued'}</Text>
                                                <Text size="xs" c="dimmed">Response: {selectedPlanDetails.proof_response_id || latestWorkflow?.proof_response_id || 'Not presented'}</Text>
                                                <Text size="xs" c="dimmed">Consent: {latestWorkflow?.consent_timestamp ? dayjs(latestWorkflow.consent_timestamp).format('D MMM YYYY HH:mm') : 'Awaiting consent proof'}</Text>
                                                {latestWorkflow?.required_proof_type && !latestWorkflow?.proof_response_id && (
                                                    <Button
                                                        size="sm"
                                                        color="indigo"
                                                        leftSection={<IconWallet size={16} />}
                                                        loading={creatingArProofRequest}
                                                        onClick={() => void launchArCollectionProof(String(latestWorkflow.id), {
                                                            planId: selectedPlanId,
                                                            orgTenantId: String(selectedPlanDetails.debtor_org_id || getActiveOrgId() || ''),
                                                        })}
                                                    >
                                                        {lifecycleStage.key === 'proof_requested' ? 'Resume Wallet Proof' : 'Start Wallet Proof'}
                                                    </Button>
                                                )}
                                            </Stack>
                                        ),
                                    },
                                    {
                                        title: 'CREDENTIAL CHAIN',
                                        content: (
                                            <Stack gap="xs">
                                                <Group justify="space-between" align="center" wrap="nowrap">
                                                    <Box style={{ minWidth: 0 }}>
                                                        <Text size="sm" fw={600}>Invoice VC</Text>
                                                        <Text size="xs" c="dimmed" truncate>{firstCollection?.id || 'Not attached'}</Text>
                                                    </Box>
                                                    {firstCollection?.id && (
                                                        <Button
                                                            size="xs"
                                                            variant="subtle"
                                                            onClick={() => openCredentialArtifact({
                                                                title: 'AR Invoice Credential',
                                                                credentialId: String(firstCollection.id),
                                                                credentialType: 'InvoiceVC',
                                                                status: 'issued',
                                                                issuedAt: firstCollection.created_at || null,
                                                                sourceRef: firstCollection.invoiceRef || firstCollection.id,
                                                                counterpart: selectedPlanDetails.payer_name || null,
                                                                amount: Number(firstCollection.amount || selectedPlanDetails.total_amount || 0),
                                                                currency: firstCollection.currency || selectedPlanDetails.currency || 'USD',
                                                                note: 'Instalment link and invoice evidence for this AR plan.',
                                                            })}
                                                        >
                                                            Inspect
                                                        </Button>
                                                    )}
                                                </Group>
                                                <Group justify="space-between" align="center" wrap="nowrap">
                                                    <Box style={{ minWidth: 0 }}>
                                                        <Text size="sm" fw={600}>Payment Proof</Text>
                                                        <Text size="xs" c="dimmed" truncate>{selectedPlanDetails.proof_response_id || latestWorkflow?.proof_response_id || 'Awaiting wallet presentation'}</Text>
                                                    </Box>
                                                    {(selectedPlanDetails.proof_response_id || latestWorkflow?.proof_response_id) && (
                                                        <Button
                                                            size="xs"
                                                            variant="subtle"
                                                            onClick={() => openCredentialArtifact({
                                                                title: 'Payment Proof Credential',
                                                                credentialId: String(selectedPlanDetails.proof_response_id || latestWorkflow?.proof_response_id),
                                                                credentialType: String(latestWorkflow?.required_proof_type || 'PaymentProofVC'),
                                                                status: 'verified',
                                                                issuedAt: latestWorkflow?.consent_timestamp || latestWorkflow?.updated_at || null,
                                                                sourceRef: latestWorkflow?.id || null,
                                                                counterpart: selectedPlanDetails.debtor_org_name || selectedPlanDetails.payer_name || null,
                                                                amount: Number(latestWorkflow?.amount || 0),
                                                                currency: latestWorkflow?.currency || selectedPlanDetails.currency || 'USD',
                                                                note: 'Wallet proof that unlocks the next AR settlement step.',
                                                            })}
                                                        >
                                                            Inspect
                                                        </Button>
                                                    )}
                                                </Group>
                                                <Group justify="space-between" align="center" wrap="nowrap">
                                                    <Box style={{ minWidth: 0 }}>
                                                        <Text size="sm" fw={600}>Receipt VC</Text>
                                                        <Text size="xs" c="dimmed" truncate>{selectedPlanDetails.receipt_vc_id || 'Not issued yet'}</Text>
                                                    </Box>
                                                    {selectedPlanDetails.receipt_vc_id && (
                                                        <Button
                                                            size="xs"
                                                            variant="subtle"
                                                            color="teal"
                                                            onClick={() => openCredentialArtifact({
                                                                title: 'Receipt Credential',
                                                                credentialId: String(selectedPlanDetails.receipt_vc_id),
                                                                credentialType: 'ReceiptVC',
                                                                status: 'issued',
                                                                issuedAt: selectedPlanDetails.receipt_issued_at || latestWorkflow?.updated_at || null,
                                                                sourceRef: latestWorkflow?.source_payment_link_id || null,
                                                                counterpart: selectedPlanDetails.payer_name || null,
                                                                amount: Number(selectedPlanDetails.amount_collected || 0),
                                                                currency: selectedPlanDetails.currency || 'USD',
                                                                note: 'Settlement receipt linked to the AR trust workflow.',
                                                            })}
                                                        >
                                                            Inspect
                                                        </Button>
                                                    )}
                                                </Group>
                                            </Stack>
                                        ),
                                    },
                                    {
                                        title: 'TRUST & VERIFICATION',
                                        content: (
                                            <Stack gap="xs">
                                                <Text size="sm">Current verification posture for the debtor-side AR obligation.</Text>
                                                <Group gap="xs" wrap="wrap">
                                                    <Badge color={trustTone(selectedPlanDetails.trust_status || latestWorkflow?.trust_status)} variant="light">
                                                        {formatLedgerLabel(selectedPlanDetails.trust_status || latestWorkflow?.trust_status || 'pending')}
                                                    </Badge>
                                                    <Badge color={workflowTone(latestWorkflow?.status || selectedPlanDetails.status)} variant="light">
                                                        {formatLedgerLabel(latestWorkflow?.status || selectedPlanDetails.status || 'pending')}
                                                    </Badge>
                                                </Group>
                                                <Text size="xs" c="dimmed">Required action: {formatLedgerLabel(latestWorkflow?.required_action || 'none', 'None')}</Text>
                                                <Text size="xs" c="dimmed">Required actor: {formatLedgerLabel(latestWorkflow?.required_actor_role || 'payer', 'Payer')}</Text>
                                                <Text size="xs" c="dimmed">Workflow transaction: {latestWorkflow?.id || 'Not attached yet'}</Text>
                                            </Stack>
                                        ),
                                    },
                                    {
                                        title: 'LEDGER TRAIL',
                                        content: (
                                            <DetailTimelineList
                                                items={buildArWorkflowTimelineItems(workflowTransactions)}
                                                emptyText="No cross-org workflow transaction is attached to this plan yet."
                                            />
                                        ),
                                    },
                                    ...(selectedPlanDetails.status === 'active'
                                        ? [{
                                            title: 'PLAN ACTIONS',
                                            content: (
                                                <Stack gap="xs">
                                                    <Button color="orange" variant="light" fullWidth onClick={async () => {
                                                        const token = getPreferredToken() || getWalletToken();
                                                        if (!token) return;
                                                        try {
                                                            await api.patch(`/api/finance/ar/plans/${selectedPlanId}/dispute`, {}, {
                                                                headers: { Authorization: `Bearer ${token}` },
                                                            });
                                                            notifications.show({ title: 'Dispute raised', message: 'Plan marked as disputed. Counterparty will be notified.', color: 'orange' });
                                                            setSelectedPlanId(null);
                                                            setSelectedPlanDetails(null);
                                                            void fetchLinks();
                                                        } catch (err: any) {
                                                            notifications.show({ title: 'Dispute failed', message: err.response?.data?.message ?? err.message, color: 'red' });
                                                        }
                                                    }}>
                                                        Raise Dispute
                                                    </Button>
                                                    <Button color="red" fullWidth onClick={async () => {
                                                        const token = getPreferredToken() || getWalletToken();
                                                        if (!token) return;
                                                        try {
                                                            await api.patch(`/api/finance/ar/plans/${selectedPlanId}/cancel`, {}, {
                                                                headers: { Authorization: `Bearer ${token}` },
                                                            });
                                                            notifications.show({ title: 'Plan cancelled', message: 'Instalment plan has been cancelled.', color: 'green' });
                                                            setSelectedPlanId(null);
                                                            setSelectedPlanDetails(null);
                                                            void fetchLinks();
                                                        } catch (err: any) {
                                                            notifications.show({ title: 'Cancel failed', message: err.message, color: 'red' });
                                                        }
                                                    }}>
                                                        Cancel Plan
                                                    </Button>
                                                </Stack>
                                            ),
                                        }]
                                        : []),
                                ]}
                                auditItems={installmentItems}
                                auditEmptyText="No instalment activity recorded yet"
                            />
                        )
                    })()
                ) : (
                    <Alert color="red">Failed to load plan</Alert>
                )}
            </Drawer>

            <Modal
                opened={Boolean(selectedCredentialArtifact)}
                onClose={() => setSelectedCredentialArtifact(null)}
                title={selectedCredentialArtifact?.title || 'Credential Artifact'}
                centered
            >
                {selectedCredentialArtifact && (
                    <Stack gap="sm">
                        <Group gap="xs" wrap="wrap">
                            <Badge color={trustTone(selectedCredentialArtifact.status)} variant="light">
                                {formatLedgerLabel(selectedCredentialArtifact.status)}
                            </Badge>
                            <Badge color="indigo" variant="outline">{selectedCredentialArtifact.credentialType}</Badge>
                        </Group>
                        <Paper p="sm" radius="md" withBorder>
                            <Text size="xs" c="dimmed" fw={600}>CREDENTIAL ID</Text>
                            <Code block>{selectedCredentialArtifact.credentialId}</Code>
                        </Paper>
                        <Stack gap={4}>
                            {selectedCredentialArtifact.counterpart && <Text size="sm">Counterparty: {selectedCredentialArtifact.counterpart}</Text>}
                            {selectedCredentialArtifact.sourceRef && <Text size="sm">Source Ref: {selectedCredentialArtifact.sourceRef}</Text>}
                            {selectedCredentialArtifact.issuedAt && <Text size="sm">Issued: {dayjs(selectedCredentialArtifact.issuedAt).format('D MMM YYYY HH:mm')}</Text>}
                            {selectedCredentialArtifact.amount != null && (
                                <Text size="sm">Amount: {fmt(selectedCredentialArtifact.amount, selectedCredentialArtifact.currency || 'USD')}</Text>
                            )}
                            {selectedCredentialArtifact.note && <Text size="sm" c="dimmed">{selectedCredentialArtifact.note}</Text>}
                        </Stack>
                    </Stack>
                )}
            </Modal>
        </AppShellMobile>
    );
}
