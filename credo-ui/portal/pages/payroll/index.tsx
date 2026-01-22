import React, { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import QRCode from 'react-qr-code';
import { 
    PlayIcon, 
    DocumentTextIcon, 
    CurrencyDollarIcon,
    CheckCircleIcon,
    ClockIcon,
    ExclamationTriangleIcon,
    ChevronRightIcon,
    BuildingLibraryIcon,
    DocumentCheckIcon,
    QrCodeIcon,
    DevicePhoneMobileIcon,
    ClipboardDocumentIcon
} from '@heroicons/react/24/outline';
import Link from 'next/link';

// Credentis brand colors
const BRAND = {
    curious: '#2188CA',
    linkWater: '#D0E6F3',
    viking: '#6FB4DC',
    cornflower: '#88C4E3',
    dark: '#0A3D5C',
};

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

interface Employee {
    id: string;
    firstName: string;
    lastName: string;
    email?: string;
    baseSalary: number;
    currency: string;
    status: string;
}

interface TaxCompliance {
    id: string;
    taxType: string;
    period: string;
    amount: number;
    currency: string;
    status: string;
    referenceNumber?: string;
    complianceVcId?: string;
}

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
    const styles: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
        completed: { bg: 'bg-green-100', text: 'text-green-800', icon: <CheckCircleIcon className="h-4 w-4" /> },
        active: { bg: 'bg-green-100', text: 'text-green-800', icon: <CheckCircleIcon className="h-4 w-4" /> },
        draft: { bg: 'bg-gray-100', text: 'text-gray-800', icon: <ClockIcon className="h-4 w-4" /> },
        processing: { bg: 'bg-yellow-100', text: 'text-yellow-800', icon: <ClockIcon className="h-4 w-4" /> },
        paid: { bg: 'bg-blue-100', text: 'text-blue-800', icon: <CurrencyDollarIcon className="h-4 w-4" /> },
        pending: { bg: 'bg-orange-100', text: 'text-orange-800', icon: <ExclamationTriangleIcon className="h-4 w-4" /> },
        filed: { bg: 'bg-blue-100', text: 'text-blue-800', icon: <DocumentCheckIcon className="h-4 w-4" /> },
        confirmed: { bg: 'bg-green-100', text: 'text-green-800', icon: <CheckCircleIcon className="h-4 w-4" /> },
    };
    const style = styles[status] || styles.pending;
    return (
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}>
            {style.icon}
            {status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
    );
};

