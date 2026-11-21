import { useCallback, useEffect, useState } from 'react'
import { Button, Group, NumberInput, Paper, Stack, Text, Textarea, TextInput } from '@mantine/core'

import { jobSheetItemId } from '../../../src/config/jobSheet'

import type { JobSheetItem, OperationsApi, RateCard } from './operationsApi'

/** Rate card and the job sheet for a problem type. The office sets both; the worker fills the sheet in on site. */
export function OfficeRates({
  api,
  surface,
  canEdit,
  notify,
}: {
  api: OperationsApi | null
  surface: 'portal' | 'phone'
  canEdit: boolean
  notify: (message: string, tone: 'success' | 'error' | 'info') => void
}) {
  const size = surface === 'phone' ? 'md' : 'sm'
  const [cards, setCards] = useState<RateCard[]>([])
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('each')
  const [price, setPrice] = useState<number | string>('')
  const [problem, setProblem] = useState('')
  const [lines, setLines] = useState('Water turned off | check\nPipe replaced | measure | m')
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    api?.rateCards().then(setCards).catch(() => setCards([]))
  }, [api])
  useEffect(load, [load])

  const addRate = async () => {
    if (!api || !name.trim() || !(Number(price) >= 0)) {
      notify('Name the rate and set its price.', 'info')
      return
    }
    setSaving(true)
    try {
      await api.saveRateCard({ name: name.trim(), unit: unit.trim() || 'each', unitPrice: Number(price), ...(problem.trim() ? { problemType: problem.trim() } : {}) })
      setName('')
      setPrice('')
      notify('Rate saved.', 'success')
      load()
    } catch (error) {
      notify(error instanceof Error ? error.message : 'The rate was not saved.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const saveSheet = async () => {
    if (!api || !problem.trim()) {
      notify('Say which problem type this sheet is for.', 'info')
      return
    }
    const items: JobSheetItem[] = lines
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [label, kind, unitName] = line.split('|').map((part) => part.trim())
        const itemKind = kind === 'measure' || kind === 'text' || kind === 'check' ? kind : 'text'
        return {
          id: jobSheetItemId(label),
          label,
          kind: itemKind,
          ...(itemKind === 'measure' && unitName ? { unit: unitName } : {}),
          required: true,
        }
      })
    setSaving(true)
    try {
      await api.saveJobSheetTemplate(problem.trim(), items)
      notify(`Job sheet saved for ${problem.trim()}.`, 'success')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'The job sheet was not saved.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Stack gap="md">
      <Paper withBorder radius="md" p="md">
        <Text fw={500} mb="xs">Rate card</Text>
        <Text size="sm" c="dimmed" mb="sm">Prices used when setting what the client pays. Call-out, labour per hour, a part.</Text>
        {cards.map((card) => (
          <Text key={card.id} size="sm">
            {card.name}: {card.currency} {card.unitPrice.toFixed(2)} per {card.unit}
            {card.problemType ? ` · ${card.problemType}` : ''}
          </Text>
        ))}
        {cards.length === 0 && <Text size="sm" c="dimmed">No rates yet.</Text>}
        {canEdit && (
          <Stack gap="sm" mt="sm">
            <TextInput size={size} label="Name" value={name} onChange={(event) => setName(event.currentTarget.value)} />
            <Group grow>
              <NumberInput size={size} label="Price" min={0} value={price} onChange={setPrice} />
              <TextInput size={size} label="Per" value={unit} onChange={(event) => setUnit(event.currentTarget.value)} />
            </Group>
            <TextInput size={size} label="Problem type (optional)" value={problem} onChange={(event) => setProblem(event.currentTarget.value)} />
            <Button size={size} radius="xl" loading={saving} onClick={() => void addRate()} style={{ minHeight: 48 }}>
              Save rate
            </Button>
          </Stack>
        )}
      </Paper>
      {canEdit && (
        <Paper withBorder radius="md" p="md">
          <Text fw={500} mb="xs">Job sheet for a problem type</Text>
          <Text size="sm" c="dimmed" mb="sm">One line each: name | check, measure or text | unit. The worker fills it in on the job.</Text>
          <TextInput size={size} label="Problem type" placeholder="Plumbing" value={problem} onChange={(event) => setProblem(event.currentTarget.value)} />
          <Textarea size={size} label="Lines" autosize minRows={4} value={lines} onChange={(event) => setLines(event.currentTarget.value)} mt="sm" />
          <Button mt="sm" size={size} radius="xl" loading={saving} onClick={() => void saveSheet()} style={{ minHeight: 48 }}>
            Save job sheet
          </Button>
        </Paper>
      )}
    </Stack>
  )
}
