import { Container } from '@mantine/core'
import Layout from '@/components/Layout'
import RequestWorkspace from '@/components/requests/RequestWorkspace'
import { useRequireOrgContext } from '@/lib/portalContext'

export default function RequisitionsDashboard() {
  useRequireOrgContext('/inbox')

  return (
    <Layout title="Purchase requests">
      <Container size="xl" py="lg">
        <RequestWorkspace mode="requests" category="requisitions" />
      </Container>
    </Layout>
  )
}
