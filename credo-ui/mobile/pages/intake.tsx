import React, { useCallback, useEffect, useState } from 'react'
import { PhoneField } from '../../shared/PhoneField'
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FileInput,
  Group,
  NumberInput,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
  ThemeIcon,
  Title,
} from '@mantine/core'
import { IconInbox, IconShieldCheck } from '@tabler/icons-react'
import { useRouter } from 'next/router'
import AppShellMobile from '@/components/layout/AppShellMobile'
import BottomSheet from '@/components/shared/BottomSheet'
import api from '@/lib/api'
import { getActiveOrgId, getContextMode, getOrgToken, isEmployeeOrgRole } from '@/lib/auth'
import { usePhoneOperations } from '@/lib/operations'
import { IncomingJobs } from '../../shared/operations/IncomingJobs'
import { JobAttention } from '../../shared/operations/JobAttention'
import { JobScheduleFields } from '../../shared/operations/JobScheduleFields'

interface Member {
  userId: string
  role: string
  displayName?: string
  phone?: string
  status?: string
}

const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain'])

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const value = String(reader.result || '')
      const comma = value.indexOf(',')
      if (comma < 0) reject(new Error('The selected file could not be read'))
      else resolve(value.slice(comma + 1))
    }
    reader.onerror = () => reject(reader.error || new Error('The selected file could not be read'))
    reader.readAsDataURL(file)
  })
}

