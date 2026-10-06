/* eslint-disable no-console */
import type { Request as ExRequest } from 'express'

import { Agent } from '@credo-ts/core'
import { randomUUID, createHash } from 'crypto'
import { Controller, Post, Get, Route, Tags, Body, Path, Query, Request, Security } from 'tsoa'
import { container } from 'tsyringe'

import { SCOPES } from '../../enums'
import { StatusException } from '../../errors'
import { inventoryService } from '../../services/InventoryService'
import {
  orgWorkflowActorService,
  type OrgMemberActor,
  type WorkflowActorDefaultRecord,
} from '../../services/OrgWorkflowActorService'

interface WorkflowActorDefaultBody {
  workflowType: string
  stageAction: string
  defaultUserId?: string
  defaultRole?: string
  defaultWalletTenantId?: string
  enabled?: boolean
}

interface CartItem {
  id: string
  name: string
  price: number
  quantity: number
}

interface CartSnapshotRequest {
  cartId: string
  items: CartItem[]
  totalAmount: number
  currency: string
  merchantDid?: string
}

interface InvoiceRequest {
  cartRef: string
  amount: number
  currency: string
  dueDate?: string
}

@Route('api/finance')
@Tags('Finance & E-Commerce')
export class FinanceController extends Controller {
  /**
   * Issue a CartSnapshotVC for the current shopping cart.
   * This provides a verifiable record of what the user intends to purchase.
   */
  @Post('cart/{cartId}/issue-snapshot')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async issueCartSnapshot(
    @Path() cartId: string,
    @Body() body: CartSnapshotRequest,
    @Request() request: ExRequest,
  ): Promise<any> {
    const agent = container.resolve(Agent)
    const tenantAgent = request.agent as any
    const tenantId = (request as any).user?.tenantId

    // In Phase 1, we use the custom-oidc issuer flow
    const issuerApiUrl = process.env.ISSUER_API_URL || 'http://localhost:3000'

    try {
      // Use x-api-key header for API key authentication (issuer expects this)
      const apiKey = process.env.ISSUER_API_KEY || 'test-api-key-12345'
      const response = await fetch(`${issuerApiUrl}/custom-oidc/issuer/credential-offers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          credentials: [
            {
              credentialDefinitionId: 'CartSnapshotVC',
              format: 'jwt_vc_json',
              type: ['VerifiableCredential', 'CartSnapshotVC'],
              claims: {
                cartId: body.cartId,
                items: body.items,
                totalAmount: body.totalAmount,
                currency: body.currency,
                merchantDid: body.merchantDid || 'did:example:merchant',
                timestamp: new Date().toISOString(),
              },
            },
          ],
        }),
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Failed to create offer: ${error}`)
      }

      return await response.json()
    } catch (error: any) {
      this.setStatus(500)
      return { error: error.message }
    }
  }

  /**
   * Issue an InvoiceVC based on a cart reference.
   */
  @Post('invoices/issue')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async issueInvoice(@Body() body: InvoiceRequest, @Request() request: ExRequest): Promise<any> {
    const issuerApiUrl = process.env.ISSUER_API_URL || 'http://localhost:3000'
    const invoiceId = `INV-${randomUUID().substring(0, 8)}`

    try {
      // Use x-api-key header for API key authentication (issuer expects this)
      const apiKey = process.env.ISSUER_API_KEY || 'test-api-key-12345'
      const response = await fetch(`${issuerApiUrl}/custom-oidc/issuer/credential-offers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          credentials: [
            {
              credentialDefinitionId: 'InvoiceVC',
              format: 'jwt_vc_json',
              type: ['VerifiableCredential', 'InvoiceVC'],
              claims: {
                invoiceId,
                cartRef: body.cartRef,
                amount: body.amount,
                currency: body.currency,
                dueDate: body.dueDate || new Date(Date.now() + 86400000).toISOString(),
                timestamp: new Date().toISOString(),
              },
            },
          ],
        }),
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Failed to create offer: ${error}`)
      }

      return await response.json()
    } catch (error: any) {
      this.setStatus(500)
      return { error: error.message }
    }
  }

  /**
   * Legacy list of stage-actor defaults.
   *
   * Current mobile and portal clients use
   * `GET /api/organizations/{orgTenantId}/workflows/actors` instead. This route stays
   * so older app builds keep working; it can be removed once those builds are gone.
   */
  @Get('ap/workflow-actors/defaults')
  @Security('jwt')
  public async listWorkflowActorDefaults(
    @Request() request: ExRequest,
    @Query() workflowType?: string,
  ): Promise<{ defaults: WorkflowActorDefaultRecord[]; members: OrgMemberActor[] }> {
    const orgTenantId = String((request as any).user?.tenantId || '').trim()
    if (!orgTenantId) {
      throw new StatusException('Organization context required', 403)
    }
    return {
      defaults: orgWorkflowActorService.listDefaults(orgTenantId, workflowType),
      members: orgWorkflowActorService.listOrgMembers(orgTenantId),
    }
  }

  /**
   * Legacy save for one stage-actor default.
   * Current clients use `PUT /api/organizations/{orgTenantId}/workflows/actors/defaults`.
   */
  @Post('ap/workflow-actors/defaults')
  @Security('jwt')
  public async saveWorkflowActorDefault(
    @Request() request: ExRequest,
    @Body() body: WorkflowActorDefaultBody,
  ): Promise<WorkflowActorDefaultRecord> {
    const orgTenantId = String((request as any).user?.tenantId || '').trim()
    if (!orgTenantId) {
      throw new StatusException('Organization context required', 403)
    }
    if (!body?.workflowType || !body?.stageAction) {
      throw new StatusException('workflowType and stageAction are required', 400)
    }
    return orgWorkflowActorService.upsertDefault({
      orgTenantId,
      workflowType: body.workflowType,
      stageAction: body.stageAction,
      defaultUserId: body.defaultUserId,
      defaultRole: body.defaultRole,
      defaultWalletTenantId: body.defaultWalletTenantId,
      enabled: body.enabled,
    })
  }

  /**
   * Issue a ReceiptVC after payment is confirmed.
   */
  @Post('receipts/issue')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async issueReceipt(
    @Body()
    body: {
      invoiceRef: string
      cartId?: string
      amount: number
      currency: string
      transactionId: string
      payerPhone?: string
    },
    @Request() request: ExRequest,
  ): Promise<any> {
    const normalizedPhone = body.payerPhone
      ? body.payerPhone.replace(/\D/g, '').replace(/^0(\d{9})$/, '263$1')
      : undefined
    const subjectHash = normalizedPhone
      ? createHash('sha256').update(normalizedPhone.trim().toLowerCase()).digest('hex')
      : undefined
    const issuerApiUrl = process.env.ISSUER_API_URL || 'http://localhost:3000'
    const tenantId = (request as any).user?.tenantId || 'default'
    const receiptId = `RCP-${randomUUID().substring(0, 8)}`
    let inventoryAllocations: any[] = []

    try {
      // Phase 7C: Fulfill inventory
      try {
        const cartIdToUse = body.cartId || body.invoiceRef
        const result = await inventoryService.fulfillSale({
          tenantId,
          cartId: cartIdToUse,
          receiptId: receiptId,
          actorId: 'finance-controller',
        })

        if (result && result.events) {
          inventoryAllocations = await Promise.all(
            result.events.map(async (e) => {
              const lot = e.lotId ? await inventoryService.getLot(e.lotId) : null
              return {
                itemId: e.catalogItemId,
                lotNumber: lot?.lotNumber,
                serialNumber: lot?.serialNumber,
                quantity: Math.abs(e.quantity),
              }
            }),
          )
        }
      } catch (e: any) {
        console.warn(`[Finance] Inventory fulfillment failed: ${e.message}`)
      }

      // Use x-api-key header for API key authentication (issuer expects this)
      const apiKey = process.env.ISSUER_API_KEY || 'test-api-key-12345'
      const response = await fetch(`${issuerApiUrl}/custom-oidc/issuer/credential-offers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          credentials: [
            {
              credentialDefinitionId: 'ReceiptVC',
              format: 'jwt_vc_json',
              type: ['VerifiableCredential', 'ReceiptVC'],
              claims: {
                receiptId,
                invoiceRef: body.invoiceRef,
                amount: body.amount,
                currency: body.currency,
                payerPhone: body.payerPhone,
                subjectHash,
                transactionId: body.transactionId,
                timestamp: new Date().toISOString(),
                inventoryAllocations: inventoryAllocations.length > 0 ? inventoryAllocations : undefined,
              },
            },
          ],
        }),
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Failed to create offer: ${error}`)
      }

      return await response.json()
    } catch (error: any) {
      this.setStatus(500)
      return { error: error.message }
    }
  }
}
