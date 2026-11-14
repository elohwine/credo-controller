import Database from 'better-sqlite3'
import { jest } from '@jest/globals'

import { PartnerDiscoveryController, toPartnerMatch } from '../../controllers/partner/PartnerDiscoveryController'
import { WhatsAppPayloadController, cartMoveRefused } from '../../controllers/whatsapp/WhatsAppPayloadController'
import { inventoryService } from '../InventoryService'
import { DatabaseManager } from '../../persistence/DatabaseManager'
import { organizationRegistryRepository, type OrganizationRegistry } from '../../persistence/OrganizationRegistryRepository'
import { workflowRequestRepository, type WorkflowRequest } from '../../persistence/WorkflowRequestRepository'
import { jobDepositLinks, jobDepositService } from '../JobDepositService'
import { marketingService } from '../MarketingService'
import { orgOfferingsService, type ProviderMatch } from '../OrgOfferingsService'
import { normaliseOperations } from '../partner/PartnerClientService'
import { PartnerVerificationService } from '../partner/PartnerVerificationService'
import { contactHash } from '../ssi/contactHash'
import { normalizeNotificationPhone } from '../WhatsAppSenderService'

function org(): OrganizationRegistry {
  return {
    id: 'org-1',
    tenantId: 'tenant-1',
    displayName: 'ABC Plumbing',
    category: 'supplier',
    isPublic: true,
    trustScore: 4,
    verificationStatus: 'verified',
    issuerDid: 'did:example:abc',
    country: 'ZW',
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

function request(overrides: Partial<WorkflowRequest> = {}): WorkflowRequest {
  return {
    id: 'req-1',
    requesterTenantId: 'customer-1',
    targetOrgTenantId: 'tenant-1',
    requestType: 'quote',
    payload: { source: 'provider_match', totalAmount: 20, currency: 'USD', title: 'Leak' },
    status: 'approved',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

describe('job deposits', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE job_deposits (
        request_id TEXT PRIMARY KEY,
        org_tenant_id TEXT NOT NULL,
        author_tenant_id TEXT NOT NULL,
        payment_link_id TEXT NOT NULL,
        amount REAL NOT NULL,
        currency TEXT NOT NULL,
        status TEXT NOT NULL,
        dispute_reason TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE payment_links (id TEXT PRIMARY KEY, status TEXT, shortlink_url TEXT);
      CREATE TABLE org_memberships (user_id TEXT, org_tenant_id TEXT, role TEXT, status TEXT);
    `)
    jest.spyOn(DatabaseManager, 'getDatabase').mockReturnValue(db as any)
    jest.spyOn(workflowRequestRepository, 'findById').mockReturnValue(request())
    jobDepositLinks.create = () => {
      db.prepare(`INSERT INTO payment_links VALUES ('link-1', 'active', 'https://pay.example/abc')`).run()
      return { id: 'link-1', shortlinkUrl: 'https://pay.example/abc' } as any
    }
  })

  afterEach(() => {
    jest.restoreAllMocks()
    db.close()
  })

  it('does not open a deposit for a request that did not come from a match', () => {
    jest.spyOn(workflowRequestRepository, 'findById').mockReturnValue(request({ payload: {} }))
    expect(jobDepositService.view('req-1', 'customer-1').available).toBe(false)
    const create = jest.fn(jobDepositLinks.create)
    jobDepositLinks.create = create as any
    expect(() => jobDepositService.open('req-1', 'customer-1')).toThrow(/does not take a deposit/)
    expect(create).not.toHaveBeenCalled()
  })

  it('pays the business through one payment link, and blocks marking the job done while disputed', () => {
    const opened = jobDepositService.open('req-1', 'customer-1')
    expect(opened).toMatchObject({ status: 'awaiting_payment', payUrl: 'https://pay.example/abc', amount: 20 })
    expect(opened.note).toMatch(/does not hold it/)
    const create = jest.fn(jobDepositLinks.create)
    jobDepositLinks.create = create as any
    expect(jobDepositService.open('req-1', 'customer-1').payUrl).toBe('https://pay.example/abc')
    expect(create).not.toHaveBeenCalled()
    expect(db.prepare(`SELECT COUNT(*) AS n FROM payment_links`).get()).toEqual({ n: 1 })

    expect(() => jobDepositService.dispute('req-1', 'customer-1', 'The leak is still there')).toThrow(/after the business has the payment/)
    db.prepare(`UPDATE payment_links SET status = 'paid' WHERE id = 'link-1'`).run()
    expect(jobDepositService.view('req-1', 'customer-1').status).toBe('paid')

    db.prepare(`INSERT INTO org_memberships VALUES ('owner-1', 'tenant-1', 'owner', 'active')`).run()
    const disputed = jobDepositService.dispute('req-1', 'customer-1', 'The leak is still there')
    expect(disputed.status).toBe('disputed')
    expect(() => jobDepositService.acknowledge('req-1', 'owner-1')).toThrow(/Settle the dispute/)
    jobDepositService.settle('req-1', 'customer-1')
    expect(jobDepositService.acknowledge('req-1', 'owner-1').status).toBe('acknowledged')
  })
})

describe('offers', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE ssi_users (id TEXT, tenant_id TEXT, phone_hash TEXT);
      CREATE TABLE marketing_opt_ins (
        org_tenant_id TEXT NOT NULL,
        phone TEXT NOT NULL,
        enabled INTEGER NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (org_tenant_id, phone)
      );
      CREATE TABLE broadcasts (
        id TEXT PRIMARY KEY,
        org_tenant_id TEXT NOT NULL,
        body TEXT NOT NULL,
        audience_count INTEGER NOT NULL,
        status TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE org_memberships (user_id TEXT, org_tenant_id TEXT, role TEXT, status TEXT);
    `)
    jest.spyOn(DatabaseManager, 'getDatabase').mockReturnValue(db as any)
    jest.spyOn(organizationRegistryRepository, 'findOrganizationById').mockReturnValue(org())
    jest.spyOn(organizationRegistryRepository, 'findOrganizationByTenantId').mockReturnValue(undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
    db.close()
  })

  it('stores an offer opt-in apart from alerts, and STOP turns it off', () => {
    const phone = '0771234567'
    db.prepare(`INSERT INTO ssi_users VALUES ('user-1', 'customer-1', ?)`).run(contactHash(normalizeNotificationPhone(phone)))
    expect(marketingService.setOptIn('user-1', 'customer-1', 'org-1', phone, true)).toEqual({ enabled: true })
    expect(db.prepare(`SELECT COUNT(*) AS n FROM marketing_opt_ins WHERE enabled = 1`).get()).toEqual({ n: 1 })
    marketingService.optOutPhone('263771234567')
    expect(db.prepare(`SELECT enabled FROM marketing_opt_ins`).get()).toEqual({ enabled: 0 })
  })

  it('saves one offer a day and does not message anyone', () => {
    db.prepare(`INSERT INTO org_memberships VALUES ('owner-1', 'tenant-1', 'owner', 'active')`).run()
    db.prepare(`INSERT INTO marketing_opt_ins VALUES ('tenant-1', '263771234567', 1, '2026-11-12T00:00:00.000Z')`).run()
    const saved = marketingService.send('owner-1', 'tenant-1', 'Boiler service this week')
    expect(saved.status).toBe('saved')
    expect(saved.audienceCount).toBe(1)
    expect(saved.note).toMatch(/Nobody was messaged/)
    expect(() => marketingService.send('owner-1', 'tenant-1', 'Another offer')).toThrow(/already saved an offer today/)
  })

  it('counts who asked after the latest offer, within a week, without naming them', () => {
    db.exec(`CREATE TABLE workflow_requests (id TEXT, requester_tenant_id TEXT, target_org_tenant_id TEXT, created_at TEXT)`)
    db.prepare(`INSERT INTO org_memberships VALUES ('owner-1', 'tenant-1', 'owner', 'active')`).run()
    expect(marketingService.latestResult('owner-1', 'tenant-1')).toMatchObject({ saved: false, askedAfter: 0 })
    db.prepare(`INSERT INTO marketing_opt_ins VALUES ('tenant-1', '263771234567', 1, '2026-11-01T00:00:00.000Z')`).run()
    db.prepare(`INSERT INTO ssi_users VALUES ('user-1', 'customer-1', ?)`).run(contactHash(normalizeNotificationPhone('0771234567')))
    db.prepare(`INSERT INTO broadcasts VALUES ('b1', 'tenant-1', 'Offer', 1, 'saved', 'owner-1', '2026-11-02T00:00:00.000Z')`).run()
    db.prepare(`INSERT INTO workflow_requests VALUES ('before', 'customer-1', 'tenant-1', '2026-11-01T12:00:00.000Z')`).run()
    db.prepare(`INSERT INTO workflow_requests VALUES ('after', 'customer-1', 'tenant-1', '2026-11-04T00:00:00.000Z')`).run()
    db.prepare(`INSERT INTO workflow_requests VALUES ('again', 'customer-1', 'tenant-1', '2026-11-05T00:00:00.000Z')`).run()
    db.prepare(`INSERT INTO workflow_requests VALUES ('stranger', 'walk-in', 'tenant-1', '2026-11-04T00:00:00.000Z')`).run()
    const result = marketingService.latestResult('owner-1', 'tenant-1')
    expect(result).toMatchObject({ saved: true, audienceCount: 1, askedAfter: 1 })
    expect(result.note).toMatch(/1 of the 1 person who asked for offers sent you a request within 7 days/)
    expect(JSON.stringify(result)).not.toContain('customer-1')
  })
})

describe('partner discovery search', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('keeps sign-in as the default operation', () => {
    expect(normaliseOperations(undefined)).toEqual(['sign_in'])
    expect(normaliseOperations(['discover'])).toEqual(['discover'])
  })

  it('returns the public match only for a client that can search', async () => {
    const controller = new PartnerDiscoveryController()
    const match: ProviderMatch = {
      orgId: 'org-1',
      tenantId: 'tenant-secret',
      name: 'ABC Plumbing',
      category: 'supplier',
      trustScore: 4,
      verificationStatus: 'verified',
      serviceName: 'Plumbing',
      score: 8,
      reasons: ['Offers Plumbing'],
      unsure: [],
      standing: {
        configured: 'They say they do this.',
        verified: 'Checked: Registered.',
        live: 'Taking new work.',
      },
      reviewAverage: 4,
      reviewCount: 2,
    }
    jest.spyOn(PartnerVerificationService, 'authenticateCaller').mockReturnValue(undefined)
    await expect(controller.search({ headers: {} } as any, { need: 'plumber' })).rejects.toThrow(/client id/)

    jest.spyOn(PartnerVerificationService, 'authenticateCaller').mockReturnValue({
      policy: { operations: ['sign_in'], releaseClaims: [], audience: 'any', recipientScope: 'org_members' },
    } as any)
    await expect(controller.search({ headers: {} } as any, { need: 'plumber' })).rejects.toThrow(/cannot search/)

    jest.spyOn(PartnerVerificationService, 'authenticateCaller').mockReturnValue({
      policy: { operations: ['discover'], releaseClaims: [], audience: 'any', recipientScope: 'org_members' },
    } as any)
    jest.spyOn(orgOfferingsService, 'match').mockReturnValue([match])
    const found = await controller.search({ headers: {} } as any, { need: 'plumber' })
    expect(found).toEqual([toPartnerMatch(match)])
    expect(JSON.stringify(found)).not.toContain('tenant-secret')
    expect(JSON.stringify(found)).not.toContain('phone')
  })
})

describe('shop basket', () => {
  let db: Database.Database
  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE carts (id TEXT PRIMARY KEY, merchant_id TEXT, buyer_phone TEXT, items TEXT, total REAL, currency TEXT, status TEXT, created_at TEXT, updated_at TEXT);
      CREATE TABLE catalog_items (id TEXT PRIMARY KEY, merchant_id TEXT, title TEXT, price REAL, currency TEXT);
      INSERT INTO catalog_items VALUES ('pipe', 'shop-a', 'Pipe', 5, 'USD'), ('cake', 'shop-b', 'Cake', 9, 'USD');
      INSERT INTO carts VALUES ('cart-a', 'shop-a', '', '[]', 0, 'USD', 'pending', '', ''), ('cart-done', 'shop-a', '', '[]', 0, 'USD', 'invoiced', '', '');
    `)
    jest.spyOn(DatabaseManager, 'getDatabase').mockReturnValue(db as any)
  })
  afterEach(() => {
    jest.restoreAllMocks()
    db.close()
  })

  it('keeps one business per basket and refuses a basket already at checkout', async () => {
    const controller = new WhatsAppPayloadController()
    await expect(controller.addItemToCart('cart-a', { itemId: 'pipe', quantity: 2 })).resolves.toMatchObject({ total: 10 })
    await expect(controller.addItemToCart('cart-a', { itemId: 'cake' })).rejects.toThrow(/another business/)
    await expect(controller.addItemToCart('cart-done', { itemId: 'pipe' })).rejects.toThrow(/already gone to checkout/)
    expect(JSON.parse((db.prepare(`SELECT items FROM carts WHERE id = 'cart-a'`).get() as any).items)).toHaveLength(1)
  })

  it('refuses more than is in stock when stock is tracked, and leaves untracked products alone', async () => {
    db.exec(`CREATE TABLE inventory_projections (
      id TEXT, tenant_id TEXT, catalog_item_id TEXT, location_id TEXT,
      quantity_on_hand REAL, quantity_reserved REAL, quantity_available REAL,
      total_cost REAL, avg_unit_cost REAL, last_event_hash TEXT, last_event_at TEXT, updated_at TEXT
    )`)
    db.prepare(`INSERT INTO inventory_projections (catalog_item_id, location_id, quantity_available) VALUES ('pipe', 'shop', 1), ('pipe', 'yard', 2)`).run()
    const controller = new WhatsAppPayloadController()
    await expect(controller.addItemToCart('cart-a', { itemId: 'pipe', quantity: 4 })).rejects.toThrow(/Only 3 left/)
    await expect(controller.addItemToCart('cart-a', { itemId: 'pipe', quantity: 3 })).resolves.toMatchObject({ total: 15 })
    await expect(controller.addItemToCart('cart-a', { itemId: 'pipe', quantity: 1 })).rejects.toThrow(/Only 3 left/)
    db.prepare(`UPDATE inventory_projections SET quantity_available = 0`).run()
    expect(inventoryService.shortOfStock('pipe', 1)).toBe('This product is sold out.')
    expect(inventoryService.shortOfStock('cake', 99)).toBeUndefined()
    inventoryService.setOpeningStock('shop-a', 'cake', 0)
    expect(inventoryService.shortOfStock('cake', 1)).toBe('This product is sold out.')
    inventoryService.setOpeningStock('shop-a', 'cake', 9)
    expect(inventoryService.shortOfStock('cake', 1)).toBe('This product is sold out.')
    db.exec(`CREATE TABLE inventory_locations (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL, type TEXT, address TEXT, did TEXT,
      status TEXT, created_at TEXT, updated_at TEXT
    )`)
    inventoryService.setOpeningStock('shop-b', 'paint', 0)
    const location = db.prepare(`SELECT id FROM inventory_locations WHERE tenant_id = 'shop-b'`).get() as { id: string }
    expect(location.id).toMatch(/^LOC-/)
    expect(inventoryService.shortOfStock('paint', 1)).toBe('This product is sold out.')
  })

  it('moves a basket only along its steps: empty before paying, never after', async () => {
    const controller = new WhatsAppPayloadController()
    expect(cartMoveRefused('pending', 'invoiced')).toBeUndefined()
    expect(cartMoveRefused('invoiced', 'pending')).toMatch(/already gone to checkout/)
    expect(cartMoveRefused('paid', 'cancelled')).toMatch(/is paid/)
    expect(cartMoveRefused('cancelled', 'paid')).toBeUndefined()
    expect(cartMoveRefused('paid', 'refunded')).toBeUndefined()
    expect(cartMoveRefused('refunded', 'pending')).toMatch(/was refunded/)
    expect(cartMoveRefused('pending', 'paid')).toMatch(/not gone to checkout/)
    await expect(controller.cancelCart('cart-done')).resolves.toEqual({ id: 'cart-done', status: 'cancelled' })
    await expect(controller.cancelCart('cart-done')).resolves.toEqual({ id: 'cart-done', status: 'cancelled' })
    await expect(controller.addItemToCart('cart-done', { itemId: 'pipe' })).rejects.toThrow(/was emptied/)
    db.prepare(`UPDATE carts SET status = 'paid' WHERE id = 'cart-a'`).run()
    await expect(controller.cancelCart('cart-a')).rejects.toThrow(/is paid/)
    await expect(controller.refundCart('cart-a', { reason: 'Wrong item' })).resolves.toEqual({ id: 'cart-a', status: 'refunded' })
    await expect(controller.refundCart('cart-a', {})).resolves.toEqual({ id: 'cart-a', status: 'refunded' })
    await expect(controller.addItemToCart('cart-a', { itemId: 'pipe' })).rejects.toThrow(/was refunded/)
  })
})

describe('revoked registration', () => {
  let db: Database.Database
  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE organization_registry (id TEXT, issuer_did TEXT);
      CREATE TABLE org_trust_badges (id TEXT, org_id TEXT, badge_type TEXT, revoked INTEGER, revoked_at TEXT);
      INSERT INTO organization_registry VALUES ('org-1', 'did:example:abc');
      INSERT INTO org_trust_badges VALUES ('b1', 'org-1', 'RegistrationVC', 0, NULL), ('b2', 'org-1', 'MerchantVC', 0, NULL);
    `)
    jest.spyOn(DatabaseManager, 'getDatabase').mockReturnValue(db as any)
  })
  afterEach(() => {
    jest.restoreAllMocks()
    db.close()
  })

  it('takes the badge with the credential, and the business is no longer offered', () => {
    jest.spyOn(organizationRegistryRepository, 'listPublicOrganizations').mockReturnValue([org()])
    jest.spyOn(orgOfferingsService, 'publishedServices').mockReturnValue([
      { id: 'svc', kind: 'service', name: 'Plumbing', requestType: 'service', youGet: [], requirements: [], feeAmount: 0, feeCurrency: 'USD', requestSchema: {} },
    ] as any)
    expect(orgOfferingsService.match({ need: 'plumber' }).map((match) => match.name)).toEqual(['ABC Plumbing'])
    expect(
      orgOfferingsService.withdrawBadgeForCredential({ holderDid: 'did:example:abc', credentialDefinitionId: 'RegistrationVC_jwt_vc_json' }),
    ).toBe(1)
    expect(db.prepare(`SELECT revoked FROM org_trust_badges WHERE badge_type = 'MerchantVC'`).get()).toEqual({ revoked: 0 })
    expect(orgOfferingsService.match({ need: 'plumber' })).toEqual([])
  })

  it('says what the business claims, what a credential checks, and that it is taking work', () => {
    jest.spyOn(organizationRegistryRepository, 'listPublicOrganizations').mockReturnValue([org()])
    jest.spyOn(orgOfferingsService, 'publishedServices').mockReturnValue([
      { id: 'svc', kind: 'service', name: 'Plumbing', requestType: 'service', youGet: [], requirements: [], feeAmount: 0, feeCurrency: 'USD', requestSchema: {} },
    ] as any)
    const [hit] = orgOfferingsService.match({ need: 'plumber' })
    expect(hit.standing).toEqual({
      configured: 'They say they do this.',
      verified: 'Not checked with a credential yet.',
      live: 'Taking new work.',
    })
  })

  it('leaves out a business whose registration credential has expired, and names one that is still in force', () => {
    jest.spyOn(organizationRegistryRepository, 'listPublicOrganizations').mockReturnValue([org()])
    jest.spyOn(orgOfferingsService, 'publishedServices').mockReturnValue([
      { id: 'svc', kind: 'service', name: 'Plumbing', requestType: 'service', youGet: [], requirements: [], feeAmount: 0, feeCurrency: 'USD', requestSchema: {} },
    ] as any)
    db.exec(`ALTER TABLE org_trust_badges ADD COLUMN vc_log_id TEXT`)
    db.exec(`ALTER TABLE org_trust_badges ADD COLUMN label TEXT`)
    db.exec(`CREATE TABLE issued_credentials (id TEXT, credential_id TEXT, credential_data TEXT, revoked INTEGER)`)
    db.prepare(`UPDATE org_trust_badges SET vc_log_id = 'cred-1', label = 'Registered' WHERE badge_type = 'RegistrationVC'`).run()
    db.prepare(`INSERT INTO issued_credentials VALUES ('cred-1', 'cred-1', ?, 0)`).run(
      JSON.stringify({ expirationDate: '2000-01-01T00:00:00.000Z' }),
    )
    expect(orgOfferingsService.match({ need: 'plumber' })).toEqual([])
    db.prepare(`UPDATE issued_credentials SET credential_data = ?`).run(JSON.stringify({ expirationDate: '2999-01-01T00:00:00.000Z' }))
    const [hit] = orgOfferingsService.match({ need: 'plumber' })
    expect(hit.name).toBe('ABC Plumbing')
    expect(hit.standing.verified).toBe('Checked: Registered.')
  })

  it('finds a shop by the product name when its services do not say it', () => {
    jest.spyOn(organizationRegistryRepository, 'listPublicOrganizations').mockReturnValue([org()])
    jest.spyOn(orgOfferingsService, 'publishedServices').mockReturnValue([
      { id: 'svc', kind: 'service', name: 'Counter sale', requestType: 'service', youGet: [], requirements: [], feeAmount: 0, feeCurrency: 'USD', requestSchema: {} },
    ] as any)
    jest.spyOn(orgOfferingsService, 'goods').mockReturnValue([
      { id: 'cement', kind: 'goods', merchantId: 'tenant-1', title: 'Cement', price: 12, currency: 'USD', stockLeft: 20 },
    ])
    const [hit] = orgOfferingsService.match({ need: 'cement' })
    expect(hit?.name).toBe('ABC Plumbing')
    expect(hit?.serviceName).toBe('Cement')
  })

  it('writes the business\'s own record of what it offers, and shows a saved offer', () => {
    const business = org()
    business.metadata = { reach: { paymentMethods: ['ecocash'], fulfilment: ['delivery'], serviceAreas: ['Borrowdale'] } }
    jest.spyOn(organizationRegistryRepository, 'listPublicOrganizations').mockReturnValue([business])
    jest.spyOn(orgOfferingsService, 'publishedServices').mockReturnValue([
      { id: 'svc', kind: 'service', name: 'Plumbing', requestType: 'service', youGet: [], requirements: [], feeAmount: 0, feeCurrency: 'USD', requestSchema: {} },
    ] as any)
    db.exec(`
      ALTER TABLE org_trust_badges ADD COLUMN tenant_id TEXT;
      ALTER TABLE org_trust_badges ADD COLUMN label TEXT;
      ALTER TABLE org_trust_badges ADD COLUMN vc_log_id TEXT;
      ALTER TABLE org_trust_badges ADD COLUMN issued_at TEXT;
      CREATE TABLE issued_credentials (
        id TEXT PRIMARY KEY, tenant_id TEXT, credential_id TEXT, holder_did TEXT,
        credential_definition_id TEXT, schema_id TEXT, credential_data TEXT, credential_digest TEXT,
        format TEXT, revoked INTEGER, issued_at TEXT
      );
      CREATE TABLE broadcasts (id TEXT, org_tenant_id TEXT, body TEXT, created_at TEXT);
    `)
    db.prepare(`INSERT INTO broadcasts VALUES ('b1', 'tenant-1', 'Cement this week', '2026-11-12T00:00:00.000Z')`).run()
    orgOfferingsService.refreshOwnRecords(business)
    const [hit] = orgOfferingsService.match({ need: 'plumber' })
    expect(hit.standing.verified).toBe('Their record covers: what they offer, how they get paid, how the work is done.')
    expect(hit.offer).toBe('Cement this week')
    orgOfferingsService.refreshOwnRecords(business)
    const records = db.prepare(`SELECT COUNT(*) AS n FROM org_trust_badges WHERE badge_type = 'ServiceCapability' AND COALESCE(revoked, 0) = 0`).get() as { n: number }
    expect(records.n).toBe(1)
  })
})
