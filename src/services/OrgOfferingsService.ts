/**
 * An organisation's public offer: its listing, the services its work areas make possible, and
 * its goods. The owner decides what is shown; discovery shows only that.
 *
 * Services follow the setup answers: a service whose work area is switched off stops showing
 * without the owner touching it, and comes back with the owner's last choice when the work area
 * is switched on again. Goods are a different thing (see `config/orgOfferings.ts`).
 */
import { randomUUID } from 'crypto'

import { ORG_MODULE_CATALOGUE, type OrgModule } from '../config/orgModules'
import { GOODS_MODULE, OFFERING_VC_LABELS, ORG_OFFERINGS, type OrgOfferingDefinition } from '../config/orgOfferings'
import { StatusException } from '../errors/StatusException'
import { DatabaseManager } from '../persistence/DatabaseManager'
import {
  organizationRegistryRepository,
  type OrganizationCategory,
  type OrganizationRegistry,
  type ServiceCatalogEntry,
} from '../persistence/OrganizationRegistryRepository'

import { orgSetupProfileService } from './OrgSetupProfileService'

export const ORGANIZATION_CATEGORIES: OrganizationCategory[] = [
  'government',
  'education',
  'telecom',
  'supplier',
  'finance',
  'healthcare',
  'insurance',
  'employer',
  'logistics',
  'other',
]

/** A service as the public sees it. Always `kind: 'service'`; goods are `PublicGoodsItem`. */
export interface PublicService {
  id: string
  kind: 'service'
  offeringKey?: string
  module?: string
  workArea?: string
  name: string
  description?: string
  requestType: 'quote' | 'invoice' | 'service'
  vcType?: string
  workflowTemplateId?: string
  /** Plain names of the cards the customer keeps. */
  youGet: string[]
  requirements: string[]
  turnaroundTime?: string
  feeAmount: number
  feeCurrency: string
  requestSchema: Record<string, unknown>
}

export interface PublicGoodsItem {
  id: string
  kind: 'goods'
  merchantId: string
  title: string
  description?: string
  price: number
  currency: string
  category?: string
}

export interface PublicTrustBadge {
  type: string
  label: string
  issuedAt: string
  revoked: boolean
}

export interface PublicStorefront {
  orgId: string
  tenantId: string
  isPublic: boolean
  did: string
  displayName: string
  description?: string
  logoUrl?: string
  category: string
  trustScore: number
  verificationStatus: string
  /** On the platform since. */
  memberSince: string
  /** Work areas behind the services shown. */
  workAreas: string[]
  trustBadges: PublicTrustBadge[]
  services: PublicService[]
  /** False when the organisation does not sell goods; the goods section is then hidden. */
  sellsGoods: boolean
  catalogItems: PublicGoodsItem[]
  paymentRails: string[]
  contactLinks: { phone?: string | null; email?: string | null; website?: string | null; address?: string | null }
  shopUrl?: string
}

export interface OwnerOfferingService {
  /** `service_catalog` id, stable for requests. */
  id: string
  offeringKey?: string
  module?: string
  workArea: string
  name: string
  description?: string
  requestType: 'quote' | 'invoice' | 'service'
  youGet: string[]
  feeAmount: number
  feeCurrency: string
  turnaroundTime?: string
  published: boolean
  /** False when the work area behind it is off: it cannot be shown until it is on again. */
  available: boolean
  custom: boolean
}

export interface OwnerOfferingsView {
  orgTenantId: string
  isPublic: boolean
  /** Why the organisation is not found yet, in plain words. Empty when it is listed. */
  listingBlockers: string[]
  profile: {
    displayName: string
    description?: string
    category: string
    contactPhone?: string
    contactEmail?: string
    website?: string
    address?: string
  }
  categories: string[]
  services: OwnerOfferingService[]
  goods: { enabled: boolean; count: number; note: string; items: PublicGoodsItem[] }
  trustBadges: PublicTrustBadge[]
}

export interface UpdateOfferingsInput {
  isPublic?: boolean
  profile?: {
    description?: string
    category?: string
    contactPhone?: string
    contactEmail?: string
    website?: string
    address?: string
  }
  services?: Array<{
    id: string
    published?: boolean
    name?: string
    description?: string
    feeAmount?: number
    feeCurrency?: string
    turnaroundTime?: string
  }>
  /** A service the organisation offers that no work area covers, e.g. "Consultation". */
  addService?: { name: string; description?: string; feeAmount?: number; feeCurrency?: string; turnaroundTime?: string }
  removeServiceId?: string
  /** A product for sale. Only for organisations with the "Shop and services" work area. */
  addGoods?: { title: string; price: number; currency?: string; description?: string; category?: string }
  removeGoodsId?: string
}

