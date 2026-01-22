import React, { useContext, useEffect, useState } from 'react';
import axios from 'axios';
import { EnvContext } from '@/pages/_app';
import Layout from '@/components/Layout';
import WorkflowList from '@/components/workflows/WorkflowList';
import DynamicForm from '@/components/workflows/DynamicForm';
import CredentialOfferCard from '@/components/credential/CredentialOfferCard';
import { BRAND } from '@/lib/theme';
import {
  ArrowLeftIcon,
  PlayIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  CogIcon,
  DocumentTextIcon,
  CurrencyDollarIcon,
} from '@heroicons/react/24/outline';

export default function WorkflowsPage() {
    const env = useContext(EnvContext);
    const [workflows, setWorkflows] = useState<any[]>([]);
    const [selectedWorkflow, setSelectedWorkflow] = useState<any | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isExecuting, setIsExecuting] = useState(false);
    const [result, setResult] = useState<any | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchWorkflows() {
            if (!env.NEXT_PUBLIC_VC_REPO) return;

            try {
                const credoBackend = env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000';
                const apiKey = process.env.NEXT_PUBLIC_CREDO_API_KEY || 'test-api-key-12345';

                let rootToken = '';
                try {
                    // Get root token (simplified auth for demo)
                    const rootTokenRes = await axios.post(
                        `${credoBackend}/agent/token`,
                        {},
                        { headers: { Authorization: apiKey } }
                    );
                    rootToken = rootTokenRes.data.token;
                } catch (e) {
                    console.warn('Failed to get root token for workflows, trying public access...', e);
                }

                // Fetch workflows
                const headers: any = {};
                if (rootToken) {
                    headers.Authorization = `Bearer ${rootToken}`;
                }

                const response = await axios.get(`${credoBackend}/workflows`, {
                    headers
                });

                setWorkflows(response.data || []);
                setIsLoading(false);
            } catch (err: any) {
                console.error('Error fetching workflows:', err);
                setError(err.message || 'Failed to load workflows');
                setIsLoading(false);
            }
        }

        fetchWorkflows();
    }, [env]);

    const handleExecute = async (data: any) => {
        setIsExecuting(true);
        setResult(null);
        setError(null);

        try {
            const credoBackend = env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000';
            const apiKey = process.env.NEXT_PUBLIC_CREDO_API_KEY || 'test-api-key-12345';

            // Re-auth (should be centralized in real app)
            const rootTokenRes = await axios.post(
                `${credoBackend}/agent/token`,
                {},
                { headers: { Authorization: apiKey } }
            );
            const rootToken = rootTokenRes.data.token;

            const response = await axios.post(
                `${credoBackend}/workflows/${selectedWorkflow.id}/execute`,
                data,
                { headers: { Authorization: `Bearer ${rootToken}` } }
            );

            setResult(response.data);
        } catch (err: any) {
            console.error('Error executing workflow:', err);
            setError(err.response?.data?.error || err.message || 'Execution failed');
        } finally {
            setIsExecuting(false);
        }
    };

    return (
        <Layout title="Issuance Workflows">
            <div className="px-4 sm:px-6 lg:px-8 py-6">
                {/* Header */}
                <div className="sm:flex sm:items-center sm:justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-bold" style={{ color: BRAND.dark }}>Issuance Workflows</h1>
                        <p className="mt-2 text-sm" style={{ color: BRAND.curious }}>Execute credential issuance workflows and automate verification processes</p>
                    </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 mb-8">
                    {[
                        { label: 'Available Workflows', value: workflows.length, icon: <CogIcon className="h-6 w-6" /> },
                        { label: 'Active', value: workflows.filter(w => w.status === 'active').length, icon: <PlayIcon className="h-6 w-6" /> },
                        { label: 'Categories', value: [...new Set(workflows.map(w => w.category || 'General'))].length, icon: <DocumentTextIcon className="h-6 w-6" /> },
                    ].map((stat, idx) => (
                        <div key={idx} className="relative overflow-hidden rounded-xl p-6 shadow-sm hover:shadow-md transition-all" style={{ backgroundColor: BRAND.linkWater }}>
                            <dt>
                                <div className="absolute rounded-lg p-3" style={{ backgroundColor: BRAND.curious }}>
                                    <span className="text-white">{stat.icon}</span>
                                </div>
                                <p className="ml-16 truncate text-sm font-medium" style={{ color: BRAND.dark }}>{stat.label}</p>
                            </dt>
                            <dd className="ml-16 flex items-baseline">
                                <p className="text-2xl font-semibold" style={{ color: BRAND.dark }}>{stat.value}</p>
                            </dd>
                        </div>
                    ))}
                </div>

                {isLoading ? (
                    <div className="text-center py-12 text-gray-500">
                        <ArrowPathIcon className="h-8 w-8 mx-auto mb-3 animate-spin" style={{ color: BRAND.curious }} />
                        Loading workflows...
                    </div>
                ) : selectedWorkflow ? (
                    <div className="rounded-xl shadow-sm overflow-hidden" style={{ backgroundColor: 'white' }}>
                        {/* Workflow Header */}
                        <div className="px-6 py-4" style={{ backgroundColor: BRAND.linkWater }}>
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                    <CogIcon className="h-6 w-6" style={{ color: BRAND.curious }} />
                                    <div>
                                        <h2 className="text-xl font-bold" style={{ color: BRAND.dark }}>{selectedWorkflow.name}</h2>
                                        <p className="text-sm text-gray-600">{selectedWorkflow.description}</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => { setSelectedWorkflow(null); setResult(null); setError(null); }}
                                    className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium border transition-colors hover:bg-gray-50"
                                    style={{ borderColor: BRAND.viking, color: BRAND.dark }}
                                >
                                    <ArrowLeftIcon className="h-4 w-4" />
                                    Back to List
                                </button>
                            </div>
                        </div>

                        <div className="p-6">
                            {!result ? (
                                <DynamicForm
                                    schema={selectedWorkflow.inputSchema}
                                    onSubmit={handleExecute}
                                    isLoading={isExecuting}
                                />
                            ) : (
                                <div className="text-center">
                                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4" style={{ backgroundColor: BRAND.linkWater }}>
                                        <CheckCircleIcon className="h-8 w-8 text-green-600" />
                                    </div>
                                    <h3 className="text-lg font-bold mb-4" style={{ color: BRAND.dark }}>Workflow Executed Successfully!</h3>

                                    {result.offer && (
                                        <CredentialOfferCard
                                            offerUri={result.offer.credential_offer_uri || result.offer.credentialOffer}
                                            deepLink={result.offer.credential_offer_deeplink}
                                            credentialType={result.offer.credentialType || selectedWorkflow.name}
                                            claims={result.offer.claims}
                                            financeResult={result.finance}
                                        />
                                    )}

                                    {/* Finance result without offer (calculation only) */}
                                    {!result.offer && result.finance && (
                                        <div className="rounded-xl overflow-hidden max-w-md mx-auto" style={{ backgroundColor: BRAND.linkWater }}>
                                            <div className="px-4 py-3 flex items-center gap-2" style={{ backgroundColor: BRAND.linkWater }}>
                                                <CurrencyDollarIcon className="h-5 w-5" style={{ color: BRAND.curious }} />
                                                <span className="font-semibold" style={{ color: BRAND.dark }}>Calculation Result</span>
                                            </div>
                                            <div className="p-6 bg-white">
                                                <div className="grid grid-cols-2 gap-3 text-sm">
                                                    <span className="text-gray-600">Subtotal:</span>
                                                    <span className="font-mono text-right">{result.finance.subtotal}</span>
                                                    <span className="text-gray-600">Tax:</span>
                                                    <span className="font-mono text-right">{result.finance.taxAmount}</span>
                                                    <span className="font-bold pt-2 border-t" style={{ color: BRAND.dark }}>Total:</span>
                                                    <span className="font-bold font-mono text-right pt-2 border-t" style={{ color: BRAND.curious }}>{result.finance.grandTotal}</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <div className="mt-6">
                                        <button
                                            onClick={() => setResult(null)}
                                            className="inline-flex items-center gap-2 rounded-lg px-6 py-2 text-sm font-medium text-white transition-all hover:shadow-md"
                                            style={{ backgroundColor: BRAND.curious }}
                                        >
                                            <ArrowPathIcon className="h-4 w-4" />
                                            Run Again
                                        </button>
                                    </div>
                                </div>
                            )}

                            {error && (
                                <div className="mt-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                                    <ExclamationCircleIcon className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                                    <span className="text-red-700">{error}</span>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <WorkflowList workflows={workflows} onSelect={setSelectedWorkflow} />
                )}
            </div>
        </Layout>
    );
}
