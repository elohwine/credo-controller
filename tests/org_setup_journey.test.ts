import { describe, expect, test } from '@jest/globals'
import { existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import { feedbackChannels, helpTopics } from '../credo-ui/shared/orgHelp'
import { EDITION_PRESET_SETUP, setEditionPresetSetup } from '../src/config/productEdition'
import {
  clearOrgSetupDraft,
  readOrgSetupDraft,
  saveOrgSetupDraft,
  setupChecklist,
  type OrgProfile,
} from '../credo-ui/shared/orgProfile'
import {
  ORG_SETTINGS_GROUPS,
  orgSettingSummary,
  orgSettingsStatus,
  visibleOrgSettings,
} from '../credo-ui/shared/orgSettings'

const profile: OrgProfile = {
  kinds: ['office'],
  modules: ['purchases', 'payables'],
  approvalPresetId: 'owner_handles_money',
  approvalTitle: 'Owner handles money',
  paymentChoice: 'none',
  completedAt: '2026-10-29T10:00:00Z',
}

describe('Organisation setup journey', () => {
  test('keeps the existing checklist and suggests only the first unfinished step', () => {
    setEditionPresetSetup(null)
    try {
      const steps = setupChecklist({ profile: null, items: [], memberCount: 1 })
      expect(steps.map((step) => step.id)).toEqual(['kinds', 'people', 'money', 'payments', 'brand', 'team'])
      expect(steps.find((step) => !step.done)?.id).toBe('kinds')
      const answered = setupChecklist({ profile, items: [], memberCount: 1 })
      expect(answered.find((step) => !step.done)?.id).toBe('brand')
      expect(answered.find((step) => step.id === 'team')?.done).toBe(false)
    } finally {
      setEditionPresetSetup(EDITION_PRESET_SETUP)
    }
  })

  test('SGK has no setup questions: the checklist starts at who handles money', () => {
    const steps = setupChecklist({ profile: null, items: [], memberCount: 1 })
    expect(steps.map((step) => step.id)).toEqual(['money', 'payments', 'brand', 'team'])
    expect(steps.find((step) => !step.done)?.id).toBe('brand')
  })

  test('does not turn a saved money choice into a blocker when invitations are still needed', () => {
    const steps = setupChecklist({
      profile: { ...profile, approvalPresetId: 'finance_team' },
      items: [{ key: 'stage_actor:release_funds', status: 'needs_attention' }],
      memberCount: 1,
      roles: ['owner'],
    })
    expect(steps.find((step) => step.id === 'money')).toMatchObject({
      done: true,
      note: expect.stringContaining('The owner stands in until then.'),
    })
  })

  test('retains payment attention separately from optional branding and team steps', () => {
    const steps = setupChecklist({
      profile,
      items: [{ key: 'payment_provider', status: 'needs_attention' }],
      memberCount: 1,
      brandConfigured: false,
    })
    expect(steps.find((step) => !step.done)?.id).toBe('payments')
    expect(steps.filter((step) => !step.done).map((step) => step.id)).toEqual(['payments', 'brand', 'team'])
  })

  test('recognises a completed checklist without inventing another required step', () => {
    const steps = setupChecklist({ profile, items: [], memberCount: 2, brandConfigured: true })
    expect(steps.every((step) => step.done)).toBe(true)
    expect(steps.find((step) => !step.done)).toBeUndefined()
  })
})

describe('Shared organisation settings navigation', () => {
  test('groups all mobile destinations once and preserves their admin-only visibility', () => {
    expect(ORG_SETTINGS_GROUPS.map((group) => group.id)).toEqual(['people', 'work', 'advanced'])
    const items = ORG_SETTINGS_GROUPS.flatMap((group) => group.items)
    const mobile = items.filter((item) => item.mobileSection)
    expect(mobile.map((item) => item.mobileSection).sort()).toEqual([
      'actors',
      'alerts',
      'authorities',
      'brand',
      'departments',
      'handoffs',
      'payments',
      'records',
      'roles',
      'store',
    ])
    expect(
      mobile
        .filter((item) => !item.adminOnly)
        .map((item) => item.mobileSection)
        .sort(),
    ).toEqual(['actors', 'alerts', 'handoffs'])
    // People is its own page, not a section inside organisation settings.
    const team = items.find((item) => item.id === 'team')
    expect(team?.mobileHref).toBe('/people')
    expect(team?.adminOnly).toBeFalsy()
  })

  test('keeps every former portal organisation settings destination reachable', () => {
    const items = ORG_SETTINGS_GROUPS.flatMap((group) => group.items)
    expect(items.map((item) => item.href)).toEqual(
      expect.arrayContaining([
        '/payroll?tab=employees',
        '/organization/setup#records',
        '/organization/actors',
        '/organization/handoffs',
        '/organization/credential-operations',
        '/organization/departments',
        '/organization/integrations',
        '/organization/whatsapp',
        '/organization/brand',
        '/organization/sign-in-partners',
        '/organization/delegations',
      ]),
    )
    for (const item of items) {
      const route = item.href.split('#')[0]
      const base = fileURLToPath(new URL(`../credo-ui/portal/pages${route}`, import.meta.url))
      expect(existsSync(`${base}.tsx`) || existsSync(path.join(base, 'index.tsx'))).toBe(true)
    }
  })
})

describe('Settings status and visibility', () => {
  test('shows the current value of a setting instead of a description when it is known', () => {
    const status = orgSettingsStatus({
      profile: { ...profile, paymentChoice: 'simulated' },
      memberCount: 3,
      departmentCount: 0,
      brandConfigured: false,
    })
    expect(status).toMatchObject({
      team: '3 people',
      departments: 'None yet',
      actors: 'Money: Owner handles money',
      payments: 'Simulated pay',
      brand: 'Standard look',
    })
    const items = ORG_SETTINGS_GROUPS.flatMap((group) => group.items)
    const payments = items.find((item) => item.id === 'payments')!
    expect(orgSettingSummary(payments, status)).toBe('Simulated pay')
    expect(orgSettingSummary(payments, {})).toBe('How customers pay you')
    expect(orgSettingsStatus({ profile: { ...profile, paymentChoice: 'none' } }).payments).toBe('Not set up')
    expect(orgSettingsStatus({ memberCount: 1 }).team).toBe('Only you so far')
  })

  test('members only see settings they can change, and empty groups are hidden', () => {
    const member = visibleOrgSettings(false)
    expect(member.map((group) => group.id)).toEqual(['people', 'work'])
    expect(member.flatMap((group) => group.items).every((item) => !item.adminOnly)).toBe(true)
    const adminIds = visibleOrgSettings(true).flatMap((group) => group.items.map((item) => item.id))
    expect(new Set(adminIds).size).toBe(adminIds.length)
    expect(adminIds).toHaveLength(ORG_SETTINGS_GROUPS.flatMap((group) => group.items).length)
  })

  test('every setting has supporting text or a live status', () => {
    for (const item of ORG_SETTINGS_GROUPS.flatMap((group) => group.items)) {
      expect(item.summary).toBeTruthy()
    }
  })
})

describe('Setup draft on this device', () => {
  const store = new Map<string, string>()
  const fakeWindow = {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
  }

  test('keeps unconfirmed answers per organisation until they are cleared', () => {
    ;(globalThis as any).window = fakeWindow
    try {
      saveOrgSetupDraft('org-a', {
        question: 3,
        kinds: ['field', 'not-a-kind' as any],
        modules: ['purchases'],
        operatingModel: 'internal',
        presetId: 'finance_team',
        paymentChoice: 'ecocash',
        teams: ['Finance'],
      })
      saveOrgSetupDraft('org-b', {
        question: 1,
        kinds: [],
        modules: [],
        presetId: '',
        paymentChoice: 'none',
        teams: null,
      })
      expect(readOrgSetupDraft('org-a')).toMatchObject({
        question: 3,
        kinds: ['field'],
        modules: ['purchases'],
        presetId: 'finance_team',
        paymentChoice: 'ecocash',
        teams: ['Finance'],
      })
      clearOrgSetupDraft('org-a')
      expect(readOrgSetupDraft('org-a')).toBeNull()
      expect(readOrgSetupDraft('org-b')?.question).toBe(1)
      store.set('credoOrgSetupDraft', '{broken')
      expect(readOrgSetupDraft('org-b')).toBeNull()
    } finally {
      delete (globalThis as any).window
    }
  })
})

describe('Help & Feedback', () => {
  test('answers the progress question and links help topics to real settings', () => {
    const ids = new Set(ORG_SETTINGS_GROUPS.flatMap((group) => group.items.map((item) => item.id)))
    expect(helpTopics().map((topic) => topic.id)).not.toContain('progress')
    setEditionPresetSetup(null)
    try {
      expect(helpTopics().map((topic) => topic.id)).toContain('progress')
    } finally {
      setEditionPresetSetup(EDITION_PRESET_SETUP)
    }
    for (const topic of helpTopics()) {
      if (topic.setting) expect(ids.has(topic.setting)).toBe(true)
    }
  })

  test('uses only configured feedback channels', () => {
    const before = { ...process.env }
    try {
      delete process.env.NEXT_PUBLIC_FEEDBACK_EMAIL
      delete process.env.NEXT_PUBLIC_FEEDBACK_WHATSAPP
      expect(feedbackChannels('Portal · setup')).toEqual([])
      process.env.NEXT_PUBLIC_FEEDBACK_EMAIL = 'help@example.com'
      process.env.NEXT_PUBLIC_FEEDBACK_WHATSAPP = '+263 77 000 0000'
      const channels = feedbackChannels('Portal · setup')
      expect(channels.map((channel) => channel.id)).toEqual(['email', 'whatsapp'])
      expect(channels[0].href).toMatch(/^mailto:help@example\.com\?subject=/)
      expect(channels[1].href).toMatch(/^https:\/\/wa\.me\/263770000000\?text=/)
    } finally {
      process.env = before
    }
  })
})
