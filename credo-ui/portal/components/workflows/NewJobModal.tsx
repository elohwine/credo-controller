import React, { useContext, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import {
  Stack,
  TextInput,
  Textarea,
  NumberInput,
  Select,
  Group,
  Button,
  Alert,
  Text,
  Checkbox,
  Autocomplete,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { getOrgScopedToken, readActiveOrganization } from '@/utils/organizationContext'
import { getPreferredTenantToken } from '@/utils/portalTenant'
import {
  FIELD_CHECKER_STAGE,
  FIELD_WORKER_STAGE,
  enrolledJobMembers,
  jobPeopleOptions,
  selectedJobMember,
  stageActorOption,
} from '@/lib/jobPeople'
import { EnvContext } from '@/pages/_app'
import BaseModal from '@/components/walt/modal/BaseModal'
import { PhoneField } from '../../../shared/PhoneField'
import FormCard from '@/components/shared/FormCard'
import { ContactPickerSelect } from '@/components/finance/ContactPickerSelect'
import { IconBriefcase } from '@tabler/icons-react'
import JobPaymentPlanFields, { jobPaymentPlanBody } from './JobPaymentPlanFields'
import { usePortalOperations } from '@/lib/operations'
import { JobScheduleFields, useJobChoices, withCurrent } from '../../../shared/operations/JobScheduleFields'
import { storeSite, type TeamMember } from '../../../shared/operations/operationsApi'
import {
  FIELD_BRANCH_OPTIONS,
  FIELD_PRIORITY_OPTIONS,
  FIELD_PROBLEM_TYPES,
} from '../../../shared/operations/jobOptions'

interface Contact {
  id: string
  name: string
  phone: string
  contactScope?: 'internal' | 'external'
  storeNumber?: string
}

interface NewJobModalProps {
  opened: boolean
  onClose: () => void
  onCreated: (runId: string) => void
  embedded?: boolean
  onBusyChange?: (busy: boolean) => void
}

const STAGE_ACTOR = 'stage-actor'

/**
 * Create a field job from the portal: who does the work, who signs it off, what and where.
 * Mirrors the mobile "New job" form so both surfaces send the same request.
 */
export default function NewJobModal({ opened, onClose, onCreated, embedded = false, onBusyChange }: NewJobModalProps) {
  const env = useContext(EnvContext)
  const backend = env.NEXT_PUBLIC_VC_REPO
  const [members, setMembers] = useState<TeamMember[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [actorsView, setActorsView] = useState<unknown>(null)
  const [loadingSetup, setLoadingSetup] = useState(false)
  const [setupError, setSetupError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const { api: operations } = usePortalOperations()
  const choices = useJobChoices(operations, { branches: FIELD_BRANCH_OPTIONS, problemTypes: FIELD_PROBLEM_TYPES })
  const [form, setForm] = useState({
    storeNumber: '',
    branch: '',
    priority: 'normal',
    vanId: '',
    callOut: false,
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
    if (!opened || !backend) return
    const org = readActiveOrganization()
    const token = getOrgScopedToken() || getPreferredTenantToken()
    if (!org?.orgTenantId || !token) {
      setSetupError('Switch to the organization before creating a job.')
      return
    }
    const headers = { Authorization: `Bearer ${token}` }
    let active = true
    setMembers([])
    setLoadingSetup(true)
    setSetupError(null)
    Promise.all([
      axios.get<TeamMember[]>(`${backend}/api/organizations/${encodeURIComponent(org.orgTenantId)}/members`, {
        headers,
      }),
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
      axios
        .get(`${backend}/api/organizations/${encodeURIComponent(org.orgTenantId)}/workflows/actors`, { headers })
        .catch(() => ({ data: null })),
    ])
      .then(([membersRes, contactsRes, workflowsRes, actorsRes]) => {
        if (!active) return
        setActorsView(actorsRes.data)
        setMembers(enrolledJobMembers(membersRes.data))
        const contactLists = Array.isArray(contactsRes) ? contactsRes : [contactsRes]
        const contactRows = contactLists.flatMap((res: any) => {
          const rows = Array.isArray(res?.data?.contacts) ? res.data.contacts : Array.isArray(res?.data) ? res.data : []
          return rows
        })
        setContacts(
          contactRows
            .filter((c: any) => c?.phone)
            .map((c: any) => ({
              id: String(c.id || c.phone),
              name: String(c.name || 'Contact'),
              phone: String(c.phone),
              ...(c.storeNumber ? { storeNumber: String(c.storeNumber) } : {}),
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
      .catch(() => {
        if (active) setSetupError('Could not load the team and job setup. Close this form and try again.')
      })
      .finally(() => {
        if (active) setLoadingSetup(false)
      })
    return () => {
      active = false
    }
  }, [opened, backend])

  const peopleOptions = useMemo(() => jobPeopleOptions(members), [members])

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
      const assigneeUserId = selectedJobMember(form.assigneeId, members)
      const receiverUserId = selectedJobMember(form.receiverId, members)
      const ref = `FR-${Date.now()}`
      const body: Record<string, unknown> = {
        amount,
        // Only a job that pays a worker or subcontractor has a payout step.
        ...(Number.isFinite(payoutAmount) && payoutAmount > 0 ? { payoutAmount } : {}),
        currency: form.currency,
        ...jobPaymentPlanBody(form),
        description: form.description.trim(),
        requireConcealedWorkPhoto: form.requireConcealedWorkPhoto,
        poNumber: form.poNumber.trim(),
        ...(form.storeNumber.trim() ? { storeNumber: form.storeNumber.trim() } : {}),
        ...(form.branch.trim() ? { branch: form.branch.trim() } : {}),
        priority: form.priority,
        ...(form.priority === 'urgent' ? { callOut: true } : {}),
        ...(form.problemType ? { problemType: form.problemType } : {}),
        ...(form.vanId ? { vanId: form.vanId } : {}),
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
      const res = await axios.post(`${backend}/workflows/${encodeURIComponent(templateId)}/execute`, body, {
        headers,
      })
      if (res.data?.error) throw new Error(String(res.data.error))
      notifications.show({ title: 'Job created', message: 'The worker will see it in their inbox.', color: 'teal' })
      onCreated(String(res.data?.runId || ''))
      setForm((prev) => ({
        ...prev,
        storeNumber: '',
        branch: '',
        priority: 'normal',
        vanId: '',
        callOut: false,
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
          label="Client PO (if provided)"
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
        <Group grow>
          <Autocomplete
            label="Branch"
            placeholder="Choose or enter a branch"
            data={choices.branches}
            value={form.branch}
            onChange={(branch) => setForm({ ...form, branch })}
          />
          <Select
            label="Priority"
            data={FIELD_PRIORITY_OPTIONS}
            value={form.priority}
            allowDeselect={false}
            onChange={(priority) =>
              setForm({ ...form, priority: priority || 'normal', callOut: priority === 'urgent' })
            }
          />
        </Group>
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
          searchable
          data={withCurrent(choices.problemTypes, form.problemType)}
          value={form.problemType || null}
          onChange={(value) => setForm({ ...form, problemType: value || '' })}
        />
        <ContactPickerSelect
          contacts={contacts}
          requirePhone={false}
          label="Pick the client from contacts"
          description="Fills the client name, mobile number and store number."
          onPick={(picked) => {
            if (picked)
              setForm((prev) => ({
                ...prev,
                clientName: picked.name || prev.clientName,
                clientPhone: picked.phone || prev.clientPhone,
                ...(picked.storeNumber ? { storeNumber: picked.storeNumber } : {}),
              }))
          }}
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
        <PhoneField
          surface="portal"
          label="Client mobile number"
          description="The client gets the bill, and any extra-work quote, as a text with a pay link. Leave empty if the client is billed another way."
          value={form.clientPhone}
          onChange={(clientPhone) => setForm({ ...form, clientPhone })}
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
        <JobPaymentPlanFields value={form} onChange={(plan) => setForm({ ...form, ...plan })} />
        <NumberInput
          label="Worker payout (optional)"
          description="Only for a subcontractor or a per-job worker. Leave empty for salaried staff: the job then closes after sign-off with no payout step."
          min={0}
          value={form.payoutAmount}
          onChange={(value) => setForm({ ...form, payoutAmount: value })}
        />
        <Select
          label="Who goes out"
          description="Only active members who completed their invitation are listed."
          searchable
          data={[stageActorOption(actorsView, FIELD_WORKER_STAGE, members), ...peopleOptions]}
          value={form.assigneeId}
          onChange={(value) => setForm({ ...form, assigneeId: value || STAGE_ACTOR })}
        />
        <JobScheduleFields
          api={operations}
          surface="portal"
          storeNumber={form.storeNumber}
          onStoreNumber={(storeNumber) => setForm((prev) => ({ ...prev, storeNumber }))}
          onStorePicked={(store) =>
            setForm((prev) => ({
              ...prev,
              storeNumber: store.storeNumber,
              clientName: prev.clientName || store.name,
              clientPhone: prev.clientPhone || store.phone || '',
              location: prev.location || storeSite(store),
              branch: prev.branch || store.branch || '',
            }))
          }
          vanId={form.vanId || null}
          onVan={(van) =>
            setForm((prev) => ({
              ...prev,
              vanId: van?.id || '',
              vehicleReference: van?.registration || '',
              branch: prev.branch || van?.branch || '',
            }))
          }
          callOut={form.callOut}
          onCallOut={(callOut) => setForm((prev) => ({ ...prev, callOut }))}
          showCallOut={false}
          date={form.scheduledDate}
          assigneeId={form.assigneeId === STAGE_ACTOR ? null : form.assigneeId}
          names={Object.fromEntries(members.map((m) => [m.userId, m.displayName || m.phone || 'Team member']))}
        />
        <Select
          label="Who checks the work"
          description="They review the finished work and confirm it. Not the person who does the job."
          searchable
          data={[stageActorOption(actorsView, FIELD_CHECKER_STAGE, members), ...peopleOptions]}
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
          <Button
            onClick={handleCreate}
            loading={saving || loadingSetup}
            disabled={!templateId || Boolean(setupError) || !backend}
          >
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
      size="lg"
      showClose={!saving}
    >
      <FormCard
        title="New job"
        subtitle="Create a job and send it to the worker. The sign-off person is notified when the work is done."
        issuer={readActiveOrganization()?.name}
        icon={<IconBriefcase size={24} />}
      >
        {content}
      </FormCard>
    </BaseModal>
  )
}
