import React from 'react'
import { Container } from '@mantine/core'
import Layout from '@/components/Layout'
import RequestWorkspace from '@/components/requests/RequestWorkspace'

import { useRequireOrgContext } from '@/lib/portalContext'
export default function PortalRequestsPage() {
  // Org-only surface: personal sessions are redirected (mirrors mobile /finance → /inbox).
  useRequireOrgContext('/inbox')

  return (
    <Layout title="Requests">
      <Container size="xl" py="lg">
        <RequestWorkspace mode="requests" />
      </Container>
    </Layout>
  )
}
