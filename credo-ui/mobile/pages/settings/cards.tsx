import React from 'react'
import { useRouter } from 'next/router'
import { Button, Stack, Text, Title } from '@mantine/core'
import { IconArrowLeft } from '@tabler/icons-react'
import AppShellMobile from '@/components/layout/AppShellMobile'
import { guideClient } from '@/lib/guides'
import { CardSavingPanel } from '../../../shared/Guides'

export default function CardSettingsPage() {
  const router = useRouter()
  return (
    <AppShellMobile>
      <Stack p="md" gap="md">
        <Button variant="subtle" color="gray" leftSection={<IconArrowLeft size={16} />} w="fit-content" onClick={() => void router.push('/settings/')}>
          Settings
        </Button>
        <div>
          <Title order={3}>Saving new cards</Title>
          <Text size="sm" c="dimmed">You accept each card until you turn this on. Your identity card always waits for you.</Text>
        </div>
        <CardSavingPanel client={guideClient} />
      </Stack>
    </AppShellMobile>
  )
}
