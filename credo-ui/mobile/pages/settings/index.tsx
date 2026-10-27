import React from 'react'
import { useRouter } from 'next/router'
import { Stack, Text, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconBell,
  IconBuilding,
  IconCertificate,
  IconCards,
  IconHelpCircle,
  IconPlugConnected,
  IconShieldLock,
} from '@tabler/icons-react'
import AppShellMobile from '@/components/layout/AppShellMobile'
import { showGuidesAgain } from '@/components/guides/SectionGuides'
import { getActiveOrgId, getActiveOrgLabel, getUserRole } from '@/lib/auth'
import { guideClient, useAppGuides } from '@/lib/guides'
import { SettingsList, useHolderSettings, type SettingsGroup } from '../../../shared/Guides'

/** One place for every setting, grouped the way Android lays out app settings. */
export default function SettingsHome() {
  const router = useRouter()
  const guides = useAppGuides()
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
        { key: 'alerts', icon: <IconBell size={20} />, title: 'Notifications', summary: 'WhatsApp alerts', onSelect: go('/settings/alerts/') },
      ],
    },
    {
      title: org.label ? `Organisation · ${org.label}` : 'Organisation',
      rows: org.id && org.admin
        ? [
            { key: 'org', icon: <IconBuilding size={20} />, title: 'Organisation settings', summary: 'People, roles and records', onSelect: go('/settings/org/') },
            { key: 'ops', icon: <IconCertificate size={20} />, title: 'Credential operations', summary: 'Issue, suspend and revoke', onSelect: go('/credential-operations') },
            { key: 'systems', icon: <IconPlugConnected size={20} />, title: 'Connected systems', summary: 'Sign-in partners and integrations', onSelect: go('/connected-systems') },
          ]
        : [],
    },
    {
      title: 'Help',
      rows: [
        {
          key: 'guide',
          icon: <IconHelpCircle size={20} />,
          title: 'Getting-started guide',
          summary: 'Show the checklist and section tips again',
          actionLabel: 'Show again',
          onSelect: () => {
            void showGuidesAgain(guides.mark).then(() =>
              notifications.show({ color: 'green', message: 'The guide is back at the top of Inbox.' }),
            )
          },
        },
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
