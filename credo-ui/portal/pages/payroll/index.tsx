import React, { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import { PlayIcon, DocumentTextIcon } from '@heroicons/react/24/outline';

interface PayrollRun {
    id: string;
    periodStart: string;
    periodEnd: string;
    status: string;
    totalEmployees: number;
    totalGross: number;
    totalNet: number;
    createdAt: string;
}

export default function PayrollPage() {
    const [runs, setRuns] = useState<PayrollRun[]>([]);
    const [showRunModal, setShowRunModal] = useState(false);
    const [newRun, setNewRun] = useState({
        periodStart: new Date().toISOString().split('T')[0],
        periodEnd: new Date().toISOString().split('T')[0],
        dryRun: true
    });

    useEffect(() => {
        fetchPayrollRuns();
    }, []);

    const fetchPayrollRuns = async () => {
        try {
            const res = await fetch('http://localhost:3000/api/payroll/runs');
            const data = await res.json();
            setRuns(data.runs || []);
        } catch (error) {
            console.error('Failed to fetch payroll runs:', error);
        }
    };

    const handleRunPayroll = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch('http://localhost:3000/api/payroll/run', {
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
        }
    };

    return (
        <Layout title="Payroll Management">
            <div className="px-4 sm:px-6 lg:px-8">
                <div className="sm:flex sm:items-center">
                    <div className="sm:flex-auto">
                        <h1 className="text-2xl font-semibold text-gray-900">Payroll Runs</h1>
                        <p className="mt-2 text-sm text-gray-700">
                            Process payroll and issue PayslipVCs to employees
                        </p>
                    </div>
                    <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
                        <button
                            onClick={() => setShowRunModal(true)}
                            className="inline-flex items-center justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
                        >
                            <PlayIcon className="h-5 w-5 mr-2" />
                            Run Payroll
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
                                            <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Period</th>
                                            <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Employees</th>
                                            <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Total Gross</th>
                                            <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Total Net</th>
                                            <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Status</th>
                                            <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Date</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200 bg-white">
                                        {runs.map((run) => (
                                            <tr key={run.id}>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-900">
                                                    {new Date(run.periodStart).toLocaleDateString()} - {new Date(run.periodEnd).toLocaleDateString()}
                                                </td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{run.totalEmployees}</td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">${run.totalGross?.toFixed(2)}</td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">${run.totalNet?.toFixed(2)}</td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm">
                                                    <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                                                        run.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                                                    }`}>
                                                        {run.status}
                                                    </span>
                                                </td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                                    {new Date(run.createdAt).toLocaleString()}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>

                {showRunModal && (
                    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
                        <div className="bg-white rounded-lg p-6 max-w-md w-full">
                            <h3 className="text-lg font-medium text-gray-900 mb-4">Run Payroll</h3>
                            <form onSubmit={handleRunPayroll} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Period Start</label>
                                    <input type="date" required value={newRun.periodStart} onChange={e => setNewRun({...newRun, periodStart: e.target.value})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Period End</label>
                                    <input type="date" required value={newRun.periodEnd} onChange={e => setNewRun({...newRun, periodEnd: e.target.value})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                                </div>
                                <div className="flex items-center">
                                    <input type="checkbox" checked={newRun.dryRun} onChange={e => setNewRun({...newRun, dryRun: e.target.checked})} className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                                    <label className="ml-2 block text-sm text-gray-900">Dry Run (Preview Only)</label>
                                </div>
                                <div className="flex justify-end space-x-3">
                                    <button type="button" onClick={() => setShowRunModal(false)} className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
                                    <button type="submit" className="rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700">Run</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </Layout>
    );
}
