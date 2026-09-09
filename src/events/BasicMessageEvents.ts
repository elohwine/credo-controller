import type { ServerConfig } from '../utils/ServerConfig'
import type { Agent } from '@credo-ts/core'

import { sendWebSocketEvent } from './WebSocketEvents'
import { sendWebhookEvent } from './WebhookEvent'

export const basicMessageEvents = async (agent: Agent, config: ServerConfig) => {
  ;(agent.events as any).on('BasicMessageStateChanged', async (event: any) => {
    const record = event?.payload?.basicMessageRecord
    if (!record) return
    const body = record.toJSON()

    // Only send webhook if webhook url is configured
    if (config.webhookUrl) {
      await sendWebhookEvent(config.webhookUrl + '/basic-messages', body, agent.config.logger)
    }

    if (config.socketServer) {
      // Always emit websocket event to clients (could be 0)
      sendWebSocketEvent(config.socketServer, {
        ...event,
        payload: {
          message: event.payload?.message?.toJSON?.() ?? null,
          basicMessageRecord: body,
        },
      })
    }
  })
}
