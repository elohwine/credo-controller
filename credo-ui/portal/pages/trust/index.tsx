import React, { useState, useEffect, useContext } from 'react';
import Layout from '@/components/Layout';
import { ShieldCheckIcon, ExclamationTriangleIcon, StarIcon, ChartBarIcon } from '@heroicons/react/24/outline';
import { BRAND } from '@/lib/theme';
import { EnvContext } from '@/pages/_app';


interface TrustScore {
    merchantId: string;
    score: number;
    badge: string;
    drivers: Array<{
        name: string;
        score: number;
        weight: number;
        icon: string;
    }>;
}

interface Escalation {
    id: string;
    merchantId: string;
    reason: string;
    status: string;
    createdAt: string;
}

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
    const styles: Record<string, { bg: string; text: string }> = {
        open: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
        investigating: { bg: 'bg-blue-100', text: 'text-blue-800' },
        resolved: { bg: 'bg-green-100', text: 'text-green-800' },
        closed: { bg: 'bg-gray-100', text: 'text-gray-800' },
    };
    const style = styles[status] || styles.open;
    return (
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}>
            {status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
    );
};

export default function TrustPage() {
    const [merchantId, setMerchantId] = useState('merchant-001');
    const [trustScore, setTrustScore] = useState<TrustScore | null>(null);
    const [escalations, setEscalations] = useState<Escalation[]>([]);
    const [showEscalationModal, setShowEscalationModal] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [newEscalation, setNewEscalation] = useState({
        merchantId: '',
        reason: 'fraud',
        description: ''
    });

    const env = useContext(EnvContext);
    const backendUrl = env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';


    useEffect(() => {
        if (merchantId) {
            fetchTrustScore(merchantId);
        }
        fetchEscalations();
    }, [merchantId]);

    const fetchTrustScore = async (id: string) => {
        setIsLoading(true);
        try {
            const res = await fetch(`${backendUrl}/api/trust/${id}`);
            const data = await res.json();
            setTrustScore(data);
        } catch (error) {
            console.error('Failed to fetch trust score:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchEscalations = async () => {
        try {
            const res = await fetch(`${backendUrl}/api/regulator/escalations`);
            const data = await res.json();
            setEscalations(data.escalations || []);
        } catch (error) {
            console.error('Failed to fetch escalations:', error);
        }
    };

    const handleCreateEscalation = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            const res = await fetch(`${backendUrl}/api/regulator/escalations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newEscalation)
            });
            if (res.ok) {
                setShowEscalationModal(false);
                fetchEscalations();
                setNewEscalation({ merchantId: '', reason: 'fraud', description: '' });
            }
        } catch (error) {
            console.error('Failed to create escalation:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const getBadgeStyle = (badge: string) => {
        switch (badge) {
            case 'gold': return { bg: '#FEF3C7', text: '#92400E', border: '#F59E0B' };
            case 'silver': return { bg: '#F3F4F6', text: '#374151', border: '#9CA3AF' };
            case 'bronze': return { bg: '#FED7AA', text: '#9A3412', border: '#F97316' };
            default: return { bg: BRAND.linkWater, text: BRAND.dark, border: BRAND.curious };
        }
    };

    const stats = [
        { label: 'Open Escalations', value: escalations.filter(e => e.status === 'open').length, icon: <ExclamationTriangleIcon className="h-6 w-6" /> },
        { label: 'Investigating', value: escalations.filter(e => e.status === 'investigating').length, icon: <ShieldCheckIcon className="h-6 w-6" /> },
        { label: 'Resolved', value: escalations.filter(e => e.status === 'resolved').length, icon: <StarIcon className="h-6 w-6" /> },
        { label: 'Total Cases', value: escalations.length, icon: <ChartBarIcon className="h-6 w-6" /> },
    ];

    return (
        <Layout title="Trust & Compliance">
            <div className="px-4 sm:px-6 lg:px-8 py-6">
                {/* Header */}
                <div className="sm:flex sm:items-center sm:justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-bold" style={{ color: BRAND.dark }}>Trust & Compliance</h1>
                        <p className="mt-2 text-sm" style={{ color: BRAND.curious }}>Monitor merchant trust scores and manage regulatory escalations</p>
                    </div>
                    <div className="mt-4 sm:mt-0">
                        <button
                            onClick={() => setShowEscalationModal(true)}
                            className="inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium text-white transition-all hover:shadow-md bg-red-600 hover:bg-red-700"
                        >
                            <ExclamationTriangleIcon className="h-5 w-5 mr-2" />
                            Report Issue
                        </button>
                    </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-8">
                    {stats.map((stat, idx) => (
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

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    {/* Trust Score Card */}
                    <div className="rounded-xl shadow-sm overflow-hidden" style={{ backgroundColor: 'white' }}>
                        <div className="px-6 py-4" style={{ backgroundColor: BRAND.linkWater }}>
                            <h3 className="text-lg font-semibold" style={{ color: BRAND.dark }}>Trust Score Lookup</h3>
                        </div>
                        <div className="p-6">
                            <div className="mb-4">
                                <label className="block text-sm font-medium mb-2" style={{ color: BRAND.dark }}>Merchant ID</label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={merchantId}
                                        onChange={(e) => setMerchantId(e.target.value)}
                                        className="flex-1 rounded-lg border-2 px-3 py-2 text-sm"
                                        style={{ borderColor: BRAND.viking }}
                                    />
                                    <button
                                        onClick={() => fetchTrustScore(merchantId)}
                                        className="rounded-lg px-4 py-2 text-sm font-medium text-white"
                                        style={{ backgroundColor: BRAND.curious }}
                                    >
                                        Lookup
                                    </button>
                                </div>
                            </div>

                            {trustScore && (
                                <div className="mt-6">
                                    <div className="flex items-center justify-between mb-6">
                                        <div className="text-5xl font-bold" style={{ color: BRAND.curious }}>{trustScore.score}</div>
                                        <span
                                            className="inline-flex rounded-full px-4 py-1 text-sm font-semibold border-2"
                                            style={{
                                                backgroundColor: getBadgeStyle(trustScore.badge).bg,
                                                color: getBadgeStyle(trustScore.badge).text,
                                                borderColor: getBadgeStyle(trustScore.badge).border,
                                            }}
                                        >
                                            {(trustScore.badge || 'N/A').toUpperCase()}
                                        </span>
                                    </div>
                                    <div className="space-y-4">
                                        {trustScore.drivers.map((driver, idx) => (
                                            <div key={idx}>
                                                <div className="flex justify-between text-sm mb-1">
                                                    <span style={{ color: BRAND.dark }}>{driver.name}</span>
                                                    <span style={{ color: BRAND.curious }}>{driver.score}%</span>
                                                </div>
                                                <div className="w-full rounded-full h-2" style={{ backgroundColor: BRAND.linkWater }}>
                                                    <div
                                                        className="h-2 rounded-full transition-all"
                                                        style={{ width: `${driver.score}%`, backgroundColor: BRAND.curious }}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Recent Escalations */}
                    <div className="rounded-xl shadow-sm overflow-hidden" style={{ backgroundColor: 'white' }}>
                        <div className="px-6 py-4 flex items-center justify-between" style={{ backgroundColor: BRAND.linkWater }}>
                            <h3 className="text-lg font-semibold" style={{ color: BRAND.dark }}>Recent Escalations</h3>
                        </div>
                        <div className="p-6">
                            {escalations.length === 0 ? (
                                <p className="text-center text-gray-500 py-8">No escalations yet</p>
                            ) : (
                                <div className="space-y-3">
                                    {escalations.slice(0, 5).map((esc) => (
                                        <div key={esc.id} className="border-l-4 rounded-r-lg p-4" style={{ borderColor: BRAND.curious, backgroundColor: BRAND.linkWater }}>
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <p className="text-sm font-medium" style={{ color: BRAND.dark }}>{esc.merchantId}</p>
                                                    <p className="text-xs mt-1" style={{ color: BRAND.curious }}>{esc.reason}</p>
                                                </div>
                                                <StatusBadge status={esc.status} />
                                            </div>
                                            <p className="text-xs text-gray-500 mt-2">{new Date(esc.createdAt).toLocaleString()}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Escalation Modal */}
                {showEscalationModal && (
                    <div className="fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-[100]">
                        <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2 rounded-lg bg-red-100">
                                    <ExclamationTriangleIcon className="h-6 w-6 text-red-600" />
                                </div>
                                <h3 className="text-xl font-semibold" style={{ color: BRAND.dark }}>Report Escalation</h3>
                            </div>
                            <form onSubmit={handleCreateEscalation} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1" style={{ color: BRAND.dark }}>Merchant ID</label>
                                    <input type="text" required value={newEscalation.merchantId} onChange={e => setNewEscalation({ ...newEscalation, merchantId: e.target.value })} className="w-full rounded-lg border-gray-300 shadow-sm" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1" style={{ color: BRAND.dark }}>Reason</label>
                                    <select value={newEscalation.reason} onChange={e => setNewEscalation({ ...newEscalation, reason: e.target.value })} className="w-full rounded-lg border-gray-300 shadow-sm">
                                        <option value="fraud">Fraud</option>
                                        <option value="non_delivery">Non-Delivery</option>
                                        <option value="counterfeit">Counterfeit</option>
                                        <option value="dispute">Dispute</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1" style={{ color: BRAND.dark }}>Description</label>
                                    <textarea required value={newEscalation.description} onChange={e => setNewEscalation({ ...newEscalation, description: e.target.value })} rows={4} className="w-full rounded-lg border-gray-300 shadow-sm" />
                                </div>
                                <div className="p-4 rounded-lg bg-red-50">
                                    <p className="text-sm text-red-800"><strong>Note:</strong> Escalations are reviewed by the compliance team and may impact merchant trust scores.</p>
                                </div>
                                <div className="flex justify-end gap-3 pt-4">
                                    <button type="button" onClick={() => setShowEscalationModal(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
                                    <button type="submit" disabled={isLoading} className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 bg-red-600 hover:bg-red-700">{isLoading ? 'Submitting...' : 'Submit Escalation'}</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </Layout>
    );
}
