import type * as express from 'express'
import type { NextFunction } from 'express'

import { Middlewares } from '@tsoa/runtime'

@Middlewares()
export class SecurityMiddleware {
  public async use(request: express.Request, response: express.Response, next: NextFunction) {
    next()
  }
}
