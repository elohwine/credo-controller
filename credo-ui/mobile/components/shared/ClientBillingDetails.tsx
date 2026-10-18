import { useEffect, useState } from 'react'
import { Button, CopyButton, Group, Paper, Stack, Text, TextInput } from '@mantine/core'
import { StageActorTimeline } from './StageActorTimeline'
import { clientBillingStages, CLIENT_BILLING_HELP } from '../../../shared/fieldJobOutcomes'
import { formatTxnTime } from '@/lib/inboxAttention'

export interface ClientBillingDetailsProps {
  run?: any
  link?: any
  canManage: boolean
  busy: boolean
  onSend: (contact: { payerName: string; payerPhone: string }, renew: boolean) => Promise<void>
  onOpenJob?: () => void
}

export function ClientBillingDetails({ run, link, canManage, busy, onSend, onOpenJob }: ClientBillingDetailsProps) {
  const name = link?.payerName || link?.payer_name || run?.input?.clientName || ''
  const phone = link?.payerPhone || run?.input?.customerMsisdn || run?.input?.payerPhone || ''
  const [editing, setEditing] = useState(false)
  const [contact, setContact] = useState({ payerName: name, payerPhone: phone })
  useEffect(() => { setContact({ payerName: name, payerPhone: phone }); setEditing(false) }, [name, phone, run?.id, link?.id])
  const reference = run?.input?.reference || link?.invoiceRef
  const bill = run?.output?.clientBill
  const amount = Number(link?.amount ?? bill?.amount ?? run?.input?.amount ?? 0)
  const currency = link?.currency || run?.input?.currency || 'USD'
  const expired = link?.status === 'expired' || Boolean(link?.expiry && new Date(link.expiry).getTime() <= Date.now())
  const closed = link?.status === 'paid' || link?.status === 'cancelled'
  const valid = Boolean(contact.payerName.trim() && /^\+?[1-9]\d{6,14}$/.test(contact.payerPhone.trim()))
  return (
    <Stack gap="md">
      <Paper withBorder p="md">
        <Text fw={700}>Client billing{reference ? ` · ${reference}` : ''}</Text>
        <Text>{currency} {amount.toFixed(2)}</Text>
        <Text size="sm">Client: {name || 'Not provided'}</Text>
        <Text size="sm">Mobile: {phone || 'Not provided'}</Text>
        <Text size="sm">Reference: {reference || 'Not provided'}</Text>
        <Text size="sm">Link: {link ? expired ? 'Expired' : link.status : 'Not created'}</Text>
        {link?.expiry && <Text size="sm">Expires: {formatTxnTime(link.expiry)}</Text>}
        {link?.obligationId && <Text size="sm">Outstanding: {currency} {Number(link.balanceDue ?? amount).toFixed(2)} · Received: {currency} {Number(link.settledAmount || 0).toFixed(2)}</Text>}
        {!link && !bill?.linkId && <Text size="sm" c="orange" mt="sm">No receivable recorded</Text>}
      </Paper>
      <StageActorTimeline stages={clientBillingStages(run, link)} title="Billing stages" help={CLIENT_BILLING_HELP} />
      {link?.shortlinkUrl && (
        <Paper withBorder p="sm">
          <Text size="sm" style={{ overflowWrap: 'anywhere' }}>{link.shortlinkUrl}</Text>
          <CopyButton value={link.shortlinkUrl}>{({ copied, copy }) => <Button variant="light" size="xs" mt="xs" onClick={copy}>{copied ? 'Copied' : 'Copy payment link'}</Button>}</CopyButton>
        </Paper>
      )}
      {!closed && (
        <Stack gap="sm">
          <Button variant="subtle" disabled={!canManage} onClick={() => setEditing(!editing)}>{editing ? 'Hide contact form' : 'Edit client contact'}</Button>
          {editing && <>
            <TextInput label="Client name" value={contact.payerName} onChange={(event) => setContact({ ...contact, payerName: event.currentTarget.value })} />
            <TextInput label="Client mobile (international format)" value={contact.payerPhone} onChange={(event) => setContact({ ...contact, payerPhone: event.currentTarget.value })} />
          </>}
          <Group>
            <Button disabled={!canManage || !valid || Boolean(link && expired)} loading={busy} onClick={() => void onSend(contact, false)}>{link ? 'Resend payment link' : 'Create invoice and send link'}</Button>
            {link && <Button variant="light" disabled={!canManage || !valid} loading={busy} onClick={() => void onSend(contact, true)}>Renew and resend link</Button>}
          </Group>
        </Stack>
      )}
      {!canManage && <Text size="xs" c="dimmed">Read-only · Finance admin required for changes</Text>}
      {(link?.deliveryHistory || []).map((attempt: any, index: number) => (
        <Paper withBorder p="sm" key={index}>
          <Text size="sm">{attempt.renewed ? 'Renewed link' : 'Payment message'} · {attempt.accepted ? 'Provider accepted' : 'Not sent'} · {formatTxnTime(attempt.at)}</Text>
          {attempt.to && <Text size="xs">{attempt.to}</Text>}
          <Text size="xs" c="dimmed">{attempt.channels?.map((channel: any) => `${channel.channel}: ${channel.status}`).join(' · ')}</Text>
        </Paper>
      ))}
      {onOpenJob && <Button variant="light" onClick={onOpenJob}>Open linked job</Button>}
    </Stack>
  )
}
