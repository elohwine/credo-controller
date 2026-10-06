import React from 'react'
import { Badge, Group, Paper, SimpleGrid, Stack, Text } from '@mantine/core'

interface EvidenceClaim {
  label: string
  value: string
  matched?: boolean
}

interface TransactionEvidencePanelProps {
  title?: string
  transactionId: string
  sourceReference?: string | null
  amount: number
  currency: string
  proofRequestId?: string | null
  proofResponseId?: string | null
  consentTimestamp?: string | null
  updatedAt?: string | null
  claims: EvidenceClaim[]
}

function fmt(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-ZW', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

export function TransactionEvidencePanel({
  title = 'Transaction-Bound Evidence',
  transactionId,
  sourceReference,
  amount,
  currency,
  proofRequestId,
  proofResponseId,
  consentTimestamp,
  updatedAt,
  claims,
}: TransactionEvidencePanelProps) {
  const matchedClaims = claims.filter((claim) => claim.matched !== false).length
  const totalClaims = claims.length || 1
  const matchPercent = Math.round((matchedClaims / totalClaims) * 100)

  return (
    <Paper p="sm" radius="md" withBorder>
      <Group justify="space-between" align="flex-start" mb="xs">
        <div>
          <Text fw={700} size="sm">{title}</Text>
          <Text size="xs" c="dimmed">Claim-level linkage for this workflow transaction.</Text>
        </div>
        <Badge color={matchPercent >= 80 ? 'teal' : 'orange'} variant="light" size="sm">
          {`${matchPercent}% claim match`}
        </Badge>
      </Group>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm" mb="sm">
        <Paper p="sm" radius="md" withBorder>
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Transaction Reference</Text>
          <Text fw={600} size="xs" style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{transactionId}</Text>
          <Text size="xs" c="dimmed" mt={4}>{sourceReference ? `Source: ${sourceReference}` : 'No source link reference'}</Text>
        </Paper>
        <Paper p="sm" radius="md" withBorder>
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Evidence Anchors</Text>
          <Text fw={700} size="sm">{fmt(amount, currency)}</Text>
          <Text size="xs" c="dimmed" mt={4}>{proofResponseId ? 'Verifier response anchored' : proofRequestId ? 'Proof challenge issued' : 'Proof challenge not issued'}</Text>
          <Text size="xs" c="dimmed">{consentTimestamp ? `Consent at ${new Date(consentTimestamp).toLocaleString()}` : 'No consent timestamp'}</Text>
        </Paper>
      </SimpleGrid>

      <Stack gap={6}>
        {claims.map((claim) => (
          <Group key={`${claim.label}:${claim.value}`} justify="space-between" align="center" gap="sm">
            <Text size="xs" c="dimmed">{claim.label}</Text>
            <Group gap={6} wrap="nowrap">
              <Text size="xs" fw={600} style={{ maxWidth: 260, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {claim.value}
              </Text>
              <Badge size="xs" color={claim.matched === false ? 'orange' : 'teal'} variant="light">
                {claim.matched === false ? 'review' : 'matched'}
              </Badge>
            </Group>
          </Group>
        ))}
      </Stack>

      <Text size="xs" c="dimmed" mt="sm">
        Last ledger update: {updatedAt ? new Date(updatedAt).toLocaleString() : 'No timestamp yet'}
      </Text>
    </Paper>
  )
}