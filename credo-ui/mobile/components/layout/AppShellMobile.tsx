import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { Box, Group, Text, ActionIcon, Avatar, Drawer, Stack, Button, Divider, useMantineColorScheme, Menu, UnstyledButton } from '@mantine/core';
import { IconSettings, IconLogout, IconBuilding, IconCertificate, IconPlugConnected, IconChevronDown, IconSun, IconMoon, IconCheck, IconUser, IconPlus, IconArrowLeft } from '@tabler/icons-react';
import BottomNav from './BottomNav';
import { CREDENTIS_CONTEXT_CHANGED_EVENT, clearTaskContext, getTaskContext, getActiveOrgLabel, getUserName, getUserRole, clearAuth, getWalletToken, syncOrgContextFromServer, applyOrgContext, setPersonalContext, getContextMode, getOrgToken, getContextTokenStrict, getPersonalWalletToken } from '@/lib/auth';
import { beginAddAccount, currentAccountId, listSavedAccounts, loadSavedAccountNames, rememberCurrentAccount, restoreAccount } from '@/lib/savedAccounts';
import api, { API_BASE_URL } from '@/lib/api';
import { notifications } from '@mantine/notifications';
import { captureOrganizationSwitchContext } from '../../../shared/taskContext';
import { HeaderProgressBar, useBackgroundBusy } from '@/components/feedback/HeaderProgressBar';
import { PullRefreshIndicator, PULL_TRIGGER_PX } from '@/components/feedback/PullRefreshIndicator';
import { useActivityStore } from '@/lib/state/activity';
import { useSessionStore } from '@/lib/state/session';
import { useSyncStore, waitForIdle } from '@/lib/state/sync';
import { purgeAccountQueries, queryClient } from '@/lib/queries/client';

interface AppShellMobileProps {
  children: React.ReactNode;
  inboxCount?: number;
  minimalHeader?: boolean;
}

