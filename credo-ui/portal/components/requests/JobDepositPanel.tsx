import React, { useEffect, useState } from 'react'
import { Button, Paper, Stack, Text, Textarea } from '@mantine/core'
import axios from 'axios'
import { feedback } from '@/lib/feedback'

const backendUrl = process.env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000'

type DepositView = {
  available: boolean
  amount?: number
  currency?: string
  status?: 'not_opened' | 'awaiting_payment' | 'paid' | 'disputed' | 'acknowledged'
  payUrl?: string
  disputeReason?: string
  matchReasons?: string[]
  note: string
}

/**
 * Pay the business, say the work was not done, or mark the job done.
 * The phone twin is mobile/components/requests/JobDepositPanel.tsx.
 * Shown only for a quote that came from matching a business.
 */
export default function JobDepositPanel({
  requestId,
  token,
  audience,
}: {
  requestId: string
  token: string
  audience: 'customer' | 'business'
}) {
  const [view, setView] = useState<DepositView | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    try {
      const res = await axios.get<DepositView>(`${backendUrl}/workflow-requests/${encodeURIComponent(requestId)}/deposit`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setView(res.data?.available ? res.data : null)
    } catch {
      setView(null)
    }
  }

  useEffect(() => { void load() }, [requestId, token])

  const run = async (path: string, body?: Record<string, string>) => {
    setBusy(true)
    try {
      const res = await axios.post<DepositView>(`${backendUrl}${path}`, body || {}, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setView(res.data)
      setReason('')
      if (res.data?.note) feedback.success(res.data.note)
    } catch (error: any) {
      feedback.error(error?.response?.data?.message || error?.message || 'Try again.')
    } finally {
      setBusy(false)
    }
  }

  if (!view) return null
  const base = `/workflow-requests/${encodeURIComponent(requestId)}/deposit`
  return (
    <Paper withBorder radius="md" p="sm">
      <Stack gap="sm">
        <Text fw={600} size="sm">Deposit</Text>
        {view.amount ? <Text size="sm">{view.currency} {view.amount}</Text> : null}
        <Text size="sm">{view.note}</Text>
        {view.disputeReason ? <Text size="sm">{view.disputeReason}</Text> : null}
        {audience === 'business' && view.matchReasons?.length ? (
          <Text size="sm" c="dimmed">Why you were asked: {view.matchReasons.join(' · ')}</Text>
        ) : null}
        {audience === 'customer' && view.status === 'not_opened' && view.amount ? (
          <Button loading={busy} onClick={() => void run(base)}>Pay the business</Button>
        ) : null}
        {audience === 'customer' && view.status === 'awaiting_payment' && view.payUrl ? (
          <Button component="a" href={view.payUrl} target="_blank">Pay the business</Button>
        ) : null}
        {audience === 'customer' && view.status === 'paid' ? (
          <>
            <Textarea label="What was not done?" value={reason} onChange={(event) => setReason(event.currentTarget.value)} />
            <Button variant="light" loading={busy} onClick={() => void run(`${base}/dispute`, { reason })}>The work was not done</Button>
          </>
        ) : null}
        {audience === 'customer' && view.status === 'disputed' ? (
          <Button variant="light" loading={busy} onClick={() => void run(`${base}/settle`)}>This is settled</Button>
        ) : null}
        {audience === 'business' && view.status === 'paid' ? (
          <Button loading={busy} onClick={() => void run(`${base}/acknowledge`)}>The job is done</Button>
        ) : null}
      </Stack>
    </Paper>
  )
}
