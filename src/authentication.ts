import type { TenantAgent } from '@credo-ts/tenants/build/TenantAgent'
import type { Request } from 'express'

import { Agent, LogLevel } from '@credo-ts/core'
import jwt, { decode } from 'jsonwebtoken'
import { container } from 'tsyringe'

import { AgentRole, ErrorMessages, SCOPES } from './enums'
import { StatusException } from './errors'
import { TsLogger } from './utils/logger'

let dynamicApiKey: string = process.env.STATIC_API_KEY || (process.env.NODE_ENV === 'production' ? '' : 'test-api-key-12345')

const cache = new Map<string, string>()

export const getFromCache = (key: string) => cache.get(key)
export const setInCache = (key: string, value: string) => cache.set(key, value)

function getCookieValue(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined
  const parts = cookieHeader.split(';')
  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) continue
    const key = trimmed.slice(0, eqIndex).trim()
    if (key !== name) continue
    const rawValue = trimmed.slice(eqIndex + 1)
    try { return decodeURIComponent(rawValue) } catch { return rawValue }
  }
  return undefined
}

function getJwtFromRequest(request: Request): string | undefined {
  const authHeader = request.headers['authorization']
  if (typeof authHeader === 'string' && authHeader.length > 0) {
    return authHeader.replace(/^Bearer\s+/i, '').trim()
  }
  const cookieHeader = typeof request.headers.cookie === 'string' ? request.headers.cookie : undefined
  const cookieToken = getCookieValue(cookieHeader, 'auth.token')
  if (cookieToken && cookieToken.length > 0) return cookieToken.trim()
  return undefined
}

export async function expressAuthentication(request: Request, securityName: string, scopes?: string[]) {
  const logger = new TsLogger(LogLevel.info)
  const agent = container.resolve(Agent as unknown as new (...args: any[]) => Agent)

  if (scopes && scopes.includes(SCOPES.UNPROTECTED)) {
    request.agent = agent
    return true
  }

  const xApiKeyHeader = request.headers['x-api-key'] as string | undefined
  const authorizationHeader = request.headers['authorization'] as string | undefined

  if (securityName === 'apiKey') {
    const providedApiKey = xApiKeyHeader || authorizationHeader
    if (providedApiKey && dynamicApiKey && providedApiKey === dynamicApiKey) {
      request.agent = agent
      return true
    }
    logger.error('API key authentication failed')
  }

  if (securityName === 'jwt') {
    const tenancy = 'tenants' in (agent.modules as any)
    const token = getJwtFromRequest(request)
    let decodedToken: jwt.JwtPayload

    if (!token) {
      return Promise.reject(new StatusException(`${ErrorMessages.Unauthorized}: Invalid token`, 401))
    }

    let cachedKey = getFromCache('secret')
    if (!cachedKey) cachedKey = await getSecretKey(agent as Agent)

    const verified = await verifyToken(logger, token, cachedKey)
    if (!verified) {
      return Promise.reject(new StatusException(ErrorMessages.Unauthorized, 401))
    }

    try {
      decodedToken = decode(token) as jwt.JwtPayload
      if (!decodedToken || !decodedToken.role) throw new Error('Token not decoded')
    } catch {
      agent.config.logger.error('Error decoding authentication token')
      return Promise.reject(new StatusException(`${ErrorMessages.Unauthorized}: Invalid token`, 401))
    }

    const role: AgentRole = decodedToken.role

    if (tenancy) {
      if (role !== AgentRole.RestRootAgentWithTenants && role !== AgentRole.RestTenantAgent) {
        logger.error('Unknown authentication role')
        return Promise.reject(new StatusException('Unknown role', 401))
      }
      if (role === AgentRole.RestTenantAgent) {
        if (scopes && scopes.length > 0 && !scopes.includes(SCOPES.TENANT_AGENT)) {
          logger.error('Missing required tenant scope')
          return Promise.reject(new StatusException(ErrorMessages.Unauthorized, 401))
        }
        const tenantId: string = decodedToken.tenantId
        if (!tenantId) {
          logger.error('Missing tenantId in token')
          return Promise.reject(new StatusException(ErrorMessages.Unauthorized, 401))
        }
        try {
          const tenantAgent = await (agent.modules as any).tenants.getTenantAgent({ tenantId })
          if (!tenantAgent) {
            logger.error('Tenant agent not found')
            return Promise.reject(new StatusException(ErrorMessages.Unauthorized, 401))
          }
          request.agent = tenantAgent
          return decodedToken
        } catch (error: any) {
          logger.error(`Failed to resolve tenant agent: ${error.message}`)
          return Promise.reject(new StatusException(ErrorMessages.Unauthorized, 401))
        }
      }

      if (role === AgentRole.RestRootAgentWithTenants) {
        if (!scopes?.includes(SCOPES.MULTITENANT_BASE_AGENT)) {
          logger.error('Base agent missing required multitenant scope')
          return Promise.reject(new StatusException(ErrorMessages.Unauthorized, 401))
        }
        request.agent = agent as any
        return true
      }
    } else {
      if (role !== AgentRole.RestRootAgent) {
        logger.error('Invalid role for dedicated agent')
        return Promise.reject(new StatusException(ErrorMessages.Unauthorized, 401))
      }
      request.agent = agent as any
      return true
    }
  }

  return Promise.reject(new StatusException(ErrorMessages.Unauthorized, 401))
}

async function verifyToken(logger: TsLogger, token: string, secretKey: string): Promise<boolean> {
  try {
    jwt.verify(token, secretKey)
    return true
  } catch {
    logger.error('Authentication token verification failed')
    return false
  }
}

async function getSecretKey(agent: Agent | TenantAgent<any>): Promise<string> {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET

  let cachedKey: string | undefined = getFromCache('secret')
  if (!cachedKey) {
    const genericRecords = await agent.genericRecords.findAllByQuery({ hasSecretKey: 'true' })
    cachedKey = genericRecords[0]?.content.secretKey as string
    if (!cachedKey) throw new Error('secretKey not found')
    setInCache('secret', cachedKey)
  }
  return cachedKey
}

export function setDynamicApiKey(newApiKey: string) { dynamicApiKey = newApiKey }
export function getDynamicApiKey() { return dynamicApiKey }
