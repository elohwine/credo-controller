import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActionIcon, Alert, Badge, Box, Button, Center, Divider, Group, Loader, NumberInput, Paper, Select, Stack, Switch, Text, TextInput, Textarea,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconBox, IconBuildingStore, IconPlus, IconTool, IconTrash } from '@tabler/icons-react'
import api from '@/lib/api'
import { getPreferredToken } from '@/lib/auth'

type OfferingService = {
  id: string
  offeringKey?: string
  workArea: string
  name: string
  description?: string
  youGet: string[]
  feeAmount: number
  feeCurrency: string
  turnaroundTime?: string
  published: boolean
  available: boolean
  custom: boolean
}

type GoodsItem = { id: string; title: string; price: number; currency: string; description?: string }

type OfferingsView = {
  isPublic: boolean
  listingBlockers: string[]
  profile: {
    displayName: string
    description?: string
    category: string
    contactPhone?: string
    contactEmail?: string
    website?: string
    address?: string
  }
  categories: string[]
  services: OfferingService[]
  goods: { enabled: boolean; count: number; note: string; items: GoodsItem[] }
  trustBadges: Array<{ type: string; label: string }>
}

type Update = Record<string, unknown>

/**
 * What the organisation shows other wallets in Discover. Services (work people ask or book, from
 * the work areas in setup) and goods (products for sale in the shop) are kept apart on purpose.
 */
