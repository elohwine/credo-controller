import React, { useEffect, useState } from 'react'
import axios from 'axios'
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Code,
  Container,
  CopyButton,
  Group,
  Modal,
  Paper,
  Radio,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core'
import { IconKey, IconLogin2, IconPlugConnected, IconPlus } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'

import Layout from '@/components/Layout'
import ConnectedRecordTypes from '@/components/organization/ConnectedRecordTypes'
import { useRequireOrgContext } from '@/lib/portalContext'
import { getOrgScopedToken, getPersonalToken } from '@/utils/organizationContext'

interface PartnerClient {
  clientId: string
  name: string
  redirectUris: string[]
  policy: {
    releaseClaims: string[]
    audience: 'any' | 'org_members'
    operations?: Operation[]
    recipientScope?: RecipientScope
  }
  status: 'active' | 'revoked'
  createdAt: string
  secretRotatedAt: string | null
  revokedAt: string | null
}

type Operation = 'sign_in' | 'send_records'
type RecipientScope = 'org_members' | 'any_registered'

interface Settings {
  releasableClaims: string[]
  bridgeConfigured: boolean
  issuerUrl: string | null
}

interface Draft {
  clientId?: string
  name: string
  redirectUris: string
  releaseClaims: string[]
  audience: 'any' | 'org_members'
  operations: Operation[]
  recipientScope: RecipientScope
}

const operationsOf = (client: PartnerClient): Operation[] => client.policy.operations?.length ? client.policy.operations : ['sign_in']

const CLAIM_LABELS: Record<string, string> = {
  displayName: 'Name',
  verificationLevel: 'Verification level',
  phone: 'Phone number',
  email: 'Email address',
}

const EMPTY_DRAFT: Draft = {
  name: '',
  redirectUris: '',
  releaseClaims: ['displayName', 'verificationLevel'],
  audience: 'any',
  operations: ['sign_in'],
  recipientScope: 'org_members',
}

