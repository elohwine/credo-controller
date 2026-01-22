import React, { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import { BRAND } from '@/lib/theme';
import { NoSymbolIcon, CheckCircleIcon, ShieldExclamationIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';

interface Credential {
    id: string;
    type: string;
    subjectId: string;
    issuer: string;
    issuedAt: string;
    revoked: boolean;
    revokedAt?: string;
}

export default function RevocationPage() {
    const [credentials, setCredentials] = useState<Credential[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [showRevokeModal, setShowRevokeModal] = useState(false);
    const [selectedCredential, setSelectedCredential] = useState<Credential | null>(null);

    useEffect(() => {
        fetchCredentials();
    }, []);

    const fetchCredentials = async () => {
        try {
            const res = await fetch('http://localhost:3000/api/revocation/credentials');
            const data = await res.json();
            setCredentials(data.credentials || []);
        } catch (error) {
            console.error('Failed to fetch credentials:', error);
        }
    };

    const handleRevoke = async (credentialId: string) => {
        try {
            const res = await fetch(`http://localhost:3000/api/revocation/revoke/${credentialId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: 'Manual revocation' })
            });
            if (res.ok) {
                setShowRevokeModal(false);
                setSelectedCredential(null);
                fetchCredentials();
            }
        } catch (error) {
            console.error('Failed to revoke credential:', error);
        }
    };

    const filteredCredentials = credentials.filter(c =>
        c.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.subjectId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.type.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <Layout title="Credential Revocation">
            <div className="px-4 sm:px-6 lg:px-8 py-6">
                <div className="sm:flex sm:items-center sm:justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-bold" style={{ color: BRAND.dark }}>Credential Revocation</h1>
                        <p className="mt-2 text-sm" style={{ color: BRAND.curious }}>
                            Manage and revoke issued credentials
                        </p>
                    </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 mb-8">
                    {[
                        { label: 'Total Credentials', value: credentials.length, icon: <CheckCircleIcon className="h-6 w-6" /> },
                        { label: 'Active', value: credentials.filter(c => !c.revoked).length, icon: <ShieldExclamationIcon className="h-6 w-6" /> },
                        { label: 'Revoked', value: credentials.filter(c => c.revoked).length, icon: <NoSymbolIcon className="h-6 w-6" /> },
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

                <div className="mb-6 relative">
                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search by ID, subject, or type..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="block w-full pl-10 rounded-lg border-gray-300 shadow-sm focus:ring-2 sm:text-sm"
                        style={{ borderColor: BRAND.viking }}
                    />
                </div>

                <div className="overflow-hidden rounded-xl shadow ring-1 ring-black ring-opacity-5">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead style={{ backgroundColor: BRAND.linkWater }}>
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-semibold uppercase" style={{ color: BRAND.dark }}>Credential ID</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold uppercase" style={{ color: BRAND.dark }}>Type</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold uppercase" style={{ color: BRAND.dark }}>Subject</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold uppercase" style={{ color: BRAND.dark }}>Issued At</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold uppercase" style={{ color: BRAND.dark }}>Status</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold uppercase" style={{ color: BRAND.dark }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white">
                            {filteredCredentials.map((cred) => (
                                <tr key={cred.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 text-sm font-mono" style={{ color: BRAND.dark }}>{cred.id.substring(0, 16)}...</td>
                                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{cred.type}</td>
                                    <td className="px-6 py-4 text-sm text-gray-500">{cred.subjectId}</td>
                                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{new Date(cred.issuedAt).toLocaleDateString()}</td>
                                    <td className="whitespace-nowrap px-6 py-4 text-sm">
                                        {cred.revoked ? (
                                            <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-800">
                                                <NoSymbolIcon className="h-4 w-4 mr-1" />
                                                Revoked
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-800">
                                                <CheckCircleIcon className="h-4 w-4 mr-1" />
                                                Active
                                            </span>
                                        )}
                                    </td>
                                    <td className="whitespace-nowrap px-6 py-4 text-sm">
                                        {!cred.revoked && (
                                            <button
                                                onClick={() => {
                                                    setSelectedCredential(cred);
                                                    setShowRevokeModal(true);
                                                }}
                                                className="rounded-lg px-3 py-1.5 text-sm font-medium text-white transition-all hover:shadow-md"
                                                style={{ backgroundColor: '#DC2626' }}
                                            >
                                                Revoke
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {showRevokeModal && selectedCredential && (
                    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-[100]">
                        <div className="bg-white rounded-lg p-6 max-w-md w-full">
                            <h3 className="text-lg font-medium text-red-900 mb-4 flex items-center">
                                <NoSymbolIcon className="h-6 w-6 mr-2 text-red-600" />
                                Revoke Credential
                            </h3>
                            <p className="text-sm text-gray-700 mb-4">
                                Are you sure you want to revoke this credential? This action cannot be undone.
                            </p>
                            <dl className="space-y-2 mb-6 bg-gray-50 p-4 rounded">
                                <div>
                                    <dt className="text-xs font-medium text-gray-500">Type</dt>
                                    <dd className="text-sm text-gray-900">{selectedCredential.type}</dd>
                                </div>
                                <div>
                                    <dt className="text-xs font-medium text-gray-500">Subject</dt>
                                    <dd className="text-sm text-gray-900">{selectedCredential.subjectId}</dd>
                                </div>
                            </dl>
                            <div className="flex justify-end space-x-3">
                                <button
                                    onClick={() => {
                                        setShowRevokeModal(false);
                                        setSelectedCredential(null);
                                    }}
                                    className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => handleRevoke(selectedCredential.id)}
                                    className="rounded-md border border-transparent bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700"
                                >
                                    Revoke
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </Layout>
    );
}
