import React, { useState, useContext } from 'react';
import QRCode from 'react-qr-code';
import Button from '@/components/walt/button/Button';
import { EnvContext } from '@/pages/_app';
import { sendToWebWallet } from '@/utils/sendToWebWallet';
import nextConfig from '@/next.config';

interface CredentialOfferCardProps {
    /** The credential offer URI for QR code */
    offerUri: string;
    /** Optional deep link for mobile wallets */
    deepLink?: string;
    /** Credential type name for display */
    credentialType?: string;
    /** Optional claims to preview */
    claims?: Record<string, any>;
    /** Optional callback when offer is accepted */
    onAccepted?: () => void;
    /** Optional calculation results for finance workflows */
    financeResult?: {
        subtotal?: number | string;
        taxAmount?: number | string;
        discountAmount?: number | string;
        grandTotal?: number | string;
    };
    /** Whether to show compact view */
    compact?: boolean;
}

const BUTTON_COPY_TEXT_DEFAULT = 'Copy offer URL';
const BUTTON_COPY_TEXT_COPIED = 'Copied!';

/**
 * Unified Credential Offer Card Component
 * 
 * Displays credential offers consistently across all issuance flows:
 * - GenericVC issuance
 * - Quote/Invoice/Receipt workflows
 * - Any other VC issuance
 * 
 * Features:
 * - QR code display
 * - Copy to clipboard
 * - Open in web wallet
 * - Optional finance calculation display
 */
export default function CredentialOfferCard({
    offerUri,
    deepLink,
    credentialType = 'Credential',
    claims,
    onAccepted,
    financeResult,
    compact = false,
}: CredentialOfferCardProps) {
    const env = useContext(EnvContext);
    const [copyText, setCopyText] = useState(BUTTON_COPY_TEXT_DEFAULT);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(deepLink || offerUri);
            setCopyText(BUTTON_COPY_TEXT_COPIED);
            setTimeout(() => setCopyText(BUTTON_COPY_TEXT_DEFAULT), 3000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    const handleOpenWallet = () => {
        const walletUrl = env?.NEXT_PUBLIC_WALLET || nextConfig.publicRuntimeConfig?.NEXT_PUBLIC_WALLET as string;
        if (walletUrl) {
            sendToWebWallet(walletUrl, 'api/siop/initiateIssuance', offerUri);
        }
        onAccepted?.();
    };

    return (
        <div className={`bg-white rounded-lg shadow-lg p-6 ${compact ? 'max-w-sm' : 'max-w-md'} mx-auto`}>
            {/* Header */}
            <h3 className="text-xl font-bold text-gray-900 text-center mb-2">
                {credentialType}
            </h3>
            <p className="text-sm text-gray-500 text-center mb-4">
                Scan to claim your credential
            </p>

            {/* QR Code */}
            <div className="flex justify-center mb-6">
                <div className="bg-white p-4 border border-gray-200 rounded-lg shadow-sm">
                    <QRCode
                        value={deepLink || offerUri}
                        size={compact ? 160 : 200}
                        viewBox="0 0 256 256"
                    />
                </div>
            </div>

            {/* Claims Preview (if provided) */}
            {claims && Object.keys(claims).length > 0 && !compact && (
                <div className="bg-gray-50 rounded-lg p-4 mb-4">
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">Credential Claims</h4>
                    <dl className="space-y-1 text-sm">
                        {Object.entries(claims).slice(0, 5).map(([key, value]) => (
                            <div key={key} className="flex justify-between">
                                <dt className="text-gray-500">{key}:</dt>
                                <dd className="font-mono text-gray-900 truncate max-w-[150px]">
                                    {String(value)}
                                </dd>
                            </div>
                        ))}
                    </dl>
                </div>
            )}

            {/* Finance Result (for Quote/Invoice/Receipt) */}
            {financeResult && (
                <div className="bg-green-50 border border-green-100 rounded-lg p-4 mb-4">
                    <h4 className="text-sm font-semibold text-green-800 mb-2">Calculation</h4>
                    <dl className="space-y-1 text-sm">
                        {financeResult.subtotal && (
                            <div className="flex justify-between">
                                <dt className="text-gray-600">Subtotal:</dt>
                                <dd className="font-mono">{financeResult.subtotal}</dd>
                            </div>
                        )}
                        {financeResult.taxAmount && (
                            <div className="flex justify-between">
                                <dt className="text-gray-600">Tax:</dt>
                                <dd className="font-mono">{financeResult.taxAmount}</dd>
                            </div>
                        )}
                        {financeResult.discountAmount && (
                            <div className="flex justify-between">
                                <dt className="text-gray-600">Discount:</dt>
                                <dd className="font-mono text-green-600">-{financeResult.discountAmount}</dd>
                            </div>
                        )}
                        {financeResult.grandTotal && (
                            <div className="flex justify-between font-bold border-t pt-1 mt-1">
                                <dt className="text-gray-700">Total:</dt>
                                <dd className="font-mono">{financeResult.grandTotal}</dd>
                            </div>
                        )}
                    </dl>
                </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button style="link" onClick={handleCopy}>
                    {copyText}
                </Button>
                <Button onClick={handleOpenWallet}>
                    Open Web Wallet
                </Button>
            </div>

            {/* Deep Link (for mobile) */}
            {deepLink && (
                <div className="mt-4 text-center">
                    <a
                        href={deepLink}
                        className="text-sm text-primary-600 hover:underline"
                    >
                        Open in Mobile Wallet
                    </a>
                </div>
            )}
        </div>
    );
}
