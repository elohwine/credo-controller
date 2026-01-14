import React, { useContext, useEffect, useState } from 'react';
import axios from 'axios';
import Head from 'next/head';
import { CredentialsContext, EnvContext } from '@/pages/_app';
import CredentialDefinitionList from '@/components/credentials/CredentialDefinitionList';

interface CredentialDefinition {
  credentialDefinitionId: string;
  name: string;
  version: string;
  schemaId: string;
  issuerDid: string;
  credentialType: string[];
  format: string;
  claimsTemplate: Record<string, any>;
  createdAt: string;
}

export default function CredentialModelsPage() {
  const env = useContext(EnvContext);
  const [availableCredentials] = useContext(CredentialsContext);
  const [definitions, setDefinitions] = useState<CredentialDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDefinitions() {
      if (!env.NEXT_PUBLIC_VC_REPO) {
        console.log('Waiting for env to load...');
        return;
      }

      try {
        const credoBackend = env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000';
        const apiKey = process.env.NEXT_PUBLIC_CREDO_API_KEY || 'test-api-key-12345';

        // Get root token
        const rootTokenRes = await axios.post(
          `${credoBackend}/agent/token`,
          {},
          { headers: { Authorization: apiKey } }
        );
        const rootToken = rootTokenRes.data.token;

        // Get or create tenant
        let tenantId = localStorage.getItem('credoTenantId') || undefined;
        let tenantToken: string;

        if (!tenantId) {
          const createRes = await axios.post(
            `${credoBackend}/multi-tenancy/create-tenant`,
            {
              config: { label: 'Portal Tenant' },
            },
            { headers: { Authorization: `Bearer ${rootToken}` } }
          );
          tenantId = createRes.data.tenantId;
          tenantToken = createRes.data.token;
          if (tenantId) localStorage.setItem('credoTenantId', tenantId);
        } else {
          const tokenRes = await axios.post(
            `${credoBackend}/multi-tenancy/get-token/${tenantId}`,
            {},
            { headers: { Authorization: `Bearer ${rootToken}` } }
          );
          tenantToken = tokenRes.data.token;
        }

        // Fetch credential definitions
        const response = await axios.get(`${credoBackend}/oidc/credential-definitions`, {
          headers: { Authorization: `Bearer ${tenantToken}` },
        });

        setDefinitions(response.data || []);
        setIsLoading(false);
      } catch (err: any) {
        console.error('Error fetching credential definitions:', err);
        setError(err.message || 'Failed to load credential definitions');
        setIsLoading(false);
      }
    }

    fetchDefinitions();
  }, [env]);

  return (
    <>
      <Head>
        <title>Credential Models - Credentis Portal</title>
        <meta name="description" content="Browse and manage credential definition models" />
      </Head>

      <div className="py-6">
        <div className="bg-white border border-[#D0E6F3] rounded-xl p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Credential Models</h1>
              <p className="mt-1 text-sm text-gray-600">
                Browse and manage verifiable credential definitions by category
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span
                className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold"
                style={{ backgroundColor: '#D0E6F3', color: '#0F3F5E' }}
              >
                {definitions.length} {definitions.length === 1 ? 'Model' : 'Models'}
              </span>
              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center px-4 py-2 border rounded-full text-sm font-semibold bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2"
                style={{ borderColor: '#D0E6F3', color: '#0F3F5E', boxShadow: 'none' }}
              >
                <svg
                  className="-ml-1 mr-2 h-5 w-5"
                  style={{ color: '#2188CA' }}
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                Refresh
              </button>
            </div>
          </div>
        </div>

        <main className="py-8">
          {isLoading && (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-700"></div>
              <p className="ml-4 text-gray-600 text-lg">Loading credential models...</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg
                    className="h-5 w-5 text-red-400"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">Error loading credentials</h3>
                  <p className="mt-1 text-sm text-red-700">{error}</p>
                </div>
              </div>
            </div>
          )}

          {!isLoading && !error && <CredentialDefinitionList definitions={definitions || []} />}
        </main>

        {/* Footer Info */}
        <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 mt-12 border-t border-gray-200">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg
                  className="h-5 w-5 text-blue-400"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3 flex-1">
                <h3 className="text-sm font-medium text-blue-800">Credential Model Management</h3>
                <div className="mt-2 text-sm text-blue-700">
                  <p>
                    To seed additional credential models, run:{' '}
                    <code className="bg-blue-100 px-2 py-1 rounded font-mono text-xs">
                      yarn seed:models --apiKey test-api-key-12345
                    </code>
                  </p>
                  <p className="mt-2">
                    Models are tenant-isolated and stored in SQLite. Supported types: Payment, Identity, Educational Badges, Health Records (mDoc & EHR).
                  </p>
                </div>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
