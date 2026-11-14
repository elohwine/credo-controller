export type ActorMainRole = 'approver' | 'finance' | 'hr' | 'operations'

export const ACTOR_MAIN_ROLE_ORDER: ActorMainRole[] = ['approver', 'finance', 'hr', 'operations']

export const ACTOR_MAIN_ROLE_LABEL: Record<ActorMainRole, string> = {
  approver: 'Approver',
  finance: 'Finance',
  hr: 'HR',
  operations: 'Operations',
}

export const ACTOR_MAIN_ROLE_HINT: Record<ActorMainRole, string> = {
  approver: 'General approvals and disputes.',
  finance: 'Money approvals, release and receipts.',
  hr: 'Staff onboarding and payroll actions.',
  operations: 'Field operations and completion checks.',
}

export function actorMainRoleLabel(role: string): string {
  const normalized = String(role || '').trim().toLowerCase() as ActorMainRole
  return ACTOR_MAIN_ROLE_LABEL[normalized] || role
}

