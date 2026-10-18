/**
 * Public discovery: organisations that chose to be found, what they offer, and their storefront.
 *
 * Read-only and unauthenticated, like the public checkout routes. Everything comes from the
 * organisation registry and service catalogue the organisation already maintains; a request to
 * one of these organisations goes through `POST /workflow-requests` with `targetOrgTenantId`.
 */
import { Controller, Get, Path, Query, Route, Tags } from 'tsoa'

import { StatusException } from '../../errors/StatusException'
import { DatabaseManager } from '../../persistence/DatabaseManager'
import {
  organizationRegistryRepository,
  type OrganizationCategory,
  type OrganizationRegistry,
  type ServiceCatalogEntry,
} from '../../persistence/OrganizationRegistryRepository'

/** One row of the Discover list. */
export interface DiscoveryOrganizationSummary {
  id: string
  tenantId: string
  name: string
  description?: string
  logo?: string
  category: string
  trustScore: number
  verificationStatus: string
  availableServices: number
}

export interface DiscoveryService {
  id: string
  name: string
  description?: string
  vcType?: string
  workflowTemplateId?: string
  requirements: string[]
  turnaroundTime?: string
  feeAmount: number
  feeCurrency: string
  requestSchema: Record<string, unknown>
}

export interface DiscoveryCatalogItem {
  id: string
  merchantId: string
  title: string
  description?: string
  price: number
  currency: string
  category?: string
}

export interface DiscoveryOrganizationProfile {
  org: {
    id: string
    tenantId: string
    displayName: string
    description?: string
    logoUrl?: string
    category: string
    trustScore: number
    verificationStatus: string
    issuerDid: string
    website?: string
    contactPhone?: string
    contactEmail?: string
    address?: string
  }
  services: DiscoveryService[]
}

export interface DiscoveryStorefront {
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
  trustBadges: Array<{ type: string; label: string; issuedAt: string; revoked: boolean }>
  services: DiscoveryService[]
  catalogItems: DiscoveryCatalogItem[]
  paymentRails: string[]
  contactLinks: { phone?: string | null; email?: string | null; website?: string | null }
  shopUrl?: string
}

function toService(entry: ServiceCatalogEntry): DiscoveryService {
  return {
    id: entry.id,
    name: entry.name,
    description: entry.description,
    vcType: entry.vcType,
    workflowTemplateId: entry.workflowTemplateId,
    requirements: entry.requirements || [],
    turnaroundTime: entry.turnaroundTime,
    feeAmount: Number(entry.feeAmount || 0),
    feeCurrency: entry.feeCurrency || 'USD',
    requestSchema: (entry as any).requestSchema || {},
  }
}

function toSummary(org: OrganizationRegistry, serviceCount: number): DiscoveryOrganizationSummary {
  return {
    id: org.id,
    tenantId: org.tenantId,
    name: org.displayName,
    description: org.description,
    logo: org.logoUrl,
    category: org.category,
    trustScore: Number(org.trustScore || 0),
    verificationStatus: org.verificationStatus,
    availableServices: serviceCount,
  }
}

@Route('api/discovery')
@Tags('Discovery')
export class DiscoveryController extends Controller {
  /** Organisations that chose to be found, best-trusted first. */
  @Get('organizations')
  public async listOrganizations(
    @Query() category?: string,
    @Query() verifiedOnly?: boolean,
    @Query() limit?: number,
  ): Promise<DiscoveryOrganizationSummary[]> {
    const orgs = organizationRegistryRepository.listPublicOrganizations({
      category: category ? (category as OrganizationCategory) : undefined,
      verifiedOnly: Boolean(verifiedOnly),
      limit: limit ? Math.min(Math.max(Number(limit), 1), 100) : 50,
    })
    return orgs.map((org) => toSummary(org, organizationRegistryRepository.listServicesByOrganization(org.id).length))
  }

  /** Search those organisations by name, description or category. */
  @Get('search')
  public async search(@Query() q: string, @Query() category?: string): Promise<DiscoveryOrganizationSummary[]> {
    const query = String(q || '').trim()
    if (!query) return []
    const orgs = organizationRegistryRepository.searchOrganizations(query, {
      publicOnly: true,
      category: category ? (category as OrganizationCategory) : undefined,
      limit: 30,
    })
    return orgs.map((org) => toSummary(org, organizationRegistryRepository.listServicesByOrganization(org.id).length))
  }

  /** One organisation and the services it offers. Accepts the registry id or the tenant id. */
  @Get('organizations/{id}')
  public async getOrganization(@Path() id: string): Promise<DiscoveryOrganizationProfile> {
    const org = this.resolvePublicOrganization(id)
    return {
      org: {
        id: org.id,
        tenantId: org.tenantId,
        displayName: org.displayName,
        description: org.description,
        logoUrl: org.logoUrl,
        category: org.category,
        trustScore: Number(org.trustScore || 0),
        verificationStatus: org.verificationStatus,
        issuerDid: org.issuerDid,
        website: org.website,
        contactPhone: org.contactPhone,
        contactEmail: org.contactEmail,
        address: org.address,
      },
      services: organizationRegistryRepository.listServicesByOrganization(org.id).map(toService),
    }
  }

  /** The organisation's storefront: services, products for sale, and how it takes payment. */
  @Get('organizations/{id}/storefront')
  public async getStorefront(@Path() id: string): Promise<DiscoveryStorefront> {
    const org = this.resolvePublicOrganization(id)
    const db = DatabaseManager.getDatabase()
    const rails = db.prepare(`SELECT payment_rails FROM organization_registry WHERE id = ? LIMIT 1`).get(org.id) as
      | { payment_rails?: string }
      | undefined
    let paymentRails: string[] = []
    try {
      const parsed = JSON.parse(rails?.payment_rails || '[]')
      if (Array.isArray(parsed)) paymentRails = parsed.map((value) => String(value))
    } catch {
      paymentRails = []
    }
    const catalogRows = db
      .prepare(
        `SELECT id, merchant_id, title, description, price, currency, category
           FROM catalog_items WHERE merchant_id = ? ORDER BY created_at DESC LIMIT 200`,
      )
      .all(org.tenantId) as Array<{
      id: string
      merchant_id: string
      title: string
      description?: string
      price: number
      currency: string
      category?: string
    }>

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
      trustBadges:
        org.verificationStatus === 'verified'
          ? [
              {
                type: 'verified',
                label: 'Verified organisation',
                issuedAt: org.updatedAt.toISOString(),
                revoked: false,
              },
            ]
          : [],
      services: organizationRegistryRepository.listServicesByOrganization(org.id).map(toService),
      catalogItems: catalogRows.map((row) => ({
        id: row.id,
        merchantId: row.merchant_id,
        title: row.title,
        description: row.description || undefined,
        price: Number(row.price || 0),
        currency: row.currency || 'USD',
        category: row.category || undefined,
      })),
      paymentRails,
      contactLinks: { phone: org.contactPhone || null, email: org.contactEmail || null, website: org.website || null },
      shopUrl: catalogRows.length > 0 ? `/shop?orgId=${encodeURIComponent(org.id)}` : undefined,
    }
  }

  /** A listed organisation by registry id or tenant id. Unlisted organisations are not found here. */
  private resolvePublicOrganization(id: string): OrganizationRegistry {
    const key = String(id || '').trim()
    const org =
      organizationRegistryRepository.findOrganizationById(key) ||
      organizationRegistryRepository.findOrganizationByTenantId(key)
    if (!org || !org.isPublic) {
      this.setStatus(404)
      throw new StatusException('Organisation not found', 404)
    }
    return org
  }
}
