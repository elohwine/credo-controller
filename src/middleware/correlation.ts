import type { Request, Response, NextFunction } from 'express'

import { randomUUID } from 'crypto'

import { rootLogger } from '../utils/pinoLogger'

export function correlationMiddleware(req: Request, res: Response, next: NextFunction) {
  const headerId = (req.header('x-correlation-id') || req.header('x-request-id')) as string | undefined
  const correlationId = headerId || randomUUID()
  req.correlationId = correlationId
  res.setHeader('x-correlation-id', correlationId)

  // attach a child logger scoped to this request
  req.logger = rootLogger.child({ correlationId })

  next()
}
