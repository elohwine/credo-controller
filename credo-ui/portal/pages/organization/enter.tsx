import React, { useContext, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { Alert, Button, Container, Group, Loader, Paper, Select, Stack, Text, Title } from '@mantine/core'
import QRCode from 'react-qr-code'
import axios from 'axios'
import Layout from '@/components/Layout'
import { EnvContext } from '@/pages/_app'
import { applyOrganizationSession, getPersonalToken, type OrganizationMembership } from '@/utils/organizationContext'
import { captureOrganizationSwitchContext } from '../../../shared/taskContext'

export default function EnterOrganization() {
  const router = useRouter()
  const env = useContext(EnvContext)
  const backend = env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000'
  const [organizations, setOrganizations] = useState<OrganizationMembership[]>([])
  const [orgId, setOrgId] = useState<string | null>(null)
  const [request, setRequest] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const generation = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancel = () => {
    generation.current++
    if (timer.current) clearTimeout(timer.current)
    setBusy(false)
    setRequest(null)
  }

  useEffect(() => {
    let cancelled = false
    const token = getPersonalToken()
    if (!token) {
      setError('Sign in to your personal wallet first.')
      return
    }
    axios
      .get<OrganizationMembership[]>(`${backend}/api/organizations`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((response) => {
        if (!cancelled) setOrganizations(response.data)
      })
      .catch((failure: Error) => {
        if (!cancelled) setError(failure.message || 'Could not load your organisations')
      })
    return () => {
      cancelled = true
      generation.current++
      if (timer.current) clearTimeout(timer.current)
    }
  }, [backend])

  const start = async () => {
    if (!orgId) return
    const selectedOrg = orgId
    const token = getPersonalToken()
    if (!token) {
      setError('Sign in to your personal wallet first.')
      return
    }
    const assertContextUnchanged = captureOrganizationSwitchContext(localStorage)
    const attempt = ++generation.current
    if (timer.current) clearTimeout(timer.current)
    setBusy(true)
    setError(null)
    setRequest(null)
    const url = `${backend}/api/organizations/${encodeURIComponent(selectedOrg)}/entry-proof`
    try {
      const response = await axios.post<{
        loginId: string
        pollToken: string
        authorizationRequest: string
        expiresAt: string
      }>(url, {}, { headers: { Authorization: `Bearer ${token}` } })
      if (attempt !== generation.current) return
      assertContextUnchanged()
      setRequest(response.data.authorizationRequest)
      const poll = async () => {
        if (attempt !== generation.current) return
        try {
          assertContextUnchanged()
          if (Date.now() >= Date.parse(response.data.expiresAt))
            throw new Error('This proof request has expired. Start again.')
          const result = await axios.get(`${url}/${encodeURIComponent(response.data.loginId)}`, {
            headers: { Authorization: `Bearer ${token}`, 'x-login-poll-token': response.data.pollToken },
          })
          if (attempt !== generation.current) return
          assertContextUnchanged()
          if (result.data.status === 'verified') {
            applyOrganizationSession(selectedOrg, result.data)
            cancel()
            await router.push('/')
            return
          }
          timer.current = setTimeout(poll, 2000)
        } catch (failure) {
          if (attempt !== generation.current) return
          cancel()
          setError(
            axios.isAxiosError(failure)
              ? failure.response?.data?.message || failure.message
              : failure instanceof Error
                ? failure.message
                : 'Organisation proof failed',
          )
        }
      }
      await poll()
    } catch (failure) {
      if (attempt !== generation.current) return
      cancel()
      setError(
        axios.isAxiosError(failure)
          ? failure.response?.data?.message || failure.message
          : failure instanceof Error
            ? failure.message
            : 'Could not start organisation proof',
      )
    }
  }

  return (
    <Layout title="Enter organisation">
      <Container size="sm" py="xl">
        <Paper withBorder radius="md" p="lg">
          <Stack>
            <Title order={2}>Enter with your staff card</Title>
            <Text>
              Your identity signs you in. Your staff card proves which organisation you belong to; current membership
              determines your access.
            </Text>
            {error && (
              <Alert color="red" title="Organisation entry">
                {error}
              </Alert>
            )}
            <Select
              label="Organisation"
              placeholder="Choose an organisation"
              value={orgId}
              disabled={busy}
              data={organizations.map((org) => ({ value: org.orgTenantId, label: org.name }))}
              onChange={setOrgId}
            />
            {!request && (
              <Button disabled={!orgId || busy} loading={busy} onClick={start}>
                Present staff card
              </Button>
            )}
            {request && (
              <Stack align="center">
                <Text ta="center">
                  Scan with your wallet and review the requested organisation, role and membership details before
                  sharing.
                </Text>
                <Paper p="md" bg="white">
                  <QRCode value={request} size={220} />
                </Paper>
                <Group>
                  <Loader size="sm" />
                  <Text size="sm">Waiting for your wallet</Text>
                </Group>
              </Stack>
            )}
            {busy && (
              <Button variant="subtle" onClick={cancel}>
                Cancel
              </Button>
            )}
            <Button
              variant="subtle"
              onClick={() => {
                cancel()
                void router.push('/wallet')
              }}
            >
              Back to personal wallet
            </Button>
          </Stack>
        </Paper>
      </Container>
    </Layout>
  )
}
