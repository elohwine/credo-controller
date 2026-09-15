import React from 'react'
import { Container } from '@mantine/core'
import Layout from '@/components/Layout'
import RequestWorkspace from '@/components/requests/RequestWorkspace'

export default function PortalRequestsPage() {
  return (
    <Layout title="Requests">
      <Container size="xl" py="lg">
        <RequestWorkspace mode="requests" />
      </Container>
    </Layout>
  )
}
