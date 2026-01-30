<template>
    <div ref="vcCardDiv" class="credential-card" :class="{ 'detail-view': isDetailView, 'list-view': !isDetailView }">
        <template v-if="!isDetailView">
            <div class="list-card-content">
                <div class="list-icon">
                    <img v-if="issuerLogo" :src="issuerLogo" alt="Issuer" class="h-8 w-8 object-contain rounded-full bg-white/10 p-1" />
                     <div v-else class="h-8 w-8 flex items-center justify-center rounded-full bg-white/10">
                        <CreditCardIcon class="h-5 w-5 text-white" aria-hidden="true" />
                     </div>
                </div>
                <div class="list-text">
                    <div class="list-title">{{ credentialTitle }}</div>
                    <div class="list-subtitle">{{ issuerName || 'Unknown Issuer' }}</div>
                </div>
                <div class="list-badges">
                    <span v-if="isNotExpired" class="list-verified">Verified</span>
                    <span v-else class="list-expired">Expired</span>
                </div>
            </div>
        </template>

        <template v-else>
            <!-- Header: Logo + Credentis + Verified badge -->
            <div class="card-header">
                <div class="issuer-brand">
                    <img v-if="issuerLogo" :src="issuerLogo" alt="Issuer" class="brand-logo" />
                    <img v-else src="/credentis-logo.png" alt="Credentis" class="brand-logo" />
                    <span class="brand-name">{{ issuerName || 'Credentis' }}</span>
                </div>
                <div class="verified-badge" v-if="isNotExpired">Verified</div>
                <div class="expired-badge" v-else>Expired</div>
            </div>

            <!-- Title section -->
            <div class="card-title-section">
                <h2 class="card-title">{{ credentialTitle }}</h2>
                <div class="holder-name">{{ holderName }}</div>
                <div class="subtitle-row">
                    <span class="issued-info">Issued {{ issuedDateFormatted }} · {{ issuerName || 'Unknown Issuer' }}</span>
                    <span class="type-badge">{{ credentialKind }}</span>
                </div>
            </div>

            <!-- Divider -->
            <div class="card-divider"></div>

            <!-- Claims section (key-value pairs) -->
            <div class="claims-section" v-if="displayFields.length > 0">
                <div v-for="field in displayFields" :key="field.label" class="claim-row">
                    <span class="claim-label">{{ field.label }}</span>
                    <span class="claim-value">{{ formatValue(field.value) }}</span>
                </div>
            </div>

            <!-- Line items table (for Invoice/Quote) -->
            <div v-if="hasLineItems" class="line-items-section">
                <div class="line-items-divider"></div>
                <div class="line-items-header">
                    <span>Description</span>
                    <span>Amount</span>
                </div>
                <div v-for="(item, idx) in lineItems" :key="idx" class="line-item-row">
                    <span class="item-description">{{ item.description }}</span>
                    <span class="item-amount">{{ item.amount }}</span>
                </div>
                <div class="line-items-divider"></div>
                <div class="total-row" v-if="totalAmount">
                    <span class="total-label">Total</span>
                    <span class="total-value">{{ totalAmount }}</span>
                </div>
            </div>

            <!-- ID (optional) -->
            <div v-if="showId && credential?.id" class="credential-id">
                ID: {{ credential.id }}
            </div>
        </template>
    </div>
</template>

<script lang="ts" setup>
import { useCredential } from "../../composables/credential.ts";
import { getCredentialTemplate } from "../../credentials/templates";
import { computed, defineProps, ref } from "vue";
import { CreditCardIcon } from "@heroicons/vue/24/outline";

const props = defineProps({
    credential: {
        type: Object,
        required: true,
    },
    showId: {
        type: Boolean,
        required: false,
        default: false,
    },
    isDetailView: {
        type: Boolean,
        required: false,
        default: false,
    },
});

const { jwtJson: credential, titleTitelized, isNotExpired, issuerName, issuerLogo, issuanceDate } = useCredential(ref(props.credential as any));
const isDetailView = ref(props.isDetailView ?? false);
const vcCardDiv = ref<HTMLElement | null>(null);

// Debug logging removed once claims display is stable

// Template extraction
const template = computed(() => {
    if (!credential.value) return null;
    return getCredentialTemplate(credential.value);
});

// Credential kind (Identity, Invoice, Quote, Diploma, etc.)
const credentialKind = computed(() => {
    const kind = template.value?.kind || 'generic';
    return kind.charAt(0).toUpperCase() + kind.slice(1);
});

