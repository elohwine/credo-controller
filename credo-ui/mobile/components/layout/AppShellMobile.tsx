import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { Box, Group, Text, ActionIcon, Avatar, Drawer, Stack, Button, Divider, useMantineColorScheme, Menu } from '@mantine/core';
import { IconSettings, IconLogout, IconBuilding, IconChevronDown, IconSun, IconMoon, IconCheck, IconUser } from '@tabler/icons-react';
import BottomNav from './BottomNav';
import { getActiveOrgLabel, getUserName, getUserRole, clearAuth, getWalletToken, syncOrgContextFromServer, applyOrgContext, setPersonalContext } from '@/lib/auth';
import api from '@/lib/api';

interface AppShellMobileProps {
  children: React.ReactNode;
  inboxCount?: number;
  minimalHeader?: boolean;
}

export default function AppShellMobile({ children, inboxCount = 0, minimalHeader = false }: AppShellMobileProps) {
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

  useEffect(() => {
    let cancelled = false;
    let syncing = false;

    const refreshAuthState = () => {
      if (cancelled) return;
      setOrgLabel(getActiveOrgLabel());
      setUserName(getUserName());
      setUserRole(getUserRole());
    };

    const bootstrap = async () => {
      if (syncing) return;
      syncing = true;
      setMounted(true);
      const changed = await syncOrgContextFromServer();
      syncing = false;
      refreshAuthState();
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
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    return () => {
      cancelled = true;
      window.removeEventListener('focus', handleVisibilityOrFocus);
      window.removeEventListener('pageshow', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, []);

  const safeColorScheme = mounted ? colorScheme : 'light';

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
    setOrgSwitching(true);
    try {
      const token = getWalletToken();
      if (!token) throw new Error('Missing personal wallet session');
      const res = await api.post(`/api/organizations/${orgId}/switch`, {}, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const { token: orgToken, sector, workflowTypes, orgRole: serverRole } = res.data;
      const effectiveRole = serverRole || orgRole;
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
    } catch {
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

  const handleLogout = () => {
    clearAuth();
    router.replace('/login/');
  };

  return (
    <Box style={{ minHeight: '100svh' }}>
      {/* Top bar */}
      <Box
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          background: safeColorScheme === 'dark' ? 'rgba(26, 27, 30, 0.88)' : 'rgba(255, 255, 255, 0.82)',
          borderBottom: minimalHeader ? 'none' : `1px solid ${safeColorScheme === 'dark' ? 'rgba(87, 93, 108, 0.32)' : 'rgba(148, 163, 184, 0.18)'}`,
          boxShadow: minimalHeader ? 'none' : '0 8px 24px rgba(15, 23, 42, 0.04)',
          backdropFilter: 'blur(18px) saturate(180%)',
          paddingTop: 'max(env(safe-area-inset-top), var(--app-statusbar-offset, 0px))',
        }}
      >
        {minimalHeader ? (
          <Group justify="flex-end" align="center" px="md" h={48} gap={4}>
            <ActionIcon
              variant="subtle"
              size="lg"
              color="gray"
              onClick={() => toggleColorScheme()}
              aria-label="Toggle dark mode"
            >
              {safeColorScheme === 'dark' ? <IconSun size={20} /> : <IconMoon size={20} />}
            </ActionIcon>
            <ActionIcon
              variant="subtle"
              size="lg"
              color="gray"
              onClick={() => setSettingsOpen(true)}
            >
              <IconSettings size={21} />
            </ActionIcon>
          </Group>
        ) : (
          <Group justify="space-between" align="center" px="md" h={54}>
            {/* Org context — click to switch org */}
            <Menu
              opened={orgMenuOpen}
              onClose={() => setOrgMenuOpen(false)}
              position="bottom-start"
              withinPortal
              shadow="md"
              radius="md"
            >
              <Menu.Target>
                <Group
                  gap="xs"
                  style={{ cursor: 'pointer', flex: 1, minWidth: 0 }}
                  onClick={() => { loadOrgs(); setOrgMenuOpen(true); }}
                >
                  <Avatar size={32} color="credentis" radius="sm">
                    {(orgLabel ?? 'C').charAt(0).toUpperCase()}
                  </Avatar>
                  <Box style={{ minWidth: 0 }}>
                    <Text size="xs" c="dimmed" lh={1}>
                      {userRole === 'issuer' ? 'Organisation' : 'Account'}
                    </Text>
                    <Group gap={4} align="center">
                      <Text size="sm" fw={600} truncate style={{ maxWidth: 160 }}>
                        {orgLabel ?? 'My Account'}
                      </Text>
                      <IconChevronDown size={12} color="#94a3b8" />
                    </Group>
                  </Box>
                </Group>
              </Menu.Target>
              <Menu.Dropdown>
                {orgsLoading && (
                  <Menu.Item disabled>Loading organisations…</Menu.Item>
                )}
                {!orgsLoading && orgs.length === 0 && (
                  <Menu.Item disabled>No organisations found</Menu.Item>
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
              </Menu.Dropdown>
            </Menu>

            {/* Dark mode + Settings */}
            <Group gap={4}>
              <ActionIcon
                variant="subtle"
                size="lg"
                color="gray"
                onClick={() => toggleColorScheme()}
                aria-label="Toggle dark mode"
              >
                {safeColorScheme === 'dark' ? <IconSun size={19} /> : <IconMoon size={19} />}
              </ActionIcon>
              <ActionIcon
                variant="subtle"
                size="lg"
                color="gray"
                onClick={() => setSettingsOpen(true)}
              >
                <IconSettings size={20} />
              </ActionIcon>
            </Group>
          </Group>
        )}
      </Box>

      {/* Page content */}
      <Box className="page-content">{children}</Box>

      {/* Bottom navigation */}
      <BottomNav inboxCount={inboxCount} />

      {/* Settings drawer */}
      <Drawer
        opened={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        position="bottom"
        size="auto"
        title="Settings"
        radius="lg"
        styles={{ content: { borderRadius: '16px 16px 0 0' } }}
      >
        <Stack gap="md" pb="lg">
          <Stack gap="xs">
            <Text size="xs" c="dimmed" tt="uppercase" fw={600} px="xs">
              Account
            </Text>
            <Group px="xs">
              <Avatar size={40} color="credentis" radius="xl">
                {(userName ?? 'U').charAt(0).toUpperCase()}
              </Avatar>
              <Box>
                <Text fw={600}>{userName ?? 'User'}</Text>
                <Text size="sm" c="dimmed" tt="capitalize">
                  {userRole ?? 'holder'}
                </Text>
              </Box>
            </Group>
          </Stack>

          <Divider />

          <Stack gap="xs">
            <Text size="xs" c="dimmed" tt="uppercase" fw={600} px="xs">
              Organisation
            </Text>
            <Group gap="sm" px="xs">
              <IconBuilding size={18} color="#2188ca" />
              <Text>{orgLabel ?? '—'}</Text>
            </Group>
            <Button
              variant="light"
              color="credentis"
              leftSection={<IconBuilding size={16} />}
              onClick={() => {
                setSettingsOpen(false);
                router.push('/settings/org/');
              }}
            >
              Switch Organisation
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
