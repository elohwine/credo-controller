import { useEffect, useState, useContext } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { UserGroupIcon, ClockIcon, CurrencyDollarIcon, BriefcaseIcon, DocumentTextIcon, UserPlusIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { BRAND, formatCurrency } from '@/lib/theme';
import { EnvContext } from '@/pages/_app';


interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  baseSalary: number;
  currency: string;
  status: string;
}

interface LeaveRequest {
  id: string;
  employeeId: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  status: string;
  approvalVcId?: string;
}

interface ExpenseClaim {
  id: string;
  employeeId: string;
  amount: number;
  currency: string;
  status: string;
  approvalVcId?: string;
}

interface OnboardingCase {
  id: string;
  fullName: string;
  candidateEmail: string;
  status: string;
  createdAt: string;
}

export default function HRHub() {
  const env = useContext(EnvContext);
  const backendUrl = env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [expenseClaims, setExpenseClaims] = useState<ExpenseClaim[]>([]);
  const [onboardingCases, setOnboardingCases] = useState<OnboardingCase[]>([]);
  const [showEmployeeForm, setShowEmployeeForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newEmployee, setNewEmployee] = useState({
    firstName: '',
    lastName: '',
    email: '',
    baseSalary: 0,
    currency: 'USD',
    nssaNumber: '',
    tin: '',
  });

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [employeesRes, leaveRes, expenseRes, onboardingRes] = await Promise.all([
        fetch(`${backendUrl}/api/payroll/employees`),
        fetch(`${backendUrl}/api/operations/leave`),
        fetch(`${backendUrl}/api/operations/expenses`),
        fetch(`${backendUrl}/api/onboarding/cases`),
      ]);

      const employeesData = await employeesRes.json();
      const leaveData = await leaveRes.json();
      const expenseData = await expenseRes.json();
      const onboardingData = await onboardingRes.json();

      setEmployees(employeesData || []);
      setLeaveRequests(leaveData || []);
      setExpenseClaims(expenseData || []);
      setOnboardingCases(onboardingData?.cases || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load HR data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${backendUrl}/api/payroll/employees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEmployee),
      });

      if (!res.ok) {
        throw new Error('Failed to create employee');
      }

      setShowEmployeeForm(false);
      setNewEmployee({ firstName: '', lastName: '', email: '', baseSalary: 0, currency: 'USD', nssaNumber: '', tin: '' });
      loadAll();
    } catch (err: any) {
      setError(err.message || 'Failed to create employee');
    } finally {
      setLoading(false);
    }
  };

  const pendingLeave = leaveRequests.filter((l) => l.status === 'pending').length;
  const pendingExpenses = expenseClaims.filter((e) => e.status === 'pending').length;
  const activeOnboarding = onboardingCases.filter((c) => c.status !== 'completed').length;

  return (
    <Layout>
      <Head>
        <title>HR & Payroll | Credentis Portal</title>
      </Head>

      <div className="px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="sm:flex sm:items-center sm:justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold" style={{ color: BRAND.dark }}>HR & Payroll</h1>
            <p className="mt-2 text-sm" style={{ color: BRAND.curious }}>Employees, onboarding, approvals, payroll & compliance</p>
          </div>
          <div className="mt-4 sm:mt-0">
            <button
              onClick={() => setShowEmployeeForm((prev) => !prev)}
              className="inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium text-white transition-all hover:shadow-md"
              style={{ backgroundColor: BRAND.curious }}
            >
              <UserPlusIcon className="h-5 w-5 mr-2" />
              {showEmployeeForm ? 'Cancel' : 'Add Employee'}
            </button>
          </div>
        </div>

        {error && <div className="bg-red-50 border border-red-200 p-4 mb-6 rounded-lg text-red-700">{error}</div>}

        {/* Stats */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          {[
            { label: 'Employees', value: employees.length, icon: <UserGroupIcon className="h-6 w-6" /> },
            { label: 'Pending Leave', value: pendingLeave, icon: <ClockIcon className="h-6 w-6" /> },
            { label: 'Pending Expenses', value: pendingExpenses, icon: <CurrencyDollarIcon className="h-6 w-6" /> },
            { label: 'Onboarding', value: activeOnboarding, icon: <BriefcaseIcon className="h-6 w-6" /> },
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

        {/* Quick Links */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Link href="/payroll" className="rounded-xl p-6 shadow-sm hover:shadow-md transition-all border-l-4" style={{ backgroundColor: 'white', borderColor: BRAND.curious }}>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg" style={{ backgroundColor: BRAND.linkWater }}>
                <DocumentTextIcon className="h-6 w-6" style={{ color: BRAND.curious }} />
              </div>
              <div>
                <h3 className="font-semibold" style={{ color: BRAND.dark }}>Payroll & Compliance</h3>
                <p className="text-sm text-gray-500">Runs, payslips, tax compliance VCs</p>
              </div>
            </div>
          </Link>
          <Link href="/hr/operations" className="rounded-xl p-6 shadow-sm hover:shadow-md transition-all border-l-4" style={{ backgroundColor: 'white', borderColor: BRAND.curious }}>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg" style={{ backgroundColor: BRAND.linkWater }}>
                <ClockIcon className="h-6 w-6" style={{ color: BRAND.curious }} />
              </div>
              <div>
                <h3 className="font-semibold" style={{ color: BRAND.dark }}>HR Operations</h3>
                <p className="text-sm text-gray-500">Leave, expenses, approvals with VC trail</p>
              </div>
            </div>
          </Link>
          <Link href="/onboarding" className="rounded-xl p-6 shadow-sm hover:shadow-md transition-all border-l-4" style={{ backgroundColor: 'white', borderColor: BRAND.curious }}>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg" style={{ backgroundColor: BRAND.linkWater }}>
                <BriefcaseIcon className="h-6 w-6" style={{ color: BRAND.curious }} />
              </div>
              <div>
                <h3 className="font-semibold" style={{ color: BRAND.dark }}>Employee Onboarding</h3>
                <p className="text-sm text-gray-500">Contracts, offers, onboarding status</p>
              </div>
            </div>
          </Link>
        </div>

        {/* Employee Form */}
        {showEmployeeForm && (
          <div className="rounded-xl shadow-sm p-6 mb-8 border" style={{ backgroundColor: 'white', borderColor: BRAND.viking }}>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-lg" style={{ backgroundColor: BRAND.linkWater }}>
                <UserPlusIcon className="h-6 w-6" style={{ color: BRAND.curious }} />
              </div>
              <h3 className="text-xl font-semibold" style={{ color: BRAND.dark }}>Add New Employee</h3>
            </div>
            <form onSubmit={handleCreateEmployee}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: BRAND.dark }}>First Name</label>
                  <input className="w-full rounded-lg border-gray-300 shadow-sm" placeholder="First Name" value={newEmployee.firstName} onChange={(e) => setNewEmployee({ ...newEmployee, firstName: e.target.value })} required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: BRAND.dark }}>Last Name</label>
                  <input className="w-full rounded-lg border-gray-300 shadow-sm" placeholder="Last Name" value={newEmployee.lastName} onChange={(e) => setNewEmployee({ ...newEmployee, lastName: e.target.value })} required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: BRAND.dark }}>Email</label>
                  <input className="w-full rounded-lg border-gray-300 shadow-sm" placeholder="Email" type="email" value={newEmployee.email} onChange={(e) => setNewEmployee({ ...newEmployee, email: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: BRAND.dark }}>Base Salary</label>
                  <input className="w-full rounded-lg border-gray-300 shadow-sm" placeholder="Base Salary" type="number" value={newEmployee.baseSalary} onChange={(e) => setNewEmployee({ ...newEmployee, baseSalary: parseFloat(e.target.value) })} required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: BRAND.dark }}>Currency</label>
                  <select className="w-full rounded-lg border-gray-300 shadow-sm" value={newEmployee.currency} onChange={(e) => setNewEmployee({ ...newEmployee, currency: e.target.value })}>
                    <option value="USD">USD</option>
                    <option value="ZWL">ZWL</option>
                    <option value="ZAR">ZAR</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: BRAND.dark }}>NSSA Number</label>
                  <input className="w-full rounded-lg border-gray-300 shadow-sm" placeholder="NSSA Number" value={newEmployee.nssaNumber} onChange={(e) => setNewEmployee({ ...newEmployee, nssaNumber: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: BRAND.dark }}>TIN</label>
                  <input className="w-full rounded-lg border-gray-300 shadow-sm" placeholder="Tax ID Number" value={newEmployee.tin} onChange={(e) => setNewEmployee({ ...newEmployee, tin: e.target.value })} />
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowEmployeeForm(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={loading} className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor: BRAND.curious }}>{loading ? 'Creating...' : 'Create Employee'}</button>
              </div>
            </form>
          </div>
        )}

        {/* Employees Table */}
        <div className="rounded-xl shadow-sm overflow-hidden mb-8" style={{ backgroundColor: 'white' }}>
          <div className="px-6 py-4 flex items-center justify-between" style={{ backgroundColor: BRAND.linkWater }}>
            <h3 className="text-lg font-semibold" style={{ color: BRAND.dark }}>Employees</h3>
            <span className="text-sm" style={{ color: BRAND.curious }}>{employees.length} total</span>
          </div>
          <table className="min-w-full divide-y divide-gray-200">
            <thead style={{ backgroundColor: BRAND.linkWater }}>
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase" style={{ color: BRAND.dark }}>Name</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase" style={{ color: BRAND.dark }}>Email</th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase" style={{ color: BRAND.dark }}>Salary</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase" style={{ color: BRAND.dark }}>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {employees.map((emp) => (
                <tr key={emp.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium" style={{ color: BRAND.dark }}>{emp.firstName} {emp.lastName}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{emp.email || '—'}</td>
                  <td className="px-6 py-4 text-sm text-right font-medium" style={{ color: BRAND.curious }}>{formatCurrency(emp.baseSalary, emp.currency)}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${emp.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                      {emp.status === 'active' && <CheckCircleIcon className="h-4 w-4" />}
                      {(emp.status || 'active').charAt(0).toUpperCase() + (emp.status || 'active').slice(1)}
                    </span>
                  </td>
                </tr>
              ))}
              {employees.length === 0 && !loading && (
                <tr><td colSpan={4} className="px-6 py-12 text-center text-sm text-gray-500">No employees found. Click "Add Employee" to create one.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-xl shadow-sm overflow-hidden" style={{ backgroundColor: 'white' }}>
            <div className="px-6 py-4" style={{ backgroundColor: BRAND.linkWater }}>
              <h3 className="font-semibold" style={{ color: BRAND.dark }}>Recent Leave Requests</h3>
            </div>
            <div className="p-6">
              {leaveRequests.length === 0 ? (
                <p className="text-center text-gray-500 py-4">No leave requests</p>
              ) : (
                <ul className="divide-y">
                  {leaveRequests.slice(0, 5).map((req) => (
                    <li key={req.id} className="py-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium" style={{ color: BRAND.dark }}>{req.employeeId} · {req.leaveType}</span>
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${req.status === 'approved' ? 'bg-green-100 text-green-800' : req.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'}`}>{req.status}</span>
                      </div>
                      {req.approvalVcId && <div className="text-xs mt-1" style={{ color: BRAND.curious }}>VC: {req.approvalVcId.slice(0, 18)}...</div>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="rounded-xl shadow-sm overflow-hidden" style={{ backgroundColor: 'white' }}>
            <div className="px-6 py-4" style={{ backgroundColor: BRAND.linkWater }}>
              <h3 className="font-semibold" style={{ color: BRAND.dark }}>Recent Expense Claims</h3>
            </div>
            <div className="p-6">
              {expenseClaims.length === 0 ? (
                <p className="text-center text-gray-500 py-4">No expense claims</p>
              ) : (
                <ul className="divide-y">
                  {expenseClaims.slice(0, 5).map((claim) => (
                    <li key={claim.id} className="py-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium" style={{ color: BRAND.dark }}>{claim.employeeId} · {formatCurrency(claim.amount, claim.currency)}</span>
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${claim.status === 'approved' ? 'bg-green-100 text-green-800' : claim.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'}`}>{claim.status}</span>
                      </div>
                      {claim.approvalVcId && <div className="text-xs mt-1" style={{ color: BRAND.curious }}>VC: {claim.approvalVcId.slice(0, 18)}...</div>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
