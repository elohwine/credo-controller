import React, { useEffect, useState } from 'react'
import { Alert, Button, Checkbox, Grid, Select, Stack, Text, TextInput } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import api from '@/lib/api'
import BottomSheet from '@/components/shared/BottomSheet'
import { PhoneField } from '../../../shared/PhoneField'
import JobPaymentPlanFields, { jobPaymentPlanBody, type JobPaymentPlan } from './JobPaymentPlanFields'

interface JobPriceSheetProps {
  run: any
  opened: boolean
  onClose: () => void
  onSaved: () => void | Promise<void>
}

/**
 * Set or change what the client pays for a job and how. Same fields and words as the website
 * "Price and payment" dialog. Once saved, the bill goes to the client at sign-off (or now, when
 * the job is already signed off).
 */
export default function JobPriceSheet({ run, opened, onClose, onSaved }: JobPriceSheetProps) {
  const input = run?.input || {}
  const [noCharge, setNoCharge] = useState(false)
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [plan, setPlan] = useState<JobPaymentPlan>({
    paymentTerms: 'one_time',
    instalments: '2',
    paymentCadence: 'monthly',
    firstDueDate: new Date().toISOString().slice(0, 10),
    firstPaymentAmount: '',
  })
  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState('')

  useEffect(() => {
    if (!opened) return
    const current = Number(input.amount)
    setNoCharge(input.noCharge === true)
    setAmount(Number.isFinite(current) && current > 0 ? String(current) : '')
    setCurrency(String(input.currency || 'USD'))
    setPlan({
      paymentTerms: String(input.paymentTerms || 'one_time'),
      instalments: String(Number(input.instalments) || 2),
      paymentCadence: String(input.paymentCadence || 'monthly'),
      firstDueDate: String(input.firstDueDate || new Date().toISOString().slice(0, 10)),
      firstPaymentAmount: Number(input.firstPaymentAmount) > 0 ? String(input.firstPaymentAmount) : '',
    })
    setClientName(String(input.clientName || input.payerName || ''))
    setClientPhone(String(input.customerMsisdn || input.payerPhone || ''))
    setError(null)
    setNonce(`${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  }, [opened, run?.id])

  const save = async () => {
    const body: Record<string, unknown> = noCharge
      ? { noCharge: true }
      : {
          amount: Number(amount),
          currency,
          ...jobPaymentPlanBody(plan),
          ...(clientName.trim() ? { clientName: clientName.trim() } : {}),
          ...(clientPhone.trim() ? { clientPhone: clientPhone.trim() } : {}),
        }
    setSaving(true)
    setError(null)
    try {
      const { data } = await api.put(`/workflows/runs/${encodeURIComponent(run.id)}/billing`, body, {
        headers: { 'x-idempotency-key': `job-price:${run.id}:${nonce}:${JSON.stringify(body)}` },
      })
      if (data?.error) throw new Error(String(data.error))
      notifications.show({
        position: 'bottom-center',
        autoClose: 4000,
        message:
          data?.billing === 'billed'
            ? 'Price saved. The bill is on its way to the client.'
            : data?.billing === 'no_charge'
              ? 'Price saved. This job has no charge.'
              : 'Price saved. The bill goes to the client at sign-off.',
      })
      await onSaved()
      onClose()
    } catch (err: any) {
      setError(String(err?.response?.data?.error || err?.response?.data?.message || err?.message || 'The price was not saved.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <BottomSheet opened={opened} onClose={onClose} title="Price and payment">
      <Stack gap="md" pb="md">
        <Text size="sm" c="dimmed">
          What the client pays for this job and how. The bill goes to them by text with a pay link.
        </Text>
        <Checkbox
          size="md"
          label="No charge for this job"
          checked={noCharge}
          onChange={(e) => setNoCharge(e.currentTarget.checked)}
          styles={{ body: { minHeight: 48, alignItems: 'center' } }}
        />
        {!noCharge && (
          <>
            <Grid gutter="sm">
              <Grid.Col span={8}>
                <TextInput
                  label="Amount to invoice the client"
                  type="number"
                  min={0}
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.currentTarget.value)}
                />
              </Grid.Col>
              <Grid.Col span={4}>
                <Select label="Currency" data={['USD', 'ZWG', 'ZAR']} value={currency} onChange={(v) => setCurrency(v || 'USD')} />
              </Grid.Col>
            </Grid>
            <JobPaymentPlanFields value={plan} onChange={setPlan} />
            <TextInput label="Client name" value={clientName} onChange={(e) => setClientName(e.currentTarget.value)} />
            <PhoneField
              surface="phone"
              label="Client mobile number"
              description="The bill goes to this number."
              value={clientPhone}
              onChange={setClientPhone}
            />
          </>
        )}
        {error && (
          <Alert color="red" variant="light">
            {error}
          </Alert>
        )}
        <Button
          fullWidth
          radius="xl"
          size="md"
          style={{ minHeight: 48 }}
          loading={saving}
          disabled={!noCharge && !(Number(amount) > 0)}
          onClick={() => void save()}
        >
          Save
        </Button>
      </Stack>
    </BottomSheet>
  )
}
