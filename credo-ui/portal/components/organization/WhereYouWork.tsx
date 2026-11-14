import React, { useCallback, useEffect, useState } from 'react'
import { Button, Checkbox, Group, Paper, Stack, Switch, Text, Textarea, TextInput } from '@mantine/core'
import axios from 'axios'
import { feedback } from '@/lib/feedback'

const backendUrl = process.env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000'

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

/**
 * Where this organisation works and how it gets paid. The phone twin is the
 * "Where you work" section of PublicOfferingsCard. Both save the same fields.
 */
export default function WhereYouWork({ orgTenantId, getToken }: { orgTenantId: string; getToken: () => Promise<string> }) {
  const [areas, setAreas] = useState('')
  const [hours, setHours] = useState('')
  const [fulfilment, setFulfilment] = useState<string[]>([])
  const [rails, setRails] = useState<string[]>([])
  const [acceptingWork, setAcceptingWork] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [listed, setListed] = useState(false)
  const [listingNote, setListingNote] = useState('')
  const [listingBusy, setListingBusy] = useState(false)
  const [goodsEnabled, setGoodsEnabled] = useState(false)
  const [goods, setGoods] = useState<Array<{ id: string; title: string; price: number; currency: string; stockLeft?: number }>>([])
  const [productName, setProductName] = useState('')
  const [productPrice, setProductPrice] = useState('')
  const [productStock, setProductStock] = useState('')
  const [addingProduct, setAddingProduct] = useState(false)
  const [importingCatalog, setImportingCatalog] = useState(false)
  const [removingProduct, setRemovingProduct] = useState('')
  const [offer, setOffer] = useState('')
  const [offerResult, setOfferResult] = useState('')
  const [sendingOffer, setSendingOffer] = useState(false)
  const [missing, setMissing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const token = await getToken()
      const res = await axios.get(`${backendUrl}/api/organizations/${encodeURIComponent(orgTenantId)}/offerings`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setAreas((res.data?.reach?.serviceAreas || []).join(', '))
      setHours(res.data?.reach?.hours || '')
      setFulfilment(res.data?.reach?.fulfilment || [])
      setAcceptingWork(res.data?.reach?.acceptingWork !== false)
      setRails(selectedPaymentChoices(res.data?.paymentRails || []))
      setListed(Boolean(res.data?.isPublic))
      setListingNote((res.data?.listingBlockers || []).join(' '))
      setGoodsEnabled(Boolean(res.data?.goods?.enabled))
      setGoods(res.data?.goods?.items || [])
      setMissing(false)
    } catch {
      setMissing(true)
    } finally {
      setLoading(false)
    }
  }, [getToken, orgTenantId])

  const loadOfferResult = useCallback(async () => {
    try {
      const token = await getToken()
      const res = await axios.get(`${backendUrl}/api/organizations/${encodeURIComponent(orgTenantId)}/broadcasts/latest`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setOfferResult(res.data?.saved ? res.data.note : '')
    } catch {
      setOfferResult('')
    }
  }, [getToken, orgTenantId])

  useEffect(() => { if (orgTenantId) void load() }, [orgTenantId, load])
  useEffect(() => { if (orgTenantId) void loadOfferResult() }, [orgTenantId, loadOfferResult])

  const save = async () => {
    setSaving(true)
    try {
      const token = await getToken()
      const res = await axios.put(
        `${backendUrl}/api/organizations/${encodeURIComponent(orgTenantId)}/offerings`,
        {
          reach: {
            serviceAreas: areas.split(',').map((area) => area.trim()).filter(Boolean),
            hours,
            fulfilment,
            acceptingWork,
          },
          paymentRails: rails,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      )
      setAreas((res.data?.reach?.serviceAreas || []).join(', '))
      setHours(res.data?.reach?.hours || '')
      setFulfilment(res.data?.reach?.fulfilment || [])
      setAcceptingWork(res.data?.reach?.acceptingWork !== false)
      setRails(selectedPaymentChoices(res.data?.paymentRails || []))
      feedback.success('Saved where you work.')
    } catch (error: any) {
      feedback.error(error?.response?.data?.message || error?.message || 'Not saved. Try again.')
    } finally {
      setSaving(false)
    }
  }

  const setListedNow = async (next: boolean) => {
    setListingBusy(true)
    setListed(next)
    try {
      const token = await getToken()
      const res = await axios.put(
        `${backendUrl}/api/organizations/${encodeURIComponent(orgTenantId)}/offerings`,
        { isPublic: next },
        { headers: { Authorization: `Bearer ${token}` } },
      )
      setListed(Boolean(res.data?.isPublic))
      setListingNote((res.data?.listingBlockers || []).join(' '))
      feedback.success(next ? 'You can now be found in Discover.' : 'You are private now.')
    } catch (error: any) {
      setListed(!next)
      feedback.error(error?.response?.data?.message || error?.message || 'Not saved. Try again.')
    } finally {
      setListingBusy(false)
    }
  }

  const addProduct = async () => {
    setAddingProduct(true)
    try {
      const token = await getToken()
      const price = Number(productPrice)
      const stock = productStock.trim() === '' ? undefined : Number(productStock)
      const res = await axios.put(
        `${backendUrl}/api/organizations/${encodeURIComponent(orgTenantId)}/offerings`,
        { addGoods: { title: productName.trim(), price, ...(stock !== undefined ? { stock } : {}) } },
        { headers: { Authorization: `Bearer ${token}` } },
      )
      setGoods(res.data?.goods?.items || [])
      setGoodsEnabled(Boolean(res.data?.goods?.enabled))
      setProductName('')
      setProductPrice('')
      setProductStock('')
      feedback.success('Product added.')
    } catch (error: any) {
      feedback.error(error?.response?.data?.message || error?.message || 'Not saved. Try again.')
    } finally {
      setAddingProduct(false)
    }
  }

  const importCatalog = async () => {
    setImportingCatalog(true)
    try {
      const token = await getToken()
      const res = await axios.put(
        `${backendUrl}/api/organizations/${encodeURIComponent(orgTenantId)}/offerings`,
        { importWhatsAppCatalog: true },
        { headers: { Authorization: `Bearer ${token}` } },
      )
      setGoods(res.data?.goods?.items || [])
      setGoodsEnabled(Boolean(res.data?.goods?.enabled))
      const added = Number(res.data?.goods?.imported || 0)
      const updated = Number(res.data?.goods?.updated || 0)
      feedback.success(`Imported ${added} products. Updated ${updated}.`)
    } catch (error: any) {
      feedback.error(error?.response?.data?.message || error?.message || 'The catalog was not imported. Try again.')
    } finally {
      setImportingCatalog(false)
    }
  }

  const removeProduct = async (id: string) => {
    setRemovingProduct(id)
    try {
      const token = await getToken()
      const res = await axios.put(
        `${backendUrl}/api/organizations/${encodeURIComponent(orgTenantId)}/offerings`,
        { removeGoodsId: id },
        { headers: { Authorization: `Bearer ${token}` } },
      )
      setGoods(res.data?.goods?.items || [])
      feedback.success('Product removed.')
    } catch (error: any) {
      feedback.error(error?.response?.data?.message || error?.message || 'Not removed. Try again.')
    } finally {
      setRemovingProduct('')
    }
  }

  const saveOffer = async () => {
    setSendingOffer(true)
    try {
      const token = await getToken()
      const res = await axios.post(
        `${backendUrl}/api/organizations/${encodeURIComponent(orgTenantId)}/broadcasts`,
        { message: offer },
        { headers: { Authorization: `Bearer ${token}` } },
      )
      setOffer('')
      void loadOfferResult()
      feedback.success(res.data?.note || 'Saved. Nobody was messaged.')
    } catch (error: any) {
      feedback.error(error?.response?.data?.message || error?.message || 'Not saved. Try again.')
    } finally {
      setSendingOffer(false)
    }
  }

  if (loading) return null
  if (missing) return <Text size="sm" c="dimmed">Finish organisation setup before setting where you work.</Text>

  return (
    <Stack gap="md">
    <Paper withBorder radius="md" p="md">
      <Stack gap="sm">
        <div>
          <Text fw={700}>Found in Discover</Text>
          <Text size="sm" c="dimmed">
            Other people can find you, see what you offer, and ask or buy.
          </Text>
        </div>
        <Switch
          label="Found in Discover"
          checked={listed}
          disabled={listingBusy}
          onChange={(event) => void setListedNow(event.currentTarget.checked)}
        />
        {listingNote ? <Text size="sm" c="orange">{listingNote}</Text> : null}
      </Stack>
    </Paper>
    <Paper withBorder radius="md" p="md">
      <Stack gap="sm">
        <div>
          <Text fw={700}>Where you work</Text>
          <Text size="sm" c="dimmed">
            People looking for someone nearby only see you when the place, the payment and how the work is done fit what you set here.
          </Text>
        </div>
        <Switch
          label="Taking new work"
          description="Off: people looking for someone are not sent to you. Work you already have carries on."
          checked={acceptingWork}
          onChange={(event) => setAcceptingWork(event.currentTarget.checked)}
        />
        <TextInput
          label="Areas"
          description="Suburbs or cities, separated by commas"
          placeholder="Borrowdale, Avondale, Harare"
          value={areas}
          onChange={(event) => setAreas(event.currentTarget.value)}
        />
        <TextInput label="Hours" placeholder="Mon to Sat, 8:00 to 17:00" value={hours} onChange={(event) => setHours(event.currentTarget.value)} />
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
        <Button loading={saving} onClick={() => void save()}>Save</Button>
      </Stack>
    </Paper>
    <Paper withBorder radius="md" p="md">
      <Stack gap="sm">
        <div>
          <Text fw={700}>Goods</Text>
          <Text size="sm" c="dimmed">Products for sale in the shop. A quantity tracks stock. Leave it blank when stock is not counted.</Text>
        </div>
        {goodsEnabled ? (
          <>
            {goods.length === 0 ? <Text size="sm" c="dimmed">No products yet.</Text> : null}
            {goods.map((item) => (
              <Group key={item.id} justify="space-between" wrap="nowrap">
                <Text size="sm">
                  {item.title} · {item.currency} {Number(item.price).toFixed(2)}
                  {item.stockLeft === 0 ? ' · Sold out' : item.stockLeft !== undefined ? ` · ${item.stockLeft} left` : ''}
                </Text>
                <Button variant="subtle" color="red" loading={removingProduct === item.id} onClick={() => void removeProduct(item.id)}>Remove</Button>
              </Group>
            ))}
            <Group align="end">
              <TextInput label="Product name" style={{ flex: 1 }} value={productName} onChange={(event) => setProductName(event.currentTarget.value)} />
              <TextInput label="Price" w={100} value={productPrice} onChange={(event) => setProductPrice(event.currentTarget.value)} />
              <TextInput label="Quantity" w={100} value={productStock} onChange={(event) => setProductStock(event.currentTarget.value)} />
              <Button loading={addingProduct} disabled={!productName.trim()} onClick={() => void addProduct()}>Add product</Button>
              <Button variant="light" loading={importingCatalog} onClick={() => void importCatalog()}>Import from WhatsApp</Button>
            </Group>
          </>
        ) : (
          <Text size="sm" c="dimmed">You can still be found for your services.</Text>
        )}
      </Stack>
    </Paper>
    <Paper withBorder radius="md" p="md">
      <Stack gap="sm">
        <div>
          <Text fw={700}>Offers</Text>
          <Text size="sm" c="dimmed">
            People who asked for offers are counted. Nobody is messaged. You can save one offer a day. This is separate from WhatsApp alerts.
          </Text>
        </div>
        {offerResult ? <Text size="sm">{offerResult}</Text> : null}
        <Textarea label="Offer" placeholder="Boiler service this week, in Borrowdale" value={offer} onChange={(event) => setOffer(event.currentTarget.value)} />
        <Button loading={sendingOffer} onClick={() => void saveOffer()}>Save offer</Button>
      </Stack>
    </Paper>
    </Stack>
  )
}
