import Database from 'better-sqlite3'
import { readFileSync } from 'fs'

import { DatabaseManager } from '../../persistence/DatabaseManager'
import { GettingStartedService, GuideProgressService, HolderSettingsService } from '../GuideProgressService'

describe('GuideProgressService', () => {
  let service: GuideProgressService

  beforeEach(() => {
    const db = new Database(':memory:')
    db.exec(readFileSync('migrations/140_wallet_guides_and_holder_settings.sql', 'utf8'))
    DatabaseManager.setDatabase(db)
    service = new GuideProgressService()
  })

  it('remembers finished guides per account', () => {
    service.set('wallet-1', 'welcome', 'done', new Date('2026-01-01T00:00:00Z'))
    service.set('wallet-1', 'tip_inbox', 'dismissed')
    expect(service.get('wallet-1').guides.welcome).toEqual({ status: 'done', updatedAt: '2026-01-01T00:00:00.000Z' })
    expect(service.get('wallet-1').guides.tip_inbox?.status).toBe('dismissed')
    expect(service.get('wallet-2').guides).toEqual({})
  })

  it('shows a guide again after reset', () => {
    service.set('wallet-1', 'getting_started', 'dismissed')
    service.set('wallet-1', 'getting_started', 'reset')
    expect(service.get('wallet-1').guides.getting_started).toBeUndefined()
  })

  it('refuses unknown guides and statuses', () => {
    expect(() => service.set('wallet-1', 'anything', 'done')).toThrow('Unknown guide')
    expect(() => service.set('wallet-1', 'welcome', 'maybe')).toThrow('status must be')
  })
})

describe('HolderSettingsService', () => {
  let db: Database.Database
  let service: HolderSettingsService

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(readFileSync('migrations/140_wallet_guides_and_holder_settings.sql', 'utf8'))
    db.exec(`CREATE TABLE wallet_pending_offers (
      id TEXT PRIMARY KEY, tenant_id TEXT, source_type TEXT, offer_uri TEXT, created_at TEXT,
      accepted_at TEXT, resolved_at TEXT, last_error TEXT, last_attempt_at TEXT
    )`)
    const add = db.prepare('INSERT INTO wallet_pending_offers (id, tenant_id, source_type, offer_uri, created_at) VALUES (?, ?, ?, ?, ?)')
    add.run('identity', 'wallet-1', 'platform_identity', 'openid-credential-offer://a', '2026-01-01')
    add.run('receipt', 'wallet-1', 'payment', 'openid-credential-offer://b', '2026-01-02')
    add.run('task', 'wallet-1', 'workflow_stage_action', 'task://c', '2026-01-03')
    add.run('bill', 'wallet-1', 'invoice_offer', 'openid-credential-offer://d', '2026-01-04')
    add.run('proof', 'wallet-1', 'proof_request', 'openid4vp://e', '2026-01-05')
    DatabaseManager.setDatabase(db)
    service = new HolderSettingsService()
  })

  it('is off by default, so nothing is saved without a tap', () => {
    expect(service.get('wallet-1')).toEqual({ autoSaveCards: false })
    expect(service.autoSaveCandidates('wallet-1')).toEqual([])
  })

  it('when on, picks only card offers and skips tasks, bills and proof requests', () => {
    service.set('wallet-1', { autoSaveCards: true })
    expect(service.autoSaveCandidates('wallet-1').map((c) => c.id)).toEqual(['receipt', 'identity'])
  })

  it('does not retry a card that failed to save automatically', () => {
    service.set('wallet-1', { autoSaveCards: true })
    service.markAutoSaveFailed('receipt', 'offer expired')
    expect(service.autoSaveCandidates('wallet-1').map((c) => c.id)).toEqual(['identity'])
  })

  it('refuses a setting that is not true or false', () => {
    expect(() => service.set('wallet-1', { autoSaveCards: 'yes' as any })).toThrow('autoSaveCards')
  })
})

describe('GettingStartedService', () => {
  let db: Database.Database
  const service = new GettingStartedService()

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(readFileSync('migrations/140_wallet_guides_and_holder_settings.sql', 'utf8'))
    db.exec(`CREATE TABLE wallet_pending_offers (id TEXT, tenant_id TEXT, source_type TEXT, resolved_at TEXT, accepted_at TEXT);
      CREATE TABLE device_keys (id TEXT, wallet_tenant_id TEXT, revoked_at TEXT);
      CREATE TABLE ssi_users (id TEXT, tenant_id TEXT);
      CREATE TABLE org_memberships (user_id TEXT, org_tenant_id TEXT, status TEXT);`)
    DatabaseManager.setDatabase(db)
  })

  it('reports a new account with its identity card still waiting', () => {
    db.prepare("INSERT INTO wallet_pending_offers VALUES ('o1', 'wallet-1', 'platform_identity', NULL, NULL)").run()
    expect(service.status('wallet-1')).toEqual({
      identityCard: false,
      deviceSignIn: false,
      organisation: false,
      cardSaving: false,
    })
  })

  it('reports each finished step from real account state', () => {
    db.exec(`INSERT INTO wallet_pending_offers VALUES ('o1', 'wallet-1', 'platform_identity', '2026-01-01', '2026-01-01');
      INSERT INTO device_keys VALUES ('k1', 'wallet-1', NULL);
      INSERT INTO ssi_users VALUES ('u1', 'wallet-1');
      INSERT INTO org_memberships VALUES ('u1', 'org-1', 'active');`)
    new HolderSettingsService().set('wallet-1', { autoSaveCards: false })
    expect(service.status('wallet-1')).toEqual({
      identityCard: true,
      deviceSignIn: true,
      organisation: true,
      cardSaving: true,
    })
  })

  it('ignores removed phones and suspended memberships', () => {
    db.exec(`INSERT INTO device_keys VALUES ('k1', 'wallet-1', '2026-01-02');
      INSERT INTO ssi_users VALUES ('u1', 'wallet-1');
      INSERT INTO org_memberships VALUES ('u1', 'org-1', 'suspended');`)
    expect(service.status('wallet-1')).toMatchObject({ deviceSignIn: false, organisation: false })
  })
})
