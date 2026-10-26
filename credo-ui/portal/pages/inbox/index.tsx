import React from 'react'
import { Container } from '@mantine/core'
import Layout from '@/components/Layout'
import RequestWorkspace from '@/components/requests/RequestWorkspace'
import { InboxGettingStarted } from '@/components/guides/SectionGuides'
import { isOrgContextActive } from '@/utils/portalTenant'

export default function PortalInboxPage() {
  const [personal, setPersonal] = React.useState(false)
  React.useEffect(() => setPersonal(!isOrgContextActive()), [])
  return (
    <Layout title="Inbox">
      <Container size="xl" py="lg">
        {personal && <InboxGettingStarted wrap={{ maxWidth: 720, marginBottom: 16 }} />}
        <RequestWorkspace mode="inbox" />
      </Container>
    </Layout>
  )
}
