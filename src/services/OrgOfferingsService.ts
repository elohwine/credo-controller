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
import { whatsAppGraphUrl } from './WhatsAppSenderService'
import { credentialLifecycleService } from './ssi/CredentialLifecycleService'
import { inventoryService } from './InventoryService'
import { providerReviewService } from './ProviderReviewService'
import {
  cleanReach,
  judgeProvider,
  readReach,
  type FulfilmentOption,
  type ProviderReach,
} from './providerMatch'

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
  /** First product photo, when the shop has one. */
  image?: string
  /** Left in stock, only when the business tracks stock for this product. */
  stockLeft?: number
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
  /** Where they work, when, and whether they come to you, deliver or you collect. */
  reach: ProviderReach
  /** Ratings from customers who paid or whose request was accepted. */
  reviews: { average: number | null; count: number; recent: Array<{ rating: number; comment?: string; at: string }> }
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
  /** Where the organisation works, and how. Empty until the owner sets it. */
  reach: ProviderReach
  /** How it gets paid. Empty until the owner sets it. */
  paymentRails: string[]
  services: OwnerOfferingService[]
  goods: {
    enabled: boolean
    count: number
    note: string
    items: PublicGoodsItem[]
    /** How many shop products the last WhatsApp import added or refreshed. */
    imported?: number
    updated?: number
  }
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
  addGoods?: { title: string; price: number; currency?: string; description?: string; category?: string; stock?: number }
  /** Pull the linked WhatsApp product catalog into the shop. Existing products match on code, then name. */
  importWhatsAppCatalog?: boolean
  removeGoodsId?: string
  /** Areas, hours and how the work is done. Omitted fields keep what is saved. */
  reach?: { serviceAreas?: string[]; hours?: string; fulfilment?: string[]; acceptingWork?: boolean }
  /** Replaces the payment methods people can use. An empty list clears them. */
  paymentRails?: string[]
}

/** Three different facts. A good rating never stands in for any of them. */
export interface ProviderStanding {
  /** What the business itself has said it does. */
  configured: string
  /** What a credential that is still in force actually checks. */
  verified: string
  /** Whether the business is taking work right now. */
  live: string
}

export interface ProviderMatch {
  orgId: string
  tenantId: string
  name: string
  description?: string
  category: string
  trustScore: number
  verificationStatus: string
  standing: ProviderStanding
  /** The service that matched what was asked, when one did. */
  serviceId?: string
  serviceName?: string
  /** The organisation's "Ask for a quote" service, when it is shown. */
  quoteServiceId?: string
  score: number
  reasons: string[]
  unsure: string[]
  /** The latest offer this business saved, for people looking at it. Nobody is messaged. */
  offer?: string
  /** From customers who paid or whose request was accepted. Null when nobody has rated them. */
  reviewAverage: number | null
  reviewCount: number
}

export interface MatchRequest {
  need?: string
  area?: string
  payment?: string
  fulfilment?: string
  limit?: number
}

const MODULE_LABEL = new Map<string, string>(ORG_MODULE_CATALOGUE.map((module) => [module.id, module.label]))