export default function PublicOfferingsCard({ orgTenantId, onPreview }: { orgTenantId: string; onPreview: () => void }) {
  const [view, setView] = useState<OfferingsView | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [profile, setProfile] = useState<OfferingsView['profile'] | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<{ feeAmount: number; turnaroundTime: string; description: string }>({ feeAmount: 0, turnaroundTime: '', description: '' })
  const [newService, setNewService] = useState({ name: '', feeAmount: 0 })
  const [newGoods, setNewGoods] = useState({ title: '', price: 0 })

  const headers = () => {
    const token = getPreferredToken()
    return token ? { Authorization: 'Bearer ' + token } : undefined
  }
  const url = `/api/organizations/${encodeURIComponent(orgTenantId)}/offerings`

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get(url, { headers: headers() })
      setView(res.data)
      setProfile(res.data.profile)
    } catch (err: any) {
      setView(null)
      notifications.show({ color: 'red', title: 'Could not load', message: err?.response?.data?.message || err?.message || 'Try again.' })
    } finally {
      setLoading(false)
    }
  }, [url])

  useEffect(() => { if (orgTenantId) void load() }, [orgTenantId, load])

  const save = async (key: string, body: Update, done?: string) => {
    setBusy(key)
    try {
      const res = await api.put(url, body, { headers: headers() })
      setView(res.data)
      setProfile(res.data.profile)
      if (done) notifications.show({ color: 'green', title: 'Saved', message: done })
      return true
    } catch (err: any) {
      notifications.show({ color: 'red', title: 'Not saved', message: err?.response?.data?.message || err?.message || 'Try again.' })
      return false
    } finally {
      setBusy(null)
    }
  }

  const byArea = useMemo(() => {
    const groups = new Map<string, OfferingService[]>()
    for (const service of view?.services ?? []) {
      const area = service.custom ? 'Your own services' : service.workArea
      groups.set(area, [...(groups.get(area) ?? []), service])
    }
    return Array.from(groups.entries())
  }, [view])

  if (loading) return <Center py="md"><Loader size="sm" /></Center>
  if (!view || !profile) return <Text size="sm" c="dimmed">Finish organisation setup to get a public profile.</Text>

  const shownServices = view.services.filter((service) => service.published && service.available).length

  return (
    <Stack gap="md">
      <Paper p="md" radius="md" withBorder>
        <Stack gap="sm">
          <Group justify="space-between" align="start" wrap="nowrap">
            <Box>
              <Group gap="xs">
                <IconBuildingStore size={18} color="var(--mantine-color-teal-6)" />
                <Text fw={700}>Found in Discover</Text>
              </Group>
              <Text size="xs" c="dimmed" mt={4}>
                Other wallets can find you, see your badges and what you offer, and ask or buy from the app.
              </Text>
            </Box>
            <Switch
              checked={view.isPublic}
              disabled={busy === 'listing'}
              onChange={(event) => void save('listing', { isPublic: event.currentTarget.checked }, event.currentTarget.checked ? 'You can now be found in Discover.' : 'You are private now.')}
            />
          </Group>
          {view.listingBlockers.length > 0 && (
            <Text size="xs" c="orange">{view.listingBlockers.join(' ')}</Text>
          )}
          <Group gap={6}>
            <Badge variant="light" color="blue">{shownServices} services</Badge>
            <Badge variant="light" color="teal">{view.goods.enabled ? `${view.goods.count} goods` : 'No goods'}</Badge>
            {view.trustBadges.map((badge) => (
              <Badge key={badge.type} variant="light" color="green">{badge.label}</Badge>
            ))}
          </Group>
          <Group>
            <Button size="xs" variant="light" onClick={onPreview}>See it as others do</Button>
          </Group>
        </Stack>
      </Paper>

      <Paper p="md" radius="md" withBorder>
        <Stack gap="xs">
          <Text fw={700}>About you</Text>
          <Textarea label="What you do" minRows={2} value={profile.description || ''} onChange={(e) => setProfile({ ...profile, description: e.currentTarget.value })} />
          <Select
            label="Category"
            data={view.categories.map((value) => ({ value, label: value.charAt(0).toUpperCase() + value.slice(1) }))}
            value={profile.category}
            onChange={(value) => setProfile({ ...profile, category: value || profile.category })}
          />
          <TextInput label="Phone" value={profile.contactPhone || ''} onChange={(e) => setProfile({ ...profile, contactPhone: e.currentTarget.value })} />
          <TextInput label="Email" value={profile.contactEmail || ''} onChange={(e) => setProfile({ ...profile, contactEmail: e.currentTarget.value })} />
          <TextInput label="Website" value={profile.website || ''} onChange={(e) => setProfile({ ...profile, website: e.currentTarget.value })} />
          <TextInput label="Address" value={profile.address || ''} onChange={(e) => setProfile({ ...profile, address: e.currentTarget.value })} />
          <Group>
            <Button size="xs" loading={busy === 'profile'} onClick={() => void save('profile', { profile }, 'Profile saved.')}>Save</Button>
          </Group>
        </Stack>
      </Paper>

      <Paper p="md" radius="md" withBorder>
        <Stack gap="sm">
          <Box>
            <Group gap="xs">
              <IconTool size={18} color="var(--mantine-color-blue-6)" />
              <Text fw={700}>Services</Text>
            </Group>
            <Text size="xs" c="dimmed" mt={4}>
              Work people ask or book. These come from the work areas you run; switch on the ones to show.
              A request lands in your inbox and runs through that work area's steps.
            </Text>
          </Box>
          {byArea.map(([area, services]) => (
            <Stack key={area} gap={6}>
              <Text size="xs" fw={600} c="dimmed" tt="uppercase">{area}</Text>
              {services.map((service) => (
                <Paper key={service.id} p="sm" radius="md" withBorder style={{ opacity: service.available ? 1 : 0.6 }}>
                  <Group justify="space-between" align="start" wrap="nowrap">
                    <Box style={{ flex: 1 }}>
                      <Text size="sm" fw={600}>{service.name}</Text>
                      {service.description && <Text size="xs" c="dimmed">{service.description}</Text>}
                      <Text size="xs" mt={2}>
                        {service.feeAmount > 0 ? `${service.feeCurrency} ${service.feeAmount.toFixed(2)}` : 'Price on request'}
                        {service.turnaroundTime ? ` · ${service.turnaroundTime}` : ''}
                        {service.youGet.length > 0 ? ` · They get: ${service.youGet.join(', ')}` : ''}
                      </Text>
                      {!service.available && <Text size="xs" c="orange">Its work area is off in setup.</Text>}
                    </Box>
                    <Switch
                      checked={service.published && service.available}
                      disabled={!service.available || busy === service.id}
                      onChange={(event) => void save(service.id, { services: [{ id: service.id, published: event.currentTarget.checked }] })}
                    />
                  </Group>
                  {editing === service.id ? (
                    <Stack gap={6} mt="xs">
                      <NumberInput size="xs" label={`Price (${service.feeCurrency}), 0 = on request`} min={0} decimalScale={2} value={draft.feeAmount} onChange={(value) => setDraft({ ...draft, feeAmount: Number(value) || 0 })} />
                      <TextInput size="xs" label="How long it takes" placeholder="e.g. 2 days" value={draft.turnaroundTime} onChange={(e) => setDraft({ ...draft, turnaroundTime: e.currentTarget.value })} />
                      <Textarea size="xs" label="Description" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.currentTarget.value })} />
                      <Group gap="xs">
                        <Button size="xs" loading={busy === service.id} onClick={async () => {
                          if (await save(service.id, { services: [{ id: service.id, ...draft }] }, 'Service saved.')) setEditing(null)
                        }}>Save</Button>
                        <Button size="xs" variant="subtle" onClick={() => setEditing(null)}>Cancel</Button>
                      </Group>
                    </Stack>
                  ) : (
                    <Group gap="xs" mt={6}>
                      <Button size="compact-xs" variant="subtle" onClick={() => {
                        setDraft({ feeAmount: service.feeAmount, turnaroundTime: service.turnaroundTime || '', description: service.description || '' })
                        setEditing(service.id)
                      }}>Price and details</Button>
                      {service.custom && (
                        <ActionIcon size="sm" variant="subtle" color="red" aria-label="Remove" onClick={() => void save(service.id, { removeServiceId: service.id }, 'Service removed.')}>
                          <IconTrash size={14} />
                        </ActionIcon>
                      )}
                    </Group>
                  )}
                </Paper>
              ))}
            </Stack>
          ))}
          <Divider label="Another service you offer" labelPosition="left" />
          <Group gap="xs" align="end" wrap="nowrap">
            <TextInput size="xs" style={{ flex: 1 }} placeholder="e.g. Consultation" value={newService.name} onChange={(e) => setNewService({ ...newService, name: e.currentTarget.value })} />
            <NumberInput size="xs" w={90} min={0} decimalScale={2} placeholder="Price" value={newService.feeAmount} onChange={(value) => setNewService({ ...newService, feeAmount: Number(value) || 0 })} />
            <ActionIcon size="lg" disabled={!newService.name.trim()} loading={busy === 'add-service'} aria-label="Add service" onClick={async () => {
              if (await save('add-service', { addService: newService }, 'Service added.')) setNewService({ name: '', feeAmount: 0 })
            }}>
              <IconPlus size={16} />
            </ActionIcon>
          </Group>
        </Stack>
      </Paper>

      <Paper p="md" radius="md" withBorder>
        <Stack gap="sm">
          <Box>
            <Group gap="xs">
              <IconBox size={18} color="var(--mantine-color-teal-6)" />
              <Text fw={700}>Goods</Text>
            </Group>
            <Text size="xs" c="dimmed" mt={4}>{view.goods.note}</Text>
          </Box>
          {view.goods.enabled ? (
            <>
              {view.goods.items.length === 0 && <Text size="sm" c="dimmed">No products yet.</Text>}
              {view.goods.items.map((item) => (
                <Group key={item.id} justify="space-between" wrap="nowrap">
                  <Text size="sm" style={{ flex: 1 }}>{item.title}</Text>
                  <Badge variant="light" color="teal">{item.currency} {Number(item.price).toFixed(2)}</Badge>
                  <ActionIcon size="sm" variant="subtle" color="red" aria-label="Remove" loading={busy === item.id} onClick={() => void save(item.id, { removeGoodsId: item.id }, 'Product removed.')}>
                    <IconTrash size={14} />
                  </ActionIcon>
                </Group>
              ))}
              <Group gap="xs" align="end" wrap="nowrap">
                <TextInput size="xs" style={{ flex: 1 }} placeholder="Product name" value={newGoods.title} onChange={(e) => setNewGoods({ ...newGoods, title: e.currentTarget.value })} />
                <NumberInput size="xs" w={90} min={0} decimalScale={2} placeholder="Price" value={newGoods.price} onChange={(value) => setNewGoods({ ...newGoods, price: Number(value) || 0 })} />
                <ActionIcon size="lg" disabled={!newGoods.title.trim()} loading={busy === 'add-goods'} aria-label="Add product" onClick={async () => {
                  if (await save('add-goods', { addGoods: newGoods }, 'Product added.')) setNewGoods({ title: '', price: 0 })
                }}>
                  <IconPlus size={16} />
                </ActionIcon>
              </Group>
            </>
          ) : (
            <Alert color="gray" variant="light" p="xs">
              <Text size="xs">You can still be found for your services.</Text>
            </Alert>
          )}
        </Stack>
      </Paper>
    </Stack>
  )
}
