import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  FileInput,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
  ThemeIcon,
  Title,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconBriefcase, IconFileText, IconInbox, IconShieldCheck } from '@tabler/icons-react'
import { useRouter } from 'next/router'
import AppShellMobile from '@/components/layout/AppShellMobile'
import api from '@/lib/api'
import { getActiveOrgId, getContextMode, getOrgToken, isEmployeeOrgRole } from '@/lib/auth'

interface IntakeAttachment {
  id: string
  filename: string
  mediaType: string
  sizeBytes: number
  sha256: string
}

interface IntakeItem {
  id: string
  status: 'pending' | 'assigning' | 'assigned'
  payload: {
    reference: string
    poNumber?: string
    problemType?: string
    description: string
    clientName?: string
    clientPhone?: string
    location?: string
    scheduledDate?: string
    amount: number
    payoutAmount?: number
    currency: string
    vehicleReference?: string
    requireConcealedWorkPhoto?: boolean
    sourceSender?: string
    sourceSubject?: string
  }
  assignedTo?: string
  workflowRunId?: string
  createdAt: string
  attachments: IntakeAttachment[]
}

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
  const [selected, setSelected] = useState<IntakeItem | null>(null)
  const [items, setItems] = useState<IntakeItem[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [assignees, setAssignees] = useState<Record<string, string | null>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [creating, setCreating] = useState(false)
  const [hasFeptEnabled, setHasFeptEnabled] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [form, setForm] = useState({
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
  const fieldWorkers = useMemo(
    () =>
      members
        .filter((member) => member.status !== 'inactive' && ['field_worker', 'technician', 'driver', 'inspector', 'dispatcher', 'supervisor'].includes(member.role.toLowerCase()))
        .map((member) => ({
          value: member.userId,
          label:
            member.displayName && !/^(organization owner|team member)$/i.test(member.displayName)
              ? `${member.displayName} (${member.role.replace(/_/g, ' ')})`
              : `${member.phone || 'Field worker'} (${member.role.replace(/_/g, ' ')})`,
        })),
    [members],
  )

  const loadItems = useCallback(async () => {
    if (!token || !canUseFeptOps) return
    setLoading(true)
    try {
      const [intakeResponse, membersResponse] = await Promise.all([
        api.get('/api/platform/job-intake', { headers: { Authorization: `Bearer ${token}` } }),
        organizationId
          ? api.get(`/api/organizations/${encodeURIComponent(organizationId)}/members`, {
              headers: { Authorization: `Bearer ${token}` },
            })
          : Promise.resolve({ data: [] }),
      ])
      setItems(Array.isArray(intakeResponse.data?.items) ? intakeResponse.data.items : [])
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
      notifications.show({
        title: 'Could not load job intake',
        message: error.response?.data?.message || error.response?.data?.error || error.message,
        color: 'red',
      })
    } finally {
      setLoading(false)
    }
  }, [token, canUseFeptOps, organizationId])

  useEffect(() => {
    void loadItems()
  }, [loadItems])

  const createIntake = async () => {
    if (!token) return
    if (!form.description.trim() || !form.amount || form.amount <= 0) {
      notifications.show({ title: 'Add job details', message: 'Description and client amount are required.', color: 'orange' })
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
      notifications.show({
        title: 'Job saved to intake',
        message: 'It remains unassigned until a dispatcher chooses a field worker.',
        color: 'teal',
      })
      setCreating(false)
      setFiles([])
      setForm({
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
      await loadItems()
    } catch (error: any) {
      notifications.show({
        title: 'Could not save job intake',
        message: error.response?.data?.message || error.response?.data?.error || error.message,
        color: 'red',
      })
    } finally {
      setSaving(false)
    }
  }

  const assignJob = async (item: IntakeItem) => {
    if (!token) return
    const assigneeId = assignees[item.id]
    if (!assigneeId) {
      notifications.show({ title: 'Choose a field worker', message: 'Select an active team member first.', color: 'orange' })
      return
    }
    setSelected(item)
    try {
      const result = await api.post(
        `/api/platform/job-intake/${encodeURIComponent(item.id)}/assign`,
        { assigneeId },
        { headers: { Authorization: `Bearer ${token}` } },
      )
      notifications.show({
        title: 'Job assigned',
        message: 'The FEPT job card is ready for the assigned worker.',
        color: 'teal',
      })
      await loadItems()
      if (result.data?.runId) await router.push(`/finance?tab=field&runId=${encodeURIComponent(result.data.runId)}`)
    } catch (error: any) {
      notifications.show({
        title: 'Could not assign job',
        message: error.response?.data?.message || error.response?.data?.error || error.message,
        color: 'red',
      })
    } finally {
      setSelected(null)
    }
  }

  const openAttachment = async (item: IntakeItem, attachment: IntakeAttachment) => {
    if (!token) return
    try {
      const response = await api.get(
        `/api/platform/job-intake/${encodeURIComponent(item.id)}/attachments/${encodeURIComponent(attachment.id)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      const raw = atob(String(response.data.dataBase64 || ''))
      const bytes = new Uint8Array(raw.length)
      for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index)
      const url = URL.createObjectURL(new Blob([bytes], { type: response.data.mediaType }))
      const link = document.createElement('a')
      link.href = url
      link.download = response.data.filename || attachment.filename
      link.rel = 'noopener'
      link.click()
      URL.revokeObjectURL(url)
    } catch (error: any) {
      notifications.show({
        title: 'Could not open source document',
        message: error.response?.data?.message || error.response?.data?.error || error.message,
        color: 'red',
      })
    }
  }

  return (
    <AppShellMobile>
      <Box>
        {!canUseFeptOps && (
          <Box p="md">
            <Alert icon={<IconShieldCheck size={18} />} color="gray" title="Unavailable">
              This FEPT operational intake view is only available to organization employees when field execution workflow is active.
            </Alert>
          </Box>
        )}

        {canUseFeptOps && (
          <>
            <Box
              p="md"
              style={{
                background: 'rgba(255,255,255,0.74)',
                borderBottom: '1px solid rgba(148,163,184,0.2)',
                backdropFilter: 'blur(12px) saturate(150%)',
              }}
            >
              <Group justify="space-between">
                <Box>
                  <Title order={3}>Operational Intake</Title>
                  <Text size="sm" c="dimmed">Save incoming work before dispatching it to a field worker</Text>
                </Box>
                <ThemeIcon size="xl" radius="md" variant="light" color="teal">
                  <IconInbox size={24} />
                </ThemeIcon>
              </Group>
              <Group mt="sm">
                <Button onClick={() => setCreating(true)}>Add job intake</Button>
                <Button variant="light" onClick={() => void loadItems()} loading={loading}>Refresh</Button>
              </Group>
            </Box>

            <Stack gap="sm" p="md">
              {items.map((item) => (
                <Card key={item.id} withBorder radius="md" p="sm">
                  <Group justify="space-between" align="flex-start" wrap="nowrap">
                    <Box style={{ flex: 1, minWidth: 0 }}>
                      <Group gap={6} mb={4}>
                        <Badge size="xs" variant="light" color={item.status === 'assigned' ? 'teal' : 'orange'}>
                          {item.status === 'assigned' ? 'Assigned' : item.status === 'assigning' ? 'Assigning' : 'Pending assignment'}
                        </Badge>
                        <Text size="xs" c="dimmed">{new Date(item.createdAt).toLocaleDateString()}</Text>
                      </Group>
                      <Text fw={600} size="sm">{item.payload.reference}</Text>
                      {item.payload.poNumber && <Text size="xs" c="dimmed">Client PO: {item.payload.poNumber}</Text>}
                      <Text size="sm" lineClamp={2}>{item.payload.description}</Text>
                      <Text size="xs" c="dimmed">{[item.payload.clientName, item.payload.location].filter(Boolean).join(' · ')}</Text>
                      {item.payload.sourceSubject && <Text size="xs" c="dimmed">{item.payload.sourceSubject}</Text>}
                      {item.attachments.length > 0 && (
                        <Group gap={4} mt={6}>
                          {item.attachments.map((attachment) => (
                            <Button
                              key={attachment.id}
                              size="compact-xs"
                              variant="subtle"
                              leftSection={<IconFileText size={13} />}
                              onClick={() => void openAttachment(item, attachment)}
                            >
                              {attachment.filename}
                            </Button>
                          ))}
                        </Group>
                      )}
                    </Box>
                    <Box ta="right">
                      <Text fw={700} c="teal">{item.payload.amount} {item.payload.currency}</Text>
                    </Box>
                  </Group>
                  {item.status !== 'assigned' && (
                    <Group mt="sm" align="flex-end">
                      <Select
                        label="Assign worker"
                        placeholder={fieldWorkers.length ? 'Choose a field worker' : 'No field workers available'}
                        data={fieldWorkers}
                        value={assignees[item.id] || null}
                        onChange={(value) => setAssignees((current) => ({ ...current, [item.id]: value }))}
                        searchable
                        style={{ flex: 1 }}
                      />
                      <Button
                        leftSection={<IconBriefcase size={15} />}
                        disabled={!fieldWorkers.length || item.status === 'assigning'}
                        loading={selected?.id === item.id}
                        onClick={() => void assignJob(item)}
                      >
                        Start job
                      </Button>
                    </Group>
                  )}
                </Card>
              ))}
              {!loading && items.length === 0 && (
                <Card withBorder ta="center" p="xl">
                  <Text c="dimmed">No jobs are waiting in intake. Add a job from a client order or PO.</Text>
                </Card>
              )}
            </Stack>

            <Modal opened={creating} onClose={() => setCreating(false)} title="Add job to intake" centered>
              <Stack gap="sm">
                <Alert color="blue" icon={<IconShieldCheck size={16} />}>
                  This saves the job as unassigned. Assignment starts the existing FEPT workflow and notifies the selected worker.
                </Alert>
                <TextInput
                  label="Client PO / store number (optional)"
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
                <TextInput
                  label="Client phone"
                  value={form.clientPhone}
                  onChange={(event) => setForm((current) => ({ ...current, clientPhone: event.currentTarget.value }))}
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
                <TextInput
                  label="Vehicle reference (optional)"
                  value={form.vehicleReference}
                  onChange={(event) => setForm((current) => ({ ...current, vehicleReference: event.currentTarget.value }))}
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
                  <Button loading={saving} onClick={() => void createIntake()}>Save unassigned job</Button>
                </Group>
              </Stack>
            </Modal>
          </>
        )}
      </Box>
    </AppShellMobile>
  )
}
