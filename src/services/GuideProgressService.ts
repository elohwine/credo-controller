import { DatabaseManager } from '../persistence/DatabaseManager'

/** Guides the apps know about. Unknown keys are refused so the table cannot grow without bound. */
export const GUIDE_KEYS = [
  'welcome',
  'getting_started',
  'tip_inbox',
  'tip_records',
  'tip_network',
  'tip_scan',
  'tip_operations',
  'tip_org_settings',
  // Set when the person has opened Records and seen at least one saved card there.
  'records_seen',
  // Phone-only prompt. Closing the shared checklist must not hide this step.
  'device_signin',
  // The person chose to keep cards only, with no organisation.
  'next_use',
] as const

export type GuideKey = (typeof GUIDE_KEYS)[number]
export type GuideStatus = 'done' | 'dismissed'

export interface GuideState {
  status: GuideStatus
  updatedAt: string
}

export interface GuideProgress {
  guides: { [key: string]: GuideState }
}

export function isGuideKey(value: unknown): value is GuideKey {
  return typeof value === 'string' && (GUIDE_KEYS as readonly string[]).includes(value)
}

export class GuideProgressService {
  public get(ownerTenantId: string): GuideProgress {
    const rows = DatabaseManager.getDatabase()
      .prepare('SELECT guide_key, status, updated_at FROM wallet_guide_progress WHERE owner_tenant_id = ?')
      .all(ownerTenantId) as Array<{ guide_key: string; status: GuideStatus; updated_at: string }>
    const guides: GuideProgress['guides'] = {}
    for (const row of rows) {
      if (isGuideKey(row.guide_key)) guides[row.guide_key] = { status: row.status, updatedAt: row.updated_at }
    }
    return { guides }
  }

  /** Marks a guide finished or dismissed; `reset` shows it again. */
  public set(ownerTenantId: string, key: unknown, status: unknown, now = new Date()): GuideProgress {
    if (!isGuideKey(key)) throw new Error('Unknown guide')
    const db = DatabaseManager.getDatabase()
    if (status === 'reset') {
      db.prepare('DELETE FROM wallet_guide_progress WHERE owner_tenant_id = ? AND guide_key = ?').run(ownerTenantId, key)
    } else if (status === 'done' || status === 'dismissed') {
      db.prepare(
        `INSERT INTO wallet_guide_progress (owner_tenant_id, guide_key, status, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(owner_tenant_id, guide_key) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`,
      ).run(ownerTenantId, key, status, now.toISOString())
    } else {
      throw new Error('status must be done, dismissed or reset')
    }
    return this.get(ownerTenantId)
  }
}

export const guideProgressService = new GuideProgressService()

/**
 * Card offers that may be saved without a tap after the person turns that on.
 * The identity card is not in this list: it always waits for a tap.
 */
export const AUTO_SAVE_SOURCE_TYPES = [
  'org_employee',
  'org_workflow_actor',
  'connected_system_record',
  'credential_offer',
  'manual_direct_offer',
  'payment',
] as const

export interface HolderSettings {
  autoSaveCards: boolean
}

export class HolderSettingsService {
  public get(ownerTenantId: string): HolderSettings {
    const row = DatabaseManager.getDatabase()
      .prepare('SELECT auto_save_cards FROM wallet_holder_settings WHERE owner_tenant_id = ?')
      .get(ownerTenantId) as { auto_save_cards?: number } | undefined
    return { autoSaveCards: row ? row.auto_save_cards === 1 : false }
  }

  public set(ownerTenantId: string, update: Partial<HolderSettings>, now = new Date()): HolderSettings {
    if (typeof update?.autoSaveCards !== 'boolean') throw new Error('autoSaveCards must be true or false')
    DatabaseManager.getDatabase()
      .prepare(
        `INSERT INTO wallet_holder_settings (owner_tenant_id, auto_save_cards, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(owner_tenant_id) DO UPDATE SET auto_save_cards = excluded.auto_save_cards, updated_at = excluded.updated_at`,
      )
      .run(ownerTenantId, update.autoSaveCards ? 1 : 0, now.toISOString())
    return this.get(ownerTenantId)
  }

  /**
   * Waiting card offers to save for this person now: newest first.
   * Claims each row before returning it, so a second inbox read cannot redeem the same offer.
   * A claim older than two minutes can be taken again after a crash. Workflow records are not cards.
   */
  public autoSaveCandidates(ownerTenantId: string, limit = 3): Array<{ id: string; offerUri: string }> {
    if (!this.get(ownerTenantId).autoSaveCards) return []
    const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString()
    const db = DatabaseManager.getDatabase()
    const claim = db.transaction(() => {
      const rows = db
        .prepare(
          `SELECT id, offer_uri AS offerUri, source_type AS sourceType FROM wallet_pending_offers
           WHERE tenant_id = ? AND resolved_at IS NULL AND accepted_at IS NULL
             AND COALESCE(offer_uri, '') <> ''
             AND COALESCE(last_error, '') NOT LIKE 'auto_save_failed%'
             AND (
               COALESCE(last_error, '') NOT LIKE 'auto_save_claim%'
               OR COALESCE(last_attempt_at, '') < ?
             )
             AND source_type IN (${AUTO_SAVE_SOURCE_TYPES.map(() => '?').join(', ')})
           ORDER BY created_at DESC LIMIT ?`,
        )
        .all(ownerTenantId, cutoff, ...AUTO_SAVE_SOURCE_TYPES, limit) as Array<{
        id: string
        offerUri: string
        sourceType: string
      }>
      const claimed: Array<{ id: string; offerUri: string; sourceType: string }> = []
      const take = db.prepare(
        `UPDATE wallet_pending_offers
         SET last_error = 'auto_save_claim', last_attempt_at = ?
         WHERE id = ? AND tenant_id = ? AND resolved_at IS NULL AND accepted_at IS NULL
           AND COALESCE(last_error, '') NOT LIKE 'auto_save_failed%'
           AND (COALESCE(last_error, '') NOT LIKE 'auto_save_claim%' OR COALESCE(last_attempt_at, '') < ?)`,
      )
      const now = new Date().toISOString()
      for (const row of rows) {
        if (take.run(now, row.id, ownerTenantId, cutoff).changes === 1) claimed.push(row)
      }
      return claimed
    })
    const rows = claim()
    return rows.map(({ id, offerUri }) => ({ id, offerUri }))
  }

