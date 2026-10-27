import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { Button, Container, Group, Paper, Stack, Text, TextInput, Title } from '@mantine/core'
import { IconSearch } from '@tabler/icons-react'
import Layout from '@/components/Layout'
import RequestSheet from '@/components/requests/RequestSheet'

const backendUrl = process.env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000'

interface PublicOrg {
  id: string
  name: string
  description?: string
  availableServices?: number
  goodsCount?: number
}

/**
 * Personal directory of businesses that chose to be found. The phone twin is
 * Network → Discover services. Asking one of them uses the same request sheet as Home.
 */
export default function DiscoverPage() {
  const [query, setQuery] = useState('')
  const [orgs, setOrgs] = useState<PublicOrg[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [askOpen, setAskOpen] = useState(false)

  const load = async (q: string) => {
    setLoading(true)
    setFailed(false)
    try {
      const res = q.trim()
        ? await axios.get(`${backendUrl}/api/discovery/search`, { params: { q: q.trim() } })
        : await axios.get(`${backendUrl}/api/discovery/organizations`, { params: { limit: 30 } })
      setOrgs(Array.isArray(res.data) ? res.data : [])
    } catch {
      setOrgs([])
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load('')
  }, [])

  return (
    <Layout title="Discover services">
      <Container size="sm" py="xl">
        <Stack gap="md">
          <div>
            <Title order={2}>Discover services</Title>
            <Text size="sm" c="dimmed">Find a business and ask for a service. You do not have to belong to one.</Text>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void load(query)
            }}
          >
            <Group align="flex-end" wrap="nowrap">
              <TextInput
                label="Search"
                placeholder="Name or what they do"
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                leftSection={<IconSearch size={16} />}
                style={{ flex: 1 }}
              />
              <Button type="submit" loading={loading}>Search</Button>
            </Group>
          </form>
          {failed && <Text size="sm">Could not load businesses. Check your connection and try again.</Text>}
          {!failed && !loading && orgs.length === 0 && (
            <Text size="sm" c="dimmed">No businesses to show yet. Try another search.</Text>
          )}
          <Stack gap="sm">
            {orgs.map((org) => {
              const services = Number(org.availableServices || 0)
              const goods = Number(org.goodsCount || 0)
              const line = [
                org.description,
                services ? `${services} ${services === 1 ? 'service' : 'services'}` : '',
                goods ? `${goods} ${goods === 1 ? 'product' : 'products'}` : '',
              ].filter(Boolean).join(' · ')
              return (
                <Paper key={org.id} withBorder radius="md" p="md">
                  <Group justify="space-between" wrap="nowrap" align="flex-start">
                    <div>
                      <Text fw={600}>{org.name}</Text>
                      {line ? <Text size="sm" c="dimmed">{line}</Text> : null}
                    </div>
                    <Button variant="light" onClick={() => setAskOpen(true)}>Ask</Button>
                  </Group>
                </Paper>
              )
            })}
          </Stack>
        </Stack>
      </Container>
      <RequestSheet
        opened={askOpen}
        onClose={() => setAskOpen(false)}
        context={{ contextMode: 'personal' }}
        initialKindId="business.service"
      />
    </Layout>
  )
}
