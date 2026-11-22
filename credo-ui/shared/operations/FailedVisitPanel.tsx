import { useState } from 'react'
import { Alert, Button, Group, Paper, Select, Stack, Text, TextInput, Textarea } from '@mantine/core'
import { IconAlertTriangle, IconCalendarRepeat, IconCircleX } from '@tabler/icons-react'

import {
  FAILED_VISIT_REASONS,
  failedVisitReasonLabel,
  failedVisitsOf,
  openFailedVisit,
} from '../../../src/config/failedVisit'
import { JobScheduleFields } from './JobScheduleFields'
import { readableDate, type OperationsApi } from './operationsApi'

/** Steps where the worker is out on the job and the visit can still fail. Mirrors the server's list. */
const NOT_ON_SITE_STEPS = new Set([
  'await_assignment',
  'await_job_price',
  'await_completion_review',
  'await_acknowledgement',
  'await_payout_release',
])

export function visitCanFail(job: { status?: string; output?: any } | null | undefined): boolean {
  const state = job?.output || {}
  const pauseReason = String(state.pauseReason || '').toLowerCase()
  const stage = String(state.workflowStage || '').toUpperCase()
  return (
    String(job?.status || '').toLowerCase() === 'paused' &&
    !['COMPLETED', 'CANCELLED', 'REVOKED'].includes(stage) &&
    pauseReason.startsWith('await_') &&
    !NOT_ON_SITE_STEPS.has(pauseReason) &&
    !openFailedVisit(state)
  )
}

/**
 * A visit the worker could not finish, and its re-booking. The worker (or the office for them)
 * says why; whoever books jobs gives it a new date, and optionally another worker or van.
 * Same panel on the website job drawer and the phone job sheet.
 */
