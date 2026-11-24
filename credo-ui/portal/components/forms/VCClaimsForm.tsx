import React from 'react';
import { NativeSelect, Stack, Text, TextInput, Textarea } from '@mantine/core';

export type ClaimsSchema = {
    type?: string;
    title?: string;
    description?: string;
    format?: string;
    enum?: Array<string | number | boolean>;
    properties?: Record<string, ClaimsSchema>;
    required?: string[];
};

// Credential-type-specific field schemas tailored for Zimbabwean market
export const CredentialSchemas: Record<string, Array<{
    key: string;
    label: string;
    placeholder: string;
    type: 'text' | 'email' | 'date' | 'number' | 'textarea';
    required?: boolean;
}>> = {
    // Generic ID Credential - for identity verification
    'GenericIDCredential': [
        { key: 'fullName', label: 'Full Name', placeholder: 'e.g., Tendai Moyo', type: 'text', required: true },
        { key: 'nationalId', label: 'National ID Number', placeholder: 'e.g., 63-123456-A-42', type: 'text', required: true },
        { key: 'dateOfBirth', label: 'Date of Birth', placeholder: 'YYYY-MM-DD', type: 'date' },
        { key: 'gender', label: 'Gender', placeholder: 'Male / Female / Other', type: 'text' },
        { key: 'address', label: 'Physical Address', placeholder: 'e.g., 123 Samora Machel Ave, Harare', type: 'text' },
        { key: 'phoneNumber', label: 'Phone Number', placeholder: 'e.g., +263 77 123 4567', type: 'text' },
    ],

    // Payment Receipt - for e-commerce and mobile money
    'PaymentReceipt': [
        { key: 'transactionId', label: 'Transaction ID', placeholder: 'e.g., TXN-2024-001', type: 'text', required: true },
        { key: 'amount', label: 'Amount (USD)', placeholder: 'e.g., 125.00', type: 'number', required: true },
        { key: 'currency', label: 'Currency', placeholder: 'USD / ZWL', type: 'text', required: true },
        { key: 'merchantName', label: 'Merchant Name', placeholder: 'e.g., OK Zimbabwe', type: 'text', required: true },
        { key: 'ecocashRef', label: 'EcoCash Reference', placeholder: 'e.g., MP241223.1234.A12345', type: 'text' },
        { key: 'paymentMethod', label: 'Payment Method', placeholder: 'EcoCash / Innbucks / Bank Transfer', type: 'text' },
        { key: 'paymentDate', label: 'Payment Date', placeholder: 'YYYY-MM-DD', type: 'date' },
    ],

    // Open Badge - for education and training
    'OpenBadge': [
        { key: 'achievementName', label: 'Achievement Name', placeholder: 'e.g., Microsoft Azure Fundamentals', type: 'text', required: true },
        { key: 'recipientName', label: 'Recipient Name', placeholder: 'Full Name', type: 'text', required: true },
        { key: 'issuerName', label: 'Issuer Organization', placeholder: 'e.g., Harare Institute of Technology', type: 'text', required: true },
        { key: 'criteria', label: 'Criteria', placeholder: 'Requirements met for this badge', type: 'textarea' },
        { key: 'evidenceUrl', label: 'Evidence URL', placeholder: 'https://...', type: 'text' },
        { key: 'issuanceDate', label: 'Issue Date', placeholder: 'YYYY-MM-DD', type: 'date' },
        { key: 'expiryDate', label: 'Expiry Date (optional)', placeholder: 'YYYY-MM-DD', type: 'date' },
    ],

    // EHR Summary - for health records
    'EHRSummary': [
        { key: 'patientName', label: 'Patient Name', placeholder: 'Full Name', type: 'text', required: true },
        { key: 'nhifNumber', label: 'NHIF Number', placeholder: 'National Health Insurance Number', type: 'text' },
        { key: 'visitDate', label: 'Visit Date', placeholder: 'YYYY-MM-DD', type: 'date', required: true },
        { key: 'diagnosis', label: 'Diagnosis', placeholder: 'Primary diagnosis', type: 'text', required: true },
        { key: 'practitioner', label: 'Healthcare Practitioner', placeholder: 'Dr. Name', type: 'text' },
        { key: 'facility', label: 'Healthcare Facility', placeholder: 'e.g., Parirenyatwa Hospital', type: 'text' },
        { key: 'notes', label: 'Clinical Notes', placeholder: 'Additional notes', type: 'textarea' },
    ],

    // Cart Snapshot - for e-commerce
    'CartSnapshotVC': [
        { key: 'cartId', label: 'Cart ID', placeholder: 'e.g., CART-2024-001', type: 'text', required: true },
        { key: 'customerName', label: 'Customer Name', placeholder: 'Full Name', type: 'text', required: true },
        { key: 'totalAmount', label: 'Total Amount', placeholder: 'e.g., 250.00', type: 'number', required: true },
        { key: 'currency', label: 'Currency', placeholder: 'USD', type: 'text' },
        { key: 'itemCount', label: 'Number of Items', placeholder: 'e.g., 5', type: 'number' },
        { key: 'description', label: 'Items Description', placeholder: 'Brief summary of items', type: 'textarea' },
    ],

    // Invoice - for billing
    'InvoiceVC': [
        { key: 'invoiceNumber', label: 'Invoice Number', placeholder: 'e.g., INV-2024-001', type: 'text', required: true },
        { key: 'customerName', label: 'Customer Name', placeholder: 'Full Name', type: 'text', required: true },
        { key: 'amount', label: 'Amount Due', placeholder: 'e.g., 500.00', type: 'number', required: true },
        { key: 'currency', label: 'Currency', placeholder: 'USD', type: 'text' },
        { key: 'dueDate', label: 'Due Date', placeholder: 'YYYY-MM-DD', type: 'date' },
        { key: 'description', label: 'Description', placeholder: 'Invoice description', type: 'textarea' },
    ],

    // Receipt
    'ReceiptVC': [
        { key: 'receiptNumber', label: 'Receipt Number', placeholder: 'e.g., REC-2024-001', type: 'text', required: true },
        { key: 'customerName', label: 'Customer Name', placeholder: 'Full Name', type: 'text', required: true },
        { key: 'amount', label: 'Amount Paid', placeholder: 'e.g., 500.00', type: 'number', required: true },
        { key: 'currency', label: 'Currency', placeholder: 'USD', type: 'text' },
        { key: 'paymentDate', label: 'Payment Date', placeholder: 'YYYY-MM-DD', type: 'date' },
        { key: 'paymentMethod', label: 'Payment Method', placeholder: 'EcoCash / Card / Bank', type: 'text' },
    ],
};

