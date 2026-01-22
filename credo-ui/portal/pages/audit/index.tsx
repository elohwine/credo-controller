import { useEffect, useState } from 'react';
import Head from 'next/head';
import Layout from '@/components/Layout';
import { ClipboardDocumentListIcon, FunnelIcon, ArrowPathIcon, ShieldCheckIcon, UserIcon, GlobeAltIcon } from '@heroicons/react/24/outline';
import { BRAND } from '@/lib/theme';

interface AuditLog {
  id: string;
  tenantId: string;
  actorDid?: string;
  actionType: string;
  resourceId?: string;
  details?: object;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

const ActionBadge: React.FC<{ action: string }> = ({ action }) => {
  const getStyle = (action: string) => {
    if (action.includes('create') || action.includes('issue')) return { bg: 'bg-green-100', text: 'text-green-800' };
    if (action.includes('delete') || action.includes('revoke')) return { bg: 'bg-red-100', text: 'text-red-800' };
    if (action.includes('update') || action.includes('approve')) return { bg: 'bg-blue-100', text: 'text-blue-800' };
    return { bg: 'bg-gray-100', text: 'text-gray-800' };
  };
  const style = getStyle(action);
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}>
      {action}
    </span>
  );
};

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [limit, setLimit] = useState(100);
  const [resourceId, setResourceId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
  const apiKey = process.env.NEXT_PUBLIC_CREDO_API_KEY || 'test-api-key-12345';

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      if (resourceId) params.set('resourceId', resourceId);

      const res = await fetch(`${backendUrl}/api/audit/logs?${params.toString()}`, {
        headers: { 'x-api-key': apiKey },
      });

      if (!res.ok) throw new Error('Failed to load audit logs');
      const data = await res.json();
      setLogs(data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = [
    { label: 'Total Logs', value: logs.length, icon: <ClipboardDocumentListIcon className="h-6 w-6" /> },
    { label: 'Unique Actors', value: new Set(logs.map(l => l.actorDid).filter(Boolean)).size, icon: <UserIcon className="h-6 w-6" /> },
    { label: 'Unique Resources', value: new Set(logs.map(l => l.resourceId).filter(Boolean)).size, icon: <ShieldCheckIcon className="h-6 w-6" /> },
    { label: 'Unique IPs', value: new Set(logs.map(l => l.ipAddress).filter(Boolean)).size, icon: <GlobeAltIcon className="h-6 w-6" /> },
  ];

  return (
    <Layout>
      <Head>
        <title>Audit Logs | Credentis Portal</title>
      </Head>
      <div className="px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="sm:flex sm:items-center sm:justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold" style={{ color: BRAND.dark }}>Audit Logs</h1>
            <p className="mt-2 text-sm" style={{ color: BRAND.curious }}>Tamper-aware operational trail across platform actions</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          {stats.map((stat, idx) => (
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

        {/* Filters */}
        <div className="rounded-xl shadow-sm p-6 mb-6 bg-white border" style={{ borderColor: BRAND.viking }}>
          <div className="flex items-center gap-2 mb-4">
            <FunnelIcon className="h-5 w-5" style={{ color: BRAND.curious }} />
            <h3 className="font-semibold" style={{ color: BRAND.dark }}>Filter Logs</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: BRAND.dark }}>Resource ID (optional)</label>
              <input
                value={resourceId}
                onChange={(e) => setResourceId(e.target.value)}
                className="w-full rounded-lg border-2 px-3 py-2"
                style={{ borderColor: BRAND.viking }}
                placeholder="e.g. RUN-2026-01"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: BRAND.dark }}>Limit</label>
              <input
                type="number"
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="w-full rounded-lg border-2 px-3 py-2"
                style={{ borderColor: BRAND.viking }}
                min={10}
                max={500}
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={fetchLogs}
                className="inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium text-white transition-all hover:shadow-md disabled:opacity-50"
                style={{ backgroundColor: BRAND.curious }}
                disabled={loading}
              >
                <ArrowPathIcon className={`h-5 w-5 mr-2 ${loading ? 'animate-spin' : ''}`} />
                {loading ? 'Loading…' : 'Refresh Logs'}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 p-4 mb-6 rounded-lg text-red-700">{error}</div>
        )}

        {/* Table */}
        <div className="overflow-hidden rounded-xl shadow ring-1 ring-black ring-opacity-5">
          <table className="min-w-full divide-y divide-gray-200">
            <thead style={{ backgroundColor: BRAND.linkWater }}>
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase" style={{ color: BRAND.dark }}>Time</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase" style={{ color: BRAND.dark }}>Action</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase" style={{ color: BRAND.dark }}>Resource</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase" style={{ color: BRAND.dark }}>Actor</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase" style={{ color: BRAND.dark }}>IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-xs text-gray-500">{new Date(log.createdAt).toLocaleString()}</td>
                  <td className="px-6 py-4 text-sm"><ActionBadge action={log.actionType} /></td>
                  <td className="px-6 py-4 text-sm font-mono" style={{ color: BRAND.dark }}>{log.resourceId || '—'}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{log.actorDid ? `${log.actorDid.substring(0, 20)}...` : '—'}</td>
                  <td className="px-6 py-4 text-xs text-gray-400">{log.ipAddress || '—'}</td>
                </tr>
              ))}
              {logs.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-sm text-gray-500">
                    No audit logs found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
