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

/** Card offers that may be saved without a tap when the person turns that on. */
export const AUTO_SAVE_SOURCE_TYPES = [
  'platform_identity',
  'org_employee',
  'org_workflow_actor',
  'workflow_vc_offer',
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
    return { autoSaveCards: row?.auto_save_cards === 1 }
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

  /** Waiting card offers to save for this person now: newest first, skipping ones that already failed. */
  public autoSaveCandidates(ownerTenantId: string, limit = 3): Array<{ id: string; offerUri: string }> {
    if (!this.get(ownerTenantId).autoSaveCards) return []
    return DatabaseManager.getDatabase()
      .prepare(
        `SELECT id, offer_uri AS offerUri FROM wallet_pending_offers
         WHERE tenant_id = ? AND resolved_at IS NULL AND accepted_at IS NULL
           AND COALESCE(offer_uri, '') <> ''
           AND COALESCE(last_error, '') NOT LIKE 'auto_save_failed%'
           AND source_type IN (${AUTO_SAVE_SOURCE_TYPES.map(() => '?').join(', ')})
         ORDER BY created_at DESC LIMIT ?`,
      )
      .all(ownerTenantId, ...AUTO_SAVE_SOURCE_TYPES, limit) as Array<{ id: string; offerUri: string }>
  }

  public markAutoSaveFailed(offerId: string, reason: string): void {
    DatabaseManager.getDatabase()
      .prepare('UPDATE wallet_pending_offers SET last_error = ?, last_attempt_at = ? WHERE id = ?')
      .run(`auto_save_failed: ${reason}`.slice(0, 300), new Date().toISOString(), offerId)
  }
}

export const holderSettingsService = new HolderSettingsService()

export interface GettingStartedStatus {
  identityCard: boolean
  deviceSignIn: boolean
  organisation: boolean
  cardSaving: boolean
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
    // Accounts made before cards needed a tap have no waiting identity offer, so "nothing waiting" counts as held.
    const identityWaiting = exists(
      `SELECT 1 FROM wallet_pending_offers
       WHERE tenant_id = ? AND source_type = 'platform_identity' AND resolved_at IS NULL AND accepted_at IS NULL LIMIT 1`,
      ownerTenantId,
    )
    return {
      identityCard: !identityWaiting,
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
    }
  }
}

export const gettingStartedService = new GettingStartedService()
