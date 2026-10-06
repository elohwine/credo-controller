import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { Alert, Badge, Button, Container, Group, Paper, Stack, Text, TextInput, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'

import Layout from '@/components/Layout'
import { useRequireOrgContext } from '@/lib/portalContext'
import { getOrgScopedToken, getPersonalToken, readActiveOrganization } from '@/utils/organizationContext'

interface TrustedPartner {
  id: string
  name: string
  reference: string
  status: string
  isOwnOrganization: boolean
}

export default function TrustedPartnersPage() {
  useRequireOrgContext('/organization/setup')

  const [orgTenantId, setOrgTenantId] = useState('')
  const [partners, setPartners] = useState<TrustedPartner[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [reference, setReference] = useState('')
  const [saving, setSaving] = useState(false)
  const [trustingOwn, setTrustingOwn] = useState(false)

  const backendUrl = process.env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000'
  const token = () => getOrgScopedToken() || getPersonalToken()

  useEffect(() => {
    const active = readActiveOrganization()
    if (active?.orgTenantId) setOrgTenantId(active.orgTenantId)
  }, [])

  const load = async (id: string) => {
    const auth = token()
    if (!auth || !id) return
    setLoading(true)
    setError(null)
    try {
      const res = await axios.get<{ partners: TrustedPartner[] }>(
        `${backendUrl}/api/organizations/${encodeURIComponent(id)}/setup/trusted-partners`,
        { headers: { Authorization: `Bearer ${auth}` } },
      )
      setPartners(res.data.partners || [])
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Could not load trusted partners')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (orgTenantId) void load(orgTenantId)
  }, [orgTenantId])

  const add = async () => {
    const auth = token()
    if (!auth || !orgTenantId || !reference.trim()) return
    setSaving(true)
    try {
      const res = await axios.post<{ partners: TrustedPartner[] }>(
        `${backendUrl}/api/organizations/${encodeURIComponent(orgTenantId)}/setup/trusted-partners`,
        { name: name.trim() || undefined, reference: reference.trim() },
        { headers: { Authorization: `Bearer ${auth}` } },
      )
      setPartners(res.data.partners || [])
      setName('')
      setReference('')
      notifications.show({ title: 'Partner added', message: 'Documents from this partner can now be accepted.', color: 'green' })
    } catch (err: any) {
      notifications.show({ title: 'Could not add partner', message: err?.response?.data?.message || err?.message, color: 'red' })
    } finally {
      setSaving(false)
    }
  }

  const trustOwn = async () => {
    const auth = token()
    if (!auth || !orgTenantId) return
    setTrustingOwn(true)
    try {
      const res = await axios.post<{ partners: TrustedPartner[] }>(
        `${backendUrl}/api/organizations/${encodeURIComponent(orgTenantId)}/setup/trusted-partners/own`,
        {},
        { headers: { Authorization: `Bearer ${auth}` } },
      )
      setPartners(res.data.partners || [])
      notifications.show({ title: 'This organization is trusted', message: 'Documents you issue here will be accepted.', color: 'green' })
    } catch (err: any) {
      notifications.show({ title: 'Could not update', message: err?.response?.data?.message || err?.message, color: 'red' })
    } finally {
      setTrustingOwn(false)
    }
  }

  const remove = async (partner: TrustedPartner) => {
    const auth = token()
    if (!auth || !orgTenantId) return
    try {
      const res = await axios.delete<{ partners: TrustedPartner[] }>(
        `${backendUrl}/api/organizations/${encodeURIComponent(orgTenantId)}/setup/trusted-partners/${encodeURIComponent(partner.id)}`,
        { headers: { Authorization: `Bearer ${auth}` } },
      )
      setPartners(res.data.partners || [])
    } catch (err: any) {
      notifications.show({ title: 'Could not remove partner', message: err?.response?.data?.message || err?.message, color: 'red' })
    }
  }

  const active = partners.filter((partner) => partner.status === 'active')
  const ownsSelf = active.some((partner) => partner.isOwnOrganization)

  return (
    <Layout title="Trusted partners">
      <Container size="md" py="lg">
        <Stack gap="lg">
          <div>
            <Title order={2}>Trusted partners</Title>
            <Text c="dimmed" size="sm" mt={4}>
              Add the people and organizations whose documents and approvals this organization should accept on a job.
            </Text>
          </div>

          {error && <Alert color="red">{error}</Alert>}

          <Paper withBorder p="md">
            <Group justify="space-between" align="center">
              <div>
                <Text fw={600}>Accept documents from this organization</Text>
                <Text size="sm" c="dimmed">Needed when a job checks documents you issued yourself.</Text>
              </div>
              <Button onClick={() => void trustOwn()} loading={trustingOwn} disabled={ownsSelf}>
                {ownsSelf ? 'Already accepted' : 'Accept ours'}
              </Button>
            </Group>
          </Paper>

          <Paper withBorder p="md">
            <Stack gap="sm">
              <Text fw={600}>Add a partner</Text>
              <TextInput label="Name" placeholder="Partner organization" value={name} onChange={(e) => setName(e.currentTarget.value)} />
              <TextInput
                label="Identifier they gave you"
                placeholder="Paste the identifier from the partner"
                value={reference}
                onChange={(e) => setReference(e.currentTarget.value)}
                required
              />
              <Group justify="flex-end">
                <Button onClick={() => void add()} loading={saving} disabled={!reference.trim()}>
                  Add partner
                </Button>
              </Group>
            </Stack>
          </Paper>

          <Stack gap="xs">
            <Text fw={600}>Accepted partners</Text>
            {loading && <Text size="sm" c="dimmed">Loading…</Text>}
            {!loading && active.length === 0 && (
              <Text size="sm" c="dimmed">None yet. Accept this organization, or add a partner, before a job that checks documents.</Text>
            )}
            {active.map((partner) => (
              <Paper key={partner.id} withBorder p="sm">
                <Group justify="space-between" align="flex-start">
                  <div>
                    <Group gap="xs">
                      <Text fw={500}>{partner.name}</Text>
                      {partner.isOwnOrganization && <Badge variant="light">This organization</Badge>}
                    </Group>
                    <Text size="xs" c="dimmed" style={{ wordBreak: 'break-all' }}>{partner.reference}</Text>
                  </div>
                  <Button size="xs" variant="subtle" color="red" onClick={() => void remove(partner)}>
                    Remove
                  </Button>
                </Group>
              </Paper>
            ))}
          </Stack>
        </Stack>
      </Container>
    </Layout>
  )
}
