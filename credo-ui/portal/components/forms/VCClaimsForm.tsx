import React from 'react';
import InputField from '@/components/walt/forms/Input';

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
};

export default function VCClaimsForm({ credentialType, claims, onChange }: Props) {
    // Get schema for this credential type (or default)
    const schema = CredentialSchemas[credentialType] || DefaultSchema;

    const handleFieldChange = (key: string, value: string) => {
        onChange({
            ...claims,
            [key]: value,
        });
    };

    return (
        <div className="space-y-4">
            <div className="text-sm text-gray-500 mb-4">
                Enter the credential claims for <span className="font-semibold">{credentialType}</span>
            </div>

            {schema.map((field) => (
                <div key={field.key} className="flex flex-col">
                    <label className="text-sm font-medium text-gray-700 mb-1">
                        {field.label}
                        {field.required && <span className="text-red-500 ml-1">*</span>}
                    </label>

                    {field.type === 'textarea' ? (
                        <textarea
                            value={claims[field.key] || ''}
                            onChange={(e) => handleFieldChange(field.key, e.target.value)}
                            placeholder={field.placeholder}
                            className="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-primary-400 focus:border-transparent"
                            rows={3}
                        />
                    ) : (
                        <input
                            type={field.type}
                            value={claims[field.key] || ''}
                            onChange={(e) => handleFieldChange(field.key, e.target.value)}
                            placeholder={field.placeholder}
                            className="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-primary-400 focus:border-transparent"
                        />
                    )}
                </div>
            ))}

            {schema.length === 0 && (
                <div className="text-gray-500 text-center py-4">
                    No specific fields defined for this credential type.
                </div>
            )}
        </div>
    );
}
