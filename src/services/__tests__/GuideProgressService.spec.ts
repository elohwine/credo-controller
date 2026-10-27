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
    add.run('staff', 'wallet-1', 'org_employee', 'openid-credential-offer://s', '2026-01-01T12:00:00')
    add.run('receipt', 'wallet-1', 'payment', 'openid-credential-offer://b', '2026-01-02')
    add.run('task', 'wallet-1', 'workflow_stage_action', 'task://c', '2026-01-03')
    add.run('bill', 'wallet-1', 'invoice_offer', 'openid-credential-offer://d', '2026-01-04')
    add.run('proof', 'wallet-1', 'proof_request', 'openid4vp://e', '2026-01-05')
    add.run('assignment', 'wallet-1', 'workflow_vc_offer', 'openid-credential-offer://job', '2026-01-06')
    DatabaseManager.setDatabase(db)
    service = new HolderSettingsService()
  })

  it('is off until the person turns it on', () => {
    expect(service.get('wallet-1')).toEqual({ autoSaveCards: false })
    expect(service.autoSaveCandidates('wallet-1')).toEqual([])
    service.set('wallet-1', { autoSaveCards: true })
    expect(service.get('wallet-1')).toEqual({ autoSaveCards: true })
    service.set('wallet-1', { autoSaveCards: false })
    expect(service.autoSaveCandidates('wallet-1')).toEqual([])
  })

  it('when on, picks receipts and staff cards and skips the identity card, tasks, bills, proof requests and workflow records', () => {
    service.set('wallet-1', { autoSaveCards: true })
    expect(service.autoSaveCandidates('wallet-1').map((c) => c.id)).toEqual(['receipt', 'staff'])
    expect(service.autoSaveCandidates('wallet-1')).toEqual([])
  })

  it('does not retry a card that failed to save automatically', () => {
    service.set('wallet-1', { autoSaveCards: true })
    service.markAutoSaveFailed('receipt', 'offer expired')
    expect(service.autoSaveCandidates('wallet-1').map((c) => c.id)).toEqual(['staff'])
  })

  it('reclaims a card whose automatic save was interrupted', () => {
    service.set('wallet-1', { autoSaveCards: true })
    service.autoSaveCandidates('wallet-1')
    db.prepare(`UPDATE wallet_pending_offers SET last_attempt_at = '2020-01-01T00:00:00.000Z' WHERE id = 'receipt'`).run()
    expect(service.autoSaveCandidates('wallet-1').map((c) => c.id)).toEqual(['receipt'])
  })

  it('tries a card again after a network failure released its claim', () => {
    service.set('wallet-1', { autoSaveCards: true })
    expect(service.autoSaveCandidates('wallet-1').map((c) => c.id)).toEqual(['receipt', 'staff'])
    service.releaseAutoSaveClaim('receipt')
    service.releaseAutoSaveClaim('staff')
    expect(service.autoSaveCandidates('wallet-1').map((c) => c.id)).toEqual(['receipt', 'staff'])
  })

  it('does not stamp a card that was already accepted', () => {
    db.prepare(`UPDATE wallet_pending_offers SET accepted_at = '2026-01-03' WHERE id = 'receipt'`).run()
    service.markAutoSaveFailed('receipt', 'late failure')
    const row = db.prepare('SELECT last_error AS lastError FROM wallet_pending_offers WHERE id = ?').get('receipt') as {
      lastError: string | null
    }
    expect(row.lastError).toBeNull()
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
      staffCardWaiting: null,
      setupToFinish: null,
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
      staffCardWaiting: null,
      setupToFinish: null,
    })
  })

  describe('next step for the person', () => {
    beforeEach(() => {
      db.exec(`DROP TABLE wallet_pending_offers; DROP TABLE org_memberships;
        CREATE TABLE wallet_pending_offers (id TEXT, tenant_id TEXT, source_type TEXT, resolved_at TEXT, accepted_at TEXT, issuer_tenant_id TEXT, created_at TEXT);
        CREATE TABLE org_memberships (user_id TEXT, org_tenant_id TEXT, status TEXT, role TEXT, created_at TEXT);
        CREATE TABLE org_setup_profiles (org_tenant_id TEXT, answered_at TEXT);
        CREATE TABLE organizations (tenant_id TEXT, name TEXT);
        INSERT INTO ssi_users VALUES ('u1', 'wallet-1');
        INSERT INTO organizations VALUES ('org-1', 'Harare Field Co');`)
    })

    it('names the organisation whose staff card is waiting', () => {
      db.exec(`INSERT INTO wallet_pending_offers VALUES ('card-1', 'wallet-1', 'org_employee', NULL, NULL, 'org-1', '2026-01-01');
        INSERT INTO org_memberships VALUES ('u1', 'org-1', 'active', 'field_worker', '2026-01-01');`)
      expect(service.status('wallet-1').staffCardWaiting).toEqual({ offerId: 'card-1', orgTenantId: 'org-1', orgName: 'Harare Field Co' })
      expect(service.status('wallet-1').setupToFinish).toBeNull()
    })

    it('ignores a staff card from an organisation the person has left', () => {
      db.exec(`INSERT INTO wallet_pending_offers VALUES ('card-1', 'wallet-1', 'org_employee', NULL, NULL, 'org-1', '2026-01-01');
        INSERT INTO org_memberships VALUES ('u1', 'org-1', 'suspended', 'field_worker', '2026-01-01');`)
      expect(service.status('wallet-1').staffCardWaiting).toBeNull()
    })

    it('asks an owner to finish setup until the setup questions are answered', () => {
      db.exec(`INSERT INTO org_memberships VALUES ('u1', 'org-1', 'active', 'owner', '2026-01-01');
        INSERT INTO org_setup_profiles VALUES ('org-1', NULL);`)
      expect(service.status('wallet-1').setupToFinish).toEqual({ orgTenantId: 'org-1', orgName: 'Harare Field Co' })
      db.exec(`UPDATE org_setup_profiles SET answered_at = '2026-01-02'`)
      expect(service.status('wallet-1').setupToFinish).toBeNull()
    })
  })

  it('does not treat a dismissed or missing identity card as accepted', () => {
    db.prepare("INSERT INTO wallet_pending_offers VALUES ('o1', 'wallet-1', 'platform_identity', '2026-01-02', NULL)").run()
    expect(service.status('wallet-1').identityCard).toBe(false)
    expect(service.status('wallet-2').identityCard).toBe(false)
  })

  it('ignores removed phones and suspended memberships', () => {
    db.exec(`INSERT INTO device_keys VALUES ('k1', 'wallet-1', '2026-01-02');
      INSERT INTO ssi_users VALUES ('u1', 'wallet-1');
      INSERT INTO org_memberships VALUES ('u1', 'org-1', 'suspended');`)
    expect(service.status('wallet-1')).toMatchObject({ deviceSignIn: false, organisation: false })
  })
})
