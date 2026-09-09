import type { ServerConfig } from '../utils/ServerConfig'
import type { Agent } from '@credo-ts/core'

import { sendWebSocketEvent } from './WebSocketEvents'
import { sendWebhookEvent } from './WebhookEvent'

export const connectionEvents = async (agent: Agent, config: ServerConfig) => {
  ;(agent.events as any).on('ConnectionStateChanged', async (event: any) => {
    const record = event?.payload?.connectionRecord
    if (!record) return
    const body = { ...record.toJSON(), ...event.metadata }

    // Only send webhook if webhook url is configured
    if (config.webhookUrl) {
      await sendWebhookEvent(config.webhookUrl + '/connections', body, agent.config.logger)
    }

    if (config.socketServer) {
      // Always emit websocket event to clients (could be 0)
      sendWebSocketEvent(config.socketServer, {
        ...event,
        payload: {
          ...event.payload,
          connectionRecord: body,
        },
      })
    }
  })
}