// Title: e.g. "Invoice Credential", "Identity Credential"
const credentialTitle = computed(() => {
    const kind = credentialKind.value;
    if (kind === 'Generic') return titleTitelized.value || 'Credential';
    return `${kind} Credential`;
});

// Helper to extract credentialSubject from various VC structures
// Must be defined before holderName and displayFields that use it
const getCredentialSubject = (vc: any): Record<string, any> => {
    if (!vc) return {};

    // Try multiple possible shapes:
    // - Parsed VC: { credentialSubject: { ... } }
    // - Wrapped VC: { _credential: { credentialSubject: { ... } } }
    // - Credo record: { credential: { credentialSubject: { ... } } }
    // - JWT payload: { payload: { additionalClaims: { vc: { credentialSubject: { ... } } } } }
    // - Nested vc: { vc: { credentialSubject: { ... } } }
    let subject =
        vc?.credentialSubject ??
        vc?._credential?.credentialSubject ??
        vc?.credential?.credentialSubject ??
        vc?.vc?.credentialSubject ??
        vc?.payload?.additionalClaims?.vc?.credentialSubject ??
        vc?.additionalClaims?.vc?.credentialSubject ??
        {};

    // Merge nested claims if present
    if (subject?.claims && typeof subject.claims === 'object') {
        subject = { ...subject, ...subject.claims };
    }

    // If still empty, check for claim-like properties directly on vc
    const subjectKeys = Object.keys(subject).filter((k) => k !== 'id' && k !== 'claims');
    if (subjectKeys.length === 0) {
        const potentialClaims: Record<string, any> = {};
        const skipKeys = [
            '@context',
            'type',
            'id',
            'issuer',
            'issuanceDate',
            'expirationDate',
            'credentialSubject',
            'proof',
            'issuerId',
            'credentialSubjectIds',
            '_credential',
            'credential',
            'vc',
            'jwt',
            'payload',
        ];
        for (const [key, value] of Object.entries(vc)) {
            if (!skipKeys.includes(key) && value != null) {
                potentialClaims[key] = value;
            }
        }
        if (Object.keys(potentialClaims).length > 0) {
            subject = { ...subject, ...potentialClaims };
        }
    }

    return subject;
};

// Holder name extraction
const holderName = computed(() => {
    const vc = credential.value as any;
    if (!vc) return '';
    const subject = getCredentialSubject(vc);
    // Try various common name fields
    return subject?.fullName 
        ?? subject?.holderName 
        ?? subject?.name 
        ?? subject?.customerName
        ?? vc?.holder?.name 
        ?? '';
});

// Issued date formatted
const issuedDateFormatted = computed(() => {
    if (!issuanceDate.value) return 'Unknown';
    return issuanceDate.value;
});

