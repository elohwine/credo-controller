import { feedback } from '@/lib/feedback';
import React, { useEffect, useState } from 'react'
import axios from 'axios'
import Layout from '@/components/Layout'
import { getOrgScopedToken, readActiveOrganization, getPersonalToken } from '@/utils/organizationContext'
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  Container,
  Divider,
  Group,
  Modal,
  Paper,
  Radio,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { IconAlertCircle, IconCheck, IconCircleCheck, IconClock, IconPlus, IconSend, IconTrash, IconUsers } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'

import { useRequireOrgContext } from '@/lib/portalContext'
import { personLabel, roleLabel } from '@/lib/orgPeople'
import { TEAM_ROLE_FALLBACK, teamRolesFromCatalog } from '@/utils/orgProfile'
import {
  CARD_STATE_COLOR,
  CARD_STATE_LABEL,
  ONBOARDING_PATH,
  SUMMARY_COLOR,
  SUMMARY_LABEL,
  DEFAULT_STAFF_CARD_CHANGE,
  STAFF_CARD_CHANGE_OPTIONS,
  cardCanResend,
  cardPurpose,
  cardResendHint,
  memberAccessBadge,
  readyCount,
  sendCardsPath,
  staffCardChangeRule,
  type MemberCardKind,
  type MemberOnboarding,
  type StaffCardChangeRule,
} from '@/lib/orgOnboarding'
import { SETUP_PROFILE_PATH } from '@/utils/orgProfile'
interface OrgMember {
  userId: string
  role: string
  status: string
  createdAt: string
  displayName?: string
  phone?: string
  invitePending?: boolean
}


