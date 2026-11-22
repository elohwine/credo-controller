import { useEffect, useState, useContext } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { ClockIcon, CurrencyDollarIcon, DocumentTextIcon, ClipboardDocumentListIcon } from '@heroicons/react/24/outline';
import { BRAND, formatCurrency } from '@/lib/theme';
import { EnvContext } from '@/pages/_app';
import { requestStatusWords } from '@/lib/requestCatalog';
import { getOrgScopedToken, getPersonalToken, readActiveOrganization } from '@/utils/organizationContext';
import { PRODUCT_NAME } from '../../../../src/config/productEdition';
import { usePortalOperations } from '@/lib/operations';
import { useRequireOrgContext } from '@/lib/portalContext';
import { PeopleDirectory } from '../../../shared/people/PeopleDirectory';

/** A time-off or expense request from the platform request engine. */
interface HrRequest {
  id: string;
  title?: string;
  amount?: number | null;
  currency?: string | null;
  status?: string;
}

const WAITING_STATUSES = new Set(['submitted', 'pending', 'in_review', 'under_review']);

/**
 * The team directory is the single place to manage employee details and app access.
 * Payroll and people requests remain separate workflows within HR operations.
 */
export default function HRHub() {
  useRequireOrgContext('/inbox');
  const env = useContext(EnvContext);
  const backendUrl = env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
  const { api, notify } = usePortalOperations();

  const [leaveRequests, setLeaveRequests] = useState<HrRequest[]>([]);
  const [expenseClaims, setExpenseClaims] = useState<HrRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const org = readActiveOrganization();
        const token = (org?.orgTenantId ? getOrgScopedToken() : null) || getPersonalToken();
        if (!token) return;
        const headers = { Authorization: `Bearer ${token}` };
        const requestsOf = async (requestType: string): Promise<HrRequest[]> => {
          const res = await fetch(`${backendUrl}/api/platform/requests?requestType=${encodeURIComponent(requestType)}&limit=20`, { headers });
          if (!res.ok) return [];
          const data = await res.json();
          return Array.isArray(data?.items) ? data.items : [];
        };
        const [leaveData, expenseData] = await Promise.all([
          requestsOf('hr.leave'),
          requestsOf('finance.expense_claim'),
        ]);
        setLeaveRequests(leaveData);
        setExpenseClaims(expenseData);
      } catch (err: any) {
        setError(err.message || 'Could not load HR requests');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [backendUrl]);

  const pendingLeave = leaveRequests.filter((l) => WAITING_STATUSES.has(String(l.status))).length;
  const pendingExpenses = expenseClaims.filter((e) => WAITING_STATUSES.has(String(e.status))).length;

  const links = [
    { href: '/payroll', title: 'Payroll', text: 'Run payroll, issue payslips and manage tax filings', icon: <DocumentTextIcon className="h-6 w-6" style={{ color: BRAND.curious }} /> },
    { href: '/hr/operations', title: 'Time off & expenses', text: 'Ask for time off or claim an expense', icon: <ClockIcon className="h-6 w-6" style={{ color: BRAND.curious }} /> },
    { href: '/requests?tab=people', title: 'Staff requests', text: 'Everything waiting for a decision about people', icon: <ClipboardDocumentListIcon className="h-6 w-6" style={{ color: BRAND.curious }} /> },
  ];

  return (
    <Layout>
      <Head>
        <title>{`HR operations | ${PRODUCT_NAME} Portal`}</title>
      </Head>

      <div className="px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold" style={{ color: 'var(--mantine-color-text)' }}>HR operations</h1>
          <p className="mt-2 text-sm" style={{ color: BRAND.curious }}>Manage your team, employee details, app access, payroll and people requests in one place.</p>
        </div>

        {error && <div className="bg-red-50 border border-red-200 p-4 mb-6 rounded-lg text-red-700">{error}</div>}

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 mb-8">
          {[
            { label: 'Time off waiting', value: pendingLeave, icon: <ClockIcon className="h-6 w-6" />, href: '/hr/operations' },
            { label: 'Expenses waiting', value: pendingExpenses, icon: <CurrencyDollarIcon className="h-6 w-6" />, href: '/hr/operations' },
          ].map((stat) => (
            <Link key={stat.label} href={stat.href} className="relative overflow-hidden rounded-xl p-6 shadow-sm hover:shadow-md transition-all" style={{ backgroundColor: BRAND.linkWater }}>
              <div className="absolute rounded-lg p-3" style={{ backgroundColor: BRAND.curious }}>
                <span className="text-white">{stat.icon}</span>
              </div>
              <p className="ml-16 truncate text-sm font-medium" style={{ color: BRAND.text }}>{stat.label}</p>
              <p className="ml-16 text-2xl font-semibold" style={{ color: BRAND.text }}>{loading ? '…' : stat.value}</p>
            </Link>
          ))}
        </div>

        <section className="mb-8 rounded-xl border bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5">
            <h2 className="text-xl font-semibold" style={{ color: BRAND.text }}>Team & employee records</h2>
            <p className="mt-1 text-sm text-gray-500">Add and manage each person, their staff details, app access and pay information here. Organisation setup links back to this same directory.</p>
          </div>
          <PeopleDirectory
            api={api}
            orgTenantId={readActiveOrganization()?.orgTenantId || ''}
            surface="portal"
            role={String(readActiveOrganization()?.role || '').toLowerCase()}
            notify={notify}
            onOpenJob={(runId) => { window.location.href = `/finance/job-cards?runId=${encodeURIComponent(runId)}`; }}
          />
        </section>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="rounded-xl p-6 shadow-sm hover:shadow-md transition-all border-l-4" style={{ backgroundColor: 'white', borderColor: BRAND.curious }}>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg" style={{ backgroundColor: BRAND.linkWater }}>{link.icon}</div>
                <div>
                  <h3 className="font-semibold" style={{ color: BRAND.text }}>{link.title}</h3>
                  <p className="text-sm text-gray-500">{link.text}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-xl shadow-sm overflow-hidden" style={{ backgroundColor: 'white' }}>
            <div className="px-6 py-4" style={{ backgroundColor: BRAND.linkWater }}>
              <h3 className="font-semibold" style={{ color: BRAND.text }}>Recent time off</h3>
            </div>
            <div className="p-6">
              {leaveRequests.length === 0 ? (
                <p className="text-center text-gray-500 py-4">No time off requests yet</p>
              ) : (
                <ul className="divide-y">
                  {leaveRequests.slice(0, 5).map((req) => (
                    <li key={req.id} className="py-3">
                      <Link href={`/requests?request=${encodeURIComponent(req.id)}`} className="flex justify-between items-center">
                        <span className="text-sm font-medium" style={{ color: BRAND.text }}>{req.title || 'Time off'}</span>
                        <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-800">{requestStatusWords(req.status).label}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="rounded-xl shadow-sm overflow-hidden" style={{ backgroundColor: 'white' }}>
            <div className="px-6 py-4" style={{ backgroundColor: BRAND.linkWater }}>
              <h3 className="font-semibold" style={{ color: BRAND.text }}>Recent expense claims</h3>
            </div>
            <div className="p-6">
              {expenseClaims.length === 0 ? (
                <p className="text-center text-gray-500 py-4">No expense claims yet</p>
              ) : (
                <ul className="divide-y">
                  {expenseClaims.slice(0, 5).map((claim) => (
                    <li key={claim.id} className="py-3">
                      <Link href={`/requests?request=${encodeURIComponent(claim.id)}`} className="flex justify-between items-center">
                        <span className="text-sm font-medium" style={{ color: BRAND.text }}>{claim.title || 'Expense claim'}{claim.amount ? ` · ${formatCurrency(claim.amount, claim.currency || 'USD')}` : ''}</span>
                        <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-800">{requestStatusWords(claim.status).label}</span>
                      </Link>
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
