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

  if (process.env.DEBUG_AGENT_MODULES === 'true') {
    // DEBUG: Log agent modules before and after registration
    console.log('[server.ts] Agent modules before container registration:', Object.keys((agent.modules as any) || {}))
    console.log('[server.ts] Has openId4VcIssuer?', !!(agent.modules as any)?.openId4VcIssuer)
  }

  container.registerInstance(Agent, agent as Agent)

  if (process.env.DEBUG_AGENT_MODULES === 'true') {
    console.log('[server.ts] Agent modules after container registration:', Object.keys((agent.modules as any) || {}))
  }

  fs.writeFileSync('config.json', JSON.stringify(config, null, 2))

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
  // Provide an override for issuer-level well-known metadata so we can
  // advertise multiple credential formats derived from our credential
  // definition store. Register it BEFORE TSOA routes so it takes
  // precedence for discovery requests.
  app.get('/oidc/issuer/:issuerId/.well-known/openid-credential-issuer', async (req: ExRequest, res: ExResponse, next: NextFunction) => {
    try {
      const issuerId = req.params.issuerId
      const baseUrl = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`
      const issuerBase = `${baseUrl.replace(/\/$/, '')}/oidc/issuer/${issuerId}`

      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { credentialDefinitionStore } = require('./utils/credentialDefinitionStore')
        const definitions = credentialDefinitionStore.list() || []

        const credentialConfigurations: Record<string, any> = {}
        const supportedFormats = ['jwt_vc', 'jwt_vc_json', 'jwt_vc_json-ld', 'vc+sd-jwt', 'ldp_vc', 'mso_mdoc']

        definitions.forEach((def: any) => {
          supportedFormats.forEach((fmt) => {
            const suffix = `_${fmt}`
            const configId = `${def.credentialDefinitionId}${suffix}`
            credentialConfigurations[configId] = {
              format: fmt,
              scope: def.name,
              cryptographic_binding_methods_supported: ['did'],
              cryptographic_suites_supported: ['Ed25519Signature2018'],
              credential_definition: { type: def.credentialType || ['VerifiableCredential'] },
              display: [{ name: def.name, locale: 'en-US' }],
            }
          })
        })

        const metadata = {
          issuer: issuerBase,
          credential_issuer: issuerBase,
          token_endpoint: `${issuerBase}/token`,
          credential_endpoint: `${issuerBase}/credential`,
          grants: ['urn:ietf:params:oauth:grant-type:pre-authorized_code'],
          credential_configurations_supported: credentialConfigurations,
        }

        req.logger?.info({ issuerId }, 'Served augmented issuer well-known (pre-TSOA)')
        return res.json(metadata)
      } catch (e) {
        req.logger?.warn({ err: (e as Error).message }, 'Failed to build augmented issuer metadata (pre-TSOA)')
        return next()
      }
    } catch (err) {
      return next()
    }
  })

  // Mount TSOA routes (API controllers)
  // take precedence over the generic Credo OpenID4VC router which matches prefixes.
  RegisterRoutes(app)

  // Mount Credo OIDC4VC Routers
  // We use a safe cast or check for the module existence since Agent type is generic
  const modules = (agent as any).modules

  // Provide an override for issuer-level well-known metadata so we can
  // advertise multiple credential formats derived from our credential
  // definition store. This runs before the OpenID4VC issuer router so
  // holders discover compatible formats even if the issuer module
  // stored a different canonical representation.
  app.get('/oidc/issuer/:issuerId/.well-known/openid-credential-issuer', async (req: ExRequest, res: ExResponse, next: NextFunction) => {
    try {
      const issuerId = req.params.issuerId
      const baseUrl = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`
      const issuerBase = `${baseUrl.replace(/\/$/, '')}/oidc/issuer/${issuerId}`

      // Build credential_configurations_supported by enumerating credential definitions
      try {
        // Lazy-load to avoid circular deps at startup
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { credentialDefinitionStore } = require('./utils/credentialDefinitionStore')
        const definitions = credentialDefinitionStore.list() || []

        const credentialConfigurations: Record<string, any> = {}
        const supportedFormats = ['jwt_vc', 'jwt_vc_json', 'jwt_vc_json-ld', 'vc+sd-jwt', 'ldp_vc', 'mso_mdoc']

        definitions.forEach((def: any) => {
          supportedFormats.forEach((fmt) => {
            const suffix = `_${fmt}`
            const configId = `${def.credentialDefinitionId}${suffix}`
            credentialConfigurations[configId] = {
              format: fmt,
              scope: def.name,
              cryptographic_binding_methods_supported: ['did'],
              cryptographic_suites_supported: ['Ed25519Signature2018'],
              credential_definition: {
                type: def.credentialType || ['VerifiableCredential'],
              },
              display: [
                {
                  name: def.name,
                  locale: 'en-US',
                },
              ],
            }
          })
        })

        const metadata = {
          issuer: issuerBase,
          credential_issuer: issuerBase,
          token_endpoint: `${issuerBase}/token`,
          credential_endpoint: `${issuerBase}/credential`,
          grants: ['urn:ietf:params:oauth:grant-type:pre-authorized_code'],
          credential_configurations_supported: credentialConfigurations,
        }

        req.logger?.info({ issuerId }, 'Served augmented issuer well-known')
        return res.json(metadata)
      } catch (e) {
        req.logger?.warn({ err: (e as Error).message }, 'Failed to build augmented issuer metadata')
        return next()
      }
    } catch (err) {
      return next()
    }
  })
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
