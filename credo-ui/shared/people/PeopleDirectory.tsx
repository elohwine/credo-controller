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
import { IconCircleCheck, IconClock, IconSearch, IconSend, IconTrash, IconUserPlus } from '@tabler/icons-react'

import { MemberWorkFile, Row } from '../operations/OperationsRegisters'
import type { EmployeeQualification, EmployeeRecord, OperationsApi, TeamMember } from '../operations/operationsApi'
import { pinProblem } from '../security/AccountSecurity'
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

/** What the row says about app access, in words. */
function accessLabel(row: PersonRow): { label: string; color: string } {
  if (!row.member) return { label: 'No app access', color: 'gray' }
  if (row.member.invitePending) return { label: 'Invite not opened', color: 'orange' }
  if (row.onboarding)
    return { label: SUMMARY_LABEL[row.onboarding.summary], color: SUMMARY_COLOR[row.onboarding.summary] }
  return {
    label: row.member.status === 'active' ? 'Active' : 'Invited',
    color: row.member.status === 'active' ? 'teal' : 'orange',
  }
}

type AccessFilter = 'all' | 'none' | 'waiting' | 'ready'

/** Which filter group a person falls in: no app access, started but not finished, or ready. */
function accessGroup(row: PersonRow): Exclude<AccessFilter, 'all'> {
  if (!row.member) return 'none'
  if (row.member.invitePending) return 'waiting'
  if (row.onboarding) return row.onboarding.summary === 'ready' ? 'ready' : 'waiting'
  return row.member.status === 'active' ? 'ready' : 'waiting'
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
    const tally = { none: 0, waiting: 0, ready: 0 }
    for (const row of rows) tally[accessGroup(row)] += 1
    return tally
  }, [rows])
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

      {rows.length > 6 && (
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
              { value: 'waiting', label: `Waiting ${groups.waiting}` },
              { value: 'ready', label: `Ready ${groups.ready}` },
            ]}
          />
        </Group>
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

/**
 * For someone with no email or WhatsApp: the admin sets a PIN and tells them in person. The app
 * makes them replace it at their first sign-in, so the admin never keeps a working PIN.
 */
