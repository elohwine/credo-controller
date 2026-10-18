import React, { useState } from 'react';
import QRCode from 'react-qr-code';
import { DevicePhoneMobileIcon, ClipboardDocumentIcon } from '@heroicons/react/24/outline';
import { BRAND } from '@/lib/theme';

interface CredentialOfferCardProps {
    /** The credential offer URI for QR code */
    offerUri: string;
    /** Optional deep link for mobile wallets */
    deepLink?: string;
    /** Credential type name for display */
    credentialType?: string;
    /** Optional claims to preview */
    claims?: Record<string, any>;
    /** Opening a wallet is not evidence of acceptance. */
    onOpenWallet?: () => void;
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
    onOpenWallet,
    financeResult,
    compact = false,
}: CredentialOfferCardProps) {
    const [copyText, setCopyText] = useState(BUTTON_COPY_TEXT_DEFAULT);
    const [copyError, setCopyError] = useState<string | null>(null);

    const handleCopy = async () => {
        try {
            setCopyError(null);
            await navigator.clipboard.writeText(deepLink || offerUri);
            setCopyText(BUTTON_COPY_TEXT_COPIED);
            setTimeout(() => setCopyText(BUTTON_COPY_TEXT_DEFAULT), 3000);
        } catch (err) {
            setCopyError('Could not copy the offer URL. Select and copy the link below.');
        }
    };

    return (
        <div className={`shadow-2xl rounded-xl p-8 bg-white ${compact ? 'max-w-sm' : 'max-w-md'} mx-auto text-center`}>
            {/* Header */}
            <h3 className="text-xl font-bold text-gray-900 mb-2">
                {credentialType}
            </h3>
            <p className="text-sm text-gray-600 mb-6">
                Scan the QR code or open in your wallet
            </p>

            {/* QR Code */}
            <div className="flex justify-center mb-6">
                <QRCode
                    className="h-full max-h-[200px]"
                    value={deepLink || offerUri}
                    viewBox="0 0 256 256"
                />
            </div>

            {/* Finance Result (for Quote/Invoice/Receipt) */}
            {financeResult && (
                <div className="rounded-lg p-4 mb-6" style={{ backgroundColor: BRAND.linkWater }}>
                    <h4 className="text-sm font-semibold mb-2" style={{ color: BRAND.dark }}>Calculation</h4>
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
                                <dd className="font-mono" style={{ color: BRAND.curious }}>-{financeResult.discountAmount}</dd>
                            </div>
                        )}
                        {financeResult.grandTotal && (
                            <div className="flex justify-between font-bold border-t pt-2 mt-2">
                                <dt style={{ color: BRAND.dark }}>Total:</dt>
                                <dd className="font-mono" style={{ color: BRAND.dark }}>{financeResult.grandTotal}</dd>
                            </div>
                        )}
                    </dl>
                </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col gap-3 mb-6">
                <a
                    href={deepLink || offerUri}
                    onClick={() => onOpenWallet?.()}
                    className="inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-medium text-white transition-all hover:shadow-md"
                    style={{ backgroundColor: BRAND.curious }}
                >
                    <DevicePhoneMobileIcon className="h-5 w-5" />
                    Open in Wallet
                </a>
                <button
                    onClick={handleCopy}
                    className="inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-medium border transition-colors hover:bg-gray-50"
                    style={{ borderColor: BRAND.curious, color: BRAND.curious }}
                >
                    <ClipboardDocumentIcon className="h-5 w-5" />
                    {copyText}
                </button>
            </div>
            {copyError && <p role="alert" className="text-sm text-red-700 mb-3">{copyError}</p>}
            <details open={copyError ? true : undefined} className="text-left text-sm text-gray-600 mb-4">
                <summary className="cursor-pointer">Show offer URL</summary>
                <label>
                    Offer URL
                    <input readOnly value={deepLink || offerUri} className="w-full border rounded-md p-2 mt-1 text-sm" />
                </label>
            </details>

            {/* Credentis Footer */}
            <div className="flex flex-col items-center pt-6 border-t">
                <div className="flex flex-row gap-2 items-center text-sm" style={{ color: '#7B8794' }}>
                    <p>Secured by Credentis</p>
                    <img src="/credentis-logo.png" alt="Credentis" style={{ height: 15, width: 'auto' }} />
                </div>
            </div>
        </div>
    );
}
