import { clearCurrentSession, currentAccountId, rememberCurrentAccount } from './savedAccounts'
import { clearStoredOrganizationContext } from '../utils/organizationContext'

export interface PersonalLoginResult {
  token: string
  tenantId: string
  claims?: { displayName?: string; phone?: string; email?: string }
}

export function applyPersonalLogin(result: PersonalLoginResult, identifier?: string): void {
  if (!result.token || !result.tenantId) throw new Error('Sign-in did not return a personal session')
  const previousId = currentAccountId()
  const sameAccountName = previousId === result.tenantId ? localStorage.getItem('credoUserName') : null
  rememberCurrentAccount()
  clearCurrentSession()
  clearStoredOrganizationContext()
  for (const key of ['walletToken', 'credoTenantToken', 'tenantToken']) localStorage.setItem(key, result.token)
  for (const key of ['credoTenantId', 'tenantId']) localStorage.setItem(key, result.tenantId)
  localStorage.setItem('credoContextMode', 'personal')
  const name = result.claims?.displayName?.trim() || sameAccountName
  const phone = result.claims?.phone?.trim() || (identifier && !identifier.includes('@') ? identifier.trim() : '')
  const email = result.claims?.email?.trim() || (identifier?.includes('@') ? identifier.trim() : '')
  if (name) localStorage.setItem('credoUserName', name)
  if (phone) {
    localStorage.setItem('credoUserPhone', phone)
    localStorage.setItem('walletPhone', phone)
  }
  if (email) localStorage.setItem('walletEmail', email)
  rememberCurrentAccount(name || identifier)
  window.dispatchEvent(new Event('credo:workflow-context-updated'))
}
