import React from 'react'
import { useRouter } from 'next/router'
import { Container, Stack, Text, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import Layout from '@/components/Layout'
import { showGuidesAgain } from '@/components/guides/SectionGuides'
import { useAppGuides } from '@/lib/guides'
import { usePortalContext } from '@/lib/portalContext'
import { HelpAndFeedback } from '../../shared/HelpAndFeedback'
import { ORG_SETTINGS_GROUPS } from '../../shared/orgSettings'

export default function HelpPage() {
  const router = useRouter()
  const guides = useAppGuides()
  const { isOrg, activeOrg } = usePortalContext()
  const orgAdmin = isOrg && ['owner', 'admin'].includes(String(activeOrg?.role || '').toLowerCase())
  const items = ORG_SETTINGS_GROUPS.flatMap((group) => group.items)
  const from = typeof router.query.from === 'string' ? router.query.from : 'portal'

  return (
    <Layout title="Help & Feedback">
      <Container size="sm" py="xl">
        <Stack gap="lg">
          <div>
            <Title order={2}>Help & Feedback</Title>
            <Text size="sm" c="dimmed">Answers to common questions, and a way to tell us what is missing.</Text>
          </div>
          <HelpAndFeedback
            context={`Portal · ${from}`}
            canOpenSetting={(id) => isOrg && (orgAdmin || !items.find((item) => item.id === id)?.adminOnly)}
            onOpenSetting={(id) => {
              const item = items.find((entry) => entry.id === id)
              if (item) void router.push(item.href)
            }}
            onOpenSetup={isOrg ? () => void router.push('/organization/setup') : undefined}
            onShowGuides={() => {
              void showGuidesAgain(guides.mark).then(() =>
                notifications.show({ color: 'green', message: 'The guide is back at the top of Inbox.' }),
              )
            }}
          />
        </Stack>
      </Container>
    </Layout>
  )
}