function useTemporaryPin() {
  const [on, setOn] = useState(false)
  const [pin, setPin] = useState('')
  const error = on && pin ? pinProblem(pin) : undefined
  return {
    on,
    valid: !on || (Boolean(pin) && !error),
    value: on ? pin : undefined,
    reset: () => {
      setOn(false)
      setPin('')
    },
    field: (size: 'sm' | 'md') => (
      <Stack gap="xs">
        <Checkbox
          size={size}
          checked={on}
          onChange={(event) => setOn(event.currentTarget.checked)}
          label="Give them a temporary PIN instead"
          description="For someone with no email or WhatsApp. Tell them the PIN in person; they must choose their own when they first sign in."
        />
        {on && (
          <TextInput
            size={size}
            label="Temporary PIN"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            value={pin}
            error={error}
            onChange={(event) => setPin(event.currentTarget.value.replace(/\D/g, ''))}
          />
        )}
      </Stack>
    ),
  }
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
  const temporaryPin = useTemporaryPin()
  const [saving, setSaving] = useState(false)
  const needsPhone = giveApp
  const emailError = form.email.trim() && !looksLikeEmail(form.email) ? 'Check the email address' : null
  const ready =
    form.name.trim().length >= 2 &&
    (!needsPhone || form.phone.trim().length > 4) &&
    !emailError &&
    (!giveApp || temporaryPin.valid)

  const save = async () => {
    if (!api || !ready) return
    setSaving(true)
    try {
      let userId: string | undefined
      if (giveApp) {
        const invited = await api.inviteMember(orgTenantId, {
          phone: form.phone.trim(),
          name: form.name.trim(),
          role: inviteRole,
          email: form.email.trim() || undefined,
          whatsappConsent: whatsapp,
          temporaryPin: temporaryPin.value,
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
        description={
          !giveApp
            ? 'Optional.'
            : temporaryPin.on
              ? 'They sign in with this number and the temporary PIN below.'
              : 'We send a one-time link here. They choose their own PIN.'
        }
        value={form.phone}
        onChange={(value) => setForm({ ...form, phone: value })}
        required={giveApp}
      />
      <TextInput
        size={size}
        type="email"
        label="Email"
        description={giveApp ? 'Optional. When given, the invite link is emailed here instead.' : 'Optional.'}
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
          <Checkbox
            size={size}
            checked={whatsapp}
            onChange={(event) => setWhatsapp(event.currentTarget.checked)}
            label="They agreed to get the invite on WhatsApp"
            description="Without an email, we send it by WhatsApp or text message, or give you the link to pass on."
          />
          {temporaryPin.field(size)}
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
  const temporaryPin = useTemporaryPin()
  const resendPin = useTemporaryPin()
  // Pay and details.
  const [pay, setPay] = useState({
    name: `${employee?.firstName || ''} ${employee?.lastName || ''}`.trim(),
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

  const invite = () =>
    run('invite', async () => {
      if (!api) return
      const email = inviteEmail.trim() || undefined
      const invited = await api.inviteMember(orgTenantId, {
        phone: phone.trim(),
        name: row.name,
        role: inviteRole,
        email,
        whatsappConsent: whatsapp,
        temporaryPin: temporaryPin.value,
      })
      temporaryPin.reset()
      if (employee) {
        const { firstName, lastName } = splitName(pay.name || row.name)
        await api.saveEmployee({
          ...employee,
          firstName,
          lastName,
          phone: phone.trim(),
          email: email || employee.email,
          userId: invited.targetUserId,
        })
      }
      inviteNotice(invited, notify, 'They are on the team.')
      await onChanged()
    })

  const savePay = () =>
    run('pay', async () => {
      if (!api || !employee) return
      const { firstName, lastName } = splitName(pay.name)
      await api.saveEmployee({
        ...employee,
        firstName,
        lastName,
        email: pay.email || undefined,
        baseSalary: Number(pay.salary) || 0,
        currency: pay.currency,
        nssaNumber: pay.nssa || undefined,
        tin: pay.tin || undefined,
        status: pay.status,
        ...(employee.userId ? {} : { staffNumber: pay.staffNumber.trim() || undefined, skills: pay.skills }),
      })
      notify('Saved', 'success')
      await onChanged()
    })

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

  return (
    <Stack gap="md">
      <Stack gap="xs">
        <Text fw={500}>App access</Text>
        {member ? (
          <Paper withBorder radius="md" p="md">
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
                <Stack gap="xs">
                  <Group justify="space-between" wrap="nowrap">
                    <Text size="sm" c="dimmed">
                      They have not opened their invite yet.
                    </Text>
                    <Button
                      size={size}
                      variant="light"
                      radius="xl"
                      leftSection={<IconSend size={16} />}
                      loading={busy === 'resend'}
                      disabled={!resendPin.valid}
                      onClick={() =>
                        void run('resend', async () => {
                          const result = await api?.resendInvite(orgTenantId, member.userId, {
                            temporaryPin: resendPin.value,
                          })
                          resendPin.reset()
                          inviteNotice(result, notify, 'Invite sent again.')
                          await onChanged()
                        })
                      }
                    >
                      {resendPin.on ? 'Set temporary PIN' : 'Send invite again'}
                    </Button>
                  </Group>
                  {resendPin.field(size)}
                </Stack>
              )}
              {onboarding && (
                <Stack gap="xs">
                  <Text size="sm">{onboarding.nextStep}</Text>
                  {onboarding.cards.map((card) => (
                    <Paper key={`${card.kind}:${card.workflowType || ''}`} withBorder radius="md" p="sm">
                      <Group justify="space-between" wrap="nowrap" align="flex-start">
                        <Group gap="sm" wrap="nowrap" align="flex-start" style={{ minWidth: 0, flex: 1 }}>
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
                        <Stack gap={4} align="flex-end" style={{ flexShrink: 0 }}>
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
                    if (!window.confirm(`Take ${row.name} off the team? Their staff card stops working straight away.`))
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
          <Paper withBorder radius="md" p="md">
            <Stack gap="sm">
              <Text size="sm" c="dimmed">
                They are not on the app yet, so they cannot get jobs or approvals.
              </Text>
              <PhoneField
                surface={surface}
                label="Phone number"
                description="Their sign-in number. They choose their own PIN."
                value={phone}
                onChange={setPhone}
                required
              />
              <TextInput
                size={size}
                type="email"
                label="Email"
                description="Optional. When given, the invite link is emailed here."
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
              <Checkbox
                size={size}
                checked={whatsapp}
                onChange={(event) => setWhatsapp(event.currentTarget.checked)}
                label="They agreed to get the invite on WhatsApp"
                description="Without an email, we send it by WhatsApp or text message, or give you the link to pass on."
              />
              {temporaryPin.field(size)}
              <Group justify="flex-end">
                <Button
                  size={size}
                  radius="xl"
                  leftSection={<IconUserPlus size={18} />}
                  loading={busy === 'invite'}
                  disabled={
                    phone.trim().length < 5 ||
                    Boolean(inviteEmail.trim() && !looksLikeEmail(inviteEmail)) ||
                    !temporaryPin.valid
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
      </Stack>

      {employee && showPay && (
        <Stack gap="xs">
          <Text fw={500}>Pay and details</Text>
          <Paper withBorder radius="md" p="md">
            <Stack gap="sm">
              <TextInput
                size={size}
                label="Full name"
                value={pay.name}
                onChange={(event) => setPay({ ...pay, name: event.currentTarget.value })}
              />
              <TextInput
                size={size}
                label="Email"
                value={pay.email}
                onChange={(event) => setPay({ ...pay, email: event.currentTarget.value })}
              />
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
                  data={['USD', 'ZWL', 'ZAR']}
                  value={pay.currency}
                  onChange={(value) => setPay({ ...pay, currency: value || 'USD' })}
                  allowDeselect={false}
                />
              </Group>
              <Group grow>
                <TextInput
                  size={size}
                  label="NSSA number"
                  value={pay.nssa}
                  onChange={(event) => setPay({ ...pay, nssa: event.currentTarget.value })}
                />
                <TextInput
                  size={size}
                  label="TIN"
                  value={pay.tin}
                  onChange={(event) => setPay({ ...pay, tin: event.currentTarget.value })}
                />
              </Group>
              <Select
                size={size}
                label="Status"
                data={[
                  { value: 'active', label: 'Working' },
                  { value: 'on_leave', label: 'On leave' },
                  { value: 'terminated', label: 'Left' },
                ]}
                value={pay.status}
                onChange={(value) => setPay({ ...pay, status: value || 'active' })}
                allowDeselect={false}
              />
              {!employee.userId && (
                <>
                  <TextInput
                    size={size}
                    label="Staff number"
                    value={pay.staffNumber}
                    onChange={(event) => setPay({ ...pay, staffNumber: event.currentTarget.value })}
                  />
                  <TagsInput
                    size={size}
                    label="Skills"
                    placeholder="Type a skill and press Enter"
                    value={pay.skills}
                    onChange={(skills) => setPay({ ...pay, skills })}
                  />
                </>
              )}
              {employee.baseSalary <= 0 && (
                <Alert color="blue" variant="light">
                  No salary yet, so payroll skips this person until you add one.
                </Alert>
              )}
              <Group justify="flex-end">
                <Button
                  size={size}
                  radius="xl"
                  loading={busy === 'pay'}
                  disabled={pay.name.trim().length < 2}
                  onClick={() => void savePay()}
                >
                  Save
                </Button>
              </Group>
            </Stack>
          </Paper>
        </Stack>
      )}

      {employee && (
        <Stack gap="xs">
          <Text fw={500}>Qualifications</Text>
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
          </Paper>
        </Stack>
      )}

      {row.userId && (
        <Stack gap="xs">
          <Text fw={500}>Their work</Text>
          <MemberWorkFile
            api={api}
            userId={row.userId}
            names={names}
            surface={surface}
            canEdit={STAFF_ROLES.includes(role)}
            notify={notify}
            onOpenJob={onOpenJob}
            onSaved={() => void onChanged()}
          />
        </Stack>
      )}
    </Stack>
  )
}
