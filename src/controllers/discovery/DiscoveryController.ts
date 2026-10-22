/**
 * Public discovery: organisations that chose to be found, what they offer, and their storefront.
 *
 * Read-only and unauthenticated, like the public checkout routes. Everything comes from the
 * organisation registry and service catalogue the organisation already maintains; a request to
 * one of these organisations goes through `POST /workflow-requests` with `targetOrgTenantId`.
 */
import { Controller, Get, Path, Query, Route, Tags } from 'tsoa'

import { StatusException } from '../../errors/StatusException'
import {
  organizationRegistryRepository,
  type OrganizationCategory,
  type OrganizationRegistry,
} from '../../persistence/OrganizationRegistryRepository'
import {
  orgOfferingsService,
  type PublicGoodsItem,
  type PublicService,
  type PublicStorefront,
} from '../../services/OrgOfferingsService'

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
  /** Services people can ask for or book. */
  availableServices: number
  /** Products for sale in the shop; 0 when the organisation does not sell goods. */
  goodsCount: number
}

export type DiscoveryService = PublicService
export type DiscoveryCatalogItem = PublicGoodsItem

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

export type DiscoveryStorefront = PublicStorefront

function toSummary(org: OrganizationRegistry): DiscoveryOrganizationSummary {
  return {
    id: org.id,
    tenantId: org.tenantId,
    name: org.displayName,
    description: org.description,
    logo: org.logoUrl,
    category: org.category,
    trustScore: Number(org.trustScore || 0),
    verificationStatus: org.verificationStatus,
    availableServices: orgOfferingsService.publishedServices(org).length,
    goodsCount: orgOfferingsService.goods(org.tenantId).length,
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
    return orgs.filter((org) => orgOfferingsService.isDiscoverable(org)).map(toSummary)
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
    return orgs.filter((org) => orgOfferingsService.isDiscoverable(org)).map(toSummary)
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
      services: orgOfferingsService.publishedServices(org),
    }
  }

  /** The organisation's storefront: services it offers, goods it sells, badges and how it takes payment. */
  @Get('organizations/{id}/storefront')
  public async getStorefront(@Path() id: string): Promise<DiscoveryStorefront> {
    return orgOfferingsService.storefront(this.resolvePublicOrganization(id))
  }

  /** A listed organisation by registry id or tenant id. Unlisted organisations, or ones with nothing to show, are not found here. */
  private resolvePublicOrganization(id: string): OrganizationRegistry {
    const key = String(id || '').trim()
    const org =
      organizationRegistryRepository.findOrganizationById(key) ||
      organizationRegistryRepository.findOrganizationByTenantId(key)
    if (!org || !orgOfferingsService.isDiscoverable(org)) {
      this.setStatus(404)
      throw new StatusException('Organisation not found', 404)
    }
    return org
  }
}
