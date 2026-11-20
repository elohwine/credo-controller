import React, { useEffect, useState } from 'react'
import { Button, Group, Image, Paper, Stack, Text, Textarea, UnstyledButton } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import api from '@/lib/api'
import BottomSheet from '@/components/shared/BottomSheet'

type DepositView = {
  available: boolean
  amount?: number
  currency?: string
  status?: 'not_opened' | 'awaiting_payment' | 'paid' | 'disputed' | 'acknowledged'
  payUrl?: string
  disputeReason?: string
  matchReasons?: string[]
  channel?: 'whatsapp'
  photos?: Array<{ id: string; caption?: string }>
  note: string
}

/** Photos sent in the WhatsApp chat. Loaded with the sign-in token, so a plain image link is not used. */
function RequestPhotos({ requestId, token, photos }: { requestId: string; token: string; photos: Array<{ id: string; caption?: string }> }) {
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [open, setOpen] = useState<{ url: string; caption?: string } | null>(null)

  useEffect(() => {
    let alive = true
    const made: string[] = []
    void Promise.all(
      photos.map(async (photo) => {
        try {
          const res = await api.get<Blob>(
            `/workflow-requests/${encodeURIComponent(requestId)}/photos/${encodeURIComponent(photo.id)}`,
            { headers: { Authorization: `Bearer ${token}` }, responseType: 'blob' },
          )
          const url = URL.createObjectURL(res.data)
          made.push(url)
          return [photo.id, url] as const
        } catch {
          return undefined
        }
      }),
    ).then((pairs) => {
      if (alive) setUrls(Object.fromEntries(pairs.filter((pair): pair is readonly [string, string] => Boolean(pair))))
    })
    return () => {
      alive = false
      made.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [requestId, token, photos.map((photo) => photo.id).join(',')])

  return (
    <>
      <Text size="sm" fw={500}>Photos from the chat</Text>
      <Group gap="xs">
        {photos.map((photo) =>
          urls[photo.id] ? (
            <UnstyledButton key={photo.id} onClick={() => setOpen({ url: urls[photo.id], caption: photo.caption })} aria-label="Open photo">
              <Image src={urls[photo.id]} alt={photo.caption || 'Photo from the chat'} w={72} h={72} radius="sm" fit="cover" />
            </UnstyledButton>
          ) : (
            <Text key={photo.id} size="xs" c="dimmed">{photo.caption || 'Photo'} (not available)</Text>
          ),
        )}
      </Group>
      <BottomSheet opened={Boolean(open)} onClose={() => setOpen(null)} title={open?.caption || 'Photo from the chat'}>
        {open ? <Image src={open.url} alt={open.caption || 'Photo from the chat'} radius="md" mb="md" /> : null}
      </BottomSheet>
    </>
  )
}

/**
 * Pay the business, say the work was not done, or mark the job done.
 * The website twin is portal/components/requests/JobDepositPanel.tsx.
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
      const res = await api.get<DepositView>(`/workflow-requests/${encodeURIComponent(requestId)}/deposit`, {
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
      const res = await api.post<DepositView>(path, body || {}, { headers: { Authorization: `Bearer ${token}` } })
      setView(res.data)
      setReason('')
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
        {audience === 'business' && view.channel === 'whatsapp' ? (
          <Text size="sm" c="dimmed">Asked on WhatsApp. Your price, or your answer if you decline, is sent to them in that chat.</Text>
        ) : null}
        {view.photos?.length ? <RequestPhotos requestId={requestId} token={token} photos={view.photos} /> : null}
        {audience === 'customer' && view.status === 'not_opened' && view.amount ? (
          <Button h={48} radius="xl" loading={busy} onClick={() => void run(base)}>Pay the business</Button>
        ) : null}
        {audience === 'customer' && view.status === 'awaiting_payment' && view.payUrl ? (
          <Button h={48} radius="xl" component="a" href={view.payUrl} target="_blank">Pay the business</Button>
        ) : null}
        {audience === 'customer' && view.status === 'paid' ? (
          <>
            <Textarea label="What was not done?" value={reason} onChange={(event) => setReason(event.currentTarget.value)} />
            <Button h={48} radius="xl" variant="light" loading={busy} onClick={() => void run(`${base}/dispute`, { reason })}>
              The work was not done
            </Button>
          </>
        ) : null}
        {audience === 'customer' && view.status === 'disputed' ? (
          <Button h={48} radius="xl" variant="light" loading={busy} onClick={() => void run(`${base}/settle`)}>This is settled</Button>
        ) : null}
        {audience === 'business' && view.status === 'paid' ? (
          <Button h={48} radius="xl" loading={busy} onClick={() => void run(`${base}/acknowledge`)}>The job is done</Button>
        ) : null}
      </Stack>
    </Paper>
  )
}
