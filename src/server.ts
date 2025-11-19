// eslint-disable-next-line import/order
import { otelSDK } from './tracer'
import 'reflect-metadata'
import type { RestAgentModules, RestMultiTenantAgentModules } from './cliAgent'
import type { ApiError } from './errors'
import type { ServerConfig } from './utils/ServerConfig'
import type { Response as ExResponse, Request as ExRequest, NextFunction, ErrorRequestHandler } from 'express'

import { Agent } from '@credo-ts/core'
import { uuid } from '@credo-ts/core/build/utils/uuid'
import { TenantAgent } from '@credo-ts/tenants/build/TenantAgent'
import bodyParser from 'body-parser'
import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import { rateLimit } from 'express-rate-limit'
import * as fs from 'fs'
import { generateHTML, serve } from 'swagger-ui-express'
import { ValidateError } from 'tsoa'
import { container } from 'tsyringe'

import { setDynamicApiKey } from './authentication'
import { ErrorMessages } from './enums'
import { BaseError } from './errors/errors'
import { basicMessageEvents } from './events/BasicMessageEvents'
import { connectionEvents } from './events/ConnectionEvents'
import { credentialEvents } from './events/CredentialEvents'
import { proofEvents } from './events/ProofEvents'
import { questionAnswerEvents } from './events/QuestionAnswerEvents'
import { reuseConnectionEvents } from './events/ReuseConnectionEvents'
import { RegisterRoutes } from './routes/routes'
import { SecurityMiddleware } from './securityMiddleware'
import { initTenantStore } from './persistence/TenantRepository'
import { initWalletUserStore } from './persistence/UserRepository'
import { rootLogger } from './utils/pinoLogger'
import { runWithContext } from './utils/requestContext'
import { DatabaseManager } from './persistence/DatabaseManager'

dotenv.config()

export const setupServer = async (agent: Agent, config: ServerConfig, apiKey?: string) => {
  // Initialize persistence layer before using any stores
  try {
    const dbPath = process.env.PERSISTENCE_DB_PATH || './data/persistence.db'
    DatabaseManager.initialize({ path: dbPath })
    agent?.config?.logger?.info?.(`Persistence initialized at ${dbPath}`)
  } catch (e) {
    // If initialization fails, log and continue (server may still start for non-DB features)
    const msg = e instanceof Error ? e.message : String(e)
    agent?.config?.logger?.error?.(`Failed to initialize persistence layer: ${msg}`)
  }

  initTenantStore()
  initWalletUserStore()
  await otelSDK.start()
  agent.config.logger.info('OpenTelemetry SDK started')
  container.registerInstance(Agent, agent as Agent)
  fs.writeFileSync('config.json', JSON.stringify(config, null, 2))

  const app = config.app ?? express()
  if (config.cors) {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:4000',
      'http://localhost:4001',
      'http://localhost:5000',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:4000',
      'http://127.0.0.1:5000',
    ]

    app.use(cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true)

        if (allowedOrigins.indexOf(origin) !== -1) {
          callback(null, true)
        } else {
          agent.config.logger.warn(`CORS blocked origin: ${origin}`)
          callback(new Error('Not allowed by CORS'))
        }
      },
      credentials: true,
      methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-correlation-id', 'x-api-key', 'x-tenant-id'],
      exposedHeaders: ['x-correlation-id'],
    }))
  }

  if (config.socketServer || config.webhookUrl) {
    questionAnswerEvents(agent, config)
    basicMessageEvents(agent, config)
    connectionEvents(agent, config)
    credentialEvents(agent, config)
    proofEvents(agent, config)
    reuseConnectionEvents(agent, config)
  }

  // Use body parser to read sent json payloads
  app.use(
    bodyParser.urlencoded({
      extended: true,
      limit: '50mb',
    }),
  )

  const effectiveApiKey = apiKey ? apiKey : ''
  agent.config.logger.info(`Setting API key: ${effectiveApiKey}`)
  setDynamicApiKey(effectiveApiKey)

  app.use(bodyParser.json({ limit: '50mb' }))
  // Correlation ID middleware
  app.use((req: ExRequest, res: ExResponse, next: NextFunction) => {
    const headerName = 'x-correlation-id'
    const incoming =
      (req.headers[headerName] as string | undefined) || (req.headers['x-request-id'] as string | undefined)
    const correlationId = incoming || uuid()
    req.correlationId = correlationId
    res.setHeader(headerName, correlationId)
    // Attach request-scoped child logger
    req.logger = rootLogger.child({ correlationId })
    runWithContext({ correlationId }, () => next())
  })
  app.use('/docs/', serve, (_req: ExRequest, res: ExResponse, next: NextFunction) => {
    import('./routes/swagger.json')
      .then((swaggerJson) => {
        res.send(generateHTML(swaggerJson))
      })
      .catch(next)
  })
  const windowMs = Number(process.env.windowMs)
  const maxRateLimit = Number(process.env.maxRateLimit)
  const limiter = rateLimit({
    windowMs, // 1 second
    max: maxRateLimit, // max 800 requests per second
  })

  // apply rate limiter to all requests
  app.use(limiter)

  // Note: Having used it above, redirects accordingly
  app.use((req, res, next) => {
    if (req.url == '/') {
      res.redirect('/docs/')
      return
    }
    next()
  })

  app.use(async (req: ExRequest, res: ExResponse, next: NextFunction) => {
    // attach correlationId to locals so controllers can include it if desired
    res.locals.correlationId = req.correlationId
    res.on('finish', async () => {
      await endTenantSessionIfActive(req)
    })
    next()
  })

  const securityMiddleware = new SecurityMiddleware()
  app.use(securityMiddleware.use)
  RegisterRoutes(app)

  app.use((async (err: unknown, req: ExRequest, res: ExResponse, next: NextFunction): Promise<ExResponse | void> => {
    // End tenant session if active
    if (err instanceof ValidateError) {
      agent.config.logger.warn(`Caught Validation Error for ${req.path}:`, {
        fields: err.fields,
        correlationId: req.correlationId,
      })
      return res.status(422).json({
        message: 'Validation Failed',
        details: err?.fields,
      })
    } else if (err instanceof BaseError) {
      return res.status(err.statusCode).json({
        message: err.message,
      })
    } else if (err instanceof Error) {
      // Extend the Error type with custom properties
      const error = err as Error & { statusCode?: number; status?: number; stack?: string }
      if (error.status === 401) {
        return res.status(401).json({
          message: `Unauthorized`,
          details: err.message !== ErrorMessages.Unauthorized ? err.message : undefined,
        } satisfies ApiError)
      }
      const statusCode = error.statusCode || error.status || 500
      return res.status(statusCode).json({
        message: error.message || 'Internal Server Error',
      })
    }
    next()
  }) as ErrorRequestHandler)

  return app
}

async function endTenantSessionIfActive(request: ExRequest) {
  if ('agent' in request) {
    const agent = request?.agent
    if (agent instanceof TenantAgent) {
      agent.config.logger.debug(`Ending tenant session for tenant:: ${agent.context.contextCorrelationId}`)
      // TODO: we can also not wait for the ending of session
      // This can further imporve the response time
      await agent.endSession()
    }
  }
}
