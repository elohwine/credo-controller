import React from 'react'
import { Button, Stack, Title } from '@mantine/core'
import { IconArrowLeft } from '@tabler/icons-react'
import { useRouter } from 'next/router'
import AppShellMobile from '@/components/layout/AppShellMobile'
import WhatsAppAlertsCard from '@/components/shared/WhatsAppAlertsCard'
import { getActiveOrgId, getActiveOrgLabel } from '@/lib/auth'

/** Every signed-in person: their own WhatsApp alert switches, plus the active organisation's if one is open. */
export default function AlertSettingsPage() {
  const router = useRouter()
  const [org, setOrg] = React.useState<{ id: string | null; label: string | null }>({ id: null, label: null })
  React.useEffect(() => setOrg({ id: getActiveOrgId(), label: getActiveOrgLabel() }), [])

  return (
    <AppShellMobile>
      <Stack gap="md" p="md">
        <Button variant="subtle" color="gray" leftSection={<IconArrowLeft size={16} />} w="fit-content" onClick={() => router.back()}>
          Back
        </Button>
        <Title order={3}>WhatsApp alerts</Title>
        <WhatsAppAlertsCard personal />
        {org.id && <WhatsAppAlertsCard orgTenantId={org.id} canEdit={false} />}
      </Stack>
    </AppShellMobile>
  )
}
