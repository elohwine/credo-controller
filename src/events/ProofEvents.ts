import type { ServerConfig } from '../utils/ServerConfig'
import type { Agent } from '@credo-ts/core'

import { sendWebSocketEvent } from './WebSocketEvents'
import { sendWebhookEvent } from './WebhookEvent'

export const proofEvents = async (agent: Agent, config: ServerConfig) => {
  ;(agent.events as any).on('ProofStateChanged', async (event: any) => {
    const tenantsApi = (agent.modules as any).tenants
    const proofsApi = (agent as any).proofs
    const record = event?.payload?.proofRecord
    if (!record) return
    const body = { ...record.toJSON(), ...event.metadata } as { proofData?: any }
    if (event.metadata.contextCorrelationId !== 'default' && tenantsApi?.getTenantAgent) {
      const tenantAgent = await tenantsApi.getTenantAgent({
        tenantId: event.metadata.contextCorrelationId,
      })
      const tenantProofsApi = (tenantAgent as any).proofs
      if (tenantProofsApi?.getFormatData) {
        const data = await tenantProofsApi.getFormatData(record.id)
        body.proofData = data
      }
    }

    //Emit webhook for dedicated agent
    if (event.metadata.contextCorrelationId === 'default' && proofsApi?.getFormatData) {
      const data = await proofsApi.getFormatData(record.id)
      body.proofData = data
    }

    // Only send webhook if webhook url is configured
    if (config.webhookUrl) {
      await sendWebhookEvent(config.webhookUrl + '/proofs', body, agent.config.logger)
    }

    if (config.socketServer) {
      // Always emit websocket event to clients (could be 0)
      sendWebSocketEvent(config.socketServer, {
        ...event,
        payload: {
          ...event.payload,
          proofRecord: body,
        },
      })
    }
  })
}
