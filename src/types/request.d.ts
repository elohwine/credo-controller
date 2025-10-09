import type { RestAgentModules, RestMultiTenantAgentModules } from '../cliAgent'
import type { Agent } from '@credo-ts/core'
import type { TenantAgent } from '@credo-ts/tenants/build/TenantAgent'
import type { Logger as PinoLogger } from 'pino'

// declare global {
//   namespace Express {
//     interface Request {
//       user: {
//         [x: string]: any
//         agent: Agent<RestAgentModules> | Agent<RestMultiTenantAgentModules> | TenantAgent<RestAgentModules>
//       }
//     }
//   }
// }
export type AgentType = Agent<RestAgentModules> | Agent<RestMultiTenantAgentModules> | TenantAgent<RestAgentModules>

interface IAgent {
  agent: AgentType
}

declare global {
  namespace Express {
    interface Request {
      agent: AgentType
      correlationId?: string
      logger?: PinoLogger
    }
  }
}

// declare global {
//   namespace Express {
//     interface Request {
//       user: {
//         [x: string]: any
//         agent: any
//       }
//     }
//   }
// }
