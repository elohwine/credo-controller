import { useState, useEffect, useContext } from 'react';
import Head from 'next/head';
import Layout from '../../components/Layout';
import axios from 'axios';
import { BRAND, formatCurrency } from '@/lib/theme';
import {
  CubeIcon,
  MapPinIcon,
  QrCodeIcon,
  ClipboardDocumentListIcon,
  DocumentMagnifyingGlassIcon,
  CurrencyDollarIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  PlusIcon,
  ArrowPathIcon,
  ShieldCheckIcon
} from '@heroicons/react/24/outline';
import { EnvContext } from '@/pages/_app';

const InventoryDashboard = () => {
  const [stockLevels, setStockLevels] = useState<any[]>([]);
  const [valuation, setValuation] = useState<any>(null);
  const [aging, setAging] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [scanResult, setScanResult] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [traceResult, setTraceResult] = useState<any>(null);
  const [verifyChainResult, setVerifyChainResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'stock' | 'manage' | 'scan' | 'events' | 'trace' | 'valuation' | 'aging' | 'profit'>('stock');
  const [profitData, setProfitData] = useState<any>(null);

  const [createLocation, setCreateLocation] = useState({ name: '', type: 'warehouse', address: '' });
  const [receiveGoods, setReceiveGoods] = useState({
    catalogItemId: '',
    locationId: '',
    quantity: 1,
    unitCost: 0,
    currency: 'USD',
    lotNumber: '',
    serialNumber: '',
    barcode: '',
    expiryDate: '',
    supplierId: '',
    supplierInvoiceRef: '',
    issueVC: true,
  });
  const [scanBarcode, setScanBarcode] = useState('');
  const [scanLocationId, setScanLocationId] = useState('');
  const [eventsQuery, setEventsQuery] = useState({ catalogItemId: '', locationId: '', limit: 50 });
  const [traceReceiptId, setTraceReceiptId] = useState('');

  const env = useContext(EnvContext);
  const backendUrl = env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
  const apiKey = process.env.NEXT_PUBLIC_CREDO_API_KEY || 'test-api-key-12345';

  const apiHeaders = { 'x-api-key': apiKey };

  const fetchStockLevels = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${backendUrl}/api/inventory/levels`, { headers: apiHeaders });
      setStockLevels(res.data || []);
    } catch (err: any) {
      setError(err.response?.status === 401 ? 'Authentication failed. Please check your API key in .env.local' : err.message);
    } finally { setLoading(false); }
  };

  const fetchLocations = async () => {
    try {
      const res = await axios.get(`${backendUrl}/api/inventory/locations`, { headers: apiHeaders });
      setLocations(res.data || []);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const fetchValuation = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${backendUrl}/api/inventory/analytics/valuation`, { headers: apiHeaders });
      setValuation(res.data);
    } catch (err: any) {
      setError(err.response?.status === 401 ? 'Authentication failed. Please check your API key in .env.local' : err.message);
    } finally { setLoading(false); }
  };

  const fetchAging = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${backendUrl}/api/inventory/analytics/aging`, { headers: apiHeaders });
      setAging(res.data || []);
    } catch (err: any) {
      setError(err.response?.status === 401 ? 'Authentication failed. Please check your API key in .env.local' : err.message);
    } finally { setLoading(false); }
  };

  const handleCreateLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await axios.post(`${backendUrl}/api/inventory/locations`, createLocation, { headers: apiHeaders });
      setCreateLocation({ name: '', type: 'warehouse', address: '' });
      fetchLocations();
    } catch (err: any) {
      setError(err.message || 'Failed to create location');
    } finally { setLoading(false); }
  };

  const handleReceiveGoods = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await axios.post(`${backendUrl}/api/inventory/receive`, receiveGoods, { headers: apiHeaders });
      fetchStockLevels();
    } catch (err: any) {
      setError(err.message || 'Failed to receive goods');
    } finally { setLoading(false); }
  };

  const handleScan = async () => {
    if (!scanBarcode) return;
    setLoading(true);
    try {
      const url = `${backendUrl}/api/inventory/scan/${encodeURIComponent(scanBarcode)}${scanLocationId ? `?locationId=${encodeURIComponent(scanLocationId)}` : ''}`;
      const res = await axios.get(url, { headers: apiHeaders });
      setScanResult(res.data);
    } catch (err: any) {
      setError(err.message || 'Failed to scan barcode');
    } finally { setLoading(false); }
  };

  const handleFetchEvents = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        catalogItemId: eventsQuery.catalogItemId,
        locationId: eventsQuery.locationId,
        limit: String(eventsQuery.limit),
      });
      const res = await axios.get(`${backendUrl}/api/inventory/events?${params.toString()}`, { headers: apiHeaders });
      setEvents(res.data || []);

      const verifyRes = await axios.get(`${backendUrl}/api/inventory/verify-chain?${params.toString()}`, { headers: apiHeaders });
      setVerifyChainResult(verifyRes.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load events');
    } finally { setLoading(false); }
  };

  const handleTraceReceipt = async () => {
    if (!traceReceiptId) return;
    setLoading(true);
    try {
      const res = await axios.get(`${backendUrl}/api/inventory/trace/receipt/${encodeURIComponent(traceReceiptId)}`, { headers: apiHeaders });
      setTraceResult(res.data);
    } catch (err: any) {
      setError(err.message || 'Failed to trace receipt');
    } finally { setLoading(false); }
  };

  const fetchProfitAnalytics = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${backendUrl}/api/inventory/analytics/profit`, { headers: apiHeaders });
      setProfitData(res.data);
    } catch (err: any) {
      setError(err.message);
    } finally { setLoading(false); }
  };

  const handleBuyNow = async (lotId: string) => {
    if (!confirm('Confirm purchase and remove item from inventory?')) return;
    setLoading(true);
    try {
      const res = await axios.post(`${backendUrl}/api/inventory/buy`, { lotId, quantity: 1 }, { headers: apiHeaders });
      alert(`Success! Receipt ID: ${res.data.receiptId}`);
      handleScan(); // Refresh scan view
      fetchStockLevels();
    } catch (err: any) {
      setError(err.message || 'Failed to process purchase');
    } finally { setLoading(false); }
  };

  useEffect(() => {
    fetchStockLevels();
    fetchLocations();
  }, []);

  useEffect(() => {
    if (activeTab === 'stock') fetchStockLevels();
    else if (activeTab === 'valuation') fetchValuation();
    else if (activeTab === 'aging') fetchAging();
    else if (activeTab === 'profit') fetchProfitAnalytics();
  }, [activeTab]);

  return (
    <Layout>
      <Head>
        <title>Inventory | Credentis Portal</title>
      </Head>
      <div className="px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="sm:flex sm:items-center sm:justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold" style={{ color: BRAND.dark }}>Inventory Management</h1>
            <p className="mt-2 text-sm" style={{ color: BRAND.curious }}>Onboard items, scan, track lots & verify inventory VC trails</p>
          </div>
          <div className="mt-4 sm:mt-0">
            <button
              onClick={() => setActiveTab('manage')}
              className="inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium text-white transition-all hover:shadow-md"
              style={{ backgroundColor: BRAND.curious }}
            >
              <PlusIcon className="h-5 w-5 mr-2" />
              Onboard Item
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          {[
            { label: 'Stock Items', value: stockLevels.length, icon: <CubeIcon className="h-6 w-6" /> },
            { label: 'Locations', value: locations.length, icon: <MapPinIcon className="h-6 w-6" /> },
            { label: 'Total Value', value: `$${valuation?.totalValue?.toFixed(2) || '0.00'}`, icon: <CurrencyDollarIcon className="h-6 w-6" /> },
            { label: 'Events Tracked', value: events.length, icon: <ClipboardDocumentListIcon className="h-6 w-6" /> },
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

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex flex-wrap gap-6">
            {[
              { key: 'stock', label: 'Stock Levels', icon: <CubeIcon className="h-5 w-5" /> },
              { key: 'manage', label: 'Onboard Items', icon: <PlusIcon className="h-5 w-5" /> },
              { key: 'scan', label: 'Scan & Lookup', icon: <QrCodeIcon className="h-5 w-5" /> },
              { key: 'events', label: 'Event Chain', icon: <ClipboardDocumentListIcon className="h-5 w-5" /> },
              { key: 'trace', label: 'Trace Receipt', icon: <DocumentMagnifyingGlassIcon className="h-5 w-5" /> },
              { key: 'valuation', label: 'Valuation', icon: <CurrencyDollarIcon className="h-5 w-5" /> },
              { key: 'profit', label: 'Profit Focus', icon: <ShieldCheckIcon className="h-5 w-5" /> },
              { key: 'aging', label: 'Aging', icon: <ClockIcon className="h-5 w-5" /> },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className="group inline-flex items-center border-b-2 py-4 px-1 text-sm font-medium transition-colors"
                style={{
                  borderColor: activeTab === tab.key ? BRAND.curious : 'transparent',
                  color: activeTab === tab.key ? BRAND.curious : '#6B7280',
                }}
              >
                {tab.icon}<span className="ml-2">{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {error && <div className="bg-red-50 border border-red-200 p-4 mb-6 rounded-lg text-red-700">{error}</div>}

        {activeTab === 'stock' && (
          <div className="overflow-hidden rounded-xl shadow ring-1 ring-black ring-opacity-5">
            <table className="min-w-full divide-y divide-gray-200">
              <thead style={{ backgroundColor: BRAND.linkWater }}>
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase" style={{ color: BRAND.dark }}>Item</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase" style={{ color: BRAND.dark }}>Location</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase" style={{ color: BRAND.dark }}>On Hand</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase" style={{ color: BRAND.dark }}>Reserved</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase" style={{ color: BRAND.dark }}>Available</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase" style={{ color: BRAND.dark }}>Total Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {stockLevels.map((level, idx) => (
                  <tr key={idx} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium" style={{ color: BRAND.dark }}>{level.catalogItemId}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{level.locationId}</td>
                    <td className="px-6 py-4 text-sm text-right">{level.quantityOnHand}</td>
                    <td className="px-6 py-4 text-sm text-right text-yellow-600">{level.quantityReserved}</td>
                    <td className="px-6 py-4 text-sm text-right font-semibold text-green-600">{level.quantityAvailable}</td>
                    <td className="px-6 py-4 text-sm text-right font-medium" style={{ color: BRAND.curious }}>{formatCurrency(level.totalCost || 0)}</td>
                  </tr>
                ))}
                {stockLevels.length === 0 && !loading && (
                  <tr><td colSpan={6} className="px-6 py-12 text-center text-sm text-gray-500">No stock data found. Use "Onboard Items" to receive goods.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'manage' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Create Location Card */}
            <div className="rounded-xl shadow-sm overflow-hidden" style={{ backgroundColor: 'white' }}>
              <div className="px-6 py-4" style={{ backgroundColor: BRAND.linkWater }}>
                <div className="flex items-center gap-3">
                  <MapPinIcon className="h-5 w-5" style={{ color: BRAND.curious }} />
                  <h3 className="text-lg font-semibold" style={{ color: BRAND.dark }}>Create Location</h3>
                </div>
              </div>
              <div className="p-6">
                <form onSubmit={handleCreateLocation} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: BRAND.dark }}>Location Name</label>
                    <input className="w-full rounded-lg border-gray-300 shadow-sm" placeholder="e.g. Main Warehouse" value={createLocation.name} onChange={(e) => setCreateLocation({ ...createLocation, name: e.target.value })} required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: BRAND.dark }}>Type</label>
                    <select className="w-full rounded-lg border-gray-300 shadow-sm" value={createLocation.type} onChange={(e) => setCreateLocation({ ...createLocation, type: e.target.value })}>
                      <option value="warehouse">Warehouse</option>
                      <option value="shop">Shop</option>
                      <option value="transit">Transit</option>
                      <option value="virtual">Virtual</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: BRAND.dark }}>Address</label>
                    <input className="w-full rounded-lg border-gray-300 shadow-sm" placeholder="Physical address" value={createLocation.address} onChange={(e) => setCreateLocation({ ...createLocation, address: e.target.value })} />
                  </div>
                  <button type="submit" className="w-full rounded-lg px-4 py-2 text-sm font-medium text-white" style={{ backgroundColor: BRAND.curious }}>Create Location</button>
                </form>

                <div className="mt-6 pt-6 border-t">
                  <h4 className="text-sm font-semibold mb-3" style={{ color: BRAND.dark }}>Existing Locations</h4>
                  <ul className="space-y-2">
                    {locations.map((loc) => (
                      <li key={loc.id} className="flex items-center gap-2 text-sm p-2 rounded" style={{ backgroundColor: BRAND.linkWater }}>
                        <MapPinIcon className="h-4 w-4" style={{ color: BRAND.curious }} />
                        <span style={{ color: BRAND.dark }}>{loc.name}</span>
                        <span className="text-xs text-gray-500">· {loc.type}</span>
                      </li>
                    ))}
                    {locations.length === 0 && <li className="text-sm text-gray-500">No locations yet</li>}
                  </ul>
                </div>
              </div>
            </div>

            {/* Receive Goods Card */}
            <div className="rounded-xl shadow-sm overflow-hidden" style={{ backgroundColor: 'white' }}>
              <div className="px-6 py-4" style={{ backgroundColor: BRAND.linkWater }}>
                <div className="flex items-center gap-3">
                  <CubeIcon className="h-5 w-5" style={{ color: BRAND.curious }} />
                  <h3 className="text-lg font-semibold" style={{ color: BRAND.dark }}>Receive Goods (Onboard)</h3>
                </div>
              </div>
              <div className="p-6">
                <form onSubmit={handleReceiveGoods} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1" style={{ color: BRAND.dark }}>Catalog Item ID</label>
                      <input className="w-full rounded-lg border-gray-300 shadow-sm" placeholder="Item ID" value={receiveGoods.catalogItemId} onChange={(e) => setReceiveGoods({ ...receiveGoods, catalogItemId: e.target.value })} required />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1" style={{ color: BRAND.dark }}>Location</label>
                      <select className="w-full rounded-lg border-gray-300 shadow-sm" value={receiveGoods.locationId} onChange={(e) => setReceiveGoods({ ...receiveGoods, locationId: e.target.value })} required>
                        <option value="">Select Location</option>
                        {locations.map((loc) => (
                          <option key={loc.id} value={loc.id}>{loc.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1" style={{ color: BRAND.dark }}>Quantity</label>
                      <input className="w-full rounded-lg border-gray-300 shadow-sm" type="number" placeholder="Qty" value={receiveGoods.quantity} onChange={(e) => setReceiveGoods({ ...receiveGoods, quantity: Number(e.target.value) })} required />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1" style={{ color: BRAND.dark }}>Unit Cost</label>
                      <input className="w-full rounded-lg border-gray-300 shadow-sm" type="number" placeholder="Cost" value={receiveGoods.unitCost} onChange={(e) => setReceiveGoods({ ...receiveGoods, unitCost: Number(e.target.value) })} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1" style={{ color: BRAND.dark }}>Lot Number</label>
                      <input className="w-full rounded-lg border-gray-300 shadow-sm" placeholder="LOT-XXX" value={receiveGoods.lotNumber} onChange={(e) => setReceiveGoods({ ...receiveGoods, lotNumber: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1" style={{ color: BRAND.dark }}>Barcode</label>
                      <input className="w-full rounded-lg border-gray-300 shadow-sm" placeholder="Barcode" value={receiveGoods.barcode} onChange={(e) => setReceiveGoods({ ...receiveGoods, barcode: e.target.value })} />
                    </div>
                  </div>
                  <div className="p-4 rounded-lg" style={{ backgroundColor: BRAND.linkWater }}>
                    <label className="flex items-center gap-2 text-sm" style={{ color: BRAND.dark }}>
                      <input type="checkbox" checked={receiveGoods.issueVC} onChange={(e) => setReceiveGoods({ ...receiveGoods, issueVC: e.target.checked })} className="rounded" />
                      <span className="font-medium">Issue GoodsReceivedVC on receipt</span>
                    </label>
                  </div>
                  <button type="submit" className="w-full rounded-lg px-4 py-2 text-sm font-medium text-white" style={{ backgroundColor: BRAND.curious }}>Receive Goods</button>
                </form>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'scan' && (
          <div className="rounded-xl shadow-sm overflow-hidden" style={{ backgroundColor: 'white' }}>
            <div className="px-6 py-4" style={{ backgroundColor: BRAND.linkWater }}>
              <div className="flex items-center gap-3">
                <QrCodeIcon className="h-5 w-5" style={{ color: BRAND.curious }} />
                <h3 className="text-lg font-semibold" style={{ color: BRAND.dark }}>Scan Barcode / SKU</h3>
              </div>
            </div>
            <div className="p-6">
              <div className="flex gap-3 items-end mb-6 flex-wrap">
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: BRAND.dark }}>Barcode or SKU</label>
                  <input className="rounded-lg border-gray-300 shadow-sm" placeholder="Enter barcode" value={scanBarcode} onChange={(e) => setScanBarcode(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: BRAND.dark }}>Location (optional)</label>
                  <input className="rounded-lg border-gray-300 shadow-sm" placeholder="Location ID" value={scanLocationId} onChange={(e) => setScanLocationId(e.target.value)} />
                </div>
                <button onClick={handleScan} className="rounded-lg px-4 py-2 text-sm font-medium text-white" style={{ backgroundColor: BRAND.curious }}>
                  <QrCodeIcon className="h-5 w-5 inline mr-1" />Scan
                </button>
              </div>

              {scanResult && (
                <div className="space-y-4">
                  <div className="p-4 rounded-lg" style={{ backgroundColor: BRAND.linkWater }}>
                    <p className="text-sm font-medium mb-2" style={{ color: BRAND.dark }}>Catalog Item</p>
                    <div className="grid grid-cols-2 gap-4 bg-white p-4 rounded-xl shadow-sm border border-blue-50">
                      <div>
                        <p className="text-xs text-gray-500 uppercase font-black">Title</p>
                        <p className="font-bold text-[#0F3F5E]">{scanResult.catalogItem?.title}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase font-black">Price</p>
                        <p className="font-bold text-green-600">{formatCurrency(scanResult.catalogItem?.price)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Digital Twin / Provenance Section */}
                  <div className="rounded-xl overflow-hidden border border-blue-100 shadow-sm">
                    <div className="px-4 py-3 font-bold text-sm bg-blue-50 text-[#0F3F5E] flex justify-between">
                      <span>Digital Twin Provenance</span>
                      <span className="text-[10px] bg-[#2188CA] text-white px-2 py-0.5 rounded-full uppercase">Verified</span>
                    </div>
                    <div className="p-4 bg-white">
                      <div className="flow-root">
                        <ul role="list" className="-mb-8">
                          {scanResult.provenanceTrial?.map((event: any, idx: number) => (
                            <li key={event.id}>
                              <div className="relative pb-8">
                                {idx !== scanResult.provenanceTrial.length - 1 && <span className="absolute left-4 top-4 -ml-px h-full w-0.5 bg-gray-200" aria-hidden="true" />}
                                <div className="relative flex space-x-3">
                                  <div>
                                    <span className={`h-8 w-8 rounded-full flex items-center justify-center ring-8 ring-white ${event.eventType === 'RECEIVE' ? 'bg-green-500' : 'bg-blue-500'}`}>
                                      <CheckCircleIcon className="h-5 w-5 text-white" />
                                    </span>
                                  </div>
                                  <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
                                    <div>
                                      <p className="text-sm text-gray-500">
                                        <span className="font-bold text-gray-900">{event.eventType}</span> · Qty {event.quantity}
                                      </p>
                                    </div>
                                    <div className="whitespace-nowrap text-right text-xs text-gray-500">
                                      {event.createdAt.slice(0, 10)}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl overflow-hidden border" style={{ borderColor: BRAND.viking }}>
                    <div className="px-4 py-3 font-medium text-sm" style={{ backgroundColor: BRAND.linkWater, color: BRAND.dark }}>Available Lots</div>
                    <ul className="divide-y">
                      {scanResult.lots?.map((lot: any) => (
                        <li key={lot.id} className="p-4 text-sm flex justify-between items-center group">
                          <div>
                            <span className="font-bold text-[#0F3F5E]">{lot.lotNumber || lot.serialNumber || lot.id}</span>
                            <p className="text-xs text-gray-400">On Hand: {lot.quantityOnHand}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            {lot.grnVcId && <span className="inline-flex items-center gap-1 text-green-600 text-xs font-bold uppercase"><CheckCircleIcon className="h-4 w-4" />VC Proof</span>}
                            <button
                              onClick={() => handleBuyNow(lot.id)}
                              disabled={lot.quantityOnHand <= 0}
                              className="px-3 py-1.5 bg-[#2188CA] text-white rounded-lg text-xs font-bold shadow-md hover:bg-[#0F3F5E] transition-all disabled:opacity-50"
                            >
                              BUY NOW
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'events' && (
          <div className="rounded-xl shadow-sm overflow-hidden" style={{ backgroundColor: 'white' }}>
            <div className="px-6 py-4" style={{ backgroundColor: BRAND.linkWater }}>
              <div className="flex items-center gap-3">
                <ClipboardDocumentListIcon className="h-5 w-5" style={{ color: BRAND.curious }} />
                <h3 className="text-lg font-semibold" style={{ color: BRAND.dark }}>Event Chain & VC Trail</h3>
              </div>
            </div>
            <div className="p-6">
              <div className="flex gap-3 items-end flex-wrap mb-6">
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: BRAND.dark }}>Catalog Item ID</label>
                  <input className="rounded-lg border-gray-300 shadow-sm" placeholder="Item ID" value={eventsQuery.catalogItemId} onChange={(e) => setEventsQuery({ ...eventsQuery, catalogItemId: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: BRAND.dark }}>Location ID</label>
                  <input className="rounded-lg border-gray-300 shadow-sm" placeholder="Location" value={eventsQuery.locationId} onChange={(e) => setEventsQuery({ ...eventsQuery, locationId: e.target.value })} />
                </div>
                <button onClick={handleFetchEvents} className="rounded-lg px-4 py-2 text-sm font-medium text-white" style={{ backgroundColor: BRAND.curious }}>
                  <ArrowPathIcon className="h-5 w-5 inline mr-1" />Load Events
                </button>
              </div>

              {verifyChainResult && (
                <div className={`p-4 rounded-lg mb-6 flex items-center gap-2 ${verifyChainResult.valid ? 'bg-green-50' : 'bg-red-50'}`}>
                  {verifyChainResult.valid ? <ShieldCheckIcon className="h-5 w-5 text-green-600" /> : <ExclamationTriangleIcon className="h-5 w-5 text-red-600" />}
                  <span className={verifyChainResult.valid ? 'text-green-700' : 'text-red-700'}>
                    Chain {verifyChainResult.valid ? 'Valid' : 'Invalid'} · {verifyChainResult.eventCount} events
                  </span>
                </div>
              )}

              <div className="overflow-hidden rounded-xl ring-1 ring-black ring-opacity-5">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead style={{ backgroundColor: BRAND.linkWater }}>
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase" style={{ color: BRAND.dark }}>Type</th>
                      <th className="px-6 py-3 text-right text-xs font-semibold uppercase" style={{ color: BRAND.dark }}>Qty</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase" style={{ color: BRAND.dark }}>VC</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase" style={{ color: BRAND.dark }}>Hash</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {events.map((ev) => (
                      <tr key={ev.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-sm font-medium" style={{ color: BRAND.dark }}>{ev.eventType}</td>
                        <td className="px-6 py-4 text-sm text-right">{ev.quantity}</td>
                        <td className="px-6 py-4 text-sm">{ev.vcId ? <span className="inline-flex items-center gap-1 text-green-600"><CheckCircleIcon className="h-4 w-4" /><span className="text-xs font-mono">{ev.vcId.slice(0, 8)}...</span></span> : <span className="text-gray-400">—</span>}</td>
                        <td className="px-6 py-4 text-xs text-gray-400 font-mono">{ev.eventHash?.slice(0, 18)}...</td>
                      </tr>
                    ))}
                    {events.length === 0 && !loading && (
                      <tr><td colSpan={4} className="px-6 py-12 text-center text-sm text-gray-500">No events found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'trace' && (
          <div className="rounded-xl shadow-sm overflow-hidden" style={{ backgroundColor: 'white' }}>
            <div className="px-6 py-4" style={{ backgroundColor: BRAND.linkWater }}>
              <div className="flex items-center gap-3">
                <DocumentMagnifyingGlassIcon className="h-5 w-5" style={{ color: BRAND.curious }} />
                <h3 className="text-lg font-semibold" style={{ color: BRAND.dark }}>Trace Receipt to Lots</h3>
              </div>
            </div>
            <div className="p-6">
              <div className="flex gap-3 items-end flex-wrap mb-6">
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: BRAND.dark }}>Receipt ID</label>
                  <input className="rounded-lg border-gray-300 shadow-sm" placeholder="Receipt ID" value={traceReceiptId} onChange={(e) => setTraceReceiptId(e.target.value)} />
                </div>
                <button onClick={handleTraceReceipt} className="rounded-lg px-4 py-2 text-sm font-medium text-white" style={{ backgroundColor: BRAND.curious }}>Trace</button>
              </div>

              {traceResult && (
                <div className="p-4 rounded-lg" style={{ backgroundColor: BRAND.linkWater }}>
                  <div className="flex items-center gap-2 mb-4">
                    {traceResult.chainValid ? <ShieldCheckIcon className="h-5 w-5 text-green-600" /> : <ExclamationTriangleIcon className="h-5 w-5 text-red-600" />}
                    <span className="font-medium" style={{ color: BRAND.dark }}>Receipt: {traceResult.receiptId}</span>
                    <span className={traceResult.chainValid ? 'text-green-600' : 'text-red-600'}>· Chain {traceResult.chainValid ? 'Valid' : 'Invalid'}</span>
                  </div>
                  <ul className="divide-y bg-white rounded-lg overflow-hidden">
                    {traceResult.fulfillments?.map((f: any, idx: number) => (
                      <li key={idx} className="p-3 flex justify-between items-center text-sm">
                        <span style={{ color: BRAND.dark }}>Lot {f.lotId}</span>
                        <span className="text-gray-500">Qty {f.quantity}</span>
                        {f.grnVcId && <span className="inline-flex items-center gap-1 text-green-600 text-xs"><CheckCircleIcon className="h-4 w-4" />GRN VC</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'valuation' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="relative overflow-hidden rounded-xl p-6 shadow-sm" style={{ backgroundColor: BRAND.linkWater }}>
              <dt>
                <div className="absolute rounded-lg p-3" style={{ backgroundColor: BRAND.curious }}>
                  <CurrencyDollarIcon className="h-6 w-6 text-white" />
                </div>
                <p className="ml-16 truncate text-sm font-medium" style={{ color: BRAND.dark }}>Total Inventory Value</p>
              </dt>
              <dd className="ml-16">
                <p className="text-3xl font-bold text-green-600">{formatCurrency(valuation?.totalValue || 0)}</p>
                <p className="text-xs text-gray-500">{valuation?.currency || 'USD'}</p>
              </dd>
            </div>
            <div className="col-span-2 rounded-xl shadow-sm overflow-hidden" style={{ backgroundColor: 'white' }}>
              <div className="px-6 py-4" style={{ backgroundColor: BRAND.linkWater }}>
                <h3 className="font-semibold" style={{ color: BRAND.dark }}>Value by Location</h3>
              </div>
              <div className="p-6">
                {valuation?.byLocation?.map((loc: any, idx: number) => (
                  <div key={idx} className="flex justify-between py-3 border-b last:border-b-0">
                    <span style={{ color: BRAND.dark }}>{loc.location_id}</span>
                    <span className="font-medium" style={{ color: BRAND.curious }}>{formatCurrency(loc.value || 0, loc.currency)}</span>
                  </div>
                ))}
                {!valuation?.byLocation?.length && <p className="text-gray-500 text-center py-4">No valuation data</p>}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'aging' && (
          <div className="overflow-hidden rounded-xl shadow ring-1 ring-black ring-opacity-5">
            <table className="min-w-full divide-y divide-gray-200">
              <thead style={{ backgroundColor: BRAND.linkWater }}>
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase" style={{ color: BRAND.dark }}>Age Bucket</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase" style={{ color: BRAND.dark }}>Lot Count</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase" style={{ color: BRAND.dark }}>Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {aging.map((bucket, idx) => (
                  <tr key={idx} className={`hover:bg-gray-50 ${bucket.age_bucket === '90+ days' ? 'bg-red-50' : ''}`}>
                    <td className="px-6 py-4 text-sm font-medium" style={{ color: BRAND.dark }}>
                      {bucket.age_bucket === '90+ days' && <ExclamationTriangleIcon className="h-4 w-4 inline mr-2 text-red-500" />}
                      {bucket.age_bucket}
                    </td>
                    <td className="px-6 py-4 text-sm text-right">{bucket.lot_count}</td>
                    <td className="px-6 py-4 text-sm text-right font-medium" style={{ color: BRAND.curious }}>{formatCurrency(bucket.value || 0)}</td>
                  </tr>
                ))}
                {aging.length === 0 && !loading && (
                  <tr><td colSpan={3} className="px-6 py-12 text-center text-sm text-gray-500">No aging data available</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {activeTab === 'profit' && (
          <div className="flex flex-col gap-8">
            {/* Profit Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-3xl shadow-xl border border-blue-50">
                <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Total Forecasted Profit</p>
                <h2 className="text-3xl font-black text-green-600">{formatCurrency(profitData?.summary?.totalProfit)}</h2>
              </div>
              <div className="bg-white p-6 rounded-3xl shadow-xl border border-blue-50">
                <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Overall Margin</p>
                <h2 className="text-3xl font-black text-[#2188CA]">{profitData?.summary?.overallMargin?.toFixed(1)}%</h2>
              </div>
              <div className="bg-white p-6 rounded-3xl shadow-xl border border-blue-50">
                <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Total Active Stock Items</p>
                <h2 className="text-3xl font-black text-[#0F3F5E]">{profitData?.summary?.totalItems}</h2>
              </div>
            </div>

            {/* Profit per Item Table */}
            <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-100">
              <div className="px-8 py-5 border-b bg-gray-50/50 flex justify-between items-center">
                <h3 className="font-black text-[#0F3F5E] uppercase text-sm tracking-tighter">Profit Focused Inventory Items</h3>
                <span className="text-[10px] font-bold text-[#627D98] uppercase tracking-widest">Revenue vs Cost Analysis</span>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-100">
                  <thead>
                    <tr className="text-[10px] text-gray-400 font-black uppercase tracking-widest">
                      <th className="px-8 py-4 text-left">Item Name</th>
                      <th className="px-6 py-4 text-right">Qty</th>
                      <th className="px-6 py-4 text-right">Avg Cost</th>
                      <th className="px-6 py-4 text-right">Price</th>
                      <th className="px-6 py-4 text-right">Unit Profit</th>
                      <th className="px-6 py-4 text-right text-green-600">Total Profit</th>
                      <th className="px-8 py-4 text-right">Avg Days In Stock</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {profitData?.items?.map((item: any, idx: number) => (
                      <tr key={idx} className="hover:bg-blue-50/30 transition-colors">
                        <td className="px-8 py-5">
                          <div className="text-sm font-bold text-[#0F3F5E]">{item.item_name}</div>
                          <div className="text-[10px] text-gray-400 font-mono">{item.sku}</div>
                        </td>
                        <td className="px-6 py-5 text-sm text-right text-gray-500">{item.total_qty}</td>
                        <td className="px-6 py-5 text-sm text-right text-gray-500">{formatCurrency(item.avg_cost)}</td>
                        <td className="px-6 py-5 text-sm text-right text-[#0F3F5E] font-medium">{formatCurrency(item.selling_price)}</td>
                        <td className="px-6 py-5 text-sm text-right text-blue-600 font-bold">{formatCurrency(item.selling_price - item.avg_cost)}</td>
                        <td className="px-6 py-5 text-sm text-right text-green-600 font-black">{formatCurrency(item.projected_profit)}</td>
                        <td className="px-8 py-5 text-right">
                          <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${item.avg_days_in_stock > 30 ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                            {Math.round(item.avg_days_in_stock)} Days
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {loading && <div className="text-center py-8 text-gray-500">Loading...</div>}
      </div>
    </Layout>
  );
};

export default InventoryDashboard;
