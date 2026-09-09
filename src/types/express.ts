import type { Agent } from '@credo-ts/core'
import type { TenantAgent } from '@credo-ts/tenants'
import type { Logger as PinoLogger } from 'pino'

import type { RestAgentModules, RestMultiTenantAgentModules } from '../cliAgent'

export type AgentType = Agent<RestAgentModules> | Agent<RestMultiTenantAgentModules> | TenantAgent<RestAgentModules>

declare module 'express-serve-static-core' {
  interface Request {
    agent: AgentType
    correlationId?: string
    logger?: PinoLogger
  }
}

export {}
