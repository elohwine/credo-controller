import React, { useEffect, useState } from 'react'
import { Button, Paper, Stack, Text, TextInput } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import api from '@/lib/api'
import { getPersonalWalletToken, getUserPhone, getWalletToken } from '@/lib/auth'

/** Ask this business for offers. Separate from WhatsApp alerts. The website twin is on Discover. */
export default function OfferOptIn({ orgId }: { orgId: string }) {
  const [phone, setPhone] = useState('')
  useEffect(() => { setPhone(getUserPhone() || '') }, [])
  const [busy, setBusy] = useState(false)

  const save = async (enabled: boolean) => {
    const token = getPersonalWalletToken() || getWalletToken()
    if (!token) {
      notifications.show({ position: 'bottom-center', title: 'Sign in first', message: 'Sign in to ask for offers.', color: 'red' })
      return
    }
    setBusy(true)
    try {
      await api.post(`/api/discovery/organizations/${encodeURIComponent(orgId)}/offers`, { phone, enabled }, {
        headers: { Authorization: `Bearer ${token}` },
      })
      notifications.show({
        position: 'bottom-center',
        title: 'Saved',
        message: enabled ? 'This business can send you offers.' : 'Offers from this business are off.',
        color: 'green',
      })
    } catch (error: any) {
      notifications.show({
        position: 'bottom-center',
        title: 'Not saved',
        message: error?.response?.data?.message || error?.message || 'Try again.',
        color: 'red',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Paper p="md" radius="md" withBorder>
      <Stack gap="sm">
        <Text fw={600} size="sm">Send me offers</Text>
        <Text size="xs" c="dimmed">This is separate from WhatsApp alerts. STOP stops offers as well as alerts.</Text>
        <TextInput label="Your phone" value={phone} onChange={(event) => setPhone(event.currentTarget.value)} />
        <Button h={48} radius="xl" loading={busy} onClick={() => void save(true)}>Send me offers</Button>
        <Button h={48} radius="xl" variant="light" loading={busy} onClick={() => void save(false)}>Stop offers</Button>
      </Stack>
    </Paper>
  )
}
