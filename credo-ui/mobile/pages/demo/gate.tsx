import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { Button, Stack, Text, Title } from '@mantine/core'

import api from '@/lib/api'

const STORE = 'ageGateDemo'

type Stored = { requestId: string; pollToken: string }

type Poll =
  | { status: 'pending' }
  | { status: 'admitted'; over18: 'Yes' }
  | { status: 'refused'; reason: string }

function readStored(): Stored | null {
  if (typeof window === 'undefined') return null
  try {
    const parsed = JSON.parse(sessionStorage.getItem(STORE) || '')
    if (parsed?.requestId && parsed?.pollToken) return parsed
  } catch {
    /* a new visit starts a new check */
  }
  return null
}

/**
 * A demonstration age-restricted site. It is not a betting service and no money moves.
 * The only fact it can learn is whether the person is 18 or over.
 */
export default function AgeGateDemoPage() {
  const router = useRouter()
  const [phase, setPhase] = useState<'ask' | 'waiting' | 'in' | 'refused'>('ask')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const stored = readStored()
    if (!stored) return
    let stopped = false
    const tick = async () => {
      try {
        const res = await api.get<Poll>(`/api/public/demo/age-gate/${encodeURIComponent(stored.requestId)}`, {
          params: { pollToken: stored.pollToken },
        })
        if (stopped) return
        if (res.data.status === 'admitted') setPhase('in')
        else if (res.data.status === 'refused') {
          setReason(res.data.reason)
          setPhase('refused')
        } else setPhase('waiting')
      } catch {
        if (!stopped) setPhase('waiting')
      }
    }
    void tick()
    const timer = window.setInterval(tick, 1500)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [])

  const prove = async () => {
    setBusy(true)
    try {
      const res = await api.post<{ requestId: string; presentationRequestUrl: string; pollToken: string }>(
        '/api/public/demo/age-gate/start',
      )
      const stored: Stored = { requestId: res.data.requestId, pollToken: res.data.pollToken }
      sessionStorage.setItem(STORE, JSON.stringify(stored))
      const returnTo = `/demo/gate?requestId=${encodeURIComponent(stored.requestId)}`
      await router.push(
        `/present?request_uri=${encodeURIComponent(res.data.presentationRequestUrl)}&returnTo=${encodeURIComponent(returnTo)}`,
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#f8fafc', padding: 24 }}>
      <div style={{ maxWidth: 420, margin: '0 auto' }}>
        <Text size="xs" fw={700} tt="uppercase" c="#fbbf24" mb={8}>
          Demonstration site
        </Text>
        <Title order={2} mb={8}>
          Age-restricted area
        </Title>
        <Text size="sm" c="#cbd5e1" mb={20}>
          Not a real betting service. No account, no password, and no money. Entry needs proof that you are 18 or over.
        </Text>
        {phase === 'in' ? (
          <Stack gap="sm">
            <Title order={3}>You are 18 or over. You may enter.</Title>
            <Text size="sm" c="#cbd5e1">
              This site received only that. Your name, date of birth and identity number were not sent.
            </Text>
          </Stack>
        ) : phase === 'refused' ? (
          <Stack gap="sm">
            <Title order={3}>Not admitted</Title>
            <Text size="sm">{reason || 'The check did not confirm you are 18 or over.'}</Text>
            <Button size="lg" radius="xl" color="yellow" c="black" onClick={prove} loading={busy}>
              Try again
            </Button>
          </Stack>
        ) : (
          <Stack gap="md">
            <Text size="sm" c="#cbd5e1">
              {phase === 'waiting'
                ? 'Waiting for you to approve the check in your wallet.'
                : 'The site will ask your wallet one question. You choose what is shared.'}
            </Text>
            <Button size="lg" radius="xl" color="yellow" c="black" fullWidth onClick={prove} loading={busy}>
              Prove you are 18 or over
            </Button>
          </Stack>
        )}
      </div>
    </div>
  )
}
