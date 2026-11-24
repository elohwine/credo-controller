import React from 'react'
import axios from 'axios'
import '@/styles/globals.css'
import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'
import '@mantine/dates/styles.css'
import 'mantine-datatable/styles.css'
import type { AppProps } from 'next/app'
import { AvailableCredential } from '@/types/credentials'
import { Loader, MantineProvider, localStorageColorSchemeManager, v8CssVariablesResolver } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { MilestoneHost } from '@/components/feedback/Milestone'
import { credentisTheme } from '@/lib/theme/credentis-theme'
import { useActiveTabInView } from '@/lib/tabs'

import Layout from '@/components/Layout'
import { clearCurrentSession } from '@/lib/savedAccounts'
import { clearStoredOrganizationContext, hasSignedInSession } from '@/utils/organizationContext'
import { CONTEXT_UPDATED_EVENT } from '@/lib/portalContext'
import { PIN_CHANGE_FLAG } from '../../shared/security/AccountSecurity'

// A missing connection should fail at once and leave the last screen in place.
// Waiting for the browser to time out is what makes the app feel stuck.
const portalAxios = axios as typeof axios & { __offlineFastFail?: boolean }
if (typeof window !== 'undefined' && !portalAxios.__offlineFastFail) {
  portalAxios.__offlineFastFail = true
  axios.interceptors.request.use((config) => {
    if (window.navigator.onLine === false) {
      return Promise.reject(Object.assign(new Error('offline'), { code: 'OFFLINE' }))
    }
    return config
  })
  // A temporary PIN from an organisation opens nothing but the change-PIN screen.
  axios.interceptors.response.use(undefined, (error) => {
    if (error?.response?.status === 403 && error?.response?.data?.code === 'pin_change_required') {
      localStorage.setItem(PIN_CHANGE_FLAG, '1')
      if (!window.location.pathname.startsWith('/auth/change-pin')) {
        const back = `${window.location.pathname}${window.location.search}`
        window.location.replace(`/auth/change-pin?returnUrl=${encodeURIComponent(back)}`)
      }
    }
    return Promise.reject(error)
  })
}

export const EnvContext = React.createContext({} as { [key: string]: string })
export const CredentialsContext = React.createContext([[], (credentials: AvailableCredential[]) => {}] as [
  AvailableCredential[],
  (credentials: AvailableCredential[]) => void,
])

