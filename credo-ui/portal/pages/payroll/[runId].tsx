import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import Link from 'next/link';
import {
    ArrowLeftIcon,
    DocumentCheckIcon,
    CheckCircleIcon,
    ClockIcon,
    CurrencyDollarIcon,
    BuildingLibraryIcon,
    UserIcon
} from '@heroicons/react/24/outline';

// Credentis brand colors
const BRAND = {
    curious: '#2188CA',
    linkWater: '#D0E6F3',
    viking: '#6FB4DC',
    cornflower: '#88C4E3',
    dark: '#0A3D5C',
};

interface Payslip {
    id: string;
    employeeId: string;
    period: string;
    grossAmount: number;
    netAmount: number;
    currency: string;
    deductions: {
        nssa: number;
        paye: number;
        aids_levy: number;
        other: number;
    };
    payslipVcId?: string;
    status: string;
}

interface PayrollRun {
    id: string;
    period: string;
    status: string;
    totalGross: number;
    totalNet: number;
    totalNssa?: number;
    totalPaye?: number;
    totalAidsLevy?: number;
    runVcId?: string;
    createdAt: string;
}

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
    const styles: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
        completed: { bg: 'bg-green-100', text: 'text-green-800', icon: <CheckCircleIcon className="h-4 w-4" /> },
        draft: { bg: 'bg-gray-100', text: 'text-gray-800', icon: <ClockIcon className="h-4 w-4" /> },
        issued: { bg: 'bg-blue-100', text: 'text-blue-800', icon: <DocumentCheckIcon className="h-4 w-4" /> },
        pending: { bg: 'bg-orange-100', text: 'text-orange-800', icon: <ClockIcon className="h-4 w-4" /> },
    };
    const style = styles[status] || styles.pending;
    return (
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}>
            {style.icon}
            {status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
    );
};