export default function PayrollPage() {
    const [runs, setRuns] = useState<PayrollRun[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [taxRecords, setTaxRecords] = useState<TaxCompliance[]>([]);
    const [showRunModal, setShowRunModal] = useState(false);
    const [showEmployeeModal, setShowEmployeeModal] = useState(false);
    const [showReofferModal, setShowReofferModal] = useState(false);
    const [reofferUri, setReofferUri] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'runs' | 'employees' | 'compliance'>('runs');
    const [isLoading, setIsLoading] = useState(false);
    const [newRun, setNewRun] = useState({
        period: new Date().toISOString().slice(0, 7)
    });
    const [newEmployee, setNewEmployee] = useState({
        firstName: '',
        lastName: '',
        email: '',
        baseSalary: 0,
        currency: 'USD',
        nssaNumber: '',
        tin: ''
    });

    useEffect(() => {
        fetchPayrollRuns();
        fetchEmployees();
        fetchTaxCompliance();
    }, []);

    const fetchPayrollRuns = async () => {
        try {
            const res = await fetch('http://localhost:3000/api/payroll/runs');
            const data = await res.json();
            setRuns(data || []);
        } catch (error) {
            console.error('Failed to fetch payroll runs:', error);
        }
    };

    const fetchEmployees = async () => {
        try {
            const res = await fetch('http://localhost:3000/api/payroll/employees');
            const data = await res.json();
            setEmployees(data || []);
        } catch (error) {
            console.error('Failed to fetch employees:', error);
        }
    };

    const fetchTaxCompliance = async () => {
        try {
            const res = await fetch('http://localhost:3000/api/payroll/tax-compliance');
            const data = await res.json();
            setTaxRecords(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Failed to fetch tax compliance:', error);
            setTaxRecords([]);
        }
    };

    const handleRunPayroll = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            const res = await fetch('http://localhost:3000/api/payroll/runs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newRun)
            });
            if (res.ok) {
                setShowRunModal(false);
                fetchPayrollRuns();
            }
        } catch (error) {
            console.error('Failed to run payroll:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleIssuePayslips = async (runId: string) => {
        setIsLoading(true);
        try {
            const res = await fetch(`http://localhost:3000/api/payroll/runs/${runId}/issue`, {
                method: 'POST'
            });
            if (res.ok) {
                fetchPayrollRuns();
            }
        } catch (error) {
            console.error('Failed to issue payslips:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleIssueTaxCompliance = async (runId: string, taxType: string) => {
        setIsLoading(true);
        try {
            const res = await fetch(`http://localhost:3000/api/payroll/runs/${runId}/tax-compliance`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ taxType })
            });
            if (res.ok) {
                fetchTaxCompliance();
            }
        } catch (error) {
            console.error('Failed to issue tax compliance:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleReoffer = async (runId: string) => {
        setIsLoading(true);
        try {
            const res = await fetch(`http://localhost:3000/api/payroll/runs/${runId}/reoffer`, {
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

    const handleSaveEmployee = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            const res = await fetch('http://localhost:3000/api/payroll/employees', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newEmployee)
            });
            if (res.ok) {
                setShowEmployeeModal(false);
                fetchEmployees();
                setNewEmployee({ firstName: '', lastName: '', email: '', baseSalary: 0, currency: 'USD', nssaNumber: '', tin: '' });
            }
        } catch (error) {
            console.error('Failed to save employee:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const formatCurrency = (amount: number, currency: string = 'USD') => {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount);
    };

    const stats = [
        { label: 'Active Employees', value: employees.filter(e => e.status === 'active').length, icon: <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg> },
        { label: 'Payroll Runs', value: runs.length, icon: <DocumentTextIcon className="h-6 w-6" /> },
        { label: 'Total Net Paid', value: formatCurrency(runs.filter(r => r.status === 'completed').reduce((a, r) => a + r.totalNet, 0)), icon: <CurrencyDollarIcon className="h-6 w-6" /> },
        { label: 'Tax Filings', value: taxRecords.length, icon: <BuildingLibraryIcon className="h-6 w-6" /> }
    ];

    return (
        <Layout title="Payroll Management">
            <div className="px-4 sm:px-6 lg:px-8 py-6">
                {/* Header */}
                <div className="sm:flex sm:items-center sm:justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-bold" style={{ color: BRAND.dark }}>Payroll Management</h1>
                        <p className="mt-2 text-sm" style={{ color: BRAND.curious }}>Process payroll runs and issue verifiable PayslipVCs to employees</p>
                    </div>
                    <div className="mt-4 sm:mt-0 flex gap-3">
                        <button onClick={() => setShowEmployeeModal(true)} className="inline-flex items-center rounded-lg border-2 px-4 py-2 text-sm font-medium transition-all hover:shadow-md" style={{ borderColor: BRAND.curious, color: BRAND.curious, backgroundColor: 'white' }}>
                            <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                            Add Employee
                        </button>
                        <button onClick={() => setShowRunModal(true)} className="inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium text-white transition-all hover:shadow-md" style={{ backgroundColor: BRAND.curious }}>
                            <PlayIcon className="h-5 w-5 mr-2" />
                            Run Payroll
                        </button>
                    </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-8">
                    {stats.map((stat, idx) => (
                        <div key={idx} className="relative overflow-hidden rounded-xl p-6 shadow-sm hover:shadow-md transition-all" style={{ backgroundColor: BRAND.linkWater }}>
                            <dt>
                                <div className="absolute rounded-lg p-3" style={{ backgroundColor: BRAND.curious }}><span className="text-white">{stat.icon}</span></div>
                                <p className="ml-16 truncate text-sm font-medium" style={{ color: BRAND.dark }}>{stat.label}</p>
                            </dt>
                            <dd className="ml-16 flex items-baseline"><p className="text-2xl font-semibold" style={{ color: BRAND.dark }}>{stat.value}</p></dd>
                        </div>
                    ))}
                </div>

                {/* Tabs */}
                <div className="border-b border-gray-200 mb-6">
                    <nav className="-mb-px flex space-x-8">
                        {[{ id: 'runs', label: 'Payroll Runs', icon: <DocumentTextIcon className="h-5 w-5" /> }, { id: 'employees', label: 'Employees', icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg> }, { id: 'compliance', label: 'Tax Compliance', icon: <BuildingLibraryIcon className="h-5 w-5" /> }].map((tab) => (
                            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`group inline-flex items-center border-b-2 py-4 px-1 text-sm font-medium transition-colors ${activeTab === tab.id ? 'border-current' : 'border-transparent hover:border-gray-300'}`} style={{ color: activeTab === tab.id ? BRAND.curious : '#6B7280', borderColor: activeTab === tab.id ? BRAND.curious : undefined }}>
                                {tab.icon}<span className="ml-2">{tab.label}</span>
                            </button>
                        ))}
                    </nav>
                </div>

                {/* Payroll Runs Tab */}
                {activeTab === 'runs' && (
                    <div className="overflow-hidden rounded-xl shadow ring-1 ring-black ring-opacity-5">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead style={{ backgroundColor: BRAND.linkWater }}>
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase" style={{ color: BRAND.dark }}>Period</th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase" style={{ color: BRAND.dark }}>Status</th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase" style={{ color: BRAND.dark }}>Gross</th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase" style={{ color: BRAND.dark }}>Net</th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase" style={{ color: BRAND.dark }}>Deductions</th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase" style={{ color: BRAND.dark }}>RunVC</th>
                                    <th className="px-6 py-3 text-right text-xs font-semibold uppercase" style={{ color: BRAND.dark }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 bg-white">
                                {runs.length === 0 ? (
                                    <tr><td colSpan={7} className="px-6 py-12 text-center text-sm text-gray-500">No payroll runs yet. Click "Run Payroll" to create one.</td></tr>
                                ) : runs.map((run) => (
                                    <tr key={run.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 text-sm font-medium" style={{ color: BRAND.dark }}>{run.period}</td>
                                        <td className="px-6 py-4 text-sm"><StatusBadge status={run.status} /></td>
                                        <td className="px-6 py-4 text-sm text-gray-700">{formatCurrency(run.totalGross)}</td>
                                        <td className="px-6 py-4 text-sm font-medium" style={{ color: BRAND.curious }}>{formatCurrency(run.totalNet)}</td>
                                        <td className="px-6 py-4 text-xs text-gray-500">
                                            <div>NSSA: {formatCurrency(run.totalNssa || 0)}</div>
                                            <div>PAYE: {formatCurrency(run.totalPaye || 0)}</div>
                                            <div>AIDS: {formatCurrency(run.totalAidsLevy || 0)}</div>
                                        </td>
                                        <td className="px-6 py-4 text-sm">
                                            {run.runVcId ? (
                                                <div className="flex items-center gap-2">
                                                    <span className="inline-flex items-center gap-1 text-green-600"><CheckCircleIcon className="h-4 w-4" /><span className="text-xs font-mono">{run.runVcId.substring(0, 8)}...</span></span>
                                                    <button onClick={() => handleReoffer(run.id)} className="text-xs font-medium" style={{ color: BRAND.curious }} title="Reoffer credential"><QrCodeIcon className="h-4 w-4" /></button>
                                                </div>
                                            ) : <span className="text-gray-400">—</span>}
                                        </td>
                                        <td className="px-6 py-4 text-right text-sm">
                                            <div className="flex justify-end gap-2">
                                                {run.status === 'draft' && <button onClick={() => handleIssuePayslips(run.id)} disabled={isLoading} className="rounded-md px-2.5 py-1.5 text-xs font-medium text-white" style={{ backgroundColor: BRAND.curious }}><DocumentCheckIcon className="h-4 w-4 mr-1 inline" />Issue VCs</button>}
                                                {run.status === 'completed' && (
                                                    <>
                                                        <button onClick={() => handleIssueTaxCompliance(run.id, 'NSSA')} disabled={isLoading} className="rounded-md border px-2.5 py-1.5 text-xs font-medium" style={{ borderColor: BRAND.curious, color: BRAND.curious }}>File NSSA</button>
                                                        <button onClick={() => handleIssueTaxCompliance(run.id, 'PAYE')} disabled={isLoading} className="rounded-md border px-2.5 py-1.5 text-xs font-medium" style={{ borderColor: BRAND.curious, color: BRAND.curious }}>File PAYE</button>
                                                    </>
                                                )}
                                                <Link href={`/payroll/${run.id}`} className="inline-flex items-center text-xs font-medium" style={{ color: BRAND.curious }}>Details<ChevronRightIcon className="h-4 w-4 ml-0.5" /></Link>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Employees Tab */}
                {activeTab === 'employees' && (
                    <div className="overflow-hidden rounded-xl shadow ring-1 ring-black ring-opacity-5">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead style={{ backgroundColor: BRAND.linkWater }}>
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase" style={{ color: BRAND.dark }}>Name</th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase" style={{ color: BRAND.dark }}>Email</th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase" style={{ color: BRAND.dark }}>Base Salary</th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase" style={{ color: BRAND.dark }}>Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 bg-white">
                                {employees.length === 0 ? (
                                    <tr><td colSpan={4} className="px-6 py-12 text-center text-sm text-gray-500">No employees yet. Click "Add Employee" to add one.</td></tr>
                                ) : employees.map((emp) => (
                                    <tr key={emp.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 text-sm font-medium" style={{ color: BRAND.dark }}>{emp.firstName} {emp.lastName}</td>
                                        <td className="px-6 py-4 text-sm text-gray-500">{emp.email || '—'}</td>
                                        <td className="px-6 py-4 text-sm font-medium" style={{ color: BRAND.curious }}>{formatCurrency(emp.baseSalary, emp.currency)}</td>
                                        <td className="px-6 py-4 text-sm"><StatusBadge status={emp.status} /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Tax Compliance Tab */}
                {activeTab === 'compliance' && (
                    <div className="overflow-hidden rounded-xl shadow ring-1 ring-black ring-opacity-5">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead style={{ backgroundColor: BRAND.linkWater }}>
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase" style={{ color: BRAND.dark }}>Tax Type</th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase" style={{ color: BRAND.dark }}>Period</th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase" style={{ color: BRAND.dark }}>Amount</th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase" style={{ color: BRAND.dark }}>Reference</th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase" style={{ color: BRAND.dark }}>Status</th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase" style={{ color: BRAND.dark }}>ComplianceVC</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 bg-white">
                                {taxRecords.length === 0 ? (
                                    <tr><td colSpan={6} className="px-6 py-12 text-center text-sm text-gray-500">No tax compliance records. Issue tax compliance VCs from completed payroll runs.</td></tr>
                                ) : taxRecords.map((tax) => (
                                    <tr key={tax.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 text-sm font-medium" style={{ color: BRAND.dark }}><BuildingLibraryIcon className="h-4 w-4 inline mr-1" style={{ color: BRAND.curious }} />{tax.taxType}</td>
                                        <td className="px-6 py-4 text-sm text-gray-700">{tax.period}</td>
                                        <td className="px-6 py-4 text-sm font-medium" style={{ color: BRAND.curious }}>{formatCurrency(tax.amount, tax.currency)}</td>
                                        <td className="px-6 py-4 text-sm text-gray-500 font-mono">{tax.referenceNumber || '—'}</td>
                                        <td className="px-6 py-4 text-sm"><StatusBadge status={tax.status} /></td>
                                        <td className="px-6 py-4 text-sm">{tax.complianceVcId ? <span className="inline-flex items-center gap-1 text-green-600"><CheckCircleIcon className="h-4 w-4" /><span className="text-xs font-mono">{tax.complianceVcId.substring(0, 8)}...</span></span> : <span className="text-gray-400">—</span>}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Run Payroll Modal */}
                {showRunModal && (
                    <div className="fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-[100]">
                        <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2 rounded-lg" style={{ backgroundColor: BRAND.linkWater }}><PlayIcon className="h-6 w-6" style={{ color: BRAND.curious }} /></div>
                                <h3 className="text-xl font-semibold" style={{ color: BRAND.dark }}>Run Payroll</h3>
                            </div>
                            <form onSubmit={handleRunPayroll} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1" style={{ color: BRAND.dark }}>Pay Period (YYYY-MM)</label>
                                    <input type="month" required value={newRun.period} onChange={e => setNewRun({...newRun, period: e.target.value})} className="w-full rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:border-transparent" />
                                </div>
                                <div className="p-4 rounded-lg" style={{ backgroundColor: BRAND.linkWater }}>
                                    <p className="text-sm" style={{ color: BRAND.dark }}><strong>Note:</strong> This will calculate payroll for all active employees, including NSSA (4.5%), PAYE, and AIDS Levy deductions.</p>
                                </div>
                                <div className="flex justify-end gap-3 pt-4">
                                    <button type="button" onClick={() => setShowRunModal(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
                                    <button type="submit" disabled={isLoading} className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor: BRAND.curious }}>{isLoading ? 'Processing...' : 'Calculate Payroll'}</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Add Employee Modal */}
                {showEmployeeModal && (
                    <div className="fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-[100]">
                        <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2 rounded-lg" style={{ backgroundColor: BRAND.linkWater }}><svg className="h-6 w-6" style={{ color: BRAND.curious }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg></div>
                                <h3 className="text-xl font-semibold" style={{ color: BRAND.dark }}>Add Employee</h3>
                            </div>
                            <form onSubmit={handleSaveEmployee} className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div><label className="block text-sm font-medium mb-1" style={{ color: BRAND.dark }}>First Name</label><input type="text" required value={newEmployee.firstName} onChange={e => setNewEmployee({...newEmployee, firstName: e.target.value})} className="w-full rounded-lg border-gray-300 shadow-sm" /></div>
                                    <div><label className="block text-sm font-medium mb-1" style={{ color: BRAND.dark }}>Last Name</label><input type="text" required value={newEmployee.lastName} onChange={e => setNewEmployee({...newEmployee, lastName: e.target.value})} className="w-full rounded-lg border-gray-300 shadow-sm" /></div>
                                </div>
                                <div><label className="block text-sm font-medium mb-1" style={{ color: BRAND.dark }}>Email</label><input type="email" value={newEmployee.email} onChange={e => setNewEmployee({...newEmployee, email: e.target.value})} className="w-full rounded-lg border-gray-300 shadow-sm" /></div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div><label className="block text-sm font-medium mb-1" style={{ color: BRAND.dark }}>Base Salary</label><input type="number" required min="0" step="0.01" value={newEmployee.baseSalary} onChange={e => setNewEmployee({...newEmployee, baseSalary: parseFloat(e.target.value)})} className="w-full rounded-lg border-gray-300 shadow-sm" /></div>
                                    <div><label className="block text-sm font-medium mb-1" style={{ color: BRAND.dark }}>Currency</label><select value={newEmployee.currency} onChange={e => setNewEmployee({...newEmployee, currency: e.target.value})} className="w-full rounded-lg border-gray-300 shadow-sm"><option value="USD">USD</option><option value="ZWL">ZWL</option><option value="ZAR">ZAR</option></select></div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div><label className="block text-sm font-medium mb-1" style={{ color: BRAND.dark }}>NSSA Number</label><input type="text" value={newEmployee.nssaNumber} onChange={e => setNewEmployee({...newEmployee, nssaNumber: e.target.value})} className="w-full rounded-lg border-gray-300 shadow-sm" placeholder="Optional" /></div>
                                    <div><label className="block text-sm font-medium mb-1" style={{ color: BRAND.dark }}>TIN</label><input type="text" value={newEmployee.tin} onChange={e => setNewEmployee({...newEmployee, tin: e.target.value})} className="w-full rounded-lg border-gray-300 shadow-sm" placeholder="Optional" /></div>
                                </div>
                                <div className="flex justify-end gap-3 pt-4">
                                    <button type="button" onClick={() => setShowEmployeeModal(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
                                    <button type="submit" disabled={isLoading} className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor: BRAND.curious }}>{isLoading ? 'Saving...' : 'Add Employee'}</button>
                                </div>
                            </form>
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

