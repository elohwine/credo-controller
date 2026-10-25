/**
 * Milestone animations shared by the mobile app and the portal.
 * Each kind maps to one small Lottie JSON in this folder; files load only when a milestone plays.
 */
export type MilestoneKind =
  | 'card_saved'
  | 'payment_done'
  | 'org_setup'
  | 'account_created'
  | 'request_approved'
  | 'workflow_complete'
  | 'empty_inbox'

export type MilestoneAnimation = 'success' | 'payment' | 'celebration' | 'welcome' | 'completion' | 'empty'

export const MILESTONE_ANIMATION: Record<MilestoneKind, MilestoneAnimation> = {
  card_saved: 'success',
  payment_done: 'payment',
  org_setup: 'celebration',
  account_created: 'welcome',
  request_approved: 'success',
  workflow_complete: 'completion',
  empty_inbox: 'empty',
}

/** Loops for in-place states; everything else plays once. */
export const MILESTONE_LOOPS: Partial<Record<MilestoneKind, boolean>> = { empty_inbox: true }

/** How long an overlay milestone stays before it closes itself (ms). */
export const MILESTONE_DURATION_MS = 2600

export function loadMilestoneAnimation(kind: MilestoneKind): Promise<object> {
  switch (MILESTONE_ANIMATION[kind]) {
    case 'payment':
      return import('./payment.json').then((m) => m.default as object)
    case 'celebration':
      return import('./celebration.json').then((m) => m.default as object)
    case 'welcome':
      return import('./welcome.json').then((m) => m.default as object)
    case 'completion':
      return import('./completion.json').then((m) => m.default as object)
    case 'empty':
      return import('./empty.json').then((m) => m.default as object)
    default:
      return import('./success.json').then((m) => m.default as object)
  }
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}
