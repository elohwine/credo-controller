import { useCallback, useEffect, useSyncExternalStore } from 'react'

/**
 * First-run guidance that follows the person, not the phone: progress is stored on the server per
 * account and cached here so tips do not flash while it loads. Both apps pass their own HTTP client.
 */

export type GuideKey =
  | 'welcome'
  | 'getting_started'
  | 'tip_inbox'
  | 'tip_records'
  | 'tip_network'
  | 'tip_scan'
  | 'tip_operations'
  | 'tip_org_settings'
  | 'records_seen'
  | 'device_signin'
  | 'next_use'

export type GuideStatus = 'done' | 'dismissed'

export interface GuideClient {
  get<T>(path: string): Promise<T>
  put<T>(path: string, body: unknown): Promise<T>
}

export interface GettingStartedOrg {
  orgTenantId: string
  orgName: string
}

export interface GettingStartedStatus {
  identityCard: boolean
  deviceSignIn: boolean
  organisation: boolean
  cardSaving: boolean
  /** An organisation sent this person a staff card they have not accepted yet. */
  staffCardWaiting?: (GettingStartedOrg & { offerId: string }) | null
  /** An organisation this person runs whose setup questions are not answered yet. */
  setupToFinish?: GettingStartedOrg | null
}

export interface HolderSettings {
  autoSaveCards: boolean
}

export const GUIDE_PATHS = {
  guides: '/api/wallet/credentials/guides',
  gettingStarted: '/api/wallet/credentials/getting-started',
  holderSettings: '/api/wallet/credentials/holder-settings',
}

export type TipKey = Exclude<GuideKey, 'welcome' | 'getting_started' | 'records_seen' | 'device_signin' | 'next_use'>

/** One short line per section: what this place is for and the one thing to do first. */
export const TIP_COPY: Record<TipKey, { title: string; body: string }> = {
  tip_inbox: {
    title: 'Everything that needs you lands here',
    body: 'New cards, tasks and requests wait here until you decide. Nothing is shared without your tap.',
  },
  tip_records: {
    title: 'Your saved cards and records',
    body: 'Cards you accept are kept here. Open one to see who issued it and when it expires.',
  },
  tip_network: {
    title: 'Organisations you work with',
    body: 'Find an organisation to see what it offers, or switch to one you belong to.',
  },
  tip_scan: {
    title: 'Scan to receive or share',
    body: 'Point the camera at a Credentis QR code. You will always see who is asking before anything is shared.',
  },
  tip_operations: {
    title: 'Work in progress',
    body: 'Quotes, invoices, payments and jobs for the account in use are kept together here.',
  },
  tip_org_settings: {
    title: 'Set up your organisation',
    body: 'Answer a few short questions and we prepare the rest. The checklist shows what is left.',
  },
}

const FIELD_ROLES = new Set(['field_worker', 'technician', 'driver', 'worker'])
const MONEY_ROLES = new Set(['finance_manager', 'finance_officer', 'accountant', 'payroll', 'cashier'])
const DECIDER_ROLES = new Set(['manager', 'supervisor', 'approver', 'director', 'inspector', 'dispatcher', 'hr_manager'])

/** The tip for a section in words that fit the person's role in the organisation in use. */
export function tipCopyFor(tip: TipKey, role?: string | null): { title: string; body: string } {
  const value = String(role || '').toLowerCase()
  if (tip === 'tip_operations' && value) {
    if (FIELD_ROLES.has(value)) {
      return { title: 'Your jobs', body: 'Jobs assigned to you are here. Open one to start it, add photos and mark it done.' }
    }
    if (MONEY_ROLES.has(value)) {
      return { title: 'Money waiting for you', body: 'Payouts to release, supplier bills to pay and payments coming in. Each one opens its history.' }
    }
    if (DECIDER_ROLES.has(value)) {
      return { title: 'Work to check', body: 'Jobs to sign off and requests to decide. You confirm with your staff card.' }
    }
  }
  return TIP_COPY[tip]
}

type Progress = Partial<Record<GuideKey, GuideStatus>>
interface Snapshot {
  account: string | null
  ready: boolean
  progress: Progress
}

const CACHE_PREFIX = 'credoGuides:'
const listeners = new Set<() => void>()
let snapshot: Snapshot = { account: null, ready: false, progress: {} }
let loading: string | null = null

function emit(next: Snapshot) {
  snapshot = next
  listeners.forEach((listener) => listener())
}

