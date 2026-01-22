import React, { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import { UserPlusIcon, CheckCircleIcon, ClockIcon, CheckIcon, XMarkIcon, DocumentCheckIcon, UserGroupIcon, BriefcaseIcon, DevicePhoneMobileIcon, ClipboardDocumentIcon, QrCodeIcon } from '@heroicons/react/24/outline';
import QRCode from 'react-qr-code';
import { BRAND } from '@/lib/theme';

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

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
    const styles: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
        completed: { bg: 'bg-green-100', text: 'text-green-800', icon: <CheckCircleIcon className="h-4 w-4" /> },
        in_progress: { bg: 'bg-yellow-100', text: 'text-yellow-800', icon: <ClockIcon className="h-4 w-4" /> },
        pending: { bg: 'bg-orange-100', text: 'text-orange-800', icon: <ClockIcon className="h-4 w-4" /> },
        init: { bg: 'bg-gray-100', text: 'text-gray-800', icon: <ClockIcon className="h-4 w-4" /> },
    };
    const style = styles[status] || styles.pending;
    return (
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}>
            {style.icon}
            {status.replace('_', ' ').charAt(0).toUpperCase() + status.replace('_', ' ').slice(1)}
        </span>
    );
};

export default function OnboardingPage() {
    const [cases, setCases] = useState<OnboardingCase[]>([]);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showOfferModal, setShowOfferModal] = useState(false);
    const [showReofferModal, setShowReofferModal] = useState(false);
    const [reofferUri, setReofferUri] = useState<string | null>(null);
    const [credentialOffer, setCredentialOffer] = useState<CredentialOffer | null>(null);
    const [approving, setApproving] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [newCase, setNewCase] = useState({
        employeeName: '',
        email: '',
        startDate: new Date().toISOString().split('T')[0],
        department: '',
        role: ''
    });

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';

    useEffect(() => {
        fetchOnboardingCases();
    }, []);

    const fetchOnboardingCases = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`${backendUrl}/api/onboarding/cases`);
            const data = await res.json();
            setCases(data.cases || []);
        } catch (error) {
            console.error('Failed to fetch cases:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateCase = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            const res = await fetch(`${backendUrl}/api/onboarding/cases`, {
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
        } finally {
            setIsLoading(false);
        }
    };

    const handleApprove = async (caseId: string) => {
        setApproving(caseId);
        try {
            const res = await fetch(`${backendUrl}/api/onboarding/${caseId}/approve`, {
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

    const handleReoffer = async (caseId: string) => {
        setIsLoading(true);
        try {
            const res = await fetch(`${backendUrl}/api/onboarding/${caseId}/reoffer`, {
                method: 'POST'
            });
            if (!res.ok) {
                throw new Error(`Failed to reoffer: ${res.status}`);
            }
            const data = await res.json();
            if (data.offerUri || data.credential_offer_deeplink) {
                setReofferUri(data.offerUri || data.credential_offer_deeplink);
                setShowReofferModal(true);
            }
        } catch (error) {
            console.error('Failed to reoffer credential:', error);
            alert('Failed to reoffer credential. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };


    const stats = [
        { label: 'Total Cases', value: cases.length, icon: <UserGroupIcon className="h-6 w-6" /> },
        { label: 'In Progress', value: cases.filter(c => c.status === 'in_progress').length, icon: <ClockIcon className="h-6 w-6" /> },
        { label: 'Completed', value: cases.filter(c => c.status === 'completed').length, icon: <CheckCircleIcon className="h-6 w-6" /> },
        { label: 'VCs Issued', value: cases.filter(c => c.status === 'completed').length, icon: <DocumentCheckIcon className="h-6 w-6" /> },
    ];

    return (
        <Layout title="Employee Onboarding">
            <div className="px-4 sm:px-6 lg:px-8 py-6">
                {/* Header */}
                <div className="sm:flex sm:items-center sm:justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-bold" style={{ color: BRAND.dark }}>Employee Onboarding</h1>
                        <p className="mt-2 text-sm" style={{ color: BRAND.curious }}>Manage employee onboarding workflows and issue Employment Contract VCs</p>
                    </div>
                    <div className="mt-4 sm:mt-0">
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium text-white transition-all hover:shadow-md"
                            style={{ backgroundColor: BRAND.curious }}
                        >
                            <UserPlusIcon className="h-5 w-5 mr-2" />
                            New Employee
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

                {/* Table */}
                <div className="overflow-hidden rounded-xl shadow ring-1 ring-black ring-opacity-5">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead style={{ backgroundColor: BRAND.linkWater }}>
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-semibold uppercase" style={{ color: BRAND.dark }}>Name</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold uppercase" style={{ color: BRAND.dark }}>Email</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold uppercase" style={{ color: BRAND.dark }}>Step</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold uppercase" style={{ color: BRAND.dark }}>Status</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold uppercase" style={{ color: BRAND.dark }}>Created</th>
                                <th className="px-6 py-3 text-right text-xs font-semibold uppercase" style={{ color: BRAND.dark }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white">
                            {cases.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-sm text-gray-500">
                                        {isLoading ? 'Loading...' : 'No onboarding cases yet. Click "New Employee" to start.'}
                                    </td>
                                </tr>
                            ) : cases.map((c) => (
                                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 text-sm font-medium" style={{ color: BRAND.dark }}>{c.fullName}</td>
                                    <td className="px-6 py-4 text-sm text-gray-500">{c.candidateEmail}</td>
                                    <td className="px-6 py-4 text-sm text-gray-500">{c.currentStep || 'init'}</td>
                                    <td className="px-6 py-4 text-sm"><StatusBadge status={c.status} /></td>
                                    <td className="px-6 py-4 text-sm text-gray-500">{new Date(c.createdAt).toLocaleString()}</td>
                                    <td className="px-6 py-4 text-right text-sm">
                                        {c.status !== 'completed' ? (
                                            <button
                                                onClick={() => handleApprove(c.id)}
                                                disabled={approving === c.id}
                                                className="inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 transition-all hover:shadow-md"
                                                style={{ backgroundColor: BRAND.curious }}
                                            >
                                                <DocumentCheckIcon className="h-4 w-4 mr-1" />
                                                {approving === c.id ? 'Processing...' : 'Approve & Issue VC'}
                                            </button>
                                        ) : (
                                            <div className="flex items-center justify-end gap-2">
                                                <span className="inline-flex items-center gap-1 text-green-600 font-medium">
                                                    <CheckCircleIcon className="h-4 w-4" />
                                                    Completed
                                                </span>
                                                <button
                                                    onClick={() => handleReoffer(c.id)}
                                                    disabled={isLoading}
                                                    className="inline-flex items-center gap-1 text-sm font-medium hover:underline disabled:opacity-50"
                                                    style={{ color: BRAND.curious }}
                                                    title="Reoffer credential"
                                                >
                                                    <QrCodeIcon className="h-4 w-4" />
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Create Modal */}
                {showCreateModal && (
                    <div className="fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-[100]">
                        <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2 rounded-lg" style={{ backgroundColor: BRAND.linkWater }}>
                                    <UserPlusIcon className="h-6 w-6" style={{ color: BRAND.curious }} />
                                </div>
                                <h3 className="text-xl font-semibold" style={{ color: BRAND.dark }}>Create Onboarding Case</h3>
                            </div>
                            <form onSubmit={handleCreateCase} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1" style={{ color: BRAND.dark }}>Employee Name</label>
                                    <input type="text" required value={newCase.employeeName} onChange={e => setNewCase({...newCase, employeeName: e.target.value})} className="w-full rounded-lg border-gray-300 shadow-sm" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1" style={{ color: BRAND.dark }}>Email</label>
                                    <input type="email" required value={newCase.email} onChange={e => setNewCase({...newCase, email: e.target.value})} className="w-full rounded-lg border-gray-300 shadow-sm" />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium mb-1" style={{ color: BRAND.dark }}>Department</label>
                                        <input type="text" value={newCase.department} onChange={e => setNewCase({...newCase, department: e.target.value})} className="w-full rounded-lg border-gray-300 shadow-sm" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium mb-1" style={{ color: BRAND.dark }}>Role</label>
                                        <input type="text" value={newCase.role} onChange={e => setNewCase({...newCase, role: e.target.value})} className="w-full rounded-lg border-gray-300 shadow-sm" />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1" style={{ color: BRAND.dark }}>Start Date</label>
                                    <input type="date" required value={newCase.startDate} onChange={e => setNewCase({...newCase, startDate: e.target.value})} className="w-full rounded-lg border-gray-300 shadow-sm" />
                                </div>
                                <div className="p-4 rounded-lg" style={{ backgroundColor: BRAND.linkWater }}>
                                    <p className="text-sm" style={{ color: BRAND.dark }}><strong>Note:</strong> Upon approval, an EmploymentContractVC will be issued to the employee's wallet.</p>
                                </div>
                                <div className="flex justify-end gap-3 pt-4">
                                    <button type="button" onClick={() => setShowCreateModal(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
                                    <button type="submit" disabled={isLoading} className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor: BRAND.curious }}>{isLoading ? 'Creating...' : 'Create Case'}</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Credential Offer Modal */}
                {showOfferModal && credentialOffer && (
                    <div className="fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-[100]">
                        <div className="bg-white rounded-xl p-8 max-w-md w-full mx-4 shadow-2xl text-center">
                            <h3 className="text-xl font-bold text-gray-900 mb-2">
                                Claim Your Credential
                            </h3>
                            <p className="text-sm text-gray-600 mb-6">
                                Scan the QR code or open in your wallet
                            </p>
                            <div className="flex justify-center mb-6">
                                <QRCode 
                                    className="h-full max-h-[200px]"
                                    value={credentialOffer.credential_offer_deeplink || credentialOffer.credential_offer_uri} 
                                    viewBox="0 0 256 256"
                                />
                            </div>
                            <div className="flex flex-col gap-3 mb-6">
                                <a
                                    href={credentialOffer.credential_offer_deeplink || credentialOffer.credential_offer_uri}
                                    className="inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-medium text-white transition-all hover:shadow-md"
                                    style={{ backgroundColor: BRAND.curious }}
                                >
                                    <DevicePhoneMobileIcon className="h-5 w-5" />
                                    Open in Wallet
                                </a>
                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(credentialOffer.credential_offer_deeplink || credentialOffer.credential_offer_uri);
                                        alert('Offer link copied!');
                                    }}
                                    className="inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-medium border transition-colors hover:bg-gray-50"
                                    style={{ borderColor: BRAND.curious, color: BRAND.curious }}
                                >
                                    <ClipboardDocumentIcon className="h-5 w-5" />
                                    Copy offer URL
                                </button>
                            </div>
                            <div className="flex flex-col items-center pt-6 border-t">
                                <div className="flex flex-row gap-2 items-center text-sm" style={{ color: '#7B8794' }}>
                                    <p>Secured by Credentis</p>
                                    <img src="/credentis-logo.png" alt="Credentis" style={{ height: 15, width: 'auto' }} />
                                </div>
                            </div>
                            <button
                                onClick={() => setShowOfferModal(false)}
                                className="mt-4 text-sm font-medium text-gray-500 hover:text-gray-700"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                )}

                {/* Reoffer VC Modal */}
                {showReofferModal && reofferUri && (
                    <div className="fixed inset-0 z-[100] overflow-y-auto">
                        <div className="flex min-h-full items-center justify-center p-4">
                            <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={() => setShowReofferModal(false)}></div>
                            <div className="relative bg-white rounded-xl shadow-2xl p-8 max-w-md w-full">
                                <h2 className="text-2xl font-bold mb-6" style={{ color: BRAND.dark }}>
                                    Scan to Claim Credential
                                </h2>
                                <div className="bg-white p-6 rounded-lg border-2 mb-6" style={{ borderColor: BRAND.linkWater }}>
                                    <QRCode value={reofferUri} size={200} className="mx-auto" />
                                </div>
                                <div className="space-y-3">
                                    <button
                                        onClick={() => {
                                            const deeplink = reofferUri.replace('openid-credential-offer://?credential_offer_uri=', 'credentis://offer?uri=');
                                            window.location.href = deeplink;
                                        }}
                                        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-white font-medium"
                                        style={{ backgroundColor: BRAND.curious }}
                                    >
                                        <DevicePhoneMobileIcon className="h-5 w-5" />
                                        Open in Wallet
                                    </button>
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText(reofferUri);
                                        }}
                                        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium"
                                        style={{ color: BRAND.curious, backgroundColor: BRAND.linkWater }}
                                    >
                                        <ClipboardDocumentIcon className="h-5 w-5" />
                                        Copy offer URL
                                    </button>
                                    <button
                                        onClick={() => setShowReofferModal(false)}
                                        className="w-full px-4 py-3 rounded-lg font-medium text-gray-600 hover:bg-gray-100"
                                    >
                                        Close
                                    </button>
                                </div>
                                <div className="mt-6 pt-6 border-t border-gray-200 text-center">
                                    <p className="text-xs text-gray-500">Powered by <span className="font-semibold" style={{ color: BRAND.curious }}>Credentis</span></p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </Layout>
    );
}