const MODULE_LABEL = new Map<string, string>(ORG_MODULE_CATALOGUE.map((module) => [module.id, module.label]))

function clean(value: unknown, max = 500): string | undefined {
  if (value === undefined || value === null) return undefined
  return String(value).trim().slice(0, max)
}

export class OrgOfferingsService {
  private availableModules(orgTenantId: string): Set<OrgModule> {
    const profile = orgSetupProfileService.get(orgTenantId)
    return new Set(profile.access.modules.filter((module) => module.available).map((module) => module.id))
  }

  private definitionFor(entry: ServiceCatalogEntry): OrgOfferingDefinition | undefined {
    const key = entry.metadata?.offeringKey
    return key ? ORG_OFFERINGS.find((offering) => offering.key === key) : undefined
  }

  private isAvailable(entry: ServiceCatalogEntry, modules: Set<OrgModule>): boolean {
    const definition = this.definitionFor(entry)
    if (definition) return definition.module === null || modules.has(definition.module)
    const module = entry.metadata?.module as OrgModule | undefined
    return !module || modules.has(module)
  }

  /** One `service_catalog` row per offering this organisation's work areas allow; never removes any. */
  private sync(org: OrganizationRegistry, modules: Set<OrgModule>): ServiceCatalogEntry[] {
    const rows = organizationRegistryRepository.listServicesByOrganization(org.id, false)
    const have = new Set(rows.map((row) => row.metadata?.offeringKey).filter(Boolean))
    for (const offering of ORG_OFFERINGS) {
      if (have.has(offering.key)) continue
      if (offering.module !== null && !modules.has(offering.module)) continue
      rows.push(
        organizationRegistryRepository.createService({
          orgId: org.id,
          serviceType: offering.serviceType,
          vcType: offering.vcTypes[offering.vcTypes.length - 1],
          workflowTemplateId: offering.workflowTemplateId,
          name: offering.name,
          description: offering.description,
          requirements: offering.requirements,
          feeAmount: 0,
          feeCurrency: 'USD',
          isActive: offering.defaultOn,
          requestSchema: {},
          metadata: {
            source: 'setup',
            offeringKey: offering.key,
            module: offering.module,
            requestType: offering.requestType,
            vcTypes: offering.vcTypes,
          },
        }),
      )
    }
    return rows
  }

  private youGet(entry: ServiceCatalogEntry): string[] {
    const types: string[] = Array.isArray(entry.metadata?.vcTypes)
      ? entry.metadata.vcTypes
      : entry.vcType
        ? [entry.vcType]
        : []
    return Array.from(new Set(types.map((type) => OFFERING_VC_LABELS[type] || type.replace(/VC$/, ''))))
  }

  private requestType(entry: ServiceCatalogEntry): 'quote' | 'invoice' | 'service' {
    const value = entry.metadata?.requestType
    return value === 'quote' || value === 'invoice' ? value : 'service'
  }

  private workArea(entry: ServiceCatalogEntry): string {
    const module = this.definitionFor(entry)?.module ?? entry.metadata?.module
    return module ? MODULE_LABEL.get(module) || module : 'Everyone'
  }

  private toPublicService(entry: ServiceCatalogEntry): PublicService {
    const module = this.definitionFor(entry)?.module ?? entry.metadata?.module
    return {
      id: entry.id,
      kind: 'service',
      offeringKey: entry.metadata?.offeringKey,
      module: module || undefined,
      workArea: this.workArea(entry),
      name: entry.name,
      description: entry.description,
      requestType: this.requestType(entry),
      vcType: entry.vcType,
      workflowTemplateId: entry.workflowTemplateId,
      youGet: this.youGet(entry),
      requirements: entry.requirements || [],
      turnaroundTime: entry.turnaroundTime,
      feeAmount: Number(entry.feeAmount || 0),
      feeCurrency: entry.feeCurrency || 'USD',
      requestSchema: entry.requestSchema || {},
    }
  }

  publishedServices(org: OrganizationRegistry): PublicService[] {
    const modules = this.availableModules(org.tenantId)
    return this.sync(org, modules)
      .filter((entry) => entry.isActive && this.isAvailable(entry, modules))
      .map((entry) => this.toPublicService(entry))
  }

