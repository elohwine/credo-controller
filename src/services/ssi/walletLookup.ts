import { DatabaseManager } from '../../persistence/DatabaseManager'

import { contactHashCandidates } from './contactHash'

/** Registered wallet for a phone number or email. Contact details are stored only as keyed hashes. */
export function findWalletTenantByContact(phone?: string, email?: string): string | undefined {
  const db = DatabaseManager.getDatabase()
  const candidates = contactHashCandidates(phone, email)
  if (candidates.length === 0) return undefined
  const placeholders = candidates.map(() => '?').join(', ')
  const row = db
    .prepare(
      `SELECT tenant_id as walletTenantId FROM ssi_users
        WHERE phone_hash IN (${placeholders}) OR email_hash IN (${placeholders})
        LIMIT 1`,
    )
    .get(...candidates, ...candidates) as { walletTenantId?: string } | undefined
  return row?.walletTenantId
}
