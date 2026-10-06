import type { InitConfig } from '@credo-ts/core'

import { AskarModule, AskarMultiWalletDatabaseScheme } from '@credo-ts/askar'
import {
  Agent,
  ClaimFormat,
  DidsApi,
  DidsModule,
  KeyDidRegistrar,
  KeyDidResolver,
  LogLevel,
  W3cCredentialsModule,
  WebDidResolver,
} from '@credo-ts/core'
import { DidCommModule, DidCommHttpOutboundTransport } from '@credo-ts/didcomm'
import { agentDependencies, DidCommHttpInboundTransport } from '@credo-ts/node'
import { OpenId4VcModule } from '@credo-ts/openid4vc'
import { TenantsModule } from '@credo-ts/tenants'
import { askarNodeJS } from '@openwallet-foundation/askar-nodejs'
import express from 'express'

import { TsLogger } from './logger'
import { holderBindingDid } from './openidMetadata'

export const setupAgent = async ({ name, endpoints, port }: { name: string; endpoints: string[]; port: number }) => {
  const logger = new TsLogger(LogLevel.Debug)
  const publicBaseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${port || 3000}`
  const oid4vcBaseUrl = (() => {
    const configured = (process.env.OID4VC_BASE_URL || publicBaseUrl).replace(/\/$/, '')
    try {
      const parsed = new URL(configured)
      const isLoopback = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1'

      // OpenID4VP requires HTTPS for response_uri. Keep this scoped to OID4VC only.
      if (isLoopback && parsed.protocol === 'http:') {
        parsed.protocol = 'https:'
      }

      return parsed.toString().replace(/\/$/, '')
    } catch {
      return configured
    }
  })()
  const walletId = name
  const walletKey = name
  const effectiveEndpoints = endpoints.length ? endpoints : [`http://localhost:${port || 3001}`]
  const app = express()

  const config: InitConfig = {
    logger,
    autoUpdateStorageOnStartup: true,
  }

  const agent = new Agent({
    config: {
      ...config,
      walletConfig: {
        id: walletId,
        key: walletKey,
      },
      label: name,
      endpoints: effectiveEndpoints,
    } as any,
    modules: {
      askar: new AskarModule({
        askar: askarNodeJS,
        store: {
          id: walletId,
          key: walletKey,
        },
        multiWalletDatabaseScheme: AskarMultiWalletDatabaseScheme.ProfilePerWallet,
      }),
      tenants: new TenantsModule({
        sessionAcquireTimeout: Number(process.env.SESSION_ACQUIRE_TIMEOUT) || 2_147_483_647,
        sessionLimit: Number(process.env.SESSION_LIMIT) || 2_147_483_647,
      }),
      dids: new DidsModule({
        registrars: [new KeyDidRegistrar()],
        resolvers: [new KeyDidResolver(), new WebDidResolver()],
      }),
      didcomm: new DidCommModule({
        endpoints: effectiveEndpoints,
        transports: {
          inbound: [new DidCommHttpInboundTransport({ port: port || 3001 })],
          outbound: [new DidCommHttpOutboundTransport()],
        },
        connections: {
          autoAcceptConnections: true,
        },
      }),
      w3cCredentials: new W3cCredentialsModule({}),
      openid4vc: new OpenId4VcModule({
        app,
        issuer: {
          baseUrl: `${oid4vcBaseUrl}/oidc/issuer`,
          // Inbox offers are accepted at the holder's convenience; see cliAgent.ts.
          statefulCredentialOfferExpirationInSeconds:
            Number(process.env.OID4VCI_OFFER_EXPIRES_IN_SECONDS) || 30 * 24 * 60 * 60,
          credentialRequestToCredentialMapper: async ({
            agentContext,
            issuanceSession,
            holderBinding,
            credentialConfigurationId,
          }: any) => {
            const metadata = (issuanceSession?.issuanceMetadata as any) ?? {}
            const claims = metadata?.claims || {}
            const supportedId = credentialConfigurationId

            let subjectDid = metadata?.subjectDid || 'did:example:unknown'
            const boundDid = holderBindingDid(holderBinding)
            if (boundDid) subjectDid = boundDid

            const didsApi = agentContext.dependencyManager.resolve(DidsApi)
            let issuerDids = await didsApi.getCreatedDids({ method: 'key' })
            let issuerDid = issuerDids[0]?.did as string | undefined

            if (!issuerDid) {
              const created = await didsApi.create({
                method: 'key',
                options: {
                  createKey: {
                    type: {
                      kty: 'OKP',
                      crv: 'Ed25519',
                    },
                  },
                },
              })
              issuerDid = created.didState.did as string
            }

            const issuerDidDocument = await didsApi.resolveDidDocument(issuerDid)
            const verificationMethod =
              issuerDidDocument.verificationMethod?.[0]?.id || `${issuerDid}#${issuerDid.replace('did:key:', '')}`

            const credentialType = (supportedId || 'GenericIDCredential').replace(/_jwt_vc(_json)?$/, '')
            const credentialPayload: any = {
              '@context': ['https://www.w3.org/2018/credentials/v1'],
              type: ['VerifiableCredential', credentialType],
              issuer: issuerDid,
              issuanceDate: new Date().toISOString(),
              credentialSubject: {
                id: subjectDid,
                ...claims,
              },
            }

            return {
              type: 'credentials',
              format: ClaimFormat.JwtVc,
              credentials: [
                {
                  credentialSupportedId: supportedId,
                  verificationMethod,
                  credential: credentialPayload,
                },
              ],
            } as any
          },
        },
        verifier: {
          baseUrl: `${oid4vcBaseUrl}/oidc/verifier`,
        },
      }),
    },
    dependencies: agentDependencies,
  })

  await agent.initialize()

  try {
    const existingIssuers = await (agent as any).openid4vc.issuer.getAllIssuers()
    if (!existingIssuers || existingIssuers.length === 0) {
      await (agent as any).openid4vc.issuer.createIssuer({
        issuerId: 'default-platform-issuer',
        credentialConfigurationsSupported: {},
      })
    }
  } catch (error) {
    logger.warn?.(`OpenID4VC issuer bootstrap warning: ${(error as Error)?.message || String(error)}`)
  }

  return agent
}
