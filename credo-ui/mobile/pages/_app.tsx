import React, { useEffect } from 'react';
import type { AppProps } from 'next/app';
import { MantineProvider, localStorageColorSchemeManager } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { credentisTheme } from '@/lib/theme/credentis-theme';
import { getActiveOrgId, getContextMode, getOrgToken, isAuthenticated } from '@/lib/auth';
import api from '@/lib/api';
import { initializeOfflineStorage } from '@/lib/offline/storage';
import { syncWalletSnapshot } from '@/lib/offline/walletSnapshotSync';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@/styles/globals.css';

const PUBLIC_ROUTES = ['/login', '/login/'];
const ORG_ONLY_ROUTE_PREFIXES = ['/finance', '/workflows', '/field-jobs', '/intake'];
const PERSONAL_ONLY_ROUTE_PREFIXES = ['/shop', '/my-requests', '/proofs'];

function matchesRoutePrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function queryValue(value: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseDeepLinkUrl(rawUrl: string): { route: string; query: URLSearchParams } | null {
  if (!rawUrl) return null;

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  const topParams = parsed.searchParams;
  const scheme = parsed.protocol.replace(':', '').toLowerCase();

  const readFirst = (params: URLSearchParams, keys: string[]): string | undefined => {
    for (const key of keys) {
      const value = queryValue(params.get(key));
      if (value) {
        try {
          return decodeURIComponent(value);
        } catch {
          return value;
        }
      }
    }
    return undefined;
  };

  const requestUri = readFirst(topParams, ['request_uri', 'presentation_request_url']);
  const nestedParams = (() => {
    if (!requestUri) return null;
    try {
      return new URL(requestUri).searchParams;
    } catch {
      return null;
    }
  })();

  const pick = (keys: string[]): string | undefined => {
    const nested = nestedParams ? readFirst(nestedParams, keys) : undefined;
    return nested || readFirst(topParams, keys);
  };

  const isCredentialOffer =
    scheme === 'openid-credential-offer' ||
    scheme === 'openid-initiate-issuance' ||
    !!readFirst(topParams, ['credential_offer_uri', 'credential_offer_url']);

  if (isCredentialOffer) {
    const query = new URLSearchParams({
      mode: 'save-credential',
      scanValue: rawUrl,
      source: 'deeplink',
    });
    return { route: '/scan', query };
  }

  const isPresentationRequest =
    scheme === 'openid4vp' ||
    scheme === 'openid-vc' ||
    !!requestUri ||
    !!readFirst(topParams, ['presentation_request_url']);

  if (!isPresentationRequest) {
    return null;
  }

  const query = new URLSearchParams({ request_uri: rawUrl, source: 'deeplink' });

  const requisitionId = pick(['requisitionId', 'requisition_id']);
  const orgTenantId = pick(['orgTenantId', 'org_tenant_id', 'verifier_tenant_id']);
  const workflowRunId = pick(['workflowRunId', 'workflow_run_id', 'runId']);
  const workflowId = pick(['workflowId', 'workflow_id']);
  const providerRef = pick(['providerRef', 'provider_ref', 'sourceReference']);
  const requestId = pick(['requestId', 'request_id', 'verification_session_id', 'state']);
  const sourceType = pick(['sourceType', 'source_type']);

  if (requisitionId) {
    query.set('mode', 'requisition-approve');
    query.set('requisitionId', requisitionId);
  }
  if (orgTenantId) query.set('orgTenantId', orgTenantId);
  if (workflowRunId) query.set('workflowRunId', workflowRunId);
  if (workflowId) query.set('workflowId', workflowId);
  if (providerRef) query.set('providerRef', providerRef);
  if (requestId) query.set('requestId', requestId);
  if (sourceType) query.set('sourceType', sourceType);
  if (!requisitionId && (workflowRunId || workflowId || providerRef)) {
    query.set('mode', 'workflow-action');
  }

  return { route: '/present', query };
}

async function trackDeepLinkEntry(rawUrl: string, parsed: { route: string; query: URLSearchParams }): Promise<void> {
  const kind = parsed.route === '/scan' ? 'credential-offer' : 'presentation-request';
  const payload = {
    event: 'mobile.deeplink.opened',
    kind,
    route: parsed.route,
    mode: parsed.query.get('mode') || undefined,
    requisitionId: parsed.query.get('requisitionId') || undefined,
    workflowRunId: parsed.query.get('workflowRunId') || undefined,
    workflowId: parsed.query.get('workflowId') || undefined,
    providerRef: parsed.query.get('providerRef') || undefined,
    sourceType: parsed.query.get('sourceType') || undefined,
    requestId: parsed.query.get('requestId') || undefined,
    source: parsed.query.get('source') || 'deeplink',
    rawLength: rawUrl.length,
    occurredAt: new Date().toISOString(),
  };

  // Best effort only: backend may not expose this endpoint in all environments.
  // Failures are intentionally swallowed to avoid blocking app navigation.
  try {
    await api.post('/api/audit/client-events', payload, { skipAuthRedirect: true } as any);
  } catch {
    // ignore
  }

  try {
    if (typeof window !== 'undefined') {
      const key = 'credentis:lastDeeplinkEvent';
      window.localStorage.setItem(key, JSON.stringify(payload));
    }
  } catch {
    // ignore
  }
}

export default function App({ Component, pageProps, router }: AppProps) {

  useEffect(() => {
    void initializeOfflineStorage();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let disposed = false;

    const maybeSyncWalletSnapshot = async () => {
      if (disposed) return;
      if (!isAuthenticated()) return;
      if (navigator.onLine === false) return;

      try {
        await syncWalletSnapshot();
      } catch {
        // Background cache sync is best effort and should never block UX.
      }
    };

    void maybeSyncWalletSnapshot();

    const interval = window.setInterval(() => {
      void maybeSyncWalletSnapshot();
    }, 30000);

    const onFocus = () => { void maybeSyncWalletSnapshot(); };
    const onOnline = () => { void maybeSyncWalletSnapshot(); };

    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);

    return () => {
      disposed = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  // Auth guard — user is authenticated when they have EITHER a personal wallet token
  // OR an active org token (both written on login/org-switch, cleared on logout).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const orgToken = getOrgToken();
    const hasToken = isAuthenticated();
    const isPublic = PUBLIC_ROUTES.some(
      (r) => router.pathname === r || router.pathname.startsWith('/login')
    );
    if (!hasToken && !isPublic) {
      router.replace(`/login/?returnTo=${encodeURIComponent(router.asPath)}`);
      return;
    }

    const contextMode = getContextMode();
    const hasActiveOrg = contextMode === 'org' && !!orgToken && !!getActiveOrgId();
    const isOrgRoute = matchesRoutePrefix(router.pathname, ORG_ONLY_ROUTE_PREFIXES);
    const isPersonalRoute = matchesRoutePrefix(router.pathname, PERSONAL_ONLY_ROUTE_PREFIXES);

    if (isOrgRoute && !hasActiveOrg) {
      router.replace(`/settings/org?returnTo=${encodeURIComponent(router.asPath)}&contextRequired=org`);
      return;
    }

    if (isPersonalRoute && contextMode === 'org') {
      router.replace(`/?contextRequired=personal&returnTo=${encodeURIComponent(router.asPath)}`);
    }
  }, [router.pathname]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const capacitor = (window as any).Capacitor;
    const appPlugin = capacitor?.Plugins?.App;
    if (!appPlugin || typeof appPlugin.addListener !== 'function') {
      return;
    }

    let listenerHandle: any;
    let disposed = false;

    const handleIncomingUrl = (incomingUrl?: string) => {
      if (!incomingUrl) return;
      const parsed = parseDeepLinkUrl(incomingUrl);
      if (!parsed) return;

      void trackDeepLinkEntry(incomingUrl, parsed);

      const target = `${parsed.route}?${parsed.query.toString()}`;
      router.push(target).catch(() => undefined);
    };

    const attachListener = async () => {
      try {
        listenerHandle = await appPlugin.addListener('appUrlOpen', (event: any) => {
          handleIncomingUrl(event?.url);
        });
      } catch {
        // Ignore listener setup failures in browser mode.
      }

      try {
        if (typeof appPlugin.getLaunchUrl === 'function') {
          const launch = await appPlugin.getLaunchUrl();
          if (!disposed) {
            handleIncomingUrl(launch?.url);
          }
        }
      } catch {
        // Ignore launch URL retrieval failures.
      }
    };

    void attachListener();

    return () => {
      disposed = true;
      if (listenerHandle?.remove) {
        listenerHandle.remove().catch(() => undefined);
      }
    };
  }, [router]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let cancelled = false;

    const setStatusInset = (px: number) => {
      const value = Number.isFinite(px) && px > 0 ? `${Math.round(px)}px` : '0px';
      document.documentElement.style.setProperty('--app-statusbar-offset', value);
    };

    const refreshStatusInset = async () => {
      try {
        const capacitor = (window as any).Capacitor;
        const isNative = typeof capacitor?.isNativePlatform === 'function' ? capacitor.isNativePlatform() : false;
        const platform = typeof capacitor?.getPlatform === 'function' ? capacitor.getPlatform() : '';

        if (!isNative || platform !== 'android') {
          setStatusInset(0);
          return;
        }

        const statusBar = capacitor?.Plugins?.StatusBar;
        if (statusBar && typeof statusBar.getInfo === 'function') {
          const info = await statusBar.getInfo();
          if (cancelled) return;
          setStatusInset(Number(info?.height || 0));
          return;
        }

        setStatusInset(24);
      } catch {
        if (!cancelled) setStatusInset(24);
      }
    };

    void refreshStatusInset();

    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      void refreshStatusInset();
    };

    window.addEventListener('focus', onVisibility);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      window.removeEventListener('focus', onVisibility);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <MantineProvider
      theme={credentisTheme}
      defaultColorScheme="light"
      colorSchemeManager={localStorageColorSchemeManager({ key: 'credentis-color-scheme' })}
    >
      <Notifications position="top-center" zIndex={9999} />
      <Component {...pageProps} />
    </MantineProvider>
  );
}
