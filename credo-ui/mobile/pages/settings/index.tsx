import React from 'react'
import { useRouter } from 'next/router'
import { Stack, Text, Title } from '@mantine/core'
import {
  IconBell,
  IconBuilding,
  IconCertificate,
  IconCards,
  IconHelpCircle,
  IconPlugConnected,
  IconId,
  IconShieldLock,
} from '@tabler/icons-react'
import AppShellMobile from '@/components/layout/AppShellMobile'
import { getActiveOrgId, getActiveOrgLabel, getUserRole } from '@/lib/auth'
import { guideClient } from '@/lib/guides'
import { SettingsList, useHolderSettings, type SettingsGroup } from '../../../shared/Guides'

/** One place for every setting, grouped the way Android lays out app settings. */
export default function SettingsHome() {
  const router = useRouter()
  const { settings } = useHolderSettings(guideClient)
  const [org, setOrg] = React.useState<{ id: string | null; label: string | null; admin: boolean }>({ id: null, label: null, admin: false })
  React.useEffect(() => {
    setOrg({
      id: getActiveOrgId(),
      label: getActiveOrgLabel(),
      admin: ['owner', 'admin'].includes(String(getUserRole() || '').toLowerCase()),
    })
  }, [])

  const go = (path: string) => () => void router.push(path)
  const cardSummary = settings?.autoSaveCards ? 'Saved automatically' : 'You accept each new card'

  const groups: SettingsGroup[] = [
    {
      title: 'Cards and records',
      rows: [{ key: 'cards', icon: <IconCards size={20} />, title: 'Saving new cards', summary: cardSummary, onSelect: go('/settings/cards/') }],
    },
    {
      title: 'Account',
      rows: [
        { key: 'security', icon: <IconShieldLock size={20} />, title: 'Sign-in and security', summary: 'Account PIN and this phone', onSelect: go('/settings/security/') },
        { key: 'identity', icon: <IconId size={20} />, title: 'Date of birth', summary: 'Ask the Central Registry, or add it yourself', onSelect: go('/settings/identity/') },
        { key: 'alerts', icon: <IconBell size={20} />, title: 'Notifications', summary: 'WhatsApp alerts', onSelect: go('/settings/alerts/') },
      ],
    },
    {
      title: org.label ? `Organisation · ${org.label}` : 'Organisation',
      rows: org.id && org.admin
        ? [
            { key: 'org', icon: <IconBuilding size={20} />, title: 'Organisation settings', summary: 'Next setup step and every organisation setting', onSelect: go('/settings/org/') },
            { key: 'ops', icon: <IconCertificate size={20} />, title: 'Manage records', summary: 'Issue, suspend and revoke', onSelect: go('/credential-operations') },
            { key: 'systems', icon: <IconPlugConnected size={20} />, title: 'Connected systems', summary: 'Sign-in partners and integrations', onSelect: go('/connected-systems') },
          ]
        : [],
    },
    {
      title: 'Support',
      rows: [
        { key: 'help', icon: <IconHelpCircle size={20} />, title: 'Help & Feedback', summary: 'Common questions, the getting-started guide and feedback', onSelect: go('/help/?from=settings') },
      ],
    },
  ]

  return (
    <AppShellMobile>
      <Stack p="md" gap="lg">
        <div>
          <Title order={2}>Settings</Title>
          <Text size="sm" c="dimmed">For your own account{org.label ? ` and ${org.label}` : ''}.</Text>
        </div>
        <SettingsList groups={groups} />
      </Stack>
    </AppShellMobile>
  )
}
