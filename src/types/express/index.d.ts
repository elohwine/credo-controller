import type { RestAgentModules, RestMultiTenantAgentModules } from '../../cliAgent'
import type { Agent } from '@credo-ts/core'
import type { TenantAgent } from '@credo-ts/tenants'
import type { Logger as PinoLogger } from 'pino'

export type AgentType = Agent<RestAgentModules> | Agent<RestMultiTenantAgentModules> | TenantAgent<RestAgentModules>

declare global {
  namespace Express {
    interface Request {
      agent: AgentType
      correlationId?: string
      logger?: PinoLogger
    }
  }
}
