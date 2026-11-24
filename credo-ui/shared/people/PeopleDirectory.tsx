import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Accordion,
  Alert,
  Avatar,
  Badge,
  Button,
  Checkbox,
  Drawer,
  Group,
  Loader,
  NumberInput,
  Paper,
  Radio,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  TagsInput,
  Text,
  TextInput,
} from '@mantine/core'
import {
  IconCircleCheck,
  IconClock,
  IconMail,
  IconBrandWhatsapp,
  IconRefresh,
  IconSearch,
  IconSend,
  IconTrash,
  IconUserPlus,
} from '@tabler/icons-react'

import { MemberWorkFile, Row } from '../operations/OperationsRegisters'
import type { EmployeeQualification, EmployeeRecord, OperationsApi, TeamMember } from '../operations/operationsApi'
import {
  CARD_STATE_COLOR,
  CARD_STATE_LABEL,
  DEFAULT_STAFF_CARD_CHANGE,
  STAFF_CARD_CHANGE_OPTIONS,
  SUMMARY_COLOR,
  SUMMARY_LABEL,
  cardCanResend,
  cardPurpose,
  cardResendHint,
  memberAccessBadge,
  type MemberCardKind,
  type MemberOnboarding,
  type StaffCardChangeRule,
} from '../orgOnboarding'
import { personLabel, roleLabel } from '../orgPeople'
import { TEAM_ROLE_FALLBACK, defaultInviteRole, teamRolesFromCatalog } from '../orgProfile'
import { PhoneField } from '../PhoneField'

/**
 * The one list of people, for both apps. A person is an employee or team member; their app access (role,
 * invite, staff card), staff number, skills, van and work all hang off that one record. Portal:
 * HR operations. Phone: HR operations. There is no separate members list or user management.
 */

type Surface = 'portal' | 'phone'
type Notify = (message: string, tone: 'success' | 'error' | 'info') => void

/** Owners and admins invite people and change roles. */
const ACCESS_ROLES = ['owner', 'admin']
/** Same people the jobs register lets edit a staff number. */
const STAFF_ROLES = ['owner', 'admin', 'dispatcher', 'manager']

interface PersonRow {
  key: string
  employee?: EmployeeRecord
  member?: TeamMember
  onboarding?: MemberOnboarding
  name: string
  userId?: string
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Try again.'
}

function splitName(full: string): { firstName: string; lastName: string } {
  const [first, ...rest] = full.replace(/\s+/g, ' ').trim().split(' ')
  return { firstName: first || '', lastName: rest.join(' ') }
}

/** The latest invite could not reach them, or its link ran out: someone has to send it again. */
function inviteNeedsResend(member?: TeamMember): boolean {
  const status = member?.invitePending ? member.inviteDelivery?.status : undefined
  return status === 'failed' || status === 'not_sent' || status === 'expired'
}

/** What the row says about app access, in words. */
function accessLabel(row: PersonRow): { label: string; color: string } {
  if (!row.member) return { label: 'No app access', color: 'gray' }
  if (row.member.invitePending) {
    const status = row.member.inviteDelivery?.status
    if (status === 'failed' || status === 'not_sent') return { label: 'Invite failed', color: 'red' }
    if (status === 'expired') return { label: 'Link expired', color: 'orange' }
    if (status === 'sending') return { label: 'Sending invite', color: 'gray' }
    return { label: 'Invite not opened', color: 'orange' }
  }
  if (row.onboarding)
    return { label: SUMMARY_LABEL[row.onboarding.summary], color: SUMMARY_COLOR[row.onboarding.summary] }
  return {
    label: row.member.status === 'active' ? 'Active' : 'Invited',
    color: row.member.status === 'active' ? 'teal' : 'orange',
  }
}

type AccessFilter = 'all' | 'none' | 'failed' | 'waiting' | 'ready'

/** Which filter group a person falls in: no app access, invite to send again, started but not finished, or ready. */
function accessGroup(row: PersonRow): Exclude<AccessFilter, 'all'> {
  if (!row.member) return 'none'
  if (inviteNeedsResend(row.member)) return 'failed'
  if (row.member.invitePending) return 'waiting'
  if (row.onboarding) return row.onboarding.summary === 'ready' ? 'ready' : 'waiting'
  return row.member.status === 'active' ? 'ready' : 'waiting'
}

const CHANNEL_WORD: Record<string, string> = { email: 'email', whatsapp: 'WhatsApp', sms: 'text message', link: 'link' }

