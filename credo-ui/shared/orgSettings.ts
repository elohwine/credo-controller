import { PAYMENT_CHOICES, type OrgProfile } from './orgProfile'

export type OrgSettingsSection =
  | 'team'
  | 'actors'
  | 'departments'
  | 'roles'
  | 'authorities'
  | 'payments'
  | 'handoffs'
  | 'alerts'
  | 'brand'
  | 'store'
  | 'records'

export type OrgSettingsItemId =
  | 'team'
  | 'actors'
  | 'departments'
  | 'standins'
  | 'payments'
  | 'handoffs'
  | 'alerts'
  | 'brand'
  | 'store'
  | 'roles'
  | 'authorities'
  | 'records'
  | 'credentialOps'
  | 'systems'
  | 'partners'

export type OrgSettingsItem = {
  id: OrgSettingsItemId
  label: string
  /** Supporting text when the label alone is not clear. Live status replaces it when known. */
  summary?: string
  href: string
  mobileSection?: OrgSettingsSection
  /** Mobile route outside the organisation settings page. */
  mobileHref?: string
  adminOnly?: boolean
}

export type OrgSettingsGroup = {
  id: 'people' | 'work' | 'advanced'
  label: string
  detail: string
  items: OrgSettingsItem[]
}

export const ORG_SETTINGS_GROUPS: OrgSettingsGroup[] = [
  {
    id: 'people',
    label: 'People and responsibilities',
    detail: 'Invite your team and decide who handles each step.',
    items: [
      {
        id: 'team',
        label: 'HR operations',
        summary: 'Manage your team, employee records, app access and pay',
        href: '/hr?tab=team',
        mobileHref: '/people',
      },
      {
        id: 'actors',
        label: 'Who does what',
        summary: 'The person who handles each step',
        href: '/organization/actors',
        mobileSection: 'actors',
      },
      {
        id: 'departments',
        label: 'Departments',
        summary: 'Groups such as Finance or Operations',
        href: '/organization/departments',
        mobileSection: 'departments',
        adminOnly: true,
      },
      {
        id: 'standins',
        label: 'Stand-ins',
        summary: 'Who covers when someone is away',
        href: '/organization/delegations',
        adminOnly: true,
      },
    ],
  },
  {
    id: 'work',
    label: 'Work and communication',
    detail: 'Payments, request flow, alerts and how your organisation appears.',
    items: [
      {
        id: 'payments',
        label: 'Payments',
        summary: 'How customers pay you',
        href: '/organization/integrations',
        mobileSection: 'payments',
        adminOnly: true,
      },
      {
        id: 'handoffs',
        label: 'What happens next',
        summary: 'The step that follows each finished step',
        href: '/organization/handoffs',
        mobileSection: 'handoffs',
      },
      {
        id: 'alerts',
        label: 'WhatsApp alerts',
        summary: 'Messages sent when work needs someone',
        href: '/organization/whatsapp',
        mobileSection: 'alerts',
      },
      {
        id: 'brand',
        label: 'Brand and documents',
        summary: 'Logo, colours and VAT on documents',
        href: '/organization/brand',
        mobileSection: 'brand',
        adminOnly: true,
      },
      {
        id: 'store',
        label: 'Public profile',
        summary: 'What customers see when they find you',
        href: '/shop',
        mobileSection: 'store',
        adminOnly: true,
      },
    ],
  },
  {
    id: 'advanced',
    label: 'Advanced settings',
    detail: 'Approval permissions, record checks and connected systems.',
    items: [
      {
        id: 'roles',
        label: 'Roles',
        summary: 'What each job title is allowed to do',
        href: '/organization/roles',
        mobileSection: 'roles',
        adminOnly: true,
      },
      {
        id: 'authorities',
        label: 'Approval authorities',
        summary: 'Who may approve, and up to what amount',
        href: '/organization/authorities',
        mobileSection: 'authorities',
        adminOnly: true,
      },
      {
        id: 'records',
        label: 'Record settings',
        summary: 'Records issued, staff card and phone checks',
        href: '/organization/setup#records',
        mobileSection: 'records',
        adminOnly: true,
      },
      {
        id: 'credentialOps',
        label: 'Manage records',
        summary: 'Issue, suspend and revoke',
        href: '/organization/credential-operations',
        mobileHref: '/credential-operations',
        adminOnly: true,
      },
      {
        id: 'systems',
        label: 'Connected systems',
        summary: 'Sign-in partners and business software',
        href: '/organization/sign-in-partners',
        mobileHref: '/connected-systems',
        adminOnly: true,
      },
      {
        id: 'partners',
        label: 'Trusted partners',
        summary: 'Organisations whose records you accept',
        href: '/organization/trusted-partners',
        adminOnly: true,
      },
    ],
  },
]

/** Groups and items this person can open; members do not see admin-only settings. */
export function visibleOrgSettings(
  canManage: boolean,
  keep: (item: OrgSettingsItem) => boolean = () => true,
): OrgSettingsGroup[] {
  return ORG_SETTINGS_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => (canManage || !item.adminOnly) && keep(item)),
  })).filter((group) => group.items.length > 0)
}

export type OrgSettingsFacts = {
  profile?: OrgProfile | null
  memberCount?: number
  departmentCount?: number
  brandConfigured?: boolean
}

/** Current value of each setting, shown as supporting text (Android settings: show status, not a description). */
export function orgSettingsStatus(facts: OrgSettingsFacts): Partial<Record<OrgSettingsItemId, string>> {
  const status: Partial<Record<OrgSettingsItemId, string>> = {}
  if (typeof facts.memberCount === 'number' && facts.memberCount > 0) {
    status.team = facts.memberCount === 1 ? 'Only you so far' : `${facts.memberCount} people`
  }
  if (typeof facts.departmentCount === 'number') {
    status.departments =
      facts.departmentCount === 0
        ? 'None yet'
        : `${facts.departmentCount} ${facts.departmentCount === 1 ? 'department' : 'departments'}`
  }
  if (facts.profile?.approvalTitle) status.actors = `Money: ${facts.profile.approvalTitle}`
  if (facts.profile?.completedAt) {
    const pay = PAYMENT_CHOICES.find((choice) => choice.id === facts.profile?.paymentChoice)
    status.payments = facts.profile.paymentChoice === 'none' || !pay ? 'Not set up' : pay.label
  }
  if (facts.brandConfigured !== undefined)
    status.brand = facts.brandConfigured ? 'Your logo and colours' : 'Standard look'
  return status
}

export function orgSettingSummary(
  item: OrgSettingsItem,
  status: Partial<Record<OrgSettingsItemId, string>>,
): string | undefined {
  return status[item.id] ?? item.summary
}
