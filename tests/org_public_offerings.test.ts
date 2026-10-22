/**
 * An organisation's public offer follows its work areas: services come from setup, the owner
 * switches each one on or off, goods are separate and need the shop work area, and discovery
 * only lists organisations that chose to be found and have something to show.
 */

import 'reflect-metadata'
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'

import { DiscoveryController } from '../src/controllers/discovery/DiscoveryController'
import { DatabaseManager } from '../src/persistence/DatabaseManager'
import { organizationRegistryRepository } from '../src/persistence/OrganizationRegistryRepository'
import { orgOfferingsService } from '../src/services/OrgOfferingsService'

import { addMember, initTestDatabases, seedOrganization, type TestDatabases } from './utils/orgReadinessFixture'

let databases: TestDatabases

beforeAll(() => {
  databases = initTestDatabases('credo-offerings-')
})

afterAll(() => {
  databases.cleanup()
})

function seedListedOrg(kinds: string[]) {
  const org = seedOrganization({ name: `Org ${kinds.join('+')}` })
  const db = DatabaseManager.getDatabase()
  db.prepare(`UPDATE org_setup_profiles SET kinds = ? WHERE org_tenant_id = ?`).run(
    JSON.stringify(kinds),
    org.orgTenantId,
  )
  organizationRegistryRepository.createOrganization({
    tenantId: org.orgTenantId,
    displayName: org.name,
    category: 'other',
    isPublic: false,
    verificationStatus: 'verified',
    issuerDid: `did:web:issuer.${org.orgTenantId}`,
    metadata: {},
  } as any)
  return org
}

function addGoods(orgTenantId: string, title: string) {
  DatabaseManager.getDatabase()
    .prepare(`INSERT INTO catalog_items (id, merchant_id, title, price, currency) VALUES (?, ?, ?, 5, 'USD')`)
    .run(`ITM-${Math.random().toString(36).slice(2)}`, orgTenantId, title)
}

