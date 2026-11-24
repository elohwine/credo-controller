import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Autocomplete, Checkbox, Select, Stack, Text, type ComboboxItem, type OptionsFilter } from '@mantine/core'
import { IconAlertTriangle, IconTruck } from '@tabler/icons-react'

import {
  scheduleWarnings,
  storeSite,
  type JobChoices,
  type OperationsApi,
  type ScheduleCheck,
  type StoreSummary,
  type VanRecord,
} from './operationsApi'

/** Branches and problem types already in use, falling back to the given lists until they load. */
export function useJobChoices(api: OperationsApi | null, fallback: JobChoices): JobChoices {
  const [choices, setChoices] = useState<JobChoices | null>(null)
  useEffect(() => {
    if (!api) return
    let live = true
    api
      .jobChoices()
      .then((data) => live && setChoices(data))
      .catch(() => live && setChoices(null))
    return () => {
      live = false
    }
  }, [api])
  return useMemo(
    () => ({
      branches: choices?.branches.length ? choices.branches : fallback.branches,
      problemTypes: choices?.problemTypes.length ? choices.problemTypes : fallback.problemTypes,
    }),
    // The fallback lists are constants at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [choices],
  )
}

/** Adds a current value that is not in the list yet, so a select can still show it. */
export function withCurrent(options: string[], current?: string | null): string[] {
  const value = current?.trim()
  return value && !options.some((option) => option.toLowerCase() === value.toLowerCase()) ? [value, ...options] : options
}

/**
 * Store number, van and call-out on a job, with what else is already booked for that store,
 * that worker and that van. Used by the job form and by booking a job from intake, on both apps.
 */
export function JobScheduleFields({
  api,
  surface,
  storeNumber,
  onStoreNumber,
  onStorePicked,
  vanId,
  onVan,
  callOut,
  onCallOut,
  date,
  assigneeId,
  names = {},
  excludeIntakeId,
  excludeRunId,
  showStore = true,
  showCallOut = true,
}: {
  api: OperationsApi | null
  surface: 'portal' | 'phone'
  storeNumber: string
  onStoreNumber?: (value: string) => void
  onStorePicked?: (store: StoreSummary) => void
  vanId: string | null
  onVan: (van: VanRecord | null) => void
  callOut?: boolean
  onCallOut?: (value: boolean) => void
  date?: string
  assigneeId?: string | null
  names?: Record<string, string>
  excludeIntakeId?: string
  excludeRunId?: string
  showStore?: boolean
  showCallOut?: boolean
}) {
  const [stores, setStores] = useState<StoreSummary[]>([])
  const [vans, setVans] = useState<VanRecord[] | null>(null)
  const [check, setCheck] = useState<ScheduleCheck | null>(null)

  useEffect(() => {
    if (!api) return
    api.vans().then(setVans).catch(() => setVans([]))
    if (showStore) api.stores().then(setStores).catch(() => setStores([]))
  }, [api, showStore])

  useEffect(() => {
    if (!api || (!storeNumber.trim() && !assigneeId && !vanId)) {
      setCheck(null)
      return
    }
    const timer = setTimeout(() => {
      api
        .scheduleCheck({
          storeNumber: storeNumber.trim() || undefined,
          date: date || undefined,
          assigneeId: assigneeId || undefined,
          vanId: vanId || undefined,
          excludeIntakeId,
          excludeRunId,
        })
        .then(setCheck)
        .catch(() => setCheck(null))
    }, 400)
    return () => clearTimeout(timer)
  }, [api, storeNumber, date, assigneeId, vanId, excludeIntakeId, excludeRunId])

  const storeByNumber = useMemo(() => new Map(stores.map((store) => [store.storeNumber, store])), [stores])
  const storeFilter = useMemo<OptionsFilter>(
    () =>
      ({ options, search }) => {
        const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean)
        if (!words.length) return options
        return (options as ComboboxItem[]).filter((option) => {
          const store = storeByNumber.get(option.value)
          const text = [option.value, store?.name, store?.address, store?.postcode].filter(Boolean).join(' ').toLowerCase()
          return words.every((word) => text.includes(word))
        })
      },
    [storeByNumber],
  )

  // A worker who drives a van usually takes it: offer it when no van is chosen yet.
  const lastAssignee = useRef(assigneeId)
  useEffect(() => {
    if (lastAssignee.current === assigneeId) return
    lastAssignee.current = assigneeId
    if (!assigneeId || vanId || !vans) return
    const own = vans.find((van) => van.status === 'active' && van.driverUserId === assigneeId)
    if (own) onVan(own)
  }, [assigneeId, vanId, vans, onVan])
  const warnings = scheduleWarnings(check, names)
  const size = surface === 'phone' ? 'md' : 'sm'

  return (
    <Stack gap="sm">
      {showStore && (
        <Autocomplete
          size={size}
          label="Store"
          description="Search by store number, name, address or postcode. Every job, quote and invoice for that store is kept together."
          placeholder="e.g. 1042 or PE1"
          data={stores.map((store) => store.storeNumber)}
          filter={storeFilter}
          limit={30}
          renderOption={({ option }) => {
            const store = storeByNumber.get(option.value)
            return (
              <div>
                <Text size="sm" fw={500}>
                  {option.value}
                </Text>
                {store && (
                  <Text size="xs" c="dimmed">
                    {[store.name, storeSite(store), store.branch, store.openJobs ? `${store.openJobs} open` : '']
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                )}
              </div>
            )
          }}
          value={storeNumber}
          onChange={(value) => onStoreNumber?.(value)}
          onOptionSubmit={(value) => {
            const store = storeByNumber.get(value)
            if (store) onStorePicked?.(store)
          }}
        />
      )}
      <Select
        size={size}
        label="Van"
        description="The van that goes out on this job."
        placeholder={vans === null || vans.length ? 'Choose a van' : 'No vans on the register yet'}
        leftSection={<IconTruck size={18} />}
        clearable
        searchable
        data={(vans || [])
          .filter((van) => van.status !== 'retired')
          .map((van) => ({
            value: van.id,
            label: [van.registration, van.driverName, van.branch, van.status === 'off_road' ? 'off the road' : ''].filter(Boolean).join(' · '),
            disabled: van.status !== 'active',
          }))}
        value={vanId}
        onChange={(value) => onVan((vans || []).find((van) => van.id === value) || null)}
      />
      {showCallOut && onCallOut && (
        <Checkbox
          size={size}
          label="Urgent (call-out)"
          description="Work the store called in that must be done first. It is marked Urgent on the Jobs board."
          checked={Boolean(callOut)}
          onChange={(event) => onCallOut(event.currentTarget.checked)}
        />
      )}
      {warnings.map((warning) => (
        <Alert
          key={warning.text}
          variant="light"
          color={warning.tone === 'danger' ? 'red' : 'orange'}
          icon={<IconAlertTriangle size={18} />}
          title={warning.title}
        >
          {warning.text}
        </Alert>
      ))}
    </Stack>
  )
}
