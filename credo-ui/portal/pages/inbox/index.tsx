import React from 'react'
import { Container } from '@mantine/core'
import Layout from '@/components/Layout'
import RequestWorkspace from '@/components/requests/RequestWorkspace'

export default function PortalInboxPage() {
  return (
    <Layout title="Inbox">
      <Container size="xl" py="lg">
        <RequestWorkspace mode="inbox" />
      </Container>
    </Layout>
  )
}
