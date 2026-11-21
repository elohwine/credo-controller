import { useEffect, useMemo, useState } from 'react'
import { Alert, Autocomplete, Checkbox, Select, Stack, Text } from '@mantine/core'
import { IconAlertTriangle, IconTruck } from '@tabler/icons-react'

import {
  scheduleWarnings,
  type OperationsApi,
  type ScheduleCheck,
  type StoreSummary,
  type VanRecord,
} from './operationsApi'

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
        })
        .then(setCheck)
        .catch(() => setCheck(null))
    }, 400)
    return () => clearTimeout(timer)
  }, [api, storeNumber, date, assigneeId, vanId, excludeIntakeId])

  const storeByNumber = useMemo(() => new Map(stores.map((store) => [store.storeNumber, store])), [stores])
  const warnings = scheduleWarnings(check, names)
  const size = surface === 'phone' ? 'md' : 'sm'

  return (
    <Stack gap="sm">
      {showStore && (
        <Autocomplete
          size={size}
          label="Store number"
          description="The client's store number. Every job, quote and invoice for that store is kept together."
          placeholder="e.g. 1042"
          data={stores.map((store) => store.storeNumber)}
          renderOption={({ option }) => {
            const store = storeByNumber.get(option.value)
            return (
              <div>
                <Text size="sm" fw={500}>
                  {option.value}
                </Text>
                {store && (
                  <Text size="xs" c="dimmed">
                    {store.name}
                    {store.openJobs ? ` · ${store.openJobs} open` : ''}
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
            label: [van.registration, van.driverName, van.status === 'off_road' ? 'off the road' : ''].filter(Boolean).join(' · '),
            disabled: van.status !== 'active',
          }))}
        value={vanId}
        onChange={(value) => onVan((vans || []).find((van) => van.id === value) || null)}
      />
      {showCallOut && onCallOut && (
        <Checkbox
          size={size}
          label="Call-out"
          description="Urgent work the store called in, outside the planned jobs."
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
