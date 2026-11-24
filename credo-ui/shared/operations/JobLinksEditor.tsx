import { useEffect, useState, type ReactNode } from 'react'
import { Alert, Anchor, Autocomplete, Button, Group, SimpleGrid, Stack, Text, TextInput } from '@mantine/core'
import { IconAlertTriangle, IconBuildingStore, IconMapPin, IconPencil, IconRoute, IconTruck } from '@tabler/icons-react'

import { JobScheduleFields, useJobChoices } from './JobScheduleFields'
import { FIELD_BRANCH_OPTIONS, FIELD_PROBLEM_TYPES } from './jobOptions'
import { storeSite, type JobLinksInput, type OperationsApi } from './operationsApi'

export interface JobLinks {
  storeNumber?: string
  branch?: string
  vanId?: string
  vehicleReference?: string
  location?: string
  callOut?: boolean
  /** What the old system said, shown until the job has its own branch or van. */
  importedDetails?: { branch?: string; vehicle?: string }
}

const text = (value?: string) => String(value || '').trim()

/**
 * The store, branch, van and site a job is linked to. Managers can change them while the job is open,
 * the same way they move a job to another worker. Used on the job page of both apps.
 */
export function JobLinksEditor({
  api,
  surface,
  jobId,
  links,
  canEdit,
  assigneeId,
  date,
  names,
  onOpenStore,
  onSaved,
}: {
  api: OperationsApi | null
  surface: 'portal' | 'phone'
  jobId: string
  links: JobLinks
  canEdit: boolean
  assigneeId?: string | null
  date?: string
  names?: Record<string, string>
  onOpenStore?: (storeNumber: string) => void
  onSaved?: () => void | Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState({ storeNumber: '', branch: '', vanId: '', vehicleReference: '', location: '' })
  const choices = useJobChoices(editing ? api : null, { branches: FIELD_BRANCH_OPTIONS, problemTypes: FIELD_PROBLEM_TYPES })
  const phone = surface === 'phone'
  const shownBranch = text(links.branch) || text(links.importedDetails?.branch)
  const shownVan = text(links.vehicleReference) || text(links.importedDetails?.vehicle)
  const size = phone ? 'md' : 'sm'

  useEffect(() => {
    if (editing) return
    setDraft({
      storeNumber: text(links.storeNumber),
      branch: shownBranch,
      vanId: text(links.vanId),
      vehicleReference: text(links.vehicleReference),
      location: text(links.location),
    })
  }, [editing, links.storeNumber, shownBranch, links.vanId, links.vehicleReference, links.location])

  const save = async () => {
    if (!api) return
    const changes: JobLinksInput = {}
    if (draft.storeNumber.trim() !== text(links.storeNumber)) changes.storeNumber = draft.storeNumber.trim()
    if (draft.branch.trim() !== shownBranch) changes.branch = draft.branch.trim()
    if (draft.vanId !== text(links.vanId)) changes.vanId = draft.vanId
    if (draft.location.trim() !== text(links.location)) changes.location = draft.location.trim()
    if (!Object.keys(changes).length) {
      setEditing(false)
      return
    }
    setSaving(true)
    setError('')
    try {
      await api.linkJob(jobId, changes)
      setEditing(false)
      await onSaved?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The job could not be updated.')
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    const row = (icon: ReactNode, label: string, value: ReactNode) => (
      <Stack gap={2}>
        <Text size="sm" c="dimmed">
          {label}
        </Text>
        <Group gap={6} wrap="nowrap" align="flex-start">
          {icon}
          <Text size={phone ? 'sm' : 'md'} style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
            {value}
          </Text>
        </Group>
      </Stack>
    )
    const iconProps = { size: 16, color: 'var(--mantine-color-dimmed)', style: { flexShrink: 0, marginTop: 3 } }
    const store = text(links.storeNumber)
    return (
      <Stack gap="sm">
        <SimpleGrid cols={{ base: phone ? 1 : 2 }} spacing="sm" verticalSpacing="sm">
          {row(
            <IconBuildingStore {...iconProps} />,
            'Store',
            store ? (
              <>
                {onOpenStore ? (
                  <Anchor inherit onClick={() => onOpenStore(store)}>
                    {store}
                  </Anchor>
                ) : (
                  store
                )}
                {links.callOut ? ' · Call-out' : ''}
              </>
            ) : (
              'Not linked'
            ),
          )}
          {row(<IconRoute {...iconProps} />, 'Branch', shownBranch || 'Not set')}
          {row(<IconTruck {...iconProps} />, 'Van', shownVan || 'No van')}
          {row(<IconMapPin {...iconProps} />, 'Site', text(links.location) || 'Not set')}
        </SimpleGrid>
        {canEdit && api && (
          <Group>
            <Button
              size={phone ? 'sm' : 'xs'}
              variant="default"
              radius={phone ? 'xl' : 'sm'}
              leftSection={<IconPencil size={16} />}
              onClick={() => setEditing(true)}
            >
              Change store, branch or van
            </Button>
          </Group>
        )}
      </Stack>
    )
  }

  return (
    <Stack gap="sm">
      <JobScheduleFields
        api={api}
        surface={surface}
        storeNumber={draft.storeNumber}
        onStoreNumber={(storeNumber) => setDraft((prev) => ({ ...prev, storeNumber }))}
        onStorePicked={(store) =>
          setDraft((prev) => ({
            ...prev,
            storeNumber: store.storeNumber,
            location: prev.location && prev.location !== text(links.location) ? prev.location : storeSite(store) || prev.location,
            branch: prev.branch || store.branch || '',
          }))
        }
        vanId={draft.vanId || null}
        onVan={(van) =>
          setDraft((prev) => ({
            ...prev,
            vanId: van?.id || '',
            vehicleReference: van?.registration || '',
            branch: prev.branch || van?.branch || '',
          }))
        }
        showCallOut={false}
        date={date}
        assigneeId={assigneeId}
        names={names}
        excludeRunId={jobId}
      />
      <Autocomplete
        size={size}
        label="Branch"
        placeholder="Choose or enter a branch"
        data={choices.branches}
        value={draft.branch}
        onChange={(branch) => setDraft((prev) => ({ ...prev, branch }))}
      />
      <TextInput
        size={size}
        label="Site address"
        placeholder="Filled from the store when you pick one"
        value={draft.location}
        onChange={(event) => {
          const location = event.currentTarget.value
          setDraft((prev) => ({ ...prev, location }))
        }}
      />
      {error && (
        <Alert variant="light" color="red" icon={<IconAlertTriangle size={18} />}>
          {error}
        </Alert>
      )}
      <Group justify="flex-end" gap="sm">
        <Button size={phone ? 'md' : 'sm'} variant="default" radius={phone ? 'xl' : 'sm'} onClick={() => setEditing(false)} disabled={saving}>
          Cancel
        </Button>
        <Button size={phone ? 'md' : 'sm'} radius={phone ? 'xl' : 'sm'} loading={saving} onClick={() => void save()}>
          Save
        </Button>
      </Group>
    </Stack>
  )
}