// Default fallback schema for unknown credential types
const DefaultSchema = [
    { key: 'name', label: 'Name', placeholder: 'Enter name', type: 'text' as const },
    { key: 'description', label: 'Description', placeholder: 'Enter description', type: 'textarea' as const },
];

type Props = {
    credentialType: string;
    claims: Record<string, any>;
    onChange: (claims: Record<string, any>) => void;
    schema?: ClaimsSchema;
};

const DESCRIPTION_BELOW: ('label' | 'input' | 'description' | 'error')[] = ['label', 'input', 'description', 'error'];

export default function VCClaimsForm({ credentialType, claims, onChange, schema: registeredSchema }: Props) {
    if (registeredSchema) {
        return (
            <Stack gap="md">
                {Object.entries(registeredSchema.properties || {}).filter(([key]) => key !== 'id').map(([key, field]) => {
                    const label = field.title || key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (letter) => letter.toUpperCase());
                    const required = registeredSchema.required?.includes(key);
                    const inputId = `credential-claim-${key}`;
                    const update = (value: unknown) => {
                        const next = { ...claims };
                        if (value === undefined || value === '') delete next[key];
                        else next[key] = value;
                        onChange(next);
                    };
                    const common = {
                        id: inputId,
                        label,
                        required,
                        description: field.description,
                        inputWrapperOrder: DESCRIPTION_BELOW,
                    };
                    if (field.type === 'object' || field.type === 'array') {
                        return (
                            <Textarea
                                key={key}
                                {...common}
                                aria-label={label}
                                rows={3}
                                styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)' } }}
                                defaultValue={claims[key] === undefined ? '' : JSON.stringify(claims[key], null, 2)}
                                placeholder={field.type === 'array' ? 'JSON array' : 'JSON object'}
                                onChange={(event) => {
                                    const input = event.currentTarget;
                                    if (!input.value.trim()) {
                                        input.setCustomValidity('');
                                        update(undefined);
                                        return;
                                    }
                                    try {
                                        const value: unknown = JSON.parse(input.value);
                                        if (field.type === 'array' ? !Array.isArray(value) : !value || typeof value !== 'object' || Array.isArray(value)) {
                                            throw new Error(`Enter a JSON ${field.type}.`);
                                        }
                                        input.setCustomValidity('');
                                        update(value);
                                    } catch {
                                        input.setCustomValidity(`Enter a valid JSON ${field.type}.`);
                                        input.reportValidity();
                                    }
                                }}
                            />
                        );
                    }
                    if (field.type === 'boolean') {
                        return (
                            <NativeSelect
                                key={key}
                                {...common}
                                value={claims[key] === undefined ? '' : String(claims[key])}
                                data={[{ value: '', label: 'Select' }, { value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]}
                                onChange={(event) => update(event.currentTarget.value === '' ? undefined : event.currentTarget.value === 'true')}
                            />
                        );
                    }
                    if (field.enum) {
                        return (
                            <NativeSelect
                                key={key}
                                {...common}
                                value={claims[key] === undefined ? '' : String(claims[key])}
                                data={[{ value: '', label: 'Select' }, ...field.enum.map((value) => ({ value: String(value), label: String(value) }))]}
                                onChange={(event) => {
                                    const selected = event.currentTarget.value;
                                    update(field.enum?.find((value) => String(value) === selected));
                                }}
                            />
                        );
                    }
                    return (
                        <TextInput
                            key={key}
                            {...common}
                            value={claims[key] ?? ''}
                            type={field.type === 'number' || field.type === 'integer' ? 'number' : field.format === 'date' ? 'date' : field.format === 'email' ? 'email' : 'text'}
                            step={field.type === 'integer' ? 1 : 'any'}
                            placeholder={field.format === 'date-time' ? 'YYYY-MM-DDTHH:mm:ssZ' : undefined}
                            onChange={(event) => update(event.target.value === '' ? undefined : field.type === 'number' || field.type === 'integer' ? Number(event.target.value) : event.target.value)}
                        />
                    );
                })}
            </Stack>
        );
    }
    // Get schema for this record type (or default)
    const schema = CredentialSchemas[credentialType] || DefaultSchema;

    const handleFieldChange = (key: string, value: string) => {
        onChange({
            ...claims,
            [key]: value,
        });
    };

    return (
        <Stack gap="md">
            <Text size="sm" c="dimmed">
                Enter the details for <Text span fw={600}>{credentialType}</Text>
            </Text>

            {schema.map((field) =>
                field.type === 'textarea' ? (
                    <Textarea
                        key={field.key}
                        label={field.label}
                        withAsterisk={'required' in field && !!field.required}
                        value={claims[field.key] || ''}
                        onChange={(e) => handleFieldChange(field.key, e.target.value)}
                        placeholder={field.placeholder}
                        rows={3}
                    />
                ) : (
                    <TextInput
                        key={field.key}
                        label={field.label}
                        withAsterisk={'required' in field && !!field.required}
                        type={field.type}
                        value={claims[field.key] || ''}
                        onChange={(e) => handleFieldChange(field.key, e.target.value)}
                        placeholder={field.placeholder}
                    />
                )
            )}

            {schema.length === 0 && (
                <Text c="dimmed" ta="center" py="md">
                    No specific fields defined for this record type.
                </Text>
            )}
        </Stack>
    );
}
