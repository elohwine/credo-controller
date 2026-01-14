import { useState, useEffect } from 'react';
import Head from 'next/head';
import Layout from '../../components/Layout';
import axios from 'axios';

const HrOperations = () => {
  const [activeTab, setActiveTab] = useState<'leave' | 'expenses'>('leave');
  const [leaveRequests, setLeaveRequests] = useState<any[]>([]);
  const [expenseClaims, setExpenseClaims] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const fetchLeave = async () => {
    try {
      const res = await axios.get(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000'}/api/operations/leave`);
      setLeaveRequests(res.data);
    } catch (err) { console.error(err); }
  };

  const fetchExpenses = async () => {
    try {
      const res = await axios.get(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000'}/api/operations/expenses`);
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
      await axios.post(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000'}/api/operations/leave`, newLeave);
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
      await axios.post(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000'}/api/operations/expenses`, newExpense);
      setShowExpenseForm(false);
      fetchExpenses();
    } catch (err: any) {
      setError(err.message);
    } finally { setLoading(false); }
  };

  const updateStatus = async (type: 'leave' | 'expenses', id: string, status: string) => {
    try {
      await axios.put(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000'}/api/operations/${type}/${id}/status`, {
        adminDid: 'did:key:admin', // Mock
        status
      });
      if (type === 'leave') fetchLeave();
      else fetchExpenses();
    } catch (err) { console.error(err); }
  };

  return (
    <Layout>
      <Head>
        <title>HR Operations | Credo Portal</title>
      </Head>
      <div className="p-6">
        <h1 className="text-3xl font-bold mb-6">HR Operations</h1>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('leave')}
              className={`${activeTab === 'leave' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Leave Requests
            </button>
            <button
              onClick={() => setActiveTab('expenses')}
              className={`${activeTab === 'expenses' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Expense Claims
            </button>
          </nav>
        </div>

        {/* Leave Tab */}
        {activeTab === 'leave' && (
          <div>
            <div className="flex justify-between mb-4">
              <h2 className="text-xl font-semibold">Leave Requests</h2>
              <button onClick={() => setShowLeaveForm(!showLeaveForm)} className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700">
                {showLeaveForm ? 'Cancel' : 'New Request'}
              </button>
            </div>

            {showLeaveForm && (
              <form onSubmit={submitLeave} className="bg-gray-50 p-4 rounded mb-6 border">
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <input type="text" placeholder="Employee ID" className="p-2 border rounded" value={newLeave.employeeId} onChange={e => setNewLeave({...newLeave, employeeId: e.target.value})} />
                  <select className="p-2 border rounded" value={newLeave.leaveType} onChange={e => setNewLeave({...newLeave, leaveType: e.target.value})}>
                    <option value="annual">Annual</option>
                    <option value="sick">Sick</option>
                    <option value="unpaid">Unpaid</option>
                  </select>
                  <input type="date" className="p-2 border rounded" value={newLeave.startDate} onChange={e => setNewLeave({...newLeave, startDate: e.target.value})} />
                  <input type="date" className="p-2 border rounded" value={newLeave.endDate} onChange={e => setNewLeave({...newLeave, endDate: e.target.value})} />
                  <input type="number" placeholder="Days" className="p-2 border rounded" value={newLeave.daysCount} onChange={e => setNewLeave({...newLeave, daysCount: parseInt(e.target.value)})} />
                  <input type="text" placeholder="Reason" className="p-2 border rounded" value={newLeave.reason} onChange={e => setNewLeave({...newLeave, reason: e.target.value})} />
                </div>
                <button type="submit" disabled={loading} className="bg-green-600 text-white px-4 py-2 rounded">Submit Request</button>
              </form>
            )}

            <div className="bg-white shadow overflow-hidden sm:rounded-md">
              <ul className="divide-y divide-gray-200">
                {leaveRequests.map((req) => (
                  <li key={req.id} className="px-4 py-4 sm:px-6 flex justify-between items-center">
                    <div>
                      <p className="text-sm font-medium text-indigo-600 truncate">{req.employeeId} - {req.leaveType}</p>
                      <p className="text-sm text-gray-500">{req.startDate} to {req.endDate} ({req.daysCount} days)</p>
                      <p className="text-xs text-gray-400">{req.reason}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        req.status === 'approved' ? 'bg-green-100 text-green-800' : 
                        req.status === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {req.status}
                      </span>
                      {req.status === 'pending' && (
                        <div className="flex gap-2">
                          <button onClick={() => updateStatus('leave', req.id, 'approved')} className="text-green-600 hover:text-green-900 text-sm">Approve</button>
                          <button onClick={() => updateStatus('leave', req.id, 'rejected')} className="text-red-600 hover:text-red-900 text-sm">Reject</button>
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
              <h2 className="text-xl font-semibold">Expense Claims</h2>
              <button onClick={() => setShowExpenseForm(!showExpenseForm)} className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700">
                {showExpenseForm ? 'Cancel' : 'New Claim'}
              </button>
            </div>

            {showExpenseForm && (
              <form onSubmit={submitExpense} className="bg-gray-50 p-4 rounded mb-6 border">
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <input type="text" placeholder="Employee ID" className="p-2 border rounded" value={newExpense.employeeId} onChange={e => setNewExpense({...newExpense, employeeId: e.target.value})} />
                  <select className="p-2 border rounded" value={newExpense.category} onChange={e => setNewExpense({...newExpense, category: e.target.value})}>
                    <option value="meals">Meals</option>
                    <option value="travel">Travel</option>
                    <option value="equipment">Equipment</option>
                    <option value="other">Other</option>
                  </select>
                  <input type="text" placeholder="Description" className="p-2 border rounded" value={newExpense.description} onChange={e => setNewExpense({...newExpense, description: e.target.value})} />
                  <div className="flex gap-2">
                    <input type="number" placeholder="Amount" className="p-2 border rounded w-2/3" value={newExpense.amount} onChange={e => setNewExpense({...newExpense, amount: parseFloat(e.target.value)})} />
                    <input type="text" placeholder="USD" className="p-2 border rounded w-1/3" value={newExpense.currency} readOnly />
                  </div>
                </div>
                <button type="submit" disabled={loading} className="bg-green-600 text-white px-4 py-2 rounded">Submit Claim</button>
              </form>
            )}

            <div className="bg-white shadow overflow-hidden sm:rounded-md">
              <ul className="divide-y divide-gray-200">
                {expenseClaims.map((claim) => (
                  <li key={claim.id} className="px-4 py-4 sm:px-6 flex justify-between items-center">
                    <div>
                      <p className="text-sm font-medium text-indigo-600 truncate">{claim.employeeId} - {claim.category}</p>
                      <p className="text-sm text-gray-500">{claim.description}</p>
                      <p className="text-sm font-bold text-gray-900">${claim.amount} {claim.currency}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        claim.status === 'approved' ? 'bg-green-100 text-green-800' : 
                        claim.status === 'paid' ? 'bg-blue-100 text-blue-800' : 
                        claim.status === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {claim.status}
                      </span>
                      {claim.status === 'pending' && (
                        <div className="flex gap-2">
                          <button onClick={() => updateStatus('expenses', claim.id, 'approved')} className="text-green-600 hover:text-green-900 text-sm">Approve</button>
                          <button onClick={() => updateStatus('expenses', claim.id, 'rejected')} className="text-red-600 hover:text-red-900 text-sm">Reject</button>
                        </div>
                      )}
                      {claim.status === 'approved' && (
                         <button onClick={() => updateStatus('expenses', claim.id, 'paid')} className="text-blue-600 hover:text-blue-900 text-sm">Mark Paid</button>
                      )}
                    </div>
                  </li>
                ))}
                {expenseClaims.length === 0 && <li className="px-4 py-4 text-gray-500 text-center">No expense claims found.</li>}
              </ul>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default HrOperations;