export default function App({ Component, pageProps }: AppProps) {
  useActiveTabInView()
  const [AvailableCredentials, setAvailableCredentials] = React.useState<AvailableCredential[]>([])
  const [env, setEnv] = React.useState({} as { [key: string]: string })
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)

  // Consolidated initialization - only runs once on mount
  React.useEffect(() => {
    let isMounted = true

    const initializeApp = async () => {
      setLoading(true)

      try {
        // 1. Get env config
        const envRes = await axios.get('/api/env')
        if (!envRes.data.hasOwnProperty('NEXT_PUBLIC_VC_REPO')) {
          setError('Environment configuration is incomplete. Please check .env.local file.')
          return
        }

        if (!isMounted) return
        setEnv(envRes.data)

        const apiBaseUrl = envRes.data.NEXT_PUBLIC_VC_REPO

        // 2. Check for cached tenant
        let tenantId = localStorage.getItem('credoTenantId')
        let tenantToken = localStorage.getItem('credoTenantToken')

        // Cleanup invalid storage
        if (tenantId === 'undefined' || tenantId === 'null') {
          localStorage.removeItem('credoTenantId')
          tenantId = null
        }
        if (tenantToken === 'undefined' || tenantToken === 'null') {
          localStorage.removeItem('credoTenantToken')
          tenantToken = null
        }

        // If the stored context is an org context, keep the personal wallet token
        // separately so the org session isn't overwritten.
        const isOrgContext = localStorage.getItem('credoContextMode') === 'org'
        const walletToken = localStorage.getItem('walletToken')

        // Only a real sign-in leaves a wallet, auth or organisation token. A guest tenant token
        // (shop checkout, or the old anonymous start-up) is kept for register to claim, but is not a session.
        const signedIn = hasSignedInSession()
        if (!signedIn) {
          tenantId = null
          tenantToken = null
        }
        if (isOrgContext && walletToken && walletToken !== tenantToken) {
          // Use the personal wallet token for app-level validation, but don't overwrite org token.
          tenantToken = walletToken
          tenantId = null // Let validation proceed with wallet token
        }

        // 3. Validate the signed-in session (single check). Signed-out visitors get no session;
        // Layout sends them to sign in.
        if (tenantToken) {
          try {
            await axios.get(`${apiBaseUrl}/agent`, {
              headers: { Authorization: `Bearer ${tenantToken}` },
            })
            // Only normalize keys when NOT in org context so we don't clobber org session.
            if (!isOrgContext) {
              localStorage.setItem('credoTenantId', tenantId || '')
              localStorage.setItem('tenantId', tenantId || '')
              localStorage.setItem('credoTenantToken', tenantToken)
              localStorage.setItem('tenantToken', tenantToken)
            }
            console.log('[App] Using cached portal tenant:', tenantId)
          } catch (e: any) {
            const responseStatus = Number(e?.response?.status || 0)
            const pinChangePending = responseStatus === 403 && e?.response?.data?.code === 'pin_change_required'
            const sessionRejected = !pinChangePending && (responseStatus === 401 || responseStatus === 403)
            if (pinChangePending) {
              // Signed in with a temporary PIN: keep the session, the change-PIN screen opens next.
              localStorage.setItem(PIN_CHANGE_FLAG, '1')
            } else if (isOrgContext && !sessionRejected) {
              // The API was unreachable or had a hiccup (for example a restart). Keep the
              // organization session; dropping it here would silently log the operator out.
              console.warn('[App] Could not validate session right now; keeping organization context')
            } else if (sessionRejected) {
              // The session expired or was revoked: sign out fully so Layout sends the person to sign in.
              console.warn('[App] Session rejected; signing out')
              clearCurrentSession()
              clearStoredOrganizationContext()
              tenantToken = null
              window.dispatchEvent(new Event(CONTEXT_UPDATED_EVENT))
            } else {
              console.warn('[App] Could not validate session right now; keeping it')
            }
          }
        }

        // 5. Fetch credentials (only if we have valid token)
        if (tenantToken) {
          try {
            const defsRes = await axios.get(`${apiBaseUrl}/oidc/credential-definitions`, {
              headers: { Authorization: `Bearer ${tenantToken}` },
            })

            const defs: any[] = Array.isArray(defsRes.data) ? defsRes.data : []
            const credentials = defs.map((def) => ({
              id: def.name || def.credentialDefinitionId,
              title: def.name || def.credentialDefinitionId,
              offer: {
                credentialType: def.credentialType || [],
                claimsTemplate: def.claimsTemplate || {},
              },
            }))

            if (isMounted) setAvailableCredentials(credentials)
          } catch (err: any) {
            console.warn('Failed to load credentials:', err.message)
          }
        }
      } catch (err: any) {
        const isNetworkError = err.code === 'ERR_NETWORK' || err.message?.includes('Network Error')
        const errorMessage = isNetworkError
          ? '⚠️ Backend not reachable. Please start the Credo controller at localhost:3000'
          : `Configuration error: ${err.message}`

        console.error('App initialization error:', errorMessage)
        if (isMounted) setError(errorMessage)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    initializeApp()

    return () => {
      isMounted = false
    }
  }, [])

  return (
    <MantineProvider
      theme={credentisTheme}
      // Keeps the light-variant colours the apps were designed with in Mantine 8.
      cssVariablesResolver={v8CssVariablesResolver}
      defaultColorScheme="light"
      colorSchemeManager={localStorageColorSchemeManager({ key: 'credentis-color-scheme' })}
    >
      <Notifications position="top-right" limit={3} pauseResetOnHover="notification" />
      <MilestoneHost />
      <EnvContext.Provider value={env}>
        <CredentialsContext.Provider value={[AvailableCredentials, setAvailableCredentials]}>
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
                gap: '12px',
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
                  lineHeight: '1',
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
                backgroundColor: 'var(--mantine-color-credentis-6)',
                color: 'white',
                padding: '12px 20px',
                borderRadius: '8px',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                zIndex: 9999,
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <Loader size="xs" color="white" />
              <span>Connecting to backend...</span>
            </div>
          )}

          <Layout>
            <Component {...pageProps} />
          </Layout>
        </CredentialsContext.Provider>
      </EnvContext.Provider>
    </MantineProvider>
  )
}
