import 'reflect-metadata'

import type { ServerConfig } from './utils/ServerConfig'
import type { Agent } from '@credo-ts/core'
import type { Socket } from 'net'

import { Server } from 'ws'

import { setupServer } from './server'

export const startServer = async (agent: Agent, config: ServerConfig, apiKey?: string) => {
  const socketServer = config.socketServer ?? new Server({ noServer: true })
  const app = await setupServer(agent, { ...config, socketServer }, apiKey)
  const server = app.listen(config.port)

  // If no socket server is provided, we will use the existing http server
  // to also host the websocket server
  if (!config.socketServer) {
    server.on('upgrade', (request, socket, head) => {
      socketServer.handleUpgrade(request, socket as Socket, head, () => {})
    })
  }

  return server
}
