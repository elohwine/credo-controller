import React, { useContext, useEffect, useState } from 'react';
import Head from 'next/head';
import axios from 'axios';
import { EnvContext } from '@/pages/_app';
import WorkflowList from '@/components/workflows/WorkflowList';
import DynamicForm from '@/components/workflows/DynamicForm';
import Button from '@/components/walt/button/Button';
import CredentialOfferCard from '@/components/credential/CredentialOfferCard';

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

                // Get root token (simplified auth for demo)
                const rootTokenRes = await axios.post(
                    `${credoBackend}/agent/token`,
                    {},
                    { headers: { Authorization: apiKey } }
                );
                const rootToken = rootTokenRes.data.token;

                // Fetch workflows
                const response = await axios.get(`${credoBackend}/workflows`, {
                    headers: { Authorization: `Bearer ${rootToken}` },
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
        <>
            <Head>
                <title>Workflows - Credo Portal</title>
            </Head>

            <div className="min-h-screen bg-gray-50">
                <header className="bg-white shadow-sm border-b border-gray-200">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                        <h1 className="text-3xl font-bold text-gray-900">Issuance Workflows</h1>
                        <p className="mt-2 text-sm text-gray-600">
                            Select a workflow to start an issuance process
                        </p>
                    </div>
                </header>

                <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    {isLoading ? (
                        <div className="text-center py-12">Loading workflows...</div>
                    ) : selectedWorkflow ? (
                        <div className="bg-white rounded-lg shadow-lg p-6 max-w-2xl mx-auto">
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-2xl font-bold text-gray-900">{selectedWorkflow.name}</h2>
                                <Button onClick={() => { setSelectedWorkflow(null); setResult(null); setError(null); }} style="secondary">
                                    Back to List
                                </Button>
                            </div>

                            <p className="text-gray-600 mb-6">{selectedWorkflow.description}</p>

                            {!result ? (
                                <DynamicForm
                                    schema={selectedWorkflow.inputSchema}
                                    onSubmit={handleExecute}
                                    isLoading={isExecuting}
                                />
                            ) : (
                                <div className="text-center">
                                    <h3 className="text-lg font-bold text-green-800 mb-4">Workflow Executed Successfully!</h3>

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
                                        <div className="bg-green-50 border border-green-200 rounded-lg p-6 max-w-md mx-auto">
                                            <h4 className="font-semibold text-gray-700 border-b pb-2 mb-4">Calculation Result</h4>
                                            <div className="grid grid-cols-2 gap-2 text-sm">
                                                <span className="text-gray-600">Subtotal:</span>
                                                <span className="font-mono">{result.finance.subtotal}</span>
                                                <span className="text-gray-600">Tax:</span>
                                                <span className="font-mono">{result.finance.taxAmount}</span>
                                                <span className="text-gray-600 font-bold">Total:</span>
                                                <span className="font-bold font-mono">{result.finance.grandTotal}</span>
                                            </div>
                                        </div>
                                    )}

                                    <div className="mt-6">
                                        <Button onClick={() => setResult(null)}>Run Again</Button>
                                    </div>
                                </div>
                            )}

                            {error && (
                                <div className="mt-6 bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
                                    {error}
                                </div>
                            )}
                        </div>
                    ) : (
                        <WorkflowList workflows={workflows} onSelect={setSelectedWorkflow} />
                    )}
                </main>
            </div>
        </>
    );
}
