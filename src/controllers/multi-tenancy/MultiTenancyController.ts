import type { TenantPersistenceRecord } from '../../persistence/TenantRepository'
import type { TenantRecord } from '@credo-ts/tenants'

import { Agent, JsonTransformer, injectable, RecordNotFoundError } from '@credo-ts/core'
import { Request as Req } from 'express'
import jwt from 'jsonwebtoken'
import { Body, Controller, Delete, Post, Route, Tags, Path, Security, Request, Res, TsoaResponse, Get } from 'tsoa'

import { AgentRole, SCOPES } from '../../enums'
import ErrorHandlingService from '../../errorHandlingService'
import { CreateTenantOptions, CreateTenantResponse, TenantMetadataResponse } from '../types'
import { provisionTenantResources } from '../../services/TenantProvisioningService'
import { getTenantById } from '../../persistence/TenantRepository'

import { listTenants as listPersistenceTenants } from '../../persistence/TenantRepository'

@Tags('MultiTenancy')
@Security('jwt', [SCOPES.MULTITENANT_BASE_AGENT])
@Route('/multi-tenancy')
@injectable()
export class MultiTenancyController extends Controller {
  @Get('/')
  public async listTenants(@Request() request: Req) {
    try {
      const agent = request.agent as unknown as Agent<any>

      // Get tenants from Credo module
      const credoTenants = await agent.modules.tenants.getAllTenants()

      // Get tenants from persistence
      const persistenceTenants = listPersistenceTenants()

      // Combine them: for each credo tenant, attach persistence metadata if available
      return credoTenants.map((ct: any) => {
        const pt = persistenceTenants.find(p => p.id === ct.id)
        const tenantJson = JsonTransformer.toJSON(ct) as Record<string, any>
        return {
          ...tenantJson,
          id: ct.id,
          label: ct.config?.label,
          persistence: pt ? {
            issuerDid: pt.issuerDid,
            verifierDid: pt.verifierDid,
            verifierKid: pt.verifierKid,
            metadata: pt.metadata
          } : undefined
        }
      })
    } catch (error) {
      throw ErrorHandlingService.handle(error)
    }
  }

  @Post('/create-tenant')
  public async createTenant(
    @Request() request: Req,
    @Body() createTenantOptions: CreateTenantOptions,
  ): Promise<CreateTenantResponse> {
    const { config } = createTenantOptions
    try {
      const agent = request.agent as unknown as Agent<any>
      const tenantRecord: TenantRecord = await agent.modules.tenants.createTenant({ config })
      const provisioning = await provisionTenantResources({
        agent,
        tenantRecord,
        baseUrl: createTenantOptions.baseUrl,
        displayName: createTenantOptions.displayName,
      })

      const token = await this.createToken(agent, tenantRecord.id)
      const tenantJson = JsonTransformer.toJSON(tenantRecord) as Record<string, unknown>
      return {
        ...tenantJson,
        id: tenantRecord.id,
        token,
        tenantId: tenantRecord.id,
        label: tenantRecord.config?.label,
        createdAt: tenantRecord.createdAt?.toISOString?.() ?? new Date().toISOString(),
        updatedAt: tenantRecord.updatedAt?.toISOString?.(),
        issuerDid: provisioning.issuerDid,
        issuerKid: provisioning.issuerKid,
        verifierDid: provisioning.verifierDid,
        verifierKid: provisioning.verifierKid,
        askarProfile: provisioning.askarProfile,
        metadata: provisioning.metadata,
      }
    } catch (error) {
      throw ErrorHandlingService.handle(error)
    }
  }

  @Post('/get-token/:tenantId')
  public async getTenantToken(
    @Request() request: Req,
    @Path('tenantId') tenantId: string,
    @Res() notFoundError: TsoaResponse<404, { reason: string }>,
    @Res() internalServerError: TsoaResponse<500, { message: string }>,
  ) {
    try {
      const agent = request.agent as unknown as Agent<any>
      // Option1: logic to use tenant's secret key to generate token for tenant
      // let secretKey
      // await agent.modules.tenants.withTenantAgent({ tenantId }, async (tenantAgent) => {
      //   const genericRecord = await tenantAgent.genericRecords.getAll()
      //   const records = genericRecord.find((record) => record?.content?.secretKey !== undefined)
      //   secretKey = records?.content.secretKey as string
      // })

      // Note: logic to store generate token for tenant using BW's secertKey

      const genericRecord = await agent.genericRecords.findAllByQuery({ hasSecretKey: 'true' })
      const secretKey = genericRecord[0]?.content.secretKey as string

      if (!secretKey) {
        throw new Error('secretKey does not exist in wallet')
      }

      const token = await this.createToken(agent, tenantId, secretKey)

      return { token: token }
    } catch (error) {
      if (error instanceof RecordNotFoundError) {
        return notFoundError(404, {
          reason: `SecretKey not found`,
        })
      }

      return internalServerError(500, { message: `Something went wrong: ${error}` })
    }
  }

