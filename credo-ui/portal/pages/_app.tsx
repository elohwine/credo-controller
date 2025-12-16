import React from "react";
import axios from "axios";
import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { AvailableCredential } from "@/types/credentials";

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

  React.useEffect(() => {
    setLoading(true);
    axios.get('/api/env')
      .then((response) => {
        if (response.data.hasOwnProperty('NEXT_PUBLIC_VC_REPO')) {
          setEnv(response.data);

          // Fetch credentials with error handling
          axios
            .get(`${response.data.NEXT_PUBLIC_VC_REPO}/api/list`)
            .then((credentials) => {
              credentials.data.forEach((credential: string) => {
                axios
                  .get(
                    `${response.data.NEXT_PUBLIC_VC_REPO}/api/vc/${credential}`
                  )
                  .then((data) => {
                    setAvailableCredentials((prev) => [
                      ...prev,
                      {
                        id: credential,
                        title: credential,
                        offer: data.data,
                      },
                    ]);
                  })
                  .catch((err) => {
                    console.warn(`Failed to load credential ${credential}:`, err.message);
                  });
              });
            })
            .catch((err) => {
              console.warn('Failed to load credentials list:', err.message);
              setError('Could not load credentials. Backend may be offline.');
            });
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
  );
}
