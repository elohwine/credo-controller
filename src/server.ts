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
import { auditMiddleware } from './middleware/auditMiddleware'
import { triggerService } from './services/TriggerService'
import { ShortlinkService } from './services/ShortlinkService'

import { startNgrokTunnel, getNgrokUrl } from './utils/ngrokTunnel'

dotenv.config()

export const setupServer = async (agent: Agent, config: ServerConfig, apiKey?: string) => {
  // Start ngrok tunnel for webhook support in dev (only on main server port 3000)
  const enableNgrok = process.env.ENABLE_NGROK !== 'false' && process.env.NODE_ENV !== 'production'
  if (enableNgrok && config.port === 3000 && !getNgrokUrl()) {
    try {
      const ngrokUrl = await startNgrokTunnel({ port: config.port })
      agent?.config?.logger?.info?.(`Ngrok tunnel established: ${ngrokUrl}`)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      agent?.config?.logger?.warn?.(`Ngrok failed to start: ${msg}`)
    }
  }

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

  // Initialize shortlink service for verification QRs
  try {
    ShortlinkService.initialize()
    agent?.config?.logger?.info?.('ShortlinkService initialized')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    agent?.config?.logger?.warn?.(`ShortlinkService initialization failed: ${msg}`)
  }

  // Initialize trigger service for scheduled workflows
  try {
    await triggerService.initialize()
    agent?.config?.logger?.info?.('TriggerService initialized')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    agent?.config?.logger?.warn?.(`TriggerService initialization failed: ${msg}`)
  }

  // await otelSDK.start()
  // agent.config.logger.info('OpenTelemetry SDK started')

  if (process.env.DEBUG_AGENT_MODULES === 'true') {
    // DEBUG: Log agent modules before and after registration
    console.log('[server.ts] Agent modules before container registration:', Object.keys((agent.modules as any) || {}))
    console.log('[server.ts] Has openId4VcIssuer?', !!(agent.modules as any)?.openId4VcIssuer)
  }

  container.registerInstance(Agent, agent as Agent)

  if (process.env.DEBUG_AGENT_MODULES === 'true') {
    console.log('[server.ts] Agent modules after container registration:', Object.keys((agent.modules as any) || {}))
  }

  fs.writeFileSync('/app/data/config.json', JSON.stringify(config, null, 2))

  const app = config.app ?? express()
  if (config.cors) {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
      'http://localhost:3003',
      'http://localhost:3004',
      'http://localhost:3005',
      'http://localhost:3006',
      'http://localhost:4000',
      'http://localhost:4001',
      'http://localhost:5000',
      'http://localhost:6000',
      'http://localhost:6001',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001',
      'http://127.0.0.1:3002',
      'http://127.0.0.1:3003',
      'http://127.0.0.1:3004',
      'http://127.0.0.1:3005',
      'http://127.0.0.1:3006',
      'http://127.0.0.1:4000',
      'http://127.0.0.1:4001',
      'http://127.0.0.1:5000',
      'http://127.0.0.1:6000',
      'http://127.0.0.1:6001',
      // Fly.io production URLs
      'https://credentis-portal.fly.dev',
      'https://credentis-wallet.fly.dev',
      'https://credentis-api.fly.dev',
      // Docker Internal IPs
      'http://172.16.0.0:3000', 'http://172.16.0.0:4000', 'http://172.16.0.0:5000', 'http://172.16.0.0:6000',
      'http://172.17.0.0:3000', 'http://172.17.0.0:4000', 'http://172.17.0.0:5000', 'http://172.17.0.0:6000',
      'http://172.18.0.0:3000', 'http://172.18.0.0:4000', 'http://172.18.0.0:5000', 'http://172.18.0.0:6000',
      'http://172.19.0.0:3000', 'http://172.19.0.0:4000', 'http://172.19.0.0:5000', 'http://172.19.0.0:6000',
    ]

    const isDockerOrigin = (origin: string) => {
      return origin.startsWith('http://172.') ||
        origin.startsWith('http://api') ||
        origin.startsWith('http://holder-api') ||
        origin.startsWith('http://portal') ||
        origin.startsWith('http://wallet')
    }


    app.use(cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true)

        if (allowedOrigins.indexOf(origin) !== -1 || isDockerOrigin(origin)) {
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

  // Request/Response logging middleware (development friendly)
  app.use((req: ExRequest, res: ExResponse, next: NextFunction) => {
    const start = Date.now()
    const safeHeaders = { ...req.headers }
    // avoid logging sensitive auth header value fully
    if (safeHeaders.authorization) safeHeaders.authorization = 'REDACTED'
    req.logger?.info({ method: req.method, path: req.path, headers: safeHeaders, body: req.body }, 'Incoming request')

    // capture response body by wrapping res.send
    const originalSend = res.send.bind(res)
    let responseBody: any = undefined
    // @ts-ignore
    res.send = (body?: any) => {
      responseBody = body
      return originalSend(body)
    }

    res.on('finish', () => {
      const duration = Date.now() - start
      req.logger?.info({ method: req.method, path: req.path, status: res.statusCode, duration, response: responseBody }, 'Request completed')
    })

    next()
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

  // Audit middleware for compliance logging
  app.use(auditMiddleware)

  // Note: Having used it above, redirects accordingly
  app.use((req, res, next) => {
    if (req.url == '/') {
      res.redirect('/docs/')
      return
    }
    next()
  })

  // Shortlink redirect: /v/{code} -> verification page
  app.get('/v/:code', (req: ExRequest, res: ExResponse) => {
    const { code } = req.params
    const result = ShortlinkService.resolve(code)

    if (!result) {
      return res.status(404).json({ error: 'Link expired or not found' })
    }

    // Redirect to appropriate verification page based on type
    const baseUrl = process.env.PORTAL_URL || 'http://localhost:5000'
    if (result.type === 'receipt') {
      return res.redirect(`${baseUrl}/verify/receipt/${result.targetId}`)
    } else if (result.type === 'credential') {
      return res.redirect(`${baseUrl}/verify/${result.targetId}`)
    } else {
      return res.redirect(`${baseUrl}/verify?id=${result.targetId}`)
    }
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
  // Note: For issuer-level well-known (/.../issuer/:issuerId/.well-known/...),
  // let Credo's native OpenID4VC issuer module serve its stored metadata.
  // This ensures the advertised credential configurations match what was
  // registered when the issuer record was created (e.g., GenericIDCredential_jwt_vc_json).
  // Only provide platform-level (non-issuer-specific) augmented metadata if needed.

  // Mount TSOA routes (API controllers)
  // take precedence over the generic Credo OpenID4VC router which matches prefixes.
  RegisterRoutes(app)

  // Mount Credo OIDC4VC Routers
  // We use a safe cast or check for the module existence since Agent type is generic
  const modules = (agent as any).modules

  if (modules?.openId4VcIssuer?.config?.router) {
    agent.config.logger.info('Mounting OpenID4VC Issuer routes at /oidc/issuer')
    // Compatibility shim: normalize wallet-specific JSON VC formats to the generic 'jwt_vc'
    // so the underlying OpenID4VC issuer module (which expects 'jwt_vc') accepts requests.
    // Add a lightweight logger around the issuer credential endpoint to capture
    // the incoming credential request and the issuer response for debugging.
    app.use('/oidc/issuer', async (req: ExRequest, res: ExResponse, next: NextFunction) => {
      const isCredentialEndpoint = req.method === 'POST' && req.path.endsWith('/credential')
      if (isCredentialEndpoint) {
        try {
          req.logger?.info({ path: req.path, bodyPreview: typeof req.body === 'object' ? Object.keys(req.body) : typeof req.body }, 'Issuer credential request incoming')
        } catch (e) {
          // ignore logging errors
        }

        // Capture response body by wrapping res.send
        const originalSend = res.send.bind(res)
        let responseBody: any
        // @ts-ignore
        res.send = (body?: any) => {
          responseBody = body
          return originalSend(body)
        }

        res.on('finish', () => {
          try {
            req.logger?.warn({ status: res.statusCode, responsePreview: typeof responseBody === 'string' ? responseBody.slice?.(0, 400) : responseBody }, 'Issuer credential endpoint responded')
          } catch (e) {
            // ignore
          }
        })
      }

      // Do NOT rewrite credential format here. The underlying issuer
      // implementation expects the holder's original format (e.g. 'jwt_vc_json').
      // Earlier attempts to normalize formats caused the issuer to reject
      // the request with 'invalid_request'. Keep the incoming payload intact.

      next()
    })
    app.use('/oidc/issuer', modules.openId4VcIssuer.config.router)
  }
  if (modules?.openId4VcVerifier?.config?.router) {
    agent.config.logger.info('Mounting OpenID4VC Verifier routes at /oidc/verifier')
    app.use('/oidc/verifier', modules.openId4VcVerifier.config.router)
  }

  app.use((async (err: unknown, req: ExRequest, res: ExResponse, next: NextFunction): Promise<ExResponse | void> => {
    // Check if headers were already sent
    if (res.headersSent) {
      return next(err)
    }

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

    // If we reach here and no error was handled, send a generic 500
    return res.status(500).json({
      message: 'Internal Server Error',
    })
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
