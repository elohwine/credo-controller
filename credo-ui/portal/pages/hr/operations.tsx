import { useState, useEffect, useContext } from 'react';
import Head from 'next/head';
import Layout from '../../components/Layout';
import axios from 'axios';
import { BRAND } from '@/lib/theme';
import QRCode from 'react-qr-code';
import { CalendarIcon, CurrencyDollarIcon, ClipboardDocumentListIcon, CheckCircleIcon, XCircleIcon, QrCodeIcon, DevicePhoneMobileIcon, ClipboardDocumentIcon } from '@heroicons/react/24/outline';
import { EnvContext } from '@/pages/_app';

const HrOperations = () => {
  const [activeTab, setActiveTab] = useState<'leave' | 'expenses'>('leave');
  const [leaveRequests, setLeaveRequests] = useState<any[]>([]);
  const [expenseClaims, setExpenseClaims] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReofferModal, setShowReofferModal] = useState(false);
  const [reofferUri, setReofferUri] = useState<string | null>(null);

  // Form states
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);

  // New Leave Request
  const [newLeave, setNewLeave] = useState({
    employeeId: 'emp-001', // Mock default
    leaveType: 'annual',
    startDate: '',
    endDate: '',
    daysCount: 1,
    reason: ''
  });

  // New Expense Claim
  const [newExpense, setNewExpense] = useState({
    employeeId: 'emp-001', // Mock default
    description: '',
    amount: 0,
    currency: 'USD',
    category: 'meals'
  });

  const env = useContext(EnvContext);
  const backendUrl = env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';

  const fetchLeave = async () => {
    try {
      const res = await axios.get(`${backendUrl}/api/operations/leave`);
      setLeaveRequests(res.data);
    } catch (err) { console.error(err); }
  };

  const fetchExpenses = async () => {
    try {
      const res = await axios.get(`${backendUrl}/api/operations/expenses`);
      setExpenseClaims(res.data);
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    if (activeTab === 'leave') fetchLeave();
    else fetchExpenses();
  }, [activeTab]);

  const submitLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await axios.post(`${backendUrl}/api/operations/leave`, newLeave);
      setShowLeaveForm(false);
      fetchLeave();
    } catch (err: any) {
      setError(err.message);
    } finally { setLoading(false); }
  };

  const submitExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await axios.post(`${backendUrl}/api/operations/expenses`, newExpense);
      setShowExpenseForm(false);
      fetchExpenses();
    } catch (err: any) {
      setError(err.message);
    } finally { setLoading(false); }
  };

  const updateStatus = async (type: 'leave' | 'expenses', id: string, status: string) => {
    try {
      await axios.put(`${backendUrl}/api/operations/${type}/${id}/status`, {
        adminDid: 'did:key:admin', // Mock
        status
      });
      if (type === 'leave') fetchLeave();
      else fetchExpenses();
    } catch (err) { console.error(err); }
  };

  const handleReoffer = async (type: 'leave' | 'expenses', id: string) => {
    setLoading(true);
    try {
      const res = await axios.post(`${backendUrl}/api/operations/${type}/${id}/reoffer`);
      if (res.data.offerUri || res.data.credential_offer_deeplink) {
        setReofferUri(res.data.offerUri || res.data.credential_offer_deeplink);
        setShowReofferModal(true);
      }
    } catch (err) {
      console.error('Failed to reoffer credential:', err);
      alert('Failed to reoffer credential. Please try again.');
    } finally {
      setLoading(false);
    }
  };


  return (
    <Layout>
      <Head>
        <title>HR Operations | Credentis Portal</title>
      </Head>
      <div className="p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold" style={{ color: BRAND.dark }}>HR Operations</h1>
          <p className="text-sm mt-1" style={{ color: BRAND.curious }}>Leave Management & Expense Claims with Verifiable Credentials</p>
        </div>

        {/* Tabs with brand colors */}
        <div className="border-b mb-6" style={{ borderColor: BRAND.linkWater }}>
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('leave')}
              className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2`}
              style={{
                borderColor: activeTab === 'leave' ? BRAND.curious : 'transparent',
                color: activeTab === 'leave' ? BRAND.curious : '#6B7280'
              }}
            >
              <CalendarIcon className="h-5 w-5" />
              Leave Requests
            </button>
            <button
              onClick={() => setActiveTab('expenses')}
              className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2`}
              style={{
                borderColor: activeTab === 'expenses' ? BRAND.curious : 'transparent',
                color: activeTab === 'expenses' ? BRAND.curious : '#6B7280'
              }}
            >
              <CurrencyDollarIcon className="h-5 w-5" />
              Expense Claims
            </button>
          </nav>
        </div>

        {/* Leave Tab */}
        {activeTab === 'leave' && (
          <div>
            <div className="flex justify-between mb-4">
              <h2 className="text-xl font-semibold" style={{ color: BRAND.dark }}>Leave Requests</h2>
              <button
                onClick={() => setShowLeaveForm(!showLeaveForm)}
                className="text-white px-4 py-2 rounded transition-colors"
                style={{ backgroundColor: showLeaveForm ? '#6B7280' : BRAND.curious }}
              >
                {showLeaveForm ? 'Cancel' : '+ New Request'}
              </button>
            </div>

            {showLeaveForm && (
              <div className="flex justify-center mb-6">
                <form onSubmit={submitLeave} className="shadow-2xl rounded-xl p-8 bg-white max-w-2xl w-full">
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <input type="text" placeholder="Employee ID" className="p-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:border-transparent" style={{ borderColor: BRAND.viking, '--tw-ring-color': BRAND.curious } as any} value={newLeave.employeeId} onChange={e => setNewLeave({ ...newLeave, employeeId: e.target.value })} />
                    <select className="p-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:border-transparent" style={{ borderColor: BRAND.viking, '--tw-ring-color': BRAND.curious } as any} value={newLeave.leaveType} onChange={e => setNewLeave({ ...newLeave, leaveType: e.target.value })}>
                      <option value="annual">Annual</option>
                      <option value="sick">Sick</option>
                      <option value="unpaid">Unpaid</option>
                      <option value="maternity">Maternity</option>
                      <option value="study">Study</option>
                    </select>
                    <input type="date" className="p-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:border-transparent" style={{ borderColor: BRAND.viking, '--tw-ring-color': BRAND.curious } as any} value={newLeave.startDate} onChange={e => setNewLeave({ ...newLeave, startDate: e.target.value })} />
                    <input type="date" className="p-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:border-transparent" style={{ borderColor: BRAND.viking, '--tw-ring-color': BRAND.curious } as any} value={newLeave.endDate} onChange={e => setNewLeave({ ...newLeave, endDate: e.target.value })} />
                    <input type="number" placeholder="Days" className="p-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:border-transparent" style={{ borderColor: BRAND.viking, '--tw-ring-color': BRAND.curious } as any} value={newLeave.daysCount} onChange={e => setNewLeave({ ...newLeave, daysCount: parseInt(e.target.value) })} />
                    <input type="text" placeholder="Reason" className="p-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:border-transparent" style={{ borderColor: BRAND.viking, '--tw-ring-color': BRAND.curious } as any} value={newLeave.reason} onChange={e => setNewLeave({ ...newLeave, reason: e.target.value })} />
                  </div>
                  <button type="submit" disabled={loading} className="text-white px-4 py-2 rounded-lg transition-colors" style={{ backgroundColor: BRAND.curious }}>Submit Request</button>
                </form>
              </div>
            )}

            <div className="bg-white shadow overflow-hidden sm:rounded-md">
              <ul className="divide-y divide-gray-200">
                {leaveRequests.map((req) => (
                  <li key={req.id} className="px-4 py-4 sm:px-6 flex justify-between items-center hover:bg-gray-50">
                    <div>
                      <p className="text-sm font-medium truncate" style={{ color: BRAND.curious }}>{req.employeeId} - {req.leaveType}</p>
                      <p className="text-sm text-gray-500">{req.startDate} to {req.endDate} ({req.daysCount} days)</p>
                      <p className="text-xs text-gray-400">{req.reason}</p>
                      {req.approvalVcId && (
                        <p className="text-xs mt-1 flex items-center gap-2">
                          <span className="flex items-center gap-1" style={{ color: BRAND.curious }}>
                            <CheckCircleIcon className="h-4 w-4" />
                            <span className="font-mono">{req.approvalVcId.slice(0, 20)}...</span>
                          </span>
                          <button
                            onClick={() => handleReoffer('leave', req.id)}
                            className="text-xs font-medium hover:underline flex items-center gap-1"
                            style={{ color: BRAND.curious }}
                            title="Reoffer credential"
                          >
                            <QrCodeIcon className="h-4 w-4" />
                          </button>
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-4">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${req.status === 'approved' ? 'bg-green-100 text-green-800' :
                        req.status === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
                        }`}>
                        {req.status}
                      </span>
                      {req.status === 'pending' && (
                        <div className="flex gap-2">
                          <button onClick={() => updateStatus('leave', req.id, 'approved')} className="text-green-600 hover:text-green-900 text-sm font-medium">✓ Approve</button>
                          <button onClick={() => updateStatus('leave', req.id, 'rejected')} className="text-red-600 hover:text-red-900 text-sm font-medium">✗ Reject</button>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
                {leaveRequests.length === 0 && <li className="px-4 py-4 text-gray-500 text-center">No leave requests found.</li>}
              </ul>
            </div>
          </div>
        )}

        {/* Expenses Tab */}
        {activeTab === 'expenses' && (
          <div>
            <div className="flex justify-between mb-4">
              <h2 className="text-xl font-semibold" style={{ color: BRAND.dark }}>Expense Claims</h2>
              <button
                onClick={() => setShowExpenseForm(!showExpenseForm)}
                className="text-white px-4 py-2 rounded transition-colors"
                style={{ backgroundColor: showExpenseForm ? '#6B7280' : BRAND.curious }}
              >
                {showExpenseForm ? 'Cancel' : '+ New Claim'}
              </button>
            </div>

            {showExpenseForm && (
              <div className="flex justify-center mb-6">
                <form onSubmit={submitExpense} className="shadow-2xl rounded-xl p-8 bg-white max-w-2xl w-full">
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <input type="text" placeholder="Employee ID" className="p-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:border-transparent" style={{ borderColor: BRAND.viking, '--tw-ring-color': BRAND.curious } as any} value={newExpense.employeeId} onChange={e => setNewExpense({ ...newExpense, employeeId: e.target.value })} />
                    <select className="p-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:border-transparent" style={{ borderColor: BRAND.viking, '--tw-ring-color': BRAND.curious } as any} value={newExpense.category} onChange={e => setNewExpense({ ...newExpense, category: e.target.value })}>
                      <option value="meals">Meals</option>
                      <option value="travel">Travel</option>
                      <option value="equipment">Equipment</option>
                      <option value="other">Other</option>
                    </select>
                    <input type="text" placeholder="Description" className="p-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:border-transparent" style={{ borderColor: BRAND.viking, '--tw-ring-color': BRAND.curious } as any} value={newExpense.description} onChange={e => setNewExpense({ ...newExpense, description: e.target.value })} />
                    <div className="flex gap-2">
                      <input type="number" placeholder="Amount" className="p-2.5 border rounded-lg w-2/3 focus:outline-none focus:ring-2 focus:border-transparent" style={{ borderColor: BRAND.viking, '--tw-ring-color': BRAND.curious } as any} value={newExpense.amount} onChange={e => setNewExpense({ ...newExpense, amount: parseFloat(e.target.value) })} />
                      <input type="text" placeholder="USD" className="p-2.5 border rounded-lg w-1/3 bg-gray-100" style={{ borderColor: BRAND.viking }} value={newExpense.currency} readOnly />
                    </div>
                  </div>
                  <button type="submit" disabled={loading} className="text-white px-4 py-2 rounded-lg transition-colors" style={{ backgroundColor: BRAND.curious }}>Submit Claim</button>
                </form>
              </div>
            )}

            <div className="bg-white shadow overflow-hidden sm:rounded-md">
              <ul className="divide-y divide-gray-200">
                {expenseClaims.map((claim) => (
                  <li key={claim.id} className="px-4 py-4 sm:px-6 flex justify-between items-center hover:bg-gray-50">
                    <div>
                      <p className="text-sm font-medium truncate" style={{ color: BRAND.curious }}>{claim.employeeId} - {claim.category}</p>
                      <p className="text-sm text-gray-500">{claim.description}</p>
                      <p className="text-sm font-bold" style={{ color: BRAND.dark }}>${claim.amount} {claim.currency}</p>
                      {claim.approvalVcId && (
                        <p className="text-xs mt-1 flex items-center gap-2">
                          <span className="flex items-center gap-1" style={{ color: BRAND.curious }}>
                            <CheckCircleIcon className="h-4 w-4" />
                            <span className="font-mono">{claim.approvalVcId.slice(0, 20)}...</span>
                          </span>
                          <button
                            onClick={() => handleReoffer('expenses', claim.id)}
                            className="text-xs font-medium hover:underline flex items-center gap-1"
                            style={{ color: BRAND.curious }}
                            title="Reoffer credential"
                          >
                            <QrCodeIcon className="h-4 w-4" />
                          </button>
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-4">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${claim.status === 'approved' ? 'bg-green-100 text-green-800' :
                        claim.status === 'paid' ? 'bg-blue-100 text-blue-800' :
                          claim.status === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
                        }`}>
                        {claim.status}
                      </span>
                      {claim.status === 'pending' && (
                        <div className="flex gap-2">
                          <button onClick={() => updateStatus('expenses', claim.id, 'approved')} className="text-green-600 hover:text-green-900 text-sm font-medium">✓ Approve</button>
                          <button onClick={() => updateStatus('expenses', claim.id, 'rejected')} className="text-red-600 hover:text-red-900 text-sm font-medium">✗ Reject</button>
                        </div>
                      )}
                      {claim.status === 'approved' && (
                        <button onClick={() => updateStatus('expenses', claim.id, 'paid')} className="text-sm font-medium" style={{ color: BRAND.curious }}>💳 Mark Paid</button>
                      )}
                    </div>
                  </li>
                ))}
                {expenseClaims.length === 0 && <li className="px-4 py-4 text-gray-500 text-center">No expense claims found.</li>}
              </ul>
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
                      window.open(deeplink.startsWith('http') ? deeplink : reofferUri, '_blank');
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
};

export default HrOperations;