function readCache(account: string): Progress | null {
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + account)
    return raw ? (JSON.parse(raw) as Progress) : null
  } catch {
    return null
  }
}

function writeCache(account: string, progress: Progress) {
  try {
    window.localStorage.setItem(CACHE_PREFIX + account, JSON.stringify(progress))
  } catch {
    /* storage full or blocked: the server copy still counts */
  }
}

function fromServer(value: unknown): Progress {
  const guides = (value as { guides?: Record<string, { status?: GuideStatus }> })?.guides || {}
  const progress: Progress = {}
  for (const [key, state] of Object.entries(guides)) {
    if (state?.status === 'done' || state?.status === 'dismissed') progress[key as GuideKey] = state.status
  }
  return progress
}

let guideRevision = 0

export async function loadGuides(client: GuideClient, account: string) {
  if (loading === account) return
  loading = account
  const revisionAtStart = guideRevision
  try {
    const progress = fromServer(await client.get(GUIDE_PATHS.guides))
    // A guide marked while this load was in flight is newer than the server copy.
    if (guideRevision !== revisionAtStart) return
    writeCache(account, progress)
    if (snapshot.account === account) emit({ account, ready: true, progress })
  } catch {
    // Offline or signed out: keep the cache. With no cache, stay quiet rather than repeat guides.
    if (snapshot.account === account && !snapshot.ready) emit({ ...snapshot, ready: Boolean(readCache(account)) })
  } finally {
    if (loading === account) loading = null
  }
}

export async function markGuide(
  client: GuideClient,
  account: string,
  key: GuideKey,
  status: GuideStatus | 'reset',
) {
  guideRevision += 1
  const progress = { ...(snapshot.account === account ? snapshot.progress : {}) }
  if (status === 'reset') delete progress[key]
  else progress[key] = status
  writeCache(account, progress)
  emit({ account, ready: true, progress })
  try {
    await client.put(`${GUIDE_PATHS.guides}/${key}`, { status })
  } catch {
    /* kept locally; the next load reconciles with the server */
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const serverSnapshot: Snapshot = { account: null, ready: false, progress: {} }

export function useGuides(client: GuideClient | null, account: string | null) {
  const state = useSyncExternalStore(subscribe, () => snapshot, () => serverSnapshot)

  useEffect(() => {
    if (!client || !account) return
    if (snapshot.account !== account) {
      const cached = readCache(account)
      emit({ account, ready: Boolean(cached), progress: cached || {} })
    }
    void loadGuides(client, account)
  }, [client, account])

  const current = state.account === account ? state : serverSnapshot

  const mark = useCallback(
    async (key: GuideKey, status: GuideStatus | 'reset') => {
      if (!account || !client) return
      await markGuide(client, account, key, status)
    },
    [client, account],
  )

  return {
    ready: current.ready,
    /** True when this guide should not be shown again. Unknown until ready, so nothing flashes. */
    isDone: (key: GuideKey) => !current.ready || Boolean(current.progress[key]),
    mark,
  }
}

/** Real account state behind the checklist. Returns null until it loads. */
export async function loadGettingStarted(client: GuideClient): Promise<GettingStartedStatus | null> {
  try {
    const value = await client.get<GettingStartedStatus>(GUIDE_PATHS.gettingStarted)
    return value && typeof value === 'object' ? value : null
  } catch {
    return null
  }
}

/** Sent when inbox items change outside the checklist (a card accepted or saved automatically). */
export const INBOX_CHANGED_EVENT = 'credentis:inbox-changed'

export function announceInboxChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(INBOX_CHANGED_EVENT))
}

/** True when every listed step is done. The portal list omits phone sign-in. */
export function checklistMarkedDone(stepIds: ChecklistStep[], status: ChecklistStatus): boolean {
  const finished = stepIds.every((id) => Boolean(status[id]))
  return finished
}

export type ChecklistStep = keyof ChecklistStatus

/** The phone sign-in step stays up after the shared checklist is closed, until this phone is enrolled or the prompt is dismissed. */
export function phoneDeviceStepStillOpen(input: {
  deviceLogin: boolean
  deviceSignIn: boolean
  devicePromptDone: boolean
}): boolean {
  const open = input.deviceLogin && !input.deviceSignIn && !input.devicePromptDone
  return open
}

