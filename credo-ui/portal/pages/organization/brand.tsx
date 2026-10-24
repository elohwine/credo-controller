import React, { useEffect, useState } from 'react'
import { Alert, Container, Stack, Text, Title } from '@mantine/core'

import Layout from '@/components/Layout'
import BrandEditor from '@/components/organization/BrandEditor'
import { useRequireOrgContext } from '@/lib/portalContext'
import { getOrgScopedToken, getPersonalToken, readActiveOrganization } from '@/utils/organizationContext'

export default function OrganizationBrandPage() {
  useRequireOrgContext('/organization/setup')
  const [orgTenantId, setOrgTenantId] = useState('')
  const [canEdit, setCanEdit] = useState(false)

  useEffect(() => {
    const active = readActiveOrganization()
    if (active?.orgTenantId) setOrgTenantId(active.orgTenantId)
    setCanEdit(['owner', 'admin'].includes(String(active?.role || '').toLowerCase()))
  }, [])

  return (
    <Layout>
      <Container size="sm" py="lg">
        <Stack gap="md">
          <div>
            <Title order={2}>Brand and documents</Title>
            <Text c="dimmed" size="sm">
              Your logo, colour and details on quotes, invoices, receipts, the checkout page, your shop and the records you issue.
            </Text>
          </div>
          {!orgTenantId ? null : canEdit ? (
            <BrandEditor orgTenantId={orgTenantId} getToken={async () => getOrgScopedToken() || getPersonalToken() || ''} />
          ) : (
            <Alert color="gray" variant="light">Only owners and admins can change the brand.</Alert>
          )}
        </Stack>
      </Container>
    </Layout>
  )
}
