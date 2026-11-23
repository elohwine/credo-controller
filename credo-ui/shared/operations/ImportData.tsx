import { useState } from 'react'
import { Alert, Badge, Button, FileInput, Group, Paper, Select, Stack, Text } from '@mantine/core'
import { IconFileImport } from '@tabler/icons-react'

import {
  FIELD_IMPORT_COUNTRIES,
  FIELD_IMPORT_CURRENCIES,
  FIELD_IMPORT_KIND_INFO,
  fieldImportKindInfo,
  isFieldImportCountry,
  isFieldImportKind,
  type FieldImportCountry,
  type FieldImportKind,
  type FieldImportPreview,
  type FieldImportResult,
  type FieldImportRowPreview,
} from '../../../src/config/fieldDataImport'

import type { OperationsApi } from './operationsApi'

const WHERE_IT_WENT: Record<FieldImportKind, string> = {
  stores: 'They are on the Stores tab and in the store pickers on the job, bill and payment forms.',
  people: 'They are on the staff list in HR. Set their pay there; they are linked to their account when they join with the same phone number.',
  vans: 'They are on the Vans tab. Retired vans are kept for their history.',
  equipment: 'They are on the Equipment tab.',
  rates: 'They are on the Rates tab and in the rate picker when pricing a job.',
  jobs: 'Open ones are in the Jobs list as "Imported from a file", ready to book. Finished and failed ones are in the same list as history; open one to see everything the old system had on it.',
  checks: 'Open a job in the Jobs list to see its check results.',
}

function RowLine({ row, surface }: { row: FieldImportRowPreview; surface: 'portal' | 'phone' }) {
  return (
    <Stack gap={0} style={{ minHeight: surface === 'phone' ? 48 : undefined }}>
      <Text size="sm" fw={500} lineClamp={2}>
        <Text span c="dimmed">
          Row {row.row} ·{' '}
        </Text>
        {row.summary}
      </Text>
      {(row.problem || row.note) && (
        <Text size="xs" c={row.problem ? 'red' : 'dimmed'}>
          {row.problem || row.note}
        </Text>
      )}
    </Stack>
  )
}

/**
 * Brings in a file exported from the old job system: stores, staff, vans, tools, rates, jobs and job checks. The
 * office checks what will happen first; nothing is saved until they confirm. The same file again
 * adds nothing. Same words and steps on the portal and the phone.
 */
