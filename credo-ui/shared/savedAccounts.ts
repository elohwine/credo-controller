/**
 * Accounts remembered on this browser, the same way GitHub keeps several
 * signed-in accounts on one computer. Switching restores that account's own
 * session. Another browser does not see them. Nothing here is sent to the server.
 */

export interface SavedAccount {
  id: string
  label: string
  savedAt: string
  session: Record<string, string>
  /** The session no longer works (expired, signed out elsewhere, or the account was reset). */
  signedOut?: boolean
  checkedAt?: string
  phone?: string
}

const STORAGE_KEY = 'credoSavedAccounts'

interface IdentitySubject {
  displayName?: string
  phone?: string
  claims?: { displayName?: string; phone?: string }
}

const SESSION_KEYS = [
  'walletToken',
  'authToken',
  'auth.token',
  'credoTenantToken',
  'tenantToken',
  'credoOrgToken',
  'credoActiveOrg',
  'credoContextMode',
  'credoTenantId',
  'tenantId',
  'credoOrgName',
  'credoUserPhone',
  'credoUserName',
  'holderUsername',
  'walletPhone',
  'walletEmail',
  'credoUserRole',
  'credoTenantSector',
  'credoActiveWorkflowTypes',
  'credoActiveTemplateId',
]

function readTokenTenantId(token: string | null): string | null {
  if (!token) return null
  try {
    const parts = token.split('.')
    if (parts.length < 2) return null
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
    const tenantId = payload?.tenantId
    return typeof tenantId === 'string' && tenantId.trim() ? tenantId.trim() : null
  } catch {
    return null
  }
}

function readList(): SavedAccount[] {
  if (typeof window === 'undefined') return []
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    if (!Array.isArray(parsed)) return []
    return dedupeByPerson(
      parsed.filter(
        (entry) => entry && typeof entry.id === 'string' && entry.session && typeof entry.session === 'object',
      ),
    )
  } catch {
    return []
  }
}

/**
 * The same person, told apart by phone (last nine digits, so +263…, 263… and 0… match) or email.
 * A person who signs up again gets a new wallet; they are still one person on this phone.
 */
export function savedAccountPersonKey(session: Record<string, string>, id: string): string {
  const phone = String(session.credoUserPhone || session.walletPhone || '').replace(/\D/g, '')
  if (phone.length >= 9) return `phone:${phone.slice(-9)}`
  const email = String(session.walletEmail || '').trim().toLowerCase()
  if (email) return `email:${email}`
  return `wallet:${id}`
}

/** Keep one row per person: the most recently saved one (the list is newest first). */
export function dedupeByPerson(accounts: SavedAccount[]): SavedAccount[] {
  const seen = new Set<string>()
  const kept: SavedAccount[] = []
  for (const account of accounts) {
    const key = savedAccountPersonKey(account.session, account.id)
    if (seen.has(key) || seen.has(`wallet:${account.id}`)) continue
    seen.add(key)
    seen.add(`wallet:${account.id}`)
    kept.push(account)
  }
  return kept
}

function writeList(accounts: SavedAccount[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts))
}

function snapshotSession(): Record<string, string> {
  const session: Record<string, string> = {}
  for (const key of SESSION_KEYS) {
    const value = localStorage.getItem(key)
    if (value) session[key] = value
  }
  return session
}

function applySnapshot(session: Record<string, string>) {
  localStorage.removeItem('credoOrganizations')
  for (const key of SESSION_KEYS) {
    if (session[key]) localStorage.setItem(key, session[key])
    else localStorage.removeItem(key)
  }
}

export function currentAccountId(): string | null {
  if (typeof window === 'undefined') return null
  const personal =
    localStorage.getItem('walletToken') || localStorage.getItem('authToken') || localStorage.getItem('auth.token')
  return readTokenTenantId(personal)
}

export function listSavedAccounts(): SavedAccount[] {
  return readList().map((account) => ({
    id: account.id,
    label: savedAccountLabel(
      account.session.credoUserName || account.session.holderUsername,
      account.session.credoUserPhone || account.session.walletPhone,
      account.label,
    ),
    savedAt: account.savedAt,
    signedOut: Boolean(account.signedOut),
    phone: account.session.credoUserPhone || account.session.walletPhone || undefined,
    session: {},
  }))
}

/** Names the platform fills in before a person gives their own. Never shown as somebody's name. */
export function isPlaceholderName(name?: string | null): boolean {
  const value = String(name || '').trim()
  return !value || /^(team member|organi[sz]ation owner|account|my account)$/i.test(value)
}

export function savedAccountLabel(name?: string, phone?: string, fallback = 'Account'): string {
  const displayName = isPlaceholderName(name) ? '' : name!.trim()
  const raw = phone?.trim()
  // Stored numbers are not all written the same way; show them in one international form so
  // two accounts are told apart by country code rather than by formatting.
  const number = raw && /^\d{9,15}$/.test(raw) ? `+${raw}` : raw
  if (displayName && number) return `${displayName} (${number})`
  if (displayName) return displayName
  if (number) return number
  return isPlaceholderName(fallback) ? 'Account' : fallback
}

const SESSION_CHECK_INTERVAL_MS = 10 * 60 * 1000

/**
 * Check each saved account still has a working session, and read display names from each
 * holder's own identity card (never from the active organisation). An account whose session no
 * longer works is kept and marked signed out, so the person can sign in again from the switcher.
 */
