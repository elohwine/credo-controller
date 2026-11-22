import { useEffect, useState } from 'react'
import { Box, Button, Text, Title } from '@mantine/core'
import { useRouter } from 'next/router'

import AppShellMobile from '@/components/layout/AppShellMobile'
import { getActiveOrgId, getOrgRoleClaim } from '@/lib/auth'
import { usePhoneOperations } from '@/lib/operations'
import { PeopleDirectory } from '../../shared/people/PeopleDirectory'

/**
 * The same team directory is used in the portal and app. Employee details and team app access
 * are managed here; payroll runs and filings remain a portal workflow.
 */
export default function PeoplePage() {
  const router = useRouter()
  const { api, notify } = usePhoneOperations()
  const [role, setRole] = useState('')
  const [orgTenantId, setOrgTenantId] = useState('')
  useEffect(() => {
    setRole(String(getOrgRoleClaim() || '').toLowerCase())
    setOrgTenantId(getActiveOrgId() || '')
  }, [])

  return (
    <AppShellMobile>
      <Box p="md">
        <Title order={3} fw={500}>
          HR operations
        </Title>
        <Text size="sm" c="dimmed" mb="md">
          One list for your team. Add people, manage app access, and see their staff number, van and work.
        </Text>
        {orgTenantId ? (
          <PeopleDirectory
            api={api}
            orgTenantId={orgTenantId}
            surface="phone"
            role={role}
            notify={notify}
            onOpenJob={(runId) => void router.push(`/finance?tab=field&runId=${encodeURIComponent(runId)}`)}
          />
        ) : (
          <Box>
            <Text size="sm" c="dimmed">
              Open your organisation to see its people.
            </Text>
            <Button mt="md" variant="light" onClick={() => void router.push('/organizations')}>
              Choose organisation
            </Button>
          </Box>
        )}
      </Box>
    </AppShellMobile>
  )
}
