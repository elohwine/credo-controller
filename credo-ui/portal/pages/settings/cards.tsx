import React from 'react'
import Link from 'next/link'
import { Anchor, Container, Stack, Text, Title } from '@mantine/core'
import Layout from '@/components/Layout'
import { useAppGuides } from '@/lib/guides'
import { CardSavingPanel } from '../../../shared/Guides'

export default function CardSettingsPage() {
  const { client } = useAppGuides()
  return (
    <Layout>
      <Container size="sm" py="xl">
        <Stack gap="md">
          <Anchor component={Link} href="/settings" size="sm">← Settings</Anchor>
          <div>
            <Title order={2}>Saving new cards</Title>
            <Text size="sm" c="dimmed">Choose what happens when an organisation sends you a card.</Text>
          </div>
          <CardSavingPanel client={client} />
        </Stack>
      </Container>
    </Layout>
  )
}
