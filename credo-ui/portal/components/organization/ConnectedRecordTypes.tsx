import React, { useEffect, useState } from 'react'
import axios from 'axios'
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Modal,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core'
import { IconFileCertificate, IconPlus, IconTrash } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import RecordFileUpload from './RecordFileUpload'

type FieldType = 'text' | 'number' | 'date' | 'yes_no'

interface RecordField {
  key: string
  label: string
  type: FieldType
  required: boolean
}

interface RecordType {
  credentialType: string
  label: string
  description: string | null
  version: number
  fields: RecordField[]
  status: 'active' | 'superseded' | 'retired'
}

interface SentRecord {
  id: string
  status: string
  credentialType: string
  recordTypeVersion: number
  externalReference: string | null
  createdAt: string
  clientName: string
  label?: string
  error: string | null
}

interface Draft {
  credentialType?: string
  label: string
  description: string
  fields: Array<RecordField & { published?: boolean }>
}

const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'yes_no', label: 'Yes / no' },
]

const STATUS_COLOR: Record<string, string> = {
  pending: 'blue',
  accepted: 'teal',
  processing: 'gray',
  failed: 'red',
  expired: 'orange',
  withdrawn: 'gray',
  resolved: 'gray',
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Waiting for person',
  accepted: 'In wallet',
  processing: 'Sending',
  failed: 'Not sent',
  expired: 'Expired',
  withdrawn: 'Withdrawn',
  resolved: 'Closed',
}