export async function loadSavedAccountNames(backend: string): Promise<void> {
  const now = Date.now()
  const due = readList().filter((account) => {
    const nameMissing = isPlaceholderName(account.session.credoUserName || account.session.holderUsername)
    const lastCheck = account.checkedAt ? Date.parse(account.checkedAt) : 0
    return nameMissing || !lastCheck || now - lastCheck > SESSION_CHECK_INTERVAL_MS
  })
  const results = await Promise.allSettled(
    due.map(async (account): Promise<AccountCheck> => {
      const token = account.session.walletToken || account.session.authToken || account.session['auth.token']
      if (!token) return { id: account.id, signedOut: true }
      const sessionResponse = await fetch(`${backend}/api/ssi/auth/session`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresInSeconds: 900 }),
      })
      if (sessionResponse.status === 401 || sessionResponse.status === 403 || sessionResponse.status === 404)
        return { id: account.id, signedOut: true }
      if (!sessionResponse.ok) throw new Error(`Could not check a saved account (${sessionResponse.status}).`)
      const session: { token?: string } = await sessionResponse.json()
      if (!session.token) throw new Error('The saved account session did not return a wallet token.')
      const response = await fetch(
        `${backend}/api/wallet/${encodeURIComponent(account.id)}/credentials/list?limit=5&type=PlatformIdentityCredential`,
        { headers: { Authorization: `Bearer ${session.token}` } },
      )
      if (response.status === 401 || response.status === 403 || response.status === 404)
        return { id: account.id, signedOut: true }
      if (!response.ok) throw new Error(`Could not read a saved account's identity (${response.status}).`)
      const data: {
        items?: Array<{
          withdrawn?: boolean
          parsedDocument?: { credentialSubject?: IdentitySubject }
        }>
      } = await response.json()
      // Identity cards put the name either on the subject or under its claims.
      const subjectOf = (item: { parsedDocument?: { credentialSubject?: IdentitySubject } }) => {
        const subject = item.parsedDocument?.credentialSubject
        return { ...(subject?.claims || {}), ...(subject || {}) }
      }
      const identity = data.items?.find((item) => !item.withdrawn && !isPlaceholderName(subjectOf(item).displayName))
      const subject = identity ? subjectOf(identity) : {}
      const name = subject.displayName?.trim()
      return { id: account.id, signedOut: false, name: name || undefined, phone: subject.phone }
    }),
  )
  const accounts = readList()
  const checkedAt = new Date().toISOString()
  for (const result of results) {
    if (result.status !== 'fulfilled') continue
    const update = result.value
    const account = accounts.find((entry) => entry.id === update.id)
    if (!account) continue
    account.signedOut = update.signedOut
    account.checkedAt = checkedAt
    if (update.name) account.session.credoUserName = update.name
    if (!account.session.credoUserPhone && update.phone) account.session.credoUserPhone = update.phone
    if (update.name && currentAccountId() === update.id) {
      localStorage.setItem('credoUserName', update.name)
      if (!localStorage.getItem('credoUserPhone') && update.phone) localStorage.setItem('credoUserPhone', update.phone)
    }
  }
  writeList(accounts)
  const failed = results.find((result) => result.status === 'rejected')
  if (failed?.status === 'rejected') throw failed.reason
}

interface AccountCheck {
  id: string
  signedOut: boolean
  name?: string
  phone?: string
}

/** Keep the signed-in account on this browser so it can be opened again without the PIN. */
export function rememberCurrentAccount(label?: string): void {
  if (typeof window === 'undefined') return
  const id = currentAccountId()
  if (!id) return
  const phone = localStorage.getItem('credoUserPhone') || localStorage.getItem('walletPhone') || ''
  const nextLabel = savedAccountLabel(
    localStorage.getItem('credoUserName') || localStorage.getItem('holderUsername') || undefined,
    phone,
    label,
  )
  const session = snapshotSession()
  const person = savedAccountPersonKey(session, id)
  const accounts = readList().filter(
    (account) => account.id !== id && savedAccountPersonKey(account.session, account.id) !== person,
  )
  accounts.unshift({ id, label: nextLabel, savedAt: new Date().toISOString(), checkedAt: new Date().toISOString(), session })
  writeList(accounts)
}

export function restoreAccount(id: string): boolean {
  if (typeof window === 'undefined') return false
  const account = readList().find((entry) => entry.id === id)
  if (!account) return false
  rememberCurrentAccount()
  applySnapshot(account.session)
  return true
}

/** Leave the current sign-in so another person can sign in, without dropping the accounts already saved. */
export function beginAddAccount(): void {
  if (typeof window === 'undefined') return
  rememberCurrentAccount()
  clearCurrentSession()
}

export function clearCurrentSession(): void {
  if (typeof window === 'undefined') return
  for (const key of SESSION_KEYS) localStorage.removeItem(key)
}

export function forgetAccount(id: string): string | null {
  if (typeof window === 'undefined') return null
  const remaining = readList().filter((account) => account.id !== id)
  writeList(remaining)
  if (currentAccountId() !== id) return currentAccountId()
  for (const key of SESSION_KEYS) localStorage.removeItem(key)
  const next = remaining[0]
  if (!next) return null
  applySnapshot(next.session)
  return next.id
}