export default function OrganizationPeoplePage() {
  // Org-only surface: personal sessions are redirected (mirrors mobile /finance → /inbox).
  useRequireOrgContext('/organization/setup')

  const [orgTenantId, setOrgTenantId] = useState('')
  const [orgName, setOrgName] = useState('')
  const [members, setMembers] = useState<OrgMember[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [invitePhone, setInvitePhone] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteRole, setInviteRole] = useState<string>('member')
  const [inviteWhatsApp, setInviteWhatsApp] = useState(true)
  const [resendingInvite, setResendingInvite] = useState<string | null>(null)
  const [inviting, setInviting] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const [changingRole, setChangingRole] = useState<string | null>(null)
  const [onboarding, setOnboarding] = useState<Record<string, MemberOnboarding>>({})
  const [detailUserId, setDetailUserId] = useState<string | null>(null)
  const [sending, setSending] = useState<string | null>(null)
  const [staffCardChange, setStaffCardChange] = useState<StaffCardChangeRule>(DEFAULT_STAFF_CARD_CHANGE)
  const [savingStaffCardChange, setSavingStaffCardChange] = useState(false)

  const [roleChoices, setRoleChoices] = useState(TEAM_ROLE_FALLBACK)

  const backendUrl = process.env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000'

  useEffect(() => {
    const activeOrg = readActiveOrganization()
    if (activeOrg?.orgTenantId) {
      setOrgTenantId(activeOrg.orgTenantId)
      setOrgName(activeOrg.name)
    }
  }, [])

  useEffect(() => {
    if (orgTenantId) {
      void loadMembers()
      void loadStaffCardChange()
      void loadRoleChoices()
    }
  }, [orgTenantId])

  const loadRoleChoices = async () => {
    const token = getOrgScopedToken() || getPersonalToken()
    if (!token || !orgTenantId) return
    try {
      const res = await axios.get(`${backendUrl}/api/organizations/${encodeURIComponent(orgTenantId)}/roles`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const list = Array.isArray(res.data) ? res.data : []
      const fromSetup = teamRolesFromCatalog(list)
      setRoleChoices(fromSetup.length > 0 ? fromSetup : TEAM_ROLE_FALLBACK)
    } catch {
      setRoleChoices(TEAM_ROLE_FALLBACK)
    }
  }

  useEffect(() => {
    if (!roleChoices.some((choice) => choice.value === inviteRole)) {
      setInviteRole(roleChoices[0]?.value || 'member')
    }
  }, [roleChoices, inviteRole])

  const getToken = () => getOrgScopedToken() || getPersonalToken()

  const profileUrl = () => `${backendUrl}/api/organizations/${encodeURIComponent(orgTenantId)}${SETUP_PROFILE_PATH}`

  /** Organisation setting: what happens to an earlier staff card when a role changes. */
  const loadStaffCardChange = async () => {
    const token = getToken()
    if (!token || !orgTenantId) return
    try {
      const res = await axios.get(profileUrl(), { headers: { Authorization: `Bearer ${token}` } })
      setStaffCardChange(staffCardChangeRule(res.data?.staffCardChange))
    } catch {
      // Keep the default; the table still works.
    }
  }

  const handleStaffCardChange = async (value: string) => {
    const token = getToken()
    const rule = staffCardChangeRule(value)
    if (!token || !orgTenantId) return
    const previous = staffCardChange
    setStaffCardChange(rule)
    setSavingStaffCardChange(true)
    try {
      await axios.put(profileUrl(), { staffCardChange: rule }, { headers: { Authorization: `Bearer ${token}` } })
      feedback.success('Applies the next time a role changes.', { title: 'Saved' })
    } catch (err: any) {
      setStaffCardChange(previous)
      feedback.fromError(err, { title: 'Could not save' })
    } finally {
      setSavingStaffCardChange(false)
    }
  }

  const loadMembers = async () => {
    const token = getToken()
    if (!token || !orgTenantId) return
    setLoading(true)
    setError(null)
    try {
      const res = await axios.get<OrgMember[]>(
        `${backendUrl}/api/organizations/${encodeURIComponent(orgTenantId)}/members`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      const list = Array.isArray(res.data) ? res.data : Array.isArray((res.data as any).members) ? (res.data as any).members : []
      setMembers(list)
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load members')
    } finally {
      setLoading(false)
    }
    void loadOnboarding()
  }

  /** What each person still has to do (app, identity card, staff card, role cards). */
  const loadOnboarding = async () => {
    const token = getToken()
    if (!token || !orgTenantId) return
    try {
      const res = await axios.get<MemberOnboarding[]>(
        `${backendUrl}/api/organizations/${encodeURIComponent(orgTenantId)}${ONBOARDING_PATH}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      const map: Record<string, MemberOnboarding> = {}
      for (const row of Array.isArray(res.data) ? res.data : []) map[row.userId] = row
      setOnboarding(map)
    } catch {
      // The table still works without it.
    }
  }

  const handleSendCards = async (userId: string, kind: MemberCardKind | 'all') => {
    const token = getToken()
    if (!token || !orgTenantId) return
    setSending(`${userId}:${kind}`)
    try {
      const res = await axios.post(
        `${backendUrl}/api/organizations/${encodeURIComponent(orgTenantId)}${sendCardsPath(userId)}`,
        { kind },
        { headers: { Authorization: `Bearer ${token}` } },
      )
      const sent: string[] = res.data?.sent || []
      const skipped: Array<{ reason: string }> = res.data?.skipped || []
      if (res.data?.member) setOnboarding((prev) => ({ ...prev, [userId]: res.data.member }))
      notifications.show({
        title: sent.length > 0 ? 'Sent' : 'Nothing new to send',
        message:
          sent.length > 0
            ? 'They will find it in their app inbox.'
            : skipped[0]?.reason || 'Everything they need is already in their app.',
        color: sent.length > 0 ? 'green' : 'gray',
      })
    } catch (err: any) {
      feedback.fromError(err, { title: 'Could not send' })
    } finally {
      setSending(null)
    }
  }

  const showInviteResult = async (invite: { channel?: string; link?: string } | undefined, message: string, title: string) => {
    if (invite?.channel === 'link' && invite.link) {
      const copied = await navigator.clipboard?.writeText(invite.link).then(() => true).catch(() => false)
      notifications.show({
        title,
        message: `${message} ${copied ? 'The invite link is copied. Send it to them yourself.' : `Send them this link: ${invite.link}`}`,
        color: 'orange',
        autoClose: false,
      })
      return
    }
    notifications.show({ title, message, color: 'green', icon: <IconCheck size={16} /> })
  }

  const handleResendInvite = async (userId: string) => {
    const token = getToken()
    if (!token || !orgTenantId) return
    setResendingInvite(userId)
    try {
      const res = await axios.post(
        `${backendUrl}/api/organizations/${encodeURIComponent(orgTenantId)}/members/${encodeURIComponent(userId)}/resend-invite`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      )
      await showInviteResult(res.data?.invite, res.data?.message || 'Invite sent again', 'Invite sent')
      void loadMembers()
    } catch (err: any) {
      feedback.fromError(err, { title: 'Could not resend' })
    } finally {
      setResendingInvite(null)
    }
  }

  const handleInvite = async () => {
    const token = getToken()
    if (!token || !orgTenantId || !invitePhone.trim() || inviteName.trim().length < 2) return
    setInviting(true)
    try {
      const res = await axios.post(
        `${backendUrl}/api/organizations/${encodeURIComponent(orgTenantId)}/members/invite`,
        { phone: invitePhone.trim(), role: inviteRole, name: inviteName.trim(), whatsappConsent: inviteWhatsApp },
        { headers: { Authorization: `Bearer ${token}` } },
      )
      await showInviteResult(res.data?.invite, res.data?.message || invitePhone.trim(), 'On the team')
      setInvitePhone('')
      setInviteName('')
      setInviteOpen(false)
      void loadMembers()
    } catch (err: any) {
      feedback.fromError(err, { title: 'Invite failed' })
    } finally {
      setInviting(false)
    }
  }

  const handleRoleChange = async (userId: string, role: string | null) => {
    const token = getToken()
    if (!token || !orgTenantId || !role) return
    setChangingRole(userId)
    try {
      await axios.patch(
        `${backendUrl}/api/organizations/${encodeURIComponent(orgTenantId)}/members/${encodeURIComponent(userId)}`,
        { role },
        { headers: { Authorization: `Bearer ${token}` } },
      )
      feedback.success(`${roleLabel(role)}. A new staff card is on its way to their app inbox.${['owner', 'admin'].includes(String(role).toLowerCase()) ? ' Once they accept it, they can open the organisation and its dashboard.' : ' Their jobs and approvals come to their personal inbox.'}`, { title: 'Role updated' })
      void loadMembers()
    } catch (err: any) {
      feedback.fromError(err, { title: 'Could not change role' })
    } finally {
      setChangingRole(null)
    }
  }

  const handleRemove = async (userId: string) => {
    const token = getToken()
    if (!token || !orgTenantId) return
    const who = members.find((m) => m.userId === userId)
    if (!window.confirm(`Remove ${who ? personLabel(who) : 'this person'} from the organization?`)) return
    setRemoving(userId)
    try {
      await axios.delete(
        `${backendUrl}/api/organizations/${encodeURIComponent(orgTenantId)}/members/${encodeURIComponent(userId)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      feedback.info(who ? personLabel(who) : 'Team member', { title: 'Removed' })
      void loadMembers()
    } catch (err: any) {
      feedback.fromError(err, { title: 'Remove failed' })
    } finally {
      setRemoving(null)
    }
  }

  return (
    <Layout title="People">
      <Container size="xl" py="lg">
        <Stack gap="lg">
          <Paper withBorder={false}>
            <Group justify="space-between" align="center" wrap="wrap">
              <Box>
                <Group gap="xs" mb={4}>
                  <IconUsers size={20} />
                  <Title order={2}>People</Title>
                </Group>
                <Text c="dimmed" size="sm">
                  {orgName ? `Members of ${orgName}` : 'Manage organization members, roles, and invitations.'}
                </Text>
              </Box>
              <Group gap="xs">
                <Button variant="default" size="sm" component="a" href="/organization/setup">
                  ← Setup Center
                </Button>
                <Button leftSection={<IconPlus size={16} />} size="sm" onClick={() => setInviteOpen(true)} disabled={!orgTenantId}>
                  Invite Member
                </Button>
              </Group>
            </Group>
          </Paper>

          {!orgTenantId && (
            <Alert icon={<IconAlertCircle size={16} />} color="yellow" title="No organization selected">
              Use the account picker in the header to switch into an organization context first.
            </Alert>
          )}

          {error && (
            <Alert icon={<IconAlertCircle size={16} />} color="red" title="Error">
              {error}
            </Alert>
          )}

          {orgTenantId && (
            <Card withBorder radius="md" p="lg">
              <Group justify="space-between" mb="md">
                <Box>
                  <Title order={4}>Team Members</Title>
                  {members.length > 0 && Object.keys(onboarding).length > 0 && (() => {
                    const counts = readyCount(Object.values(onboarding))
                    return (
                      <Text size="sm" c="dimmed" mt={2}>
                        {counts.ready === counts.total
                          ? 'Everyone has what they need in the app.'
                          : `${counts.ready} of ${counts.total} ready. Open a person to see what is still missing.`}
                      </Text>
                    )
                  })()}
                </Box>
                <Badge variant="light">{members.length}</Badge>
              </Group>

              <Divider mb="md" />

              {loading ? (
                <Text c="dimmed" size="sm">Loading…</Text>
              ) : members.length === 0 ? (
                <Stack align="center" py="xl" gap="xs">
                  <IconUsers size={40} color="var(--mantine-color-gray-4)" />
                  <Text c="dimmed">No members yet. Invite your first team member.</Text>
                  <Button size="sm" leftSection={<IconPlus size={14} />} onClick={() => setInviteOpen(true)}>
                    Invite Member
                  </Button>
                </Stack>
              ) : (
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Person</Table.Th>
                      <Table.Th>Role</Table.Th>
                      <Table.Th>Status</Table.Th>
                      <Table.Th>Getting started</Table.Th>
                      <Table.Th>Joined</Table.Th>
                      <Table.Th />
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {members.map((m) => {
                      const ob = onboarding[m.userId]
                      return (
                      <Table.Tr key={m.userId}>
                        <Table.Td>
                          <Text size="sm" fw={500}>{personLabel(m)}</Text>
                          {m.phone && personLabel(m) !== m.phone && (
                            <Text size="xs" c="dimmed">{m.phone}</Text>
                          )}
                        </Table.Td>
                        <Table.Td>
                          {m.role === 'owner' ? (
                            <Badge size="sm" color="blue" variant="light">{roleLabel(m.role)}</Badge>
                          ) : (
                            <Select
                              size="xs"
                              data={roleChoices.some((choice) => choice.value === m.role) ? roleChoices : [...roleChoices, { value: m.role, label: roleLabel(m.role) }]}
                              value={m.role}
                              disabled={changingRole === m.userId}
                              onChange={(value) => void handleRoleChange(m.userId, value)}
                              allowDeselect={false}
                            />
                          )}
                          <Badge size="xs" mt={4} variant="outline" color={memberAccessBadge(m.role).color}>
                            {memberAccessBadge(m.role).label}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Badge
                            size="sm"
                            color={m.status === 'active' ? 'teal' : m.status === 'suspended' ? 'red' : 'orange'}
                          >
                            {m.status === 'active' ? 'Active' : m.status === 'suspended' ? 'Suspended' : 'Invited'}
                          </Badge>
                          {m.invitePending && (
                            <Stack gap={2} mt={4} align="flex-start">
                              <Badge size="xs" variant="light" color="orange">Invite not opened</Badge>
                              <Button
                                size="compact-xs"
                                variant="subtle"
                                leftSection={<IconSend size={12} />}
                                loading={resendingInvite === m.userId}
                                onClick={() => void handleResendInvite(m.userId)}
                              >
                                Resend invite
                              </Button>
                            </Stack>
                          )}
                        </Table.Td>
                        <Table.Td>
                          {ob ? (
                            <Button
                              size="compact-xs"
                              variant="light"
                              color={SUMMARY_COLOR[ob.summary]}
                              leftSection={ob.summary === 'ready' ? <IconCircleCheck size={12} /> : <IconClock size={12} />}
                              onClick={() => setDetailUserId(m.userId)}
                            >
                              {SUMMARY_LABEL[ob.summary]}
                              {ob.summary !== 'ready' && ob.summary !== 'no_app'
                                ? ` · ${ob.cards.filter((c) => c.state === 'accepted').length}/${ob.cards.length}`
                                : ''}
                            </Button>
                          ) : (
                            <Text size="xs" c="dimmed">—</Text>
                          )}
                        </Table.Td>
                        <Table.Td>
                          <Text size="xs" c="dimmed">
                            {m.createdAt ? new Date(m.createdAt).toLocaleDateString() : '—'}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          {m.role !== 'owner' && (
                            <Button
                              size="xs"
                              variant="subtle"
                              color="red"
                              leftSection={<IconTrash size={12} />}
                              loading={removing === m.userId}
                              onClick={() => handleRemove(m.userId)}
                            >
                              Remove
                            </Button>
                          )}
                        </Table.Td>
                      </Table.Tr>
                      )
                    })}
                  </Table.Tbody>
                </Table>
              )}
            </Card>
          )}

          {orgTenantId && (
            <Card withBorder radius="md" p="lg">
              <Title order={4}>When a role changes</Title>
              <Text size="sm" c="dimmed" mt={2} mb="md">
                The person gets a new staff card in their app inbox. Choose what happens to the one they already hold.
              </Text>
              <Radio.Group value={staffCardChange} onChange={(value) => void handleStaffCardChange(value)}>
                <Stack gap="sm">
                  {STAFF_CARD_CHANGE_OPTIONS.map((option) => (
                    <Radio
                      key={option.value}
                      value={option.value}
                      label={option.label}
                      description={option.hint}
                      disabled={savingStaffCardChange}
                    />
                  ))}
                </Stack>
              </Radio.Group>
              <Text size="xs" c="dimmed" mt="md">
                When someone leaves, their staff card stops working straight away. Either way, the earlier card stays on their
                phone until they remove it from Records.
              </Text>
            </Card>
          )}
        </Stack>
      </Container>

      <Modal opened={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite Member" centered>
        <Stack gap="md">
          <TextInput
            label="Phone number"
            description="We send them a one-time link. They confirm their name and choose their own PIN. Nobody else knows it."
            placeholder="0774 123 456"
            value={invitePhone}
            onChange={(e) => setInvitePhone(e.currentTarget.value)}
            required
          />
          <TextInput
            label="Name"
            description="They see this name when they open the invite and can correct it."
            placeholder="Tendai Moyo"
            value={inviteName}
            onChange={(e) => setInviteName(e.currentTarget.value)}
            required
          />
          <Checkbox
            label="They agreed to get the invite on WhatsApp"
            description="Otherwise we send it by SMS, or give you the link to pass on."
            checked={inviteWhatsApp}
            onChange={(e) => setInviteWhatsApp(e.currentTarget.checked)}
          />
          <Select
            label="Role"
            description="Taken from the answers you gave when this organisation was set up."
            data={roleChoices}
            value={roleChoices.some((choice) => choice.value === inviteRole) ? inviteRole : roleChoices[0]?.value || 'member'}
            onChange={(v) => setInviteRole(v || roleChoices[0]?.value || 'member')}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button
              loading={inviting}
              disabled={!invitePhone.trim() || inviteName.trim().length < 2}
              onClick={handleInvite}
              leftSection={<IconPlus size={14} />}
            >
              Invite
            </Button>
          </Group>
        </Stack>
      </Modal>

      {(() => {
        const ob = detailUserId ? onboarding[detailUserId] : null
        const member = detailUserId ? members.find((m) => m.userId === detailUserId) : null
        const name = ob?.displayName || (member ? personLabel(member) : 'Team member')
        return (
          <Modal opened={Boolean(ob)} onClose={() => setDetailUserId(null)} title={`Getting ${name} started`} centered size="lg">
            {ob && (
              <Stack gap="md">
                <Group gap="xs">
                  <Badge color={SUMMARY_COLOR[ob.summary]} variant="light">{SUMMARY_LABEL[ob.summary]}</Badge>
                  <Badge variant="outline" color="gray">{roleLabel(ob.role)}</Badge>
                </Group>
                <Text size="sm">{ob.nextStep}</Text>

                <Stack gap="xs">
                  <Paper withBorder p="sm" radius="md">
                    <Group justify="space-between" wrap="nowrap">
                      <Group gap="sm" wrap="nowrap">
                        {ob.hasApp ? <IconCircleCheck size={18} color="var(--mantine-color-teal-6)" /> : <IconClock size={18} color="var(--mantine-color-gray-5)" />}
                        <Box>
                          <Text size="sm" fw={600}>Signed in to the app</Text>
                          <Text size="xs" c="dimmed">
                            {ob.hasApp ? 'They have the app and can receive cards.' : `They sign in with ${ob.phone || 'their phone number'} and a PIN. Cards are sent after that.`}
                          </Text>
                        </Box>
                      </Group>
                      <Badge size="sm" variant="light" color={ob.hasApp ? 'teal' : 'gray'}>{ob.hasApp ? 'Done' : 'Not yet'}</Badge>
                    </Group>
                  </Paper>

                  {ob.cards.map((card) => (
                    <Paper key={`${card.kind}:${card.workflowType || ''}`} withBorder p="sm" radius="md">
                      <Group justify="space-between" wrap="nowrap" align="start">
                        <Group gap="sm" wrap="nowrap" align="start">
                          {card.state === 'accepted' ? <IconCircleCheck size={18} color="var(--mantine-color-teal-6)" /> : <IconClock size={18} color="var(--mantine-color-gray-5)" />}
                          <Box>
                            <Text size="sm" fw={600}>{card.label}</Text>
                            <Text size="xs" c="dimmed">{cardPurpose(card)}</Text>
                            {card.state === 'accepted' && card.acceptedAt && (
                              <Text size="xs" c="dimmed">Accepted {new Date(card.acceptedAt).toLocaleDateString()}</Text>
                            )}
                            {card.state === 'waiting' && card.sentAt && (
                              <Text size="xs" c="dimmed">Sent {new Date(card.sentAt).toLocaleDateString()}. It is in their app inbox.</Text>
                            )}
                            {cardResendHint(card) && (
                              <Text size="xs" c="dimmed">{cardResendHint(card)}</Text>
                            )}
                          </Box>
                        </Group>
                        <Stack gap={4} align="end">
                          <Badge size="sm" variant="light" color={CARD_STATE_COLOR[card.state]}>{CARD_STATE_LABEL[card.state]}</Badge>
                          {cardCanResend(card) && ob.hasApp && (
                            <Button
                              size="compact-xs"
                              variant="subtle"
                              leftSection={<IconSend size={12} />}
                              loading={sending === `${ob.userId}:${card.kind}`}
                              onClick={() => void handleSendCards(ob.userId, card.kind)}
                            >
                              {card.state === 'not_sent' ? 'Send' : 'Send again'}
                            </Button>
                          )}
                        </Stack>
                      </Group>
                    </Paper>
                  ))}

                  {ob.hasApp && !(ob.cards.find((c) => c.kind === 'employee')?.covers?.length) && (
                    <Text size="xs" c="dimmed">
                      Their staff card is enough for now. Who goes out and who checks the work is chosen on each job.
                    </Text>
                  )}
                </Stack>

                <Group justify="space-between">
                  <Button variant="default" onClick={() => setDetailUserId(null)}>Close</Button>
                  {ob.hasApp && ob.summary !== 'ready' && (
                    <Button
                      leftSection={<IconSend size={14} />}
                      loading={sending === `${ob.userId}:all`}
                      onClick={() => void handleSendCards(ob.userId, 'all')}
                    >
                      Send everything missing
                    </Button>
                  )}
                </Group>
              </Stack>
            )}
          </Modal>
        )
      })()}
    </Layout>
  )
}
