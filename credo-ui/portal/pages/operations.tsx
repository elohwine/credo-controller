import { useEffect, useState } from 'react'
import { Container, Text, Title } from '@mantine/core'
import { useRouter } from 'next/router'

import Layout from '@/components/Layout'
import { usePortalOperations } from '@/lib/operations'
import { useRequireOrgContext } from '@/lib/portalContext'
import { readActiveOrganization } from '@/utils/organizationContext'
import { OperationsRegisters } from '../../shared/operations/OperationsRegisters'

export default function OperationsPage() {
  useRequireOrgContext('/inbox')
  const router = useRouter()
  const { api, notify } = usePortalOperations()
  const [role, setRole] = useState('')
  useEffect(() => setRole(String(readActiveOrganization()?.role || '').toLowerCase()), [])
  const tab = String(router.query.tab || '')
  const store = String(router.query.store || '')

  return (
    <Layout title="Stores & vans">
      <Container size="lg" py="md">
        <Title order={2} fw={500} mb={4}>
          Stores & vans
        </Title>
        <Text c="dimmed" mb="md">
          Each store keeps its jobs, quotes and invoices. Each van keeps its service day, MOT, drivers and accidents. People, their
          staff number and their work are under Payroll, Employees.
        </Text>
        <OperationsRegisters
          key={`${tab}|${store}`}
          api={api}
          surface="portal"
          canEdit={['owner', 'admin', 'dispatcher', 'manager'].includes(role)}
          notify={notify}
          initialTab={tab === 'vans' ? tab : 'stores'}
          initialStore={store || undefined}
          onOpenJob={(runId) => void router.push(`/finance/job-cards?runId=${encodeURIComponent(runId)}`)}
        />
      </Container>
    </Layout>
  )
}