  sellsGoods(orgTenantId: string): boolean {
    return this.availableModules(orgTenantId).has(GOODS_MODULE)
  }

  goods(orgTenantId: string, limit = 200): PublicGoodsItem[] {
    if (!this.sellsGoods(orgTenantId)) return []
    const rows = DatabaseManager.getDatabase()
      .prepare(
        `SELECT id, merchant_id, title, description, price, currency, category
           FROM catalog_items WHERE merchant_id = ? ORDER BY created_at DESC LIMIT ?`,
      )
      .all(orgTenantId, limit) as Array<{
      id: string
      merchant_id: string
      title: string
      description?: string
      price: number
      currency: string
      category?: string
    }>
    return rows.map((row) => ({
      id: row.id,
      kind: 'goods',
      merchantId: row.merchant_id,
      title: row.title,
      description: row.description || undefined,
      price: Number(row.price || 0),
      currency: row.currency || 'USD',
      category: row.category || undefined,
    }))
  }

  private goodsCount(orgTenantId: string): number {
    const row = DatabaseManager.getDatabase()
      .prepare(`SELECT COUNT(*) AS cnt FROM catalog_items WHERE merchant_id = ?`)
      .get(orgTenantId) as { cnt: number } | undefined
    return Number(row?.cnt || 0)
  }

  /** Badges the organisation holds (proven by credentials), plus the platform's own check. */
  trustBadges(org: OrganizationRegistry): PublicTrustBadge[] {
    let rows: Array<{ badge_type: string; label: string; issued_at: string }> = []
    try {
      rows = DatabaseManager.getDatabase()
        .prepare(
          `SELECT badge_type, label, issued_at FROM org_trust_badges
            WHERE org_id = ? AND COALESCE(revoked, 0) = 0 ORDER BY issued_at ASC`,
        )
        .all(org.id) as typeof rows
    } catch {
      rows = []
    }
    const badges: PublicTrustBadge[] = rows.map((row) => ({
      type: row.badge_type,
      label: row.label,
      issuedAt: row.issued_at,
      revoked: false,
    }))
    if (org.verificationStatus === 'verified' && !badges.some((badge) => badge.type === 'RegistrationVC')) {
      badges.unshift({
        type: 'verified',
        label: 'Verified organisation',
        issuedAt: org.createdAt.toISOString(),
        revoked: false,
      })
    }
    return badges
  }

  private paymentRails(orgId: string): string[] {
    try {
      const row = DatabaseManager.getDatabase()
        .prepare(`SELECT payment_rails FROM organization_registry WHERE id = ? LIMIT 1`)
        .get(orgId) as { payment_rails?: string } | undefined
      const parsed = JSON.parse(row?.payment_rails || '[]')
      return Array.isArray(parsed) ? parsed.map((value) => String(value)) : []
    } catch {
      return []
    }
  }

  /** Listed and with something to show: at least one service or goods for sale. */
  isDiscoverable(org: OrganizationRegistry): boolean {
    if (!org.isPublic) return false
    return this.publishedServices(org).length > 0 || this.goods(org.tenantId, 1).length > 0
  }

  storefront(org: OrganizationRegistry): PublicStorefront {
    const services = this.publishedServices(org)
    const sellsGoods = this.sellsGoods(org.tenantId)
    const catalogItems = this.goods(org.tenantId)
    const workAreas = Array.from(
      new Set(services.map((service) => service.workArea).filter((area): area is string => !!area && area !== 'Everyone')),
    )
    if (sellsGoods && !workAreas.includes(MODULE_LABEL.get(GOODS_MODULE) || '')) {
      workAreas.push(MODULE_LABEL.get(GOODS_MODULE) || GOODS_MODULE)
    }
    return {
      orgId: org.id,
      tenantId: org.tenantId,
      isPublic: org.isPublic,
      did: org.issuerDid,
      displayName: org.displayName,
      description: org.description,
      logoUrl: org.logoUrl,
      category: org.category,
      trustScore: Number(org.trustScore || 0),
      verificationStatus: org.verificationStatus,
      memberSince: org.createdAt.toISOString(),
      workAreas,
      trustBadges: this.trustBadges(org),
      services,
      sellsGoods,
      catalogItems,
      paymentRails: this.paymentRails(org.id),
      contactLinks: {
        phone: org.contactPhone || null,
        email: org.contactEmail || null,
        website: org.website || null,
        address: org.address || null,
      },
      shopUrl: catalogItems.length > 0 ? `/shop?orgId=${encodeURIComponent(org.id)}` : undefined,
    }
  }

