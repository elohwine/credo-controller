import type { BooksFiscalStatus, FiscalDocumentView } from '../../services/integrations/BooksFiscalService'
import type { Request as ExRequest } from 'express'

import { Body, Controller, Get, Path, Post, Query, Request, Route, Security, Tags } from 'tsoa'

import { SCOPES } from '../../enums'
import { StatusException } from '../../errors'
import { DatabaseManager } from '../../persistence/DatabaseManager'
import { getBooksFiscalService } from '../../services/integrations/BooksFiscalService'

interface TaxpayerProfile {
  taxpayerName?: string
  tin?: string
  vatNumber?: string
  isVatPayer?: boolean
}

interface FiscalDeviceInput {
  deviceId: number
  serialNo: string
  label?: string
  environment?: 'simulator' | 'test' | 'production'
  activationKey?: string
}

interface ZohoImport {
  kind: 'invoice' | 'creditnote'
  documentId: string
}

/**
 * This organisation's own books and fiscalisation. Zoho Books is connected here.
 * Fiscal receipts are signed and sent to ZIMRA from here. A neighbouring app is not involved.
 */
@Route('api/organizations/books-fiscal')
@Tags('Books and fiscal')
export class BooksFiscalController extends Controller {
  @Get('/')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public status(@Request() request: ExRequest): BooksFiscalStatus {
    return getBooksFiscalService().status(this.requireAdmin(request))
  }

  /** Browser URL that asks the organisation to approve Zoho Books access. */
  @Post('/zoho/start')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public startZoho(@Request() request: ExRequest): { url: string } {
    return getBooksFiscalService().startZoho(this.requireAdmin(request))
  }

  /** Zoho redirects the browser here. No wallet session is required. */
  @Get('/zoho/callback')
  public async zohoCallback(
    @Request() request: ExRequest,
    @Query() code?: string,
    @Query() state?: string,
    @Query() error?: string,
    @Query('accounts-server') accountsServer?: string,
  ): Promise<void> {
    const location = await getBooksFiscalService().finishZoho({ code, state, error, accountsServer })
    const response = (request as ExRequest & { res?: { redirect: (code: number, url: string) => void } }).res
    response?.redirect(302, location)
  }

  @Post('/zoho/organisation')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async selectZoho(
    @Request() request: ExRequest,
    @Body() body: { organisationId: string },
  ): Promise<BooksFiscalStatus> {
    return getBooksFiscalService().selectZohoOrganisation(this.requireAdmin(request), body.organisationId)
  }

  @Post('/profile')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public saveProfile(@Request() request: ExRequest, @Body() body: TaxpayerProfile): BooksFiscalStatus {
    return getBooksFiscalService().saveProfile(this.requireAdmin(request), body)
  }

  @Post('/device')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public addDevice(@Request() request: ExRequest, @Body() body: FiscalDeviceInput): BooksFiscalStatus {
    return getBooksFiscalService().addDevice(this.requireAdmin(request), body)
  }

  @Post('/device/register')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async registerDevice(@Request() request: ExRequest): Promise<BooksFiscalStatus> {
    return getBooksFiscalService().registerDevice(this.requireAdmin(request))
  }

  @Post('/device/open-day')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async openDay(@Request() request: ExRequest): Promise<BooksFiscalStatus> {
    return getBooksFiscalService().openDay(this.requireAdmin(request))
  }

  @Post('/device/close-day')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async closeDay(@Request() request: ExRequest): Promise<BooksFiscalStatus> {
    return getBooksFiscalService().closeDay(this.requireAdmin(request))
  }

  @Get('/zoho/documents')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async listZoho(
    @Request() request: ExRequest,
    @Query() kind?: 'invoice' | 'creditnote',
  ) {
    return { documents: await getBooksFiscalService().listZoho(this.requireAdmin(request), kind === 'creditnote' ? 'creditnote' : 'invoice') }
  }

  @Post('/documents')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async importZoho(@Request() request: ExRequest, @Body() body: ZohoImport): Promise<FiscalDocumentView> {
    return getBooksFiscalService().importZoho(this.requireAdmin(request), body.kind, body.documentId)
  }

  @Post('/documents/{documentId}/fiscalise')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async fiscalise(@Request() request: ExRequest, @Path() documentId: string): Promise<FiscalDocumentView> {
    return getBooksFiscalService().fiscalise(this.requireAdmin(request), documentId)
  }

  private requireAdmin(request: ExRequest): string {
    const orgTenantId = String((request as any)?.user?.tenantId || '').trim()
    if (!orgTenantId) throw new StatusException('Organization context required', 401)
    const db = DatabaseManager.getDatabase()
    if (!db.prepare(`SELECT 1 FROM organizations WHERE tenant_id = ? AND status = 'active' LIMIT 1`).get(orgTenantId)) {
      throw new StatusException('Organization context required', 403)
    }
    const userId = String((request as any)?.user?.id || '').trim()
    if (!userId) throw new StatusException('Authenticated organization member required', 401)
    const membership = db
      .prepare(`SELECT role FROM org_memberships WHERE user_id = ? AND org_tenant_id = ? AND status = 'active' LIMIT 1`)
      .get(userId, orgTenantId) as { role?: string } | undefined
    if (!['owner', 'admin'].includes(String(membership?.role || '').toLowerCase())) {
      throw new StatusException('Only owners or admins can manage books and fiscalisation', 403)
    }
    return orgTenantId
  }
}
