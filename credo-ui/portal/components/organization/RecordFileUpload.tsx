import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { Alert, Badge, Button, FileInput, Group, Modal, Paper, SegmentedControl, Stack, Table, Text } from '@mantine/core'
import { IconDownload, IconFileUpload } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'

interface RecordField {
  key: string
  label: string
  type: 'text' | 'number' | 'date' | 'yes_no'
  required: boolean
}

interface PreviewRow {
  row: number
  phone: string
  reference: string | null
  error: string | null
}

interface Preview {
  columns: Record<string, string>
  ignoredColumns: string[]
  missingFields: string[]
  rows: PreviewRow[]
  ready: number
  failed: number
}

interface Result {
  sent: number
  alreadySent: number
  failed: number
  rows: Array<{ row: number; reference: string | null; status: string; error?: string }>
}

const EXAMPLE: Record<RecordField['type'], string> = {
  text: 'Example',
  number: '10',
  date: '2025-06-15',
  yes_no: 'yes',
}

const csvCell = (value: string) => (/[",\n;]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)

/** Phones are personal data; the preview only needs enough to recognise the row. */
const maskPhone = (phone: string) => {
  const digits = phone.replace(/\D/g, '')
  return digits.length > 4 ? `•••• ${digits.slice(-4)}` : phone
}

/**
 * Send records from a file the organisation's existing software already exports. One row per
 * person; the preview checks every row before anything is sent.
 */
export default function RecordFileUpload({
  base,
  headers,
  type,
  onClose,
  onSent,
}: {
  base: string
  headers: () => Record<string, string>
  type: { credentialType: string; label: string; fields: RecordField[] } | null
  onClose: () => void
  onSent: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [content, setContent] = useState('')
  const [scope, setScope] = useState<'org_members' | 'any_registered'>('org_members')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setFile(null)
    setContent('')
    setPreview(null)
    setResult(null)
    setError(null)
  }, [type?.credentialType])

  const url = (suffix: string) => `${base}/record-types/${encodeURIComponent(type?.credentialType || '')}/import${suffix}`

  const check = async (text: string, recipientScope = scope) => {
    if (!text) return
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const res = await axios.post<Preview>(url('/preview'), { content: text, recipientScope }, { headers: headers() })
      setPreview(res.data)
    } catch (err: any) {
      setPreview(null)
      setError(err?.response?.data?.message || err?.message || 'Could not read the file')
    } finally {
      setBusy(false)
    }
  }

  const choose = async (chosen: File | null) => {
    setFile(chosen)
    setPreview(null)
    if (!chosen) return setContent('')
    const text = await chosen.text()
    setContent(text)
    await check(text)
  }

  const send = async () => {
    setBusy(true)
    try {
      const res = await axios.post<Result>(url(''), { content, recipientScope: scope }, { headers: headers() })
      setResult(res.data)
      setPreview(null)
      notifications.show({
        title: 'Records sent',
        message: `${res.data.sent} sent${res.data.alreadySent ? `, ${res.data.alreadySent} already sent before` : ''}${res.data.failed ? `, ${res.data.failed} not sent` : ''}.`,
        color: res.data.failed ? 'yellow' : 'green',
      })
      onSent()
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Could not send')
    } finally {
      setBusy(false)
    }
  }

  const template = () => {
    if (!type) return
    const header = ['Phone', 'Reference', ...type.fields.map((f) => f.label)]
    const example = ['0771234567', 'REF-001', ...type.fields.map((f) => EXAMPLE[f.type])]
    const blob = new Blob([`${header.map(csvCell).join(',')}\n${example.map(csvCell).join(',')}\n`], { type: 'text/csv' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${type.label.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase()}-template.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const problems = preview ? [...preview.rows.filter((r) => r.error), ...preview.rows.filter((r) => !r.error)] : []
  const failedResults = result?.rows.filter((r) => r.status === 'failed') || []

  return (
    <Modal opened={Boolean(type)} onClose={onClose} title={type ? `Send ${type.label} records from a file` : ''} size="lg">
      {type && (
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            Export from the software you already use, or save your spreadsheet as CSV. One row per person, with their phone
            number. Columns are matched to fields by name; a Reference column stops the same record being sent twice.
          </Text>
          <Group gap="xs">
            <Button size="xs" variant="default" leftSection={<IconDownload size={14} />} onClick={template}>
              Download template
            </Button>
            <Text size="xs" c="dimmed">
              Fields: {type.fields.map((f) => `${f.label}${f.required ? '' : ' (optional)'}`).join(', ')}
            </Text>
          </Group>
          <FileInput
            label="File"
            placeholder="Choose a .csv or .json file"
            accept=".csv,.json,.txt,text/csv,application/json"
            leftSection={<IconFileUpload size={16} />}
            value={file}
            onChange={(chosen) => void choose(chosen)}
            clearable
          />
          <div>
            <Text size="sm" fw={500} mb={4}>
              Who can receive these records
            </Text>
            <SegmentedControl
              fullWidth
              value={scope}
              onChange={(value) => {
                setScope(value as typeof scope)
                void check(content, value as typeof scope)
              }}
              data={[
                { value: 'org_members', label: 'Members of the organisation' },
                { value: 'any_registered', label: 'Anyone with Credentis' },
              ]}
            />
          </div>

          {error && <Alert color="red">{error}</Alert>}

          {preview && (
            <>
              <Group gap="xs">
                <Badge color="teal" variant="light">
                  {preview.ready} ready
                </Badge>
                {preview.failed > 0 && (
                  <Badge color="red" variant="light">
                    {preview.failed} need fixing
                  </Badge>
                )}
              </Group>
              <Text size="xs" c="dimmed">
                Matched:{' '}
                {Object.entries(preview.columns)
                  .map(([column, field]) => `${column} → ${type.fields.find((f) => f.key === field)?.label || (field === 'phone' ? 'Phone' : 'Reference')}`)
                  .join(', ') || 'nothing'}
                {preview.ignoredColumns.length > 0 && `. Ignored: ${preview.ignoredColumns.join(', ')}`}
              </Text>
              {preview.missingFields.length > 0 && (
                <Alert color="yellow">Not in the file: {preview.missingFields.join(', ')}.</Alert>
              )}
              <Paper withBorder style={{ maxHeight: 260, overflowY: 'auto' }}>
                <Table striped>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Row</Table.Th>
                      <Table.Th>Phone</Table.Th>
                      <Table.Th>Reference</Table.Th>
                      <Table.Th>Check</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {problems.slice(0, 100).map((row) => (
                      <Table.Tr key={row.row}>
                        <Table.Td>{row.row}</Table.Td>
                        <Table.Td>{maskPhone(row.phone)}</Table.Td>
                        <Table.Td>{row.reference || '—'}</Table.Td>
                        <Table.Td>
                          {row.error ? (
                            <Text size="xs" c="red">
                              {row.error}
                            </Text>
                          ) : (
                            <Text size="xs" c="teal">
                              Ready
                            </Text>
                          )}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Paper>
            </>
          )}

          {result && (
            <Alert color={result.failed ? 'yellow' : 'teal'} title="Done">
              {result.sent} sent to people&apos;s inboxes
              {result.alreadySent ? `, ${result.alreadySent} were already sent before` : ''}
              {result.failed ? `, ${result.failed} not sent` : ''}.
              {failedResults.slice(0, 10).map((row) => (
                <Text key={row.row} size="xs" mt={4}>
                  Row {row.row}: {row.error}
                </Text>
              ))}
            </Alert>
          )}

          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              {result ? 'Close' : 'Cancel'}
            </Button>
            {!result && (
              <Button loading={busy} disabled={!preview || preview.ready === 0} onClick={() => void send()}>
                {preview && preview.ready > 0 ? `Send ${preview.ready} record${preview.ready === 1 ? '' : 's'}` : 'Send'}
              </Button>
            )}
          </Group>
        </Stack>
      )}
    </Modal>
  )
}