export default function PayrollRunDetailPage() {
    const router = useRouter();
    const { runId } = router.query;
    const [run, setRun] = useState<PayrollRun | null>(null);
    const [payslips, setPayslips] = useState<Payslip[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);

    useEffect(() => {
        if (runId) {
            fetchRunDetails();
        }
    }, [runId]);

    const fetchRunDetails = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`http://localhost:3000/api/payroll/runs/${runId}`);
            const data = await res.json();
            setRun(data.run);
            setPayslips(data.payslips || []);
        } catch (error) {
            console.error('Failed to fetch run details:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleIssuePayslips = async () => {
        setIsProcessing(true);
        try {
            const res = await fetch(`http://localhost:3000/api/payroll/runs/${runId}/issue`, {
                method: 'POST'
            });
            if (res.ok) {
                fetchRunDetails();
            }
        } catch (error) {
            console.error('Failed to issue payslips:', error);
        } finally {
            setIsProcessing(false);
        }
    };

    const formatCurrency = (amount: number, currency: string = 'USD') => {
        return new Intl.NumberFormat('en-US', { 
            style: 'currency', 
            currency, 
            minimumFractionDigits: 2 
        }).format(amount);
    };

    if (isLoading) {
        return (
            <Layout title="Loading...">
                <div className="flex items-center justify-center min-h-screen">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: BRAND.curious }}></div>
                </div>
            </Layout>
        );
    }

    if (!run) {
        return (
            <Layout title="Not Found">
                <div className="text-center py-12">
                    <h2 className="text-xl font-semibold text-gray-700">Payroll run not found</h2>
                    <Link href="/payroll" className="mt-4 inline-flex items-center" style={{ color: BRAND.curious }}>
                        <ArrowLeftIcon className="h-5 w-5 mr-1" />
                        Back to Payroll
                    </Link>
                </div>
            </Layout>
        );
    }

    const totalDeductions = (run.totalGross || 0) - (run.totalNet || 0);

    return (
        <Layout title={`Payroll Run ${run.period}`}>
            <div className="px-4 sm:px-6 lg:px-8 py-6">
                {/* Header */}
                <div className="mb-8">
                    <Link href="/payroll" className="inline-flex items-center text-sm mb-4 hover:underline" style={{ color: BRAND.curious }}>
                        <ArrowLeftIcon className="h-4 w-4 mr-1" />
                        Back to Payroll
                    </Link>
                    <div className="sm:flex sm:items-center sm:justify-between">
                        <div>
                            <h1 className="text-3xl font-bold flex items-center gap-3" style={{ color: BRAND.dark }}>
                                Payroll Run: {run.period}
                                <StatusBadge status={run.status} />
                            </h1>
                            <p className="mt-2 text-sm text-gray-500">
                                Created {new Date(run.createdAt).toLocaleString()}
                            </p>
                        </div>
                        {run.status === 'draft' && (
                            <button
                                onClick={handleIssuePayslips}
                                disabled={isProcessing}
                                className="mt-4 sm:mt-0 inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium text-white transition-all hover:shadow-md disabled:opacity-50"
                                style={{ backgroundColor: BRAND.curious }}
                            >
                                <DocumentCheckIcon className="h-5 w-5 mr-2" />
                                {isProcessing ? 'Issuing...' : 'Issue PayslipVCs'}
                            </button>
                        )}
                    </div>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    {/* Gross Pay */}
                    <div className="rounded-xl p-6 shadow-sm" style={{ backgroundColor: BRAND.linkWater }}>
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg" style={{ backgroundColor: BRAND.curious }}>
                                <CurrencyDollarIcon className="h-6 w-6 text-white" />
                            </div>
                            <div>
                                <p className="text-sm font-medium" style={{ color: BRAND.dark }}>Total Gross</p>
                                <p className="text-2xl font-bold" style={{ color: BRAND.curious }}>{formatCurrency(run.totalGross)}</p>
                            </div>
                        </div>
                    </div>

                    {/* Net Pay */}
                    <div className="rounded-xl p-6 shadow-sm" style={{ backgroundColor: BRAND.linkWater }}>
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-green-500">
                                <CurrencyDollarIcon className="h-6 w-6 text-white" />
                            </div>
                            <div>
                                <p className="text-sm font-medium" style={{ color: BRAND.dark }}>Total Net</p>
                                <p className="text-2xl font-bold text-green-600">{formatCurrency(run.totalNet)}</p>
                            </div>
                        </div>
                    </div>

                    {/* Deductions */}
                    <div className="rounded-xl p-6 shadow-sm" style={{ backgroundColor: BRAND.linkWater }}>
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-orange-500">
                                <BuildingLibraryIcon className="h-6 w-6 text-white" />
                            </div>
                            <div>
                                <p className="text-sm font-medium" style={{ color: BRAND.dark }}>Total Deductions</p>
                                <p className="text-2xl font-bold text-orange-600">{formatCurrency(totalDeductions)}</p>
                            </div>
                        </div>
                    </div>

                    {/* Employee Count */}
                    <div className="rounded-xl p-6 shadow-sm" style={{ backgroundColor: BRAND.linkWater }}>
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg" style={{ backgroundColor: BRAND.viking }}>
                                <UserIcon className="h-6 w-6 text-white" />
                            </div>
                            <div>
                                <p className="text-sm font-medium" style={{ color: BRAND.dark }}>Employees</p>
                                <p className="text-2xl font-bold" style={{ color: BRAND.dark }}>{payslips.length}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Statutory Breakdown */}
                <div className="rounded-xl shadow-sm p-6 mb-8 bg-white border border-gray-200">
                    <h2 className="text-lg font-semibold mb-4" style={{ color: BRAND.dark }}>Statutory Deductions Breakdown</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="p-4 rounded-lg" style={{ backgroundColor: BRAND.linkWater }}>
                            <div className="flex justify-between items-center">
                                <span className="text-sm font-medium" style={{ color: BRAND.dark }}>NSSA (4.5%)</span>
                                <span className="font-semibold" style={{ color: BRAND.curious }}>{formatCurrency(run.totalNssa || 0)}</span>
                            </div>
                        </div>
                        <div className="p-4 rounded-lg" style={{ backgroundColor: BRAND.linkWater }}>
                            <div className="flex justify-between items-center">
                                <span className="text-sm font-medium" style={{ color: BRAND.dark }}>PAYE (Tax)</span>
                                <span className="font-semibold" style={{ color: BRAND.curious }}>{formatCurrency(run.totalPaye || 0)}</span>
                            </div>
                        </div>
                        <div className="p-4 rounded-lg" style={{ backgroundColor: BRAND.linkWater }}>
                            <div className="flex justify-between items-center">
                                <span className="text-sm font-medium" style={{ color: BRAND.dark }}>AIDS Levy (3%)</span>
                                <span className="font-semibold" style={{ color: BRAND.curious }}>{formatCurrency(run.totalAidsLevy || 0)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* PayrollRunVC Card */}
                {run.runVcId && (
                    <div className="rounded-xl shadow-sm p-6 mb-8 border-2" style={{ borderColor: BRAND.curious, backgroundColor: 'white' }}>
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg" style={{ backgroundColor: BRAND.curious }}>
                                <DocumentCheckIcon className="h-6 w-6 text-white" />
                            </div>
                            <div>
                                <h3 className="font-semibold" style={{ color: BRAND.dark }}>PayrollRunVC Issued</h3>
                                <p className="text-sm font-mono text-gray-500">{run.runVcId}</p>
                            </div>
                            <CheckCircleIcon className="h-8 w-8 text-green-500 ml-auto" />
                        </div>
                    </div>
                )}

                {/* Payslips Table */}
                <div className="rounded-xl shadow ring-1 ring-black ring-opacity-5 overflow-hidden">
                    <div className="px-6 py-4" style={{ backgroundColor: BRAND.linkWater }}>
                        <h2 className="text-lg font-semibold" style={{ color: BRAND.dark }}>Individual Payslips</h2>
                    </div>
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-gray-600">ID</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-gray-600">Gross</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-gray-600">NSSA</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-gray-600">PAYE</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-gray-600">AIDS Levy</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-gray-600">Net</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-gray-600">Status</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-gray-600">PayslipVC</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {payslips.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-6 py-12 text-center text-sm text-gray-500">
                                        No payslips in this run.
                                    </td>
                                </tr>
                            ) : (
                                payslips.map((slip) => (
                                    <tr key={slip.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 text-sm font-mono text-gray-600">
                                            {slip.id.substring(0, 12)}...
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-700">
                                            {formatCurrency(slip.grossAmount, slip.currency)}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500">
                                            {formatCurrency(slip.deductions?.nssa || 0, slip.currency)}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500">
                                            {formatCurrency(slip.deductions?.paye || 0, slip.currency)}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500">
                                            {formatCurrency(slip.deductions?.aids_levy || 0, slip.currency)}
                                        </td>
                                        <td className="px-6 py-4 text-sm font-semibold" style={{ color: BRAND.curious }}>
                                            {formatCurrency(slip.netAmount, slip.currency)}
                                        </td>
                                        <td className="px-6 py-4">
                                            <StatusBadge status={slip.status} />
                                        </td>
                                        <td className="px-6 py-4 text-sm">
                                            {slip.payslipVcId ? (
                                                <span className="inline-flex items-center gap-1 text-green-600">
                                                    <CheckCircleIcon className="h-4 w-4" />
                                                    <span className="font-mono text-xs">{slip.payslipVcId.substring(0, 8)}...</span>
                                                </span>
                                            ) : (
                                                <span className="text-gray-400">—</span>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </Layout>
    );
}
