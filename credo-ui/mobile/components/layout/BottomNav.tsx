import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { Text, Box, Indicator } from '@mantine/core';
import {
  IconHome, IconScan, IconInbox, IconWallet, IconReceipt, IconBuilding,
  IconPlus
} from '@tabler/icons-react';
import { getContextMode, getUserRole } from '@/lib/auth';

interface BottomNavProps {
  inboxCount?: number;
}

export default function BottomNav({ inboxCount = 0 }: BottomNavProps) {
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);
  const [contextMode, setContextMode] = useState<string>('personal');

  useEffect(() => {
    setRole(getUserRole());
    setContextMode(getContextMode());
  }, []);

  const isOrgOperator = ['owner', 'admin', 'issuer', 'approver', 'manager'].includes(role ?? '');

  // Center FAB: Scan/Verify for both org and personal — useful for VC scanning, offline verification
  const fabHref = '/scan';
  const fabLabel = 'Scan';
  const FabIcon = IconScan;

  // Org: Home | Finance+Ops | [SCAN] | Inbox | Network  — 2 left + FAB + 2 right = always centered
  // Personal: Home | Activity | [SCAN] | Network | Records
  const NAV_TABS = isOrgOperator ? [
    { href: '/', label: 'Home', icon: IconHome },
    { href: '/finance', label: 'Finance + Ops', icon: IconReceipt },
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
    return router.pathname.startsWith(href);
  };

  return (
    <Box className="bottom-nav">
      <Box style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: 65,
        maxWidth: 500,
        margin: '0 auto',
        position: 'relative',
        padding: '0 12px'
      }}>
        {NAV_TABS.map((tab, idx) => {
          const active = isActive(tab.href);
          const Icon = tab.icon;
          const activeColor = 'light-dark(var(--mantine-color-blue-6), var(--mantine-color-blue-4))';
          const inactiveColor = 'light-dark(var(--mantine-color-gray-4), var(--mantine-color-dark-2))';
          const color = active ? activeColor : inactiveColor;

          if (tab.isFab) {
            return (
              <Box
                key={tab.href} onClick={() => router.push(tab.href)}
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
            );
          }

          const button = (
            <Box
              key={tab.href} onClick={() => router.push(tab.href)}
              style={{
                flex: 1,
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
              <Icon size={22} color={color} stroke={active ? 2.5 : 1.8} />
              <Text style={{ fontSize: 10, fontWeight: active ? 700 : 500, color, whiteSpace: 'nowrap' }}>{tab.label}</Text>
            </Box>
          );

          if (tab.href === '/inbox' && inboxCount > 0) {
            return (
              <Indicator key={tab.href} label={inboxCount > 9 ? '9+' : inboxCount} size={16} color="red" offset={2} style={{ flex: 1 }}>
                {button}
              </Indicator>
            );
          }

          return button;
        })}
      </Box>
    </Box>
  );
}