/** Server state plus progress only the app knows, such as having looked at Records. */
export interface ChecklistStatus extends Omit<GettingStartedStatus, 'staffCardWaiting' | 'setupToFinish'> {
  records: boolean
  /** Ticked when no organisation is waiting on this person's setup answers. */
  orgSetup: boolean
  /** Ticked when no staff card is waiting for this person. */
  staffCard: boolean
  /** Ticked when this person chose to keep cards only, with no organisation. */
  nextUse: boolean
}

export interface ChecklistChoice {
  id: string
  label: string
}

export interface ChecklistCopy {
  title: string
  detail: string
  action: string
  /** Replaces the single action when the step is a choice. Value first, then the action. */
  choices?: ChecklistChoice[]
}

/**
 * The steps this person sees, in order. Until the identity card is accepted, that is the only step.
 * After it, saving other cards is a choice, then Records, then either a waiting staff card, unfinished
 * organisation setup, or what they want to do next. An organisation is never required.
 * `withDevice` adds phone sign-in (phone only).
 */
export function checklistFor(
  server: GettingStartedStatus,
  local: { records: boolean; withDevice: boolean; nextUse: boolean },
): { status: ChecklistStatus; steps: ChecklistStep[]; copy: Partial<Record<ChecklistStep, ChecklistCopy>> } {
  const status: ChecklistStatus = {
    identityCard: server.identityCard,
    deviceSignIn: server.deviceSignIn,
    organisation: server.organisation,
    cardSaving: server.cardSaving,
    records: local.records,
    orgSetup: !server.setupToFinish,
    staffCard: !server.staffCardWaiting,
    nextUse: local.nextUse || server.organisation,
  }
  const copy: Partial<Record<ChecklistStep, ChecklistCopy>> = {}
  if (!server.identityCard) {
    return { status, steps: ['identityCard'], copy }
  }
  const steps: ChecklistStep[] = ['identityCard', 'cardSaving', 'records']
  if (local.withDevice) steps.push('deviceSignIn')
  if (server.staffCardWaiting) {
    steps.push('staffCard')
    copy.staffCard = {
      title: `Accept your staff card from ${server.staffCardWaiting.orgName}`,
      detail: 'It shows you work there and lets you confirm the steps you handle. It is waiting in Inbox.',
      action: 'Show card',
    }
  } else if (server.setupToFinish) {
    steps.push('orgSetup')
    copy.orgSetup = {
      title: `Finish setting up ${server.setupToFinish.orgName}`,
      detail: 'A few short questions decide which work it runs. You can stop and come back.',
      action: 'Continue',
    }
  } else if (!server.organisation) {
    steps.push('nextUse')
  }
  return { status, steps, copy }
}

export const CHECKLIST_COPY: Record<ChecklistStep, ChecklistCopy> = {
  staffCard: {
    title: 'Accept your staff card',
    detail: 'It shows you work there and lets you confirm the steps you handle. It is waiting in Inbox.',
    action: 'Show card',
  },
  orgSetup: {
    title: 'Finish setting up your organisation',
    detail: 'A few short questions decide which work it runs. You can stop and come back.',
    action: 'Continue',
  },
  identityCard: {
    title: 'Accept your identity card',
    detail: 'It is waiting in Inbox. You need it to sign in with your phone and to prove who you are.',
    action: 'Show card',
  },
  records: {
    title: 'Find it in Records',
    detail: 'Saved cards live in Records. Open yours to see who issued it and what it holds.',
    action: 'Open Records',
  },
  deviceSignIn: {
    title: 'Sign in with this phone',
    detail: 'Use your screen lock next time instead of typing your PIN.',
    action: 'Set up',
  },
  organisation: {
    title: 'Start an organisation',
    detail: 'Only if you want to run one. You can keep cards here without it.',
    action: 'Start',
  },
  nextUse: {
    title: 'What do you want to do?',
    detail: 'You can keep cards here with no organisation. Or find a business to ask for a service, or start an organisation.',
    action: 'Choose',
    choices: [
      { id: 'keep', label: 'Just my cards' },
      { id: 'find', label: 'Find a business' },
      { id: 'start', label: 'Start an organisation' },
    ],
  },
  cardSaving: {
    title: 'Save some cards for you?',
    detail: 'You accept each card yourself, including your identity card. If you turn this on, receipts, staff cards and records are saved the next time you open Inbox. Tasks, bills, payment requests and requests to share still wait for you.',
    action: 'Choose',
    choices: [
      { id: 'on', label: 'Turn on' },
      { id: 'off', label: 'Not now' },
    ],
  },
}
