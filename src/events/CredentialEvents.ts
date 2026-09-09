import type { ServerConfig } from '../utils/ServerConfig'
import type { Agent } from '@credo-ts/core'

import { sendWebSocketEvent } from './WebSocketEvents'
import { sendWebhookEvent } from './WebhookEvent'

export const credentialEvents = async (agent: Agent, config: ServerConfig) => {
  ;(agent.events as any).on('CredentialStateChanged', async (event: any) => {
    const credentialsApi = (agent as any).credentials
    const connectionsApi = (agent as any).connections
    const record = event?.payload?.credentialRecord
    if (!record) return

    const body: Record<string, unknown> = {
      ...record.toJSON(),
      ...event.metadata,
      outOfBandId: null,
      credentialData: null,
    }

    if (record?.connectionId) {
      const connectionRecord = await connectionsApi?.findById?.(record.connectionId)
      body.outOfBandId = connectionRecord?.outOfBandId
    }

    if (credentialsApi?.getFormatData) {
      const data = await credentialsApi.getFormatData(record.id)
      body.credentialData = data
    }

    if (config.webhookUrl) {
      await sendWebhookEvent(config.webhookUrl + '/credentials', body, agent.config.logger)
    }

    if (config.socketServer) {
      // Always emit websocket event to clients (could be 0)
      sendWebSocketEvent(config.socketServer, {
        ...event,
        payload: {
          ...event.payload,
          credentialRecord: body,
        },
      })
    }
  })
}
