import 'reflect-metadata'
import { Controller, Get, Path, Query, Route, Tags } from 'tsoa'

import { StatusException } from '../../errors'
import { DatabaseManager } from '../../persistence/DatabaseManager'
import { orgBrandService, type OrgBrandView } from '../../services/OrgBrandService'

/** The brand an organisation puts on its documents, checkout and shop. Public: it is printed on every invoice. */
@Route('api/public/orgs')
@Tags('Public')
export class PublicOrgBrandController extends Controller {
  /**
   * The organisation's brand. Pass `at` (an ISO time, usually when a document was issued)
   * to get the brand as it stood then.
   */
  @Get('/{orgTenantId}/brand')
  public async getBrand(@Path() orgTenantId: string, @Query() at?: string): Promise<OrgBrandView> {
    const db = DatabaseManager.getDatabase()
    const known =
      db.prepare(`SELECT 1 FROM organization_registry WHERE tenant_id = ? LIMIT 1`).get(orgTenantId) ||
      db.prepare(`SELECT 1 FROM organizations WHERE tenant_id = ? LIMIT 1`).get(orgTenantId) ||
      db.prepare(`SELECT 1 FROM org_brand_versions WHERE org_tenant_id = ? LIMIT 1`).get(orgTenantId)
    if (!known) {
      this.setStatus(404)
      throw new StatusException('Organisation not found', 404)
    }
    this.setHeader('Cache-Control', 'public, max-age=60')
    return orgBrandService.at(orgTenantId, at)
  }
}
