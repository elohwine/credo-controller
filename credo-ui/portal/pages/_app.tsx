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

  // Initialize tenant globally
  React.useEffect(() => {
    if (env.NEXT_PUBLIC_VC_REPO) {
      const credoBackend = env.NEXT_PUBLIC_VC_REPO;
      const apiKey = process.env.NEXT_PUBLIC_CREDO_API_KEY || 'test-api-key-12345';

      const initializeTenant = async () => {
        try {
          let tenantId = localStorage.getItem('credoTenantId');
          let tenantToken = localStorage.getItem('credoTenantToken');

          // Cleanup invalid storage
          if (tenantId === 'undefined' || tenantId === 'null') { localStorage.removeItem('credoTenantId'); tenantId = null; }
          if (tenantToken === 'undefined' || tenantToken === 'null') { localStorage.removeItem('credoTenantToken'); tenantToken = null; }
          // Remove legacy token key to avoid confusion
          localStorage.removeItem('tenantToken');

          // Validate existing token
          if (tenantId && tenantToken) {
            try {
              const agentInfo = await axios.get(`${credoBackend}/agent`, { headers: { Authorization: `Bearer ${tenantToken}` } });
              // Also verify we have issuer metadata (ORG tenant) AND specific models
              // Use public endpoint (no auth required) to check what the issuer advertises
              const oidcMetaUrl = `${credoBackend}/tenants/${tenantId}/.well-known/openid-credential-issuer`;
              const tenantMeta = await axios.get(oidcMetaUrl);
              const issuerMeta = tenantMeta.data;

              if (!issuerMeta || Object.keys(issuerMeta).length === 0) {
                throw new Error('Tenant is missing issuer metadata (likely USER type)');
              }

              // Check if critical models are supported (CartSnapshotVC and EHRSummary)
              const supportedConfigs = issuerMeta.credential_configurations_supported || {};
              const supportedIds = Object.keys(supportedConfigs);

              if (supportedIds.length === 0) {
                console.error('[App] Tenant has NO supported credential configurations in metadata.');
                throw new Error('Tenant has empty issuer metadata. Re-provisioning...');
              }

              const hasCommerce = supportedIds.some(k => k.includes('CartSnapshotVC'));
              const hasHealth = supportedIds.some(k => k.includes('EHRSummary'));

              if (!hasCommerce || !hasHealth) {
                console.error('[App] Tenant missing models in metadata. IDs:', supportedIds);
                throw new Error('Tenant missing required credential models (Commerce or Health). Re-provisioning...');
              }

              console.log('[App] Existing ORG tenant validated with all models.');
            } catch (e: any) {
              console.warn('[App] Stored tenant invalid or missing issuer, clearing...', e.message);
              localStorage.removeItem('credoTenantId');
              localStorage.removeItem('credoTenantToken');
              tenantId = null;
              tenantToken = null;
            }
          }

          if (!tenantId || !tenantToken) {
            console.log('[App] Initializing default portal tenant...');
            // 1. Get root token
            const rootTokenRes = await axios.post(`${credoBackend}/agent/token`, {}, { headers: { Authorization: apiKey } });
            const rootToken = rootTokenRes.data.token;

            // 2. Create or get tenant
            const createRes = await axios.post(
              `${credoBackend}/multi-tenancy/create-tenant`,
              {
                config: {
                  label: 'Portal Default Tenant',
                  tenantType: 'ORG'
                },
                baseUrl: credoBackend
              },
              { headers: { Authorization: `Bearer ${rootToken}` } }
            );

            tenantId = createRes.data.tenantId;
            tenantToken = createRes.data.token;

            if (tenantId) localStorage.setItem('credoTenantId', tenantId);
            if (tenantToken) localStorage.setItem('credoTenantToken', tenantToken);
            console.log('[App] Default portal tenant initialized:', tenantId);
          } else {
            console.log('[App] Using existing portal tenant:', tenantId);
          }
        } catch (err: any) {
          console.error('[App] Failed to initialize portal tenant:', err.message);
          // If we failed with 401/403/404, maybe our token is bad or tenant doesn't exist. Clear it to retry next time.
          if (err.response && (err.response.status === 401 || err.response.status === 403 || err.response.status === 404)) {
            console.warn('[App] Clearing stale tenant credentials due to', err.response.status);
            localStorage.removeItem('credoTenantId');
            localStorage.removeItem('credoTenantToken');
            // Reload to re-initialize
            window.location.reload();
          }
        }

      };

      initializeTenant();
    }
  }, [env]);

  React.useEffect(() => {
    setLoading(true);
    axios.get('/api/env')
      .then(async (response) => {
        if (response.data.hasOwnProperty('NEXT_PUBLIC_VC_REPO')) {
          setEnv(response.data);

          try {
            const credoBackend = response.data.NEXT_PUBLIC_VC_REPO;
            const apiKey = process.env.NEXT_PUBLIC_CREDO_API_KEY || 'test-api-key-12345';

            // Get root token
            const rootTokenRes = await axios.post(
              `${credoBackend}/agent/token`,
              {},
              { headers: { Authorization: apiKey } }
            );
            const rootToken = rootTokenRes.data.token;

            // Get or create tenant
            let tenantId = localStorage.getItem('credoTenantId');
            let tenantToken: string;

            if (!tenantId || tenantId === 'undefined' || tenantId === 'null') {
              const createRes = await axios.post(
                `${credoBackend}/multi-tenancy/create-tenant`,
                { config: { label: 'Portal Tenant' }, baseUrl: credoBackend },
                { headers: { Authorization: `Bearer ${rootToken}` } }
              );
              tenantId = createRes.data.tenantId;
              tenantToken = createRes.data.token;
              if (tenantId) localStorage.setItem('credoTenantId', tenantId);
              if (tenantToken) localStorage.setItem('credoTenantToken', tenantToken);
            } else {
              const tokenRes = await axios.post(
                `${credoBackend}/multi-tenancy/get-token/${tenantId}`,
                {},
                { headers: { Authorization: `Bearer ${rootToken}` } }
              );
              tenantToken = tokenRes.data.token;
              if (tenantToken) localStorage.setItem('credoTenantToken', tenantToken);
            }

            // Fetch credential definitions from the modern endpoint
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

            setAvailableCredentials(credentials);
          } catch (err: any) {
            console.warn('Failed to load credentials:', err.message);
            setError('Could not load credentials. Backend may be offline.');
          }
        } else {
          setError('Environment configuration is incomplete. Please check .env.local file.');
        }
      })
      .catch((err) => {
        const isNetworkError = err.code === 'ERR_NETWORK' || err.message.includes('Network Error');
        const errorMessage = isNetworkError
          ? '⚠️ Backend not reachable. Please start the Credo controller at localhost:3000'
          : `Configuration error: ${err.message}`;

        console.error('App initialization error:', errorMessage);
        setError(errorMessage);
      })
      .finally(() => {
        setLoading(false);
      });
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
