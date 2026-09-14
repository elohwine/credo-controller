import type { InitConfig } from '@credo-ts/core'

import { AskarModule, AskarMultiWalletDatabaseScheme } from '@credo-ts/askar'
import {
  DidsModule,
  KeyDidRegistrar,
  KeyDidResolver,
  WebDidResolver,
  Agent,
  LogLevel,
  W3cCredentialsModule,
} from '@credo-ts/core'
import { agentDependencies } from '@credo-ts/node'
import { TenantsModule } from '@credo-ts/tenants'
import { askar } from '@openwallet-foundation/askar-nodejs'

import { TsLogger } from './logger'

export const setupAgent = async ({ name, endpoints, port }: { name: string; endpoints: string[]; port: number }) => {
  const logger = new TsLogger(LogLevel.Debug)

  const config: InitConfig = {
    logger: logger,
    autoUpdateStorageOnStartup: true,
  }

  // Credo 0.7 bootstrap modules used by local dev server.
  const agent = new Agent({
    config: config,
    modules: {
      askar: new AskarModule({
        askar,
        store: {
          id: name,
          key: name,
        },
        multiWalletDatabaseScheme: AskarMultiWalletDatabaseScheme.ProfilePerWallet,
      }),
      dids: new DidsModule({
        registrars: [new KeyDidRegistrar()],
        resolvers: [new KeyDidResolver(), new WebDidResolver()],
      }),
      w3cCredentials: new W3cCredentialsModule({}),
      tenants: new TenantsModule(),
    },
    dependencies: agentDependencies,
  })

  await agent.initialize()

  return agent
}
