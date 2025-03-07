import type { ServerConfig } from '../src/utils/ServerConfig'
import { AgentConfig } from '@credo-ts/core'
import bodyParser from 'body-parser'
import express from 'express'
import ngrok from 'ngrok'
import { startServer } from '../src/index'
import { setupAgent } from '../src/utils/agent'

const run = async () => {
  const app = express()
  const jsonParser = bodyParser.json()
  const port = 3001
  
  try {

    // Add a delay before connecting to ngrok
    await new Promise(resolve => setTimeout(resolve, 2000)); // 2 seconds delay
    // Configure ngrok with more options
    const endpoint = 'https://0be4-98-97-133-127.ngrok-free.app'
    // const endpoint = await ngrok.connect({
    //   addr: port,
    //   authtoken: process.env.NGROK_AUTH_TOKEN, // Set this in your .env file
    // })
    
    console.log(`Ngrok tunnel established at: ${endpoint}`)
    
    const agent = await setupAgent({
      port: 3000,
      endpoints: ['localhost:3001'],
      name: 'Aries Test Agent',
    })
    
    app.post('/greeting', jsonParser, (req, res) => {
      const config = agent.dependencyManager.resolve(AgentConfig)
      res.send(`Hello, ${config.label}!`)
    })
    
    const conf: ServerConfig = {
      port: port,
      webhookUrl: 'http://localhost:5000/agent-events',
      app: app,
    }
    
    await startServer(agent, conf)
  } catch (error) {
    console.error('Error starting application:', error)
    // Gracefully close ngrok if it was started
    try {
      await ngrok.kill()
    } catch (e) {
      console.error('Error killing ngrok:', e)
    }
    process.exit(1)
  }
}

run()