export default function IntakePage() {
  const router = useRouter()
  const { api: operations, notify } = usePhoneOperations()
  const [refreshKey, setRefreshKey] = useState(0)
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [creating, setCreating] = useState(false)
  const [hasFeptEnabled, setHasFeptEnabled] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [form, setForm] = useState({
    storeNumber: '',
    callOut: false,
    vanId: '',
    poNumber: '',
    problemType: '',
    description: '',
    clientName: '',
    clientPhone: '',
    location: '',
    scheduledDate: '',
    amount: 0,
    payoutAmount: 0,
    currency: 'USD',
    vehicleReference: '',
    requireConcealedWorkPhoto: false,
  })

  useEffect(() => {
    try {
      const raw = localStorage.getItem('credoActiveWorkflowTypes')
      const workflows = raw ? JSON.parse(raw) : []
      setHasFeptEnabled(
        Array.isArray(workflows) &&
          workflows.some((workflow: unknown) => {
            const value = String(workflow || '').toLowerCase()
            return value.includes('field') || value.includes('fept')
          }),
      )
    } catch {
      setHasFeptEnabled(false)
    }
  }, [])

  const canUseFeptOps = getContextMode() === 'org' && !!getActiveOrgId() && isEmployeeOrgRole() && hasFeptEnabled
  const token = getOrgToken()
  const organizationId = getActiveOrgId()
  const loadItems = useCallback(async () => {
    if (!token || !canUseFeptOps || !organizationId) return
    setLoading(true)
    try {
      const membersResponse = await api.get(`/api/organizations/${encodeURIComponent(organizationId)}/members`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const rows = Array.isArray(membersResponse.data) ? membersResponse.data : []
      setMembers(
        rows
          .filter((member: any) => member?.userId)
          .map((member: any) => ({
            userId: String(member.userId),
            role: String(member.role || 'member'),
            displayName: member.displayName ? String(member.displayName) : undefined,
            phone: member.phone ? String(member.phone) : undefined,
            status: member.status ? String(member.status) : undefined,
          })),
      )
    } catch (error: any) {
      notify(error.response?.data?.message || error.response?.data?.error || error.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [token, canUseFeptOps, organizationId, notify])

  useEffect(() => {
    void loadItems()
  }, [loadItems])

  const createIntake = async () => {
    if (!token) return
    if (!form.description.trim() || !form.amount || form.amount <= 0) {
      notify('Add what the job is and the client amount.', 'error')
      return
    }
    setSaving(true)
    try {
      if (files.length > 6 || files.reduce((total, file) => total + file.size, 0) > 20 * 1024 * 1024) {
        throw new Error('Choose up to 6 source files with a combined size below 20 MB.')
      }
      const attachments = await Promise.all(
        files.map(async (file) => {
          if (!ALLOWED_TYPES.has(file.type) || file.size > 5 * 1024 * 1024) {
            throw new Error(`${file.name} must be a PDF, image or text file smaller than 5 MB.`)
          }
          return { filename: file.name, mediaType: file.type, contentBase64: await toBase64(file) }
        }),
      )
      await api.post(
        '/api/platform/job-intake',
        {
          ...form,
          amount: Number(form.amount),
          ...(form.payoutAmount > 0 ? { payoutAmount: Number(form.payoutAmount) } : {}),
          storeNumber: form.storeNumber.trim() || undefined,
          callOut: form.callOut,
          vanId: form.vanId || undefined,
          poNumber: form.poNumber.trim() || undefined,
          problemType: form.problemType.trim() || undefined,
          description: form.description.trim(),
          clientName: form.clientName.trim() || undefined,
          clientPhone: form.clientPhone.trim() || undefined,
          location: form.location.trim() || undefined,
          scheduledDate: form.scheduledDate || undefined,
          vehicleReference: form.vehicleReference.trim() || undefined,
          requireConcealedWorkPhoto: form.requireConcealedWorkPhoto,
          attachments,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      )
      notify('Job saved. It waits here until someone books a worker for it.', 'success')
      setCreating(false)
      setFiles([])
      setForm({
        storeNumber: '',
        callOut: false,
        vanId: '',
        poNumber: '',
        problemType: '',
        description: '',
        clientName: '',
        clientPhone: '',
        location: '',
        scheduledDate: '',
        amount: 0,
        payoutAmount: 0,
        currency: 'USD',
        vehicleReference: '',
        requireConcealedWorkPhoto: false,
      })
      setRefreshKey((key) => key + 1)
    } catch (error: any) {
      notify(error.response?.data?.message || error.response?.data?.error || error.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppShellMobile>
      <Box>
        {!canUseFeptOps && (
          <Box p="md">
            <Alert icon={<IconShieldCheck size={18} />} color="gray" title="Unavailable">
              Incoming jobs are for team members of an organisation that runs field jobs.
            </Alert>
          </Box>
        )}

        {canUseFeptOps && (
          <>
            <Box
              p="md"
              style={{ background: 'var(--mantine-color-body)', borderBottom: '1px solid var(--mantine-color-default-border)' }}
            >
              <Group justify="space-between">
                <Box>
                  <Title order={3} fw={500}>Waiting to be booked</Title>
                  <Text size="sm" c="dimmed">Jobs from the jobs mailbox and jobs saved by hand, before a worker is booked</Text>
                </Box>
                <ThemeIcon size={48} radius="md" variant="light" color="credentis">
                  <IconInbox size={24} />
                </ThemeIcon>
              </Group>
              <Group mt="sm">
                <Button size="md" radius="xl" onClick={() => setCreating(true)}>Add a job</Button>
                <Button size="md" radius="xl" variant="light" loading={loading} onClick={() => void router.push('/registers')}>Stores & vans</Button>
              </Group>
            </Box>

            <Box p="md" pb={0}>
              <Title order={4} fw={500} mb="xs">Needs attention</Title>
              <JobAttention
                api={operations}
                surface="phone"
                members={members}
                notify={notify}
                refreshKey={refreshKey}
                onOpenJob={(runId) => void router.push(`/finance?tab=field&runId=${encodeURIComponent(runId)}`)}
              />
            </Box>

            <Box p="md">
              <IncomingJobs
                api={operations}
                surface="phone"
                members={members}
                notify={notify}
                refreshKey={refreshKey}
                onStarted={(runId) => void router.push(`/finance?tab=field&runId=${encodeURIComponent(runId)}`)}
              />
            </Box>

            <BottomSheet opened={creating} onClose={() => setCreating(false)} title="Add a job">
              <Stack gap="sm">
                <Alert color="credentis" icon={<IconShieldCheck size={16} />}>
                  The job waits under Waiting to be booked. Booking it sends it to the worker you choose.
                </Alert>
                <JobScheduleFields
                  api={operations}
                  surface="phone"
                  storeNumber={form.storeNumber}
                  onStoreNumber={(storeNumber) => setForm((current) => ({ ...current, storeNumber }))}
                  onStorePicked={(store) =>
                    setForm((current) => ({
                      ...current,
                      storeNumber: store.storeNumber,
                      clientName: current.clientName || store.name,
                      clientPhone: current.clientPhone || store.phone || '',
                    }))
                  }
                  vanId={form.vanId || null}
                  onVan={(van) => setForm((current) => ({ ...current, vanId: van?.id || '', vehicleReference: van?.registration || '' }))}
                  callOut={form.callOut}
                  onCallOut={(callOut) => setForm((current) => ({ ...current, callOut }))}
                  date={form.scheduledDate}
                />
                <TextInput
                  label="Client PO (optional)"
                  value={form.poNumber}
                  onChange={(event) => setForm((current) => ({ ...current, poNumber: event.currentTarget.value }))}
                />
                <TextInput
                  label="Problem type"
                  value={form.problemType}
                  onChange={(event) => setForm((current) => ({ ...current, problemType: event.currentTarget.value }))}
                />
                <Textarea
                  label="What needs to be done"
                  required
                  value={form.description}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.currentTarget.value }))}
                />
                <TextInput
                  label="Client"
                  value={form.clientName}
                  onChange={(event) => setForm((current) => ({ ...current, clientName: event.currentTarget.value }))}
                />
                <PhoneField
                  surface="phone"
                  label="Client phone"
                  value={form.clientPhone}
                  onChange={(clientPhone) => setForm((current) => ({ ...current, clientPhone }))}
                />
                <TextInput
                  label="Site / location"
                  value={form.location}
                  onChange={(event) => setForm((current) => ({ ...current, location: event.currentTarget.value }))}
                />
                <TextInput
                  label="Scheduled date"
                  type="date"
                  value={form.scheduledDate}
                  onChange={(event) => setForm((current) => ({ ...current, scheduledDate: event.currentTarget.value }))}
                />
                <Checkbox
                  label="Require a photo before work is covered"
                  description="The worker will take a live, location-sealed photo of work that will be hidden."
                  checked={form.requireConcealedWorkPhoto}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, requireConcealedWorkPhoto: event.currentTarget.checked }))
                  }
                />
                <Group grow>
                  <NumberInput
                    label="Client amount"
                    min={0}
                    decimalScale={2}
                    value={form.amount}
                    onChange={(value) => setForm((current) => ({ ...current, amount: typeof value === 'number' ? value : 0 }))}
                    required
                  />
                  <Select
                    label="Currency"
                    data={['USD', 'ZWL', 'ZAR']}
                    value={form.currency}
                    onChange={(value) => setForm((current) => ({ ...current, currency: value || 'USD' }))}
                  />
                </Group>
                <NumberInput
                  label="Worker / subcontractor payout (optional)"
                  min={0}
                  decimalScale={2}
                  value={form.payoutAmount}
                  onChange={(value) =>
                    setForm((current) => ({ ...current, payoutAmount: typeof value === 'number' ? value : 0 }))
                  }
                />
                <FileInput
                  label="PO or source documents (optional)"
                  description="PDF, JPEG, PNG, WebP or text; up to 6 files, 5 MB each and 20 MB total."
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.txt,application/pdf,image/jpeg,image/png,image/webp,text/plain"
                  multiple
                  value={files}
                  onChange={(value) => setFiles(value || [])}
                  clearable
                />
                <Group justify="flex-end">
                  <Button variant="default" onClick={() => setCreating(false)}>Cancel</Button>
                  <Button loading={saving} onClick={() => void createIntake()}>Save job</Button>
                </Group>
              </Stack>
            </BottomSheet>
          </>
        )}
      </Box>
    </AppShellMobile>
  )
}
