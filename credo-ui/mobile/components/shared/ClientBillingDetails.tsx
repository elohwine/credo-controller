import { useEffect, useState } from 'react'
import { Button, CopyButton, Group, Paper, Stack, Text, TextInput } from '@mantine/core'
import { ContactPickerSelect, type PickerContact } from './ContactPickerSelect'
import { StageActorTimeline } from './StageActorTimeline'
import { clientBillingStages, CLIENT_BILLING_HELP } from '../../../shared/fieldJobOutcomes'
import { formatTxnTime } from '@/lib/inboxAttention'

export interface ClientBillingDetailsProps {
  run?: any
  link?: any
  canManage: boolean
  busy: boolean
  onSend: (contact: { payerName: string; payerPhone: string }, renew: boolean) => Promise<void>
  /** Save the client on an existing bill without sending; the panel then offers to send it. */
  onSavePayer?: (contact: { payerName: string; payerPhone: string }) => Promise<{ changed: boolean; needsRenewal: boolean } | undefined>
  onOpenJob?: () => void
  /** Saved contacts and team members to bill instead of typing the client in. */
  contacts?: PickerContact[]
}

export function ClientBillingDetails({ run, link, canManage, busy, onSend, onSavePayer, onOpenJob, contacts = [] }: ClientBillingDetailsProps) {
  const name = link?.payerName || link?.payer_name || run?.input?.clientName || ''
  const phone = link?.payerPhone || run?.input?.customerMsisdn || run?.input?.payerPhone || ''
  const [editing, setEditing] = useState(false)
  const [contact, setContact] = useState({ payerName: name, payerPhone: phone })
  const [pickedId, setPickedId] = useState<string | null>(null)
  // After the client is saved: offer to send the bill to them, renewing it first when it has expired.
  const [offerSend, setOfferSend] = useState<{ payerName: string; payerPhone: string; renew: boolean } | null>(null)
  // Nobody to bill yet: open the form so the client can be picked straight away.
  useEffect(() => { setContact({ payerName: name, payerPhone: phone }); setPickedId(null); setEditing(!name || !phone) }, [name, phone, run?.id, link?.id])
  const reference = run?.input?.reference || link?.invoiceRef
  const bill = run?.output?.clientBill
  const amount = Number(link?.amount ?? bill?.amount ?? run?.input?.amount ?? 0)
  const currency = link?.currency || run?.input?.currency || 'USD'
  const expired = link?.status === 'expired' || Boolean(link?.expiry && new Date(link.expiry).getTime() <= Date.now())
  const closed = link?.status === 'paid' || link?.status === 'cancelled'
  const valid = Boolean(contact.payerName.trim() && /^\+?[1-9]\d{6,14}$/.test(contact.payerPhone.trim()))
  const dirty = contact.payerName.trim() !== name.trim() || contact.payerPhone.trim() !== phone.trim()
  const trimmed = { payerName: contact.payerName.trim(), payerPhone: contact.payerPhone.trim() }
  const saveOnly = async () => {
    const saved = await onSavePayer?.(trimmed)
    if (!saved) return
    setEditing(false)
    if (saved.changed) setOfferSend({ ...trimmed, renew: saved.needsRenewal })
  }
  const send = async (target: { payerName: string; payerPhone: string }, renew: boolean) => {
    setOfferSend(null)
    await onSend(target, renew)
  }
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
      {!closed && offerSend && (
        <Paper withBorder p="md" style={{ borderColor: 'var(--mantine-color-teal-5)' }}>
          <Text fw={600}>Client details saved</Text>
          <Text size="sm" mt={4}>
            Send the bill to {offerSend.payerName} ({offerSend.payerPhone}) now? It goes to their WhatsApp and, if they use Credentis, their inbox.
            {offerSend.renew ? ' The old link has expired, so a new one is made first.' : ''}
          </Text>
          <Group mt="sm">
            <Button color="teal" disabled={!canManage} loading={busy} onClick={() => void send(offerSend, offerSend.renew)}>
              {offerSend.renew ? `Renew and send to ${offerSend.payerName}` : `Send to ${offerSend.payerName}`}
            </Button>
            <Button variant="subtle" onClick={() => setOfferSend(null)}>Not now</Button>
          </Group>
        </Paper>
      )}
      {!closed && (
        <Stack gap="sm">
          <Button variant="subtle" disabled={!canManage} onClick={() => setEditing(!editing)}>{editing ? 'Hide contact form' : name || phone ? 'Edit client details' : 'Add client details'}</Button>
          {editing && <>
            <ContactPickerSelect
              contacts={contacts}
              value={pickedId}
              disabled={!canManage}
              label="Bill a saved contact"
              description="Fills the name and mobile below. You can still change them."
              onPick={(picked) => {
                setPickedId(picked?.id || null)
                if (picked) setContact({ payerName: picked.name || contact.payerName, payerPhone: picked.phone || contact.payerPhone })
              }}
            />
            <TextInput label="Client name" value={contact.payerName} onChange={(event) => setContact({ ...contact, payerName: event.currentTarget.value })} />
            <TextInput label="Client mobile (international format)" value={contact.payerPhone} onChange={(event) => setContact({ ...contact, payerPhone: event.currentTarget.value })} />
            {link && onSavePayer && (
              <Group>
                <Button variant="light" disabled={!canManage || !valid || !dirty} loading={busy} onClick={() => void saveOnly()}>Save client details</Button>
                <Button disabled={!canManage || !valid || !dirty} loading={busy} onClick={() => void send(trimmed, expired)}>{expired ? 'Save, renew and send' : 'Save and send'}</Button>
              </Group>
            )}
          </>}
          {!link && (
            <Button disabled={!canManage || !valid} loading={busy} onClick={() => void send(trimmed, false)}>Create invoice and send link</Button>
          )}
          {link && !(editing && dirty && onSavePayer) && (
            <>
              {expired && <Text size="sm" c="orange">This link has expired. Renewing makes a new link (valid 14 days) and sends it; the old one stops working.</Text>}
              <Group>
                {!expired && <Button disabled={!canManage || !valid} loading={busy} onClick={() => void send(trimmed, false)}>Resend payment link</Button>}
                <Button variant={expired ? 'filled' : 'light'} disabled={!canManage || !valid} loading={busy} onClick={() => void send(trimmed, true)}>{expired ? 'Renew and send link' : 'Renew and resend link'}</Button>
              </Group>
            </>
          )}
        </Stack>
      )}
      {!canManage && <Text size="xs" c="dimmed">Read-only · Finance admin required for changes</Text>}
      {[...(link?.deliveryHistory || [])].reverse().map((attempt: any, index: number) => (
        <Paper withBorder p="sm" key={index}>
          <Text size="sm">{attempt.renewed ? 'Renewed link sent' : 'Payment message'} · {attempt.accepted ? 'Sent' : attempt.channels?.some((channel: any) => channel.status === 'queued') ? 'Queued' : 'Not sent'} · {formatTxnTime(attempt.at)}</Text>
          {attempt.to && <Text size="xs">{attempt.to}</Text>}
          <Text size="xs" c="dimmed">{attempt.channels?.map((channel: any) => `${channel.channel}: ${channel.status}`).join(' · ')}</Text>
        </Paper>
      ))}
      {onOpenJob && <Button variant="light" onClick={onOpenJob}>Open linked job</Button>}
    </Stack>
  )
}
