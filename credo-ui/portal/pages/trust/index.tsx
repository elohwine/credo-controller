import React, { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import { ShieldCheckIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

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

export default function TrustPage() {
    const [merchantId, setMerchantId] = useState('merchant-001');
    const [trustScore, setTrustScore] = useState<TrustScore | null>(null);
    const [escalations, setEscalations] = useState<Escalation[]>([]);
    const [showEscalationModal, setShowEscalationModal] = useState(false);
    const [newEscalation, setNewEscalation] = useState({
        merchantId: '',
        reason: 'fraud',
        description: ''
    });

    useEffect(() => {
        if (merchantId) {
            fetchTrustScore(merchantId);
        }
        fetchEscalations();
    }, [merchantId]);

    const fetchTrustScore = async (id: string) => {
        try {
            const res = await fetch(`http://localhost:3000/api/trust/${id}`);
            const data = await res.json();
            setTrustScore(data);
        } catch (error) {
            console.error('Failed to fetch trust score:', error);
        }
    };

    const fetchEscalations = async () => {
        try {
            const res = await fetch('http://localhost:3000/api/regulator/escalations');
            const data = await res.json();
            setEscalations(data.escalations || []);
        } catch (error) {
            console.error('Failed to fetch escalations:', error);
        }
    };

    const handleCreateEscalation = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch('http://localhost:3000/api/regulator/escalations', {
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
        }
    };

    const getBadgeColor = (badge: string) => {
        switch (badge) {
            case 'gold': return 'bg-yellow-100 text-yellow-800';
            case 'silver': return 'bg-gray-100 text-gray-800';
            case 'bronze': return 'bg-orange-100 text-orange-800';
            default: return 'bg-blue-100 text-blue-800';
        }
    };

    return (
        <Layout title="Trust & Compliance">
            <div className="px-4 sm:px-6 lg:px-8">
                <div className="sm:flex sm:items-center">
                    <div className="sm:flex-auto">
                        <h1 className="text-2xl font-semibold text-gray-900">Trust Engine</h1>
                        <p className="mt-2 text-sm text-gray-700">
                            Monitor merchant trust scores and manage escalations
                        </p>
                    </div>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
                    {/* Trust Score Card */}
                    <div className="bg-white shadow rounded-lg p-6">
                        <h3 className="text-lg font-medium text-gray-900 mb-4">Trust Score</h3>
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">Merchant ID</label>
                            <input
                                type="text"
                                value={merchantId}
                                onChange={(e) => setMerchantId(e.target.value)}
                                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                            />
                        </div>

                        {trustScore && (
                            <div>
                                <div className="flex items-center justify-between mb-4">
                                    <div className="text-4xl font-bold text-indigo-600">{trustScore.score}</div>
                                    <span className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${getBadgeColor(trustScore.badge)}`}>
                                        {trustScore.badge.toUpperCase()}
                                    </span>
                                </div>
                                <div className="space-y-3">
                                    {trustScore.drivers.map((driver, idx) => (
                                        <div key={idx}>
                                            <div className="flex justify-between text-sm mb-1">
                                                <span className="text-gray-700">{driver.name}</span>
                                                <span className="text-gray-500">{driver.score}%</span>
                                            </div>
                                            <div className="w-full bg-gray-200 rounded-full h-2">
                                                <div
                                                    className="bg-indigo-600 h-2 rounded-full"
                                                    style={{ width: `${driver.score}%` }}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Escalations */}
                    <div className="bg-white shadow rounded-lg p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-medium text-gray-900">Escalations</h3>
                            <button
                                onClick={() => setShowEscalationModal(true)}
                                className="inline-flex items-center rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500"
                            >
                                <ExclamationTriangleIcon className="h-5 w-5 mr-2" />
                                Report Issue
                            </button>
                        </div>

                        <div className="space-y-3">
                            {escalations.slice(0, 5).map((esc) => (
                                <div key={esc.id} className="border-l-4 border-red-400 bg-red-50 p-4">
                                    <div className="flex justify-between">
                                        <p className="text-sm font-medium text-red-800">{esc.merchantId}</p>
                                        <span className="text-xs text-red-600">{esc.reason}</span>
                                    </div>
                                    <p className="text-xs text-red-600 mt-1">{new Date(esc.createdAt).toLocaleString()}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {showEscalationModal && (
                    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
                        <div className="bg-white rounded-lg p-6 max-w-md w-full">
                            <h3 className="text-lg font-medium text-gray-900 mb-4">Create Escalation</h3>
                            <form onSubmit={handleCreateEscalation} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Merchant ID</label>
                                    <input type="text" required value={newEscalation.merchantId} onChange={e => setNewEscalation({...newEscalation, merchantId: e.target.value})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Reason</label>
                                    <select value={newEscalation.reason} onChange={e => setNewEscalation({...newEscalation, reason: e.target.value})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm">
                                        <option value="fraud">Fraud</option>
                                        <option value="non_delivery">Non-Delivery</option>
                                        <option value="counterfeit">Counterfeit</option>
                                        <option value="dispute">Dispute</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Description</label>
                                    <textarea required value={newEscalation.description} onChange={e => setNewEscalation({...newEscalation, description: e.target.value})} rows={4} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                                </div>
                                <div className="flex justify-end space-x-3">
                                    <button type="button" onClick={() => setShowEscalationModal(false)} className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
                                    <button type="submit" className="rounded-md border border-transparent bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700">Submit</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </Layout>
    );
}
