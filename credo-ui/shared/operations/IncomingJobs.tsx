import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Badge, Button, Checkbox, Group, NumberInput, Paper, Select, Stack, Text } from '@mantine/core'
import { IconBriefcase, IconFileText, IconMail, IconRefresh } from '@tabler/icons-react'

import { JobScheduleFields } from './JobScheduleFields'
import { readableDate, type IntakeItem, type MailStatus, type OperationsApi } from './operationsApi'

export interface IncomingJobsMember {
  userId: string
  role: string
  displayName?: string
  phone?: string
  status?: string
}

const FIELD_ROLES = ['field_worker', 'technician', 'driver', 'inspector', 'dispatcher', 'supervisor']

/**
 * Jobs that came in by email or were saved by hand and are not booked yet. Booking one picks the
 * worker and the van, shows what else is booked for the store, and starts the job.
 */
export function IncomingJobs({
  api,
  surface,
  members,
  notify,
  onStarted,
  refreshKey,
  /** Mailbox status only: the jobs themselves are listed with the other jobs. */
  mailboxOnly,
  /** Open the booking form for this one waiting job. */
  focusId,
}: {
  api: OperationsApi | null
  surface: 'portal' | 'phone'
  members: IncomingJobsMember[]
  notify: (message: string, tone: 'success' | 'error' | 'info') => void
  onStarted?: (runId: string) => void
  refreshKey?: number
  mailboxOnly?: boolean
  focusId?: string | null
}) {
  const [items, setItems] = useState<IntakeItem[]>([])
  const [mail, setMail] = useState<MailStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [draft, setDraft] = useState<{ assigneeId: string | null; vanId: string | null; amount: number | string; confirmRepeat: boolean }>({
    assigneeId: null,
    vanId: null,
    amount: '',
    confirmRepeat: false,
  })
  const [starting, setStarting] = useState(false)
  const size = surface === 'phone' ? 'md' : 'sm'

  const names = useMemo(
    () =>
      Object.fromEntries(
        members.map((member) => [
          member.userId,
          member.displayName && !/^(organization owner|team member)$/i.test(member.displayName)
            ? member.displayName
            : member.phone || 'Team member',
        ]),
      ),
    [members],
  )
  const workers = useMemo(
    () =>
      members
        .filter((member) => member.status !== 'inactive' && FIELD_ROLES.includes(member.role.toLowerCase()))
        .map((member) => ({ value: member.userId, label: `${names[member.userId]} (${member.role.replace(/_/g, ' ')})` })),
    [members, names],
  )

  const load = useCallback(async () => {
    if (!api) return
    setLoading(true)
    try {
      const [rows, status] = await Promise.all([api.intakes(), api.mailStatus().catch(() => null)])
      setItems(rows.filter((item) => item.status !== 'assigned'))
      setMail(status)
      setLoaded(true)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not load incoming jobs', 'error')
    } finally {
      setLoading(false)
    }
  }, [api, notify])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  useEffect(() => {
    if (focusId) setOpen(focusId)
  }, [focusId])

  const readMailbox = async () => {
    if (!api) return
    setSyncing(true)
    try {
      const result = await api.mailSync()
      if (result.error) notify(result.error, 'error')
      else notify(result.imported || result.repeats ? `${result.imported + result.repeats} new job email(s) saved` : 'No new job emails', 'success')
      await load()
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not read the mailbox', 'error')
    } finally {
      setSyncing(false)
    }
  }

  const openAttachment = async (item: IntakeItem, attachmentId: string) => {
    if (!api) return
    try {
      const file = await api.intakeAttachment(item.id, attachmentId)
      const raw = atob(file.dataBase64 || '')
      const bytes = new Uint8Array(raw.length)
      for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index)
      const url = URL.createObjectURL(new Blob([bytes], { type: file.mediaType }))
      const link = document.createElement('a')
      link.href = url
      link.download = file.filename
      link.rel = 'noopener'
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not open the document', 'error')
    }
  }

  const startJob = async (item: IntakeItem) => {
    if (!api || !draft.assigneeId) {
      notify('Choose who goes out first.', 'info')
      return
    }
    setStarting(true)
    try {
      const amount = Number(draft.amount)
      const result = await api.assignIntake(item.id, {
        assigneeId: draft.assigneeId,
        ...(draft.vanId ? { vanId: draft.vanId } : {}),
        ...(Number.isFinite(amount) && amount > 0 ? { amount } : {}),
        ...(item.duplicateOf ? { confirmRepeat: draft.confirmRepeat } : {}),
      })
      notify('Job booked. The worker has it in their inbox.', 'success')
      setOpen(null)
      await load()
      if (result.runId) onStarted?.(result.runId)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not book the job', 'error')
    } finally {
      setStarting(false)
    }
  }

  return (
    <Stack gap="sm">
      {!focusId && <Group justify="space-between" wrap="nowrap" align="center">
        <Text size="sm" c="dimmed" style={{ flex: 1 }}>
          {mail?.connected
            ? `Jobs mailbox ${mail.mailbox}: read ${mail.lastReadAt ? readableDate(mail.lastReadAt) : 'not yet'}`
            : 'The jobs mailbox is not connected yet. Jobs added by hand go straight onto the Jobs list.'}
        </Text>
        <Group gap="xs" wrap="nowrap">
          {mail?.connected && (
            <Button size={size} variant="light" leftSection={<IconMail size={18} />} loading={syncing} onClick={() => void readMailbox()}>
              Read mailbox
            </Button>
          )}
          <Button size={size} variant="subtle" leftSection={<IconRefresh size={18} />} loading={loading} onClick={() => void load()}>
            Refresh
          </Button>
        </Group>
      </Group>}
      {!focusId && mail?.lastError && (
        <Alert color="orange" variant="light" title="The mailbox could not be read">
          {mail.lastError}
        </Alert>
      )}
      {(mailboxOnly ? [] : items.filter((item) => !focusId || item.id === focusId)).map((item) => {
        const payload = item.payload
        const needsAmount = !(Number(payload.amount) > 0)
        const isOpen = open === item.id
        return (
          <Paper key={item.id} withBorder radius="md" p="md">
            <Group gap={6} mb={6}>
              <Badge variant="light" color={payload.sourceType === 'email' ? 'blue' : payload.sourceType === 'import' ? 'cyan' : 'gray'} leftSection={payload.sourceType === 'email' ? <IconMail size={12} /> : undefined}>
                {payload.sourceType === 'email' ? 'From email' : payload.sourceType === 'import' ? 'From the old system' : 'Added by hand'}
              </Badge>
              {item.duplicateOf && (
                <Badge variant="light" color="red">
                  Possible repeat
                </Badge>
              )}
              {payload.callOut && (
                <Badge variant="filled" color="red">
                  Urgent
                </Badge>
              )}
              {item.status === 'assigning' && (
                <Badge variant="light" color="yellow">
                  Being booked
                </Badge>
              )}
              <Text size="xs" c="dimmed">
                {readableDate(item.createdAt)}
              </Text>
            </Group>
            <Text fw={500}>{[payload.storeNumber ? `Store ${payload.storeNumber}` : 'No store number', payload.poNumber ? `PO ${payload.poNumber}` : ''].filter(Boolean).join(' · ')}</Text>
            <Text size="sm" lineClamp={3}>
              {payload.description}
            </Text>
            <Text size="xs" c="dimmed">
              {[payload.clientName, payload.location, payload.scheduledDate ? `wanted ${readableDate(payload.scheduledDate)}` : ''].filter(Boolean).join(' · ')}
            </Text>
            {payload.sourceType === 'import' && (payload.importedWorkerName || payload.importedDetails?.oldStatus) && (
              <Text size="xs" c="dimmed">
                {[payload.importedDetails?.oldStatus ? `Old system: ${payload.importedDetails.oldStatus}` : '', payload.importedWorkerName ? `worker ${payload.importedWorkerName}` : ''].filter(Boolean).join(' · ')}
              </Text>
            )}
            {payload.sourceSubject && (
              <Text size="xs" c="dimmed" lineClamp={1}>
                Email: {payload.sourceSubject}
                {payload.sourceSender ? ` (${payload.sourceSender})` : ''}
              </Text>
            )}
            {item.attachments.length > 0 && (
              <Group gap={4} mt={6}>
                {item.attachments.map((attachment) => (
                  <Button
                    key={attachment.id}
                    size={surface === 'phone' ? 'sm' : 'compact-sm'}
                    variant="subtle"
                    leftSection={<IconFileText size={16} />}
                    onClick={() => void openAttachment(item, attachment.id)}
                  >
                    {attachment.filename}
                  </Button>
                ))}
              </Group>
            )}
            {item.status === 'pending' && !isOpen && (
              <Group justify="flex-end" mt="sm">
                <Button
                  size={size}
                  radius="xl"
                  leftSection={<IconBriefcase size={18} />}
                  onClick={() => {
                    setOpen(item.id)
                    setDraft({ assigneeId: null, vanId: payload.vanId || null, amount: needsAmount ? '' : payload.amount, confirmRepeat: false })
                  }}
                >
                  Book this job
                </Button>
              </Group>
            )}
            {isOpen && (
              <Stack gap="sm" mt="sm">
                {item.duplicateOf && (
                  <Alert color="red" variant="light" title="This may already be booked">
                    Store {payload.storeNumber} already has job {payload.poNumber}. Open the store to compare before booking it again.
                    <Checkbox
                      mt="xs"
                      size={size}
                      label="I checked: this is a separate job"
                      checked={draft.confirmRepeat}
                      onChange={(event) => setDraft({ ...draft, confirmRepeat: event.currentTarget.checked })}
                    />
                  </Alert>
                )}
                <Select
                  size={size}
                  label="Who goes out"
                  placeholder={workers.length ? 'Choose a worker' : 'No field workers on the team yet'}
                  data={workers}
                  searchable
                  value={draft.assigneeId}
                  onChange={(value) => setDraft({ ...draft, assigneeId: value })}
                />
                <JobScheduleFields
                  api={api}
                  surface={surface}
                  storeNumber={payload.storeNumber || ''}
                  showStore={false}
                  showCallOut={false}
                  vanId={draft.vanId}
                  onVan={(van) => setDraft({ ...draft, vanId: van?.id || null })}
                  date={payload.scheduledDate}
                  assigneeId={draft.assigneeId}
                  names={names}
                  excludeIntakeId={item.id}
                />
                {needsAmount && (
                  <NumberInput
                    size={size}
                    label={`Amount to invoice the client (${payload.currency})`}
                    description="The email did not say. The client is billed this after sign-off."
                    min={0}
                    value={draft.amount}
                    onChange={(value) => setDraft({ ...draft, amount: value })}
                  />
                )}
                <Group justify="flex-end">
                  <Button size={size} variant="default" radius="xl" onClick={() => setOpen(null)}>
                    Cancel
                  </Button>
                  <Button
                    size={size}
                    radius="xl"
                    loading={starting}
                    disabled={!draft.assigneeId || (Boolean(item.duplicateOf) && !draft.confirmRepeat)}
                    onClick={() => void startJob(item)}
                  >
                    Start job
                  </Button>
                </Group>
              </Stack>
            )}
          </Paper>
        )
      })}
      {loaded && !loading && !mailboxOnly && !focusId && items.length === 0 && mail?.connected && (
        <Text size="sm" c="dimmed">
          Nothing to check. New jobs from email, imports and by hand go straight onto the Jobs list.
        </Text>
      )}
    </Stack>
  )
}
