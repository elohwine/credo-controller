import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { Alert, Button, Checkbox, Group, Modal, NumberInput, Select, Stack, Text, TextInput } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { getOrgScopedToken } from '@/utils/organizationContext'
import { getPreferredTenantToken } from '@/utils/portalTenant'
import { PhoneField } from '../../../shared/PhoneField'
import JobPaymentPlanFields, { DEFAULT_JOB_PAYMENT_PLAN, jobPaymentPlanBody, type JobPaymentPlan } from './JobPaymentPlanFields'
import { usePortalOperations } from '@/lib/operations'
import { RateCardPicker } from '../../../shared/operations/RateCardPicker'

function backendUrl(): string {
  return ((window as any).__ENV?.NEXT_PUBLIC_VC_REPO as string) || 'http://localhost:3000'
}

interface JobPriceModalProps {
  job: any
  opened: boolean
  onClose: () => void
  onSaved: () => void
}

/**
 * Set or change what the client pays for a job and how. Same fields and words as the phone
 * "Set price and payment" sheet. Once saved, the bill goes to the client at sign-off (or now, when
 * the job is already signed off).
 */
export default function JobPriceModal({ job, opened, onClose, onSaved }: JobPriceModalProps) {
  const { api: operations } = usePortalOperations()
  const input = job?.input || {}
  const [noCharge, setNoCharge] = useState(false)
  const [amount, setAmount] = useState<number | string>('')
  const [currency, setCurrency] = useState('USD')
  const [plan, setPlan] = useState<JobPaymentPlan>(DEFAULT_JOB_PAYMENT_PLAN)
  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState('')

  useEffect(() => {
    if (!opened) return
    const current = Number(input.amount)
    setNoCharge(input.noCharge === true)
    setAmount(Number.isFinite(current) && current > 0 ? current : '')
    setCurrency(String(input.currency || 'USD'))
    setPlan({
      paymentTerms: String(input.paymentTerms || 'one_time'),
      instalments: Number(input.instalments) || 2,
      paymentCadence: String(input.paymentCadence || 'monthly'),
      firstDueDate: String(input.firstDueDate || DEFAULT_JOB_PAYMENT_PLAN.firstDueDate),
      firstPaymentAmount: Number(input.firstPaymentAmount) > 0 ? Number(input.firstPaymentAmount) : '',
    })
    setClientName(String(input.clientName || input.payerName || ''))
    setClientPhone(String(input.customerMsisdn || input.payerPhone || ''))
    setError(null)
    setNonce(`${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  }, [opened, job?.id])

  const save = async () => {
    const token = getOrgScopedToken() || getPreferredTenantToken()
    if (!token) {
      setError('Switch to the organisation before setting the price.')
      return
    }
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
      const { data } = await axios.put(`${backendUrl()}/workflows/runs/${encodeURIComponent(job.id)}/billing`, body, {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-idempotency-key': `job-price:${job.id}:${nonce}:${JSON.stringify(body)}`,
        },
      })
      if (data?.error) throw new Error(String(data.error))
      notifications.show({
        title: 'Price saved',
        message:
          data?.billing === 'billed'
            ? 'The bill is on its way to the client.'
            : data?.billing === 'no_charge'
              ? 'This job has no charge.'
              : 'The bill goes to the client when the work is signed off.',
        color: 'teal',
      })
      onSaved()
      onClose()
    } catch (err: any) {
      setError(String(err?.response?.data?.error || err?.response?.data?.message || err?.message || 'The price was not saved.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} centered size="lg" title="Price and payment">
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          What the client pays for this job and how. The bill goes to them by text with a pay link.
        </Text>
        <Checkbox
          label="No charge for this job"
          checked={noCharge}
          onChange={(e) => setNoCharge(e.currentTarget.checked)}
        />
        {!noCharge && (
          <>
            <RateCardPicker
              api={operations}
              onUse={(next, nextCurrency) => {
                setAmount(next)
                setCurrency(nextCurrency)
              }}
            />
            <Group grow>
              <NumberInput label="Amount to invoice the client" min={0} value={amount} onChange={setAmount} />
              <Select
                label="Currency"
                data={['USD', 'ZWG', 'ZAR']}
                value={currency}
                onChange={(value) => setCurrency(value || 'USD')}
              />
            </Group>
            <JobPaymentPlanFields value={plan} onChange={setPlan} />
            <TextInput label="Client name" value={clientName} onChange={(e) => setClientName(e.currentTarget.value)} />
            <PhoneField
              surface="portal"
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
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} loading={saving} disabled={!noCharge && !(Number(amount) > 0)}>
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
