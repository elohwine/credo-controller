import React, { useEffect, useState } from 'react'
import axios from 'axios'
import Link from 'next/link'
import { Button, Container, Group, Paper, Select, Stack, Text, TextInput, Title } from '@mantine/core'
import { IconSearch } from '@tabler/icons-react'
import Layout from '@/components/Layout'
import OfferOptIn from '@/components/discover/OfferOptIn'
import RequestSheet from '@/components/requests/RequestSheet'
import { feedback } from '@/lib/feedback'
import { getPersonalToken } from '@/utils/organizationContext'

const backendUrl = process.env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000'

interface PublicOrg {
  id: string
  name: string
  description?: string
  availableServices?: number
  goodsCount?: number
}

interface MatchHit {
  orgId: string
  name: string
  description?: string
  reasons: string[]
  unsure: string[]
  standing?: { configured: string; verified: string; live: string }
  offer?: string
  reviewAverage: number | null
  reviewCount: number
}

const PAYMENT_CHOICES = [
  { value: 'ecocash', label: 'EcoCash' },
  { value: 'innbucks', label: 'InnBucks' },
  { value: 'bank', label: 'Bank transfer' },
  { value: 'card', label: 'Card' },
  { value: 'cash', label: 'Cash' },
]
const FULFILMENT_CHOICES = [
  { value: 'call_out', label: 'We come to you' },
  { value: 'delivery', label: 'We deliver' },
  { value: 'collection', label: 'You collect' },
]

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
  const [need, setNeed] = useState('')
  const [area, setArea] = useState('')
  const [payment, setPayment] = useState<string | null>(null)
  const [fulfilment, setFulfilment] = useState<string | null>(null)
  const [matches, setMatches] = useState<MatchHit[] | null>(null)
  const [matching, setMatching] = useState(false)
  const [asking, setAsking] = useState(false)
  const [askKey, setAskKey] = useState('')
  const [rating, setRating] = useState('5')
  const [ratingOrg, setRatingOrg] = useState('')
  const [ratingComment, setRatingComment] = useState('')
  const [ratingBusy, setRatingBusy] = useState(false)

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

  const findProviders = async () => {
    if (need.trim().length < 2) {
      feedback.warn('Say what you need. A few words is enough.')
      return
    }
    setMatching(true)
    try {
      const res = await axios.post(`${backendUrl}/api/discovery/match`, {
        need: need.trim(),
        area: area.trim() || undefined,
        payment: payment || undefined,
        fulfilment: fulfilment || undefined,
      })
      setMatches(Array.isArray(res.data) ? res.data : [])
      setAskKey('')
    } catch (error: any) {
      feedback.error(error?.response?.data?.message || error?.message || 'Could not look. Try again.')
    } finally {
      setMatching(false)
    }
  }

  const rate = async (orgId: string) => {
    const token = getPersonalToken()
    if (!token) {
      feedback.warn('Sign in to rate a business.')
      return
    }
    setRatingBusy(true)
    try {
      await axios.post(
        `${backendUrl}/api/discovery/organizations/${encodeURIComponent(orgId)}/reviews`,
        { rating: Number(rating), comment: ratingComment.trim() || undefined },
        { headers: { Authorization: `Bearer ${token}` } },
      )
      feedback.success('Your rating is on their profile.')
      setRatingOrg('')
      await findProviders()
    } catch (error: any) {
      feedback.error(error?.response?.data?.message || error?.message || 'Not saved. Try again.')
    } finally {
      setRatingBusy(false)
    }
  }

  const askMatches = async () => {
    const token = getPersonalToken()
    if (!token) {
      feedback.warn('Sign in to ask these businesses.')
      return
    }
    const key = askKey || `ask-${Date.now()}`
    if (!askKey) setAskKey(key)
    setAsking(true)
    try {
      const res = await axios.post(
        `${backendUrl}/workflow-requests/ask`,
        {
          need: need.trim(),
          area: area.trim() || undefined,
          payment: payment || undefined,
          fulfilment: fulfilment || undefined,
          limit: 3,
        },
        { headers: { Authorization: `Bearer ${token}`, 'x-idempotency-key': key } },
      )
      const asked = Array.isArray(res.data?.asked) ? res.data.asked : []
      if (asked.length) {
        feedback.success(`Asked ${asked.map((row: { name: string }) => row.name).join(', ')} for a quote.`)
        setAskKey('')
      } else {
        feedback.warn(res.data?.note || 'No business could take this.')
      }
    } catch (error: any) {
      feedback.error(error?.response?.data?.message || error?.message || 'Not sent. Try again.')
    } finally {
      setAsking(false)
    }
  }

  return (
    <Layout title="Discover services">
      <Container size="sm" py="xl">
        <Stack gap="md">
          <div>
            <Title order={2}>Discover services</Title>
            <Text size="sm" c="dimmed">Find a business and ask for a service. You do not have to belong to one.</Text>
          </div>
          <Paper withBorder radius="md" p="md">
            <Stack gap="sm">
              <Text fw={600}>What do you need?</Text>
              <Text size="sm" c="dimmed">We find businesses that fit, then you can ask the best three for a quote.</Text>
              <TextInput label="Need" placeholder="A plumber for a leaking geyser" value={need} onChange={(event) => setNeed(event.currentTarget.value)} />
              <TextInput label="Place" placeholder="Borrowdale" value={area} onChange={(event) => setArea(event.currentTarget.value)} />
              <Select label="Pay with" placeholder="Any" clearable data={PAYMENT_CHOICES} value={payment} onChange={setPayment} />
              <Select label="How" placeholder="Any" clearable data={FULFILMENT_CHOICES} value={fulfilment} onChange={setFulfilment} />
              <Button loading={matching} onClick={() => void findProviders()}>Find businesses</Button>
            </Stack>
          </Paper>
          {matches && (
            <Stack gap="sm">
              {matches.length === 0 ? (
                <Text size="sm" c="dimmed">No business matched. Try fewer details, or search the directory below.</Text>
              ) : (
                <>
                  <Button variant="light" loading={asking} onClick={() => void askMatches()}>Ask the best three for a quote</Button>
                  {matches.map((match) => (
                    <Paper key={match.orgId} withBorder radius="md" p="md">
                      <Text fw={600}>{match.name}</Text>
                      <Text size="sm" c="dimmed">
                        {match.reviewCount
                          ? `${match.reviewAverage} from ${match.reviewCount} ${match.reviewCount === 1 ? 'customer' : 'customers'}`
                          : 'No ratings yet'}
                      </Text>
                      {match.description ? <Text size="sm" c="dimmed">{match.description}</Text> : null}
                      {match.standing ? (
                        <Text size="sm">{match.standing.configured} {match.standing.verified} {match.standing.live}</Text>
                      ) : null}
                      {match.offer ? <Text size="sm">Offer: {match.offer}</Text> : null}
                      {match.reasons.map((reason) => <Text key={reason} size="sm">{reason}</Text>)}
                      {match.unsure.map((gap) => <Text key={gap} size="xs" c="dimmed">{gap}</Text>)}
                      {ratingOrg === match.orgId ? (
                        <Stack gap="xs" mt="sm">
                          <Select label="Your rating" data={['1', '2', '3', '4', '5']} value={rating} onChange={(value) => setRating(value || '5')} />
                          <TextInput label="Comment" value={ratingComment} onChange={(event) => setRatingComment(event.currentTarget.value)} />
                          <Button size="xs" loading={ratingBusy} onClick={() => void rate(match.orgId)}>Save rating</Button>
                        </Stack>
                      ) : (
                        <Button size="xs" variant="subtle" mt="xs" onClick={() => { setRatingOrg(match.orgId); setRatingComment('') }}>Rate them</Button>
                      )}
                      <OfferOptIn orgId={match.orgId} />
                    </Paper>
                  ))}
                </>
              )}
            </Stack>
          )}
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
          <Paper withBorder radius="md" p="md">
            <Group justify="space-between" wrap="nowrap">
              <div>
                <Text fw={500} size="sm">Running your own business?</Text>
                <Text size="sm" c="dimmed">Start an organisation for it. Give it a name, then answer a few short questions.</Text>
              </div>
              <Button component={Link} href="/organization/setup" variant="light">Start an organisation</Button>
            </Group>
          </Paper>
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
