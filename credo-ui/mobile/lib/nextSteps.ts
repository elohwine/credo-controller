/**
 * Turns the organisation next-steps read into the Home card.
 * The phone copy of this file stays the same, including the route table.
 */

export interface NextStepItem {
  id: string
  kind: 'inbox' | 'setup'
  title: string
  detail: string
  href: 'inbox' | 'setup'
  inboxItemId?: string
  requestId?: string
}

export interface NextStepCard {
  sentence: string
  detail: string
  href: string
  moreLabel: string
  moreHref: string
}

const ROUTES = {
  portal: { inbox: '/inbox', setup: '/organization/setup' },
  phone: { inbox: '/inbox', setup: '/settings/org' },
} as const

export function nextStepCard(items: NextStepItem[], surface: 'portal' | 'phone'): NextStepCard | null {
  const first = items[0]
  if (!first) return null
  const routes = ROUTES[surface]
  const screen = first.href === 'setup' ? 'setup' : 'inbox'
  const more = items.length - 1
  const moreScreen = items.some((item) => item.kind === 'inbox') ? 'inbox' : 'setup'
  return {
    sentence: first.kind === 'setup' ? `Finish setup: ${first.title}` : first.title,
    detail: first.detail,
    href: routes[screen],
    moreLabel: more > 0 ? `and ${more} more` : '',
    moreHref: routes[moreScreen],
  }
}