/** The first https photo on a shop product. Anything else is left out. */
function firstCatalogImage(raw?: string): string | undefined {
  try {
    const parsed = JSON.parse(raw || '[]')
    if (!Array.isArray(parsed)) return undefined
    const url = parsed.find((item) => typeof item === 'string' && /^https:\/\//.test(item))
    return typeof url === 'string' ? url : undefined
  } catch {
    return undefined
  }
}

function clean(value: unknown, max = 500): string | undefined {
  if (value === undefined || value === null) return undefined
  return String(value).trim().slice(0, max)
}

/** "12.50 USD" or a number plus a currency code. Anything else is skipped. */
export function catalogPrice(raw: unknown, currencyField?: unknown): { price: number; currency: string } | undefined {
  const stated = String(currencyField || '').trim().toUpperCase()
  const text = typeof raw === 'number' && Number.isFinite(raw) ? String(raw) : String(raw || '').trim()
  const match = text.match(/^(\d+(?:\.\d{1,2})?)\s*([A-Za-z]{3})?$/)
  if (!match) return undefined
  const price = Number(match[1])
  const currency = (match[2] || stated || 'USD').toUpperCase()
  if (!Number.isFinite(price) || price < 0 || !/^[A-Z]{3}$/.test(currency)) return undefined
  return { price, currency }
}

async function graphGet(path: string): Promise<any> {
  const token = process.env.WABA_TOKEN
  const waba = process.env.WABA_BUSINESS_ACCOUNT_ID
  if (!token || !/^\d+$/.test(waba || '')) {
    throw new StatusException('WhatsApp is not set up on this server.', 503)
  }
  const response = await fetch(path.startsWith('http') ? path : whatsAppGraphUrl(path), {
    headers: { Authorization: 'Bearer ' + token },
    signal: AbortSignal.timeout(20000),
  }).catch(() => {
    throw new StatusException('The WhatsApp catalog could not be read. Try again.', 502)
  })
  const body = (await response.json().catch(() => ({}))) as { error?: { code?: number }; data?: any[] }
  if (!response.ok || body.error) {
    if (body.error?.code === 200 || response.status === 403) {
      throw new StatusException('This WhatsApp account cannot read its product catalog yet.', 403)
    }
    throw new StatusException('The WhatsApp catalog could not be read. Try again.', 502)
  }
  return body
}

/** Products on the WhatsApp account's linked catalog. Empty catalogs are an error, not a silent no-op. */
async function readWhatsAppCatalog(): Promise<
  Array<{ title: string; price: number; currency: string; description?: string; sku?: string; image?: string; stock?: number }>
> {
  const waba = process.env.WABA_BUSINESS_ACCOUNT_ID
  const catalogs = await graphGet(`${waba}/product_catalogs?fields=id,name,product_count`)
  const catalog = (catalogs.data || [])[0]
  if (!catalog?.id) throw new StatusException('No WhatsApp product catalog is linked to this account.', 404)
  const products: any[] = []
  let next: string | undefined = `${catalog.id}/products?fields=name,description,price,currency,retailer_id,image_url,quantity_to_sell_on_facebook&limit=100`
  for (let page = 0; page < 4 && next; page += 1) {
    const body = await graphGet(next)
    products.push(...(body.data || []))
    next = body.paging?.next
    if (products.length >= 200) break
  }
  const parsed = products.slice(0, 200).flatMap((product) => {
    const priced = catalogPrice(product.price, product.currency)
    const title = clean(product.name || product.title, 120)
    if (!priced || !title) return []
    const stock = Number(product.quantity_to_sell_on_facebook)
    return [
      {
        title,
        price: priced.price,
        currency: priced.currency,
        description: clean(product.description),
        sku: clean(product.retailer_id, 80),
        image: typeof product.image_url === 'string' ? product.image_url : undefined,
        stock: Number.isFinite(stock) && stock >= 0 ? stock : undefined,
      },
    ]
  })
  if (parsed.length === 0) throw new StatusException('The WhatsApp catalog has no products yet.', 404)
  return parsed
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
        `SELECT id, merchant_id, title, description, price, currency, category, images
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
      images?: string
    }>
    const left = inventoryService.stockLeft(rows.map((row) => row.id))
    return rows.map((row) => ({
      id: row.id,
      kind: 'goods' as const,
      merchantId: row.merchant_id,
      title: row.title,
      description: row.description || undefined,
      price: Number(row.price || 0),
      currency: row.currency || 'USD',
      category: row.category || undefined,
      image: firstCatalogImage(row.images),
      ...(left.has(row.id) ? { stockLeft: left.get(row.id) } : {}),
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
      reach: readReach(org.metadata),
      reviews: providerReviewService.summary(org.tenantId),
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

  /**
   * Copy the WhatsApp product catalog into the shop. A product already in the shop (same code, or
   * the same name when it has no code) is refreshed. Stock is recorded only the first time.
   */
  async importWhatsAppCatalog(userId: string, orgTenantId: string): Promise<{ imported: number; updated: number }> {
    this.assertManager(userId, orgTenantId)
    if (!this.availableModules(orgTenantId).has(GOODS_MODULE)) {
      throw new StatusException('Selling goods needs the "Shop and services" work area switched on in setup.', 400)
    }
    return this.pullWhatsAppCatalog(orgTenantId)
  }

  async pullWhatsAppCatalog(orgTenantId: string): Promise<{ imported: number; updated: number }> {
    const products = await readWhatsAppCatalog()
    return this.applyCatalogProducts(orgTenantId, products)
  }

  applyCatalogProducts(
    orgTenantId: string,
    products: Array<{
      title: string
      price: number
      currency?: string
      description?: string
      category?: string
      sku?: string
      image?: string
      stock?: number
    }>,
  ): { imported: number; updated: number } {
    const db = DatabaseManager.getDatabase()
    const rows = db
      .prepare(`SELECT id, title, sku FROM catalog_items WHERE merchant_id = ?`)
      .all(orgTenantId) as Array<{ id: string; title: string; sku: string | null }>
    let imported = 0
    let updated = 0
    for (const product of products) {
      const title = clean(product.title, 120)
      const price = Number(product.price)
      if (!title || !Number.isFinite(price) || price < 0) continue
      const sku = clean(product.sku, 80)
      const match = sku
        ? rows.find((row) => row.sku === sku) ||
          rows.find((row) => !row.sku && row.title.trim().toLowerCase() === title.toLowerCase())
        : rows.find((row) => row.title.trim().toLowerCase() === title.toLowerCase())
      const currency = clean(product.currency, 8)?.toUpperCase() || 'USD'
      const description = clean(product.description) ?? null
      const category = clean(product.category, 80) ?? null
      const image = product.image && /^https:\/\//i.test(product.image) ? JSON.stringify([product.image]) : undefined
      const now = new Date().toISOString()
      if (match) {
        db.prepare(
          `UPDATE catalog_items
              SET title = ?, description = ?, price = ?, currency = ?, sku = ?, category = ?, updated_at = ?,
                  images = COALESCE(?, images)
            WHERE id = ? AND merchant_id = ?`,
        ).run(title, description, price, currency, sku ?? match.sku, category, now, image ?? null, match.id, orgTenantId)
        match.title = title
        if (sku) match.sku = sku
        updated += 1
      } else {
        const itemId = `ITM-${randomUUID()}`
        db.prepare(
          `INSERT INTO catalog_items (id, merchant_id, title, description, images, price, currency, sku, category, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(itemId, orgTenantId, title, description, image ?? '[]', price, currency, sku ?? null, category, now, now)
        rows.push({ id: itemId, title, sku: sku ?? null })
        imported += 1
        if (product.stock !== undefined && Number.isFinite(Number(product.stock))) {
          inventoryService.setOpeningStock(orgTenantId, itemId, Number(product.stock))
        }
      }
    }
    return { imported, updated }
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
      reach: readReach(org.metadata),
      paymentRails: readReach(org.metadata).paymentMethods ?? this.paymentRails(org.id),
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
      const itemId = `ITM-${randomUUID()}`
      DatabaseManager.getDatabase()
        .prepare(
          `INSERT INTO catalog_items (id, merchant_id, title, description, images, price, currency, category, created_at, updated_at)
           VALUES (?, ?, ?, ?, '[]', ?, ?, ?, ?, ?)`,
        )
        .run(
          itemId,
          orgTenantId,
          title,
          clean(input.addGoods.description) ?? null,
          price,
          clean(input.addGoods.currency, 8)?.toUpperCase() || 'USD',
          clean(input.addGoods.category, 80) ?? null,
          now,
          now,
        )
      const stock = input.addGoods.stock
      if (stock !== undefined && stock !== null && Number.isFinite(Number(stock))) {
        inventoryService.setOpeningStock(orgTenantId, itemId, Number(stock))
      }
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

    if (input.reach || input.paymentRails) {
      const current = readReach(org.metadata)
      const reach = cleanReach({
        serviceAreas: input.reach?.serviceAreas ?? current.serviceAreas,
        hours: input.reach?.hours ?? current.hours,
        fulfilment: input.reach?.fulfilment ?? current.fulfilment,
        acceptingWork: input.reach?.acceptingWork ?? current.acceptingWork,
        // Saved on the public profile. The account's own payment methods stay as they are.
        paymentMethods: input.paymentRails ?? current.paymentMethods,
      })
      organizationRegistryRepository.updateOrganization(org.id, {
        metadata: { ...(org.metadata || {}), reach },
      })
    }

    if (input.isPublic !== undefined) this.setListed(orgTenantId, input.isPublic)

    this.refreshOwnRecords(this.requireOrg(orgTenantId))
    return this.ownerView(orgTenantId)
  }

  /**
   * Businesses that can take this request, best first.
   * A suspended business is never returned. A business that has said where it works,
   * how it is paid or how the work is done is left out when that does not fit.
   * One that has not said is kept, with that gap named.
   */
  match(request: MatchRequest): ProviderMatch[] {
    const limit = Math.min(Math.max(Number(request.limit) || 8, 1), 20)
    const fulfilment = (['call_out', 'delivery', 'collection'] as const).find((option) => option === request.fulfilment)
    const orgs = organizationRegistryRepository.listPublicOrganizations({ limit: 200 })
    const matches: ProviderMatch[] = []
    for (const org of orgs) {
      if (org.verificationStatus === 'suspended' || !org.isPublic || this.registrationWithdrawn(org.id)) continue
      let services: PublicService[] = []
      try {
        services = this.publishedServices(org)
      } catch {
        continue
      }
      const reach = readReach(org.metadata)
      let catalog: PublicGoodsItem[] = []
      try {
        catalog = this.goods(org.tenantId, 50)
      } catch {
        catalog = []
      }
      if (services.length === 0 && catalog.length === 0) continue
      const reviews = providerReviewService.summary(org.tenantId)
      const verdict = judgeProvider(
        {
          track: { finished: this.finishedCount(org.tenantId, org.id), reviewAverage: reviews.average, reviewCount: reviews.count },
          name: org.displayName,
          description: org.description,
          category: org.category,
          subCategory: org.subCategory,
          trustScore: Number(org.trustScore || 0),
          verified: org.verificationStatus === 'verified',
          reach,
          paymentRails: reach.paymentMethods?.length ? reach.paymentMethods : this.paymentRails(org.id),
          services: [
            ...services.map((service) => ({
              id: service.id,
              name: service.name,
              description: service.description,
              offeringKey: service.offeringKey,
            })),
            ...catalog.map((item) => ({
              id: item.id,
              name: item.title,
              description: item.description,
              offeringKey: 'goods',
            })),
          ],
        },
        {
          need: clean(request.need, 200),
          area: clean(request.area, 80),
          payment: clean(request.payment, 40)?.toLowerCase(),
          fulfilment: fulfilment as FulfilmentOption | undefined,
        },
      )
      if (!verdict.eligible) continue
      const offer = this.latestOffer(org.tenantId)
      matches.push({
        orgId: org.id,
        tenantId: org.tenantId,
        name: org.displayName,
        description: org.description,
        category: org.category,
        trustScore: Number(org.trustScore || 0),
        verificationStatus: org.verificationStatus,
        serviceId: verdict.serviceId,
        serviceName: verdict.serviceName,
        quoteServiceId: services.find((service) => service.offeringKey === 'ask_quote')?.id,
        score: verdict.score,
        reasons: verdict.reasons,
        unsure: verdict.unsure,
        standing: {
          configured: 'They say they do this.',
          verified: this.verifiedLine(org.id),
          live: 'Taking new work.',
        },
        ...(offer ? { offer } : {}),
        reviewAverage: reviews.average,
        reviewCount: reviews.count,
      })
    }
    matches.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    return matches.slice(0, limit)
  }

  /**
   * A revoked credential takes its badge with it, so a withdrawn registration stops the
   * business being offered. Matches the badge by holder DID and credential type.
   */
  withdrawBadgeForCredential(record: { holderDid?: string; credentialDefinitionId: string }): number {
    const badgeType = String(record.credentialDefinitionId || '').split('_')[0]
    if (!record.holderDid || !badgeType) return 0
    try {
      const db = DatabaseManager.getDatabase()
      const org = db.prepare(`SELECT id FROM organization_registry WHERE issuer_did = ? LIMIT 1`).get(record.holderDid) as
        | { id: string }
        | undefined
      if (!org) return 0
      return db
        .prepare(`UPDATE org_trust_badges SET revoked = 1, revoked_at = ? WHERE org_id = ? AND badge_type = ? AND COALESCE(revoked, 0) = 0`)
        .run(new Date().toISOString(), org.id, badgeType).changes
    } catch {
      return 0
    }
  }

  /** True when the business's registration badge was revoked or its credential has expired, and none is in force. */
  private registrationWithdrawn(orgId: string): boolean {
    try {
      const row = DatabaseManager.getDatabase()
        .prepare(
          `SELECT SUM(CASE WHEN COALESCE(revoked, 0) = 1 THEN 1 ELSE 0 END) AS gone,
                  SUM(CASE WHEN COALESCE(revoked, 0) = 0 THEN 1 ELSE 0 END) AS live
             FROM org_trust_badges WHERE org_id = ? AND badge_type = 'RegistrationVC'`,
        )
        .get(orgId) as { gone: number | null; live: number | null } | undefined
      if (Number(row?.gone || 0) > 0 && Number(row?.live || 0) === 0) return true
      return this.registrationExpired(orgId)
    } catch {
      return false
    }
  }

  /** A registration row that is not revoked still fails when the issued credential is expired or revoked. */
  private registrationExpired(orgId: string): boolean {
    try {
      const rows = DatabaseManager.getDatabase()
        .prepare(
          `SELECT vc_log_id FROM org_trust_badges
            WHERE org_id = ? AND badge_type = 'RegistrationVC' AND COALESCE(revoked, 0) = 0`,
        )
        .all(orgId) as Array<{ vc_log_id: string | null }>
      if (rows.length === 0) return false
      return rows.every((row) => {
        const force = this.credentialInForce(row.vc_log_id)
        return force === 'expired' || force === 'revoked'
      })
    } catch {
      return false
    }
  }

  /**
   * Whether the credential linked from a badge is still in force.
   * Reads the same issued-credential row as CredentialLifecycleService.checkRecord:
   * revoked, or an expirationDate that has passed. An offer that was never issued is not a failure.
   */
  private credentialInForce(reference: string | null): 'valid' | 'expired' | 'revoked' | 'offered' | 'unknown' {
    if (!reference) return 'offered'
    try {
      const row = DatabaseManager.getDatabase()
        .prepare(`SELECT revoked, credential_data FROM issued_credentials WHERE credential_id = ? OR id = ? LIMIT 1`)
        .get(reference, reference) as { revoked: number; credential_data: string } | undefined
      if (!row) return 'offered'
      if (row.revoked) return 'revoked'
      const doc = JSON.parse(String(row.credential_data || '{}'))
      const expirationDate = typeof doc?.expirationDate === 'string' ? doc.expirationDate : undefined
      if (expirationDate && new Date(expirationDate).getTime() < Date.now()) return 'expired'
      return 'valid'
    } catch {
      return 'unknown'
    }
  }

  /** The business's own record of what it configured. A registrar's credential is a different fact. */
  private static readonly OWN_RECORD_TYPES = new Set(['ServiceCapability', 'PaymentCapability', 'DeliveryCapability'])

  /** Plain words for a credential that is still in force. An offer that was never issued does not count. */
  private verifiedLine(orgId: string): string {
    try {
      const rows = DatabaseManager.getDatabase()
        .prepare(
          `SELECT badge_type, label, vc_log_id FROM org_trust_badges
            WHERE org_id = ? AND COALESCE(revoked, 0) = 0`,
        )
        .all(orgId) as Array<{ badge_type: string; label: string; vc_log_id: string | null }>
      const valid = rows.filter((row) => this.credentialInForce(row.vc_log_id) === 'valid')
      const checked = valid.filter((row) => !OrgOfferingsService.OWN_RECORD_TYPES.has(row.badge_type))
      if (checked.length > 0) return `Checked: ${checked.map((row) => row.label).join(', ')}.`
      const own = valid.filter((row) => OrgOfferingsService.OWN_RECORD_TYPES.has(row.badge_type))
      if (own.length > 0) return `Their record covers: ${own.map((row) => row.label).join(', ')}.`
    } catch {
      // This database has no badge link to a credential.
    }
    return 'Not checked with a credential yet.'
  }

  /** The latest offer this business saved. The words only; nobody is named and nobody is messaged. */
  private latestOffer(orgTenantId: string): string | undefined {
    try {
      const row = DatabaseManager.getDatabase()
        .prepare(`SELECT body FROM broadcasts WHERE org_tenant_id = ? ORDER BY created_at DESC LIMIT 1`)
        .get(orgTenantId) as { body?: string } | undefined
      const text = String(row?.body || '').trim()
      return text || undefined
    } catch {
      return undefined
    }
  }

  /**
   * Write the business's own record of what it offers, how it is paid and how the work is done.
   * This is the business saying so in a credential, not a registrar's check.
   * Saving the profile still succeeds when the record cannot be written.
   */
  refreshOwnRecords(org: OrganizationRegistry): void {
    try {
      if (!org.issuerDid) return
      const services = this.publishedServices(org)
        .map((service) => service.name)
        .filter(Boolean)
        .sort()
      const reach = readReach(org.metadata)
      const pieces = [
        services.length ? { type: 'ServiceCapability', label: 'what they offer', summary: services.join(', ') } : undefined,
        reach.paymentMethods?.length
          ? { type: 'PaymentCapability', label: 'how they get paid', summary: [...reach.paymentMethods].sort().join(', ') }
          : undefined,
        reach.fulfilment?.length
          ? { type: 'DeliveryCapability', label: 'how the work is done', summary: [...reach.fulfilment].sort().join(', ') }
          : undefined,
      ].filter((piece): piece is { type: string; label: string; summary: string } => !!piece)
      for (const piece of pieces) this.keepCapability(org, piece)
    } catch {
      // The profile is already saved.
    }
  }

  private keepCapability(org: OrganizationRegistry, piece: { type: string; label: string; summary: string }): void {
    const db = DatabaseManager.getDatabase()
    const current = db
      .prepare(
        `SELECT id, vc_log_id FROM org_trust_badges WHERE org_id = ? AND badge_type = ? AND COALESCE(revoked, 0) = 0`,
      )
      .all(org.id, piece.type) as Array<{ id: string; vc_log_id: string | null }>
    if (current.some((row) => this.capabilitySummary(row.vc_log_id) === piece.summary && this.credentialInForce(row.vc_log_id) === 'valid')) {
      return
    }
    const now = new Date().toISOString()
    for (const row of current) {
      db.prepare(`UPDATE org_trust_badges SET revoked = 1, revoked_at = ? WHERE id = ?`).run(now, row.id)
      if (!row.vc_log_id) continue
      try {
        db.prepare(`UPDATE issued_credentials SET revoked = 1 WHERE credential_id = ? OR id = ?`).run(row.vc_log_id, row.vc_log_id)
      } catch {
        // No issued-credential register in this database.
      }
    }
    const credentialId = `cap-${randomUUID()}`
    const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
    credentialLifecycleService.registerIssued({
      issuanceSessionId: credentialId,
      tenantId: org.tenantId,
      issuerDid: org.issuerDid || '',
      credentialId,
      holderDid: org.issuerDid,
      credentialDefinitionId: piece.type,
      format: 'jwt_vc_json',
      credentialData: {
        type: ['VerifiableCredential', piece.type],
        expirationDate: expires,
        credentialSubject: { id: org.issuerDid, summary: piece.summary },
      },
    })
    db.prepare(
      `INSERT INTO org_trust_badges (id, org_id, tenant_id, badge_type, label, vc_log_id, revoked, issued_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
    ).run(randomUUID(), org.id, org.tenantId, piece.type, piece.label, credentialId, now)
  }

  private capabilitySummary(reference: string | null): string | undefined {
    if (!reference) return undefined
    try {
      const row = DatabaseManager.getDatabase()
        .prepare(`SELECT credential_data FROM issued_credentials WHERE credential_id = ? OR id = ? LIMIT 1`)
        .get(reference, reference) as { credential_data?: string } | undefined
      const doc = JSON.parse(String(row?.credential_data || '{}'))
      const summary = doc?.credentialSubject?.summary
      return typeof summary === 'string' ? summary : undefined
    } catch {
      return undefined
    }
  }

  /** Paid bills and finished requests for this business. Zero when the tables are not there. */
  private finishedCount(orgTenantId: string, orgId: string): number {
    let db: ReturnType<typeof DatabaseManager.getDatabase>
    try {
      db = DatabaseManager.getDatabase()
    } catch {
      return 0
    }
    let total = 0
    try {
      const paid = db
        .prepare(`SELECT COUNT(*) AS n FROM payment_links WHERE status = 'paid' AND merchant_id IN (?, ?)`)
        .get(orgTenantId, orgId) as { n: number }
      total += Number(paid?.n || 0)
    } catch {
      // No payment links yet.
    }
    try {
      const done = db
        .prepare(`SELECT COUNT(*) AS n FROM workflow_requests WHERE status = 'fulfilled' AND target_org_tenant_id = ?`)
        .get(orgTenantId) as { n: number }
      total += Number(done?.n || 0)
    } catch {
      // No requests yet.
    }
    return total
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