  public releaseAutoSaveClaim(offerId: string): void {
    DatabaseManager.getDatabase()
      .prepare(
        `UPDATE wallet_pending_offers SET last_error = NULL
         WHERE id = ? AND accepted_at IS NULL AND COALESCE(last_error, '') LIKE 'auto_save_claim%'`,
      )
      .run(offerId)
  }

  public markAutoSaveFailed(offerId: string, reason: string): void {
    DatabaseManager.getDatabase()
      .prepare(
        'UPDATE wallet_pending_offers SET last_error = ?, last_attempt_at = ? WHERE id = ? AND accepted_at IS NULL',
      )
      .run(`auto_save_failed: ${reason}`.slice(0, 300), new Date().toISOString(), offerId)
  }
}

export const holderSettingsService = new HolderSettingsService()

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
  /** An organisation this person owns or runs whose setup questions are not answered yet. */
  setupToFinish?: GettingStartedOrg | null
}

/** Real account state behind the getting-started checklist, so the app and portal agree. */
export class GettingStartedService {
  public status(ownerTenantId: string): GettingStartedStatus {
    const db = DatabaseManager.getDatabase()
    const exists = (sql: string, ...params: unknown[]): boolean => {
      try {
        return Boolean(db.prepare(sql).get(...params))
      } catch {
        return false
      }
    }
    // Held only after this account accepted the identity card. A dismissed offer, or no offer yet, is still to do.
    const identityAccepted = exists(
      `SELECT 1 FROM wallet_pending_offers
       WHERE tenant_id = ? AND source_type = 'platform_identity' AND accepted_at IS NOT NULL LIMIT 1`,
      ownerTenantId,
    )
    return {
      identityCard: identityAccepted,
      deviceSignIn: exists(
        'SELECT 1 FROM device_keys WHERE wallet_tenant_id = ? AND revoked_at IS NULL LIMIT 1',
        ownerTenantId,
      ),
      organisation: exists(
        `SELECT 1 FROM org_memberships om JOIN ssi_users u ON u.id = om.user_id
         WHERE u.tenant_id = ? AND om.status = 'active' LIMIT 1`,
        ownerTenantId,
      ),
      cardSaving: exists('SELECT 1 FROM wallet_holder_settings WHERE owner_tenant_id = ? LIMIT 1', ownerTenantId),
      staffCardWaiting: this.staffCardWaiting(ownerTenantId),
      setupToFinish: this.setupToFinish(ownerTenantId),
    }
  }

  private orgName(orgTenantId: string): string {
    const db = DatabaseManager.getDatabase()
    for (const sql of [
      'SELECT name FROM organizations WHERE tenant_id = ? LIMIT 1',
      'SELECT label AS name FROM tenants WHERE id = ? LIMIT 1',
    ]) {
      try {
        const name = String((db.prepare(sql).get(orgTenantId) as { name?: string } | undefined)?.name || '').trim()
        if (name) return name
      } catch {
        continue
      }
    }
    return 'your organisation'
  }

  private staffCardWaiting(ownerTenantId: string): (GettingStartedOrg & { offerId: string }) | null {
    try {
      const row = DatabaseManager.getDatabase()
        .prepare(
          `SELECT o.id, o.issuer_tenant_id FROM wallet_pending_offers o
           WHERE o.tenant_id = ? AND o.source_type = 'org_employee' AND o.resolved_at IS NULL AND o.accepted_at IS NULL
             AND o.issuer_tenant_id IS NOT NULL
             AND EXISTS (
               SELECT 1 FROM org_memberships m JOIN ssi_users u ON u.id = m.user_id
               WHERE u.tenant_id = o.tenant_id AND m.org_tenant_id = o.issuer_tenant_id AND m.status = 'active'
             )
           ORDER BY o.created_at DESC LIMIT 1`,
        )
        .get(ownerTenantId) as { id: string; issuer_tenant_id: string } | undefined
      if (!row) return null
      return { offerId: row.id, orgTenantId: row.issuer_tenant_id, orgName: this.orgName(row.issuer_tenant_id) }
    } catch {
      return null
    }
  }

  private setupToFinish(ownerTenantId: string): GettingStartedOrg | null {
    try {
      const row = DatabaseManager.getDatabase()
        .prepare(
          `SELECT om.org_tenant_id FROM org_memberships om
           JOIN ssi_users u ON u.id = om.user_id
           LEFT JOIN org_setup_profiles p ON p.org_tenant_id = om.org_tenant_id
           WHERE u.tenant_id = ? AND om.status = 'active' AND om.role IN ('owner', 'admin')
             AND (p.answered_at IS NULL OR p.answered_at = '')
           ORDER BY om.created_at DESC LIMIT 1`,
        )
        .get(ownerTenantId) as { org_tenant_id: string } | undefined
      if (!row) return null
      return { orgTenantId: row.org_tenant_id, orgName: this.orgName(row.org_tenant_id) }
    } catch {
      return null
    }
  }
}

export const gettingStartedService = new GettingStartedService()
