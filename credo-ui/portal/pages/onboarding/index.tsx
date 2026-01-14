import React, { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import { UserPlusIcon, CheckCircleIcon, ClockIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';
import QRCode from 'react-qr-code';

interface OnboardingCase {
    id: string;
    fullName: string;
    candidateEmail: string;
    status: string;
    currentStep: string;
    createdAt: string;
}

interface CredentialOffer {
    credential_offer_deeplink: string;
    credential_offer_uri: string;
    credentialType: string[];
}

export default function OnboardingPage() {
    const [cases, setCases] = useState<OnboardingCase[]>([]);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showOfferModal, setShowOfferModal] = useState(false);
    const [credentialOffer, setCredentialOffer] = useState<CredentialOffer | null>(null);
    const [approving, setApproving] = useState<string | null>(null);
    const [newCase, setNewCase] = useState({
        employeeName: '',
        email: '',
        startDate: new Date().toISOString().split('T')[0],
        department: '',
        role: ''
    });

    useEffect(() => {
        fetchOnboardingCases();
    }, []);

    const fetchOnboardingCases = async () => {
        try {
            const res = await fetch('http://localhost:3000/api/onboarding/cases');
            const data = await res.json();
            setCases(data.cases || []);
        } catch (error) {
            console.error('Failed to fetch cases:', error);
        }
    };

    const handleCreateCase = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch('http://localhost:3000/api/onboarding/cases', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newCase)
            });
            if (res.ok) {
                setShowCreateModal(false);
                fetchOnboardingCases();
                setNewCase({ employeeName: '', email: '', startDate: new Date().toISOString().split('T')[0], department: '', role: '' });
            }
        } catch (error) {
            console.error('Failed to create case:', error);
        }
    };

    const handleApprove = async (caseId: string) => {
        setApproving(caseId);
        try {
            const res = await fetch(`http://localhost:3000/api/onboarding/${caseId}/approve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await res.json();
            if (data.credentialOffer) {
                setCredentialOffer(data.credentialOffer);
                setShowOfferModal(true);
            }
            fetchOnboardingCases();
        } catch (error) {
            console.error('Failed to approve:', error);
        } finally {
            setApproving(null);
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'completed':
                return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
            case 'in_progress':
                return <ClockIcon className="h-5 w-5 text-yellow-500" />;
            default:
                return <ClockIcon className="h-5 w-5 text-gray-400" />;
        }
    };

    return (
        <Layout title="Employee Onboarding">
            <div className="px-4 sm:px-6 lg:px-8">
                <div className="sm:flex sm:items-center">
                    <div className="sm:flex-auto">
                        <h1 className="text-2xl font-semibold text-gray-900">Employee Onboarding</h1>
                        <p className="mt-2 text-sm text-gray-700">
                            Manage employee onboarding workflows and issue Employment Contract VCs
                        </p>
                    </div>
                    <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="inline-flex items-center justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
                        >
                            <UserPlusIcon className="h-5 w-5 mr-2" />
                            New Employee
                        </button>
                    </div>
                </div>

                <div className="mt-8 flex flex-col">
                    <div className="-my-2 -mx-4 overflow-x-auto sm:-mx-6 lg:-mx-8">
                        <div className="inline-block min-w-full py-2 align-middle md:px-6 lg:px-8">
                            <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
                                <table className="min-w-full divide-y divide-gray-300">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Name</th>
                                            <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Email</th>
                                            <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Step</th>
                                            <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Status</th>
                                            <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Created</th>
                                            <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200 bg-white">
                                        {cases.map((c) => (
                                            <tr key={c.id}>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm font-medium text-gray-900">{c.fullName}</td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{c.candidateEmail}</td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{c.currentStep || 'init'}</td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm">
                                                    <div className="flex items-center">
                                                        {getStatusIcon(c.status)}
                                                        <span className="ml-2">{c.status}</span>
                                                    </div>
                                                </td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{new Date(c.createdAt).toLocaleString()}</td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm">
                                                    {c.status !== 'completed' && (
                                                        <button
                                                            onClick={() => handleApprove(c.id)}
                                                            disabled={approving === c.id}
                                                            className="inline-flex items-center rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                                                        >
                                                            <CheckIcon className="h-4 w-4 mr-1" />
                                                            {approving === c.id ? 'Approving...' : 'Approve & Issue VC'}
                                                        </button>
                                                    )}
                                                    {c.status === 'completed' && (
                                                        <span className="text-green-600 font-medium">✓ Completed</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                        {cases.length === 0 && (
                                            <tr>
                                                <td colSpan={6} className="px-3 py-8 text-center text-gray-500">
                                                    No onboarding cases yet. Click "New Employee" to start.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Create Modal */}
                {showCreateModal && (
                    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
                        <div className="bg-white rounded-lg p-6 max-w-md w-full">
                            <h3 className="text-lg font-medium text-gray-900 mb-4">Create Onboarding Case</h3>
                            <form onSubmit={handleCreateCase} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Employee Name</label>
                                    <input type="text" required value={newCase.employeeName} onChange={e => setNewCase({...newCase, employeeName: e.target.value})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Email</label>
                                    <input type="email" required value={newCase.email} onChange={e => setNewCase({...newCase, email: e.target.value})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Department</label>
                                    <input type="text" value={newCase.department} onChange={e => setNewCase({...newCase, department: e.target.value})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Role</label>
                                    <input type="text" value={newCase.role} onChange={e => setNewCase({...newCase, role: e.target.value})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Start Date</label>
                                    <input type="date" required value={newCase.startDate} onChange={e => setNewCase({...newCase, startDate: e.target.value})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                                </div>
                                <div className="flex justify-end space-x-3">
                                    <button type="button" onClick={() => setShowCreateModal(false)} className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
                                    <button type="submit" className="rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700">Create</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Credential Offer Modal */}
                {showOfferModal && credentialOffer && (
                    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
                        <div className="bg-white rounded-lg p-6 max-w-md w-full text-center">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-medium text-gray-900">Employment Contract VC</h3>
                                <button onClick={() => setShowOfferModal(false)} className="text-gray-400 hover:text-gray-600">
                                    <XMarkIcon className="h-6 w-6" />
                                </button>
                            </div>
                            <p className="text-sm text-gray-600 mb-4">
                                Scan this QR code with the employee's wallet to claim their Employment Contract credential.
                            </p>
                            <div className="flex justify-center mb-4">
                                <QRCode 
                                    value={credentialOffer.credential_offer_deeplink || credentialOffer.credential_offer_uri} 
                                    size={200}
                                />
                            </div>
                            <p className="text-xs text-gray-500 mb-4">
                                Credential Type: {credentialOffer.credentialType?.join(', ') || 'EmploymentContractVC'}
                            </p>
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(credentialOffer.credential_offer_deeplink || credentialOffer.credential_offer_uri);
                                    alert('Offer link copied!');
                                }}
                                className="text-indigo-600 hover:text-indigo-800 text-sm"
                            >
                                Copy offer link
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </Layout>
    );
}