  @Get(':tenantId')
  public async getTenantById(
    @Request() request: Req,
    @Path('tenantId') tenantId: string,
    @Res() notFoundError: TsoaResponse<404, { reason: string }>,
    @Res() internalServerError: TsoaResponse<500, { message: string }>,
  ) {
    try {
      const agent = request.agent as unknown as Agent<any>
      const getTenant = await agent.modules.tenants.getTenantById(tenantId)
      return JsonTransformer.toJSON(getTenant)
    } catch (error) {
      if (error instanceof RecordNotFoundError) {
        return notFoundError(404, {
          reason: `Tenant with id: ${tenantId} not found.`,
        })
      }
      return internalServerError(500, { message: `Something went wrong: ${error}` })
    }
  }

  @Get(':tenantId/metadata')
  public async getTenantMetadata(
    @Path('tenantId') tenantId: string,
    @Res() notFoundError: TsoaResponse<404, { reason: string }>,
  ): Promise<TenantMetadataResponse> {
    const tenant = getTenantById(tenantId)
    if (!tenant) {
      return notFoundError(404, {
        reason: `Tenant with id: ${tenantId} not found.`,
      })
    }

    return normalizeTenantMetadata(tenant)
  }

  @Get(':tenantId/metadata/issuer')
  public async getTenantIssuerMetadata(
    @Path('tenantId') tenantId: string,
    @Res() notFoundError: TsoaResponse<404, { reason: string }>,
  ): Promise<Record<string, unknown>> {
    const tenant = getTenantById(tenantId)
    if (!tenant) {
      return notFoundError(404, {
        reason: `Tenant with id: ${tenantId} not found.`,
      })
    }

    return ensureIssuerRecord(tenant)
  }

  @Get(':tenantId/metadata/verifier')
  public async getTenantVerifierMetadata(
    @Path('tenantId') tenantId: string,
    @Res() notFoundError: TsoaResponse<404, { reason: string }>,
  ): Promise<Record<string, unknown>> {
    const tenant = getTenantById(tenantId)
    if (!tenant) {
      return notFoundError(404, {
        reason: `Tenant with id: ${tenantId} not found.`,
      })
    }

    return ensureVerifierRecord(tenant)
  }
  @Delete(':tenantId')
  public async deleteTenantById(
    @Request() request: Req,
    @Path('tenantId') tenantId: string,
    @Res() notFoundError: TsoaResponse<404, { reason: string }>,
    @Res() internalServerError: TsoaResponse<500, { message: string }>,
  ) {
    try {
      const agent = request.agent as unknown as Agent<any>
      const deleteTenant = await agent.modules.tenants.deleteTenantById(tenantId)
      return JsonTransformer.toJSON(deleteTenant)
    } catch (error) {
      if (error instanceof RecordNotFoundError) {
        return notFoundError(404, {
          reason: `Tenant with id: ${tenantId} not found.`,
        })
      }
      return internalServerError(500, { message: `Something went wrong: ${error}` })
    }
  }

  private async createToken(agent: Agent<any>, tenantId: string, secretKey?: string) {
    let key: string
    if (!secretKey) {
      // Option1: logic to use tenant's secret key to generate token for tenant
      // key = await generateSecretKey()
      // await agent.modules.tenants.withTenantAgent({ tenantId }, async (tenantAgent) => {
      //   tenantAgent.genericRecords.save({
      //     content: {
      //       secretKey: key,
      //     },
      //   })
      // })

      // Option2: logic to store generate token for tenant using BW's secertKey
      const genericRecord = await agent.genericRecords.findAllByQuery({ hasSecretKey: 'true' })
      key = genericRecord[0].content.secretKey as string

      if (!key) {
        throw new Error('SecretKey does not exist for basewallet')
      }
    } else {
      key = secretKey
    }
    const token = jwt.sign({ role: AgentRole.RestTenantAgent, tenantId }, key)
    return token
  }
}

function isRecordLike(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function ensureIssuerRecord(tenant: TenantPersistenceRecord): Record<string, unknown> {
  const issuer = tenant.metadata?.issuer
  return isRecordLike(issuer) ? issuer : ({} as Record<string, unknown>)
}

function ensureVerifierRecord(tenant: TenantPersistenceRecord): Record<string, unknown> {
  const verifier = tenant.metadata?.verifier
  return isRecordLike(verifier) ? verifier : ({} as Record<string, unknown>)
}

function normalizeTenantMetadata(tenant: TenantPersistenceRecord): TenantMetadataResponse {
  return {
    issuer: ensureIssuerRecord(tenant),
    verifier: ensureVerifierRecord(tenant),
  }
}
