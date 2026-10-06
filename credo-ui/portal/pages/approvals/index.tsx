import React from 'react'
import { Container } from '@mantine/core'
import Layout from '@/components/Layout'
import WorkSurface from '@/components/work/WorkSurface'

import { useRequireOrgContext } from '@/lib/portalContext'
export default function ApprovalsPage() {
  // Org-only surface: personal sessions are redirected (mirrors mobile /finance → /inbox).
  useRequireOrgContext('/inbox')

  return (
    <Layout title="Approvals">
      <Container size="xl" py="lg">
        <WorkSurface mode="approvals" />
      </Container>
    </Layout>
  )
}