/** "Completed on" -> "completedOn". */
function keyFromLabel(label: string): string {
  const words = label
    .replace(/[^A-Za-z0-9 ]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  const key = words.map((w, i) => (i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())).join('')
  return /^[a-z]/.test(key) ? key.slice(0, 40) : ''
}

const blankField = (): RecordField => ({ key: '', label: '', type: 'text', required: true })

export default function ConnectedRecordTypes({
  backendUrl,
  headers,
}: {
  backendUrl: string
  headers: () => Record<string, string>
}) {
  const base = `${backendUrl}/api/organizations/connected-systems`
  const [types, setTypes] = useState<RecordType[]>([])
  const [records, setRecords] = useState<SentRecord[]>([])
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [retiring, setRetiring] = useState<RecordType | null>(null)
  const [uploading, setUploading] = useState<RecordType | null>(null)

  const load = async () => {
    try {
      const [typeRes, recordRes] = await Promise.all([
        axios.get<{ types: RecordType[] }>(`${base}/record-types`, { headers: headers() }),
        axios.get<{ records: SentRecord[] }>(`${base}/records?limit=20`, { headers: headers() }),
      ])
      setTypes(typeRes.data.types || [])
      setRecords(recordRes.data.records || [])
      setError(null)
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Could not load record types')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const labelOf = (credentialType: string) => types.find((t) => t.credentialType === credentialType)?.label || credentialType

  const setField = (index: number, patch: Partial<RecordField>) => {
    if (!draft) return
    const fields = draft.fields.map((field, i) => {
      if (i !== index) return field
      const next = { ...field, ...patch }
      // New keys follow the label; keys your systems already send never change silently.
      if (patch.label !== undefined && !field.published && (!field.key || field.key === keyFromLabel(field.label))) {
        next.key = keyFromLabel(patch.label)
      }
      return next
    })
    setDraft({ ...draft, fields })
  }

  const save = async () => {
    if (!draft) return
    setSaving(true)
    const body = {
      label: draft.label.trim(),
      description: draft.description.trim() || undefined,
      fields: draft.fields.map(({ published: _published, ...f }) => ({ ...f, key: f.key.trim(), label: f.label.trim() })),
    }
    try {
      if (draft.credentialType) {
        const res = await axios.put(`${base}/record-types/${encodeURIComponent(draft.credentialType)}`, body, {
          headers: headers(),
        })
        notifications.show({ title: 'New version published', message: `${res.data.label} is now version ${res.data.version}.`, color: 'green' })
      } else {
        const res = await axios.post(`${base}/record-types`, body, { headers: headers() })
        notifications.show({ title: 'Record type added', message: `Send it as ${res.data.credentialType}.`, color: 'green' })
      }
      setDraft(null)
      await load()
    } catch (err: any) {
      notifications.show({ title: 'Could not save', message: err?.response?.data?.message || err?.message, color: 'red' })
    } finally {
      setSaving(false)
    }
  }

  const retire = async () => {
    if (!retiring) return
    try {
      await axios.post(`${base}/record-types/${encodeURIComponent(retiring.credentialType)}/retire`, {}, { headers: headers() })
      setRetiring(null)
      await load()
    } catch (err: any) {
      notifications.show({ title: 'Could not retire', message: err?.response?.data?.message || err?.message, color: 'red' })
    }
  }

  const draftValid =
    draft &&
    draft.label.trim().length >= 3 &&
    draft.fields.length > 0 &&
    draft.fields.every((f) => f.label.trim() && /^[a-z][a-zA-Z0-9]{0,39}$/.test(f.key.trim()))

  return (
    <>
      <Group justify="space-between" align="flex-end" mt="md">
        <div>
          <Title order={3}>Record types</Title>
          <Text c="dimmed" size="sm" mt={4}>
            The records your systems send, such as certificates, results or service reports. Credentis keeps identity,
            authority, payments and receipts itself.
          </Text>
        </div>
        <Button
          variant="light"
          leftSection={<IconPlus size={16} />}
          onClick={() => setDraft({ label: '', description: '', fields: [blankField()] })}
        >
          Add record type
        </Button>
      </Group>

      {error && <Alert color="red">{error}</Alert>}
      {types.length === 0 && !error && (
        <Text c="dimmed" size="sm">
          No record types yet.
        </Text>
      )}

      {types.map((type) => (
        <Paper key={type.credentialType} withBorder p="md">
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <Stack gap={4} style={{ minWidth: 0 }}>
              <Group gap="xs">
                <IconFileCertificate size={18} />
                <Text fw={600}>{type.label}</Text>
                <Badge size="sm" variant="light" color="gray">
                  v{type.version}
                </Badge>
              </Group>
              <Text size="xs" c="dimmed" style={{ wordBreak: 'break-all' }}>
                credentialType <code>{type.credentialType}</code>
              </Text>
              {type.description && <Text size="sm">{type.description}</Text>}
              <Text size="sm" c="dimmed">
                {type.fields.map((f) => `${f.label}${f.required ? '' : ' (optional)'}`).join(' · ')}
              </Text>
            </Stack>
            <Group gap="xs" wrap="nowrap">
              <Button size="xs" variant="light" onClick={() => setUploading(type)}>
                Upload a file
              </Button>
              <Button
                size="xs"
                variant="default"
                onClick={() =>
                  setDraft({
                    credentialType: type.credentialType,
                    label: type.label,
                    description: type.description || '',
                    fields: type.fields.map((f) => ({ ...f, published: true })),
                  })
                }
              >
                Change
              </Button>
              <Button size="xs" color="red" variant="light" onClick={() => setRetiring(type)}>
                Retire
              </Button>
            </Group>
          </Group>
        </Paper>
      ))}

      <Title order={3} mt="md">
        Recently sent
      </Title>
      {records.length === 0 ? (
        <Text c="dimmed" size="sm">
          Nothing sent by a connected system yet.
        </Text>
      ) : (
        <Paper withBorder style={{ overflowX: 'auto' }}>
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Record</Table.Th>
                <Table.Th>Reference</Table.Th>
                <Table.Th>From</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Sent</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {records.map((record) => (
                <Table.Tr key={record.id}>
                  <Table.Td>
                    {record.label || labelOf(record.credentialType)} <Text span size="xs" c="dimmed">v{record.recordTypeVersion}</Text>
                  </Table.Td>
                  <Table.Td>{record.externalReference || '—'}</Table.Td>
                  <Table.Td>{record.clientName}</Table.Td>
                  <Table.Td>
                    <Badge size="sm" variant="light" color={STATUS_COLOR[record.status] || 'gray'} title={record.error || undefined}>
                      {STATUS_LABEL[record.status] || record.status}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{new Date(record.createdAt).toLocaleString()}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>
      )}

      <Modal
        opened={Boolean(draft)}
        onClose={() => setDraft(null)}
        size="lg"
        title={draft?.credentialType ? `Change ${draft.label}` : 'Add record type'}
      >
        {draft && (
          <Stack>
            {draft.credentialType ? (
              <Alert color="blue">
                Saving publishes a new version. Records already sent keep the version they were sent with.
              </Alert>
            ) : (
              <TextInput
                label="Name"
                description="What people see in their wallet, e.g. Training certificate."
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.currentTarget.value })}
              />
            )}
            <Textarea
              label="Description"
              autosize
              minRows={1}
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.currentTarget.value })}
            />
            <Text size="sm" fw={500}>
              Fields
            </Text>
            {draft.fields.map((field, index) => (
              <Group key={index} gap="xs" align="flex-end" wrap="nowrap">
                <TextInput
                  style={{ flex: 2 }}
                  label={index === 0 ? 'Label' : undefined}
                  placeholder="Completed on"
                  value={field.label}
                  onChange={(e) => setField(index, { label: e.currentTarget.value })}
                />
                <TextInput
                  style={{ flex: 2 }}
                  label={index === 0 ? 'Key your system sends' : undefined}
                  placeholder="completedOn"
                  value={field.key}
                  onChange={(e) => setField(index, { key: e.currentTarget.value })}
                />
                <Select
                  style={{ flex: 1.3 }}
                  label={index === 0 ? 'Type' : undefined}
                  data={FIELD_TYPES}
                  value={field.type}
                  allowDeselect={false}
                  onChange={(value) => setField(index, { type: (value || 'text') as FieldType })}
                />
                <Checkbox
                  mb={8}
                  label="Required"
                  checked={field.required}
                  onChange={(e) => setField(index, { required: e.currentTarget.checked })}
                />
                <ActionIcon
                  mb={4}
                  variant="subtle"
                  color="red"
                  aria-label="Remove field"
                  disabled={draft.fields.length === 1}
                  onClick={() => setDraft({ ...draft, fields: draft.fields.filter((_, i) => i !== index) })}
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Group>
            ))}
            <Group justify="space-between">
              <Button
                variant="subtle"
                size="xs"
                leftSection={<IconPlus size={14} />}
                disabled={draft.fields.length >= 20}
                onClick={() => setDraft({ ...draft, fields: [...draft.fields, blankField()] })}
              >
                Add field
              </Button>
              <Group>
                <Button variant="default" onClick={() => setDraft(null)}>
                  Cancel
                </Button>
                <Button loading={saving} disabled={!draftValid} onClick={() => void save()}>
                  {draft.credentialType ? 'Publish new version' : 'Save'}
                </Button>
              </Group>
            </Group>
          </Stack>
        )}
      </Modal>

      <RecordFileUpload
        base={base}
        headers={headers}
        type={uploading}
        onClose={() => setUploading(null)}
        onSent={() => void load()}
      />

      <Modal opened={Boolean(retiring)} onClose={() => setRetiring(null)} title="Retire this record type?">
        {retiring && (
          <Stack>
            <Text size="sm">
              Your systems will no longer be able to send {retiring.label}. Records already in people&apos;s wallets stay
              valid. You can add it again later as a new version.
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setRetiring(null)}>
                Keep
              </Button>
              <Button color="red" onClick={() => void retire()}>
                Retire
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </>
  )
}