export function ImportData({
  api,
  surface,
  notify,
  onDone,
}: {
  api: OperationsApi | null
  surface: 'portal' | 'phone'
  notify: (message: string, tone: 'success' | 'error' | 'info') => void
  onDone?: () => void
}) {
  const size = surface === 'phone' ? 'md' : 'sm'
  const [kind, setKind] = useState<FieldImportKind>('stores')
  const [file, setFile] = useState<File | null>(null)
  const [content, setContent] = useState('')
  const [preview, setPreview] = useState<FieldImportPreview | null>(null)
  const [result, setResult] = useState<FieldImportResult | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [country, setCountry] = useState<FieldImportCountry>('ZW')
  const [currency, setCurrency] = useState<string>('USD')
  const info = fieldImportKindInfo(kind)!

  const reset = () => {
    setFile(null)
    setContent('')
    setPreview(null)
    setResult(null)
    setError('')
  }

  const check = async (nextKind: FieldImportKind, text: string, nextCountry = country, nextCurrency = currency) => {
    if (!api || !text) return
    setBusy(true)
    setError('')
    setResult(null)
    try {
      setPreview(await api.previewImport(nextKind, text, { country: nextCountry, currency: nextCurrency }))
    } catch (cause) {
      setPreview(null)
      setError(cause instanceof Error ? cause.message : 'The file could not be read.')
    } finally {
      setBusy(false)
    }
  }

  const pickFile = async (picked: File | null) => {
    setFile(picked)
    setPreview(null)
    setResult(null)
    setError('')
    if (!picked) {
      setContent('')
      return
    }
    try {
      const text = await picked.text()
      setContent(text)
      await check(kind, text)
    } catch {
      setError('The file could not be read. Save it as CSV from your spreadsheet and try again.')
    }
  }

  const importNow = async () => {
    if (!api || !content || !preview) return
    setBusy(true)
    setError('')
    try {
      const done = await api.runImport(kind, content, { country, currency })
      setResult(done)
      setPreview(null)
      setFile(null)
      setContent('')
      notify(`${done.added} added${done.alreadyThere ? `, ${done.alreadyThere} already here` : ''}.`, done.added ? 'success' : 'info')
      onDone?.()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The import did not finish. Nothing was lost; check the file and try again.')
    } finally {
      setBusy(false)
    }
  }

  const problems = (preview?.rows || []).filter((row) => row.status === 'problem')
  const noted = (preview?.rows || []).filter((row) => row.status === 'new' && row.note)
  const sample = (preview?.rows || []).filter((row) => row.status === 'new' && !row.note).slice(0, 5)

  return (
    <Stack gap="md">
      <Paper withBorder radius="md" p="md">
        <Group gap="xs" mb={4}>
          <IconFileImport size={24} />
          <Text fw={500}>Bring in data from your old system</Text>
        </Group>
        <Text size="sm" c="dimmed">
          Export a list from MyMobileWorkers or your spreadsheet, save it as CSV, and choose it here. You see what will happen before anything
          is saved, and choosing the same file twice adds nothing twice. Go in this order: stores, staff, vans, tools, jobs, then job checks, so
          each one can be linked to the last.
        </Text>
        <Stack gap="sm" mt="md">
          <Select
            size={size}
            label="What is in the file"
            allowDeselect={false}
            data={FIELD_IMPORT_KIND_INFO.map((entry) => ({ value: entry.kind, label: entry.label }))}
            value={kind}
            onChange={(value) => {
              if (!isFieldImportKind(value)) return
              setKind(value)
              setResult(null)
              setError('')
              void check(value, content)
            }}
          />
          <Group grow gap="sm" align="flex-start">
            <Select
              size={size}
              label="Phone numbers are from"
              description="For numbers that start with 0"
              allowDeselect={false}
              data={FIELD_IMPORT_COUNTRIES.map((entry) => ({ value: entry.value, label: entry.label }))}
              value={country}
              onChange={(value) => {
                if (!isFieldImportCountry(value)) return
                setCountry(value)
                void check(kind, content, value, currency)
              }}
            />
            <Select
              size={size}
              label="Amounts are in"
              description="When the file has no currency"
              allowDeselect={false}
              data={[...FIELD_IMPORT_CURRENCIES]}
              value={currency}
              onChange={(value) => {
                if (!value) return
                setCurrency(value)
                void check(kind, content, country, value)
              }}
            />
          </Group>
          <Text size="sm">{info.summary}</Text>
          <Text size="xs" c="dimmed">
            Columns we look for: {info.columns.join(', ')}. Other names for the same thing work too.
          </Text>
          <FileInput
            size={size}
            label="File"
            placeholder="Choose a CSV file"
            accept=".csv,.json,.txt,text/csv,application/json,text/plain"
            clearable
            value={file}
            onChange={(picked) => void pickFile(picked)}
            styles={{ input: { minHeight: 48 } }}
          />
        </Stack>
      </Paper>

      {error && (
        <Alert color="red" variant="light" title="This file cannot be imported">
          {error}
        </Alert>
      )}

      {preview && (
        <Paper withBorder radius="md" p="md">
          <Stack gap="sm">
            <Text fw={500}>{file?.name || 'Your file'}</Text>
            <Group gap={6}>
              <Badge variant="light" color="teal">
                {preview.counts.new} to add
              </Badge>
              {preview.counts.exists > 0 && (
                <Badge variant="light" color="gray">
                  {preview.counts.exists} already here
                </Badge>
              )}
              {preview.counts.problem > 0 && (
                <Badge variant="light" color="red">
                  {preview.counts.problem} with a problem
                </Badge>
              )}
              {preview.kind === 'jobs' && (preview.counts.waiting ?? 0) > 0 && (
                <Badge variant="light" color="blue">
                  {preview.counts.waiting} waiting to be booked
                </Badge>
              )}
              {preview.kind === 'jobs' && (preview.counts.history ?? 0) > 0 && (
                <Badge variant="light" color="grape">
                  {preview.counts.history} finished, kept as history
                </Badge>
              )}
            </Group>
            {preview.missing.length > 0 ? (
              <Alert color="red" variant="light" title="A column is missing">
                The file needs a {preview.missing.join(' and a ')} column. Check the first row of the file.
              </Alert>
            ) : (
              <>
                <Text size="sm" c="dimmed">
                  We read: {preview.understood.map((entry) => `${entry.column} as ${entry.meaning.toLowerCase()}`).join(' · ')}
                </Text>
                {preview.ignored.length > 0 && (
                  <Text size="xs" c="dimmed">
                    Not used: {preview.ignored.join(', ')}
                  </Text>
                )}
              </>
            )}
            {problems.length > 0 && (
              <Stack gap={6}>
                <Text size="sm" fw={500}>
                  These rows will be skipped
                </Text>
                {problems.slice(0, 20).map((row) => (
                  <RowLine key={row.row} row={row} surface={surface} />
                ))}
                {problems.length > 20 && (
                  <Text size="xs" c="dimmed">
                    And {problems.length - 20} more.
                  </Text>
                )}
              </Stack>
            )}
            {noted.length > 0 && (
              <Stack gap={6}>
                <Text size="sm" fw={500}>
                  Worth a look
                </Text>
                {noted.slice(0, 8).map((row) => (
                  <RowLine key={row.row} row={row} surface={surface} />
                ))}
                {noted.length > 8 && (
                  <Text size="xs" c="dimmed">
                    And {noted.length - 8} more.
                  </Text>
                )}
              </Stack>
            )}
            {sample.length > 0 && (
              <Stack gap={6}>
                <Text size="sm" fw={500}>
                  For example
                </Text>
                {sample.map((row) => (
                  <RowLine key={row.row} row={row} surface={surface} />
                ))}
              </Stack>
            )}
            <Group grow={surface === 'phone'}>
              <Button
                size={size}
                radius="xl"
                loading={busy}
                disabled={preview.counts.new === 0 || preview.missing.length > 0}
                style={{ minHeight: 48 }}
                onClick={() => void importNow()}
              >
                {preview.counts.new === 0 ? 'Nothing new to add' : `Add ${preview.counts.new} ${info.label.toLowerCase()}`}
              </Button>
              <Button size={size} radius="xl" variant="default" style={{ minHeight: 48 }} onClick={reset}>
                Cancel
              </Button>
            </Group>
          </Stack>
        </Paper>
      )}

      {result && (
        <Alert color={result.problems ? 'yellow' : 'teal'} variant="light" title={`${result.label}: ${result.added} added`}>
          <Stack gap={4}>
            {result.kind === 'jobs' && (
              <Text size="sm">
                {result.waiting ?? 0} waiting to be booked, {result.history ?? 0} kept as history.
              </Text>
            )}
            {result.alreadyThere > 0 && <Text size="sm">{result.alreadyThere} were already here and were left alone.</Text>}
            {result.problems > 0 && <Text size="sm">{result.problems} could not be added and were skipped.</Text>}
            <Text size="sm">{WHERE_IT_WENT[result.kind]}</Text>
          </Stack>
        </Alert>
      )}
    </Stack>
  )
}
