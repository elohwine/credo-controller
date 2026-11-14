import React, { useState } from 'react'
import { Button, Stack, Text, TextInput } from '@mantine/core'
import axios from 'axios'
import { feedback } from '@/lib/feedback'
import { getPersonalToken } from '@/utils/organizationContext'

const backendUrl = process.env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000'

/** Ask this business for offers. Separate from WhatsApp alerts. The phone twin is on the business page. */
export default function OfferOptIn({ orgId }: { orgId: string }) {
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)

  const save = async (enabled: boolean) => {
    const token = getPersonalToken()
    if (!token) {
      feedback.error('Sign in to ask for offers.')
      return
    }
    setBusy(true)
    try {
      await axios.post(`${backendUrl}/api/discovery/organizations/${encodeURIComponent(orgId)}/offers`, { phone, enabled }, {
        headers: { Authorization: `Bearer ${token}` },
      })
      feedback.success(enabled ? 'This business can send you offers.' : 'Offers from this business are off.')
    } catch (error: any) {
      feedback.error(error?.response?.data?.message || error?.message || 'Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Stack gap="xs" mt="sm">
      <Text fw={600} size="sm">Send me offers</Text>
      <Text size="xs" c="dimmed">This is separate from WhatsApp alerts. STOP stops offers as well as alerts.</Text>
      <TextInput label="Your phone" value={phone} onChange={(event) => setPhone(event.currentTarget.value)} />
      <Button size="xs" loading={busy} onClick={() => void save(true)}>Send me offers</Button>
      <Button size="xs" variant="light" loading={busy} onClick={() => void save(false)}>Stop offers</Button>
    </Stack>
  )
}
