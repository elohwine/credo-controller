import React from 'react'
import { useRouter } from 'next/router'
import { Stack, Text, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import AppShellMobile from '@/components/layout/AppShellMobile'
import { showGuidesAgain } from '@/components/guides/SectionGuides'
import { getActiveOrgId, getUserRole } from '@/lib/auth'
import { useAppGuides } from '@/lib/guides'
import { HelpAndFeedback } from '../../shared/HelpAndFeedback'
import { ORG_SETTINGS_GROUPS } from '../../shared/orgSettings'

export default function HelpPage() {
  const router = useRouter()
  const guides = useAppGuides()
  const [org, setOrg] = React.useState<{ id: string | null; admin: boolean }>({ id: null, admin: false })
  React.useEffect(() => {
    setOrg({ id: getActiveOrgId(), admin: ['owner', 'admin'].includes(String(getUserRole() || '').toLowerCase()) })
  }, [])
  const items = ORG_SETTINGS_GROUPS.flatMap((group) => group.items)
  const from = typeof router.query.from === 'string' ? router.query.from : 'app'

  return (
    <AppShellMobile>
      <Stack p="md" gap="lg">
        <div>
          <Title order={2}>Help & Feedback</Title>
          <Text size="sm" c="dimmed">Answers to common questions, and a way to tell us what is missing.</Text>
        </div>
        <HelpAndFeedback
          context={`App · ${from}`}
          canOpenSetting={(id) => {
            const item = items.find((entry) => entry.id === id)
            return Boolean(org.id && item && (org.admin || !item.adminOnly) && (item.mobileSection || item.mobileHref))
          }}
          onOpenSetting={(id) => {
            const item = items.find((entry) => entry.id === id)
            if (item?.mobileSection) void router.push(`/settings/org/?section=${item.mobileSection}`)
            else if (item?.mobileHref) void router.push(item.mobileHref)
          }}
          onOpenSetup={org.id && org.admin ? () => void router.push('/settings/org/') : undefined}
          onShowGuides={() => {
            void showGuidesAgain(guides.mark).then(() =>
              notifications.show({ color: 'green', message: 'The guide is back at the top of Inbox.' }),
            )
          }}
        />
      </Stack>
    </AppShellMobile>
  )
}