export function FailedVisitPanel({
  api,
  surface,
  job,
  canReport,
  canRebook,
  people = [],
  names = {},
  notify,
  onChanged,
}: {
  api: OperationsApi | null
  surface: 'portal' | 'phone'
  job: { id: string; status?: string; output?: any; input?: any }
  canReport: boolean
  canRebook: boolean
  /** Workers the job can be moved to, as Select options. */
  people?: Array<{ value: string; label: string }>
  names?: Record<string, string>
  notify: (message: string, tone: 'success' | 'error' | 'info') => void
  onChanged: () => void
}) {
  const state = job.output || {}
  const input = state.workflowInput || job.input || {}
  const visits = failedVisitsOf(state)
  const open = openFailedVisit(state)
  const currentAssignee = String(state.assignment?.assigneeId || input.assigneeId || '')
  const size = surface === 'phone' ? 'md' : 'sm'
  const touch = surface === 'phone' ? { minHeight: 48 } : undefined

  const [reporting, setReporting] = useState(false)
  const [reason, setReason] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [date, setDate] = useState('')
  const [assignee, setAssignee] = useState<string | null>(currentAssignee || null)
  const [vanId, setVanId] = useState<string | null>(input.vanId || null)
  const [rebookNote, setRebookNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nameOf = (userId?: string) => (userId ? names[userId] || 'A team member' : 'Someone')
  const canFail = canReport && visitCanFail(job)
  if (!open && visits.length === 0 && !canFail) return null

  const report = async () => {
    if (!api || !reason) return
    setBusy(true)
    setError(null)
    try {
      await api.reportFailedVisit(job.id, { reason, note: note.trim() || undefined })
      notify('The office has been told the visit failed.', 'success')
      setReporting(false)
      setReason(null)
      setNote('')
      onChanged()
    } catch (err: any) {
      setError(err?.message || 'Could not record the failed visit.')
    } finally {
      setBusy(false)
    }
  }

  const rebook = async () => {
    if (!api || !open || !date) return
    setBusy(true)
    setError(null)
    try {
      await api.rebookFailedVisit(job.id, open.id, {
        scheduledDate: date,
        assigneeUserId: assignee && assignee !== currentAssignee ? assignee : undefined,
        vanId: vanId || undefined,
        note: rebookNote.trim() || undefined,
      })
      notify(`Re-booked for ${readableDate(date)}.`, 'success')
      setDate('')
      setRebookNote('')
      onChanged()
    } catch (err: any) {
      setError(err?.message || 'Could not re-book the job.')
    } finally {
      setBusy(false)
    }
  }

  const reportForm = (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        The job stops here until the office gives it a new date. Nothing you already recorded is lost.
      </Text>
      <Select<string>
        size={size}
        label="Why could the visit not be finished?"
        placeholder="Choose a reason"
        data={FAILED_VISIT_REASONS.map((item) => ({ value: item.code, label: item.label }))}
        value={reason}
        onChange={setReason}
        comboboxProps={{ withinPortal: true, zIndex: 1000 }}
      />
      <Textarea
        size={size}
        label={reason === 'other' ? 'What stopped the visit?' : 'Anything the office should know (optional)'}
        autosize
        minRows={2}
        maxLength={1000}
        value={note}
        onChange={(event) => setNote(event.currentTarget.value)}
      />
      {error && (
        <Alert color="red" variant="light">
          {error}
        </Alert>
      )}
      <Button
        size={size}
        radius="xl"
        color="red"
        style={touch}
        loading={busy}
        disabled={!reason || (reason === 'other' && !note.trim())}
        onClick={report}
      >
        Record failed visit
      </Button>
    </Stack>
  )

  return (
    <Paper withBorder radius="md" p={surface === 'phone' ? 'md' : 'sm'}>
      <Stack gap="sm">
        <Text fw={500} size={size}>
          Visits
        </Text>

        {open && (
          <Alert color="red" variant="light" icon={<IconAlertTriangle size={20} />} title={`Visit failed · ${failedVisitReasonLabel(open.reason)}`}>
            <Stack gap={4}>
              {open.note && <Text size="sm">{open.note}</Text>}
              <Text size="xs" c="dimmed">
                {nameOf(open.by)} · {readableDate(open.at)}. {canRebook ? 'Give it a new date below.' : 'Waiting for the office to re-book it.'}
              </Text>
            </Stack>
          </Alert>
        )}

        {open && canRebook && (
          <Stack gap="sm">
            <TextInput
              size={size}
              type="date"
              label="New date"
              value={date}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(event) => setDate(event.currentTarget.value)}
            />
            {people.length > 0 && (
              <Select<string>
                size={size}
                label="Who goes"
                data={people}
                value={assignee}
                onChange={setAssignee}
                searchable
                comboboxProps={{ withinPortal: true, zIndex: 1000 }}
              />
            )}
            <JobScheduleFields
              api={api}
              surface={surface}
              storeNumber={String(input.storeNumber || '')}
              vanId={vanId}
              onVan={(van) => setVanId(van?.id || null)}
              date={date || undefined}
              assigneeId={assignee}
              excludeRunId={job.id}
              names={names}
              showStore={false}
              showCallOut={false}
            />
            <TextInput
              size={size}
              label="Note for the worker (optional)"
              maxLength={1000}
              value={rebookNote}
              onChange={(event) => setRebookNote(event.currentTarget.value)}
            />
            {error && (
              <Alert color="red" variant="light">
                {error}
              </Alert>
            )}
            <Button
              size={size}
              radius="xl"
              leftSection={<IconCalendarRepeat size={20} />}
              style={touch}
              loading={busy}
              disabled={!date}
              onClick={rebook}
            >
              Re-book job
            </Button>
          </Stack>
        )}

        {visits
          .filter((visit) => visit.status === 'rebooked')
          .reverse()
          .map((visit) => (
            <Group key={visit.id} gap="sm" wrap="nowrap" align="flex-start">
              <IconCircleX size={20} color="var(--mantine-color-red-6)" style={{ flexShrink: 0, marginTop: 2 }} />
              <Stack gap={0} style={{ minWidth: 0 }}>
                <Text size="sm">
                  Visit failed {readableDate(visit.at)}: {failedVisitReasonLabel(visit.reason)}
                  {visit.note ? ` (${visit.note})` : ''}
                </Text>
                <Text size="xs" c="dimmed">
                  Re-booked for {readableDate(visit.rebookedFor)}
                  {visit.rebookedTo ? ` with ${nameOf(visit.rebookedTo)}` : ''} by {nameOf(visit.rebookedBy)}
                  {visit.rebookNote ? `: ${visit.rebookNote}` : ''}
                </Text>
              </Stack>
            </Group>
          ))}

        {canFail && !reporting && (
          <Button
            size={size}
            radius="xl"
            variant="light"
            color="red"
            leftSection={<IconCircleX size={20} />}
            style={touch}
            onClick={() => {
              setError(null)
              setReporting(true)
            }}
          >
            Could not finish the visit
          </Button>
        )}
        {reporting && reportForm}
      </Stack>
    </Paper>
  )
}
