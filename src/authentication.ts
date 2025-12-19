import type { RestAgentModules, RestMultiTenantAgentModules } from './cliAgent'
import type { TenantAgent } from '@credo-ts/tenants/build/TenantAgent'
import type { Request } from 'express'

import { Agent, LogLevel } from '@credo-ts/core'
import { uuid } from '@credo-ts/core/build/utils/uuid'
import jwt, { decode } from 'jsonwebtoken'
import { container } from 'tsyringe'

import { AgentRole, ErrorMessages, SCOPES } from './enums'
import { StatusException } from './errors'
import { TsLogger } from './utils/logger'

// export type AgentType = Agent<RestAgentModules> | Agent<RestMultiTenantAgentModules> | TenantAgent<RestAgentModules>

let dynamicApiKey: string = uuid() // Initialize with a default value

// Cache for jwt token key
const cache = new Map<string, string>()

export const getFromCache = (key: string) => cache.get(key)
export const setInCache = (key: string, value: string) => cache.set(key, value)

function getCookieValue(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined

  // Very small cookie parser (avoids adding cookie-parser dependency).
  // Supports: "a=b; auth.token=<jwt>; c=d".
  const parts = cookieHeader.split(';')
  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) continue
    const key = trimmed.slice(0, eqIndex).trim()
    if (key !== name) continue
    const rawValue = trimmed.slice(eqIndex + 1)
    try {
      return decodeURIComponent(rawValue)
    } catch {
      return rawValue
    }
  }

  return undefined
}

function getJwtFromRequest(request: Request): string | undefined {
  const authHeader = request.headers['authorization']
  if (typeof authHeader === 'string' && authHeader.length > 0) {
    return authHeader.replace(/^Bearer\s+/i, '').trim()
  }

  // Wallet UI stores token in cookie "auth.token".
  const cookieHeader = typeof request.headers.cookie === 'string' ? request.headers.cookie : undefined
  const cookieToken = getCookieValue(cookieHeader, 'auth.token')
  if (cookieToken && cookieToken.length > 0) return cookieToken.trim()

  return undefined
}

