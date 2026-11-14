import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActionIcon, Alert, Badge, Box, Button, Center, Checkbox, Divider, Group, Loader, NumberInput, Paper, Select, Stack, Switch, Text, TextInput, Textarea,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconBox, IconBuildingStore, IconPlus, IconTool, IconTrash } from '@tabler/icons-react'
import api from '@/lib/api'
import { getPreferredToken } from '@/lib/auth'
import { PhoneField } from '../../../shared/PhoneField'

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

type GoodsItem = { id: string; title: string; price: number; currency: string; description?: string; stockLeft?: number }

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

/** Maps a stored payment method onto one of the choices, so EcoCash stays ticked. */
function selectedPaymentChoices(stored: string[]): string[] {
  const picked = new Set<string>()
  for (const rail of stored) {
    const key = rail.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (key.includes('ecocash')) picked.add('ecocash')
    else if (key.includes('innbuck')) picked.add('innbucks')
    else if (key.includes('bank')) picked.add('bank')
    else if (key.includes('card') || key.includes('visa')) picked.add('card')
    else if (key === 'cash' || key.includes('counter')) picked.add('cash')
  }
  return Array.from(picked)
}

type OfferingsView = {
  isPublic: boolean
  listingBlockers: string[]
  reach?: { serviceAreas?: string[]; hours?: string; fulfilment?: string[]; acceptingWork?: boolean }
  paymentRails?: string[]
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
  const [newGoods, setNewGoods] = useState<{ title: string; price: number; stock?: number }>({ title: '', price: 0 })
  const [areas, setAreas] = useState('')
  const [hours, setHours] = useState('')
  const [fulfilment, setFulfilment] = useState<string[]>([])
  const [rails, setRails] = useState<string[]>([])
  const [acceptingWork, setAcceptingWork] = useState(true)
  const [offer, setOffer] = useState('')
  const [offerResult, setOfferResult] = useState('')

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
      setAreas((res.data.reach?.serviceAreas || []).join(', '))
      setHours(res.data.reach?.hours || '')
      setFulfilment(res.data.reach?.fulfilment || [])
      setAcceptingWork(res.data.reach?.acceptingWork !== false)
      setRails(selectedPaymentChoices(res.data.paymentRails || []))
    } catch (err: any) {
      setView(null)
      notifications.show({ color: 'red', title: 'Could not load', message: err?.response?.data?.message || err?.message || 'Try again.' })
    } finally {
      setLoading(false)
    }
  }, [url])

  const loadOfferResult = useCallback(async () => {
    try {
      const res = await api.get(`/api/organizations/${encodeURIComponent(orgTenantId)}/broadcasts/latest`, { headers: headers() })
      setOfferResult(res.data?.saved ? res.data.note : '')
    } catch {
      setOfferResult('')
    }
  }, [orgTenantId])

  useEffect(() => { if (orgTenantId) void load() }, [orgTenantId, load])
  useEffect(() => { if (orgTenantId) void loadOfferResult() }, [orgTenantId, loadOfferResult])

  const save = async (key: string, body: Update, done?: string | ((data: any) => string)) => {
    setBusy(key)
    try {
      const res = await api.put(url, body, { headers: headers() })
      setView(res.data)
      setProfile(res.data.profile)
      setAreas((res.data.reach?.serviceAreas || []).join(', '))
      setHours(res.data.reach?.hours || '')
      setFulfilment(res.data.reach?.fulfilment || [])
      setAcceptingWork(res.data.reach?.acceptingWork !== false)
      setRails(selectedPaymentChoices(res.data.paymentRails || []))
      const message = typeof done === 'function' ? done(res.data) : done
      if (message) notifications.show({ position: 'bottom-center', color: 'green', title: 'Saved', message })
      return true
    } catch (err: any) {
      notifications.show({
        position: 'bottom-center',
        color: 'red',
        title: 'Not saved',
        message: err?.response?.data?.message || err?.message || 'Try again.',
      })
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
          <PhoneField surface="phone" label="Phone" value={profile.contactPhone || ''} onChange={(contactPhone) => setProfile({ ...profile, contactPhone })} />
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
            <Text fw={700}>Where you work</Text>
            <Text size="xs" c="dimmed" mt={4}>
              People looking for someone nearby only see you when the place, the payment and how the work is done fit what you set here.
            </Text>
          </Box>
          <Switch
            size="md"
            label="Taking new work"
            description="Off: people looking for someone are not sent to you. Work you already have carries on."
            checked={acceptingWork}
            onChange={(e) => setAcceptingWork(e.currentTarget.checked)}
            styles={{ root: { minHeight: 48 } }}
          />
          <TextInput
            label="Areas"
            description="Suburbs or cities, separated by commas"
            placeholder="Borrowdale, Avondale, Harare"
            value={areas}
            onChange={(e) => setAreas(e.currentTarget.value)}
          />
          <TextInput label="Hours" placeholder="Mon to Sat, 8:00 to 17:00" value={hours} onChange={(e) => setHours(e.currentTarget.value)} />
          <Checkbox.Group label="How the work is done" value={fulfilment} onChange={setFulfilment}>
            <Stack gap={6} mt={4}>
              {FULFILMENT_CHOICES.map((choice) => (
                <Checkbox key={choice.value} value={choice.value} label={choice.label} />
              ))}
            </Stack>
          </Checkbox.Group>
          <Checkbox.Group label="How you get paid" value={rails} onChange={setRails}>
            <Stack gap={6} mt={4}>
              {PAYMENT_CHOICES.map((choice) => (
                <Checkbox key={choice.value} value={choice.value} label={choice.label} />
              ))}
            </Stack>
          </Checkbox.Group>
          <Button
            h={48}
            radius="xl"
            loading={busy === 'reach'}
            onClick={() => void save('reach', {
              reach: {
                serviceAreas: areas.split(',').map((area) => area.trim()).filter(Boolean),
                hours,
                fulfilment,
                acceptingWork,
              },
              paymentRails: rails,
            }, 'Saved where you work.')}
          >
            Save
          </Button>
        </Stack>
      </Paper>

      <Paper p="md" radius="md" withBorder>
        <Stack gap="sm">
          <Box>
            <Text fw={700}>Offers</Text>
            <Text size="xs" c="dimmed" mt={4}>
              People who asked for offers are counted. Nobody is messaged. You can save one offer a day. This is separate from WhatsApp alerts.
            </Text>
          </Box>
          {offerResult ? <Text size="sm">{offerResult}</Text> : null}
          <Textarea label="Offer" placeholder="Boiler service this week, in Borrowdale" value={offer} onChange={(event) => setOffer(event.currentTarget.value)} />
          <Button h={48} radius="xl" loading={busy === 'offer'} onClick={async () => {
            setBusy('offer')
            try {
              const res = await api.post(`/api/organizations/${encodeURIComponent(orgTenantId)}/broadcasts`, { message: offer }, { headers: headers() })
              setOffer('')
              void loadOfferResult()
              notifications.show({ position: 'bottom-center', color: 'green', title: 'Saved', message: res.data?.note || 'Saved. Nobody was messaged.' })
            } catch (err: any) {
              notifications.show({ position: 'bottom-center', color: 'red', title: 'Not saved', message: err?.response?.data?.message || err?.message || 'Try again.' })
            } finally {
              setBusy(null)
            }
          }}>Save offer</Button>
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
                  <Text size="sm" style={{ flex: 1 }}>
                    {item.title}
                    {item.stockLeft === 0 ? ' · Sold out' : item.stockLeft !== undefined ? ` · ${item.stockLeft} left` : ''}
                  </Text>
                  <Badge variant="light" color="teal">{item.currency} {Number(item.price).toFixed(2)}</Badge>
                  <ActionIcon size="sm" variant="subtle" color="red" aria-label="Remove" loading={busy === item.id} onClick={() => void save(item.id, { removeGoodsId: item.id }, 'Product removed.')}>
                    <IconTrash size={14} />
                  </ActionIcon>
                </Group>
              ))}
              <Group gap="xs" align="end" wrap="nowrap">
                <TextInput size="xs" style={{ flex: 1 }} placeholder="Product name" value={newGoods.title} onChange={(e) => setNewGoods({ ...newGoods, title: e.currentTarget.value })} />
                <NumberInput size="xs" w={90} min={0} decimalScale={2} placeholder="Price" value={newGoods.price} onChange={(value) => setNewGoods({ ...newGoods, price: Number(value) || 0 })} />
                <NumberInput size="xs" w={80} min={0} placeholder="Left" value={newGoods.stock} onChange={(value) => setNewGoods({ ...newGoods, stock: value === '' ? undefined : Number(value) })} />
                <ActionIcon size={48} disabled={!newGoods.title.trim()} loading={busy === 'add-goods'} aria-label="Add product" onClick={async () => {
                  if (await save('add-goods', { addGoods: newGoods }, 'Product added.')) setNewGoods({ title: '', price: 0 })
                }}>
                  <IconPlus size={16} />
                </ActionIcon>
              </Group>
              <Button
                h={48}
                radius="xl"
                variant="light"
                loading={busy === 'import-catalog'}
                onClick={() =>
                  void save('import-catalog', { importWhatsAppCatalog: true }, (data) => {
                    const added = Number(data?.goods?.imported || 0)
                    const updated = Number(data?.goods?.updated || 0)
                    return `Imported ${added} products. Updated ${updated}.`
                  })
                }
              >
                Import from WhatsApp
              </Button>
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
