// eslint-disable-next-line import/order
import { otelSDK } from './tracer'
import 'reflect-metadata'
import './types/express'
import type { RestAgentModules, RestMultiTenantAgentModules } from './cliAgent'
import type { ApiError } from './errors'
import type { ServerConfig } from './utils/ServerConfig'
import type { Response as ExResponse, Request as ExRequest, NextFunction, ErrorRequestHandler } from 'express'

import { Agent, utils } from '@credo-ts/core'
import { TenantAgent } from '@credo-ts/tenants'
import bodyParser from 'body-parser'
import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import { rateLimit } from 'express-rate-limit'
import * as fs from 'fs'
import path from 'path'
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
import { auditMiddleware } from './middleware/auditMiddleware'
import { DatabaseManager } from './persistence/DatabaseManager'
import { initTenantStore } from './persistence/TenantRepository'
import { initWalletUserStore } from './persistence/UserRepository'
import { RegisterRoutes } from './routes/routes'
import { SecurityMiddleware } from './securityMiddleware'
import { ShortlinkService } from './services/ShortlinkService'
import { triggerService } from './services/TriggerService'
import { startNgrokTunnel, getNgrokUrl } from './utils/ngrokTunnel'
import { rootLogger } from './utils/pinoLogger'
import { runWithContext } from './utils/requestContext'

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
    // eslint-disable-next-line no-console
    console.log('[server.ts] Agent modules before container registration:', Object.keys((agent.modules as any) || {}))
    // eslint-disable-next-line no-console
    console.log('[server.ts] Has openid4vc issuer?', !!(agent as any)?.openid4vc?.issuer)
  }

  container.registerInstance(Agent, agent as Agent)

  if (process.env.DEBUG_AGENT_MODULES === 'true') {
    // eslint-disable-next-line no-console
    console.log('[server.ts] Agent modules after container registration:', Object.keys((agent.modules as any) || {}))
  }

  const configDir = process.env.CONFIG_DATA_DIR ?? path.resolve(process.cwd(), 'data')
  fs.mkdirSync(configDir, { recursive: true })
  fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify(config, null, 2))

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
      'http://localhost:7000',
      'http://localhost:7001',
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
      'http://127.0.0.1:7000',
      'http://127.0.0.1:7001',
      // Fly.io production URLs
      'https://credentis-portal.fly.dev',
      'https://credentis-wallet.fly.dev',
      'https://credentis-api.fly.dev',
      // Docker Internal IPs
      'http://172.16.0.0:3000',
      'http://172.16.0.0:4000',
      'http://172.16.0.0:5000',
      'http://172.16.0.0:6000',
      'http://172.17.0.0:3000',
      'http://172.17.0.0:4000',
      'http://172.17.0.0:5000',
      'http://172.17.0.0:6000',
      'http://172.18.0.0:3000',
      'http://172.18.0.0:4000',
      'http://172.18.0.0:5000',
      'http://172.18.0.0:6000',
      'http://172.19.0.0:3000',
      'http://172.19.0.0:4000',
      'http://172.19.0.0:5000',
      'http://172.19.0.0:6000',
    ]

    const isDockerOrigin = (origin: string) => {
      return (
        origin.startsWith('http://172.') ||
        origin.startsWith('http://api') ||
        origin.startsWith('http://holder-api') ||
        origin.startsWith('http://portal') ||
        origin.startsWith('http://wallet')
      )
    }

    app.use(
      cors({
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
      }),
    )
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
    const correlationId = incoming || utils.uuid()
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
      req.logger?.info(
        { method: req.method, path: req.path, status: res.statusCode, duration, response: responseBody },
        'Request completed',
      )
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
  // Shortlink redirect: /v/:code -> verification page
  app.get('/v/:code', (req, res) => {
    const { code } = req.params
    const result = ShortlinkService.resolve(code)

    if (!result) {
      res.status(404).json({ error: 'Link expired or not found' })
      return
    }

    // Redirect to appropriate verification page based on type
    const baseUrl = process.env.PORTAL_URL || 'http://localhost:5000'
    if (result.type === 'receipt') {
      res.redirect(`${baseUrl}/verify/receipt/${result.targetId}`)
      return
    } else if (result.type === 'credential') {
      res.redirect(`${baseUrl}/verify/${result.targetId}`)
      return
    } else {
      res.redirect(`${baseUrl}/verify?id=${result.targetId}`)
      return
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

  // Back-compat alias: some clients still hit /oidc/issuer/* while the TSOA
  // controller is mounted under the legacy /custom-oidc path. Rewrite only the
  // issuer-management endpoints that are intentionally provided by the app.
  app.use((req: ExRequest, res: ExResponse, next: NextFunction) => {
    const legacyCustomIssuerPaths = [
      '/oidc/issuer/credential-offers',
      '/oidc/issuer/credentials',
      '/oidc/issuer/credentials/',
    ]
    if (
      req.path === '/oidc/issuer/credential-offers' ||
      req.path === '/oidc/issuer/credentials' ||
      req.path.startsWith('/oidc/issuer/credentials/')
    ) {
      req.url = req.url.replace(/^\/oidc\/issuer/, '/custom-oidc/issuer')
    }
    next()
  })

  // Mount TSOA routes (API controllers)
  // take precedence over the generic Credo OpenID4VC router which matches prefixes.
  RegisterRoutes(app)

  // Mount Credo OIDC4VC Routers
  // We use a safe cast or check for the module existence since Agent type is generic
  const modules = (agent as any).modules

  if ((agent as any)?.openid4vc?.issuer?.config?.router || modules?.openId4VcIssuer?.config?.router) {
    agent.config.logger.info('Mounting OpenID4VC Issuer routes at /oidc/issuer')
    // Compatibility shim: normalize wallet-specific JSON VC formats to the generic 'jwt_vc'
    // so the underlying OpenID4VC issuer module (which expects 'jwt_vc') accepts requests.
    // Add a lightweight logger around the issuer credential endpoint to capture
    // the incoming credential request and the issuer response for debugging.
    app.use('/oidc/issuer', async (req: ExRequest, res: ExResponse, next: NextFunction) => {
      const requestPath =
        typeof req.path === 'string' ? req.path : typeof req.originalUrl === 'string' ? req.originalUrl : ''
      const isCredentialEndpoint = req.method === 'POST' && requestPath.endsWith('/credential')
      if (isCredentialEndpoint) {
        try {
          req.logger?.info(
            { path: requestPath, bodyPreview: typeof req.body === 'object' ? Object.keys(req.body) : typeof req.body },
            'Issuer credential request incoming',
          )
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
            const responseSize =
              typeof responseBody === 'string'
                ? responseBody.length
                : responseBody == null
                  ? 0
                  : JSON.stringify(responseBody).length

            req.logger?.warn(
              {
                status: res.statusCode,
                responseType: typeof responseBody,
                responseSize,
              },
              'Issuer credential endpoint responded',
            )
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
    const issuerRouter = (agent as any)?.openid4vc?.issuer?.config?.router || modules.openId4VcIssuer?.config?.router
    app.use('/oidc/issuer', issuerRouter)
  }
  if ((agent as any)?.openid4vc?.verifier?.config?.router || modules?.openId4VcVerifier?.config?.router) {
    agent.config.logger.info('Mounting OpenID4VC Verifier routes at /oidc/verifier')
    const verifierRouter =
      (agent as any)?.openid4vc?.verifier?.config?.router || modules.openId4VcVerifier?.config?.router
    app.use('/oidc/verifier', verifierRouter)
  }

  // ── Status List endpoint ─────────────────────────────────────────────────
  // Public, unauthenticated: holders and verifiers dereference this URL to
  // check credential status. The URL is embedded in credentialStatus entries
  // at issuance time. No authentication required per W3C BitstringStatusList spec.
  app.get('/status-lists/:statusListId', async (req: ExRequest, res: ExResponse) => {
    const { statusListId } = req.params
    // Basic ID format guard to prevent path traversal or injection
    if (!/^[0-9a-f-]{36}$/.test(statusListId)) {
      res.status(400).json({ error: 'Invalid status list identifier' })
      return
    }
    try {
      const { statusListCacheService } = await import('./services/ssi/StatusListCacheService')
      const { statusListPublisherService } = await import('./services/ssi/StatusListPublisherService')

      // Try cache first (synchronous check)
      const cached = statusListCacheService.getSync(statusListId)
      if (cached && !cached.isStale) {
        // Fresh in cache
        const isJwt = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(cached.vc.trim())
        res.setHeader('Content-Type', isJwt ? 'application/jwt' : 'application/json')
        res.setHeader('Cache-Control', 'public, max-age=300')
        res.status(200).send(cached.vc)
        return
      }

      // Cache miss or stale; refresh with option to serve stale if available
      const agentForSigning = req.agent ? (req.agent as unknown as Agent<any>) : null
      const refreshed = await statusListCacheService.get(statusListId, true)
      if (!refreshed || !refreshed.vc) {
        res.status(404).json({ error: 'Status list not found or not yet published' })
        return
      }

      // Serve as JSON or compact JWT — content-type follows whether it looks like a JWT
      const isJwt = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(refreshed.vc.trim())
      res.setHeader('Content-Type', isJwt ? 'application/jwt' : 'application/json')
      if (refreshed.isStale) {
        // Stale data served; indicate to client it should re-fetch or add validation step
        res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
        res.setHeader('X-Status-List-Stale', 'true')
      } else {
        res.setHeader('Cache-Control', 'public, max-age=300')
      }
      res.status(200).send(refreshed.vc)
    } catch (err) {
      req.logger?.error({ statusListId, err }, 'Error serving status list')
      res.status(500).json({ error: 'Failed to serve status list' })
    }
  })

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
