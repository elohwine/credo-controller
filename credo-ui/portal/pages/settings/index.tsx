import React from 'react'
import { useRouter } from 'next/router'
import { Container, Stack, Text, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconBrandWhatsapp,
  IconBuilding,
  IconCards,
  IconCertificate,
  IconHelpCircle,
  IconLogin2,
  IconShieldLock,
} from '@tabler/icons-react'
import Layout from '@/components/Layout'
import { showGuidesAgain } from '@/components/guides/SectionGuides'
import { useAppGuides } from '@/lib/guides'
import { usePortalContext } from '@/lib/portalContext'
import { SettingsList, useHolderSettings, type SettingsGroup } from '../../../shared/Guides'

/** One place for every setting, grouped the same way as the Android app. */
export default function SettingsHome() {
  const router = useRouter()
  const guides = useAppGuides()
  const { settings } = useHolderSettings(guides.client)
  const { isOrg, activeOrg } = usePortalContext()
  const orgAdmin = isOrg && ['owner', 'admin'].includes(String(activeOrg?.role || '').toLowerCase())

  const go = (path: string) => () => void router.push(path)
  const cardSummary = settings?.autoSaveCards ? 'Saved automatically' : 'You accept each new card'

  const groups: SettingsGroup[] = [
    {
      title: 'Cards and records',
      rows: [{ key: 'cards', icon: <IconCards size={20} />, title: 'Saving new cards', summary: cardSummary, onSelect: go('/settings/cards') }],
    },
    {
      title: 'Account',
      rows: [{ key: 'security', icon: <IconShieldLock size={20} />, title: 'Sign-in and security', summary: 'Devices that can sign in to your account', onSelect: go('/account-security') }],
    },
    {
      title: activeOrg?.name && orgAdmin ? `Organisation · ${activeOrg.name}` : 'Organisation',
      rows: orgAdmin
        ? [
            { key: 'setup', icon: <IconBuilding size={20} />, title: 'Organisation setup', summary: 'People, roles and records', onSelect: go('/organization/setup') },
            { key: 'ops', icon: <IconCertificate size={20} />, title: 'Credential operations', summary: 'Issue, suspend and revoke', onSelect: go('/organization/credential-operations') },
            { key: 'alerts', icon: <IconBrandWhatsapp size={20} />, title: 'WhatsApp alerts', summary: 'What the organisation is told about', onSelect: go('/organization/whatsapp') },
            { key: 'partners', icon: <IconLogin2 size={20} />, title: 'Connected systems', summary: 'Sign-in partners and integrations', onSelect: go('/organization/sign-in-partners') },
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
    <Layout>
      <Container size="sm" py="xl">
        <Stack gap="lg">
          <div>
            <Title order={2}>Settings</Title>
            <Text size="sm" c="dimmed">For your own account{orgAdmin && activeOrg?.name ? ` and ${activeOrg.name}` : ''}.</Text>
          </div>
          <SettingsList groups={groups} />
        </Stack>
      </Container>
    </Layout>
  )
}