describe('organisation public offerings', () => {
  test('services come from the work areas; staff work and goods are not services', () => {
    const org = seedListedOrg(['field'])
    const view = orgOfferingsService.ownerView(org.orgTenantId)
    const keys = view.services.map((service) => service.offeringKey)

    expect(keys).toContain('ask_quote')
    expect(keys).toContain('book_job')
    expect(keys).not.toContain('school_fees')
    expect(view.services.every((service) => service.workArea !== 'People and payroll')).toBe(true)
    expect(view.goods.enabled).toBe(false)
    expect(view.services.find((service) => service.offeringKey === 'book_job')?.youGet).toContain('Job done card')
  })

  test('the owner hides a service, prices it, and the public view follows', () => {
    const org = seedListedOrg(['field'])
    const before = orgOfferingsService.ownerView(org.orgTenantId)
    const quote = before.services.find((service) => service.offeringKey === 'ask_quote')!
    const job = before.services.find((service) => service.offeringKey === 'book_job')!

    orgOfferingsService.update(org.ownerUserId, org.orgTenantId, {
      services: [
        { id: quote.id, published: false },
        { id: job.id, feeAmount: 25, turnaroundTime: '2 days' },
      ],
    })

    const registry = organizationRegistryRepository.findOrganizationByTenantId(org.orgTenantId)!
    const shown = orgOfferingsService.publishedServices(registry)
    expect(shown.map((service) => service.offeringKey)).not.toContain('ask_quote')
    expect(shown.find((service) => service.offeringKey === 'book_job')).toMatchObject({
      kind: 'service',
      requestType: 'service',
      feeAmount: 25,
      turnaroundTime: '2 days',
    })
  })

  test('a field worker cannot change what the organisation shows', () => {
    const org = seedListedOrg(['field'])
    const workerId = `worker-${Math.random().toString(36).slice(2)}`
    addMember({ orgTenantId: org.orgTenantId, organizationId: org.organizationId, userId: workerId, role: 'field_worker' })
    expect(() => orgOfferingsService.update(workerId, org.orgTenantId, { isPublic: true })).toThrow(/owners\/admins/)
  })

  test('going public needs something to show; then discovery lists it with services and badges', async () => {
    const org = seedListedOrg(['field'])
    const view = orgOfferingsService.ownerView(org.orgTenantId)
    orgOfferingsService.update(org.ownerUserId, org.orgTenantId, {
      services: view.services.map((service) => ({ id: service.id, published: false })),
    })
    expect(() => orgOfferingsService.update(org.ownerUserId, org.orgTenantId, { isPublic: true })).toThrow(
      /at least one service or add goods/,
    )

    const job = view.services.find((service) => service.offeringKey === 'book_job')!
    const after = orgOfferingsService.update(org.ownerUserId, org.orgTenantId, {
      isPublic: true,
      services: [{ id: job.id, published: true }],
      profile: { description: 'Plumbing and repairs', contactPhone: '+263771234567', website: 'fixit.co.zw' },
    })
    expect(after.isPublic).toBe(true)
    expect(after.listingBlockers).toEqual([])
    expect(after.profile.website).toBe('https://fixit.co.zw')

    const discovery = new DiscoveryController()
    const listed = await discovery.listOrganizations()
    expect(listed.find((entry) => entry.tenantId === org.orgTenantId)).toMatchObject({ availableServices: 1, goodsCount: 0 })

    const storefront = await discovery.getStorefront(org.orgTenantId)
    expect(storefront.services.map((service) => service.offeringKey)).toEqual(['book_job'])
    expect(storefront.sellsGoods).toBe(false)
    expect(storefront.catalogItems).toEqual([])
    expect(storefront.trustBadges[0]).toMatchObject({ type: 'verified', revoked: false })
    expect(storefront.workAreas).toContain('Field jobs')
    expect(storefront.contactLinks.phone).toBe('+263771234567')
  })

  test('goods show only for organisations that sell, separately from services', async () => {
    const shop = seedListedOrg(['shop'])
    addGoods(shop.orgTenantId, 'Cement 50kg')
    const view = orgOfferingsService.update(shop.ownerUserId, shop.orgTenantId, { isPublic: true })
    expect(view.goods).toMatchObject({ enabled: true, count: 1 })

    const storefront = await new DiscoveryController().getStorefront(shop.orgTenantId)
    expect(storefront.sellsGoods).toBe(true)
    expect(storefront.catalogItems.map((item) => [item.kind, item.title])).toEqual([['goods', 'Cement 50kg']])
    expect(storefront.services.every((service) => service.kind === 'service')).toBe(true)

    // Goods rows left behind by an organisation that does not sell are never shown.
    const office = seedListedOrg(['field'])
    addGoods(office.orgTenantId, 'Stray item')
    expect(orgOfferingsService.goods(office.orgTenantId)).toEqual([])
  })

  test('a service hides itself when its work area is switched off, and private orgs are not found', async () => {
    const org = seedListedOrg(['field'])
    orgOfferingsService.update(org.ownerUserId, org.orgTenantId, { isPublic: true })
    DatabaseManager.getDatabase()
      .prepare(`UPDATE org_setup_profiles SET kinds = '[]' WHERE org_tenant_id = ?`)
      .run(org.orgTenantId)

    const view = orgOfferingsService.ownerView(org.orgTenantId)
    const job = view.services.find((service) => service.offeringKey === 'book_job')!
    expect(job.available).toBe(false)
    expect(() =>
      orgOfferingsService.update(org.ownerUserId, org.orgTenantId, { services: [{ id: job.id, published: true }] }),
    ).toThrow(/work area switched on/)

    orgOfferingsService.update(org.ownerUserId, org.orgTenantId, { isPublic: false })
    await expect(new DiscoveryController().getStorefront(org.orgTenantId)).rejects.toThrow(/not found/)
    expect(orgOfferingsService.preview(org.orgTenantId).isPublic).toBe(false)
  })

  test('the owner adds and removes goods; organisations that do not sell cannot add them', () => {
    const shop = seedListedOrg(['shop'])
    const added = orgOfferingsService.update(shop.ownerUserId, shop.orgTenantId, {
      addGoods: { title: 'Bread', price: 1.2, currency: 'usd' },
    })
    expect(added.goods.items.map((item) => [item.kind, item.title, item.currency])).toEqual([['goods', 'Bread', 'USD']])
    expect(added.services.some((service) => service.name === 'Bread')).toBe(false)

    const removed = orgOfferingsService.update(shop.ownerUserId, shop.orgTenantId, {
      removeGoodsId: added.goods.items[0].id,
    })
    expect(removed.goods.count).toBe(0)

    const office = seedListedOrg(['office'])
    expect(() =>
      orgOfferingsService.update(office.ownerUserId, office.orgTenantId, { addGoods: { title: 'Bread', price: 1 } }),
    ).toThrow(/Shop and services/)
  })

  test('the owner adds and removes a service no work area covers', () => {
    const org = seedListedOrg(['office'])
    const added = orgOfferingsService.update(org.ownerUserId, org.orgTenantId, {
      addService: { name: 'Consultation', feeAmount: 10 },
    })
    const consultation = added.services.find((service) => service.name === 'Consultation')!
    expect(consultation).toMatchObject({ custom: true, published: true, available: true, feeAmount: 10 })

    const removed = orgOfferingsService.update(org.ownerUserId, org.orgTenantId, { removeServiceId: consultation.id })
    expect(removed.services.some((service) => service.id === consultation.id)).toBe(false)

    const quote = removed.services.find((service) => service.offeringKey === 'ask_quote')!
    expect(() => orgOfferingsService.update(org.ownerUserId, org.orgTenantId, { removeServiceId: quote.id })).toThrow(
      /hidden, not removed/,
    )
  })
})
