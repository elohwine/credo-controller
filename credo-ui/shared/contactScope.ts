export type ContactScope = 'internal' | 'external'

export const CONTACT_SCOPE_FILTERS = [
  { value: 'all', label: 'Everyone' },
  { value: 'internal', label: 'Team' },
  { value: 'external', label: 'Clients & contacts' },
] as const

export function contactScopeLabel(scope: ContactScope): string {
  return scope === 'internal' ? 'Team contact' : 'Client / external'
}

export function contactScopeDescription(scope: ContactScope): string {
  return scope === 'internal'
    ? 'People in your organisation’s team. Employee details and staff access are managed in HR operations.'
    : 'Clients, customers, suppliers and other people outside your organisation.'
}