export default function SignInPartnersPage() {
  useRequireOrgContext('/organization/setup')

  const backendUrl = process.env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000'
  const headers = () => ({ Authorization: `Bearer ${getOrgScopedToken() || getPersonalToken()}` })

  const [clients, setClients] = useState<PartnerClient[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [secret, setSecret] = useState<{ clientId: string; clientSecret: string; name: string } | null>(null)
  const [revoking, setRevoking] = useState<PartnerClient | null>(null)

  const load = async () => {
    setError(null)
    try {
      const res = await axios.get<{ clients: PartnerClient[]; settings: Settings }>(
        `${backendUrl}/api/organizations/partner-clients`,
        { headers: headers() },
      )
      const list = res.data.clients || []
      setClients([...list.filter((c) => c.status === 'active'), ...list.filter((c) => c.status !== 'active')])
      setSettings(res.data.settings)
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Could not load connected systems')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const failed = (title: string, err: any) =>
    notifications.show({ title, message: err?.response?.data?.message || err?.message, color: 'red' })

  const save = async () => {
    if (!draft) return
    const signIn = draft.operations.includes('sign_in')
    const body = {
      name: draft.name.trim(),
      redirectUris: signIn ? draft.redirectUris.split('\n').map((uri) => uri.trim()).filter(Boolean) : [],
      releaseClaims: draft.releaseClaims,
      audience: draft.audience,
      recipientScope: draft.recipientScope,
      ...(draft.clientId ? {} : { operations: draft.operations }),
    }
    setSaving(true)
    try {
      if (draft.clientId) {
        await axios.patch(`${backendUrl}/api/organizations/partner-clients/${encodeURIComponent(draft.clientId)}`, body, {
          headers: headers(),
        })
        notifications.show({ title: 'Saved', message: `${body.name} is updated.`, color: 'green' })
      } else {
        const res = await axios.post(`${backendUrl}/api/organizations/partner-clients`, body, { headers: headers() })
        setSecret({ clientId: res.data.clientId, clientSecret: res.data.clientSecret, name: res.data.name })
      }
      setDraft(null)
      await load()
    } catch (err: any) {
      failed('Could not save', err)
    } finally {
      setSaving(false)
    }
  }

  const rotate = async (client: PartnerClient) => {
    try {
      const res = await axios.post(
        `${backendUrl}/api/organizations/partner-clients/${encodeURIComponent(client.clientId)}/rotate-secret`,
        {},
        { headers: headers() },
      )
      setSecret({ clientId: res.data.clientId, clientSecret: res.data.clientSecret, name: res.data.name })
      await load()
    } catch (err: any) {
      failed('Could not issue a new secret', err)
    }
  }

  const revoke = async () => {
    if (!revoking) return
    try {
      await axios.post(
        `${backendUrl}/api/organizations/partner-clients/${encodeURIComponent(revoking.clientId)}/revoke`,
        {},
        { headers: headers() },
      )
      notifications.show({ title: 'Turned off', message: `${revoking.name} can no longer connect.`, color: 'green' })
      setRevoking(null)
      await load()
    } catch (err: any) {
      failed('Could not turn off', err)
    }
  }

  const edit = (client: PartnerClient) =>
    setDraft({
      clientId: client.clientId,
      name: client.name,
      redirectUris: client.redirectUris.join('\n'),
      releaseClaims: client.policy.releaseClaims,
      audience: client.policy.audience,
      operations: operationsOf(client),
      recipientScope: client.policy.recipientScope || 'org_members',
    })

  const draftSignsIn = Boolean(draft?.operations.includes('sign_in'))
  const draftSends = Boolean(draft?.operations.includes('send_records'))

  return (
    <Layout title="Connected systems">
      <Container size="md" py="lg">
        <Stack gap="lg">
          <Group justify="space-between" align="flex-start">
            <div>
              <Title order={2}>Connected systems</Title>
              <Text c="dimmed" size="sm" mt={4}>
                Connect the software you already use. A system can sign people in with their Credentis wallet, send
                your records into people&apos;s wallets, or both. Keep running your accounts, HR or school system as
                it is; Credentis carries the trusted record.
              </Text>
            </div>
            <Button leftSection={<IconPlus size={16} />} onClick={() => setDraft({ ...EMPTY_DRAFT })}>
              Add system
            </Button>
          </Group>

          {error && <Alert color="red">{error}</Alert>}

          {settings && (
            <Paper withBorder p="md">
              <Text fw={600} mb={4}>
                How systems connect
              </Text>
              {settings.issuerUrl ? (
                <Text size="sm">
                  Standard OpenID Connect sign-in. Issuer: <Code>{settings.issuerUrl}</Code>
                </Text>
              ) : (
                <Text size="sm" c="dimmed">
                  Standard OpenID Connect sign-in is not switched on for this platform yet. Partners can still use the
                  direct verification API with their client ID and secret.
                </Text>
              )}
              <Text size="sm" mt={6}>
                Sending records: <Code>POST /api/partner/v1/records</Code> with the client ID and secret (HTTP Basic) and
                an <Code>Idempotency-Key</Code> header. Repeating a key never sends the record twice.
              </Text>
            </Paper>
          )}

          {clients.length === 0 && !error && (
            <Text c="dimmed" size="sm">
              No connected systems yet.
            </Text>
          )}

          {clients.map((client) => (
            <Paper key={client.clientId} withBorder p="md">
              <Group justify="space-between" align="flex-start">
                <Stack gap={4}>
                  <Group gap="xs">
                    {operationsOf(client).includes('sign_in') ? <IconLogin2 size={18} /> : <IconPlugConnected size={18} />}
                    <Text fw={600}>{client.name}</Text>
                    <Badge color={client.status === 'active' ? 'teal' : 'gray'} variant="light">
                      {client.status === 'active' ? 'On' : 'Off'}
                    </Badge>
                  </Group>
                  <Group gap={6}>
                    {operationsOf(client).map((operation) => (
                      <Badge key={operation} size="sm" variant="outline" color="gray">
                        {operation === 'sign_in' ? 'Signs people in' : 'Sends records'}
                      </Badge>
                    ))}
                  </Group>
                  <Text size="xs" c="dimmed">
                    Client ID <Code>{client.clientId}</Code>
                  </Text>
                  {operationsOf(client).includes('sign_in') && (
                    <>
                      <Text size="sm">
                        Shares: {client.policy.releaseClaims.map((claim) => CLAIM_LABELS[claim] || claim).join(', ') || 'nothing beyond sign-in'}
                      </Text>
                      <Text size="sm">
                        Who can sign in: {client.policy.audience === 'org_members' ? 'members of this organisation' : 'anyone with a verified wallet'}
                      </Text>
                      <Text size="xs" c="dimmed">
                        Returns to: {client.redirectUris.join(', ')}
                      </Text>
                    </>
                  )}
                  {operationsOf(client).includes('send_records') && (
                    <Text size="sm">
                      Sends records to:{' '}
                      {client.policy.recipientScope === 'any_registered'
                        ? 'anyone with a Credentis wallet'
                        : 'members of this organisation'}
                    </Text>
                  )}
                </Stack>
                {client.status === 'active' && (
                  <Group gap="xs">
                    <Button size="xs" variant="default" onClick={() => edit(client)}>
                      Change
                    </Button>
                    <Button size="xs" variant="default" leftSection={<IconKey size={14} />} onClick={() => void rotate(client)}>
                      New secret
                    </Button>
                    <Button size="xs" color="red" variant="light" onClick={() => setRevoking(client)}>
                      Turn off
                    </Button>
                  </Group>
                )}
              </Group>
            </Paper>
          ))}

          <ConnectedRecordTypes backendUrl={backendUrl} headers={headers} />
        </Stack>
      </Container>

      <Modal opened={Boolean(draft)} onClose={() => setDraft(null)} title={draft?.clientId ? 'Change system' : 'Add system'}>
        {draft && (
          <Stack>
            <TextInput
              label="System name"
              description="People see this in their wallet, e.g. your school system or online shop."
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.currentTarget.value })}
            />
            <Checkbox.Group
              label="What this system does"
              description={draft.clientId ? 'Fixed once added. Add another system for a different job.' : undefined}
              value={draft.operations}
              onChange={(value) => setDraft({ ...draft, operations: value as Operation[] })}
            >
              <Stack gap={6} mt={6}>
                <Checkbox value="sign_in" label="Signs people in with their wallet" disabled={Boolean(draft.clientId)} />
                <Checkbox value="send_records" label="Sends our records to people's wallets" disabled={Boolean(draft.clientId)} />
              </Stack>
            </Checkbox.Group>
            {draftSends && (
              <Radio.Group
                label="Who it can send records to"
                value={draft.recipientScope}
                onChange={(value) => setDraft({ ...draft, recipientScope: value as RecipientScope })}
              >
                <Stack gap={6} mt={6}>
                  <Radio value="org_members" label="Only members of this organisation" />
                  <Radio value="any_registered" label="Anyone with a Credentis wallet (customers, students, patients)" />
                </Stack>
              </Radio.Group>
            )}
            {draftSignsIn && (
            <>
            <Textarea
              label="Return addresses"
              description="Where the partner receives the person after sign-in. One per line, https only."
              autosize
              minRows={2}
              value={draft.redirectUris}
              onChange={(e) => setDraft({ ...draft, redirectUris: e.currentTarget.value })}
            />
            <Checkbox.Group
              label="What the partner may see"
              value={draft.releaseClaims}
              onChange={(value) => setDraft({ ...draft, releaseClaims: value })}
            >
              <Stack gap={6} mt={6}>
                {(settings?.releasableClaims || Object.keys(CLAIM_LABELS)).map((claim) => (
                  <Checkbox key={claim} value={claim} label={CLAIM_LABELS[claim] || claim} />
                ))}
              </Stack>
            </Checkbox.Group>
            <Radio.Group
              label="Who can sign in"
              value={draft.audience}
              onChange={(value) => setDraft({ ...draft, audience: value as Draft['audience'] })}
            >
              <Stack gap={6} mt={6}>
                <Radio value="any" label="Anyone with a verified wallet" />
                <Radio value="org_members" label="Only members of this organisation" />
              </Stack>
            </Radio.Group>
            </>
            )}
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button loading={saving} disabled={!draft.name.trim() || draft.operations.length === 0 || (draftSignsIn && !draft.redirectUris.trim())} onClick={() => void save()}>
                Save
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>

      <Modal opened={Boolean(secret)} onClose={() => setSecret(null)} title="Give these to the system" closeOnClickOutside={false}>
        {secret && (
          <Stack>
            <Alert color="yellow">This secret is shown only once. Copy it now and send it to {secret.name} securely.</Alert>
            <div>
              <Text size="sm" fw={600}>
                Client ID
              </Text>
              <Group gap="xs" wrap="nowrap">
                <Code style={{ wordBreak: 'break-all' }}>{secret.clientId}</Code>
                <CopyButton value={secret.clientId}>
                  {({ copied, copy }) => (
                    <Button size="xs" variant="default" onClick={copy}>
                      {copied ? 'Copied' : 'Copy'}
                    </Button>
                  )}
                </CopyButton>
              </Group>
            </div>
            <div>
              <Text size="sm" fw={600}>
                Client secret
              </Text>
              <Group gap="xs" wrap="nowrap">
                <Code style={{ wordBreak: 'break-all' }}>{secret.clientSecret}</Code>
                <CopyButton value={secret.clientSecret}>
                  {({ copied, copy }) => (
                    <Button size="xs" variant="default" onClick={copy}>
                      {copied ? 'Copied' : 'Copy'}
                    </Button>
                  )}
                </CopyButton>
              </Group>
            </div>
            <Group justify="flex-end">
              <Button onClick={() => setSecret(null)}>Done</Button>
            </Group>
          </Stack>
        )}
      </Modal>

      <Modal opened={Boolean(revoking)} onClose={() => setRevoking(null)} title="Turn off this system?">
        {revoking && (
          <Stack>
            <Text size="sm">
              {revoking.name} will stop connecting straight away. Records already sent stay in people&apos;s wallets.
              This cannot be undone; add the system again if you need it back.
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setRevoking(null)}>
                Keep on
              </Button>
              <Button color="red" onClick={() => void revoke()}>
                Turn off
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Layout>
  )
}