export default function AppShellMobile({ children, inboxCount, minimalHeader = false }: AppShellMobileProps) {
  const router = useRouter();
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
  const [mounted, setMounted] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [orgLabel, setOrgLabel] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [orgMenuOpen, setOrgMenuOpen] = useState(false);
  const [orgs, setOrgs] = useState<Array<{ id: string; name: string; role: string }>>([]);
  const [orgSwitching, setOrgSwitching] = useState(false);
  const [orgsLoading, setOrgsLoading] = useState(false);
  const [accounts, setAccounts] = useState<Array<{ id: string; label: string }>>([]);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [inboxTask, setInboxTask] = useState(false);
  const scope = useSessionStore((state) => state.scope);
  const storedInboxCount = useActivityStore((state) => state.inboxNewByScope[scope]);
  const badgeCount = storedInboxCount ?? inboxCount ?? 0;
  const online = useSyncStore((state) => state.online);
  const pullState = useSyncStore((state) => state.pull);
  const backgroundBusy = useBackgroundBusy();
  const contextLine = !online
    ? 'Waiting for network'
    : backgroundBusy || pullState === 'refreshing'
      ? 'Updating…'
      : null;

  useEffect(() => {
    let cancelled = false;
    let syncing = false;

    const refreshAuthState = () => {
      if (cancelled) return;
      const nextLabel = getActiveOrgLabel();
      const nextRole = getUserRole();
      setOrgLabel(nextLabel);
      setUserName(getUserName());
      setUserRole(nextRole);
      setInboxTask(Boolean(getTaskContext()));
      rememberCurrentAccount();
      setAccounts(listSavedAccounts());
      setActiveAccountId(currentAccountId());
    };

    const bootstrap = async () => {
      if (syncing) return;
      syncing = true;
      setMounted(true);
      // Paint the saved context straight away so the header and the tabs agree while the
      // server check runs; the check only corrects it afterwards.
      refreshAuthState();
      const changed = await syncOrgContextFromServer();
      syncing = false;
      refreshAuthState();
      // Saved accounts that were never opened since their name was known get it from their own identity card.
      void loadSavedAccountNames(API_BASE_URL).then(() => { if (!cancelled) setAccounts(listSavedAccounts()); }).catch(() => undefined);
      if (!cancelled && changed) {
        window.location.reload();
      }
    };

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'hidden') return;
      void bootstrap();
    };

    void bootstrap();

    window.addEventListener('focus', handleVisibilityOrFocus);
    window.addEventListener('pageshow', handleVisibilityOrFocus);
    window.addEventListener(CREDENTIS_CONTEXT_CHANGED_EVENT, refreshAuthState);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    return () => {
      cancelled = true;
      window.removeEventListener('focus', handleVisibilityOrFocus);
      window.removeEventListener('pageshow', handleVisibilityOrFocus);
      window.removeEventListener(CREDENTIS_CONTEXT_CHANGED_EVENT, refreshAuthState);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, []);

  const safeColorScheme = mounted ? colorScheme : 'light';
  const showBack = router.pathname !== '/' && router.pathname !== '/index';
  const [barShadow, setBarShadow] = useState(false);

  useEffect(() => {
    const onScroll = () => setBarShadow(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Swipe down at the top of a page: a circle follows the finger (Material 3 pull to refresh);
  // on release it spins while every screen checks the server again. What is on screen stays usable.
  useEffect(() => {
    let startY = 0;
    let armed = false;
    let distance = 0;
    let lastPull = 0;
    const sync = () => useSyncStore.getState();
    const onStart = (event: TouchEvent) => {
      startY = event.touches[0]?.clientY || 0;
      distance = 0;
      const target = event.target as Element | null;
      // Only a pull that begins at the very top of the page, outside sheets and inner scroll areas.
      armed = sync().pull !== 'refreshing'
        && window.scrollY <= 0
        && !document.querySelector('.mantine-Drawer-content, .mantine-Modal-content')
        && !target?.closest?.('.mantine-ScrollArea-root, [data-no-pull-refresh]');
    };
    const onMove = (event: TouchEvent) => {
      if (!armed) return;
      if (window.scrollY > 0) {
        armed = false;
        sync().setPull('idle');
        return;
      }
      const raw = (event.touches[0]?.clientY || 0) - startY;
      // Resist the pull the further it goes, like the platform indicator.
      distance = raw <= 0 ? 0 : Math.min(PULL_TRIGGER_PX * 1.6, raw * 0.55);
      if (distance <= 4) {
        if (sync().pull !== 'idle') sync().setPull('idle');
        return;
      }
      sync().setPull(distance >= PULL_TRIGGER_PX ? 'armed' : 'pulling', distance);
    };
    const onEnd = () => {
      if (!armed) return;
      armed = false;
      const reached = distance >= PULL_TRIGGER_PX && window.scrollY <= 0;
      distance = 0;
      const now = Date.now();
      if (!reached || now - lastPull < 2000) {
        sync().setPull('idle');
        return;
      }
      lastPull = now;
      sync().setPull('refreshing', PULL_TRIGGER_PX);
      // Screens not yet on the shared cache listen for this event.
      window.dispatchEvent(new Event('credentis-pull-refresh'));
      void queryClient
        .refetchQueries({ type: 'active' })
        .catch(() => undefined)
        .then(() => waitForIdle(10000))
        .finally(() => sync().setPull('idle'));
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    let pushed = false;
    let suppress = false;
    let consume = false;
    const sheetOpen = () => Boolean(document.querySelector('.mantine-Drawer-content, .mantine-Modal-content'));
    const closeTopSheet = () => {
      const buttons = document.querySelectorAll<HTMLButtonElement>('.mantine-Drawer-close, .mantine-Modal-close');
      const button = buttons[buttons.length - 1];
      if (!button) return false;
      button.click();
      return true;
    };
    const dropJobQuery = () => {
      const url = new URL(window.location.href);
      if (!url.pathname.startsWith('/finance')) return;
      if (!url.searchParams.has('runId') && !url.searchParams.has('requestId')) return;
      url.searchParams.delete('runId');
      url.searchParams.delete('requestId');
      const next = `${url.pathname}${url.search}`;
      void routerRef.current.replace(next, undefined, { shallow: true });
    };
    const observer = new MutationObserver(() => {
      // Item tasks have real routes; synthetic sheet entries would swallow parent/child Back navigation.
      if (inboxTask || getTaskContext()) {
        pushed = false;
        consume = false;
        suppress = false;
        return;
      }
      const open = sheetOpen();
      if (open && !pushed && !suppress) {
        window.history.pushState({ credentisSheet: true }, '');
        pushed = true;
      }
      if (!open && pushed) {
        pushed = false;
        suppress = true;
        consume = true;
        if (window.history.state?.credentisSheet) window.history.back();
        return;
      }
      if (!open && !pushed && !consume) suppress = false;
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const onPop = () => {
      if (inboxTask || getTaskContext()) return;
      // A sheet marker left behind when the app navigated away while that sheet was open (a child
      // opened from a job's "Where this fits"). Next ignores it, so the page would show the old
      // tab under the new URL: step over it to the page's own history entry, which closes the
      // sheet that is open now and restores the tab.
      if (window.history.state?.credentisSheet) {
        pushed = false;
        consume = true;
        suppress = true;
        window.history.back();
        return;
      }
      if (!consume && !pushed && !sheetOpen()) return;
      const stillOpen = sheetOpen();
      consume = false;
      pushed = false;
      suppress = true;
      if (stillOpen) closeTopSheet();
      dropJobQuery();
    };
    window.addEventListener('popstate', onPop);
    return () => {
      observer.disconnect();
      window.removeEventListener('popstate', onPop);
    };
  }, [inboxTask]);
  const userRoleLabel = String(userRole || 'member').replace(/[_-]+/g, ' ');

  useEffect(() => {
    if (!mounted) return;
    (window as any).CredentisSystemBars?.setDarkMode(safeColorScheme === 'dark');
    const themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    themeMeta?.setAttribute('content', safeColorScheme === 'dark' ? '#121417' : '#f7fbff');
  }, [mounted, safeColorScheme]);

  useEffect(() => {
    if (!mounted) return;
    const reportLayout = () => {
      const header = document.querySelector<HTMLElement>('[data-app-header]');
      const bottomNav = document.querySelector<HTMLElement>('.bottom-nav');
      const drawer = document.querySelector<HTMLElement>('[data-app-settings]');
    };
    requestAnimationFrame(reportLayout);
  }, [mounted, safeColorScheme, settingsOpen]);

  useEffect(() => {
    if (!settingsOpen) return;
    requestAnimationFrame(() => {
      const drawerHeader = document.querySelector<HTMLElement>('.mantine-Drawer-header');
      const drawerContent = document.querySelector<HTMLElement>('.mantine-Drawer-content');
    });
  }, [settingsOpen]);

  useEffect(() => {
    if (!settingsOpen) return;
    const drawerContent = document.querySelector<HTMLElement>('.mantine-Drawer-content');
    if (!drawerContent) return;
    const reportSettledBounds = () => {
      const drawerHeader = document.querySelector<HTMLElement>('.mantine-Drawer-header');
    };
    drawerContent.addEventListener('transitionend', reportSettledBounds, { once: true });
    return () => drawerContent.removeEventListener('transitionend', reportSettledBounds);
  }, [settingsOpen]);

  useEffect(() => {
    if (!settingsOpen) return;
    requestAnimationFrame(() => {
      const drawerContent = document.querySelector<HTMLElement>('.mantine-Drawer-content');
      if (!drawerContent) return;
      const animations = drawerContent.getAnimations({ subtree: true });
      void Promise.all(animations.map((animation) => animation.finished.catch(() => undefined))).then(() => {
        const drawerHeader = document.querySelector<HTMLElement>('.mantine-Drawer-header');
      });
    });
  }, [settingsOpen]);

  const loadOrgs = async () => {
    if (orgsLoading) return;
    setOrgsLoading(true);
    try {
      const token = getWalletToken();
      if (!token) { setOrgsLoading(false); return; }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await api.get('/api/organizations', {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data: any[] = res.data ?? [];
      const mapped = data.map((o: any) => ({
        id: o.orgTenantId ?? o.id,
        name: o.name ?? o.label ?? o.id,
        role: o.role ?? 'holder',
      }));
      // Keep credoOrganizations cache in sync
      if (mapped.length > 0) {
        try { localStorage.setItem('credoOrganizations', JSON.stringify(
          data.map((o: any) => ({ orgTenantId: o.orgTenantId ?? o.id, name: o.name ?? o.label ?? o.id, role: o.role ?? 'holder' }))
        )); } catch { /* quota */ }
      }
      setOrgs(mapped);
    } catch {
      // silently fail — menu will show empty state
    } finally {
      setOrgsLoading(false);
    }
  };

  const switchOrg = async (orgId: string, orgName: string, orgRole: string = 'issuer') => {
    const assertContextUnchanged = captureOrganizationSwitchContext(localStorage);
    setOrgSwitching(true);
    try {
      const token = getWalletToken();
      if (!token) throw new Error('Missing personal wallet session');
      const res = await api.post(`/api/organizations/${orgId}/switch`, {}, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const { token: orgToken, sector, workflowTypes, orgRole: serverRole } = res.data;
      assertContextUnchanged();
      const effectiveRole = serverRole || orgRole;
      clearTaskContext();
      applyOrgContext({
        orgId,
        orgName,
        orgToken,
        orgRole: effectiveRole,
        sector,
        workflowTypes,
      });
      setOrgLabel(orgName);
      setOrgMenuOpen(false);
      window.location.replace('/');
    } catch (error) {
      notifications.show({
        title: 'Could not switch organization',
        message: error instanceof Error ? error.message : 'Try again from the account picker.',
        color: 'red',
      });
    } finally {
      setOrgSwitching(false);
    }
  };

  const switchToPersonal = () => {
    setPersonalContext();
    setOrgLabel(null);
    setOrgMenuOpen(false);
    window.location.replace('/');
  };

  const goBack = () => {
    const buttons = document.querySelectorAll<HTMLButtonElement>('.mantine-Drawer-close, .mantine-Modal-close');
    const open = Boolean(document.querySelector('.mantine-Drawer-content, .mantine-Modal-content'));
    let action = 'router.back';
    if (open && buttons.length > 0) {
      buttons[buttons.length - 1].click();
      action = 'close-sheet';
    } else if (window.history.length <= 1) {
      action = 'home';
      void router.replace('/');
    } else {
      void router.back();
    }
  };

  const handleLogout = () => {
    void import('@/lib/androidPush')
      .then((mod) => mod.unregisterAndroidPush())
      .finally(() => {
        // Signing out forgets this account's saved screens and counts on this phone.
        const accountId = currentAccountId();
        purgeAccountQueries(accountId);
        if (accountId) useActivityStore.getState().forgetScopePrefix(`${accountId}|`);
        clearAuth();
        router.replace('/login/');
      });
  };

  return (
    <Box style={{ minHeight: '100svh' }}>
      <PullRefreshIndicator />
      {/* Top bar */}
      <Box
        data-app-header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: inboxTask ? 100 : 1200,
          background: safeColorScheme === 'dark' ? 'rgba(26, 27, 30, 0.88)' : 'rgba(255, 255, 255, 0.82)',
          borderBottom: minimalHeader ? 'none' : `1px solid ${safeColorScheme === 'dark' ? 'rgba(87, 93, 108, 0.32)' : 'rgba(148, 163, 184, 0.18)'}`,
          boxShadow: barShadow ? '0 8px 24px rgba(15, 23, 42, 0.12)' : 'none',
          backdropFilter: 'blur(18px) saturate(180%)',
          paddingTop: 'var(--app-safe-top)',
          paddingRight: 'var(--app-safe-right)',
          paddingLeft: 'var(--app-safe-left)',
        }}
      >
        {minimalHeader || inboxTask ? (
          <Group justify={showBack ? 'space-between' : 'flex-end'} align="center" px="md" h={52} gap={4}>
            {showBack && (
              <ActionIcon variant="subtle" size={48} color="gray" onClick={goBack} aria-label="Go back">
                <IconArrowLeft size={22} />
              </ActionIcon>
            )}
            <ActionIcon
              variant="subtle"
              size={48}
              color="gray"
              onClick={() => toggleColorScheme()}
              aria-label="Toggle dark mode"
            >
              {safeColorScheme === 'dark' ? <IconSun size={20} /> : <IconMoon size={20} />}
            </ActionIcon>
            {!inboxTask && <ActionIcon
              variant="subtle"
              size={48}
              color="gray"
              onClick={() => { loadOrgs(); setSettingsOpen(true); }}
              aria-label="Open settings"
            >
              <IconSettings size={21} />
            </ActionIcon>}
          </Group>
        ) : (
          <Group justify="space-between" align="center" px="md" h={58} wrap="nowrap">
            {/* Org context — click to switch org */}
            <Group gap={4} wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
              {showBack && (
                <ActionIcon variant="subtle" size={48} color="gray" onClick={goBack} aria-label="Go back">
                  <IconArrowLeft size={22} />
                </ActionIcon>
              )}
              <Menu
                opened={orgMenuOpen}
                onClose={() => setOrgMenuOpen(false)}
                position="bottom-start"
                withinPortal
                shadow="md"
                radius="md"
              >
                <Menu.Target>
                  <UnstyledButton
                    aria-label="Switch account or organisation"
                    style={{ flex: 1, minWidth: 0, minHeight: 48 }}
                    onClick={() => { loadOrgs(); setOrgMenuOpen(true); }}
                  >
                    <Group gap="xs" wrap="nowrap">
                    <Avatar size={34} color="credentis" radius="md" style={{ flexShrink: 0 }}>
                      {(orgLabel ?? 'C').charAt(0).toUpperCase()}
                    </Avatar>
                    <Box style={{ minWidth: 0, flex: 1 }}>
                      <Text size="xs" c="dimmed" lh={1}>
                        {contextLine ?? (orgLabel ? 'Organisation' : 'Personal')}
                      </Text>
                      <Group gap={4} align="center" wrap="nowrap">
                        <Text size="sm" fw={650} truncate style={{ minWidth: 0 }}>
                          {orgLabel ?? userName ?? 'My account'}
                        </Text>
                        <IconChevronDown size={14} color="#94a3b8" />
                      </Group>
                    </Box>
                    </Group>
                  </UnstyledButton>
                </Menu.Target>
                <Menu.Dropdown>
                {orgsLoading && (
                  <Menu.Item disabled>Loading organisations…</Menu.Item>
                )}
                <Menu.Item
                  leftSection={<IconUser size={14} />}
                  rightSection={!orgLabel ? <IconCheck size={14} color="#2188ca" /> : null}
                  onClick={switchToPersonal}
                >
                  Personal Account
                </Menu.Item>
                {orgs.length > 0 && <Menu.Divider />}
                {orgs.map((org) => (
                  <Menu.Item
                    key={org.id}
                    leftSection={<IconBuilding size={14} />}
                    rightSection={org.name === orgLabel ? <IconCheck size={14} color="#2188ca" /> : null}
                    disabled={orgSwitching}
                    onClick={() => switchOrg(org.id, org.name, org.role)}
                  >
                    {org.name}
                  </Menu.Item>
                ))}
                <Menu.Divider />
                <Menu.Label>Accounts</Menu.Label>
                {accounts.map((account) => {
                  const selected = account.id === activeAccountId;
                  return (
                    <Menu.Item
                      key={account.id}
                      leftSection={selected ? <IconCheck size={14} /> : <IconUser size={14} />}
                      disabled={selected}
                      onClick={() => {
                        if (restoreAccount(account.id)) window.location.assign('/');
                      }}
                    >
                      {account.label}
                    </Menu.Item>
                  );
                })}
                <Menu.Item
                  leftSection={<IconPlus size={14} />}
                  onClick={() => {
                    beginAddAccount();
                    router.push('/login?add=1');
                  }}
                >
                  Add account
                </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Group>

            {/* Dark mode + Settings */}
            <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
              <ActionIcon
                variant="subtle"
                size={48}
                color="gray"
                onClick={() => toggleColorScheme()}
                aria-label="Toggle dark mode"
              >
                {safeColorScheme === 'dark' ? <IconSun size={19} /> : <IconMoon size={19} />}
              </ActionIcon>
              <ActionIcon
                variant="subtle"
                size={48}
                color="gray"
                onClick={() => { loadOrgs(); setSettingsOpen(true); }}
                aria-label="Open settings"
              >
                <IconSettings size={20} />
              </ActionIcon>
            </Group>
          </Group>
        )}
        <HeaderProgressBar active={backgroundBusy && pullState !== 'refreshing'} />
      </Box>

      {/* Page content */}
      <Box className="page-content">{children}</Box>

      {/* Bottom navigation */}
      {!inboxTask && <BottomNav inboxCount={badgeCount} />}

      {/* Settings drawer */}
      <Drawer
        data-app-settings
        opened={settingsOpen && !inboxTask}
        onClose={() => setSettingsOpen(false)}
        position="bottom"
        size="auto"
        title="Settings"
        radius="lg"
        styles={{
          content: {
            borderRadius: '20px 20px 0 0',
            marginBottom: 'var(--app-safe-bottom)',
            maxHeight: 'calc(100dvh - var(--app-safe-top) - var(--app-safe-bottom))',
          },
          header: { paddingTop: 'calc(12px + var(--app-safe-top))' },
          close: { width: 48, height: 48 },
        }}
      >
        <Stack gap="md" pb="lg">
          <Stack gap="xs">
            <Text size="xs" c="dimmed" tt="uppercase" fw={600} px="xs">
              In use now
            </Text>
            <Group px="xs">
              <Avatar size={40} color="credentis" radius="xl">
                {(orgLabel ?? userName ?? 'P').charAt(0).toUpperCase()}
              </Avatar>
              <Box>
                <Text fw={600}>{orgLabel ?? 'Personal account'}</Text>
                <Text size="sm" c="dimmed">
                  {orgLabel
                    ? `${userRoleLabel.charAt(0).toUpperCase()}${userRoleLabel.slice(1)}`
                    : (userName ?? 'Your own records')}
                </Text>
              </Box>
            </Group>
          </Stack>

          <Divider />

          {/* The other scope is a switch, not a second account that is also on. */}
          <Stack gap="xs">
            <Text size="xs" c="dimmed" tt="uppercase" fw={600} px="xs">
              Switch to
            </Text>
            {orgLabel && (
              <Button
                variant="subtle"
                color="gray"
                justify="flex-start"
                leftSection={<IconUser size={16} />}
                disabled={orgSwitching}
                onClick={switchToPersonal}
              >
                Personal account
              </Button>
            )}
            {orgsLoading && orgs.length === 0 && (
              <Text size="xs" c="dimmed" px="xs">Loading organisations…</Text>
            )}
            {orgs.filter((org) => org.name !== orgLabel).map((org) => (
              <Button
                key={org.id}
                variant="subtle"
                color="gray"
                justify="flex-start"
                leftSection={<IconBuilding size={16} />}
                disabled={orgSwitching}
                loading={orgSwitching}
                onClick={() => switchOrg(org.id, org.name, org.role)}
              >
                {org.name}
              </Button>
            ))}
            {orgLabel && !inboxTask && ['owner', 'admin'].includes(String(userRole || '').toLowerCase()) && (
              <>
                <Button
                  variant="light"
                  color="credentis"
                  leftSection={<IconBuilding size={16} />}
                  onClick={() => {
                    setSettingsOpen(false);
                    router.push('/settings/org/');
                  }}
                >
                  Organisation settings
                </Button>
                <Button
                  variant="light"
                  color="credentis"
                  leftSection={<IconCertificate size={16} />}
                  onClick={() => {
                    setSettingsOpen(false);
                    router.push('/credential-operations');
                  }}
                >
                  Credential operations
                </Button>
                <Button
                  variant="light"
                  color="credentis"
                  leftSection={<IconPlugConnected size={16} />}
                  onClick={() => {
                    setSettingsOpen(false);
                    router.push('/connected-systems');
                  }}
                >
                  Connected systems
                </Button>
              </>
            )}
          </Stack>

          <Divider />

          <Stack gap="xs">
            <Text size="xs" c="dimmed" tt="uppercase" fw={600} px="xs">
              Sign-ins on this phone
            </Text>
            {accounts.map((account) => {
              const selected = account.id === activeAccountId;
              return (
                <Button
                  key={account.id}
                  variant={selected ? 'light' : 'subtle'}
                  color={selected ? 'credentis' : 'gray'}
                  justify="space-between"
                  leftSection={selected ? <IconCheck size={16} /> : <IconUser size={16} />}
                  rightSection={<Text size="xs" c="dimmed">{selected ? 'This sign-in' : 'Switch'}</Text>}
                  disabled={selected}
                  onClick={() => {
                    if (restoreAccount(account.id)) window.location.assign('/');
                  }}
                >
                  {account.label}
                </Button>
              );
            })}
            <Button
              variant="subtle"
              color="credentis"
              leftSection={<IconPlus size={16} />}
              onClick={() => {
                setSettingsOpen(false);
                beginAddAccount();
                router.push('/login?add=1');
              }}
            >
              Add account
            </Button>
          </Stack>

          <Divider />

          {/* Dark mode toggle */}
          <Stack gap="xs">
            <Text size="xs" c="dimmed" tt="uppercase" fw={600} px="xs">
              Appearance
            </Text>
            <Button
              variant="light"
              color="gray"
              leftSection={safeColorScheme === 'dark' ? <IconSun size={16} /> : <IconMoon size={16} />}
              onClick={() => toggleColorScheme()}
            >
              {safeColorScheme === 'dark' ? 'Switch to Light mode' : 'Switch to Dark mode'}
            </Button>
          </Stack>

          <Divider />

          <Button
            variant="light"
            color="red"
            leftSection={<IconLogout size={16} />}
            onClick={handleLogout}
          >
            Log out
          </Button>
        </Stack>
      </Drawer>
    </Box>
  );
}
