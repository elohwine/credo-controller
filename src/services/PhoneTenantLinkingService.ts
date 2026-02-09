/**
 * PhoneTenantLinkingService
 * 
 * Enables Fastlane MVP phone-first wallet onboarding:
 * 
 * Flow:
 * 1. User browses shop → anonymous tenant created (ensurePortalTenant)
 * 2. At checkout, phone number entered → linked to anonymous tenant
 * 3. VCs (Invoice, Receipt) issued to this tenant
 * 4. Later, user clicks "View My Receipts" → prompted to register with phone
 * 5. On registration with same phone, OTP verification links existing tenant
 * 6. User sees all previously saved VCs without re-issuing
 * 
 * This abstracts SSI complexity: users never see DIDs, keys, or "wallet" terminology
 * until they want to view their purchase history.
 */

import { DatabaseManager } from '../persistence/DatabaseManager'
import { randomUUID } from 'crypto'

export interface BrowserSessionTenant {
  sessionId: string
  tenantId: string
  phone?: string
  claimed: boolean
  claimedByUserId?: string
  createdAt: string
  updatedAt: string
}

/**
 * Link a browser session to its anonymous tenant
 */
export function linkBrowserSessionToTenant(sessionId: string, tenantId: string): BrowserSessionTenant {
  const db = DatabaseManager.getDatabase()
  const now = new Date().toISOString()

  const existing = db.prepare('SELECT * FROM browser_session_tenants WHERE session_id = ?').get(sessionId)
  if (existing) {
    return mapRow(existing)
  }

  db.prepare(`
    INSERT INTO browser_session_tenants (session_id, tenant_id, created_at, updated_at)
    VALUES (?, ?, ?, ?)
  `).run(sessionId, tenantId, now, now)

  return {
    sessionId,
    tenantId,
    claimed: false,
    createdAt: now,
    updatedAt: now
  }
}

/**
 * Link phone number to tenant at checkout
 * This is the key moment: we capture the phone when user enters it for payment
 */
export function linkPhoneToTenant(tenantId: string, phone: string): void {
  const db = DatabaseManager.getDatabase()
  const now = new Date().toISOString()
  const normalizedPhone = normalizePhone(phone)

  // Update tenants table
  db.prepare(`
    UPDATE tenants SET phone = ?, updated_at = ? WHERE id = ?
  `).run(normalizedPhone, now, tenantId)

  // Update browser_session_tenants table
  db.prepare(`
    UPDATE browser_session_tenants SET phone = ?, updated_at = ? WHERE tenant_id = ?
  `).run(normalizedPhone, now, tenantId)
}

/**
 * Find existing tenant by phone number
 * Used during registration to check if user already has a tenant with VCs
 */
export function findTenantByPhone(phone: string): { tenantId: string; claimed: boolean } | null {
  const db = DatabaseManager.getDatabase()
  const normalizedPhone = normalizePhone(phone)

  // First check browser_session_tenants (most recent association)
  const sessionTenant = db.prepare(`
    SELECT tenant_id, claimed FROM browser_session_tenants 
    WHERE phone = ? AND claimed = 0
    ORDER BY updated_at DESC LIMIT 1
  `).get(normalizedPhone) as { tenant_id: string; claimed: number } | undefined

  if (sessionTenant) {
    return {
      tenantId: sessionTenant.tenant_id,
      claimed: sessionTenant.claimed === 1
    }
  }

  // Fallback: check tenants table directly
  const tenant = db.prepare(`
    SELECT id FROM tenants WHERE phone = ? LIMIT 1
  `).get(normalizedPhone) as { id: string } | undefined

  if (tenant) {
    return {
      tenantId: tenant.id,
      claimed: false // We don't know, assume not claimed
    }
  }

  return null
}

/**
 * Claim an existing tenant during registration
 * Transfers the anonymous tenant to the newly registered user
 */
export function claimTenantForUser(tenantId: string, userId: string, phone: string): void {
  const db = DatabaseManager.getDatabase()
  const now = new Date().toISOString()
  const normalizedPhone = normalizePhone(phone)

  // Mark browser session as claimed
  db.prepare(`
    UPDATE browser_session_tenants 
    SET claimed = 1, claimed_by_user_id = ?, updated_at = ?
    WHERE tenant_id = ?
  `).run(userId, now, tenantId)

  // Update wallet_users to use existing tenant
  db.prepare(`
    UPDATE wallet_users SET wallet_id = ?, phone = ?, updated_at = ? WHERE id = ?
  `).run(tenantId, normalizedPhone, now, userId)
}

/**
 * Get credentials count for a tenant (to show "You have X saved receipts")
 */
export function getTenantCredentialCount(tenantId: string): number {
  const db = DatabaseManager.getDatabase()
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM wallet_credentials WHERE wallet_id = ?
  `).get(tenantId) as { count: number }
  return result?.count || 0
}

/**
 * Normalize phone number to E.164-ish format (remove spaces, ensure starts with country code)
 */
function normalizePhone(phone: string): string {
  // Remove all non-digits
  let clean = phone.replace(/\D/g, '')
  
  // Zimbabwe: Convert 07xx to 2637xx
  if (clean.startsWith('0') && clean.length === 10) {
    clean = '263' + clean.slice(1)
  }
  
  // Ensure it has country code (assume Zimbabwe if 9 digits)
  if (clean.length === 9 && !clean.startsWith('263')) {
    clean = '263' + clean
  }
  
  return clean
}

function mapRow(row: any): BrowserSessionTenant {
  return {
    sessionId: row.session_id,
    tenantId: row.tenant_id,
    phone: row.phone,
    claimed: row.claimed === 1,
    claimedByUserId: row.claimed_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}
