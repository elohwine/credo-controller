import { useEffect, useState } from 'react'
import { Box, Text, Title } from '@mantine/core'
import { useRouter } from 'next/router'

import AppShellMobile from '@/components/layout/AppShellMobile'
import { getOrgRoleClaim } from '@/lib/auth'
import { usePhoneOperations } from '@/lib/operations'
import { OperationsRegisters } from '../../shared/operations/OperationsRegisters'

export default function RegistersPage() {
  const router = useRouter()
  const { api, notify } = usePhoneOperations()
  const [role, setRole] = useState('')
  useEffect(() => setRole(String(getOrgRoleClaim() || '').toLowerCase()), [])
  const tab = String(router.query.tab || '')
  const store = String(router.query.store || '')

  return (
    <AppShellMobile>
      <Box p="md">
        <Title order={3} fw={500}>
          Stores & vans
        </Title>
        <Text size="sm" c="dimmed" mb="md">
          Each store keeps its jobs, quotes and invoices. Each van keeps its service day, MOT, drivers and accidents. People and
          their work are on the People page.
        </Text>
        <OperationsRegisters
          key={`${tab}|${store}`}
          api={api}
          surface="phone"
          canEdit={['owner', 'admin', 'dispatcher', 'manager'].includes(role)}
          notify={notify}
          initialTab={tab === 'vans' ? tab : 'stores'}
          initialStore={store || undefined}
          onOpenJob={(runId) => void router.push(`/finance?tab=field&runId=${encodeURIComponent(runId)}`)}
        />
      </Box>
    </AppShellMobile>
  )
}
