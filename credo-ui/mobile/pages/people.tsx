import { useEffect, useState } from 'react'
import { Box, Text, Title } from '@mantine/core'
import { useRouter } from 'next/router'

import AppShellMobile from '@/components/layout/AppShellMobile'
import { getActiveOrgId, getOrgRoleClaim } from '@/lib/auth'
import { usePhoneOperations } from '@/lib/operations'
import { PeopleDirectory } from '../../shared/people/PeopleDirectory'

/**
 * The one list of people on the phone: everyone on the team, their app access, staff number, skills,
 * van and work. The website shows the same list under People & payroll (pay is set there).
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
          People
        </Title>
        <Text size="sm" c="dimmed" mb="md">
          Everyone on your team in one list. Add people, give them the app, and see their staff number, van and work. Pay is set on
          the website under People & payroll.
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
          <Text size="sm" c="dimmed">
            Open your organisation to see its people.
          </Text>
        )}
      </Box>
    </AppShellMobile>
  )
}
