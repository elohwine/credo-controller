import { useEffect, useState } from 'react'
import { Button, Group, NumberInput, Stack, Text, Textarea, TextInput } from '@mantine/core'

import type { OperationsApi } from './operationsApi'

function readPhoto(file: File): Promise<{ filename: string; mediaType: string; contentBase64: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read the photo'))
    reader.onload = () => {
      const dataUrl = String(reader.result || '')
      resolve({ filename: file.name, mediaType: file.type, contentBase64: dataUrl.split(',')[1] || '' })
    }
    reader.readAsDataURL(file)
  })
}

/** The driver's check before the van goes out, and an accident report with photos. */
export function VanDayCheck({
  api,
  vanId,
  surface,
  notify,
  onSaved,
}: {
  api: OperationsApi | null
  vanId: string
  surface: 'portal' | 'phone'
  notify: (message: string, tone: 'success' | 'error' | 'info') => void
  onSaved?: () => void
}) {
  const size = surface === 'phone' ? 'md' : 'sm'
  const [items, setItems] = useState<string[]>([])
  const [checks, setChecks] = useState<Record<string, { ok: boolean; note: string }>>({})
  const [mileage, setMileage] = useState<number | string>('')
  const [notes, setNotes] = useState('')
  const [accident, setAccident] = useState('')
  const [photos, setPhotos] = useState<Array<{ filename: string; mediaType: string; contentBase64: string }>>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!api) return
    api.vanCheckItems().then((list) => {
      setItems(list)
      setChecks(Object.fromEntries(list.map((item) => [item, { ok: true, note: '' }])))
    }).catch(() => setItems([]))
  }, [api])

  const submitCheck = async () => {
    if (!api) return
    setSaving(true)
    try {
      await api.dailyCheck(vanId, {
        checks: items.map((item) => ({ item, ok: checks[item]?.ok !== false, ...(checks[item]?.note ? { note: checks[item].note } : {}) })),
        ...(Number(mileage) > 0 ? { mileage: Number(mileage) } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      })
      notify('Van check saved.', 'success')
      onSaved?.()
    } catch (error) {
      notify(error instanceof Error ? error.message : 'The van check was not saved.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const submitAccident = async () => {
    if (!api) return
    setSaving(true)
    try {
      await api.reportVanAccident(vanId, { notes: accident.trim(), ...(photos.length ? { photos } : {}) })
      setAccident('')
      setPhotos([])
      notify('Accident report saved on the van.', 'success')
      onSaved?.()
    } catch (error) {
      notify(error instanceof Error ? error.message : 'The accident report was not saved.', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (!items.length) return null

  return (
    <Stack gap="sm">
      <Text fw={500}>Daily check</Text>
      {items.map((item) => (
        <Group key={item} justify="space-between" wrap="nowrap" align="flex-start">
          <Stack gap={4} style={{ flex: 1 }}>
            <Text size="sm">{item}</Text>
            {checks[item]?.ok === false && (
              <TextInput
                size={size}
                placeholder="What is wrong"
                value={checks[item]?.note || ''}
                onChange={(event) => setChecks({ ...checks, [item]: { ok: false, note: event.currentTarget.value } })}
              />
            )}
          </Stack>
          <Button
            size={size}
            radius="xl"
            variant={checks[item]?.ok === false ? 'filled' : 'default'}
            color={checks[item]?.ok === false ? 'red' : 'gray'}
            style={{ minHeight: 48 }}
            onClick={() => setChecks({ ...checks, [item]: { ok: checks[item]?.ok === false, note: checks[item]?.note || '' } })}
          >
            {checks[item]?.ok === false ? 'Not ok' : 'Ok'}
          </Button>
        </Group>
      ))}
      <NumberInput size={size} label="Mileage" min={0} value={mileage} onChange={setMileage} />
      <Textarea size={size} label="Notes" value={notes} onChange={(event) => setNotes(event.currentTarget.value)} />
      <Button size={size} radius="xl" loading={saving} onClick={() => void submitCheck()} style={{ minHeight: 48 }}>
        Save today's check
      </Button>
      <Text fw={500} mt="sm">
        Report an accident
      </Text>
      <Textarea size={size} label="What happened" required value={accident} onChange={(event) => setAccident(event.currentTarget.value)} />
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        aria-label="Accident photos"
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files || []).slice(0, 6)
          void Promise.all(files.map(readPhoto)).then(setPhotos).catch((error) => notify(error.message, 'error'))
        }}
      />
      <Button size={size} radius="xl" color="red" variant="light" loading={saving} disabled={!accident.trim()} onClick={() => void submitAccident()} style={{ minHeight: 48 }}>
        Save accident report{photos.length ? ` (${photos.length} photo${photos.length === 1 ? '' : 's'})` : ''}
      </Button>
    </Stack>
  )
}