// Display fields (limited in preview, full in detail)
const displayFields = computed(() => {
    const vc = (credential.value as any)
        ?? (props.credential as any)?.parsedDocument
        ?? (props.credential as any)?.document
        ?? (props.credential as any);
    if (!vc) return [];

    const subject = getCredentialSubject(vc);
    
    // Detect credential type from VC types array or template
    const vcTypes = vc?.type ?? vc?.vc?.type ?? vc?._credential?.type ?? [];
    const isInvoice = template.value?.kind === 'invoice' 
        || vcTypes.some((t: string) => t?.toLowerCase().includes('invoice'))
        || subject?.invoiceId || subject?.invoiceNumber;
    const isQuote = template.value?.kind === 'quote'
        || vcTypes.some((t: string) => t?.toLowerCase().includes('quote'))
        || subject?.quoteId || subject?.quoteNumber;
    
    // For Invoice credentials (InvoiceVC)
    if (isInvoice) {
        const fields = [
            { label: 'Invoice ID', value: subject?.invoiceId ?? subject?.invoiceNumber ?? subject?.invoice_number },
            { label: 'Cart Reference', value: subject?.cartRef ?? subject?.cartReference },
            { label: 'Amount', value: formatCurrency(subject?.amount ?? subject?.total ?? subject?.totalAmount, subject?.currency) },
            { label: 'Currency', value: subject?.currency?.toUpperCase() },
            { label: 'Due Date', value: formatDate(subject?.dueDate ?? subject?.due_date) },
            { label: 'Issued', value: formatDate(subject?.timestamp ?? subject?.issuedAt) },
        ].filter(f => f.value != null && f.value !== '' && f.value !== '—');
        
        return isDetailView.value ? fields : fields.slice(0, 4);
    }
    
    // For Quote credentials
    if (isQuote) {
        const fields = [
            { label: 'Quote ID', value: subject?.quoteId ?? subject?.quoteNumber ?? subject?.quote_number },
            { label: 'Customer', value: subject?.customerName ?? subject?.customer_name ?? subject?.name },
            { label: 'Total', value: formatCurrency(subject?.totalAmount ?? subject?.total_amount ?? subject?.amount, subject?.currency) },
            { label: 'Currency', value: subject?.currency?.toUpperCase() },
            { label: 'Valid Until', value: formatDate(subject?.validUntil ?? subject?.valid_until) },
        ].filter(f => f.value != null && f.value !== '' && f.value !== '—');
        
        return isDetailView.value ? fields : fields.slice(0, 4);
    }
    
    // For other credentials, use template fields or flatten all claims
    if (template.value?.fields && template.value.fields.length > 0) {
        const fields = template.value.fields;
        return isDetailView.value ? fields : fields.slice(0, 4);
    }
    
    // Fallback: flatten all credentialSubject properties (excluding 'id' and 'claims')
    const excludeKeys = ['id', 'claims', 'type', '@context'];
    const fallbackFields: Array<{ label: string; value: any }> = [];
    
    for (const [key, value] of Object.entries(subject)) {
        if (excludeKeys.includes(key)) continue;
        if (value === null || value === undefined) continue;
        
        // Skip nested objects (except format dates)
        if (typeof value === 'object' && !Array.isArray(value)) continue;
        
        const label = key
            .replace(/([A-Z])/g, ' $1')
            .replace(/_/g, ' ')
            .trim()
            .split(' ')
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');
        
        // Format dates if they look like ISO strings
        let displayValue = value;
        if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}/)) {
            displayValue = formatDate(value);
        }
        
        fallbackFields.push({ label, value: displayValue });
    }
    
    return isDetailView.value ? fallbackFields : fallbackFields.slice(0, 4);
});

// Format currency helper
const formatCurrency = (amount: any, currency?: string): string | null => {
    if (amount == null) return null;
    const curr = currency?.toUpperCase() ?? 'USD';
    if (typeof amount === 'number') {
        return `${curr} ${amount.toFixed(2)}`;
    }
    return `${curr} ${amount}`;
};

// Format date helper
const formatDate = (dateStr: any): string | null => {
    if (!dateStr) return null;
    try {
        const date = new Date(dateStr);
        return date.toISOString().slice(0, 10);
    } catch {
        return String(dateStr);
    }
};

// Line items (for Invoice/Quote types)
const lineItems = computed(() => {
    const vc = (credential.value as any)
        ?? (props.credential as any)?.parsedDocument
        ?? (props.credential as any)?.document
        ?? (props.credential as any);
    if (!vc) return [];
    const subject = getCredentialSubject(vc);
    // Check for items (Invoice) or lines (Quote)
    const items = subject?.items ?? subject?.lines ?? subject?.lineItems ?? [];
    if (!Array.isArray(items)) return [];
    return items.map((item: any) => ({
        description: item?.description ?? item?.name ?? '—',
        amount: formatCurrency(item?.amount ?? item?.price, subject?.currency) ?? '—',
    }));
});

const hasLineItems = computed(() => {
    return lineItems.value.length > 0 && (template.value?.kind === 'invoice' || template.value?.kind === 'quote');
});

// Total amount
const totalAmount = computed(() => {
    const vc = (credential.value as any)
        ?? (props.credential as any)?.parsedDocument
        ?? (props.credential as any)?.document
        ?? (props.credential as any);
    if (!vc) return null;
    const subject = getCredentialSubject(vc);
    const amount = subject?.total ?? subject?.estimatedTotal ?? subject?.totalAmount ?? subject?.amount;
    const currency = (subject?.currency ?? 'USD').toUpperCase();
    if (amount == null) return null;
    if (typeof amount === 'number') return `${currency} ${amount.toFixed(2)}`;
    return `${currency} ${amount}`;
});

// Format value for display
const formatValue = (value: any): string => {
    if (value === null || value === undefined) return '—';
    if (Array.isArray(value)) {
        return value.map((v) => (typeof v === 'object' ? JSON.stringify(v) : String(v))).join(', ');
    }
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
};
</script>

<style scoped>

