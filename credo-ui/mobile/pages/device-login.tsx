import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { Button, List, Paper, Select, Stack, Text, Title } from '@mantine/core'
import { completeDeviceAuthorization, loginDevices, prepareDeviceAuthorization, type PreparedDeviceAuthorization } from '@/lib/deviceTrust'
import ErrorAlert from '@/components/shared/ErrorAlert'
import { friendlyRequestError } from '@/lib/requestError'

export default function DeviceLoginApproval() {
  const router = useRouter()
  const [walletId, setWalletId] = useState<string | null>(null)
  const [accounts, setAccounts] = useState<Array<{ value: string; label: string }>>([])
  const [challenge, setChallenge] = useState<PreparedDeviceAuthorization | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const request = typeof router.query.request === 'string' ? router.query.request : ''
  useEffect(() => {
    try {
      const devices = loginDevices()
      setAccounts(devices.map((item, index) => ({ value: item.walletId, label: `${item.label} · account ${index + 1}` })))
      if (devices.length === 1) setWalletId(devices[0].walletId)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Your device registration could not be read.')
    }
  }, [])
  useEffect(() => {
    setChallenge(null)
    if (!request || !walletId) return
    let active = true
    setBusy(true)
    prepareDeviceAuthorization({ purpose: 'web_login', walletId, authorizationRequest: request })
      .then((result) => { if (active) setChallenge(result) })
      .catch((error) => { if (active) setError(friendlyRequestError(error, 'Could not open this sign-in request')) })
      .finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [request, walletId])
  const approve = async () => {
    if (!challenge || busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await completeDeviceAuthorization(challenge)
      if (!result.presented) throw new Error('The wallet did not confirm this request.')
      setDone(true)
    } catch (error) {
      setChallenge(null)
      setError(friendlyRequestError(error, 'Sign-in was not approved. Open a new request to try again.'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="login-screen">
      <Paper className="login-content" p="lg">
        <Stack gap="lg">
          <Title order={1} size="h2">{done ? 'Sign-in approved' : 'Approve a website sign-in'}</Title>
          {done ? <Text>Return to the browser where you started. You can close this screen.</Text> : <>
            <Text>Only approve a request you started yourself. Your device screen lock protects access to your server-hosted Credentis wallet.</Text>
            {accounts.length > 1 && <Select label="Your enrolled account" data={accounts} value={walletId} onChange={setWalletId} allowDeselect={false} />}
            {!accounts.length && <Text>Sign in with your account PIN in the Android app, accept your identity card and enroll this phone under Account security first.</Text>}
            {challenge && <>
              <Text fw={700}>Who is asking: {challenge.requester}</Text>
              <Text size="sm">The website will receive:</Text>
              <List>{challenge.requestedClaims.map((claim) => <List.Item key={claim}>{claim}</List.Item>)}</List>
              <Button size="lg" loading={busy} onClick={() => void approve()}>Approve with this device</Button>
            </>}
            <Button variant="default" disabled={busy} onClick={() => router.replace('/login')}>Cancel</Button>
          </>}
          {error && <ErrorAlert message={error} />}
        </Stack>
      </Paper>
    </main>
  )
}
