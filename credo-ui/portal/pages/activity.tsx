import React, { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { useRouter } from 'next/router'
import { Container, Paper, Text } from '@mantine/core'
import Layout from '@/components/Layout'
import PersonalActivityPanel, { type PersonalActivityClient } from '@/components/activity/PersonalActivityPanel'
import { stepRequiredLabel } from '@/components/finance/financeStages'
import { getPersonalToken } from '@/utils/organizationContext'

/**
 * Your activity on the website: who has your data, what you shared, and for what.
 * Reads your own wallet log; the organisation's job history lives under Progress / Finance.
 * The phone shows the same panel on /activity in a personal account.
 */
export default function ActivityPage() {
  const router = useRouter()
  const backendUrl = process.env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000'
  // Read after mount so the server and the first client render agree.
  const [token, setToken] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setToken(getPersonalToken())
    setMounted(true)
  }, [])
  const client = useMemo<PersonalActivityClient>(
    () => ({
      get: async (path, params) => {
        const res = await axios.get(`${backendUrl}${path}`, {
          params,
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        })
        return res.data
      },
    }),
    [backendUrl, token],
  )
  const entry = typeof router.query.entry === 'string' ? router.query.entry : undefined

  return (
    <Layout title="Your activity">
      <Container size="md" py="xl">
        {!mounted ? null : !token ? (
          <Paper withBorder radius="md" p="lg">
            <Text size="sm">Sign in to your own account to see who has your data and what you shared.</Text>
          </Paper>
        ) : (
          <PersonalActivityPanel
            client={client}
            labelStep={(step) => stepRequiredLabel({ stageAction: step })}
            initialEntryId={entry}
          />
        )}
      </Container>
    </Layout>
  )
}
