import React from 'react'
import { Container } from '@mantine/core'
import Layout from '@/components/Layout'
import WorkSurface from '@/components/work/WorkSurface'

import { useRequireOrgContext } from '@/lib/portalContext'
export default function TasksPage() {
  // Org-only surface: personal sessions are redirected (mirrors mobile /finance → /inbox).
  useRequireOrgContext('/inbox')

  return (
    <Layout title="Tasks">
      <Container size="xl" py="lg">
        <WorkSurface mode="tasks" />
      </Container>
    </Layout>
  )
}