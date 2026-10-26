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

export type GuideStatus = 'done' | 'dismissed'

export interface GuideClient {
  get<T>(path: string): Promise<T>
  put<T>(path: string, body: unknown): Promise<T>
}

export interface GettingStartedStatus {
  identityCard: boolean
  deviceSignIn: boolean
  organisation: boolean
  cardSaving: boolean
}

export interface HolderSettings {
  autoSaveCards: boolean
}

export const GUIDE_PATHS = {
  guides: '/api/wallet/credentials/guides',
  gettingStarted: '/api/wallet/credentials/getting-started',
  holderSettings: '/api/wallet/credentials/holder-settings',
}

export type TipKey = Exclude<GuideKey, 'welcome' | 'getting_started' | 'records_seen'>

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

async function load(client: GuideClient, account: string) {
  if (loading === account) return
  loading = account
  try {
    const progress = fromServer(await client.get(GUIDE_PATHS.guides))
    writeCache(account, progress)
    if (snapshot.account === account) emit({ account, ready: true, progress })
  } catch {
    // Offline or signed out: keep the cache. With no cache, stay quiet rather than repeat guides.
    if (snapshot.account === account && !snapshot.ready) emit({ ...snapshot, ready: Boolean(readCache(account)) })
  } finally {
    if (loading === account) loading = null
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
    void load(client, account)
  }, [client, account])

  const current = state.account === account ? state : serverSnapshot

  const mark = useCallback(
    async (key: GuideKey, status: GuideStatus | 'reset') => {
      if (!account) return
      const progress = { ...(snapshot.account === account ? snapshot.progress : {}) }
      if (status === 'reset') delete progress[key]
      else progress[key] = status
      writeCache(account, progress)
      emit({ account, ready: true, progress })
      try {
        await client?.put(`${GUIDE_PATHS.guides}/${key}`, { status })
      } catch {
        /* kept locally; the next load reconciles with the server */
      }
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

export type ChecklistStep = keyof ChecklistStatus

/** Server state plus progress only the app knows, such as having looked at Records. */
export interface ChecklistStatus extends GettingStartedStatus {
  records: boolean
}

export const CHECKLIST_COPY: Record<ChecklistStep, { title: string; detail: string; action: string }> = {
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
    title: 'Join or start an organisation',
    detail: 'Find your employer or a business you work with, or set up your own.',
    action: 'Find',
  },
  cardSaving: {
    title: 'Choose how new cards are saved',
    detail: 'Keep tapping Accept for each card, or let Credentis save cards for you.',
    action: 'Choose',
  },
}
