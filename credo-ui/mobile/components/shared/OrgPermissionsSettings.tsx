import React, { useEffect, useRef, useState } from 'react'
import {
  ActionIcon,
  Alert,
  Button,
  Collapse,
  Divider,
  Group,
  Menu,
  MultiSelect,
  NumberInput,
  Paper,
  Select,
  Spoiler,
  Stack,
  Text,
  TextInput,
} from '@mantine/core'
import { IconDots, IconPlus } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import api from '@/lib/api'
import { friendlyRequestError } from '@/lib/requestError'
import { useSessionStore } from '@/lib/state/session'
import { PERMISSION_CHOICES, permissionLabel, personLabelById, type OrgPerson } from '../../../shared/orgPeople'

interface OrgRole {
  id: string
  name: string
  description?: string
  membershipRole?: string
  permissions: string[]
}

interface Authority {
  id: string
  userId: string
  role: string
  domain: string
  thresholdAmount?: number
  currency?: string
  status: string
}

export default function OrgPermissionsSettings({
  orgId,
  section,
  onChanged,
}: {
  orgId: string
  section: 'roles' | 'authorities'
  onChanged: () => Promise<void>
}) {
  const scope = useSessionStore((state) => state.scope)
  const [roles, setRoles] = useState<OrgRole[]>([])
  const [members, setMembers] = useState<OrgPerson[]>([])
  const [authorities, setAuthorities] = useState<Authority[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [permissions, setPermissions] = useState(['request.read', 'request.submit'])
  const [userId, setUserId] = useState<string | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [domain, setDomain] = useState<string | null>('operations')
  const [amount, setAmount] = useState<string | number>('')
  const [currency, setCurrency] = useState('USD')
  const [formOpen, setFormOpen] = useState(false)
  const activeScope = useRef(scope)
  activeScope.current = scope
  useEffect(() => {
    setFormOpen(false)
  }, [scope, section])
  const base = `/api/organizations/${encodeURIComponent(orgId)}`

  async function load() {
    const [roleResponse, memberResponse, authorityResponse] = await Promise.all([
      api.get<OrgRole[]>(`${base}/roles`),
      api.get<OrgPerson[]>(`${base}/members`),
      api.get<Authority[]>(`${base}/authorities`),
    ])
    if (activeScope.current !== scope) return
    setRoles(roleResponse.data)
    setMembers(memberResponse.data.filter((member) => member.status === 'active'))
    setAuthorities(authorityResponse.data)
  }

  useEffect(() => {
    setLoading(true)
    setError('')
    setRoles([])
    setAuthorities([])
    setMembers([])
    setUserId(null)
    setRole(null)
    setName('')
    setDescription('')
    setPermissions(['request.read', 'request.submit'])
    setDomain('operations')
    setAmount('')
    setCurrency('USD')
    setBusy(false)
    void load()
      .catch((err) => {
        if (activeScope.current === scope)
          setError(friendlyRequestError(err, 'Could not load organisation permissions.'))
      })
      .finally(() => {
        if (activeScope.current === scope) setLoading(false)
      })
  }, [orgId, scope])

  async function mutate(action: () => Promise<unknown>, title: string) {
    setBusy(true)
    setError('')
    try {
      await action()
      if (activeScope.current !== scope) return
      await load()
      if (activeScope.current !== scope) return
      await onChanged()
      if (activeScope.current !== scope) return
      setFormOpen(false)
      notifications.show({ title, message: 'Saved.', color: 'teal' })
    } catch (err) {
      if (activeScope.current === scope)
        setError(friendlyRequestError(err, 'Could not update organisation permissions.'))
    } finally {
      if (activeScope.current === scope) setBusy(false)
    }
  }

  return (
    <Paper id={`org-card-${section}`} p="md" radius="md" withBorder>
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap">
          <Text fw={700}>{section === 'roles' ? 'Team roles' : 'Active authorities'}</Text>
          <Button
            variant="light"
            leftSection={<IconPlus size={16} />}
            disabled={loading || busy}
            onClick={() => setFormOpen((open) => !open)}
            aria-expanded={formOpen}
          >
            {formOpen ? 'Cancel' : section === 'roles' ? 'Add role' : 'Grant authority'}
          </Button>
        </Group>
        <Text size="sm" c="dimmed">
          {section === 'roles'
            ? 'Choose what each role may do, then assign roles in Team.'
            : 'Choose who may approve work, in which area and up to what amount.'}
        </Text>
        <details>
          <summary style={{ minHeight: 48, cursor: 'pointer', paddingTop: 12 }}>How roles and approvals work</summary>
          <Text size="sm" c="dimmed">
            Roles give permissions. Authorities give approval scope and limits. “Who does what” routes workflow steps;
            it does not grant approval authority.
          </Text>
        </details>
        {error && (
          <Alert color="red" title="Settings unavailable">
            {error}
          </Alert>
        )}
        {loading && <Text size="sm">Loading settings…</Text>}
        {!loading && section === 'roles' && (
          <>
            <Collapse in={formOpen}>
              <Stack gap="sm" mb="md">
                <Text fw={600}>New role</Text>
                <TextInput label="Role name" value={name} onChange={(event) => setName(event.currentTarget.value)} />
                <TextInput
                  label="Description (optional)"
                  value={description}
                  onChange={(event) => setDescription(event.currentTarget.value)}
                />
                <MultiSelect
                  label="What can this role do?"
                  data={Array.from(new Set(PERMISSION_CHOICES.map((choice) => choice.group))).map((group) => ({
                    group,
                    items: PERMISSION_CHOICES.filter((choice) => choice.group === group).map(({ value, label }) => ({
                      value,
                      label,
                    })),
                  }))}
                  value={permissions}
                  onChange={setPermissions}
                />
                <Button
                  loading={busy}
                  disabled={!name.trim() || permissions.length === 0}
                  onClick={() =>
                    void mutate(async () => {
                      await api.post(`${base}/roles`, {
                        name: name.trim(),
                        description: description.trim() || undefined,
                        permissions,
                      })
                      setName('')
                      setDescription('')
                    }, 'Role created')
                  }
                >
                  Create role
                </Button>
                <Divider />
              </Stack>
            </Collapse>
            {roles.map((item) => (
              <Paper key={item.id} p="xs" withBorder>
                <Group justify="space-between" wrap="nowrap">
                  <Text fw={600}>{item.name}</Text>
                  <Menu position="bottom-end" withinPortal>
                    <Menu.Target>
                      <ActionIcon variant="subtle" size={48} disabled={busy} aria-label={`Manage ${item.name} role`}>
                        <IconDots size={20} />
                      </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item
                        color="red"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Delete the ${item.name} role? Existing team members may rely on its permissions.`,
                            )
                          ) {
                            void mutate(
                              () => api.delete(`${base}/roles/${encodeURIComponent(item.id)}`),
                              'Role removed',
                            )
                          }
                        }}
                      >
                        Delete role
                      </Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                </Group>
                <Text size="xs" c="dimmed">
                  {item.description}
                </Text>
                <Spoiler
                  maxHeight={40}
                  showLabel="Show all permissions"
                  hideLabel="Show less"
                  styles={{ control: { minHeight: 48 } }}
                >
                  <Text size="sm" c="dimmed">
                    {item.permissions.map(permissionLabel).join(' · ') || 'No permissions'}
                  </Text>
                </Spoiler>
              </Paper>
            ))}
          </>
        )}
        {!loading && section === 'authorities' && (
          <>
            <Collapse in={formOpen}>
              <Stack gap="sm" mb="md">
                <Text fw={600}>New approval authority</Text>
                <Select
                  label="Team member"
                  data={members.map((member) => ({
                    value: member.userId,
                    label: personLabelById(members, member.userId),
                  }))}
                  value={userId}
                  onChange={(value) => {
                    setUserId(value)
                    setRole(members.find((member) => member.userId === value)?.role || null)
                  }}
                />
                <Select
                  label="Authority role"
                  data={Array.from(
                    new Map(
                      roles
                        .filter((item) => item.membershipRole)
                        .map((item) => [item.membershipRole!, { value: item.membershipRole!, label: item.name }]),
                    ).values(),
                  )}
                  value={role}
                  onChange={setRole}
                />
                <Select
                  label="Approval area"
                  data={[
                    { value: 'finance', label: 'Finance' },
                    { value: 'procurement', label: 'Purchases' },
                    { value: 'hr', label: 'People' },
                    { value: 'operations', label: 'Operations' },
                    { value: 'trust', label: 'Trust' },
                    { value: 'general', label: 'General' },
                  ]}
                  value={domain}
                  onChange={setDomain}
                />
                <NumberInput
                  label="Approval limit (optional)"
                  description="Leave empty for no amount limit."
                  min={0}
                  value={amount}
                  onChange={setAmount}
                />
                {amount !== '' && (
                  <TextInput
                    label="Currency"
                    value={currency}
                    onChange={(event) => setCurrency(event.currentTarget.value.toUpperCase())}
                  />
                )}
                <Button
                  loading={busy}
                  disabled={!userId || !role || !domain || (amount !== '' && !currency.trim())}
                  onClick={() =>
                    void mutate(
                      () =>
                        api.post(`${base}/authorities`, {
                          userId,
                          role,
                          domain,
                          ...(amount !== '' ? { thresholdAmount: Number(amount), currency: currency.trim() } : {}),
                        }),
                      'Authority granted',
                    )
                  }
                >
                  Save authority
                </Button>
                <Divider />
              </Stack>
            </Collapse>
            {authorities
              .filter((item) => item.status === 'active')
              .map((item) => (
                <Paper key={item.id} p="xs" withBorder>
                  <Group justify="space-between" wrap="nowrap">
                    <Text fw={600}>{personLabelById(members, item.userId)}</Text>
                    <Menu position="bottom-end" withinPortal>
                      <Menu.Target>
                        <ActionIcon
                          variant="subtle"
                          size={48}
                          disabled={busy}
                          aria-label={`Manage ${personLabelById(members, item.userId)} authority`}
                        >
                          <IconDots size={20} />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item
                          color="red"
                          onClick={() => {
                            if (window.confirm('Revoke this approval authority?'))
                              void mutate(
                                () => api.delete(`${base}/authorities/${encodeURIComponent(item.id)}`),
                                'Authority revoked',
                              )
                          }}
                        >
                          Revoke authority
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  </Group>
                  <Text size="sm" c="dimmed">
                    {item.role.replace(/_/g, ' ')} ·{' '}
                    {item.domain === 'hr' ? 'People' : item.domain.replace(/^\w/, (letter) => letter.toUpperCase())}
                  </Text>
                  <Text size="sm">
                    {item.thresholdAmount == null
                      ? 'No amount limit'
                      : `${item.currency || ''} ${item.thresholdAmount}`}
                  </Text>
                </Paper>
              ))}
            {authorities.every((item) => item.status !== 'active') && (
              <Text size="sm">No approval authorities yet. Add one when a workflow requires approval authority.</Text>
            )}
          </>
        )}
      </Stack>
    </Paper>
  )
}
