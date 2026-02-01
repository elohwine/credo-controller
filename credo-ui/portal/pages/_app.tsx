import React from "react";
import axios from "axios";
import "@/styles/globals.css";
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/dates/styles.css';
import type { AppProps } from "next/app";
import { AvailableCredential } from "@/types/credentials";
import { MantineProvider, ColorSchemeScript } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { credentisTheme } from '@/lib/theme/credentis-theme';

import Layout from "@/components/Layout";

export const EnvContext = React.createContext({} as { [key: string]: string });
export const CredentialsContext = React.createContext([
  [],
  (credentials: AvailableCredential[]) => { },
] as [AvailableCredential[], (credentials: AvailableCredential[]) => void]);

export default function App({ Component, pageProps }: AppProps) {
  const [AvailableCredentials, setAvailableCredentials] = React.useState<
    AvailableCredential[]
  >([]);
  const [env, setEnv] = React.useState({} as { [key: string]: string });
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  // Consolidated initialization - only runs once on mount
  React.useEffect(() => {
    let isMounted = true;

    const initializeApp = async () => {
      setLoading(true);

      try {
        // 1. Get env config
        const envRes = await axios.get('/api/env');
        if (!envRes.data.hasOwnProperty('NEXT_PUBLIC_VC_REPO')) {
          setError('Environment configuration is incomplete. Please check .env.local file.');
          return;
        }

        if (!isMounted) return;
        setEnv(envRes.data);

        const credoBackend = envRes.data.NEXT_PUBLIC_VC_REPO;
        // Use Holder URL (Port 6000) for tenant operations if available
        const holderBackend = envRes.data.NEXT_PUBLIC_HOLDER_URL || credoBackend;
        const apiKey = process.env.NEXT_PUBLIC_CREDO_API_KEY || 'test-api-key-12345';

        // 2. Check for cached tenant
        let tenantId = localStorage.getItem('credoTenantId');
        let tenantToken = localStorage.getItem('credoTenantToken');

        // Cleanup invalid storage
        if (tenantId === 'undefined' || tenantId === 'null') {
          localStorage.removeItem('credoTenantId');
          tenantId = null;
        }
        if (tenantToken === 'undefined' || tenantToken === 'null') {
          localStorage.removeItem('credoTenantToken');
          tenantToken = null;
        }

        // 3. Validate existing tenant (single check)
        let needsNewTenant = !tenantId || !tenantToken;

        if (tenantId && tenantToken) {
          try {
            // Validate against the HOLDER agent
            await axios.get(`${holderBackend}/agent`, {
              headers: { Authorization: `Bearer ${tenantToken}` }
            });
            console.log('[App] Using cached portal tenant:', tenantId);
          } catch (e: any) {
            console.warn('[App] Cached tenant invalid, will re-provision');
            needsNewTenant = true;
          }
        }

        // 4. Create new tenant if needed (only ONE token call)
        if (needsNewTenant) {
          console.log('[App] Initializing new portal tenant...');

          const rootTokenRes = await axios.post(
            `${holderBackend}/agent/token`,
            {},
            { headers: { Authorization: apiKey } }
          );
          const rootToken = rootTokenRes.data.token;

          const createRes = await axios.post(
            `${holderBackend}/multi-tenancy/create-tenant`,
            {
              config: { label: 'Portal Default Tenant', tenantType: 'USER' },
              baseUrl: holderBackend
            },
            { headers: { Authorization: `Bearer ${rootToken}` } }
          );

          tenantId = createRes.data.tenantId;
          tenantToken = createRes.data.token;

          if (tenantId) localStorage.setItem('credoTenantId', tenantId);
          if (tenantToken) localStorage.setItem('credoTenantToken', tenantToken);
          console.log('[App] New portal tenant initialized:', tenantId);
        }

        // 5. Fetch credentials (only if we have valid token)
        if (tenantToken) {
          try {
            const defsRes = await axios.get(`${credoBackend}/oidc/credential-definitions`, {
              headers: { Authorization: `Bearer ${tenantToken}` },
            });

            const defs: any[] = Array.isArray(defsRes.data) ? defsRes.data : [];
            const credentials = defs.map((def) => ({
              id: def.name || def.credentialDefinitionId,
              title: def.name || def.credentialDefinitionId,
              offer: {
                credentialType: def.credentialType || [],
                claimsTemplate: def.claimsTemplate || {},
              },
            }));

            if (isMounted) setAvailableCredentials(credentials);
          } catch (err: any) {
            console.warn('Failed to load credentials:', err.message);
          }
        }

      } catch (err: any) {
        const isNetworkError = err.code === 'ERR_NETWORK' || err.message?.includes('Network Error');
        const errorMessage = isNetworkError
          ? '⚠️ Backend not reachable. Please start the Credo controller at localhost:3000'
          : `Configuration error: ${err.message}`;

        console.error('App initialization error:', errorMessage);
        if (isMounted) setError(errorMessage);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    initializeApp();

    return () => { isMounted = false; };
  }, []);

  return (
    <MantineProvider theme={credentisTheme} defaultColorScheme="light">
      <Notifications position="top-right" />
      <EnvContext.Provider value={env}>
        <CredentialsContext.Provider
          value={[AvailableCredentials, setAvailableCredentials]}
        >
          {error && (
            <div
              style={{
                position: 'fixed',
                top: '20px',
                right: '20px',
                backgroundColor: '#ef4444',
                color: 'white',
                padding: '16px 24px',
                borderRadius: '8px',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                zIndex: 9999,
                maxWidth: '400px',
                display: 'flex',
                alignItems: 'start',
                gap: '12px'
              }}
            >
              <span style={{ fontSize: '20px' }}>⚠️</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Connection Error</div>
                <div style={{ fontSize: '14px' }}>{error}</div>
              </div>
              <button
                onClick={() => setError(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '20px',
                  padding: '0',
                  lineHeight: '1'
                }}
              >
                ×
              </button>
            </div>
          )}

          {loading && !error && (
            <div
              style={{
                position: 'fixed',
                top: '20px',
                right: '20px',
                backgroundColor: '#3b82f6',
                color: 'white',
                padding: '12px 20px',
                borderRadius: '8px',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                zIndex: 9999,
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}
            >
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
              <span>Connecting to backend...</span>
            </div>
          )}

          <Layout>
            <Component {...pageProps} />
          </Layout>
        </CredentialsContext.Provider>
      </EnvContext.Provider>
    </MantineProvider>
  );
}