  // ---------------------------------------------------------------------------
  // Owner side
  // ---------------------------------------------------------------------------

  assertManager(userId: string, orgTenantId: string): void {
    const row = DatabaseManager.getDatabase()
      .prepare(
        `SELECT role FROM org_memberships WHERE user_id = ? AND org_tenant_id = ? AND status = 'active' LIMIT 1`,
      )
      .get(userId, orgTenantId) as { role?: string } | undefined
    if (!row) throw new StatusException('Not a member of this organization', 403)
    if (row.role !== 'owner' && row.role !== 'admin') {
      throw new StatusException('Only org owners/admins can manage what the organisation shows the public', 403)
    }
  }

  private requireOrg(orgTenantId: string): OrganizationRegistry {
    const org = organizationRegistryRepository.findOrganizationByTenantId(orgTenantId)
    if (!org) throw new StatusException('This organisation has no public profile yet. Finish setup first.', 404)
    return org
  }

  ownerView(orgTenantId: string): OwnerOfferingsView {
    const org = this.requireOrg(orgTenantId)
    const modules = this.availableModules(orgTenantId)
    const rows = this.sync(org, modules)
    const services: OwnerOfferingService[] = rows.map((entry) => ({
      id: entry.id,
      offeringKey: entry.metadata?.offeringKey,
      module: (this.definitionFor(entry)?.module ?? entry.metadata?.module) || undefined,
      workArea: this.workArea(entry),
      name: entry.name,
      description: entry.description,
      requestType: this.requestType(entry),
      youGet: this.youGet(entry),
      feeAmount: Number(entry.feeAmount || 0),
      feeCurrency: entry.feeCurrency || 'USD',
      turnaroundTime: entry.turnaroundTime,
      published: entry.isActive,
      available: this.isAvailable(entry, modules),
      custom: !entry.metadata?.offeringKey,
    }))
    const sellsGoods = modules.has(GOODS_MODULE)
    const goodsCount = sellsGoods ? this.goodsCount(orgTenantId) : 0
    const shown = services.filter((service) => service.published && service.available).length
    const listingBlockers: string[] = []
    if (!org.isPublic) listingBlockers.push('The organisation is private.')
    if (shown === 0 && goodsCount === 0) listingBlockers.push('Show at least one service or add goods.')
    return {
      orgTenantId,
      isPublic: org.isPublic,
      listingBlockers,
      profile: {
        displayName: org.displayName,
        description: org.description,
        category: org.category,
        contactPhone: org.contactPhone,
        contactEmail: org.contactEmail,
        website: org.website,
        address: org.address,
      },
      categories: ORGANIZATION_CATEGORIES,
      services,
      goods: {
        enabled: sellsGoods,
        count: goodsCount,
        note: sellsGoods
          ? 'Products people buy from your shop. Add and price them in the shop catalogue.'
          : 'Selling goods needs the "Shop and services" work area. Turn it on in setup to add products.',
        items: sellsGoods ? this.goods(orgTenantId, 50) : [],
      },
      trustBadges: this.trustBadges(org),
    }
  }