function timeAgo(at?: string): string {
  const ms = at ? Date.now() - new Date(at).getTime() : NaN
  if (!Number.isFinite(ms) || ms < 0) return ''
  const minutes = Math.round(ms / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return `${Math.round(hours / 24)} d ago`
}

/** One line on how the latest invite went, for the person panel. */
function deliveryLine(delivery: NonNullable<TeamMember['inviteDelivery']>): { text: string; color: string } {
  const channel = CHANNEL_WORD[delivery.channel] || delivery.channel
  const to = delivery.to ? ` to ${delivery.to}` : ''
  const when = timeAgo(delivery.at)
  const suffix = when ? ` · ${when}` : ''
  switch (delivery.status) {
    case 'delivered':
      return { text: `Delivered by ${channel}${to}${suffix}`, color: 'teal' }
    case 'sent':
      return { text: `Sent by ${channel}${to}${suffix}`, color: 'dimmed' }
    case 'sending':
      return { text: `Sending by ${channel}${to}${suffix}`, color: 'dimmed' }
    case 'expired':
      return { text: 'The link ran out before they opened it. Send a new one.', color: 'orange' }
    default:
      return {
        text: `Could not send by ${channel}${to}${delivery.reason ? `: ${delivery.reason}` : ''}`,
        color: 'red',
      }
  }
}

function initials(name: string): string {
  const parts = name
    .replace(/[^\p{L}\s]/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?'
}

function qualificationAlerts(qualifications: EmployeeQualification[] = []): Array<{ label: string; color: string }> {
  const today = new Date().toISOString().slice(0, 10)
  const cutoffDate = new Date(`${today}T00:00:00.000Z`)
  cutoffDate.setUTCDate(cutoffDate.getUTCDate() + 30)
  const cutoff = cutoffDate.toISOString().slice(0, 10)
  const expired = qualifications.filter((item) => item.expiresAt && item.expiresAt < today)
  const upcoming = qualifications.filter(
    (item) => item.expiresAt && item.expiresAt >= today && item.expiresAt <= cutoff,
  )
  return [
    ...(expired.length ? [{ label: `${expired.length} expired`, color: 'red' }] : []),
    ...(upcoming.length ? [{ label: `${upcoming.length} expiring`, color: 'orange' }] : []),
  ]
}

export function PeopleDirectory({
  api,
  orgTenantId,
  surface,
  role,
  notify,
  showPay = surface === 'portal',
  onOpenJob,
  onChanged,
}: {
  api: OperationsApi | null
  orgTenantId: string
  surface: Surface
  /** The signed-in person's organisation role. */
  role: string
  notify: Notify
  /** Salary, currency and tax numbers. Off on the phone: pay is set on the website. */
  showPay?: boolean
  onOpenJob?: (runId: string) => void
  onChanged?: () => void
}) {
  const [employees, setEmployees] = useState<EmployeeRecord[]>([])
  const [members, setMembers] = useState<TeamMember[]>([])
  const [onboarding, setOnboarding] = useState<MemberOnboarding[]>([])
  const [roleChoices, setRoleChoices] = useState(TEAM_ROLE_FALLBACK)
  const [cardRule, setCardRule] = useState<StaffCardChangeRule>(DEFAULT_STAFF_CARD_CHANGE)
  const [loading, setLoading] = useState(true)
  const [sheet, setSheet] = useState<{ kind: 'person'; key: string } | { kind: 'add' } | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<AccessFilter>('all')
  const canManage = ACCESS_ROLES.includes(role)
  const size = surface === 'phone' ? 'md' : 'sm'

  const load = useCallback(async () => {
    if (!api || !orgTenantId) return
    setLoading(true)
    const [employeeRows, memberRows, onboardingRows, roles, rule] = await Promise.allSettled([
      api.employees(),
      api.members(orgTenantId),
      api.memberOnboarding(orgTenantId),
      api.teamRoles(orgTenantId),
      api.staffCardChange(orgTenantId),
    ])
    // Pay roles see the payroll list; anyone else still sees the team, so nobody is left out.
    setEmployees(employeeRows.status === 'fulfilled' && Array.isArray(employeeRows.value) ? employeeRows.value : [])
    setMembers(memberRows.status === 'fulfilled' && Array.isArray(memberRows.value) ? memberRows.value : [])
    setOnboarding(
      onboardingRows.status === 'fulfilled' && Array.isArray(onboardingRows.value) ? onboardingRows.value : [],
    )
    if (roles.status === 'fulfilled') {
      const fromSetup = teamRolesFromCatalog(Array.isArray(roles.value) ? roles.value : [])
      setRoleChoices(fromSetup.length ? fromSetup : TEAM_ROLE_FALLBACK)
    }
    if (rule.status === 'fulfilled') setCardRule(rule.value)
    setLoading(false)
  }, [api, orgTenantId])

  useEffect(() => {
    void load()
  }, [load])

  const rows: PersonRow[] = useMemo(() => {
    const byUser = new Map(members.map((member) => [member.userId, member]))
    const onboardingByUser = new Map(onboarding.map((item) => [item.userId, item]))
    const listed = new Set<string>()
    const list: PersonRow[] = employees
      .filter((employee) => employee.status !== 'terminated' || employee.userId)
      .map((employee) => {
        const member = employee.userId ? byUser.get(employee.userId) : undefined
        if (employee.userId) listed.add(employee.userId)
        return {
          key: employee.id,
          employee,
          member,
          onboarding: employee.userId ? onboardingByUser.get(employee.userId) : undefined,
          userId: employee.userId,
          name: personLabel({
            displayName: `${employee.firstName} ${employee.lastName}`.trim(),
            phone: employee.phone || member?.phone || undefined,
            role: member?.role || '',
          }),
        }
      })
    for (const member of members) {
      if (listed.has(member.userId)) continue
      list.push({
        key: member.userId,
        member,
        onboarding: onboardingByUser.get(member.userId),
        userId: member.userId,
        name: personLabel(member),
      })
    }
    return list.sort((a, b) => a.name.localeCompare(b.name))
  }, [employees, members, onboarding])

  const names = useMemo(
    () => Object.fromEntries(rows.filter((row) => row.userId).map((row) => [row.userId as string, row.name])),
    [rows],
  )

  const changed = async () => {
    await load()
    onChanged?.()
  }
  const open = sheet?.kind === 'person' ? rows.find((row) => row.key === sheet.key) : undefined
  const groups = useMemo(() => {
    const tally = { none: 0, failed: 0, waiting: 0, ready: 0 }
    for (const row of rows) tally[accessGroup(row)] += 1
    return tally
  }, [rows])
  useEffect(() => {
    if (filter === 'failed' && !groups.failed) setFilter('all')
  }, [filter, groups.failed])
  const [retrying, setRetrying] = useState(false)
  const retryFailed = async () => {
    if (!api) return
    const failed = rows.filter((row) => row.member && accessGroup(row) === 'failed')
    setRetrying(true)
    let sent = 0
    const problems: string[] = []
    for (const row of failed) {
      try {
        const result = await api.resendInvite(
          orgTenantId,
          row.member!.userId,
          row.employee?.email ? { email: row.employee.email } : {},
        )
        if (result?.invite?.channel === 'link' || result?.invite?.channel === 'none') problems.push(row.name)
        else sent += 1
      } catch (error) {
        problems.push(`${row.name}: ${message(error)}`)
      }
    }
    setRetrying(false)
    notify(
      problems.length
        ? `Sent ${sent} of ${failed.length}. Still not sent: ${problems.join(', ')}. Open each person to try another way.`
        : `Sent ${sent} ${sent === 1 ? 'invite' : 'invites'} again. Each new link works for 7 days.`,
      problems.length ? 'info' : 'success',
    )
    await changed()
  }
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return rows.filter((row) => {
      if (filter !== 'all' && accessGroup(row) !== filter) return false
      if (!needle) return true
      return [
        row.name,
        row.employee?.staffNumber,
        row.employee?.phone,
        row.member?.phone,
        row.member ? roleLabel(row.member.role) : '',
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    })
  }, [rows, query, filter])

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center" wrap="nowrap">
        <Text size="sm" c="dimmed">
          {rows.length
            ? `${rows.length} ${rows.length === 1 ? 'person' : 'people'} · ${groups.ready} ready in the app${groups.none ? ` · ${groups.none} not invited yet` : ''}`
            : 'Everyone on your team, in one list.'}
        </Text>
        {canManage && (
          <Button
            size={size}
            radius="xl"
            leftSection={<IconUserPlus size={18} />}
            onClick={() => setSheet({ kind: 'add' })}
            style={{ flexShrink: 0 }}
          >
            Add person
          </Button>
        )}
      </Group>

      {(rows.length > 6 || groups.failed > 0) && (
        <Group gap="sm" wrap="wrap" align="center">
          <TextInput
            size={size}
            placeholder="Search name, phone, staff number or role"
            leftSection={<IconSearch size={16} />}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            style={{ flex: '1 1 240px' }}
          />
          <SegmentedControl
            size={surface === 'phone' ? 'sm' : 'xs'}
            value={filter}
            onChange={(value) => setFilter(value as AccessFilter)}
            data={[
              { value: 'all', label: `All ${rows.length}` },
              { value: 'none', label: `Not invited ${groups.none}` },
              ...(groups.failed ? [{ value: 'failed', label: `Failed ${groups.failed}` }] : []),
              { value: 'waiting', label: `Waiting ${groups.waiting}` },
              { value: 'ready', label: `Ready ${groups.ready}` },
            ]}
          />
        </Group>
      )}

      {canManage && groups.failed > 0 && (
        <Alert color="red" variant="light" radius="md" p="sm">
          <Group justify="space-between" wrap="wrap" gap="xs">
            <Text size="sm">
              {groups.failed === 1
                ? '1 invite did not reach the person or its link ran out.'
                : `${groups.failed} invites did not reach the person or their links ran out.`}
            </Text>
            <Button
              size="xs"
              variant="white"
              color="red"
              radius="xl"
              leftSection={<IconRefresh size={14} />}
              loading={retrying}
              onClick={() => void retryFailed()}
            >
              Retry failed ({groups.failed})
            </Button>
          </Group>
        </Alert>
      )}

      {loading && !rows.length ? (
        <Loader size="sm" />
      ) : rows.length === 0 ? (
        <Text size="sm" c="dimmed">
          {canManage ? 'No one yet. Add the first person.' : 'No one else is on the team yet.'}
        </Text>
      ) : visible.length === 0 ? (
        <Text size="sm" c="dimmed">
          No one matches.
        </Text>
      ) : (
        <SimpleGrid cols={surface === 'phone' ? 1 : { base: 1, md: 2, xl: 3 }} spacing="xs">
          {visible.map((row) => {
            const access = accessLabel(row)
            return (
              <Row
                key={row.key}
                surface={surface}
                title={
                  <Group gap="sm" wrap="nowrap">
                    <Avatar size={surface === 'phone' ? 36 : 32} radius="xl" color="initials" name={row.name}>
                      {initials(row.name)}
                    </Avatar>
                    <Stack gap={0} style={{ minWidth: 0 }}>
                      <Text fw={500} size={surface === 'phone' ? 'md' : 'sm'} truncate>
                        {row.name}
                      </Text>
                      <Text size="xs" c="dimmed" truncate>
                        {[
                          row.member ? roleLabel(row.member.role) : undefined,
                          row.employee?.staffNumber,
                          row.employee?.phone || row.member?.phone,
                          showPay && row.employee && row.employee.baseSalary > 0
                            ? `${row.employee.baseSalary.toLocaleString()} ${row.employee.currency}`
                            : undefined,
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'No contact saved'}
                      </Text>
                    </Stack>
                  </Group>
                }
                trailing={
                  <Group gap={4} justify="flex-end" wrap="nowrap">
                    {qualificationAlerts(row.employee?.qualifications).map((alert) => (
                      <Badge key={alert.label} variant="light" color={alert.color}>
                        {alert.label}
                      </Badge>
                    ))}
                    <Badge variant="light" color={access.color} style={{ flexShrink: 0 }}>
                      {access.label}
                    </Badge>
                  </Group>
                }
                onClick={() => setSheet({ kind: 'person', key: row.key })}
              />
            )
          })}
        </SimpleGrid>
      )}

      {canManage && rows.length > 0 && (
        <Accordion variant="contained" radius="md">
          <Accordion.Item value="card-rule">
            <Accordion.Control>
              <Text size="sm" fw={500}>
                When a role changes
              </Text>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="xs">
                <Text size="sm" c="dimmed">
                  The person gets a new staff card in their app inbox. Choose what happens to the one they already hold.
                </Text>
                <Radio.Group
                  value={cardRule}
                  onChange={(value) => {
                    const rule = value as StaffCardChangeRule
                    const previous = cardRule
                    setCardRule(rule)
                    api
                      ?.saveStaffCardChange(orgTenantId, rule)
                      .then(() => notify('Saved. Applies the next time a role changes.', 'success'))
                      .catch((error) => {
                        setCardRule(previous)
                        notify(message(error), 'error')
                      })
                  }}
                >
                  <Stack gap="sm">
                    {STAFF_CARD_CHANGE_OPTIONS.map((option) => (
                      <Radio key={option.value} value={option.value} label={option.label} description={option.hint} />
                    ))}
                  </Stack>
                </Radio.Group>
                <Text size="xs" c="dimmed">
                  When someone leaves, their staff card stops working straight away.
                </Text>
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      )}

      <Drawer
        opened={sheet !== null}
        onClose={() => setSheet(null)}
        position={surface === 'phone' ? 'bottom' : 'right'}
        size={surface === 'phone' ? 'auto' : 'lg'}
        radius={surface === 'phone' ? 'lg' : 0}
        styles={surface === 'phone' ? { content: { borderRadius: '16px 16px 0 0', maxHeight: '92dvh' } } : undefined}
        title={sheet?.kind === 'add' ? 'Add a person' : open?.name || 'Person'}
      >
        {sheet?.kind === 'add' && (
          <AddPerson
            api={api}
            orgTenantId={orgTenantId}
            surface={surface}
            roleChoices={roleChoices}
            showPay={showPay}
            notify={notify}
            onDone={async () => {
              setSheet(null)
              await changed()
            }}
          />
        )}
        {open && (
          <PersonPanel
            key={open.key}
            row={open}
            api={api}
            orgTenantId={orgTenantId}
            surface={surface}
            role={role}
            roleChoices={roleChoices}
            showPay={showPay}
            names={names}
            notify={notify}
            onOpenJob={onOpenJob}
            onChanged={changed}
            onRemoved={async () => {
              setSheet(null)
              await changed()
            }}
          />
        )}
      </Drawer>
    </Stack>
  )
}

const looksLikeEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())

