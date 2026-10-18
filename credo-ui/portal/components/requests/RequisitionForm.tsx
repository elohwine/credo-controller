import { useState, useContext } from 'react'
import { useRouter } from 'next/router'
import axios from 'axios'
import { EnvContext } from '@/pages/_app'
import { getOrgScopedToken, isActingAsOrganization } from '@/utils/organizationContext'
import { captureOrganizationSwitchContext } from '../../../shared/taskContext'
import { useRequireOrgContext } from '@/lib/portalContext'
import { Group, Stack, Button, NumberInput, Select, Textarea, TextInput, Divider } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconCheck } from '@tabler/icons-react'

export default function RequisitionForm({
  onCancel,
  onSent,
  onBusyChange,
}: {
  onCancel: () => void
  onSent?: (requestId: string) => void
  onBusyChange?: (busy: boolean) => void
}) {
  // Org-only surface, like the requisition list and detail pages.
  const context = useRequireOrgContext('/inbox')
  const env = useContext(EnvContext)
  const router = useRouter()
  const baseUrl = env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000'

  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    department: 'HR',
    payWith: 'supplier' as 'supplier' | 'cash',
    vendor: '',
    purchaseKind: 'goods' as 'goods' | 'service',
    receivingRequired: 'yes' as 'yes' | 'no',
    amount: '',
    currency: 'USD',
    description: '',
  })

  const handleSubmit = async () => {
    const token =
      context.activeOrg && isActingAsOrganization(context.activeOrg.orgTenantId) ? getOrgScopedToken() : null
    const assertCurrent = captureOrganizationSwitchContext(localStorage)
    const parsedAmount = Number(form.amount)
    if (!token || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      notifications.show({
        title: 'Request not sent',
        message: !token ? 'Switch to the organization and sign in again.' : 'Enter a positive amount.',
        color: 'orange',
      })
      return
    }
    setSubmitting(true)
    onBusyChange?.(true)
    try {
      const itemName = form.description?.trim() || form.vendor?.trim() || 'Requisition item'
      const created = await axios.post(
        `${baseUrl}/api/platform/requests/`,
        {
          requestType: 'procurement.requisition',
          title: itemName,
          description: form.description || undefined,
          amount: parsedAmount,
          currency: form.currency,
          targetModule: 'finance',
          context: {
            department: form.department,
            supplierRef: form.payWith === 'cash' ? undefined : form.vendor,
            paymentMethod: form.payWith === 'cash' ? 'cash' : 'supplier',
            itemType: form.purchaseKind,
            receivingRequired: form.receivingRequired === 'yes',
          },
          items: [
            {
              description: itemName,
              unitPrice: parsedAmount,
              quantity: 1,
              itemType: form.purchaseKind,
            },
          ],
        },
        { headers: { Authorization: `Bearer ${token}` } },
      )
      assertCurrent()
      await axios.post(
        `${baseUrl}/api/platform/requests/${encodeURIComponent(created.data.id)}/submit`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      )
      assertCurrent()

      notifications.show({
        title: 'Request sent',
        message:
          form.payWith === 'cash'
            ? 'Your cash request is with the approvers. It is paid out when released.'
            : 'Your request is with the approvers. A purchase order is created when it is approved.',
        color: 'green',
        icon: <IconCheck size={16} />,
      })
      if (onSent) onSent(created.data.id)
      else void router.push(`/requests?tab=requisitions&request=${encodeURIComponent(created.data.id)}`)
    } catch (err: any) {
      notifications.show({
        title: 'Could not send this request',
        message: err?.response?.data?.error || err?.response?.data?.message || err.message,
        color: 'red',
      })
    } finally {
      setSubmitting(false)
      onBusyChange?.(false)
    }
  }

  return (
    <fieldset disabled={submitting} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <Stack gap="md">
        <Group grow>
          <Select
            label="Department"
            data={['HR', 'IT', 'Operations', 'Procurement', 'Marketing']}
            value={form.department}
            onChange={(val) => setForm({ ...form, department: val || 'HR' })}
            required
          />
          <Select
            label="How will this be paid?"
            data={[
              { value: 'supplier', label: 'Buy from a supplier (purchase order on approval)' },
              { value: 'cash', label: 'Cash or petty cash (paid out on release, no purchase order)' },
            ]}
            value={form.payWith}
            onChange={(val) => setForm({ ...form, payWith: val === 'cash' ? 'cash' : 'supplier' })}
            allowDeselect={false}
            required
          />
        </Group>
        <Group grow>
          <Select
            label="What are you buying?"
            data={[
              { value: 'goods', label: 'Goods or materials' },
              { value: 'service', label: 'A service' },
            ]}
            value={form.purchaseKind}
            onChange={(value) => setForm({ ...form, purchaseKind: value === 'service' ? 'service' : 'goods' })}
          />
          <Select
            label={
              form.purchaseKind === 'goods' ? 'Confirm delivery before paying?' : 'Confirm the service before paying?'
            }
            data={[
              { value: 'yes', label: 'Yes, confirmation is required' },
              { value: 'no', label: 'No separate confirmation' },
            ]}
            value={form.receivingRequired}
            onChange={(value) => setForm({ ...form, receivingRequired: value === 'no' ? 'no' : 'yes' })}
          />
        </Group>

        {form.payWith === 'supplier' && (
          <TextInput
            label="Supplier"
            placeholder="e.g. BuildMart"
            description="Who you are buying from. Leave empty if you do not know yet."
            value={form.vendor}
            onChange={(e) => setForm({ ...form, vendor: e.currentTarget.value })}
          />
        )}

        <Group grow>
          <NumberInput
            label="Amount"
            required
            min={0.01}
            decimalScale={2}
            value={form.amount ? parseFloat(form.amount) : undefined}
            onChange={(val) => setForm({ ...form, amount: String(val ?? '') })}
          />
          <Select
            label="Currency"
            data={['USD', 'ZWL']}
            value={form.currency}
            onChange={(val) => setForm({ ...form, currency: val || 'USD' })}
          />
        </Group>

        <Textarea
          label="What is it for?"
          placeholder="Say what you need and why..."
          minRows={4}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.currentTarget.value })}
        />

        <Divider my="sm" />
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onCancel}>
            Cancel
          </Button>
          <Button loading={submitting} disabled={!form.amount} onClick={handleSubmit}>
            Send request
          </Button>
        </Group>
      </Stack>
    </fieldset>
  )
}