  update(userId: string, orgTenantId: string, input: UpdateOfferingsInput): OwnerOfferingsView {
    this.assertManager(userId, orgTenantId)
    const org = this.requireOrg(orgTenantId)
    const modules = this.availableModules(orgTenantId)
    const rows = this.sync(org, modules)
    const byId = new Map(rows.map((row) => [row.id, row]))

    for (const change of input.services || []) {
      const row = byId.get(change.id)
      if (!row) throw new StatusException('Unknown service. Reload and try again.', 400)
      if (change.published === true && !this.isAvailable(row, modules)) {
        throw new StatusException(`"${row.name}" needs its work area switched on in setup first.`, 400)
      }
      const fee = change.feeAmount === undefined ? undefined : Number(change.feeAmount)
      if (fee !== undefined && (!Number.isFinite(fee) || fee < 0)) {
        throw new StatusException('A price must be zero or more.', 400)
      }
      const name = clean(change.name, 120)
      if (name !== undefined && !name) throw new StatusException('A service needs a name.', 400)
      organizationRegistryRepository.updateService(row.id, {
        isActive: change.published,
        name,
        description: clean(change.description),
        feeAmount: fee,
        feeCurrency: clean(change.feeCurrency, 8)?.toUpperCase() || undefined,
        turnaroundTime: clean(change.turnaroundTime, 80),
      })
    }

    if (input.addService) {
      const name = clean(input.addService.name, 120)
      if (!name) throw new StatusException('A service needs a name.', 400)
      const fee = Number(input.addService.feeAmount || 0)
      if (!Number.isFinite(fee) || fee < 0) throw new StatusException('A price must be zero or more.', 400)
      organizationRegistryRepository.createService({
        orgId: org.id,
        serviceType: 'other',
        name,
        description: clean(input.addService.description),
        requirements: [],
        feeAmount: fee,
        feeCurrency: clean(input.addService.feeCurrency, 8)?.toUpperCase() || 'USD',
        turnaroundTime: clean(input.addService.turnaroundTime, 80),
        isActive: true,
        requestSchema: {},
        metadata: { source: 'owner', requestType: 'service' },
      })
    }

    if (input.removeServiceId) {
      const row = byId.get(input.removeServiceId)
      if (!row) throw new StatusException('Unknown service. Reload and try again.', 400)
      if (row.metadata?.offeringKey) {
        throw new StatusException('Services from your work areas can be hidden, not removed.', 400)
      }
      organizationRegistryRepository.deleteService(row.id)
    }

    if (input.addGoods) {
      if (!modules.has(GOODS_MODULE)) {
        throw new StatusException('Selling goods needs the "Shop and services" work area switched on in setup.', 400)
      }
      const title = clean(input.addGoods.title, 120)
      const price = Number(input.addGoods.price)
      if (!title) throw new StatusException('A product needs a name.', 400)
      if (!Number.isFinite(price) || price < 0) throw new StatusException('A price must be zero or more.', 400)
      const now = new Date().toISOString()
      DatabaseManager.getDatabase()
        .prepare(
          `INSERT INTO catalog_items (id, merchant_id, title, description, images, price, currency, category, created_at, updated_at)
           VALUES (?, ?, ?, ?, '[]', ?, ?, ?, ?, ?)`,
        )
        .run(
          `ITM-${randomUUID()}`,
          orgTenantId,
          title,
          clean(input.addGoods.description) ?? null,
          price,
          clean(input.addGoods.currency, 8)?.toUpperCase() || 'USD',
          clean(input.addGoods.category, 80) ?? null,
          now,
          now,
        )
    }

    if (input.removeGoodsId) {
      try {
        const result = DatabaseManager.getDatabase()
          .prepare(`DELETE FROM catalog_items WHERE id = ? AND merchant_id = ?`)
          .run(input.removeGoodsId, orgTenantId)
        if (result.changes === 0) throw new StatusException('Unknown product. Reload and try again.', 400)
      } catch (error: any) {
        if (error instanceof StatusException) throw error
        throw new StatusException('This product has stock or sales records, so it stays in your history.', 409)
      }
    }

    if (input.profile) {
      const category = clean(input.profile.category, 40)
      if (category && !ORGANIZATION_CATEGORIES.includes(category as OrganizationCategory)) {
        throw new StatusException('Unknown category.', 400)
      }
      const email = clean(input.profile.contactEmail, 200)
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new StatusException('That email address does not look right.', 400)
      }
      const website = clean(input.profile.website, 300)
      organizationRegistryRepository.updateOrganization(org.id, {
        description: clean(input.profile.description, 1000),
        category: (category as OrganizationCategory) || undefined,
        contactPhone: clean(input.profile.contactPhone, 40),
        contactEmail: email,
        website: website && !/^https?:\/\//i.test(website) ? `https://${website}` : website,
        address: clean(input.profile.address, 300),
      })
    }

    if (input.isPublic !== undefined) this.setListed(orgTenantId, input.isPublic)

    return this.ownerView(orgTenantId)
  }

  /** Listing needs something to show; going private is always allowed. */
  setListed(orgTenantId: string, isPublic: boolean): void {
    const org = this.requireOrg(orgTenantId)
    if (isPublic) {
      const fresh = { ...org, isPublic: true }
      if (!this.isDiscoverable(fresh)) {
        throw new StatusException('Show at least one service or add goods before going public.', 400)
      }
    }
    organizationRegistryRepository.updateOrganization(org.id, { isPublic })
  }

  /** Owner preview: what the public sees, even while the organisation is private. */
  preview(orgTenantId: string): PublicStorefront {
    return this.storefront(this.requireOrg(orgTenantId))
  }
}

export const orgOfferingsService = new OrgOfferingsService()
