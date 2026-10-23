import React, { useEffect, useRef, useState } from 'react';
import type { AppProps } from 'next/app';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { Center, Loader, MantineProvider, localStorageColorSchemeManager } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { credentisTheme } from '@/lib/theme/credentis-theme';
import { registerAndroidPush } from '@/lib/androidPush';
import { bindTaskPath, endTaskContext, getTaskContext, getActiveOrgId, getContextMode, getOrgToken, isAuthenticated } from '@/lib/auth';
import { TASK_CONTEXT_KEY } from '../../shared/taskContext';
import api from '@/lib/api';
import { initializeOfflineStorage } from '@/lib/offline/storage';
import { syncWalletSnapshot } from '@/lib/offline/walletSnapshotSync';
import { useActiveTabInView } from '@/lib/tabs';
import { walletQrKind } from '@/lib/walletScan';
import { adoptRestoredCameraResult, clearCameraPending, pendingCameraReturn } from '@/lib/photoDraft';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { QUERY_CACHE_BUSTER, QUERY_CACHE_MAX_AGE, bindQueryManagers, queryClient, queryPersister, shouldPersistQuery } from '@/lib/queries/client';
import { bindSessionStore } from '@/lib/state/session';
import { bindSyncStore, useSyncStore } from '@/lib/state/sync';
import { BlockingOverlay } from '@/components/feedback/BlockingOverlay';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@/styles/globals.css';

