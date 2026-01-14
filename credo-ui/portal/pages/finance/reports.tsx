import { useState } from 'react';
import Head from 'next/head';
import Layout from '../../components/Layout';
import axios from 'axios';

const FinanceReports = () => {
  const [startDate, setStartDate] = useState('2026-01-01');
  const [endDate, setEndDate] = useState('2026-01-31');
  const [report, setReport] = useState<any>(null);
  const [offerUri, setOfferUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = async () => {
    setLoading(true);
    setError(null);
    setReport(null);
    setOfferUri(null);
    try {
      const response = await axios.get(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000'}/api/finance/income-statement`, {
        params: { startDate, endDate }
      });
      setReport(response.data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch report');
    } finally {
      setLoading(false);
    }
  };

  const issueCredential = async () => {
    setLoading(true);
    try {
      const response = await axios.post(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000'}/api/finance/income-statement/offer`, {
        startDate,
        endDate
      });
      setOfferUri(response.data.uri);
    } catch (err: any) {
      setError(err.message || 'Failed to issue credential');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <Head>
        <title>Financial Reports | Credo Portal</title>
      </Head>
      <div className="p-6">
        <h1 className="text-3xl font-bold mb-6">Financial Statements</h1>
        
        <div className="bg-white p-6 rounded-lg shadow mb-6">
          <h2 className="text-xl font-semibold mb-4">Generate Income Statement</h2>
          <div className="flex gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-gray-700">Start Date</label>
              <input 
                type="date" 
                value={startDate} 
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">End Date</label>
              <input 
                type="date" 
                value={endDate} 
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
              />
            </div>
            <button 
              onClick={fetchReport}
              disabled={loading}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Generate Report'}
            </button>
          </div>
          {error && <p className="text-red-500 mt-4">{error}</p>}
        </div>

        {report && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-xl font-semibold mb-4 border-b pb-2">Income Statement Summary</h2>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Period:</span>
                  <span className="font-medium">{new Date(report.periodStart).toLocaleDateString()} - {new Date(report.periodEnd).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between text-lg">
                  <span className="text-gray-600">Total Revenue:</span>
                  <span className="font-bold text-green-600">${report.revenue.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-lg">
                  <span className="text-gray-600">Total Expenses:</span>
                  <span className="font-bold text-red-600">${report.expenses.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xl border-t pt-2 mt-2">
                  <span className="font-bold">Net Income:</span>
                  <span className={`font-bold ${report.netIncome >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    ${report.netIncome.toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="mt-6">
                <h3 className="font-medium mb-2 text-gray-500 uppercase text-xs tracking-wider">Breakdown</h3>
                <ul className="space-y-1 text-sm">
                  <li className="flex justify-between"><span>Sales:</span> <span>${report.breakdown.sales.toFixed(2)}</span></li>
                  <li className="flex justify-between"><span>Payroll:</span> <span>${report.breakdown.payroll.toFixed(2)}</span></li>
                  <li className="flex justify-between"><span>Operations:</span> <span>${report.breakdown.operations.toFixed(2)}</span></li>
                </ul>
              </div>

              <div className="mt-6 pt-4 border-t">
                {!offerUri ? (
                  <button 
                    onClick={issueCredential}
                    disabled={loading}
                    className="w-full bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 disabled:opacity-50 flex justify-center items-center gap-2"
                  >
                    <span>Issue Verifiable Credential</span>
                  </button>
                ) : (
                  <div className="bg-green-50 p-4 rounded border border-green-200">
                    <p className="text-green-800 font-medium mb-2">Credential Offer Created!</p>
                    <p className="text-xs text-gray-600 break-all bg-white p-2 rounded border">{offerUri}</p>
                    <a href={offerUri} className="mt-2 inline-block text-sm text-indigo-600 hover:underline">Open in Wallet</a>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default FinanceReports;