function inviteNotice(
  result: { message?: string; invite?: { channel?: string; link?: string } } | undefined,
  notify: Notify,
  fallback: string,
) {
  if (result?.invite?.channel === 'link' && result.invite.link) {
    void navigator.clipboard?.writeText(result.invite.link).catch(() => undefined)
    notify(`${result.message || 'No message could be sent.'} The link is copied: ${result.invite.link}`, 'info')
    return
  }
  notify(result?.message || fallback, result?.invite?.channel === 'none' ? 'info' : 'success')
}

/** One form for a new person: their details, and optionally the app. */
function AddPerson({
  api,
  orgTenantId,
  surface,
  roleChoices,
  showPay,
  notify,
  onDone,
}: {
  api: OperationsApi | null
  orgTenantId: string
  surface: Surface
  roleChoices: Array<{ value: string; label: string }>
  showPay: boolean
  notify: Notify
  onDone: () => void | Promise<void>
}) {
  const size = surface === 'phone' ? 'md' : 'sm'
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    staffNumber: '',
    skills: [] as string[],
    salary: 0,
    currency: 'USD',
  })
  const [giveApp, setGiveApp] = useState(true)
  const [whatsapp, setWhatsapp] = useState(false)
  const [inviteRole, setInviteRole] = useState(defaultInviteRole(roleChoices))
  const [saving, setSaving] = useState(false)
  const emailError = form.email.trim() && !looksLikeEmail(form.email) ? 'Check the email address' : null
  const hasPhone = form.phone.trim().length > 4
  const reachable = hasPhone || Boolean(form.email.trim())
  const ready = form.name.trim().length >= 2 && !emailError && (!giveApp || reachable)

  const save = async () => {
    if (!api || !ready) return
    setSaving(true)
    try {
      let userId: string | undefined
      if (giveApp) {
        const invited = await api.inviteMember(orgTenantId, {
          phone: hasPhone ? form.phone.trim() : undefined,
          name: form.name.trim(),
          role: inviteRole,
          email: form.email.trim() || undefined,
          whatsappConsent: whatsapp && hasPhone,
        })
        userId = invited.targetUserId
        inviteNotice(invited, notify, 'They are on the team.')
      }
      const { firstName, lastName } = splitName(form.name)
      await api.saveEmployee({
        firstName,
        lastName,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        baseSalary: showPay ? Number(form.salary) || 0 : 0,
        currency: form.currency,
        staffNumber: form.staffNumber.trim() || undefined,
        skills: form.skills,
        userId,
      })
      if (!giveApp) notify('Saved', 'success')
      await onDone()
    } catch (error) {
      notify(message(error), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Stack gap="sm">
      <TextInput
        size={size}
        label="Full name"
        placeholder="Tendai Moyo"
        value={form.name}
        onChange={(event) => setForm({ ...form, name: event.currentTarget.value })}
        required
      />
      <PhoneField
        surface={surface}
        label="Phone number"
        description={giveApp ? 'A phone number or an email is enough for the invite.' : 'Optional.'}
        value={form.phone}
        onChange={(value) => setForm({ ...form, phone: value })}
      />
      <TextInput
        size={size}
        type="email"
        label="Email"
        description={
          giveApp
            ? 'When given, the invite link is emailed here. Without a phone, they add it when they join.'
            : 'Optional.'
        }
        placeholder="tendai@example.com"
        value={form.email}
        error={emailError}
        onChange={(event) => setForm({ ...form, email: event.currentTarget.value })}
      />
      <Checkbox
        size={size}
        checked={giveApp}
        onChange={(event) => setGiveApp(event.currentTarget.checked)}
        label="Give them the app"
        description="They get jobs, approvals and their staff card on their phone."
      />
      {giveApp && (
        <>
          <Select
            size={size}
            label="Role"
            description="Taken from the answers you gave when the organisation was set up."
            data={roleChoices}
            value={inviteRole}
            onChange={(value) => setInviteRole(value || defaultInviteRole(roleChoices))}
            allowDeselect={false}
          />
          {hasPhone && (
            <Checkbox
              size={size}
              checked={whatsapp}
              onChange={(event) => setWhatsapp(event.currentTarget.checked)}
              label="They agreed to get the invite on WhatsApp"
              description="Without an email, we send it by WhatsApp or text message, or give you the link to pass on."
            />
          )}
          <Text size="xs" c="dimmed">
            Nobody types a password for them. They get a one-time link that works for 7 days, confirm their name and
            choose their own PIN, then can turn on fingerprint sign-in on their phone.
          </Text>
        </>
      )}
      <TextInput
        size={size}
        label="Staff number"
        placeholder="e.g. SGK-014"
        value={form.staffNumber}
        onChange={(event) => setForm({ ...form, staffNumber: event.currentTarget.value })}
      />
      <TagsInput
        size={size}
        label="Skills"
        placeholder="Type a skill and press Enter"
        data={['Plumbing', 'Electrical', 'Painting', 'HVAC', 'Carpentry', 'Roofing', 'Tiling', 'Welding']}
        value={form.skills}
        onChange={(skills) => setForm({ ...form, skills })}
      />
      {showPay && (
        <Group grow align="flex-end">
          <NumberInput
            size={size}
            label="Base salary"
            min={0}
            decimalScale={2}
            value={form.salary}
            onChange={(value) => setForm({ ...form, salary: Number(value) || 0 })}
          />
          <Select
            size={size}
            label="Currency"
            data={['USD', 'ZWL', 'ZAR']}
            value={form.currency}
            onChange={(value) => setForm({ ...form, currency: value || 'USD' })}
            allowDeselect={false}
          />
        </Group>
      )}
      <Group justify="flex-end">
        <Button
          size={size}
          radius="xl"
          loading={saving}
          disabled={!ready}
          onClick={() => void save()}
          leftSection={<IconUserPlus size={18} />}
        >
          {giveApp ? 'Add and invite' : 'Add'}
        </Button>
      </Group>
    </Stack>
  )
}

/** One person: app access, pay details, then their work file. */
/** How the waiting invite went, and ways to send it again: as before, by email, or on WhatsApp. */
function InviteResend({
  api,
  orgTenantId,
  member,
  email,
  phone,
  size,
  busy,
  run,
  notify,
  onChanged,
}: {
  api: OperationsApi | null
  orgTenantId: string
  member: TeamMember
  email?: string
  phone: string
  size: 'sm' | 'md'
  busy: string | null
  run: (key: string, task: () => Promise<void>) => Promise<void>
  notify: Notify
  onChanged: () => Promise<void>
}) {
  const [whatsappConsent, setWhatsappConsent] = useState(false)
  const delivery = member.inviteDelivery
  const line = delivery ? deliveryLine(delivery) : undefined
  const failed = inviteNeedsResend(member)
  const resend = (key: string, input: Parameters<OperationsApi['resendInvite']>[2]) =>
    run(key, async () => {
      const result = await api?.resendInvite(orgTenantId, member.userId, input)
      inviteNotice(result, notify, 'Invite sent again.')
      await onChanged()
    })

  return (
    <Stack gap="xs">
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <Text size="sm" c={line?.color || 'dimmed'} style={{ minWidth: 0 }}>
          {line?.text || 'They have not opened their invite yet.'}
        </Text>
        <Button
          size={size}
          variant={failed ? 'filled' : 'light'}
          radius="xl"
          leftSection={<IconSend size={16} />}
          loading={busy === 'resend'}
          disabled={Boolean(busy && busy !== 'resend')}
          onClick={() => void resend('resend', email ? { email } : {})}
          style={{ flexShrink: 0 }}
        >
          {failed ? 'Try again' : 'Send invite again'}
        </Button>
      </Group>
      {(email || phone) && (
        <Paper withBorder radius="md" p="sm">
          <Stack gap="xs">
            <Text size="xs" c="dimmed">
              Or choose how to send it
            </Text>
            <Group gap="xs" wrap="wrap">
              {email && (
                <Button
                  size="xs"
                  variant="default"
                  radius="xl"
                  leftSection={<IconMail size={14} />}
                  loading={busy === 'resend:email'}
                  disabled={Boolean(busy && busy !== 'resend:email')}
                  onClick={() => void resend('resend:email', { channel: 'email', email })}
                >
                  By email
                </Button>
              )}
              {phone && (
                <Button
                  size="xs"
                  variant="default"
                  radius="xl"
                  leftSection={<IconBrandWhatsapp size={14} />}
                  loading={busy === 'resend:whatsapp'}
                  disabled={!whatsappConsent || Boolean(busy && busy !== 'resend:whatsapp')}
                  onClick={() => void resend('resend:whatsapp', { channel: 'whatsapp', whatsappConsent: true })}
                >
                  On WhatsApp
                </Button>
              )}
            </Group>
            {phone && (
              <Checkbox
                size="xs"
                checked={whatsappConsent}
                onChange={(event) => setWhatsappConsent(event.currentTarget.checked)}
                label={`They agreed to get this on WhatsApp at ${phone}`}
              />
            )}
          </Stack>
        </Paper>
      )}
      <Text size="xs" c="dimmed">
        A new link replaces the old one and works for 7 days.
      </Text>
    </Stack>
  )
}

function PersonPanel({
  row,
  api,
  orgTenantId,
  surface,
  role,
  roleChoices,
  showPay,
  names,
  notify,
  onOpenJob,
  onChanged,
  onRemoved,
}: {
  row: PersonRow
  api: OperationsApi | null
  orgTenantId: string
  surface: Surface
  role: string
  roleChoices: Array<{ value: string; label: string }>
  showPay: boolean
  names: Record<string, string>
  notify: Notify
  onOpenJob?: (runId: string) => void
  onChanged: () => Promise<void>
  onRemoved: () => Promise<void>
}) {
  const size = surface === 'phone' ? 'md' : 'sm'
  const canManage = ACCESS_ROLES.includes(role)
  const { member, onboarding, employee } = row
  const [busy, setBusy] = useState<string | null>(null)
  const run = async (key: string, task: () => Promise<void>) => {
    setBusy(key)
    try {
      await task()
    } catch (error) {
      notify(message(error), 'error')
    } finally {
      setBusy(null)
    }
  }

  // Invite someone who has no app access yet.
  const [phone, setPhone] = useState(employee?.phone || member?.phone || '')
  const [inviteEmail, setInviteEmail] = useState(employee?.email || '')
  const [inviteRole, setInviteRole] = useState(defaultInviteRole(roleChoices))
  const [whatsapp, setWhatsapp] = useState(false)
  const invitePhone = phone.trim().length > 4
  // Details and pay.
  const [pay, setPay] = useState({
    name: `${employee?.firstName || ''} ${employee?.lastName || ''}`.trim(),
    phone: employee?.phone || '',
    email: employee?.email || '',
    salary: employee?.baseSalary || 0,
    currency: employee?.currency || 'USD',
    nssa: employee?.nssaNumber || '',
    tin: employee?.tin || '',
    status: employee?.status || 'active',
    staffNumber: employee?.staffNumber || '',
    skills: employee?.skills || [],
  })
  const [qualifications, setQualifications] = useState<EmployeeQualification[]>(employee?.qualifications || [])
  // Tax numbers stay out of the way unless the organisation records them.
  const [showTax, setShowTax] = useState(Boolean(employee?.nssaNumber || employee?.tin))

  const invite = () =>
    run('invite', async () => {
      if (!api) return
      const email = inviteEmail.trim() || undefined
      const invited = await api.inviteMember(orgTenantId, {
        phone: invitePhone ? phone.trim() : undefined,
        name: row.name,
        role: inviteRole,
        email,
        whatsappConsent: whatsapp && invitePhone,
      })
      if (employee) {
        const { firstName, lastName } = splitName(pay.name || row.name)
        await api.saveEmployee({
          ...employee,
          firstName,
          lastName,
          phone: invitePhone ? phone.trim() : employee.phone,
          email: email || employee.email,
          userId: invited.targetUserId,
        })
      }
      inviteNotice(invited, notify, 'They are on the team.')
      await onChanged()
    })

  const payEmailError = pay.email.trim() && !looksLikeEmail(pay.email) ? 'Check the email address' : null
  const saveSection = (key: string, patch: Partial<EmployeeRecord>, done: string) =>
    run(key, async () => {
      if (!api || !employee) return
      await api.saveEmployee({ ...employee, ...patch })
      notify(done, 'success')
      await onChanged()
    })
  const contactChanged =
    pay.name.trim() !== `${employee?.firstName || ''} ${employee?.lastName || ''}`.trim() ||
    pay.email.trim().toLowerCase() !== (employee?.email || '').trim().toLowerCase()
  const saveContact = () => {
    const { firstName, lastName } = splitName(pay.name)
    return saveSection(
      'contact',
      {
        firstName,
        lastName,
        phone: employee?.userId ? employee.phone : pay.phone.trim() || undefined,
        email: pay.email.trim() || undefined,
      },
      employee?.userId && member?.status === 'active' && contactChanged
        ? 'Saved. A new staff card with these details is on its way to their app inbox.'
        : 'Saved',
    )
  }
  const saveWork = () =>
    saveSection(
      'work',
      {
        status: pay.status,
        ...(employee?.userId ? {} : { staffNumber: pay.staffNumber.trim() || undefined, skills: pay.skills }),
      },
      'Saved',
    )
  const savePay = () => saveSection('pay', { baseSalary: Number(pay.salary) || 0, currency: pay.currency }, 'Pay saved')
  const saveTax = () =>
    saveSection(
      'tax',
      { nssaNumber: pay.nssa.trim() || undefined, tin: pay.tin.trim() || undefined },
      'Tax numbers saved',
    )

  const saveQualifications = () =>
    run('qualifications', async () => {
      if (!api || !employee) return
      const cleanQualifications = qualifications
        .filter((item) => item.name.trim())
        .map((item) => ({
          name: item.name.trim(),
          ...(item.expiresAt ? { expiresAt: item.expiresAt } : {}),
          ...(item.issuer?.trim() ? { issuer: item.issuer.trim() } : {}),
        }))
      await api.saveEmployee({ ...employee, qualifications: cleanQualifications })
      notify('Qualifications saved', 'success')
      await onChanged()
    })

  const sendCards = (kind: MemberCardKind | 'all') =>
    run(`cards:${kind}`, async () => {
      if (!api || !row.userId) return
      const result = await api.sendCards(orgTenantId, row.userId, kind)
      const sent = result.sent || []
      notify(
        sent.length
          ? 'Sent. They will find it in their app inbox.'
          : result.skipped?.[0]?.reason || 'Everything they need is already in their app.',
        sent.length ? 'success' : 'info',
      )
      await onChanged()
    })

  const section = (value: string, title: string, hint: string | null, body: React.ReactNode) => (
    <Accordion.Item value={value}>
      <Accordion.Control>
        <Stack gap={0}>
          <Text fw={500}>{title}</Text>
          {hint && (
            <Text size="xs" c="dimmed">
              {hint}
            </Text>
          )}
        </Stack>
      </Accordion.Control>
      <Accordion.Panel>{body}</Accordion.Panel>
    </Accordion.Item>
  )
  const saveButton = (key: string, onClick: () => void, disabled = false, label = 'Save') => (
    <Group justify="flex-end">
      <Button size={size} radius="xl" loading={busy === key} disabled={disabled} onClick={onClick}>
        {label}
      </Button>
    </Group>
  )
  const editDetails = Boolean(employee && canManage)
  const accessHint = member
    ? `${member.status === 'active' ? 'On the app' : member.status === 'suspended' ? 'Suspended' : 'Invited'} · ${roleLabel(member.role)}`
    : 'Not on the app yet'

  return (
    <Accordion multiple variant="separated" radius="md" defaultValue={['access', 'contact']}>
      {section(
        'access',
        'App access and role',
        accessHint,
        <>
          {member ? (
            <Paper p={0}>
              <Stack gap="sm">
                <Group gap="xs">
                  <Badge variant="light" color={member.status === 'active' ? 'teal' : 'orange'}>
                    {member.status === 'active' ? 'Active' : member.status === 'suspended' ? 'Suspended' : 'Invited'}
                  </Badge>
                  <Badge variant="outline" color={memberAccessBadge(member.role).color}>
                    {memberAccessBadge(member.role).label}
                  </Badge>
                  {onboarding && (
                    <Badge variant="light" color={SUMMARY_COLOR[onboarding.summary]}>
                      {SUMMARY_LABEL[onboarding.summary]}
                    </Badge>
                  )}
                </Group>
                {member.role === 'owner' || !canManage ? (
                  <Text size="sm">Role: {roleLabel(member.role)}</Text>
                ) : (
                  <Select
                    size={size}
                    label="Role"
                    data={
                      roleChoices.some((choice) => choice.value === member.role)
                        ? roleChoices
                        : [...roleChoices, { value: member.role, label: roleLabel(member.role) }]
                    }
                    value={member.role}
                    disabled={busy === 'role'}
                    allowDeselect={false}
                    onChange={(value) =>
                      value &&
                      void run('role', async () => {
                        await api?.changeRole(orgTenantId, member.userId, value)
                        notify(`${roleLabel(value)}. A new staff card is on its way to their app inbox.`, 'success')
                        await onChanged()
                      })
                    }
                  />
                )}
                {member.invitePending && canManage && (
                  <InviteResend
                    api={api}
                    orgTenantId={orgTenantId}
                    member={member}
                    email={
                      employee?.email || (member.inviteDelivery?.channel === 'email' ? member.inviteDelivery.to : '')
                    }
                    phone={employee?.phone || member.phone || ''}
                    size={size}
                    busy={busy}
                    run={run}
                    notify={notify}
                    onChanged={onChanged}
                  />
                )}
                {onboarding && (
                  <Stack gap="xs">
                    <Text size="sm">{onboarding.nextStep}</Text>
                    {onboarding.cards.map((card) => (
                      <Paper key={`${card.kind}:${card.workflowType || ''}`} withBorder radius="md" p="sm">
                        <Group
                          justify="space-between"
                          wrap={surface === 'phone' ? 'wrap' : 'nowrap'}
                          align="flex-start"
                          gap="xs"
                        >
                          <Group
                            gap="sm"
                            wrap="nowrap"
                            align="flex-start"
                            style={{ minWidth: 0, flex: 1, flexBasis: surface === 'phone' ? '100%' : undefined }}
                          >
                            {card.state === 'accepted' ? (
                              <IconCircleCheck size={20} color="var(--mantine-color-teal-6)" />
                            ) : (
                              <IconClock size={20} color="var(--mantine-color-gray-6)" />
                            )}
                            <Stack gap={2} style={{ minWidth: 0 }}>
                              <Text size="sm" fw={500}>
                                {card.label}
                              </Text>
                              <Text size="xs" c="dimmed">
                                {cardPurpose(card)}
                              </Text>
                              {cardResendHint(card) && (
                                <Text size="xs" c="dimmed">
                                  {cardResendHint(card)}
                                </Text>
                              )}
                            </Stack>
                          </Group>
                          <Stack
                            gap={4}
                            align={surface === 'phone' ? 'flex-start' : 'flex-end'}
                            style={{ flexShrink: 0, paddingLeft: surface === 'phone' ? 32 : 0 }}
                          >
                            <Badge
                              size="sm"
                              variant="light"
                              color={CARD_STATE_COLOR[card.state]}
                              style={{ flexShrink: 0 }}
                            >
                              {CARD_STATE_LABEL[card.state]}
                            </Badge>
                            {canManage && onboarding.hasApp && cardCanResend(card) && (
                              <Button
                                size="compact-sm"
                                variant="subtle"
                                loading={busy === `cards:${card.kind}`}
                                onClick={() => void sendCards(card.kind)}
                              >
                                {card.state === 'not_sent' ? 'Send' : 'Send again'}
                              </Button>
                            )}
                          </Stack>
                        </Group>
                      </Paper>
                    ))}
                    {canManage && onboarding.hasApp && onboarding.summary !== 'ready' && (
                      <Button
                        size={size}
                        radius="xl"
                        leftSection={<IconSend size={16} />}
                        loading={busy === 'cards:all'}
                        onClick={() => void sendCards('all')}
                        style={{ alignSelf: 'flex-start' }}
                      >
                        Send everything missing
                      </Button>
                    )}
                  </Stack>
                )}
                {canManage && member.role !== 'owner' && (
                  <Button
                    size={size}
                    variant="subtle"
                    color="red"
                    radius="xl"
                    leftSection={<IconTrash size={16} />}
                    loading={busy === 'remove'}
                    style={{ alignSelf: 'flex-start' }}
                    onClick={() => {
                      if (
                        !window.confirm(`Take ${row.name} off the team? Their staff card stops working straight away.`)
                      )
                        return
                      void run('remove', async () => {
                        await api?.removeMember(orgTenantId, member.userId)
                        notify(`${row.name} is off the team.`, 'info')
                        await onRemoved()
                      })
                    }}
                  >
                    Take off the team
                  </Button>
                )}
              </Stack>
            </Paper>
          ) : canManage ? (
            <Paper p={0}>
              <Stack gap="sm">
                <Text size="sm" c="dimmed">
                  They are not on the app yet, so they cannot get jobs or approvals.
                </Text>
                <PhoneField
                  surface={surface}
                  label="Phone number"
                  description="Their sign-in number. A phone number or an email is enough for the invite."
                  value={phone}
                  onChange={setPhone}
                />
                <TextInput
                  size={size}
                  type="email"
                  label="Email"
                  description="When given, the invite link is emailed here. Without a phone, they add it when they join."
                  value={inviteEmail}
                  error={inviteEmail.trim() && !looksLikeEmail(inviteEmail) ? 'Check the email address' : null}
                  onChange={(event) => setInviteEmail(event.currentTarget.value)}
                />
                <Select
                  size={size}
                  label="Role"
                  data={roleChoices}
                  value={inviteRole}
                  onChange={(value) => setInviteRole(value || defaultInviteRole(roleChoices))}
                  allowDeselect={false}
                />
                {invitePhone && (
                  <Checkbox
                    size={size}
                    checked={whatsapp}
                    onChange={(event) => setWhatsapp(event.currentTarget.checked)}
                    label="They agreed to get the invite on WhatsApp"
                    description="Without an email, we send it by WhatsApp or text message, or give you the link to pass on."
                  />
                )}
                <Text size="xs" c="dimmed">
                  They get a one-time link that works for 7 days and choose their own PIN. Nobody types a password for
                  them.
                </Text>
                <Group justify="flex-end">
                  <Button
                    size={size}
                    radius="xl"
                    leftSection={<IconUserPlus size={18} />}
                    loading={busy === 'invite'}
                    disabled={
                      (!invitePhone && !inviteEmail.trim()) ||
                      Boolean(inviteEmail.trim() && !looksLikeEmail(inviteEmail))
                    }
                    onClick={() => void invite()}
                  >
                    Invite to the app
                  </Button>
                </Group>
              </Stack>
            </Paper>
          ) : (
            <Text size="sm" c="dimmed">
              No app access.
            </Text>
          )}
        </>,
      )}

      {employee &&
        (canManage || showPay) &&
        section(
          'contact',
          'Contact details',
          [pay.email, pay.phone].filter(Boolean).join(' · ') || null,
          <Stack gap="sm">
            <TextInput
              size={size}
              label="Full name"
              value={pay.name}
              readOnly={!editDetails}
              onChange={(event) => setPay({ ...pay, name: event.currentTarget.value })}
            />
            {employee.userId || !editDetails ? (
              <TextInput
                size={size}
                label="Phone number"
                description={
                  employee.userId ? 'Their sign-in number. Only they can change it, from their app.' : undefined
                }
                value={pay.phone}
                readOnly
              />
            ) : (
              <PhoneField
                surface={surface}
                label="Phone number"
                value={pay.phone}
                onChange={(value) => setPay({ ...pay, phone: value })}
              />
            )}
            <TextInput
              size={size}
              type="email"
              label="Email"
              value={pay.email}
              readOnly={!editDetails}
              error={payEmailError}
              onChange={(event) => setPay({ ...pay, email: event.currentTarget.value })}
            />
            {editDetails && employee.userId && (
              <Text size="xs" c="dimmed">
                Their name and email are on their staff card. Changing them sends a new card to their app inbox, which
                they accept to replace the old one.
              </Text>
            )}
            {editDetails &&
              saveButton('contact', () => void saveContact(), pay.name.trim().length < 2 || Boolean(payEmailError))}
          </Stack>,
        )}

      {employee &&
        (canManage || showPay) &&
        section(
          'work',
          'Work',
          [
            { active: 'Working', on_leave: 'On leave', terminated: 'Left' }[pay.status] || pay.status,
            employee.staffNumber,
          ]
            .filter(Boolean)
            .join(' · '),
          <Stack gap="sm">
            <Select
              size={size}
              label="Status"
              data={[
                { value: 'active', label: 'Working' },
                { value: 'on_leave', label: 'On leave' },
                { value: 'terminated', label: 'Left' },
              ]}
              value={pay.status}
              disabled={!editDetails}
              onChange={(value) => setPay({ ...pay, status: value || 'active' })}
              allowDeselect={false}
            />
            {employee.userId ? (
              <Text size="xs" c="dimmed">
                Staff number and skills are under Their work. A new staff number sends them a new staff card.
              </Text>
            ) : (
              <>
                <TextInput
                  size={size}
                  label="Staff number"
                  value={pay.staffNumber}
                  readOnly={!editDetails}
                  onChange={(event) => setPay({ ...pay, staffNumber: event.currentTarget.value })}
                />
                <TagsInput
                  size={size}
                  label="Skills"
                  placeholder="Type a skill and press Enter"
                  value={pay.skills}
                  disabled={!editDetails}
                  onChange={(skills) => setPay({ ...pay, skills })}
                />
              </>
            )}
            {editDetails && saveButton('work', () => void saveWork())}
          </Stack>,
        )}

      {employee &&
        showPay &&
        section(
          'pay',
          'Pay',
          employee.baseSalary > 0 ? `${employee.currency} ${employee.baseSalary}` : 'No salary yet',
          <Stack gap="sm">
            <Group grow align="flex-end">
              <NumberInput
                size={size}
                label="Base salary"
                min={0}
                decimalScale={2}
                value={pay.salary}
                onChange={(value) => setPay({ ...pay, salary: Number(value) || 0 })}
              />
              <Select
                size={size}
                label="Currency"
                data={Array.from(new Set(['GBP', 'USD', 'ZAR', 'ZWL', pay.currency]))}
                value={pay.currency}
                onChange={(value) => setPay({ ...pay, currency: value || 'USD' })}
                allowDeselect={false}
              />
            </Group>
            {employee.baseSalary <= 0 && (
              <Alert color="blue" variant="light">
                No salary yet, so payroll skips this person until you add one.
              </Alert>
            )}
            {!showTax && (
              <Button
                size="compact-sm"
                variant="subtle"
                style={{ alignSelf: 'flex-start' }}
                onClick={() => setShowTax(true)}
              >
                Add tax numbers
              </Button>
            )}
            {saveButton('pay', () => void savePay())}
          </Stack>,
        )}

      {employee &&
        showPay &&
        showTax &&
        section(
          'tax',
          'Tax numbers',
          'Only if your payroll needs them',
          <Stack gap="sm">
            <Group grow>
              <TextInput
                size={size}
                label="Social security number"
                value={pay.nssa}
                onChange={(event) => setPay({ ...pay, nssa: event.currentTarget.value })}
              />
              <TextInput
                size={size}
                label="Tax number"
                value={pay.tin}
                onChange={(event) => setPay({ ...pay, tin: event.currentTarget.value })}
              />
            </Group>
            {saveButton('tax', () => void saveTax())}
          </Stack>,
        )}

      {employee &&
        section(
          'qualifications',
          'Qualifications',
          qualifications.length ? `${qualifications.length} recorded` : 'None recorded',
          <Paper withBorder radius="md" p="md">
            <Stack gap="sm">
              <Text size="sm" c="dimmed">
                Record certificates or training and their expiry dates. Expired and due-within-30-days items are flagged
                in the people list.
              </Text>
              {qualifications.map((item, index) => {
                const alert = qualificationAlerts(item.expiresAt ? [item] : [])[0]
                return (
                  <Group key={`${item.name}:${index}`} align="flex-end" wrap="nowrap">
                    <TextInput
                      size={size}
                      label="Qualification"
                      value={item.name}
                      onChange={(event) =>
                        setQualifications((current) =>
                          current.map((value, rowIndex) =>
                            rowIndex === index ? { ...value, name: event.currentTarget.value } : value,
                          ),
                        )
                      }
                      style={{ flex: 2 }}
                    />
                    <TextInput
                      size={size}
                      type="date"
                      label="Expires"
                      value={item.expiresAt || ''}
                      onChange={(event) =>
                        setQualifications((current) =>
                          current.map((value, rowIndex) =>
                            rowIndex === index
                              ? { ...value, expiresAt: event.currentTarget.value || undefined }
                              : value,
                          ),
                        )
                      }
                      style={{ flex: 1 }}
                    />
                    <TextInput
                      size={size}
                      label="Issuer (optional)"
                      value={item.issuer || ''}
                      onChange={(event) =>
                        setQualifications((current) =>
                          current.map((value, rowIndex) =>
                            rowIndex === index ? { ...value, issuer: event.currentTarget.value } : value,
                          ),
                        )
                      }
                      style={{ flex: 1 }}
                    />
                    {alert && <Badge color={alert.color}>{alert.label}</Badge>}
                    {canManage && (
                      <Button
                        size={size}
                        variant="subtle"
                        color="red"
                        aria-label={`Remove ${item.name || 'qualification'}`}
                        onClick={() =>
                          setQualifications((current) => current.filter((_, rowIndex) => rowIndex !== index))
                        }
                      >
                        <IconTrash size={16} />
                      </Button>
                    )}
                  </Group>
                )
              })}
              {qualifications.length === 0 && (
                <Text size="sm" c="dimmed">
                  No qualifications recorded.
                </Text>
              )}
              {canManage && (
                <Group justify="space-between">
                  <Button
                    size={size}
                    variant="light"
                    onClick={() => setQualifications((current) => [...current, { name: '' }])}
                  >
                    Add qualification
                  </Button>
                  <Button size={size} loading={busy === 'qualifications'} onClick={() => void saveQualifications()}>
                    Save qualifications
                  </Button>
                </Group>
              )}
            </Stack>
          </Paper>,
        )}

      {row.userId &&
        section(
          'work-file',
          'Their work',
          'Staff number, skills, jobs, leave and incidents',
          <MemberWorkFile
            api={api}
            userId={row.userId}
            names={names}
            surface={surface}
            canEdit={STAFF_ROLES.includes(role)}
            notify={notify}
            onOpenJob={onOpenJob}
            onSaved={() => void onChanged()}
          />,
        )}
    </Accordion>
  )
}
