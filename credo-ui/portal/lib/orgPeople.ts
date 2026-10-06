/**
 * Plain-language helpers for organisation setup screens (People, Roles, Delegations).
 * Customers never see user IDs or permission keys; these map them to names and choices.
 */

export interface OrgPerson {
  userId: string
  role: string
  status?: string
  displayName?: string
  phone?: string
}

export const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Team member',
  field_worker: 'Field worker',
  supervisor: 'Supervisor',
  dispatcher: 'Dispatcher',
  approver: 'Approver',
  manager: 'Manager',
  finance_manager: 'Finance officer',
  director: 'Director',
}

export function roleLabel(role?: string): string {
  if (!role) return 'Team member'
  return ROLE_LABEL[role] || role.replace(/[_.-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function personLabel(member?: Pick<OrgPerson, 'displayName' | 'phone' | 'role'> | null): string {
  if (!member) return 'Team member'
  const name = String(member.displayName || '').trim()
  if (name && name.toLowerCase() !== 'organization owner') return name
  if (member.phone) return member.phone
  return member.role === 'owner' ? 'Owner' : 'Team member'
}

export function personLabelById(members: OrgPerson[], userId: string): string {
  const match = members.find((m) => m.userId === userId)
  if (match) return personLabel(match)
  return 'Former team member'
}

/** What a person is allowed to do, in customer words, mapped to the keys the engine checks. */
export const PERMISSION_CHOICES: Array<{ value: string; label: string; group: string }> = [
  { value: 'request.read', label: 'See requests', group: 'Requests' },
  { value: 'request.submit', label: 'Raise requests', group: 'Requests' },
  { value: 'request.approve', label: 'Approve requests', group: 'Requests' },
  { value: 'request.complete', label: 'Confirm work is done', group: 'Requests' },
  { value: 'finance.release', label: 'Release money', group: 'Money' },
  { value: 'finance.pay', label: 'Record payments', group: 'Money' },
  { value: 'finance.receipt', label: 'Issue receipts', group: 'Money' },
  { value: 'field.assign', label: 'Assign field jobs', group: 'Field work' },
  { value: 'field.execute', label: 'Do field jobs', group: 'Field work' },
  { value: 'field.inspect', label: 'Inspect and sign off jobs', group: 'Field work' },
  { value: 'hr.approve', label: 'Approve new staff', group: 'People' },
]

export function permissionLabel(key: string): string {
  const match = PERMISSION_CHOICES.find((choice) => choice.value === key)
  return match ? match.label : key.replace(/[_.]+/g, ' ')
}