const PUBLIC_ROUTES = ['/login', '/login/', '/pay/[code]'];
const ORG_ONLY_ROUTE_PREFIXES = ['/finance', '/workflows', '/field-jobs', '/intake', '/credential-operations', '/connected-systems', '/requests'];
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

  // WhatsApp alert links: credentis://inbox?item=… or the verified https://<host>/inbox App Link.
  const isInboxLink =
    (parsed.protocol === 'credentis:' && (parsed.hostname === 'inbox' || parsed.pathname.replace(/^\/+/, '') === 'inbox')) ||
    (parsed.protocol === 'https:' && parsed.pathname.replace(/\/+$/, '') === '/inbox');
  if (isInboxLink) {
    const query = new URLSearchParams();
    for (const key of ['item', 'request']) {
      const value = queryValue(topParams.get(key));
      if (value && /^[A-Za-z0-9._:-]{1,200}$/.test(value)) query.set(key, value);
    }
    return { route: '/inbox', query };
  }
  // Member invite links: credentis://join?code=… or the verified https://<host>/login/join App Link.
  const isJoinLink =
    (parsed.protocol === 'credentis:' && (parsed.hostname === 'join' || parsed.pathname.replace(/^\/+/, '') === 'join')) ||
    (parsed.protocol === 'https:' && parsed.pathname.replace(/\/+$/, '') === '/login/join');
  if (isJoinLink) {
    const query = new URLSearchParams();
    const code = queryValue(topParams.get('code'));
    if (code && /^[A-Za-z0-9_-]{16,128}$/.test(code)) query.set('code', code);
    return { route: '/login/join', query };
  }
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

  const isCredentialOffer = walletQrKind(rawUrl) === 'credential-offer';

  if (isCredentialOffer) {
    const query = new URLSearchParams({
      mode: 'save-credential',
      scanValue: rawUrl,
      source: 'deeplink',
    });
    return { route: '/scan', query };
  }

  const isPresentationRequest = walletQrKind(rawUrl) === 'presentation-request';

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
  const kind = parsed.route === '/scan' ? 'credential-offer' : parsed.route === '/inbox' ? 'inbox-alert' : 'presentation-request';
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
  useActiveTabInView();
  const launchUrlHandled = useRef(false);
  const openingDeepLink = useRef<string | null>(null);
  // The exported HTML cannot see the stored sign-in, organisation or role, so pages that draw
  // from them would not match it. Pages draw only after the app has mounted on the device.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    let hadTask = Boolean(localStorage.getItem(TASK_CONTEXT_KEY));
    let returning = false;
    const settle = (url: string) => {
      const task = getTaskContext();
      if (task) {
        hadTask = true;
        if (bindTaskPath(url)) return;
        endTaskContext();
        returning = true;
      } else if (hadTask && getContextMode() === 'personal') {
        returning = true;
      } else if (!task) {
        hadTask = false;
      }
    };
    const finish = () => {
      if (!returning) return;
      returning = false;
      hadTask = false;
      if (router.pathname !== '/inbox') void router.replace('/inbox');
    };
    const check = () => { settle(router.asPath); finish(); };
    const start = (url: string) => settle(url);
    router.events.on('routeChangeStart', start);
    router.events.on('routeChangeComplete', finish);
    router.events.on('routeChangeError', finish);
    window.addEventListener('focus', check);
    window.addEventListener('storage', check);
    const timer = window.setInterval(() => {
      // Inline inbox actions may not yet have a destination; only expire them here.
      const task = getTaskContext();
      if (task) hadTask = true;
      if (!task && hadTask) check();
    }, 1000);
    // After Android closed the app during the camera, the restore handler below returns to the
    // job step; checking the start page first would end the task and drop the photo in Inbox.
    if (!pendingCameraReturn() && (router.pathname !== '/inbox' || getTaskContext()?.target)) check();
    return () => {
      router.events.off('routeChangeStart', start);
      router.events.off('routeChangeComplete', finish);
      router.events.off('routeChangeError', finish);
      window.removeEventListener('focus', check);
      window.removeEventListener('storage', check);
      window.clearInterval(timer);
    };
  }, [router]);

  useEffect(() => {
    void initializeOfflineStorage();
  }, []);

  useEffect(() => {
    const unbind = [bindSessionStore(), bindSyncStore(), bindQueryManagers()];
    return () => unbind.forEach((fn) => fn());
  }, []);

  // Moving between screens counts as background work, so a slow screen shows the header bar.
  useEffect(() => {
    let navigating = false;
    const start = () => {
      if (navigating) return;
      navigating = true;
      useSyncStore.getState().requestStarted();
    };
    const end = () => {
      if (!navigating) return;
      navigating = false;
      useSyncStore.getState().requestEnded();
    };
    router.events.on('routeChangeStart', start);
    router.events.on('routeChangeComplete', end);
    router.events.on('routeChangeError', end);
    return () => {
      end();
      router.events.off('routeChangeStart', start);
      router.events.off('routeChangeComplete', end);
      router.events.off('routeChangeError', end);
    };
  }, [router]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isAuthenticated()) return;
    void registerAndroidPush();
  }, [router.pathname]);

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

    // The offline copy of the wallet is refreshed when the app comes to the front or the
    // connection returns, and at most every five minutes while it stays open. The screens
    // themselves load what they show; this only keeps the offline copy current.
    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void maybeSyncWalletSnapshot();
    }, 5 * 60 * 1000);

    const onResume = () => {
      if (document.visibilityState !== 'visible') return;
      void maybeSyncWalletSnapshot();
    };

    window.addEventListener('focus', onResume);
    window.addEventListener('online', onResume);
    document.addEventListener('visibilitychange', onResume);

    return () => {
      disposed = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', onResume);
      window.removeEventListener('online', onResume);
      document.removeEventListener('visibilitychange', onResume);
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
    if (typeof window === 'undefined' || !Capacitor.isNativePlatform()) return;
    const returnTo = pendingCameraReturn();
    let handle: PluginListenerHandle | undefined;
    let settled = false;
    const goBack = (target: string | null) => {
      if (settled) return;
      settled = true;
      if (target && target !== router.asPath) void router.replace(target);
    };
    void CapacitorApp.addListener('appRestoredResult', (event: any) => {
      goBack(adoptRestoredCameraResult(event));
    }).then((h) => { handle = h; });
    // Android may not hand the photo back (for example it was cancelled); still return to the step.
    const fallback = returnTo
      ? window.setTimeout(() => {
          if (settled) return;
          clearCameraPending();
          goBack(returnTo);
        }, 4000)
      : undefined;
    return () => {
      if (fallback) window.clearTimeout(fallback);
      handle?.remove().catch(() => undefined);
    };
    // Registered once at start: the restored camera result is delivered a single time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!Capacitor.isNativePlatform()) return;
    const appPlugin = CapacitorApp;

    let listenerHandle: PluginListenerHandle | undefined;
    let disposed = false;

    const handleIncomingUrl = (incomingUrl?: string) => {
      if (disposed || !incomingUrl || openingDeepLink.current === incomingUrl) return;
      const parsed = parseDeepLinkUrl(incomingUrl);
      if (!parsed) return;
      openingDeepLink.current = incomingUrl;

      void trackDeepLinkEntry(incomingUrl, parsed);

      const target = `${parsed.route}?${parsed.query.toString()}`;
      router.push(target).catch((error) => {
        console.error('Could not open wallet link', error);
      }).finally(() => {
        if (openingDeepLink.current === incomingUrl) openingDeepLink.current = null;
      });
    };

    const attachListener = async () => {
      try {
        listenerHandle = await appPlugin.addListener('appUrlOpen', (event) => {
          handleIncomingUrl(event?.url);
        });
        if (disposed) {
          await listenerHandle.remove();
          return;
        }
      } catch (error) {
        console.error('Could not register wallet link listener', error);
      }

      try {
        if (!launchUrlHandled.current) {
          const launch = await appPlugin.getLaunchUrl();
          if (!disposed) {
            launchUrlHandled.current = true;
            handleIncomingUrl(launch?.url);
          }
        }
      } catch (error) {
        console.error('Could not read wallet launch link', error);
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
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister: queryPersister,
          maxAge: QUERY_CACHE_MAX_AGE,
          buster: QUERY_CACHE_BUSTER,
          dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
        }}
      >
        <Notifications position="bottom-center" limit={1} autoClose={3000} zIndex={9999} style={{ marginBottom: 'calc(88px + var(--app-safe-bottom))' }} />
        {mounted ? (
          <Component {...pageProps} />
        ) : (
          <Center h="100dvh">
            <Loader size="sm" />
          </Center>
        )}
        <BlockingOverlay />
      </PersistQueryClientProvider>
    </MantineProvider>
  );
}
