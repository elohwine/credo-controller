import { createHash } from 'crypto'

import { DatabaseManager } from '../../persistence/DatabaseManager'

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/** Zimbabwe local numbers (`07…`) become international (`2637…`); other input keeps its digits. */
export function normalizeWalletPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('0') && digits.length === 10) return `263${digits.slice(1)}`
  return digits
}

/** Registered wallet for a phone number or email. Contact details are stored only as hashes. */
export function findWalletTenantByContact(phone?: string, email?: string): string | undefined {
  const db = DatabaseManager.getDatabase()
  if (phone) {
    const normalized = normalizeWalletPhone(phone)
    const hashes = [sha256(normalized), sha256(normalized.toLowerCase()), sha256(phone.trim().toLowerCase())]
    for (const hash of hashes) {
      const row = db
        .prepare('SELECT tenant_id as walletTenantId FROM ssi_users WHERE phone_hash = ? LIMIT 1')
        .get(hash) as { walletTenantId?: string } | undefined
      if (row?.walletTenantId) return row.walletTenantId
    }
  }
  if (email) {
    const row = db
      .prepare('SELECT tenant_id as walletTenantId FROM ssi_users WHERE email_hash = ? LIMIT 1')
      .get(sha256(email.trim().toLowerCase())) as { walletTenantId?: string } | undefined
    if (row?.walletTenantId) return row.walletTenantId
  }
  return undefined
}