.credential-card {
    border-radius: 16px;
    width: 100%;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.credential-card.list-view {
    /* Deep glass gradient for list cards (Credentis Blue) */
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    background: linear-gradient(135deg, #10405f 0%, #2188ca 100%);
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 10px 25px -5px rgba(15, 63, 94, 0.3);
    padding: 20px 24px;
    min-height: 90px;
    color: #ffffff;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.credential-card.list-view:hover {
    transform: translateY(-2px);
    box-shadow: 0 15px 30px -5px rgba(15, 63, 94, 0.4);
}

.credential-card.detail-view {
    width: 100%;
    max-width: 100%;
    background: #FFFFFF;
    border: 1px solid #E4E7EB;
    box-shadow: 0 6px 20px rgba(15, 63, 94, 0.08);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    padding: 24px 28px;
    color: #0F3F5E;
}

.list-card-content {
    display: flex;
    align-items: center;
    gap: 14px;
}

.list-icon {
    margin-right: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.list-icon svg {
    color: #ffffff;
}

.list-text {
    flex: 1;
    min-width: 0;
}

.list-title {
    font-size: 14px;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #ffffff;
    line-height: 1.2;
}

.list-subtitle {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.9);
    margin-top: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.list-badges {
    display: flex;
    align-items: center;
    gap: 8px;
}

.list-verified,
.list-expired {
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.6);
    background: rgba(255, 255, 255, 0.2);
    color: #ffffff;
}

/* Header */
.card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
}

.issuer-brand {
    display: flex;
    align-items: center;
    gap: 10px;
}

.brand-logo {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    object-fit: contain;
    background: rgba(255, 255, 255, 0.95);
    padding: 4px;
}

.brand-name {
    font-size: 15px;
    font-weight: 600;
    color: #0F3F5E;
}

.verified-badge {
    color: #2188CA;
    font-size: 13px;
    font-weight: 500;
    padding: 4px 12px;
    border: 1px solid #2188CA;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.5);
}

.expired-badge {
    color: #7B8794;
    font-size: 13px;
    font-weight: 500;
    padding: 4px 12px;
    border: 1px solid #CBD2D9;
    border-radius: 16px;
    background: #F0F4F8;
}

/* Title section */
.card-title-section {
    margin-bottom: 16px;
}

.card-title {
    font-size: 22px;
    font-weight: 300;
    color: #0F3F5E;
    margin: 0 0 4px 0;
    letter-spacing: -0.3px;
}

.holder-name {
    font-size: 15px;
    font-weight: 600;
    color: #0F3F5E;
    margin-bottom: 4px;
}

.subtitle-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.issued-info {
    font-size: 12px;
    color: #627D98;
}

.type-badge {
    font-size: 12px;
    color: #627D98;
    font-weight: 500;
}

/* Divider */
.card-divider {
    height: 1px;
    background: linear-gradient(to right, #6FB4DC, rgba(111, 180, 220, 0.3));
    margin-bottom: 16px;
}

/* Claims */
.claims-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.claim-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
}

.claim-label {
    font-size: 13px;
    color: #627D98;
    min-width: 40%;
}

.claim-value {
    font-size: 13px;
    color: #0F3F5E;
    font-weight: 500;
    text-align: right;
    max-width: 60%;
    overflow-wrap: anywhere;
    word-break: break-word;
    white-space: normal;
}

/* Line items (Invoice/Quote) */
.line-items-section {
    margin-top: 16px;
}

.line-items-divider {
    height: 1px;
    background: #E4E7EB;
    margin: 12px 0;
}

.line-items-header {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: #627D98;
    font-weight: 500;
    padding-bottom: 8px;
    border-bottom: 1px solid #E4E7EB;
    margin-bottom: 8px;
}

.line-item-row {
    display: flex;
    justify-content: space-between;
    padding: 6px 0;
}

.item-description {
    font-size: 13px;
    color: #0F3F5E;
}

.item-amount {
    font-size: 13px;
    color: #0F3F5E;
    font-weight: 500;
}

.total-row {
    display: flex;
    justify-content: space-between;
    padding-top: 8px;
}

.total-label {
    font-size: 14px;
    color: #2188CA;
    font-weight: 500;
}

.total-value {
    font-size: 16px;
    color: #0F3F5E;
    font-weight: 700;
}

/* Credential ID */
.credential-id {
    margin-top: 12px;
    font-size: 11px;
    color: #9FB3C8;
    font-family: monospace;
}
</style>

