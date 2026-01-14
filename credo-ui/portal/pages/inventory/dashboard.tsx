import { useState, useEffect } from 'react';
import Head from 'next/head';
import Layout from '../../components/Layout';
import axios from 'axios';

const InventoryDashboard = () => {
  const [stockLevels, setStockLevels] = useState<any[]>([]);
  const [valuation, setValuation] = useState<any>(null);
  const [aging, setAging] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'stock' | 'valuation' | 'aging'>('stock');

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
  const apiKey = process.env.NEXT_PUBLIC_CREDO_API_KEY || 'test-api-key-12345';

  const fetchStockLevels = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${backendUrl}/api/inventory/levels`, {
        headers: { 'x-api-key': apiKey }
      });
      setStockLevels(res.data);
    } catch (err: any) {
      setError(err.message);
    } finally { setLoading(false); }
  };

  const fetchValuation = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${backendUrl}/api/inventory/analytics/valuation`, {
        headers: { 'x-api-key': apiKey }
      });
      setValuation(res.data);
    } catch (err: any) {
      setError(err.message);
    } finally { setLoading(false); }
  };

  const fetchAging = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${backendUrl}/api/inventory/analytics/aging`, {
        headers: { 'x-api-key': apiKey }
      });
      setAging(res.data);
    } catch (err: any) {
      setError(err.message);
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (activeTab === 'stock') fetchStockLevels();
    else if (activeTab === 'valuation') fetchValuation();
    else if (activeTab === 'aging') fetchAging();
  }, [activeTab]);

  return (
    <Layout>
      <Head>
        <title>Inventory Dashboard | Credo Portal</title>
      </Head>
      <div className="p-6">
        <h1 className="text-3xl font-bold mb-6">📦 Inventory Dashboard</h1>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('stock')}
              className={`${activeTab === 'stock' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Stock Levels
            </button>
            <button
              onClick={() => setActiveTab('valuation')}
              className={`${activeTab === 'valuation' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Valuation
            </button>
            <button
              onClick={() => setActiveTab('aging')}
              className={`${activeTab === 'aging' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Aging Report
            </button>
          </nav>
        </div>

        {error && <div className="bg-red-50 p-4 mb-4 rounded text-red-700">{error}</div>}

        {/* Stock Levels */}
        {activeTab === 'stock' && (
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">On Hand</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Reserved</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Available</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total Cost</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {stockLevels.map((level, idx) => (
                  <tr key={idx}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{level.catalogItemId}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{level.locationId}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right">{level.quantityOnHand}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-yellow-600">{level.quantityReserved}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-semibold text-green-600">{level.quantityAvailable}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right">${level.totalCost?.toFixed(2)}</td>
                  </tr>
                ))}
                {stockLevels.length === 0 && !loading && (
                  <tr><td colSpan={6} className="px-6 py-4 text-center text-gray-500">No stock data found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Valuation */}
        {activeTab === 'valuation' && valuation && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-lg shadow">
              <p className="text-sm text-gray-500">Total Inventory Value</p>
              <p className="text-3xl font-bold text-green-600">${valuation.totalValue?.toFixed(2)}</p>
              <p className="text-xs text-gray-400">{valuation.currency}</p>
            </div>
            <div className="col-span-2 bg-white p-6 rounded-lg shadow">
              <h3 className="font-semibold mb-4">Value by Location</h3>
              {valuation.byLocation?.map((loc: any, idx: number) => (
                <div key={idx} className="flex justify-between py-2 border-b last:border-b-0">
                  <span className="text-gray-600">{loc.location_id}</span>
                  <span className="font-medium">${loc.value?.toFixed(2)} {loc.currency}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Aging Report */}
        {activeTab === 'aging' && (
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Age Bucket</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Lot Count</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Value</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {aging.map((bucket, idx) => (
                  <tr key={idx} className={bucket.age_bucket === '90+ days' ? 'bg-red-50' : ''}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{bucket.age_bucket}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right">{bucket.lot_count}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-semibold">${bucket.value?.toFixed(2)}</td>
                  </tr>
                ))}
                {aging.length === 0 && !loading && (
                  <tr><td colSpan={3} className="px-6 py-4 text-center text-gray-500">No aging data available</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {loading && <div className="text-center py-8 text-gray-500">Loading...</div>}
      </div>
    </Layout>
  );
};

export default InventoryDashboard;
