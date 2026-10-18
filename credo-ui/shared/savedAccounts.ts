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
  'credoOrganizations',
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
    return parsed.filter(
      (entry) => entry && typeof entry.id === 'string' && entry.session && typeof entry.session === 'object',
    )
  } catch {
    return []
  }
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
    session: {},
  }))
}

export function savedAccountLabel(name?: string, phone?: string, fallback = 'Account'): string {
  const displayName = name?.trim()
  const raw = phone?.trim()
  // Stored numbers are not all written the same way; show them in one international form so
  // two accounts are told apart by country code rather than by formatting.
  const number = raw && /^\d{9,15}$/.test(raw) ? `+${raw}` : raw
  if (displayName && number) return `${displayName} (${number})`
  return displayName || (number ? `Account (${number})` : fallback)
}

/** Read display names from each saved holder's identity, never from the active organisation. */
export async function loadSavedAccountNames(backend: string): Promise<void> {
  const results = await Promise.allSettled(
    readList()
      .filter((account) => !account.session.credoUserName && !account.session.holderUsername)
      .map(async (account) => {
        const token = account.session.walletToken || account.session.authToken || account.session['auth.token']
        if (!token) return null
        const sessionResponse = await fetch(`${backend}/api/ssi/auth/session`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ expiresInSeconds: 900 }),
        })
        if (!sessionResponse.ok)
          throw new Error(`Could not read a saved account's identity (${sessionResponse.status}).`)
        const session: { token?: string } = await sessionResponse.json()
        if (!session.token) throw new Error('The saved account session did not return a wallet token.')
        const response = await fetch(
          `${backend}/api/wallet/${encodeURIComponent(account.id)}/credentials/list?limit=5&type=PlatformIdentityCredential`,
          {
            headers: { Authorization: `Bearer ${session.token}` },
          },
        )
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
        const identity = data.items?.find((item) => !item.withdrawn && subjectOf(item).displayName)
        const subject = identity ? subjectOf(identity) : {}
        const name = subject.displayName?.trim()
        if (!name) return null
        return { id: account.id, name, phone: subject.phone }
      }),
  )
  const accounts = readList()
  for (const result of results) {
    if (result.status !== 'fulfilled') continue
    const update = result.value
    if (!update) continue
    const account = accounts.find((entry) => entry.id === update.id)
    if (!account) continue
    account.session.credoUserName = update.name
    if (!account.session.credoUserPhone && update.phone) account.session.credoUserPhone = update.phone
    if (currentAccountId() === update.id) {
      localStorage.setItem('credoUserName', update.name)
      if (!localStorage.getItem('credoUserPhone') && update.phone) localStorage.setItem('credoUserPhone', update.phone)
    }
  }
  writeList(accounts)
  const failed = results.find((result) => result.status === 'rejected')
  if (failed?.status === 'rejected') throw failed.reason
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
  const accounts = readList().filter((account) => account.id !== id)
  accounts.unshift({ id, label: nextLabel, savedAt: new Date().toISOString(), session })
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
