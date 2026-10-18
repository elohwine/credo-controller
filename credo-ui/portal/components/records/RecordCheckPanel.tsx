/**
 * The "Check a record" panel: a reference box, the check, and the result in plain words.
 * The phone has the same panel (`credo-ui/mobile/components/records/RecordCheckPanel.tsx`); the
 * words come from the mirrored `recordCheck` helper, so both apps and the public page agree.
 *
 * `presetReference` skips the box — a record's own details already know their reference.
 */
import { useEffect, useState } from 'react'
import axios from 'axios'
import { Alert, Button, Group, Stack, Text, TextInput } from '@mantine/core'

import { credentialClaimRows, recordCheckWords, recordKindLabel, type RecordCheck } from '@/lib/recordCheck'

const backend = () => process.env.NEXT_PUBLIC_VC_REPO || process.env.NEXT_PUBLIC_CREDO_BACKEND || 'http://localhost:3000'

export default function RecordCheckPanel({
  presetReference,
  onRevoked,
}: {
  /** When set, the panel checks this record and shows no input box. */
  presetReference?: string
  /** The record's own screen marks it withdrawn locally when the check says so. */
  onRevoked?: () => void
}) {
  const [reference, setReference] = useState(presetReference || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<RecordCheck | null>(null)

  const check = async (id: string) => {
    const trimmed = id.trim()
    if (!trimmed) return
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const res = await axios.get(`${backend()}/api/verify/${encodeURIComponent(trimmed)}`)
      const found = res.data as RecordCheck
      setResult(found)
      if (found?.status === 'revoked') onRevoked?.()
    } catch {
      setError('The check did not complete. Try again in a moment.')
    } finally {
      setLoading(false)
    }
  }

  // A record's own details check themselves the moment they open.
  useEffect(() => {
    if (presetReference) void check(presetReference)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetReference])

  const words = result ? recordCheckWords(result.status) : null
  const rows = credentialClaimRows(result?.subject)
  const kind = recordKindLabel(result?.vcType)

  return (
    <Stack gap="sm">
      {!presetReference && (
        <>
          <TextInput
            label="Record reference"
            placeholder="Paste the reference"
            value={reference}
            onChange={(event) => setReference(event.currentTarget.value)}
          />
          <Button loading={loading} disabled={!reference.trim()} onClick={() => void check(reference)}>
            Check it is still valid
          </Button>
        </>
      )}
      {presetReference && loading && <Text size="sm" c="dimmed">Checking this record…</Text>}
      {error && <Alert color="red">{error}</Alert>}
      {words && result && (
        <Alert color={words.color} title={words.title}>
          <Text size="sm">{words.detail}</Text>
          {(kind || result.issuerName) && (
            <Text size="sm" mt={6}>
              {[kind, result.issuerName ? `From ${result.issuerName}` : ''].filter(Boolean).join(' · ')}
            </Text>
          )}
          {result.issuanceDate && (
            <Text size="xs" c="dimmed" mt={4}>Issued {new Date(result.issuanceDate).toLocaleDateString()}</Text>
          )}
          {rows.length > 0 && (
            <Stack gap={4} mt="sm">
              {rows.slice(0, 6).map((row) => (
                <Group key={row.label} justify="space-between" wrap="nowrap" gap="md">
                  <Text size="xs" c="dimmed">{row.label}</Text>
                  <Text size="xs" fw={500} ta="right">{row.value}</Text>
                </Group>
              ))}
            </Stack>
          )}
        </Alert>
      )}
    </Stack>
  )
}
