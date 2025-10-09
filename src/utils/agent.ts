import type { InitConfig } from '@credo-ts/core'

import { PolygonModule } from '@ayanworks/credo-polygon-w3c-module'
import { AskarModule } from '@credo-ts/askar'
import {
  AutoAcceptCredential,
  CredentialsModule,
  DidsModule,
  JsonLdCredentialFormatService,
  KeyDidRegistrar,
  KeyDidResolver,
  ProofsModule,
  WebDidResolver,
  Agent,
  ConnectionInvitationMessage,
  HttpOutboundTransport,
  LogLevel,
} from '@credo-ts/core'
import { agentDependencies, HttpInboundTransport } from '@credo-ts/node'
import { TenantsModule } from '@credo-ts/tenants'
import { ariesAskar } from '@hyperledger/aries-askar-nodejs'

import { TsLogger } from './logger'

export const setupAgent = async ({ name, endpoints, port }: { name: string; endpoints: string[]; port: number }) => {
  const logger = new TsLogger(LogLevel.debug)

  const config: InitConfig = {
    label: name,
    endpoints: endpoints,
    walletConfig: {
      id: name,
      key: name,
    },
    logger: logger,
  }

  // Minimal modules: did:key & did:web support + JSON-LD credentials
  const agent = new Agent({
    config: config,
    modules: {
      askar: new AskarModule({
        ariesAskar,
      }),
      dids: new DidsModule({
        registrars: [new KeyDidRegistrar()],
        resolvers: [new KeyDidResolver(), new WebDidResolver()],
      }),
      // Keep proofs & anoncreds out for lean DID + W3C focus; add later if needed
      proofs: new ProofsModule({ proofProtocols: [] }),
      credentials: new CredentialsModule({
        autoAcceptCredentials: AutoAcceptCredential.ContentApproved,
        credentialProtocols: [],
      }),
      tenants: new TenantsModule(),
      polygon: new PolygonModule({
        didContractAddress: '',
        schemaManagerContractAddress: '',
        fileServerToken: '',
        rpcUrl: '',
        serverUrl: '',
      }),
    },
    dependencies: agentDependencies,
  })

  const httpInbound = new HttpInboundTransport({
    port: port,
  })

  agent.registerInboundTransport(httpInbound)

  agent.registerOutboundTransport(new HttpOutboundTransport())

  httpInbound.app.get('/invitation', async (req, res) => {
    if (typeof req.query.d_m === 'string') {
      const invitation = await ConnectionInvitationMessage.fromUrl(req.url.replace('d_m=', 'c_i='))
      res.send(invitation.toJSON())
    }
    if (typeof req.query.c_i === 'string') {
      const invitation = await ConnectionInvitationMessage.fromUrl(req.url)
      res.send(invitation.toJSON())
    } else {
      const { outOfBandInvitation } = await agent.oob.createInvitation()

      res.send(outOfBandInvitation.toUrl({ domain: endpoints + '/invitation' }))
    }
  })

  await agent.initialize()

  return agent
}