export async function expressAuthentication(request: Request, securityName: string, scopes?: string[]) {
  const logger = new TsLogger(LogLevel.info)
  const agent = container.resolve(Agent as unknown as new (...args: any[]) => Agent)

  logger.info(`securityName::: ${securityName}`)
  logger.info(`scopes::: ${scopes}`)

  if (scopes && scopes?.includes(SCOPES.UNPROTECTED)) {
    // Skip authentication for this route or controller
    request.agent = agent
    return true
  }

  const apiKeyHeader = request.headers['authorization']

  if (securityName === 'apiKey') {
    // Auth: For BW/Dedicated agent to GET their token
    if (apiKeyHeader) {
      const providedApiKey = apiKeyHeader as string
      logger.info(`Provided API key: ${providedApiKey}`)
      logger.info(`Expected API key: ${dynamicApiKey}`)
      if (providedApiKey === dynamicApiKey) {
        request.agent = agent
        return true
      } else {
        logger.error(`API key mismatch`)
      }
    }
  }

  if (securityName === 'jwt') {
    const tenancy = 'tenants' in (agent.modules as any)
    const token = getJwtFromRequest(request)
    const reqPath = request.path
    let decodedToken: jwt.JwtPayload
    if (!token) {
      return Promise.reject(new StatusException(`${ErrorMessages.Unauthorized}: Invalid token`, 401))
    }

    let cachedKey = getFromCache('secret')

    if (!cachedKey) {
      // Cache key from
      cachedKey = await getSecretKey(agent as Agent)
    }

    // Verify token
    const verified = await verifyToken(logger, token, cachedKey)

    // Failed to verify token
    if (!verified) {
      return Promise.reject(new StatusException(ErrorMessages.Unauthorized, 401))
    }

    try {
      decodedToken = decode(token) as jwt.JwtPayload
      if (!decodedToken || !decodedToken.role) {
        throw new Error('Token not decoded')
      }
    } catch (err) {
      agent.config.logger.error('Error decoding token', err as Record<string, any>)
      return Promise.reject(new StatusException(`${ErrorMessages.Unauthorized}: Invalid token`, 401))
    }

    // Before getting ahead, we can ideally, verify the token, since, in the current approach we have stored the jwt secret in BW
    const role: AgentRole = decodedToken.role

    if (tenancy) {
      // it should be a shared agent
      if (role !== AgentRole.RestRootAgentWithTenants && role !== AgentRole.RestTenantAgent) {
        logger.error(`[AUTH-DEBUG] Unknown role: ${role}. The agent is a multi-tenant agent`)
        return Promise.reject(new StatusException('Unknown role', 401))
      }
      if (role === AgentRole.RestTenantAgent) {
        // Logic if the token is of tenant agent
        if (scopes && !scopes?.includes(SCOPES.TENANT_AGENT)) {
          logger.error(`[AUTH-DEBUG] Missing Scope. Required: ${SCOPES.TENANT_AGENT}, Provided Scopes: ${scopes}`)
          return Promise.reject(new StatusException(ErrorMessages.Unauthorized, 401))
        } else {
          // Auth: tenant agent
          const tenantId: string = decodedToken.tenantId
          if (!tenantId) {
            logger.error('[AUTH-DEBUG] Missing tenantId in token')
            return Promise.reject(new StatusException(ErrorMessages.Unauthorized, 401))
          }
          try {
            const tenantAgent = await (agent.modules as any).tenants.getTenantAgent({ tenantId })
            if (!tenantAgent) {
              logger.error(`[AUTH-DEBUG] Tenant Agent not found for ID: ${tenantId}`)
              return Promise.reject(new StatusException(ErrorMessages.Unauthorized, 401))
            }
            // Only need to registerInstance for TenantAgent.
            request.agent = tenantAgent
            // TSOA assigns the return value of this function to request.user
            return decodedToken
          } catch (error: any) {
            logger.error(`Failed to get tenant agent: ${error.message}`)
            return Promise.reject(new StatusException(ErrorMessages.Unauthorized, 401))
          }
        }
      } else if (role === AgentRole.RestRootAgentWithTenants) {
        // Auth: base wallet
        if (!scopes?.includes(SCOPES.MULTITENANT_BASE_AGENT)) {
          logger.error('[AUTH-DEBUG] Basewallet can only manage tenants')
          return Promise.reject(new StatusException(ErrorMessages.Unauthorized, 401))
        }

        request.agent = agent as any
        return true
      } else {
        logger.error('[AUTH-DEBUG] Invalid Token Role')
        return Promise.reject(new StatusException(ErrorMessages.Unauthorized, 401))
      }
    } else {
      if (role !== AgentRole.RestRootAgent) {
        logger.error('[AUTH-DEBUG] This is a dedicated agent but role is not RestRootAgent')
        return Promise.reject(new StatusException(ErrorMessages.Unauthorized, 401))
      } else {
        // Auth: dedicated agent
        request.agent = agent as any
        return true
      }
    }
  }
  logger.error('[AUTH-DEBUG] Fallthrough Rejection')
  return Promise.reject(new StatusException(ErrorMessages.Unauthorized, 401))
}

async function verifyToken(logger: TsLogger, token: string, secretKey: string): Promise<boolean> {
  try {
    jwt.verify(token, secretKey)
    return true
  } catch (error) {
    logger.error('Error verifying jwt token', error as Record<string, any>)
    return false
  }
}

// Common function to pass agent object and get secretKey
async function getSecretKey(agent: Agent | TenantAgent<any>): Promise<string> {
  let cachedKey: string | undefined

  cachedKey = getFromCache('secret')

  if (!cachedKey) {
    const genericRecords = await agent.genericRecords.findAllByQuery({ hasSecretKey: 'true' })
    cachedKey = genericRecords[0]?.content.secretKey as string
    if (!cachedKey) {
      throw new Error('secretKey not found')
    }
    setInCache('secret', cachedKey)
  }

  return cachedKey
}

export function setDynamicApiKey(newApiKey: string) {
  dynamicApiKey = newApiKey
}

export function getDynamicApiKey() {
  return dynamicApiKey
}
