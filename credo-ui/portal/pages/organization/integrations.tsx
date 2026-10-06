import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { Alert, Badge, Container, Group, Paper, Radio, Stack, Text, Title } from '@mantine/core'
import { IconCreditCard } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'

import Layout from '@/components/Layout'
import { useRequireOrgContext } from '@/lib/portalContext'
import { getOrgScopedToken, getPersonalToken, readActiveOrganization } from '@/utils/organizationContext'

interface PaymentMethodChoice {
  id: 'clicknpay' | 'ecocash' | 'simulated'
  name: string
  detail: string
  selected: boolean
}

const FALLBACK_METHODS: PaymentMethodChoice[] = [
  { id: 'clicknpay', name: 'Click n Pay', detail: 'Pay with card', selected: false },
  { id: 'ecocash', name: 'EcoCash', detail: 'Pay via EcoCash', selected: false },
  { id: 'simulated', name: 'Simulated pay', detail: 'Practice payment. No real money moves.', selected: false },
]

export default function OrganizationPaymentsPage() {
  useRequireOrgContext('/organization/setup')

  const [orgTenantId, setOrgTenantId] = useState('')
  const [methods, setMethods] = useState<PaymentMethodChoice[]>(FALLBACK_METHODS)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const backendUrl = process.env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000'
  const token = () => getOrgScopedToken() || getPersonalToken()
  const selected = methods.find((method) => method.selected)?.id || ''

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
      const res = await axios.get<{ methods?: PaymentMethodChoice[] }>(
        `${backendUrl}/api/organizations/${encodeURIComponent(id)}/setup/payments`,
        { headers: { Authorization: `Bearer ${auth}` } },
      )
      if (res.data.methods?.length) setMethods(res.data.methods)
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Could not load payment methods')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (orgTenantId) void load(orgTenantId)
  }, [orgTenantId])

  const choose = async (method: string) => {
    const auth = token()
    if (!auth || !orgTenantId || !method || method === selected) return
    setSaving(true)
    try {
      const res = await axios.post<{ methods?: PaymentMethodChoice[] }>(
        `${backendUrl}/api/organizations/${encodeURIComponent(orgTenantId)}/setup/payments`,
        { method },
        { headers: { Authorization: `Bearer ${auth}` } },
      )
      if (res.data.methods?.length) setMethods(res.data.methods)
      const chosen = (res.data.methods || FALLBACK_METHODS).find((item) => item.id === method)
      notifications.show({
        title: 'Payment method saved',
        message: chosen ? `${chosen.name} is how this organization takes and releases money.` : 'Saved.',
        color: 'green',
      })
    } catch (err: any) {
      notifications.show({
        title: 'Could not save the payment method',
        message: err?.response?.data?.message || err?.message,
        color: 'red',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Layout title="Payments">
      <Container size="md" py="lg">
        <Stack gap="lg">
          <div>
            <Title order={2}>Payments</Title>
            <Text c="dimmed" size="sm" mt={4}>
              Choose how this organization takes and releases money. You can change this later.
            </Text>
          </div>

          {error && <Alert color="red">{error}</Alert>}

          <Paper withBorder p="md">
            <Group gap="sm" mb="sm">
              <IconCreditCard size={20} />
              <Text fw={600}>Payment method</Text>
              {methods.some((method) => method.selected) && (
                <Badge color="teal" variant="light">On</Badge>
              )}
            </Group>
            <Radio.Group value={selected} onChange={(value) => void choose(value)}>
              <Stack gap="sm">
                {methods.map((method) => (
                  <Radio
                    key={method.id}
                    value={method.id}
                    disabled={loading || saving}
                    label={method.name}
                    description={method.detail}
                  />
                ))}
              </Stack>
            </Radio.Group>
          </Paper>
        </Stack>
      </Container>
    </Layout>
  )
}
