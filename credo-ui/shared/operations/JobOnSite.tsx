import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import { Button, Collapse, Group, NumberInput, Paper, Stack, Text, Textarea, TextInput } from '@mantine/core'
import { IconChevronDown, IconChevronUp, IconMail } from '@tabler/icons-react'

import { fieldJobInput } from '../../../src/config/fieldJobCategory'

import { readableDate, type JobSheetItem, type MailMessage, type OperationsApi } from './operationsApi'

/**
 * What is filled in on the job itself: the emails that asked for it, the sheet (checks,
 * measurements, items used), the store person's signature, and a link the client can open.
 */
export function JobOnSite({
  api,
  surface,
  job,
  canFill,
  canShare,
  notify,
  onChanged,
}: {
  api: OperationsApi | null
  surface: 'portal' | 'phone'
  job: { id?: string; input?: any; output?: any }
  canFill: boolean
  canShare: boolean
  notify: (message: string, tone: 'success' | 'error' | 'info') => void
  onChanged?: () => void
}) {
  const runId = String(job.id || '')
  const input = fieldJobInput(job)
  const intakeId = String(input.jobIntakeId || '')
  const size = surface === 'phone' ? 'md' : 'sm'
  const [thread, setThread] = useState<MailMessage[]>([])
  const [items, setItems] = useState<JobSheetItem[]>([])
  const [answers, setAnswers] = useState<Record<string, { ok?: boolean; value?: string }>>({})
  const [materials, setMaterials] = useState<Array<{ name: string; quantity: number | string; unit: string }>>([{ name: '', quantity: '', unit: '' }])
  const [saving, setSaving] = useState(false)
  const [signerName, setSignerName] = useState('')
  const [signerRole, setSignerRole] = useState('')
  const [link, setLink] = useState('')
  // Folded by default so the job's progress timeline stays the first thing seen when a job opens.
  const [open, setOpen] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)

  const load = useCallback(async () => {
    if (!api || !runId) return
    try {
      const sheet = await api.jobSheet(runId)
      setItems(sheet.sheet?.items || [])
      setAnswers(sheet.saved?.answers || {})
      if (sheet.saved?.materials?.length) {
        setMaterials(sheet.saved.materials.map((item) => ({ name: item.name, quantity: item.quantity, unit: item.unit || '' })))
      }
    } catch {
      /* a worker who cannot open the sheet still sees the rest of the job */
    }
    if (intakeId) {
      api.intakeThread(intakeId).then(setThread).catch(() => setThread([]))
    }
  }, [api, runId, intakeId])

  useEffect(() => {
    void load()
  }, [load])

  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const box = canvas.current?.getBoundingClientRect()
    if (!box || !canvas.current) return null
    return { x: ((event.clientX - box.left) / box.width) * canvas.current.width, y: ((event.clientY - box.top) / box.height) * canvas.current.height }
  }

  const saveSheet = async () => {
    if (!api) return
    setSaving(true)
    try {
      const used = materials
        .filter((item) => item.name.trim() && Number(item.quantity) > 0)
        .map((item) => ({ name: item.name.trim(), quantity: Number(item.quantity), ...(item.unit.trim() ? { unit: item.unit.trim() } : {}) }))
      await api.saveJobSheet(runId, { answers, materials: used })
      notify('Job sheet saved.', 'success')
      onChanged?.()
    } catch (error) {
      notify(error instanceof Error ? error.message : 'The job sheet was not saved.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const saveSignature = async () => {
    if (!api || !canvas.current) return
    const imageDataUrl = canvas.current.toDataURL('image/png')
    if (!signerName.trim()) {
      notify('Write the name of the person signing.', 'info')
      return
    }
    setSaving(true)
    try {
      await api.saveStoreSignature(runId, { signerName: signerName.trim(), ...(signerRole.trim() ? { signerRole: signerRole.trim() } : {}), imageDataUrl })
      notify('Signature saved on the job.', 'success')
      onChanged?.()
    } catch (error) {
      notify(error instanceof Error ? error.message : 'The signature was not saved.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const share = async () => {
    if (!api) return
    try {
      const created = await api.createStatusLink(runId)
      setLink(created.url)
      await navigator.clipboard?.writeText(created.url).catch(() => undefined)
      notify('Link copied. Anyone with it can follow this job.', 'success')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'The link was not created.', 'error')
    }
  }

  const savedSignature = job.output?.storeSignature
  const checks = items.filter((item) => item.required)
  const checksDone = checks.filter((item) => answers[item.id]?.ok || String(answers[item.id]?.value || '').trim()).length
  const summary = [
    checks.length ? `${checksDone} of ${checks.length} sheet items done` : items.length ? `${items.length} sheet items` : '',
    savedSignature?.signerName ? `Signed by ${savedSignature.signerName}` : 'Not signed yet',
    thread.length ? `${thread.length} email${thread.length === 1 ? '' : 's'}` : '',
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Paper withBorder radius="md" p="md">
      <Group justify="space-between" wrap="nowrap" align="center">
        <Stack gap={0} style={{ minWidth: 0 }}>
          <Text fw={500}>On-site sheet</Text>
          <Text size="sm" c="dimmed" lineClamp={2}>
            {summary}
          </Text>
        </Stack>
        <Button
          size={size}
          variant="light"
          radius="xl"
          style={{ minHeight: surface === 'phone' ? 48 : 36, flexShrink: 0 }}
          rightSection={open ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? 'Hide' : canFill ? 'Fill in' : 'View'}
        </Button>
      </Group>
      <Collapse expanded={open}>
    <Stack gap="sm" mt="sm">
      {thread.length > 0 && (
        <Paper withBorder radius="md" p="md">
          <Group gap={6} mb="xs">
            <IconMail size={18} />
            <Text fw={500}>Emails about this job</Text>
          </Group>
          <Stack gap="xs">
            {thread.map((message) => (
              <Paper key={message.id} withBorder radius="sm" p="xs">
                <Text size="xs" c="dimmed">
                  {message.direction === 'out' ? 'Office reply' : message.sender || 'Email'} · {readableDate(message.receivedAt)}
                </Text>
                {message.subject && <Text size="sm" fw={500}>{message.subject}</Text>}
                {message.bodyText && (
                  <Text size="sm" lineClamp={6}>
                    {message.bodyText}
                  </Text>
                )}
                {message.webLink && (
                  <Text size="xs" component="a" href={message.webLink} target="_blank" rel="noreferrer">
                    Open in Outlook
                  </Text>
                )}
              </Paper>
            ))}
          </Stack>
        </Paper>
      )}

      {items.length > 0 && (
        <Paper withBorder radius="md" p="md">
          <Text fw={500} mb="xs">
            Job sheet
          </Text>
          <Stack gap="sm">
            {items.map((item) => (
              <Stack key={item.id} gap={4}>
                {item.kind === 'check' ? (
                  <Button
                    size={size}
                    variant={answers[item.id]?.ok ? 'filled' : 'default'}
                    radius="xl"
                    justify="flex-start"
                    disabled={!canFill}
                    style={{ minHeight: 48, height: 'auto' }}
                    styles={{ label: { whiteSpace: 'normal', textAlign: 'left', lineHeight: 1.3 } }}
                    onClick={() => setAnswers({ ...answers, [item.id]: { ok: !answers[item.id]?.ok } })}
                  >
                    {answers[item.id]?.ok ? 'Done: ' : ''}
                    {item.label}
                    {item.required ? '' : ' (optional)'}
                  </Button>
                ) : (
                  <Textarea
                    size={size}
                    label={`${item.label}${item.unit ? ` (${item.unit})` : ''}`}
                    required={item.required}
                    disabled={!canFill}
                    autosize
                    minRows={item.kind === 'measure' ? 1 : 2}
                    value={answers[item.id]?.value || ''}
                    onChange={(event) => setAnswers({ ...answers, [item.id]: { value: event.currentTarget.value } })}
                  />
                )}
              </Stack>
            ))}
            <Text size="sm" fw={500}>
              Items used
            </Text>
            {materials.map((item, index) => (
              <Group key={index} gap="xs" align="flex-end">
                <TextInput
                  size={size}
                  style={{ flex: 2 }}
                  label={index === 0 ? 'Item' : undefined}
                  placeholder="Item"
                  disabled={!canFill}
                  value={item.name}
                  onChange={(event) => setMaterials(materials.map((row, i) => (i === index ? { ...row, name: event.currentTarget.value } : row)))}
                />
                <NumberInput
                  size={size}
                  style={{ flex: 1 }}
                  label={index === 0 ? 'Qty' : undefined}
                  min={0}
                  disabled={!canFill}
                  value={item.quantity}
                  onChange={(value) => setMaterials(materials.map((row, i) => (i === index ? { ...row, quantity: value } : row)))}
                />
              </Group>
            ))}
            {canFill && (
              <Group justify="space-between">
                <Button size={size} variant="subtle" onClick={() => setMaterials([...materials, { name: '', quantity: '', unit: '' }])}>
                  Add an item
                </Button>
                <Button size={size} radius="xl" loading={saving} onClick={() => void saveSheet()}>
                  Save job sheet
                </Button>
              </Group>
            )}
          </Stack>
        </Paper>
      )}

      <Paper withBorder radius="md" p="md">
        <Text fw={500} mb={4}>
          Store signature
        </Text>
        {savedSignature?.imageDataUrl ? (
          <Stack gap={4}>
            <img src={savedSignature.imageDataUrl} alt={`Signed by ${savedSignature.signerName}`} style={{ maxWidth: 280, background: 'var(--mantine-color-body)' }} />
            <Text size="sm">
              Signed by {savedSignature.signerName}
              {savedSignature.signerRole ? `, ${savedSignature.signerRole}` : ''} on {readableDate(savedSignature.signedAt)}
            </Text>
          </Stack>
        ) : (
          <Text size="sm" c="dimmed" mb="xs">
            The person at the store signs here to say the work was done.
          </Text>
        )}
        {canFill && (
          <Stack gap="sm" mt="sm">
            <canvas
              ref={canvas}
              width={600}
              height={200}
              style={{ width: '100%', height: 140, touchAction: 'none', borderRadius: 12, border: '1px solid var(--mantine-color-default-border)', background: 'var(--mantine-color-body)' }}
              onPointerDown={(event) => {
                drawing.current = true
                const at = point(event)
                const node = canvas.current
                const pen = node?.getContext('2d')
                if (!at || !pen || !node) return
                pen.strokeStyle = getComputedStyle(node).color || '#222'
                pen.lineWidth = 2
                pen.beginPath()
                pen.moveTo(at.x, at.y)
              }}
              onPointerMove={(event) => {
                if (!drawing.current) return
                const at = point(event)
                const pen = canvas.current?.getContext('2d')
                if (!at || !pen) return
                pen.lineTo(at.x, at.y)
                pen.stroke()
              }}
              onPointerUp={() => {
                drawing.current = false
              }}
            />
            <TextInput size={size} label="Name" placeholder="Who is signing" value={signerName} onChange={(event) => setSignerName(event.currentTarget.value)} />
            <TextInput size={size} label="Role" placeholder="Store manager" value={signerRole} onChange={(event) => setSignerRole(event.currentTarget.value)} />
            <Group justify="flex-end">
              <Button
                size={size}
                variant="default"
                radius="xl"
                onClick={() => canvas.current?.getContext('2d')?.clearRect(0, 0, 600, 200)}
              >
                Clear
              </Button>
              <Button size={size} radius="xl" loading={saving} onClick={() => void saveSignature()}>
                Save signature
              </Button>
            </Group>
          </Stack>
        )}
      </Paper>

      {canShare && (
        <Paper withBorder radius="md" p="md">
          <Text fw={500} mb={4}>
            Link for the client
          </Text>
          <Text size="sm" c="dimmed" mb="sm">
            They open it to see where the job stands, the photos and the bill. No account needed.
          </Text>
          {link && (
            <Text size="sm" mb="sm" style={{ wordBreak: 'break-all' }}>
              {link}
            </Text>
          )}
          <Group>
            <Button size={size} radius="xl" onClick={() => void share()}>
              {link ? 'New link' : 'Create link'}
            </Button>
            {link && (
              <Button
                size={size}
                variant="default"
                radius="xl"
                onClick={() =>
                  api &&
                  void api.revokeStatusLink(runId).then(() => {
                    setLink('')
                    notify('Links for this job are switched off.', 'success')
                  })
                }
              >
                Switch off links
              </Button>
            )}
          </Group>
        </Paper>
      )}
    </Stack>
      </Collapse>
    </Paper>
  )
}
