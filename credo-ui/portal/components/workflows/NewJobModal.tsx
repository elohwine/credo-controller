import React, { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { Stack, TextInput, Textarea, NumberInput, Select, Group, Button, Alert, Text, Checkbox } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { getOrgScopedToken, readActiveOrganization } from '@/utils/organizationContext'
import { getPreferredTenantToken } from '@/utils/portalTenant'
import { jobContactOption, OUTSIDE_CONTACT_NEEDS_APP, parseJobContactSelection } from '@/lib/jobPeople'
import BaseModal from '@/components/walt/modal/BaseModal'

interface Member {
  userId: string
  role: string
  displayName?: string
  phone?: string
  status?: string
}
interface Contact {
  name: string
  phone: string
  contactScope?: 'internal' | 'external'
}

interface NewJobModalProps {
  opened: boolean
  onClose: () => void
  onCreated: (runId: string) => void
  embedded?: boolean
  onBusyChange?: (busy: boolean) => void
}

const STAGE_ACTOR = 'stage-actor'

function backendUrl(): string {
  return ((window as any).__ENV?.NEXT_PUBLIC_VC_REPO as string) || 'http://localhost:3000'
}

function personName(member: Member): string {
  const name = String(member.displayName || '').trim()
  const generic = !name || /^organization owner$/i.test(name)
  if (!generic) return name
  if (member.phone) return member.phone
  if (String(member.role || '').toLowerCase() === 'owner') return 'Organization owner'
  return `Team member · ${member.userId.slice(0, 6)}`
}

function memberLabel(member: Member): string {
  const role = String(member.role || 'member').replace(/_/g, ' ')
  return `${personName(member)} (${role})`
}

/**
 * Create a field job from the portal: who does the work, who signs it off, what and where.
 * Mirrors the mobile "New job" form so both surfaces send the same request.
 */
export default function NewJobModal({ opened, onClose, onCreated, embedded = false, onBusyChange }: NewJobModalProps) {
  const [members, setMembers] = useState<Member[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [loadingSetup, setLoadingSetup] = useState(false)
  const [setupError, setSetupError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    poNumber: '',
    problemType: '',
    description: '',
    clientName: '',
    clientPhone: '',
    location: '',
    vehicleReference: '',
    scheduledDate: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
    amount: 0 as number | string,
    payoutAmount: '' as number | string,
    currency: 'USD',
    paymentTerms: 'one_time',
    instalments: 2 as number | string,
    paymentCadence: 'monthly',
    firstDueDate: new Date().toISOString().slice(0, 10),
    firstPaymentAmount: '' as number | string,
    assigneeId: STAGE_ACTOR,
    receiverId: STAGE_ACTOR,
    requireConcealedWorkPhoto: false,
  })

  useEffect(() => {
    if (!opened) return
    const org = readActiveOrganization()
    const token = getOrgScopedToken() || getPreferredTenantToken()
    if (!org?.orgTenantId || !token) {
      setSetupError('Switch to the organization before creating a job.')
      return
    }
    const headers = { Authorization: `Bearer ${token}` }
    const backend = backendUrl()
    setLoadingSetup(true)
    setSetupError(null)
    Promise.all([
      axios
        .get(`${backend}/api/organizations/${encodeURIComponent(org.orgTenantId)}/members`, { headers })
        .catch(() => ({ data: [] })),
      Promise.all([
        axios
          .get(`${backend}/api/contacts`, { params: { contactScope: 'internal' }, headers })
          .catch(() => ({ data: { contacts: [] } })),
        axios
          .get(`${backend}/api/contacts`, { params: { contactScope: 'external' }, headers })
          .catch(() => ({ data: { contacts: [] } })),
      ]),
      axios
        .get(`${backend}/api/organizations/${encodeURIComponent(org.orgTenantId)}/workflows`, { headers })
        .catch(() => ({ data: {} })),
    ])
      .then(([membersRes, contactsRes, workflowsRes]) => {
        const memberRows = Array.isArray(membersRes.data) ? membersRes.data : []
        setMembers(
          memberRows
            .filter((m: any) => m?.userId && m?.status !== 'inactive')
            .map((m: any) => ({
              userId: String(m.userId),
              role: String(m.role || 'member'),
              displayName: m.displayName ? String(m.displayName) : undefined,
              status: m.status,
            })),
        )
        const contactLists = Array.isArray(contactsRes) ? contactsRes : [contactsRes]
        const contactRows = contactLists.flatMap((res: any) => {
          const rows = Array.isArray(res?.data?.contacts) ? res.data.contacts : Array.isArray(res?.data) ? res.data : []
          return rows
        })
        setContacts(
          contactRows
            .filter((c: any) => c?.phone)
            .map((c: any) => ({
              name: String(c.name || 'Contact'),
              phone: String(c.phone),
              contactScope: c.contactScope === 'internal' ? ('internal' as const) : ('external' as const),
            })),
        )
        const templates = Array.isArray(workflowsRes.data?.templates) ? workflowsRes.data.templates : []
        const fept =
          templates.find((t: any) => String(t?.workflowType || '').toLowerCase() === 'field_execution_fept') ||
          templates.find((t: any) => /fept|field/.test(String(t?.id || t?.workflowType || '').toLowerCase()))
        // A saved template row is optional. The first job can run from the answers.
        setTemplateId(fept?.id ? String(fept.id) : 'field_execution_fept')
      })
      .finally(() => setLoadingSetup(false))
  }, [opened])

  const peopleOptions = useMemo(() => {
    const memberOptions = members.map((m) => ({ value: m.userId, label: memberLabel(m) }))
    const contactOptions = contacts.map((c) => jobContactOption(c))
    return [...memberOptions, ...contactOptions]
  }, [members, contacts])

  const ensureOnTeam = async (selection: string, role: string, headers: Record<string, string>) => {
    if (!selection || selection === STAGE_ACTOR) return undefined
    const parsed = parseJobContactSelection(selection)
    if (!parsed) return selection
    const org = readActiveOrganization()
    if (!org?.orgTenantId) throw new Error('Switch to the organization before creating a job.')
    if (parsed.scope === 'external') {
      const lookup = await axios.get(
        `${backendUrl()}/api/organizations/${encodeURIComponent(org.orgTenantId)}/members/by-phone`,
        { params: { phone: parsed.phone }, headers },
      )
      const userId = String(lookup.data?.userId || '').trim()
      if (!userId) throw new Error(OUTSIDE_CONTACT_NEEDS_APP)
      return userId
    }
    const res = await axios.post(
      `${backendUrl()}/api/organizations/${encodeURIComponent(org.orgTenantId)}/members/invite`,
      { phone: parsed.phone, role },
      { headers },
    )
    const userId = String(res.data?.targetUserId || '').trim()
    if (!userId) throw new Error('That contact could not be added to the team.')
    return userId
  }

  const handleCreate = async () => {
    const token = getOrgScopedToken() || getPreferredTenantToken()
    if (!token || !templateId) return
    const amount = Number(form.amount)
    if (!form.description.trim()) {
      notifications.show({ title: 'Describe the work', message: 'Say what needs to be done on site.', color: 'orange' })
      return
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      notifications.show({
        title: 'Add the client amount',
        message: 'Enter the amount the client is invoiced for this job.',
        color: 'orange',
      })
      return
    }
    const payoutAmount = Number(form.payoutAmount)
    const headers = { Authorization: `Bearer ${token}` }
    setSaving(true)
    onBusyChange?.(true)
    try {
      const assigneeUserId = await ensureOnTeam(form.assigneeId, 'field_worker', headers)
      const receiverUserId = await ensureOnTeam(form.receiverId, 'member', headers)
      const ref = `FR-${Date.now()}`
      const body: Record<string, unknown> = {
        amount,
        // Only a job that pays a worker or subcontractor has a payout step.
        ...(Number.isFinite(payoutAmount) && payoutAmount > 0 ? { payoutAmount } : {}),
        currency: form.currency,
        paymentTerms: form.paymentTerms,
        ...(form.paymentTerms !== 'one_time'
          ? {
              instalments: Number(form.instalments) || 2,
              paymentCadence: form.paymentCadence,
              firstDueDate: form.firstDueDate,
              ...(Number(form.firstPaymentAmount) > 0 ? { firstPaymentAmount: Number(form.firstPaymentAmount) } : {}),
            }
          : {}),
        description: form.description.trim(),
        requireConcealedWorkPhoto: form.requireConcealedWorkPhoto,
        poNumber: form.poNumber.trim(),
        ...(form.problemType ? { problemType: form.problemType } : {}),
        ...(form.vehicleReference.trim() ? { vehicleReference: form.vehicleReference.trim() } : {}),
        clientName: form.clientName.trim(),
        ...(form.clientPhone.trim() ? { customerMsisdn: form.clientPhone.trim() } : {}),
        location: form.location.trim(),
        scheduledDate: form.scheduledDate,
        reference: ref,
        requestId: ref,
        triggerRef: `portal-job-${Date.now()}`,
      }
      if (assigneeUserId) {
        body.assigneeId = assigneeUserId
        body.assigneeUserId = assigneeUserId
      }
      if (receiverUserId) body.receiverId = receiverUserId
      const res = await axios.post(`${backendUrl()}/workflows/${encodeURIComponent(templateId)}/execute`, body, {
        headers,
      })
      if (res.data?.error) throw new Error(String(res.data.error))
      notifications.show({ title: 'Job created', message: 'The worker will see it in their inbox.', color: 'teal' })
      onCreated(String(res.data?.runId || ''))
      setForm((prev) => ({
        ...prev,
        poNumber: '',
        problemType: '',
        description: '',
        clientName: '',
        clientPhone: '',
        location: '',
        vehicleReference: '',
        requireConcealedWorkPhoto: false,
        amount: 0,
        payoutAmount: '',
        paymentTerms: 'one_time',
      }))
      onClose()
    } catch (err: any) {
      notifications.show({
        title: 'Job not created',
        message: err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Please try again.',
        color: 'red',
      })
    } finally {
      setSaving(false)
      onBusyChange?.(false)
    }
  }

  const content = (
    <fieldset disabled={saving} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <Stack gap="sm">
        {setupError && (
          <Alert color="orange" variant="light">
            {setupError}
          </Alert>
        )}
        <TextInput
          label="Client PO / store number (if provided)"
          placeholder="e.g. PO-2026-004"
          value={form.poNumber}
          onChange={(e) => setForm({ ...form, poNumber: e.currentTarget.value })}
        />
        <Textarea
          label="What needs to be done"
          placeholder="e.g. Fix window leak, Block B"
          required
          minRows={2}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.currentTarget.value })}
        />
        <Checkbox
          label="Require a photo before work is covered"
          description="Adds an in-progress, location-sealed photo step for wiring, pipework or other work that will be hidden."
          checked={form.requireConcealedWorkPhoto}
          onChange={(e) => setForm({ ...form, requireConcealedWorkPhoto: e.currentTarget.checked })}
        />
        <Select
          label="Problem type"
          placeholder="Select a type"
          clearable
          data={['Plumbing', 'Electrical', 'Painting', 'HVAC', 'General maintenance', 'Other']}
          value={form.problemType}
          onChange={(value) => setForm({ ...form, problemType: value || '' })}
        />
        <Group grow>
          <TextInput
            label="Client / site name"
            value={form.clientName}
            onChange={(e) => setForm({ ...form, clientName: e.currentTarget.value })}
          />
          <TextInput
            label="Location"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.currentTarget.value })}
          />
        </Group>
        <TextInput
          label="Client mobile number"
          description="The client gets the bill, and any extra-work quote, as a text with a pay link. Leave empty if the client is billed another way."
          placeholder="e.g. 0771234567"
          value={form.clientPhone}
          onChange={(e) => setForm({ ...form, clientPhone: e.currentTarget.value })}
        />
        <TextInput
          label="Assigned vehicle (optional)"
          placeholder="Registration or fleet reference"
          value={form.vehicleReference}
          onChange={(e) => setForm({ ...form, vehicleReference: e.currentTarget.value })}
        />
        <Group grow>
          <TextInput
            type="date"
            label="Scheduled date"
            value={form.scheduledDate}
            onChange={(e) => setForm({ ...form, scheduledDate: e.currentTarget.value })}
          />
          <NumberInput
            label="Amount to invoice the client"
            description="Sent to the client as soon as the work is signed off."
            min={0}
            value={form.amount}
            onChange={(value) => setForm({ ...form, amount: value })}
          />
          <Select
            label="Currency"
            data={['USD', 'ZWG', 'ZAR']}
            value={form.currency}
            onChange={(value) => setForm({ ...form, currency: value || 'USD' })}
          />
        </Group>
        <Select
          label="How will the client pay?"
          description="The job can close after sign-off while later payments remain in Finance."
          data={[
            { value: 'one_time', label: 'One payment' },
            { value: 'instalment', label: 'A fixed number of instalments' },
            { value: 'recurring', label: 'Recurring payments' },
          ]}
          value={form.paymentTerms}
          onChange={(value) => setForm({ ...form, paymentTerms: value || 'one_time' })}
        />
        {form.paymentTerms !== 'one_time' && (
          <Group grow>
            <NumberInput
              label="Number of payments"
              min={2}
              max={60}
              value={form.instalments}
              onChange={(value) => setForm({ ...form, instalments: value })}
            />
            <Select
              label="How often"
              data={[
                { value: 'weekly', label: 'Weekly' },
                { value: 'monthly', label: 'Monthly' },
                { value: 'quarterly', label: 'Every three months' },
              ]}
              value={form.paymentCadence}
              onChange={(value) => setForm({ ...form, paymentCadence: value || 'monthly' })}
            />
            <TextInput
              type="date"
              label="First payment due"
              value={form.firstDueDate}
              onChange={(e) => setForm({ ...form, firstDueDate: e.currentTarget.value })}
            />
            <NumberInput
              label="First payment amount (optional)"
              min={0}
              value={form.firstPaymentAmount}
              onChange={(value) => setForm({ ...form, firstPaymentAmount: value })}
            />
          </Group>
        )}
        <NumberInput
          label="Worker payout (optional)"
          description="Only for a subcontractor or a per-job worker. Leave empty for salaried staff: the job then closes after sign-off with no payout step."
          min={0}
          value={form.payoutAmount}
          onChange={(value) => setForm({ ...form, payoutAmount: value })}
        />
        <Select
          label="Who goes out"
          description="Someone on the team is added if they are not already. An outside contact gets this job only, and only if they already have the app."
          searchable
          data={[{ value: STAGE_ACTOR, label: 'Use the person already chosen' }, ...peopleOptions]}
          value={form.assigneeId}
          onChange={(value) => setForm({ ...form, assigneeId: value || STAGE_ACTOR })}
        />
        <Select
          label="Who checks the work"
          description="They review the finished work and confirm it."
          searchable
          data={[{ value: STAGE_ACTOR, label: 'Use the person already chosen' }, ...peopleOptions]}
          value={form.receiverId}
          onChange={(value) => setForm({ ...form, receiverId: value || STAGE_ACTOR })}
        />
        <Text size="xs" c="dimmed">
          Payment is released after sign-off by the person chosen for it under Who does what.
        </Text>
        <Group justify="flex-end" mt="xs">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleCreate} loading={saving || loadingSetup} disabled={!templateId}>
            Create job
          </Button>
        </Group>
      </Stack>
    </fieldset>
  )
  return embedded ? (
    content
  ) : (
    <BaseModal
      show={opened}
      onClose={() => {
        if (!saving) onClose()
      }}
      title="New field job"
      size="lg"
      showClose={!saving}
    >
      {content}
    </BaseModal>
  )
}
