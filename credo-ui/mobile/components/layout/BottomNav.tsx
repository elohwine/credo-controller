import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { Text, Box } from '@mantine/core';
import { IconHome, IconScan, IconInbox, IconWallet, IconBuilding, IconBriefcase } from '@tabler/icons-react';
import { CREDENTIS_CONTEXT_CHANGED_EVENT, getContextMode, getUserRole } from '@/lib/auth';

interface BottomNavProps {
  inboxCount?: number;
}

export default function BottomNav({ inboxCount = 0 }: BottomNavProps) {
  const router = useRouter();
  const [contextMode, setContextMode] = useState<string>('personal');

  useEffect(() => {
    const refresh = () => {
      const nextRole = getUserRole();
      const nextMode = getContextMode();
      setContextMode(nextMode);
    };
    refresh();
    window.addEventListener(CREDENTIS_CONTEXT_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(CREDENTIS_CONTEXT_CHANGED_EVENT, refresh);
  }, []);

  const isOrgContext = contextMode === 'org';

  // Center FAB: Scan/Verify for both org and personal — useful for VC scanning, offline verification
  const fabHref = '/scan';
  const fabLabel = 'Scan';
  const FabIcon = IconScan;

  // Org: Home | Operations | [SCAN] | Inbox | Network — Money remains a clear section inside Operations.
  // Personal: Home | Activity | [SCAN] | Network | Records
  const NAV_TABS = isOrgContext ? [
    { href: '/', label: 'Home', icon: IconHome },
    { href: '/finance', label: 'Operations', icon: IconBriefcase },
    { href: fabHref, label: fabLabel, icon: FabIcon, isFab: true },
    { href: '/inbox', label: 'Inbox', icon: IconInbox },
    { href: '/contacts', label: 'Network', icon: IconBuilding },
  ] : [
    { href: '/', label: 'Home', icon: IconHome },
    { href: '/inbox', label: 'Activity', icon: IconInbox },
    { href: fabHref, label: fabLabel, icon: FabIcon, isFab: true },
    { href: '/organizations', label: 'Network', icon: IconBuilding },
    { href: '/proofs', label: 'Records', icon: IconWallet },
  ];

  const isActive = (href: string) => {
    if (href === '/') return router.pathname === '/' || router.pathname === '/index';
    return router.pathname.startsWith(href) || (href === '/inbox' && router.pathname === '/requests');
  };

  return (
    <Box component="nav" aria-label="Main navigation" className="bottom-nav">
      <Box style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: 80,
        maxWidth: 500,
        margin: '0 auto',
        position: 'relative',
        padding: '0 12px'
      }}>
        {NAV_TABS.map((tab, idx) => {
          const active = isActive(tab.href);
          const Icon = tab.icon;
          const activeColor = 'light-dark(var(--mantine-color-blue-8), var(--mantine-color-blue-3))';
          const inactiveColor = 'light-dark(var(--mantine-color-gray-7), var(--mantine-color-dark-2))';
          const color = active ? activeColor : inactiveColor;

          if (tab.isFab) {
            // The scan button gets its own slot so it never sits over the tabs beside it or their badges.
            return (
              <Box key={tab.href} style={{ position: 'relative', width: 72, flexShrink: 0, height: '100%' }}>
              <Box
                component="button"
                type="button"
                onClick={() => router.replace(tab.href)}
                aria-label={tab.label || 'Scan'}
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: 0,
                  width: 58,
                  height: 58,
                  borderRadius: '18px', // Squircle-ish for premium feel
                  background: 'linear-gradient(135deg, var(--mantine-color-blue-6) 0%, var(--mantine-color-blue-8) 100%)',
                  boxShadow: 'light-dark(0 8px 24px color-mix(in srgb, var(--mantine-color-blue-6) 32%, transparent), 0 8px 24px color-mix(in srgb, var(--mantine-color-black) 50%, transparent))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  flexShrink: 0,
                  zIndex: 20,
                  transform: 'translate(-50%, -18px)',
                  transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                  border: '3px solid light-dark(var(--mantine-color-white), var(--mantine-color-dark-6))'
                }}
              >
                <Icon size={28} color="var(--mantine-color-white)" stroke={2.2} />
              </Box>
              </Box>
            );
          }

          const button = (
            <Box
              component="button"
              type="button"
              aria-current={active ? 'page' : undefined}
              aria-label={tab.href === '/inbox' && inboxCount > 0 ? `${tab.label}, ${inboxCount} new items` : tab.label}
              key={tab.href} onClick={() => router.replace(tab.href)}
              style={{
                background: 'transparent',
                border: 0,
                font: 'inherit',
                flex: 1,
                minWidth: 48,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                cursor: 'pointer',
                height: '100%',
                paddingTop: 8,
                paddingBottom: 8,
                transition: 'opacity 0.2s ease'
              }}
            >
              <Box style={{
                height: 32,
                minWidth: 56,
                borderRadius: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: active ? 'light-dark(var(--mantine-color-blue-1), rgba(33, 136, 202, 0.28))' : 'transparent',
              }}>
                {/* Material 3 places a navigation badge on the icon's top-end corner, inside its own tab. */}
                <Box style={{ position: 'relative', display: 'flex' }}>
                  <Icon size={22} color={color} stroke={active ? 2.5 : 1.8} />
                  {tab.href === '/inbox' && inboxCount > 0 && (
                    <Box
                      component="span"
                      aria-label={`${inboxCount} new`}
                      style={{
                        position: 'absolute',
                        top: -6,
                        left: 14,
                        minWidth: 16,
                        height: 16,
                        padding: '0 4px',
                        borderRadius: 8,
                        background: 'var(--mantine-color-red-6)',
                        color: 'var(--mantine-color-white)',
                        fontSize: 11,
                        fontWeight: 700,
                        lineHeight: '16px',
                        textAlign: 'center',
                        boxSizing: 'border-box',
                        pointerEvents: 'none',
                      }}
                    >
                      {inboxCount > 99 ? '99+' : inboxCount}
                    </Box>
                  )}
                </Box>
              </Box>
              <Text style={{ fontSize: 12, fontWeight: active ? 700 : 500, color, whiteSpace: 'nowrap' }}>{tab.label}</Text>
            </Box>
          );

          return button;
        })}
      </Box>
    </Box>
  );
}
