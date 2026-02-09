import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import Head from 'next/head';
import axios from 'axios';

import { TrustChainStepper } from '../../components/trust/TrustChainStepper';

interface VerificationResult {
    vcId: string;
    vcType: string;
    status: 'valid' | 'invalid' | 'revoked' | 'expired' | 'not_found';
    issuer?: string;
    issuanceDate?: string;
    subject?: any;
}

export default function VerifyPage() {
    const router = useRouter();
    const { vcId } = router.query;
    const [result, setResult] = useState<VerificationResult | null>(null);
    const [chainData, setChainData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const backend = process.env.NEXT_PUBLIC_CREDO_BACKEND || 'http://localhost:3000';

    useEffect(() => {
        if (vcId) {
            verifyCredential(vcId as string);
        }
    }, [vcId]);

    async function verifyCredential(id: string) {
        try {
            const res = await axios.get(`${backend}/api/verify/${id}`);
            setResult(res.data);
            
            // If it's valid, try fetching audit chain for context
            // In a real app, we check if type includes 'PaymentReceipt'
            // For MVP, we just try fetching.
            try {
                const chainRes = await axios.get(`${backend}/api/audit/chain/${id}`);
                if(chainRes.data && chainRes.data.chain) {
                    setChainData(chainRes.data);
                }
            } catch(e) {
                console.log('No audit chain available or fetch failed', e);
            }
            
        } catch (err: any) {
            setError('Verification failed. The credential may not exist or the service is unavailable.');
        } finally {
            setLoading(false);
        }
    }

    if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><span style={{ color: '#2188CA' }}>Verifying...</span></div>;
    if (error) return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-red-600">{error}</div>;
    if (!result) return null;

    const isSuccess = result.status === 'valid';

    return (
        <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8 bg-gray-50">
            <Head>
                <title>Credential Verification - Credentis</title>
            </Head>
            <div className="max-w-7xl mx-auto">
                <div className={`grid grid-cols-1 ${chainData ? 'lg:grid-cols-3 gap-8' : ''}`}>
                    
                    {/* Main Credential Card */}
                    <div className={`${chainData ? 'lg:col-span-2' : 'max-w-2xl mx-auto w-full'}`}>
                        <div className="bg-white rounded-xl shadow-lg border-t-4 overflow-hidden" style={{ borderTopColor: '#2188CA' }}>
                            <div className="p-8">
                                <div className="flex items-center justify-between mb-6">
                                    <h2 className="text-2xl font-bold text-gray-900">Verification Result</h2>
                                    <span className={`px-3 py-1 rounded-full text-sm font-semibold ${isSuccess ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                        }`}>
                                        {isSuccess ? 'VALID' : result.status.toUpperCase()}
                                    </span>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-500">Credential ID</label>
                                        <div className="mt-1 text-sm text-gray-900 font-mono">{result.vcId}</div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-500">Type</label>
                                        <div className="mt-1 text-sm text-gray-900">{result.vcType}</div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-500">Issued On</label>
                                        <div className="mt-1 text-sm text-gray-900">
                                            {result.issuanceDate ? new Date(result.issuanceDate).toLocaleDateString() : 'Unknown'}
                                        </div>
                                    </div>

                                    {result.subject && (
                                        <div className="border-t pt-4 mt-4">
                                            <h3 className="text-lg font-medium text-gray-900 mb-3">Credential Data</h3>
                                            <div className="p-4 rounded text-sm space-y-2" style={{ backgroundColor: '#D0E6F3' }}>
                                                {Object.entries(result.subject).map(([key, value]: [string, any]) => (
                                                    <div key={key} className="flex justify-between">
                                                        <span className="text-gray-500 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}:</span>
                                                        <span className="text-gray-900 font-medium text-right">
                                                            {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <div className="border-t pt-4 mt-8 flex items-center justify-center text-gray-400 text-sm">
                                        <span className="mr-2">Verified by</span>
                                        <span className="font-bold text-gray-600">Credo Trust Engine</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Sidebar Trust Chain */}
                    {chainData && (
                        <div className="lg:col-span-1 mt-8 lg:mt-0">
                            <TrustChainStepper chain={chainData.chain} verified={chainData.verified} />
                        </div>
                    )}
                
                </div>
            </div>
        </div>
    );
}
